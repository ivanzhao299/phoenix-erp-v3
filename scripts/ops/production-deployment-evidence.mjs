import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { atomicState } from './production-deployment-state.mjs';
import { CONTRACT, verifyContext } from './production-config-guard.mjs';
import { executionEnv } from './capture-production-runtime.mjs';

export const EVIDENCE_SCHEMA = 'phoenix.production-deployment-evidence/v1';
const SERVICES = ['db', 'api', 'web'];
const CONTAINERS = { db: 'phoenix-v3-db', api: 'phoenix-v3-api', web: 'phoenix-v3-web' };
const SHA = /^[a-f0-9]{40}$/;
const IMAGE = /^sha256:[a-f0-9]{64}$/;
const ID = /^[a-f0-9]{12,64}$/;
const ISO = value => typeof value === 'string' && !Number.isNaN(Date.parse(value));
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

const secretPattern = /(password|secret|token|certificate|appticket|opentoken|authorization|cookie|private.?key|jwt)/i;
const classify = line => secretPattern.test(line) ? 'SENSITIVE_REDACTED' : /API_BOOTSTRAP_SCHEMA_COMPATIBILITY=PASS/i.test(line) ? 'BOOTSTRAP_SIGNAL' : /ddl|seed|insert|update|alter|drop|sequence/i.test(line) ? 'SCHEMA_OR_WRITE_SIGNAL' : /error|exception|fatal|econn|mismatch/i.test(line) ? 'ERROR_SIGNAL' : /nest|bootstrap|listen|readiness|started|production/i.test(line) ? 'BOOTSTRAP_SIGNAL' : 'OTHER';

export function summarizeStartupLogs({ text, containerId, startedAt, capturedAt = new Date().toISOString(), runId, runAttempt, targetSha, floorSha, readinessVerified = false }) {
  if (!ID.test(containerId || '') || !ISO(startedAt) || !ISO(capturedAt) || Date.parse(capturedAt) < Date.parse(startedAt) || !/^\d+(?:-\d+)?$/.test(runId || '') || !/^\d+$/.test(String(runAttempt)) || !SHA.test(targetSha || '') || !SHA.test(floorSha || '')) throw new Error('DEPLOY_EVIDENCE_HOLD=LOG_BINDING');
  if (typeof text !== 'string' || !text.trim() || text.length > 2_000_000) throw new Error('DEPLOY_EVIDENCE_HOLD=LOG_WINDOW_INCOMPLETE');
  const counts = {}; let lines = 0; const startMs = Date.parse(startedAt); const endMs = Date.parse(capturedAt);
  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    const timestamp = line.match(/^(\d{4}-\d{2}-\d{2}T[^ ]+Z)\s/);
    if (!timestamp || Number.isNaN(Date.parse(timestamp[1])) || Date.parse(timestamp[1]) < startMs || Date.parse(timestamp[1]) > endMs) throw new Error('DEPLOY_EVIDENCE_HOLD=LOG_WINDOW_INCOMPLETE');
    lines++; const kind = classify(line); counts[kind] = (counts[kind] || 0) + 1;
  }
  if (!lines) throw new Error('DEPLOY_EVIDENCE_HOLD=LOG_WINDOW_INCOMPLETE');
  const digest = createHash('sha256').update(text).digest('hex');
  const schemaPass = counts.BOOTSTRAP_SIGNAL && /API_BOOTSTRAP_SCHEMA_COMPATIBILITY=PASS/i.test(text);
  const result = counts.SCHEMA_OR_WRITE_SIGNAL ? 'HOLD_SCHEMA_OR_WRITE_SIGNAL' : counts.ERROR_SIGNAL ? 'HOLD_STARTUP_ERROR' : !schemaPass || !readinessVerified ? 'UNVERIFIED_STARTUP_EVIDENCE' : 'PASS_REDACTED_SUMMARY';
  return { schema: EVIDENCE_SCHEMA, phase: 'API_STARTUP_LOG', source: 'docker logs --timestamps --since container.StartedAt --until capturedAt', containerId, startedAt, capturedAt, deployRunId: runId, deployRunAttempt: Number(runAttempt), targetSha, configFloorSha: floorSha, lineCount: lines, eventCounts: { ...counts, SCHEMA_COMPATIBILITY_PASS: schemaPass ? 1 : 0, READINESS_HTTP_PASS: readinessVerified ? 1 : 0 }, digest, rawOutput: false, result };
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
      let output; try { output = execFileSync('docker', ['logs', '--timestamps', '--since', api.startedAt, '--until', new Date().toISOString(), api.id], { encoding: 'utf8', maxBuffer: 2_000_000, stdio: ['ignore', 'pipe', 'pipe'] }); } catch { throw new Error('DEPLOY_EVIDENCE_HOLD=LOG_CAPTURE_FAILED'); }
      const summary = summarizeStartupLogs({ text: output, containerId: api.id, startedAt: api.startedAt, runId, runAttempt: attempt, targetSha: target, floorSha: floor, readinessVerified: process.env.PRODUCTION_READINESS_VERIFIED === 'true' });
      persistSnapshot(other, summary); console.log(`DEPLOY_EVIDENCE_LOG=${summary.result}`);
    }
    else if (operation === 'verify') { console.log(JSON.stringify(verifyEvidenceFiles(file, other, logFile, { runId, runAttempt: attempt, targetSha: target, configFloorSha: floor }))); }
    else throw new Error('DEPLOY_EVIDENCE_HOLD=OPERATION');
  } catch (error) { console.error(error.message.startsWith('DEPLOY_EVIDENCE_HOLD=') ? error.message : 'DEPLOY_EVIDENCE_HOLD=FAILED'); process.exitCode = 1; }
}
