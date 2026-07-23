#!/usr/bin/env node

import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

export const TERMINAL_TASK_STATUSES = new Set([
  'archived',
  'completed',
  'COMPLETED_MERGED',
  'VALIDATION_COMPLETED',
  'SKIPPED_NOT_APPLICABLE',
]);

export const SUCCESS_TASK_STATUSES = new Set([
  'completed',
  'COMPLETED_MERGED',
  'VALIDATION_COMPLETED',
  'SKIPPED_NOT_APPLICABLE',
]);

export const REQUIRED_CI_WORKFLOWS = [
  'AI Delivery CI Security',
  'CI Web Unit Tests',
  'AI Delivery CI Build',
  'CI/CD — Build & Deploy',
];

const TRANSITIONS = new Map([
  ['pending', new Set(['pending', 'claimed', 'running', 'HOLD', 'hold', 'WAITING_CAPACITY', 'WAITING_RUNNER', 'archived'])],
  ['claimed', new Set(['claimed', 'pending', 'running', 'HOLD', 'hold', 'WAITING_CAPACITY', 'WAITING_RUNNER', 'archived'])],
  ['running', new Set(['running', 'pending', 'HOLD', 'hold', 'failed', 'WAITING_CAPACITY', 'WAITING_RUNNER', ...TERMINAL_TASK_STATUSES])],
  ['HOLD', new Set(['HOLD', 'hold', 'pending', 'archived'])],
  ['hold', new Set(['hold', 'HOLD', 'pending', 'archived'])],
  ['failed', new Set(['failed', 'pending', 'HOLD', 'hold', 'archived'])],
  ['WAITING_CAPACITY', new Set(['WAITING_CAPACITY', 'pending', 'WAITING_RUNNER', 'HOLD', 'archived'])],
  ['WAITING_RUNNER', new Set(['WAITING_RUNNER', 'pending', 'HOLD', 'archived'])],
  ['IMPLEMENTATION_COMPLETED', new Set(['IMPLEMENTATION_COMPLETED', 'COMPLETED_MERGED', 'HOLD', 'hold', 'failed'])],
]);

function sleepSync(ms) {
  const buffer = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(buffer), 0, 0, ms);
}

export function isTerminalTaskStatus(status) {
  return TERMINAL_TASK_STATUSES.has(String(status || ''));
}

export function canTransitionTaskStatus(from, to, options = {}) {
  const previous = String(from || 'pending');
  const next = String(to || previous);
  if (previous === next) return true;
  if (
    options.verifiedEvidenceRecovery === true &&
    ['HOLD', 'hold', 'running', 'claimed'].includes(previous) &&
    ['IMPLEMENTATION_COMPLETED', 'VALIDATION_COMPLETED', 'SKIPPED_NOT_APPLICABLE'].includes(next)
  ) {
    return true;
  }
  if (isTerminalTaskStatus(previous)) {
    return options.explicitRedispatch === true && next === 'pending';
  }
  return TRANSITIONS.get(previous)?.has(next) === true;
}

export function stableHash(value) {
  return crypto.createHash('sha256').update(
    typeof value === 'string' ? value : JSON.stringify(value),
  ).digest('hex');
}

export function taskIdempotencyKey(task) {
  return stableHash([
    task?.source_bug_no || '',
    task?.task_id || '',
    task?.agent || '',
    Number(task?.redispatch_count || 0),
  ].join('|'));
}

export function atomicWriteJson(file, value) {
  const target = path.resolve(file);
  mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temp, target);
}

export function writeJsonIfMateriallyChanged(file, payload) {
  const target = path.resolve(file);
  const fingerprint = stableHash(payload);
  let existing = null;
  try {
    existing = JSON.parse(readFileSync(target, 'utf8'));
  } catch {
    // Missing or malformed dashboards are replaced atomically.
  }
  if (existing?.fingerprint === fingerprint) return false;
  atomicWriteJson(target, {
    generated_at: new Date().toISOString(),
    fingerprint,
    ...payload,
  });
  return true;
}

export function appendJsonEvent(file, event) {
  const target = path.resolve(file);
  mkdirSync(path.dirname(target), { recursive: true });
  appendFileSync(target, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`);
}

export function withQueueLock(queueDir, callback, options = {}) {
  const dir = path.resolve(queueDir);
  const lockDir = path.join(dir, 'locks');
  const lockFile = path.join(lockDir, 'queue-global.lock');
  mkdirSync(lockDir, { recursive: true });
  const timeoutMs = Number(options.timeoutMs || 10000);
  const staleMs = Number(options.staleMs || 120000);
  const started = Date.now();
  let descriptor;
  while (Date.now() - started < timeoutMs) {
    try {
      descriptor = openSync(lockFile, 'wx');
      writeFileSync(descriptor, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
      break;
    } catch {
      try {
        if (Date.now() - statSync(lockFile).mtimeMs > staleMs) unlinkSync(lockFile);
      } catch {
        // Another writer released the lock between stat and unlink.
      }
      sleepSync(25);
    }
  }
  if (descriptor === undefined) throw new Error(`queue lock timeout after ${timeoutMs}ms: ${lockFile}`);
  try {
    return callback();
  } finally {
    closeSync(descriptor);
    try { unlinkSync(lockFile); } catch { /* already released */ }
  }
}

export function readQueueTasks(file) {
  if (!existsSync(file)) return [];
  const payload = JSON.parse(readFileSync(file, 'utf8'));
  return Array.isArray(payload) ? payload : payload.tasks || [];
}

export function mergeTaskSnapshot(currentTasks, baseTasks, incomingTasks, options = {}) {
  const baseById = new Map((baseTasks || []).map((task) => [task.task_id, task]));
  const incomingById = new Map((incomingTasks || []).map((task) => [task.task_id, task]));
  const next = (currentTasks || []).map((task) => ({ ...task }));
  const nextById = new Map(next.map((task, index) => [task.task_id, index]));
  const events = [];

  for (const [taskId, incoming] of incomingById.entries()) {
    const base = baseById.get(taskId);
    if (base && JSON.stringify(base) === JSON.stringify(incoming)) continue;
    const currentIndex = nextById.get(taskId);
    if (currentIndex === undefined) {
      const created = {
        ...incoming,
        idempotency_key: incoming.idempotency_key || taskIdempotencyKey(incoming),
        state_version: Number(incoming.state_version || 0) + 1,
      };
      next.push(created);
      nextById.set(taskId, next.length - 1);
      events.push({ type: 'task_created', task_id: taskId, status: created.status });
      continue;
    }

    const current = next[currentIndex];
    let desiredStatus = incoming.status || current.status;
    if (!canTransitionTaskStatus(current.status, desiredStatus, options)) desiredStatus = current.status;
    const merged = {
      ...current,
      ...incoming,
      status: desiredStatus,
      idempotency_key: current.idempotency_key || incoming.idempotency_key || taskIdempotencyKey(incoming),
      state_version: Number(current.state_version || 0) + 1,
      state_updated_at: new Date().toISOString(),
    };
    next[currentIndex] = merged;
    events.push({
      type: current.status === desiredStatus ? 'task_updated' : 'task_transitioned',
      task_id: taskId,
      from: current.status,
      to: desiredStatus,
      state_version: merged.state_version,
    });
  }
  return { tasks: next, events };
}

export function persistTaskSnapshot({
  tasksFile,
  eventsFile,
  baseTasks,
  incomingTasks,
  explicitRedispatch = false,
  verifiedEvidenceRecovery = false,
}) {
  return withQueueLock(path.dirname(tasksFile), () => {
    const current = readQueueTasks(tasksFile);
    const merged = mergeTaskSnapshot(current, baseTasks, incomingTasks, {
      explicitRedispatch,
      verifiedEvidenceRecovery,
    });
    atomicWriteJson(tasksFile, merged.tasks);
    for (const event of merged.events) appendJsonEvent(eventsFile, event);
    return merged;
  });
}

export function appendOutboxRecord(file, record) {
  const id = record.id || stableHash({
    bugNo: record.bugNo,
    endpoint: record.endpoint,
    payload: record.payload,
  });
  appendJsonEvent(file, { id, status: record.status || 'PENDING', ...record });
  return id;
}

function latestOutboxRecords(file) {
  if (!existsSync(file)) return [];
  const latest = new Map();
  const descriptor = openSync(file, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  let remainder = '';
  try {
    while (true) {
      const bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      const text = remainder + buffer.subarray(0, bytesRead).toString('utf8');
      const lines = text.split('\n');
      remainder = lines.pop() || '';
      if (remainder.length > 8 * 1024 * 1024) throw new Error('outbox contains an oversized JSONL record');
      for (const line of lines) {
        if (!line) continue;
        const item = JSON.parse(line);
        latest.set(item.id, item);
      }
    }
    if (remainder) {
      const item = JSON.parse(remainder);
      latest.set(item.id, item);
    }
  } finally {
    closeSync(descriptor);
  }
  return [...latest.values()];
}

export function pendingOutboxRecords(file) {
  const latest = latestOutboxRecords(file);
  return latest.filter((item) => item.status === 'PENDING' || item.status === 'RETRY');
}

export function compactOutbox(file) {
  const target = path.resolve(file);
  if (!existsSync(target)) return { compacted: false, beforeBytes: 0, afterBytes: 0, retained: 0 };
  const beforeBytes = statSync(target).size;
  const retained = latestOutboxRecords(target)
    .filter((item) => item.status === 'PENDING' || item.status === 'RETRY');
  const payload = retained.map((item) => JSON.stringify(item)).join('\n');
  const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, payload ? `${payload}\n` : '');
  renameSync(temp, target);
  return {
    compacted: true,
    beforeBytes,
    afterBytes: statSync(target).size,
    retained: retained.length,
  };
}

function priorityRank(priority) {
  return ({ P0: 0, P1: 1, P2: 2, P3: 3 })[String(priority || 'P2').toUpperCase()] ?? 2;
}

export function planConcurrentTaskBatch(tasks, options = {}) {
  const maxParallel = Math.max(1, Number(options.maxParallel || 3));
  const alreadyAttempted = new Set(options.attemptedTaskIds || []);
  const selected = [];
  const usedWorktrees = new Set();
  const usedWriteDomains = new Set();
  const sorted = [...(tasks || [])].sort((a, b) => {
    const priority = priorityRank(a.priority) - priorityRank(b.priority);
    if (priority) return priority;
    const aRetry = Number(a.retry_count || a.recovery_count || 0);
    const bRetry = Number(b.retry_count || b.recovery_count || 0);
    if (aRetry !== bRetry) return aRetry - bRetry;
    return (Date.parse(a.created_at || '') || 0) - (Date.parse(b.created_at || '') || 0);
  });

  for (const task of sorted) {
    if (selected.length >= maxParallel || alreadyAttempted.has(task.task_id)) continue;
    const worktree = task.worktree || task.agent;
    const allowed = JSON.stringify(task.allowed_paths || []);
    const writeDomain = allowed.includes('apps/api') ? 'api' : allowed.includes('apps/web') ? 'web' : 'readonly';
    if (usedWorktrees.has(worktree)) continue;
    if (writeDomain !== 'readonly' && usedWriteDomains.has(writeDomain)) continue;
    if (/migration|schema|entity|table|column/i.test(`${task.title || ''} ${allowed}`)) continue;
    selected.push(task);
    usedWorktrees.add(worktree);
    if (writeDomain !== 'readonly') usedWriteDomains.add(writeDomain);
  }
  return selected;
}

export function classifyChangedPaths(files = []) {
  const paths = [...new Set(files.filter(Boolean))];
  const migration = paths.some((file) => /(^|\/)migrations\//.test(file));
  const api = paths.some((file) => file.startsWith('apps/api/'));
  const web = paths.some((file) => file.startsWith('apps/web/'));
  const infra = paths.some((file) => file.startsWith('.github/') || file.startsWith('infra/') || file.startsWith('deploy/') || /Dockerfile|docker-compose|nginx/.test(file));
  const opsOnly = paths.length > 0 && paths.every((file) => file.startsWith('docs/ops/') || file.startsWith('scripts/ops/'));
  const highRisk = migration || paths.some((file) => /auth|rbac|data-scope|finance|payment|chanjet/i.test(file));
  const deployScope = opsOnly ? 'ops-only' : infra || (api && web) ? 'full' : api ? 'api' : web ? 'web' : 'none';
  return { paths, api, web, migration, infra, opsOnly, highRisk, deployScope };
}

export function evaluateCiBarrier(runs, required = REQUIRED_CI_WORKFLOWS) {
  const byName = new Map((runs || []).map((run) => [run.name || run.workflowName, run]));
  const missing = required.filter((name) => !byName.has(name));
  const active = required.filter((name) => byName.get(name)?.status !== 'completed' && byName.has(name));
  const failed = required.filter((name) => {
    const run = byName.get(name);
    return run?.status === 'completed' && run?.conclusion !== 'success';
  });
  return {
    ready: missing.length === 0 && active.length === 0 && failed.length === 0,
    complete: missing.length === 0 && active.length === 0,
    missing,
    active,
    failed,
    decision: failed.length ? 'HOLD' : missing.length || active.length ? 'WAITING' : 'PASS',
  };
}

export function computeRunnerMetrics(tasks = [], options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const strictEvidenceSince = Date.parse(options.strictEvidenceSince || '2026-07-07T00:00:00Z');
  const statusCounts = {};
  const queueWaits = [];
  const leadTimes = [];
  for (const task of tasks) {
    statusCounts[task.status] = (statusCounts[task.status] || 0) + 1;
    const created = Date.parse(task.created_at || task.createdAt || task.approved_at || task.approvedAt || '');
    const claimed = Date.parse(task.claimed_at || task.claimedAt || task.started_at || task.startedAt || '');
    const completed = Date.parse(task.completed_at || task.completedAt || task.updated_at || task.updatedAt || '');
    if (created && claimed) queueWaits.push(claimed - created);
    if (created && completed) leadTimes.push(completed - created);
  }
  const percentile = (values, ratio) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
  };
  const active = tasks.filter((task) => ['pending', 'claimed', 'running', 'WAITING_CAPACITY', 'WAITING_RUNNER', 'HOLD', 'hold', 'failed'].includes(task.status));
  const falseComplete = tasks.filter((task) => SUCCESS_TASK_STATUSES.has(task.status) && task.evidence_gate?.passed === false);
  const releaseTerminal = tasks.filter((task) => SUCCESS_TASK_STATUSES.has(task.status));
  const evidenceCovered = releaseTerminal.filter((task) => task.evidence_gate);
  const legacyEvidenceExemptions = releaseTerminal.filter((task) => {
    if (task.evidence_gate) return false;
    const timestamp = Date.parse(task.completed_at || task.completedAt || task.updated_at || task.updatedAt || '');
    return timestamp > 0 && timestamp < strictEvidenceSince;
  });
  return {
    generated_at: now.toISOString(),
    total: tasks.length,
    active: active.length,
    status_counts: statusCounts,
    queue_wait_p50_ms: percentile(queueWaits, 0.5),
    queue_wait_p95_ms: percentile(queueWaits, 0.95),
    lead_time_p50_ms: percentile(leadTimes, 0.5),
    lead_time_p95_ms: percentile(leadTimes, 0.95),
    false_complete_count: falseComplete.length,
    legacy_evidence_exemption_count: legacyEvidenceExemptions.length,
    raw_terminal_evidence_coverage: releaseTerminal.length
      ? evidenceCovered.length / releaseTerminal.length
      : 1,
    terminal_evidence_coverage: releaseTerminal.length
      ? (evidenceCovered.length + legacyEvidenceExemptions.length) / releaseTerminal.length
      : 1,
  };
}

export function runnerHealthDecision(metrics) {
  if (metrics.false_complete_count > 0) return 'HOLD';
  if (metrics.terminal_evidence_coverage < 0.95) return 'DEGRADED';
  if ((metrics.status_counts.WAITING_RUNNER || 0) > 0) return 'DEGRADED';
  if ((metrics.status_counts.HOLD || 0) + (metrics.status_counts.hold || 0) > 0) return 'DEGRADED';
  return 'GO';
}
