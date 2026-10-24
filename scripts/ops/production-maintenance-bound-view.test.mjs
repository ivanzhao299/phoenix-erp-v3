/** Real owned local files and FD races; synthetic runtime/authority only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { phaseFixture } from '../ci/maintenance-owned-candidate.fixture.mjs';

async function using(action) { const f = await phaseFixture(); try { return await action(f); } finally { await f.close(); } }
const request = f => ({ expectedStateDigest: f.h.store.readState().stateDigest, replacementStateDigest: f.root.expectedStateDigest });
const view = (f, extra = {}) => f.h.store.readCandidateBindingView({ ...request(f), ...extra });
function interceptArchiveRead(action) {
  const original = fs.readSync; let intercepted = false;
  fs.readSync = function(fd, ...args) {
    const n = original.call(this, fd, ...args);
    const target = fs.readlinkSync(`/proc/self/fd/${fd}`);
    if (!intercepted && path.basename(target).startsWith('maintenance-intent-')) { intercepted = true; action(fd, target); }
    return n;
  };
  return { restore() { fs.readSync = original; }, observed: () => intercepted };
}
for (const phase of ['CF', 'VF']) test(`fixed binding view matches actual complete ${phase} phase and evidence`, () => using(async f => {
  if (phase === 'VF') await f.verify();
  const r = request(f), first = f.h.store.readCandidateBindingView(r);
  assert.deepEqual({ state: first.state, anchor: first.anchor }, f.h.store.readCandidateLeaseState(r));
  assert.deepEqual(first.bindings, f.h.store.readCandidateBindingEvidence({ expectedStateDigest: r.expectedStateDigest }));
  assert.deepEqual(Object.keys(first).sort(), ['anchor', 'bindings', 'state']);
  first.state.context.owner = 'caller-change'; first.anchor.owner = 'caller-change'; first.bindings.candidate.owner = 'caller-change';
  const next = f.h.store.readCandidateBindingView(r);
  assert.equal(next.state.context.owner, f.h.context.owner); assert.equal(next.anchor.owner, f.h.context.owner);
  assert.notEqual(next.bindings.candidate.owner, 'caller-change');
}));
for (const extra of [{ view: {} }, { receipts: [] }, { skipGuard: true }, { read() {} }, { timeoutMs: 0 }, { timeoutMs: 30001 }])
  test('fixed view refuses caller capability/cache/invalid budget ' + Object.keys(extra), () => using(async f => {
    assert.throws(() => view(f, extra), /CANDIDATE_PHASE_ANCHOR_REQUEST|RECEIPT_SNAPSHOT_BUDGET/);
  }));
for (const phase of ['CF', 'VF']) test(`tail receipt corruption remains rejected in ${phase}`, () => using(async f => {
  if (phase === 'VF') await f.verify();
  const r = request(f), state = f.h.store.readState(), file = f.h.store.receiptFile(state.receipts.at(-1)), bytes = fs.readFileSync(file);
  try { const value = JSON.parse(bytes); value.owner = 'foreign-owner'; fs.writeFileSync(file, JSON.stringify(value));
    assert.throws(() => f.h.store.readCandidateBindingView(r), /RECEIPT_DIGEST|RECEIPT_CHAIN/);
  } finally { fs.writeFileSync(file, bytes); }
}));
for (const mode of ['symlink', 'hardlink', 'fifo']) test('archive file rejects ' + mode, () => using(async f => {
  const state = f.h.store.readState(), r = request(f), file = path.join(f.h.store.directory, `maintenance-intent-${f.h.context.owner}-${state.stateDigest}.json`), backup = file + '.owned-original';
  fs.renameSync(file, backup);
  try {
    if (mode === 'symlink') fs.symlinkSync(backup, file);
    else if (mode === 'hardlink') fs.linkSync(backup, file);
    else execFileSync('/usr/bin/mkfifo', ['-m', '600', file]);
    assert.throws(() => f.h.store.readCandidateBindingView(r), /UNTRUSTED_RECEIPT_FILE|ELOOP/);
  } finally { if (fs.existsSync(file)) fs.unlinkSync(file); fs.renameSync(backup, file); }
}));
for (const field of ['owner', 'state', 'absent-marker']) test('final pinned sweep rejects concurrent ' + field + ' drift', { skip: process.platform !== 'linux' }, () => using(async f => {
  const r = request(f), store = f.h.store, owner = fs.readFileSync(store.currentFile), state = fs.readFileSync(store.stateFile);
  assert.equal(fs.existsSync(store.markerFile), false);
  const hook = interceptArchiveRead(() => {
    if (field === 'owner') { const x = JSON.parse(owner); x.owner = 'foreign-owner'; fs.writeFileSync(store.currentFile, JSON.stringify(x)); }
    else if (field === 'state') { const x = JSON.parse(state); x.updatedAt = new Date(Date.parse(x.updatedAt) + 1).toISOString(); fs.writeFileSync(store.stateFile, JSON.stringify(x)); }
    else fs.writeFileSync(store.markerFile, JSON.stringify({ schema: 'phoenix.maintenance-intent/v1', owner: f.h.context.owner,
      contextDigest: store.digest, operation: 'VERIFY_CANDIDATE', from: 'CANDIDATE_FENCED', to: 'VERIFIED_FENCED',
      previousStateDigest: r.expectedStateDigest, startedAt: new Date().toISOString() }), { mode: 0o600, flag: 'wx' });
  });
  try { assert.throws(() => store.readCandidateBindingView(r), /RECEIPT_CHANGED|RECEIPT_SNAPSHOT_DIRECTORY_CHANGED/); assert.equal(hook.observed(), true); }
  finally { hook.restore(); fs.writeFileSync(store.currentFile, owner); fs.writeFileSync(store.stateFile, state); if (fs.existsSync(store.markerFile)) fs.unlinkSync(store.markerFile); }
}));
test('final clone cannot return after the original snapshot budget', () => using(async f => {
  const r = request(f), clone = globalThis.structuredClone, descriptor = Object.getOwnPropertyDescriptor(performance, 'now'); let clock = 0, selected = false;
  Object.defineProperty(performance, 'now', { configurable: true, value: () => clock });
  globalThis.structuredClone = value => { const x = clone(value); if (value?.state && value.anchor && value.bindings) { selected = true; clock = 1000; } return x; };
  try { assert.throws(() => f.h.store.readCandidateBindingView({ ...r, timeoutMs: 1000 }), /RECEIPT_SNAPSHOT_DEADLINE/); assert.equal(selected, true); }
  finally { globalThis.structuredClone = clone; if (descriptor) Object.defineProperty(performance, 'now', descriptor); else Reflect.deleteProperty(performance, 'now'); }
}));
test('abort in pinned archive IO closes the original file descriptor and refuses a view', { skip: process.platform !== 'linux' }, () => using(async f => {
  const r = request(f), controller = new AbortController(); let originalFd;
  const hook = interceptArchiveRead(fd => { originalFd = fd; controller.abort(); });
  try { assert.throws(() => f.h.store.readCandidateBindingView({ ...r, signal: controller.signal }), /RECEIPT_SNAPSHOT_DEADLINE/); assert.equal(hook.observed(), true); assert.throws(() => fs.fstatSync(originalFd), { code: 'EBADF' }); }
  finally { hook.restore(); }
}));
test('a previous returned view cannot hide owner replacement after await', () => using(async f => {
  const r = request(f), before = f.h.store.readCandidateBindingView(r), bytes = fs.readFileSync(f.h.store.currentFile);
  await Promise.resolve(); const changed = JSON.parse(bytes); changed.owner = 'foreign-owner'; fs.writeFileSync(f.h.store.currentFile, JSON.stringify(changed));
  try { assert.equal(before.state.context.owner, f.h.context.owner); assert.throws(() => f.h.store.readCandidateBindingView(r), /ANOTHER_MAINTENANCE_OWNER_ACTIVE/); }
  finally { fs.writeFileSync(f.h.store.currentFile, bytes); }
}));
test('OPEN view validates the original prior projection and refuses an altered prior', () => using(async f => {
  await f.verify(); f.h.adapters.openCandidate = async () => {
    const r = request(f), first = f.h.store.readCandidateBindingView(r); assert.equal(first.state.status, 'OPEN_COMMIT_PENDING');
    const file = f.h.store.markerFile, bytes = fs.readFileSync(file);
    try { const changed = JSON.parse(bytes); changed.previousState.updatedAt = new Date(Date.parse(changed.previousState.updatedAt) + 1).toISOString(); fs.writeFileSync(file, JSON.stringify(changed));
      assert.throws(() => f.h.store.readCandidateBindingView(r), /INVALID_OPEN_EFFECT_PROJECTION/);
    } finally { fs.writeFileSync(file, bytes); }
    throw Error('OWNED_OPEN_VIEW_TEST_COMPLETE');
  };
  await assert.rejects(f.h.engine.complete({ completionEvidence: f.h.completion }), /OWNED_OPEN_VIEW_TEST_COMPLETE/);
}));
test('archive changed by the ending guard is caught by the final sweep', () => using(async f => {
  const r = request(f), store = f.h.store, state = store.readState(), file = path.join(store.directory, `maintenance-intent-${f.h.context.owner}-${state.stateDigest}.json`);
  const bytes = fs.readFileSync(file), guard = store.guard; let calls = 0, changed = false;
  store.guard = function() { guard(); if (++calls === 2) { const value = JSON.parse(bytes); value.startedAt = new Date(Date.parse(value.startedAt) + 1).toISOString(); fs.writeFileSync(file, JSON.stringify(value)); changed = true; } };
  try { assert.throws(() => store.readCandidateBindingView(r), /RECEIPT_CHANGED/); assert.equal(changed, true); }
  finally { store.guard = guard; fs.writeFileSync(file, bytes); }
}));
test('expired outer budget prevents another archive read instead of resetting a nested deadline', { skip: process.platform !== 'linux' }, () => using(async f => {
  const r = request(f), descriptor = Object.getOwnPropertyDescriptor(performance, 'now'), original = fs.readSync; let clock = 0, clockCalls = 0, expired = false, readsAfterExpiry = 0;
  // Outer start/check/remaining happen at 0; only the nested budget starts
  // at 100. At archive IO outer elapsed=1000 but nested elapsed=900<1000.
  // A reset nested deadline would admit another read before the outer exit check.
  Object.defineProperty(performance, 'now', { configurable: true, value: () => { if (++clockCalls === 4) clock = 100; return clock; } });
  fs.readSync = function(fd, ...args) { if (expired) readsAfterExpiry++; const n = original.call(this, fd, ...args);
    if (path.basename(fs.readlinkSync(`/proc/self/fd/${fd}`)).startsWith('maintenance-intent-')) { clock = 1000; expired = true; } return n; };
  try { assert.throws(() => f.h.store.readCandidateBindingView({ ...r, timeoutMs: 1000 }), /RECEIPT_SNAPSHOT_DEADLINE/); assert.equal(expired, true); assert.equal(readsAfterExpiry, 0); }
  finally { fs.readSync = original; if (descriptor) Object.defineProperty(performance, 'now', descriptor); else Reflect.deleteProperty(performance, 'now'); }
}));

for (const boundary of ['realpath', 'directory-open', 'file-lstat', 'file-open', 'file-fstat', 'final-directory-fstat'])
  test('deadline after ' + boundary + ' launches no further snapshot IO and closes opened FDs', { skip: process.platform !== 'linux' }, () => using(async f => {
    const r = request(f), descriptor = Object.getOwnPropertyDescriptor(performance, 'now');
    const names = ['realpathSync', 'openSync', 'lstatSync', 'fstatSync', 'readSync'];
    const originals = Object.fromEntries(names.map(name => [name, fs[name]]));
    let clock = 0, expired = false, afterExpiry = 0, directoryFd, fileFd, directoryStats = 0;
    Object.defineProperty(performance, 'now', { configurable: true, value: () => clock });
    for (const name of names) fs[name] = function(...args) {
      if (expired) afterExpiry++;
      const result = originals[name].apply(this, args);
      const target = typeof args[0] === 'number' ? fs.readlinkSync(`/proc/self/fd/${args[0]}`) : String(args[0]);
      const directory = target === f.h.store.directory;
      const owner = path.basename(target) === path.basename(f.h.store.currentFile);
      if (name === 'openSync' && directory) directoryFd = result;
      if (name === 'openSync' && owner) fileFd = result;
      if (name === 'fstatSync' && directory) directoryStats++;
      const hit = (boundary === 'realpath' && name === 'realpathSync' && directory)
        || (boundary === 'directory-open' && name === 'openSync' && directory)
        || (boundary === 'file-lstat' && name === 'lstatSync' && owner)
        || (boundary === 'file-open' && name === 'openSync' && owner)
        || (boundary === 'file-fstat' && name === 'fstatSync' && owner)
        || (boundary === 'final-directory-fstat' && name === 'fstatSync' && directory && directoryStats === 2);
      if (hit) { clock = 1000; expired = true; }
      return result;
    };
    try {
      assert.throws(() => f.h.store.readCandidateBindingView({ ...r, timeoutMs: 1000 }), /RECEIPT_SNAPSHOT_DEADLINE/);
      assert.equal(expired, true); assert.equal(afterExpiry, 0);
      for (const fd of [directoryFd, fileFd].filter(x => x !== undefined)) assert.throws(() => originals.fstatSync(fd), { code: 'EBADF' });
    } finally {
      for (const name of names) fs[name] = originals[name];
      if (descriptor) Object.defineProperty(performance, 'now', descriptor); else Reflect.deleteProperty(performance, 'now');
    }
  }));
