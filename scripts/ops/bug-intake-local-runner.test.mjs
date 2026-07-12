import assert from 'node:assert/strict';
import test from 'node:test';

import { selectAutomaticRedispatchCandidates } from './bug-intake-local-runner.mjs';
import { filterRunnerRuntimeStatus, gitStatusFiles } from './bug-intake-worktree-runtime.mjs';
import { evaluateBugReleaseEvidence, evaluateWorkerEvidence } from './bug-intake-evidence-gate.mjs';

test('runner-created dependency links do not make a worktree dirty', () => {
  assert.equal(filterRunnerRuntimeStatus([
    '?? node_modules',
    '?? apps/api/node_modules',
    '?? apps/web/node_modules/',
  ].join('\n')), '');
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
