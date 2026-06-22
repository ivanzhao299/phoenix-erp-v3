#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const APPROVAL_TOKEN = 'APPROVE_AGENT_EXECUTION';

function usage(exitCode = 1) {
  console.log(`Usage:
  node scripts/ops/execute-approved-follow-up.mjs \\
    --plan <decision-plan.json> \\
    --follow-up-task-id <task-id> \\
    --approval-token APPROVE_AGENT_EXECUTION \\
    --output-dir <dir>`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  const values = {};
  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg.startsWith('--')) {
      values[arg.slice(2)] = normalized[i + 1];
      i += 1;
    }
  }
  return values;
}

function resolvePath(file) {
  return path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
}

function runGit(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function writeSummary({
  outputDir,
  status,
  reason,
  item,
  command = '',
  exitCode = null,
  stdout = '',
  stderr = '',
  approvalTokenProvided = false,
  correctApprovalTokenUsed = false,
}) {
  mkdirSync(outputDir, { recursive: true });
  const file = path.join(outputDir, 'approved-follow-up-execution-summary.md');
  const body = `# Approved Follow-Up Execution Summary

| Field | Value |
| --- | --- |
| Status | ${status} |
| Reason | ${reason || 'N/A'} |
| Follow-up task | ${item?.follow_up_task_id ?? 'N/A'} |
| Agent | ${item?.next_agent ?? 'N/A'} |
| Worktree | \`${item?.worktree ?? 'N/A'}\` |
| Branch | \`${item?.branch ?? 'N/A'}\` |
| Approval token provided | ${approvalTokenProvided ? 'Yes' : 'No'} |
| Correct approval token used | ${correctApprovalTokenUsed ? 'Yes' : 'No'} |
| Codex CLI executed | ${status === 'EXECUTED' ? 'Yes' : 'No'} |
| Migration executed | No |
| Database written | No |
| Deployment executed | No |
| Merge executed | No |
| Push executed | No |
| Exit code | ${exitCode ?? 'N/A'} |

## Command

\`\`\`bash
${command}
\`\`\`

## Stdout Summary

\`\`\`text
${stdout.slice(0, 4000)}
\`\`\`

## Stderr Summary

\`\`\`text
${stderr.slice(0, 4000)}
\`\`\`
`;
  writeFileSync(file, body);
  return file;
}

function fail(message, context = {}) {
  if (context.outputDir) {
    writeSummary({
      outputDir: context.outputDir,
      status: 'REJECTED',
      reason: message,
      item: context.item,
      approvalTokenProvided: context.approvalTokenProvided ?? false,
      correctApprovalTokenUsed: false,
    });
  }
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function ensureFile(file, label, context) {
  const absolute = resolvePath(file);
  if (!existsSync(absolute)) {
    fail(`${label} does not exist: ${file}`, context);
  }
  return absolute;
}

function assembledPromptPath(outputDir, taskId) {
  return path.join(outputDir, `${taskId}-assembled-prompt.md`);
}

const args = parseArgs(process.argv.slice(2));
for (const required of ['plan', 'follow-up-task-id', 'output-dir']) {
  if (!args[required]) usage(1);
}

const outputDir = resolvePath(args['output-dir']);
const planPath = ensureFile(args.plan, 'plan', { outputDir });
const plan = JSON.parse(readFileSync(planPath, 'utf8'));

if (plan.decision !== 'DISPATCH_PLAN_READY') {
  fail(`plan decision is ${plan.decision}; refusing execution`, { outputDir });
}

const selected = (plan.follow_up_dispatches ?? []).find((item) => item.follow_up_task_id === args['follow-up-task-id']);
if (!selected) {
  fail(`follow-up task id not found in plan: ${args['follow-up-task-id']}`, { outputDir });
}

if (selected.approval_required !== true) {
  fail('selected follow-up must have approval_required: true', { outputDir, item: selected });
}

if (args['approval-token'] !== APPROVAL_TOKEN) {
  fail('approval token is missing or invalid; refusing to execute follow-up Agent', {
    outputDir,
    item: selected,
    approvalTokenProvided: Boolean(args['approval-token']),
  });
}

ensureFile(selected.generated_contract_file, 'generated contract file', { outputDir, item: selected });
ensureFile(selected.prompt_file, 'prompt file', { outputDir, item: selected });
const assembledPrompt = assembledPromptPath(outputDir, selected.follow_up_task_id);
ensureFile(assembledPrompt, 'assembled prompt file; run dispatch-follow-up-plan.mjs --dry-run first', { outputDir, item: selected });

const worktree = resolvePath(selected.worktree);
if (!existsSync(worktree)) {
  fail(`worktree does not exist: ${selected.worktree}`, { outputDir, item: selected });
}

try {
  const inside = runGit(['rev-parse', '--is-inside-work-tree'], worktree);
  if (inside !== 'true') fail('worktree is not a git repository', { outputDir, item: selected });
} catch (error) {
  fail(`worktree is not a git repository: ${error.message}`, { outputDir, item: selected });
}

const branch = runGit(['branch', '--show-current'], worktree);
if (branch !== selected.branch) {
  fail(`worktree branch mismatch; expected ${selected.branch}, got ${branch}`, { outputDir, item: selected });
}

const status = runGit(['status', '--short'], worktree);
if (status) {
  fail(`worktree is not clean:\n${status}`, { outputDir, item: selected });
}

const commandArgs = [
  'scripts/ops/run-agent-task.mjs',
  '--agent',
  selected.next_agent,
  '--worktree',
  selected.worktree,
  '--prompt',
  selected.prompt_file,
  '--task-contract',
  selected.generated_contract_file,
  '--assembled-prompt-output',
  assembledPrompt,
  '--require-approval-token',
  APPROVAL_TOKEN,
  '--skip-baseline-autopilot',
];
const command = `node ${commandArgs.join(' ')}`;

const auditPath = path.join(outputDir, `${selected.follow_up_task_id}-approved-execution-audit.md`);
writeFileSync(
  auditPath,
  `# Approved Follow-Up Execution Audit

| Field | Value |
| --- | --- |
| Plan | \`${path.relative(process.cwd(), planPath)}\` |
| Follow-up task | ${selected.follow_up_task_id} |
| Agent | ${selected.next_agent} |
| Worktree | \`${selected.worktree}\` |
| Branch | \`${selected.branch}\` |
| Contract | \`${selected.generated_contract_file}\` |
| Assembled prompt | \`${path.relative(process.cwd(), assembledPrompt)}\` |
| Approval token provided | Yes |
| Token value logged | No |
| Merge allowed | No |
| Push allowed | No |
| Deploy allowed | No |
| Migration execution allowed | No |
| Database write allowed | No |
`,
);

const result = spawnSync(process.execPath, commandArgs, {
  cwd: process.cwd(),
  encoding: 'utf8',
});

const baselineArgs = [
  'scripts/ops/agent-baseline-autopilot.mjs',
  '--agent',
  selected.next_agent,
  '--branch',
  selected.branch,
  '--worktree',
  selected.worktree,
  '--max-retries',
  '3',
  '--yes',
];
let baselineResult = { status: 0, stdout: '', stderr: '' };
if ((result.status ?? 1) === 0) {
  baselineResult = spawnSync(process.execPath, baselineArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

const summaryPath = writeSummary({
  outputDir,
  status: result.status === 0 && baselineResult.status === 0 ? 'COMPLETED_MERGED' : 'FAILED',
  reason:
    result.status !== 0
      ? 'run-agent-task failed'
      : baselineResult.status !== 0
        ? `baseline autopilot failed with ${baselineResult.status}`
        : 'run-agent-task and baseline autopilot completed',
  item: selected,
  command: `${command}\nnode ${baselineArgs.join(' ')}`,
  exitCode: baselineResult.status === 0 ? result.status : baselineResult.status,
  stdout: `${result.stdout ?? ''}\n${baselineResult.stdout ?? ''}`,
  stderr: `${result.stderr ?? ''}\n${baselineResult.stderr ?? ''}`,
  approvalTokenProvided: true,
  correctApprovalTokenUsed: true,
});

console.log(`Audit: ${path.relative(process.cwd(), auditPath)}`);
console.log(`Summary: ${path.relative(process.cwd(), summaryPath)}`);
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (baselineResult.stdout) process.stdout.write(baselineResult.stdout);
if (baselineResult.stderr) process.stderr.write(baselineResult.stderr);
process.exit((result.status ?? 1) !== 0 ? result.status ?? 1 : baselineResult.status ?? 1);
