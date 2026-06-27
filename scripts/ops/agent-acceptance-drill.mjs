#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const AGENTS = [
  'A1-CI-Runtime-Gate',
  'A2-Security-Regression-Gate',
  'A3-Backend-Critical-Path',
  'A4-Frontend-UAT-Smoke',
  'A5-Data-Readiness',
  'A6-Staging-Deploy-Runbook',
  'A7-Final-QA-Gate',
];

function usage(exitCode = 1) {
  console.log(`Usage:
  node scripts/ops/agent-acceptance-drill.mjs --request <text> --parallel <n> --dry-run --output-dir docs/ops/runs`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  const values = { parallel: '3', dryRun: false, outputDir: 'docs/ops/runs' };
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

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const record = {
    command: [command, ...args].join(' '),
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
  if (!options.allowFailure && record.status !== 0) {
    console.error(record.stdout);
    console.error(record.stderr);
    process.exit(record.status);
  }
  return record;
}

function extractRequestId(text) {
  const match = text.match(/Request ID:\s*(\S+)/);
  if (!match) throw new Error('could not extract Request ID from orchestrator output');
  return match[1];
}

function summarizeCommand(record) {
  return `### ${record.command}

Exit code: ${record.status}

\`\`\`text
${(record.stdout || record.stderr || '').trim().slice(0, 4000)}
\`\`\``;
}

const args = parseArgs(process.argv.slice(2));
if (!args.request || !args.dryRun) usage(1);

const outputDir = path.resolve(process.cwd(), args.outputDir);
const dirs = ['95', 'acceptance', 'seven-agent'].map((name) => path.join(outputDir, name));
for (const dir of [outputDir, ...dirs]) mkdirSync(dir, { recursive: true });

const request = `${args.request}\n\nRouting hint: A1/A2/A3/A4/A5/A6/A7 seven-agent acceptance drill.`;
const orchestrator = run('node', [
  'scripts/ops/agent-orchestrator.mjs',
  '--request',
  request,
  '--mode',
  'closed-loop',
  '--parallel',
  String(args.parallel),
  '--dry-run',
  '--output-dir',
  args.outputDir,
]);
const requestId = extractRequestId(orchestrator.stdout);
const list = run('node', ['scripts/ops/agent-task-queue.mjs', '--list']);

const workerRuns = [];
for (const agent of AGENTS) {
  workerRuns.push(
    run('node', ['scripts/ops/agent-worker.mjs', '--agent', agent, '--claim-next', '--request-id', requestId, '--dry-run'], {
      allowFailure: true,
    }),
  );
}

const tasks = JSON.parse(readFileSync('docs/ops/agent-queue/tasks.json', 'utf8')).filter((task) => task.request_id === requestId);
const firstTask = tasks[0]?.task_id;
let diagnosis = null;
let autoMerge = null;
if (firstTask) {
  diagnosis = run('node', ['scripts/ops/agent-diagnose-result.mjs', '--task-id', firstTask, '--dry-run'], { allowFailure: true });
  autoMerge = run('node', ['scripts/ops/agent-auto-merge.mjs', '--task-id', firstTask, '--dry-run'], { allowFailure: true });
}

const release = run(
  'node',
  ['scripts/ops/agent-release-state-machine.mjs', '--request-id', requestId, '--to', 'TASKS_CREATED', '--dry-run'],
  { allowFailure: true },
);

const matrix = AGENTS.map((agent) => {
  const task = tasks.find((item) => item.agent === agent);
  const worker = workerRuns.find((item) => item.stdout.includes(agent) || item.command.includes(agent));
  return {
    agent,
    task_id: task?.task_id || null,
    task_status: task?.status || null,
    worker_dry_run_exit: worker?.status ?? null,
    can_claim_next: worker?.stdout.includes('Dry-run worker would claim and run') || false,
  };
});

const result = {
  request_id: requestId,
  request: args.request,
  dry_run: true,
  codex_cli_executed: false,
  merge_executed: false,
  pushed: false,
  migration_executed: false,
  database_written: false,
  deployed: false,
  agents: matrix,
  created_task_count: tasks.length,
  diagnosis_status: diagnosis?.status ?? null,
  auto_merge_status: autoMerge?.status ?? null,
  release_state_status: release.status,
  generated_at: new Date().toISOString(),
};

const jsonPath = path.join(dirs[0], `${requestId}-acceptance-drill.json`);
const mdPath = path.join(dirs[1], `${requestId}-acceptance-drill.md`);
const sevenPath = path.join(dirs[2], `${requestId}-seven-agent-summary.md`);
writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
const body = `# Seven-Agent Acceptance Drill

| Field | Value |
| --- | --- |
| Request ID | ${requestId} |
| Created tasks | ${tasks.length} |
| Codex CLI executed | No |
| Merge executed | No |
| Push executed | No |
| Migration executed | No |
| Database written | No |
| Deployed | No |

## Agent Matrix

| Agent | Task ID | Status | Worker dry-run |
| --- | --- | --- | --- |
${matrix.map((row) => `| ${row.agent} | ${row.task_id || 'N/A'} | ${row.task_status || 'N/A'} | ${row.can_claim_next ? 'PASS' : 'CHECK'} |`).join('\n')}

## Orchestrator

${summarizeCommand(orchestrator)}

## Task Queue

${summarizeCommand(list)}

## Worker Dry-Runs

${workerRuns.map(summarizeCommand).join('\n\n')}

## Diagnosis

${diagnosis ? summarizeCommand(diagnosis) : 'No diagnosis task found.'}

## Auto Merge

${autoMerge ? summarizeCommand(autoMerge) : 'No auto-merge task found.'}

## Release State Machine

${summarizeCommand(release)}
`;
writeFileSync(mdPath, body);
writeFileSync(sevenPath, body);

console.log(`Request ID: ${requestId}`);
console.log(`Created tasks: ${tasks.length}`);
console.log(`Acceptance JSON: ${path.relative(process.cwd(), jsonPath)}`);
console.log(`Acceptance MD: ${path.relative(process.cwd(), mdPath)}`);
console.log(`Seven-agent summary: ${path.relative(process.cwd(), sevenPath)}`);
console.log('Codex CLI executed: No');
console.log('Merge executed: No');
console.log('Push executed: No');
console.log('Migration executed: No');
console.log('Database written: No');
console.log('Deployed: No');
