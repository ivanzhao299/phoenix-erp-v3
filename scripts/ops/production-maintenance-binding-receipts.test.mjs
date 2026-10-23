/** Actual owned private receipt/owner files, synthetic evidence payloads.
 * These tests do not grant authority or prove native FD9/ACL/performance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { harness, time } from '../ci/maintenance-transition-fixture.mjs';
function fixture({ phase = 'CANDIDATE_FENCED', duplicate = false, extra = false, omitReplacement = false } = {}) {
  const h = harness(), s = h.store; s.claimCurrent(time(0));
  const kinds = [...(omitReplacement ? [] : ['CANDIDATE_REPLACEMENT']), ...(phase === 'CANDIDATE_REPLACED' ? [] : ['CANDIDATE_FENCED']), ...(duplicate ? [typeof duplicate === 'string' ? duplicate : 'CANDIDATE_REPLACEMENT'] : []), ...(extra ? ['LOCAL'] : [])];
  const references = [], payloads = {};
  for (const kind of kinds) { const payload = h.evidence(kind, { fixture: kind }); payloads[kind] = payload;
    references.push(s.appendReceipt(kind, payload, references.length ? { receipts: [...references] } : null, time(0))); }
  s.writeState({ schema: 'phoenix.legacy-maintenance-state/v1', context: s.context, contextDigest: s.digest,
    phase, status: phase === 'CANDIDATE_REPLACED' ? 'HOLD_CANDIDATE_REVALIDATION_REQUIRED' : 'FENCED', legacyDrainResult: 'UNSUPPORTED', receipts: references, updatedAt: time(0) });
  const digest = s.readState().stateDigest;
  return { ...h, s, digest, payloads, read: extra => s.readCandidateBindingEvidence({ expectedStateDigest: digest, ...extra }) };
}
test('one owned snapshot selects both unique payloads, without public per-receipt scans or cache', () => {
  const f = fixture(); let guards = 0, inspections = 0; const inspect = f.s.inspect;
  f.s.guard = () => { guards++; }; f.s.inspect = (...args) => { inspections++; return inspect(...args); };
  f.s.readReceipt = () => assert.fail('caller must not rescan public per-receipt reads');
  const value = f.read(); assert.equal(value.stateDigest, f.digest);
  assert.deepEqual(value.replacement, f.payloads.CANDIDATE_REPLACEMENT); assert.deepEqual(value.candidate, f.payloads.CANDIDATE_FENCED);
  assert.equal(guards, 2); assert.equal(inspections, 2);
  value.replacement.body.fixture = 'mutated caller'; assert.deepEqual(f.read().replacement, f.payloads.CANDIDATE_REPLACEMENT);
  assert.equal(guards, 4); assert.equal(inspections, 4);
});
test('fixed owned state combines owner and full chain in one fresh batch for each checkpoint', () => {
  const f = fixture(); let guards = 0;
  f.s.guard = () => { guards++; };
  f.s.assertCurrent = f.s.readState = () => assert.fail('do not split owner and state into independent reads');
  const a = f.s.readOwnedState({ timeoutMs: 1000 }); assert.equal(a.stateDigest, f.digest); assert.equal(guards, 2);
  a.context.owner = 'changed'; assert.equal(f.s.readOwnedState().context.owner, f.context.owner); assert.equal(guards, 4);
  fs.renameSync(f.s.currentFile, f.s.currentFile+'.owned-retained');
  assert.throws(() => f.s.readOwnedState(), /MAINTENANCE_OWNER_REQUIRED/);
});
test('owned state checkpoint cannot return a corrupt unselected chain or an owner changed at ending guard', () => {
  const f = fixture({ extra: true }), state = f.s.readOwnedState(), file = f.s.receiptFile(state.receipts.at(-1));
  const row = JSON.parse(fs.readFileSync(file)); row.payload.body.fixture = 'corrupted'; fs.writeFileSync(file, JSON.stringify(row));
  assert.throws(() => f.s.readOwnedState(), /RECEIPT_DIGEST/);
  const g = fixture(); let guards = 0;
  g.s.guard = () => { if (++guards === 2) { const owner = JSON.parse(fs.readFileSync(g.s.currentFile)); owner.owner = '888-1'; fs.writeFileSync(g.s.currentFile, JSON.stringify(owner)); } };
  assert.throws(() => g.s.readOwnedState(), /RECEIPT_CHANGED/); assert.equal(guards, 2);
});
test('CR view requires no candidate; later phases require its one exact receipt', () => {
  const f = fixture({ phase: 'CANDIDATE_REPLACED' }); assert.equal(f.read().candidate, null);
  const state = f.s.readState(); delete state.stateDigest; state.phase = 'CANDIDATE_FENCED'; f.s.writeState(state);
  assert.throws(() => f.read({ expectedStateDigest: f.s.readState().stateDigest }), /CANDIDATE_BINDING_RECEIPT_UNIQUE/);
});
test('duplicate kind stays rejected even with a valid complete chain', () => {
  const f = fixture({ duplicate: true }); assert.throws(() => f.read(), /CANDIDATE_BINDING_RECEIPT_UNIQUE/);
});
test('a valid chain with no recorded replacement cannot borrow the caller evidence', () => {
  const f = fixture({ omitReplacement: true }); assert.throws(() => f.read(), /CANDIDATE_BINDING_RECEIPT_UNIQUE/);
});
for (const phase of ['CANDIDATE_REPLACED','CANDIDATE_FENCED']) test('valid chain cannot add an extra candidate receipt in '+phase, () => {
  const f = fixture({ phase, duplicate: 'CANDIDATE_FENCED' }); assert.throws(() => f.read(), /CANDIDATE_BINDING_RECEIPT_UNIQUE/);
});
test('unselected receipt corruption cannot be hidden by direct kind selection', () => {
  const f = fixture({ extra: true }), state = f.s.readState(), file = f.s.receiptFile(state.receipts.at(-1));
  const value = JSON.parse(fs.readFileSync(file, 'utf8')); value.payload.body.fixture = 'tampered'; fs.writeFileSync(file, JSON.stringify(value));
  assert.throws(() => f.read(), /RECEIPT_DIGEST/);
});
for (const kind of ['missing','different owner','permissions','hardlink']) test('fresh owned view refuses '+kind, () => {
  const f = fixture(), file = f.s.currentFile;
  if (kind === 'missing') fs.renameSync(file, file+'.owned-retained');
  if (kind === 'different owner') { const value = JSON.parse(fs.readFileSync(file, 'utf8')); value.owner = '777-1'; fs.writeFileSync(file, JSON.stringify(value)); }
  if (kind === 'permissions') fs.chmodSync(file, 0o644);
  if (kind === 'hardlink') fs.linkSync(file, file+'.owned-link');
  assert.throws(() => f.read(), /MAINTENANCE_OWNER_REQUIRED|ANOTHER_MAINTENANCE_OWNER_ACTIVE|UNTRUSTED_RECEIPT_FILE/);
});
test('ending guard owner mutation is included in the final pinned-file sweep', () => {
  const f = fixture(); let guards = 0;
  f.s.guard = () => { if (++guards === 2) { const value = JSON.parse(fs.readFileSync(f.s.currentFile, 'utf8')); value.owner = '888-1'; fs.writeFileSync(f.s.currentFile, JSON.stringify(value)); } };
  assert.throws(() => f.read(), /RECEIPT_CHANGED/); assert.equal(guards, 2);
});
test('owner inode replacement while reading a receipt refuses and closes all snapshot FDs', () => {
  const f = fixture(), target = path.basename(f.s.receiptFile(f.s.readState().receipts.at(-1)));
  const open = fs.openSync, close = fs.closeSync, read = fs.readSync, fds = new Map(); let changed = false;
  fs.openSync = (...args) => { const fd = open(...args); fds.set(fd, String(args[0])); return fd; };
  fs.closeSync = fd => { fds.delete(fd); return close(fd); };
  fs.readSync = (...args) => { const n = read(...args); if (!changed && fds.get(args[0])?.endsWith('/'+target)) {
    changed = true; const raw = fs.readFileSync(f.s.currentFile); fs.renameSync(f.s.currentFile, f.s.currentFile+'.owned-retained'); fs.writeFileSync(f.s.currentFile, raw, { mode: 0o600 });
  } return n; };
  try { assert.throws(() => f.read(), /RECEIPT_CHANGED|SNAPSHOT_DIRECTORY_CHANGED/); assert.equal(changed, true); assert.equal(fds.size, 0); }
  finally { fs.openSync = open; fs.closeSync = close; fs.readSync = read; }
});
test('stale state digest and external abort remain failures', () => {
  const f = fixture(); assert.throws(() => f.read({ expectedStateDigest: 'e'.repeat(64) }), /CANDIDATE_BINDING_RECEIPT_STATE/);
  const controller = new AbortController(); controller.abort(); assert.throws(() => f.read({ signal: controller.signal }), /RECEIPT_SNAPSHOT_DEADLINE/);
});
for (const request of [{ skipGuard: true }, { state: {} }, { receipts: [] }, { expectedStateDigest: 'short' }]) test('fixed view accepts no caller evidence or guard bypass '+JSON.stringify(request), () => {
  const f = fixture(); assert.throws(() => f.read(request), /CANDIDATE_BINDING_RECEIPT_REQUEST/);
});
for (const timeoutMs of [0,30001]) test('fixed view rejects invalid snapshot budget '+timeoutMs, () => {
  const f = fixture(); assert.throws(() => f.read({ timeoutMs }), /RECEIPT_SNAPSHOT_BUDGET/);
});
test('successful snapshot cannot return when final selection clone exhausts its original budget', () => {
  const f = fixture(), clone = globalThis.structuredClone, descriptor = Object.getOwnPropertyDescriptor(performance, 'now'); let clock = 0, selected = false;
  Object.defineProperty(performance, 'now', { configurable: true, value: () => clock });
  globalThis.structuredClone = value => { const result = clone(value);
    if (value?.stateDigest === f.digest && Object.hasOwn(value, 'replacement') && Object.hasOwn(value, 'candidate')) { selected = true; clock = 1000; }
    return result;
  };
  try { assert.throws(() => f.read({ timeoutMs: 1000 }), /RECEIPT_SNAPSHOT_DEADLINE/); assert.equal(selected, true); }
  finally { globalThis.structuredClone = clone; if (descriptor) Object.defineProperty(performance, 'now', descriptor); else Reflect.deleteProperty(performance, 'now'); }
});
