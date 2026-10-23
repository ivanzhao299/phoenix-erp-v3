/** Owned actual filesystem races; injected guard faults are not native FD9/ACL
 * proofs. Native protected-root fixtures remain required separately. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { harness } from '../ci/maintenance-transition-fixture.mjs';
import { canonicalDigest } from './production-maintenance-receipts.mjs';
function fixture({ absent = false } = {}) {
  const h = harness(), s = h.store;
  if (!absent) {
    const a = s.appendReceipt('LOCAL', { count: 1 }, null, '2026-10-18T01:10:00.000Z');
    const b = s.appendReceipt('LOCAL', { count: 2 }, { receipts: [a] }, '2026-10-18T01:10:00.000Z');
    s.writeState({ context: s.context, contextDigest: s.digest, receipts: [a,b] });
  }
  return { ...h, s };
}
function duringRead(s, target, action, body) {
  const open = fs.openSync, read = fs.readSync, close = fs.closeSync, fds = new Map(); let done = false;
  fs.openSync = (...args) => { const fd = open(...args); fds.set(fd, String(args[0])); return fd; };
  fs.closeSync = fd => { fds.delete(fd); return close(fd); };
  fs.readSync = (...args) => { const result = read(...args);
    if (!done && fds.get(args[0])?.endsWith('/'+path.basename(target))) { done = true; action(); }
    return result;
  };
  try { body(); assert.equal(done, true); assert.equal(fds.size, 0, 'all snapshot directory/file descriptors closed'); }
  finally { fs.openSync = open; fs.readSync = read; fs.closeSync = close; }
}
test('state snapshot validates the real chain with two fresh boundary guards/inspections, not per-file caches', () => {
  const {s} = fixture(); let guards = 0, inspections = 0; const inspect = s.inspect;
  s.guard = () => { guards++; }; s.inspect = (...a) => { inspections++; return inspect(...a); };
  assert.equal(s.readState().receipts.length, 2); assert.equal(guards, 2); assert.equal(inspections, 2);
  s.readState(); assert.equal(guards, 4); assert.equal(inspections, 4);
});
for (const kind of ['same bytes rewrite', 'replacement inode']) test('final sweep rejects earlier receipt '+kind, () => {
  const {s} = fixture(), state = s.readState(), first = s.receiptFile(state.receipts[0]), second = s.receiptFile(state.receipts[1]);
  const raw = fs.readFileSync(first);
  duringRead(s, second, () => {
    if (kind === 'replacement inode') fs.renameSync(first, first+'.owned-retained');
    fs.writeFileSync(first, raw, {mode:0o600});
  }, () => assert.throws(() => s.readState(), /RECEIPT_CHANGED|SNAPSHOT_DIRECTORY_CHANGED/));
});
test('state replaced while reading receipts never returns the earlier state', () => {
  const {s} = fixture(), state = s.readState(), last = s.receiptFile(state.receipts[1]);
  duringRead(s, last, () => { const replacement = {...state, anotherField:true}; delete replacement.stateDigest; replacement.stateDigest = canonicalDigest(replacement);
    fs.writeFileSync(s.stateFile, JSON.stringify(replacement), {mode:0o600}); }, () => assert.throws(() => s.readState(), /RECEIPT_CHANGED/));
});
test('growth of the currently read file is rejected with bounded bytes and closed descriptors', () => {
  const {s} = fixture(), state = s.readState(), first = s.receiptFile(state.receipts[0]);
  duringRead(s, first, () => fs.appendFileSync(first, Buffer.alloc(1048577)),
    () => assert.throws(() => s.readState(), /RECEIPT_CHANGED|UNTRUSTED_RECEIPT_FILE/));
});
test('FIFO replacement between lstat and open refuses without waiting for a writer', { skip: process.platform !== 'linux' }, () => {
  // Independent watchdog: removing O_NONBLOCK must fail this test, not hang
  // the entire test worker. This child owns all paths and retained files.
  const program = `
    import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
    import {execFileSync} from 'node:child_process';
    import {harness} from './scripts/ci/maintenance-transition-fixture.mjs';
    const {store:s}=harness();
    const ref=s.appendReceipt('LOCAL',{count:1},null,'2026-10-18T01:10:00.000Z');
    s.writeState({context:s.context,contextDigest:s.digest,receipts:[ref]});
    const target=s.receiptFile(ref), original=fs.openSync; let swapped=false;
    fs.openSync=(file,...args)=>{if(!swapped&&String(file).endsWith('/'+path.basename(target))){
      swapped=true;fs.renameSync(target,target+'.owned-retained');execFileSync('mkfifo',['-m','600',target]);
    }return original(file,...args);};
    try{assert.throws(()=>s.readState(),/UNTRUSTED_RECEIPT_FILE/);assert.equal(swapped,true);}
    finally{fs.openSync=original;}
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', program], {
    cwd: new URL('../../', import.meta.url), timeout: 5000, encoding: 'utf8', maxBuffer: 16384,
  });
  assert.equal(child.error, undefined, 'independent FIFO watchdog must not expire');
  assert.equal(child.status, 0, child.stderr);
});
for (const kind of ['symlink','hardlink','permissions','growth']) test('late '+kind+' on an already read receipt refuses the whole batch', () => {
  const {s} = fixture(), state = s.readState(), first = s.receiptFile(state.receipts[0]), last = s.receiptFile(state.receipts[1]);
  duringRead(s, last, () => {
    if (kind === 'symlink') { fs.renameSync(first, first+'.owned-retained'); fs.symlinkSync(first+'.owned-retained',first); }
    if (kind === 'hardlink') fs.linkSync(first, first+'.owned-link');
    if (kind === 'permissions') fs.chmodSync(first,0o644);
    if (kind === 'growth') fs.appendFileSync(first,Buffer.alloc(1048577));
  }, () => assert.throws(() => s.readState(), /UNTRUSTED_RECEIPT_FILE|RECEIPT_CHANGED/));
});
test('pinned directory descriptor cannot legitimize a replaced named directory', () => {
  const {s} = fixture(), state = s.readState(), last = s.receiptFile(state.receipts[1]);
  duringRead(s, last, () => { const retained=s.directory+'-owned-retained'; assert.equal(fs.existsSync(retained),false);
    fs.renameSync(s.directory,retained); fs.mkdirSync(s.directory,{mode:0o700});
  }, () => assert.throws(() => s.readState(), /SNAPSHOT_DIRECTORY_CHANGED/));
});
for (const code of ['CONFIG_HOLD=HOST_LOCK_REQUIRED','CONFIG_HOLD=ACL_METADATA_UNAVAILABLE']) test('fresh ending guard fault stays a refusal '+code, () => {
  const {s} = fixture(); let calls = 0; s.guard = () => { if (++calls === 2) throw Error(code); };
  assert.throws(() => s.readState(), error => error.message===code); assert.equal(calls,2);
});
test('last sweep detects mutation made during the fresh ending directory inspection', () => {
  const {s}=fixture(), state=s.readState(), file=s.receiptFile(state.receipts[0]), inspect=s.inspect;let calls=0;
  s.inspect=(...args)=>{const result=inspect(...args);if(++calls===2)fs.appendFileSync(file,' ');return result;};
  assert.throws(()=>s.readState(),/RECEIPT_CHANGED/);assert.equal(calls,2);
});
test('missing state still verifies the ending guard and rejects appearance during its batch', () => {
  const {s} = fixture({absent:true}); let calls=0;
  s.guard=()=>{if(++calls===2)fs.writeFileSync(s.stateFile,'{}',{mode:0o600});};
  assert.throws(()=>s.readState(),/STATE_CONTEXT_CHANGED|SNAPSHOT_DIRECTORY_CHANGED/);assert.equal(calls,2);
});
test('truly absent state returns null only after both fresh guards',()=>{
  const {s}=fixture({absent:true});let calls=0;s.guard=()=>{calls++;};assert.equal(s.readState(),null);assert.equal(calls,2);
});
test('ending guard budget exhaustion and external abort cannot return already-read data',()=>{
  for(const kind of ['timeout','abort']){
    const {s}=fixture();let calls=0;const controller=new AbortController();
    s.guard=()=>{if(++calls===2){if(kind==='abort')controller.abort();else{const end=performance.now()+100;while(performance.now()<end){}}}};
    assert.throws(()=>s.readState({timeoutMs:50,signal:controller.signal}),/RECEIPT_SNAPSHOT_DEADLINE/);
  }
});
for(const option of [{timeoutMs:0},{timeoutMs:30001},{skipGuard:true},{signal:{}}])test('snapshot has no caller guard bypass '+JSON.stringify(option),()=>{
  const {s}=fixture();assert.throws(()=>s.readState(option),/RECEIPT_SNAPSHOT_BUDGET/);
});
test('later independent call revalidates newly changed semantic digest instead of using earlier content',()=>{
  const {s}=fixture(),state=s.readState(),ref=state.receipts[0],file=s.receiptFile(ref),raw=JSON.parse(fs.readFileSync(file,'utf8'));
  raw.payload.count=7;fs.writeFileSync(file,JSON.stringify(raw),{mode:0o600});assert.throws(()=>s.readState(),/RECEIPT_DIGEST/);
});
test('snapshot retains complete previous-digest chain validation',()=>{
  const {s}=fixture(),state=s.readState(),ref=state.receipts[1],value=JSON.parse(fs.readFileSync(s.receiptFile(ref),'utf8'));
  delete value.digest;value.previousDigest='f'.repeat(64);value.digest=canonicalDigest(value);
  const next={sequence:ref.sequence,digest:value.digest};fs.writeFileSync(s.receiptFile(next),JSON.stringify(value),{mode:0o600});state.receipts[1]=next;
  delete state.stateDigest;state.stateDigest=canonicalDigest(state);fs.writeFileSync(s.stateFile,JSON.stringify(state),{mode:0o600});
  assert.throws(()=>s.readState(),/RECEIPT_CHAIN_BROKEN/);
});
