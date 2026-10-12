import test from 'node:test';
import assert from 'node:assert/strict';
import { assessRecovery, planRecoveredState, RECOVERY_SCHEMA, CASE_A_STARTUP_RESULT } from './production-deployment-recovery.mjs';

const sha = c => c.repeat(40);
const image = c => `sha256:${c.repeat(64)}`;
const pin = (c, i) => ({ imageId: image(i), revision: sha(c) });
const approved = 'f'; const previous = 'p';
const now = Date.parse('2026-10-12T00:00:00.000Z');
const context = { targetRunId: '38031441639-1', approvedSha: sha(approved), now };

function validBundle(overrides = {}) {
  const previousPin = { api: pin(previous, 'a'), web: pin(previous, 'b') };
  const candidateApi = pin(approved, 'c');
  return {
    transaction: { version: 3, runId: '38031441639-1', phase: 'IN_PROGRESS', target: sha(approved), configSha: sha(approved) },
    deployRecord: {
      version: 3, outcome: 'SWITCHING', switched: { api: true, web: false }, target: sha(approved), configSha: sha(approved), floorSha: sha(approved),
      previous: previousPin, active: { api: candidateApi, web: previousPin.web }, candidates: { api: candidateApi },
      migrationPaths: [], protectedImages: [previousPin.api.imageId, previousPin.web.imageId, candidateApi.imageId],
      expiresAt: '2026-10-10T07:12:58.864Z', migrationBaseline: sha(previous),
      evidence: { pre: '/state/pre.json', post: '/state/post.json', log: '/state/log.json' },
    },
    marker: { version: 3, operation: 'CODE_HOLD', phase: 'IN_PROGRESS', runId: '38031441639-1', target: sha(approved), startedAt: '2026-10-10T06:42:57.386Z', expiresAt: '2026-10-10T07:12:57.386Z' },
    floor: { version: 3, floorSha: sha(approved), chanjetPolicy: 'HOLD', readonlyApproval: null },
    active: { version: 3, configSha: sha(approved), floorSha: sha(approved), active: previousPin, outcome: 'CONFIG_READY_HOLD', migrationBaseline: sha(previous) },
    runtime: { api: { imageId: candidateApi.imageId, revision: sha(approved) }, web: { imageId: previousPin.web.imageId, revision: sha(previous) } },
    readinessHttp: '200',
    liveEnv: { CHANJET_SYNC_POLICY: 'HOLD', CHANJET_READONLY_SYNC_ENABLED: 'false', CHANJET_ERP_INBOUND_SYNC_ENABLED: 'false' },
    evidence: {
      pre: { deployRunId: '38031441639-1', containers: { db: { id: 'd'.repeat(64), startedAt: '2026-10-05T04:03:03.533292753Z', image: image('d') }, web: { id: 'e'.repeat(64), startedAt: '2026-10-08T06:39:19.544652894Z', image: image('e') } } },
      post: { deployRunId: '38031441639-1', containers: { db: { id: 'd'.repeat(64), startedAt: '2026-10-05T04:03:03.533292753Z', image: image('d') }, web: { id: 'e'.repeat(64), startedAt: '2026-10-08T06:39:19.544652894Z', image: image('e') }, api: { id: '8'.repeat(64), ociRevision: sha(approved) } } },
      startup: { deployRunId: '38031441639-1', targetSha: sha(approved), result: 'HOLD_SCHEMA_OR_WRITE_SIGNAL', containerId: '8'.repeat(64) },
    },
    ...overrides,
  };
}

test('the real run 38031441639-1 post-failure shape is recovery-eligible', () => {
  const assessment = assessRecovery(validBundle(), context);
  assert.deepEqual(assessment, { eligible: true, reasons: [] });
});
test('every precondition violation is reported individually', () => {
  const cases = [
    [{ transaction: { version: 3, runId: '999-1', phase: 'IN_PROGRESS', target: sha(approved), configSha: sha(approved) } }, 'TRANSACTION_BINDING'],
    [{ deployRecord: { ...validBundle().deployRecord, outcome: 'PREPARED', switched: { api: false, web: false } } }, 'DEPLOY_RECORD_SHAPE'],
    [{ deployRecord: { ...validBundle().deployRecord, expiresAt: new Date(now + 60000).toISOString() } }, 'TRANSACTION_NOT_EXPIRED'],
    [{ marker: { ...validBundle().marker, operation: 'READONLY_VERIFY' } }, 'POLICY_MARKER_SHAPE'],
    [{ marker: { ...validBundle().marker, startedAt: '2026-10-10T06:42:57.386Z', expiresAt: '2026-10-10T08:42:57.386Z' } }, 'POLICY_MARKER_WINDOW'],
    [{ floor: { ...validBundle().floor, chanjetPolicy: 'READONLY_VERIFY' } }, 'FLOOR_SHAPE'],
    [{ active: { ...validBundle().active, outcome: 'SUCCESS' } }, 'ACTIVE_STILL_PROMOTION_STATE'],
    [{ runtime: { ...validBundle().runtime, api: pin(previous, 'a') } }, 'RUNTIME_API_NOT_CANDIDATE'],
    [{ runtime: { ...validBundle().runtime, web: pin(approved, 'x') } }, 'RUNTIME_WEB_DRIFTED'],
    [{ readinessHttp: '503' }, 'READINESS'],
    [{ liveEnv: { ...validBundle().liveEnv, CHANJET_READONLY_SYNC_ENABLED: 'true' } }, 'LIVE_POLICY_FLAGS'],
    [{ evidence: { ...validBundle().evidence, startup: { ...validBundle().evidence.startup, result: 'HOLD_STARTUP_ERROR' } } }, 'EVIDENCE_BINDING'],
    [{ evidence: (() => { const bundle = validBundle(); const post = JSON.parse(JSON.stringify(bundle.evidence.post)); post.containers.web.id = '9'.repeat(64); return { ...bundle.evidence, post }; })() }, 'EVIDENCE_WEB_CHANGED'],
  ];
  for (const [override, expected] of cases) {
    const assessment = assessRecovery(validBundle(override), context);
    assert.equal(assessment.eligible, false, expected);
    assert.ok(assessment.reasons.includes(expected), `${expected} in ${assessment.reasons}`);
  }
});
test('binding context itself is validated', () => {
  assert.equal(assessRecovery(validBundle(), { ...context, approvedSha: 'nope' }).reasons.includes('BINDING_APPROVED_SHA'), true);
  assert.equal(assessRecovery(validBundle(), { ...context, targetRunId: '' }).reasons.includes('BINDING_TARGET_RUN_ID'), true);
});
test('recovered state forward-finalizes the candidate with full provenance', () => {
  const bundle = validBundle();
  const plan = planRecoveredState(bundle.deployRecord, bundle.marker, { recoveryRunId: '38200000000-1', recoveredAt: '2026-10-12T03:00:00.000Z' });
  assert.equal(plan.active.outcome, 'SUCCESS');
  assert.equal(plan.active.active.api.revision, sha(approved));
  assert.equal(plan.active.active.web.revision, sha(previous));
  assert.equal(plan.active.migrationBaseline, sha(approved));
  assert.equal(plan.deployRecord.outcome, 'SUCCESS');
  assert.equal(plan.deployRecord.recovery.schema, RECOVERY_SCHEMA);
  assert.equal(plan.deployRecord.recovery.startupResult, CASE_A_STARTUP_RESULT);
  assert.equal(plan.deployRecord.recovery.classification, 'CASE_A_BENIGN_STARTUP_LOG_SIGNALS');
  assert.equal(plan.deployRecord.recovery.markerStartedAt, bundle.marker.startedAt);
  assert.equal(plan.deployRecord.recovery.imageRollback, 'INELIGIBLE_PRE_FLOOR_API');
  assert.equal(plan.deployRecord.recovery.forwardFinalized, true);
});
test('CLI refuses without explicit execution authorization', async () => {
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync('node', ['scripts/ops/production-deployment-recovery.mjs'], { encoding: 'utf8', cwd: new URL('../..', import.meta.url).pathname.replace(/\/$/, '') });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /DEPLOYMENT_RECOVERY=HOLD_EXECUTION_NOT_AUTHORIZED/);
});
