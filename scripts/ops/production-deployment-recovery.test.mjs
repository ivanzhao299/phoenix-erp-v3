import test from 'node:test';
import assert from 'node:assert/strict';
import { assessRecovery, planRecoveredState, executeRecoveryStages, RECOVERY_SCHEMA, CASE_A_STARTUP_RESULT, RECOVERY_PHASES } from './production-deployment-recovery.mjs';

const sha = c => c.repeat(40);
const image = c => `sha256:${c.repeat(64)}`;
const pin = (c, i) => ({ imageId: image(i), revision: sha(c) });
const approved = 'f'; const previous = 'p';
const now = Date.parse('2026-10-12T00:00:00.000Z');
const context = { targetRunId: '38031441639-1', approvedSha: sha(approved), recoveryRunId: '38200000001-1', now };

function validBundle(overrides = {}) {
  const previousPin = { api: pin(previous, 'a'), web: pin(previous, 'b') };
  const candidateApi = pin(approved, 'c');
  const previousActive = { version: 3, configSha: sha(approved), floorSha: sha(approved), active: previousPin, outcome: 'CONFIG_READY_HOLD', migrationBaseline: sha(previous) };
  const deployRecord = {
    version: 3, outcome: 'SWITCHING', switched: { api: true, web: false }, target: sha(approved), configSha: sha(approved), floorSha: sha(approved),
    previous: previousPin, active: { api: candidateApi, web: previousPin.web }, candidates: { api: candidateApi },
    migrationPaths: [], protectedImages: [previousPin.api.imageId, previousPin.web.imageId, candidateApi.imageId],
    expiresAt: '2026-10-10T07:12:58.864Z', migrationBaseline: sha(previous),
    evidence: { pre: '/state/pre.json', post: '/state/post.json', log: '/state/log.json' },
  };
  const marker = { version: 3, operation: 'CODE_HOLD', phase: 'IN_PROGRESS', runId: '38031441639-1', target: sha(approved), startedAt: '2026-10-10T06:42:57.386Z', expiresAt: '2026-10-10T07:12:57.386Z' };
  const bundle = {
    transaction: { version: 3, runId: '38031441639-1', phase: 'IN_PROGRESS', target: sha(approved), configSha: sha(approved) },
    deployRecord, marker,
    floor: { version: 3, floorSha: sha(approved), chanjetPolicy: 'HOLD', readonlyApproval: null },
    active: previousActive,
    runtime: { api: { imageId: candidateApi.imageId, revision: sha(approved) }, web: { imageId: previousPin.web.imageId, revision: sha(previous) } },
    containers: {
      db: { id: 'd'.repeat(64), image: image('d'), startedAt: '2026-10-05T04:03:03.533292753Z', ociRevision: null },
      api: { id: '8'.repeat(64), image: image('c'), startedAt: '2026-10-10T06:43:16.814799295Z', ociRevision: sha(approved) },
      web: { id: 'e'.repeat(64), image: image('e'), startedAt: '2026-10-08T06:39:19.544652894Z', ociRevision: sha(previous) },
    },
    readinessHttp: '200',
    liveEnv: { CHANJET_SYNC_POLICY: 'HOLD', CHANJET_READONLY_SYNC_ENABLED: 'false', CHANJET_ERP_INBOUND_SYNC_ENABLED: 'false' },
    evidence: {
      pre: { deployRunId: '38031441639-1', containers: { db: { id: 'd'.repeat(64), startedAt: '2026-10-05T04:03:03.533292753Z', image: image('d') }, web: { id: 'e'.repeat(64), startedAt: '2026-10-08T06:39:19.544652894Z', image: image('e'), ociRevision: sha(previous) } } },
      post: { deployRunId: '38031441639-1', containers: { db: { id: 'd'.repeat(64), startedAt: '2026-10-05T04:03:03.533292753Z', image: image('d') }, web: { id: 'e'.repeat(64), startedAt: '2026-10-08T06:39:19.544652894Z', image: image('e'), ociRevision: sha(previous) }, api: { id: '8'.repeat(64), startedAt: '2026-10-10T06:43:16.814799295Z', image: image('c'), ociRevision: sha(approved) } } },
      startup: { deployRunId: '38031441639-1', targetSha: sha(approved), result: 'HOLD_SCHEMA_OR_WRITE_SIGNAL', containerId: '8'.repeat(64) },
    },
    checkout: { head: sha(approved), clean: true },
    ...overrides,
  };
  bundle.__planBase = { deployRecord, marker, previousActive };
  return bundle;
}
const planFor = bundle => planRecoveredState(bundle.__planBase.deployRecord, bundle.__planBase.marker, { recoveryRunId: context.recoveryRunId, recoveredAt: '2026-10-12T03:00:00.000Z' });

test('the real run 38031441639-1 post-failure shape is recovery-eligible', () => {
  const assessment = assessRecovery(validBundle(), context);
  assert.deepEqual(assessment, { eligible: true, reasons: [], resumeFrom: null });
});
test('RECOVERY_RUN_ID is mandatory and bound', () => {
  assert.equal(assessRecovery(validBundle(), { ...context, recoveryRunId: '' }).reasons.includes('BINDING_RECOVERY_RUN_ID'), true);
  assert.equal(assessRecovery(validBundle(), { ...context, recoveryRunId: 'not-a-run' }).reasons.includes('BINDING_RECOVERY_RUN_ID'), true);
  const plan = planFor(validBundle());
  assert.equal(plan.deployRecord.recovery.recoveryRunId, context.recoveryRunId);
});
test('live container identity must match the POST snapshot for all three services', () => {
  for (const [mutation, reason] of [
    [b => { b.containers.api.id = '9'.repeat(64); }, 'LIVE_API_DRIFTED_FROM_POST'],
    [b => { b.containers.web.image = image('z'); }, 'LIVE_WEB_DRIFTED_FROM_POST'],
    [b => { b.containers.db.startedAt = '2026-10-11T00:00:00.000Z'; }, 'LIVE_DB_DRIFTED_FROM_POST'],
    [b => { b.containers.api.ociRevision = sha(previous); }, 'LIVE_API_REVISION_DRIFTED_FROM_POST'],
    [b => { delete b.containers.web; }, 'LIVE_WEB_UNAVAILABLE'],
  ]) {
    const bundle = validBundle(); mutation(bundle);
    assert.equal(assessRecovery(bundle, context).reasons.includes(reason), true, reason);
  }
});
test('every base precondition violation is reported individually', () => {
  const cases = [
    [{ transaction: { version: 3, runId: '999-1', phase: 'IN_PROGRESS', target: sha(approved), configSha: sha(approved) } }, 'TRANSACTION_BINDING'],
    [{ deployRecord: { ...validBundle().deployRecord, candidates: {} } }, 'DEPLOY_RECORD_SHAPE'],
    [{ deployRecord: { ...validBundle().deployRecord, outcome: 'PREPARED' } }, 'DEPLOY_RECORD_OUTCOME_PHASE_MISMATCH'],
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
    [{ checkout: { head: sha(approved), clean: false } }, 'CHECKOUT_NOT_CLEAN_TARGET'],
  ];
  for (const [override, expected] of cases) {
    const assessment = assessRecovery(validBundle(override), context);
    assert.equal(assessment.eligible, false, expected);
    assert.ok(assessment.reasons.includes(expected), `${expected} in ${assessment.reasons}`);
  }
});
test('completed archives are terminal and invalid phases are rejected', () => {
  assert.equal(assessRecovery(validBundle({ archive: { phase: 'COMPLETE' } }), context).reasons.includes('ALREADY_COMPLETE'), true);
  assert.equal(assessRecovery(validBundle({ archive: { phase: 'GARBAGE' } }), context).reasons.includes('ARCHIVE_PHASE_INVALID'), true);
});
test('resume after ACTIVE_WRITTEN verifies the recorded plan instead of the promotion state', () => {
  const bundle = validBundle();
  const plan = planFor(bundle);
  const assessment = assessRecovery({ ...bundle, archive: { phase: 'ACTIVE_WRITTEN', plan }, active: plan.active }, context);
  assert.deepEqual(assessment, { eligible: true, reasons: [], resumeFrom: 'ACTIVE_WRITTEN' });
  assert.equal(assessRecovery({ ...bundle, archive: { phase: 'ACTIVE_WRITTEN', plan }, active: bundle.active }, context).reasons.includes('ACTIVE_NOT_RECOVERED_PLAN'), true);
});
test('resume after DEPLOY_WRITTEN tolerates partially cleared markers', () => {
  const bundle = validBundle();
  const plan = planFor(bundle);
  const resumed = assessRecovery({ ...bundle, transaction: null, marker: bundle.marker, deployRecord: plan.deployRecord, active: plan.active, archive: { phase: 'DEPLOY_WRITTEN', plan } }, context);
  assert.deepEqual(resumed, { eligible: true, reasons: [], resumeFrom: 'DEPLOY_WRITTEN' });
  const fullyCleared = assessRecovery({ ...bundle, transaction: null, marker: null, deployRecord: plan.deployRecord, active: plan.active, archive: { phase: 'DEPLOY_WRITTEN', plan } }, context);
  assert.equal(fullyCleared.eligible, true);
});

// ── staged executor: failure at each boundary, resume, and idempotence ──
function ioHarness({ failAt } = {}) {
  const state = { active: undefined, deployRecord: undefined, archive: undefined, unlinked: [], activeWrites: 0, deployWrites: 0, archiveWrites: 0 };
  const archive = plan => ({ schema: RECOVERY_SCHEMA, phase: 'ARCHIVED', recoveryRunId: context.recoveryRunId, targetRunId: context.targetRunId, approvedSha: context.approvedSha, plan });
  return {
    state,
    makeArchive: archive,
    io: {
      writeActive(value) { state.activeWrites++; if (failAt === 'writeActive') throw new Error('injected'); state.active = value; },
      writeDeployRecord(value) { state.deployWrites++; if (failAt === 'writeDeployRecord') throw new Error('injected'); state.deployRecord = value; },
      writeArchive(value) { state.archiveWrites++; if (failAt === `archive:${value.phase}`) throw new Error('injected'); state.archive = value; },
      exists(name) { if (name === 'transaction.json') return !state.unlinked.includes('transaction.json'); if (name === 'policy-transition.json') return !state.unlinked.includes('policy-transition.json'); return false; },
      unlink(name) { if (failAt === `unlink:${name}`) throw new Error('injected'); state.unlinked.push(name); },
      now: () => '2026-10-12T04:00:00.000Z',
    },
  };
}
test('fresh execution applies all stages in order and clears both markers', () => {
  const harness = ioHarness();
  const result = executeRecoveryStages(harness.makeArchive(planFor(validBundle())), harness.io);
  assert.deepEqual(result.executed, ['ACTIVE_WRITTEN', 'DEPLOY_WRITTEN', 'COMPLETE']);
  assert.equal(harness.state.active.outcome, 'SUCCESS');
  assert.equal(harness.state.deployRecord.recovery.schema, RECOVERY_SCHEMA);
  assert.deepEqual(harness.state.unlinked.sort(), ['policy-transition.json', 'transaction.json']);
  assert.equal(harness.state.archive.phase, 'COMPLETE');
});
test('failure at active write leaves ARCHIVED state resumable', () => {
  const harness = ioHarness({ failAt: 'writeActive' });
  const archive = harness.makeArchive(planFor(validBundle()));
  assert.throws(() => executeRecoveryStages(archive, harness.io), /injected/);
  assert.equal(harness.state.activeWrites, 1);
  assert.equal(harness.state.deployWrites, 0);
  assert.deepEqual(harness.state.unlinked, []);
  // resume from the still-ARCHIVED archive completes without re-planning
  const resume = ioHarness();
  executeRecoveryStages(archive, resume.io);
  assert.deepEqual(resume.state.unlinked.sort(), ['policy-transition.json', 'transaction.json']);
});
test('failure after ACTIVE_WRITTEN resumes without rewriting active', () => {
  const first = ioHarness({ failAt: 'writeDeployRecord' });
  const plan = planFor(validBundle());
  const archive = first.makeArchive(plan);
  assert.throws(() => executeRecoveryStages(archive, first.io), /injected/);
  assert.equal(first.state.activeWrites, 1);
  assert.equal(first.state.deployWrites, 1);
  assert.equal(first.state.archive.phase, 'ACTIVE_WRITTEN');
  assert.deepEqual(first.state.unlinked, []);
  // the archive persisted at ACTIVE_WRITTEN becomes the resume entry point
  const resumeHarness = ioHarness();
  executeRecoveryStages(first.state.archive, resumeHarness.io, { resumedBy: '38300000002-1' });
  assert.equal(resumeHarness.state.activeWrites, 0, 'active must not be rewritten on resume');
  assert.equal(resumeHarness.state.deployWrites, 1);
  assert.deepEqual(resumeHarness.state.unlinked.sort(), ['policy-transition.json', 'transaction.json']);
  assert.equal(resumeHarness.state.archive.phase, 'COMPLETE');
  assert.deepEqual(resumeHarness.state.archive.resumedByRunIds, ['38300000002-1']);
  assert.equal(resumeHarness.state.archive.recoveryRunId, context.recoveryRunId, 'original recovery run id stays bound');
});
test('failure between marker deletions resumes and tolerates the missing marker', () => {
  const first = ioHarness({ failAt: 'unlink:transaction.json' });
  const plan = planFor(validBundle());
  assert.throws(() => executeRecoveryStages(first.makeArchive(plan), first.io), /injected/);
  assert.equal(first.state.archive.phase, 'DEPLOY_WRITTEN');
  const resumeHarness = ioHarness();
  executeRecoveryStages(first.state.archive, resumeHarness.io);
  assert.deepEqual(resumeHarness.state.unlinked.sort(), ['policy-transition.json', 'transaction.json']);
  assert.equal(resumeHarness.state.archive.phase, 'COMPLETE');
});
test('executor refuses completed or invalid archives and validates phases', () => {
  assert.deepEqual(RECOVERY_PHASES, ['ARCHIVED', 'ACTIVE_WRITTEN', 'DEPLOY_WRITTEN', 'COMPLETE']);
  const harness = ioHarness();
  assert.throws(() => executeRecoveryStages({ phase: 'COMPLETE' }, harness.io), /ARCHIVE_PHASE/);
  assert.throws(() => executeRecoveryStages(null, harness.io), /ARCHIVE_PHASE/);
  assert.equal(harness.state.archiveWrites, 0);
});
test('recovered plan carries Case A provenance', () => {
  const plan = planFor(validBundle());
  assert.equal(plan.deployRecord.recovery.startupResult, CASE_A_STARTUP_RESULT);
  assert.equal(plan.deployRecord.recovery.classification, 'CASE_A_BENIGN_STARTUP_LOG_SIGNALS');
  assert.equal(plan.deployRecord.recovery.forwardFinalized, true);
  assert.equal(plan.deployRecord.recovery.imageRollback, 'INELIGIBLE_PRE_FLOOR_API');
});
test('CLI refuses without explicit execution authorization', async () => {
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync('node', ['scripts/ops/production-deployment-recovery.mjs'], { encoding: 'utf8', cwd: new URL('../..', import.meta.url).pathname.replace(/\/$/, '') });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /DEPLOYMENT_RECOVERY=HOLD_EXECUTION_NOT_AUTHORIZED/);
});
