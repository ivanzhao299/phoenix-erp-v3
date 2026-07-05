#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const APPROVAL_TOKEN = 'APPROVE_AGENT_EXECUTION';
const TASKS_FILE = 'docs/ops/agent-queue/tasks.json';
const RUN_DIR = 'docs/ops/runs';
const BASELINE_MERGE_AGENTS = new Set([
  'Codex-Orchestrator',
  'A3-Backend-Critical-Path',
  'A4-Frontend-UAT-Smoke',
  'A6-Staging-Deploy-Runbook',
  'A7-Final-QA-Gate',
]);

function usage(exitCode = 1) {
  console.log(`Usage:
  node scripts/ops/agent-worker.mjs --agent <agent> [--claim-next] [--once] [--loop] [--dry-run] [--request-id <id>] [--task-id <id>] [--approval-token <token>]`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  const values = { dryRun: true };
  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (['--claim-next', '--once', '--loop', '--dry-run'].includes(arg)) {
      values[arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = true;
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

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function runGit(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function safeGit(args, cwd) {
  try {
    return { ok: true, output: runGit(args, cwd) };
  } catch (error) {
    return { ok: false, output: error.stderr?.toString() || error.message };
  }
}

function readTasks() {
  if (!existsSync(TASKS_FILE)) return [];
  return JSON.parse(readFileSync(TASKS_FILE, 'utf8'));
}

function writeTasks(tasks) {
  writeFileSync(TASKS_FILE, `${JSON.stringify(tasks, null, 2)}\n`);
}

function checkWorktree(task) {
  const result = {
    exists: existsSync(task.worktree),
    branch: null,
    clean: false,
    needsRebase: false,
    rebased: false,
    errors: [],
  };
  if (!result.exists) {
    result.errors.push('worktree does not exist');
    return result;
  }
  const inside = safeGit(['rev-parse', '--is-inside-work-tree'], task.worktree);
  if (!inside.ok || inside.output !== 'true') result.errors.push('not a git worktree');
  result.branch = safeGit(['branch', '--show-current'], task.worktree).output;
  if (result.branch !== task.branch) result.errors.push(`wrong branch: ${result.branch}`);
  const status = safeGit(['status', '--short'], task.worktree).output;
  result.clean = status === '';
  if (!result.clean) result.errors.push(`dirty worktree: ${status}`);
  const ancestor = safeGit(['merge-base', '--is-ancestor', task.branch, 'main'], task.worktree);
  const reverse = safeGit(['merge-base', '--is-ancestor', 'main', task.branch], task.worktree);
  result.needsRebase = ancestor.ok && !reverse.ok;
  return result;
}

function rebaseMain(task, dryRun) {
  if (dryRun) return { skipped: true, reason: 'dry-run' };
  const result = safeGit(['rebase', 'main'], task.worktree);
  return result.ok ? { skipped: false, ok: true } : { skipped: false, ok: false, error: result.output };
}

function commandForTask(task, dryRun, approvalToken) {
  const assembled = path.join(RUN_DIR, `${task.task_id}-worker-assembled-prompt.md`);
  const command = [
    'node',
    'scripts/ops/run-agent-task.mjs',
    '--agent',
    task.agent,
    '--worktree',
    task.worktree,
    '--prompt',
    task.prompt_file,
  ];
  if (task.request_spec) command.push('--request-spec', task.request_spec);
  if (task.contract_file) command.push('--task-contract', task.contract_file);
  command.push('--assembled-prompt-output', assembled);
  if (dryRun) command.push('--dry-run');
  else command.push('--require-approval-token', approvalToken, '--skip-baseline-autopilot', '--allow-ops-runtime-dirty');
  return command;
}

function baselineAutopilotCommand(task, dryRun = true) {
  return [
    'node',
    'scripts/ops/agent-baseline-autopilot.mjs',
    '--agent',
    task.agent,
    '--branch',
    task.branch,
    '--worktree',
    task.worktree,
    '--max-retries',
    '3',
    dryRun ? '--dry-run' : '--yes',
  ];
}

function runBaselineAutopilot(task) {
  const command = baselineAutopilotCommand(task, false);
  const result = spawnSync(command[0], command.slice(1), { cwd: process.cwd(), encoding: 'utf8' });
  return {
    command,
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function shouldRunBaselineAutopilot(task) {
  return BASELINE_MERGE_AGENTS.has(task.agent);
}

function shouldUseLocalValidation(task) {
  return task.agent === 'A1-CI-Runtime-Gate' && task.source === 'bug-intake';
}

function runLocalA1Validation(task) {
  const commands = [
    ['git', '-C', task.worktree, 'status', '--short'],
    ['node', '--check', 'scripts/ops/run-agent-task.mjs'],
    ['node', '--check', 'scripts/ops/agent-worker.mjs'],
    ['node', '--check', 'scripts/ops/bug-intake-local-runner.mjs'],
  ];
  const sections = [];
  let failed = false;
  for (const command of commands) {
    const result = spawnSync(command[0], command.slice(1), { cwd: process.cwd(), encoding: 'utf8', timeout: 120000 });
    const status = result.status ?? 1;
    if (status !== 0) failed = true;
    sections.push(`$ ${command.join(' ')}
exit: ${status}
stdout:
${result.stdout || ''}
stderr:
${result.stderr || ''}`);
  }
  return {
    status: failed ? 1 : 0,
    stdout: `LOCAL_A1_VALIDATION\n${sections.join('\n---\n')}`,
    stderr: '',
  };
}

function writeWorkerLog(task, payload) {
  mkdirSync(RUN_DIR, { recursive: true });
  const file = path.join(RUN_DIR, `${task.task_id}-worker-log.md`);
  writeFileSync(
    file,
    `# Agent Worker Log

| Field | Value |
| --- | --- |
| Task ID | ${task.task_id} |
| Agent | ${task.agent} |
| Dry run | ${payload.dryRun ? 'Yes' : 'No'} |
| Exit code | ${payload.exitCode} |

## Command

\`\`\`bash
${payload.command.join(' ')}
\`\`\`

## Stdout

\`\`\`text
${payload.stdout || ''}
\`\`\`

## Stderr

\`\`\`text
${payload.stderr || ''}
\`\`\`
`,
  );
  return file;
}

function runOne(args) {
  const tasks = readTasks();
  const task = tasks.find(
    (item) =>
      item.agent === args.agent &&
      ['pending', 'claimed'].includes(item.status) &&
      (!args.requestId || item.request_id === args.requestId) &&
      (!args.taskId || item.task_id === args.taskId),
  );
  if (!task) {
    console.log(`No runnable task for ${args.agent}.`);
    return 0;
  }
  const check = checkWorktree(task);
  const command = commandForTask(task, args.dryRun, args.approvalToken);
  if (args.dryRun) {
    console.log(`Dry-run worker would claim and run: ${task.task_id}`);
    console.log(`Worktree check: ${check.errors.length ? `WARN ${check.errors.join('; ')}` : 'PASS'}`);
    if (check.needsRebase) console.log('Dry-run: worktree is behind main and would be rebased before execution.');
    console.log(`Command: ${command.join(' ')}`);
    console.log('baseline autopilot will run after agent completion');
    console.log('user manual rebase required: false');
    console.log('user manual merge required: false');
    console.log('user manual docs/ops/runs cleanup required: false');
    console.log(`Baseline autopilot: ${baselineAutopilotCommand(task, true).join(' ')}`);
    return 0;
  }
  if (args.approvalToken !== APPROVAL_TOKEN) fail('real worker execution requires --approval-token APPROVE_AGENT_EXECUTION');
  if (check.errors.length > 0) fail(`worktree check failed: ${check.errors.join('; ')}`);
  if (check.needsRebase) {
    const rebase = rebaseMain(task, false);
    if (rebase.ok === false) {
      task.status = 'hold';
      task.reason = `git rebase main failed: ${rebase.error}`;
      writeTasks(tasks);
      fail(`git rebase main failed; task moved to hold: ${rebase.error}`);
    }
  }
  task.status = 'running';
  task.claimed_by = args.agent;
  task.claimed_at = new Date().toISOString();
  writeTasks(tasks);
  const useLocalValidation = shouldUseLocalValidation(task);
  const result = useLocalValidation
    ? runLocalA1Validation(task)
    : spawnSync(command[0], command.slice(1), { cwd: process.cwd(), encoding: 'utf8' });
  const log = writeWorkerLog(task, {
    dryRun: false,
    exitCode: result.status ?? 1,
    command: useLocalValidation ? ['local-a1-validation', task.task_id] : command,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  });
  task.result_file = path.relative(process.cwd(), log);
  task.status = (result.status ?? 1) === 0 ? 'completed' : 'failed';
  task.completed_at = new Date().toISOString();
  if ((result.status ?? 1) === 0 && shouldRunBaselineAutopilot(task)) {
    const baseline = runBaselineAutopilot(task);
    if (baseline.stdout) process.stdout.write(baseline.stdout);
    if (baseline.stderr) process.stderr.write(baseline.stderr);
    task.baseline_autopilot_exit_code = baseline.status;
    task.baseline_autopilot_command = baseline.command.join(' ');
    task.status = baseline.status === 0 ? 'COMPLETED_MERGED' : 'HOLD';
    if (baseline.status !== 0) task.reason = `baseline autopilot failed with ${baseline.status}`;
  } else if ((result.status ?? 1) === 0) {
    task.baseline_autopilot_exit_code = 0;
    task.baseline_autopilot_skipped = 'read-only validation agent; merge lifecycle is handled by orchestrator/main runner artifacts';
  }
  writeTasks(tasks);
  console.log(`${task.task_id} -> ${task.status}`);
  console.log(`Worker log: ${path.relative(process.cwd(), log)}`);
  if (task.baseline_autopilot_exit_code && task.baseline_autopilot_exit_code !== 0) return task.baseline_autopilot_exit_code;
  return result.status ?? 1;
}

const args = parseArgs(process.argv.slice(2));
if (!args.agent) usage(1);
if (!args.claimNext && !args.once && !args.loop) usage(1);

if (args.loop && !args.dryRun) {
  while (true) {
    const code = runOne(args);
    if (code !== 0) process.exit(code);
    const hasMore = readTasks().some((task) => task.agent === args.agent && task.status === 'pending');
    if (!hasMore) break;
  }
} else {
  process.exit(runOne(args));
}
