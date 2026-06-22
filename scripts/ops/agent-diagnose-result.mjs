#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TASKS_FILE = 'docs/ops/agent-queue/tasks.json';
const RUN_DIR = 'docs/ops/runs';

function usage(exitCode = 1) {
  console.log(`Usage:
  node scripts/ops/agent-diagnose-result.mjs --task-id <task-id> [--result-json <file>] [--output-json <file>] [--output-md <file>] [--dry-run]`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  const values = { dryRun: false };
  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (arg === '--dry-run') {
      values.dryRun = true;
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

function runGit(args, cwd = process.cwd()) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

function readTask(taskId) {
  if (!existsSync(TASKS_FILE)) return null;
  return JSON.parse(readFileSync(TASKS_FILE, 'utf8')).find((task) => task.task_id === taskId) || null;
}

function changedFiles(task, resultJson) {
  if (resultJson?.changed_files?.length) return resultJson.changed_files;
  if (!resultJson && task?.status !== 'completed') return [];
  if (task?.worktree && existsSync(task.worktree)) {
    const output = runGit(['diff', '--name-only', 'main...HEAD'], task.worktree);
    return output ? output.split('\n').filter(Boolean) : [];
  }
  return [];
}

function hasFrozen(file) {
  const lower = file.toLowerCase();
  return (
    file.startsWith('apps/api/src/database/migrations/') ||
    file.startsWith('migrations/') ||
    lower.includes('/migration/') ||
    lower.includes('/migrations/') ||
    file.endsWith('.entity.ts') ||
    lower.includes('/entities/') ||
    lower.includes('schema') ||
    lower.includes('table') ||
    lower.includes('column')
  );
}

function highRisk(file) {
  return /auth|rbac|data-scope|datascope|finance|payment|chanjet|jwt|permission/i.test(file);
}

function writeMd(file, diagnosis) {
  writeFileSync(
    file,
    `# Agent Diagnosis

| Field | Value |
| --- | --- |
| Task ID | ${diagnosis.task_id} |
| Agent | ${diagnosis.agent || 'Unknown'} |
| Status | ${diagnosis.task_status || 'Unknown'} |
| Recommendation | ${diagnosis.recommendation} |
| Frozen boundary touched | ${diagnosis.touched_frozen_boundary ? 'Yes' : 'No'} |
| Business code changed | ${diagnosis.modified_business_code ? 'Yes' : 'No'} |
| Migration/schema added | ${diagnosis.added_migration_or_schema ? 'Yes' : 'No'} |
| Tests passed | ${diagnosis.tests_passed ? 'Yes' : 'No/Unknown'} |

## Changed Files

${diagnosis.changed_files.map((fileName) => `- ${fileName}`).join('\n') || '- None'}

## Reasons

${diagnosis.reasons.map((reason) => `- ${reason}`).join('\n') || '- None'}
`,
  );
}

const args = parseArgs(process.argv.slice(2));
if (!args.taskId) usage(1);

const task = readTask(args.taskId);
let resultJson = null;
if (args.resultJson) {
  const file = path.isAbsolute(args.resultJson) ? args.resultJson : path.resolve(process.cwd(), args.resultJson);
  resultJson = JSON.parse(readFileSync(file, 'utf8'));
}

const files = changedFiles(task, resultJson);
const touchedFrozen = files.some(hasFrozen) || Boolean(resultJson?.frozen_items_touched);
const modifiedBusinessCode = files.some((file) => file.startsWith('apps/api/') || file.startsWith('apps/web/')) || Boolean(resultJson?.business_code_changed);
const addedMigrationOrSchema = files.some(hasFrozen) || Boolean(resultJson?.migration_added);
const highRiskHits = files.filter(highRisk);
const verification = resultJson?.verification_results || [];
const testsPassed = verification.length > 0 ? verification.every((item) => /PASS/.test(item.result || '')) : false;
const reasons = [];
let recommendation = 'auto-merge-eligible';
let forceHold = false;

if (!resultJson && task?.status !== 'completed') {
  recommendation = 'HOLD';
  forceHold = true;
  reasons.push('task is not completed or result-json is missing');
}
if (addedMigrationOrSchema || touchedFrozen) {
  recommendation = 'HOLD';
  reasons.push('migration/schema/entity/table/column boundary requires manual gate');
}
if (modifiedBusinessCode) {
  recommendation = highRiskHits.length > 0 ? 'require-A2' : 'require-A1';
  reasons.push('business code changed');
}
if (highRiskHits.length > 0) {
  recommendation = 'require-A2';
  reasons.push(`high-risk module touched: ${highRiskHits.join(', ')}`);
}
if (resultJson?.deployed || resultJson?.database_written || resultJson?.migration_executed) {
  recommendation = 'HOLD';
  reasons.push('DB write, migration execution, or deploy requires manual review');
}
if (verification.length > 0 && !testsPassed) {
  recommendation = 'require-A1';
  reasons.push('verification results are not all PASS');
}
if (forceHold) recommendation = 'HOLD';

const diagnosis = {
  task_id: args.taskId,
  agent: task?.agent || resultJson?.agent || null,
  task_status: task?.status || null,
  changed_files: files,
  touched_frozen_boundary: touchedFrozen,
  modified_business_code: modifiedBusinessCode,
  added_migration_or_schema: addedMigrationOrSchema,
  high_risk_hits: highRiskHits,
  tests_passed: testsPassed,
  recommendation,
  reasons,
  dry_run: Boolean(args.dryRun),
  generated_at: new Date().toISOString(),
};

mkdirSync(RUN_DIR, { recursive: true });
const outputJson = args.outputJson || path.join(RUN_DIR, `${args.taskId}-diagnosis.json`);
const outputMd = args.outputMd || path.join(RUN_DIR, `${args.taskId}-diagnosis.md`);
writeFileSync(outputJson, `${JSON.stringify(diagnosis, null, 2)}\n`);
writeMd(outputMd, diagnosis);

console.log(`Task ID: ${args.taskId}`);
console.log(`Recommendation: ${recommendation}`);
console.log(`Changed files: ${files.length}`);
console.log(`Diagnosis JSON: ${path.relative(process.cwd(), outputJson)}`);
console.log(`Diagnosis MD: ${path.relative(process.cwd(), outputMd)}`);
if (args.dryRun) console.log('Dry run: no task board, merge, push, deploy, migration, or DB action executed.');
