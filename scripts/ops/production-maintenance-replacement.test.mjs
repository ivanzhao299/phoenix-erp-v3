import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ControlledComposeReplacement, replacementCommand, validateReplacementLifecycle, validateCandidateReplacement, redactReplacementEvent, DockerReplacementEvents } from './production-maintenance-replacement.mjs';
import { canonicalDigest, createMaintenanceEvidence } from './production-maintenance-receipts.mjs';
import { LEGACY_EVIDENCE_DOMAINS } from './background-control-legacy-transition.mjs';

const now = Date.now(), project = 'phoenix-replacement-test';
const sha = c => c.repeat(40), hash = c => c.repeat(64), image = c => 'sha256:' + hash(c);
const pin = (id, revision, imageId) => ({ id: hash(id), imageId: image(imageId), revision: sha(revision), startedAt: new Date(now - 10000).toISOString(), restartCount: 0,
  running: true, health: 'healthy', pid: 123, status: 'running', restarting: false, dead: false, exitCode: 0, oomKilled: false });
export function mockReplacement(overrides = {}) {
  const old = pin('a', 'a', 'a'), web = pin('b', 'c', 'b'), db = { ...pin('c', 'c', 'c'), mountsSha256: hash('d') };
  const context = { schema: 'phoenix.legacy-maintenance-context/v1', protocolVersion: 1, owner: '123-1', previousFloorSha: sha('a'), previousApiSha: sha('a'),
    previousWebSha: sha('c'), targetSha: sha('b'), window: { start: new Date(now - 30000).toISOString(), end: new Date(now + 120000).toISOString() },
    candidate: { revision: sha('b'), imageId: image('e') }, sourceHelperSha256: hash('1'), schemaEvidenceSha256: hash('2'), migrationPaths: [],
    preSnapshot: { api: old, web, db }, executors: [old], replacement: { project, composeFileSha256: hash('4') } };
  const first = { ...old, running: false, pid: 0, status: 'exited', checkedAt: new Date(now - 2000).toISOString() };
  const second = { ...first, checkedAt: new Date(now - 1000).toISOString() };
  const envelope = (kind, body) => createMaintenanceEvidence(kind, context, body, { capturedAt: new Date(now - 500).toISOString() });
  const prerequisites = {
    stopped: envelope('STOP_LEGACY', { protocol: 'STOP_AND_RECONCILE', legacyDrainResult: 'UNSUPPORTED', ingressFenceDigest: hash('1'), executors: [{ ...old, before: old, first, second }],
      database: { ownershipComplete: true, remainingConnections: 0, openTransactions: 0, preparedTransactions: 0, persistentRunning: 0, persistentQueued: 0 } }),
    reconciliation: envelope('RECONCILIATION', { domains: LEGACY_EVIDENCE_DOMAINS.map(domain => ({ domain, disposition: 'RECONCILED', unknownEffects: 0, pendingWrites: 0, requiresReplay: false, requiresBusinessMutation: false })) }),
    isolation: envelope('INGRESS_FENCE', { state: 'FROZEN', continuous: true, lastVerifiedAt: new Date(now).toISOString(), leaseExpiresAt: new Date(now + 110000).toISOString(),
      revival: { restartPolicy: 'no', orchestratorsDisabled: true, executorIds: [old.id] }, inventory: { allDockerIds: [old.id, web.id, db.id].sort() } }),
    recovery: envelope('RECOVERY_MATERIAL', { materialsAvailable: true, materialsSha256: hash('5') }),
  };
  const candidate = { ...pin('e', 'b', 'e'), startedAt: new Date(now + 10).toISOString(), restartPolicy: 'no', networks: ['fixture'], project, service: 'api' };
  const oldStopped = { ...second, restartPolicy: 'no', networks: [], project, service: 'api' };
  let mutated = false; const writes = [], calls = [], marker = { operation: 'REPLACE_CANDIDATE' };
  const state = { phase: 'PROMOTION_PREPARED', stateDigest: hash('6') };
  const store = { directory: '/fixture/state', assertCurrent() {}, readState: () => state,
    assertOwnedIntent(operation, from, digest) { assert.equal(operation, 'REPLACE_CANDIDATE'); assert.equal(from, 'PROMOTION_PREPARED'); assert.equal(digest, state.stateDigest); return marker; },
    immutable(file, body) { if (writes.some(w => w.file === file)) throw Error('EEXIST'); writes.push({ file, body }); } };
  const run = args => {
    calls.push(args);
    if (args[0] === 'ps') return (mutated ? [candidate.id, web.id, db.id] : [old.id, web.id, db.id]).sort().join('\n');
    if (args[0] === 'info') return new Date(now).toISOString();
    if (args[0] === 'inspect') {
      if (args.at(-1) === '{{json .Mounts}}') return JSON.stringify([{ Type: 'bind', Source: '/var/lib/phoenix-background-control', Destination: '/run/phoenix-background-control', RW: false }]);
      const value = args[1] === old.id ? oldStopped : args[1] === candidate.id ? candidate : args[1] === web.id ? web : db;
      return [value.id, value.imageId, { StartedAt: value.startedAt, Running: value.running, Health: { Status: value.health }, Pid: value.pid, Status: value.status,
        Restarting: value.restarting, Dead: value.dead, ExitCode: value.exitCode, OOMKilled: value.oomKilled }, value.restartCount, value.restartPolicy || 'no',
      Object.fromEntries((value.networks || []).map(n => [n, {}])), { 'com.docker.compose.project': value.project || project, 'com.docker.compose.service': value.service || (value.id === web.id ? 'web' : 'db') }].map(JSON.stringify).join('\t');
    }
    if (args[0] === 'image' && args.at(-1).includes('{{json .Config.Labels}}')) return [context.candidate.imageId, { 'org.opencontainers.image.revision': context.targetSha }].map(JSON.stringify).join('\t');
    if (args[0] === 'image' && args.at(-1) === '{{json .Id}}') return JSON.stringify(args[2]);
    if (args[0] === 'image') return args[2] === old.imageId ? old.revision : args[2] === candidate.imageId ? candidate.revision : args[2] === web.imageId ? web.revision : db.revision;
    if (args[0] === 'tag' && args[1] === context.candidate.imageId) return '';
    throw Error('unexpected readonly command');
  };
  const event = (id, Action, offset) => ({ Type: 'container', Action, Actor: { ID: id, Attributes: { 'com.docker.compose.project': project, 'com.docker.compose.service': 'api' } }, timeNano: (BigInt(Math.round(now + offset)) * 1000000n).toString() });
  let eventStart;
  const events = { start: async at => { eventStart = Date.parse(at); }, finish: async end => {
    const step = (Date.parse(end) - eventStart) / 4;
    return [event(old.id, 'destroy', eventStart + step - now), event(candidate.id, 'create', eventStart + 2 * step - now), event(candidate.id, 'start', eventStart + 3 * step - now)];
  }, close: async () => {} };
  let tick = 0;
  const deps = { store, guard() {}, run, execute(args) { assert.equal(writes.length, 2); assert.equal(writes[1].body.oldExecutor.id, old.id); mutated = true; },
    events, now: () => now + tick++, verifySource: () => ({ root: '/fixture/root', composeFileSha256: hash('4') }), verifyAuthority: async () => true,
    verifyEvidence: async () => true, verifyPublicFence: async () => true, ...overrides };
  return { instance: new ControlledComposeReplacement({ context, state, approval: {}, prerequisites, project }, deps), context, prerequisites, deps, writes, calls, events, old, candidate, state,
    get mutated() { return mutated; } };
}
test('typed command has only API replacement and immutable image override, no shell/migration/Web', () => {
  assert.deepEqual(replacementCommand({ root: '/fixture/root', project, overrideFile: '/fixture/state/override.json' }).slice(-8), ['up', '-d', '--no-deps', '--force-recreate', '--no-build', '--pull', 'never', 'api']);
  assert.throws(() => replacementCommand({ root: '/fixture/root', project: 'x;sh', overrideFile: '/fixture/o' }), /COMPOSE_BINDING/);
});
test('successful replacement persists intent before effect and never claims DRAINED/OPEN', async () => {
  const f = mockReplacement(); const receipt = await f.instance.replace();
  assert.equal(f.mutated, true); assert.equal(f.writes.length, 4);
  const body = validateCandidateReplacement(receipt, f.context, { now: Date.now() + 10000 });
  assert.equal(body.oldDisposition, 'REMOVED_BY_CONTROLLED_REPLACEMENT'); assert.equal(body.legacyDrainResult, 'UNSUPPORTED');
  assert.equal(body.oldImageRetained, true); assert.equal(body.webDbUnchanged, true);
  assert.equal(JSON.stringify(receipt).includes('DRAINED'), false); assert.equal(JSON.stringify(receipt).includes('OPEN'), false);
});
for (const [name, overrides, pattern] of [
  ['approval', { verifyAuthority: async () => false }, /APPROVAL/],
  ['prior evidence', { verifyEvidence: async () => false }, /UNVERIFIED/],
  ['public startup deny', { verifyPublicFence: async () => false }, /STARTUP_DENY/],
]) test(`missing independent ${name}: zero Docker mutation and zero root writes`, async () => {
  const f = mockReplacement(overrides); await assert.rejects(f.instance.replace(), pattern); assert.equal(f.mutated, false); assert.equal(f.writes.length, 0);
});
test('exact phase/intent/owner failure prevents effects', async () => {
  const f = mockReplacement(); f.deps.store.assertOwnedIntent = () => { throw Error('FOREIGN_OWNER'); };
  await assert.rejects(f.instance.replace(), /FOREIGN_OWNER/); assert.equal(f.writes.length, 0);
});
test('unreconciled effects and unbound Compose digest are HOLD with zero effect', async () => {
  for (const kind of ['effects', 'compose']) {
    const f = mockReplacement();
    if (kind === 'effects') f.prerequisites.reconciliation = createMaintenanceEvidence('RECONCILIATION', f.context, { domains: [] });
    else f.context.replacement.composeFileSha256 = 'f'.repeat(64), f.instance.context.replacement.composeFileSha256 = 'f'.repeat(64);
    await assert.rejects(f.instance.replace()); assert.equal(f.mutated, false); assert.equal(f.writes.length, 0);
  }
});
test('insufficient window is HOLD before effects', async () => {
  const f = mockReplacement(); f.instance.context.window.end = new Date(now + 1000).toISOString();
  await assert.rejects(f.instance.replace(), /WINDOW_INSUFFICIENT/); assert.equal(f.writes.length, 0);
});
test('command failure preserves durable intent and never writes completed tombstone', async () => {
  const f = mockReplacement({ execute() { throw Error('COMPOSE_INTERRUPTED'); } });
  await assert.rejects(f.instance.replace(), /COMPOSE_INTERRUPTED/); assert.equal(f.writes.length, 3); assert.equal(f.writes.at(-1).body.outcome, 'HOLD');
});
test('missing events after effect preserves intent without tombstone', async () => {
  const f = mockReplacement(); f.events.finish = async () => [];
  await assert.rejects(f.instance.replace(), /LIFECYCLE_REQUIRED/); assert.equal(f.mutated, true); assert.equal(f.writes.length, 3);
});
test('main/source drift before effect or before tombstone preserves HOLD and never completes receipt', async () => {
  for (const call of [2, 3]) {
    let counter = 0;
    const f = mockReplacement({ verifySource() { if (++counter === call) throw Error('REMOTE_MAIN_CHANGED'); return { root: '/fixture/root', composeFileSha256: hash('4') }; } });
    await assert.rejects(f.instance.replace(), /REMOTE_MAIN_CHANGED/); assert.equal(f.mutated, call === 3); assert.equal(f.writes.length, 3);
  }
});
test('actual candidate mount and post-effect public fence are mandatory; no completed tombstone on failure', async () => {
  for (const mode of ['writable-mount', 'public-changed']) {
    const f = mockReplacement();
    if (mode === 'writable-mount') { const run = f.instance.run; f.instance.run = args => args.at(-1) === '{{json .Mounts}}'
      ? JSON.stringify([{ Type: 'bind', Source: '/var/lib/phoenix-background-control', Destination: '/run/phoenix-background-control', RW: true }]) : run(args); }
    else { let times = 0; f.instance.verifyPublicFence = async () => ++times < 3; }
    await assert.rejects(f.instance.replace(), /CONTROL_MOUNT_UNPROVEN|FENCE_OR_LEASE_LOST/); assert.equal(f.mutated, true); assert.equal(f.writes.length, 3);
  }
});
test('lifecycle rejects old revival, unknown executors, missing or duplicate create, clock drift and event saturation', () => {
  const f = mockReplacement(), start = new Date(now).toISOString(), end = new Date(now + 100).toISOString();
  const event = (id, Action) => ({ Type: 'container', Action, Actor: { ID: id, Attributes: { 'com.docker.compose.project': project, 'com.docker.compose.service': 'api' } }, timeNano: (BigInt(now + 1) * 1000000n).toString() });
  const good = [event(f.old.id, 'destroy'), event(f.candidate.id, 'create'), event(f.candidate.id, 'start')];
  const check = events => validateReplacementLifecycle(events, { oldId: f.old.id, candidateId: f.candidate.id, project, start, end });
  assert.ok(check(good));
  for (const bad of [[...good, event(f.old.id, 'start')], [...good, event(hash('f'), 'start')], good.slice(1), [...good, good[1]],
    good.map(e => ({ ...e, timeNano: (BigInt(now - 1) * 1000000n).toString() })), Array(256).fill(good[0])]) assert.throws(() => check(bad));
});
test('audit event projection never retains exec command text or arbitrary Docker labels', () => {
  const safe = redactReplacementEvent({ Type: 'container', Action: 'exec_create: echo SECRET_FIXTURE', timeNano: (BigInt(now) * 1000000n).toString(),
    Actor: { ID: hash('a'), Attributes: { 'com.docker.compose.project': project, 'com.docker.compose.service': 'api', secret: 'SECRET_FIXTURE', image: 'SECRET_FIXTURE' } } });
  assert.equal(safe.Action, 'exec_create'); assert.equal(JSON.stringify(safe).includes('SECRET_FIXTURE'), false);
  assert.equal(JSON.stringify(redactReplacementEvent({ Type: 'volume', Action: 'create', timeNano: (BigInt(now) * 1000000n).toString(), Actor: { ID: 'SECRET_FIXTURE', Attributes: {} } })).includes('SECRET_FIXTURE'), false);
});
test('persistent observer and bounded daemon history must agree; truncated/failed/saturated coverage holds', async () => {
  const row = { Type: 'container', Action: 'create', Actor: { ID: hash('a'), Attributes: {} }, timeNano: (BigInt(now + 1) * 1000000n).toString() };
  for (const mode of ['match', 'truncated', 'saturated', 'observer-error', 'observer-exit-during-history']) {
    const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), pid: 123, exitCode: null, signalCode: null,
      kill() { this.exitCode = 0; this.emit('exit', 0); this.emit('close', 0); return true; } });
    const rows = mode === 'saturated' ? Array(256).fill(row) : [row], text = rows.map(r => JSON.stringify(r)).join('\n') + '\n';
    const observer = new DockerReplacementEvents({ spawnProcess: () => { setImmediate(() => { child.stdout.emit('data', text); if (mode === 'observer-error') child.stderr.emit('data', 'redacted'); }); return child; },
      run: () => { if (mode === 'observer-exit-during-history') child.exitCode = 1; return mode === 'truncated' ? '' : text; }, env: {} });
    try {
      if (mode === 'observer-error' || mode === 'saturated') await assert.rejects(observer.start(new Date(now).toISOString()), /OBSERVER_NOT_RUNNING/);
      else { await observer.start(new Date(now).toISOString()); if (mode === 'match') assert.equal((await observer.finish(new Date(now + 100).toISOString())).length, 1);
        else await assert.rejects(observer.finish(new Date(now + 100).toISOString()), /COVERAGE_UNPROVEN|OBSERVER_NOT_RUNNING/); }
    } finally { if (mode === 'match') await observer.close(); else await assert.rejects(observer.close(), /CLEANUP_OR_EVIDENCE_FAILED|COVERAGE_UNPROVEN/); }
  }
});

test('nanosecond order cannot be rounded into a valid lifecycle', () => {
  const f = mockReplacement(), start = new Date(now).toISOString(), end = new Date(now + 100).toISOString();
  const at = BigInt(now + 1) * 1000000n;
  const event = (id, Action, n) => ({ Type: 'container', Action, Actor: { ID: id, Attributes: { 'com.docker.compose.project': project, 'com.docker.compose.service': 'api' } }, timeNano: n.toString() });
  const good = [event(f.old.id, 'destroy', at), event(f.candidate.id, 'create', at + 1n), event(f.candidate.id, 'start', at + 2n)];
  const check = rows => validateReplacementLifecycle(rows, { oldId: f.old.id, candidateId: f.candidate.id, project, start, end });
  assert.ok(check(good));
  assert.throws(() => check([good[0], event(f.candidate.id, 'create', at + 3n), good[2]]), /INCOMPLETE/);
  assert.throws(() => redactReplacementEvent({ ...good[0], timeNano: Number(good[0].timeNano) }), /PRECISE_CLOCK/);
});
test('observer close failure cannot leave a completed replacement tombstone', async () => {
  const f = mockReplacement(); let closes = 0;
  f.events.close = async () => { closes++; throw Error('ORIGINAL_STDIO_UNCLOSED'); };
  await assert.rejects(f.instance.replace(), /ORIGINAL_STDIO_UNCLOSED/);
  assert.equal(closes, 1); assert.equal(f.mutated, true);
  assert.equal(f.writes.length, 3); assert.equal(f.writes.at(-1).body.outcome, 'HOLD');
});
function streamFixture({ close = true, final = '', partial = '' } = {}) {
  const kills = [], row = { Type: 'container', Action: 'create', Actor: { ID: hash('a'), Attributes: {} }, timeNano: (BigInt(now + 1) * 1000000n).toString() };
  const text = JSON.stringify(row) + '\n';
  const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), pid: 321, exitCode: null, signalCode: null,
    kill(signal) { kills.push(signal); this.exitCode = 0; this.emit('exit', 0); if (final) this.stdout.emit('data', typeof final === 'function' ? final(row) : final); if (close) this.emit('close', 0); return true; } });
  const observer = new DockerReplacementEvents({ spawnProcess: () => { setImmediate(() => child.stdout.emit('data', text + partial)); return child; }, run: () => text, env: {} });
  return { observer, child, row, kills };
}
test('original observer exit without stdio close retains debt and never sends automatic KILL', async () => {
  const f = streamFixture({ close: false }); await f.observer.start(new Date(now).toISOString()); await f.observer.finish(new Date(now + 100).toISOString());
  await assert.rejects(f.observer.close(), /STDIO_CLOSE_TIMEOUT/);
  assert.deepEqual(f.kills, ['SIGTERM']); assert.equal(f.observer.cleanupDebt().pendingOriginalChild, true);
  await assert.rejects(f.observer.close(), /CLOSE_SINGLE_USE/); assert.deepEqual(f.kills, ['SIGTERM']);
  f.child.emit('close', 0); assert.equal(f.observer.cleanupDebt().pendingOriginalChild, false); assert.equal(f.observer.cleanupDebt().evidenceFailed, true);
});
test('final flushed events must match history before close can validate', async () => {
  const f = streamFixture({ final: row => JSON.stringify(row) + '\n' }); await f.observer.start(new Date(now).toISOString()); await f.observer.finish(new Date(now + 100).toISOString());
  await assert.rejects(f.observer.close(), /COVERAGE_UNPROVEN/); assert.equal(f.observer.cleanupDebt().pendingOriginalChild, false);
});
test('unflushed partial row rejects evidence and a second observer start', async () => {
  const f = streamFixture({ partial: '{' }); await f.observer.start(new Date(now).toISOString()); await f.observer.finish(new Date(now + 100).toISOString());
  await assert.rejects(f.observer.close(), /CLEANUP_OR_EVIDENCE_FAILED/); await assert.rejects(f.observer.start(new Date(now).toISOString()), /SINGLE_USE/);
});

test('observer reference is readonly and original PID drift never signals another process', async () => {
  const f = streamFixture(); await f.observer.start(new Date(now).toISOString());
  assert.throws(() => { f.observer.child = {}; }, TypeError);
  f.child.pid = 999; await assert.rejects(f.observer.close(), /ORIGINAL_IDENTITY_LOST/);
  assert.deepEqual(f.kills, []); assert.equal(f.observer.cleanupDebt().originalPid, 321); assert.equal(f.observer.cleanupDebt().pendingOriginalChild, true);
  f.child.emit('close', 0);
});
test('registration failure retains and joins original child; effect error remains primary with cleanup debt', async () => {
  const f = streamFixture(); f.observer.registerChild = () => { throw Error('REGISTER_FAIL'); };
  await assert.rejects(f.observer.start(new Date(now).toISOString()), /REGISTRATION_FAILED/);
  assert.equal(f.observer.cleanupDebt().pendingOriginalChild, true);
  await assert.rejects(f.observer.close(), /CLEANUP_OR_EVIDENCE_FAILED/);
  assert.deepEqual(f.kills, ['SIGTERM']); assert.equal(f.observer.cleanupDebt().pendingOriginalChild, false);
  const r = mockReplacement({ execute() { throw Error('ORIGINAL_EFFECT_FAILURE'); } });
  r.events.close = async () => { throw Error('CLEANUP_SECONDARY'); };
  r.events.cleanupDebt = () => ({ pendingOriginalChild: true, originalPid: 321 });
  await assert.rejects(r.instance.replace(), /ORIGINAL_EFFECT_FAILURE/);
  assert.equal(r.writes.at(-1).body.cleanupReason, 'MAINTENANCE_HOLD=REPLACEMENT_OBSERVER_CLEANUP_FAILED');
  assert.equal(r.writes.at(-1).body.observerCleanupDebt.pendingOriginalChild, true);
});
