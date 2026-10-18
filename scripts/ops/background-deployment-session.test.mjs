import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { discoverParticipants, executeFencedDeployment, exactReanchorBinding, spawnDeploymentBody, assertLatestMain } from './background-deployment-session.mjs';
import { assertBackgroundMount, assertBackgroundFence, runCompose } from './phoenix-production-compose.mjs';
import { validateEffectiveConfig, CONTRACT } from './production-config-guard.mjs';
import { assertModernReleaseAdmission } from './production-maintenance-admission.mjs';
import { promoteFloor } from './promote-production-config-floor.mjs';
import { configTransaction } from './chanjet-readonly-config-transaction.mjs';
import { executeRecoveryStages } from './production-deployment-recovery.mjs';

const oldSha = 'a'.repeat(40); const targetSha = 'b'.repeat(40);
const binding = { owner: '1234-1', previousFloorSha: oldSha, targetSha };
const participant = { containerId: 'c'.repeat(64), revision: oldSha, bootId: '00000000-0000-4000-8000-000000000001', allowedKinds: ['LOCAL'] };
const next = { ...participant, containerId: 'd'.repeat(64), revision: targetSha, bootId: '00000000-0000-4000-8000-000000000002' };
function fixture(overrides = {}) {
  const events = []; let connected = true;
  const coordinator = {
    publisher: { assertOwned: () => events.push('owner'), hold: () => events.push('hold') },
    session: { connected: () => connected, ping: async () => connected },
    fenceAndDrain: async () => { events.push('drain'); return { outcome: 'DRAINED', ...binding }; },
    verifyQuiescent: async () => events.push('quiescent'),
    verifyLease: async () => { if (!connected) throw new Error('lost'); },
    openAfterSuccess: async participants => { assert.deepEqual(participants, [next]); events.push('verified-open'); },
    close: async () => events.push('close'), ...overrides,
  };
  const child = new EventEmitter(); child.exitCode = null; child.pid = 123;
  const exit = (code, signal = null) => { child.exitCode = code; child.emit('exit', code, signal); };
  return { events, coordinator, child, exit, disconnect: () => { connected = false; } };
}
const options = { binding, project: 'phoenix-fixture', participants: [participant], script: 'formal deployment body' };
function activeMaintenance(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'modern-maintenance-entry-'));
  fs.chmodSync(directory, 0o700); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'maintenance-current.json'), JSON.stringify({ owner: '1234-1' }), { mode: 0o600 });
  const inspectDirectory = () => { const s = fs.lstatSync(directory); return [s.dev, s.ino, s.uid, s.mode]; };
  return () => assertModernReleaseAdmission({ directory }, { guard: () => {}, inspectDirectory, expectedUid: process.getuid() });
}
test('active maintenance prevents background fence publication and shell spawn', async t => {
  const gate = activeMaintenance(t), f = fixture(); let spawned = 0;
  await assert.rejects(executeFencedDeployment(options, { maintenanceAdmission: gate, coordinator: f.coordinator, spawnBody: () => { spawned++; } }), /MAINTENANCE_LIFECYCLE_ACTIVE/);
  assert.deepEqual(f.events, []); assert.equal(spawned, 0);
  assert.throws(() => spawnDeploymentBody('must not execute', { maintenanceAdmission: gate, spawn: () => { spawned++; } }), /MAINTENANCE_LIFECYCLE_ACTIVE/);
  assert.equal(spawned, 0);
});
test('active maintenance blocks Compose mutations while ps remains read only', t => {
  const gate = activeMaintenance(t), imageId = 'sha256:' + 'a'.repeat(64);
  const images = { api: { imageId, revision: oldSha }, web: { imageId, revision: oldSha } };
  const deps = { root: '/fixture', directory: '/fixture', readState: () => ({ version: CONTRACT.version, active: images }),
    guard: () => ({ project: 'phoenix-fixture', operationalTuple: { CHANJET_READONLY_SYNC_ENABLED: 'false', CHANJET_ERP_INBOUND_SYNC_ENABLED: 'false' } }), inspect: (id, revision) => ({ imageId: id, revision }), maintenanceAdmission: gate };
  for (const args of [['pull', 'api'], ['up', '-d', '--no-deps', '--wait', 'api'], ['restart', 'web'], ['restart', 'db']]) {
    let writes = 0; assert.throws(() => runCompose(args, { ...deps, execute: () => { writes++; } }), /MAINTENANCE_LIFECYCLE_ACTIVE/); assert.equal(writes, 0);
  }
  let queries = 0;
  runCompose(['ps'], { ...deps, maintenanceAdmission: () => assert.fail('ps cannot invoke mutation admission'), execute: (_binary, args) => { assert.ok(args.includes('ps')); queries++; } });
  assert.equal(queries, 1);
});
test('active maintenance blocks floor, policy configuration and recovery before their first mutation', async t => {
  const gate = activeMaintenance(t);
  await assert.rejects(promoteFloor('/fixture', { maintenanceAdmission: gate }), /MAINTENANCE_LIFECYCLE_ACTIVE/);
  await assert.rejects(configTransaction('/fixture', 'HOLD', null, { maintenanceAdmission: gate }), /MAINTENANCE_LIFECYCLE_ACTIVE/);
  let writes = 0;
  assert.throws(() => executeRecoveryStages({ phase: 'ARCHIVED', plan: {} }, { maintenanceAdmission: gate, writeActive: () => { writes++; }, writeArchive: () => { writes++; } }), /MAINTENANCE_LIFECYCLE_ACTIVE/);
  assert.equal(writes, 0);
});
test('remote main check is exact and bounded, with network failure treated as HOLD', () => {
  let args;
  assertLatestMain(targetSha, { probe: (...call) => { args = call; return `${targetSha}\trefs/heads/main`; } });
  assert.deepEqual(args[1], ['ls-remote', '--exit-code', 'origin', 'refs/heads/main']); assert.equal(args[2].timeoutMs, 10000);
  for (const output of ['', `${oldSha}\trefs/heads/main`, `${targetSha}\trefs/heads/other`, `${targetSha}\trefs/heads/main\n${targetSha}\trefs/heads/main`]) assert.throws(() => assertLatestMain(targetSha, { probe: () => output }), /LATEST_MAIN_CHANGED/);
  assert.throws(() => assertLatestMain(targetSha, { probe: () => { throw new Error('network details must not escape'); } }), /LATEST_MAIN_UNVERIFIED/);
});
test('main changes before fencing produce zero deploy body and zero OPEN', async () => {
  const f = fixture();
  await assert.rejects(executeFencedDeployment(options, { maintenanceAdmission: () => {}, coordinator: f.coordinator,
    verifyMain: async () => { throw new Error('BACKGROUND_HOLD=LATEST_MAIN_CHANGED'); },
    spawnBody: () => assert.fail('body cannot run'), persistProof: async () => assert.fail('no drain proof'),
  }), /LATEST_MAIN_CHANGED/);
  assert.ok(!f.events.includes('drain')); assert.ok(!f.events.includes('verified-open'));
});
test('main changes after body success still prevent OPEN', async () => {
  const f = fixture(); let probes = 0;
  await assert.rejects(executeFencedDeployment(options, { maintenanceAdmission: () => {}, coordinator: f.coordinator,
    verifyMain: async () => { if (++probes === 3) throw new Error('BACKGROUND_HOLD=LATEST_MAIN_CHANGED'); },
    persistProof: async () => {}, spawnBody: () => { setImmediate(() => f.exit(0)); return f.child; }, discoverNew: async () => [next],
  }), /LATEST_MAIN_CHANGED/);
  assert.equal(probes, 3); assert.ok(!f.events.includes('verified-open')); assert.ok(f.events.includes('hold'));
});
test('remote main loss during the body terminates it and never opens', async () => {
  const f = fixture(); let probes = 0;
  await assert.rejects(executeFencedDeployment(options, { maintenanceAdmission: () => {}, coordinator: f.coordinator,
    verifyMain: async () => { if (++probes > 2) throw new Error('BACKGROUND_HOLD=LATEST_MAIN_UNVERIFIED'); },
    persistProof: async () => {}, pollMs: 1, mainPollMs: 0, spawnBody: () => f.child,
    killBody: sig => setImmediate(() => f.exit(null, sig)),
  }), /LATEST_MAIN_UNVERIFIED_OR_CHANGED/);
  assert.ok(!f.events.includes('verified-open')); assert.ok(f.events.includes('hold'));
});
test('normal, full, migration and unbound floor releases are rejected before publication or body', () => {
  const env = { DEPLOY_MODE: 'api', BUILD_API: 'true', BUILD_WEB: 'false', RUN_MIG: 'false', APPROVED_CONFIG_FLOOR_SHA: targetSha, APPROVED_PREVIOUS_FLOOR_SHA: oldSha, TARGET_SHA: targetSha, DEPLOY_RUN_ID: binding.owner };
  const floor = { version: 3, phase: 'READY', chanjetPolicy: 'HOLD', readonlyApproval: null, floorSha: oldSha };
  const active = { version: 3, outcome: 'SUCCESS', floorSha: oldSha, active: { api: { revision: oldSha } } };
  assert.deepEqual(exactReanchorBinding(env, floor, active), binding);
  for (const change of [{ APPROVED_CONFIG_FLOOR_SHA: '' }, { APPROVED_PREVIOUS_FLOOR_SHA: '' }, { TARGET_SHA: oldSha }, { APPROVED_PREVIOUS_FLOOR_SHA: targetSha }]) {
    assert.throws(() => exactReanchorBinding({ ...env, ...change }, floor, active), /UNSUPPORTED_NORMAL_DEPLOY/);
  }
  for (const change of [{ DEPLOY_MODE: 'full' }, { RUN_MIG: 'true' }, { BUILD_WEB: 'true' }]) assert.throws(() => exactReanchorBinding({ ...env, ...change }, floor, active), /API_ONLY_NO_MIGRATION_REQUIRED/);
  assert.throws(() => exactReanchorBinding(env, floor, { ...active, active: { api: { revision: targetSha } } }), /OLD_FLOOR_RUNTIME_BINDING/);
});
test('deploy child retains FD9, uses a process group and keeps the conservative recovery marker', () => {
  let command; let body;
  spawnDeploymentBody('approved body', { maintenanceAdmission: () => {}, root: '/fixture', env: { SAFE_TEST: 'true' }, spawn: (binary, args, config) => {
    command = { binary, args, config }; return { stdin: { end: value => { body = value; } } };
  } });
  assert.equal(command.binary, '/bin/bash'); assert.deepEqual(command.args, ['-Eeuo', 'pipefail']);
  assert.equal(command.config.stdio[9], 9); assert.equal(command.config.detached, true); assert.equal(command.config.cwd, '/fixture');
  assert.equal(command.config.env.BACKGROUND_DEPLOYMENT_SUPERVISED, 'true'); assert.equal(body, 'approved body');
});
test('real shell -> supervisor -> deployment shell -> helper retains the same held FD9', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'background-fd9-'));
  try {
    const lock = path.join(dir, 'mutation.lock'); fs.writeFileSync(lock, 'fixture lock');
    const moduleUrl = pathToFileURL(path.resolve('scripts/ops/background-deployment-session.mjs')).href;
    const check = path.join(dir, 'check.mjs'); const runner = path.join(dir, 'runner.mjs');
    fs.writeFileSync(check, `import fs from 'node:fs';import {spawnSync} from 'node:child_process';
const a=fs.fstatSync(9),b=fs.statSync('/proc/'+process.ppid+'/fd/9'),c=fs.statSync(process.env.LOCK_FIXTURE);
if(a.dev!==b.dev||a.ino!==b.ino||a.ino!==c.ino)process.exit(7);
if(spawnSync('flock',['-n',process.env.LOCK_FIXTURE,'true']).status!==1)process.exit(8);
console.log('FD9_CHAIN_PASS');`);
    fs.writeFileSync(runner, `import fs from 'node:fs';import {spawnDeploymentBody} from ${JSON.stringify(moduleUrl)};
const a=fs.fstatSync(9),b=fs.statSync('/proc/'+process.ppid+'/fd/9');if(a.ino!==b.ino||a.dev!==b.dev)process.exit(9);
const child=spawnDeploymentBody('"$NODE_EXEC" "$CHECK_SCRIPT"',{root:process.env.FIXTURE_ROOT,maintenanceAdmission:()=>{}});
child.on('exit',(code,signal)=>{process.exitCode=signal?10:code;});`);
    const result = spawnSync('/bin/bash', ['-Eeuo', 'pipefail', '-c', 'exec 9<>"$LOCK_FIXTURE"; flock -n 9; "$NODE_EXEC" "$RUNNER_SCRIPT"; status=$?; exit "$status"'], {
      env: { PATH: process.env.PATH, LOCK_FIXTURE: lock, NODE_EXEC: process.execPath, CHECK_SCRIPT: check, RUNNER_SCRIPT: runner, FIXTURE_ROOT: dir }, encoding: 'utf8', timeout: 10000,
    });
    assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /FD9_CHAIN_PASS/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('workflow staged helper closure imports without access to checkout neighbours', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'background-stage-'));
  try {
    const workflow = fs.readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
    const closure = workflow.match(/for helper in (background-deployment-session\.mjs [^;]+); do/);
    assert.ok(closure, 'reviewed explicit staging closure required');
    for (const file of closure[1].split(' ')) fs.copyFileSync(new URL(file, import.meta.url), path.join(dir, file));
    const staged = await import(pathToFileURL(path.join(dir, 'background-deployment-session.mjs')).href);
    assert.equal(typeof staged.executeFencedDeployment, 'function');
    assert.equal(typeof staged.exactReanchorBinding, 'function');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('API-only body checks main before each mutation boundary and does not initialize shared Web content', () => {
  const workflow = fs.readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  for (const operation of ['node "$FLOOR_STAGE/promote-production-config-floor.mjs"', 'git merge --ff-only origin/main', 'node scripts/ops/production-deployment-state.mjs switch api', 'node scripts/ops/production-deployment-state.mjs complete']) {
    const index = workflow.indexOf(operation); assert.ok(index > 0);
    assert.match(workflow.slice(index - 80, index), /assert_target_main\s*$/);
  }
  const staticStart = workflow.indexOf('mkdir -p /opt/phoenix/static-overrides', workflow.indexOf('perform_deployment()'));
  assert.match(workflow.slice(staticStart - 150, staticStart), /if \[ "\$BUILD_WEB" = true \]; then\s*$/);
});
test('drain and proof precede body; only independently verified success can open', async () => {
  const f = fixture();
  const result = await executeFencedDeployment(options, { maintenanceAdmission: () => {}, coordinator: f.coordinator, verifyMain: async () => true,
    persistProof: async proof => { assert.equal(proof.outcome, 'DRAINED'); f.events.push('proof'); },
    spawnBody: () => { f.events.push('body'); setImmediate(() => f.exit(0)); return f.child; },
    discoverNew: async () => [next],
  });
  assert.equal(result.outcome, 'SUCCESS');
  assert.deepEqual(f.events.slice(0, 4), ['drain', 'proof', 'quiescent', 'body']);
  assert.ok(f.events.indexOf('verified-open') > f.events.indexOf('body')); assert.equal(f.events.at(-1), 'close');
});
test('legacy runtime or failed drain never starts the deploy body', async () => {
  const f = fixture({ fenceAndDrain: async () => { throw new Error('BACKGROUND_HOLD=HOLD_NO_FENCE_OR_DRAIN_PROOF'); } });
  await assert.rejects(executeFencedDeployment(options, { maintenanceAdmission: () => {}, coordinator: f.coordinator, verifyMain: async () => true,
    spawnBody: () => { assert.fail('unsafe legacy deployment'); }, persistProof: async () => assert.fail('no proof'),
  }), /HOLD_NO_FENCE_OR_DRAIN_PROOF/);
  assert.deepEqual(f.events, ['hold', 'close']);
  assert.throws(() => discoverParticipants('phoenix-fixture', {
    inventory: () => [participant.containerId], metadata: () => ({ id: participant.containerId, ociRevision: oldSha }),
    inspect: () => { throw new Error('old runtime has no endpoint'); },
  }), /HOLD_NO_FENCE_OR_DRAIN_PROOF/);
});
test('body failure retains HOLD, never auto opens or retries', async () => {
  const f = fixture(); let attempts = 0;
  await assert.rejects(executeFencedDeployment(options, { maintenanceAdmission: () => {}, coordinator: f.coordinator, verifyMain: async () => true, persistProof: async () => {},
    spawnBody: () => { attempts++; setImmediate(() => f.exit(42)); return f.child; },
    discoverNew: async () => assert.fail('must not authorize after failure'),
  }), /DEPLOY_BODY_FAILED/);
  assert.equal(attempts, 1); assert.ok(f.events.includes('hold')); assert.ok(!f.events.includes('verified-open'));
});
test('control session loss terminates the body and preserves durable denial', async () => {
  const f = fixture(); const signals = [];
  await assert.rejects(executeFencedDeployment(options, { maintenanceAdmission: () => {}, coordinator: f.coordinator, verifyMain: async () => true, persistProof: async () => {}, pollMs: 1,
    spawnBody: () => { setImmediate(f.disconnect); return f.child; },
    killBody: sig => { signals.push(sig); setImmediate(() => f.exit(null, sig)); },
  }), /CONTROL_SESSION_LOST/);
  assert.deepEqual(signals, ['SIGTERM']); assert.ok(!f.events.includes('verified-open')); assert.ok(f.events.includes('hold'));
});
test('deadline escalates a nonresponsive deploy body without auto recovery', async () => {
  const f = fixture(); const signals = [];
  await assert.rejects(executeFencedDeployment({ ...options, maximumMs: 5 }, { maintenanceAdmission: () => {}, coordinator: f.coordinator, verifyMain: async () => true, persistProof: async () => {}, killGraceMs: 2,
    spawnBody: () => f.child, killBody: sig => { signals.push(sig); if (sig === 'SIGKILL') setImmediate(() => f.exit(null, sig)); },
  }), /DEPLOY_SESSION_TIMEOUT/);
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']); assert.ok(!f.events.includes('verified-open'));
});
test('missing formal SUCCESS receipt leaves deployment fenced despite body zero exit', async () => {
  const f = fixture({ openAfterSuccess: async () => { throw new Error('BACKGROUND_HOLD=DEPLOY_SUCCESS_BINDING'); } });
  await assert.rejects(executeFencedDeployment(options, { maintenanceAdmission: () => {}, coordinator: f.coordinator, verifyMain: async () => true, persistProof: async () => {},
    spawnBody: () => { setImmediate(() => f.exit(0)); return f.child; }, discoverNew: async () => [next],
  }), /DEPLOY_SUCCESS_BINDING/);
  assert.ok(f.events.includes('hold')); assert.ok(!f.events.includes('verified-open'));
});
test('API compose accepts only the reviewed read-only directory mount and a readable manifest', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'background-compose-'));
  try {
    const compose = fs.readFileSync(new URL('../../docker-compose.yml', import.meta.url), 'utf8');
    fs.writeFileSync(path.join(root, 'docker-compose.yml'), compose);
    assertBackgroundMount(root, () => [], () => ({ phase: 'FENCED' }));
    assert.throws(() => assertBackgroundMount(root, () => [], () => null), /BACKGROUND_MANIFEST_REQUIRED/);
    fs.writeFileSync(path.join(root, 'docker-compose.yml'), compose.replace('read_only: true', 'read_only: false'));
    assert.throws(() => assertBackgroundMount(root, () => [], () => ({})), /READONLY_DIRECTORY_MOUNT/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
function configFixture() {
  const tuple = { PHOENIX_DATA_MOUNT_GUARD: 'true', PHOENIX_PG_DATA_DIR: '/data/pg', PHOENIX_UPLOADS_DIR: '/data/uploads', CHANJET_READONLY_SYNC_ENABLED: 'false', CHANJET_ERP_INBOUND_SYNC_ENABLED: 'false' };
  const control = { type: 'bind', source: '/var/lib/phoenix-background-control', target: '/run/phoenix-background-control', read_only: true, bind: { create_host_path: false } };
  const config = { services: { db: { volumes: [{ type: 'bind', source: '/data/pg', target: '/var/lib/postgresql/data' }] }, api: { environment: { CHANJET_READONLY_SYNC_ENABLED: 'false', CHANJET_ERP_INBOUND_SYNC_ENABLED: 'false' }, volumes: [{ type: 'bind', source: '/data/uploads', target: '/app/uploads' }, control] } } };
  return { tuple, config, control };
}
function drainFixture() {
  const participant = { containerId: 'c'.repeat(64), revision: oldSha, bootId: '00000000-0000-4000-8000-000000000001', startedAt: '2026-10-01T00:00:00.000Z', restartCount: 0 };
  const manifest = { protocolVersion: 1, phase: 'FENCED', owner: binding.owner, generation: 1, targetSha, participants: [participant] };
  const record = { protocolVersion: 1, phase: 'FENCED', owner: binding.owner, generation: 1, targetSha, previousFloorSha: oldSha, manifestDigest: createHash('sha256').update(JSON.stringify(manifest)).digest('hex') };
  const proof = { ...binding, protocolVersion: 1, outcome: 'DRAINED', generation: 1, participants: [participant] };
  const actual = { id: participant.containerId, ociRevision: oldSha, startedAt: participant.startedAt, restartCount: 0, running: true, health: 'healthy' };
  const deps = { env: { DEPLOY_RUN_ID: binding.owner, TARGET_SHA: targetSha }, readState: file => file.endsWith('background-control.json') ? record : proof, readManifest: () => manifest, metadata: () => actual };
  return { record, manifest, proof, actual, deps };
}
test('protected API mutation requires a private exact-run modern DRAINED proof, not an OPEN manifest or legacy eligibility', () => {
  { const f = drainFixture(); assert.equal(assertBackgroundFence('/fixture', f.deps), f.proof); }
  for (const modify of [
    f => { f.record.phase = 'OPEN'; }, f => { f.record.owner = '999-1'; }, f => { f.record.targetSha = oldSha; },
    f => { f.record.holdReason = 'OPERATOR_REQUIRED'; }, f => { f.record.manifestDigest = '0'.repeat(64); },
    f => { f.proof.outcome = 'STOP_AND_RECONCILE_ELIGIBLE'; }, f => { f.proof.generation++; },
    f => { f.proof.previousFloorSha = targetSha; }, f => { f.deps.readState = () => { throw new Error('missing'); }; },
    f => { f.actual.id = 'd'.repeat(64); }, f => { f.actual.restartCount = 1; }, f => { f.actual.health = 'unhealthy'; },
  ]) {
    const f = drainFixture(); modify(f); assert.throws(() => assertBackgroundFence('/fixture', f.deps), /BACKGROUND_DRAIN_PROOF_REQUIRED/);
  }
});
test('API up/restart without drain proof performs zero Docker mutations; other API mutation commands remain outside allowlist', () => {
  const imageId = 'sha256:' + 'a'.repeat(64); const images = { api: { imageId, revision: oldSha }, web: { imageId, revision: oldSha } };
  for (const args of [['up', '-d', '--no-deps', '--wait', 'api'], ['restart', 'api'], ['stop', 'api'], ['kill', 'api'], ['rm', 'api'], ['down'], ['up', '--force-recreate', 'api']]) {
    let writes = 0; const f = drainFixture(); f.deps.readState = () => { throw new Error('missing proof'); };
    assert.throws(() => runCompose(args, { maintenanceAdmission: () => {}, root: '/fixture', directory: '/fixture',
      readState: () => ({ version: CONTRACT.version, active: images }), guard: () => ({ project: 'phoenix-fixture' }),
      inspect: (imageId, revision) => ({ imageId, revision }), capture: () => images, eligibility: () => ({ allowed: true }),
      backgroundMount: () => {}, backgroundFence: () => assertBackgroundFence('/fixture', f.deps), execute: () => { writes++; },
    }), /BACKGROUND_DRAIN_PROOF_REQUIRED|UNSUPPORTED_OPERATION/);
    assert.equal(writes, 0);
  }
});
test('effective compose rejects writable, missing, auto-created, aliased or private control mounts', () => {
  { const { tuple, config } = configFixture(); validateEffectiveConfig(config, tuple); }
  for (const modify of [f => { f.control.read_only = false; }, f => { f.control.bind.create_host_path = true; }, f => { f.control.source = '/tmp/unsafe'; }, f => { f.config.services.api.volumes.pop(); }]) {
    const f = configFixture(); modify(f); assert.throws(() => validateEffectiveConfig(f.config, f.tuple), /BACKGROUND_CONTROL_MOUNT/);
  }
  for (const source of ['/var/lib/phoenix-erp', '/var/lib/phoenix-erp/production-deployment-state', '/var/lib', '/', '/var/lib/phoenix-background-control', '/var/lib/phoenix-background-control/manifest.json']) {
    const f = configFixture(); f.config.services.api.volumes.push({ type: 'bind', source, target: '/extra', read_only: true });
    assert.throws(() => validateEffectiveConfig(f.config, f.tuple), /PRIVATE_CONTROL_EXPOSURE/);
  }
});
