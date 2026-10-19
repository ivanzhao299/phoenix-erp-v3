/** Actual separate owned Node issuer; simulated approval, never GitHub access. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { once } from 'node:events';
import { performance } from 'node:perf_hooks';
import { fixture } from './maintenance-transition-fixture.mjs';
import { bindingDigest, canonicalDigest, verifyGithubMaintenanceAuthority } from '../ops/production-maintenance-receipts.mjs';
import { openFixtureAuthority, prepareFixtureAuthorityApproval, verifyFixtureAuthorityResponse } from './maintenance-fixture-authority.fixture.mjs';

function material() {
  const f = fixture({ clock: Date.now });
  return { context: f.context, records: [{ purpose: 'MAINTENANCE', payload: f.material.approval.payload }] };
}
function expected(context) { return { context, bindingDigest: bindingDigest(context), targetSha: context.targetSha, purpose: 'MAINTENANCE' }; }
async function using(action) {
  const initial = material(), service = await openFixtureAuthority(initial);
  try { return await action({ ...service, initial }); }
  finally { const closed = await service.controller.close(); assert.equal(closed.originalChildClosed, true); assert.equal(closed.productionAuthorized, false); }
}
test('separate child signs immutable records; runner receives no issuer or revocation capability', () => using(async ({ reader, controller, initial }) => {
  assert.notEqual(controller.childPid, process.pid); assert.ok(Number.isSafeInteger(controller.childPid));
  assert.deepEqual(Object.keys(reader).sort(), ['fixtureOnly', 'observeRecord', 'productionAuthorized', 'readApproval', 'source', 'verifyAuthority']);
  assert.equal(reader.source, 'SIMULATED_GITHUB_PROTOCOL'); assert.equal(reader.productionAuthorized, false);
  const approval = await reader.readApproval('MAINTENANCE');
  assert.equal(approval.fixtureOnly, true); assert.equal(approval.serverRecord.source, 'SIMULATED_GITHUB_PROTOCOL');
  assert.equal(await reader.verifyAuthority(approval, expected(initial.context)), true);
  // A structurally valid, simulated record still has NO default server verifier.
  assert.equal(await verifyGithubMaintenanceAuthority(approval, expected(initial.context)), false);
  assert.ok(!JSON.stringify({ reader, controller }).includes('PRIVATE KEY'));
}));
test('pre-controller unsigned proposal matches the frozen independent record but cannot authorize on its own', async () => {
  const initial = material(), proposal = prepareFixtureAuthorityApproval(initial, 'MAINTENANCE');
  assert.equal(proposal.serverRecord.submittedAt, initial.context.window.start);
  assert.equal(await verifyGithubMaintenanceAuthority(proposal, expected(initial.context)), false);
  const service = await openFixtureAuthority(initial);
  try {
    assert.deepEqual(await service.reader.readApproval('MAINTENANCE'), proposal);
    assert.equal(await service.reader.verifyAuthority(proposal, expected(initial.context)), true);
  } finally { await service.controller.close(); }
});
test('controller health read echoes its exact nonce in a fresh original-issuer signed response', () => using(async ({ reader, controller, initial }) => {
  const nonce = randomUUID(), requestedAt = Date.now();
  const response = await reader.observeRecord('MAINTENANCE', { nonce, timeoutMs: 1000 });
  assert.equal(verifyFixtureAuthorityResponse(controller.publicKey, response, { nonce, requestedAt, context: initial.context, purpose: 'MAINTENANCE' }), true);
  assert.equal(verifyFixtureAuthorityResponse(controller.publicKey, response, { nonce: randomUUID(), requestedAt, context: initial.context, purpose: 'MAINTENANCE' }), false);
  const next = await reader.observeRecord('MAINTENANCE', { nonce: randomUUID(), timeoutMs: 1000 });
  assert.notEqual(next.nonce, response.nonce); assert.notEqual(next.signature, response.signature);
}));
test('revocation also prevents a signed controller health read', () => using(async ({ reader, controller }) => {
  await controller.revoke('MAINTENANCE');
  await assert.rejects(reader.observeRecord('MAINTENANCE', { nonce: randomUUID() }), /FIXTURE_AUTHORITY_HOLD=/);
}));
test('initial caller mutation and returned approval mutation cannot update the independent frozen record', () => using(async ({ reader, initial }) => {
  const target = structuredClone(initial.context), approval = await reader.readApproval('MAINTENANCE');
  initial.records[0].payload.operations.length = 0; initial.context.owner = '99999-1';
  approval.payload.operations.length = 0;
  assert.equal(await reader.verifyAuthority(approval, expected(target)), false);
  const fresh = await reader.readApproval('MAINTENANCE'); assert.ok(fresh.payload.operations.length > 0);
  assert.equal(await reader.verifyAuthority(fresh, expected(target)), true);
}));
for (const [name, mutate] of [
  ['target', a => { a.serverRecord.commitId = 'd'.repeat(40); }],
  ['reviewer', a => { a.serverRecord.reviewer = a.serverRecord.author; }],
  ['permission', a => { a.serverRecord.permission = 'WRITE'; }],
  ['payload with recalculated digest', a => { a.payload.protocol = 'BYPASS'; a.payloadSha256 = canonicalDigest(a.payload); }],
  ['simulated label', a => { a.source = 'GITHUB'; }],
  ['production flag', a => { a.productionAuthorized = true; }],
  ['record digest', a => { a.serverRecord.rawRecordSha256 = 'e'.repeat(64); }],
]) test('independent record rejects mutated '+name, () => using(async ({ reader, initial }) => {
  const approval = await reader.readApproval('MAINTENANCE'); mutate(approval);
  assert.equal(await reader.verifyAuthority(approval, expected(initial.context)), false);
}));
test('same approval cannot be replayed into a changed owner, source helper, window or SHA', () => using(async ({ reader, initial }) => {
  const approval = await reader.readApproval('MAINTENANCE');
  for (const mutate of [c => { c.owner = '7654321-1'; }, c => { c.sourceHelperSha256 = 'f'.repeat(64); },
    c => { c.window.end = new Date(Date.parse(c.window.end) - 1000).toISOString(); }, c => { c.targetSha = c.candidate.revision = 'f'.repeat(40); }]) {
    const context = structuredClone(initial.context); mutate(context);
    assert.equal(await reader.verifyAuthority(approval, expected(context)), false);
  }
}));
test('revocation is visible to the same runner immediately; old approval cannot authorize new operations', () => using(async ({ reader, controller, initial }) => {
  const approval = await reader.readApproval('MAINTENANCE');
  assert.equal(await reader.verifyAuthority(approval, expected(initial.context)), true);
  assert.deepEqual(await controller.revoke('MAINTENANCE'), { revoked: true, version: 2 });
  assert.equal(await reader.verifyAuthority(approval, expected(initial.context)), false);
  await assert.rejects(reader.readApproval('MAINTENANCE'), /FIXTURE_AUTHORITY_HOLD=/);
  await assert.rejects(controller.revoke('MAINTENANCE'), /FIXTURE_AUTHORITY_HOLD=/);
}));
test('unknown purpose is denied, and a closed original child cannot authorize cached approval', async () => {
  const initial = material(), { reader, controller } = await openFixtureAuthority(initial);
  const approval = await reader.readApproval('MAINTENANCE');
  await assert.rejects(reader.readApproval('SIGN_ARBITRARY_INPUT'), /REQUEST_REFUSED/);
  const close = controller.close(); assert.equal(controller.close(), close);
  assert.equal((await close).originalChildClosed, true);
  assert.equal(await reader.verifyAuthority(approval, expected(initial.context)), false);
  await assert.rejects(reader.readApproval('MAINTENANCE'), /HOLD=/);
});
test('invalid budgets or pre-aborted authority read cannot grant admission', () => using(async ({ reader, initial }) => {
  const approval = await reader.readApproval('MAINTENANCE'), abort = new AbortController(); abort.abort();
  for (const options of [{ timeoutMs: 0 }, { timeoutMs: 10001 }, { signal: abort.signal }])
    assert.equal(await reader.verifyAuthority(approval, { ...expected(initial.context), ...options }), false);
}));
test('pure verifier exercises a valid signed baseline, then wrong key/nonce and tampering', () => using(async ({ reader, initial }) => {
  const approval = await reader.readApproval('MAINTENANCE'), pair = generateKeyPairSync('ed25519'), other = generateKeyPairSync('ed25519');
  const nonce = randomUUID(), requestedAt = Date.now(), body = { schema: 'phoenix.fixture-authority-response/v1', source: 'SIMULATED_GITHUB_PROTOCOL',
    fixtureOnly: true, productionAuthorized: false, nonce, contextDigest: bindingDigest(initial.context), targetSha: initial.context.targetSha,
    owner: initial.context.owner, observedAt: new Date(requestedAt).toISOString(), version: 1, revoked: false, approval };
  const response = { ...body, signature: sign(null, Buffer.from(canonicalDigest(body), 'ascii'), pair.privateKey).toString('base64') };
  const e = { context: initial.context, purpose: 'MAINTENANCE', nonce, requestedAt };
  assert.equal(verifyFixtureAuthorityResponse(pair.publicKey, response, e), true);
  assert.equal(verifyFixtureAuthorityResponse(other.publicKey, response, e), false);
  assert.equal(verifyFixtureAuthorityResponse(pair.publicKey, response, { ...e, nonce: randomUUID() }), false);
  for (const value of [null, {}, { ...response, signature: 'bad' }, { ...response, productionAuthorized: true }, { ...response, version: 2 }])
    assert.equal(verifyFixtureAuthorityResponse(pair.publicKey, value, e), false);
}));
test('bootstrap byte limit rejects oversized records before any child registration', async () => {
  const initial = material(); initial.records[0].payload.extra = 'x'.repeat(65536); let registered = false;
  await assert.rejects(openFixtureAuthority(initial, { registerOwnedChild() { registered = true; } })); assert.equal(registered, false);
});
test('parallel read saturation fails closed and does not leave unbounded pending messages', () => using(async ({ reader, controller }) => {
  const values = await Promise.allSettled(Array.from({ length: 17 }, () => reader.readApproval('MAINTENANCE')));
  assert.equal(values.every(v => v.status === 'rejected'), true); assert.ok(controller.cleanupDebt().pendingReads <= 16);
}));
test('failure to send CLOSE still joins saved original child and keeps failed receipt', async () => {
  const initial = material(); let child;
  const service = await openFixtureAuthority(initial, { registerOwnedChild(c) { child = c; } });
  child.send = (_, callback) => { callback(Error('OWNED_SYNTHETIC_SEND_FAILURE')); return false; };
  const closing = service.controller.close(); await assert.rejects(closing, /CLEANUP_UNVERIFIED/);
  assert.equal(service.controller.close(), closing); assert.equal(service.controller.cleanupDebt().originalChildClosed, true);
});
test('stopped original issuer exceeds one cleanup budget; late close never rehabilitates failed close', async () => {
  const initial = material(); let child;
  const service = await openFixtureAuthority(initial, { registerOwnedChild(c) { child = c; } }), joined = once(child, 'close');
  child.kill('SIGSTOP'); const start = performance.now(), closing = service.controller.close({ timeoutMs: 40 });
  try {
    await assert.rejects(closing, e => /CLEANUP_UNVERIFIED/.test(e.message) && e.cleanupDebt.childPid === child.pid);
    assert.ok(performance.now() - start < 1000); assert.equal(service.controller.cleanupDebt().originalChildClosed, false);
  } finally { child.kill('SIGCONT'); await joined; }
  assert.equal(service.controller.cleanupDebt().originalChildClosed, true); assert.equal(service.controller.close(), closing);
  await assert.rejects(closing, /CLEANUP_UNVERIFIED/);
});
test('INIT timeout returns bounded original-child debt, with ownership registered before handshake', async () => {
  let child, joined; const start = performance.now();
  try {
    await assert.rejects(openFixtureAuthority(material(), { timeoutMs: 40, registerOwnedChild(c) { child = c; joined = once(child, 'close'); child.kill('SIGSTOP'); } }),
      e => /CLEANUP_UNVERIFIED/.test(e.message) && e.cleanupDebt.childPid === child.pid && e.cleanupDebt.originalChildClosed === false);
    assert.ok(performance.now() - start < 1000);
  } finally { if (child) child.kill('SIGCONT'); if (joined) await joined; }
});
test('invalid close budget does not capture the first valid cleanup or abandon original child', async () => {
  const initial = material(), service = await openFixtureAuthority(initial);
  await assert.rejects(service.controller.close({ timeoutMs: 0 }), /FIXTURE_AUTHORITY_HOLD=/);
  assert.equal(service.controller.cleanupDebt().originalChildClosed, false);
  assert.equal((await service.controller.close()).originalChildClosed, true);
});
test('readApproval final clone deadline poisons later reads even after clock recovery', async () => {
  const initial = material(), service = await openFixtureAuthority(initial);
  const validApproval = await service.reader.readApproval('MAINTENANCE');
  assert.equal(await service.reader.verifyAuthority(validApproval, expected(initial.context)), true);
  const parse = JSON.parse, now = Date.now; let offset = 0, cloned = false;
  JSON.parse = (...args) => { const value = parse(...args);
    if (value?.schema === 'phoenix.maintenance-authority/v1') { cloned = true; offset = 10001; }
    return value;
  };
  Date.now = () => now() + offset;
  try { await assert.rejects(service.reader.readApproval('MAINTENANCE'), /FIXTURE_AUTHORITY_HOLD=/); assert.equal(cloned, true); }
  finally { JSON.parse = parse; Date.now = now; }
  try {
    await assert.rejects(service.reader.readApproval('MAINTENANCE'), /FIXTURE_AUTHORITY_HOLD=/);
    assert.equal(await service.reader.verifyAuthority(validApproval, expected(initial.context)), false);
  } finally { await service.controller.close(); }
});
for (const fault of ['deadline', 'abort', 'wall rollback']) test('final verification rejects '+fault+' after a valid original-child signed reply', async () => {
  const initial = material(); let child;
  const service = await openFixtureAuthority(initial, { registerOwnedChild(c) { child = c; } });
  const approval = await service.reader.readApproval('MAINTENANCE'), originalNow = Date.now, controller = new AbortController();
  let reply = false, clocks = 0, injected = false, high = 0;
  const received = r => { if (r.value?.schema === 'phoenix.fixture-authority-response/v1') reply = true; };
  child.on('message', received);
  // Synthetic final-validation clock fault, after actual issuer IPC. The first
  // four reads cover RPC completion, read boundary and signature freshness.
  Date.now = () => {
    const now = originalNow(); if (!reply) return now;
    if (++clocks === 4 && fault === 'wall rollback') return high = now + 20;
    if (clocks === 5) { injected = true;
      if (fault === 'abort') controller.abort();
      if (fault === 'deadline') return now + 1001;
      if (fault === 'wall rollback') return high - 10;
    }
    return now;
  };
  try {
    assert.equal(await service.reader.verifyAuthority(approval, { ...expected(initial.context), timeoutMs: 1000, signal: controller.signal }), false);
    assert.equal(injected, true, 'fault must reach final validation after signed reply');
  } finally { Date.now = originalNow; child.removeListener('message', received); await service.controller.close(); }
});
for (const invalid of [null, {}, { records: [] }, { ...material(), records: [{ purpose: 'PRODUCTION', payload: {} }] }])
  test('bootstrap rejects unbounded or non-fixture authority inputs before spawning', async () => {
    await assert.rejects(openFixtureAuthority(invalid));
  });
