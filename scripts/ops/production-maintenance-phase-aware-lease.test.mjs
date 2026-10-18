/** Real local transition/archive chain; synthetic PG/Docker and owned Node
 * control responder only. This is not live lease/production authority proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { now, time, hash } from '../ci/maintenance-transition-fixture.mjs';
import { RootControlLease } from './production-maintenance-root-lease.mjs';
import { collectCandidateLeaseBinding, collectCandidateServerBinding } from './production-maintenance-candidate-binding.mjs';
const json = JSON.stringify;
import { phaseFixture } from '../ci/maintenance-owned-candidate.fixture.mjs';

async function using(action) { const f = await phaseFixture(); try { return await action(f); } finally { await f.close(); } }
const hold = /CANDIDATE_BINDING_HOLD=/;
test('steady CF lease observation uses real committed START while the operation collector still rejects no VERIFY intent', () => using(async f => {
  const r = await collectCandidateLeaseBinding(f.request('PRE_ADOPTION'), f.dependencies);
  assert.equal(r.schema, 'phoenix.candidate-lease-binding-observation/v1'); assert.equal(r.stateDigest, f.candidateState.stateDigest);
  assert.equal(r.authorizationCandidateStateDigest, f.candidateState.stateDigest); assert.equal(r.phaseAnchor.replacementStateDigest, f.root.expectedStateDigest);
  assert.equal(r.registryInstalled, false); assert.equal(r.continuousDrainProof, false);
  await assert.rejects(collectCandidateServerBinding(f.request('PRE_ADOPTION'), f.dependencies), hold);
}));
test('CF in real VERIFY supports PRE then exact ADOPTED; committed VF keeps the original CF authorization', () => using(async f => {
  const original = f.h.adapters.verifyCandidate;
  f.h.adapters.verifyCandidate = async req => {
    await collectCandidateLeaseBinding(f.request('PRE_ADOPTION'), f.dependencies); f.adopt();
    await collectCandidateLeaseBinding(f.request('ADOPTED'), f.dependencies); return original(req);
  };
  await f.h.engine.verifyCandidate();
  const r = await collectCandidateLeaseBinding(f.request('ADOPTED'), f.dependencies);
  assert.equal(r.phaseAnchor.currentPhase, 'VERIFIED_FENCED'); assert.notEqual(r.stateDigest, r.authorizationCandidateStateDigest);
  assert.equal(r.authorizationCandidateStateDigest, f.candidateState.stateDigest);
  await assert.rejects(collectCandidateServerBinding(f.request('ADOPTED'), f.dependencies), hold);
}));
test('actual private OPEN_PENDING reads the original CF anchor and never accepts public OPEN', () => using(async f => {
  await f.verify(); const open = f.h.adapters.openCandidate;
  f.h.adapters.openCandidate = async req => {
    const r = await collectCandidateLeaseBinding(f.request('ADOPTED'), f.dependencies); assert.equal(r.phaseAnchor.currentStatus, 'OPEN_COMMIT_PENDING');
    f.projection.manifest.phase = 'OPEN'; f.projection.manifest.generation = 3;
    await assert.rejects(collectCandidateLeaseBinding(f.request('ADOPTED'), f.dependencies), hold);
    throw new Error('OWNED_FIXTURE_OPEN_NOT_PUBLISHED');
  };
  await assert.rejects(f.h.engine.complete({ completionEvidence: f.h.completion }), /OWNED_FIXTURE_OPEN_NOT_PUBLISHED/);
}));
test('an adopted CF without a real VERIFY intent refuses even with matching projection files', () => using(async f => {
  f.adopt(); await assert.rejects(collectCandidateLeaseBinding(f.request('ADOPTED'), f.dependencies), hold); assert.equal(f.calls.length, 0);
}));
test('VF refuses PRE_ADOPTION and wrong modern CF authorization digest', () => using(async f => {
  await f.verify(); await assert.rejects(collectCandidateLeaseBinding(f.request('PRE_ADOPTION'), f.dependencies), hold);
  f.projection.modern.maintenanceStateDigest = f.h.store.readState().stateDigest;
  await assert.rejects(collectCandidateLeaseBinding(f.request('ADOPTED'), f.dependencies), hold);
}));

test('caller-supplied alternative root digest cannot override the genuine immutable root binding', () => using(async f => {
  const wrong = new RootControlLease({ context: f.h.context, database: f.root.database, approval: f.h.material.approval, expectedStateDigest: hash('e'), registerOwnedChild: () => { throw new Error('MUST_NOT_SPAWN'); } }, { store: f.h.store, guard() {} });
  await assert.rejects(collectCandidateLeaseBinding({ ...f.request('PRE_ADOPTION'), rootLease: wrong, replacementStateDigest: f.root.expectedStateDigest }, f.dependencies), hold);
  assert.equal(f.calls.length, 0);
}));
for (const kind of ['START', 'VERIFY']) test(`changed ${kind} archive during runtime observation invalidates the entire lease snapshot`, () => using(async f => {
  if (kind === 'VERIFY') await f.verify();
  const state = kind === 'START' ? f.candidateState : f.h.store.readState();
  const file = path.join(f.h.directory, `maintenance-intent-${f.h.context.owner}-${state.stateDigest}.json`); let changed = false;
  f.hook(() => {
    if (!changed) { changed = true; const marker = f.h.store.read(file); fs.writeFileSync(file, json({ ...marker, startedAt: time(-1) })); }
  });
  await assert.rejects(collectCandidateLeaseBinding(f.request(kind === 'START' ? 'PRE_ADOPTION' : 'ADOPTED'), f.dependencies), /PHASE_ANCHOR_CHANGED/);
  assert.equal(changed, true);
}));
test('new VERIFY intent with unchanged CF state during observation cannot be mixed into a steady snapshot', () => using(async f => {
  let changed = false; f.hook(() => {
    if (!changed) { changed = true; const state = f.h.store.readState(); f.h.store.beginMarker({ operation: 'VERIFY_CANDIDATE', from: state.phase, to: 'VERIFIED_FENCED', previousStateDigest: state.stateDigest, startedAt: time(0) }); }
  });
  await assert.rejects(collectCandidateLeaseBinding(f.request('PRE_ADOPTION'), f.dependencies), /PHASE_ANCHOR_CHANGED/);
}));
test('OPEN pending refuses PRE, then SUCCESS can no longer provide any fenced lease observation', () => using(async f => {
  await f.verify(); const open = f.h.adapters.openCandidate;
  f.h.adapters.openCandidate = async request => {
    await assert.rejects(collectCandidateLeaseBinding(f.request('PRE_ADOPTION'), f.dependencies), hold);
    await assert.rejects(collectCandidateServerBinding(f.request('ADOPTED'), f.dependencies), hold);
    return open(request);
  };
  await f.h.engine.complete({ completionEvidence: f.h.completion });
  await assert.rejects(collectCandidateLeaseBinding(f.request('ADOPTED'), f.dependencies), hold);
}));
test('new collector keeps raw microsecond, database and root-lock checks in the common observation core', () => using(async f => {
  f.catalog(value => ({ ...value, candidateBackends: [{ ...value.candidateBackends[0], backendStartedAt: value.candidateBackends[0].backendStartedAt.replace('456Z', '457Z') }] }));
  await assert.rejects(collectCandidateLeaseBinding(f.request('PRE_ADOPTION'), f.dependencies), hold);
  f.catalog(value => ({ ...value, rootLocks: value.rootLocks.slice(0, 1) }));
  await assert.rejects(collectCandidateLeaseBinding(f.request('PRE_ADOPTION'), f.dependencies), hold);
}));
test('the new phase path obeys the same single monotonic IO deadline and retains the original lease', () => using(async f => {
  // Leave real Node responder I/O budget; the injected monotonic clock alone
  // crosses this test's deadline on the first candidate Docker observation.
  let elapsed = 0; f.dependencies.monotonicNow = () => elapsed; f.hook(() => { elapsed = 1001; });
  await assert.rejects(collectCandidateLeaseBinding({ ...f.request('PRE_ADOPTION'), timeoutMs: 1000 }, f.dependencies), /DEADLINE_OR_ABORT/);
  assert.equal(f.calls.length, 1);
}));

test('intent change exactly at root-after refuses a mixed phase snapshot', () => using(async f => {
  const original = f.root.run; let catalogs = 0;
  f.root.run = (...args) => {
    const result = original(...args);
    if (args[0][0] === 'exec' && ++catalogs === 2) {
      const state = f.h.store.readState(); f.h.store.beginMarker({ operation: 'VERIFY_CANDIDATE', from: state.phase, to: 'VERIFIED_FENCED', previousStateDigest: state.stateDigest, startedAt: time(0) });
    }
    return result;
  };
  await assert.rejects(collectCandidateLeaseBinding(f.request('PRE_ADOPTION'), f.dependencies), /PHASE_ANCHOR_CHANGED/);
  assert.equal(catalogs, 2);
}));
for (const drift of ['mount', 'storage', 'private']) test(`new lease path retains shared ${drift} drift rejection`, () => using(async f => {
  if (drift === 'mount') f.mounts[0].RW = true;
  if (drift === 'storage') f.floor.operationalTuple.PHOENIX_UPLOADS_DIR = '/var/run/docker.sock';
  if (drift === 'private') f.projection.bootstrap.owner = 'another-owner';
  await assert.rejects(collectCandidateLeaseBinding(f.request('PRE_ADOPTION'), f.dependencies), hold);
}));
