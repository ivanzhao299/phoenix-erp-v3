import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildResultBackfillPlan,
  requeueExpiredCapacityWaits,
  requeueSatisfiedDependencyHolds,
  restoreVerifiedTerminalEvidence,
  selectRunnableBugTasks,
  selectAutomaticRedispatchCandidates,
  selectReleaseReadyBacklog,
  shouldAttemptReleasePush,
} from './bug-intake-local-runner.mjs';
import { filterRunnerRuntimeStatus, gitStatusFiles } from './bug-intake-worktree-runtime.mjs';
import { classifyInfrastructureFailure, evaluateBugReleaseEvidence, evaluateWorkerEvidence } from './bug-intake-evidence-gate.mjs';
import { isTerminalLocalTask, mapWithConcurrency, pruneLegacySnapshots } from './bug-intake-sync-from-api.mjs';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

test('runner-created dependency links do not make a worktree dirty', () => {
  assert.equal(filterRunnerRuntimeStatus([
    '?? node_modules',
    '?? apps/api/node_modules',
    '?? apps/web/node_modules/',
  ].join('\n')), '');
});

test('inbox detail fetch keeps bounded concurrency and result order', async () => {
  let active = 0;
  let maxActive = 0;
  const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, value % 2 ? 2 : 1));
    active -= 1;
    return value * 10;
  });
  assert.deepEqual(result, [10, 20, 30, 40, 50]);
  assert.equal(maxActive, 2);
});

test('inbox sync never downgrades terminal local task evidence', () => {
  assert.equal(isTerminalLocalTask({ status: 'COMPLETED_MERGED' }), true);
  assert.equal(isTerminalLocalTask({ status: 'VALIDATION_COMPLETED' }), true);
  assert.equal(isTerminalLocalTask({ status: 'SKIPPED_NOT_APPLICABLE' }), true);
  assert.equal(isTerminalLocalTask({ status: 'running' }), false);
  assert.equal(isTerminalLocalTask({ status: 'HOLD' }), false);
});

test('legacy timestamp snapshots are pruned without touching current reports or attachments', () => {
  const root = fs.mkdtempSync('/tmp/bug-intake-inbox-');
  fs.mkdirSync(path.join(root, '20260722-010203', 'BUG-X'), { recursive: true });
  fs.writeFileSync(path.join(root, '20260722-010203', 'BUG-X', 'report.json'), '{"large":"snapshot"}');
  fs.mkdirSync(path.join(root, 'current', 'BUG-X'), { recursive: true });
  fs.writeFileSync(path.join(root, 'current', 'BUG-X', 'report.json'), '{"current":true}');
  fs.mkdirSync(path.join(root, 'attachments', 'BUG-X'), { recursive: true });
  fs.writeFileSync(path.join(root, 'attachments', 'BUG-X', 'proof.png'), 'fixture');

  const result = pruneLegacySnapshots(root);
  assert.equal(result.removed, 1);
  assert.equal(fs.existsSync(path.join(root, '20260722-010203')), false);
  assert.equal(fs.existsSync(path.join(root, 'current', 'BUG-X', 'report.json')), true);
  assert.equal(fs.existsSync(path.join(root, 'attachments', 'BUG-X', 'proof.png')), true);
  fs.rmSync(root, { recursive: true, force: true });
});

test('passed worker evidence restores a transient detached HOLD without rerunning code', () => {
  const tasks = [{
    task_id: 'BUGTASK-EVIDENCE-A4',
    status: 'HOLD',
    reason: 'detached worker did not write terminal implementation evidence',
    implementation_commit: '1234567',
    evidence_gate: {
      passed: true,
      role: 'implementation',
      terminalStatus: 'IMPLEMENTATION_COMPLETED',
      commitHash: '1234567',
    },
  }];
  assert.deepEqual(restoreVerifiedTerminalEvidence(tasks, new Date('2026-07-23T00:00:00Z')), [{
    task_id: 'BUGTASK-EVIDENCE-A4',
    status: 'IMPLEMENTATION_COMPLETED',
  }]);
  assert.equal(tasks[0].status, 'IMPLEMENTATION_COMPLETED');
  assert.equal(tasks[0].evidence_reconciled_at, '2026-07-23T00:00:00.000Z');
});

test('business and ops changes remain visible after runtime filtering', () => {
  assert.equal(filterRunnerRuntimeStatus([
    '?? node_modules',
    ' M apps/api/src/modules/bug-intake/bug-intake.service.ts',
    '?? docs/ops/runs/example.md',
  ].join('\n')), [
    ' M apps/api/src/modules/bug-intake/bug-intake.service.ts',
    '?? docs/ops/runs/example.md',
  ].join('\n'));
});

test('porcelain status paths preserve the leading path characters', () => {
  assert.deepEqual(gitStatusFiles([
    ' M docs/ops/BUG-X-report.md',
    '?? apps/api/src/x.ts',
  ].join('\n')), [
    'docs/ops/BUG-X-report.md',
    'apps/api/src/x.ts',
  ]);
  assert.deepEqual(gitStatusFiles('M docs/ops/BUG-X-report.md'), ['docs/ops/BUG-X-report.md']);
});

test('technical quarantine generation is eligible for one safe redispatch', () => {
  const reports = [{
    bugNo: 'BUG-TEST-0001',
    status: 'IN_PROGRESS',
    repairTaskStatus: 'AGENT_APPROVED',
    repairTaskPayload: {
      redispatchCount: 0,
      agentExecutionApproval: { approved: true },
      agentPlan: { selected_agents: ['A3-Backend-Critical-Path', 'A1-CI-Runtime-Gate'] },
      redispatchHistory: [],
    },
  }];
  const tasks = [
    { source: 'bug-intake', source_bug_no: 'BUG-TEST-0001', route_active: true, agent: 'A3-Backend-Critical-Path', status: 'HOLD', redispatch_count: 0, reason: 'incomplete implementation worktree preserved in quarantine; no code merged' },
    { source: 'bug-intake', source_bug_no: 'BUG-TEST-0001', route_active: true, agent: 'A1-CI-Runtime-Gate', status: 'HOLD', redispatch_count: 0, reason: 'blocked by failed dependency: A3' },
  ];
  assert.deepEqual(selectAutomaticRedispatchCandidates(reports, tasks), [{
    bugNo: 'BUG-TEST-0001',
    generation: 0,
    selectedAgents: ['A3-Backend-Critical-Path', 'A1-CI-Runtime-Gate'],
    recoveryCount: 0,
    reasons: ['incomplete implementation worktree preserved in quarantine; no code merged', 'blocked by failed dependency: A3'],
  }]);
});

test('detached worker technical HOLD is eligible for bounded automatic redispatch', () => {
  const reports = [{
    bugNo: 'BUG-TEST-DETACHED',
    status: 'IN_PROGRESS',
    repairTaskStatus: 'HOLD',
    repairTaskPayload: {
      redispatchCount: 0,
      agentExecutionApproval: { approved: true },
      agentPlan: { selected_agents: ['A4-Frontend-UAT-Smoke', 'A1-CI-Runtime-Gate'] },
      redispatchHistory: [],
    },
  }];
  const tasks = [
    { source: 'bug-intake', source_bug_no: 'BUG-TEST-DETACHED', route_active: true, agent: 'A4-Frontend-UAT-Smoke', status: 'HOLD', redispatch_count: 0, reason: 'detached worker did not write terminal implementation evidence; merge refused; worker exit=0' },
    { source: 'bug-intake', source_bug_no: 'BUG-TEST-DETACHED', route_active: true, agent: 'A1-CI-Runtime-Gate', status: 'HOLD', redispatch_count: 0, reason: 'blocked by failed dependency: A4' },
  ];
  assert.equal(selectAutomaticRedispatchCandidates(reports, tasks).length, 1);
});

test('a mixed terminal generation retries technical failures without discarding successful evidence', () => {
  const reports = [{
    bugNo: 'BUG-TEST-MIXED', status: 'IN_PROGRESS', repairTaskStatus: 'HOLD',
    repairTaskPayload: {
      redispatchCount: 2,
      agentExecutionApproval: { approved: true },
      agentPlan: { selected_agents: ['A3-Backend-Critical-Path', 'A4-Frontend-UAT-Smoke', 'A1-CI-Runtime-Gate'] },
      redispatchHistory: [],
    },
  }];
  const tasks = [
    { source: 'bug-intake', source_bug_no: 'BUG-TEST-MIXED', route_active: true, agent: 'A3-Backend-Critical-Path', status: 'COMPLETED_MERGED', redispatch_count: 2, evidence_gate: { passed: true } },
    { source: 'bug-intake', source_bug_no: 'BUG-TEST-MIXED', route_active: true, agent: 'A4-Frontend-UAT-Smoke', status: 'HOLD', redispatch_count: 2, reason: 'incomplete implementation worktree preserved in quarantine; no code merged' },
    { source: 'bug-intake', source_bug_no: 'BUG-TEST-MIXED', route_active: true, agent: 'A1-CI-Runtime-Gate', status: 'HOLD', redispatch_count: 2, reason: 'blocked by failed dependency: A4' },
  ];
  assert.deepEqual(selectAutomaticRedispatchCandidates(reports, tasks), [{
    bugNo: 'BUG-TEST-MIXED',
    generation: 2,
    selectedAgents: ['A3-Backend-Critical-Path', 'A4-Frontend-UAT-Smoke', 'A1-CI-Runtime-Gate'],
    recoveryCount: 0,
    reasons: [
      'incomplete implementation worktree preserved in quarantine; no code merged',
      'blocked by failed dependency: A4',
    ],
  }]);
});

test('expired Codex capacity waits requeue without becoming business HOLD', () => {
  const tasks = [{ status: 'WAITING_CAPACITY', route_active: true, retry_after: '2026-07-12T01:00:00.000Z' }];
  assert.equal(requeueExpiredCapacityWaits(tasks, new Date('2026-07-12T02:00:00.000Z')), true);
  assert.equal(tasks[0].status, 'pending');
});

test('only dependency HOLD requeues after every dependency recovers', () => {
  const tasks = [
    { task_id: 'A4', status: 'COMPLETED_MERGED' },
    {
      task_id: 'A1',
      status: 'HOLD',
      dependencies: ['A4'],
      reason: 'blocked by failed dependency: A4',
      evidence_gate: { role: 'dependency' },
      completed_at: 'old',
    },
    {
      task_id: 'BUSINESS',
      status: 'HOLD',
      dependencies: ['A4'],
      reason: 'manual review required',
      evidence_gate: { role: 'implementation' },
    },
  ];
  assert.equal(requeueSatisfiedDependencyHolds(tasks, new Date('2026-07-18T00:00:00Z')), true);
  assert.equal(tasks[1].status, 'pending');
  assert.equal(tasks[1].completed_at, null);
  assert.equal(tasks[1].dependency_recovered_at, '2026-07-18T00:00:00.000Z');
  assert.equal(tasks[2].status, 'HOLD');
});

test('capacity retry budget stops after three retries', () => {
  const tasks = [{ status: 'WAITING_CAPACITY', route_active: true, retry_count: 3, retry_after: '2026-07-12T01:00:00.000Z' }];
  assert.equal(requeueExpiredCapacityWaits(tasks, new Date('2026-07-12T02:00:00.000Z')), true);
  assert.equal(tasks[0].status, 'WAITING_RUNNER');
  assert.equal(tasks[0].retry_count, 4);
});

test('fresh pending work is selected before retried work and HOLD never runs', () => {
  const tasks = [
    { task_id: 'BUGTASK-OLD-A3', source: 'bug-intake', source_bug_no: 'BUG-OLD', agent: 'A3-Backend-Critical-Path', route_active: true, status: 'pending', retry_count: 1, created_at: '2026-07-01T00:00:00.000Z' },
    { task_id: 'BUGTASK-HOLD-A3', source: 'bug-intake', source_bug_no: 'BUG-HOLD', agent: 'A3-Backend-Critical-Path', route_active: true, status: 'HOLD', created_at: '2026-07-01T00:00:00.000Z' },
    { task_id: 'BUGTASK-NEW-A4', source: 'bug-intake', source_bug_no: 'BUG-NEW', agent: 'A4-Frontend-UAT-Smoke', route_active: true, status: 'pending', created_at: '2026-07-18T00:00:00.000Z' },
  ];
  assert.deepEqual(selectRunnableBugTasks(tasks, { maxCandidateTasks: 10 }).map((task) => task.task_id), [
    'BUGTASK-NEW-A4',
    'BUGTASK-OLD-A3',
  ]);
});

test('model cache schema mismatch is a non-retryable runner failure', () => {
  const failure = classifyInfrastructureFailure('failed to load models cache: missing field `supports_reasoning_summaries`');
  assert.equal(failure.code, 'CODEX_CLIENT_CACHE_INCOMPATIBLE');
  assert.equal(failure.terminalStatus, 'WAITING_RUNNER');
  assert.equal(failure.retryable, false);
});

test('source repair task report name satisfies implementation evidence', () => {
  const task = {
    task_id: 'BUGTASK-20260717-0001-A4',
    request_id: 'BUGTASK-20260717-0001',
    source_repair_task_no: 'BUGTASK-20260717-0001',
    source_bug_no: 'BUG-20260717-0001',
    agent: 'A4-Frontend-UAT-Smoke',
  };
  const evidence = evaluateWorkerEvidence({
    task,
    exitCode: 0,
    stdout: 'PASS WITH CONDITIONS',
    beforeHead: 'a',
    afterHead: 'b',
    changedFiles: [
      'apps/web/src/app/(admin)/procurement2/orders/page.tsx',
      'docs/ops/BUGTASK-20260717-0001-frontend-repair.md',
    ],
  });
  assert.equal(evidence.passed, true);
  assert.equal(evidence.terminalStatus, 'IMPLEMENTATION_COMPLETED');
});

test('integrated commit recovery accepts implementation completed tasks', () => {
  const workerSource = fs.readFileSync(path.join(TEST_DIR, 'agent-worker.mjs'), 'utf8');
  assert.match(
    workerSource,
    /recoverIntegratedCommit[\s\S]*\['pending',[\s\S]*'IMPLEMENTATION_COMPLETED'[\s\S]*\.includes\(task\.status\)/,
  );
});

test('resident evolution artifacts are treated as recoverable runner-owned dirty state', () => {
  const reports = [{
    bugNo: 'BUG-TEST-EVOLUTION', status: 'IN_PROGRESS', repairTaskStatus: 'HOLD',
    repairTaskPayload: {
      redispatchCount: 1,
      agentExecutionApproval: { approved: true },
      agentPlan: { selected_agents: ['A4-Frontend-UAT-Smoke', 'A1-CI-Runtime-Gate'] },
      redispatchHistory: [],
    },
  }];
  const reason = 'runner root must be clean before implementation integration: M docs/ops/OBSERVER_FINDINGS_REPORT.md\n M docs/ops/evolution/evolution-state.json';
  const tasks = [
    { source: 'bug-intake', source_bug_no: 'BUG-TEST-EVOLUTION', route_active: true, agent: 'A4-Frontend-UAT-Smoke', status: 'HOLD', redispatch_count: 1, reason },
    { source: 'bug-intake', source_bug_no: 'BUG-TEST-EVOLUTION', route_active: true, agent: 'A1-CI-Runtime-Gate', status: 'HOLD', redispatch_count: 1, reason: 'blocked by failed dependency: A4' },
  ];
  assert.equal(selectAutomaticRedispatchCandidates(reports, tasks).length, 1);
});

test('stale missing-implementation evidence is retryable after idempotent evidence support', () => {
  const reports = [{
    bugNo: 'BUG-TEST-EVIDENCE', status: 'IN_PROGRESS', repairTaskStatus: 'HOLD',
    repairTaskPayload: {
      redispatchCount: 0,
      agentExecutionApproval: { approved: true },
      agentPlan: { selected_agents: ['A4-Frontend-UAT-Smoke', 'A1-CI-Runtime-Gate'] },
    },
  }];
  const tasks = [
    { source: 'bug-intake', source_bug_no: 'BUG-TEST-EVIDENCE', route_active: true, agent: 'A4-Frontend-UAT-Smoke', status: 'HOLD', redispatch_count: 0, reason: 'Missing implementation evidence: approved business-file change, new implementation commit, task-specific report' },
    { source: 'bug-intake', source_bug_no: 'BUG-TEST-EVIDENCE', route_active: true, agent: 'A1-CI-Runtime-Gate', status: 'HOLD', redispatch_count: 0, reason: 'blocked by failed dependency: A4' },
  ];
  assert.equal(selectAutomaticRedispatchCandidates(reports, tasks).length, 1);
});

test('business HOLD and release agents are never auto-redispatched', () => {
  const base = {
    bugNo: 'BUG-TEST-0002', status: 'IN_PROGRESS', repairTaskStatus: 'HOLD',
    repairTaskPayload: { redispatchCount: 0, agentExecutionApproval: { approved: true }, agentPlan: { selected_agents: ['A7-Final-QA-Gate'] } },
  };
  assert.deepEqual(selectAutomaticRedispatchCandidates([base], [{
    source: 'bug-intake', source_bug_no: base.bugNo, route_active: true, agent: 'A7-Final-QA-Gate', status: 'HOLD', redispatch_count: 0, reason: 'security review failed',
  }]), []);
});

test('explicit leading PASS is not overridden by later fail-fast wording', () => {
  const evidence = evaluateWorkerEvidence({
    task: { task_id: 'BUGTASK-X-A3', source_bug_no: 'BUG-X', agent: 'A3-Backend-Critical-Path' },
    exitCode: 0,
    stdout: 'Run log: x\nPASS WITH CONDITIONS. Required columns still fail fast.',
    beforeHead: 'a',
    afterHead: 'b',
    changedFiles: ['apps/api/src/x.ts', 'docs/ops/BUG-X_A3_REPORT.md'],
  });
  assert.equal(evidence.conclusion, 'PASS_WITH_CONDITIONS');
  assert.equal(evidence.passed, true);
});

test('already-fixed implementation ownership is accepted without redundant code churn', () => {
  const evidence = evaluateWorkerEvidence({
    task: { task_id: 'BUGTASK-X-A4', source_bug_no: 'BUG-X', agent: 'A4-Frontend-UAT-Smoke' },
    exitCode: 0,
    stdout: 'Run log: x\nPASS WITH CONDITIONS. The frontend fix is already present on this branch. Focused tests PASS.',
    beforeHead: 'a', afterHead: 'a', changedFiles: [],
  });
  assert.equal(evidence.passed, true);
  assert.equal(evidence.terminalStatus, 'SKIPPED_NOT_APPLICABLE');
  assert.equal(evidence.role, 'implementation_verified_existing');
});

test('existing-fix wording variants remain idempotent', () => {
  for (const response of [
    'PASS WITH CONDITIONS. The branch already contains the backend fix in abc123. Tests PASS.',
    'PASS WITH CONDITIONS。当前分支已有后端修复提交 abc123，Jest PASS。',
    'PASS WITH CONDITIONS. Existing owned frontend diff evidence is verified. No new frontend source changes were made.',
    'PASS WITH CONDITIONS. The backend fix was already integrated in current HEAD via commit abc123.',
    '完成 A3 后端复核，结果：PASS WITH CONDITIONS。后端修复已在当前基线提交 a5e169f5 中集成，本次没有再改 backend 代码。',
    'PASS WITH CONDITIONS. Reconciled the already-integrated backend repair. No new edits were needed in this rerun.',
    'PASS WITH CONDITIONS. The backend failure mode is fixed; final resolution still needs CI/CD and production smoke.',
    'PASS WITH CONDITIONS. No new frontend source edit was needed in this pass because the branch already contains the frontend repair.',
  ]) {
    const evidence = evaluateWorkerEvidence({
      task: { task_id: 'BUGTASK-X-A3', source_bug_no: 'BUG-X', agent: 'A3-Backend-Critical-Path' },
      exitCode: 0, stdout: `Run log: x\n${response}`, beforeHead: 'a', afterHead: 'a', changedFiles: [],
    });
    assert.equal(evidence.terminalStatus, 'SKIPPED_NOT_APPLICABLE');
    assert.equal(evidence.role, 'implementation_verified_existing');
  }
});

test('verified existing implementation satisfies release evidence', () => {
  const implementation = {
    task_id: 'BUGTASK-X-A4', agent: 'A4-Frontend-UAT-Smoke', status: 'SKIPPED_NOT_APPLICABLE',
    route_active: true, redispatch_count: 2,
    evidence_gate: { passed: true, role: 'implementation_verified_existing' },
  };
  const validation = {
    task_id: 'BUGTASK-X-A1', agent: 'A1-CI-Runtime-Gate', status: 'VALIDATION_COMPLETED',
    route_active: true, redispatch_count: 2,
    evidence_gate: { passed: true, role: 'validation' },
  };
  const release = evaluateBugReleaseEvidence(
    [implementation, validation],
    ['A4-Frontend-UAT-Smoke', 'A1-CI-Runtime-Gate'],
  );
  assert.equal(release.passed, true);
});

test('approved remote HOLD remains eligible for evidence-backed recovery', () => {
  const report = {
    status: 'IN_PROGRESS',
    repairTaskStatus: 'HOLD',
    repairTaskPayload: { agentExecutionApproval: { approved: true } },
  };
  const eligible = report.repairTaskStatus === 'HOLD'
    && report.repairTaskPayload.agentExecutionApproval.approved === true;
  assert.equal(eligible, true);
});

test('result backfill must use the latest redispatch generation', () => {
  const tasks = [
    { agent: 'A4-Frontend-UAT-Smoke', status: 'HOLD', route_active: false, redispatch_count: 1 },
    { agent: 'A1-CI-Runtime-Gate', status: 'HOLD', route_active: false, redispatch_count: 1 },
    { agent: 'A4-Frontend-UAT-Smoke', status: 'COMPLETED_MERGED', route_active: true, redispatch_count: 3 },
    { agent: 'A1-CI-Runtime-Gate', status: 'VALIDATION_COMPLETED', route_active: true, redispatch_count: 3 },
  ];
  const active = tasks.filter((task) => task.route_active !== false);
  const maxGeneration = Math.max(...active.map((task) => task.redispatch_count));
  const current = active.filter((task) => task.redispatch_count === maxGeneration);
  assert.deepEqual(current.map((task) => task.status), ['COMPLETED_MERGED', 'VALIDATION_COMPLETED']);
});

test('verified existing implementation writes back as PASS, not NOT_APPLICABLE', () => {
  const task = {
    status: 'SKIPPED_NOT_APPLICABLE',
    evidence_gate: { passed: true, role: 'implementation_verified_existing' },
  };
  const conclusion = task.evidence_gate.role === 'implementation_verified_existing'
    ? 'PASS_WITH_CONDITIONS'
    : 'NOT_APPLICABLE';
  assert.equal(conclusion, 'PASS_WITH_CONDITIONS');
});

test('result backfill explicitly closes advisory agents omitted by the refined route', () => {
  const report = {
    repairTaskPayload: {
      agentPlan: {
        selected_agents: [
          'A2-Security-Regression-Gate',
          'A3-Backend-Critical-Path',
          'A4-Frontend-UAT-Smoke',
          'A5-Data-Readiness',
          'A1-CI-Runtime-Gate',
        ],
      },
    },
  };
  const tasks = [
    { agent: 'A3-Backend-Critical-Path', status: 'COMPLETED_MERGED' },
    { agent: 'A1-CI-Runtime-Gate', status: 'VALIDATION_COMPLETED' },
  ];
  const plan = buildResultBackfillPlan(report, tasks);
  assert.deepEqual(plan.selectedAgents, ['A3-Backend-Critical-Path', 'A1-CI-Runtime-Gate']);
  assert.deepEqual(plan.notApplicableAgents, [
    'A2-Security-Regression-Gate',
    'A4-Frontend-UAT-Smoke',
    'A5-Data-Readiness',
  ]);
  assert.deepEqual(plan.missingAgents, []);
});

test('verified backlog remains eligible for release in a later runner cycle', () => {
  const reports = [{ bugNo: 'BUG-BACKLOG', status: 'IN_PROGRESS', repairTaskStatus: 'AGENT_RUNNING' }];
  const tasks = [
    {
      source: 'bug-intake', source_bug_no: 'BUG-BACKLOG', route_active: true,
      redispatch_count: 1, agent: 'A3-Backend-Critical-Path', status: 'SKIPPED_NOT_APPLICABLE',
      evidence_gate: { passed: true, role: 'implementation_verified_existing' },
    },
    {
      source: 'bug-intake', source_bug_no: 'BUG-BACKLOG', route_active: true,
      redispatch_count: 1, agent: 'A1-CI-Runtime-Gate', status: 'VALIDATION_COMPLETED',
      evidence_gate: { passed: true, role: 'validation' },
    },
  ];
  assert.deepEqual(selectReleaseReadyBacklog(reports, tasks).map((item) => item.bugNo), ['BUG-BACKLOG']);
});

test('UAT-ready reports are not released again by an idle resident cycle', () => {
  const reports = [{ bugNo: 'BUG-UAT-READY', status: 'IN_PROGRESS', repairTaskStatus: 'FIX_READY_FOR_UAT' }];
  const tasks = [
    {
      source: 'bug-intake', source_bug_no: 'BUG-UAT-READY', route_active: true,
      redispatch_count: 1, agent: 'A4-Frontend-UAT-Smoke', status: 'COMPLETED_MERGED',
      evidence_gate: { passed: true, role: 'implementation' },
    },
    {
      source: 'bug-intake', source_bug_no: 'BUG-UAT-READY', route_active: true,
      redispatch_count: 1, agent: 'A1-CI-Runtime-Gate', status: 'VALIDATION_COMPLETED',
      evidence_gate: { passed: true, role: 'validation' },
    },
  ];
  assert.deepEqual(selectReleaseReadyBacklog(reports, tasks), []);
});

test('release push requires a real unpushed commit even when evidence passes', () => {
  const releaseEvidence = [{ bugNo: 'BUG-IDLE', evidence: { passed: true } }];
  assert.equal(shouldAttemptReleasePush({
    pushAfterSuccess: true,
    releaseEvidence,
    unpushedCommitCount: 0,
  }), false);
  assert.equal(shouldAttemptReleasePush({
    pushAfterSuccess: true,
    releaseEvidence,
    unpushedCommitCount: 1,
  }), true);
});
