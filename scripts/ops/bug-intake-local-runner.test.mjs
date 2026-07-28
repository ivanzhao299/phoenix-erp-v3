import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  auditFingerprintGitArgs,
  boundedDiagnosticText,
  bootstrapResultDeliveryReceipts,
  buildResultBackfillPlan,
  classifyRunnerFailure,
  collectReleaseCommitHashes,
  isEmptyCherryPickFailure,
  redactBoundedOutput,
  requeueExpiredCapacityWaits,
  requeueSatisfiedDependencyHolds,
  resultDeliveryId,
  runnerLifecycleWritebackDecision,
  shouldForceLifecycleRedelivery,
  restoreVerifiedTerminalEvidence,
  requeueInvalidTerminalEvidence,
  reportAcceptsTechnicalRelease,
  partitionReleaseEvidence,
  selectRunnableBugTasks,
  selectAutomaticRedispatchCandidates,
  selectReleaseReadyBacklog,
  shouldRecoverDetachedCommit,
  shouldAttemptReleasePush,
  shouldResumeAlreadyPushedRelease,
} from './bug-intake-local-runner.mjs';
import { bugIntakeExecutionSlot } from './bug-task-to-agent-queue.mjs';
import {
  filterRunnerRuntimeStatus,
  gitStatusFiles,
  worktreeNeedsOriginMainSync,
} from './bug-intake-worktree-runtime.mjs';
import { classifyInfrastructureFailure, evaluateBugReleaseEvidence, evaluateWorkerEvidence } from './bug-intake-evidence-gate.mjs';
import {
  isTerminalLocalTask,
  mapWithConcurrency,
  pruneLegacySnapshots,
  shouldPreserveLocalRoute,
} from './bug-intake-sync-from-api.mjs';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

test('runner-created dependency links do not make a worktree dirty', () => {
  assert.equal(filterRunnerRuntimeStatus([
    '?? node_modules',
    '?? apps/api/node_modules',
    '?? apps/web/node_modules/',
  ].join('\n')), '');
});

test('runner queue state and append-only events are runtime artifacts', () => {
  const source = fs.readFileSync(new URL('./bug-intake-local-runner.mjs', import.meta.url), 'utf8');
  assert.equal(source.includes("file.startsWith('docs/ops/agent-queue/')"), true);
  assert.equal(source.includes("'docs/ops/agent-queue'"), true);
});

test('UAT-ready reports archive stale local HOLD routes instead of degrading the runner', () => {
  const approved = {
    status: 'IN_PROGRESS',
    repairTaskPayload: { agentExecutionApproval: { approved: true } },
  };
  assert.equal(
    shouldPreserveLocalRoute({ ...approved, repairTaskStatus: 'AGENT_EXECUTION_FINISHED' }, true),
    true,
  );
  assert.equal(
    shouldPreserveLocalRoute({ ...approved, repairTaskStatus: 'FIX_READY_FOR_UAT' }, true),
    false,
  );
  assert.equal(
    shouldPreserveLocalRoute({ ...approved, repairTaskStatus: 'BUSINESS_VERIFIED' }, true),
    false,
  );
});

test('audit artifact fingerprint is compact and never loads a binary patch', () => {
  const args = auditFingerprintGitArgs(['docs/ops/runs']);
  assert.deepEqual(args, [
    'diff',
    '--cached',
    '--raw',
    '--no-renames',
    '--',
    'docs/ops/runs',
  ]);
  assert.equal(args.includes('--binary'), false);

  const source = fs.readFileSync(new URL('./bug-intake-local-runner.mjs', import.meta.url), 'utf8');
  assert.equal(source.includes('maxBuffer: MAX_GIT_OUTPUT_BYTES'), true);
  assert.equal(source.includes("['diff', '--cached', '--binary'"), false);
});

test('result delivery id is stable and changes with worker evidence', () => {
  const endpoint = 'https://erp.example/api/bug-intake/reports/BUG-1/agent-result';
  const base = { taskId: 'TASK-1', agent: 'A1', conclusion: 'PASS' };
  assert.equal(
    resultDeliveryId('BUG-1', endpoint, base),
    resultDeliveryId('BUG-1', endpoint, { ...base }),
  );
  assert.notEqual(
    resultDeliveryId('BUG-1', endpoint, base),
    resultDeliveryId('BUG-1', endpoint, { ...base, conclusion: 'HOLD' }),
  );
  assert.equal(
    resultDeliveryId('BUG-1', endpoint, { ...base, summary: 'cycle 1', resultFile: '/tmp/one.md' }),
    resultDeliveryId('BUG-1', endpoint, { ...base, summary: 'cycle 2', resultFile: '/tmp/two.md' }),
  );
});

test('selective release treats an already integrated patch as an empty cherry-pick', () => {
  assert.equal(isEmptyCherryPickFailure({
    status: 1,
    stdout: 'nothing to commit, working tree clean',
    stderr: 'The previous cherry-pick is now empty, possibly due to conflict resolution.',
  }), true);
  assert.equal(isEmptyCherryPickFailure({
    status: 1,
    stderr: 'CONFLICT (content): Merge conflict in service.ts',
  }), false);
});

test('verified lifecycle evidence is redelivered when the remote report regressed to HOLD', () => {
  assert.equal(shouldForceLifecycleRedelivery('HOLD'), true);
  assert.equal(shouldForceLifecycleRedelivery('AGENT_RUNNING'), true);
  assert.equal(shouldForceLifecycleRedelivery('FIX_READY_FOR_UAT'), false);
  assert.equal(shouldForceLifecycleRedelivery('BUSINESS_VERIFIED'), false);
});

test('runner output is bounded before redaction and ignores unsafe short secrets', () => {
  const secret = 'runner-secret-value';
  const output = redactBoundedOutput(`${'x'.repeat(2_000_000)}${secret}`, [secret, 'x'], 12000);
  assert.equal(output.includes(secret), false);
  assert.equal(output.endsWith('<redacted>'), true);
  assert.equal(output.length <= 12000, true);
});

test('failure classification compacts huge nested payloads before serialization', () => {
  const huge = {
    step: 'worker',
    stderr: 'timeout while waiting for Codex',
    nested: Array.from({ length: 100_000 }, (_, index) => ({
      index,
      output: 'x'.repeat(10_000),
    })),
  };
  const diagnostic = boundedDiagnosticText(huge);
  assert.equal(diagnostic.length <= 32768, true);
  assert.equal(classifyRunnerFailure(huge).category, 'RUNNER_TIMEOUT');
});

test('worker synchronizes both behind and diverged branches before execution', () => {
  assert.equal(worktreeNeedsOriginMainSync(true, false), true);
  assert.equal(worktreeNeedsOriginMainSync(false, false), true);
  assert.equal(worktreeNeedsOriginMainSync(false, true), false);
  assert.equal(worktreeNeedsOriginMainSync(true, true), false);
});

test('successful legacy result backfill bootstraps durable delivery receipts', () => {
  const outputDir = fs.mkdtempSync('/tmp/bug-result-receipts-');
  fs.writeFileSync(path.join(outputDir, 'latest-summary.json'), JSON.stringify({
    generatedAt: '2026-07-23T01:02:03.000Z',
    resultBackfill: {
      results: [{
        bugNo: 'BUG-1',
        posted: [
          { task_id: 'TASK-1', agent: 'A1', outboxId: 'delivered-1', ok: true },
          { task_id: 'TASK-2', agent: 'A2', outboxId: 'failed-1', ok: false },
        ],
      }],
    },
  }));

  const first = bootstrapResultDeliveryReceipts({ outputDir });
  const second = bootstrapResultDeliveryReceipts({ outputDir });
  const receipts = JSON.parse(fs.readFileSync(path.join(outputDir, 'result-delivery-receipts.json'), 'utf8'));

  assert.equal(first.imported, 1);
  assert.equal(first.total, 1);
  assert.equal(second.imported, 0);
  assert.equal(receipts['delivered-1'].taskId, 'TASK-1');
  assert.equal(receipts['delivered-1'].bootstrapped, true);
  assert.equal(receipts['failed-1'], undefined);
  fs.rmSync(outputDir, { recursive: true, force: true });
});

test('idle or release-disabled cycles never downgrade Agent execution to HOLD', () => {
  assert.deepEqual(
    runnerLifecycleWritebackDecision({ dryRun: false, pushAfterSuccess: false }, { push: { skipped: true } }),
    { run: false, reason: 'automatic release is disabled; preserve Agent execution state' },
  );
  assert.deepEqual(
    runnerLifecycleWritebackDecision(
      { dryRun: false, pushAfterSuccess: true },
      { push: { skipped: true, reason: 'no unpushed commits' } },
    ),
    { run: false, reason: 'no release attempt occurred: no unpushed commits' },
  );
  assert.deepEqual(
    runnerLifecycleWritebackDecision(
      { dryRun: false, pushAfterSuccess: true },
      {
        push: { skipped: false, status: 0 },
        ci: { skipped: false, ok: true },
        productionSmoke: { skipped: false, status: 0 },
      },
    ),
    { run: true, reason: 'release, CI/CD, and production smoke all passed' },
  );
  assert.equal(
    runnerLifecycleWritebackDecision(
      { dryRun: false, pushAfterSuccess: true },
      {
        push: { skipped: false, status: 1 },
        ci: { skipped: true },
        productionSmoke: { skipped: true },
      },
    ).run,
    false,
  );
});

test('release commit collection excludes audit-only branch commits', () => {
  assert.deepEqual(collectReleaseCommitHashes([
    { bugNo: 'BUG-1', evidence: { passed: true, commitHashes: ['abc1234', 'def5678'] } },
    { bugNo: 'BUG-2', evidence: { passed: true, commitHashes: ['abc1234'] } },
    { bugNo: 'BUG-3', evidence: { passed: false, commitHashes: ['bad9999'] } },
  ]), ['abc1234', 'def5678']);
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

test('successful worker completion output triggers task-specific commit recovery', () => {
  const task = { task_id: 'BUGTASK-RECOVER-A4' };
  assert.equal(shouldRecoverDetachedCommit(task, {
    status: 0,
    stdout: 'work complete\nBUGTASK-RECOVER-A4 -> IMPLEMENTATION_COMPLETED\n',
  }), true);
  assert.equal(shouldRecoverDetachedCommit(task, {
    status: 0,
    stdout: 'another task -> IMPLEMENTATION_COMPLETED',
  }), false);
  assert.equal(shouldRecoverDetachedCommit(task, {
    status: 1,
    stdout: 'BUGTASK-RECOVER-A4 -> IMPLEMENTATION_COMPLETED',
  }), false);
});

test('passed validation evidence restores a late A1 HOLD without implementation commit', () => {
  const tasks = [{
    task_id: 'BUGTASK-LATE-A1',
    agent: 'A1-CI-Runtime-Gate',
    status: 'HOLD',
    implementation_commit: '',
    evidence_gate: {
      passed: true,
      role: 'validation',
      terminalStatus: 'VALIDATION_COMPLETED',
    },
  }];
  assert.deepEqual(restoreVerifiedTerminalEvidence(tasks, new Date('2026-07-23T00:00:00Z')), [{
    task_id: 'BUGTASK-LATE-A1',
    status: 'VALIDATION_COMPLETED',
  }]);
  assert.equal(tasks[0].status, 'VALIDATION_COMPLETED');
});

test('terminal success without passed evidence is automatically requeued once', () => {
  const tasks = [{
    task_id: 'BUGTASK-INVALID-A4',
    agent: 'A4-Frontend-UAT-Smoke',
    status: 'SKIPPED_NOT_APPLICABLE',
    evidence_gate: null,
    result_file: 'docs/ops/runs/stale.md',
    completed_at: '2026-07-22T00:00:00.000Z',
  }];
  assert.deepEqual(requeueInvalidTerminalEvidence(tasks, new Date('2026-07-23T00:00:00Z')), [{
    task_id: 'BUGTASK-INVALID-A4',
    previous_status: 'SKIPPED_NOT_APPLICABLE',
    status: 'pending',
  }]);
  assert.equal(tasks[0].status, 'pending');
  assert.equal(tasks[0].evidence_gate, null);
  assert.equal(tasks[0].result_file, null);
  assert.equal(tasks[0].invalid_terminal_recovery_count, 1);
});

test('invalid terminal evidence recovery fails closed after one automatic attempt', () => {
  const tasks = [{
    task_id: 'BUGTASK-INVALID-REPEAT-A4',
    agent: 'A4-Frontend-UAT-Smoke',
    status: 'SKIPPED_NOT_APPLICABLE',
    evidence_gate: null,
    invalid_terminal_recovery_count: 1,
  }];
  assert.deepEqual(requeueInvalidTerminalEvidence(tasks, new Date('2026-07-23T00:00:00Z')), []);
  assert.equal(tasks[0].status, 'HOLD');
  assert.equal(tasks[0].evidence_gate.passed, false);
  assert.equal(tasks[0].evidence_gate.role, 'evidence_integrity');
});

test('interrupted invalid-evidence redispatch is persisted without consuming another retry', () => {
  const tasks = [{
    task_id: 'BUGTASK-INTERRUPTED-A4',
    agent: 'A4-Frontend-UAT-Smoke',
    status: 'SKIPPED_NOT_APPLICABLE',
    evidence_gate: null,
    invalid_terminal_recovery_count: 1,
    reason: 'invalid terminal state SKIPPED_NOT_APPLICABLE had no passed evidence; automatically requeued for one clean verification',
  }];
  assert.equal(requeueInvalidTerminalEvidence(tasks).length, 1);
  assert.equal(tasks[0].status, 'pending');
  assert.equal(tasks[0].invalid_terminal_recovery_count, 1);
});

test('invalid terminal recovery is limited to currently actionable inbox bugs', () => {
  const tasks = [
    { task_id: 'CURRENT', source_bug_no: 'BUG-CURRENT', status: 'SKIPPED_NOT_APPLICABLE', evidence_gate: null },
    { task_id: 'LEGACY', source_bug_no: 'BUG-LEGACY', status: 'COMPLETED_MERGED', evidence_gate: null },
  ];
  const recovered = requeueInvalidTerminalEvidence(
    tasks,
    new Date('2026-07-23T00:00:00Z'),
    new Set(['BUG-CURRENT']),
  );
  assert.deepEqual(recovered.map((item) => item.task_id), ['CURRENT']);
  assert.equal(tasks[0].status, 'pending');
  assert.equal(tasks[1].status, 'COMPLETED_MERGED');
});

test('invalid terminal evidence recovery uses explicit redispatch persistence', () => {
  const runnerSource = fs.readFileSync(path.join(TEST_DIR, 'bug-intake-local-runner.mjs'), 'utf8');
  assert.match(runnerSource, /explicitRedispatch: requeued\.length > 0/);
});

test('runner reconciles passed evidence before considering generation redispatch', () => {
  const runnerSource = fs.readFileSync(path.join(TEST_DIR, 'bug-intake-local-runner.mjs'), 'utf8');
  const reconciliation = runnerSource.indexOf('const evidenceReconciliation = sync.status === 0');
  const redispatch = runnerSource.indexOf('const generationRecovery = sync.status === 0');
  assert.ok(reconciliation > 0);
  assert.ok(redispatch > reconciliation);
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

test('stale shared-worktree rebase and quarantine failures are automatically redispatched', () => {
  const reports = [
    {
      bugNo: 'BUG-TEST-REBASE',
      status: 'IN_PROGRESS',
      repairTaskStatus: 'HOLD',
      repairTaskPayload: {
        redispatchCount: 0,
        agentExecutionApproval: { approved: true },
        agentPlan: { selected_agents: ['A3-Backend-Critical-Path', 'A1-CI-Runtime-Gate'] },
        redispatchHistory: [],
      },
    },
    {
      bugNo: 'BUG-TEST-QUARANTINE',
      status: 'IN_PROGRESS',
      repairTaskStatus: 'HOLD',
      repairTaskPayload: {
        redispatchCount: 0,
        agentExecutionApproval: { approved: true },
        agentPlan: { selected_agents: ['A4-Frontend-UAT-Smoke', 'A1-CI-Runtime-Gate'] },
        redispatchHistory: [],
      },
    },
  ];
  const tasks = [
    { source: 'bug-intake', source_bug_no: 'BUG-TEST-REBASE', route_active: true, agent: 'A3-Backend-Critical-Path', status: 'HOLD', redispatch_count: 0, reason: 'git rebase main failed: conflict in an unrelated historical bug commit' },
    { source: 'bug-intake', source_bug_no: 'BUG-TEST-REBASE', route_active: true, agent: 'A1-CI-Runtime-Gate', status: 'HOLD', redispatch_count: 0, reason: 'blocked by failed dependency: A3' },
    { source: 'bug-intake', source_bug_no: 'BUG-TEST-QUARANTINE', route_active: true, agent: 'A4-Frontend-UAT-Smoke', status: 'HOLD', redispatch_count: 0, reason: 'worktree preserved but quarantine branch rename failed: cannot rename current branch while not on any' },
    { source: 'bug-intake', source_bug_no: 'BUG-TEST-QUARANTINE', route_active: true, agent: 'A1-CI-Runtime-Gate', status: 'HOLD', redispatch_count: 0, reason: 'blocked by failed dependency: A4' },
  ];
  assert.deepEqual(
    selectAutomaticRedispatchCandidates(reports, tasks).map((item) => item.bugNo),
    ['BUG-TEST-REBASE', 'BUG-TEST-QUARANTINE'],
  );
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

test('bug report evidence treats hyphens and underscores as the same task identity', () => {
  const task = {
    task_id: 'BUGTASK-20260724-0001-A3',
    request_id: 'BUGTASK-20260724-0001',
    source_repair_task_no: 'BUGTASK-20260724-0001',
    source_bug_no: 'BUG-20260724-0001',
    agent: 'A3-Backend-Critical-Path',
  };
  const evidence = evaluateWorkerEvidence({
    task,
    exitCode: 0,
    stdout: 'PASS WITH CONDITIONS',
    beforeHead: 'a',
    afterHead: 'b',
    changedFiles: [
      'apps/api/src/modules/approval-engine/approval-engine.controller.ts',
      'docs/ops/BUG_20260724_0001_WORKFLOW_APPROVAL_PERMISSION_FIX_REPORT.md',
    ],
  });
  assert.equal(evidence.passed, true);
  assert.deepEqual(evidence.reportFiles, [
    'docs/ops/BUG_20260724_0001_WORKFLOW_APPROVAL_PERMISSION_FIX_REPORT.md',
  ]);
});

test('integrated commit recovery accepts implementation completed tasks', () => {
  const workerSource = fs.readFileSync(path.join(TEST_DIR, 'agent-worker.mjs'), 'utf8');
  assert.match(
    workerSource,
    /recoverIntegratedCommit[\s\S]*\['pending',[\s\S]*'IMPLEMENTATION_COMPLETED'[\s\S]*\.includes\(task\.status\)/,
  );
  assert.match(
    workerSource,
    /trackedTaskReportFiles\(task\)[\s\S]*new Set\(\[\.\.\.implementationFiles, \.\.\.supplementalReportFiles\]\)/,
    'integrated implementation recovery must accept a separately tracked task report',
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

test('implementation HOLD cannot be downgraded to not-applicable by already-fixed wording', () => {
  const evidence = evaluateWorkerEvidence({
    task: { task_id: 'BUGTASK-X-A4', source_bug_no: 'BUG-X', agent: 'A4-Frontend-UAT-Smoke' },
    exitCode: 0,
    stdout: 'Run log: x\nHOLD / NOT APPLICABLE. The frontend fix is already present on this branch.',
    beforeHead: 'a', afterHead: 'a', changedFiles: [],
  });
  assert.equal(evidence.passed, false);
  assert.equal(evidence.terminalStatus, 'HOLD');
  assert.equal(evidence.role, 'implementation');
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
    'PASS WITH CONDITIONS。当前基线已包含正确修复，聚焦测试与类型检查通过。',
    'PASS WITH CONDITIONS。当前基线已包含计数修复，聚焦测试通过。',
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

test('released or closed reports cannot re-enter release through stale local commit evidence', () => {
  assert.equal(reportAcceptsTechnicalRelease({
    bugNo: 'BUG-RUNNING',
    status: 'IN_PROGRESS',
    repairTaskStatus: 'AGENT_EXECUTION_FINISHED',
  }), true);
  assert.equal(reportAcceptsTechnicalRelease({
    bugNo: 'BUG-UAT',
    status: 'IN_PROGRESS',
    repairTaskStatus: 'FIX_READY_FOR_UAT',
  }), false);
  assert.equal(reportAcceptsTechnicalRelease({
    bugNo: 'BUG-CLOSED',
    status: 'CLOSED',
    repairTaskStatus: 'HOLD',
  }), false);
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

test('one HOLD report cannot starve an independent release-ready report', () => {
  const evidence = [
    { bugNo: 'BUG-READY', evidence: { passed: true, commitHashes: ['abc1234'] } },
    { bugNo: 'BUG-HOLD', evidence: { passed: false, commitHashes: [] } },
  ];
  assert.equal(shouldAttemptReleasePush({
    pushAfterSuccess: true,
    releaseEvidence: evidence,
    unpushedCommitCount: 1,
  }), true);
  assert.deepEqual(partitionReleaseEvidence(evidence), {
    ready: [evidence[0]],
    held: [evidence[1]],
  });
});

test('A3 and A4 use task-isolated execution branches and worktrees', () => {
  const a3 = bugIntakeExecutionSlot('A3-Backend-Critical-Path', 'BUGTASK-20260728-0001-A3');
  const a4 = bugIntakeExecutionSlot('A4-Frontend-UAT-Smoke', 'BUGTASK-20260728-0002-A4');
  assert.equal(a3.branch, 'codex/bug-intake-bugtask-20260728-0001-a3');
  assert.equal(a4.branch, 'codex/bug-intake-bugtask-20260728-0002-a4');
  assert.notEqual(a3.worktree, a4.worktree);
  assert.match(a3.worktree, /bug-intake-bugtask-20260728-0001-a3$/);
});

test('already-pushed verified release resumes CI and lifecycle writeback', () => {
  const releaseEvidence = [{ bugNo: 'BUG-PUSHED', evidence: { passed: true } }];
  assert.equal(shouldResumeAlreadyPushedRelease({
    pushAfterSuccess: true,
    releaseEvidence,
    unpushedCommitCount: 0,
    headIsOnOriginMain: true,
  }), true);
  assert.equal(shouldResumeAlreadyPushedRelease({
    pushAfterSuccess: true,
    releaseEvidence,
    unpushedCommitCount: 0,
    headIsOnOriginMain: false,
  }), false);
  assert.equal(shouldResumeAlreadyPushedRelease({
    pushAfterSuccess: true,
    releaseEvidence,
    unpushedCommitCount: 1,
    headIsOnOriginMain: true,
  }), false);
});
