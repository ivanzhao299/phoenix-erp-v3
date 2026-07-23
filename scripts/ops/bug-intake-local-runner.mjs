#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { evaluateBugReleaseEvidence } from './bug-intake-evidence-gate.mjs';
import { filterRunnerRuntimeStatus, gitStatusFiles } from './bug-intake-worktree-runtime.mjs';
import {
  REQUIRED_CI_WORKFLOWS,
  appendOutboxRecord,
  atomicWriteJson,
  compactOutbox,
  computeRunnerMetrics,
  evaluateCiBarrier,
  pendingOutboxRecords,
  persistTaskSnapshot,
  planConcurrentTaskBatch,
  readQueueTasks,
  runnerHealthDecision,
  stableHash,
  writeJsonIfMateriallyChanged,
} from './bug-runner-platform.mjs';

const APPROVAL_TOKEN = 'APPROVE_AGENT_EXECUTION';
const MAIN_ROOT = process.cwd();
const TASKS_FILE = 'docs/ops/agent-queue/tasks.json';
const RUN_DIR = 'docs/ops/runs/bug-intake-local-runner';
const DEFAULT_SYNC_OUTPUT = 'docs/ops/runs/bug-intake-inbox';
const RUNNABLE_STATUSES = new Set(['pending', 'claimed']);
const LEASE_STATUSES = new Set(['running', 'claimed']);
const FINISHED_STATUSES = new Set(['IMPLEMENTATION_COMPLETED', 'COMPLETED_MERGED', 'VALIDATION_COMPLETED', 'SKIPPED_NOT_APPLICABLE', 'WAITING_CAPACITY', 'WAITING_RUNNER', 'completed', 'failed', 'HOLD', 'hold']);
const SUCCESS_STATUSES = new Set(['IMPLEMENTATION_COMPLETED', 'COMPLETED_MERGED', 'VALIDATION_COMPLETED', 'SKIPPED_NOT_APPLICABLE']);
const DEPENDENCY_SUCCESS_STATUSES = new Set([...SUCCESS_STATUSES, 'completed']);
const DEPENDENCY_FAILURE_STATUSES = new Set(['HOLD', 'hold', 'failed']);
const REMOTE_RUNNING_REPAIR_STATUSES = new Set(['AGENT_RUNNING', 'AGENT_APPROVED']);
const OPS_RUNTIME_PATHS = [
  'docs/ops/agent-queue',
  'docs/ops/runs',
  'docs/ops/OBSERVER_FINDINGS_REPORT.md',
  'docs/ops/OBSERVER_EVOLUTION_TASKS.md',
  'docs/ops/evolution',
];
const NODE_BIN = process.execPath;
const DEFAULT_PATH = '/Users/mac/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
const LOCK_DIR = '/tmp/phoenix-erp-bug-intake-local-runner.lock';
const LOCK_PID_FILE = `${LOCK_DIR}/pid`;
const TOKEN_CACHE_FILE = '/Users/mac/.phoenix-erp/bug-intake-runner-token.json';
const AUDIT_COMMIT_STATE_FILE = '/Users/mac/.phoenix-erp/bug-intake-runner-audit-commit.json';

function usage(code = 1) {
  console.log(`Usage:
  node scripts/ops/bug-intake-local-runner.mjs \\
    --api-base https://erp.eggslao.com \\
    [--token-env PHOENIX_ERP_TOKEN | --login-user-env PHOENIX_ERP_RUNNER_USER --login-password-env PHOENIX_ERP_RUNNER_PASS] \\
    [--once | --watch] [--interval 300] [--max-cycles 1] [--max-tasks 6] [--parallel-workers 3] \\
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
    busyInterval: 5,
    maxCycles: 1,
    maxTasks: 3,
    parallelWorkers: 3,
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
    staleLeaseMinutes: 1,
    autoRecoverGenerationDrift: true,
    maxAutoRecoveries: 2,
    maxAutoRedispatchPerCycle: 3,
    commitAuditArtifacts: false,
    auditCommitMinutes: 30,
    wakeFile: '/tmp/phoenix-erp-bug-runner-wakeup.json',
  };
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  let explicitDryRun = false;
  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (['--dry-run', '--once', '--watch', '--apply-queue', '--execute-approved', '--push-after-success', '--wait-ci-after-push', '--production-smoke-after-ci', '--retry-safe-ui-once', '--auto-unblock-dirty-worktrees', '--skip-blocked', '--recover-leases-only', '--commit-audit-artifacts', '--auto-recover-generation-drift'].includes(arg)) {
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
    if (arg === '--no-auto-recover-generation-drift') {
      args.autoRecoverGenerationDrift = false;
      continue;
    }
    if (arg.startsWith('--')) {
      args[arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = normalized[i + 1];
      i += 1;
    }
  }
  args.interval = Number.parseInt(args.interval, 10) || 300;
  args.busyInterval = Number.parseInt(args.busyInterval, 10) || 5;
  args.maxCycles = Number.parseInt(args.maxCycles, 10) || 1;
  args.maxTasks = Number.parseInt(args.maxTasks, 10) || 3;
  args.parallelWorkers = Math.max(1, Number.parseInt(args.parallelWorkers, 10) || 3);
  args.maxCandidateTasks = Number.parseInt(args.maxCandidateTasks, 10) || Math.max(args.maxTasks * 8, 25);
  args.childTimeoutMs = Number.parseInt(args.childTimeoutMs, 10) || 900000;
  args.fetchTimeoutMs = Number.parseInt(args.fetchTimeoutMs, 10) || 45000;
  args.staleLeaseMinutes = Number.parseInt(args.staleLeaseMinutes, 10) || 1;
  args.maxAutoRecoveries = Number.parseInt(args.maxAutoRecoveries, 10) || 2;
  args.maxAutoRedispatchPerCycle = Number.parseInt(args.maxAutoRedispatchPerCycle, 10) || 3;
  args.auditCommitMinutes = Number.parseInt(args.auditCommitMinutes, 10) || 30;
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
  atomicWriteJson(resolveFile(file), value);
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

function runAsync(command, options = {}) {
  const startedAt = new Date().toISOString();
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, PATH: process.env.PATH || DEFAULT_PATH, ...(options.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const secretValues = [process.env[options.tokenEnv], options.env?.[options.tokenEnv], options.env?.[options.childTokenEnv]]
      .filter(Boolean)
      .map(String);
    const redact = (value) => secretValues.reduce((next, secret) => next.split(secret).join('<redacted>'), String(value));
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let exitGrace = null;
    let killGrace = null;
    child.stdout.on('data', (chunk) => { stdout = `${stdout}${chunk}`.slice(-12000); });
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-12000); });
    const finish = (code, signal, error = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (exitGrace) clearTimeout(exitGrace);
      if (killGrace) clearTimeout(killGrace);
      child.stdout?.destroy();
      child.stderr?.destroy();
      resolve({
        command: command.map(redact),
        startedAt,
        finishedAt: new Date().toISOString(),
        status: code ?? 1,
        signal: signal || null,
        timedOut,
        stdout: redact(stdout),
        stderr: redact(error ? `${stderr}\n${error.message}` : stderr),
      });
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      killGrace = setTimeout(() => {
        if (!settled && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      }, 5000);
    }, Number(options.timeoutMs || options.childTimeoutMs || 180000));
    child.on('error', (error) => finish(1, null, error));
    child.on('close', (code, signal) => finish(code, signal));
    child.on('exit', (code, signal) => {
      // Grandchildren may inherit the worker's pipes and prevent "close" forever.
      // Preserve a short output drain window, then settle from the real process exit.
      exitGrace = setTimeout(() => finish(code, signal), 500);
    });
  });
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
  if (match(/failed to load models cache|supports_reasoning_summaries|client.*incompatible/, 'codex-client')) {
    return { category: 'CODEX_CLIENT_INCOMPATIBLE', severity: 'CRITICAL', auto_recovery: 'upgrade the runner Codex binary; do not retry the task', evidence };
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

const MAX_GIT_OUTPUT_BYTES = 16 * 1024 * 1024;

function execGit(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  }).trim();
}

function safeGit(args, cwd) {
  try {
    return { ok: true, output: execGit(args, cwd) };
  } catch (error) {
    return { ok: false, output: error.stderr?.toString() || error.message };
  }
}

function isRunnerRuntimeFile(file) {
  return file.startsWith('docs/ops/agent-queue/')
    || file.startsWith('docs/ops/runs/')
    || file === 'docs/ops/OBSERVER_FINDINGS_REPORT.md'
    || file === 'docs/ops/OBSERVER_EVOLUTION_TASKS.md'
    || file.startsWith('docs/ops/evolution/');
}

export function auditFingerprintGitArgs(paths = OPS_RUNTIME_PATHS) {
  return ['diff', '--cached', '--raw', '--no-renames', '--', ...paths];
}

function commitOpsRuntimeArtifacts(args) {
  if (args.dryRun) return { skipped: true, reason: 'dry-run' };
  if (!args.commitAuditArtifacts) return { skipped: true, reason: 'automatic audit commits disabled' };
  const previous = readJson(AUDIT_COMMIT_STATE_FILE, {});
  const minIntervalMs = Math.max(1, Number(args.auditCommitMinutes || 30)) * 60 * 1000;
  const lastCommittedAt = Date.parse(previous.committedAt || '');
  if (Number.isFinite(lastCommittedAt) && Date.now() - lastCommittedAt < minIntervalMs) {
    return { skipped: true, reason: `audit commit cooldown (${args.auditCommitMinutes} minutes)` };
  }
  const status = safeGit(['status', '--short', '--', ...OPS_RUNTIME_PATHS], args.mainRoot);
  if (!status.ok) return { skipped: false, ok: false, step: 'git status', error: status.output };
  if (!status.output.trim()) return { skipped: true, reason: 'no ops runtime artifacts changed' };
  const add = safeGit(['add', '--', ...OPS_RUNTIME_PATHS], args.mainRoot);
  if (!add.ok) return { skipped: false, ok: false, step: 'git add', error: add.output };
  const staged = safeGit(['diff', '--cached', '--name-only', '--', ...OPS_RUNTIME_PATHS], args.mainRoot);
  if (!staged.ok) {
    safeGit(['restore', '--staged', '--', ...OPS_RUNTIME_PATHS], args.mainRoot);
    return { skipped: false, ok: false, step: 'git diff --cached', error: staged.output };
  }
  if (!staged.output.trim()) return { skipped: true, reason: 'no staged ops runtime artifacts' };
  const stagedFingerprint = safeGit(auditFingerprintGitArgs(), args.mainRoot);
  if (!stagedFingerprint.ok) {
    safeGit(['restore', '--staged', '--', ...OPS_RUNTIME_PATHS], args.mainRoot);
    return { skipped: false, ok: false, step: 'git diff --cached --raw', error: stagedFingerprint.output };
  }
  const semanticHash = createHash('sha256').update(stagedFingerprint.output).digest('hex');
  if (semanticHash === previous.semanticHash) {
    safeGit(['restore', '--staged', '--', ...OPS_RUNTIME_PATHS], args.mainRoot);
    return { skipped: true, reason: 'audit state unchanged' };
  }
  const commit = safeGit(['commit', '-m', 'docs(ops): record bug intake runner artifacts'], args.mainRoot);
  if (commit.ok) writeJson(AUDIT_COMMIT_STATE_FILE, { committedAt: new Date().toISOString(), semanticHash });
  else safeGit(['restore', '--staged', '--', ...OPS_RUNTIME_PATHS], args.mainRoot);
  return commit.ok
    ? { skipped: false, ok: true, files: staged.output.split('\n').filter(Boolean), output: commit.output, semanticHash }
    : { skipped: false, ok: false, step: 'git commit', error: commit.output };
}

function runEvolutionCycle(args, cycle, generationRecovery) {
  const due = cycle % 12 === 0 || (generationRecovery?.candidates?.length || 0) > 0;
  if (!due) return { skipped: true, reason: 'not scheduled this cycle' };
  const observer = run([NODE_BIN, 'scripts/ops/agent-observer.mjs', '--output-dir', 'docs/ops/runs', '--dry-run'], {
    cwd: args.mainRoot,
    timeoutMs: 180000,
  });
  const planner = observer.status === 0
    ? run([NODE_BIN, 'scripts/ops/agent-evolution-planner.mjs', args.dryRun ? '--dry-run' : '--apply'], {
      cwd: args.mainRoot,
      timeoutMs: 180000,
    })
    : { status: 1, skipped: true, reason: 'observer failed' };
  return { skipped: false, observer, planner };
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

export function selectRunnableBugTasks(tasks, args = {}) {
  const byId = new Map(tasks.map((task) => [task.task_id, task]));
  const allowAgents = args.agents ? new Set(String(args.agents).split(',').map((s) => s.trim()).filter(Boolean)) : null;
  const retryRank = (task) => Number(task.retry_count || task.recovery_count || task.redispatch_count || 0) === 0 ? 0 : 1;
  const createdAt = (task) => Date.parse(task.created_at || task.approved_at || '') || 0;
  return tasks
    .filter((task) => task.source === 'bug-intake')
    .filter((task) => task.route_active !== false)
    .filter((task) => RUNNABLE_STATUSES.has(task.status))
    .filter((task) => (task.dependencies || []).every((taskId) => DEPENDENCY_SUCCESS_STATUSES.has(byId.get(taskId)?.status)))
    .filter((task) => !allowAgents || allowAgents.has(task.agent))
    .sort((a, b) => {
      const retryDelta = retryRank(a) - retryRank(b);
      if (retryDelta !== 0) return retryDelta;
      const ageDelta = createdAt(a) - createdAt(b);
      if (ageDelta !== 0) return ageDelta;
      return String(a.task_id || '').localeCompare(String(b.task_id || ''));
    })
    .slice(0, Number(args.maxCandidateTasks || tasks.length));
}

function listRunnableBugTasks(args) {
  const queued = readJson(TASKS_FILE, []);
  const capacityChanged = requeueExpiredCapacityWaits(queued);
  if (capacityChanged && !args.dryRun) writeJson(TASKS_FILE, queued);
  return selectRunnableBugTasks(reconcileDependencyStates(args), args);
}

function reconcileDependencyStates(args) {
  const tasks = readJson(TASKS_FILE, []);
  const byId = new Map(tasks.map((task) => [task.task_id, task]));
  let changed = requeueSatisfiedDependencyHolds(tasks);
  for (const task of tasks) {
    if (task.source !== 'bug-intake' || task.route_active === false || !RUNNABLE_STATUSES.has(task.status)) continue;
    const dependencies = Array.isArray(task.dependencies) ? task.dependencies : [];
    if (dependencies.length === 0) continue;
    const missing = dependencies.filter((taskId) => !byId.has(taskId));
    const failed = dependencies.filter((taskId) => DEPENDENCY_FAILURE_STATUSES.has(byId.get(taskId)?.status));
    if (missing.length === 0 && failed.length === 0) continue;
    task.status = 'HOLD';
    task.claimed_by = null;
    task.claimed_at = null;
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

export function requeueSatisfiedDependencyHolds(tasks, now = new Date()) {
  const byId = new Map((tasks || []).map((task) => [task.task_id, task]));
  let changed = false;
  for (const task of tasks || []) {
    const dependencies = Array.isArray(task.dependencies) ? task.dependencies : [];
    const isDependencyHold = ['HOLD', 'hold'].includes(task.status)
      && task.evidence_gate?.role === 'dependency'
      && /^(blocked by failed dependency|dependency task missing):/i.test(String(task.reason || ''));
    if (!isDependencyHold || dependencies.length === 0) continue;
    if (!dependencies.every((taskId) => DEPENDENCY_SUCCESS_STATUSES.has(byId.get(taskId)?.status))) continue;
    task.status = 'pending';
    task.reason = 'dependency recovered; automatically requeued';
    task.claimed_by = null;
    task.claimed_at = null;
    task.completed_at = null;
    task.evidence_gate = null;
    task.dependency_recovered_at = now.toISOString();
    changed = true;
  }
  return changed;
}

function findTask(taskId) {
  return readJson(TASKS_FILE, []).find((task) => task.task_id === taskId) || null;
}

function patchTask(taskId, patch, options = {}) {
  const tasks = readQueueTasks(TASKS_FILE);
  const index = tasks.findIndex((task) => task.task_id === taskId);
  if (index < 0) return null;
  const baseTasks = structuredClone(tasks);
  tasks[index] = { ...tasks[index], ...patch };
  if (!['claimed', 'running'].includes(tasks[index].status)) {
    tasks[index].claimed_by = null;
    tasks[index].claimed_at = null;
  }
  const result = persistTaskSnapshot({
    tasksFile: TASKS_FILE,
    eventsFile: 'docs/ops/agent-queue/events.jsonl',
    baseTasks,
    incomingTasks: tasks,
    verifiedEvidenceRecovery: options.verifiedEvidenceRecovery === true,
  });
  return result.tasks.find((task) => task.task_id === taskId) || null;
}

export function restoreVerifiedTerminalEvidence(tasks, now = new Date()) {
  const restored = [];
  for (const task of tasks || []) {
    if (!['HOLD', 'hold', 'running', 'claimed'].includes(task.status)) continue;
    const evidence = task.evidence_gate;
    const terminalStatus = String(evidence?.terminalStatus || '');
    if (evidence?.passed !== true || !SUCCESS_STATUSES.has(terminalStatus)) continue;
    if (evidence.role === 'implementation' && !/^[0-9a-f]{7,40}$/i.test(String(task.implementation_commit || evidence.commitHash || ''))) {
      continue;
    }
    task.status = terminalStatus;
    task.reason = 'terminal status restored from passed worker evidence';
    task.claimed_by = null;
    task.claimed_at = null;
    task.completed_at = task.completed_at || now.toISOString();
    task.evidence_reconciled_at = now.toISOString();
    restored.push({ task_id: task.task_id, status: terminalStatus });
  }
  return restored;
}

export function requeueInvalidTerminalEvidence(tasks, now = new Date(), eligibleBugNos = null) {
  const requeued = [];
  for (const task of tasks || []) {
    if (eligibleBugNos instanceof Set && !eligibleBugNos.has(String(task.source_bug_no || ''))) continue;
    if (!SUCCESS_STATUSES.has(task.status) || task.evidence_gate?.passed === true) continue;
    const recoveryCount = Number(task.invalid_terminal_recovery_count || 0);
    const interruptedPersistenceRecovery = recoveryCount === 1
      && /^invalid terminal state .* had no passed evidence; automatically requeued/i.test(String(task.reason || ''));
    if (recoveryCount >= 1 && !interruptedPersistenceRecovery) {
      task.status = 'HOLD';
      task.reason = 'terminal success state has no passed evidence after automatic recovery; manual evidence review required';
      task.completed_at = now.toISOString();
      task.evidence_gate = {
        version: 1,
        agent: task.agent,
        passed: false,
        role: 'evidence_integrity',
        terminalStatus: 'HOLD',
        reason: task.reason,
        checkedAt: now.toISOString(),
      };
      continue;
    }
    const previousStatus = task.status;
    task.status = 'pending';
    task.reason = `invalid terminal state ${previousStatus} had no passed evidence; automatically requeued for one clean verification`;
    task.claimed_by = null;
    task.claimed_at = null;
    task.completed_at = null;
    task.result_file = null;
    task.evidence_gate = null;
    task.invalid_terminal_recovery_count = interruptedPersistenceRecovery ? recoveryCount : recoveryCount + 1;
    task.invalid_terminal_recovered_at = now.toISOString();
    requeued.push({ task_id: task.task_id, previous_status: previousStatus, status: 'pending' });
  }
  return requeued;
}

function reconcileVerifiedWorkerEvidence(args) {
  const tasks = readQueueTasks(TASKS_FILE);
  const restored = restoreVerifiedTerminalEvidence(tasks);
  const eligibleBugNos = new Set(readLatestInboxReports(args)
    .filter((report) => ['HOLD', 'AGENT_APPROVED', 'AGENT_RUNNING'].includes(String(report?.repairTaskStatus || '')))
    .map((report) => String(report?.bugNo || ''))
    .filter(Boolean));
  const requeued = requeueInvalidTerminalEvidence(tasks, new Date(), eligibleBugNos);
  if ((restored.length > 0 || requeued.length > 0) && !args.dryRun) {
    const current = readQueueTasks(TASKS_FILE);
    persistTaskSnapshot({
      tasksFile: TASKS_FILE,
      eventsFile: 'docs/ops/agent-queue/events.jsonl',
      baseTasks: current,
      incomingTasks: tasks,
      explicitRedispatch: requeued.length > 0,
      verifiedEvidenceRecovery: true,
    });
  }
  return {
    restored,
    requeued,
    wrote_queue: (restored.length > 0 || requeued.length > 0) && !args.dryRun,
  };
}

function integrateReconciledImplementations(args, reconciliation) {
  if (args.dryRun || reconciliation.restored.length === 0) return [];
  const results = [];
  for (const item of reconciliation.restored) {
    if (item.status !== 'IMPLEMENTATION_COMPLETED') continue;
    const task = findTask(item.task_id);
    if (!task) continue;
    results.push(integrateImplementationTask(task, task, args));
  }
  const tasks = readQueueTasks(TASKS_FILE);
  if (requeueSatisfiedDependencyHolds(tasks)) {
    const current = readQueueTasks(TASKS_FILE);
    persistTaskSnapshot({
      tasksFile: TASKS_FILE,
      eventsFile: 'docs/ops/agent-queue/events.jsonl',
      baseTasks: current,
      incomingTasks: tasks,
    });
  }
  return results;
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
  const blockingDirtyFiles = status.ok
    ? gitStatusFiles(status.output).filter((file) => !isRunnerRuntimeFile(file))
    : [];
  if (!status.ok || blockingDirtyFiles.length > 0) {
    const next = patchTask(task.task_id, {
      status: 'HOLD',
      reason: `runner root contains non-runtime changes before implementation integration: ${blockingDirtyFiles.join(', ') || status.output || 'git status failed'}`,
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
  let worktreeBaselineSync = { skipped: true, reason: 'implementation worktree is not clean at integrated source commit' };
  const worktreeHead = currentHead(task.worktree);
  const worktreeStatus = safeGit(['status', '--short'], task.worktree);
  if (worktreeHead === commitHash && worktreeStatus.ok && filterRunnerRuntimeStatus(worktreeStatus.output) === '') {
    const sync = safeGit(['rebase', '--onto', integratedHead, commitHash, task.branch], task.worktree);
    if (!sync.ok) {
      safeGit(['rebase', '--abort'], task.worktree);
      worktreeBaselineSync = { skipped: false, ok: false, reason: sync.output };
    } else {
      worktreeBaselineSync = { skipped: false, ok: true, baseline: integratedHead };
    }
  }
  const next = patchTask(task.task_id, {
    status: 'COMPLETED_MERGED',
    integrated_commit: integratedHead,
    integrated_at: new Date().toISOString(),
    integration_method: alreadyMerged.ok ? 'already-ancestor' : 'cherry-pick-verified-agent-commit',
    worktree_baseline_sync: worktreeBaselineSync,
    completed_at: new Date().toISOString(),
  });
  return {
    skipped: false,
    ok: true,
    sourceCommit: commitHash,
    integratedCommit: integratedHead,
    method: alreadyMerged.ok ? 'already-ancestor' : 'cherry-pick',
    output: cherryPick.output,
    worktreeBaselineSync,
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
  const staleAfterMs = Math.max(1, Number(args.staleLeaseMinutes || 1)) * 60 * 1000;
  const recovered = [];
  const releasedTerminal = [];
  let changed = false;

  const nextTasks = tasks.map((task) => {
    if (task.source !== 'bug-intake') return task;
    if (!LEASE_STATUSES.has(task.status)) {
      if (!task.claimed_by && !task.claimed_at) return task;
      releasedTerminal.push({ task_id: task.task_id, agent: task.agent, status: task.status });
      changed = true;
      if (!args.dryRun) {
        const lockFile = path.resolve(args.mainRoot, `docs/ops/agent-queue/locks/${task.task_id}.lock`);
        rmSync(lockFile, { force: true });
      }
      return { ...task, claimed_by: null, claimed_at: null };
    }
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
    released_terminal_leases: releasedTerminal,
    active_processes: processes.map((processInfo) => ({ pid: processInfo.pid, command: processInfo.command })),
    wrote_queue: changed && !args.dryRun,
    stale_after_minutes: Math.max(1, Number(args.staleLeaseMinutes || 1)),
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

  const latestTask = findTask(task.task_id);
  const lateEvidence = latestTask ? restoreVerifiedTerminalEvidence([latestTask]) : [];
  if (lateEvidence.length > 0) {
    const restoredTask = patchTask(task.task_id, {
      status: lateEvidence[0].status,
      reason: 'late terminal worker evidence accepted before detached-worker HOLD',
      evidence_reconciled_at: latestTask.evidence_reconciled_at,
      completed_at: latestTask.completed_at,
    }, { verifiedEvidenceRecovery: true });
    return {
      recovered: true,
      reason: 'late terminal worker evidence accepted',
      result: { status: 0, stdout: '', stderr: '', skipped: true },
      reportFile: restoredTask?.result_file || null,
      task: restoredTask || latestTask,
    };
  }

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
  const status = safeGit(['status', '--short'], cwd);
  return status.ok ? { ...status, output: filterRunnerRuntimeStatus(status.output) } : status;
}

function worktreeClean(cwd) {
  const status = gitStatusShort(cwd);
  return status.ok && status.output.trim() === '';
}

function ensureTaskWorktreeDependencies(task, args) {
  if (args.dryRun || taskUsesMainRootLocalWorker(task)) return { ok: true, created: [], skipped: true };
  const candidates = [
    ['node_modules', 'node_modules'],
    ['apps/api/node_modules', 'apps/api/node_modules'],
    ['apps/web/node_modules', 'apps/web/node_modules'],
  ];
  const created = [];
  try {
    for (const [sourceRelative, targetRelative] of candidates) {
      const source = path.join(args.mainRoot, sourceRelative);
      const target = path.join(task.worktree, targetRelative);
      if (!existsSync(source) || existsSync(target)) continue;
      mkdirSync(path.dirname(target), { recursive: true });
      symlinkSync(source, target, 'dir');
      created.push(targetRelative);
    }
    return { ok: true, created, skipped: created.length === 0 };
  } catch (error) {
    return { ok: false, created, error: error.message };
  }
}

function inferDirtyWorktreeOwner(task, statusOutput) {
  const taskIds = [...String(statusOutput || '').matchAll(/BUGTASK-[A-Z0-9-]+-A[1-7](?=[^A-Z0-9]|$)/gi)]
    .map((match) => match[0].toUpperCase());
  const matchedTasks = [...new Set(taskIds)]
    .map((taskId) => findTask(taskId))
    .filter(Boolean);
  return matchedTasks.length === 1 ? matchedTasks[0] : task;
}

function quarantineDirtyImplementationWorktree(task, args, before) {
  if (!args.autoUnblockDirtyWorktrees || !String(task.worktree || '').includes('/bug-intake-')) return null;
  const ownerTask = inferDirtyWorktreeOwner(task, before.output);
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const safeTaskId = String(ownerTask.task_id || 'unknown-task').replace(/[^A-Za-z0-9._-]/g, '-');
  const quarantineRoot = path.join(path.dirname(task.worktree), 'bug-intake-quarantine');
  const quarantinePath = path.join(quarantineRoot, `${safeTaskId}-${timestamp}`);
  const quarantineBranch = `codex/quarantine/${safeTaskId.toLowerCase()}-${timestamp}`;
  const reportFile = `docs/ops/runs/${safeTaskId}-worktree-quarantine.md`;

  if (args.dryRun) {
    return {
      task_id: ownerTask.task_id,
      trigger_task_id: task.task_id,
      agent: ownerTask.agent,
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
  const heldTask = patchTask(ownerTask.task_id, taskPatch);
  let recreated = { ok: false, output: 'skipped because quarantine branch rename failed' };
  if (renamed.ok) recreated = safeGit(['worktree', 'add', '-b', task.branch, task.worktree, 'origin/main'], args.mainRoot);

  writeMd(reportFile, `# Bug Intake Worktree Quarantine

| Field | Value |
| --- | --- |
| Task | ${ownerTask.task_id} |
| Trigger task | ${task.task_id} |
| Agent | ${ownerTask.agent} |
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
    task_id: ownerTask.task_id,
    trigger_task_id: task.task_id,
    agent: ownerTask.agent,
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
  const dirtyFiles = gitStatusFiles(before.output);
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

export function selectReleaseReadyBacklog(reports, tasks) {
  return (reports || []).flatMap((report) => {
    if (!report?.bugNo || ['RESOLVED', 'CLOSED', 'REJECTED'].includes(String(report.status || ''))) return [];
    if (['FIX_READY_FOR_UAT', 'BUSINESS_VERIFIED', 'AGENT_COMPLETED'].includes(String(report.repairTaskStatus || ''))) return [];
    const localTasks = (tasks || []).filter((task) =>
      task.source === 'bug-intake' && task.source_bug_no === report.bugNo,
    );
    if (localTasks.length === 0) return [];
    const selectedAgents = selectedAgentsForReport(report, localTasks);
    const evidence = evaluateBugReleaseEvidence(localTasks, selectedAgents);
    return evidence.passed ? [{ bugNo: report.bugNo, evidence }] : [];
  });
}

function releaseEvidenceForWorkerRuns(args, workerRuns) {
  const reports = readLatestInboxReports(args);
  const reportByBug = new Map(reports.map((report) => [report.bugNo, report]));
  const tasks = readJson(TASKS_FILE, []);
  const unpushed = safeGit(['rev-list', 'origin/main..HEAD'], args.mainRoot);
  const unpushedCommits = unpushed.ok
    ? unpushed.output.split('\n').map((sha) => sha.trim()).filter(Boolean)
    : [];
  const commitIsUnpushed = (commit) => {
    const value = String(commit || '').trim();
    return value && unpushedCommits.some((sha) => sha === value || sha.startsWith(value) || value.startsWith(sha));
  };
  const unpushedBugNos = tasks
    .filter((task) => task.source === 'bug-intake' && task.source_bug_no)
    .filter((task) => commitIsUnpushed(task.integrated_commit))
    .map((task) => task.source_bug_no);
  // A fix can complete in one resident cycle and only become releasable after
  // a later validation/backfill cycle. Keep those verified reports in the
  // release set so they cannot remain stranded in AGENT_RUNNING/HOLD forever.
  const releaseReadyBacklog = selectReleaseReadyBacklog(reports, tasks);
  const bugNos = [...new Set([
    ...workerRuns.map((item) => item.task.source_bug_no).filter(Boolean),
    ...unpushedBugNos,
    ...releaseReadyBacklog.map((item) => item.bugNo),
  ])];
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

export function shouldAttemptReleasePush({
  dryRun = false,
  pushAfterSuccess = false,
  releaseEvidence = [],
  unpushedCommitCount = 0,
} = {}) {
  if (dryRun || !pushAfterSuccess || unpushedCommitCount < 1) return false;
  // A previous cycle can finish implementation while a later cycle performs
  // the final evidence backfill. Requiring a worker in the same cycle left
  // verified commits permanently stranded ahead of origin/main.
  return releaseEvidence.length > 0 && releaseEvidence.every((item) => item.evidence.passed);
}

export function shouldResumeAlreadyPushedRelease({
  dryRun = false,
  pushAfterSuccess = false,
  releaseEvidence = [],
  unpushedCommitCount = 0,
  headIsOnOriginMain = false,
} = {}) {
  if (dryRun || !pushAfterSuccess || unpushedCommitCount !== 0 || !headIsOnOriginMain) return false;
  return releaseEvidence.length > 0 && releaseEvidence.every((item) => item.evidence.passed);
}

function runPushIfReady(args, workerRuns, releaseEvidence) {
  if (args.dryRun || !args.pushAfterSuccess) {
    return {
      skipped: true,
      reason: args.dryRun ? 'dry-run' : 'push-after-success disabled',
    };
  }
  if (releaseEvidence.length === 0 || releaseEvidence.some((item) => !item.evidence.passed)) {
    return { skipped: true, reason: 'release evidence is incomplete; refusing push' };
  }
  const unpushed = safeGit(['rev-list', 'origin/main..HEAD'], args.mainRoot);
  if (!unpushed.ok) return { skipped: true, reason: `cannot inspect unpushed commits: ${unpushed.output}` };
  const unpushedCommitCount = unpushed.output.split('\n').map((sha) => sha.trim()).filter(Boolean).length;
  const headOnOriginMain = safeGit(['merge-base', '--is-ancestor', 'HEAD', 'origin/main'], args.mainRoot).ok;
  if (shouldResumeAlreadyPushedRelease({
    dryRun: args.dryRun,
    pushAfterSuccess: args.pushAfterSuccess,
    releaseEvidence,
    unpushedCommitCount,
    headIsOnOriginMain: headOnOriginMain,
  })) {
    return {
      skipped: false,
      status: 0,
      alreadyPushed: true,
      stdout: 'release commit is already present on origin/main; resuming CI, production smoke, and lifecycle writeback',
      stderr: '',
    };
  }
  if (!shouldAttemptReleasePush({
    dryRun: args.dryRun,
    pushAfterSuccess: args.pushAfterSuccess,
    releaseEvidence,
    unpushedCommitCount,
  })) {
    return { skipped: true, reason: 'no unpushed release commit' };
  }
  const branch = safeGit(['branch', '--show-current'], args.mainRoot);
  const status = safeGit(['status', '--short'], args.mainRoot);
  if (!branch.ok) return { skipped: true, reason: `cannot read branch: ${branch.output}` };
  const blockingDirtyFiles = status.ok
    ? gitStatusFiles(status.output).filter((file) => !isRunnerRuntimeFile(file))
    : [];
  if (!status.ok || blockingDirtyFiles.length > 0) {
    return { skipped: true, reason: `main root contains non-runtime changes: ${blockingDirtyFiles.join(', ') || status.output}` };
  }
  return run(pushCommand(args), { cwd: args.mainRoot });
}

function pushOpsAuditCommitsIfSafe(args, releasePush) {
  if (args.dryRun || !args.pushAfterSuccess) return { skipped: true, reason: args.dryRun ? 'dry-run' : 'push-after-success disabled' };
  if (!releasePush?.skipped && releasePush?.status === 0) return { skipped: true, reason: 'release push already completed' };
  const status = safeGit(['status', '--short'], args.mainRoot);
  if (!status.ok || status.output.trim()) return { skipped: true, reason: `main root dirty: ${status.output}` };
  const commits = safeGit(['rev-list', 'origin/main..HEAD'], args.mainRoot);
  if (!commits.ok || !commits.output.trim()) return { skipped: true, reason: 'no unpushed commits' };
  const files = safeGit(['diff', '--name-only', 'origin/main..HEAD'], args.mainRoot);
  if (!files.ok) return { skipped: true, reason: `cannot inspect unpushed paths: ${files.output}` };
  const paths = files.output.split('\n').map((file) => file.trim()).filter(Boolean);
  if (paths.length === 0 || paths.some((file) => !file.startsWith('docs/ops/'))) {
    return { skipped: true, reason: 'unpushed commits contain non-audit paths; release evidence is required', paths };
  }
  return { ...run(pushCommand(args), { cwd: args.mainRoot }), auditOnly: true, paths };
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
    const barrier = evaluateCiBarrier(lastRuns, REQUIRED_CI_WORKFLOWS);
    if (barrier.complete) {
      return {
        skipped: false,
        ok: barrier.ready,
        headSha,
        runs: lastRuns,
        requiredWorkflows: REQUIRED_CI_WORKFLOWS,
        barrier,
        conclusion: barrier.decision,
      };
    }
    await sleep(pollMs);
  }
  return {
    skipped: false,
    ok: false,
    headSha,
    runs: lastRuns,
    requiredWorkflows: REQUIRED_CI_WORKFLOWS,
    barrier: evaluateCiBarrier(lastRuns, REQUIRED_CI_WORKFLOWS),
    conclusion: 'HOLD',
    error: `CI wait timed out after ${timeoutMs}ms`,
  };
}

function resultOutboxFile(args) {
  return path.join(args.outputDir, 'result-outbox.jsonl');
}

function resultReceiptFile(args) {
  return path.join(args.outputDir, 'result-delivery-receipts.json');
}

export function resultDeliveryId(bugNo, endpoint, payload) {
  return stableHash({ bugNo, endpoint, payload });
}

function resultWasDelivered(args, id) {
  const receipts = readJson(resultReceiptFile(args), {});
  return Boolean(receipts[id]?.deliveredAt);
}

function boundedResultDeliveryReceipts(receipts) {
  return Object.fromEntries(
    Object.entries(receipts)
      .sort((a, b) => String(a[1]?.deliveredAt || '').localeCompare(String(b[1]?.deliveredAt || '')))
      .slice(-5000),
  );
}

function rememberResultDelivery(args, id, record) {
  const file = resultReceiptFile(args);
  const receipts = readJson(file, {});
  receipts[id] = {
    bugNo: record.bugNo,
    endpoint: record.endpoint,
    taskId: record.payload?.taskId || '',
    agent: record.payload?.agent || '',
    deliveredAt: new Date().toISOString(),
  };
  atomicWriteJson(file, boundedResultDeliveryReceipts(receipts));
}

export function bootstrapResultDeliveryReceipts(args) {
  const file = resultReceiptFile(args);
  const receipts = readJson(file, {});
  const summary = readJson(path.join(args.outputDir, 'latest-summary.json'), {});
  let imported = 0;
  for (const result of summary.resultBackfill?.results || []) {
    for (const posted of result.posted || []) {
      if (!posted?.ok || !posted?.outboxId || receipts[posted.outboxId]?.deliveredAt) continue;
      receipts[posted.outboxId] = {
        bugNo: result.bugNo || '',
        endpoint: '',
        taskId: posted.task_id || '',
        agent: posted.agent || '',
        deliveredAt: summary.generatedAt || new Date().toISOString(),
        bootstrapped: true,
      };
      imported += 1;
    }
  }
  const bounded = boundedResultDeliveryReceipts(receipts);
  if (imported > 0) atomicWriteJson(file, bounded);
  return { imported, total: Object.keys(bounded).length, file };
}

async function deliverOutboxRecord(args, childEnv, record) {
  const token = childEnv[args.childTokenEnv] || process.env[args.tokenEnv] || args.token || '';
  if (!token) return { ok: false, reason: 'missing token' };
  try {
    const res = await fetch(record.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': record.id,
      },
      body: JSON.stringify({ ...record.payload, idempotencyKey: record.id }),
      signal: AbortSignal.timeout(args.fetchTimeoutMs),
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body: body.slice(0, 1000) };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

async function flushResultOutbox(args, childEnv) {
  const file = resultOutboxFile(args);
  const pending = pendingOutboxRecords(file);
  const results = [];
  for (const record of pending) {
    const delivery = await deliverOutboxRecord(args, childEnv, record);
    if (delivery.ok) rememberResultDelivery(args, record.id, record);
    appendOutboxRecord(file, {
      ...record,
      status: delivery.ok ? 'ACK' : 'RETRY',
      delivery,
      attempts: Number(record.attempts || 0) + 1,
    });
    results.push({ id: record.id, bugNo: record.bugNo, ...delivery });
  }
  const compaction = compactOutbox(file);
  return { pending: pending.length, delivered: results.filter((item) => item.ok).length, results, compaction };
}

async function postAgentResult(args, childEnv, bugNo, payload) {
  const token = childEnv[args.childTokenEnv] || process.env[args.tokenEnv] || args.token || '';
  if (!args.apiBase || !token || !bugNo) return { skipped: true, reason: 'missing api-base/token/bug-no' };
  const endpoint = `${args.apiBase.replace(/\/$/, '')}/api/bug-intake/reports/${encodeURIComponent(bugNo)}/agent-result`;
  const file = resultOutboxFile(args);
  const id = resultDeliveryId(bugNo, endpoint, payload);
  if (resultWasDelivered(args, id)) {
    return { skipped: true, reason: 'identical result already delivered', outboxId: id, ok: true };
  }
  appendOutboxRecord(file, { id, bugNo, endpoint, payload, status: 'PENDING', attempts: 0 });
  const delivery = await deliverOutboxRecord(args, childEnv, { id, bugNo, endpoint, payload });
  if (delivery.ok) rememberResultDelivery(args, id, { bugNo, endpoint, payload });
  appendOutboxRecord(file, {
    id,
    bugNo,
    endpoint,
    payload,
    status: delivery.ok ? 'ACK' : 'RETRY',
    delivery,
    attempts: 1,
  });
  return { skipped: false, outboxId: id, ...delivery };
}

export function runnerLifecycleWritebackDecision(args, summary) {
  if (args.dryRun) return { run: false, reason: 'dry-run' };
  if (!args.pushAfterSuccess) {
    return { run: false, reason: 'automatic release is disabled; preserve Agent execution state' };
  }
  if (summary.push?.skipped) {
    return { run: false, reason: `no release attempt occurred: ${summary.push.reason || 'push skipped'}` };
  }
  return { run: true, reason: 'release attempt completed' };
}

async function writebackRunnerLifecycle(args, childEnv, summary) {
  const decision = runnerLifecycleWritebackDecision(args, summary);
  if (!decision.run) return { skipped: true, reason: decision.reason };
  const pushOk = !summary.push?.skipped && summary.push?.status === 0;
  const ciOk = !summary.ci?.skipped && summary.ci?.ok === true;
  const smokeOk = !summary.productionSmoke?.skipped && summary.productionSmoke?.status === 0;
  const results = [];
  for (const candidate of summary.releaseEvidence || []) {
    const releaseOk = candidate.evidence?.passed === true;
    // A partial Agent batch is not a release failure. Posting a runner-level
    // HOLD here used to replace AGENT_RUNNING on the server, and the next sync
    // then archived the still-pending A2/A1 tasks. Leave the report in its
    // execution state until all selected Agent evidence is complete.
    if (!releaseOk) {
      results.push({
        bugNo: candidate.bugNo,
        skipped: true,
        reason: 'release evidence incomplete; preserve Agent execution state',
      });
      continue;
    }
    const conclusion = releaseOk && pushOk && ciOk && smokeOk ? 'PASS_WITH_CONDITIONS' : 'HOLD';
    const payload = {
      taskId: `LOCAL-RUNNER-${candidate.bugNo}-${String(summary.headSha || 'release').slice(0, 12)}`,
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

export function buildResultBackfillPlan(report, currentRouteTasks) {
  const selectedAgents = selectedAgentsForReport(report, currentRouteTasks);
  const selectedTasks = selectedAgents
    .map((agent) => currentRouteTasks.find((task) => task.agent === agent))
    .filter(Boolean);
  const missingAgents = selectedAgents.filter((agent) => !selectedTasks.some((task) => task.agent === agent));
  const remoteSelected = Array.isArray(report?.repairTaskPayload?.agentPlan?.selected_agents)
    ? report.repairTaskPayload.agentPlan.selected_agents.map(String).filter(Boolean)
    : [];
  const notApplicableAgents = remoteSelected.filter((agent) => !selectedAgents.includes(agent));
  return { selectedAgents, selectedTasks, missingAgents, notApplicableAgents };
}

const AUTO_RECOVERY_NOTE = 'AUTO_QUEUE_RECOVERY';
const TECHNICAL_HOLD_PATTERNS = [
  /incomplete implementation worktree preserved in quarantine/i,
  /blocked by failed dependency/i,
  /detached worker did not write terminal implementation evidence/i,
  /worker returned without terminal evidence/i,
  /cherry-pick .* conflict aborted/i,
  /Missing implementation evidence/i,
  /runner-created dependency/i,
  /runner root must be clean[\s\S]*(OBSERVER_FINDINGS_REPORT|docs\/ops\/evolution)/i,
  /Codex CLI usage capacity is exhausted/i,
];

export function requeueExpiredCapacityWaits(tasks, now = new Date()) {
  let changed = false;
  for (const task of tasks || []) {
    if (task.route_active === false || task.status !== 'WAITING_CAPACITY') continue;
    const retryAt = Date.parse(task.retry_after || task.evidence_gate?.retryAfter || '');
    if (!Number.isFinite(retryAt) || retryAt > now.getTime()) continue;
    const retryCount = Number(task.retry_count || 0) + 1;
    task.retry_count = retryCount;
    if (retryCount > 3) {
      task.status = 'WAITING_RUNNER';
      task.reason = 'automatic retry budget exhausted after 3 attempts; operator diagnosis required';
      task.retry_after = null;
      task.claimed_by = null;
      task.claimed_at = null;
      changed = true;
      continue;
    }
    task.status = 'pending';
    task.reason = 'Codex CLI capacity retry window reached; automatically requeued';
    task.claimed_by = null;
    task.claimed_at = null;
    task.completed_at = null;
    changed = true;
  }
  return changed;
}

export function selectAutomaticRedispatchCandidates(reports, tasks, options = {}) {
  const maxRecoveries = Number(options.maxAutoRecoveries || 2);
  const maxPerCycle = Number(options.maxAutoRedispatchPerCycle || 3);
  const tasksByBug = new Map();
  for (const task of tasks || []) {
    if (task.source !== 'bug-intake' || !task.source_bug_no || task.route_active === false) continue;
    const list = tasksByBug.get(task.source_bug_no) || [];
    list.push(task);
    tasksByBug.set(task.source_bug_no, list);
  }

  return (reports || []).flatMap((report) => {
    const payload = report?.repairTaskPayload || {};
    const approval = payload.agentExecutionApproval || {};
    const remoteStatus = String(report?.status || '');
    const repairStatus = String(report?.repairTaskStatus || '');
    if (!approval.approved || ['RESOLVED', 'CLOSED', 'REJECTED'].includes(remoteStatus)) return [];
    if (!['AGENT_APPROVED', 'HOLD'].includes(repairStatus)) return [];

    const localTasks = tasksByBug.get(report.bugNo) || [];
    if (localTasks.length === 0) return [];
    const generation = Number(payload.redispatchCount || 0);
    const currentTasks = localTasks.filter((task) => Number(task.redispatch_count || 0) === generation);
    if (currentTasks.length === 0 || currentTasks.some((task) => !FINISHED_STATUSES.has(task.status))) return [];
    const failedTasks = currentTasks.filter((task) => ['HOLD', 'hold', 'failed'].includes(task.status));
    if (failedTasks.length === 0) return [];
    if (failedTasks.some((task) => !TECHNICAL_HOLD_PATTERNS.some((pattern) => pattern.test(String(task.reason || ''))))) return [];

    const selectedAgents = selectedAgentsForReport(report, currentTasks);
    if (selectedAgents.length === 0 || selectedAgents.some((agent) => ['A6-Staging-Deploy-Runbook', 'A7-Final-QA-Gate'].includes(agent))) return [];
    const recoveryCount = (Array.isArray(payload.redispatchHistory) ? payload.redispatchHistory : [])
      .filter((item) => String(item?.note || '').startsWith(AUTO_RECOVERY_NOTE)).length;
    if (recoveryCount >= maxRecoveries) return [];
    return [{
      bugNo: report.bugNo,
      generation,
      selectedAgents,
      recoveryCount,
      reasons: [...new Set(failedTasks.map((task) => String(task.reason || '')).filter(Boolean))],
    }];
  }).slice(0, maxPerCycle);
}

async function recoverTechnicalGenerationDrift(args, childEnv) {
  if (!args.autoRecoverGenerationDrift) return { skipped: true, reason: 'automatic generation recovery disabled', candidates: [] };
  const reports = readLatestInboxReports(args);
  const tasks = readJson(TASKS_FILE, []);
  const candidates = selectAutomaticRedispatchCandidates(reports, tasks, args);
  if (args.dryRun || candidates.length === 0) {
    return { skipped: args.dryRun, reason: candidates.length ? 'dry-run' : 'no safe technical HOLD candidates', candidates, results: [] };
  }
  const token = childEnv[args.childTokenEnv] || process.env[args.tokenEnv] || args.token || '';
  const results = [];
  for (const candidate of candidates) {
    const endpoint = `${args.apiBase.replace(/\/$/, '')}/api/bug-intake/reports/${encodeURIComponent(candidate.bugNo)}/redispatch`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'REQUEUE',
        selectedAgents: candidate.selectedAgents,
        approvalScope: 'Automatic recovery is limited to runner-created technical HOLD evidence; original business approval and forbidden actions remain unchanged.',
        note: `${AUTO_RECOVERY_NOTE}: dependency symlink false-dirty/quarantine generation ${candidate.generation}`,
      }),
    });
    const body = await response.text();
    results.push({ bugNo: candidate.bugNo, ok: response.ok, status: response.status, body: body.slice(0, 1000) });
  }
  return { skipped: false, candidates, results };
}

function bugTaskConclusion(task) {
  if (task.status === 'SKIPPED_NOT_APPLICABLE' && task.evidence_gate?.passed === true) {
    return task.evidence_gate?.role === 'implementation_verified_existing'
      ? 'PASS_WITH_CONDITIONS'
      : 'NOT_APPLICABLE';
  }
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

function buildNotApplicableWritebackPayload(report, agent, summary, generation) {
  return {
    taskId: `${report.repairTaskNo || report.bugNo}-${agent}-NA-${generation}`,
    agent,
    conclusion: 'NOT_APPLICABLE',
    resultFile: `${summary?.outputDir || RUN_DIR}/latest-summary.md`,
    commitHash: '',
    changedFiles: [],
    validationResults: {
      aggregateBackfill: true,
      evidenceGate: {
        passed: true,
        role: 'not_applicable',
        reason: 'Agent was advisory in the original plan but was excluded by the refined executable route.',
      },
    },
    summary: `${agent} was not part of the refined executable route for this repair generation.`,
    nextAction: 'No action is required from this advisory Agent for the current repair generation.',
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
    const approvedHold = remoteRepairStatus === 'HOLD'
      && report?.repairTaskPayload?.agentExecutionApproval?.approved === true;
    if (!REMOTE_RUNNING_REPAIR_STATUSES.has(remoteRepairStatus) && !approvedHold) continue;
    if (['RESOLVED', 'CLOSED', 'REJECTED'].includes(remoteStatus)) continue;

    const localTasks = tasksByBug.get(report.bugNo) || [];
    if (localTasks.length === 0) {
      results.push({ bugNo: report.bugNo, skipped: true, reason: 'no local bug tasks' });
      continue;
    }

    const activeTasks = localTasks.filter((task) => task.route_active !== false);
    const maxRedispatch = activeTasks.length > 0
      ? Math.max(...activeTasks.map((task) => Number(task.redispatch_count || 0)))
      : 0;
    const currentRouteTasks = activeTasks.filter((task) => Number(task.redispatch_count || 0) === maxRedispatch);
    const { selectedAgents, selectedTasks, missingAgents, notApplicableAgents } = buildResultBackfillPlan(report, currentRouteTasks);
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
    for (const agent of notApplicableAgents) {
      const payload = buildNotApplicableWritebackPayload(report, agent, summary, maxRedispatch);
      posted.push({ task_id: payload.taskId, agent, ...(await postAgentResult(args, childEnv, report.bugNo, payload)) });
    }
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
| Evidence status reconciled | ${summary.evidenceReconciliation?.restored?.length || 0} |
| Reconciled commits integrated | ${(summary.reconciledIntegrations || []).filter((item) => item.ok).length} |
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

async function waitForWake(args, seconds) {
  const deadline = Date.now() + Math.max(0, Number(seconds || 0)) * 1000;
  while (Date.now() < deadline) {
    if (args.wakeFile && existsSync(args.wakeFile)) {
      let event = null;
      try { event = readJson(args.wakeFile, null); } catch { event = { reason: 'unreadable wake event' }; }
      try { rmSync(args.wakeFile); } catch { /* another cycle consumed it */ }
      return { wokeEarly: true, event };
    }
    await sleep(Math.min(1000, deadline - Date.now()));
  }
  return { wokeEarly: false };
}

function prepareTaskDispatch(task, args, blockedTasks) {
  const dependencySetup = ensureTaskWorktreeDependencies(task, args);
  if (!dependencySetup.ok) {
    blockedTasks.push({ task_id: task.task_id, agent: task.agent, status: 'BLOCKED', reason: `cannot prepare worktree dependencies: ${dependencySetup.error}` });
    return null;
  }
  if (!taskUsesMainRootLocalWorker(task)) {
    const unblock = unblockDirtyWorktree(task, args);
    if (['BLOCKED', 'HOLD'].includes(unblock.status) || (['WOULD_UNBLOCK', 'WOULD_QUARANTINE'].includes(unblock.status) && args.dryRun)) {
      if (!args.dryRun && unblock.status === 'BLOCKED' && /non-ops files|implementation worktree/i.test(unblock.reason || '')) {
        const dirtyFiles = gitStatusFiles(unblock.before);
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
      return null;
    }
  }
  return { task, dependencySetup };
}

async function finalizeWorkerDispatch(prepared, worker, args, childEnv, blockedTasks) {
  const { task, dependencySetup } = prepared;
  let finalTask = findTask(task.task_id);
  if (!args.dryRun && finalTask) {
    const restored = restoreVerifiedTerminalEvidence([finalTask]);
    if (restored.length > 0) {
      finalTask = patchTask(task.task_id, {
        status: restored[0].status,
        reason: 'terminal status restored from passed worker evidence before detached-worker recovery',
        evidence_reconciled_at: finalTask.evidence_reconciled_at,
        completed_at: finalTask.completed_at,
      }, { verifiedEvidenceRecovery: true }) || finalTask;
    }
  }
  const retryRuns = [];
  if (shouldRetryWorker(task, worker, finalTask, args)) {
    retryRuns.push({ reason: 'same-cycle retry suppressed; classified cooldown required', firstWorkerStatus: worker.status, firstFinalStatus: finalTask?.status || 'unknown' });
  }
  let leftovers = activeAgentProcesses();
  if (!args.dryRun && !isFinishedTask(finalTask) && leftovers.length > 0) {
    const childWait = await waitForAgentChildrenToExit(args, task);
    finalTask = findTask(task.task_id);
    leftovers = activeAgentProcesses();
    if (!isFinishedTask(finalTask) && childWait.timed_out) {
      blockedTasks.push({ task_id: task.task_id, agent: task.agent, status: 'BLOCKED', reason: 'agent child process remained active after wait', processes: leftovers });
      return { task, worker, finalTask, writeback: null, retryRuns, activeChildProcesses: leftovers, childWait, dependencySetup };
    }
    worker.childWait = childWait;
  }
  if (!args.dryRun && !isFinishedTask(finalTask)) {
    const recovery = recoverDetachedWorkerResult(task, args, worker, worker.childWait || null);
    worker.detachedRecovery = recovery;
    finalTask = recovery.task || finalTask;
    if (!isFinishedTask(finalTask)) {
      finalTask = patchTask(task.task_id, {
        status: 'HOLD',
        completed_at: new Date().toISOString(),
        reason: `worker returned without terminal evidence; recovery=${recovery.reason || 'failed'}; worker exit=${worker.status}; observed=${finalTask?.status || 'missing'}`,
      }) || finalTask;
    }
  }
  let writeback = null;
  const wbCommand = writebackCommand(task, finalTask, args);
  if (wbCommand && (!args.dryRun || finalTask?.result_file)) {
    writeback = run(wbCommand, { tokenEnv: args.tokenEnv, childTokenEnv: args.childTokenEnv, env: childEnv });
  }
  let implementationIntegration = { skipped: true, reason: 'worker runtime artifacts not committed', task: finalTask };
  const postWorkerCommit = { skipped: true, reason: 'audit artifacts are committed once at cycle end' };
  let postIntegrationCommit = { skipped: true, reason: 'no implementation integration' };
  implementationIntegration = integrateImplementationTask(task, finalTask, args);
  finalTask = implementationIntegration.task || finalTask;
  if (!implementationIntegration.skipped) postIntegrationCommit = { skipped: true, reason: 'audit artifacts are committed once at cycle end' };
  if (!args.dryRun && finalTask && !SUCCESS_STATUSES.has(finalTask.status)) {
    blockedTasks.push({ task_id: task.task_id, agent: task.agent, status: 'BLOCKED', reason: `worker reached non-success terminal status ${finalTask.status}` });
    appendOutboxRecord(path.join(args.outputDir, 'dead-letter.jsonl'), {
      id: createHash('sha256').update(`${task.task_id}|${finalTask.status}|${finalTask.redispatch_count || 0}`).digest('hex'),
      status: 'OPEN',
      task_id: task.task_id,
      bugNo: task.source_bug_no || null,
      agent: task.agent,
      terminal_status: finalTask.status,
      reason: finalTask.reason || 'worker ended without release-ready evidence',
      requires_human_gate: true,
    });
  }
  return { task, worker, finalTask, writeback, retryRuns, implementationIntegration, postIntegrationCommit, postWorkerCommit, dependencySetup };
}

function crashSummary(args, cycle, error) {
  const platformMetrics = computeRunnerMetrics(readJson(TASKS_FILE, []));
  const { generated_at: _metricsGeneratedAt, ...stablePlatformMetrics } = platformMetrics;
  writeJsonIfMateriallyChanged(resolveFile('docs/ops/runs/bug-runner-dashboard-latest.json'), {
    decision: 'HOLD',
    metrics: stablePlatformMetrics,
    current_activity: { worker_count: 0, blocked_count: 1 },
    runner_error: String(error.message || error).slice(0, 2000),
  });
  writeMd('docs/ops/runs/bug-runner-dashboard-latest.md', `# Bug Runner Platform Dashboard

- Decision: **HOLD**
- Queue total / active: ${platformMetrics.total} / ${platformMetrics.active}
- Current cycle workers / blocked: 0 / 1
- Runner error: ${String(error.message || error).slice(0, 2000)}
`);
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
  const resultReceiptBootstrap = args.dryRun
    ? { skipped: true, reason: 'dry-run' }
    : bootstrapResultDeliveryReceipts(args);
  const outboxRecovery = args.dryRun
    ? { skipped: true, reason: 'dry-run' }
    : await flushResultOutbox(args, childEnv);
  let sync = run(syncCommand(args), { tokenEnv: args.tokenEnv, childTokenEnv: args.childTokenEnv, env: childEnv });
  const evidenceReconciliation = sync.status === 0
    ? reconcileVerifiedWorkerEvidence(args)
    : { restored: [], wrote_queue: false, skipped: true, reason: 'sync failed' };
  const reconciledIntegrations = sync.status === 0
    ? integrateReconciledImplementations(args, evidenceReconciliation)
    : [];
  const generationRecovery = sync.status === 0
    ? await recoverTechnicalGenerationDrift(args, childEnv)
    : { skipped: true, reason: 'sync failed', candidates: [], results: [] };
  if (!args.dryRun && generationRecovery.results?.some((item) => item.ok)) {
    sync = run(syncCommand(args), { tokenEnv: args.tokenEnv, childTokenEnv: args.childTokenEnv, env: childEnv });
  }
  const evolutionCycle = runEvolutionCycle(args, cycle, generationRecovery);
  const preWorkerCommit = { skipped: true, reason: 'audit artifacts are committed once at cycle end' };
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

  const attemptedTaskIds = new Set();
  while (preExistingProcesses.length === 0 && workerRuns.length < args.maxTasks) {
    // Re-read after every batch so completed implementation work can unlock
    // its A2/A1 gates during the same resident cycle.
    const batch = planConcurrentTaskBatch(listRunnableBugTasks(args), {
      maxParallel: Math.min(args.parallelWorkers, args.maxTasks - workerRuns.length),
      attemptedTaskIds,
    });
    if (batch.length === 0) break;
    for (const task of batch) attemptedTaskIds.add(task.task_id);
    const prepared = batch
      .map((task) => prepareTaskDispatch(task, args, blockedTasks))
      .filter(Boolean);
    if (prepared.length === 0) {
      if (!args.skipBlocked) break;
      continue;
    }
    runnableTasks.push(...prepared.map((item) => item.task));
    const workers = await Promise.all(prepared.map(async (item) => ({
      prepared: item,
      worker: await runAsync(workerCommand(item.task, args), { timeoutMs: args.childTimeoutMs }),
    })));
    for (const item of workers) {
      workerRuns.push(await finalizeWorkerDispatch(item.prepared, item.worker, args, childEnv, blockedTasks));
    }
    if (!args.skipBlocked && blockedTasks.length > 0) break;
  }

  const platformMetrics = computeRunnerMetrics(readJson(TASKS_FILE, []));
  const platformHealth = runnerHealthDecision(platformMetrics);
  const { generated_at: _metricsGeneratedAt, ...stablePlatformMetrics } = platformMetrics;
  writeJsonIfMateriallyChanged(resolveFile('docs/ops/runs/bug-runner-dashboard-latest.json'), {
    decision: platformHealth,
    metrics: stablePlatformMetrics,
    current_activity: { worker_count: workerRuns.length, blocked_count: blockedTasks.length },
  });
  writeMd('docs/ops/runs/bug-runner-dashboard-latest.md', `# Bug Runner Platform Dashboard\n\n- Decision: **${platformHealth}**\n- Queue total / active: ${platformMetrics.total} / ${platformMetrics.active}\n- False completion: ${platformMetrics.false_complete_count}\n- Raw terminal evidence coverage: ${(platformMetrics.raw_terminal_evidence_coverage * 100).toFixed(1)}%\n- Governed evidence coverage: ${(platformMetrics.terminal_evidence_coverage * 100).toFixed(1)}%\n- Legacy evidence exemptions: ${platformMetrics.legacy_evidence_exemption_count}\n- Current cycle workers / blocked: ${workerRuns.length} / ${blockedTasks.length}\n`);
  const cycleAuditCommit = commitOpsRuntimeArtifacts(args);
  const releaseEvidence = releaseEvidenceForWorkerRuns(args, workerRuns);
  const push = runPushIfReady(args, workerRuns, releaseEvidence);
  const ci = await waitForGithubActionsIfRequested(args, push);
  const productionSmoke = runProductionSmokeIfReady(args, childEnv, push, ci, releaseEvidence);
  const auditPush = pushOpsAuditCommitsIfSafe(args, push);
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
    generationRecovery,
    evidenceReconciliation,
    reconciledIntegrations,
    evolutionCycle,
    resultReceiptBootstrap,
    outboxRecovery,
    leaseRecovery,
    preWorkerCommit,
    cycleAuditCommit,
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
    auditPush,
    ci,
    productionSmoke,
    releaseEvidence,
    headSha: currentHead(args.mainRoot),
    tokenSource: args.fixtureJson ? 'fixture' : args.token ? 'argument' : args.tokenEnv && process.env[args.tokenEnv] ? args.tokenEnv : `${args.loginUserEnv}/${args.loginPasswordEnv}`,
    outputDir: args.outputDir,
  };
  summary.platformMetrics = platformMetrics;
  summary.platformHealth = platformHealth;
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
      let summary = null;
      try {
        summary = await runCycle(args, cycle);
      } catch (error) {
        crashSummary(args, cycle, error);
        console.error(`ERROR: ${error.message}`);
        if (!args.watch) throw error;
      }
      if (args.watch && cycle < cycles) {
        const busy = (summary?.workerRuns?.length || 0) > 0 || (summary?.runnableTasks?.length || 0) > 0;
        await waitForWake(args, busy ? args.busyInterval : args.interval);
      }
    }
  } finally {
    releaseRunnerLock();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  });
}
