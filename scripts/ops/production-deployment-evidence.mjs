import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { atomicState } from './production-atomic-state.mjs';
import { CONTRACT, verifyContext } from './production-config-guard.mjs';
import { executionEnv } from './capture-production-runtime.mjs';

export const EVIDENCE_SCHEMA = 'phoenix.production-deployment-evidence/v2';
export const MODE_EVIDENCE_SCHEMA = 'phoenix.production-deployment-evidence/v3';
const MODES = ['api', 'web', 'full'];
const switchedServices = mode => mode === 'full' ? ['api', 'web'] : [mode];

// Historical v2 receipts remain strict API-only. A v3 mode can only come from
// the deployment transaction and must agree on every evidence object.
export function evidenceMode(receipt) {
  if (receipt?.schema === EVIDENCE_SCHEMA && !Object.hasOwn(receipt, 'deployMode')) return 'api';
  if (receipt?.schema === MODE_EVIDENCE_SCHEMA && MODES.includes(receipt.deployMode)) return receipt.deployMode;
  throw hold('MODE_BINDING');
}
function assertModeBinding(receipt, mode) {
  if (evidenceMode(receipt) !== (mode ?? 'api')) throw hold('MODE_BINDING');
}

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

export function captureSnapshot({ phase, runId, runAttempt, targetSha, floorSha, deployMode, capturedAt = new Date().toISOString() }, run) {
  if (!['PRE_SNAPSHOT', 'POST_SNAPSHOT'].includes(phase) || !/^\d+(?:-\d+)?$/.test(runId || '') || !/^\d+$/.test(String(runAttempt))
    || !SHA.test(targetSha || '') || !SHA.test(floorSha || '') || !ISO(capturedAt)) throw new Error('DEPLOY_EVIDENCE_HOLD=INVALID_BINDING');
  if (deployMode !== undefined && !MODES.includes(deployMode)) throw hold('MODE_BINDING');
  const containers = Object.fromEntries(SERVICES.map(service => [service, metadataFor(service, run)]));
  return { schema: deployMode ? MODE_EVIDENCE_SCHEMA : EVIDENCE_SCHEMA, ...(deployMode ? { deployMode } : {}), phase, deployRunId: runId, deployRunAttempt: Number(runAttempt), targetSha, configFloorSha: floorSha, capturedAt, containers };
}

function validateV3Metadata(item, service) {
  if (!item || item.service !== service || item.container !== CONTAINERS[service] || !ID.test(item.id || '') || !IMAGE.test(item.image || '')
    || !ISO(item.created) || !ISO(item.startedAt) || Date.parse(item.created) > Date.parse(item.startedAt)
    || item.running !== true || item.health !== 'healthy' || !Number.isInteger(item.restartCount) || item.restartCount < 0
    || !Array.isArray(item.mounts) || item.mounts.some(m => !m || !m.type || !m.destination || typeof m.readOnly !== 'boolean' || (m.type === 'bind' && !m.source))
    || (service !== 'db' && !SHA.test(item.ociRevision || ''))) throw hold(`${service.toUpperCase()}_IDENTITY`);
}
function unchanged(before, after, strict) {
  const keys = strict ? ['id', 'created', 'startedAt', 'image', 'ociRevision', 'restartCount'] : ['id', 'startedAt', 'image'];
  return before && after && keys.every(key => before[key] === after[key])
    && before.running === true && before.health === 'healthy' && after.running === true && after.health === 'healthy'
    && JSON.stringify(before.mounts) === JSON.stringify(after.mounts);
}
export function compareSnapshots(pre, post, expectedMode) {
  const mode = evidenceMode(pre); assertModeBinding(post, mode);
  if (expectedMode !== undefined && expectedMode !== mode) throw hold('MODE_BINDING');
  if (!pre || !post || pre.schema !== post.schema || pre.phase !== 'PRE_SNAPSHOT' || post.phase !== 'POST_SNAPSHOT'
    || pre.deployRunId !== post.deployRunId || pre.deployRunAttempt !== post.deployRunAttempt || pre.targetSha !== post.targetSha || pre.configFloorSha !== post.configFloorSha) throw hold('SNAPSHOT_BINDING');
  const strict = pre.schema === MODE_EVIDENCE_SCHEMA;
  if (strict && (!/^\d+(?:-\d+)?$/.test(pre.deployRunId || '') || !Number.isInteger(pre.deployRunAttempt) || pre.deployRunAttempt < 1
    || !SHA.test(pre.targetSha || '') || !SHA.test(pre.configFloorSha || '') || !ISO(pre.capturedAt) || !ISO(post.capturedAt)
    || Date.parse(pre.capturedAt) > Date.parse(post.capturedAt))) throw hold('SNAPSHOT_BINDING');
  const switching = switchedServices(mode);
  for (const service of SERVICES) {
    const before = pre.containers?.[service], after = post.containers?.[service];
    if (strict) { validateV3Metadata(before, service); validateV3Metadata(after, service); }
    if (!switching.includes(service) && !unchanged(before, after, strict)) throw hold(`${service.toUpperCase()}_CHANGED`);
    if (switching.includes(service)) {
      if (!after || after.running !== true || after.ociRevision !== post.targetSha || after.health !== 'healthy') throw hold(`${service.toUpperCase()}_IDENTITY`);
      // New receipts prove an actual, fresh candidate start, rather than reusing
      // an old healthy container or an earlier release's startup window.
      if (strict && (before.id === after.id || after.restartCount !== 0 || Date.parse(after.startedAt) < Date.parse(pre.capturedAt)
        || Date.parse(after.startedAt) > Date.parse(post.capturedAt))) throw hold(`${service.toUpperCase()}_SWITCH_BINDING`);
    }
  }
  return { ...(strict ? { deployMode: mode } : {}), web: switching.includes('web') ? 'TARGET_VERIFIED' : 'UNCHANGED', db: 'UNCHANGED',
    ...(switching.includes('api') ? { apiRevision: post.containers.api.ociRevision } : { api: 'UNCHANGED', webRevision: post.containers.web.ociRevision }) };
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
// RoutesResolver emits `<Controller>[,] {/prefix[, /prefix]}: [+Nms]` — the
// optional comma after the controller name and the colored elapsed suffix
// are both real Nest formats (run 38208343072-1 root cause); the path
// charset and end anchor stay strict so appended payloads still classify.
const routesResolverPattern = /\[RoutesResolver\]\s*\w+\s*,?\s*\{\s*(?:\/[^\s{},]*)?(?:\s*,\s*\/[^\s{},]*)*\s*\}\s*:?(?:\s*\+\d+ms)?\s*$/i;
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

export function isRouteRegistrationLine(line) {
  const clean = typeof line === 'string' ? line.replace(ansiPattern, '') : String(line ?? '');
  return routerExplorerPattern.test(clean) || routesResolverPattern.test(clean);
}

export function classifyStartupLine(line) {
  const clean = typeof line === 'string' ? line.replace(ansiPattern, '') : String(line ?? '');
  const sensitive = secretPattern.test(clean);
  const routeRegistration = isRouteRegistrationLine(clean);
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

export function summarizeStartupLogs({ text, stdout = text || '', stderr = '', containerId, startedAt, capturedAt = new Date().toISOString(), runId, runAttempt, targetSha, floorSha, readinessVerified = false, commandFailure = false, deployMode, service = 'api', webHttpVerified = false }) {
  if (!ID.test(containerId || '') || !ISO(startedAt) || !ISO(capturedAt) || Date.parse(capturedAt) < Date.parse(startedAt) || !/^\d+(?:-\d+)?$/.test(runId || '') || !/^\d+$/.test(String(runAttempt)) || !SHA.test(targetSha || '') || !SHA.test(floorSha || '')) throw new Error('DEPLOY_EVIDENCE_HOLD=LOG_BINDING');
  if (!['api', 'web'].includes(service) || (deployMode !== undefined && (!MODES.includes(deployMode) || !switchedServices(deployMode).includes(service))) || (service === 'web' && !deployMode)) throw hold('MODE_BINDING');
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
  const schemaPass = service === 'api' && /API_BOOTSTRAP_SCHEMA_COMPATIBILITY=PASS/i.test(`${stdout}\n${stderr}`);
  const webStarted = service === 'web' && /(?:^|\n)[^\n]*\bReady in \d+(?:\.\d+)?\s*(?:ms|s)\b/i.test(`${stdout}\n${stderr}`);
  const startupVerified = service === 'api' ? schemaPass && readinessVerified : webStarted && webHttpVerified && readinessVerified;
  const result = schemaWriteSignalCount ? 'HOLD_SCHEMA_OR_WRITE_SIGNAL' : errorSignalCount ? 'HOLD_STARTUP_ERROR' : !startupVerified ? 'UNVERIFIED_STARTUP_EVIDENCE' : 'PASS_REDACTED_SUMMARY';
  return { schema: deployMode ? MODE_EVIDENCE_SCHEMA : EVIDENCE_SCHEMA, ...(deployMode ? { deployMode } : {}), phase: service === 'api' ? 'API_STARTUP_LOG' : 'WEB_STARTUP_LOG', source: 'docker logs --timestamps --since container.StartedAt --until capturedAt', containerId, startedAt, capturedAt, deployRunId: runId, deployRunAttempt: Number(runAttempt), targetSha, configFloorSha: floorSha, stdoutLineCount: stdoutLines.length, stderrLineCount: stderrLines.length, errorSignalCount, schemaWriteSignalCount, sensitiveLineCount, combinedDigest, lineCount: allLines.length, eventCounts: { ...counts, SCHEMA_COMPATIBILITY_PASS: schemaPass ? 1 : 0, READINESS_HTTP_PASS: readinessVerified ? 1 : 0, ...(service === 'web' ? { WEB_STARTUP_PASS: webStarted ? 1 : 0, WEB_HTTP_PASS: webHttpVerified ? 1 : 0 } : {}) }, digest: combinedDigest, rawOutput: false, result };
}

function verifyBinding(receipt, binding) {
  assertModeBinding(receipt, binding.deployMode);
  if (binding.evidenceSchema && receipt.schema !== binding.evidenceSchema) throw hold('MODE_BINDING');
  if (receipt.deployRunId !== binding.runId || receipt.deployRunAttempt !== Number(binding.runAttempt)
    || receipt.targetSha !== binding.targetSha || receipt.configFloorSha !== binding.configFloorSha) throw hold('RUN_BINDING');
}
export function startupBundle(post, summaries) {
  const mode = evidenceMode(post);
  if (post.schema !== MODE_EVIDENCE_SCHEMA || post.phase !== 'POST_SNAPSHOT') throw hold('MODE_BINDING');
  const keys = Object.keys(summaries).sort();
  if (JSON.stringify(keys) !== JSON.stringify(switchedServices(mode).sort())) throw hold('STARTUP_SERVICES');
  return { schema: MODE_EVIDENCE_SCHEMA, phase: 'SERVICE_STARTUP_LOGS', deployMode: mode, deployRunId: post.deployRunId,
    deployRunAttempt: post.deployRunAttempt, targetSha: post.targetSha, configFloorSha: post.configFloorSha, services: summaries };
}
export function verifyLiveSnapshot(post, binding, run) {
  if (!post || post.phase !== 'POST_SNAPSHOT') throw hold('POST_BINDING');
  verifyBinding(post, binding);
  const strict = post.schema === MODE_EVIDENCE_SCHEMA || binding.strictLiveIdentity === true;
  const mode = evidenceMode(post);
  const live = Object.fromEntries(SERVICES.map(service => [service, metadataFor(service, run)]));
  for (const service of SERVICES) {
    const expected = post.containers?.[service], actual = live[service];
    if (strict) { validateV3Metadata(expected, service); validateV3Metadata(actual, service); }
    if (!unchanged(expected, actual, strict)) throw hold(`${service.toUpperCase()}_TOCTOU`);
  }
  for (const service of switchedServices(mode)) if (live[service].ociRevision !== binding.targetSha) throw hold(`${service.toUpperCase()}_TOCTOU`);
  return live;
}
export function verifyEvidenceFiles(preFile, postFile, logFile, binding) {
  const pre = JSON.parse(fs.readFileSync(preFile, 'utf8')), post = JSON.parse(fs.readFileSync(postFile, 'utf8')), log = JSON.parse(fs.readFileSync(logFile, 'utf8'));
  for (const item of [pre, post, log]) verifyBinding(item, binding);
  const mode = evidenceMode(pre), strict = pre.schema === MODE_EVIDENCE_SCHEMA;
  if (pre.schema !== post.schema || log.schema !== pre.schema) throw hold('MODE_BINDING');
  const comparison = compareSnapshots(pre, post, binding.deployMode);
  const expectedServices = switchedServices(mode);
  if (strict && (log.phase !== 'SERVICE_STARTUP_LOGS' || JSON.stringify(Object.keys(log.services || {}).sort()) !== JSON.stringify([...expectedServices].sort()))) throw hold('STARTUP_SERVICES');
  const summaries = strict ? log.services : { api: log };
  for (const service of expectedServices) {
    const summary = summaries[service], container = post.containers[service];
    if (!summary) throw hold('STARTUP_LOG');
    verifyBinding(summary, binding);
    if (summary.schema !== pre.schema || summary.phase !== `${service.toUpperCase()}_STARTUP_LOG` || summary.result !== 'PASS_REDACTED_SUMMARY'
      || summary.containerId !== container.id || summary.startedAt !== container.startedAt) throw hold('STARTUP_LOG');
    // Formal live audits demand structural proof for legacy receipts too. Frozen
    // incident-specific v2 recovery keeps its separately constrained semantics.
    if ((strict || binding.strictLiveIdentity === true) && (summary.rawOutput !== false || !/^[a-f0-9]{64}$/.test(summary.combinedDigest || '')
      || !Number.isInteger(summary.stdoutLineCount) || !Number.isInteger(summary.stderrLineCount)
      || summary.errorSignalCount !== 0 || summary.schemaWriteSignalCount !== 0 || !Number.isInteger(summary.sensitiveLineCount))) throw hold('STARTUP_LOG');
    if (strict && (summary.rawOutput !== false || !/^[a-f0-9]{64}$/.test(summary.combinedDigest || '')
      || !Number.isInteger(summary.stdoutLineCount) || !Number.isInteger(summary.stderrLineCount) || summary.stdoutLineCount + summary.stderrLineCount < 1
      || summary.errorSignalCount !== 0 || summary.schemaWriteSignalCount !== 0 || !Number.isInteger(summary.sensitiveLineCount) || summary.sensitiveLineCount < 0
      || !ISO(summary.capturedAt) || Date.parse(summary.capturedAt) < Date.parse(post.capturedAt)
      || summary.eventCounts?.READINESS_HTTP_PASS !== 1
      || (service === 'api' ? summary.eventCounts?.SCHEMA_COMPATIBILITY_PASS !== 1 : summary.eventCounts?.WEB_STARTUP_PASS !== 1 || summary.eventCounts?.WEB_HTTP_PASS !== 1))) throw hold('STARTUP_LOG');
  }
  return { schema: pre.schema, ...(strict ? { deployMode: mode } : {}), comparison, startup: 'PASS_REDACTED_SUMMARY', preCapturedAt: pre.capturedAt, postCapturedAt: post.capturedAt };
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
    const [operation, file, other, logFile] = process.argv.slice(2); const deployMode = process.env.DEPLOY_MODE; if (!MODES.includes(deployMode)) throw hold('MODE_BINDING'); const runId = process.env.DEPLOY_RUN_ID; const attempt = process.env.GITHUB_RUN_ATTEMPT || String(process.env.DEPLOY_RUN_ATTEMPT || '1'); const target = process.env.TARGET_SHA; const floor = process.env.APPROVED_CONFIG_FLOOR_SHA || JSON.parse(fs.readFileSync(path.join(CONTRACT.stateDirectory, 'floor.json'), 'utf8')).floorSha;
    if (operation === 'capture') { if (fs.existsSync(file)) throw new Error('DEPLOY_EVIDENCE_HOLD=EVIDENCE_REUSED'); const snapshot = captureSnapshot({ phase: process.env.EVIDENCE_PHASE, runId, runAttempt: attempt, targetSha: target, floorSha: floor, deployMode }, undefined); persistSnapshot(file, snapshot); console.log(`DEPLOY_EVIDENCE=${snapshot.phase}`); }
    else if (operation === 'logs') {
      const post = JSON.parse(fs.readFileSync(file, 'utf8'));
      verifyBinding(post, { runId, runAttempt: attempt, targetSha: target, configFloorSha: floor, deployMode, evidenceSchema: MODE_EVIDENCE_SCHEMA });
      if (post.phase !== 'POST_SNAPSHOT') throw hold('POST_BINDING');
      const summaries = {};
      for (const service of switchedServices(deployMode)) {
        const item = post.containers?.[service]; if (!item) throw hold('STARTUP_LOG');
        const capturedAt = new Date().toISOString();
        const streams = captureDockerLogStreams({ containerId: item.id, startedAt: item.startedAt, capturedAt });
        summaries[service] = summarizeStartupLogs({ stdout: streams.stdout, stderr: streams.stderr, containerId: item.id, startedAt: item.startedAt, capturedAt,
          runId, runAttempt: attempt, targetSha: target, floorSha: floor, deployMode, service,
          readinessVerified: process.env.PRODUCTION_READINESS_VERIFIED === 'true', webHttpVerified: process.env.PRODUCTION_WEB_HTTP_VERIFIED === 'true' });
      }
      const bundle = startupBundle(post, summaries); persistSnapshot(other, bundle);
      console.log(`DEPLOY_EVIDENCE_LOG=${Object.values(summaries).every(x => x.result === 'PASS_REDACTED_SUMMARY') ? 'PASS_REDACTED_SUMMARY' : 'HOLD_STARTUP_EVIDENCE'}`);
    }
    else if (operation === 'verify') { console.log(JSON.stringify(verifyEvidenceFiles(file, other, logFile, { runId, runAttempt: attempt, targetSha: target, configFloorSha: floor, deployMode, evidenceSchema: MODE_EVIDENCE_SCHEMA }))); }
    else throw new Error('DEPLOY_EVIDENCE_HOLD=OPERATION');
  } catch (error) {
    console.error(`DEPLOY_EVIDENCE_STAGE=${process.env.EVIDENCE_PHASE || 'EVIDENCE_OPERATION'}`);
    console.error(`DEPLOY_EVIDENCE_HOLD=${classifyEvidenceFailure(error)}`);
    process.exitCode = 1;
  }
}
