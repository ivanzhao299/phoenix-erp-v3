import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  appendOutboxRecord,
  compactOutbox,
  canTransitionTaskStatus,
  classifyChangedPaths,
  computeRunnerMetrics,
  evaluateCiBarrier,
  mergeTaskSnapshot,
  pendingOutboxRecords,
  persistTaskSnapshot,
  planConcurrentTaskBatch,
  runnerHealthDecision,
  taskIdempotencyKey,
  writeJsonIfMateriallyChanged,
} from './bug-runner-platform.mjs';

test('terminal task states cannot regress without explicit redispatch', () => {
  assert.equal(canTransitionTaskStatus('COMPLETED_MERGED', 'HOLD'), false);
  assert.equal(canTransitionTaskStatus('VALIDATION_COMPLETED', 'pending'), false);
  assert.equal(canTransitionTaskStatus('COMPLETED_MERGED', 'pending', { explicitRedispatch: true }), true);
  assert.equal(canTransitionTaskStatus('running', 'COMPLETED_MERGED'), true);
  assert.equal(canTransitionTaskStatus('IMPLEMENTATION_COMPLETED', 'COMPLETED_MERGED'), true);
  assert.equal(canTransitionTaskStatus('HOLD', 'IMPLEMENTATION_COMPLETED'), false);
  assert.equal(
    canTransitionTaskStatus('HOLD', 'IMPLEMENTATION_COMPLETED', { verifiedEvidenceRecovery: true }),
    true,
  );
});

test('snapshot merge only applies locally changed tasks and preserves terminal status', () => {
  const base = [
    { task_id: 'A', status: 'running', value: 1 },
    { task_id: 'B', status: 'COMPLETED_MERGED', value: 1 },
  ];
  const current = [
    { task_id: 'A', status: 'running', value: 1, remote: true },
    { task_id: 'B', status: 'COMPLETED_MERGED', value: 1 },
  ];
  const incoming = [
    { task_id: 'A', status: 'VALIDATION_COMPLETED', value: 2 },
    { task_id: 'B', status: 'HOLD', value: 2 },
  ];
  const merged = mergeTaskSnapshot(current, base, incoming);
  assert.equal(merged.tasks[0].status, 'VALIDATION_COMPLETED');
  assert.equal(merged.tasks[0].remote, true);
  assert.equal(merged.tasks[1].status, 'COMPLETED_MERGED');
  assert.equal(merged.tasks[1].value, 2);
  assert.equal(merged.events.length, 2);
});

test('queue persistence uses an atomic merge and append-only events', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-runner-'));
  const tasksFile = path.join(root, 'tasks.json');
  const eventsFile = path.join(root, 'events.jsonl');
  fs.writeFileSync(tasksFile, `${JSON.stringify([{ task_id: 'A', status: 'pending' }], null, 2)}\n`);
  persistTaskSnapshot({
    tasksFile,
    eventsFile,
    baseTasks: [{ task_id: 'A', status: 'pending' }],
    incomingTasks: [{ task_id: 'A', status: 'running' }],
  });
  const tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
  assert.equal(tasks[0].status, 'running');
  assert.ok(tasks[0].idempotency_key);
  assert.match(fs.readFileSync(eventsFile, 'utf8'), /task_transitioned/);
});

test('idempotency key is stable for a task generation', () => {
  const task = { task_id: 'T1', source_bug_no: 'BUG-1', agent: 'A3', redispatch_count: 2 };
  assert.equal(taskIdempotencyKey(task), taskIdempotencyKey({ ...task }));
  assert.notEqual(taskIdempotencyKey(task), taskIdempotencyKey({ ...task, redispatch_count: 3 }));
});

test('outbox keeps only unacknowledged records pending', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-outbox-'));
  const file = path.join(root, 'outbox.jsonl');
  const id = appendOutboxRecord(file, { bugNo: 'BUG-1', endpoint: '/result', payload: { ok: true } });
  assert.equal(pendingOutboxRecords(file).length, 1);
  appendOutboxRecord(file, { id, bugNo: 'BUG-1', endpoint: '/result', payload: { ok: true }, status: 'ACK' });
  assert.equal(pendingOutboxRecords(file).length, 0);
});

test('outbox compaction removes acknowledged history and retains retry state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-outbox-compact-'));
  const file = path.join(root, 'outbox.jsonl');
  for (let index = 0; index < 100; index += 1) {
    appendOutboxRecord(file, { id: `ACK-${index}`, status: 'PENDING', payload: { index } });
    appendOutboxRecord(file, { id: `ACK-${index}`, status: 'ACK', payload: { index } });
  }
  appendOutboxRecord(file, { id: 'RETRY-1', status: 'RETRY', payload: { keep: true } });
  const before = fs.statSync(file).size;
  const result = compactOutbox(file);
  assert.equal(result.retained, 1);
  assert.ok(result.afterBytes < before);
  assert.deepEqual(pendingOutboxRecords(file).map((item) => item.id), ['RETRY-1']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('scheduler parallelizes distinct worktrees and serializes the same write domain', () => {
  const tasks = [
    { task_id: 'A3-1', agent: 'A3', priority: 'P0', worktree: '/a3-1', allowed_paths: ['apps/api/**'] },
    { task_id: 'A3-2', agent: 'A3', priority: 'P0', worktree: '/a3-2', allowed_paths: ['apps/api/**'] },
    { task_id: 'A4-1', agent: 'A4', priority: 'P1', worktree: '/a4', allowed_paths: ['apps/web/**'] },
    { task_id: 'A1-1', agent: 'A1', priority: 'P0', worktree: '/a1', allowed_paths: ['docs/ops/**'] },
  ];
  const batch = planConcurrentTaskBatch(tasks, { maxParallel: 3 });
  assert.deepEqual(batch.map((task) => task.task_id), ['A3-1', 'A1-1', 'A4-1']);
});

test('migration tasks never enter the automatic parallel batch', () => {
  const batch = planConcurrentTaskBatch([
    { task_id: 'M1', title: 'run migration', worktree: '/m', allowed_paths: ['apps/api/src/database/migrations/**'] },
    { task_id: 'A1', title: 'validate', worktree: '/a1', allowed_paths: ['docs/ops/**'] },
  ], { maxParallel: 3 });
  assert.deepEqual(batch.map((task) => task.task_id), ['A1']);
});

test('change scope prevents ops-only commits from deploying application images', () => {
  assert.equal(classifyChangedPaths(['docs/ops/report.md', 'scripts/ops/tool.mjs']).deployScope, 'ops-only');
  assert.equal(classifyChangedPaths(['apps/web/src/app/page.tsx']).deployScope, 'web');
  assert.equal(classifyChangedPaths(['apps/api/src/main.ts']).deployScope, 'api');
  assert.equal(classifyChangedPaths(['apps/api/src/main.ts', 'apps/web/src/app/page.tsx']).deployScope, 'full');
});

test('CI barrier waits for every required workflow and fails closed', () => {
  const required = ['Security', 'Build', 'Deploy'];
  assert.equal(evaluateCiBarrier([{ name: 'Security', status: 'completed', conclusion: 'success' }], required).decision, 'WAITING');
  assert.equal(evaluateCiBarrier([
    { name: 'Security', status: 'completed', conclusion: 'success' },
    { name: 'Build', status: 'completed', conclusion: 'success' },
    { name: 'Deploy', status: 'completed', conclusion: 'failure' },
  ], required).decision, 'HOLD');
  assert.equal(evaluateCiBarrier(required.map((name) => ({ name, status: 'completed', conclusion: 'success' })), required).decision, 'PASS');
});

test('metrics expose false completion and health decision', () => {
  const metrics = computeRunnerMetrics([
    { status: 'COMPLETED_MERGED', created_at: '2026-01-01T00:00:00Z', claimed_at: '2026-01-01T00:01:00Z', completed_at: '2026-01-01T00:02:00Z', evidence_gate: { passed: false } },
  ], { now: '2026-01-01T00:03:00Z' });
  assert.equal(metrics.false_complete_count, 1);
  assert.equal(runnerHealthDecision(metrics), 'HOLD');
});

test('health degrades when legacy terminal evidence coverage is incomplete', () => {
  const metrics = computeRunnerMetrics([{ status: 'completed' }]);
  assert.equal(metrics.terminal_evidence_coverage, 0);
  assert.equal(runnerHealthDecision(metrics), 'DEGRADED');
});

test('pre-gate terminal work is governed by an explicit legacy evidence exemption', () => {
  const metrics = computeRunnerMetrics([{ status: 'completed', completed_at: '2026-07-06T00:00:00Z' }]);
  assert.equal(metrics.raw_terminal_evidence_coverage, 0);
  assert.equal(metrics.legacy_evidence_exemption_count, 1);
  assert.equal(metrics.terminal_evidence_coverage, 1);
  assert.equal(runnerHealthDecision(metrics), 'GO');
});

test('material dashboard writes ignore repeated observations', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-dashboard-'));
  const output = path.join(root, 'latest.json');
  const payload = { decision: 'GO', metrics: { total: 1, active: 0 } };
  assert.equal(writeJsonIfMateriallyChanged(output, payload), true);
  const first = fs.readFileSync(output, 'utf8');
  assert.equal(writeJsonIfMateriallyChanged(output, payload), false);
  assert.equal(fs.readFileSync(output, 'utf8'), first);
  assert.equal(writeJsonIfMateriallyChanged(output, { ...payload, decision: 'HOLD' }), true);
});
