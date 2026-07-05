#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';

const APPROVAL_TOKEN = 'APPROVE_AGENT_EXECUTION';
const MAIN_ROOT = '/Users/mac/phoenix-erp';
const TASKS_FILE = 'docs/ops/agent-queue/tasks.json';
const RUN_DIR = 'docs/ops/runs/bug-intake-local-runner';
const DEFAULT_SYNC_OUTPUT = 'docs/ops/runs/bug-intake-inbox';
const RUNNABLE_STATUSES = new Set(['pending', 'claimed']);
const FINISHED_STATUSES = new Set(['COMPLETED_MERGED', 'completed', 'failed', 'HOLD', 'hold']);
const OPS_RUNTIME_PATHS = ['docs/ops/agent-queue/tasks.json', 'docs/ops/runs'];

function usage(code = 1) {
  console.log(`Usage:
  node scripts/ops/bug-intake-local-runner.mjs \\
    --api-base https://erp.eggslao.com \\
    [--token-env PHOENIX_ERP_TOKEN | --login-user-env PHOENIX_ERP_RUNNER_USER --login-password-env PHOENIX_ERP_RUNNER_PASS] \\
    [--once | --watch] [--interval 300] [--max-cycles 1] [--max-tasks 3] \\
    [--apply-queue] [--execute-approved --approval-token APPROVE_AGENT_EXECUTION] \\
    [--push-after-success] [--dry-run]

Fixture test:
  node scripts/ops/bug-intake-local-runner.mjs --fixture-json /tmp/bug.json --once --dry-run`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = {
    dryRun: true,
    once: false,
    watch: false,
    interval: 300,
    maxCycles: 1,
    maxTasks: 3,
    outputDir: RUN_DIR,
    syncOutputDir: DEFAULT_SYNC_OUTPUT,
    mainRoot: MAIN_ROOT,
    loginUserEnv: 'PHOENIX_ERP_RUNNER_USER',
    loginPasswordEnv: 'PHOENIX_ERP_RUNNER_PASS',
    childTokenEnv: 'PHOENIX_ERP_RUNNER_TOKEN',
  };
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (['--dry-run', '--once', '--watch', '--apply-queue', '--execute-approved', '--push-after-success'].includes(arg)) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      args[key] = true;
      continue;
    }
    if (arg.startsWith('--')) {
      args[arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = normalized[i + 1];
      i += 1;
    }
  }
  args.interval = Number.parseInt(args.interval, 10) || 300;
  args.maxCycles = Number.parseInt(args.maxCycles, 10) || 1;
  args.maxTasks = Number.parseInt(args.maxTasks, 10) || 3;
  if (args.executeApproved && args.approvalToken === APPROVAL_TOKEN) args.dryRun = false;
  if (!args.once && !args.watch) args.once = true;
  return args;
}

function resolveFile(file, cwd = process.cwd()) {
  return path.isAbsolute(file) ? file : path.resolve(cwd, file);
}

function readJson(file, fallback) {
  const target = resolveFile(file);
  if (!existsSync(target)) return fallback;
  return JSON.parse(readFileSync(target, 'utf8'));
}

function writeJson(file, value) {
  const target = resolveFile(file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function writeMd(file, text) {
  const target = resolveFile(file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, text);
}

function run(command, options = {}) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(command[0], command.slice(1), {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, ...(options.env || {}) },
  });
  const secretValues = [process.env[options.tokenEnv], options.env?.[options.tokenEnv], options.env?.[options.childTokenEnv]]
    .filter(Boolean)
    .map(String);
  const redact = (value) => secretValues.reduce((next, secret) => next.split(secret).join('<redacted>'), String(value));
  return {
    command: command.map(redact),
    startedAt,
    finishedAt: new Date().toISOString(),
    status: result.status ?? 1,
    stdout: redact(result.stdout || '').slice(-12000),
    stderr: redact(result.stderr || '').slice(-12000),
  };
}

function execGit(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function safeGit(args, cwd) {
  try {
    return { ok: true, output: execGit(args, cwd) };
  } catch (error) {
    return { ok: false, output: error.stderr?.toString() || error.message };
  }
}

function commitOpsRuntimeArtifacts(args) {
  if (args.dryRun) return { skipped: true, reason: 'dry-run' };
  const status = safeGit(['status', '--short', '--', ...OPS_RUNTIME_PATHS], args.mainRoot);
  if (!status.ok) return { skipped: false, ok: false, step: 'git status', error: status.output };
  if (!status.output.trim()) return { skipped: true, reason: 'no ops runtime artifacts changed' };
  const add = safeGit(['add', '--', ...OPS_RUNTIME_PATHS], args.mainRoot);
  if (!add.ok) return { skipped: false, ok: false, step: 'git add', error: add.output };
  const staged = safeGit(['diff', '--cached', '--name-only', '--', ...OPS_RUNTIME_PATHS], args.mainRoot);
  if (!staged.ok) return { skipped: false, ok: false, step: 'git diff --cached', error: staged.output };
  if (!staged.output.trim()) return { skipped: true, reason: 'no staged ops runtime artifacts' };
  const commit = safeGit(['commit', '-m', 'docs(ops): record bug intake runner artifacts'], args.mainRoot);
  return commit.ok
    ? { skipped: false, ok: true, files: staged.output.split('\n').filter(Boolean), output: commit.output }
    : { skipped: false, ok: false, step: 'git commit', error: commit.output };
}

function tokenAvailable(args) {
  if (args.fixtureJson) return true;
  return Boolean(
    args.token ||
    (args.tokenEnv && process.env[args.tokenEnv]) ||
    (args.loginUserEnv && args.loginPasswordEnv && process.env[args.loginUserEnv] && process.env[args.loginPasswordEnv]),
  );
}

async function loginToken(args) {
  if (args.fixtureJson) return '';
  if (args.token) return args.token;
  if (args.tokenEnv && process.env[args.tokenEnv]) return process.env[args.tokenEnv];
  const username = process.env[args.loginUserEnv];
  const password = process.env[args.loginPasswordEnv];
  if (!username || !password) return '';
  if (!args.apiBase) throw new Error('--api-base is required for runner login');
  const res = await fetch(`${args.apiBase.replace(/\/$/, '')}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`runner login failed HTTP ${res.status}: ${text.slice(0, 300)}`);
  const data = text ? JSON.parse(text) : {};
  const token = data.token || data.accessToken || data.access_token;
  if (!token) throw new Error('runner login response did not include token');
  return token;
}

function syncCommand(args) {
  const command = ['node', 'scripts/ops/bug-intake-sync-from-api.mjs', '--output-dir', args.syncOutputDir];
  if (args.fixtureJson) command.push('--fixture-json', args.fixtureJson);
  else {
    command.push('--api-base', args.apiBase || '');
    command.push('--token-env', args.childTokenEnv);
  }
  if (args.applyQueue && !args.dryRun) command.push('--apply-queue');
  else command.push('--dry-run');
  return command;
}

function listRunnableBugTasks(args) {
  const tasks = readJson(TASKS_FILE, []);
  const allowAgents = args.agents ? new Set(String(args.agents).split(',').map((s) => s.trim()).filter(Boolean)) : null;
  return tasks
    .filter((task) => task.source === 'bug-intake')
    .filter((task) => RUNNABLE_STATUSES.has(task.status))
    .filter((task) => !allowAgents || allowAgents.has(task.agent))
    .slice(0, args.maxTasks);
}

function findTask(taskId) {
  return readJson(TASKS_FILE, []).find((task) => task.task_id === taskId) || null;
}

function workerCommand(task, args) {
  const command = ['node', 'scripts/ops/agent-worker.mjs', '--agent', task.agent, '--claim-next', '--task-id', task.task_id];
  if (args.dryRun) command.push('--dry-run');
  else command.push('--approval-token', args.approvalToken);
  return command;
}

function writebackCommand(task, finalTask, args) {
  const bugNo = finalTask?.source_bug_no || task.source_bug_no;
  const resultFile = finalTask?.result_file || task.result_file;
  if (!bugNo || !resultFile || !args.apiBase) return null;
  const command = [
    'node',
    'scripts/ops/bug-agent-result-to-report.mjs',
    '--bug-no',
    bugNo,
    '--task-id',
    task.task_id,
    '--agent',
    task.agent,
    '--result-file',
    resultFile,
    '--api-base',
    args.apiBase,
  ];
  command.push('--token-env', args.childTokenEnv);
  command.push(args.dryRun ? '--dry-run' : '--apply');
  return command;
}

function pushCommand(args) {
  return ['git', 'push', 'origin', 'main'];
}

function canPush(args, workerRuns) {
  if (args.dryRun || !args.pushAfterSuccess) return false;
  if (!workerRuns.length) return false;
  return workerRuns.every((item) => item.finalTask && FINISHED_STATUSES.has(item.finalTask.status) && item.finalTask.status === 'COMPLETED_MERGED');
}

function runPushIfReady(args, workerRuns) {
  if (!canPush(args, workerRuns)) {
    return {
      skipped: true,
      reason: args.pushAfterSuccess ? 'no successful COMPLETED_MERGED worker run in this cycle' : 'push-after-success disabled',
    };
  }
  const branch = safeGit(['branch', '--show-current'], args.mainRoot);
  const status = safeGit(['status', '--short'], args.mainRoot);
  if (!branch.ok || branch.output !== 'main') return { skipped: true, reason: `main root is not on main: ${branch.output || branch.output}` };
  if (!status.ok || status.output !== '') return { skipped: true, reason: `main root dirty: ${status.output}` };
  return run(pushCommand(args), { cwd: args.mainRoot });
}

function summaryMarkdown(summary) {
  return `# Bug Intake Local Runner Summary

| Field | Value |
| --- | --- |
| Decision | ${summary.decision} |
| Dry run | ${summary.dryRun ? 'Yes' : 'No'} |
| Cycle | ${summary.cycle} |
| Synced | ${summary.sync.status === 0 ? 'PASS' : 'FAIL'} |
| Queue apply | ${summary.queueApply} |
| Runnable tasks | ${summary.runnableTasks.length} |
| Worker runs | ${summary.workerRuns.length} |
| Push after success | ${summary.pushAfterSuccess ? 'Enabled' : 'Disabled'} |
| Push result | ${summary.push?.skipped ? `Skipped: ${summary.push.reason}` : `Exit ${summary.push?.status}`} |

## Runnable Tasks

${summary.runnableTasks.map((task) => `- ${task.task_id} -> ${task.agent}`).join('\n') || '- None'}

## Worker Runs

${summary.workerRuns.map((item) => `- ${item.task.task_id}: worker=${item.worker.status}, final=${item.finalTask?.status || 'unknown'}, writeback=${item.writeback?.status ?? 'skipped'}`).join('\n') || '- None'}

## Safety

- Codex CLI real execution: ${summary.dryRun ? 'No' : 'Yes, approval token required'}
- Production push: ${summary.push?.skipped ? 'No' : 'Yes'}
- Production deploy: triggered only by remote CI/CD after push
- DB write / migration: not performed by this runner
`;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCycle(args, cycle) {
  if (!tokenAvailable(args)) throw new Error('--api-base with --token/--token-env is required unless --fixture-json is used');
  if (!args.dryRun && args.approvalToken !== APPROVAL_TOKEN) throw new Error('real execution requires --approval-token APPROVE_AGENT_EXECUTION');

  const token = await loginToken(args);
  const childEnv = token ? { [args.childTokenEnv]: token } : {};
  const sync = run(syncCommand(args), { tokenEnv: args.tokenEnv, childTokenEnv: args.childTokenEnv, env: childEnv });
  const preWorkerCommit = sync.status === 0 ? commitOpsRuntimeArtifacts(args) : { skipped: true, reason: 'sync failed' };
  const runnableTasks = sync.status === 0 ? listRunnableBugTasks(args) : [];
  const workerRuns = [];

  for (const task of runnableTasks) {
    const worker = run(workerCommand(task, args));
    const finalTask = findTask(task.task_id);
    let writeback = null;
    const wbCommand = writebackCommand(task, finalTask, args);
    if (wbCommand && (!args.dryRun || finalTask?.result_file)) {
      writeback = run(wbCommand, { tokenEnv: args.tokenEnv, childTokenEnv: args.childTokenEnv, env: childEnv });
    }
    workerRuns.push({ task, worker, finalTask, writeback });
  }

  const push = runPushIfReady(args, workerRuns);
  const summary = {
    decision: args.dryRun ? 'BUG_INTAKE_LOCAL_RUNNER_DRY_RUN' : 'BUG_INTAKE_LOCAL_RUNNER_EXECUTED',
    generatedAt: new Date().toISOString(),
    cycle,
    dryRun: args.dryRun,
    queueApply: args.applyQueue && !args.dryRun ? 'applied-approved-only' : 'dry-run-no-queue-write',
    executeApproved: Boolean(args.executeApproved),
    pushAfterSuccess: Boolean(args.pushAfterSuccess),
    sync,
    preWorkerCommit,
    runnableTasks: runnableTasks.map((task) => ({ task_id: task.task_id, agent: task.agent, source_bug_no: task.source_bug_no })),
    workerRuns: workerRuns.map((item) => ({
      task: { task_id: item.task.task_id, agent: item.task.agent, source_bug_no: item.task.source_bug_no },
      worker: { status: item.worker.status, stdout: item.worker.stdout, stderr: item.worker.stderr },
      finalTask: item.finalTask ? { status: item.finalTask.status, result_file: item.finalTask.result_file, baseline_autopilot_exit_code: item.finalTask.baseline_autopilot_exit_code } : null,
      writeback: item.writeback ? { status: item.writeback.status, stdout: item.writeback.stdout, stderr: item.writeback.stderr } : null,
    })),
    push,
    tokenSource: args.fixtureJson ? 'fixture' : args.token ? 'argument' : args.tokenEnv && process.env[args.tokenEnv] ? args.tokenEnv : `${args.loginUserEnv}/${args.loginPasswordEnv}`,
  };
  writeJson(`${args.outputDir}/latest-summary.json`, summary);
  writeMd(`${args.outputDir}/latest-summary.md`, summaryMarkdown(summary));
  console.log(JSON.stringify({
    decision: summary.decision,
    cycle,
    synced: sync.status === 0,
    runnable_tasks: summary.runnableTasks,
    worker_runs: summary.workerRuns.map((item) => ({ task_id: item.task.task_id, worker_status: item.worker.status, final_status: item.finalTask?.status })),
    push: push.skipped ? `skipped: ${push.reason}` : `exit ${push.status}`,
    summary: `${args.outputDir}/latest-summary.md`,
  }, null, 2));
  return summary;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cycles = args.watch ? args.maxCycles : 1;
  for (let cycle = 1; cycle <= cycles; cycle += 1) {
    await runCycle(args, cycle);
    if (args.watch && cycle < cycles) await sleep(args.interval * 1000);
  }
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});
