import assert from 'node:assert/strict';
import test from 'node:test';
import {
  approvedExecutionCommand,
  assignTaskWorkspace,
  ensureTaskWorkspace,
  isStaticAgentBranch,
  isStaticAgentWorktree,
  retireTaskGeneration,
  taskWorkspaceIdentity,
  validateTaskWorkspace,
} from './agent-task-workspace.mjs';

test('same Agent receives a distinct workspace for every task', () => {
  const first = taskWorkspaceIdentity({ taskId: 'BUGTASK-100-A3', agent: 'A3-Backend-Critical-Path' });
  const second = taskWorkspaceIdentity({ taskId: 'BUGTASK-101-A3', agent: 'A3-Backend-Critical-Path' });
  assert.notEqual(first.worktree, second.worktree);
  assert.notEqual(first.branch, second.branch);
});

test('redispatch creates a new immutable task generation', () => {
  const first = assignTaskWorkspace({
    task_id: 'BUGTASK-100-A4',
    agent: 'A4-Frontend-UAT-Smoke',
    redispatch_count: 0,
  });
  const retry = assignTaskWorkspace({
    task_id: 'BUGTASK-100-A4',
    agent: 'A4-Frontend-UAT-Smoke',
    redispatch_count: 1,
  });
  assert.equal(first.workspace_generation, 1);
  assert.equal(retry.workspace_generation, 2);
  assert.notEqual(first.worktree, retry.worktree);
  assert.notEqual(first.branch, retry.branch);
});

test('stale lease recovery cannot reuse a recorded older generation', () => {
  const recovered = assignTaskWorkspace({
    task_id: 'BUGTASK-STALE-A3',
    agent: 'A3-Backend-Critical-Path',
    workspace_generation: 1,
    redispatch_count: 1,
  });
  assert.equal(recovered.workspace_generation, 2);
  assert.match(recovered.branch, /\/g2\/a3$/);
  assert.match(recovered.worktree, /-g2-a3$/);
});

test('retiring a task records the old identity and allocates the next generation', () => {
  const first = assignTaskWorkspace({
    task_id: 'BUGTASK-RELEASE-A4',
    agent: 'A4-Frontend-UAT-Smoke',
  });
  const released = retireTaskGeneration(first, {
    reason: 'explicit task release',
    retiredAt: '2026-07-28T00:00:00.000Z',
  });
  assert.equal(released.workspace_generation, 2);
  assert.equal(released.retired_workspaces.length, 1);
  assert.equal(released.retired_workspaces[0].branch, first.branch);
  assert.equal(released.retired_workspaces[0].reason, 'explicit task release');
  assert.notEqual(released.worktree, first.worktree);
});

test('retiring legacy metadata advances beyond the recorded generation', () => {
  const first = assignTaskWorkspace({
    task_id: 'BUGTASK-LEGACY-GENERATION-A3',
    agent: 'A3-Backend-Critical-Path',
    workspace_generation: 7,
    redispatch_count: 0,
  });
  const released = retireTaskGeneration(first, { reason: 'legacy queue recovery' });

  assert.equal(first.workspace_generation, 7);
  assert.equal(released.workspace_generation, 8);
  assert.equal(released.redispatch_count, 7);
  assert.match(released.branch, /\/g8\/a3$/);
  assert.equal(released.retired_workspaces[0].generation, 7);
});

test('approved execution conversion works when identity arguments follow dry-run', () => {
  const converted = approvedExecutionCommand(
    'node run-agent-task.mjs --dry-run --task-id TASK-1 --workspace-generation 2',
  );
  assert.equal(converted.includes('--dry-run'), false);
  assert.match(converted, /--require-approval-token APPROVE_AGENT_EXECUTION --task-id TASK-1/);
});

test('canonical shared Agent worktrees are rejected as execution slots', () => {
  const result = validateTaskWorkspace({
    taskId: 'BUGTASK-100-A3',
    agent: 'A3-Backend-Critical-Path',
    generation: 1,
    worktree: '/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path',
    branch: 'w5-a3-backend-critical-path',
  });
  assert.equal(result.ok, false);
  assert.equal(isStaticAgentWorktree('/Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke'), true);
  assert.equal(isStaticAgentBranch('codex/bug-intake-a4'), true);
  assert.match(result.errors.join(' '), /template-only/);
});

test('branch and worktree identities must match task, generation and Agent', () => {
  const expected = taskWorkspaceIdentity({
    taskId: 'BUGTASK-100-A3',
    agent: 'A3-Backend-Critical-Path',
    generation: 2,
  });
  const result = validateTaskWorkspace({
    taskId: 'BUGTASK-100-A3',
    agent: 'A3-Backend-Critical-Path',
    generation: 2,
    worktree: expected.worktree,
    branch: expected.branch.replace('/g2/', '/g1/'),
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /branch identity mismatch/);
});

test('a missing worktree never reattaches an existing task-generation branch', () => {
  const expected = taskWorkspaceIdentity({
    taskId: 'BUGTASK-RETIRED-A3',
    agent: 'A3-Backend-Critical-Path',
    generation: 1,
  });
  const dryRun = ensureTaskWorkspace({
    taskId: expected.task_id,
    agent: expected.agent,
    generation: expected.generation,
    worktree: expected.worktree,
    branch: expected.branch,
    dryRun: true,
  });
  assert.equal(dryRun.ok, true);
  assert.equal(dryRun.reason, 'would create from origin/main');
});
