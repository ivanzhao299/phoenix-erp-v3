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

function hold(code, cause) {
  const error = new Error(`DEPLOY_EVIDENCE_HOLD=${code}`);
  // Retain the original exception for restricted local diagnostics. The CLI
  // emits only the stable code, so Docker output never reaches Actions logs.
  if (cause) error.cause = cause;
  return error;
}

function inspectDocker(args, run) {
  try { return safeRun(args, run); }
  catch (error) { throw hold('DOCKER_INSPECT_FAILED', error); }
}

export function metadataFor(service, run) {
  const container = CONTAINERS[service];
  let fields;
  try {
    fields = inspectDocker(['inspect', container, '--format', '{{json .Id}}\t{{json .Created}}\t{{json .Image}}\t{{json .State}}\t{{json .RestartCount}}\t{{json .Mounts}}'], run).split('\t').map(JSON.parse);
  } catch (error) {
    if (error.message.startsWith('DEPLOY_EVIDENCE_HOLD=')) throw error;
    throw hold('METADATA_MISSING', error);
  }
  const [id, created, image, state, restartCount, mountsValue] = fields;
  const inspect = { Id: id, Created: created, Image: image, State: state, RestartCount: restartCount, Mounts: mountsValue };
  let labels;
  try { labels = JSON.parse(inspectDocker(['image', 'inspect', image, '--format', '{{json .Config.Labels}}'], run)); }
  catch (error) { throw error.message.startsWith('DEPLOY_EVIDENCE_HOLD=') ? error : hold('DOCKER_INSPECT_FAILED', error); }
  if (!labels || typeof labels !== 'object' || Array.isArray(labels)) labels = {};
  const rawMounts = Array.isArray(inspect.Mounts) ? inspect.Mounts : [];
  const mounts = rawMounts.map(mount => ({
    type: String(mount.Type || ''), source: String(mount.Source || ''), destination: String(mount.Destination || ''),
    readOnly: Boolean(mount.RW === false),
  })).sort((a, b) => a.destination.localeCompare(b.destination));
  const containerState = inspect.State || {};
  const health = containerState.Health?.Status;
  if (!ID.test(String(inspect.Id || '')) || !ISO(inspect.Created) || !ISO(containerState.StartedAt)
    || typeof containerState.Running !== 'boolean' || !Number.isInteger(inspect.RestartCount) || !IMAGE.test(image)
    || !health || !['healthy', 'unhealthy', 'starting'].includes(health)
    || !Array.isArray(inspect.Mounts) || mounts.some(m => !m.type || !m.destination || (m.type === 'bind' && !m.source))) throw hold('METADATA_MISSING');
  const ociRevision = labels['org.opencontainers.image.revision'];
  // postgres:16-alpine is a third-party image and has no application Git
  // revision label. Its immutable image digest remains mandatory. API and Web
  // images stay tied to a 40-character application revision.
  if (service !== 'db' && !ociRevision) throw hold('IMAGE_REVISION_MISSING');
  if (service !== 'db' && !SHA.test(String(ociRevision))) throw hold('IMAGE_REVISION_INVALID');
  return { service, container, id: inspect.Id, created: inspect.Created, startedAt: containerState.StartedAt, running: containerState.Running,
    health, restartCount: inspect.RestartCount, image, ociRevision: service === 'db' ? null : String(ociRevision), mounts };
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
// ANSI color sequences are control characters, not content. Strip them before
// every pattern test so neither detection nor exemption can be split or glued
// by escape codes (production stdout is colorized: R0.1 word sets showed
// ANSI-glued tokens like "mMapped").
const ansiPattern = /\x1b\[[0-9;]*[A-Za-z]/g;
// NestJS route registration lines are exempt ONLY in their complete logged
// formats: RouterExplorer emits `Mapped {<path>, <METHOD>} [route] [+Nms]`
// and RoutesResolver emits `<Controller> {/prefix[, /prefix]}:`. Paths are
// whitespace-free URL segments. A route-shaped prefix with appended SQL,
// exception text or any other payload does not match and is classified
// normally — the exemption can never swallow a real signal (fail-closed).
const routerExplorerPattern = /\[RouterExplorer\][^{}\n]*Mapped\s*\{\/[^\s{},]*,\s*(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|ALL)\}(?:\s+route)?(?:\s*\+\d+ms)?\s*$/i;
const routesResolverPattern = /\[RoutesResolver\]\s*\w+\s*\{\s*(?:\/[^\s{},]*)?(?:\s*,\s*\/[^\s{},]*)*\s*\}\s*:?\s*$/i;
// Write detection is anchored to SQL/DDL statement shapes and migration/seed
// execution signatures instead of bare verbs: prose such as "Schema managed by
// migration file." must not read as a write, while executed migrations, INSERT/
// UPDATE/DELETE statements, DDL and sequence operations remain fail-closed.
const schemaWritePattern = /\b(?:alter\s+table|create\s+(?:table|index|sequence|unique)|drop\s+(?:table|index|constraint)|truncate|insert\s+into|update\s+[\w."]+\s+set|delete\s+from|upsert\s+into|setval|nextval|ddl|schema\s+(?:repair|write|mutation)|(?:execut\w*|run(?:ning)?)\s+(?:of\s+)?migrations?\b|migrations?\s+[\w."']+\s+has\s+been\s+(?:successfully\s+)?executed|migrationsRun\b|runMigrations\b|(?:execut\w*|run(?:ning)?)\s+(?:of\s+)?seeds?\b|seed(?:ing)?\s+(?:data|script)?\s*(?:executed|completed|inserted|applied))\b/i;
// Real startup failures: fatal/panic, Nest [ExceptionHandler], *Error:/TypeError
// stacks, uncaught/unhandled, connection resets, checksum mismatches. Bare
// URL-segment hits were the run 38031441639-1 false-positive class and are now
// excluded via the full-format route-registration exemption above.
const errorPattern = /\b(?:fatal|panic|exception(?:handler)?|\w*error|uncaught|unhandled|econn(?:refused|reset)|mismatch|failed|failure|err)\b/i;
const warningPattern = /\b(?:warn|warning|deprecated|retry(?:ing)?)\b/i;
const bootstrapPattern = /API_BOOTSTRAP_SCHEMA_COMPATIBILITY=PASS|\b(?:nest|bootstrap|listen(?:ing)?|readiness|started|production)\b/i;

export function classifyStartupLine(line) {
  const clean = typeof line === 'string' ? line.replace(ansiPattern, '') : String(line ?? '');
  const sensitive = secretPattern.test(clean);
  const routeRegistration = routerExplorerPattern.test(clean) || routesResolverPattern.test(clean);
  const schemaWrite = !routeRegistration && schemaWritePattern.test(clean);
  const error = !routeRegistration && (errorPattern.test(clean) || schemaWrite);
  const warning = !error && warningPattern.test(clean);
  const kind = schemaWrite ? 'SCHEMA_OR_WRITE_SIGNAL' : error ? 'ERROR_SIGNAL' : sensitive ? 'SENSITIVE_REDACTED' : warning ? 'WARNING_SIGNAL' : bootstrapPattern.test(clean) ? 'BOOTSTRAP_SIGNAL' : 'INFO_SIGNAL';
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

export function persistSnapshot(file, snapshot) {
  try { atomicState(file, snapshot); return file; }
  catch (error) { throw hold('SNAPSHOT_PERSISTENCE', error); }
}

export function classifyEvidenceFailure(error) {
  const message = String(error?.message || '');
  const match = message.match(/^DEPLOY_EVIDENCE_HOLD=([A-Z0-9_]+)$/);
  if (match) return match[1];
  if (/^(?:CONFIG_HOLD|RUNTIME_HOLD|MIGRATION_SCOPE)=/.test(message)) return 'CONTEXT_VALIDATION';
  return 'UNEXPECTED_FAILURE';
}

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
  } catch (error) {
    console.error(`DEPLOY_EVIDENCE_STAGE=${process.env.EVIDENCE_PHASE || 'EVIDENCE_OPERATION'}`);
    console.error(`DEPLOY_EVIDENCE_HOLD=${classifyEvidenceFailure(error)}`);
    process.exitCode = 1;
  }
}
