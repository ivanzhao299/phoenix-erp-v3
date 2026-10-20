/** Actual owned IPC children and close promises; synthetic controller protocol.
 * No release effect, production approval, ingress or drain is tested here. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once, getEventListeners } from 'node:events';
import { openControlParticipantFixture as local } from '../ci/maintenance-control-participants.fixture.mjs';
import { MaintenanceControlParticipants, CONTROL_PARTICIPANT_ROLES } from './production-maintenance-control-participants.mjs';


async function using(action, options) { const f = await local(options); try { return await action(f); } finally { await f.cleanup(); } }

test('three actual long-lived controllers remain explicit at foreground boundaries, then close in dependency order', () => using(async f => {
  const inventory = await f.graph.bootstrap();
  assert.equal(inventory.graphClosed, false); assert.equal(inventory.admissionOrApprovalGranted, false);
  assert.equal(inventory.participants.length, 3); assert.ok(inventory.participants.every(x => x.phase === 'READY' && !x.originalCloseObserved));
  await f.graph.check(); await f.graph.check(); assert.equal(f.probes.length, 9);
  assert.equal(new Set(f.probes.map(x => x.nonce)).size, 9);
  const closing = f.graph.close(); assert.equal(f.graph.close(), closing);
  const closed = await closing; assert.equal(closed.graphClosed, true); assert.equal(closed.pendingProtocols, 0);
  assert.equal(f.graph.inventory().graphClosed, true);
  assert.ok(closed.participants.every(x => x.phase === 'CLOSED' && x.originalCloseObserved));
  assert.deepEqual(f.closeOrder, [...CONTROL_PARTICIPANT_ROLES].reverse());
  assert.throws(() => f.graph.assertLive(), /HOLD=/);
}));
test('concurrent control-read saturation is bounded and stays failed after all actual children close', () => using(async f => {
  await f.graph.bootstrap();
  const values = await Promise.allSettled(Array.from({ length: 20 }, () => f.graph.check()));
  assert.equal(values.every(x => x.status === 'rejected'), true);
  assert.ok(f.graph.inventory().pendingProtocols <= 16);
  assert.equal((await f.graph.close()).graphClosed, true);
  await assert.rejects(f.graph.check(), /CONTROL_QUEUE_LIMIT/);
}));
test('missing/duplicate roles and arbitrary definition fields are refused before startup', () => using(async f => {
  for (const definitions of [[], f.definitions.slice(1), [f.definitions[0], f.definitions[0], f.definitions[2]],
    f.definitions.map((d, i) => i ? d : { ...d, approved: true })])
    assert.throws(() => new MaintenanceControlParticipants({ context: f.context, definitions }), /HOLD=/);
  assert.equal(f.clients.length, 0);
}));
for (const field of ['nonce', 'contextDigest', 'childPid', 'role', 'sourceSha256', 'pending'])
  test('actual IPC reply with changed ' + field + ' poisons the original graph', () => using(async f => {
    await assert.rejects(f.graph.bootstrap(), /PARTICIPANT_HEALTH_UNVERIFIED/);
    assert.throws(() => f.graph.assertLive(), /HOLD=/);
    const closed = await f.graph.close(); assert.equal(closed.graphClosed, true);
  }, { probe(response) { return { ...response, [field]: field === 'childPid' ? process.pid : field === 'pending' ? 1 : 'foreign' }; } }));
test('unexpected exit after handshake is sticky HOLD even with exit0 and closed original process', () => using(async f => {
  await f.graph.bootstrap(); const c = f.clients[1]; c.child.send({ operation: 'CLOSE' }); await c.joined;
  assert.throws(() => f.graph.assertLive(), /UNEXPECTED_PARTICIPANT_LOSS/);
  await assert.rejects(f.graph.check(), /UNEXPECTED_PARTICIPANT_LOSS/);
  assert.equal((await f.graph.close()).graphClosed, true);
}));
test('duplicate registration is refused and retains actual child debt after the callback fails', () => using(async f => {
  const original = f.definitions[0].start;
  const definitions = f.definitions.map((d, i) => i ? d : { ...d, async start(o) {
    return original({ ...o, registerOwnedChild(child) { o.registerOwnedChild(child); o.registerOwnedChild(child); } });
  } });
  const graph = new MaintenanceControlParticipants({ context: f.context, definitions });
  await assert.rejects(graph.bootstrap(), /ORIGINAL_CHILD_REGISTRATION_REQUIRED/);
  await assert.rejects(graph.close({ timeoutMs: 50 }), /CLOSE_UNVERIFIED/);
}));
test('a rejected second actual child cannot disappear behind the closed first child of the same role', () => using(async f => {
  const original = f.definitions[0].start; let second;
  const definitions = f.definitions.map((d, i) => i ? d : { ...d, async start(options) {
    const first = await original(options);
    const child = fork(first.child.spawnargs[1], [], { execPath: process.execPath, env: { PATH: '/usr/bin:/bin' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    const joined = once(child, 'close'); child.stdout.resume(); child.stderr.resume();
    second = { child, joined }; f.clients.push(second);
    try { options.registerOwnedChild(child); } catch { /* Deliberate bad factory attempt; debt must remain. */ }
    first.child.send({ operation: 'CLOSE' }); await first.joined;
    return first;
  } });
  const graph = new MaintenanceControlParticipants({ context: f.context, definitions });
  await assert.rejects(graph.bootstrap(), /HOLD=/);
  await assert.rejects(graph.close(), /CLOSE_UNVERIFIED/);
  const debt = graph.inventory(); assert.equal(debt.graphClosed, false);
  assert.equal(debt.rejectedRegistrations.some(x => x.pid === second.child.pid && !x.originalCloseObserved), true);
  assert.equal(second.child.exitCode, null); assert.equal(second.child.connected, true);
}));
test('a late real registration attempt invalidates current closure without rewriting the historical close fact', async () => {
  let register;
  const f = await local({ start(client, options) { register ||= options.registerOwnedChild; return client; } });
  try {
    await f.graph.bootstrap(); const receipt = await f.graph.close(); assert.equal(receipt.graphClosed, true);
    const child = fork(f.clients[0].child.spawnargs[1], [], { execPath: process.execPath, env: { PATH: '/usr/bin:/bin' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    const joined = once(child, 'close'); child.stdout.resume(); child.stderr.resume(); f.clients.push({ child, joined });
    assert.throws(() => register(child), /ORIGINAL_CHILD_REGISTRATION_REQUIRED/);
    assert.equal(receipt.graphClosed, true); assert.equal(f.graph.inventory().graphClosed, false);
    await assert.rejects(f.graph.close(), /CLOSE_HISTORY_INVALIDATED/);
    assert.equal(child.exitCode, null);
  } finally { await f.cleanup(); }
});
test('closing an active cooperative probe joins actual work without aborting its cleanup waiter', async () => {
  let active, probing; const started = new Promise(resolve => { probing = resolve; });
  const f = await local({ probe(response, client, options) {
    if (!active) return response;
    probing(); return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => { setImmediate(() => reject(Error('OWNED_COOPERATIVE_ABORT'))); }, { once: true });
    });
  } });
  try {
    await f.graph.bootstrap(); active = true;
    const checking = f.graph.check(); const rejected = assert.rejects(checking, /HOLD=/); await started;
    const closing = f.graph.close(); await rejected;
    assert.equal((await closing).graphClosed, true); assert.equal(f.graph.inventory().pendingProtocols, 0);
    assert.throws(() => f.graph.assertLive(), /HOLD=/); // Failed health is not rehabilitated.
  } finally { await f.cleanup(); }
});
test('an abort-ignoring live probe remains debt and prevents dependent controllers from closing', async () => {
  let active, finish, entered; const started = new Promise(resolve => { entered = resolve; });
  const f = await local({ probe(response) {
    if (!active) return response; entered(); return new Promise(resolve => { finish = () => resolve(response); });
  } });
  try {
    await f.graph.bootstrap(); active = true;
    const checking = f.graph.check(), rejected = assert.rejects(checking, /HOLD=/); await started;
    const closing = f.graph.close({ timeoutMs: 40 }); await rejected; await assert.rejects(closing, /CLOSE_UNVERIFIED/);
    assert.ok(f.graph.inventory().pendingProtocols > 0); assert.deepEqual(f.closeOrder, []);
    assert.ok(f.clients.every(c => c.child.connected && c.child.exitCode === null));
    finish(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.graph.close(), closing); await assert.rejects(closing, /CLOSE_UNVERIFIED/);
  } finally { if (finish) finish(); await f.cleanup(); }
});
test('invalid budget cannot capture startup or valid final close', () => using(async f => {
  await assert.rejects(f.graph.bootstrap({ timeoutMs: 0 }), /FIXED_BUDGET_REQUIRED/); assert.equal(f.clients.length, 0);
  await f.graph.bootstrap(); await assert.rejects(f.graph.close({ timeoutMs: 0 }), /FIXED_BUDGET_REQUIRED/);
  assert.equal((await f.graph.close()).graphClosed, true);
}));
test('pre-aborted probe leaves no abort listeners outside its owned cleanup scope', () => using(async f => {
  await f.graph.bootstrap(); const controller = new AbortController(); controller.abort();
  await assert.rejects(f.graph.check({ signal: controller.signal }), /HOLD=/);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  assert.equal((await f.graph.close()).graphClosed, true);
}));
test('an original close with a failed control-process exit preserves that fact and refuses clean graph closure', () => using(async f => {
  await f.graph.bootstrap(); await assert.rejects(f.graph.close(), /CLOSE_UNVERIFIED/);
  const inventory = f.graph.inventory(); assert.equal(inventory.graphClosed, false);
  const closed = inventory.participants.filter(x => x.originalCloseObserved); assert.equal(closed.length, 1);
  assert.deepEqual(closed[0].exit, { code: 7, signal: null });
  assert.equal(f.clients.filter(c => c.child.connected).length, 2); // Verifiers remain owned/live.
}, { async close(client) { client.child.send({ operation: 'CLOSE_ERROR' }); await client.joined; } }));
test('startup deadline retains original work/child debt; late start cannot rehabilitate failed close', async () => {
  let finish, entered; const waiting = new Promise(resolve => { entered = resolve; });
  const f = await local({ start(client) { entered(); return new Promise(resolve => { finish = () => resolve(client); }); } });
  try {
    const startup = f.graph.bootstrap({ timeoutMs: 2000 }); await waiting;
    // Abort through the real wall budget after the child handshake. The original
    // start deliberately ignores abort; no receipt may erase that pending work.
    await assert.rejects(startup, /DEADLINE_OR_ABORT/);
    const closing = f.graph.close({ timeoutMs: 40 }); await assert.rejects(closing, /CLOSE_UNVERIFIED/);
    assert.ok(f.graph.inventory().pendingProtocols > 0); assert.equal(f.graph.inventory().graphClosed, false);
    finish(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.graph.close(), closing); await assert.rejects(closing, /CLOSE_UNVERIFIED/);
  } finally { if (finish) finish(); await f.cleanup(); }
});
test('host snapshot joins existing HEALTH and reserves the synchronous boundary before queued monitor probes',async()=>{
 let armed=false,unblock,entered;const started=new Promise(resolve=>{entered=resolve;});
 await using(async f=>{
  await f.graph.bootstrap();armed=true;const existing=f.graph.check();await started;
  let captured=false;const observation=f.graph.observeQuiescent(()=>{captured=true;assert.equal(f.probes.length,6);return {snapshot:'ACTUAL_SYNCHRONOUS_BOUNDARY'};});
  const queued=f.graph.check();await new Promise(resolve=>setImmediate(resolve));assert.equal(captured,false);assert.equal(f.probes.length,4);
  unblock();await existing;assert.deepEqual(await observation,{snapshot:'ACTUAL_SYNCHRONOUS_BOUNDARY'});await queued;assert.equal(f.probes.length,9);assert.equal((await f.graph.close()).graphClosed,true);
 },{async probe(response){if(armed){armed=false;entered();await new Promise(resolve=>{unblock=resolve;});}return response;}});
});
test('observation deadline cannot capture while an original HEALTH protocol remains outstanding',async()=>{
 let armed=false,unblock,entered;const started=new Promise(resolve=>{entered=resolve;});
 await using(async f=>{
  await f.graph.bootstrap();armed=true;const existing=f.graph.check({timeoutMs:500}).catch(error=>error);await started;
  let captured=0;await assert.rejects(f.graph.observeQuiescent(()=>{captured++;return {};},{timeoutMs:20}),/DEADLINE_OR_ABORT/);assert.equal(captured,0);
  unblock();assert.ok(await existing instanceof Error);assert.equal((await f.graph.close()).graphClosed,true);await assert.rejects(f.graph.check(),/HOLD=/);
 },{async probe(response){if(armed){armed=false;entered();await new Promise(resolve=>{unblock=resolve;});}return response;}});
});
test('asynchronous observers are rejected and cannot rehabilitate graph health',()=>using(async f=>{
 await f.graph.bootstrap();await assert.rejects(f.graph.observeQuiescent(()=>Promise.resolve({})),/SYNCHRONOUS_OBSERVER_REQUIRED/);await assert.rejects(f.graph.check(),/SYNCHRONOUS_OBSERVER_REQUIRED/);assert.equal((await f.graph.close()).graphClosed,true);
}));
