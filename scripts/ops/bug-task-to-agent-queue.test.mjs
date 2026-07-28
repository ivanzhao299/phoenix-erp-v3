import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bugIntakeExecutionSlot,
  isTechnicalRedispatch,
  mergeExistingQueueTask,
  resolveRoutePlan,
} from './bug-task-to-agent-queue.mjs';
import { taskWorkspaceIdentity } from './agent-task-workspace.mjs';

const sharedIdentity = taskWorkspaceIdentity({
  taskId: 'BUGTASK-1-A3',
  agent: 'A3-Backend-Critical-Path',
  generation: 3,
});

const sharedTask = {
  task_id: 'BUGTASK-1-A3',
  source_bug_no: 'BUG-1',
  source_repair_task_no: 'BUGTASK-1',
  agent: 'A3-Backend-Critical-Path',
  status: 'pending',
  worktree: sharedIdentity.worktree,
  branch: sharedIdentity.branch,
  workspace_policy: sharedIdentity.workspace_policy,
  workspace_generation: 3,
  redispatch_count: 2,
};

test('Bug Intake execution slot carries the task-generation policy', () => {
  const slot = bugIntakeExecutionSlot(
    'A4-Frontend-UAT-Smoke',
    'BUGTASK-200-A4',
    {
      prompt_file: 'docs/ops/prompts/A4_FRONTEND_TASK_PROMPT.md',
      worktree_path: '/Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke',
      canonical_branch: 'w5-a4-frontend-uat-smoke',
    },
  );
  assert.equal(slot.workspace_policy, 'task-generation-isolated-v2');
  assert.equal(slot.workspace_generation, 1);
  assert.match(slot.worktree, /agent-tasks\/bugtask-200-a4-g1-a4$/);
  assert.match(slot.branch, /codex\/task\/bugtask-200-a4\/g1\/a4$/);
});

test('same-generation sync preserves quarantined terminal task', () => {
  const previous = {
    ...sharedTask,
    status: 'HOLD',
    worktree: '/Users/mac/phoenix-erp-worktrees/bug-intake-quarantine/BUGTASK-1-A3-1',
    branch: 'codex/quarantine/bugtask-1-a3-1',
    reason: 'incomplete implementation worktree preserved in quarantine; no code merged',
    evidence_gate: { passed: false, role: 'implementation' },
    quarantined_at: '2026-07-10T00:00:00.000Z',
  };

  const result = mergeExistingQueueTask(previous, sharedTask, { redispatchRequested: true });

  assert.equal(result.action, 'skipped_terminal');
  assert.deepEqual(result.task, previous);
});

test('new redispatch generation resets terminal evidence and uses clean execution slot', () => {
  const previous = {
    ...sharedTask,
    status: 'HOLD',
    worktree: '/Users/mac/phoenix-erp-worktrees/bug-intake-quarantine/BUGTASK-1-A3-1',
    branch: 'codex/quarantine/bugtask-1-a3-1',
    reason: 'quarantined',
    evidence_gate: { passed: false },
  };
  const nextIdentity = taskWorkspaceIdentity({
    taskId: sharedTask.task_id,
    agent: sharedTask.agent,
    generation: 4,
  });
  const next = {
    ...sharedTask,
    redispatch_count: 3,
    workspace_generation: 4,
    worktree: nextIdentity.worktree,
    branch: nextIdentity.branch,
  };

  const result = mergeExistingQueueTask(previous, next, { redispatchRequested: true });

  assert.equal(result.action, 'requeued');
  assert.equal(result.task.status, 'pending');
  assert.equal(result.task.redispatch_count, 3);
  assert.equal(result.task.worktree, nextIdentity.worktree);
  assert.equal(result.task.branch, nextIdentity.branch);
  assert.equal(result.task.reason, null);
  assert.equal(result.task.evidence_gate, null);
});

test('administrator business redispatch resets verified successful evidence', () => {
  const previous = {
    ...sharedTask,
    status: 'COMPLETED_MERGED',
    redispatch_count: 2,
    evidence_gate: { passed: true, role: 'implementation', commitHash: 'abc1234' },
    implementation_commit: 'abc1234',
  };
  const next = { ...sharedTask, redispatch_count: 3, dependencies: ['BUGTASK-1-A5'] };

  const result = mergeExistingQueueTask(previous, next, { redispatchRequested: true });

  assert.equal(result.action, 'requeued');
  assert.equal(result.task.status, 'pending');
  assert.equal(result.task.redispatch_count, 3);
  assert.equal(result.task.evidence_gate, null);
  assert.equal(result.task.implementation_commit, '');
  assert.equal(result.task.carried_forward_at, null);
  assert.equal(result.task.carried_forward_reason, null);
});

test('technical runner redispatch may preserve verified successful evidence', () => {
  const previous = {
    ...sharedTask,
    status: 'COMPLETED_MERGED',
    redispatch_count: 2,
    evidence_gate: { passed: true, role: 'implementation', commitHash: 'abc1234' },
    implementation_commit: 'abc1234',
  };
  const next = { ...sharedTask, redispatch_count: 3, dependencies: ['BUGTASK-1-A5'] };

  const result = mergeExistingQueueTask(previous, next, {
    redispatchRequested: true,
    preserveTerminalEvidence: true,
  });

  assert.equal(result.action, 'carried_forward_terminal');
  assert.equal(result.task.status, 'COMPLETED_MERGED');
  assert.equal(result.task.redispatch_count, 3);
  assert.equal(result.task.evidence_gate.commitHash, 'abc1234');
  assert.deepEqual(result.task.dependencies, ['BUGTASK-1-A5']);
});

test('only the dedicated runner explicit redispatch is technical', () => {
  assert.equal(isTechnicalRedispatch({
    agentPlanGeneratedBy: 'redispatch-explicit:bug_intake_runner',
    agentExecutionApproval: {
      approved: true,
      approvedBy: 'bug_intake_runner',
      redispatch: true,
    },
  }), true);

  assert.equal(isTechnicalRedispatch({
    agentPlanGeneratedBy: 'redispatch:admin',
    agentExecutionApproval: {
      approved: true,
      approvedBy: 'admin',
      redispatch: true,
    },
  }), false);

  assert.equal(isTechnicalRedispatch({
    agentPlanGeneratedBy: 'redispatch-explicit:admin',
    agentExecutionApproval: {
      approved: true,
      approvedBy: 'admin',
      redispatch: true,
    },
  }), false);
});

test('approved task is reactivated after remote NOT_READY archival without generation drift', () => {
  const previous = {
    ...sharedTask,
    status: 'archived',
    route_active: false,
    completed_at: '2026-07-22T09:26:45.514Z',
    route_superseded_reason: 'remote bug is not executable: NOT_READY',
  };

  const result = mergeExistingQueueTask(previous, {
    ...sharedTask,
    route_active: true,
  });

  assert.equal(result.action, 'requeued');
  assert.equal(result.task.status, 'pending');
  assert.equal(result.task.route_active, true);
  assert.equal(result.task.completed_at, null);
  assert.equal(result.task.route_superseded_reason, null);
  assert.match(result.task.reactivation_reason, /became executable/);
});

test('route-refinement archive remains immutable without explicit redispatch', () => {
  const previous = {
    ...sharedTask,
    status: 'archived',
    route_active: false,
    route_superseded_reason: 'Agent removed by evidence-based bug-intake route refinement',
  };

  const result = mergeExistingQueueTask(previous, sharedTask);

  assert.equal(result.action, 'skipped_terminal');
  assert.deepEqual(result.task, previous);
});

test('interrupted approved reactivation is idempotently completed on the next sync', () => {
  const previous = {
    ...sharedTask,
    status: 'archived',
    route_active: true,
    route_superseded_reason: null,
    reactivation_reason: 'remote repair task became executable after NOT_READY archival',
  };

  const result = mergeExistingQueueTask(previous, sharedTask);

  assert.equal(result.action, 'requeued');
  assert.equal(result.task.status, 'pending');
  assert.equal(result.task.route_active, true);
});

test('explicit administrator redispatch route is not overwritten by keyword refinement', () => {
  const route = resolveRoutePlan({
    title: 'mobile端鸡舍管理页面提示错误',
    agentPlanGeneratedBy: 'redispatch-explicit:bug_intake_runner',
    agentPlan: {
      route_decision: 'PLAN_READY',
      selected_agents: ['A3-Backend-Critical-Path', 'A1-CI-Runtime-Gate'],
    },
    agentExecutionApproval: {
      approved: true,
      redispatch: true,
      redispatchCount: 4,
    },
  });

  assert.deepEqual(route.selected_agents, [
    'A3-Backend-Critical-Path',
    'A1-CI-Runtime-Gate',
  ]);
  assert.equal(route.route_source, 'administrator-approved-explicit-redispatch');
});

test('ordinary bug route still applies evidence-based keyword refinement', () => {
  const route = resolveRoutePlan({
    title: 'mobile端页面按钮样式错位',
    agentPlan: {
      route_decision: 'PLAN_READY',
      selected_agents: ['A3-Backend-Critical-Path', 'A1-CI-Runtime-Gate'],
    },
  });

  assert.deepEqual(route.selected_agents, [
    'A4-Frontend-UAT-Smoke',
    'A1-CI-Runtime-Gate',
  ]);
});
