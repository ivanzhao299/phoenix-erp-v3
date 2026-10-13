import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { captureSnapshot, compareSnapshots, summarizeStartupLogs, verifyEvidenceFiles, captureDockerLogStreams, MAX_LOG_BYTES, metadataFor, classifyEvidenceFailure, classifyStartupLine } from './production-deployment-evidence.mjs';
import { M12_MATERIAL_TRANSACTION, REPLAY_SQL_SHAPE_PATTERN, frozenM12Identity, replayWindowDiagnostics } from './readonly-production-evidence.mjs';
import { COMPLETE_ABORT_TRANSACTION, replayStartupWindow } from './production-deployment-recovery.mjs';
import * as evidenceLibrary from './production-deployment-evidence.mjs';
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
    '[Nest] LOG [RouterExplorer] Mapped {/api/master-data/:type/:id, DELETE}',
    '[Nest] LOG [RouterExplorer] Mapped {/api/v2/bi/reports/:code/refresh, POST} +12ms',
    '[Nest] LOG [RoutesResolver] DualPrefixController {/api/v2/a, /api/v2/b}:',
    '[Nest] LOG [RoutesResolver] EmptyPrefixController {}:',
    // run 38208343072-1 root cause: real Nest variants that previously escaped
    '[Nest] LOG [RoutesResolver] SysErrorLogsController {/api/system/error-logs}: +12ms',
    '[Nest] LOG [RoutesResolver] SysErrorLogsController, {/api/system/error-logs}:',
    '[Nest] LOG [RoutesResolver] \u001b[36mSysErrorLogsController\u001b[39m {/api/system/error-logs}: \u001b[32m+12ms\u001b[39m',
    '[Nest] LOG [RoutesResolver] DualPrefixController, {/api/v2/a, /api/v2/b}: +7ms',
  ];
  for (const line of routeLines) {
    const verdict = classifyStartupLine(`2026-10-10T06:43:19.000000000Z ${line}`);
    assert.equal(verdict.schemaWrite, false, line);
    assert.equal(verdict.error, false, line);
  }
});
test('colorized production stdout still matches the route exemption after ANSI stripping', () => {
  const colored = '2026-10-10T06:43:18.896791691Z [Nest] LOG [RouterExplorer] \x1b[32mMapped {/api/v2/finance/cash/transactions/bulk-delete, POST}\x1b[39m route';
  const verdict = classifyStartupLine(colored);
  assert.equal(verdict.schemaWrite, false);
  assert.equal(verdict.error, false);
  // ANSI must equally fail to hide a real signal inside a colored payload.
  const coloredSql = '2026-10-10T06:43:19.000000000Z [Nest] LOG \x1b[32mquery: INSERT\x1b[39m INTO chanjet_sync_jobs(status) VALUES ($1)';
  assert.equal(classifyStartupLine(coloredSql).schemaWrite, true);
});
test('pseudo-route lines carrying SQL or exception payloads still hold', () => {
  const pseudoRoutes = [
    '[RouterExplorer] Mapped {/api/x, DELETE} INSERT INTO secrets VALUES (1)',
    '[RouterExplorer] Mapped {/api/x, POST} DELETE FROM audit_log WHERE true',
    '[RouterExplorer] Mapped {INSERT INTO logs SELECT 1, DELETE}',
    '[RouterExplorer] Mapped {/api/x, GET} Error: connect ECONNREFUSED 127.0.0.1:5432',
    '[RouterExplorer] Mapped {/api/x, PUT} [ExceptionHandler] dependency injection failed',
    '[RoutesResolver] SysErrorLogsController {/api/system/error-logs} DROP TABLE audit_log',
    '[RoutesResolver] Attacker {/api/x}: UPDATE settings SET flag = true WHERE id = 1',
    '[RouterExplorer] Mapped {/api/x, DELETE} route TRUNCATE TABLE inv_batches',
    '[RoutesResolver] SysErrorLogsController, {/api/system/error-logs}: DROP TABLE audit_log',
    '[RoutesResolver] SysErrorLogsController {/api/system/error-logs}: +12ms DELETE FROM sessions',
    '[RoutesResolver] Attacker, {/api/x}: +1ms [ExceptionHandler] injection failed',
  ];
  for (const line of pseudoRoutes) {
    const verdict = classifyStartupLine(`2026-10-10T06:43:19.000000000Z ${line}`);
    assert.equal(verdict.schemaWrite || verdict.error, true, line);
  }
  assert.equal(classifyStartupLine('2026-10-10T06:43:19.000000000Z [RouterExplorer] Mapped {/api/x, DELETE} INSERT INTO secrets VALUES (1)').schemaWrite, true);
  assert.equal(classifyStartupLine('2026-10-10T06:43:19.000000000Z [RouterExplorer] Mapped {/api/x, GET} Error: connect ECONNREFUSED 127.0.0.1:5432').error, true);
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

// ── R0 collector digest parity streams: masking-immune digest transport ──
const paritySplit = value => {
  const chars = [...String(value ?? '')];
  return { digestOdd: chars.filter((_, index) => index % 2 === 1).join(''), digestEven: chars.filter((_, index) => index % 2 === 0).join('') };
};
const parityRecombine = ({ digestOdd, digestEven }) => [...digestEven].flatMap((char, index) => index < digestOdd.length ? [char, digestOdd[index]] : [char]).join('');
test('collector emits digestOdd/digestEven alongside digestA/digestB and they recombine exactly', () => {
  const collector = fs.readFileSync('scripts/ops/readonly-production-evidence.mjs', 'utf8');
  assert.match(collector, /digestOdd:/); assert.match(collector, /digestEven:/);
  assert.match(collector, /digestA:/); assert.match(collector, /digestB:/);
  for (const digest of ['a44e8b582ab11e3d0' + '9f' + '4b190c5b0588f327d7e839a778eff72c0f1c386dbfbc3', '0'.repeat(64), 'deadbeef'.repeat(8)]) {
    const split = paritySplit(digest);
    assert.equal(split.digestOdd.length, 32); assert.equal(split.digestEven.length, 32);
    assert.equal(parityRecombine(split), digest);
  }
});
test('parity streams structurally separate every adjacent digest character pair', () => {
  // The provable property: characters at adjacent positions (i, i+1) of the
  // digest are NEVER adjacent within the same stream — any contiguous secret
  // substring of length >= 2 is therefore split across the two streams.
  // String-level coincidences (a stream accidentally containing the same
  // 2-char text from non-adjacent positions) cannot be excluded a priori;
  // recovery detects them because receipt digest is compared against the
  // unmasked on-disk value, and the streams are validated as exact hex32.
  const digest = 'a44e8b582ab11e3d0' + '9f' + '4b190c5b0588f327d7e839a778eff72c0f1c386dbfbc3';
  for (const [name, indices] of [['odd', [...digest].map((_, i) => i).filter(i => i % 2 === 1)], ['even', [...digest].map((_, i) => i).filter(i => i % 2 === 0)]]) {
    for (let k = 0; k + 1 < indices.length; k++) assert.notEqual(indices[k + 1] - indices[k], 1, `${name} stream has adjacent digest positions`);
  }
  // the stage-A masked span (positions 17-18) lands in different streams
  assert.equal(17 % 2, 1); assert.equal(18 % 2, 0);
  // and the specific masked secret text, whatever it is, occupied adjacent
  // positions — verify with the fixture hole for a sample of candidates
  for (const secret of ['9f', 'ab', '0c']) {
    const withSecret = 'a44e8b582ab11e3d0' + secret + '4b190c5b0588f327d7e839a778eff72c0f1c386dbfbc3';
    const split = paritySplit(withSecret);
    // the secret's two characters sit at indices 17/18 → odd-stream idx 8 and
    // even-stream idx 9 → never adjacent in one stream; string coincidence is
    // detectable post-hoc via the exact-hex32 validation
    assert.equal(split.digestOdd.length, 32); assert.equal(split.digestEven.length, 32);
    assert.equal(parityRecombine(split), withSecret);
  }
});

test('parity transport keeps the existing evidence sanitization contract untouched', () => {
  const collector = fs.readFileSync('scripts/ops/readonly-production-evidence.mjs', 'utf8');
  assert.match(collector, /raw line content/i);            // sanitization contract comment retained
  assert.equal(collector.includes('combinedDigest: startup.combinedDigest'), true);
  assert.equal(collector.includes('persistSnapshot'), false, 'collector must stay zero-write on production');
});


// R0 diagnostics do not authorize recovery. These tests compare unmasked
// fixture state before any display masking, and execute the stdin collector
// against isolated read-only command/host admission shims.
const frozen = M12_MATERIAL_TRANSACTION;
function materialFixture() {
  const oldApi = { imageId: image('c'), revision: frozen.previousFloorSha }, web = { imageId: image('b'), revision: 'b'.repeat(40) };
  const candidate = { imageId: image('a'), revision: frozen.targetSha }, previous = { api: oldApi, web };
  const pin = content => ({ exists: true, pinned: true, content });
  const meta = (name, value) => ({ service: name, container: `phoenix-v3-${name}`, id: (name==='api'?'1':'2').repeat(64),
    created: '2026-10-12T00:00:00Z', startedAt: '2026-10-12T00:00:01Z', image: value.imageId, ociRevision: value.revision,
    running: true, health: 'healthy', restartCount: 0, mounts: [] });
  const after = meta('api', candidate), before = { ...meta('api', oldApi), id:'3'.repeat(64) }, webMeta = meta('web', web);
  const dbMeta = { ...webMeta, service:'db',container:'phoenix-v3-db',id:'4'.repeat(64),image:image('d'),ociRevision:null };
  const snapshot = (phase,api) => ({ schema:evidenceLibrary.EVIDENCE_SCHEMA,phase,deployRunId:frozen.runId,deployRunAttempt:1,
    targetSha:frozen.targetSha,configFloorSha:frozen.targetSha,capturedAt:'2026-10-12T00:00:04Z',containers:{api,web:webMeta,db:dbMeta} });
  const pre=snapshot('PRE_SNAPSHOT',before), post=snapshot('POST_SNAPSHOT',after);
  const streams={stdout:'2026-10-12T00:00:02Z API_BOOTSTRAP_SCHEMA_COMPATIBILITY=PASS\n',stderr:'2026-10-12T00:00:03Z warning fixture\n'};
  const startup=summarizeStartupLogs({ ...streams,containerId:after.id,startedAt:after.startedAt,capturedAt:'2026-10-12T00:00:04Z',runId:frozen.runId,runAttempt:1,targetSha:frozen.targetSha,floorSha:frozen.targetSha,readinessVerified:true });
  const out={binding:{runId:frozen.runId,targetSha:frozen.targetSha},checkout:{head:frozen.targetSha,branch:'main',clean:true},containers:{api:after,web:webMeta,db:dbMeta},stateFiles:{
    'floor.json':pin({version:3,phase:'READY',floorSha:frozen.targetSha,chanjetPolicy:'HOLD',readonlyApproval:null,operationalTuple:{CHANJET_READONLY_SYNC_ENABLED:'false',CHANJET_ERP_INBOUND_SYNC_ENABLED:'false'}}),
    'active.json':pin({version:3,configSha:frozen.targetSha,floorSha:frozen.targetSha,outcome:'CONFIG_READY_HOLD',active:previous,migrationBaseline:frozen.previousFloorSha}),
    'transaction.json':pin({version:3,runId:frozen.runId,phase:'IN_PROGRESS',target:frozen.targetSha,configSha:frozen.targetSha}),
    'policy-transition.json':pin({version:3,operation:'CODE_HOLD',phase:'IN_PROGRESS',runId:frozen.runId,target:frozen.targetSha,previousFloorSha:frozen.previousFloorSha,previous,candidateApi:candidate,startedAt:'2026-10-12T00:00:00Z',expiresAt:'2026-10-12T00:30:00Z',nextEnv:{CHANJET_SYNC_POLICY:'HOLD'}}),
    [`deploy-${frozen.runId}.json`]:pin({version:3,outcome:'SWITCHING',target:frozen.targetSha,configSha:frozen.targetSha,floorSha:frozen.targetSha,previous,active:{api:candidate,web},candidates:{api:candidate},switched:{api:true,web:false},migrationBaseline:frozen.previousFloorSha,migrationPaths:[],protectedImages:[oldApi.imageId,web.imageId,candidate.imageId],expiresAt:'2026-10-12T00:30:00Z'}),
    [`deploy-${frozen.runId}-pre-evidence.json`]:pin(pre),[`deploy-${frozen.runId}-post-evidence.json`]:pin(post),[`deploy-${frozen.runId}-startup-evidence.json`]:pin(startup),
  }};
  return {out,pre,post,startup,streams};
}
const diagnosticReplay = x => replayWindowDiagnostics({...x.streams,startup:x.startup,post:x.post,binding:x.out.binding,readinessVerified:true},evidenceLibrary);

test('collector freeze and whole-window SQL regex equal PR395 recovery definitions',()=>{
  assert.deepEqual(M12_MATERIAL_TRANSACTION,COMPLETE_ABORT_TRANSACTION);
  const recovery=fs.readFileSync('scripts/ops/production-deployment-recovery.mjs','utf8');
  const literal=recovery.match(/const sqlShapePattern = (\/[^\n]+\/i);/)[1];
  assert.equal(REPLAY_SQL_SHAPE_PATTERN.toString(),literal);
  const contract=JSON.parse(fs.readFileSync('scripts/ops/production-config-contract.json'));
  assert.equal(contract.criticalFiles.includes('scripts/ops/readonly-production-evidence.mjs'),false);
});
test('frozen identity reports only booleans; complete exact tuple passes before display masking',()=>{
  const fixture=materialFixture(), verdict=frozenM12Identity(fixture.out);
  assert.equal(verdict.available,true);assert.equal(verdict.allIdentityChecksPass,true);
  assert.equal(verdict.scope,'FROZEN_TRANSACTION_IDENTITY_ONLY');assert.equal(verdict.diagnosticOnly,true);assert.equal('allChecksPass' in verdict,false);
  assert.ok(Object.values(verdict.checks).every(v=>typeof v==='boolean'));
  assert.equal(JSON.stringify(verdict).includes(frozen.previousFloorSha),false);
});
test('frozen identity refuses missing/unpinned state, wrong histories and incomplete/mismatched pins',()=>{
  const cases=[
    o=>delete o.stateFiles['policy-transition.json'],o=>o.stateFiles['policy-transition.json'].pinned=false,
    o=>o.stateFiles['policy-transition.json'].content.previousFloorSha='a'.repeat(40),
    o=>o.stateFiles[`deploy-${frozen.runId}.json`].content.migrationBaseline='a'.repeat(40),
    o=>o.stateFiles['policy-transition.json'].content.previous.api.revision='a'.repeat(40),
    o=>o.stateFiles[`deploy-${frozen.runId}.json`].content.previous.api.revision='a'.repeat(40),
    o=>o.stateFiles['active.json'].content.active.api.revision='a'.repeat(40),
    o=>o.stateFiles['active.json'].content.configSha='a'.repeat(40),
    o=>o.stateFiles[`deploy-${frozen.runId}-pre-evidence.json`].content.containers.api.ociRevision='a'.repeat(40),
    o=>delete o.stateFiles['policy-transition.json'].content.previous.api.imageId,
    o=>o.stateFiles['policy-transition.json'].content.previous.web.imageId=image('e'),
    o=>o.stateFiles['policy-transition.json'].content.candidateApi.imageId=image('e'),
    o=>o.stateFiles['transaction.json'].content.runId='99-1',o=>o.binding.targetSha='a'.repeat(40),
    o=>{delete o.stateFiles['active.json'].content.active.api.revision;delete o.stateFiles[`deploy-${frozen.runId}.json`].content.previous.api.revision;},
    o=>{o.containers.api.id='';o.stateFiles[`deploy-${frozen.runId}-post-evidence.json`].content.containers.api.id='';},
  ];
  for(const mutate of cases){const out=JSON.parse(JSON.stringify(materialFixture().out));mutate(out);assert.equal(frozenM12Identity(out).allIdentityChecksPass,false);}
});
test('whole-window GRANT/REVOKE are counted independently in both streams after ANSI removal',async()=>{
  const x=materialFixture();x.streams={stdout:'2026-10-12T00:00:02Z API_BOOTSTRAP_SCHEMA_COMPATIBILITY=PASS\n2026-10-12T00:00:03Z GRANT SELECT ON fixture TO fixture\n',stderr:'2026-10-12T00:00:03Z RE\u001b[31mVO\u001b[0mKE SELECT ON fixture FROM fixture\n'};
  x.startup=summarizeStartupLogs({...x.streams,containerId:x.post.containers.api.id,startedAt:x.post.containers.api.startedAt,capturedAt:'2026-10-12T00:00:04Z',runId:frozen.runId,runAttempt:1,targetSha:frozen.targetSha,floorSha:frozen.targetSha,readinessVerified:true});
  assert.equal(x.startup.schemaWriteSignalCount,0);assert.equal(x.startup.errorSignalCount,0);
  const d=diagnosticReplay(x);assert.equal(d.windowVerified,true);assert.equal(d.sqlShapeCount,2);assert.equal(d.sqlShapeZero,false);assert.equal(d.sqlShapeCheckedLineCount,3);assert.equal(d.replaySummaryVerified,true);
  const recovery=await replayStartupWindow({post:x.post,startup:x.startup},()=>x.streams);assert.equal(d.sqlShapeCount,recovery.sqlShapeCount);
});
test('replay window, digest, counts and binding diagnostics reject malformed or incomplete evidence',()=>{
  const x=materialFixture();const good=diagnosticReplay(x);assert.equal(good.windowVerified,true);assert.equal(good.sqlShapeZero,true);assert.equal(good.digestMatchesPersisted,true);assert.equal(good.lineCountsMatchPersisted,true);assert.equal(good.replaySummaryVerified,true);
  for(const mutate of [y=>delete y.startup.startedAt,y=>y.streams.stderr='no timestamp',y=>y.streams.stdout='2026-10-12T00:00:00Z outside window',y=>y.out.binding.runId='99-1',y=>{delete y.out.binding.targetSha;delete y.startup.targetSha;delete y.post.targetSha;delete y.startup.configFloorSha;delete y.post.configFloorSha;}]){const y=structuredClone(x);mutate(y);const d=diagnosticReplay(y);assert.equal(d.windowVerified,false);assert.equal(d.sqlShapeZero,false);}
  const bad=structuredClone(x);delete bad.startup.stdoutLineCount;bad.startup.combinedDigest='0'.repeat(64);const d=diagnosticReplay(bad);assert.equal(d.digestMatchesPersisted,false);assert.equal(d.lineCountsMatchPersisted,false);
  const large=structuredClone(x);large.streams.stdout='x'.repeat(MAX_LOG_BYTES+1);assert.equal(diagnosticReplay(large).windowVerified,false);
});

function collectorSubprocess(t, { sqlOnly=false, missingState=false }={}) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'readonly-collector-fixture-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const ops=path.join(dir,'scripts/ops'),state=path.join(dir,'state'),bin=path.join(dir,'bin');for(const d of [ops,state,bin])fs.mkdirSync(d,{recursive:true});
  const fixture=materialFixture();
  if(sqlOnly){fixture.streams={stdout:'2026-10-12T00:00:02Z API_BOOTSTRAP_SCHEMA_COMPATIBILITY=PASS\n2026-10-12T00:00:03Z GRANT SELECT ON fixture TO fixture\n',stderr:'2026-10-12T00:00:03Z RE\u001b[31mVO\u001b[0mKE SELECT ON fixture FROM fixture\n'};fixture.startup=summarizeStartupLogs({...fixture.streams,containerId:fixture.post.containers.api.id,startedAt:fixture.post.containers.api.startedAt,capturedAt:'2026-10-12T00:00:04Z',runId:frozen.runId,runAttempt:1,targetSha:frozen.targetSha,floorSha:frozen.targetSha,readinessVerified:true});}
  else fixture.streams.stderr+='2026-10-12T00:00:03Z token SENSITIVE_FIXTURE_NEVER_OUTPUT\n';
  if(!sqlOnly){fixture.startup=summarizeStartupLogs({...fixture.streams,containerId:fixture.post.containers.api.id,startedAt:fixture.post.containers.api.startedAt,capturedAt:'2026-10-12T00:00:04Z',runId:frozen.runId,runAttempt:1,targetSha:frozen.targetSha,floorSha:frozen.targetSha,readinessVerified:true});}
  fixture.out.stateFiles[`deploy-${frozen.runId}-startup-evidence.json`].content=fixture.startup;
  for(const [name,entry]of Object.entries(fixture.out.stateFiles))if(!(missingState&&name==='policy-transition.json'))fs.writeFileSync(path.join(state,name),JSON.stringify(entry.content),{mode:0o600});
  // Copy import closure for installed evidence; root/mount admission is an
  // explicit local shim. Docker/git/curl accept read-only commands only.
  for(const name of ['production-deployment-evidence.mjs','production-atomic-state.mjs','production-config-guard.mjs','production-trusted-paths.mjs','capture-production-runtime.mjs','update-managed-chanjet-env.mjs','chanjet-readonly-policy.mjs'])fs.copyFileSync(path.join('scripts/ops',name),path.join(ops,name));
  fs.renameSync(path.join(ops,'production-trusted-paths.mjs'),path.join(ops,'real-trusted.mjs'));
  fs.writeFileSync(path.join(ops,'production-trusted-paths.mjs'),`export * from './real-trusted.mjs'; import fs from 'node:fs';export const assertRootIdentity=()=>{};export const inspectTrustedDirectory=()=>[];export const readPinnedFile=f=>fs.readFileSync(f);`);
  const contract=JSON.parse(fs.readFileSync('scripts/ops/production-config-contract.json'));contract.stateDirectory=state;fs.writeFileSync(path.join(ops,'production-config-contract.json'),JSON.stringify(contract));
  fs.mkdirSync(path.join(ops,'readonly-audits'));fs.writeFileSync(path.join(ops,'readonly-audits/chanjet-restoration-preflight.sql'),'SELECT fixture;');
  fs.writeFileSync(path.join(bin,'data.json'),JSON.stringify({fixture,db:{mirrorRows:11,entityRows:22,arSnapshotRows:3,runningJobs:0,queuedJobs:0,writebackPending:0,wmsWritebackPending:0,remoteWriteAttempts:0,wmsRemoteWriteAttempts:0,inboundRuns:0}}));
  fs.writeFileSync(path.join(bin,'shim.mjs'),`import fs from 'node:fs';const x=JSON.parse(fs.readFileSync(new URL('./data.json',import.meta.url)));const [tool,...a]=process.argv.slice(2);if(tool==='git'){if(a.includes('rev-parse'))console.log(x.fixture.out.checkout.head);else if(a.includes('branch'))console.log('main');else if(a.includes('status'))console.log('');else process.exit(99);}else if(tool==='curl')console.log('200');else if(a[0]==='inspect'){if(a[3]==='{{json .Config.Env}}')console.log(JSON.stringify(['CHANJET_SYNC_POLICY=HOLD','CHANJET_READONLY_SYNC_ENABLED=false','CHANJET_ERP_INBOUND_SYNC_ENABLED=false','CHANJET_READONLY_APPROVAL=']));else {const m=x.fixture.out.containers[a[1].replace('phoenix-v3-','')];console.log([m.id,m.created,m.image,{StartedAt:m.startedAt,Running:m.running,Health:{Status:m.health}},m.restartCount,m.mounts].map(JSON.stringify).join('\\t'));}}else if(a[0]==='image'&&a[1]==='inspect'){const m=Object.values(x.fixture.out.containers).find(v=>v.image===a[2]);console.log(JSON.stringify(m.ociRevision?{'org.opencontainers.image.revision':m.ociRevision}:{}));}else if(a[0]==='logs'){process.stdout.write(x.fixture.streams.stdout);process.stderr.write(x.fixture.streams.stderr);}else if(a[0]==='exec'&&a.includes('PGOPTIONS=-c default_transaction_read_only=on')){const s=fs.readFileSync(0,'utf8');if(!s.startsWith('BEGIN READ ONLY;')||!s.trim().endsWith('ROLLBACK;'))process.exit(98);console.log(JSON.stringify(x.db));}else process.exit(99);`);
  for(const name of ['git','docker','curl'])fs.writeFileSync(path.join(bin,name),`#!/bin/sh\nexec '${process.execPath}' '${path.join(bin,'shim.mjs')}' '${name}' "$@"\n`,{mode:0o700});
  const before=Object.fromEntries(fs.readdirSync(state).map(n=>[n,fs.readFileSync(path.join(state,n),'utf8')]));
  const source=fs.readFileSync('scripts/ops/readonly-production-evidence.mjs','utf8').replace("PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'",`PATH: ${JSON.stringify(bin)}`);
  const result=spawnSync(process.execPath,['--input-type=module','-'],{cwd:dir,input:source,encoding:'utf8',timeout:10000,maxBuffer:4*1024*1024,env:{PATH:`${bin}:/usr/bin:/bin`,R0_ROOT:dir,R0_DEPLOY_RUN_ID:frozen.runId,R0_TARGET_SHA:frozen.targetSha}});
  assert.equal(result.status,0,result.stderr);assert.deepEqual(fs.readdirSync(state).sort(),Object.keys(before).sort());for(const[n,bytes]of Object.entries(before))assert.equal(fs.readFileSync(path.join(state,n),'utf8'),bytes);
  assert.doesNotMatch(result.stdout,/SENSITIVE_FIXTURE_NEVER_OUTPUT/);
  const summaryLine=result.stdout.split('\n').find(l=>l.startsWith('R0_SUMMARY='));assert.ok(summaryLine);const summary=JSON.parse(summaryLine.slice(11));
  return summary;
}
test('stdin collector wires mask-resistant identities and bounded replay into R0_SUMMARY without state writes',t=>{
  const s=collectorSubprocess(t);assert.deepEqual(s.errors,[]);assert.equal(s.m12FrozenIdentity.allIdentityChecksPass,true);assert.equal(s.startupReplayVerdict.windowVerified,true);assert.equal(s.startupReplayVerdict.sqlShapeCount,0);assert.equal(s.startupReplayVerdict.sqlShapeZero,true);assert.equal(s.startupReplayVerdict.digestMatchesPersisted,true);assert.equal(s.startupReplayVerdict.lineCountsMatchPersisted,true);
});
test('stdin collector summary detects SQL-only signals despite legacy schema/error counts zero',t=>{
  const s=collectorSubprocess(t,{sqlOnly:true});assert.equal(s.startupPersisted.result,'PASS_REDACTED_SUMMARY');assert.equal(s.startupReplayVerdict.sqlShapeCount,2);assert.equal(s.startupReplayVerdict.sqlShapeZero,false);assert.equal(s.startupReplayVerdict.schemaWriteSignalCountReplayed,0);assert.deepEqual(s.startupReplayVerdict.errorLines,[]);
});
test('stdin collector missing pinned state cannot produce a passing identity verdict',t=>{
  const s=collectorSubprocess(t,{missingState:true});assert.equal(s.m12FrozenIdentity.available,false);assert.equal(s.m12FrozenIdentity.allIdentityChecksPass,false);
});
