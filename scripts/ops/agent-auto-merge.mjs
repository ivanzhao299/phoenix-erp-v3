#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const APPROVAL_TOKEN = 'APPROVE_AGENT_EXECUTION';
const TASKS_FILE = 'docs/ops/agent-queue/tasks.json';
const RUN_DIR = 'docs/ops/runs';

function usage(exitCode = 1) {
  console.log(`Usage:
  node scripts/ops/agent-auto-merge.mjs --task-id <task-id> [--diagnosis-json <file>] [--dry-run] [--approval-token <token>]`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  const values = { dryRun: true };
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
  values.dryRun = values.dryRun !== false && values.approvalToken !== APPROVAL_TOKEN;
  return values;
}

function readTask(taskId) {
  if (!existsSync(TASKS_FILE)) return null;
  return JSON.parse(readFileSync(TASKS_FILE, 'utf8')).find((task) => task.task_id === taskId) || null;
}

function loadDiagnosis(args) {
  const file = args.diagnosisJson || path.join(RUN_DIR, `${args.taskId}-diagnosis.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

function writeReport(task, diagnosis, decision, command, result = null) {
  mkdirSync(RUN_DIR, { recursive: true });
  const file = path.join(RUN_DIR, `${task.task_id}-auto-merge-report.md`);
  writeFileSync(
    file,
    `# Agent Auto Merge Report

| Field | Value |
| --- | --- |
| Task ID | ${task.task_id} |
| Branch | ${task.branch} |
| Decision | ${decision} |
| Recommendation | ${diagnosis?.recommendation || 'None'} |
| Dry run | ${command.includes('--dry-run') ? 'Yes' : 'No'} |
| Exit code | ${result?.status ?? 'Not executed'} |

## Command

\`\`\`bash
${command.join(' ')}
\`\`\`

## Stdout

\`\`\`text
${result?.stdout || ''}
\`\`\`

## Stderr

\`\`\`text
${result?.stderr || ''}
\`\`\`
`,
  );
  return file;
}

const args = parseArgs(process.argv.slice(2));
if (!args.taskId) usage(1);

const task = readTask(args.taskId);
if (!task) {
  console.error(`ERROR: task not found: ${args.taskId}`);
  process.exit(1);
}
const diagnosis = loadDiagnosis(args);
const reasons = [];
if (!diagnosis) reasons.push('diagnosis-json missing');
if (diagnosis && diagnosis.recommendation !== 'auto-merge-eligible') reasons.push(`diagnosis recommendation is ${diagnosis.recommendation}`);
if (diagnosis?.touched_frozen_boundary || diagnosis?.added_migration_or_schema) reasons.push('frozen boundary or migration/schema touched');
if (diagnosis?.modified_business_code && !['completed-with-a1-a2', 'a1-a2-passed'].includes(task.merge_gate_status)) {
  reasons.push('business code requires A1/A2 pass before auto-merge');
}

const command = ['node', 'scripts/ops/agent-sync-and-merge.mjs', task.branch, '--dry-run'];
let decision = 'AUTO_MERGE_DRY_RUN_READY';
let result = null;

if (reasons.length > 0) {
  decision = 'HOLD';
} else if (!args.dryRun && args.approvalToken === APPROVAL_TOKEN) {
  command.pop();
  command.push('--yes');
  result = spawnSync(command[0], command.slice(1), { cwd: process.cwd(), encoding: 'utf8' });
  decision = (result.status ?? 1) === 0 ? 'MERGED' : 'MERGE_FAILED';
} else {
  result = spawnSync(command[0], command.slice(1), { cwd: process.cwd(), encoding: 'utf8' });
}

const report = writeReport(task, diagnosis, decision, command, result);
console.log(`Task ID: ${task.task_id}`);
console.log(`Decision: ${decision}`);
if (reasons.length > 0) console.log(`Held reasons: ${reasons.join('; ')}`);
console.log(`Report: ${path.relative(process.cwd(), report)}`);
console.log('Push executed: No');
console.log('Deploy executed: No');
console.log('Migration executed: No');
console.log('Database written: No');
