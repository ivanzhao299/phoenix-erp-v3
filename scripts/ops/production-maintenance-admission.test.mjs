import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { assertModernReleaseAdmission, assertLegacyMaintenanceAdmission } from './production-maintenance-admission.mjs';
import { MaintenanceReceiptStore, canonicalDigest, bindingDigest, MAINTENANCE_AUTHORITY_SCHEMA } from './production-maintenance-receipts.mjs';

const now = Date.parse('2026-10-18T00:10:00.000Z'), old = 'a'.repeat(40), target = 'b'.repeat(40), hash = 'a'.repeat(64);
function context() {
  const pin = n => ({ id: n.repeat(64), imageId: `sha256:${n.repeat(64)}`, revision: old, startedAt: '2026-10-17T00:00:00.123456789Z', restartCount: 0, running: true, health: 'healthy' });
  const api = pin('1');
  return { schema: 'phoenix.legacy-maintenance-context/v1', protocolVersion: 1, owner: '123-1', previousFloorSha: old, previousApiSha: old, previousWebSha: old, targetSha: target,
    window: { start: '2026-10-18T00:00:00.000Z', end: '2026-10-18T00:20:00.000Z' }, candidate: { revision: target, imageId: `sha256:${hash}` },
    sourceHelperSha256: hash, schemaEvidenceSha256: hash, migrationPaths: [], preSnapshot: { api, web: pin('2'), db: { ...pin('3'), mountsSha256: hash } }, executors: [api] };
}
function approval(c, operations = ['FENCE_INGRESS', 'DISABLE_RESTART_POLICY', 'DISCONNECT_LEGACY_NETWORKS', 'STOP_LEGACY', 'OPEN_CANDIDATE']) {
  const payload = { protocol: 'STOP_AND_RECONCILE', operations }, digest = bindingDigest(c), payloadSha256 = canonicalDigest(payload);
  const body = `MAINTENANCE ${digest} ${payloadSha256} ${target}`;
  return { schema: MAINTENANCE_AUTHORITY_SCHEMA, purpose: 'MAINTENANCE', bindingDigest: digest, decision: 'APPROVED', payload, payloadSha256,
    serverRecord: { kind: 'GITHUB_REVIEW', id: 1, state: 'APPROVED', reviewer: 'fixture-independent-reviewer', author: 'fixture-author', permission: 'ADMIN', commitId: target,
      submittedAt: '2026-10-18T00:00:00.000Z', rawRecordSha256: hash, body, bodySha256: createHash('sha256').update(body).digest('hex') } };
}
function fixture({ active = true, phase = 'PREPARED', status = 'FENCED_PREPARATION', operation = 'FENCE_INGRESS', to = 'INGRESS_FENCED' } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-maintenance-admission-')); fs.chmodSync(directory, 0o700);
  const inspectDirectory = () => { const stat = fs.lstatSync(directory); return [stat.dev, stat.ino, stat.uid, stat.mode]; };
  const deps = { directory, guard: () => {}, inspectDirectory, expectedUid: process.getuid(), now: () => now };
  const c = context(), store = new MaintenanceReceiptStore(c, deps);
  let state = null;
  if (active) {
    store.claimCurrent(new Date(now).toISOString());
    state = store.writeState({ schema: 'phoenix.legacy-maintenance-state/v1', context: c, contextDigest: bindingDigest(c), phase, status, receipts: [], updatedAt: new Date(now).toISOString() });
    store.beginMarker({ from: phase, to, operation, previousStateDigest: state.stateDigest, startedAt: new Date(now).toISOString() });
  }
  return { c, directory, deps, store, state,
    options: () => ({ directory, context: c, approval: approval(c), operation, expectedPhase: state.phase, expectedStateDigest: state.stateDigest, requiredBudgetMs: 10000 }) };
}
const allowed = f => ({ ...f.deps, verifyAuthority: async () => true });
test('modern release admits only absence, never bypasses the root/trusted directory guard', () => {
  const f = fixture({ active: false });
  assert.equal(assertModernReleaseAdmission({ directory: f.directory }, f.deps).result, 'ADMITTED');
  let inspected = false;
  assert.throws(() => assertModernReleaseAdmission({ directory: f.directory }, { ...f.deps, guard: () => { throw new Error('CONFIG_HOLD=HOST_LOCK_REQUIRED'); }, inspectDirectory: () => { inspected = true; } }), /HOST_LOCK_REQUIRED/);
  assert.equal(inspected, false);
});
test('current owner blocks ordinary modern release across gaps between operation markers', () => {
  const f = fixture(); fs.renameSync(f.store.markerFile, path.join(f.directory, 'archived-marker.json'));
  assert.throws(() => assertModernReleaseAdmission({ directory: f.directory }, f.deps), /MAINTENANCE_LIFECYCLE_ACTIVE/);
  const markerOnly = fixture({ active: false }); fs.writeFileSync(path.join(markerOnly.directory, 'maintenance-transaction.json'), '{}', { mode: 0o600 });
  assert.throws(() => assertModernReleaseAdmission({ directory: markerOnly.directory }, markerOnly.deps), /MAINTENANCE_LIFECYCLE_ACTIVE/);
});
test('dangling current/transaction symlinks and EACCES cannot be treated as absent', () => {
  for (const name of ['maintenance-current.json', 'maintenance-transaction.json']) {
    const f = fixture({ active: false }); fs.symlinkSync(path.join(f.directory, 'missing'), path.join(f.directory, name));
    assert.throws(() => assertModernReleaseAdmission({ directory: f.directory }, f.deps), /MAINTENANCE_LIFECYCLE_ACTIVE/);
    const denied = fixture({ active: false }); const io = Object.create(fs);
    io.lstatSync = file => { if (file === path.join(denied.directory, name)) throw Object.assign(new Error('denied'), { code: 'EACCES' }); return fs.lstatSync(file); };
    assert.throws(() => assertModernReleaseAdmission({ directory: denied.directory }, { ...denied.deps, fs: io }), /MAINTENANCE_PATH_UNREADABLE/);
  }
});
test('orphan unfinished state and corrupted state digest block even if both markers are absent', () => {
  for (const corrupt of [false, true]) {
    const f = fixture(); fs.renameSync(f.store.currentFile, path.join(f.directory, 'orphan-owner.json')); fs.renameSync(f.store.markerFile, path.join(f.directory, 'orphan-marker.json'));
    if (corrupt) { const state = JSON.parse(fs.readFileSync(f.store.stateFile)); state.stateDigest = 'f'.repeat(64); fs.writeFileSync(f.store.stateFile, JSON.stringify(state)); }
    assert.throws(() => assertModernReleaseAdmission({ directory: f.directory }, f.deps), /ORPHAN_UNFINISHED_MAINTENANCE|STATE_CONTEXT_CHANGED/);
  }
});
test('only SUCCESS with final OPEN receipt and archived owner releases ordinary modern admission', () => {
  const f = fixture({ active: false }); f.store.claimCurrent(new Date(now).toISOString());
  const ref = f.store.appendReceipt('OPEN_PUBLISHED', { fixtureOnly: true }, null, new Date(now).toISOString());
  const state = f.store.writeState({ schema: 'phoenix.legacy-maintenance-state/v1', context: f.c, contextDigest: bindingDigest(f.c), phase: 'COMPLETED_OPEN', status: 'SUCCESS', receipts: [ref], updatedAt: new Date(now).toISOString() });
  assert.throws(() => assertModernReleaseAdmission({ directory: f.directory }, f.deps), /MAINTENANCE_LIFECYCLE_ACTIVE/);
  f.store.finishCurrent(state);
  assert.equal(assertModernReleaseAdmission({ directory: f.directory }, f.deps).result, 'ADMITTED');
  const ownerArchive = path.join(f.directory, `maintenance-owner-${f.c.owner}-${state.stateDigest}.json`);
  fs.renameSync(ownerArchive, path.join(f.directory, 'lost-owner-archive.json'));
  assert.throws(() => assertModernReleaseAdmission({ directory: f.directory }, f.deps), /MAINTENANCE_RECORD_REQUIRED/);
});
test('legacy exact owned intent requires independent authority, even with structurally approved review', async () => {
  const f = fixture(); await assert.rejects(assertLegacyMaintenanceAdmission(f.options(), f.deps), /INDEPENDENT_MAINTENANCE_AUTHORITY_REQUIRED/);
  const result = await assertLegacyMaintenanceAdmission(f.options(), allowed(f));
  assert.equal(result.mode, 'LEGACY_EXACT_INTENT'); assert.equal(result.operation, 'FENCE_INGRESS'); assert.equal(result.stateDigest, f.state.stateDigest);
});
test('legacy validates current owner/context, state digest, phase and exact marker through the real store', async () => {
  for (const mutate of [
    f => ({ ...f.options(), expectedPhase: 'INGRESS_FENCED' }),
    f => ({ ...f.options(), expectedStateDigest: 'f'.repeat(64) }),
    f => { const value = f.store.read(f.store.currentFile); value.owner = '999-1'; fs.writeFileSync(f.store.currentFile, JSON.stringify(value)); return f.options(); },
    f => { const value = f.store.read(f.store.markerFile); value.previousStateDigest = 'f'.repeat(64); fs.writeFileSync(f.store.markerFile, JSON.stringify(value)); return f.options(); },
    f => { const value = f.store.read(f.store.markerFile); value.operation = 'STOP_LEGACY'; fs.writeFileSync(f.store.markerFile, JSON.stringify(value)); return f.options(); },
  ]) {
    const f = fixture(); await assert.rejects(assertLegacyMaintenanceAdmission(mutate(f), allowed(f)), /MAINTENANCE_|EFFECT_|OPERATION_|INVALID_OPEN_/);
  }
});
test('legacy rejects changed target phase, stale intent time and inconsistent lifecycle status', async () => {
  for (const mutate of [
    f => { const marker = f.store.read(f.store.markerFile); marker.to = 'COMPLETED_OPEN'; fs.writeFileSync(f.store.markerFile, JSON.stringify(marker)); },
    f => { const marker = f.store.read(f.store.markerFile); marker.startedAt = '2026-10-18T00:21:00.000Z'; fs.writeFileSync(f.store.markerFile, JSON.stringify(marker)); },
    f => { const current = f.store.read(f.store.currentFile); current.claimedAt = '2026-10-17T00:00:00.000Z'; fs.writeFileSync(f.store.currentFile, JSON.stringify(current)); },
  ]) {
    const f = fixture(); mutate(f); await assert.rejects(assertLegacyMaintenanceAdmission(f.options(), allowed(f)), /MAINTENANCE_INTENT_MISMATCH|MAINTENANCE_INTENT_TIME_MISMATCH/);
  }
  const f = fixture({ status: 'SUCCESS' }); await assert.rejects(assertLegacyMaintenanceAdmission(f.options(), allowed(f)), /MAINTENANCE_PHASE_OR_DIGEST_MISMATCH/);
});
test('legacy lstat refuses dangling state and permission errors before authority or effect', async () => {
  for (const field of ['currentFile', 'markerFile', 'stateFile']) {
    const f = fixture(); fs.renameSync(f.store[field], path.join(f.directory, `previous-${field}.json`)); fs.symlinkSync(path.join(f.directory, 'missing'), f.store[field]);
    await assert.rejects(assertLegacyMaintenanceAdmission(f.options(), allowed(f)), /FILE_PERMISSIONS_OR_LINK/);
    const denied = fixture(), io = Object.create(fs);
    io.lstatSync = file => { if (file === denied.store[field]) throw Object.assign(new Error('denied'), { code: 'EACCES' }); return fs.lstatSync(file); };
    await assert.rejects(assertLegacyMaintenanceAdmission(denied.options(), { ...allowed(denied), fs: io }), /MAINTENANCE_PATH_UNREADABLE/);
  }
});
test('legacy rejects self-review, wrong target, unapproved operation and weakened reviewer authority', async () => {
  for (const mutate of [a => { a.serverRecord.reviewer = a.serverRecord.author; }, a => { a.serverRecord.commitId = old; }, a => { a.serverRecord.permission = 'WRITE'; }, a => { a.payload.operations = ['STOP_LEGACY']; }]) {
    const f = fixture(), options = f.options(); mutate(options.approval);
    await assert.rejects(assertLegacyMaintenanceAdmission(options, allowed(f)), /INDEPENDENT_MAINTENANCE_AUTHORITY_REQUIRED/);
  }
});
test('legacy deadline includes command budget and is rechecked after asynchronous authority retrieval', async () => {
  const f = fixture();
  for (const budget of [undefined, 0, -1, 600000]) await assert.rejects(assertLegacyMaintenanceAdmission({ ...f.options(), requiredBudgetMs: budget }, allowed(f)), /MAINTENANCE_OPERATION_BUDGET_REQUIRED|MAINTENANCE_WINDOW_CLOSED/);
  let clock = now;
  await assert.rejects(assertLegacyMaintenanceAdmission(f.options(), { ...f.deps, now: () => clock, verifyAuthority: async () => { clock += 600000; return true; } }), /MAINTENANCE_WINDOW_CLOSED/);
});
test('authority transport errors remain sanitized HOLD and cannot grant admission', async () => {
  const f = fixture();
  await assert.rejects(assertLegacyMaintenanceAdmission(f.options(), { ...f.deps, verifyAuthority: async () => { throw new Error('fixture-only private transport detail'); } }),
    error => error.message === 'MAINTENANCE_HOLD=INDEPENDENT_MAINTENANCE_AUTHORITY_REQUIRED');
});
test('legacy rechecks all files after authority: replacing identical intent inode is rejected', async () => {
  const f = fixture();
  await assert.rejects(assertLegacyMaintenanceAdmission(f.options(), { ...f.deps, verifyAuthority: async () => {
    const content = fs.readFileSync(f.store.markerFile); fs.renameSync(f.store.markerFile, path.join(f.directory, 'previous-marker.json')); fs.writeFileSync(f.store.markerFile, content, { mode: 0o600 }); return true;
  } }), /MAINTENANCE_ADMISSION_CHANGED/);
});
test('legacy child operations remain bound to FENCE_INGRESS intent and their own approval scope', async () => {
  const f = fixture();
  for (const operation of ['DISABLE_RESTART_POLICY', 'DISCONNECT_LEGACY_NETWORKS']) {
    const result = await assertLegacyMaintenanceAdmission({ ...f.options(), operation }, allowed(f));
    assert.equal(result.operation, operation); assert.equal(result.intentOperation, 'FENCE_INGRESS');
  }
  await assert.rejects(assertLegacyMaintenanceAdmission({ ...f.options(), operation: 'RUN_ARBITRARY_SHELL' }, allowed(f)), /MAINTENANCE_TYPED_OPERATION_REQUIRED/);
});
test('OPEN admission accepts only the real store exact private commit projection', async () => {
  const f = fixture({ active: false }); f.store.claimCurrent(new Date(now).toISOString());
  const prior = f.store.writeState({ schema: 'phoenix.legacy-maintenance-state/v1', context: f.c, contextDigest: bindingDigest(f.c), phase: 'VERIFIED_FENCED', status: 'FENCED', receipts: [], updatedAt: new Date(now - 1).toISOString() });
  f.store.beginMarker({ from: 'VERIFIED_FENCED', to: 'COMPLETED_OPEN', operation: 'OPEN_CANDIDATE', previousStateDigest: prior.stateDigest, previousState: prior, startedAt: new Date(now).toISOString() });
  const ref = f.store.appendReceipt('COMPLETION', {}, prior, new Date(now).toISOString());
  const { stateDigest, ...content } = prior;
  const state = f.store.writeState({ ...content, phase: 'COMPLETED_OPEN', status: 'OPEN_COMMIT_PENDING', receipts: [ref], updatedAt: new Date(now).toISOString() });
  const options = { directory: f.directory, context: f.c, approval: approval(f.c), operation: 'OPEN_CANDIDATE', expectedPhase: state.phase, expectedStateDigest: state.stateDigest, requiredBudgetMs: 10000 };
  assert.equal((await assertLegacyMaintenanceAdmission(options, allowed(f))).result, 'ADMITTED');
  const changed = f.store.writeState({ ...content, phase: 'COMPLETED_OPEN', status: 'OPEN_COMMIT_PENDING', receipts: [ref], updatedAt: new Date(now - 1).toISOString() });
  await assert.rejects(assertLegacyMaintenanceAdmission({ ...options, expectedStateDigest: changed.stateDigest }, allowed(f)), /INVALID_OPEN_EFFECT_PROJECTION/);
});
