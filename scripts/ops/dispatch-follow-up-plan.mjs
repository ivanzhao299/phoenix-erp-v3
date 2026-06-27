#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function usage(exitCode = 1) {
  console.log(`Usage:
  node scripts/ops/dispatch-follow-up-plan.mjs \\
    --plan <decision-plan.json> \\
    --output-dir <dir> \\
    [--dry-run]`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  const values = { dryRun: true };
  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--dry-run') {
      values.dryRun = true;
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

function resolvePath(file) {
  return path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
}

function requireFile(file, label) {
  const absolute = resolvePath(file);
  if (!existsSync(absolute)) fail(`${label} does not exist: ${file}`);
  return absolute;
}

function shellSplit(command) {
  const tokens = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = pattern.exec(command)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
}

function validateDispatch(item) {
  const required = [
    'follow_up_task_id',
    'next_agent',
    'worktree',
    'branch',
    'prompt_file',
    'generated_contract_file',
    'run_agent_task_dry_run_command',
    'approval_required',
  ];
  const missing = required.filter((field) => item[field] === undefined || item[field] === null || item[field] === '');
  if (missing.length > 0) fail(`follow-up dispatch missing field(s): ${missing.join(', ')}`);
  if (item.approval_required !== true) fail(`${item.follow_up_task_id} must have approval_required: true`);
  if (item.run_agent_task_dry_run_command.includes('--require-approval-token')) {
    fail(`${item.follow_up_task_id} dry-run command must not include approval token`);
  }
  if (!item.run_agent_task_dry_run_command.includes('--dry-run')) {
    fail(`${item.follow_up_task_id} command must include --dry-run`);
  }
}

function assembledPromptPath(outputDir, taskId) {
  return path.join(outputDir, `${taskId}-assembled-prompt.md`);
}

function buildCommand(item, outputDir) {
  const output = assembledPromptPath(outputDir, item.follow_up_task_id);
  return [
    'scripts/ops/run-agent-task.mjs',
    '--agent',
    item.next_agent,
    '--worktree',
    item.worktree,
    '--prompt',
    item.prompt_file,
    '--task-contract',
    item.generated_contract_file,
    '--assembled-prompt-output',
    output,
    '--dry-run',
  ];
}

const args = parseArgs(process.argv.slice(2));
if (!args.plan || !args['output-dir']) usage(1);
if (!args.dryRun) fail('only --dry-run is supported; real follow-up dispatch requires separate user approval');

const planPath = requireFile(args.plan, 'plan');
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const outputDir = resolvePath(args['output-dir']);
mkdirSync(outputDir, { recursive: true });

if (plan.decision !== 'DISPATCH_PLAN_READY') {
  fail(`plan decision is ${plan.decision}; refusing follow-up dispatch`);
}
if (plan.missing_fields && plan.missing_fields.length > 0) {
  fail(`plan has missing_fields: ${plan.missing_fields.join(', ')}`);
}
if (!Array.isArray(plan.follow_up_dispatches) || plan.follow_up_dispatches.length === 0) {
  fail('plan has no follow_up_dispatches');
}

const results = [];
for (const item of plan.follow_up_dispatches) {
  validateDispatch(item);
  requireFile(item.generated_contract_file, 'generated contract file');
  requireFile(item.prompt_file, 'prompt file');

  const legacyTokens = shellSplit(item.run_agent_task_dry_run_command);
  if (legacyTokens.includes('--require-approval-token') || !legacyTokens.includes('--dry-run')) {
    fail(`${item.follow_up_task_id} stored dry-run command is unsafe`);
  }

  const commandArgs = buildCommand(item, args['output-dir']);
  const commandText = `node ${commandArgs.join(' ')}`;
  console.log(`Dispatch dry-run: ${item.follow_up_task_id} -> ${item.next_agent}`);
  console.log(commandText);

  const result = spawnSync(process.execPath, commandArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    fail(`${item.follow_up_task_id} run-agent-task dry-run failed with exit code ${result.status}`);
  }

  results.push({
    follow_up_task_id: item.follow_up_task_id,
    next_agent: item.next_agent,
    assembled_prompt: assembledPromptPath(args['output-dir'], item.follow_up_task_id),
    command: commandText,
    exit_code: result.status,
    stdout_summary: result.stdout.trim().split('\n').slice(0, 12).join('\n'),
  });
}

const summaryPath = path.join(outputDir, 'follow-up-dispatch-dry-run-summary.md');
const summary = `# Follow-Up Dispatch Dry-Run Summary

| Field | Value |
| --- | --- |
| Source task | ${plan.source_task_id} |
| Source Agent | ${plan.source_agent} |
| Decision | ${plan.decision} |
| Follow-up count | ${results.length} |
| Real Codex CLI executed | No |
| Approval token passed | No |
| Migration executed | No |
| Database written | No |
| Deployment executed | No |

## Follow-Up Dispatches

${results
  .map(
    (item) => `### ${item.follow_up_task_id}

- Agent: ${item.next_agent}
- Assembled prompt: \`${item.assembled_prompt}\`
- Exit code: ${item.exit_code}

\`\`\`bash
${item.command}
\`\`\`

\`\`\`text
${item.stdout_summary}
\`\`\``,
  )
  .join('\n\n')}
`;
writeFileSync(summaryPath, summary);

console.log(`Summary: ${path.relative(process.cwd(), summaryPath)}`);
console.log('No approval token passed. No real Codex CLI execution requested.');
