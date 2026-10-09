import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { captureSnapshot, compareSnapshots, summarizeStartupLogs, verifyEvidenceFiles, captureDockerLogStreams, MAX_LOG_BYTES } from './production-deployment-evidence.mjs';
import { readFormalDeploymentEvidence } from './chanjet-readonly-production-audit.mjs';

const sha = c => ({ t: 'a', x: 'b', p: 'c' }[c] || c).repeat(40);
const image = c => `sha256:${({ t: 'a', x: 'b', p: 'c' }[c] || c).repeat(64)}`;
const inspect = (service, id, startedAt = '2026-10-09T00:00:00.000Z', imageId = image(service === 'db' ? 'a' : service === 'api' ? 'b' : 'c')) => ({
  Id: id, Created: '2026-10-08T00:00:00.000Z', Image: imageId,
  State: { StartedAt: startedAt, Running: true, Health: { Status: 'healthy' } }, RestartCount: 0,
  Mounts: [{ Type: 'bind', Source: `/data/${service}`, Destination: service === 'db' ? '/var/lib/postgresql/data' : service === 'api' ? '/app/uploads' : '/app/public', RW: true }],
});
function runner(changes = {}) {
  return args => {
    const container = args[1]; const imageArg = args[2] || ''; const service = imageArg.includes('bbbb') ? 'api' : container.endsWith('db') ? 'db' : container.endsWith('api') ? 'api' : container.endsWith('web') ? 'web' : 'web';
    if (args[0] === 'image' && args.at(-1)?.includes('.Config.Labels')) return JSON.stringify({ 'org.opencontainers.image.revision': sha(service === 'api' ? 't' : 'p') });
    const item = changes[service] || inspect(service, service === 'db' ? 'd'.repeat(64) : service === 'api' ? 'a'.repeat(64) : 'f'.repeat(64));
    return [item.Id, item.Created, item.Image, item.State, item.RestartCount, item.Mounts].map(JSON.stringify).join('\t');
  };
}
const binding = { phase: 'PRE_SNAPSHOT', runId: '100-1', runAttempt: '1', targetSha: sha('t'), floorSha: sha('t'), configFloorSha: sha('t') };
function normalized(service, id) { const raw = inspect(service, id); return { service, container: `phoenix-v3-${service}`, id: raw.Id, created: raw.Created, startedAt: raw.State.StartedAt, running: raw.State.Running, health: raw.State.Health.Status, restartCount: raw.RestartCount, image: raw.Image, ociRevision: sha(service === 'api' ? 't' : 'p'), mounts: raw.Mounts.map(m => ({ type: m.Type, source: m.Source, destination: m.Destination, readOnly: m.RW === false })) }; }
function snapshot(phase, overrides = {}) { return { ...binding, ...overrides, deployRunId: binding.runId, deployRunAttempt: 1, phase, schema: 'phoenix.production-deployment-evidence/v2', capturedAt: '2026-10-09T00:01:00.000Z', containers: { db: normalized('db', 'd'.repeat(64)), api: normalized('api', 'a'.repeat(64)), web: normalized('web', 'f'.repeat(64)) } }; }

test('captures only allowlisted container metadata and binds run/attempt/SHA', () => {
  const calls = []; const actual = captureSnapshot(binding, args => { calls.push(args); return runner()(args); });
  assert.equal(actual.schema, 'phoenix.production-deployment-evidence/v2'); assert.equal(Object.keys(actual.containers).length, 3); assert.equal(calls.length, 6);
  assert.equal(Object.hasOwn(actual.containers.api, 'env'), false); assert.equal(actual.containers.api.ociRevision, sha('t'));
});
test('Web and DB identity/start/image/mount changes fail closed', () => {
  const pre = snapshot('PRE_SNAPSHOT'); const post = snapshot('POST_SNAPSHOT'); assert.deepEqual(compareSnapshots(pre, post).web, 'UNCHANGED');
  for (const service of ['db', 'web']) for (const key of ['id', 'startedAt', 'image', 'mounts']) {
    const changed = snapshot('POST_SNAPSHOT'); changed.containers[service][key] = key === 'mounts' ? [] : 'changed';
    assert.throws(() => compareSnapshots(pre, changed), /CHANGED/);
  }
});
test('missing/cross-run/invalid API metadata fails closed', () => {
  const pre = snapshot('PRE_SNAPSHOT'); assert.throws(() => compareSnapshots(pre, { ...snapshot('POST_SNAPSHOT'), deployRunId: '999-1' }), /SNAPSHOT_BINDING/);
  const bad = snapshot('POST_SNAPSHOT'); delete bad.containers.api; assert.throws(() => compareSnapshots(pre, bad), /API_IDENTITY/);
  const wrong = snapshot('POST_SNAPSHOT'); wrong.containers.api.ociRevision = sha('x'); assert.throws(() => compareSnapshots(pre, wrong), /API_IDENTITY/);
  assert.throws(() => captureSnapshot({ ...binding, runId: 'bad', targetSha: 'x' }, runner()), /INVALID_BINDING/);
});
test('startup log summary never stores raw secret lines and holds incomplete markers', () => {
  const text = '2026-10-09T00:00:01.000Z [Nest] bootstrap started\n2026-10-09T00:00:02.000Z API_BOOTSTRAP_SCHEMA_COMPATIBILITY=PASS\n2026-10-09T00:00:03.000Z secret=do-not-output';
  const summary = summarizeStartupLogs({ text, containerId: 'a'.repeat(64), startedAt: '2026-10-09T00:00:00.000Z', runId: '100-1', runAttempt: '1', targetSha: sha('t'), floorSha: sha('t'), readinessVerified: true });
  assert.equal(summary.result, 'PASS_REDACTED_SUMMARY'); assert.equal(summary.rawOutput, false); assert.equal(summary.eventCounts.SENSITIVE_REDACTED, 1); assert.doesNotMatch(JSON.stringify(summary), /do-not-output/);
  assert.equal(summarizeStartupLogs({ text: '2026-10-09T00:00:01.000Z only Nest bootstrap', containerId: 'a'.repeat(64), startedAt: '2026-10-09T00:00:00.000Z', runId: '100-1', runAttempt: '1', targetSha: sha('t'), floorSha: sha('t'), readinessVerified: true }).result, 'UNVERIFIED_STARTUP_EVIDENCE');
  assert.throws(() => summarizeStartupLogs({ text: '', containerId: 'a'.repeat(64), startedAt: '2026-10-09T00:00:00.000Z', runId: '100-1', runAttempt: '1', targetSha: sha('t'), floorSha: sha('t') }), /LOG_WINDOW_INCOMPLETE/);
});
test('evidence file verifier requires same run and API log identity', () => {
  const pre = snapshot('PRE_SNAPSHOT'); const post = snapshot('POST_SNAPSHOT'); const log = summarizeStartupLogs({ text: '2026-10-09T00:00:01.000Z [Nest] boot\n2026-10-09T00:00:02.000Z API_BOOTSTRAP_SCHEMA_COMPATIBILITY=PASS', containerId: post.containers.api.id, startedAt: post.containers.api.startedAt, capturedAt: '2026-10-09T00:01:00.000Z', runId: '100-1', runAttempt: '1', targetSha: sha('t'), floorSha: sha('t'), readinessVerified: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-evidence-'));
  try {
    const files = { pre: path.join(dir, 'pre.json'), post: path.join(dir, 'post.json'), log: path.join(dir, 'log.json') };
    fs.writeFileSync(files.pre, JSON.stringify(pre)); fs.writeFileSync(files.post, JSON.stringify(post)); fs.writeFileSync(files.log, JSON.stringify(log));
    assert.equal(verifyEvidenceFiles(files.pre, files.post, files.log, { runId: '100-1', runAttempt: '1', targetSha: sha('t'), configFloorSha: sha('t') }).startup, 'PASS_REDACTED_SUMMARY');
    const wrong = { ...post, deployRunId: '999-1' }; fs.writeFileSync(files.post, JSON.stringify(wrong)); assert.throws(() => verifyEvidenceFiles(files.pre, files.post, files.log, { runId: '100-1', runAttempt: '1', targetSha: sha('t'), configFloorSha: sha('t') }), /RUN_BINDING/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('formal audit rejects target SHA drift across deployment evidence', () => {
  const pre = snapshot('PRE_SNAPSHOT'); const post = snapshot('POST_SNAPSHOT');
  const log = summarizeStartupLogs({ text: '2026-10-09T00:00:01.000Z [Nest] boot\n2026-10-09T00:00:02.000Z API_BOOTSTRAP_SCHEMA_COMPATIBILITY=PASS', containerId: post.containers.api.id, startedAt: post.containers.api.startedAt, capturedAt: '2026-10-09T00:01:00.000Z', runId: '100-1', runAttempt: '1', targetSha: sha('t'), floorSha: sha('t'), readinessVerified: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-audit-evidence-'));
  try {
    fs.writeFileSync(path.join(dir, 'deploy-100-1-pre-evidence.json'), JSON.stringify(pre));
    fs.writeFileSync(path.join(dir, 'deploy-100-1-post-evidence.json'), JSON.stringify(post));
    fs.writeFileSync(path.join(dir, 'deploy-100-1-startup-evidence.json'), JSON.stringify(log));
    assert.equal(readFormalDeploymentEvidence(dir, { api: { revision: sha('t') } }, sha('t')).status, 'PASS');
    fs.writeFileSync(path.join(dir, 'deploy-100-1-startup-evidence.json'), JSON.stringify({ ...log, targetSha: sha('x') }));
    assert.equal(readFormalDeploymentEvidence(dir, { api: { revision: sha('t') } }, sha('t')).status, 'HOLD');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('stdout-only startup passes while an empty stderr stream is allowed', () => {
  const summary = summarizeStartupLogs({
    stdout: '2026-10-09T00:00:01.000Z [Nest] bootstrap started\n2026-10-09T00:00:02.000Z API_BOOTSTRAP_SCHEMA_COMPATIBILITY=PASS',
    stderr: '', containerId: 'a'.repeat(64), startedAt: '2026-10-09T00:00:00.000Z', runId: '100-1', runAttempt: '1', targetSha: sha('t'), floorSha: sha('t'), readinessVerified: true,
  });
  assert.equal(summary.result, 'PASS_REDACTED_SUMMARY'); assert.equal(summary.stdoutLineCount, 2); assert.equal(summary.stderrLineCount, 0); assert.equal(summary.errorSignalCount, 0);
});
test('stderr application errors retain severity and sensitive lines remain redacted', () => {
  const base = { stdout: '2026-10-09T00:00:01.000Z API_BOOTSTRAP_SCHEMA_COMPATIBILITY=PASS', containerId: 'a'.repeat(64), startedAt: '2026-10-09T00:00:00.000Z', runId: '100-1', runAttempt: '1', targetSha: sha('t'), floorSha: sha('t'), readinessVerified: true };
  const error = summarizeStartupLogs({ ...base, stderr: '2026-10-09T00:00:02.000Z ERROR database connection failed' });
  assert.equal(error.result, 'HOLD_STARTUP_ERROR'); assert.equal(error.stderrLineCount, 1); assert.equal(error.errorSignalCount, 1);
  const sensitiveInfo = summarizeStartupLogs({ ...base, stderr: '2026-10-09T00:00:02.000Z JWT_SECRET loaded' });
  assert.equal(sensitiveInfo.result, 'PASS_REDACTED_SUMMARY'); assert.equal(sensitiveInfo.sensitiveLineCount, 1); assert.doesNotMatch(JSON.stringify(sensitiveInfo), /JWT_SECRET loaded/);
  const sensitiveFatal = summarizeStartupLogs({ ...base, stderr: '2026-10-09T00:00:02.000Z JWT_SECRET initialization FATAL' });
  assert.equal(sensitiveFatal.result, 'HOLD_STARTUP_ERROR'); assert.equal(sensitiveFatal.sensitiveLineCount, 1); assert.equal(sensitiveFatal.errorSignalCount, 1); assert.equal(sensitiveFatal.eventCounts.SENSITIVE_REDACTED, 1); assert.equal(sensitiveFatal.eventCounts.ERROR_SIGNAL, 1); assert.doesNotMatch(JSON.stringify(sensitiveFatal), /JWT_SECRET initialization/);
});
test('schema writes, output overflow, and incomplete stream timestamps fail closed', () => {
  const base = { stdout: '2026-10-09T00:00:01.000Z API_BOOTSTRAP_SCHEMA_COMPATIBILITY=PASS', stderr: '', containerId: 'a'.repeat(64), startedAt: '2026-10-09T00:00:00.000Z', runId: '100-1', runAttempt: '1', targetSha: sha('t'), floorSha: sha('t'), readinessVerified: true };
  assert.equal(summarizeStartupLogs({ ...base, stderr: '2026-10-09T00:00:02.000Z migration attempted ALTER TABLE x' }).result, 'HOLD_SCHEMA_OR_WRITE_SIGNAL');
  assert.throws(() => summarizeStartupLogs({ ...base, stdout: '2026-10-09T00:00:01.000Z ' + 'x'.repeat(MAX_LOG_BYTES), stderr: '' }), /LOG_OUTPUT_LIMIT/);
  assert.throws(() => summarizeStartupLogs({ ...base, stderr: 'ERROR without docker timestamp' }), /LOG_WINDOW_INCOMPLETE_STDERR/);
});
test('docker command failures are distinct from application stderr and combined output is bounded', () => {
  const args = { containerId: 'a'.repeat(64), startedAt: '2026-10-09T00:00:00.000Z', capturedAt: '2026-10-09T00:00:05.000Z' };
  assert.throws(() => captureDockerLogStreams(args, () => ({ status: 1, stdout: '', stderr: 'docker: container missing' })), /DOCKER_LOG_COMMAND_FAILED/);
  assert.throws(() => captureDockerLogStreams(args, () => ({ status: 0, stdout: 'x'.repeat(MAX_LOG_BYTES), stderr: 'y' })), /LOG_OUTPUT_LIMIT/);
  assert.throws(() => captureDockerLogStreams(args, () => ({ status: 0, error: { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' }, stdout: '', stderr: '' })), /LOG_OUTPUT_LIMIT/);
});
const dockerStreamFixture = (() => {
  try { execFileSync('docker', ['info'], { stdio: 'ignore' }); execFileSync('docker', ['image', 'inspect', 'node:20-alpine'], { stdio: 'ignore' }); return true; } catch { return false; }
})();
test('real isolated Docker container preserves stdout and stderr streams', { skip: !dockerStreamFixture }, () => {
  const name = `phoenix-evidence-stream-${process.pid}-${Date.now()}`;
  try {
    execFileSync('docker', ['run', '-d', '--name', name, 'node:20-alpine', 'sh', '-c', 'printf "stdout boot\\n"; printf "stderr boot\\n" >&2; sleep 3'], { encoding: 'utf8' });
    const id = execFileSync('docker', ['inspect', '--format', '{{.Id}}', name], { encoding: 'utf8' }).trim();
    const startedAt = execFileSync('docker', ['inspect', '--format', '{{.State.StartedAt}}', name], { encoding: 'utf8' }).trim();
    const capturedAt = new Date(Date.now() + 1000).toISOString();
    const streams = captureDockerLogStreams({ containerId: id, startedAt, capturedAt });
    assert.match(streams.stdout, /stdout boot/); assert.match(streams.stderr, /stderr boot/); assert.ok(streams.combinedBytes > 0);
  } finally {
    try { execFileSync('docker', ['rm', '-f', name], { stdio: 'ignore' }); } catch {}
  }
});
