import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { assessRecovery, planRecoveredState, executeRecoveryStages, replayStartupWindow, RECOVERY_SCHEMA, CASE_A_STARTUP_RESULT, RECOVERY_PHASES, CASE_A_ERROR_RECEIPT_SCHEMA, BENIGN_STARTUP_ERROR_TRANSACTION, BENIGN_STARTUP_ERROR_ATTRIBUTION, BENIGN_STARTUP_ERROR_WORD_SET } from './production-deployment-recovery.mjs';

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
    [{ evidence: { ...validBundle().evidence, startup: { ...validBundle().evidence.startup, result: 'HOLD_STARTUP_ERROR' } } }, 'RECEIPT_MISSING'],
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
  const boundArchive = { schema: RECOVERY_SCHEMA, phase: 'ACTIVE_WRITTEN', targetRunId: context.targetRunId, approvedSha: context.approvedSha, recoveryRunId: context.recoveryRunId, plan };
  const assessment = assessRecovery({ ...bundle, archive: boundArchive, active: plan.active }, context);
  assert.deepEqual(assessment, { eligible: true, reasons: [], resumeFrom: 'ACTIVE_WRITTEN' });
  assert.equal(assessRecovery({ ...bundle, archive: boundArchive, active: bundle.active }, context).reasons.includes('ACTIVE_NOT_RECOVERED_PLAN'), true);
});
test('resume after DEPLOY_WRITTEN tolerates partially cleared markers', () => {
  const bundle = validBundle();
  const plan = planFor(bundle);
  const resumed = assessRecovery({ ...bundle, transaction: null, marker: bundle.marker, deployRecord: plan.deployRecord, active: plan.active, archive: { schema: RECOVERY_SCHEMA, phase: 'DEPLOY_WRITTEN', targetRunId: context.targetRunId, approvedSha: context.approvedSha, recoveryRunId: context.recoveryRunId, plan } }, context);
  assert.deepEqual(resumed, { eligible: true, reasons: [], resumeFrom: 'DEPLOY_WRITTEN' });
  const fullyCleared = assessRecovery({ ...bundle, transaction: null, marker: null, deployRecord: plan.deployRecord, active: plan.active, archive: { schema: RECOVERY_SCHEMA, phase: 'DEPLOY_WRITTEN', targetRunId: context.targetRunId, approvedSha: context.approvedSha, recoveryRunId: context.recoveryRunId, plan } }, context);
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

// ── workflow bundle: manifest must cover the full import closure and unpack cleanly ──
function recoveryBundleManifest() {
  const workflow = fs.readFileSync('.github/workflows/chanjet-readonly-restoration.yml', 'utf8');
  const match = workflow.match(/tar -czf "\$RECOVERY_TAR" -C scripts\/ops ([^\n]+)/);
  assert.ok(match, 'recovery bundle tar manifest must exist in the workflow');
  return match[1].trim().split(/\s+/);
}
test('recovery bundle manifest covers the full relative-import closure of every bundled module', () => {
  const manifest = recoveryBundleManifest();
  assert.ok(manifest.includes('production-deployment-recovery.mjs'));
  assert.ok(manifest.includes('production-deployment-evidence.mjs'), 'recovery CLI dynamically imports the evidence module');
  const imported = new Set();
  const visit = name => {
    if (imported.has(name)) return;
    imported.add(name);
    if (!name.endsWith('.mjs')) return;
    const source = fs.readFileSync(path.join('scripts/ops', name), 'utf8');
    for (const pattern of [/(?:from\s+|import\()\s*['"]\.\/([^'"]+)['"]/g, /new URL\(\s*['"]\.\/([^'"]+)['"]/g]) {
      for (const match of source.matchAll(pattern)) visit(match[1]);
    }
  };
  for (const name of manifest) visit(name);
  const missing = [...imported].filter(name => !manifest.includes(name));
  assert.deepEqual(missing, [], `bundle is missing relatively-imported modules: ${missing.join(', ')} (real recovery entrance would fail with ERR_MODULE_NOT_FOUND)`);
});
test('recovery bundle unpacks and every bundled module imports without ERR_MODULE_NOT_FOUND', async () => {
  const manifest = recoveryBundleManifest();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-bundle-'));
  try {
    execFileSync('tar', ['-czf', path.join(dir, 'bundle.tgz'), '-C', 'scripts/ops', ...manifest]);
    execFileSync('tar', ['-xzf', path.join(dir, 'bundle.tgz'), '-C', dir]);
    for (const name of manifest.filter(entry => entry.endsWith('.mjs'))) {
      const mod = await import(pathToFileURL(path.join(dir, name)).href);
      assert.notEqual(mod, undefined, name);
    }
    const recovery = await import(pathToFileURL(path.join(dir, 'production-deployment-recovery.mjs')).href);
    assert.equal(typeof recovery.assessRecovery, 'function');
    assert.equal(typeof recovery.executeRecoveryStages, 'function');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
// ── resume binding: an existing archive must match this exact recovery context ──
test('resume requires archive schema, run id, approved SHA and plan targets to match the context', () => {
  const bundle = validBundle();
  const plan = planFor(bundle);
  const makeArchive = () => ({ schema: RECOVERY_SCHEMA, phase: 'ACTIVE_WRITTEN', targetRunId: context.targetRunId, approvedSha: context.approvedSha, recoveryRunId: context.recoveryRunId, plan: JSON.parse(JSON.stringify(plan)) });
  const control = assessRecovery({ ...bundle, archive: makeArchive(), active: plan.active }, context);
  assert.deepEqual(control, { eligible: true, reasons: [], resumeFrom: 'ACTIVE_WRITTEN' });
  const mutations = [
    [archive => { archive.schema = 'phoenix.other/9'; }, 'ARCHIVE_SCHEMA_MISMATCH'],
    [archive => { archive.targetRunId = '999-9'; }, 'ARCHIVE_BINDING_MISMATCH'],
    [archive => { archive.approvedSha = 'b'.repeat(40); }, 'ARCHIVE_BINDING_MISMATCH'],
    [archive => { archive.plan.active.floorSha = 'b'.repeat(40); }, 'ARCHIVE_PLAN_CONTEXT_MISMATCH'],
    [archive => { archive.plan.active.configSha = 'b'.repeat(40); }, 'ARCHIVE_PLAN_CONTEXT_MISMATCH'],
    [archive => { archive.plan.active.active.api.revision = 'b'.repeat(40); }, 'ARCHIVE_PLAN_CONTEXT_MISMATCH'],
    [archive => { archive.plan.deployRecord.target = 'b'.repeat(40); }, 'ARCHIVE_PLAN_CONTEXT_MISMATCH'],
    [archive => { archive.plan.deployRecord.floorSha = 'b'.repeat(40); }, 'ARCHIVE_PLAN_CONTEXT_MISMATCH'],
    [archive => { archive.plan.deployRecord.candidates.api.revision = 'b'.repeat(40); }, 'ARCHIVE_PLAN_CONTEXT_MISMATCH'],
    [archive => { archive.plan.deployRecord.outcome = 'SWITCHING'; }, 'ARCHIVE_PLAN_CONTEXT_MISMATCH'],
    [archive => { delete archive.plan; }, 'ARCHIVE_PLAN_MISSING'],
  ];
  for (const [mutate, reason] of mutations) {
    const archive = makeArchive();
    mutate(archive);
    const assessment = assessRecovery({ ...bundle, archive, active: plan.active }, context);
    assert.equal(assessment.eligible, false, reason);
    assert.ok(assessment.reasons.includes(reason), `${reason} in ${assessment.reasons}`);
  }
});

// ── Case A benign startup-ERROR extension: exactly one transaction, receipt-gated ──
const C9383D50 = 'c9383d5043191213165e237bbdb7b984f7603345';
const THE_TS = '2026-10-12T05:39:03.720270742Z';
const benignWindow = [
  '[Nest] LOG [NestFactory] Starting Nest application...',
  '[Nest] LOG [RouterExplorer] Mapped {/api/v2/finance/cash/transactions/bulk-delete, POST} route',
  `[Nest] LOG [RoutesResolver] \u001b[36mSysErrorLogsController\u001b[39m {/api/system/error-logs}: \u001b[32m+12ms\u001b[39m`,
  'API_BOOTSTRAP_SCHEMA_COMPATIBILITY=PASS',
];
const benignStreams = { stdout: benignWindow.map((l, i) => `2026-10-12T05:39:0${i}.000000000Z ${l}`).join('\n') + `\n${THE_TS} ` + '[Nest] LOG [RoutesResolver] \u001b[36mSysErrorLogsController\u001b[39m {/api/system/error-logs}: \u001b[32m+12ms\u001b[39m\n', stderr: '' };
const benignDockerLogs = () => benignStreams;

async function benignParts() {
  const evidenceShell = {
    post: { deployRunId: BENIGN_STARTUP_ERROR_TRANSACTION.runId, containers: { db: { id: 'd'.repeat(64), startedAt: '2026-10-05T04:03:03.533292753Z', image: image('d') }, web: { id: 'e'.repeat(64), startedAt: '2026-10-08T06:39:19.544652894Z', image: image('e'), ociRevision: sha(previous) }, api: { id: '9'.repeat(64), startedAt: '2026-10-12T05:38:41.000000000Z', image: image('c'), ociRevision: C9383D50 } } },
    startup: { deployRunId: BENIGN_STARTUP_ERROR_TRANSACTION.runId, targetSha: C9383D50, containerId: '9'.repeat(64), startedAt: '2026-10-12T05:38:41.000000000Z', capturedAt: '2026-10-12T05:39:10.400000000Z' },
  };
  const replay = await replayStartupWindow(evidenceShell, benignDockerLogs);
  const dbBaseline = { mirrorRows: 17717, entityRows: 41577, arSnapshotRows: 150, runningJobs: 0, queuedJobs: 0, writebackPending: 0, wmsWritebackPending: 0, remoteWriteAttempts: 0, wmsRemoteWriteAttempts: 0, inboundRuns: 0 };
  const receipt = {
    schema: CASE_A_ERROR_RECEIPT_SCHEMA, runId: BENIGN_STARTUP_ERROR_TRANSACTION.runId, targetSha: BENIGN_STARTUP_ERROR_TRANSACTION.targetSha,
    startup: { result: 'HOLD_STARTUP_ERROR', combinedDigest: replay.combinedDigest, schemaWriteSignalCount: 0, errorSignalCount: 1, schemaCompatibilityPass: true },
    errorLine: { ts: THE_TS, stream: 'stdout', attribution: BENIGN_STARTUP_ERROR_ATTRIBUTION, wordSet: [...BENIGN_STARTUP_ERROR_WORD_SET] },
    readinessHttp: 200, dbBaseline,
  };
  const evidence = {
    ...evidenceShell,
    pre: { deployRunId: BENIGN_STARTUP_ERROR_TRANSACTION.runId, containers: { db: evidenceShell.post.containers.db, web: evidenceShell.post.containers.web } },
    startup: { ...evidenceShell.startup, result: 'HOLD_STARTUP_ERROR', schemaWriteSignalCount: 0, errorSignalCount: 1, sensitiveLineCount: 4, eventCounts: { SCHEMA_COMPATIBILITY_PASS: 1, READINESS_HTTP_PASS: 1 }, combinedDigest: replay.combinedDigest },
  };
  return { replay, receipt, evidence, dbBaseline };
}
async function benignBundle(overrides = {}) {
  const { replay, receipt, evidence, dbBaseline } = await benignParts();
  const previousPin = { api: pin(previous, 'a'), web: pin(previous, 'b') };
  const candidateApi = { imageId: image('c'), revision: C9383D50 };
  return {
    transaction: { version: 3, runId: '38208343072-1', phase: 'IN_PROGRESS', target: C9383D50, configSha: C9383D50 },
    deployRecord: { version: 3, outcome: 'SWITCHING', switched: { api: true, web: false }, target: C9383D50, configSha: C9383D50, floorSha: C9383D50, previous: previousPin, active: { api: candidateApi, web: previousPin.web }, candidates: { api: candidateApi }, migrationPaths: [], protectedImages: [], expiresAt: '2026-10-12T06:08:41.555Z', migrationBaseline: sha(previous), evidence: { pre: '/p', post: '/q', log: '/l' } },
    marker: { version: 3, operation: 'CODE_HOLD', phase: 'IN_PROGRESS', runId: '38208343072-1', target: C9383D50, startedAt: '2026-10-12T05:38:41.555Z', expiresAt: '2026-10-12T06:08:41.555Z' },
    floor: { version: 3, floorSha: C9383D50, chanjetPolicy: 'HOLD', readonlyApproval: null },
    active: { version: 3, configSha: C9383D50, floorSha: C9383D50, active: previousPin, outcome: 'CONFIG_READY_HOLD', migrationBaseline: sha(previous) },
    runtime: { api: candidateApi, web: previousPin.web },
    containers: { db: { id: 'd'.repeat(64), image: image('d'), startedAt: '2026-10-05T04:03:03.533292753Z', ociRevision: null }, api: { id: '9'.repeat(64), image: image('c'), startedAt: '2026-10-12T05:38:41.000000000Z', ociRevision: C9383D50 }, web: { id: 'e'.repeat(64), image: image('e'), startedAt: '2026-10-08T06:39:19.544652894Z', ociRevision: sha(previous) } },
    readinessHttp: '200',
    liveEnv: { CHANJET_SYNC_POLICY: 'HOLD', CHANJET_READONLY_SYNC_ENABLED: 'false', CHANJET_ERP_INBOUND_SYNC_ENABLED: 'false' },
    evidence, receipt, replay, dbEvidence: dbBaseline,
    checkout: { head: C9383D50, clean: true },
    ...overrides,
  };
}
const benignContext = { targetRunId: '38208343072-1', approvedSha: C9383D50, recoveryRunId: '38300000099-1', now: Date.parse('2026-10-12T07:00:00.000Z') };

test('replayStartupWindow returns sanitized identity, digest and shape counts', async () => {
  const { replay } = await benignParts();
  assert.equal(replay.available, true);
  assert.equal(replay.schemaWriteCount, 0);
  assert.equal(replay.sqlShapeCount, 0);
  assert.match(replay.combinedDigest, /^[a-f0-9]{64}$/);
  const line = replay.linesByTs[THE_TS];
  assert.equal(line.routesResolverLine, true);
  assert.equal(line.sensitive, false);
  assert.equal(line.sqlStatementShape, null);
  assert.deepEqual(line.wordSet, [...BENIGN_STARTUP_ERROR_WORD_SET]);
  const poisoned = await replayStartupWindow({ post: { containers: { api: { id: '9'.repeat(64) } } }, startup: { startedAt: '2026-10-12T05:38:41.000000000Z', capturedAt: '2026-10-12T05:39:10.400000000Z' } }, () => ({ stdout: `2026-10-12T05:39:05.000000000Z query: INSERT INTO x VALUES (1)\n`, stderr: '' }));
  assert.equal(poisoned.sqlShapeCount, 1);
  assert.equal((await replayStartupWindow({}, null)).available, false);
});
test('the benign single-line startup-error transaction is recovery-eligible only with a fully bound receipt', async () => {
  const bundle = await benignBundle();
  assert.deepEqual(assessRecovery(bundle, benignContext), { eligible: true, reasons: [], resumeFrom: null });
  const plan = planRecoveredState(bundle.deployRecord, bundle.marker, { recoveryRunId: benignContext.recoveryRunId, recoveredAt: '2026-10-12T07:00:00.000Z', startupResult: 'HOLD_STARTUP_ERROR', classification: 'CASE_A_BENIGN_STARTUP_ERROR_SINGLE_ROUTES_RESOLVER_LINE', receiptSha256: 'a'.repeat(64) });
  assert.equal(plan.deployRecord.recovery.startupResult, 'HOLD_STARTUP_ERROR');
  assert.equal(plan.deployRecord.recovery.classification, 'CASE_A_BENIGN_STARTUP_ERROR_SINGLE_ROUTES_RESOLVER_LINE');
  assert.equal(plan.deployRecord.recovery.receiptSha256, 'a'.repeat(64));
});
test('every benign-startup-error rejection path holds individually', async () => {
  const base = await benignBundle();
  const cases = [
    [b => ({ ...b, receipt: undefined }), 'RECEIPT_MISSING'],
    [b => ({ ...b, receipt: { ...b.receipt, schema: 'phoenix.other/1' } }), 'RECEIPT_SCHEMA'],
    [b => ({ ...b, receipt: { ...b.receipt, runId: '999-9' } }), 'RECEIPT_TRANSACTION_NOT_ELIGIBLE'],
    [() => ({ ...base, receipt: { ...base.receipt } }), null], // control placeholder
  ];
  // wrong binding context (run / SHA) fails closed at evidence binding before
  // the receipt path is even consulted
  assert.equal(assessRecovery(base, { ...benignContext, targetRunId: '38031441639-1' }).reasons.includes('EVIDENCE_BINDING'), true);
  assert.equal(assessRecovery(base, { ...benignContext, approvedSha: 'b'.repeat(40) }).reasons.includes('EVIDENCE_BINDING'), true);
  const mutations = [
    [b => { b.receipt.startup.combinedDigest = 'f'.repeat(64); }, 'RECEIPT_DIGEST_MISMATCH'],
    [b => { b.replay.combinedDigest = 'f'.repeat(64); }, 'REPLAY_DIGEST_MISMATCH'],
    [b => { b.evidence.startup.errorSignalCount = 2; }, 'RECEIPT_COUNTS_MISMATCH'],
    [b => { b.evidence.startup.schemaWriteSignalCount = 1; }, 'RECEIPT_SCHEMAWRITE_NONZERO'],
    [b => { b.evidence.startup.eventCounts.SCHEMA_COMPATIBILITY_PASS = 0; }, 'RECEIPT_COMPAT_MISMATCH'],
    [b => { b.replay.sqlShapeCount = 1; }, 'REPLAY_SQL_SHAPE_PRESENT'],
    [b => { b.replay.errorLineCount = 1; }, 'REPLAY_ERROR_NONZERO'],
    [b => { b.replay.schemaWriteCount = 1; }, 'REPLAY_SCHEMAWRITE_NONZERO'],
    [b => { delete b.replay.linesByTs[THE_TS]; }, 'RECEIPT_LINE_NOT_IN_WINDOW'],
    [b => { b.replay.linesByTs[THE_TS].sqlStatementShape = 'insert into'; }, 'REPLAY_LINE_SQL_SHAPE'],
    [b => { b.replay.linesByTs[THE_TS].routesResolverLine = false; }, 'REPLAY_LINE_ATTRIBUTION'],
    [b => { b.replay.linesByTs[THE_TS].sensitive = true; }, 'REPLAY_LINE_SENSITIVE'],
    [b => { b.receipt.errorLine.wordSet = ['Nest', 'LOG', 'Injected']; }, 'RECEIPT_LINE_IDENTITY_MISMATCH'],
    [b => { b.receipt.readinessHttp = 503; }, 'RECEIPT_READINESS_MISMATCH'],
    [b => { b.dbBaselineBad = (b.dbEvidence.mirrorRows = 99999); }, 'RECEIPT_DB_BASELINE_MISMATCH'],
    [b => { b.replay.available = false; }, 'REPLAY_UNAVAILABLE'],
    [b => { b.containers.api.id = '7'.repeat(64); }, 'LIVE_API_DRIFTED_FROM_POST'],
    [b => { b.liveEnv.CHANJET_READONLY_SYNC_ENABLED = 'true'; }, 'LIVE_POLICY_FLAGS'],
  ];
  for (const [mutate, reason] of mutations) {
    const bundle = JSON.parse(JSON.stringify(base));
    bundle.receipt.errorLine.wordSet = bundle.receipt.errorLine.wordSet; // no-op keep
    mutate(bundle);
    const assessment = assessRecovery(bundle, benignContext);
    assert.equal(assessment.eligible, false, reason);
    assert.ok(assessment.reasons.includes(reason), `${reason} in ${assessment.reasons}`);
  }
  for (const [builder] of cases.filter(c => c[1])) {
    const assessment = assessRecovery(builder(base), benignContext);
    assert.equal(assessment.eligible, false);
  }
});
test('HOLD_STARTUP_ERROR outside the frozen transaction never becomes recoverable', async () => {
  const bundle = await benignBundle();
  const other = JSON.parse(JSON.stringify(bundle));
  other.transaction.runId = '99999999999-1';
  other.deployRecord = { ...other.deployRecord };
  const assessment = assessRecovery(other, { ...benignContext, targetRunId: '99999999999-1' });
  assert.equal(assessment.eligible, false);
  assert.ok(assessment.reasons.includes('EVIDENCE_BINDING'));
});

test('replay with the benign route line plus an additional real error line holds', async () => {
  const poisonedStreams = { stdout: benignStreams.stdout + '2026-10-12T05:39:06.000000000Z Error: connect ECONNREFUSED 127.0.0.1:5432\n', stderr: '' };
  const replay = await replayStartupWindow({ post: { containers: { api: { id: '9'.repeat(64) } } }, startup: { startedAt: '2026-10-12T05:38:41.000000000Z', capturedAt: '2026-10-12T05:39:10.400000000Z' } }, () => poisonedStreams);
  assert.equal(replay.errorLineCount, 1);
  assert.equal(replay.sqlShapeCount, 0);
  assert.equal(replay.linesByTs[THE_TS].routesResolverLine, true, 'the known-benign line is still identified as a route registration');
  const bundle = await benignBundle({ replay });
  const assessment = assessRecovery(bundle, benignContext);
  assert.equal(assessment.eligible, false);
  assert.ok(assessment.reasons.includes('REPLAY_ERROR_NONZERO'), `${assessment.reasons}`);
  assert.ok(assessment.reasons.includes('REPLAY_DIGEST_MISMATCH'), 'window changed, digest must also mismatch');
});
test('DB baseline validation requires complete integer field sets on both sides', async () => {
  const base = await benignBundle();
  const cases = [
    [b => { b.dbEvidence = { error: 'psql: connection refused' }; }, 'RECEIPT_DB_EVIDENCE_ERROR'],
    [b => { b.dbEvidence = undefined; }, 'RECEIPT_DB_EVIDENCE_ERROR'],
    [b => { b.receipt.dbBaseline = undefined; }, 'RECEIPT_DB_BASELINE_MISSING'],
    [b => { b.receipt.dbBaseline = {}; b.dbEvidence = {}; }, 'RECEIPT_DB_BASELINE_INVALID'],
    [b => { delete b.receipt.dbBaseline.mirrorRows; }, 'RECEIPT_DB_BASELINE_INVALID'],
    [b => { b.receipt.dbBaseline.mirrorRows = '17717'; }, 'RECEIPT_DB_BASELINE_INVALID'],
    [b => { b.receipt.dbBaseline.runningJobs = 1.5; }, 'RECEIPT_DB_BASELINE_INVALID'],
    [b => { delete b.dbEvidence.entityRows; }, 'RECEIPT_DB_EVIDENCE_INVALID'],
    [b => { b.dbEvidence.inboundRuns = null; }, 'RECEIPT_DB_EVIDENCE_INVALID'],
    [b => { b.dbEvidence.remoteWriteAttempts = '0'; }, 'RECEIPT_DB_EVIDENCE_INVALID'],
    [b => { b.dbEvidence.mirrorRows = 17718; }, 'RECEIPT_DB_BASELINE_MISMATCH'],
  ];
  for (const [mutate, reason] of cases) {
    const bundle = JSON.parse(JSON.stringify(base));
    mutate(bundle);
    const assessment = assessRecovery(bundle, benignContext);
    assert.equal(assessment.eligible, false, reason);
    assert.ok(assessment.reasons.includes(reason), `${reason} in ${assessment.reasons}`);
  }
});
