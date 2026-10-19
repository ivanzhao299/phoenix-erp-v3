import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { CONTRACT } from './production-config-guard.mjs';
import { bootstrapSchemaRequirements } from './api-bootstrap-schema-preflight.mjs';
import { promoteLegacyMaintenanceFloor } from './promote-production-config-floor.mjs';
import { assertLegacyMaintenanceStateCore, beginLegacyMaintenanceDeployment, recordLegacyMaintenanceCandidate,
  switchLegacyMaintenanceDeployment, completeLegacyMaintenanceDeployment } from './production-deployment-state.mjs';
import { MaintenanceReceiptStore, createMaintenanceEvidence, bindingDigest, canonicalDigest, MAINTENANCE_AUTHORITY_SCHEMA } from './production-maintenance-receipts.mjs';
import { MAINTENANCE_OPERATIONS } from './production-maintenance-transition.mjs';
import { LEGACY_EVIDENCE_DOMAINS } from './background-control-legacy-transition.mjs';
import { MODE_EVIDENCE_SCHEMA, captureSnapshot, summarizeStartupLogs, startupBundle } from './production-deployment-evidence.mjs';

// Only owned temporary files and explicit read-only host/Docker fixture adapters.
// The admission, receipt store, policy, schema and formal evidence validators
// run unchanged. No Docker socket, real .env, network or production is accessed.
const now = Date.parse('2026-10-18T01:10:00.000Z'), time = ms => new Date(now + ms).toISOString();
const hash = n => n.repeat(64), sha = n => n.repeat(40), image = n => `sha256:${hash(n)}`;
const actualBootId = '01234567-0123-4123-8123-0123456789ab';
const ops = path.dirname(new URL(import.meta.url).pathname);
const stagedFile = name => name === 'api-bootstrap-schema-contract.json' ? path.resolve(ops, '../../apps/api/src/common/database', name) : path.join(ops, name);
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-maintenance-state-core-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'state'); fs.mkdirSync(directory, { mode: 0o700 });
  fs.writeFileSync(path.join(root, 'docker-compose.yml'), 'services: {}\n');
  fs.writeFileSync(path.join(root, '.env'), 'FIXTURE_PUBLIC_VALUE=true\n');
  const pin = n => ({ id: hash(n), imageId: image(n), revision: sha('a'), startedAt: time(-86400000), restartCount: 0, running: true, health: 'healthy' });
  const api = pin('1'), web = { ...pin('2'), revision: sha('c') }, db = { ...pin('3'), mountsSha256: hash('4') }; delete db.revision;
  const context = { schema: 'phoenix.legacy-maintenance-context/v1', protocolVersion: 1, owner: '123456-1', previousFloorSha: sha('a'), previousApiSha: sha('a'), previousWebSha: sha('c'), targetSha: sha('b'),
    window: { start: time(-600000), end: time(600000) }, candidate: { imageId: image('5'), revision: sha('b') }, sourceHelperSha256: hash('6'), schemaEvidenceSha256: hash('7'), migrationPaths: [], preSnapshot: { api, web, db }, executors: [api] };
  const payload = { protocol: 'STOP_AND_RECONCILE', operations: MAINTENANCE_OPERATIONS }, payloadSha256 = canonicalDigest(payload);
  const body = `MAINTENANCE ${bindingDigest(context)} ${payloadSha256} ${context.targetSha}`;
  const approval = { schema: MAINTENANCE_AUTHORITY_SCHEMA, purpose: 'MAINTENANCE', bindingDigest: bindingDigest(context), decision: 'APPROVED', payload, payloadSha256,
    serverRecord: { kind: 'GITHUB_REVIEW', id: 42, state: 'APPROVED', reviewer: 'fixture-independent-reviewer', author: 'fixture-author', permission: 'ADMIN', commitId: context.targetSha,
      submittedAt: time(-1000), rawRecordSha256: hash('8'), body, bodySha256: createHash('sha256').update(body).digest('hex') } };
  const inspectDirectory = () => { const s = fs.lstatSync(directory); return [s.dev, s.ino, s.uid, s.mode]; };
  const store = new MaintenanceReceiptStore(context, { directory, guard: () => {}, inspectDirectory, expectedUid: process.getuid() });
  const evidence = (kind, body) => createMaintenanceEvidence(kind, context, body, { capturedAt: time(0) });
  const isolation = evidence('INGRESS_FENCE', { state: 'FROZEN', continuous: true, enforcedAt: time(-5000), lastVerifiedAt: time(0), leaseExpiresAt: time(300000), mechanismId: 'fixture-independent-isolation',
    revival: { state: 'ENFORCED', restartPolicy: 'no', orchestratorsDisabled: true, executorIds: [api.id] } });
  const stopped = evidence('STOP_LEGACY', { protocol: 'STOP_AND_RECONCILE', legacyDrainResult: 'UNSUPPORTED', ingressFenceDigest: isolation.evidenceSha256,
    executors: [{ id: api.id, before: api, first: { ...api, running: false, pid: 0, status: 'exited', restarting: false, dead: false, exitCode: 143, oomKilled: false, checkedAt: time(-2000) },
      second: { ...api, running: false, pid: 0, status: 'exited', restarting: false, dead: false, exitCode: 143, oomKilled: false, checkedAt: time(-1000) } }],
    database: { remainingConnections: 0, openTransactions: 0, preparedTransactions: 0, persistentRunning: 0, persistentQueued: 0, ownershipComplete: true } });
  const reconciliation = evidence('RECONCILIATION', { approvedScopeDigest: approval.payloadSha256, domains: LEGACY_EVIDENCE_DOMAINS.map(domain => ({ domain, disposition: 'RECONCILED', unknownEffects: 0, pendingWrites: 0, requiresReplay: false, requiresBusinessMutation: false })) });
  const bootstrap = evidence('LEGACY_PUBLIC_FENCED', { owner: context.owner, phase: 'FENCED', generation: 1, participants: [], legacyDrainResult: 'UNSUPPORTED', privateRecordSha256: hash('a'), publicManifestSha256: hash('b') });
  let state = { schema: 'phoenix.legacy-maintenance-state/v1', context, contextDigest: bindingDigest(context), phase: 'LEGACY_RECONCILED', status: 'FENCED', receipts: [], updatedAt: time(0) };
  store.claimCurrent(time(0));
  for (const [kind, value] of [['MAINTENANCE_AUTHORITY', approval], ['INGRESS_FENCE', isolation], ['STOP_LEGACY', stopped], ['RECONCILIATION', reconciliation]]) state.receipts.push(store.appendReceipt(kind, value, state, time(0)));
  state = store.writeState(state); store.beginMarker({ from: state.phase, to: 'PROMOTION_PREPARED', operation: 'PREPARE_PROMOTION', previousStateDigest: state.stateDigest, startedAt: time(0) });
  const read = file => JSON.parse(fs.readFileSync(file)); const writes = [];
  const write = (file, value) => { writes.push(path.basename(file)); fs.writeFileSync(file, JSON.stringify(value), { mode: 0o600 }); };
  let runtime = Object.fromEntries(['api', 'web'].map(service => [service, { imageId: context.preSnapshot[service].imageId, revision: context.preSnapshot[service].revision }]));
  const initialFloor = { version: 3, floorSha: context.previousFloorSha, phase: 'READY', chanjetPolicy: 'HOLD', readonlyApproval: null,
    operationalTuple: { CHANJET_READONLY_SYNC_ENABLED: 'false', CHANJET_ERP_INBOUND_SYNC_ENABLED: 'false' } };
  write(path.join(directory, 'floor.json'), initialFloor); write(path.join(directory, 'active.json'), { version: 3, floorSha: context.previousFloorSha, outcome: 'SUCCESS', active: runtime }); writes.length = 0;
  const deps = { directory, now: () => now, env: { DEPLOY_RUN_ID: context.owner, TARGET_SHA: context.targetSha }, admissionDependencies: { guard: () => {}, inspectDirectory, expectedUid: process.getuid() },
    verifyAuthority: async envelope => envelope === approval || canonicalDigest(envelope) === canonicalDigest(approval), verifyEvidence: async envelope => envelope.bindingDigest === bindingDigest(context),
    readState: read, atomicState: write, captureRuntime: () => structuredClone(runtime), guardProduction: () => read(path.join(directory, 'floor.json')),
    rollbackEligibility: () => ({ allowed: false, reason: 'fixture-old-below-new-floor' }), inspectCandidate: () => structuredClone(context.candidate),
    git: (_root, args) => { if (args[0] === 'show') { const name = path.basename(args[1].split(':').slice(1).join(':')); return fs.readFileSync(stagedFile(name), 'utf8').replace(/\n$/, ''); }
      if (args[0] === 'diff') return 'scripts/ops/production-deployment-state.mjs'; if (args[0] === 'merge-base') return ''; return context.targetSha; },
    readFile: (file, ...args) => fs.readFileSync(file === path.join(ops, 'api-bootstrap-schema-contract.json') ? stagedFile('api-bootstrap-schema-contract.json') : file, ...args),
    migrationScope: () => ({ baseline: context.previousApiSha, target: context.targetSha, changed: [] }),
    requireCleanMain: () => {}, assertFloorMonotonic: () => {}, assertFloor: () => {}, assertAdmissionSchemaApplied: () => false,
    loadInstalledGuard: async () => ({ CONTRACT, guardProduction: () => initialFloor, secureJson: read }),
    readBootstrapSchemaEvidence: contract => ({ columns: Object.entries(bootstrapSchemaRequirements(contract)).flatMap(([table, columns]) => columns.map(column => ({ table, column }))), extensions: contract.extensions, retiredConstraints: [] }) };
  const request = { root, context, contextDigest: bindingDigest(context), state, approval, isolation, bootstrap };
  const files = Object.fromEntries(['pre', 'post', 'log'].map(kind => [kind, path.join(directory, `maintenance-formal-${kind}-${context.owner}.json`)]));
  let metadata = Object.fromEntries(['api', 'web', 'db'].map(service => { const p = context.preSnapshot[service]; return [service, { id: p.id, created: time(-86500000), image: p.imageId, state: { Running: true, StartedAt: p.startedAt, Health: { Status: 'healthy' } }, revision: p.revision, mounts: [] }]; }));
  const dockerRead = args => { if (args[0] === 'inspect') { const m = metadata[args[1].replace('phoenix-v3-', '')]; return [m.id, m.created, m.image, m.state, 0, m.mounts].map(JSON.stringify).join('\t'); }
    const m = Object.values(metadata).find(m => m.image === args[2]); return JSON.stringify(m.revision ? { 'org.opencontainers.image.revision': m.revision } : {}); };
  deps.dockerRead = dockerRead;
  const binding = { runId: context.owner, runAttempt: 1, targetSha: context.targetSha, floorSha: context.targetSha, deployMode: 'api', capturedAt: time(0) };
  const historicalPre = captureSnapshot({ ...binding, deployMode: undefined, phase: 'PRE_SNAPSHOT', capturedAt: time(-4000) }, dockerRead);
  write(files.pre, captureSnapshot({ ...binding, phase: 'PRE_SNAPSHOT', capturedAt: time(-4000) }, dockerRead)); writes.length = 0;
  async function prepare() { await promoteLegacyMaintenanceFloor(request, deps); await beginLegacyMaintenanceDeployment(request, deps); await recordLegacyMaintenanceCandidate(request, deps); await switchLegacyMaintenanceDeployment(request, deps); }
  function candidatePhase({ bootId = actualBootId, leaseBootId = bootId } = {}) {
    // Owned fixture creates the protocol's later immutable state/intent; it does
    // not pass a plan boolean in place of the real store/admission gate.
    fs.renameSync(store.markerFile, path.join(directory, 'fixture-finished-promotion-intent.json'));
    const candidateApi = { ...api, id: hash('9'), imageId: context.candidate.imageId, revision: context.targetSha, startedAt: time(-2000) };
    const controlSession = { connected: true, broken: false, sessionPid: 100, databaseOid: 16384, backendStartedAt: time(-2000) };
    const candidate = evidence('CANDIDATE_FENCED', { api: candidateApi, bootId, controlSession, inFlight: 0, pendingChildren: 0, taskGraphs: 0, poisoned: false, stopping: false });
    const { stateDigest, ...content } = store.readState(); content.receipts.push(store.appendReceipt('CANDIDATE_FENCED', candidate, content, time(0)));
    request.state = store.writeState({ ...content, phase: 'CANDIDATE_FENCED', updatedAt: time(0) });
    store.beginMarker({ from: 'CANDIDATE_FENCED', to: 'VERIFIED_FENCED', operation: 'VERIFY_CANDIDATE', previousStateDigest: request.state.stateDigest, startedAt: time(0) });
    request.controlLease = evidence('CANDIDATE_CONTROL_LEASE', { api: candidateApi, bootId: leaseBootId, owner: context.owner, phase: 'FENCED', controlSession,
      admissionExclusive: true, executionExclusive: true, connected: true, admissionState: 'DENIED', inFlight: 0, pendingChildren: 0, taskGraphs: 0, poisoned: false, stopping: false, continuousIngress: true, unknownExecutors: 0 });
    runtime = { ...runtime, api: context.candidate };
    metadata.api = { ...metadata.api, id: candidateApi.id, image: candidateApi.imageId, revision: candidateApi.revision, state: { Running: true, StartedAt: candidateApi.startedAt, Health: { Status: 'healthy' } } };
    const post = captureSnapshot({ ...binding, phase: 'POST_SNAPSHOT' }, dockerRead); write(files.post, post);
    const apiStartup = summarizeStartupLogs({ ...binding, service: 'api', containerId: post.containers.api.id, startedAt: post.containers.api.startedAt,
      stdout: `${time(-1000)} API_BOOTSTRAP_SCHEMA_COMPATIBILITY=PASS\n`, readinessVerified: true });
    write(files.log, startupBundle(post, { api: apiStartup })); writes.length = 0;
  }
  function replaceReceipt(kind, mutate) {
    const { stateDigest, ...content } = store.readState(); const records = content.receipts.map(ref => store.readReceipt(ref));
    const priorRefs = content.receipts; content.receipts = []; let changed = false;
    records.forEach((record, i) => {
      if (record.kind === kind) { record.payload = evidence(kind, mutate(structuredClone(record.payload.body))); changed = true; }
      content.receipts.push(changed ? store.appendReceipt(record.kind, record.payload, content, time(0)) : priorRefs[i]);
    });
    request.state = store.writeState(content);
    const marker = store.read(store.markerFile); marker.previousStateDigest = request.state.stateDigest;
    fs.writeFileSync(store.markerFile, JSON.stringify(marker));
  }
  function historicalArtifacts() {
    const post = captureSnapshot({ ...binding, deployMode: undefined, phase: 'POST_SNAPSHOT' }, dockerRead);
    const log = summarizeStartupLogs({ ...binding, deployMode: undefined, containerId: post.containers.api.id, startedAt: post.containers.api.startedAt,
      stdout: `${time(-1000)} API_BOOTSTRAP_SCHEMA_COMPATIBILITY=PASS\n`, readinessVerified: true });
    return { pre: historicalPre, post, log };
  }
  return { root, directory, context, request, deps, store, read, write, writes, files, prepare, candidatePhase, metadata, evidence, initialFloor, replaceReceipt, historicalArtifacts };
}

for (const operation of [promoteLegacyMaintenanceFloor, beginLegacyMaintenanceDeployment, recordLegacyMaintenanceCandidate, switchLegacyMaintenanceDeployment, completeLegacyMaintenanceDeployment]) {
  test(`${operation.name || 'typed operation'} defaults to HOLD without independent authority`, async t => {
    const f = fixture(t); if (operation === completeLegacyMaintenanceDeployment) f.candidatePhase(); const { verifyAuthority, ...deps } = f.deps;
    await assert.rejects(operation(f.request, deps), /INDEPENDENT_MAINTENANCE_AUTHORITY_REQUIRED/); assert.deepEqual(f.writes, []);
  });
}
test('typed request rejects callback/boolean/Web/rollback/path and runtime ENV bypasses', async t => {
  for (const [changeRequest, changeDeps] of [[{ approved: true }, {}], [{ service: 'web' }, {}], [{ operation: 'rollback-pin' }, {}], [{ files: { pre: '/tmp/arbitrary' } }, {}],
    [{}, { admit: async () => true }], [{}, { maintenanceAdmission: async () => true }], [{}, { skipAdmission: true }], [{}, { env: { DEPLOY_RUN_ID: '123456-1', TARGET_SHA: sha('b'), RUN_MIG: 'true' } }]]) {
    const f = fixture(t); await assert.rejects(promoteLegacyMaintenanceFloor({ ...f.request, ...changeRequest }, { ...f.deps, ...changeDeps }), /MAINTENANCE_HOLD=/); assert.deepEqual(f.writes, []);
  }
});
test('exact real owner, intent, state digest, phase and authority SHA are required before mutation', async t => {
  for (const mutate of [f => { f.request.state = { ...f.request.state, stateDigest: hash('f') }; }, f => { f.request.contextDigest = hash('f'); },
    f => { f.request.approval.serverRecord.commitId = sha('c'); }, f => { const m = f.store.read(f.store.markerFile); m.operation = 'STOP_LEGACY'; fs.writeFileSync(f.store.markerFile, JSON.stringify(m)); },
    f => { const c = f.store.read(f.store.currentFile); c.owner = '999-1'; fs.writeFileSync(f.store.currentFile, JSON.stringify(c)); }]) {
    const f = fixture(t); mutate(f); await assert.rejects(promoteLegacyMaintenanceFloor(f.request, f.deps), /MAINTENANCE_HOLD=/); assert.deepEqual(f.writes, []);
  }
});
test('stop samples, all five reconciled domains, independent evidence and empty fenced bootstrap cannot be skipped', async t => {
  for (const mutate of [f => { f.deps.verifyEvidence = async () => false; }, f => { f.request.bootstrap = f.evidence('LEGACY_PUBLIC_FENCED', { ...f.request.bootstrap.body, participants: ['foreign'] }); },
    f => { f.request.isolation = f.evidence('INGRESS_FENCE', { ...f.request.isolation.body, lastVerifiedAt: time(-6000) }); },
    f => { const { stateDigest, ...s } = f.store.readState(); s.receipts = s.receipts.filter((_, i) => i !== 2); f.request.state = f.store.writeState(s); }]) {
    const f = fixture(t);
    try { mutate(f); await assert.rejects(promoteLegacyMaintenanceFloor(f.request, f.deps), /MAINTENANCE_HOLD=/); }
    catch (error) { assert.match(error.message, /RECEIPT_CHAIN_BROKEN/); }
    assert.deepEqual(f.writes, []);
  }
});
for (const kind of ['stopped-running', 'prepared-transactions', 'unknown-effects', 'replay-required']) {
  test(`real immutable prerequisite chain rejects ${kind} even with a fresh matching owned intent`, async t => {
    const f = fixture(t);
    if (kind === 'stopped-running') f.replaceReceipt('STOP_LEGACY', body => { body.executors[0].second.running = true; return body; });
    if (kind === 'prepared-transactions') f.replaceReceipt('STOP_LEGACY', body => { body.database.preparedTransactions = 1; return body; });
    if (kind === 'unknown-effects') f.replaceReceipt('RECONCILIATION', body => { body.domains[0].unknownEffects = 1; return body; });
    if (kind === 'replay-required') f.replaceReceipt('RECONCILIATION', body => { body.domains[2].requiresReplay = true; return body; });
    await assert.rejects(promoteLegacyMaintenanceFloor(f.request, f.deps), /MAINTENANCE_HOLD=/); assert.deepEqual(f.writes, []);
  });
}
test('promotion refuses schema paths, real schema gaps, old pins and main drift without changing floor', async t => {
  for (const mutate of [f => { f.deps.migrationScope = () => ({ baseline: sha('a'), target: sha('b'), changed: ['migration.ts'] }); },
    f => { f.deps.readBootstrapSchemaEvidence = () => ({ columns: [], extensions: [], retiredConstraints: [] }); },
    f => { f.deps.captureRuntime = () => ({ api: f.context.candidate, web: { imageId: image('2'), revision: sha('c') } }); },
    f => { f.deps.git = () => sha('f'); }]) {
    const f = fixture(t); mutate(f); await assert.rejects(promoteLegacyMaintenanceFloor(f.request, f.deps), /HOLD/);
    assert.equal(f.read(path.join(f.directory, 'floor.json')).floorSha, sha('a')); assert.ok(!f.writes.includes('policy-transition.json'));
  }
});
test('API-only typed promotion and deployment preserve standard marker ordering and immutable maintenance intent', async t => {
  const f = fixture(t); await f.prepare();
  assert.deepEqual(f.writes.slice(0, 6), [`floor-promotion-${f.context.owner}.json`, 'policy-transition.json', 'floor.json', 'active.json', `deploy-${f.context.owner}.json`, 'transaction.json']);
  const state = f.read(path.join(f.directory, `deploy-${f.context.owner}.json`));
  assert.equal(state.deployMode, 'api'); assert.equal(state.switched.api, true); assert.equal(state.switched.web, false); assert.deepEqual(state.migrationPaths, []);
  assert.equal(f.read(f.files.pre).schema, MODE_EVIDENCE_SCHEMA); assert.equal(f.read(f.files.pre).deployMode, 'api');
  assert.equal(f.read(path.join(f.directory, 'floor.json')).floorSha, f.context.targetSha);
  assert.equal(f.store.readState().stateDigest, f.request.state.stateDigest); assert.ok(fs.existsSync(f.store.markerFile)); assert.ok(fs.existsSync(f.store.currentFile));
});
test('formal completion verifies actual PRE POST startup and live pins before SUCCESS; maintenance remains FENCED', async t => {
  const f = fixture(t); await f.prepare(); f.candidatePhase();
  const result = await completeLegacyMaintenanceDeployment(f.request, f.deps); assert.equal(result.outcome, 'SUCCESS');
  assert.equal(f.read(path.join(f.directory, 'active.json')).outcome, 'SUCCESS');
  assert.equal(fs.existsSync(path.join(f.directory, 'transaction.json')), false); assert.equal(fs.existsSync(path.join(f.directory, 'policy-transition.json')), false);
  assert.ok(fs.existsSync(f.store.markerFile)); assert.ok(fs.existsSync(f.store.currentFile)); assert.equal(f.store.readState().phase, 'CANDIDATE_FENCED');
});
for (const [name, options] of [
  ['legacy-64-hex', { bootId: hash('e') }],
  ['wrong-version', { bootId: '01234567-0123-5123-8123-0123456789ab' }],
  ['wrong-variant', { bootId: '01234567-0123-4123-7123-0123456789ab' }],
  ['uppercase', { bootId: actualBootId.toUpperCase() }],
  ['empty', { bootId: '' }],
  ['different-valid-lease', { leaseBootId: '01234567-0123-4123-9123-0123456789ab' }],
]) {
  test(`formal completion rejects ${name} boot identity before any SUCCESS or marker cleanup`, async t => {
    const f = fixture(t); await f.prepare(); f.candidatePhase(options);
    await assert.rejects(completeLegacyMaintenanceDeployment(f.request, f.deps), /LEGACY_CANDIDATE_CONTROL_REQUIRED/);
    assert.deepEqual(f.writes, []);
    for (const marker of ['transaction.json', 'policy-transition.json', 'maintenance-transaction.json', 'maintenance-current.json']) assert.ok(fs.existsSync(path.join(f.directory, marker)));
    assert.notEqual(f.read(path.join(f.directory, 'active.json')).outcome, 'SUCCESS');
  });
}
test('new legacy maintenance transaction refuses a real historical v2 PRE receipt before begin', async t => {
  const f = fixture(t); await promoteLegacyMaintenanceFloor(f.request, f.deps);
  f.write(f.files.pre, f.historicalArtifacts().pre); f.writes.length = 0;
  await assert.rejects(beginLegacyMaintenanceDeployment(f.request, f.deps), /HOLD/); assert.deepEqual(f.writes, []);
  assert.equal(fs.existsSync(path.join(f.directory, 'transaction.json')), false); assert.ok(fs.existsSync(f.store.markerFile));
});
test('new API maintenance transaction cannot downgrade formal completion to genuine v2 artifacts', async t => {
  const f = fixture(t); await f.prepare(); f.candidatePhase();
  const historical = f.historicalArtifacts();
  for (const kind of ['pre', 'post', 'log']) f.write(f.files[kind], historical[kind]);
  f.writes.length = 0; await assert.rejects(completeLegacyMaintenanceDeployment(f.request, f.deps), /HOLD/); assert.deepEqual(f.writes, []);
  assert.ok(fs.existsSync(path.join(f.directory, 'transaction.json'))); assert.ok(fs.existsSync(f.store.markerFile));
});
for (const mode of ['web', 'full', 'missing']) {
  test(`typed API maintenance transaction rejects a persisted ${mode} deployment mode`, async t => {
    const f = fixture(t); await f.prepare(); f.candidatePhase();
    const file = path.join(f.directory, `deploy-${f.context.owner}.json`), state = f.read(file);
    if (mode === 'missing') delete state.deployMode; else state.deployMode = mode; f.write(file, state);
    f.writes.length = 0; await assert.rejects(completeLegacyMaintenanceDeployment(f.request, f.deps), /HOLD/); assert.deepEqual(f.writes, []);
    assert.ok(fs.existsSync(path.join(f.directory, 'transaction.json'))); assert.ok(fs.existsSync(f.store.markerFile));
  });
}
for (const kind of ['bad-startup', 'web-changed', 'db-live-drift', 'api-live-drift', 'control-identity', 'evidence-path', 'lost-control', 'expired-policy', 'transaction-target']) {
  test(`formal completion holds on ${kind} and retains all existing markers`, async t => {
    const f = fixture(t); await f.prepare(); f.candidatePhase();
    if (kind === 'bad-startup') { const log = f.read(f.files.log); log.services.api.result = 'HOLD_STARTUP_ERROR'; f.write(f.files.log, log); }
    if (kind === 'web-changed') { const post = f.read(f.files.post); post.containers.web.id = hash('f'); f.write(f.files.post, post); }
    if (kind === 'db-live-drift') f.metadata.db.id = hash('f');
    if (kind === 'api-live-drift') f.metadata.api.state.Running = false;
    if (kind === 'control-identity') { const post = f.read(f.files.post); post.containers.api.id = hash('d'); f.metadata.api.id = hash('d'); f.write(f.files.post, post); }
    if (kind === 'evidence-path') { const state = f.read(path.join(f.directory, `deploy-${f.context.owner}.json`)); state.evidence.pre = '/tmp/arbitrary'; f.write(path.join(f.directory, `deploy-${f.context.owner}.json`), state); }
    if (kind === 'lost-control') f.request.controlLease = f.evidence('CANDIDATE_CONTROL_LEASE', { ...f.request.controlLease.body, connected: false });
    if (kind === 'expired-policy') { const m = f.read(path.join(f.directory, 'policy-transition.json')); m.expiresAt = time(-1); f.write(path.join(f.directory, 'policy-transition.json'), m); }
    if (kind === 'transaction-target') { const m = f.read(path.join(f.directory, 'transaction.json')); m.target = sha('d'); f.write(path.join(f.directory, 'transaction.json'), m); }
    f.writes.length = 0; await assert.rejects(completeLegacyMaintenanceDeployment(f.request, f.deps), /HOLD/); assert.deepEqual(f.writes, []);
    for (const marker of ['transaction.json', 'policy-transition.json', 'maintenance-transaction.json', 'maintenance-current.json']) assert.ok(fs.existsSync(path.join(f.directory, marker)));
  });
}
test('asynchronous authority crossing deadline and cancellation never write a late promotion', async t => {
  for (const mode of ['window', 'cancel']) {
    const f = fixture(t), signal = new AbortController(); let clock = now; f.deps.now = () => clock; f.request.signal = signal.signal;
    f.deps.verifyAuthority = async () => { if (mode === 'window') clock += 700000; else signal.abort(); return true; };
    await assert.rejects(promoteLegacyMaintenanceFloor(f.request, f.deps), /WINDOW_CLOSED|OPERATION_ABORTED/); assert.deepEqual(f.writes, []);
  }
});
test('live identity drift during the final asynchronous authority lookup is reinspected before any SUCCESS write', async t => {
  const f = fixture(t); await f.prepare(); f.candidatePhase(); let calls = 0;
  f.deps.verifyAuthority = async () => { if (++calls === 4) f.metadata.db.id = hash('d'); return true; };
  await assert.rejects(completeLegacyMaintenanceDeployment(f.request, f.deps), /DB_TOCTOU/); assert.equal(calls, 4); assert.deepEqual(f.writes, []);
  assert.ok(fs.existsSync(path.join(f.directory, 'transaction.json'))); assert.ok(fs.existsSync(f.store.markerFile));
});
test('read-only admission seam cannot itself promote floor, switch runtime or clear any marker', async t => {
  const f = fixture(t); const result = await assertLegacyMaintenanceStateCore(f.request, 'PREPARE_PROMOTION', f.deps);
  assert.equal(result.context.targetSha, f.context.targetSha); assert.deepEqual(f.writes, []); assert.ok(fs.existsSync(f.store.markerFile));
});
test('a stale five-second snapshot still blocks without a fresh compiled observer',async t=>{
 const f=fixture(t);f.deps.now=()=>now+6000;
 await assert.rejects(assertLegacyMaintenanceStateCore(f.request,'PREPARE_PROMOTION',f.deps),/ISOLATION_STALE/);
 assert.deepEqual(f.writes,[]);
});
test('each typed writer admission refreshes real isolation across slow preparation without changing old evidence',async t=>{
 const f=fixture(t),original=structuredClone(f.request.isolation);let clock=now,captures=0;
 f.deps.now=()=>clock;
 f.deps.verifyAuthority=async()=>{clock+=1200;return true;};
 f.deps.captureLegacyIsolation=async binding=>{
  assert.equal(binding.expectedStateDigest,f.request.state.stateDigest);
  assert.deepEqual(binding.context,f.context);assert.deepEqual(binding.state,f.request.state);captures++;
  return createMaintenanceEvidence('INGRESS_FENCE',f.context,{...original.body,lastVerifiedAt:new Date(clock).toISOString()},{capturedAt:new Date(clock).toISOString()});
 };
 await f.prepare();
 assert.ok(clock-now>5000);assert.ok(captures>4);assert.deepEqual(f.request.isolation,original);
 const actual=f.read(path.join(f.directory,`deploy-${f.context.owner}.json`));
 assert.equal(actual.outcome,'SWITCHING');assert.deepEqual(actual.switched,{api:true,web:false});
});
for(const mode of ['stale','foreign-context','lost-fence','unverified-source'])test(`fresh isolation capture rejects ${mode} before floor writes`,async t=>{
 const f=fixture(t);f.deps.now=()=>now+6000;
 f.deps.captureLegacyIsolation=async()=>{
  if(mode==='foreign-context'){const foreign=structuredClone(f.context);foreign.owner='123457-1';return createMaintenanceEvidence('INGRESS_FENCE',foreign,f.request.isolation.body,{capturedAt:time(6000)});}
  const body={...f.request.isolation.body,lastVerifiedAt:mode==='stale'?time(0):time(6000)};
  if(mode==='lost-fence')body.state='RELEASED';
  return createMaintenanceEvidence('INGRESS_FENCE',f.context,body,{capturedAt:time(6000)});
 };
 if(mode==='unverified-source')f.deps.verifyEvidence=async envelope=>envelope.capturedAt!==time(6000);
 await assert.rejects(promoteLegacyMaintenanceFloor(f.request,f.deps),/ISOLATION_STALE|EVIDENCE_BINDING|CONTINUOUS_INGRESS|EVIDENCE_UNVERIFIED/);
 assert.deepEqual(f.writes,[]);
});
