/** Actual old Git source startup, not a drain/fence or production receipt. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { OwnedErpCandidateCapsule } from './maintenance-erp-candidate.fixture.mjs';
import { capturedDatabaseStatements, classifySql } from './api-bootstrap-mutations.mjs';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const OLD = '226878864f184d26f41a890e666ebed52547db14';
const loadedHelperSha256 = createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex');
const requireUnchangedHelper = () => assert.equal(createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex'), loadedHelperSha256, 'Loaded helper source changed');
const DB = 'api_bootstrap_fixture';
export function legacyStopBudget(timeoutMs, clock = () => performance.now()) {
  assert.ok(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 60000);
  const start = clock(); let last = start;
  return () => {
    const now = clock();
    if (!Number.isFinite(start) || !Number.isFinite(now) || now < last) throw Error('OWNED_LEGACY_STOP_CLOCK_HOLD');
    last = now; const remaining = Math.floor(timeoutMs - (now - start));
    if (remaining < 1) throw Error('OWNED_LEGACY_STOP_DEADLINE_HOLD');
    return remaining;
  };
}
export function requireOldSourceCapsule(capsule) {
  assert.equal(capsule.sourceSha, OLD);
  assert.equal(capsule.legacySourcePlan?.sourceSha, OLD);
  assert.equal(capsule.legacySourcePlan?.productionAuthorized, false);
  assert.match(capsule.imageId || '', /^sha256:[a-f0-9]{64}$/);
  return true;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const major = Number(process.env.LEGACY_PG_MAJOR);
  assert.ok([16, 18].includes(major), 'Explicit isolated PG major required');
  const capsule = new OwnedErpCandidateCapsule({ owner: `${Date.now()}-${process.pid}` });
  try {
    await capsule.build({ legacySourceSha: OLD });
    const result = await exerciseLegacyStartupOnly(capsule, major);
    console.log(JSON.stringify({ result: result.result, sourceSha: OLD, owner: capsule.owner, evidenceDirectory: capsule.root,
      legacyDrainResult: 'UNSUPPORTED', schedulingSafety: 'NOT_PROVED', productionReceipt: false }));
  } catch {
    capsule.record({ outcome: 'HOLD', legacyCreationAttempt: capsule.legacyCreationAttempt || null, requiresOwnedResourceRecovery: true });
    console.error(`OWNED_LEGACY_STARTUP_HOLD evidence=${capsule.root}`); process.exitCode = 1;
  }
}
export async function startReadonlyLegacy(capsule, pg, register = () => {}) {
  const remaining = legacyStopBudget(45000); requireOldSourceCapsule(capsule);
  const candidate = { pg, mode: 'LEGACY_UNSUPPORTED', captureApp: `erp-legacy-${pg.major}-${randomUUID()}` };
  const env = { NODE_ENV: 'production', APP_ENV: 'production', PORT: '3100', DB_HOST: 'fixture-db', DB_PORT: '5432', DB_USER: 'erp_candidate_readonly', DB_NAME: DB,
    DB_PASSWORD: '', JWT_SECRET: 'owned-erp-legacy-fixture-only-at-least-32-characters', CHANJET_SYNC_POLICY: 'HOLD',
    CHANJET_READONLY_SYNC_ENABLED: 'false', CHANJET_ERP_INBOUND_SYNC_ENABLED: 'false', CHANJET_APP_KEY: 'owned-fixture-app-key',
    CHANJET_APP_SECRET: 'owned-fixture-app-secret', CHANJET_PROVIDER_BASE_URL: 'http://127.0.0.1:3099',
    ERP_CANDIDATE_FIXTURE: capsule.owner, ERP_CAPTURE_APP: candidate.captureApp };
  const creation = { name: `phoenix-legacy-${capsule.owner}-pg${pg.major}`, state: 'CREATE_OUTCOME_UNVERIFIED', id: null };
  capsule.legacyCreationAttempt = creation; capsule.record({ legacyCreationAttempt: creation });
  const createdId = capsule.docker(['run', '--name', creation.name, '--pull=never', '-d', ...capsule.labels(), '--network', pg.networkId, '--restart=no', '--read-only', '--cap-drop=ALL',
    '--security-opt=no-new-privileges', '--publish', '127.0.0.1::3100', '--tmpfs', '/tmp:rw,nosuid,nodev,size=16777216,mode=1777',
    '--tmpfs', '/app/uploads:rw,nosuid,nodev,size=16777216,uid=1000,gid=1000',
    ...Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`]), capsule.imageId], {timeout:Math.min(30000,remaining())});
  creation.id = createdId; capsule.record({ legacyCreationAttempt: creation });
  candidate.id = createdId; register(candidate);
  capsule.own(createdId, `pg${pg.major}-actual-legacy-readonly`);
  creation.state = 'OWNED_ID_VERIFIED'; candidate.ownedVerified = true; capsule.record({ legacyCreationAttempt: creation });
  while (true) {
    const runtime = capsule.inspectContainer(candidate.id,{timeoutMs:Math.min(30000,remaining())}); remaining();
    if (!runtime.State.Running) throw Error('OWNED_LEGACY_STARTUP_HOLD');
    try {
      const response = capsule.request(candidate, '/api/readiness',{timeoutMs:Math.min(30000,remaining())}); remaining();
      if (response.status === 200 && response.body?.status === 'READY' && response.body?.db === 'connected' && runtime.State.Health?.Status === 'healthy') {
        candidate.readiness = response; break;
      }
    } catch { /* Readiness is observed, never replaced. */ }
    await sleep(Math.min(200,remaining()));
  }
  const runtime = capsule.inspectContainer(candidate.id,{timeoutMs:Math.min(30000,remaining())}); remaining();
  assert.equal(runtime.Image, capsule.imageId); assert.equal(runtime.Config.Labels['org.opencontainers.image.revision'], OLD);
  assert.equal(runtime.RestartCount, 0);
  assert.equal(runtime.Mounts.some(m => m.Destination === '/run/phoenix-background-control'), false);
  // Old API must not be described as supporting the candidate control protocol.
  const unsupported = capsule.request(candidate, '/api/internal/background/status',{timeoutMs:Math.min(30000,remaining())}); remaining();
  assert.equal(unsupported.status, 404);
  return candidate;
}
export async function stopOwnedLegacy(capsule, candidate) {
  const remaining = legacyStopBudget(15000);
  requireOldSourceCapsule(capsule);
  assert.match(candidate.captureApp || '', /^erp-legacy-(16|18)-[a-f0-9-]{36}$/);
  const before = capsule.inspectContainer(candidate.id, { timeoutMs: remaining() });
  assert.equal(before.Image, capsule.imageId);
  assert.equal(before.Config.Labels['org.opencontainers.image.revision'], OLD);
  assert.equal(before.State.Running, true);
  assert.notEqual(candidate.stopRequested, true, 'No repeated stop attempt');
  candidate.stopRequested = true;
  capsule.legacyStopAttempt={id:candidate.id,signal:'SIGTERM',state:'REQUEST_OUTCOME_UNVERIFIED'};capsule.record();
  capsule.docker(['kill', '--signal', 'SIGTERM', candidate.id], { timeout: remaining() });
  capsule.legacyStopAttempt.state='SIGNAL_SENT';capsule.record();
  let stopped;
  do {
    stopped = capsule.inspectContainer(candidate.id, { timeoutMs: remaining() }); remaining();
    if (!stopped.State.Running) break;
    await sleep(Math.min(100, remaining()));
  } while (true);
  assert.equal(stopped.State.OOMKilled, false); assert.equal(stopped.RestartCount, 0);
  assert.ok([0, 143].includes(stopped.State.ExitCode));
  capsule.inspectContainer(candidate.pg.id, { timeoutMs: remaining() });
  const backendCount = Number(capsule.docker(['exec', '-i', candidate.pg.id, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'erp_fixture_admin', '-d', DB],
    { input: `SELECT count(*) FROM pg_stat_activity WHERE application_name='${candidate.captureApp}';`, timeout: remaining() }));
  remaining(); assert.equal(backendCount, 0);
  capsule.legacyStopAttempt.state='STOPPED_VERIFIED';capsule.record();
  remaining(); return { originalId: candidate.id, stopped: true, exitCode: stopped.State.ExitCode, remainingApplicationBackends: backendCount,
    signal: 'SIGTERM', forceKill: false, legacyDrainResult: 'UNSUPPORTED', productionReceipt: false };
}
export async function exerciseLegacyStartupOnly(capsule, major) {
  requireUnchangedHelper(); requireOldSourceCapsule(capsule);
  let candidate, pg;
  try {
  pg = await capsule.startPostgres(major); const before = capsule.fingerprint(pg);
  capsule.legacyObservation={stage:'PRE_START',pgMajor:major,pgId:pg.id,fingerprintBefore:before};capsule.record();
  // The real RO role rejects writes even though the fixture also has a writer.
  assert.equal(capsule.sql(pg, 'SHOW transaction_read_only;', { role: 'erp_candidate_readonly' }), 'on');
  candidate = await startReadonlyLegacy(capsule, pg, value => { candidate = value; });
  const after = capsule.fingerprint(pg);capsule.legacyObservation={...capsule.legacyObservation,stage:'READY',fingerprintAfter:after};capsule.record();assert.deepEqual(after, before);
  // Select only the three allowed non-secret values inside the container.
  capsule.legacyObservation.stage='FLAGS_VERIFY';capsule.record();
  const flags = JSON.parse(capsule.docker(['exec', candidate.id, 'node', '-e', "console.log(JSON.stringify({policy:process.env.CHANJET_SYNC_POLICY,readonly:process.env.CHANJET_READONLY_SYNC_ENABLED,inbound:process.env.CHANJET_ERP_INBOUND_SYNC_ENABLED}))"]));
  assert.deepEqual(flags, { policy: 'HOLD', readonly: 'false', inbound: 'false' });
  // Copy events before stop because the API has a read-only root and a tmpfs.
  // This is explicitly an observation prefix, not a complete shutdown trace.
  capsule.legacyObservation.stage='NETWORK_PREFIX';capsule.record();
  const networkEventsBeforeStop = capsule.network(candidate);
  capsule.legacyObservation.stage='API_STOP';capsule.record();
  const stop = await stopOwnedLegacy(capsule, candidate);
  capsule.legacyObservation.stage='POST_STOP_LOGS';capsule.record();
  const startupLog = capsule.logs(candidate.id), startupLogSha256 = createHash('sha256').update(startupLog).digest('hex');
  fs.writeFileSync(path.join(capsule.root, `pg${major}-legacy-startup-and-stop.log`), startupLog, { mode: 0o600, flag: 'wx' });
  const sql = capturedDatabaseStatements(capsule.logs(pg.id), DB).filter(r => r.app === candidate.captureApp)
    .map(r => ({ kind: classifySql(r.sql, r.controlParameters), sourceLevel: r.sourceLevel, sqlSha256: createHash('sha256').update(r.sql).digest('hex') }));
  assert.deepEqual(capsule.fingerprint(pg), before);
  capsule.legacyObservation.stage='PG_STOP';capsule.record();
  const pgRemaining = legacyStopBudget(30000);
  const db = capsule.inspectContainer(pg.id, { timeoutMs: pgRemaining() }); assert.equal(db.State.Running, true);
  assert.equal(capsule.legacyPgStopAttempt, undefined, 'No repeated PG stop attempt');
  capsule.legacyPgStopAttempt={id:pg.id,signal:'SIGTERM',state:'REQUEST_OUTCOME_UNVERIFIED'};capsule.record();
  capsule.docker(['kill', '--signal', 'SIGTERM', pg.id], { timeout: pgRemaining() });
  capsule.legacyPgStopAttempt.state='SIGNAL_SENT';capsule.record(); let dbStopped;
  do {
    dbStopped = capsule.inspectContainer(pg.id, { timeoutMs: pgRemaining() }); pgRemaining(); if (!dbStopped.State.Running) break;
    await sleep(Math.min(100, pgRemaining()));
  } while (true);
  assert.equal(dbStopped.State.ExitCode, 0); assert.equal(dbStopped.State.OOMKilled, false);
  pgRemaining();capsule.legacyPgStopAttempt.state='STOPPED_VERIFIED';capsule.record();pgRemaining();
  requireUnchangedHelper();
  const result = { schema: 'phoenix.owned-legacy-startup-only/v1', result: 'PASS_STARTUP_ONLY', owner: capsule.owner,
    sourceSha: capsule.sourceSha, imageId: capsule.imageId, fixtureHelperSha256: loadedHelperSha256, pgMajor: major, apiId: candidate.id, dbId: pg.id,
    readiness: candidate.readiness, fingerprintBefore: before, fingerprintAfter: after, networkEventsBeforeStop,
    networkObservation: 'PRE_STOP_PREFIX_ONLY_SHUTDOWN_EVENTS_NOT_COLLECTED', startupLogSha256, capturedSql: sql, chanjetFlags: flags, stop,
    installedDependencyVerification: 'NOT_RUN_EXISTING_MODULES_NOT_CERTIFIED', legacyDrainResult: 'UNSUPPORTED',
    schedulingSafety: 'NOT_PROVED', transitionWindow: 'NOT_RUN', factoryInstalled: false, productionReceipt: false };
  fs.writeFileSync(path.join(capsule.root, `pg${major}-legacy-startup-only.json`), JSON.stringify(result, null, 2), { mode: 0o600, flag: 'wx' });
  capsule.results.push(result); capsule.record(); return result;
  } catch (error) {
    let privateDiagnosticWriteFailed = false;
    try { fs.writeFileSync(path.join(capsule.root,'private-failure.log'),String(error.stack || error),{mode:0o600}); }
    catch { privateDiagnosticWriteFailed = true; }
    const failureClass=/^[A-Z0-9_]+$/.test(error.message || '')?error.message:error.code==='ERR_ASSERTION'?'ASSERTION_FAILED':'UNCLASSIFIED_PRIVATE_LOG';
    // Preserve the original identities and failure; no retry, forced kill,
    // marker deletion or assertion of successful cleanup on an unknown path.
    const failureOrigin=String(error.stack || '').match(/maintenance-legacy-api\.fixture\.mjs:(\d+):(\d+)/);
    capsule.legacyObservation={...capsule.legacyObservation,failedStage:capsule.legacyObservation?.stage || 'UNREGISTERED',stage:'HOLD',failureClass,privateDiagnosticWriteFailed, failureOrigin:failureOrigin?failureOrigin.slice(1).join(':'):null};
    capsule.record({ outcome: 'HOLD', stage: 'LEGACY_STARTUP_ONLY', pgMajor: major, failureClass,privateDiagnosticWriteFailed,
      ownedLegacyId: candidate?.ownedVerified === true ? candidate.id : null, legacyCreationAttempt: capsule.legacyCreationAttempt || null, ownedPgId: pg?.id || null,
      stopRequested: candidate?.stopRequested === true, requiresOwnedResourceRecovery: true });
    throw error;
  }
}
