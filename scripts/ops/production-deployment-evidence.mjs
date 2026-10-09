import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { atomicState } from './production-deployment-state.mjs';
import { CONTRACT, verifyContext } from './production-config-guard.mjs';
import { executionEnv } from './capture-production-runtime.mjs';

export const EVIDENCE_SCHEMA = 'phoenix.production-deployment-evidence/v2';
const SERVICES = ['db', 'api', 'web'];
const CONTAINERS = { db: 'phoenix-v3-db', api: 'phoenix-v3-api', web: 'phoenix-v3-web' };
const SHA = /^[a-f0-9]{40}$/;
const IMAGE = /^sha256:[a-f0-9]{64}$/;
const ID = /^[a-f0-9]{12,64}$/;
const ISO = value => typeof value === 'string' && !Number.isNaN(Date.parse(value));
export const MAX_LOG_BYTES = 2 * 1024 * 1024;
const safeRun = (args, run) => (run || (x => execFileSync('docker', x, { env: executionEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })))(args).trim();

export function metadataFor(service, run) {
  const container = CONTAINERS[service];
  const fields = safeRun(['inspect', container, '--format', '{{json .Id}}\t{{json .Created}}\t{{json .Image}}\t{{json .State}}\t{{json .RestartCount}}\t{{json .Mounts}}'], run).split('\t').map(JSON.parse);
  const [id, created, image, state, restartCount, mountsValue] = fields;
  const inspect = { Id: id, Created: created, Image: image, State: state, RestartCount: restartCount, Mounts: mountsValue };
  const labels = JSON.parse(safeRun(['image', 'inspect', image, '--format', '{{json .Config.Labels}}'], run));
  const mounts = (inspect.Mounts || []).map(mount => ({
    type: String(mount.Type || ''), source: String(mount.Source || ''), destination: String(mount.Destination || ''),
    readOnly: Boolean(mount.RW === false),
  })).sort((a, b) => a.destination.localeCompare(b.destination));
  const containerState = inspect.State || {};
  const health = containerState.Health?.Status;
  if (!ID.test(String(inspect.Id || '')) || !ISO(inspect.Created) || !ISO(containerState.StartedAt)
    || typeof state.Running !== 'boolean' || !Number.isInteger(inspect.RestartCount) || !IMAGE.test(image)
    || !SHA.test(String(labels['org.opencontainers.image.revision'] || ''))
    || !health || !['healthy', 'unhealthy', 'starting'].includes(health)
    || mounts.some(m => !m.type || !m.destination || (m.type === 'bind' && !m.source))) throw new Error('DEPLOY_EVIDENCE_HOLD=INCOMPLETE_CONTAINER_METADATA');
  return { service, container, id: inspect.Id, created: inspect.Created, startedAt: containerState.StartedAt, running: containerState.Running,
    health, restartCount: inspect.RestartCount, image, ociRevision: String(labels['org.opencontainers.image.revision']), mounts };
}

export function captureSnapshot({ phase, runId, runAttempt, targetSha, floorSha, capturedAt = new Date().toISOString() }, run) {
  if (!['PRE_SNAPSHOT', 'POST_SNAPSHOT'].includes(phase) || !/^\d+(?:-\d+)?$/.test(runId || '') || !/^\d+$/.test(String(runAttempt))
    || !SHA.test(targetSha || '') || !SHA.test(floorSha || '') || !ISO(capturedAt)) throw new Error('DEPLOY_EVIDENCE_HOLD=INVALID_BINDING');
  const containers = Object.fromEntries(SERVICES.map(service => [service, metadataFor(service, run)]));
  return { schema: EVIDENCE_SCHEMA, phase, deployRunId: runId, deployRunAttempt: Number(runAttempt), targetSha, configFloorSha: floorSha, capturedAt, containers };
}

export function compareSnapshots(pre, post) {
  if (!pre || !post || pre.schema !== EVIDENCE_SCHEMA || post.schema !== EVIDENCE_SCHEMA || pre.phase !== 'PRE_SNAPSHOT' || post.phase !== 'POST_SNAPSHOT'
    || pre.deployRunId !== post.deployRunId || pre.deployRunAttempt !== post.deployRunAttempt || pre.targetSha !== post.targetSha || pre.configFloorSha !== post.configFloorSha) throw new Error('DEPLOY_EVIDENCE_HOLD=SNAPSHOT_BINDING');
  for (const service of ['db', 'web']) {
    const before = pre.containers?.[service]; const after = post.containers?.[service];
    if (!before || !after || before.id !== after.id || before.startedAt !== after.startedAt || before.image !== after.image
      || before.running !== true || before.health !== 'healthy' || after.running !== true || after.health !== 'healthy'
      || JSON.stringify(before.mounts) !== JSON.stringify(after.mounts)) throw new Error(`DEPLOY_EVIDENCE_HOLD=${service.toUpperCase()}_CHANGED`);
  }
  const api = post.containers?.api;
  if (!api || api.running !== true || api.ociRevision !== post.targetSha || api.health !== 'healthy') throw new Error('DEPLOY_EVIDENCE_HOLD=API_IDENTITY');
  return { web: 'UNCHANGED', db: 'UNCHANGED', apiRevision: api.ociRevision };
}

const secretPattern = /\b(?:password|passwd|secret|token|certificate|appticket|opentoken|authorization|cookie|private[ _-]?key|jwt(?:_secret)?|client_secret)\b/i;
const schemaWritePattern = /\b(?:alter\s+table|create\s+(?:table|index|sequence)|drop\s+(?:table|index|constraint)|truncate|insert|update|delete|upsert|setval|nextval|migration|seed|ddl|schema\s+(?:repair|write|mutation))\b/i;
const errorPattern = /\b(?:fatal|panic|exception|uncaught|unhandled|econn(?:refused|reset)|mismatch|failed|failure)\b|\b(?:error|err)\b/i;
const warningPattern = /\b(?:warn|warning|deprecated|retry(?:ing)?)\b/i;
const bootstrapPattern = /API_BOOTSTRAP_SCHEMA_COMPATIBILITY=PASS|\b(?:nest|bootstrap|listen(?:ing)?|readiness|started|production)\b/i;

export function classifyStartupLine(line) {
  const sensitive = secretPattern.test(line);
  const schemaWrite = schemaWritePattern.test(line);
  const error = errorPattern.test(line) || schemaWrite;
  const warning = !error && warningPattern.test(line);
  const kind = schemaWrite ? 'SCHEMA_OR_WRITE_SIGNAL' : error ? 'ERROR_SIGNAL' : sensitive ? 'SENSITIVE_REDACTED' : warning ? 'WARNING_SIGNAL' : bootstrapPattern.test(line) ? 'BOOTSTRAP_SIGNAL' : 'INFO_SIGNAL';
  return { kind, sensitive, schemaWrite, error };
}

function validateLogLines(text, stream, startMs, endMs) {
  if (typeof text !== 'string') throw new Error('DEPLOY_EVIDENCE_HOLD=LOG_STREAM_INVALID');
  const lines = text.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const timestamp = line.match(/^(\d{4}-\d{2}-\d{2}T[^ ]+Z)\s/);
    if (!timestamp || Number.isNaN(Date.parse(timestamp[1])) || Date.parse(timestamp[1]) < startMs || Date.parse(timestamp[1]) > endMs) throw new Error(`DEPLOY_EVIDENCE_HOLD=LOG_WINDOW_INCOMPLETE_${stream.toUpperCase()}`);
  }
  return lines;
}

export function captureDockerLogStreams({ containerId, startedAt, capturedAt = new Date().toISOString() }, run = undefined) {
  if (!ID.test(containerId || '') || !ISO(startedAt) || !ISO(capturedAt) || Date.parse(capturedAt) < Date.parse(startedAt)) throw new Error('DEPLOY_EVIDENCE_HOLD=LOG_BINDING');
  const args = ['logs', '--timestamps', '--since', startedAt, '--until', capturedAt, containerId];
  const result = run ? run(args) : spawnSync('docker', args, { env: executionEnv(), encoding: 'utf8', maxBuffer: MAX_LOG_BYTES, stdio: ['ignore', 'pipe', 'pipe'] });
  const stdout = Buffer.isBuffer(result?.stdout) ? result.stdout.toString('utf8') : String(result?.stdout || '');
  const stderr = Buffer.isBuffer(result?.stderr) ? result.stderr.toString('utf8') : String(result?.stderr || '');
  const combinedBytes = Buffer.byteLength(stdout) + Buffer.byteLength(stderr);
  if (result?.error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' || combinedBytes > MAX_LOG_BYTES) throw new Error('DEPLOY_EVIDENCE_HOLD=LOG_OUTPUT_LIMIT');
  if (result?.error || result?.signal || result?.status !== 0) throw new Error('DEPLOY_EVIDENCE_HOLD=DOCKER_LOG_COMMAND_FAILED');
  return { stdout, stderr, combinedBytes };
}

export function summarizeStartupLogs({ text, stdout = text || '', stderr = '', containerId, startedAt, capturedAt = new Date().toISOString(), runId, runAttempt, targetSha, floorSha, readinessVerified = false, commandFailure = false }) {
  if (!ID.test(containerId || '') || !ISO(startedAt) || !ISO(capturedAt) || Date.parse(capturedAt) < Date.parse(startedAt) || !/^\d+(?:-\d+)?$/.test(runId || '') || !/^\d+$/.test(String(runAttempt)) || !SHA.test(targetSha || '') || !SHA.test(floorSha || '')) throw new Error('DEPLOY_EVIDENCE_HOLD=LOG_BINDING');
  const combinedBytes = Buffer.byteLength(stdout) + Buffer.byteLength(stderr);
  if (combinedBytes > MAX_LOG_BYTES) throw new Error('DEPLOY_EVIDENCE_HOLD=LOG_OUTPUT_LIMIT');
  if (commandFailure) throw new Error('DEPLOY_EVIDENCE_HOLD=DOCKER_LOG_COMMAND_FAILED');
  const startMs = Date.parse(startedAt); const endMs = Date.parse(capturedAt);
  const stdoutLines = validateLogLines(stdout, 'stdout', startMs, endMs); const stderrLines = validateLogLines(stderr, 'stderr', startMs, endMs);
  const allLines = [...stdoutLines.map(line => ['stdout', line]), ...stderrLines.map(line => ['stderr', line])];
  if (!allLines.length) throw new Error('DEPLOY_EVIDENCE_HOLD=LOG_WINDOW_INCOMPLETE');
  const counts = {}; let errorSignalCount = 0; let schemaWriteSignalCount = 0; let sensitiveLineCount = 0;
  for (const [, line] of allLines) {
    const classification = classifyStartupLine(line); counts[classification.kind] = (counts[classification.kind] || 0) + 1;
    if (classification.error) { errorSignalCount++; if (classification.kind !== 'ERROR_SIGNAL') counts.ERROR_SIGNAL = (counts.ERROR_SIGNAL || 0) + 1; }
    if (classification.schemaWrite) { schemaWriteSignalCount++; if (classification.kind !== 'SCHEMA_OR_WRITE_SIGNAL') counts.SCHEMA_OR_WRITE_SIGNAL = (counts.SCHEMA_OR_WRITE_SIGNAL || 0) + 1; }
    if (classification.sensitive) { sensitiveLineCount++; if (classification.kind !== 'SENSITIVE_REDACTED') counts.SENSITIVE_REDACTED = (counts.SENSITIVE_REDACTED || 0) + 1; }
  }
  const combinedDigest = createHash('sha256').update(Buffer.from(stdout)).update(Buffer.from([0])).update(Buffer.from(stderr)).digest('hex');
  const schemaPass = /API_BOOTSTRAP_SCHEMA_COMPATIBILITY=PASS/i.test(`${stdout}\n${stderr}`);
  const result = schemaWriteSignalCount ? 'HOLD_SCHEMA_OR_WRITE_SIGNAL' : errorSignalCount ? 'HOLD_STARTUP_ERROR' : !schemaPass || !readinessVerified ? 'UNVERIFIED_STARTUP_EVIDENCE' : 'PASS_REDACTED_SUMMARY';
  return { schema: EVIDENCE_SCHEMA, phase: 'API_STARTUP_LOG', source: 'docker logs --timestamps --since container.StartedAt --until capturedAt', containerId, startedAt, capturedAt, deployRunId: runId, deployRunAttempt: Number(runAttempt), targetSha, configFloorSha: floorSha, stdoutLineCount: stdoutLines.length, stderrLineCount: stderrLines.length, errorSignalCount, schemaWriteSignalCount, sensitiveLineCount, combinedDigest, lineCount: allLines.length, eventCounts: { ...counts, SCHEMA_COMPATIBILITY_PASS: schemaPass ? 1 : 0, READINESS_HTTP_PASS: readinessVerified ? 1 : 0 }, digest: combinedDigest, rawOutput: false, result };
}

export function verifyLiveSnapshot(post, binding, run) {
  if (!post || post.schema !== EVIDENCE_SCHEMA || post.phase !== 'POST_SNAPSHOT' || post.deployRunId !== binding.runId || post.deployRunAttempt !== Number(binding.runAttempt) || post.targetSha !== binding.targetSha || post.configFloorSha !== binding.configFloorSha) throw new Error('DEPLOY_EVIDENCE_HOLD=POST_BINDING');
  const live = Object.fromEntries(SERVICES.map(service => [service, metadataFor(service, run)]));
  for (const service of ['db', 'web', 'api']) {
    const expected = post.containers?.[service]; const actual = live[service];
    if (!expected || expected.id !== actual.id || expected.startedAt !== actual.startedAt || expected.image !== actual.image || expected.health !== actual.health || JSON.stringify(expected.mounts) !== JSON.stringify(actual.mounts)) throw new Error(`DEPLOY_EVIDENCE_HOLD=${service.toUpperCase()}_TOCTOU`);
  }
  if (live.api.ociRevision !== binding.targetSha || !live.api.running || live.api.health !== 'healthy') throw new Error('DEPLOY_EVIDENCE_HOLD=API_TOCTOU');
  return live;
}

export function verifyEvidenceFiles(preFile, postFile, logFile, binding) {
  const pre = JSON.parse(fs.readFileSync(preFile, 'utf8')); const post = JSON.parse(fs.readFileSync(postFile, 'utf8')); const log = JSON.parse(fs.readFileSync(logFile, 'utf8'));
  if (pre.deployRunId !== binding.runId || post.deployRunId !== binding.runId || log.deployRunId !== binding.runId || pre.deployRunAttempt !== Number(binding.runAttempt) || post.deployRunAttempt !== Number(binding.runAttempt) || log.deployRunAttempt !== Number(binding.runAttempt) || pre.targetSha !== binding.targetSha || post.targetSha !== binding.targetSha || log.targetSha !== binding.targetSha || pre.configFloorSha !== binding.configFloorSha || post.configFloorSha !== binding.configFloorSha || log.configFloorSha !== binding.configFloorSha || log.phase !== 'API_STARTUP_LOG') throw new Error('DEPLOY_EVIDENCE_HOLD=RUN_BINDING');
  const comparison = compareSnapshots(pre, post);
  if (!['PASS_REDACTED_SUMMARY'].includes(log.result) || log.containerId !== post.containers.api.id || log.startedAt !== post.containers.api.startedAt) throw new Error('DEPLOY_EVIDENCE_HOLD=STARTUP_LOG');
  return { schema: EVIDENCE_SCHEMA, comparison, startup: log.result, preCapturedAt: pre.capturedAt, postCapturedAt: post.capturedAt };
}

export function persistSnapshot(file, snapshot) { atomicState(file, snapshot); return file; }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    verifyContext(fs.realpathSync(process.cwd()), CONTRACT.stateDirectory);
    const [operation, file, other, logFile] = process.argv.slice(2); const runId = process.env.DEPLOY_RUN_ID; const attempt = process.env.GITHUB_RUN_ATTEMPT || String(process.env.DEPLOY_RUN_ATTEMPT || '1'); const target = process.env.TARGET_SHA; const floor = process.env.APPROVED_CONFIG_FLOOR_SHA || JSON.parse(fs.readFileSync(path.join(CONTRACT.stateDirectory, 'floor.json'), 'utf8')).floorSha;
    if (operation === 'capture') { if (fs.existsSync(file)) throw new Error('DEPLOY_EVIDENCE_HOLD=EVIDENCE_REUSED'); const snapshot = captureSnapshot({ phase: process.env.EVIDENCE_PHASE, runId, runAttempt: attempt, targetSha: target, floorSha: floor }, undefined); persistSnapshot(file, snapshot); console.log(`DEPLOY_EVIDENCE=${snapshot.phase}`); }
    else if (operation === 'logs') {
      const post = JSON.parse(fs.readFileSync(file, 'utf8')); const api = post.containers?.api; if (!api) throw new Error('DEPLOY_EVIDENCE_HOLD=API_LOG_BINDING');
      const capturedAt = new Date().toISOString();
      const streams = captureDockerLogStreams({ containerId: api.id, startedAt: api.startedAt, capturedAt });
      const summary = summarizeStartupLogs({ stdout: streams.stdout, stderr: streams.stderr, containerId: api.id, startedAt: api.startedAt, capturedAt, runId, runAttempt: attempt, targetSha: target, floorSha: floor, readinessVerified: process.env.PRODUCTION_READINESS_VERIFIED === 'true' });
      persistSnapshot(other, summary); console.log(`DEPLOY_EVIDENCE_LOG=${summary.result}`);
    }
    else if (operation === 'verify') { console.log(JSON.stringify(verifyEvidenceFiles(file, other, logFile, { runId, runAttempt: attempt, targetSha: target, configFloorSha: floor }))); }
    else throw new Error('DEPLOY_EVIDENCE_HOLD=OPERATION');
  } catch (error) { console.error(error.message.startsWith('DEPLOY_EVIDENCE_HOLD=') ? error.message : 'DEPLOY_EVIDENCE_HOLD=FAILED'); process.exitCode = 1; }
}
