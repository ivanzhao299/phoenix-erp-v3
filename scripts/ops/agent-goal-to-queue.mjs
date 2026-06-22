#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BACKLOG_FILE = 'docs/ops/evolution/improvement-backlog.json';
const TASKS_FILE = 'docs/ops/agent-queue/tasks.json';
const EVENTS_FILE = 'docs/ops/agent-queue/events.jsonl';

function usage(exitCode = 1) {
  console.log(`Usage:
  node scripts/ops/agent-goal-to-queue.mjs --from-improvement <improvement_id> --dry-run
  node scripts/ops/agent-goal-to-queue.mjs --from-improvement <improvement_id> --apply`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  const args = { dryRun: true, apply: false };
  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--dry-run') {
      args.dryRun = true;
      args.apply = false;
      continue;
    }
    if (arg === '--apply') {
      args.apply = true;
      args.dryRun = false;
      continue;
    }
    if (arg.startsWith('--')) {
      args[arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = normalized[i + 1];
      i += 1;
    }
  }
  if (!args.fromImprovement) usage(1);
  return args;
}

function resolvePath(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

function readJson(file, fallback) {
  const resolved = resolvePath(file);
  if (!existsSync(resolved)) return fallback;
  try {
    return JSON.parse(readFileSync(resolved, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  const resolved = resolvePath(file);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(data, null, 2)}\n`);
}

function appendEvent(event) {
  const resolved = resolvePath(EVENTS_FILE);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const previous = existsSync(resolved) ? readFileSync(resolved, 'utf8') : '';
  writeFileSync(resolved, `${previous}${JSON.stringify(event)}\n`);
}

function agentFor(improvement) {
  const owner = improvement.owner_recommendation || '';
  if (owner.includes('A1')) return 'A1-CI-Runtime-Gate';
  if (owner.includes('A2')) return 'A2-Security-Regression-Gate';
  if (owner.includes('A3')) return 'A3-Backend-Critical-Path';
  if (owner.includes('A4')) return 'A4-Frontend-UAT-Smoke';
  if (owner.includes('A5')) return 'A5-Data-Readiness';
  return 'Codex-Orchestrator';
}

function taskFromImprovement(improvement) {
  return {
    task_id: `TASK-${improvement.improvement_id}`,
    source_improvement_id: improvement.improvement_id,
    title: improvement.title,
    agent: agentFor(improvement),
    allowed_paths: improvement.allowed_paths,
    forbidden_paths: improvement.forbidden_paths,
    validation_commands: improvement.validation_commands,
    acceptance_criteria: improvement.acceptance_criteria,
    risk: improvement.risk,
    requires_approval: improvement.requires_approval,
    status: 'READY',
    priority: improvement.priority,
    source_pattern_id: improvement.source_pattern_id,
    created_at: new Date().toISOString(),
  };
}

const args = parseArgs(process.argv.slice(2));
const backlog = readJson(BACKLOG_FILE, []);
const improvement = backlog.find((item) => item.improvement_id === args.fromImprovement);
if (!improvement) {
  console.error(`Improvement not found: ${args.fromImprovement}`);
  process.exit(1);
}
const task = taskFromImprovement(improvement);

console.log(`Goal-to-Queue mode: ${args.apply ? 'apply' : 'dry-run'}`);
console.log(`Improvement: ${improvement.improvement_id}`);
console.log(`READY task: ${task.task_id}`);
console.log(`Agent: ${task.agent}`);
console.log(`Priority: ${task.priority}`);
console.log(`Requires approval: ${task.requires_approval ? 'Yes' : 'No'}`);

if (args.apply) {
  const tasks = readJson(TASKS_FILE, []);
  const existing = tasks.find((item) => item.task_id === task.task_id);
  const nextTasks = existing ? tasks.map((item) => (item.task_id === task.task_id ? { ...item, ...task } : item)) : [...tasks, task];
  writeJson(TASKS_FILE, nextTasks);
  appendEvent({
    at: new Date().toISOString(),
    type: 'improvement_task_ready',
    task_id: task.task_id,
    source_improvement_id: improvement.improvement_id,
  });
  console.log(`Applied queue update: ${TASKS_FILE}`);
} else {
  console.log('Dry-run only: no READY task written.');
  console.log(JSON.stringify(task, null, 2));
}
