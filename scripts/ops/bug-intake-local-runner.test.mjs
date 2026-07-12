import assert from 'node:assert/strict';
import test from 'node:test';

import { selectAutomaticRedispatchCandidates } from './bug-intake-local-runner.mjs';
import { filterRunnerRuntimeStatus } from './bug-intake-worktree-runtime.mjs';

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

test('business HOLD and release agents are never auto-redispatched', () => {
  const base = {
    bugNo: 'BUG-TEST-0002', status: 'IN_PROGRESS', repairTaskStatus: 'HOLD',
    repairTaskPayload: { redispatchCount: 0, agentExecutionApproval: { approved: true }, agentPlan: { selected_agents: ['A7-Final-QA-Gate'] } },
  };
  assert.deepEqual(selectAutomaticRedispatchCandidates([base], [{
    source: 'bug-intake', source_bug_no: base.bugNo, route_active: true, agent: 'A7-Final-QA-Gate', status: 'HOLD', redispatch_count: 0, reason: 'security review failed',
  }]), []);
});
