/** Structural/local filesystem tests only. Real root, FD9, Docker RO mounts and
 * production authority integrations are NOT_RUN in this suite. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LegacyMaintenancePublicControl, validateLegacyFencedProjection } from './production-maintenance-public-control.mjs';
import { MaintenanceReceiptStore, bindingDigest, canonicalDigest, createMaintenanceEvidence, MAINTENANCE_CONTEXT_SCHEMA, MAINTENANCE_AUTHORITY_SCHEMA } from './production-maintenance-receipts.mjs';
import { MAINTENANCE_OPERATIONS } from './production-maintenance-transition.mjs';
import { validateParticipants, validateManifest } from './background-control-manifest.mjs';
const now = Date.parse('2026-10-18T01:10:00.000Z');
const at = ms => new Date(now + ms).toISOString();
const h = c => c.repeat(64); const sha = c => c.repeat(40);
const boot = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function pin(c, revision = sha('a')) { return { id: h(c), imageId: `sha256:${h(c)}`, revision, startedAt: at(-86400000), restartCount: 0, running: true, health: 'healthy' }; }
function fixture(t, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-public-bootstrap-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const stateDirectory = path.join(directory, 'private'); const publicDirectory = path.join(directory, 'public');
  fs.mkdirSync(stateDirectory, { mode: 0o700 }); fs.mkdirSync(publicDirectory, { mode: 0o700 });
  const inspect = dir => { const s = fs.lstatSync(dir); assert.equal(s.isSymbolicLink(), false); return { dev: s.dev, ino: s.ino, mode: s.mode, uid: s.uid }; };
  const api = pin('1'); const web = pin('2', sha('c')); const db = { ...pin('3'), mountsSha256: h('4') }; delete db.revision;
  const context = { schema: MAINTENANCE_CONTEXT_SCHEMA, protocolVersion: 1, owner: '123456-1', previousFloorSha: sha('a'), previousApiSha: sha('a'), previousWebSha: sha('c'), targetSha: sha('b'),
    window: { start: at(-600000), end: at(600000) }, candidate: { revision: sha('b'), imageId: `sha256:${h('5')}` }, sourceHelperSha256: h('6'), schemaEvidenceSha256: h('7'), migrationPaths: [], preSnapshot: { api, web, db }, executors: [api] };
  const digest = bindingDigest(context); const evidence = (kind, body) => createMaintenanceEvidence(kind, context, body, { capturedAt: at(0) });
  const payload = { protocol: 'STOP_AND_RECONCILE', operations: MAINTENANCE_OPERATIONS, recoveryPlanDigest: h('8'), preSnapshotDigest: canonicalDigest(context.preSnapshot) };
  const authority = { schema: MAINTENANCE_AUTHORITY_SCHEMA, bindingDigest: digest, purpose: 'MAINTENANCE', decision: 'APPROVED', payload, payloadSha256: canonicalDigest(payload),
    serverRecord: { state: 'APPROVED', commitId: context.targetSha, reviewer: 'independent-fixture-reviewer', author: 'fixture-author', submittedAt: at(-10000), rawRecordSha256: h('9') } };
  const store = new MaintenanceReceiptStore(context, { directory: stateDirectory, guard: () => {}, inspectDirectory: inspect, expectedUid: process.getuid() });
  store.claimCurrent(at(0));
  let state = { schema: 'phoenix.legacy-maintenance-state/v1', context, contextDigest: digest, phase: 'LEGACY_RECONCILED', status: 'FENCED', legacyDrainResult: 'UNSUPPORTED', recoveryPlanDigest: h('8'), receipts: [], updatedAt: at(0) };
  for (const [kind, body] of [['MAINTENANCE_AUTHORITY', authority], ['RECONCILIATION', evidence('RECONCILIATION', { fixture: true })]]) state.receipts.push(store.appendReceipt(kind, body, state, at(0)));
  state = store.writeState(state); store.beginMarker({ from: state.phase, to: 'PROMOTION_PREPARED', operation: 'PREPARE_PROMOTION', previousStateDigest: state.stateDigest, startedAt: at(0) });
  const effects = [];
  const dependencies = { store, publicDirectory, guard: () => effects.push('GUARD'), initialize: () => inspect(publicDirectory), inspect, expectedUid: process.getuid(), now: () => now,
    verifyAuthority: async () => true, verifyEvidence: async () => true, verifyCandidateBinding: async () => true,
    writeModernPrivate: record => { effects.push('PRIVATE'); store.immutable(path.join(stateDirectory, 'background-control.json'), record); },
    writeModernPublic: manifest => { effects.push('PUBLIC'); const file = path.join(publicDirectory, 'manifest.json'); const temp = path.join(publicDirectory, 'candidate-projection.tmp'); fs.writeFileSync(temp, JSON.stringify(manifest), { flag: 'wx', mode: 0o444 }); fs.renameSync(temp, file); },
    readModernPublic: () => validateManifest(JSON.parse(fs.readFileSync(path.join(publicDirectory, 'manifest.json'), 'utf8'))), ...overrides };
  const bridge = new LegacyMaintenancePublicControl({ context }, dependencies);
  return { context, store, stateDirectory, publicDirectory, inspect, dependencies, bridge, effects, evidence, state };
}
function makeCandidate(f) {
  const { stateDigest, ...state } = f.store.readState();
  const api = { ...pin('d', f.context.targetSha), imageId: f.context.candidate.imageId, startedAt: at(-1000) };
  const controlSession = { connected: true, broken: false, sessionPid: 123, databaseOid: 456, backendStartedAt: at(-1000), applicationName: `phoenix-fence:${boot}` };
  const candidate = { api, bootId: boot, owner: f.context.owner, admissionState: 'DENIED', inFlight: 0, pendingChildren: 0, taskGraphs: 0, poisoned: false, stopping: false, controlSession,
    chanjetPolicy: 'HOLD', readonlySync: false, inboundSync: false, web: f.context.preSnapshot.web, db: f.context.preSnapshot.db };
  f.store.finishMarker(f.store.readState());
  state.receipts.push(f.store.appendReceipt('CANDIDATE_FENCED', f.evidence('CANDIDATE_FENCED', candidate), state, at(0)));
  const next = f.store.writeState({ ...state, phase: 'CANDIDATE_FENCED', status: 'FENCED' });
  f.store.beginMarker({ from: next.phase, to: 'VERIFIED_FENCED', operation: 'VERIFY_CANDIDATE', previousStateDigest: next.stateDigest, startedAt: at(0) });
  const binding = { api, bootId: boot, owner: f.context.owner, admissionState: 'DENIED', inFlight: 0, pendingChildren: 0, taskGraphs: 0, poisoned: false, stopping: false,
    controlSession, rootLocks: { admissionExclusive: true, executionExclusive: true } };
  return { participants: [{ bootId: boot, containerId: api.id, revision: f.context.targetSha, allowedKinds: ['LOCAL', 'EXTERNAL_READ', 'NOTIFICATION'] }], evidence: f.evidence('CANDIDATE_PUBLIC_ADOPTION', binding) };
}

test('empty FENCED is legacy-only; modern inventory validation remains strict', () => {
  const manifest = { protocolVersion: 1, phase: 'FENCED', owner: '123-1', generation: 1, targetSha: sha('b'), participants: [] };
  assert.equal(validateLegacyFencedProjection(manifest), manifest);
  assert.throws(() => validateParticipants([]), /PARTICIPANT_INVENTORY/); assert.throws(() => validateManifest(manifest), /PARTICIPANT_INVENTORY/);
  for (const mutate of [m => m.phase = 'OPEN', m => m.generation = 2, m => m.owner = 'arbitrary', m => m.extra = true, m => m.participants.push({})]) {
    const m = structuredClone(manifest); mutate(m); assert.throws(() => validateLegacyFencedProjection(m), /LEGACY_EMPTY_FENCE_REQUIRED/);
  }
});
test('bootstrap requires independent authority and evidence; defaults never write', async t => {
  for (const key of ['verifyAuthority', 'verifyEvidence']) {
    const f = fixture(t, { [key]: undefined });
    await assert.rejects(f.bridge.bootstrap(), /INDEPENDENT_/);
    assert.deepEqual(fs.readdirSync(f.publicDirectory), []); assert.equal(fs.existsSync(f.bridge.privateFile), false);
  }
});
test('default root/FD9 guard is not replaced by fixture authority', async t => {
  const f = fixture(t); const bridge = new LegacyMaintenancePublicControl({ context: f.context }, { ...f.dependencies, guard: undefined });
  await assert.rejects(bridge.bootstrap(), /CONFIG_HOLD=/); assert.deepEqual(fs.readdirSync(f.publicDirectory), []);
});
test('bootstrap writes immutable private authority before fsynced deny projection', async t => {
  const f = fixture(t); const result = await f.bridge.bootstrap();
  const manifest = JSON.parse(fs.readFileSync(path.join(f.publicDirectory, 'manifest.json'), 'utf8'));
  assert.equal(result.kind, 'LEGACY_PUBLIC_FENCED'); assert.equal(result.body.legacyDrainResult, 'UNSUPPORTED'); assert.deepEqual(manifest.participants, []);
  assert.equal(fs.statSync(path.join(f.publicDirectory, 'manifest.json')).mode & 0o777, 0o444);
  assert.equal(f.store.read(f.bridge.privateFile).manifestDigest, result.body.publicManifestSha256);
  assert.equal(fs.existsSync(path.join(f.stateDirectory, 'background-control.json')), false);
  await assert.rejects(f.bridge.bootstrap(), /ALREADY_STARTED/);
});
test('missing lifecycle/intent, changed owner/context/phase or expired window all HOLD', async t => {
  for (const mutate of [
    f => fs.unlinkSync(f.store.currentFile), f => fs.unlinkSync(f.store.markerFile),
    f => { const s = f.store.readState(); const { stateDigest, ...x } = s; f.store.writeState({ ...x, phase: 'STOPPED_UNRECONCILED' }); },
    f => { const owner = f.store.read(f.store.currentFile); fs.writeFileSync(f.store.currentFile, JSON.stringify({ ...owner, owner: '777-1' })); },
    f => { const marker = f.store.read(f.store.markerFile); fs.writeFileSync(f.store.markerFile, JSON.stringify({ ...marker, operation: 'START_CANDIDATE' })); },
  ]) { const f = fixture(t); mutate(f); await assert.rejects(f.bridge.bootstrap()); assert.equal(fs.existsSync(f.bridge.privateFile), false); }
  const f = fixture(t, { now: () => now + 700000 }); await assert.rejects(f.bridge.bootstrap(), /WINDOW_CLOSED/);
});
test('existing modern/private/public owners including dangling symlinks block bootstrap', async t => {
  for (const name of ['modern', 'public', 'dangling-modern', 'dangling-public']) {
    const f = fixture(t); const destination = name.endsWith('modern') ? f.bridge.modernPrivate : path.join(f.publicDirectory, 'manifest.json');
    if (name.startsWith('dangling')) fs.symlinkSync('/nonexistent/fixture-destination', destination); else fs.writeFileSync(destination, '{}');
    await assert.rejects(f.bridge.bootstrap(), /EXISTING_/); assert.equal(fs.existsSync(f.bridge.privateFile), false);
  }
});
test('immutable receipt tampering blocks before projection', async t => {
  const f = fixture(t); const receipt = f.store.receiptFile(f.state.receipts[1]); const body = JSON.parse(fs.readFileSync(receipt, 'utf8'));
  body.payload.body.fixture = false; fs.writeFileSync(receipt, JSON.stringify(body));
  await assert.rejects(f.bridge.bootstrap(), /RECEIPT_DIGEST/); assert.deepEqual(fs.readdirSync(f.publicDirectory), []);
});
test('asynchronous verifier cannot race the phase/owner or maintenance window', async t => {
  const f = fixture(t); const verifyEvidence = async () => { fs.unlinkSync(f.store.markerFile); return true; };
  const bridge = new LegacyMaintenancePublicControl({ context: f.context }, { ...f.dependencies, verifyEvidence });
  await assert.rejects(bridge.bootstrap()); assert.equal(fs.existsSync(f.bridge.privateFile), false);
});
test('crash after private intent retains authority and forbids retry', async t => {
  const f = fixture(t, { failurePoint: point => { if (point === 'AFTER_PRIVATE_BOOTSTRAP_INTENT') throw new Error('SIMULATED_CRASH'); } });
  await assert.rejects(f.bridge.bootstrap(), /SIMULATED_CRASH/); assert.equal(fs.existsSync(f.bridge.privateFile), true);
  assert.equal(fs.existsSync(f.store.markerFile), true); assert.deepEqual(fs.readdirSync(f.publicDirectory), []);
  await assert.rejects(f.bridge.bootstrap(), /ALREADY_STARTED/);
});
test('atomic public temp is retained on fsync failure without publishing; paths are reinspected', async t => {
  const f = fixture(t); const io = Object.create(fs); io.fsyncSync = () => { throw new Error('FSYNC_FAULT'); };
  f.bridge.atomicDependencies = { fs: io };
  await assert.rejects(f.bridge.bootstrap(), /FSYNC_FAULT/);
  assert.equal(fs.existsSync(path.join(f.publicDirectory, 'manifest.json')), false); assert.equal(fs.readdirSync(f.publicDirectory).length, 1);
  const g = fixture(t); let calls = 0; g.bridge.inspect = () => ({ inode: ++calls });
  await assert.rejects(g.bridge.bootstrap(), /PATH_CHANGED/);
});
test('candidate adoption defaults deny without independent root Docker/PG verifier', async t => {
  const f = fixture(t); await f.bridge.bootstrap(); const candidate = makeCandidate(f);
  const bridge = new LegacyMaintenancePublicControl({ context: f.context }, { ...f.dependencies, verifyCandidateBinding: undefined });
  await assert.rejects(bridge.adoptCandidate(candidate), /CANDIDATE_ROOT_DOCKER_PG_BINDING/); assert.equal(fs.existsSync(f.bridge.modernPrivate), false);
});
test('candidate adoption commits modern >=1 private authority before public and never OPEN', async t => {
  const f = fixture(t); await f.bridge.bootstrap(); const candidate = makeCandidate(f); const result = await f.bridge.adoptCandidate(candidate);
  assert.equal(result.kind, 'CANDIDATE_PUBLIC_ADOPTED'); assert.equal(result.body.phase, 'FENCED');
  assert.deepEqual(f.effects.filter(x => x === 'PRIVATE' || x === 'PUBLIC'), ['PRIVATE', 'PUBLIC']);
  const modern = f.store.read(f.bridge.modernPrivate); const projection = f.dependencies.readModernPublic();
  assert.equal(modern.generation, 2); assert.equal(projection.participants.length, 1); assert.equal(projection.phase, 'FENCED');
  assert.equal(modern.manifestDigest, result.body.publicManifestSha256);
  await assert.rejects(f.bridge.adoptCandidate(candidate), /EXISTING_MODERN/);
});
test('candidate identity, admission, Chanjet, task, session and lock mismatches HOLD before adoption', async t => {
  const changes = [b => b.bootId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', b => b.api.restartCount++, b => b.admissionState = 'OPEN', b => b.pendingChildren = 1,
    b => b.poisoned = true, b => b.controlSession.applicationName = 'unbound', b => b.controlSession.sessionPid = 0, b => b.rootLocks.executionExclusive = false];
  for (const change of changes) {
    const f = fixture(t); await f.bridge.bootstrap(); const candidate = makeCandidate(f); const body = structuredClone(candidate.evidence.body); change(body);
    candidate.evidence = f.evidence('CANDIDATE_PUBLIC_ADOPTION', body);
    await assert.rejects(f.bridge.adoptCandidate(candidate), /CANDIDATE_ROOT_DOCKER_PG_BINDING/); assert.equal(fs.existsSync(f.bridge.modernPrivate), false);
  }
});
test('partial adoption failure keeps durable modern FENCED authority and cannot retry or OPEN', async t => {
  const f = fixture(t); await f.bridge.bootstrap(); const candidate = makeCandidate(f);
  const bridge = new LegacyMaintenancePublicControl({ context: f.context }, { ...f.dependencies, failurePoint: point => { if (point === 'AFTER_MODERN_PRIVATE_AUTHORITY') throw new Error('SIMULATED_ADOPTION_CRASH'); } });
  await assert.rejects(bridge.adoptCandidate(candidate), /SIMULATED_ADOPTION_CRASH/);
  assert.equal(f.store.read(f.bridge.modernPrivate).phase, 'FENCED'); assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.publicDirectory, 'manifest.json'))).participants, []);
  assert.equal(fs.existsSync(f.store.markerFile), true); await assert.rejects(f.bridge.adoptCandidate(candidate), /EXISTING_MODERN/);
});
test('atomic writer refuses raced symlink destination and preserves target bytes', async t => {
  const f = fixture(t); const other = path.join(f.publicDirectory, 'other.json'); fs.writeFileSync(other, 'protected');
  f.bridge.atomicDependencies = { failurePoint: point => {
    if (point === 'AFTER_TEMP_FSYNC') fs.symlinkSync(other, path.join(f.publicDirectory, 'manifest.json'));
  } };
  await assert.rejects(f.bridge.bootstrap(), /PUBLIC_DESTINATION_CHANGED/);
  assert.equal(fs.readFileSync(other, 'utf8'), 'protected');
});
test('candidate cannot adopt changed bootstrap public bytes or changed private authority', async t => {
  for (const which of ['public', 'private']) {
    const f = fixture(t); await f.bridge.bootstrap(); const candidate = makeCandidate(f);
    if (which === 'public') {
      const file = path.join(f.publicDirectory, 'manifest.json'); const manifest = JSON.parse(fs.readFileSync(file)); manifest.owner = '666-1';
      fs.chmodSync(file, 0o644); fs.writeFileSync(file, JSON.stringify(manifest)); fs.chmodSync(file, 0o444);
    } else {
      const record = f.store.read(f.bridge.privateFile); record.contextDigest = h('f'); fs.writeFileSync(f.bridge.privateFile, JSON.stringify(record));
    }
    await assert.rejects(f.bridge.adoptCandidate(candidate), /LEGACY_PUBLIC_BINDING_CHANGED/); assert.equal(fs.existsSync(f.bridge.modernPrivate), false);
  }
});
test('public projection read rechecks trusted directory identity during adoption', async t => {
  const f = fixture(t); await f.bridge.bootstrap(); const candidate = makeCandidate(f); let calls = 0;
  const bridge = new LegacyMaintenancePublicControl({ context: f.context }, { ...f.dependencies, inspect: () => ({ counter: ++calls }) });
  await assert.rejects(bridge.adoptCandidate(candidate), /PATH_CHANGED/); assert.equal(fs.existsSync(f.bridge.modernPrivate), false);
});
test('post-write public mismatch cannot return successful adoption evidence', async t => {
  const f = fixture(t); await f.bridge.bootstrap(); const candidate = makeCandidate(f);
  const bridge = new LegacyMaintenancePublicControl({ context: f.context }, { ...f.dependencies, readModernPublic: () => ({ phase: 'OPEN' }) });
  await assert.rejects(bridge.adoptCandidate(candidate), /CANDIDATE_PUBLIC_PRIVATE_BINDING_CHANGED/);
  assert.equal(f.store.read(f.bridge.modernPrivate).phase, 'FENCED'); assert.equal(fs.existsSync(f.store.markerFile), true);
});

test('public directory installation occurs only after immutable claim and interruption forbids reinitialization', async t => {
  const f = fixture(t); let initialized = 0;
  const bridge = new LegacyMaintenancePublicControl({ context: f.context }, { ...f.dependencies,
    initialize: () => { initialized++; assert.equal(fs.existsSync(f.bridge.privateFile), true); },
    failurePoint: point => { if (point === 'AFTER_PUBLIC_DIRECTORY_INIT') throw new Error('DIRECTORY_INIT_CRASH'); },
  });
  await assert.rejects(bridge.bootstrap(), /DIRECTORY_INIT_CRASH/);
  assert.equal(initialized, 1); assert.equal(fs.existsSync(f.bridge.privateFile), true);
  await assert.rejects(bridge.bootstrap(), /ALREADY_STARTED/); assert.equal(initialized, 1);
});

async function preparedObservationFixture(t, overrides = {}) {
  const f = fixture(t); const bootstrapEvidence = await f.bridge.bootstrap(); const old = f.store.readState();
  f.store.finishMarker(old);
  const {stateDigest,...content}=old;const nextRefs=[...old.receipts];
  nextRefs.push(f.store.appendReceipt('PROMOTION_PREPARED', f.evidence('PROMOTION_PREPARED',{fixtureOnly:true}),old,at(0)));
  const state=f.store.writeState({...content,receipts:nextRefs,phase:'PROMOTION_PREPARED',status:'FENCED',updatedAt:at(0)});
  f.store.beginMarker({from:state.phase,to:'CANDIDATE_REPLACED',operation:'REPLACE_CANDIDATE',previousStateDigest:state.stateDigest,startedAt:at(0)});
  const bridge=new LegacyMaintenancePublicControl({context:f.context},{...f.dependencies,...overrides});
  return {...f,bridge,bootstrapEvidence,expectedStateDigest:state.stateDigest};
}
const observe=f=>f.bridge.observeEmptyFence({expectedStateDigest:f.expectedStateDigest,bootstrapEvidence:f.bootstrapEvidence});
const directoryBytes=dir=>fs.readdirSync(dir).sort().map(name=>[name,fs.readFileSync(path.join(dir,name)).toString('base64')]);
test('protected empty-fence observation reads existing private/public evidence without writing or granting admission',async t=>{
  const f=await preparedObservationFixture(t);const before=[directoryBytes(f.stateDirectory),directoryBytes(f.publicDirectory)];
  f.bridge.bootstrap=()=>assert.fail('observation must not bootstrap');
  const result=await observe(f);assert.equal(result.result,'OBSERVATION_ONLY');assert.equal(result.stateDigest,f.expectedStateDigest);
  for(const key of ['continuousDrainProof','admissionOrApprovalGranted','registryInstalled'])assert.equal(result[key],false);
  assert.equal(result.legacyDrainResult,'UNSUPPORTED');assert.equal(result.privateRecordSha256,f.bootstrapEvidence.body.privateRecordSha256);
  assert.deepEqual([directoryBytes(f.stateDirectory),directoryBytes(f.publicDirectory)],before);
});
test('observation requires exact current state and independent authority/evidence rather than caller approval booleans',async t=>{
  for(const key of ['verifyAuthority','verifyEvidence']){const f=await preparedObservationFixture(t,{[key]:undefined});await assert.rejects(observe(f),/INDEPENDENT_/);}
  const f=await preparedObservationFixture(t);await assert.rejects(f.bridge.observeEmptyFence(),/STATE_DIGEST_REQUIRED/);
  await assert.rejects(f.bridge.observeEmptyFence({expectedStateDigest:h('e'),bootstrapEvidence:f.bootstrapEvidence}),/STATE_MISMATCH/);
  await assert.rejects(f.bridge.observeEmptyFence({expectedStateDigest:f.expectedStateDigest,bootstrapEvidence:{approved:true}}));
});
test('observation denies wrong public owner, target, generation, OPEN, nonempty participants, symlink and hardlink',async t=>{
  for(const kind of ['owner','target','generation','open','participants','symlink','hardlink']){
    const f=await preparedObservationFixture(t);const file=path.join(f.publicDirectory,'manifest.json');const m=JSON.parse(fs.readFileSync(file));
    if(kind==='symlink'){fs.renameSync(file,file+'.original');fs.symlinkSync(file+'.original',file);}
    else if(kind==='hardlink')fs.linkSync(file,file+'.link');
    else{fs.chmodSync(file,0o644);if(kind==='owner')m.owner='999-1';if(kind==='target')m.targetSha=sha('e');if(kind==='generation')m.generation=2;if(kind==='open')m.phase='OPEN';if(kind==='participants')m.participants=[{}];fs.writeFileSync(file,JSON.stringify(m));fs.chmodSync(file,0o444);}
    await assert.rejects(observe(f));
  }
});
test('observation binds immutable private intent bytes and time to the independently verified bootstrap',async t=>{
  for(const mutate of [r=>r.owner='999-1',r=>r.targetSha=sha('e'),r=>r.stateDigest='bad',r=>r.capturedAt=at(1000),r=>r.phase='OPEN',r=>r.extra=true]){
    const f=await preparedObservationFixture(t);const r=f.store.read(f.bridge.privateFile);mutate(r);fs.writeFileSync(f.bridge.privateFile,JSON.stringify(r));await assert.rejects(observe(f),/PERSISTED_BINDING/);
  }
});
test('observation rechecks intent and modern owner after asynchronous authority/evidence verification',async t=>{
  for(const kind of ['marker','modern','state']){
    const f=await preparedObservationFixture(t);const verifyEvidence=async()=>{
      if(kind==='marker')fs.unlinkSync(f.store.markerFile);
      if(kind==='modern')f.store.immutable(f.bridge.modernPrivate,{fixtureOnly:true});
      if(kind==='state'){const {stateDigest,...s}=f.store.readState();f.store.writeState({...s,updatedAt:at(1)});}
      return true;
    };f.bridge=new LegacyMaintenancePublicControl({context:f.context},{...f.dependencies,verifyEvidence});await assert.rejects(observe(f));
  }
});
test('observation retains the default root/FD9 guard and refuses an expired maintenance window',async t=>{
  const f=await preparedObservationFixture(t,{guard:undefined});await assert.rejects(observe(f),/CONFIG_HOLD=/);
  const expired=await preparedObservationFixture(t,{now:()=>now+700000});await assert.rejects(observe(expired),/WINDOW_CLOSED/);
});

test('observation pins caller envelope before awaits and rejects a verifier mutating its private evidence copy',async t=>{
  const f=await preparedObservationFixture(t);const original=f.bootstrapEvidence.evidenceSha256;
  f.bridge=new LegacyMaintenancePublicControl({context:f.context},{...f.dependencies,verifyAuthority:async()=>{f.bootstrapEvidence.evidenceSha256=h('e');f.bootstrapEvidence.body.owner='999-1';return true;}});
  assert.equal((await observe(f)).bootstrapEvidenceSha256,original);
  const g=await preparedObservationFixture(t);g.bridge=new LegacyMaintenancePublicControl({context:g.context},{...g.dependencies,verifyEvidence:async envelope=>{envelope.body.owner='999-1';return true;}});
  await assert.rejects(observe(g),/BOOTSTRAP_CHANGED/);
});

test('observation rejects invalid, future and out-of-window state timestamps instead of accepting NaN comparisons',async t=>{
  for(const updatedAt of ['invalid',at(1000),at(-700000)]){
    const f=await preparedObservationFixture(t);const old=f.store.readState();f.store.finishMarker(old);
    const {stateDigest,...content}=old;const state=f.store.writeState({...content,updatedAt});
    f.store.beginMarker({from:state.phase,to:'CANDIDATE_REPLACED',operation:'REPLACE_CANDIDATE',previousStateDigest:state.stateDigest,startedAt:at(0)});
    f.expectedStateDigest=state.stateDigest;await assert.rejects(observe(f),/STATE_TIME/);
  }
});
