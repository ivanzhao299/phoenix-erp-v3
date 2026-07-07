#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';

const APPROVAL_TOKEN = 'APPROVE_AGENT_EXECUTION';
const MAIN_ROOT = process.cwd();
const TASKS_FILE = 'docs/ops/agent-queue/tasks.json';
const RUN_DIR = 'docs/ops/runs/bug-intake-local-runner';
const DEFAULT_SYNC_OUTPUT = 'docs/ops/runs/bug-intake-inbox';
const RUNNABLE_STATUSES = new Set(['pending', 'claimed']);
const FINISHED_STATUSES = new Set(['COMPLETED_MERGED', 'completed', 'failed', 'HOLD', 'hold']);
const SUCCESS_STATUSES = new Set(['COMPLETED_MERGED', 'completed']);
const OPS_RUNTIME_PATHS = ['docs/ops/agent-queue/tasks.json', 'docs/ops/runs'];
const NODE_BIN = process.execPath;
const DEFAULT_PATH = '/Users/mac/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
const LOCK_DIR = '/tmp/phoenix-erp-bug-intake-local-runner.lock';
const LOCK_PID_FILE = `${LOCK_DIR}/pid`;

function usage(code = 1) {
  console.log(`Usage:
  node scripts/ops/bug-intake-local-runner.mjs \\
    --api-base https://erp.eggslao.com \\
    [--token-env PHOENIX_ERP_TOKEN | --login-user-env PHOENIX_ERP_RUNNER_USER --login-password-env PHOENIX_ERP_RUNNER_PASS] \\
    [--once | --watch] [--interval 300] [--max-cycles 1] [--max-tasks 3] \\
    [--apply-queue] [--execute-approved --approval-token APPROVE_AGENT_EXECUTION] \\
    [--push-after-success] [--wait-ci-after-push] [--retry-safe-ui-once] \\
    [--auto-unblock-dirty-worktrees | --no-auto-unblock-dirty-worktrees] \\
    [--skip-blocked | --no-skip-blocked] [--dry-run]

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
    autoUnblockDirtyWorktrees: true,
    skipBlocked: true,
    maxCandidateTasks: 0,
    childTimeoutMs: 180000,
    fetchTimeoutMs: 45000,
  };
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  let explicitDryRun = false;
  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (['--dry-run', '--once', '--watch', '--apply-queue', '--execute-approved', '--push-after-success', '--wait-ci-after-push', '--retry-safe-ui-once', '--auto-unblock-dirty-worktrees', '--skip-blocked'].includes(arg)) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      args[key] = true;
      if (arg === '--dry-run') explicitDryRun = true;
      continue;
    }
    if (arg === '--no-auto-unblock-dirty-worktrees') {
      args.autoUnblockDirtyWorktrees = false;
      continue;
    }
    if (arg === '--no-skip-blocked') {
      args.skipBlocked = false;
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
  args.maxCandidateTasks = Number.parseInt(args.maxCandidateTasks, 10) || Math.max(args.maxTasks * 8, 25);
  args.childTimeoutMs = Number.parseInt(args.childTimeoutMs, 10) || 180000;
  args.fetchTimeoutMs = Number.parseInt(args.fetchTimeoutMs, 10) || 45000;
  if (args.executeApproved && args.approvalToken === APPROVAL_TOKEN && !explicitDryRun) args.dryRun = false;
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
    env: { ...process.env, PATH: process.env.PATH || DEFAULT_PATH, ...(options.env || {}) },
    timeout: Number(options.timeoutMs || options.childTimeoutMs || 180000),
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
    signal: result.signal || null,
    timedOut: result.error?.code === 'ETIMEDOUT',
    stdout: redact(result.stdout || '').slice(-12000),
    stderr: redact(result.stderr || '').slice(-12000),
  };
}

function pidAlive(pid) {
  const parsed = Number(pid);
  if (!Number.isInteger(parsed) || parsed <= 0) return false;
  try {
    process.kill(parsed, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireRunnerLock() {
  try {
    mkdirSync(LOCK_DIR);
    writeFileSync(LOCK_PID_FILE, `${process.pid}\n`);
    return { acquired: true };
  } catch (error) {
    const existingPid = existsSync(LOCK_PID_FILE) ? readFileSync(LOCK_PID_FILE, 'utf8').trim() : '';
    if (existingPid && pidAlive(existingPid)) {
      return { acquired: false, reason: `another bug-intake runner is active: pid ${existingPid}` };
    }
    rmSync(LOCK_DIR, { recursive: true, force: true });
    mkdirSync(LOCK_DIR);
    writeFileSync(LOCK_PID_FILE, `${process.pid}\n`);
    return { acquired: true, recoveredStale: true };
  }
}

function releaseRunnerLock() {
  const existingPid = existsSync(LOCK_PID_FILE) ? readFileSync(LOCK_PID_FILE, 'utf8').trim() : '';
  if (String(process.pid) === existingPid) rmSync(LOCK_DIR, { recursive: true, force: true });
}

function activeAgentProcesses() {
  const result = spawnSync('ps', ['-axo', 'pid=,command='], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, PATH: process.env.PATH || DEFAULT_PATH },
    timeout: 10000,
  });
  if ((result.status ?? 1) !== 0) return [];
  return (result.stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.+)$/);
      return match ? { pid: Number(match[1]), command: match[2] } : null;
    })
    .filter(Boolean)
    .filter((item) => item.pid !== process.pid)
    .filter((item) => (
      item.command.includes('codex exec -C /Users/mac/phoenix-erp-worktrees/') ||
      item.command.includes('scripts/ops/agent-worker.mjs') ||
      item.command.includes('scripts/ops/run-agent-task.mjs')
    ));
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.fetchTimeoutMs);
  const res = await fetch(`${args.apiBase.replace(/\/$/, '')}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
  const text = await res.text();
  if (!res.ok) throw new Error(`runner login failed HTTP ${res.status}: ${text.slice(0, 300)}`);
  const data = text ? JSON.parse(text) : {};
  const token = data.token || data.accessToken || data.access_token;
  if (!token) throw new Error('runner login response did not include token');
  return token;
}

function syncCommand(args) {
  const command = [NODE_BIN, 'scripts/ops/bug-intake-sync-from-api.mjs', '--output-dir', args.syncOutputDir, '--fetch-timeout-ms', String(args.fetchTimeoutMs)];
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
    .slice(0, args.maxCandidateTasks);
}

function findTask(taskId) {
  return readJson(TASKS_FILE, []).find((task) => task.task_id === taskId) || null;
}

function patchTask(taskId, patch) {
  const tasks = readJson(TASKS_FILE, []);
  const index = tasks.findIndex((task) => task.task_id === taskId);
  if (index < 0) return null;
  tasks[index] = { ...tasks[index], ...patch };
  writeJson(TASKS_FILE, tasks);
  return tasks[index];
}

function isFinishedTask(task) {
  return task && FINISHED_STATUSES.has(task.status);
}

function workerCommand(task, args) {
  const command = [NODE_BIN, 'scripts/ops/agent-worker.mjs', '--agent', task.agent, '--claim-next', '--task-id', task.task_id];
  if (args.dryRun) command.push('--dry-run');
  else command.push('--approval-token', args.approvalToken);
  return command;
}

function taskAllowsCode(task) {
  const allowed = JSON.stringify(task.allowed_paths || []).toLowerCase();
  return allowed.includes('apps/api') || allowed.includes('apps/web');
}

function baselineAutopilotCommand(task, args) {
  const command = [
    NODE_BIN,
    'scripts/ops/agent-baseline-autopilot.mjs',
    '--agent',
    task.agent,
    '--branch',
    task.branch,
    '--worktree',
    task.worktree,
    '--max-retries',
    '3',
  ];
  if (taskAllowsCode(task)) command.push('--allow-code');
  command.push(args.dryRun ? '--dry-run' : '--yes');
  return command;
}

function gitStatusShort(cwd) {
  if (!cwd || !existsSync(cwd)) return { ok: false, output: 'worktree does not exist' };
  return safeGit(['status', '--short'], cwd);
}

function worktreeClean(cwd) {
  const status = gitStatusShort(cwd);
  return status.ok && status.output.trim() === '';
}

function unblockDirtyWorktree(task, args) {
  const before = gitStatusShort(task.worktree);
  if (!before.ok) {
    return {
      task_id: task.task_id,
      agent: task.agent,
      status: 'BLOCKED',
      reason: before.output,
      before: before.output,
      command: null,
      result: null,
    };
  }
  if (!before.output.trim()) {
    return {
      task_id: task.task_id,
      agent: task.agent,
      status: 'CLEAN',
      reason: '',
      before: '',
      command: null,
      result: null,
    };
  }
  const command = baselineAutopilotCommand(task, args);
  if (!args.autoUnblockDirtyWorktrees) {
    return {
      task_id: task.task_id,
      agent: task.agent,
      status: 'BLOCKED',
      reason: 'dirty worktree and auto-unblock disabled',
      before: before.output,
      command,
      result: null,
    };
  }
  if (args.dryRun) {
    return {
      task_id: task.task_id,
      agent: task.agent,
      status: 'WOULD_UNBLOCK',
      reason: 'dry-run would run baseline autopilot before worker execution',
      before: before.output,
      command,
      result: null,
    };
  }
  const result = run(command, { cwd: args.mainRoot, timeoutMs: args.childTimeoutMs });
  let abort = null;
  let after = gitStatusShort(task.worktree);
  let clean = after.ok && after.output.trim() === '';
  if (result.status !== 0 && !clean) {
    abort = safeGit(['rebase', '--abort'], task.worktree);
    after = gitStatusShort(task.worktree);
    clean = after.ok && after.output.trim() === '';
  }
  return {
    task_id: task.task_id,
    agent: task.agent,
    status: result.status === 0 && clean ? 'UNBLOCKED' : 'BLOCKED',
    reason: result.status === 0 && clean ? '' : `baseline autopilot exit ${result.status}; remaining status: ${after.output || '<none>'}`,
    before: before.output,
    after: after.ok ? after.output : after.output,
    abortRebase: abort,
    command,
    result: { status: result.status, stdout: result.stdout, stderr: result.stderr },
  };
}

function isSafeRetryTask(task) {
  if (task.source !== 'bug-intake') return false;
  if (!['A4-Frontend-UAT-Smoke', 'A1-CI-Runtime-Gate'].includes(task.agent)) return false;
  const forbidden = JSON.stringify([task.title, task.allowed_paths, task.forbidden_paths, task.risk_level]).toLowerCase();
  return !/migration|db write|database|deploy|push|apps\/api|rbac|datascope|auth|permission|finance|chanjet/.test(forbidden);
}

function shouldRetryWorker(task, worker, finalTask, args) {
  if (!args.retrySafeUiOnce || args.dryRun) return false;
  if (!isSafeRetryTask(task)) return false;
  if ((worker.status ?? 1) !== 0) return true;
  return finalTask && ['HOLD', 'hold', 'failed'].includes(finalTask.status);
}

function writebackCommand(task, finalTask, args) {
  const bugNo = finalTask?.source_bug_no || task.source_bug_no;
  const resultFile = finalTask?.result_file || task.result_file;
  if (!bugNo || !resultFile || !args.apiBase) return null;
  const command = [
    NODE_BIN,
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
  return ['git', 'push', 'origin', 'HEAD:main'];
}

function currentHead(cwd) {
  const sha = safeGit(['rev-parse', 'HEAD'], cwd);
  return sha.ok ? sha.output : '';
}

function canPush(args, workerRuns) {
  if (args.dryRun || !args.pushAfterSuccess) return false;
  if (!workerRuns.length) return false;
  return workerRuns.every((item) => item.finalTask && FINISHED_STATUSES.has(item.finalTask.status) && SUCCESS_STATUSES.has(item.finalTask.status));
}

function runPushIfReady(args, workerRuns) {
  if (!canPush(args, workerRuns)) {
    return {
      skipped: true,
      reason: args.pushAfterSuccess ? 'no successful completed worker run in this cycle' : 'push-after-success disabled',
    };
  }
  const branch = safeGit(['branch', '--show-current'], args.mainRoot);
  const status = safeGit(['status', '--short'], args.mainRoot);
  if (!branch.ok) return { skipped: true, reason: `cannot read branch: ${branch.output}` };
  if (!status.ok || status.output !== '') return { skipped: true, reason: `main root dirty: ${status.output}` };
  return run(pushCommand(args), { cwd: args.mainRoot });
}

async function waitForGithubActionsIfRequested(args, push) {
  if (!args.waitCiAfterPush) return { skipped: true, reason: 'wait-ci-after-push disabled' };
  if (args.dryRun) return { skipped: true, reason: 'dry-run' };
  if (push?.skipped || push?.status !== 0) return { skipped: true, reason: 'push did not complete successfully' };
  const ghCheck = spawnSync('gh', ['--version'], { cwd: args.mainRoot, encoding: 'utf8' });
  if ((ghCheck.status ?? 1) !== 0) return { skipped: true, reason: 'gh CLI unavailable' };
  const headSha = currentHead(args.mainRoot);
  if (!headSha) return { skipped: true, reason: 'cannot resolve HEAD sha' };
  const startedAt = Date.now();
  const timeoutMs = Number(args.ciTimeoutMs || 900000);
  const pollMs = Number(args.ciPollMs || 15000);
  let lastRuns = [];
  while (Date.now() - startedAt < timeoutMs) {
    const list = spawnSync('gh', [
      'run',
      'list',
      '--branch',
      'main',
      '--limit',
      '20',
      '--json',
      'headSha,status,conclusion,name,url',
    ], { cwd: args.mainRoot, encoding: 'utf8' });
    if ((list.status ?? 1) !== 0) {
      return { skipped: false, ok: false, step: 'gh run list', error: list.stderr || list.stdout };
    }
    lastRuns = JSON.parse(list.stdout || '[]').filter((run) => run.headSha === headSha);
    if (lastRuns.length > 0 && lastRuns.every((run) => run.status === 'completed')) {
      const failed = lastRuns.filter((run) => run.conclusion !== 'success');
      return {
        skipped: false,
        ok: failed.length === 0,
        headSha,
        runs: lastRuns,
        conclusion: failed.length === 0 ? 'PASS' : 'HOLD',
      };
    }
    await sleep(pollMs);
  }
  return {
    skipped: false,
    ok: false,
    headSha,
    runs: lastRuns,
    conclusion: 'HOLD',
    error: `CI wait timed out after ${timeoutMs}ms`,
  };
}

async function postAgentResult(args, childEnv, bugNo, payload) {
  const token = childEnv[args.childTokenEnv] || process.env[args.tokenEnv] || args.token || '';
  if (!args.apiBase || !token || !bugNo) return { skipped: true, reason: 'missing api-base/token/bug-no' };
  const endpoint = `${args.apiBase.replace(/\/$/, '')}/api/bug-intake/reports/${encodeURIComponent(bugNo)}/agent-result`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) return { skipped: false, ok: false, status: res.status, body: text.slice(0, 1000) };
  return { skipped: false, ok: true, status: res.status, body: text.slice(0, 1000) };
}

async function writebackRunnerLifecycle(args, childEnv, summary) {
  if (args.dryRun) return { skipped: true, reason: 'dry-run' };
  const bugNos = [...new Set(summary.workerRuns.map((item) => item.task.source_bug_no).filter(Boolean))];
  const pushOk = !summary.push?.skipped && summary.push?.status === 0;
  const ciOk = summary.ci?.skipped || summary.ci?.ok === true;
  const conclusion = pushOk && ciOk ? 'PASS WITH CONDITIONS' : 'HOLD';
  const payload = {
    taskId: `LOCAL-RUNNER-${summary.generatedAt.replace(/[-:.TZ]/g, '').slice(0, 14)}`,
    agent: 'BugIntakeLocalRunner',
    conclusion,
    resultFile: `${args.outputDir}/latest-summary.md`,
    commitHash: summary.headSha || '',
    changedFiles: [],
    validationResults: {
      sync: summary.sync.status === 0 ? 'PASS' : 'FAIL',
      workerRuns: summary.workerRuns.map((item) => ({
        taskId: item.task.task_id,
        agent: item.task.agent,
        finalStatus: item.finalTask?.status || 'unknown',
        writebackStatus: item.writeback?.status ?? 'skipped',
      })),
      push: summary.push?.skipped ? `SKIPPED: ${summary.push.reason}` : (summary.push?.status === 0 ? 'PASS' : 'FAIL'),
      ci: summary.ci?.skipped ? `SKIPPED: ${summary.ci.reason}` : (summary.ci?.ok ? 'PASS' : 'HOLD'),
    },
    summary: summaryMarkdown(summary).slice(0, 3900),
    nextAction: conclusion === 'HOLD' ? 'Review runner lifecycle HOLD reason before closing bug.' : 'Business owner validates the fix in production.',
  };
  const results = [];
  for (const bugNo of bugNos) {
    results.push({ bugNo, ...(await postAgentResult(args, childEnv, bugNo, payload)) });
  }
  return { skipped: false, results };
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
| Blocked/skipped tasks | ${summary.blockedTasks?.length || 0} |
| Auto-unblock dirty worktrees | ${summary.autoUnblockDirtyWorktrees ? 'Enabled' : 'Disabled'} |
| Skip blocked tasks | ${summary.skipBlocked ? 'Enabled' : 'Disabled'} |
| Safe retry | ${summary.retrySafeUiOnce ? 'Enabled for A4/A1 low-risk tasks' : 'Disabled'} |
| Push after success | ${summary.pushAfterSuccess ? 'Enabled' : 'Disabled'} |
| Push result | ${summary.push?.skipped ? `Skipped: ${summary.push.reason}` : `Exit ${summary.push?.status}`} |
| CI wait | ${summary.ci?.skipped ? `Skipped: ${summary.ci.reason}` : (summary.ci?.ok ? 'PASS' : 'HOLD')} |
| Lifecycle writeback | ${summary.lifecycleWriteback?.skipped ? `Skipped: ${summary.lifecycleWriteback.reason}` : 'Attempted'} |

## Runnable Tasks

${summary.runnableTasks.map((task) => `- ${task.task_id} -> ${task.agent}`).join('\n') || '- None'}

## Worker Runs

${summary.workerRuns.map((item) => `- ${item.task.task_id}: worker=${item.worker.status}, final=${item.finalTask?.status || 'unknown'}, writeback=${item.writeback?.status ?? 'skipped'}, retries=${item.retryRuns?.length || 0}`).join('\n') || '- None'}

## Blocked / Skipped Tasks

${(summary.blockedTasks || []).map((item) => `- ${item.task_id}: ${item.agent} -> ${item.status}${item.reason ? ` (${item.reason})` : ''}`).join('\n') || '- None'}

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

function crashSummary(args, cycle, error) {
  const summary = {
    decision: 'BUG_INTAKE_LOCAL_RUNNER_HOLD',
    generatedAt: new Date().toISOString(),
    cycle,
    dryRun: args.dryRun,
    queueApply: args.applyQueue && !args.dryRun ? 'applied-approved-only' : 'dry-run-no-queue-write',
    executeApproved: Boolean(args.executeApproved),
    pushAfterSuccess: Boolean(args.pushAfterSuccess),
    retrySafeUiOnce: Boolean(args.retrySafeUiOnce),
    autoUnblockDirtyWorktrees: Boolean(args.autoUnblockDirtyWorktrees),
    skipBlocked: Boolean(args.skipBlocked),
    sync: { status: 1, stdout: '', stderr: error.message },
    preWorkerCommit: { skipped: true, reason: 'cycle failed before pre-worker commit completed' },
    candidateTasks: [],
    blockedTasks: [{
      task_id: 'RUNNER-CYCLE',
      agent: 'BugIntakeLocalRunner',
      status: 'HOLD',
      reason: error.message,
    }],
    runnableTasks: [],
    workerRuns: [],
    push: { skipped: true, reason: 'cycle failed before push gate' },
    ci: { skipped: true, reason: 'cycle failed before CI wait' },
    headSha: currentHead(args.mainRoot),
    tokenSource: args.fixtureJson ? 'fixture' : args.token ? 'argument' : args.tokenEnv && process.env[args.tokenEnv] ? args.tokenEnv : `${args.loginUserEnv}/${args.loginPasswordEnv}`,
    lifecycleWriteback: { skipped: true, reason: 'cycle failed before lifecycle writeback' },
  };
  writeJson(`${args.outputDir}/latest-summary.json`, summary);
  writeMd(`${args.outputDir}/latest-summary.md`, summaryMarkdown(summary));
  return summary;
}

async function runCycle(args, cycle) {
  if (!tokenAvailable(args)) throw new Error('--api-base with --token/--token-env is required unless --fixture-json is used');
  if (!args.dryRun && args.approvalToken !== APPROVAL_TOKEN) throw new Error('real execution requires --approval-token APPROVE_AGENT_EXECUTION');

  const token = await loginToken(args);
  const childEnv = token ? { [args.childTokenEnv]: token } : {};
  const sync = run(syncCommand(args), { tokenEnv: args.tokenEnv, childTokenEnv: args.childTokenEnv, env: childEnv });
  const preWorkerCommit = sync.status === 0 ? commitOpsRuntimeArtifacts(args) : { skipped: true, reason: 'sync failed' };
  const candidateTasks = sync.status === 0 ? listRunnableBugTasks(args) : [];
  const runnableTasks = [];
  const blockedTasks = [];
  const workerRuns = [];
  const preExistingProcesses = activeAgentProcesses();
  if (preExistingProcesses.length > 0) {
    blockedTasks.push({
      task_id: 'RUNNER-PREFLIGHT',
      agent: 'BugIntakeLocalRunner',
      status: 'BLOCKED',
      reason: 'active agent child process exists; refusing to start another task',
      processes: preExistingProcesses,
    });
  }

  for (const task of preExistingProcesses.length > 0 ? [] : candidateTasks) {
    if (workerRuns.length >= args.maxTasks) break;
    const unblock = unblockDirtyWorktree(task, args);
    if (unblock.status === 'BLOCKED' || (unblock.status === 'WOULD_UNBLOCK' && args.dryRun)) {
      blockedTasks.push(unblock);
      if (args.skipBlocked) continue;
      break;
    }
    runnableTasks.push(task);
    let worker = run(workerCommand(task, args));
    let finalTask = findTask(task.task_id);
    const retryRuns = [];
    if (shouldRetryWorker(task, worker, finalTask, args)) {
      retryRuns.push({ reason: 'safe-ui-once retry', firstWorkerStatus: worker.status, firstFinalStatus: finalTask?.status || 'unknown' });
      worker = run(workerCommand(task, args));
      finalTask = findTask(task.task_id);
    }
    if (!args.dryRun && !isFinishedTask(finalTask)) {
      finalTask = patchTask(task.task_id, {
        status: 'HOLD',
        completed_at: new Date().toISOString(),
        reason: `worker returned but task did not reach terminal status; worker exit=${worker.status}; observed=${finalTask?.status || 'missing'}`,
      }) || finalTask;
    }
    let writeback = null;
    const wbCommand = writebackCommand(task, finalTask, args);
    if (wbCommand && (!args.dryRun || finalTask?.result_file)) {
      writeback = run(wbCommand, { tokenEnv: args.tokenEnv, childTokenEnv: args.childTokenEnv, env: childEnv });
    }
    const postWorkerCommit = commitOpsRuntimeArtifacts(args);
    workerRuns.push({ task, worker, finalTask, writeback, retryRuns });
    const leftovers = activeAgentProcesses();
    if (!args.dryRun && finalTask && !SUCCESS_STATUSES.has(finalTask.status)) {
      blockedTasks.push({
        task_id: task.task_id,
        agent: task.agent,
        status: 'BLOCKED',
        reason: `worker reached non-success terminal status ${finalTask.status}; stop dispatching more tasks in this cycle`,
      });
      break;
    }
    if (leftovers.length > 0) {
      blockedTasks.push({
        task_id: task.task_id,
        agent: task.agent,
        status: 'BLOCKED',
        reason: 'worker returned while agent child process is still active; stop dispatching more tasks in this cycle',
        processes: leftovers,
      });
      workerRuns[workerRuns.length - 1].activeChildProcesses = leftovers;
      break;
    }
    if (!postWorkerCommit.skipped && postWorkerCommit.ok === false) {
      workerRuns[workerRuns.length - 1].postWorkerCommit = postWorkerCommit;
      break;
    }
    workerRuns[workerRuns.length - 1].postWorkerCommit = postWorkerCommit;
  }

  const push = runPushIfReady(args, workerRuns);
  const ci = await waitForGithubActionsIfRequested(args, push);
  const summary = {
    decision: args.dryRun ? 'BUG_INTAKE_LOCAL_RUNNER_DRY_RUN' : 'BUG_INTAKE_LOCAL_RUNNER_EXECUTED',
    generatedAt: new Date().toISOString(),
    cycle,
    dryRun: args.dryRun,
    queueApply: args.applyQueue && !args.dryRun ? 'applied-approved-only' : 'dry-run-no-queue-write',
    executeApproved: Boolean(args.executeApproved),
    pushAfterSuccess: Boolean(args.pushAfterSuccess),
    retrySafeUiOnce: Boolean(args.retrySafeUiOnce),
    autoUnblockDirtyWorktrees: Boolean(args.autoUnblockDirtyWorktrees),
    skipBlocked: Boolean(args.skipBlocked),
    sync,
    preWorkerCommit,
    candidateTasks: candidateTasks.map((task) => ({ task_id: task.task_id, agent: task.agent, source_bug_no: task.source_bug_no })),
    blockedTasks,
    runnableTasks: runnableTasks.map((task) => ({ task_id: task.task_id, agent: task.agent, source_bug_no: task.source_bug_no })),
    workerRuns: workerRuns.map((item) => ({
      task: { task_id: item.task.task_id, agent: item.task.agent, source_bug_no: item.task.source_bug_no },
      worker: { status: item.worker.status, stdout: item.worker.stdout, stderr: item.worker.stderr },
      finalTask: item.finalTask ? { status: item.finalTask.status, result_file: item.finalTask.result_file, baseline_autopilot_exit_code: item.finalTask.baseline_autopilot_exit_code } : null,
      writeback: item.writeback ? { status: item.writeback.status, stdout: item.writeback.stdout, stderr: item.writeback.stderr } : null,
      retryRuns: item.retryRuns || [],
      postWorkerCommit: item.postWorkerCommit ?? null,
      activeChildProcesses: item.activeChildProcesses || [],
    })),
    push,
    ci,
    headSha: currentHead(args.mainRoot),
    tokenSource: args.fixtureJson ? 'fixture' : args.token ? 'argument' : args.tokenEnv && process.env[args.tokenEnv] ? args.tokenEnv : `${args.loginUserEnv}/${args.loginPasswordEnv}`,
  };
  writeJson(`${args.outputDir}/latest-summary.json`, summary);
  writeMd(`${args.outputDir}/latest-summary.md`, summaryMarkdown(summary));
  try {
    summary.lifecycleWriteback = await writebackRunnerLifecycle(args, childEnv, summary);
  } catch (error) {
    summary.lifecycleWriteback = { skipped: false, ok: false, error: error.message };
  }
  writeJson(`${args.outputDir}/latest-summary.json`, summary);
  writeMd(`${args.outputDir}/latest-summary.md`, summaryMarkdown(summary));
  console.log(JSON.stringify({
    decision: summary.decision,
    cycle,
    synced: sync.status === 0,
    runnable_tasks: summary.runnableTasks,
    blocked_tasks: summary.blockedTasks.map((item) => ({ task_id: item.task_id, agent: item.agent, status: item.status, reason: item.reason })),
    worker_runs: summary.workerRuns.map((item) => ({ task_id: item.task.task_id, worker_status: item.worker.status, final_status: item.finalTask?.status })),
    push: push.skipped ? `skipped: ${push.reason}` : `exit ${push.status}`,
    summary: `${args.outputDir}/latest-summary.md`,
  }, null, 2));
  return summary;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const lock = acquireRunnerLock();
  if (!lock.acquired) throw new Error(lock.reason);
  const cycles = args.watch ? args.maxCycles : 1;
  try {
    for (let cycle = 1; cycle <= cycles; cycle += 1) {
      try {
        await runCycle(args, cycle);
      } catch (error) {
        crashSummary(args, cycle, error);
        console.error(`ERROR: ${error.message}`);
        if (!args.watch) throw error;
      }
      if (args.watch && cycle < cycles) await sleep(args.interval * 1000);
    }
  } finally {
    releaseRunnerLock();
  }
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});
