import assert from 'node:assert/strict';
import test from 'node:test';
import {modernSchemaFixture} from '../ci/modern-schema-release.fixture.mjs';
import {modernSchemaReleaseBinding} from './production-modern-schema-state.mjs';
import {createModernSchemaFormalBodyAdapters, verifyOriginalExecutorStopped} from './production-modern-schema-formal-body.mjs';
import {runModernSchemaDeploymentState} from './production-deployment-state.mjs';
import {runCompose} from './phoenix-production-compose.mjs';
import {ModernSchemaExecutorWatch} from './production-modern-schema-watch.mjs';

const preparationSha256 = 'f'.repeat(64);
const directory = '/tmp/owned-formal-request-fixture';
const root = '/tmp/owned-formal-checkout';
const oldId = '9'.repeat(64);
const newId = '8'.repeat(64);
const oldImage = 'sha256:' + 'b'.repeat(64);
const webImage = 'sha256:' + 'a'.repeat(64);
const startedAt = '2026-11-19T00:04:00.000Z';
const composeCommand = ['up', '-d', '--no-deps', '--wait', 'api'];
const tabJSON = cells => cells.map(cell => JSON.stringify(cell)).join('\\t');

function fixture({serialize, admitRequest} = {}) {
  const {context} = modernSchemaFixture();
  const old = {containerId: oldId, revision: context.runtimeSha, startedAt, restartCount: 1};
  const persisted = {version: 3, target: context.targetSha,
    active: {api: {imageId: context.candidateImageId, revision: context.targetSha},
      web: {imageId: webImage, revision: context.runtimeSha}}};
  const stopped = [oldId, '/phoenix-v3-api', oldImage, startedAt, false, 'exited', 0, false, 1, 'no'];
  const status = {stopped, events: [], admitted: true, candidate: null, argv: null, failWhen: null, lease: true, child: true};
  const request = {
    context, preparationSha256, rootLease: {fixtureOnly: true}, originalProcess: {pid: process.pid},
    originalChild: {pin: {pid: 9021}}, async admit({operation, when}) {
      status.events.push(operation + ':' + when);
      status.onAdmission?.(operation, when);
      return status.admitted && status.failWhen !== operation + ':' + when;
    },
  };
  const dependencies = {
    serialize, admitRequest,
    directory, root, guard() {},
    checkProcess() { return true; },
    checkLease() { return status.lease; },
    checkChild() { return status.child; },
    metadata(service) {
      assert.equal(service, 'api');
      return status.candidate;
    },
    dockerRead(args) {
      if (args[0] === 'inspect') {
        assert.equal(args[1], oldId);
        return tabJSON(stopped);
      }
      if (args[0] === 'image') {
        assert.equal(args[2], oldImage);
        return context.runtimeSha;
      }
      assert.deepEqual(args.slice(0, -1), ['exec', newId, '/usr/bin/env', '-i', 'PATH=/usr/local/bin:/usr/bin:/bin', '/usr/local/bin/node', '-e']);
      assert.match(args.at(-1), /127\.0\.0\.1:3100\/api\/readiness/);
      status.events.push('CONTAINER_READINESS');
      return JSON.stringify({status: 200, ready: true, dbConnected: true, bodySha256: 'f'.repeat(64), bodyBytes: 123});
    },
    backgroundFence(dir, {env, verifyOldExecutor}) {
      assert.equal(dir, directory);
      assert.equal(env.DEPLOY_RUN_ID, context.owner);
      assert.equal(verifyOldExecutor(old), true);
      return {...modernSchemaReleaseBinding(context, preparationSha256), participants: [old]};
    },
    async promote(path, config) {
      assert.equal(path, root);
      assert.equal(config.stagingDirectory, directory + '/floor-stage-' + context.owner);
      assert.equal(config.environment.APPROVED_PREVIOUS_FLOOR_SHA, context.floorSha);
      assert.equal(config.environment.TARGET_SHA, context.targetSha);
      assert.equal(await config.maintenanceAdmission(), true);
      status.events.push('PROMOTED');
    },
    async runState({operation, input, value, env, admit}, region) {
      const scope = [['begin', 'switch', 'candidate', 'complete'].includes(operation), region.root, region.directory];
      assert.deepEqual(scope, [true, root, directory]);
      assert.equal(env.DEPLOYMENT_EVIDENCE_PRE, directory + '/deploy-' + context.owner + '-pre-evidence.json');
      assert.equal(env.RUN_MIG, 'false');
      if (operation === 'begin') assert.equal(input, directory + '/run-' + context.owner + '/runtime-before.json');
      if (operation === 'candidate') assert.deepEqual([input, value], ['api', context.candidateImageId]);
      assert.equal(await admit(), true);
      status.events.push(operation.toUpperCase() + '_EFFECT');
    },
    compose(args, config) {
      // Use the actual Compose core for mode, immutable image and command rules.
      return runCompose(args, {...config,
        readState(file) { assert.equal(file, directory + '/deploy-' + context.owner + '.json'); return persisted; },
        guard() { return {project: 'phoenix-erp', floorSha: context.targetSha, chanjetPolicy: 'HOLD', readonlyApproval: null,
          operationalTuple: {CHANJET_READONLY_SYNC_ENABLED: 'false', CHANJET_ERP_INBOUND_SYNC_ENABLED: 'false'}}; },
        inspect(imageId, revision) { return {imageId, revision}; },
        capture() { return {api: {imageId: oldImage, revision: context.runtimeSha}, web: persisted.active.web}; },
        eligibility() { return {allowed: true}; },
        backgroundMount() { status.events.push('BACKGROUND_READONLY_MOUNT'); },
      });
    },
    async executeCompose(observed, registered) {
      status.argv = observed;
      status.events.push('COMPOSE_EXECUTES');
      await status.beforeRegistration?.();
      registered();
      await status.waitForCompose?.();
      status.candidate = {id: newId, image: context.candidateImageId, ociRevision: context.targetSha,
        startedAt, restartCount: 0, running: true, health: 'healthy'};
    },
  };
  const adapters = createModernSchemaFormalBodyAdapters(request, dependencies);
  const stage = directory + '/floor-stage-' + context.owner;
  async function throughSwitch() {
    await adapters.promote(stage);
    await adapters.state('begin', directory + '/run-' + context.owner + '/runtime-before.json');
    await adapters.state('candidate', 'api', context.candidateImageId);
    await adapters.state('switch', 'api');
  }
  return {adapters, stage, throughSwitch, status, context, old, read: dependencies.dockerRead};
}

test('typed admission and effects serialize with watch while Compose exit stays outside the queue', {timeout: 5000}, async () => {
  const watch = Object.create(ModernSchemaExecutorWatch.prototype);
  watch.serial = Promise.resolve();
  let releaseCompose;
  const composeCompletion = new Promise(resolve => { releaseCompose = resolve; });
  let registerCompose;
  const composeRegistration = new Promise(resolve => { registerCompose = resolve; });
  let signalCompose;
  const launched = new Promise(resolve => { signalCompose = resolve; });
  let insideQueue = false;
  const f = fixture({
    serialize: work => watch.serially(async () => {
      insideQueue = true;
      try { return await work(); }
      finally { insideQueue = false; }
    }),
    admitRequest: () => assert.equal(insideQueue, true),
  });
  f.status.onAdmission = () => assert.equal(insideQueue, true);
  f.status.beforeRegistration = () => {
    assert.equal(insideQueue, true);
    signalCompose();
    return composeRegistration;
  };
  f.status.waitForCompose = () => composeCompletion;
  const earlierWatch = watch.serially(() => assert.deepEqual(f.status.events, []));
  await f.throughSwitch();
  await earlierWatch;
  const compose = f.adapters.compose(composeCommand);
  await launched;
  let observed = false;
  try {
    const watchDuringCompose = watch.serially(() => {
      observed = true;
      assert.equal(insideQueue, false);
      assert.equal(f.status.candidate, null);
      assert.ok(!f.status.events.includes('COMPOSE:AFTER'));
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(observed, false);
    registerCompose();
    await watchDuringCompose;
  } finally { registerCompose(); releaseCompose(); }
  assert.equal(await compose, true);
  await f.adapters.readiness();
  await f.adapters.state('complete');
  assert.equal(f.adapters.completed(), true);
});

test('Compose launch failure releases the watch queue without finish or replay', async () => {
  const watch = Object.create(ModernSchemaExecutorWatch.prototype);
  watch.serial = Promise.resolve();
  const f = fixture({serialize: work => watch.serially(work)});
  await f.throughSwitch();
  f.status.beforeRegistration = () => { throw Error('fixture launch failure'); };
  await assert.rejects(f.adapters.compose(composeCommand), /COMPOSE_UNVERIFIED/);
  await watch.serially(() => assert.ok(!f.status.events.includes('COMPOSE:AFTER')));
  await assert.rejects(f.adapters.compose(composeCommand), /FORMAL_OPERATIONS_OUT_OF_ORDER/);
});

test('typed parent reuses the guarded API-only formal sequence and keeps both locks around effects', async () => {
  const f = fixture();
  await f.throughSwitch();
  await f.adapters.compose(composeCommand);
  await f.adapters.readiness();
  await f.adapters.state('complete');
  assert.equal(f.adapters.completed(), true);
  assert.deepEqual(f.status.argv.args, ['compose', '--project-name', 'phoenix-erp', '--env-file', root + '/.env',
    '-f', root + '/docker-compose.yml', ...composeCommand, '--no-build', '--pull', 'never', '--no-deps']);
  assert.equal(f.status.argv.binary, '/usr/bin/docker');
  assert.equal(f.status.argv.env.API_IMAGE, f.context.candidateImageId);
  assert.equal(f.status.argv.env.WEB_IMAGE, webImage);
  assert.equal(f.status.argv.env.CHANJET_SYNC_POLICY, 'HOLD');
  assert.equal(f.status.argv.env.GITHUB_TOKEN, undefined);
  assert.deepEqual(f.status.events.slice(-12), ['COMPOSE:BEFORE', 'BACKGROUND_READONLY_MOUNT', 'COMPOSE:WRITE',
    'COMPOSE_EXECUTES', 'COMPOSE:AFTER', 'READINESS:BEFORE', 'CONTAINER_READINESS', 'READINESS:AFTER',
    'COMPLETE:BEFORE', 'COMPLETE:WRITE', 'COMPLETE_EFFECT', 'COMPLETE:AFTER']);
});

test('out-of-order or unrelated body operations cannot reach the supervisor effect', async () => {
  const f = fixture();
  assert.throws(() => f.adapters.state('rollback-pin', 'api'), /FORMAL_STATE_SCOPE/);
  assert.throws(() => f.adapters.state('switch', 'web'), /FORMAL_STATE_SCOPE/);
  assert.throws(() => f.adapters.compose(['pull', 'api']), /FORMAL_COMPOSE_SCOPE/);
  assert.throws(() => f.adapters.promote('/etc/other'), /FORMAL_STAGE_SCOPE/);
  assert.throws(() => f.adapters.readiness('api'), /FORMAL_READINESS_SCOPE/);
  await assert.rejects(f.adapters.readiness(), /FORMAL_OPERATIONS_OUT_OF_ORDER/);
  assert.deepEqual(f.status.events, []);
});

test('a stopped executor must have original PID-equivalent Docker identity, normal exit and restart disabled', () => {
  const f = fixture();
  assert.equal(verifyOriginalExecutorStopped(f.old, f.read), true);
  for (const [column, invalid] of [[0, newId], [4, true], [5, 'restarting'], [6, 137], [7, true], [8, 2], [9, 'always']]) {
    const good = f.status.stopped[column];
    f.status.stopped[column] = invalid;
    assert.throws(() => verifyOriginalExecutorStopped(f.old, f.read), /NOT_GRACEFULLY_STOPPED/);
    f.status.stopped[column] = good;
  }
});

test('loss of the original child, original SQL lease or write admission blocks effects and replay', async () => {
  for (const mutation of [f => { f.status.lease = false; }, f => { f.status.child = false; },
    f => { f.status.failWhen = 'PROMOTE:WRITE'; }]) {
    const f = fixture();
    mutation(f);
    await assert.rejects(f.adapters.promote(f.stage), /ORIGINAL_SUPERVISOR_CHANNEL_LOST|SAME_OWNER_ADMISSION_REQUIRED/);
    assert.ok(!f.status.events.includes('PROMOTED'));
    await assert.rejects(f.adapters.promote(f.stage), /FORMAL_OPERATIONS_OUT_OF_ORDER/);
  }
  const f = fixture();
  await f.throughSwitch();
  f.status.failWhen = 'COMPOSE:WRITE';
  await assert.rejects(f.adapters.compose(composeCommand), /SAME_OWNER_ADMISSION_REQUIRED/);
  assert.equal(f.status.argv, null);
});

test('the candidate cannot be replaced in the readiness-to-completion interval', async () => {
  const f = fixture();
  await f.throughSwitch();
  await f.adapters.compose(composeCommand);
  await f.adapters.readiness();
  f.status.candidate.startedAt = '2026-11-19T00:05:00.000Z';
  await assert.rejects(f.adapters.state('complete'), /CANDIDATE_RUNTIME_CHANGED/);
  assert.equal(f.adapters.completed(), false);
});

test('the typed state core has no rollback or caller-asserted authorization', async () => {
  const {context} = modernSchemaFixture();
  const env = {DEPLOY_RUN_ID: context.owner, TARGET_SHA: context.targetSha,
    DEPLOY_MODE: 'api', BUILD_API: 'true', BUILD_WEB: 'false', RUN_MIG: 'false'};
  const args = {schemaRelease: context, env, admit: async () => false};
  await assert.rejects(runModernSchemaDeploymentState({...args, operation: 'rollback-pin', input: 'api'}), /SCHEMA_FORMAL_SCOPE/);
  await assert.rejects(runModernSchemaDeploymentState({...args, operation: 'begin'}), /SCHEMA_FORMAL_AUTHORITY/);
});

test('an original executor that revives during awaited write admission blocks the write', async () => {
  const f = fixture();
  f.status.onAdmission = (operation, when) => {
    if (operation === 'PROMOTE' && when === 'WRITE') f.status.stopped[4] = true;
  };
  await assert.rejects(f.adapters.promote(f.stage), /ORIGINAL_EXECUTOR_NOT_GRACEFULLY_STOPPED/);
  assert.ok(!f.status.events.includes('PROMOTED'));
  assert.equal(f.adapters.completed(), false);
});
