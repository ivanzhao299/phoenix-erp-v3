import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { captureSnapshot, compareSnapshots, summarizeStartupLogs, verifyEvidenceFiles, captureDockerLogStreams, MAX_LOG_BYTES, metadataFor, classifyEvidenceFailure, classifyStartupLine } from './production-deployment-evidence.mjs';
import { readFormalDeploymentEvidence } from './chanjet-readonly-production-audit.mjs';

const sha = c => ({ t: 'a', x: 'b', p: 'c' }[c] || c).repeat(40);
const image = c => `sha256:${({ t: 'a', x: 'b', p: 'c' }[c] || c).repeat(64)}`;
const inspect = (service, id, startedAt = '2026-10-09T00:00:00.000Z', imageId = image(service === 'db' ? 'a' : service === 'api' ? 'b' : 'c')) => ({
  Id: id, Created: '2026-10-08T00:00:00.000Z', Image: imageId,
  State: { StartedAt: startedAt, Running: true, Health: { Status: 'healthy' } }, RestartCount: 0,
  Mounts: [{ Type: 'bind', Source: `/data/${service}`, Destination: service === 'db' ? '/var/lib/postgresql/data' : service === 'api' ? '/app/uploads' : '/app/public', RW: true }],
});
function runner(changes = {}, labelOverrides = {}) {
  return args => {
    const container = args[1]; const imageArg = args[2] || '';
    const service = container?.startsWith('phoenix-v3-') ? container.slice('phoenix-v3-'.length) : imageArg.includes('bbbb') ? 'api' : imageArg.includes('aaaa') ? 'db' : 'web';
    if (args[0] === 'image' && args.at(-1)?.includes('.Config.Labels')) return JSON.stringify(Object.hasOwn(labelOverrides, service) ? labelOverrides[service] : { 'org.opencontainers.image.revision': sha(service === 'api' ? 't' : 'p') });
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
test('third-party DB images may omit OCI revision while API and Web remain pinned', () => {
  const actual = captureSnapshot(binding, runner({}, { db: null }));
  assert.equal(actual.containers.db.ociRevision, null);
  assert.equal(actual.containers.db.image, image('a'));
  assert.equal(metadataFor('db', runner({}, { db: {} })).ociRevision, null);
  assert.throws(() => metadataFor('api', runner({}, { api: null })), /IMAGE_REVISION_MISSING/);
  assert.throws(() => metadataFor('web', runner({}, { web: { 'org.opencontainers.image.revision': 'not-a-sha' } })), /IMAGE_REVISION_INVALID/);
});
test('metadata inspection and snapshot persistence failures are classified without raw errors', () => {
  assert.throws(() => metadataFor('db', () => { throw new Error('private docker socket path'); }), /DOCKER_INSPECT_FAILED/);
  assert.throws(() => metadataFor('db', runner({ db: { Id: 'd'.repeat(64), Created: '2026-10-08T00:00:00.000Z', Image: image('a'), State: null, RestartCount: 0, Mounts: [] } })), /METADATA_MISSING/);
  assert.equal(classifyEvidenceFailure(new Error('CONFIG_HOLD=UNAPPROVED_CONTEXT')), 'CONTEXT_VALIDATION');
  assert.equal(classifyEvidenceFailure(new Error('unexpected private error')), 'UNEXPECTED_FAILURE');
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
// ── Run 38031441639-1 Case A regression: the 23+7 false-positive classes ──
test('NestJS route registration lines are never schema/write or error evidence', () => {
  // Every path below is a real route of this codebase; methods/path segments
  // carry delete/exception/failure/error words that previously tripped both
  // detectors (fin-cash bulk-delete, delivery exception sign, chanjet canary
  // latest-failure, SysErrorLogsController, generic @Delete).
  const routeLines = [
    '[Nest] LOG [RouterExplorer] Mapped {/api/v2/finance/cash/transactions/bulk-delete, POST} route',
    '[Nest] LOG [RouterExplorer] Mapped {/api/v2/sales/delivery/:id/receipts/exception, POST} route',
    '[Nest] LOG [RouterExplorer] Mapped {/api/chanjet/integration/product-name-canary/latest-failure, GET} route',
    '[Nest] LOG [RoutesResolver] SysErrorLogsController {/api/system/error-logs}:',
    '[Nest] LOG [RouterExplorer] Mapped {/api/system/error-logs/summary, GET} route',
    '[Nest] LOG [RouterExplorer] Mapped {/api/system/error-logs/:id, DELETE} route',
    '[Nest] LOG [RouterExplorer] Mapped {/api/master-data/:type/:id, DELETE} route',
  ];
  for (const line of routeLines) {
    const verdict = classifyStartupLine(`2026-10-10T06:43:19.000000000Z ${line}`);
    assert.equal(verdict.schemaWrite, false, line);
    assert.equal(verdict.error, false, line);
  }
});
test('informational prose is not a migration write; executed migrations still are', () => {
  const informational = '[Nest] LOG [WorkflowService] WorkflowService initialized. Schema managed by migration file.';
  assert.equal(classifyStartupLine(`2026-10-10T06:43:19.211549529Z ${informational}`).schemaWrite, false);
  assert.equal(classifyStartupLine(`2026-10-10T06:43:19.211549529Z ${informational}`).error, false);
  for (const executed of [
    'Migration RestoreFinanceSourceTypeChecks1787304000000 has been executed successfully.',
    'executing migration RestoreFinanceSourceTypeChecks1787304000000',
    'run migrations against the production schema',
    'TypeORM migrationsRun=true synchronize=false',
    'seed data completed for dict fixtures',
    'running seed script for menu registry',
  ]) assert.equal(classifyStartupLine(`2026-10-10T06:43:19.300000000Z ${executed}`).schemaWrite, true, executed);
});
test('SQL write statement shapes remain fail-closed', () => {
  for (const sql of [
    'query: INSERT INTO chanjet_sync_jobs(status) VALUES ($1)',
    'QUERY: ALTER TABLE wf_form_definition ADD COLUMN biz_type VARCHAR(64)',
    'UPDATE "fin_cash_accounts" SET balance = balance - 100 WHERE id = 1',
    'UPDATE public.sal_customers SET status = $1 WHERE code = $2',
    'DELETE FROM wf_form_version WHERE form_id = 1 RETURNING id',
    'upsert into chanjet_ar_snapshot(book_id, period) values ($1, $2)',
    "SELECT setval('wf_form_definition_id_seq', 42, false)",
    'SELECT nextval(pg_get_serial_sequence(\'x\', \'id\'))',
    'TRUNCATE TABLE inv_batches RESTART IDENTITY',
    'DROP INDEX IF EXISTS idx_legacy_runtime_seed',
  ]) assert.equal(classifyStartupLine(`2026-10-10T06:43:19.400000000Z ${sql}`).schemaWrite, true, sql);
});
test('real startup failures stay fail-closed including Nest exception handler and TypeError', () => {
  for (const failure of [
    '[ExceptionHandler] Nest cannot create a new instance of AppModule because it is already constructed',
    'Error: connect ECONNREFUSED 127.0.0.1:5432',
    'FATAL: password authentication failed for user "phoenix"',
    'TypeError: Cannot read properties of undefined (reading "id")',
    'UnhandledPromiseRejection: query failed with timeout',
    'combined digest mismatch after capture',
  ]) assert.equal(classifyStartupLine(`2026-10-10T06:43:19.500000000Z ${failure}`).error, true, failure);
});
test('realistic full startup window passes; one SQL line or one error line still holds', () => {
  const window = [
    '[Nest] LOG [NestFactory] Starting Nest application...',
    '[Nest] LOG [InstanceLoader] AppModule dependencies initialized',
    '[Nest] LOG [RoutesResolver] FinCashController {/api/v2/finance/cash}:',
    '[Nest] LOG [RouterExplorer] Mapped {/api/v2/finance/cash/transactions/bulk-delete, POST} route',
    '[Nest] LOG [RouterExplorer] Mapped {/api/master-data/:type/:id, DELETE} route',
    '[Nest] LOG [RouterExplorer] Mapped {/api/sales/delivery/:id/receipts/exception, POST} route',
    '[Nest] LOG [RoutesResolver] SysErrorLogsController {/api/system/error-logs}:',
    '[Nest] LOG [WorkflowService] WorkflowService initialized. Schema managed by migration file.',
    '[Nest] LOG [ChanjetReadonlySyncScheduler] READONLY_HOLD_BOOTSTRAP',
    'API_BOOTSTRAP_SCHEMA_COMPATIBILITY=PASS',
    '🚀 PRODUCTION | Phoenix ERP V3 Backend → http://0.0.0.0:3100',
  ].map((line, index) => `2026-10-09T00:00:${String(index).padStart(2, '0')}.000Z ${line}`).join('\n');
  const base = { stdout: window, stderr: '', containerId: 'a'.repeat(64), startedAt: '2026-10-09T00:00:00.000Z', runId: '100-1', runAttempt: '1', targetSha: sha('t'), floorSha: sha('t'), readinessVerified: true };
  assert.equal(summarizeStartupLogs(base).result, 'PASS_REDACTED_SUMMARY');
  assert.equal(summarizeStartupLogs(base).schemaWriteSignalCount, 0);
  assert.equal(summarizeStartupLogs(base).errorSignalCount, 0);
  assert.equal(summarizeStartupLogs({ ...base, stdout: `${window}\n2026-10-09T00:12:00.000Z query: INSERT INTO chanjet_sync_jobs(status) VALUES ($1)` }).result, 'HOLD_SCHEMA_OR_WRITE_SIGNAL');
  assert.equal(summarizeStartupLogs({ ...base, stdout: `${window}\n2026-10-09T00:12:00.000Z Error: connect ECONNREFUSED 127.0.0.1:5432` }).result, 'HOLD_STARTUP_ERROR');
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
const postgresDockerFixture = (() => {
  try { execFileSync('docker', ['info'], { stdio: 'ignore' }); execFileSync('docker', ['image', 'inspect', 'postgres:16-alpine'], { stdio: 'ignore' }); return true; } catch { return false; }
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
test('real postgres:16-alpine PRE metadata accepts missing OCI revision and keeps digest identity', { skip: !postgresDockerFixture }, () => {
  const name = `phoenix-evidence-postgres-${process.pid}-${Date.now()}`;
  try {
    execFileSync('docker', ['run', '-d', '--name', name, '-e', 'POSTGRES_PASSWORD=phoenix-test', '--health-cmd', 'pg_isready -U postgres', '--health-interval', '100ms', '--health-timeout', '1s', '--health-retries', '30', 'postgres:16-alpine'], { encoding: 'utf8' });
    execFileSync('sh', ['-c', `for i in $(seq 1 40); do [ "$(docker inspect --format '{{.State.Health.Status}}' ${name})" = healthy ] && exit 0; sleep 0.1; done; exit 1`], { stdio: 'ignore' });
    const remap = args => {
      const mapped = [...args];
      if (mapped[0] === 'inspect' && mapped[1] === 'phoenix-v3-db') mapped[1] = name;
      return execFileSync('docker', mapped, { encoding: 'utf8' });
    };
    const actual = metadataFor('db', remap);
    assert.match(actual.image, /^sha256:[a-f0-9]{64}$/);
    assert.equal(actual.ociRevision, null);
    assert.equal(actual.health, 'healthy');
  } finally {
    try { execFileSync('docker', ['rm', '-f', name], { stdio: 'ignore' }); } catch {}
  }
});
