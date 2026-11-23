import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { verifyHeldFollowUp } from './production-held-follow-up.mjs';
import { canonicalDigest } from './production-maintenance-receipts.mjs';

const original = 'fa1ea7a2c9de8a99b202c80645e73379dffaa2c9', target = 'd'.repeat(40);
const originalApi = '45256139320-1', originalWeb = '45286437600-1', recovery = '45173837813-1';
const apiOwner = '50000000001-1', webOwner = '50000000002-1';
const pin = (c, revision) => ({ imageId: `sha256:${c.repeat(64)}`, revision });
const base = { api: pin('a', original), web: pin('b', original) };
const mixed = { api: pin('c', target), web: base.web };
const next = { api: mixed.api, web: pin('d', target) };
const spec = {
  api: { owner: apiOwner, previous: base, current: mixed, previousOwner: originalApi },
  web: { owner: webOwner, previous: mixed, current: next, previousOwner: apiOwner },
};

function fixture(mode = 'api', phase = 'admit') {
  const { owner, previous, current, previousOwner } = spec[mode];
  const state = new Map();
  const put = (name, value) => state.set(`${name}.json`, value);
  const deployment = (deployMode, sha, active) => ({
    version: 3, deployMode, target: sha, floorSha: sha, configSha: sha, active, outcome: 'SUCCESS',
  });
  put(`deploy-${originalApi}`, deployment('api', original, base));
  put(`deploy-${originalWeb}`, deployment('web', original, base));
  put(`schema-release-1123-consumed-${original}`, { owner: originalApi, targetSha: original });
  const intent = { formalDeploymentSha256: canonicalDigest(state.get(`deploy-${originalApi}.json`)) };
  put(`schema-release-open-commit-intent-${originalApi}`, intent);
  const archive = { schema: 'phoenix.modern-schema-forward-terminal-archive/v1', defaultOff: true, openCommitIntentSha256: canonicalDigest(intent) };
  put(`schema-release-forward-terminal-archive-${originalApi}`, archive);
  const verified = { apiTerminalSha256: canonicalDigest(archive) };
  put(`schema-release-1123-web-verified-${original}`, verified);
  const seal = { schema: 'phoenix.remediation-1123-completed-web/v1', apiOwner: originalApi, webOwner: originalWeb,
    targetSha: original, formalSha256: canonicalDigest(state.get(`deploy-${originalWeb}.json`)), verificationSha256: canonicalDigest(verified),
    apiImageId: base.api.imageId, webImageId: base.web.imageId };
  put(`schema-release-1123-web-completed-${original}`, seal);
  const entry = { recoveryOwner: recovery, archiveSha256: 'archive-hash', ingressIdentitySha256: 'ingress-hash' };
  const remove = { originalOwner: '45144287071-1', apiOwner: originalApi, webOwner: originalWeb, targetSha: original,
    archiveSha256: entry.archiveSha256, oldIdentity: entry.ingressIdentitySha256, webSealSha256: canonicalDigest(seal) };
  put(`schema-release-handoff-remove-intent-${recovery}`, remove);
  put(`schema-release-handoff-removed-${recovery}`, { ...remove, oldAbsent: true, outerIngressHeld: true });
  const switched = ['after', 'seal'].includes(phase);
  const live = switched ? current : previous;
  const floorSha = mode === 'api' && phase === 'admit' ? original : target;
  put('floor', { version: 3, phase: 'READY', floorSha, chanjetPolicy: 'HOLD', readonlyApproval: null, project: 'phoenix-fixture' });
  put('active', { version: 3, floorSha, outcome: 'SUCCESS', active: phase === 'seal' ? live : previous });
  const manifest = { protocolVersion: 1, phase: 'OPEN', owner: mode === 'api' && phase === 'seal' ? owner : previousOwner,
    generation: 118, targetSha: floorSha, participants: [{ revision: floorSha }] };
  const { participants: _publicOnly, ...privateManifest } = manifest;
  put('background-control', { ...privateManifest, manifestDigest: createHash('sha256').update(JSON.stringify(manifest)).digest('hex') });
  if (mode === 'web') put(`deploy-${apiOwner}`, {
    ...deployment('api', target, mixed), previous: base, switched: { api: true, web: false }, migrationPaths: [],
  });
  if (phase !== 'admit') put(`deploy-${owner}`, {
    ...deployment(mode, target, live), previous, candidates: { [mode]: current[mode] },
    switched: { api: mode === 'api' && switched, web: mode === 'web' && switched }, migrationPaths: [],
    outcome: phase === 'seal' ? 'SUCCESS' : switched ? 'SWITCHING' : 'PREPARED',
  });
  if (phase === 'before' || phase === 'after') {
    put('transaction', { runId: owner, target, phase: 'IN_PROGRESS' });
    if (mode === 'api') put('policy-transition', { runId: owner, target, operation: 'CODE_HOLD' });
  }
  const env = {
    DEPLOY_MODE: mode, DEPLOY_RUN_ID: owner, TARGET_SHA: target, HELD_FOLLOW_UP: mode === 'api' ? 'api' : `web-${apiOwner}`,
    RUN_MIG: 'false', APPROVE_PRODUCTION: 'true', PRESERVE_ARTIFACTS: 'true',
    ROTATE_CHANJET_CREDENTIALS: 'false', ONE_TIME_CONFIG_FLOOR_TRANSITION: 'false',
    BUILD_API: String(mode === 'api'), BUILD_WEB: String(mode === 'web'),
    APPROVED_CONFIG_FLOOR_SHA: mode === 'api' ? target : '', APPROVED_PREVIOUS_FLOOR_SHA: mode === 'api' ? original : '',
  };
  const calls = [];
  const deps = {
    store: { guard: () => {}, directory: '/fixture', exists: name => state.has(name), read: name => {
      assert.ok(state.has(name), `required ${name}`);
      return state.get(name);
    } },
    latestMain: sha => assert.equal(sha, target), migrations: (_root, base, sha) => {
      assert.equal(base, original);
      assert.equal(sha, target);
      return { changed: [] };
    },
    admit: () => {}, handoff: (_store, sha) => { assert.equal(sha, original); return { entry }; },
    retired: () => 0, manifest: () => manifest, runtime: () => live,
    verifyParticipant: (_participant, project, actual) => { assert.equal(project, 'phoenix-fixture'); assert.equal(actual, manifest); },
    edge: (dir, { forceProbe }) => { assert.equal(dir, '/fixture'); assert.equal(forceProbe, true); calls.push('edge'); },
  };
  return { env, deps, state, calls, manifest };
}

test('each phase binds the historic completion, code-only scope and held edge', () => {
  for (const mode of ['api', 'web']) for (const phase of ['admit', 'before', 'after', 'seal']) {
    const { env, deps, calls } = fixture(mode, phase);
    assert.deepEqual(verifyHeldFollowUp(phase, env, deps), {
      phase, mode, target, publicMaintenance: true, migrations: false, receiptOnly: false,
    });
    assert.deepEqual(calls, ['edge']);
  }
});

test('rejects schema effects, pending markers, unsafe phase, changed images and loose authority', () => {
  const negative = [
    ['MIGRATION_SCOPE', f => { f.deps.migrations = () => ({ changed: ['migration.ts'] }); }],
    ['OTHER_MAINTENANCE', f => f.state.set('schema-release-pending.json', {})],
    ['CANDIDATE_SCHEMA_RECEIPT', f => f.state.set(`schema-release-1123-consumed-${target}.json`, {})],
    ['TRANSACTION_PENDING', f => f.state.set('transaction.json', {})],
    ['NATIVE_FENCE_PRESENT', f => { f.deps.retired = () => 1; }],
    ['BACKGROUND_NOT_OPEN', f => { f.state.get('background-control.json').manifestDigest = 'changed'; }],
    ['BACKGROUND_NOT_OPEN', f => { f.manifest.phase = 'FENCED'; }],
    ['ADMISSION_PINS', f => { f.deps.runtime = () => next; }],
    ['ORIGINAL_API_TERMINAL', f => { f.state.get(`schema-release-forward-terminal-archive-${originalApi}.json`).defaultOff = false; }],
    ['HELD_FACTS_HOLD=VHOST_CHANGED', f => { f.deps.edge = () => { throw Error('HELD_FACTS_HOLD=VHOST_CHANGED'); }; }],
    ['INPUT', f => { f.env.RUN_MIG = 'true'; }],
    ['INPUT', f => { f.env.DEPLOY_MODE = 'full'; }],
  ];
  for (const [error, change] of negative) {
    const f = fixture();
    change(f);
    assert.throws(() => verifyHeldFollowUp('admit', f.env, f.deps), new RegExp(error));
  }
});

test('does not accept a formally successful API when its real participant reports stale control', () => {
  const f = fixture('web', 'admit');
  f.deps.verifyParticipant = () => { throw Error('BACKGROUND_HOLD=PARTICIPANT_FENCE_NOT_OBSERVED'); };
  assert.throws(() => verifyHeldFollowUp('admit', f.env, f.deps), /PARTICIPANT_FENCE_NOT_OBSERVED/);
});

test('a lost Web acknowledgement can be read back only against the exact prior Web success', () => {
  const { env, deps, state } = fixture('web', 'seal');
  env.DEPLOY_RUN_ID = '50000000003-1';
  env.HELD_FOLLOW_UP += `-verify-${webOwner}`;
  assert.equal(verifyHeldFollowUp('admit', env, deps).receiptOnly, true);
  assert.throws(() => verifyHeldFollowUp('before', env, deps), /REPLAY_INPUT/);
  state.get(`deploy-${webOwner}.json`).outcome = 'SWITCHING';
  assert.throws(() => verifyHeldFollowUp('admit', env, deps), /SWITCH_PINS/);
});

test('dispatch checks precede side effects and replay never reaches deployment', () => {
  const file = readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  const index = name => file.indexOf(name, file.indexOf('            unset MODERN_SCHEMA_BODY_SUPERVISED'));
  for (const job of ['test:', 'build-push:']) {
    const start = file.indexOf(`\n  ${job}`);
    assert.match(file.slice(start, file.indexOf('    runs-on:', start)), /held_receipt_only != 'true'/);
  }

  assert.ok(index('stage_held_follow_up') < index('perform_deployment()'));
  assert.ok(index('HELD_WEB_RECEIPT_VERIFIED') < index('perform_deployment()'));
  assert.ok(index('held_follow_up before\n              assert_target_main\n              production_state switch api') > index('production_state begin'));
  assert.ok(index('held_follow_up before\n              production_state switch web') > index('production_state begin'));
  assert.ok(index('held_follow_up after') < index('production_state complete'));
  assert.ok(index('held_follow_up seal') > index('background-deployment-session.mjs" run'));
});
