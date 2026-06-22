#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const REQUIRED_APPLY_FIELDS = ['task_id', 'agent', 'conclusion', 'changed_files', 'missing_fields'];

function usage(exitCode = 1) {
  console.log(`Usage:
  node scripts/ops/update-task-board-from-result.mjs \\
    --task-board docs/ops/AGENT_TASK_BOARD.md \\
    --result-json <file> \\
    [--dry-run | --apply]`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  const values = { dryRun: true, apply: false };
  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--dry-run') {
      values.dryRun = true;
      values.apply = false;
      continue;
    }
    if (arg === '--apply') {
      values.apply = true;
      values.dryRun = false;
      continue;
    }
    if (arg.startsWith('--')) {
      values[arg.slice(2)] = normalized[i + 1];
      i += 1;
    }
  }
  return values;
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function resolveFile(file) {
  const absolute = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
  if (!existsSync(absolute)) fail(`file does not exist: ${file}`);
  return absolute;
}

function mapStatus(conclusion) {
  if (conclusion === 'PASS') return 'completed';
  if (conclusion === 'PASS WITH CONDITIONS' || conclusion === 'PASS_WITH_CONDITIONS') return 'completed-with-conditions';
  if (conclusion === 'FAIL' || conclusion === 'HOLD') return 'blocked';
  if (conclusion === 'ROLLBACK') return 'rollback-required';
  return 'review-required';
}

function suggestNextTasks(result) {
  return (result.recommend_next_agent ?? []).map((agent) => {
    const suffix = agent.split('-')[0];
    return {
      taskId: `${result.task_id}-${suffix}-FOLLOWUP`,
      agent,
      status: 'ready-next',
      nextStep: `Review ${result.task_id} result and execute the approved follow-up gate.`,
    };
  });
}

const args = parseArgs(process.argv.slice(2));
if (!args['task-board'] || !args['result-json']) usage(1);

const boardPath = resolveFile(args['task-board']);
const resultPath = resolveFile(args['result-json']);
const board = readFileSync(boardPath, 'utf8');
const result = JSON.parse(readFileSync(resultPath, 'utf8'));

const missingRequired = REQUIRED_APPLY_FIELDS.filter((field) => result[field] === undefined || result[field] === null);
if (missingRequired.length > 0) {
  fail(`result-json missing required field(s): ${missingRequired.join(', ')}`);
}

if (args.apply && Array.isArray(result.missing_fields) && result.missing_fields.length > 0) {
  fail(`refusing --apply because parser reported missing_fields: ${result.missing_fields.join(', ')}`);
}

const suggestedStatus = mapStatus(result.conclusion);
const nextTasks = suggestNextTasks(result);
const changedFiles = (result.changed_files ?? []).map((file) => `\`${file}\``).join('; ') || 'N/A';
const verification = `${result.conclusion}; files: ${changedFiles}`;
const blockers = (result.blockers ?? []).length > 0 ? result.blockers.join('; ') : 'None';
const nextStep =
  nextTasks.length > 0
    ? `Suggested next Agent(s): ${nextTasks.map((task) => task.agent).join(', ')}`
    : 'No automatic next Agent suggested';

const suggestedRow = `| ${result.task_id} | ${result.agent} | ${result.worktree_branch ?? 'UNKNOWN'} | ${suggestedStatus} | N/A | parsed-agent-result | ${result.frozen_items_touched ? 'Yes' : 'No'} | ${verification} | ${blockers} | ${nextStep} |`;
const suggestedNextRows = nextTasks.map(
  (task) =>
    `| ${task.taskId} | ${task.agent} | TBD | ${task.status} | N/A | follow-up | No | Pending approved dispatch | User approval required | ${task.nextStep} |`,
);

const suggestion = [`Suggested task board row:`, suggestedRow, ...suggestedNextRows].join('\n');

if (args.dryRun) {
  console.log('Dry run: task board not modified.');
  console.log(suggestion);
  process.exit(0);
}

const marker = '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |';
const insertAt = board.indexOf(marker);
if (insertAt < 0) fail('could not locate AGENT_TASK_BOARD.md board table marker');
const afterMarker = insertAt + marker.length;
const updated = `${board.slice(0, afterMarker)}\n${[suggestedRow, ...suggestedNextRows].join('\n')}${board.slice(afterMarker)}`;
writeFileSync(boardPath, updated);
console.log('Applied task board update. No commit performed.');
