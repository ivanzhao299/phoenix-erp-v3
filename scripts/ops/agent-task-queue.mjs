#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, openSync, closeSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const QUEUE_DIR = 'docs/ops/agent-queue';
const TASKS_FILE = `${QUEUE_DIR}/tasks.json`;
const EVENTS_FILE = `${QUEUE_DIR}/events.jsonl`;
const LOCK_DIR = `${QUEUE_DIR}/locks`;

function usage(exitCode = 1) {
  console.log(`Usage:
  node scripts/ops/agent-task-queue.mjs --list [status]
  node scripts/ops/agent-task-queue.mjs --from-request <text> [--request-id <id>]
  node scripts/ops/agent-task-queue.mjs --add-task <json-file>
  node scripts/ops/agent-task-queue.mjs --claim --agent <agent>
  node scripts/ops/agent-task-queue.mjs --release --task-id <task-id>
  node scripts/ops/agent-task-queue.mjs --complete --task-id <task-id> [--result-file <file>]
  node scripts/ops/agent-task-queue.mjs --fail --task-id <task-id> [--reason <text>]
  node scripts/ops/agent-task-queue.mjs --hold --task-id <task-id> [--reason <text>]`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  const values = {};
  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (['--list', '--claim', '--release', '--complete', '--fail', '--hold'].includes(arg)) {
      values[arg.slice(2)] = true;
      if (arg === '--list' && normalized[i + 1] && !normalized[i + 1].startsWith('--')) {
        values.status = normalized[i + 1];
        i += 1;
      }
      continue;
    }
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg.startsWith('--')) {
      values[arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = normalized[i + 1];
      i += 1;
    }
  }
  return values;
}

function ensureQueue() {
  mkdirSync(LOCK_DIR, { recursive: true });
  if (!existsSync(TASKS_FILE)) writeFileSync(TASKS_FILE, '[]\n');
  if (!existsSync(EVENTS_FILE)) writeFileSync(EVENTS_FILE, '');
}

function readTasks() {
  ensureQueue();
  return JSON.parse(readFileSync(TASKS_FILE, 'utf8'));
}

function writeTasks(tasks) {
  ensureQueue();
  writeFileSync(TASKS_FILE, `${JSON.stringify(tasks, null, 2)}\n`);
}

function event(type, payload) {
  ensureQueue();
  appendFileSync(EVENTS_FILE, `${JSON.stringify({ at: new Date().toISOString(), type, ...payload })}\n`);
}

function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42) || 'task';
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function defaultTask({ requestId, title, agent, index = 1 }) {
  return {
    task_id: `${requestId}-${String(index).padStart(2, '0')}-${agent.replace(/^A(\d)-.*/, 'A$1')}`,
    request_id: requestId,
    title,
    agent,
    status: 'pending',
    priority: agent.includes('A2') || agent.includes('A1') ? 'P0' : 'P1',
    risk_level: 'LOW/MEDIUM',
    allowed_paths: ['docs/ops/**'],
    forbidden_paths: ['apps/api/**', 'apps/web/**', 'apps/api/src/database/migrations/**', 'schema/entity/table/column'],
    prompt_file: agent.includes('A2') ? 'docs/ops/prompts/A2_SECURITY_REVIEW_PROMPT.md' : 'docs/ops/prompts/A1_CI_RUNTIME_GATE_PROMPT.md',
    contract_file: '',
    worktree: agent.includes('A2') ? '/Users/mac/phoenix-erp-worktrees/a2-security-regression-gate' : '/Users/mac/phoenix-erp-worktrees/a1-ci-runtime-gate',
    branch: agent.includes('A2') ? 'w5-a2-security-regression-gate' : 'w5-a1-ci-runtime-gate',
    dependencies: [],
    claimed_by: null,
    claimed_at: null,
    completed_at: null,
    result_file: null,
    next_agents: [],
    approval_required: true,
  };
}

function lockTask(taskId) {
  const lockFile = path.join(LOCK_DIR, `${taskId}.lock`);
  try {
    const fd = openSync(lockFile, 'wx');
    closeSync(fd);
    return lockFile;
  } catch {
    return null;
  }
}

function unlockTask(taskId) {
  const lockFile = path.join(LOCK_DIR, `${taskId}.lock`);
  if (existsSync(lockFile)) unlinkSync(lockFile);
}

function printTasks(tasks) {
  if (tasks.length === 0) {
    console.log('No tasks.');
    return;
  }
  for (const task of tasks) {
    console.log(`${task.task_id} | ${task.status} | ${task.agent} | ${task.priority} | ${task.title}`);
  }
}

const args = parseArgs(process.argv.slice(2));
ensureQueue();

if (args.fromRequest) {
  const requestId = args.requestId || `REQ-NL-${timestamp()}-${slug(args.fromRequest).toUpperCase()}`;
  const tasks = readTasks();
  const generated = [
    defaultTask({ requestId, title: 'Security review for natural language request', agent: 'A2-Security-Regression-Gate', index: 1 }),
    defaultTask({ requestId, title: 'CI/runtime validation for natural language request', agent: 'A1-CI-Runtime-Gate', index: 2 }),
  ];
  tasks.push(...generated);
  writeTasks(tasks);
  event('tasks_created_from_request', { request_id: requestId, task_ids: generated.map((task) => task.task_id) });
  console.log(`Created ${generated.length} tasks for ${requestId}`);
  printTasks(generated);
  process.exit(0);
}

if (args.addTask) {
  const file = path.isAbsolute(args.addTask) ? args.addTask : path.resolve(process.cwd(), args.addTask);
  const payload = JSON.parse(readFileSync(file, 'utf8'));
  const tasks = readTasks();
  const incoming = Array.isArray(payload) ? payload : [payload];
  tasks.push(...incoming);
  writeTasks(tasks);
  event('tasks_added', { task_ids: incoming.map((task) => task.task_id) });
  console.log(`Added ${incoming.length} task(s).`);
  process.exit(0);
}

if (args.list) {
  const tasks = readTasks().filter((task) => !args.status || task.status === args.status);
  printTasks(tasks);
  process.exit(0);
}

if (args.claim) {
  if (!args.agent) usage(1);
  const tasks = readTasks();
  const dependencySuccessStatuses = new Set(['COMPLETED_MERGED', 'VALIDATION_COMPLETED', 'SKIPPED_NOT_APPLICABLE', 'completed']);
  const byId = new Map(tasks.map((item) => [item.task_id, item]));
  const task = tasks.find((item) => item.agent === args.agent
    && item.route_active !== false
    && item.status === 'pending'
    && (item.dependencies || []).every((taskId) => dependencySuccessStatuses.has(byId.get(taskId)?.status)));
  if (!task) {
    console.log(`No pending task for ${args.agent}.`);
    process.exit(0);
  }
  const lockFile = lockTask(task.task_id);
  if (!lockFile) {
    console.log(`Task is locked: ${task.task_id}`);
    process.exit(2);
  }
  task.status = 'claimed';
  task.claimed_by = args.agent;
  task.claimed_at = new Date().toISOString();
  writeTasks(tasks);
  event('task_claimed', { task_id: task.task_id, agent: args.agent, lock_file: lockFile });
  console.log(`Claimed ${task.task_id}`);
  process.exit(0);
}

function updateTask(status) {
  if (!args.taskId) usage(1);
  const tasks = readTasks();
  const task = tasks.find((item) => item.task_id === args.taskId);
  if (!task) {
    console.error(`ERROR: task not found: ${args.taskId}`);
    process.exit(1);
  }
  task.status = status;
  if (['completed', 'failed', 'hold'].includes(status)) {
    task.claimed_by = null;
    task.claimed_at = null;
  }
  if (status === 'pending') {
    task.claimed_by = null;
    task.claimed_at = null;
    unlockTask(task.task_id);
  }
  if (status === 'completed') {
    task.completed_at = new Date().toISOString();
    task.result_file = args.resultFile || task.result_file;
    unlockTask(task.task_id);
  }
  if (status === 'failed' || status === 'hold') {
    task.result_file = args.resultFile || task.result_file;
    task.reason = args.reason || task.reason || null;
    unlockTask(task.task_id);
  }
  writeTasks(tasks);
  event(`task_${status}`, { task_id: task.task_id, reason: args.reason || null, result_file: args.resultFile || null });
  console.log(`${task.task_id} -> ${status}`);
}

if (args.release) updateTask('pending');
else if (args.complete) updateTask('completed');
else if (args.fail) updateTask('failed');
else if (args.hold) updateTask('hold');
else usage(1);
