#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { evaluateBugReleaseEvidence } from './bug-intake-evidence-gate.mjs';

const APPROVAL_TOKEN = 'APPROVE_AGENT_EXECUTION';
const MAIN_ROOT = process.cwd();
const TASKS_FILE = 'docs/ops/agent-queue/tasks.json';
const RUN_DIR = 'docs/ops/runs/bug-intake-local-runner';
const DEFAULT_SYNC_OUTPUT = 'docs/ops/runs/bug-intake-inbox';
const RUNNABLE_STATUSES = new Set(['pending', 'claimed']);
const LEASE_STATUSES = new Set(['running', 'claimed']);
const FINISHED_STATUSES = new Set(['IMPLEMENTATION_COMPLETED', 'COMPLETED_MERGED', 'VALIDATION_COMPLETED', 'SKIPPED_NOT_APPLICABLE', 'completed', 'failed', 'HOLD', 'hold']);
const SUCCESS_STATUSES = new Set(['IMPLEMENTATION_COMPLETED', 'COMPLETED_MERGED', 'VALIDATION_COMPLETED', 'SKIPPED_NOT_APPLICABLE']);
const DEPENDENCY_SUCCESS_STATUSES = new Set([...SUCCESS_STATUSES, 'completed']);
const DEPENDENCY_FAILURE_STATUSES = new Set(['HOLD', 'hold', 'failed']);
const REMOTE_RUNNING_REPAIR_STATUSES = new Set(['AGENT_RUNNING', 'AGENT_APPROVED']);
const OPS_RUNTIME_PATHS = ['docs/ops/agent-queue/tasks.json', 'docs/ops/runs'];
const NODE_BIN = process.execPath;
const DEFAULT_PATH = '/Users/mac/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
const LOCK_DIR = '/tmp/phoenix-erp-bug-intake-local-runner.lock';
const LOCK_PID_FILE = `${LOCK_DIR}/pid`;
const TOKEN_CACHE_FILE = '/Users/mac/.phoenix-erp/bug-intake-runner-token.json';

function usage(code = 1) {
  console.log(`Usage:
  node scripts/ops/bug-intake-local-runner.mjs \\
    --api-base https://erp.eggslao.com \\
    [--token-env PHOENIX_ERP_TOKEN | --login-user-env PHOENIX_ERP_RUNNER_USER --login-password-env PHOENIX_ERP_RUNNER_PASS] \\
    [--once | --watch] [--interval 300] [--max-cycles 1] [--max-tasks 3] \\
    [--apply-queue] [--execute-approved --approval-token APPROVE_AGENT_EXECUTION] \\
    [--push-after-success] [--wait-ci-after-push] [--retry-safe-ui-once] \\
    [--auto-unblock-dirty-worktrees | --no-auto-unblock-dirty-worktrees] \\
    [--recover-leases-only] [--quarantine-task-id BUGTASK-...] \\
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
    childTimeoutMs: 900000,
    fetchTimeoutMs: 45000,
    staleLeaseMinutes: 15,
  };
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  let explicitDryRun = false;
  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (['--dry-run', '--once', '--watch', '--apply-queue', '--execute-approved', '--push-after-success', '--wait-ci-after-push', '--production-smoke-after-ci', '--retry-safe-ui-once', '--auto-unblock-dirty-worktrees', '--skip-blocked', '--recover-leases-only'].includes(arg)) {
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
  args.childTimeoutMs = Number.parseInt(args.childTimeoutMs, 10) || 900000;
  args.fetchTimeoutMs = Number.parseInt(args.fetchTimeoutMs, 10) || 45000;
  args.staleLeaseMinutes = Number.parseInt(args.staleLeaseMinutes, 10) || 15;
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
    maxBuffer: 32 * 1024 * 1024,
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

function classifyRunnerFailure(input = {}) {
  const text = [
    input.step,
    input.reason,
    input.error,
    input.stdout,
    input.stderr,
    JSON.stringify(input),
  ].join('\n').toLowerCase();
  const evidence = [];
  const match = (pattern, label) => {
    const ok = pattern.test(text);
    if (ok) evidence.push(label);
    return ok;
  };
  if (match(/timeout|etimedout|timed out|超时/, 'timeout')) {
    return { category: 'RUNNER_TIMEOUT', severity: 'WARNING', auto_recovery: 'recover stale lease then retry next cycle', evidence };
  }
  if (match(/login failed|http 401|http 403|token|unauthorized|forbidden|认证|权限/, 'auth')) {
    return { category: 'RUNNER_AUTH', severity: 'CRITICAL', auto_recovery: 'refresh token cache; require credential check if repeated', evidence };
  }
  if (match(/dirty worktree|rebase|conflict|merge|工作区|冲突/, 'baseline')) {
    return { category: 'BASELINE_SYNC', severity: 'WARNING', auto_recovery: 'baseline autopilot can repair docs/ops artifacts only', evidence };
  }
  if (match(/tsc|typecheck|lint|ci|check failed|build failed/, 'validation')) {
    return { category: 'VALIDATION_FAILURE', severity: 'WARNING', auto_recovery: 'route to A1 and keep bug in HOLD', evidence };
  }
  if (match(/push|deploy|github|gh run|workflow/, 'release')) {
    return { category: 'RELEASE_PIPELINE', severity: 'WARNING', auto_recovery: 'stop before production side effects and require release review', evidence };
  }
  return { category: 'UNKNOWN_RUNNER_FAILURE', severity: 'WARNING', auto_recovery: 'HOLD and require route review', evidence: evidence.length ? evidence : ['no stable failure signature matched'] };
}

function summarizeFailureClassifications(summary) {
  const classes = [];
  if (summary.sync && summary.sync.status !== 0) classes.push(classifyRunnerFailure({ step: 'sync', ...summary.sync }));
  for (const blocked of summary.blockedTasks || []) {
    classes.push(classifyRunnerFailure({ step: 'blockedTask', ...blocked }));
  }
  for (const runItem of summary.workerRuns || []) {
    if (runItem.worker?.status !== 0) {
      classes.push(classifyRunnerFailure({ step: 'worker', task: runItem.task, ...runItem.worker }));
    }
    if (runItem.finalTask && ['HOLD', 'hold', 'failed'].includes(runItem.finalTask.status)) {
      classes.push(classifyRunnerFailure({ step: 'finalTask', task: runItem.task, ...runItem.finalTask }));
    }
    if (runItem.writeback && runItem.writeback.status && runItem.writeback.status !== 0) {
      classes.push(classifyRunnerFailure({ step: 'writeback', task: runItem.task, ...runItem.writeback }));
    }
  }
  if (summary.push && !summary.push.skipped && summary.push.status !== 0) classes.push(classifyRunnerFailure({ step: 'push', ...summary.push }));
  if (summary.ci && !summary.ci.skipped && summary.ci.ok === false) classes.push(classifyRunnerFailure({ step: 'ci', ...summary.ci }));
  const byCategory = {};
  for (const item of classes) byCategory[item.category] = (byCategory[item.category] || 0) + 1;
  return {
    total: classes.length,
    byCategory,
    highestSeverity: classes.some((item) => item.severity === 'CRITICAL') ? 'CRITICAL' : (classes.length ? 'WARNING' : 'INFO'),
    items: classes.slice(0, 20),
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

  const cached = readTokenCache(args, username);
  if (cached) return cached;

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
  writeTokenCache(args, username, token);
  return token;
}

function readTokenCache(args, username) {
  try {
    if (!existsSync(TOKEN_CACHE_FILE)) return '';
    const cache = JSON.parse(readFileSync(TOKEN_CACHE_FILE, 'utf8'));
    if (cache.apiBase !== args.apiBase || cache.username !== username) return '';
    if (!cache.token || Number(cache.expiresAt || 0) <= Date.now() + 60_000) return '';
    return String(cache.token);
  } catch {
    return '';
  }
}

function writeTokenCache(args, username, token) {
  try {
    mkdirSync(path.dirname(TOKEN_CACHE_FILE), { recursive: true });
    writeFileSync(TOKEN_CACHE_FILE, `${JSON.stringify({
      apiBase: args.apiBase,
      username,
      token,
      // Auth token currently reports an 8h window; refresh locally at 6h to avoid edge expiry.
      expiresAt: Date.now() + 6 * 60 * 60 * 1000,
      updatedAt: new Date().toISOString(),
    }, null, 2)}\n`, { mode: 0o600 });
  } catch {
    // Cache failure must not block the runner.
  }
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
  const tasks = reconcileDependencyStates(args);
  const byId = new Map(tasks.map((task) => [task.task_id, task]));
  const allowAgents = args.agents ? new Set(String(args.agents).split(',').map((s) => s.trim()).filter(Boolean)) : null;
  return tasks
    .filter((task) => task.source === 'bug-intake')
    .filter((task) => task.route_active !== false)
    .filter((task) => RUNNABLE_STATUSES.has(task.status))
    .filter((task) => (task.dependencies || []).every((taskId) => DEPENDENCY_SUCCESS_STATUSES.has(byId.get(taskId)?.status)))
    .filter((task) => !allowAgents || allowAgents.has(task.agent))
    .sort((a, b) => {
      const aBug = String(a.source_bug_no || a.task_id || '');
      const bBug = String(b.source_bug_no || b.task_id || '');
      if (aBug !== bBug) return aBug.localeCompare(bBug);
      const priority = {
        'A5-Data-Readiness': 1,
        'A3-Backend-Critical-Path': 2,
        'A4-Frontend-UAT-Smoke': 3,
        'A2-Security-Regression-Gate': 4,
        'A1-CI-Runtime-Gate': 5,
        'A6-Staging-Deploy-Runbook': 6,
        'A7-Final-QA-Gate': 7,
      };
      return (priority[a.agent] || 99) - (priority[b.agent] || 99);
    })
    .slice(0, args.maxCandidateTasks);
}

function reconcileDependencyStates(args) {
  const tasks = readJson(TASKS_FILE, []);
  const byId = new Map(tasks.map((task) => [task.task_id, task]));
  let changed = false;
  for (const task of tasks) {
    if (task.source !== 'bug-intake' || task.route_active === false || !RUNNABLE_STATUSES.has(task.status)) continue;
    const dependencies = Array.isArray(task.dependencies) ? task.dependencies : [];
    if (dependencies.length === 0) continue;
    const missing = dependencies.filter((taskId) => !byId.has(taskId));
    const failed = dependencies.filter((taskId) => DEPENDENCY_FAILURE_STATUSES.has(byId.get(taskId)?.status));
    if (missing.length === 0 && failed.length === 0) continue;
    task.status = 'HOLD';
    task.completed_at = new Date().toISOString();
    task.reason = missing.length
      ? `dependency task missing: ${missing.join(', ')}`
      : `blocked by failed dependency: ${failed.join(', ')}`;
    task.evidence_gate = {
      version: 1,
      agent: task.agent,
      passed: false,
      role: 'dependency',
      terminalStatus: 'HOLD',
      reason: task.reason,
      checkedAt: new Date().toISOString(),
    };
    changed = true;
  }
  if (changed && !args.dryRun) writeJson(TASKS_FILE, tasks);
  return tasks;
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

function integrateImplementationTask(task, finalTask, args) {
  if (args.dryRun || finalTask?.status !== 'IMPLEMENTATION_COMPLETED') {
    return { skipped: true, reason: args.dryRun ? 'dry-run' : 'task has no verified implementation commit', task: finalTask };
  }
  const commitHash = finalTask.implementation_commit || finalTask.evidence_gate?.commitHash || '';
  if (!/^[0-9a-f]{7,40}$/i.test(commitHash)) {
    const next = patchTask(task.task_id, {
      status: 'HOLD',
      reason: 'verified implementation status did not include a valid commit hash',
      completed_at: new Date().toISOString(),
    });
    return { skipped: false, ok: false, reason: 'missing implementation commit hash', task: next || finalTask };
  }
  const status = safeGit(['status', '--short'], args.mainRoot);
  if (!status.ok || status.output.trim()) {
    const next = patchTask(task.task_id, {
      status: 'HOLD',
      reason: `runner root must be clean before implementation integration: ${status.output || 'git status failed'}`,
      completed_at: new Date().toISOString(),
    });
    return { skipped: false, ok: false, reason: 'runner root dirty', task: next || finalTask };
  }
  const alreadyMerged = safeGit(['merge-base', '--is-ancestor', commitHash, 'HEAD'], args.mainRoot);
  let cherryPick = { ok: true, output: 'commit already integrated' };
  if (!alreadyMerged.ok) cherryPick = safeGit(['cherry-pick', commitHash], args.mainRoot);
  if (!cherryPick.ok) {
    safeGit(['cherry-pick', '--abort'], args.mainRoot);
    const next = patchTask(task.task_id, {
      status: 'HOLD',
      reason: `implementation cherry-pick failed and was aborted: ${cherryPick.output}`,
      completed_at: new Date().toISOString(),
    });
    return { skipped: false, ok: false, reason: 'cherry-pick failed', output: cherryPick.output, task: next || finalTask };
  }
  const integratedHead = currentHead(args.mainRoot);
  const next = patchTask(task.task_id, {
    status: 'COMPLETED_MERGED',
    integrated_commit: integratedHead,
    integrated_at: new Date().toISOString(),
    integration_method: alreadyMerged.ok ? 'already-ancestor' : 'cherry-pick-verified-agent-commit',
    completed_at: new Date().toISOString(),
  });
  return {
    skipped: false,
    ok: true,
    sourceCommit: commitHash,
    integratedCommit: integratedHead,
    method: alreadyMerged.ok ? 'already-ancestor' : 'cherry-pick',
    output: cherryPick.output,
    task: next || finalTask,
  };
}

function taskHasActiveProcess(task, processes) {
  return processes.some((processInfo) => processInfo.command.includes(task.task_id));
}

function recoverStaleTaskLeases(args) {
  const tasks = readJson(TASKS_FILE, []);
  const processes = activeAgentProcesses();
  const now = Date.now();
  const staleAfterMs = Math.max(1, Number(args.staleLeaseMinutes || 15)) * 60 * 1000;
  const recovered = [];
  let changed = false;

  const nextTasks = tasks.map((task) => {
    if (task.source !== 'bug-intake') return task;
    if (!LEASE_STATUSES.has(task.status)) return task;
    if (FINISHED_STATUSES.has(task.status)) return task;
    if (taskHasActiveProcess(task, processes)) return task;

    const claimedAt = task.claimed_at ? Date.parse(task.claimed_at) : 0;
    const ageMs = claimedAt ? now - claimedAt : staleAfterMs + 1;
    if (ageMs < staleAfterMs) return task;

    recovered.push({
      task_id: task.task_id,
      agent: task.agent,
      previous_status: task.status,
      claimed_at: task.claimed_at || null,
      age_minutes: Math.round(ageMs / 60000),
    });
    changed = true;
    if (!args.dryRun) {
      const lockFile = path.resolve(args.mainRoot, `docs/ops/agent-queue/locks/${task.task_id}.lock`);
      rmSync(lockFile, { force: true });
    }
    return {
      ...task,
      status: 'pending',
      claimed_by: null,
      claimed_at: null,
      last_recovered_at: new Date(now).toISOString(),
      last_recovery_reason: 'stale bug-intake task lease without active agent process',
      recovery_count: Number(task.recovery_count || 0) + 1,
    };
  });

  if (changed && !args.dryRun) writeJson(TASKS_FILE, nextTasks);
  return {
    recovered,
    active_processes: processes.map((processInfo) => ({ pid: processInfo.pid, command: processInfo.command })),
    wrote_queue: changed && !args.dryRun,
    stale_after_minutes: Math.max(1, Number(args.staleLeaseMinutes || 15)),
  };
}

function isFinishedTask(task) {
  return task && FINISHED_STATUSES.has(task.status);
}

async function waitForAgentChildrenToExit(args, task) {
  const startedAt = Date.now();
  const timeoutMs = Math.max(30000, Number(args.childTimeoutMs || 900000));
  let processes = activeAgentProcesses();
  const firstSeen = processes;
  while (processes.length > 0 && Date.now() - startedAt < timeoutMs) {
    await sleep(5000);
    processes = activeAgentProcesses();
  }
  return {
    task_id: task.task_id,
    waited_ms: Date.now() - startedAt,
    timed_out: processes.length > 0,
    first_seen: firstSeen,
    remaining: processes,
  };
}

function workerCommand(task, args) {
  const command = [NODE_BIN, 'scripts/ops/agent-worker.mjs', '--agent', task.agent, '--claim-next', '--task-id', task.task_id];
  if (args.dryRun) command.push('--dry-run');
  else command.push('--approval-token', args.approvalToken);
  return command;
}

function taskUsesMainRootLocalWorker(task) {
  return task.source === 'bug-intake' && [
    'A1-CI-Runtime-Gate',
    'A2-Security-Regression-Gate',
    'A5-Data-Readiness',
  ].includes(task.agent);
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

function detachedRecoveryReportFile(task) {
  return `docs/ops/runs/${task.task_id}-detached-worker-recovery.md`;
}

function recoverDetachedWorkerResult(task, args, worker, childWait = null) {
  if (args.dryRun) return { recovered: false, reason: 'dry-run' };
  if (!task?.worktree || !task?.branch || !task?.agent) return { recovered: false, reason: 'task missing worktree/branch/agent' };
  if (!existsSync(task.worktree)) return { recovered: false, reason: `worktree does not exist: ${task.worktree}` };

  const before = gitStatusShort(task.worktree);
  const reportFile = detachedRecoveryReportFile(task);
  const conclusion = 'HOLD';
  const text = `# Detached Worker Recovery

| Field | Value |
| --- | --- |
| Task | ${task.task_id} |
| Agent | ${task.agent} |
| Conclusion | ${conclusion} |
| Worker exit | ${worker?.status ?? 'unknown'} |
| Child waited seconds | ${childWait ? Math.round(childWait.waited_ms / 1000) : 'n/a'} |
| Worktree status before recovery | ${before.ok ? (before.output.trim() || 'clean') : before.output} |
| Baseline autopilot | REFUSED: no implementation evidence |

## Safety

- Push: No
- Deploy: No
- Migration: No
- DB write: No

An abnormal/detached worker result is never allowed to merge. The task remains HOLD until a fresh worker run produces an owned business diff, a task report, a commit, and an explicit conclusion.
`;
  writeMd(reportFile, text);

  const patch = {
    status: 'HOLD',
    completed_at: new Date().toISOString(),
    result_file: reportFile,
    baseline_autopilot_exit_code: null,
    reason: `detached worker did not write terminal implementation evidence; merge refused; worker exit=${worker?.status ?? 'unknown'}`,
  };
  return {
    recovered: false,
    result: { status: null, stdout: '', stderr: '', skipped: true, reason: 'strict evidence gate refused baseline merge' },
    reportFile,
    task: patchTask(task.task_id, patch),
  };
}

function gitStatusShort(cwd) {
  if (!cwd || !existsSync(cwd)) return { ok: false, output: 'worktree does not exist' };
  return safeGit(['status', '--short'], cwd);
}

function worktreeClean(cwd) {
  const status = gitStatusShort(cwd);
  return status.ok && status.output.trim() === '';
}

function quarantineDirtyImplementationWorktree(task, args, before) {
  if (!args.autoUnblockDirtyWorktrees || !String(task.worktree || '').includes('/bug-intake-')) return null;
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const safeTaskId = String(task.task_id || 'unknown-task').replace(/[^A-Za-z0-9._-]/g, '-');
  const quarantineRoot = path.join(path.dirname(task.worktree), 'bug-intake-quarantine');
  const quarantinePath = path.join(quarantineRoot, `${safeTaskId}-${timestamp}`);
  const quarantineBranch = `codex/quarantine/${safeTaskId.toLowerCase()}-${timestamp}`;
  const reportFile = `docs/ops/runs/${safeTaskId}-worktree-quarantine.md`;

  if (args.dryRun) {
    return {
      task_id: task.task_id,
      agent: task.agent,
      status: 'WOULD_QUARANTINE',
      reason: 'dry-run would preserve the incomplete worktree and recreate a clean execution slot from origin/main',
      before: before.output,
      quarantinePath,
      quarantineBranch,
      command: null,
      result: null,
    };
  }

  mkdirSync(quarantineRoot, { recursive: true });
  const fetch = safeGit(['fetch', 'origin', 'main'], args.mainRoot);
  if (!fetch.ok) return { task_id: task.task_id, agent: task.agent, status: 'BLOCKED', reason: `cannot refresh origin/main before quarantine: ${fetch.output}`, before: before.output };
  const moved = safeGit(['worktree', 'move', task.worktree, quarantinePath], args.mainRoot);
  if (!moved.ok) return { task_id: task.task_id, agent: task.agent, status: 'BLOCKED', reason: `cannot preserve dirty worktree: ${moved.output}`, before: before.output };
  const renamed = safeGit(['branch', '-m', quarantineBranch], quarantinePath);
  const taskPatch = {
    status: 'HOLD',
    worktree: quarantinePath,
    branch: renamed.ok ? quarantineBranch : task.branch,
    completed_at: new Date().toISOString(),
    reason: renamed.ok
      ? 'incomplete implementation worktree preserved in quarantine; no code merged'
      : `worktree preserved but quarantine branch rename failed: ${renamed.output}`,
    quarantined_at: new Date().toISOString(),
    quarantine_source_worktree: task.worktree,
  };
  const heldTask = patchTask(task.task_id, taskPatch);
  let recreated = { ok: false, output: 'skipped because quarantine branch rename failed' };
  if (renamed.ok) recreated = safeGit(['worktree', 'add', '-b', task.branch, task.worktree, 'origin/main'], args.mainRoot);

  writeMd(reportFile, `# Bug Intake Worktree Quarantine

| Field | Value |
| --- | --- |
| Task | ${task.task_id} |
| Agent | ${task.agent} |
| Original worktree | \`${task.worktree}\` |
| Quarantine worktree | \`${quarantinePath}\` |
| Quarantine branch | \`${renamed.ok ? quarantineBranch : task.branch}\` |
| Clean execution slot recreated | ${recreated.ok ? 'Yes' : 'No'} |

## Preserved status

\`\`\`text
${before.output || '(unknown)'}
\`\`\`

## Decision

HOLD. The incomplete files are preserved for diagnosis. They were not committed, merged, pushed, or deployed. A fresh dedicated worktree is created from \`origin/main\` only when every preservation step succeeds.

${recreated.ok ? '' : `Recreate error: ${recreated.output}`}
`);

  return {
    task_id: task.task_id,
    agent: task.agent,
    status: 'HOLD',
    reason: recreated.ok ? 'incomplete worktree quarantined; clean execution slot recreated' : `quarantine preserved, but clean slot recreation failed: ${recreated.output}`,
    before: before.output,
    quarantinePath,
    quarantineBranch: renamed.ok ? quarantineBranch : task.branch,
    reportFile,
    task: heldTask,
    result: { moved: moved.ok, renamed: renamed.ok, recreated: recreated.ok },
  };
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
  const dirtyLines = before.output.split('\n').map((line) => line.trim()).filter(Boolean);
  const dirtyFiles = dirtyLines.map((line) => line.slice(3).trim()).filter(Boolean);
  const opsOnly = dirtyFiles.length > 0 && dirtyFiles.every((file) => file.startsWith('docs/ops/'));
  const command = opsOnly
    ? ['git', '-C', task.worktree, 'commit', '-m', 'docs(ops): preserve pending agent runtime artifacts']
    : null;
  if (!opsOnly) {
    const quarantine = quarantineDirtyImplementationWorktree(task, args, before);
    if (quarantine) return quarantine;
    return {
      task_id: task.task_id,
      agent: task.agent,
      status: 'BLOCKED',
      reason: 'dirty implementation worktree contains non-ops files; automatic merge/cleanup is forbidden before evidence validation',
      before: before.output,
      command: null,
      result: null,
    };
  }
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
      reason: 'dry-run would locally commit docs/ops runtime artifacts before worker execution',
      before: before.output,
      command,
      result: null,
    };
  }
  const add = run(['git', '-C', task.worktree, 'add', '--', ...dirtyFiles], { cwd: args.mainRoot, timeoutMs: 30000 });
  const result = add.status === 0
    ? run(command, { cwd: args.mainRoot, timeoutMs: 30000 })
    : add;
  const after = gitStatusShort(task.worktree);
  const clean = after.ok && after.output.trim() === '';
  return {
    task_id: task.task_id,
    agent: task.agent,
    status: result.status === 0 && clean ? 'UNBLOCKED' : 'BLOCKED',
    reason: result.status === 0 && clean ? '' : `ops-only local archive exit ${result.status}; remaining status: ${after.output || '<none>'}`,
    before: before.output,
    after: after.ok ? after.output : after.output,
    abortRebase: null,
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

function releaseEvidenceForWorkerRuns(args, workerRuns) {
  const reports = readLatestInboxReports(args);
  const reportByBug = new Map(reports.map((report) => [report.bugNo, report]));
  const tasks = readJson(TASKS_FILE, []);
  const bugNos = [...new Set(workerRuns.map((item) => item.task.source_bug_no).filter(Boolean))];
  return bugNos.map((bugNo) => {
    const report = reportByBug.get(bugNo) || {};
    const localTasks = tasks.filter((task) => task.source === 'bug-intake' && task.source_bug_no === bugNo);
    const selectedAgents = selectedAgentsForReport(report, localTasks);
    return {
      bugNo,
      route: report.route || '',
      evidence: evaluateBugReleaseEvidence(localTasks, selectedAgents),
    };
  });
}

function canPush(args, workerRuns, releaseEvidence) {
  if (args.dryRun || !args.pushAfterSuccess) return false;
  if (!workerRuns.length) return false;
  return releaseEvidence.some((item) => item.evidence.passed);
}

function runPushIfReady(args, workerRuns, releaseEvidence) {
  if (!canPush(args, workerRuns, releaseEvidence)) {
    return {
      skipped: true,
      reason: args.pushAfterSuccess ? 'release evidence is incomplete; refusing push' : 'push-after-success disabled',
    };
  }
  const branch = safeGit(['branch', '--show-current'], args.mainRoot);
  const status = safeGit(['status', '--short'], args.mainRoot);
  if (!branch.ok) return { skipped: true, reason: `cannot read branch: ${branch.output}` };
  if (!status.ok || status.output !== '') return { skipped: true, reason: `main root dirty: ${status.output}` };
  return run(pushCommand(args), { cwd: args.mainRoot });
}

function runProductionSmokeIfReady(args, childEnv, push, ci, releaseEvidence) {
  if (!args.productionSmokeAfterCi) return { skipped: true, reason: 'production-smoke-after-ci disabled' };
  if (args.dryRun) return { skipped: true, reason: 'dry-run' };
  if (push?.skipped || push?.status !== 0) return { skipped: true, reason: 'push did not pass' };
  if (ci?.skipped || ci?.ok !== true) return { skipped: true, reason: 'CI/CD did not pass' };
  const routes = [...new Set(releaseEvidence.filter((item) => item.evidence.passed).map((item) => item.route).filter(Boolean))];
  if (routes.length === 0) return { skipped: true, reason: 'no production route available for release evidence' };
  return run([
    NODE_BIN,
    'scripts/ops/bug-production-route-smoke.mjs',
    '--base-url',
    args.apiBase,
    '--routes',
    routes.join(','),
    '--token-env',
    args.childTokenEnv,
  ], { env: childEnv, tokenEnv: args.childTokenEnv, childTokenEnv: args.childTokenEnv, timeoutMs: 120000 });
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
  const pushOk = !summary.push?.skipped && summary.push?.status === 0;
  const ciOk = !summary.ci?.skipped && summary.ci?.ok === true;
  const smokeOk = !summary.productionSmoke?.skipped && summary.productionSmoke?.status === 0;
  const results = [];
  for (const candidate of summary.releaseEvidence || []) {
    const releaseOk = candidate.evidence?.passed === true;
    const conclusion = releaseOk && pushOk && ciOk && smokeOk ? 'PASS_WITH_CONDITIONS' : 'HOLD';
    const payload = {
      taskId: `LOCAL-RUNNER-${candidate.bugNo}-${summary.generatedAt.replace(/[-:.TZ]/g, '').slice(0, 14)}`,
      agent: 'BugIntakeLocalRunner',
      conclusion,
      resultFile: `${args.outputDir}/latest-summary.md`,
      commitHash: summary.headSha || '',
      changedFiles: candidate.evidence?.changedFiles || [],
      validationResults: {
        sync: summary.sync.status === 0 ? 'PASS' : 'FAIL',
        releaseEvidence: releaseOk ? 'PASS' : 'HOLD',
        releaseEvidenceDetail: candidate.evidence,
        push: pushOk ? 'PASS' : `HOLD: ${summary.push?.reason || summary.push?.status || 'not completed'}`,
        ci: ciOk ? 'PASS' : `HOLD: ${summary.ci?.reason || summary.ci?.conclusion || 'not completed'}`,
        productionSmoke: smokeOk ? 'PASS' : `HOLD: ${summary.productionSmoke?.reason || summary.productionSmoke?.status || 'not completed'}`,
      },
      summary: summaryMarkdown(summary).slice(0, 3900),
      nextAction: conclusion === 'HOLD'
        ? 'Keep the report in HOLD until implementation, CI/CD, and production route evidence all pass.'
        : 'Technical release evidence passed; administrator performs business acceptance before resolving.',
    };
    const bugNo = candidate.bugNo;
    results.push({ bugNo, ...(await postAgentResult(args, childEnv, bugNo, payload)) });
  }
  return { skipped: false, results };
}

function readLatestInboxReports(args) {
  const index = readJson(path.join(args.syncOutputDir, 'latest-index.json'), null);
  const files = Array.isArray(index?.files) ? index.files : [];
  const reports = [];
  for (const file of files) {
    try {
      const report = readJson(file, null);
      if (report?.bugNo) reports.push(report);
    } catch {
      // A malformed downloaded report should not block the resident runner.
    }
  }
  return reports;
}

function selectedAgentsForReport(report, localTasks) {
  const activeTasks = localTasks.filter((task) => task.route_active !== false);
  if (activeTasks.length > 0) {
    const maxRedispatch = Math.max(...activeTasks.map((task) => Number(task.redispatch_count || 0)));
    const currentAgents = [...new Set(activeTasks
      .filter((task) => Number(task.redispatch_count || 0) === maxRedispatch)
      .map((task) => String(task.agent || ''))
      .filter(Boolean))];
    if (currentAgents.length > 0) return currentAgents;
  }
  const selected = report?.repairTaskPayload?.agentPlan?.selected_agents;
  const agents = Array.isArray(selected) ? selected.map((item) => String(item)).filter(Boolean) : [];
  if (agents.length > 0) return agents;
  return [...new Set(localTasks.map((task) => String(task.agent || '')).filter(Boolean))];
}

function bugTaskConclusion(task) {
  if (task.status === 'SKIPPED_NOT_APPLICABLE' && task.evidence_gate?.passed === true) return 'NOT_APPLICABLE';
  if (SUCCESS_STATUSES.has(task.status) && task.evidence_gate?.passed === true) return 'PASS_WITH_CONDITIONS';
  if (['HOLD', 'hold', 'failed'].includes(task.status)) return 'HOLD';
  return 'HOLD';
}

function buildTaskWritebackPayload(task, summary) {
  const conclusion = bugTaskConclusion(task);
  return {
    taskId: task.task_id,
    agent: task.agent,
    conclusion,
    resultFile: task.result_file || `${summary?.outputDir || RUN_DIR}/latest-summary.md`,
    commitHash: task.evidence_gate?.commitHash || task.implementation_commit || '',
    changedFiles: task.evidence_gate?.changedFiles || task.changed_files || [],
    validationResults: {
      localTaskStatus: task.status,
      completedAt: task.completed_at || null,
      baselineAutopilotExitCode: task.baseline_autopilot_exit_code ?? null,
      aggregateBackfill: true,
      evidenceGate: task.evidence_gate || null,
    },
    summary: [
      `Local bug-intake task ${task.task_id} reached ${task.status}.`,
      task.baseline_autopilot_skipped ? `Baseline lifecycle: ${task.baseline_autopilot_skipped}.` : '',
      task.detached_worker_recovery ? `Detached worker recovery: ${task.detached_worker_recovery}.` : '',
    ].filter(Boolean).join('\n'),
    nextAction: conclusion === 'HOLD'
      ? 'Keep bug report in HOLD until the failed local Agent task is reviewed.'
      : conclusion === 'NOT_APPLICABLE'
        ? 'This Agent ownership boundary is not applicable; another implementation Agent must provide the fix.'
        : 'Execution evidence recorded; release and production smoke must pass before business validation.',
  };
}

async function backfillCompletedBugReports(args, childEnv, summary) {
  if (args.dryRun) return { skipped: true, reason: 'dry-run' };
  const reports = readLatestInboxReports(args);
  if (reports.length === 0) return { skipped: true, reason: 'no latest inbox reports' };

  const tasks = readJson(TASKS_FILE, []);
  const tasksByBug = new Map();
  for (const task of tasks) {
    if (task.source !== 'bug-intake' || !task.source_bug_no) continue;
    const list = tasksByBug.get(task.source_bug_no) || [];
    list.push(task);
    tasksByBug.set(task.source_bug_no, list);
  }

  const results = [];
  for (const report of reports) {
    const remoteRepairStatus = String(report.repairTaskStatus || '');
    const remoteStatus = String(report.status || '');
    if (!REMOTE_RUNNING_REPAIR_STATUSES.has(remoteRepairStatus)) continue;
    if (['RESOLVED', 'CLOSED', 'REJECTED'].includes(remoteStatus)) continue;

    const localTasks = tasksByBug.get(report.bugNo) || [];
    if (localTasks.length === 0) {
      results.push({ bugNo: report.bugNo, skipped: true, reason: 'no local bug tasks' });
      continue;
    }

    const selectedAgents = selectedAgentsForReport(report, localTasks);
    const selectedTasks = selectedAgents
      .map((agent) => localTasks.find((task) => task.agent === agent))
      .filter(Boolean);
    const missingAgents = selectedAgents.filter((agent) => !selectedTasks.some((task) => task.agent === agent));
    const unfinishedTasks = selectedTasks.filter((task) => !FINISHED_STATUSES.has(task.status));

    if (missingAgents.length > 0 || unfinishedTasks.length > 0) {
      results.push({
        bugNo: report.bugNo,
        skipped: true,
        reason: 'local selected Agent tasks are not all terminal',
        missingAgents,
        unfinishedTasks: unfinishedTasks.map((task) => ({ task_id: task.task_id, agent: task.agent, status: task.status })),
      });
      continue;
    }

    const posted = [];
    for (const task of selectedTasks) {
      const payload = buildTaskWritebackPayload(task, summary);
      if (!payload.conclusion) continue;
      posted.push({ task_id: task.task_id, agent: task.agent, ...(await postAgentResult(args, childEnv, report.bugNo, payload)) });
    }
    results.push({ bugNo: report.bugNo, remoteRepairStatus, selectedAgents, posted });
  }

  return { skipped: false, reportsChecked: reports.length, results };
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
| Stale leases recovered | ${summary.leaseRecovery?.recovered?.length || 0} |
| Auto-unblock dirty worktrees | ${summary.autoUnblockDirtyWorktrees ? 'Enabled' : 'Disabled'} |
| Skip blocked tasks | ${summary.skipBlocked ? 'Enabled' : 'Disabled'} |
| Safe retry | ${summary.retrySafeUiOnce ? 'Enabled for A4/A1 low-risk tasks' : 'Disabled'} |
| Push after success | ${summary.pushAfterSuccess ? 'Enabled' : 'Disabled'} |
| Push result | ${summary.push?.skipped ? `Skipped: ${summary.push.reason}` : `Exit ${summary.push?.status}`} |
| CI wait | ${summary.ci?.skipped ? `Skipped: ${summary.ci.reason}` : (summary.ci?.ok ? 'PASS' : 'HOLD')} |
| Production route smoke | ${summary.productionSmoke?.skipped ? `Skipped: ${summary.productionSmoke.reason}` : (summary.productionSmoke?.status === 0 ? 'PASS' : 'HOLD')} |
| Release evidence | ${(summary.releaseEvidence || []).map((item) => `${item.bugNo}:${item.evidence?.decision || 'HOLD'}`).join(', ') || 'None'} |
| Lifecycle writeback | ${summary.lifecycleWriteback?.skipped ? `Skipped: ${summary.lifecycleWriteback.reason}` : 'Attempted'} |
| Result backfill | ${summary.resultBackfill?.skipped ? `Skipped: ${summary.resultBackfill.reason}` : `${summary.resultBackfill?.results?.length || 0} report(s) checked`} |
| Failure classifications | ${summary.failureClassification?.total ?? 0} (${summary.failureClassification?.highestSeverity ?? 'INFO'}) |

## Runnable Tasks

${summary.runnableTasks.map((task) => `- ${task.task_id} -> ${task.agent}`).join('\n') || '- None'}

## Worker Runs

${summary.workerRuns.map((item) => `- ${item.task.task_id}: worker=${item.worker.status}, final=${item.finalTask?.status || 'unknown'}, writeback=${item.writeback?.status ?? 'skipped'}, retries=${item.retryRuns?.length || 0}`).join('\n') || '- None'}

## Blocked / Skipped Tasks

${(summary.blockedTasks || []).map((item) => `- ${item.task_id}: ${item.agent} -> ${item.status}${item.reason ? ` (${item.reason})` : ''}`).join('\n') || '- None'}

## Stale Lease Recovery

${(summary.leaseRecovery?.recovered || []).map((item) => `- ${item.task_id}: ${item.agent} ${item.previous_status} -> pending (${item.age_minutes} minutes old)`).join('\n') || '- None'}

## Failure Classification

${(summary.failureClassification?.items || []).map((item) => `- ${item.category} [${item.severity}]: ${item.evidence.join(', ')}; recovery=${item.auto_recovery}`).join('\n') || '- None'}

## Result Backfill

${summary.resultBackfill?.skipped ? `- Skipped: ${summary.resultBackfill.reason}` : ((summary.resultBackfill?.results || []).map((item) => `- ${item.bugNo}: ${item.skipped ? `skipped (${item.reason})` : `posted ${item.posted?.length || 0} Agent result(s)`}`).join('\n') || '- None')}

## Safety

- Codex CLI real execution: ${!summary.dryRun && summary.workerRuns.length > 0 ? 'Yes, approval token required' : 'No'}
- Production push: ${summary.push?.skipped ? 'No' : 'Yes'}
- Production deploy: ${summary.push?.skipped ? 'No' : 'triggered only by remote CI/CD after push'}
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
    leaseRecovery: { recovered: [], active_processes: [], wrote_queue: false, stale_after_minutes: args.staleLeaseMinutes },
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
  summary.failureClassification = summarizeFailureClassifications(summary);
  writeJson(`${args.outputDir}/latest-summary.json`, summary);
  writeMd(`${args.outputDir}/latest-summary.md`, summaryMarkdown(summary));
  return summary;
}

async function runCycle(args, cycle) {
  if (!args.recoverLeasesOnly && !tokenAvailable(args)) throw new Error('--api-base with --token/--token-env is required unless --fixture-json is used');
  if (!args.dryRun && args.approvalToken !== APPROVAL_TOKEN) throw new Error('real execution requires --approval-token APPROVE_AGENT_EXECUTION');

  const leaseRecovery = recoverStaleTaskLeases(args);
  if (args.recoverLeasesOnly) {
    const summary = {
      decision: args.dryRun ? 'BUG_INTAKE_LOCAL_RUNNER_RECOVERY_DRY_RUN' : 'BUG_INTAKE_LOCAL_RUNNER_RECOVERY_EXECUTED',
      generatedAt: new Date().toISOString(),
      cycle,
      dryRun: args.dryRun,
      queueApply: 'lease-recovery-only',
      executeApproved: false,
      pushAfterSuccess: false,
      retrySafeUiOnce: Boolean(args.retrySafeUiOnce),
      autoUnblockDirtyWorktrees: Boolean(args.autoUnblockDirtyWorktrees),
      skipBlocked: Boolean(args.skipBlocked),
      sync: { status: 0, stdout: '', stderr: '', skipped: true, reason: 'recover-leases-only' },
      leaseRecovery,
      preWorkerCommit: { skipped: true, reason: 'recover-leases-only' },
      candidateTasks: [],
      blockedTasks: [],
      runnableTasks: [],
      workerRuns: [],
      push: { skipped: true, reason: 'recover-leases-only' },
      ci: { skipped: true, reason: 'recover-leases-only' },
      headSha: currentHead(args.mainRoot),
      tokenSource: 'not-required',
      lifecycleWriteback: { skipped: true, reason: 'recover-leases-only' },
    };
    summary.failureClassification = summarizeFailureClassifications(summary);
    writeJson(`${args.outputDir}/latest-summary.json`, summary);
    writeMd(`${args.outputDir}/latest-summary.md`, summaryMarkdown(summary));
    console.log(JSON.stringify({
      decision: summary.decision,
      stale_leases_recovered: summary.leaseRecovery.recovered,
      summary: `${args.outputDir}/latest-summary.md`,
    }, null, 2));
    return summary;
  }

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
    if (!taskUsesMainRootLocalWorker(task)) {
      const unblock = unblockDirtyWorktree(task, args);
      if (['BLOCKED', 'HOLD'].includes(unblock.status) || (['WOULD_UNBLOCK', 'WOULD_QUARANTINE'].includes(unblock.status) && args.dryRun)) {
        if (!args.dryRun && unblock.status === 'BLOCKED' && /non-ops files|implementation worktree/i.test(unblock.reason || '')) {
          const dirtyFiles = String(unblock.before || '')
            .split('\n')
            .map((line) => line.trim().slice(3).trim())
            .filter(Boolean);
          const heldTask = patchTask(task.task_id, {
            status: 'HOLD',
            completed_at: new Date().toISOString(),
            reason: `${unblock.reason}; incomplete files preserved for evidence-backed recovery`,
            incomplete_worktree_files: dirtyFiles,
            incomplete_worktree_detected_at: new Date().toISOString(),
          });
          unblock.status = 'HOLD';
          unblock.task = heldTask;
        }
        blockedTasks.push(unblock);
        if (args.skipBlocked) continue;
        break;
      }
    }
    runnableTasks.push(task);
    let worker = run(workerCommand(task, args), { timeoutMs: args.childTimeoutMs });
    let finalTask = findTask(task.task_id);
    const retryRuns = [];
    if (shouldRetryWorker(task, worker, finalTask, args)) {
      retryRuns.push({ reason: 'safe-ui-once retry', firstWorkerStatus: worker.status, firstFinalStatus: finalTask?.status || 'unknown' });
      worker = run(workerCommand(task, args), { timeoutMs: args.childTimeoutMs });
      finalTask = findTask(task.task_id);
    }
    let leftovers = activeAgentProcesses();
    if (!args.dryRun && !isFinishedTask(finalTask) && leftovers.length > 0) {
      const childWait = await waitForAgentChildrenToExit(args, task);
      finalTask = findTask(task.task_id);
      leftovers = activeAgentProcesses();
      if (!isFinishedTask(finalTask) && childWait.timed_out) {
        workerRuns.push({
          task,
          worker,
          finalTask,
          writeback: null,
          retryRuns,
          activeChildProcesses: leftovers,
          childWait,
          postWorkerCommit: { skipped: true, reason: 'agent child process still active after wait' },
        });
        blockedTasks.push({
          task_id: task.task_id,
          agent: task.agent,
          status: 'BLOCKED',
          reason: 'worker returned while agent child process is still active after wait; leaving task state unchanged and stopping this cycle',
          processes: leftovers,
        });
        break;
      }
      if (!isFinishedTask(finalTask)) {
        const recovery = recoverDetachedWorkerResult(task, args, worker, childWait);
        worker.detachedRecovery = recovery;
        finalTask = recovery.task || finalTask;
        if (!isFinishedTask(finalTask)) {
          finalTask = patchTask(task.task_id, {
            status: 'HOLD',
            completed_at: new Date().toISOString(),
            reason: `worker parent returned before child completion; child exited after ${Math.round(childWait.waited_ms / 1000)}s but task was not written back; recovery=${recovery.reason || (recovery.recovered ? 'completed' : 'failed')}; worker exit=${worker.status}; observed=${finalTask?.status || 'missing'}`,
          }) || finalTask;
        }
      }
      worker.childWait = childWait;
    }
    if (!args.dryRun && !isFinishedTask(finalTask)) {
      const recovery = recoverDetachedWorkerResult(task, args, worker, null);
      worker.detachedRecovery = recovery;
      finalTask = recovery.task || finalTask;
      if (!isFinishedTask(finalTask)) {
        finalTask = patchTask(task.task_id, {
          status: 'HOLD',
          completed_at: new Date().toISOString(),
          reason: `worker returned but task did not reach terminal status; recovery=${recovery.reason || (recovery.recovered ? 'completed' : 'failed')}; worker exit=${worker.status}; observed=${finalTask?.status || 'missing'}`,
        }) || finalTask;
      }
    }
    let writeback = null;
    const wbCommand = writebackCommand(task, finalTask, args);
    if (wbCommand && (!args.dryRun || finalTask?.result_file)) {
      writeback = run(wbCommand, { tokenEnv: args.tokenEnv, childTokenEnv: args.childTokenEnv, env: childEnv });
    }
    const postWorkerCommit = commitOpsRuntimeArtifacts(args);
    let implementationIntegration = { skipped: true, reason: 'worker runtime artifacts not committed', task: finalTask };
    let postIntegrationCommit = { skipped: true, reason: 'no implementation integration' };
    if (postWorkerCommit.skipped || postWorkerCommit.ok !== false) {
      implementationIntegration = integrateImplementationTask(task, finalTask, args);
      finalTask = implementationIntegration.task || finalTask;
      if (!implementationIntegration.skipped) postIntegrationCommit = commitOpsRuntimeArtifacts(args);
    }
    workerRuns.push({ task, worker, finalTask, writeback, retryRuns, implementationIntegration, postIntegrationCommit });
    leftovers = activeAgentProcesses();
    if (!args.dryRun && finalTask && !SUCCESS_STATUSES.has(finalTask.status)) {
      blockedTasks.push({
        task_id: task.task_id,
        agent: task.agent,
        status: 'BLOCKED',
        reason: `worker reached non-success terminal status ${finalTask.status}`,
      });
      if (!args.skipBlocked) break;
      continue;
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

  const releaseEvidence = releaseEvidenceForWorkerRuns(args, workerRuns);
  const push = runPushIfReady(args, workerRuns, releaseEvidence);
  const ci = await waitForGithubActionsIfRequested(args, push);
  const productionSmoke = runProductionSmokeIfReady(args, childEnv, push, ci, releaseEvidence);
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
    leaseRecovery,
    preWorkerCommit,
    candidateTasks: candidateTasks.map((task) => ({ task_id: task.task_id, agent: task.agent, source_bug_no: task.source_bug_no })),
    blockedTasks,
    runnableTasks: runnableTasks.map((task) => ({ task_id: task.task_id, agent: task.agent, source_bug_no: task.source_bug_no })),
    workerRuns: workerRuns.map((item) => ({
      task: { task_id: item.task.task_id, agent: item.task.agent, source_bug_no: item.task.source_bug_no },
      worker: { status: item.worker.status, stdout: item.worker.stdout, stderr: item.worker.stderr },
      finalTask: item.finalTask ? {
        status: item.finalTask.status,
        result_file: item.finalTask.result_file,
        baseline_autopilot_exit_code: item.finalTask.baseline_autopilot_exit_code,
        evidence_gate: item.finalTask.evidence_gate || null,
      } : null,
      writeback: item.writeback ? { status: item.writeback.status, stdout: item.writeback.stdout, stderr: item.writeback.stderr } : null,
      retryRuns: item.retryRuns || [],
      detachedRecovery: item.worker.detachedRecovery ? {
        recovered: item.worker.detachedRecovery.recovered,
        reportFile: item.worker.detachedRecovery.reportFile || null,
        baselineExit: item.worker.detachedRecovery.result?.status ?? null,
        reason: item.worker.detachedRecovery.reason || null,
      } : null,
      postWorkerCommit: item.postWorkerCommit ?? null,
      implementationIntegration: item.implementationIntegration ?? null,
      postIntegrationCommit: item.postIntegrationCommit ?? null,
      activeChildProcesses: item.activeChildProcesses || [],
    })),
    push,
    ci,
    productionSmoke,
    releaseEvidence,
    headSha: currentHead(args.mainRoot),
    tokenSource: args.fixtureJson ? 'fixture' : args.token ? 'argument' : args.tokenEnv && process.env[args.tokenEnv] ? args.tokenEnv : `${args.loginUserEnv}/${args.loginPasswordEnv}`,
    outputDir: args.outputDir,
  };
  summary.failureClassification = summarizeFailureClassifications(summary);
  writeJson(`${args.outputDir}/latest-summary.json`, summary);
  writeMd(`${args.outputDir}/latest-summary.md`, summaryMarkdown(summary));
  try {
    summary.resultBackfill = await backfillCompletedBugReports(args, childEnv, summary);
  } catch (error) {
    summary.resultBackfill = { skipped: false, ok: false, error: error.message };
  }
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
    stale_leases_recovered: summary.leaseRecovery.recovered,
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
  if (args.quarantineTaskId) {
    try {
      const task = findTask(args.quarantineTaskId);
      if (!task) throw new Error(`quarantine task not found: ${args.quarantineTaskId}`);
      const before = gitStatusShort(task.worktree);
      if (!before.ok || !before.output.trim()) throw new Error(`quarantine requires a dirty existing worktree: ${before.output || 'clean'}`);
      const result = quarantineDirtyImplementationWorktree(task, args, before);
      if (!result) throw new Error('quarantine is disabled or task is not using a dedicated Bug Intake worktree');
      console.log(JSON.stringify(result, null, 2));
      if (!['HOLD', 'WOULD_QUARANTINE'].includes(result.status)) process.exitCode = 2;
      return;
    } finally {
      releaseRunnerLock();
    }
  }
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
