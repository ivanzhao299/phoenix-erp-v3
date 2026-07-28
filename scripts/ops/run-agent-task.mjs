#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { filterRunnerRuntimeStatus } from './bug-intake-worktree-runtime.mjs';

const AGENTS = {
  'Codex-Orchestrator': {
    branch: 'codex/orchestrator-main-sync-20260701',
    worktree: '/Users/mac/phoenix-erp-worktrees/codex-orchestrator',
    prompt: 'docs/ops/prompts/CODEX_ORCHESTRATOR_SYSTEM_PROMPT.md',
  },
  'A1-CI-Runtime-Gate': {
    branch: 'w5-a1-ci-runtime-gate',
    worktree: '/Users/mac/phoenix-erp-worktrees/a1-ci-runtime-gate',
    prompt: 'docs/ops/prompts/A1_CI_RUNTIME_GATE_PROMPT.md',
  },
  'A2-Security-Regression-Gate': {
    branch: 'w5-a2-security-regression-gate',
    worktree: '/Users/mac/phoenix-erp-worktrees/a2-security-regression-gate',
    prompt: 'docs/ops/prompts/A2_SECURITY_REVIEW_PROMPT.md',
  },
  'A3-Backend-Critical-Path': {
    branch: 'w5-a3-backend-critical-path',
    worktree: '/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path',
    prompt: 'docs/ops/prompts/A3_BACKEND_TASK_PROMPT.md',
  },
  'A4-Frontend-UAT-Smoke': {
    branch: 'w5-a4-frontend-uat-smoke',
    worktree: '/Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke',
    prompt: 'docs/ops/prompts/A4_FRONTEND_TASK_PROMPT.md',
  },
  'A5-Data-Readiness': {
    branch: 'w5-a5-data-readiness',
    worktree: '/Users/mac/phoenix-erp-worktrees/a5-data-readiness',
    prompt: 'docs/ops/prompts/A5_DATA_READINESS_PROMPT.md',
  },
  'A6-Staging-Deploy-Runbook': {
    branch: 'w5-a6-staging-deploy-runbook',
    worktree: '/Users/mac/phoenix-erp-worktrees/a6-staging-deploy-runbook',
    prompt: 'docs/ops/prompts/A6_DEPLOY_RUNBOOK_PROMPT.md',
  },
  'A7-Final-QA-Gate': {
    branch: 'w5-a7-final-qa-gate',
    worktree: '/Users/mac/phoenix-erp-worktrees/a7-final-qa-gate',
    prompt: 'docs/ops/prompts/A7_FINAL_QA_GATE_PROMPT.md',
  },
};
const BUG_INTAKE_OVERRIDES = {
  'A3-Backend-Critical-Path': {
    branch: 'codex/bug-intake-a3',
    worktree: '/Users/mac/phoenix-erp-worktrees/bug-intake-a3',
    prompt: 'docs/ops/prompts/BUG_INTAKE_A3_TASK_PROMPT.md',
  },
  'A4-Frontend-UAT-Smoke': {
    branch: 'codex/bug-intake-a4',
    worktree: '/Users/mac/phoenix-erp-worktrees/bug-intake-a4',
    prompt: 'docs/ops/prompts/BUG_INTAKE_A4_TASK_PROMPT.md',
  },
};
const BUG_INTAKE_WORKTREE_ROOT = '/Users/mac/phoenix-erp-worktrees';

function resolveBugIntakeExecutionConfig(agent, requestedWorktree) {
  const base = BUG_INTAKE_OVERRIDES[agent];
  if (!base) return null;
  if (requestedWorktree === base.worktree) return base;

  const parent = path.dirname(requestedWorktree);
  const name = path.basename(requestedWorktree);
  if (
    parent !== BUG_INTAKE_WORKTREE_ROOT
    || !/^bug-intake-bugtask-[a-z0-9-]+-a[34]$/.test(name)
  ) {
    return null;
  }
  return {
    ...base,
    worktree: requestedWorktree,
    branch: `codex/${name}`,
  };
}

function usage(exitCode = 1) {
  console.log(`Usage:
  node scripts/ops/run-agent-task.mjs --agent <name> --worktree <path> --prompt <file> [--request-spec <file>] [--task-contract <file>] [--assembled-prompt-output <file>] [--require-approval-token <token>] [--timeout-ms <ms>] [--dry-run] [--skip-baseline-autopilot] [--allow-ops-runtime-dirty] [--allow-bug-intake-worktree]

Example:
  node scripts/ops/run-agent-task.mjs \\
    --agent A1-CI-Runtime-Gate \\
    --worktree /Users/mac/phoenix-erp-worktrees/a1-ci-runtime-gate \\
    --prompt docs/ops/prompts/A1_CI_RUNTIME_GATE_PROMPT.md \\
    --dry-run`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  const values = {};
  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (arg === '--dry-run') {
      values.dryRun = true;
      continue;
    }
    if (arg === '--skip-baseline-autopilot') {
      values['skip-baseline-autopilot'] = true;
      continue;
    }
    if (arg === '--allow-ops-runtime-dirty') {
      values['allow-ops-runtime-dirty'] = true;
      continue;
    }
    if (arg === '--allow-bug-intake-worktree') {
      values['allow-bug-intake-worktree'] = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      usage(0);
    }
    if (arg.startsWith('--')) {
      values[arg.slice(2)] = normalized[i + 1];
      i += 1;
    }
  }
  return values;
}

function runBaselineAutopilot({ agent, branch, worktree }) {
  const command = [
    'scripts/ops/agent-baseline-autopilot.mjs',
    '--agent',
    agent,
    '--branch',
    branch,
    '--worktree',
    worktree,
    '--max-retries',
    '3',
    '--yes',
  ];
  const result = spawnSync(process.execPath, command, { cwd: process.cwd(), encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return {
    command: `node ${command.join(' ')}`,
    exitCode: result.status ?? 1,
  };
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function runGit(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function ensureGitRepo(worktree) {
  try {
    const inside = runGit(['rev-parse', '--is-inside-work-tree'], worktree);
    if (inside !== 'true') {
      fail(`${worktree} is not inside a git worktree`);
    }
  } catch (error) {
    fail(`${worktree} is not a git repository: ${error.message}`);
  }
}

function resolvePrompt(promptPath) {
  const absolute = path.isAbsolute(promptPath) ? promptPath : path.resolve(process.cwd(), promptPath);
  if (!existsSync(absolute)) {
    fail(`file does not exist: ${promptPath}`);
  }
  return absolute;
}

function isExecutable(file) {
  if (!file) return false;
  try {
    return existsSync(file);
  } catch {
    return false;
  }
}

function findCodex() {
  const candidates = [
    process.env.PHOENIX_ERP_CODEX_BIN,
    process.env.CODEX_BIN,
    '/Applications/ChatGPT.app/Contents/Resources/codex',
    '/Users/mac/.npm-global/bin/codex',
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (isExecutable(candidate)) return candidate;
  }
  const result = spawnSync('which', ['codex'], {
    encoding: 'utf8',
  });
  const cli = result.stdout.trim();
  return cli || null;
}

function isOnlyAllowedOpsRuntimeDirty(status) {
  if (!status.trim()) return true;
  return status
    .split('\n')
    .filter(Boolean)
    .every((line) => {
      const file = line.match(/docs\/ops\/.+$/)?.[0] || line.trim();
      return file === 'docs/ops/agent-queue/tasks.json' || file.startsWith('docs/ops/runs/');
    });
}

function summarize(text, limit = 4000) {
  if (!text) return '';
  return text.length <= limit ? text : `${text.slice(0, limit)}\n...<truncated ${text.length - limit} chars>`;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function writeRunLog(data) {
  const runsDir = path.resolve(process.cwd(), 'docs/ops/runs');
  mkdirSync(runsDir, { recursive: true });
  const safeAgent = data.agent.replace(/[^a-zA-Z0-9_-]/g, '_');
  const file = path.join(runsDir, `${timestamp()}-${safeAgent}.md`);
  const body = `# Codex CLI Agent Run

| Field | Value |
| --- | --- |
| Agent | ${data.agent} |
| Worktree | \`${data.worktree}\` |
| Branch | \`${data.branch}\` |
| Prompt | \`${data.prompt}\` |
| Timestamp | ${data.createdAt} |
| Dry run | ${data.dryRun ? 'Yes' : 'No'} |
| Approval token provided | ${data.approvalTokenProvided ? 'Yes' : 'No'} |
| Codex actually executed | ${data.codexActuallyExecuted ? 'Yes' : 'No'} |
| Exit code | ${data.exitCode} |

## Codex Command

\`\`\`bash
${data.command.join(' ')}
\`\`\`

## Stdout Summary

\`\`\`text
${summarize(data.stdout)}
\`\`\`

## Stderr Summary

\`\`\`text
${summarize(data.stderr)}
\`\`\`
`;
  writeFileSync(file, body);
  return file;
}

function buildAssembledPrompt({ basePrompt, requestSpecPath, taskContractPath }) {
  const parts = [
    {
      title: 'Base Agent Prompt',
      body: basePrompt,
    },
  ];

  if (requestSpecPath) {
    parts.push({
      title: 'Requirement Spec',
      body: readFileSync(requestSpecPath, 'utf8'),
    });
  }

  if (taskContractPath) {
    parts.push({
      title: 'Agent Task Contract',
      body: readFileSync(taskContractPath, 'utf8'),
    });
  }

  parts.push({
    title: 'Execution Guardrails',
    body: `1. Do not merge.
2. Do not push.
3. Do not deploy.
4. Do not execute migrations.
5. Do not write to any database.
6. Do not modify the task board from inside the Agent task.
7. Stop immediately if the task requires files outside the allowed contract.
8. Stop immediately if migration/schema/entity/table/column changes are needed but not explicitly approved.
9. Report PASS / FAIL / PASS WITH CONDITIONS with exact evidence.`,
  });

  return parts
    .map((part) => `# ${part.title}\n\n${part.body.trim()}\n`)
    .join('\n---\n\n');
}

function writeAssembledPrompt(outputPath, content) {
  const absolute = path.isAbsolute(outputPath) ? outputPath : path.resolve(process.cwd(), outputPath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
  return absolute;
}

const args = parseArgs(process.argv.slice(2));
if (!args.agent || !args.worktree || !args.prompt) {
  usage(1);
}

const config = AGENTS[args.agent];
if (!config) {
  fail(`unknown agent: ${args.agent}`);
}

const worktree = path.resolve(args.worktree);
const override = args['allow-bug-intake-worktree']
  ? resolveBugIntakeExecutionConfig(args.agent, worktree)
  : null;
if (args['allow-bug-intake-worktree'] && BUG_INTAKE_OVERRIDES[args.agent] && !override) {
  fail(`invalid isolated bug-intake worktree for ${args.agent}: ${worktree}`);
}
const executionConfig = override || config;
if (worktree !== executionConfig.worktree) {
  fail(`worktree mismatch for ${args.agent}; expected ${executionConfig.worktree}, got ${worktree}`);
}
if (!existsSync(worktree)) {
  fail(`worktree does not exist: ${worktree}`);
}

ensureGitRepo(worktree);

const branch = runGit(['branch', '--show-current'], worktree);
if (branch !== executionConfig.branch) {
  fail(`branch mismatch for ${args.agent}; expected ${executionConfig.branch}, got ${branch}`);
}

const status = filterRunnerRuntimeStatus(runGit(['status', '--short'], worktree));
if (status && !(args['allow-ops-runtime-dirty'] && isOnlyAllowedOpsRuntimeDirty(status))) {
  fail(`worktree is not clean:\n${status}`);
}

const promptFile = resolvePrompt(args.prompt);
const expectedPrompt = path.resolve(process.cwd(), executionConfig.prompt);
if (promptFile !== expectedPrompt) {
  fail(`prompt mismatch for ${args.agent}; expected ${executionConfig.prompt}, got ${args.prompt}`);
}

const requestSpecFile = args['request-spec'] ? resolvePrompt(args['request-spec']) : null;
const taskContractFile = args['task-contract'] ? resolvePrompt(args['task-contract']) : null;
const assembledPromptOutput = args['assembled-prompt-output'] ?? null;
const hasDispatchPayload = Boolean(requestSpecFile || taskContractFile);

if (!args.dryRun && hasDispatchPayload && args['require-approval-token'] !== 'APPROVE_AGENT_EXECUTION') {
  fail('non-dry-run Agent execution with request spec or task contract requires --require-approval-token APPROVE_AGENT_EXECUTION');
}

const prompt = buildAssembledPrompt({
  basePrompt: readFileSync(promptFile, 'utf8'),
  requestSpecPath: requestSpecFile,
  taskContractPath: taskContractFile,
});
const command = ['codex', 'exec', '-C', worktree, '--sandbox', 'workspace-write', '-'];
const timeoutMs = parsePositiveInt(args['timeout-ms'] ?? process.env.PHOENIX_ERP_AGENT_TIMEOUT_MS, 600000);

let assembledPromptFile = null;
if (assembledPromptOutput) {
  assembledPromptFile = writeAssembledPrompt(assembledPromptOutput, prompt);
}

console.log(`Agent: ${args.agent}`);
console.log(`Worktree: ${worktree}`);
console.log(`Branch: ${branch}`);
console.log(`Prompt: ${path.relative(process.cwd(), promptFile)}`);
if (requestSpecFile) console.log(`Requirement spec: ${path.relative(process.cwd(), requestSpecFile)}`);
if (taskContractFile) console.log(`Task contract: ${path.relative(process.cwd(), taskContractFile)}`);
if (assembledPromptFile) console.log(`Assembled prompt: ${path.relative(process.cwd(), assembledPromptFile)}`);
console.log(`Assembled prompt chars: ${prompt.length}`);
console.log(`Codex command: ${command.join(' ')}`);
console.log(`Codex timeout ms: ${timeoutMs}`);

if (args.dryRun) {
  console.log('Dry run: command not executed.');
  console.log('baseline autopilot will run after agent completion');
  console.log('user manual rebase required: false');
  console.log('user manual merge required: false');
  console.log('user manual docs/ops/runs cleanup required: false');
  process.exit(0);
}

const codexCli = findCodex();
if (!codexCli) {
  fail('codex CLI not found. Set PHOENIX_ERP_CODEX_BIN or CODEX_BIN, or include codex in PATH.');
}

const versionProbe = spawnSync(codexCli, ['--version'], { encoding: 'utf8', timeout: 10000 });
if ((versionProbe.status ?? 1) !== 0) {
  fail(`codex CLI preflight failed: ${summarize(versionProbe.stderr || versionProbe.stdout, 1000)}`);
}
console.log(`Codex CLI: ${codexCli} (${String(versionProbe.stdout || '').trim()})`);

const result = spawnSync(codexCli, command.slice(1), {
  input: prompt,
  encoding: 'utf8',
  cwd: process.cwd(),
  timeout: timeoutMs,
  maxBuffer: 32 * 1024 * 1024,
});
const timedOut = result.error?.code === 'ETIMEDOUT';
const exitCode = timedOut ? 124 : result.status ?? 1;

const logFile = writeRunLog({
  agent: args.agent,
  worktree,
  branch,
  prompt: path.relative(process.cwd(), promptFile),
  assembledPrompt: assembledPromptFile ? path.relative(process.cwd(), assembledPromptFile) : '',
  createdAt: new Date().toISOString(),
  dryRun: false,
  approvalTokenProvided: args['require-approval-token'] === 'APPROVE_AGENT_EXECUTION',
  codexActuallyExecuted: true,
  command: [codexCli, ...command.slice(1)],
  exitCode,
  stdout: `${result.stdout ?? ''}${timedOut ? `\nERROR: codex execution timed out after ${timeoutMs} ms.\n` : ''}`,
  stderr: `${result.stderr ?? ''}${result.error && !timedOut ? `\n${result.error.message}\n` : ''}`,
});

console.log(`Run log: ${logFile}`);
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(`${summarize(result.stderr, 12000)}\n`);
if (timedOut) console.error(`ERROR: codex execution timed out after ${timeoutMs} ms.`);
let baselineExitCode = 0;
if (!args['skip-baseline-autopilot']) {
  console.log('Running baseline autopilot after agent completion...');
  const baseline = runBaselineAutopilot({ agent: args.agent, branch, worktree });
  baselineExitCode = baseline.exitCode;
  console.log(`Baseline autopilot command: ${baseline.command}`);
  console.log(`Baseline autopilot exit code: ${baseline.exitCode}`);
} else {
  console.log('Baseline autopilot skipped by caller; caller must run lifecycle hook.');
}
process.exit(exitCode !== 0 ? exitCode : baselineExitCode);
