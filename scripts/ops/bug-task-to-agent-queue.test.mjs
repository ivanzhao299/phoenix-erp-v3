import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeExistingQueueTask } from './bug-task-to-agent-queue.mjs';

const sharedTask = {
  task_id: 'BUGTASK-1-A3',
  source_bug_no: 'BUG-1',
  source_repair_task_no: 'BUGTASK-1',
  agent: 'A3-Backend-Critical-Path',
  status: 'pending',
  worktree: '/Users/mac/phoenix-erp-worktrees/bug-intake-a3',
  branch: 'codex/bug-intake-a3',
  redispatch_count: 2,
};

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
  const next = { ...sharedTask, redispatch_count: 3 };

  const result = mergeExistingQueueTask(previous, next, { redispatchRequested: true });

  assert.equal(result.action, 'requeued');
  assert.equal(result.task.status, 'pending');
  assert.equal(result.task.redispatch_count, 3);
  assert.equal(result.task.worktree, sharedTask.worktree);
  assert.equal(result.task.branch, sharedTask.branch);
  assert.equal(result.task.reason, null);
  assert.equal(result.task.evidence_gate, null);
});
