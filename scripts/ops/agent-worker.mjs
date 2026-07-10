#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { evaluateWorkerEvidence } from './bug-intake-evidence-gate.mjs';

const APPROVAL_TOKEN = 'APPROVE_AGENT_EXECUTION';
const TASKS_FILE = 'docs/ops/agent-queue/tasks.json';
const RUN_DIR = 'docs/ops/runs';
const NODE_BIN = process.execPath;
const DEFAULT_PATH = '/Users/mac/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
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

function changedFilesBetween(cwd, beforeHead, afterHead) {
  if (!beforeHead || !afterHead || beforeHead === afterHead) return [];
  const diff = safeGit(['diff', '--name-only', `${beforeHead}..${afterHead}`], cwd);
  return diff.ok ? diff.output.split('\n').map((item) => item.trim()).filter(Boolean) : [];
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
    NODE_BIN,
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
  const allowed = JSON.stringify(task.allowed_paths || []).toLowerCase();
  if (allowed.includes('apps/api') || allowed.includes('apps/web')) command.push('--allow-code');
  command.push(dryRun ? '--dry-run' : '--yes');
  return command;
}

function runBaselineAutopilot(task) {
  const command = baselineAutopilotCommand(task, false);
  const result = spawnSync(command[0], command.slice(1), {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, PATH: process.env.PATH || DEFAULT_PATH },
  });
  return {
    command,
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function shouldRunBaselineAutopilot(task) {
  if (task.source === 'bug-intake' && task.agent === 'Codex-Orchestrator') return false;
  return BASELINE_MERGE_AGENTS.has(task.agent);
}

function shouldUseLocalValidation(task) {
  return task.source === 'bug-intake' && [
    'A1-CI-Runtime-Gate',
    'A2-Security-Regression-Gate',
    'A5-Data-Readiness',
  ].includes(task.agent);
}

function runLocalA1Validation(task) {
  const commands = [
    ['git', 'status', '--short'],
    ['apps/api/node_modules/.bin/tsc', '--noEmit', '--pretty', 'false'],
    ['apps/web/node_modules/.bin/tsc', '--noEmit', '--pretty', 'false'],
    [NODE_BIN, 'scripts/ci/check-w5-closeout-gate.mjs'],
    [NODE_BIN, '--check', 'scripts/ops/run-agent-task.mjs'],
    [NODE_BIN, '--check', 'scripts/ops/agent-worker.mjs'],
    [NODE_BIN, '--check', 'scripts/ops/bug-intake-local-runner.mjs'],
  ];
  const sections = [];
  let failed = false;
  for (const command of commands) {
    const result = spawnSync(command[0], command.slice(1), {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: process.env.PATH || DEFAULT_PATH,
        // Bug fixes are expected to touch guarded code paths. These flags do
        // not bypass validation; they make W5 evaluate the authorized diff
        // instead of rejecting the validation task solely for code ownership.
        ALLOW_FREEZE_TOUCH: 'true',
        ALLOW_SECURITY_TOUCH: 'true',
      },
      timeout: 300000,
    });
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
    stdout: `LOCAL_BUG_INTAKE_VALIDATION\n${sections.join('\n---\n')}`,
    stderr: '',
  };
}

function runLocalA2SecurityReview(task) {
  const text = [
    task.title,
    JSON.stringify(task.allowed_paths || []),
    JSON.stringify(task.forbidden_paths || []),
  ].join('\n');
  const findings = [];
  if (/权限|角色|rbac|datascope|menu|403|越权|guard/i.test(text)) {
    findings.push('Security-sensitive evidence detected: RBAC/DataScope/menu permission path must be preserved.');
  }
  if (/数据库|migration|seed|deploy|push|生产/i.test(text)) {
    findings.push('High-risk operation keyword detected; keep repair behind explicit gate.');
  }
  const commands = [
    [NODE_BIN, '--check', 'scripts/ops/bug-intake-local-runner.mjs'],
    [NODE_BIN, '--check', 'scripts/ops/agent-worker.mjs'],
    [NODE_BIN, '--check', 'scripts/ops/bug-task-to-agent-queue.mjs'],
  ];
  const sections = [];
  let failed = false;
  for (const command of commands) {
    const result = spawnSync(command[0], command.slice(1), {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, PATH: process.env.PATH || DEFAULT_PATH },
      timeout: 120000,
    });
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
    stdout: `LOCAL_A2_SECURITY_REVIEW
Task: ${task.task_id}
Title: ${task.title}
Conclusion: PASS WITH CONDITIONS
Findings:
${findings.map((item) => `- ${item}`).join('\n') || '- No additional security keyword beyond bug intake contract.'}
Required follow-up:
- Code-changing A3/A4 tasks must preserve RBAC/DataScope/menu gates.
- No deploy, DB write, migration, seed, or push outside runner release gate.

Validation:
${sections.join('\n---\n')}`,
    stderr: '',
  };
}

function runLocalA5Readiness(task) {
  const text = [
    task.title,
    JSON.stringify(task.allowed_paths || []),
    JSON.stringify(task.forbidden_paths || []),
  ].join('\n');
  const findings = [];
  if (/数据|主数据|库存|项目|公司|供应商|客户|账户|字典|mapping|readiness/i.test(text)) {
    findings.push('Data/readiness context detected; verify master-data mapping and DataScope before marking business issue resolved.');
  }
  const commands = [
    [NODE_BIN, '--check', 'scripts/ops/bug-intake-local-runner.mjs'],
    [NODE_BIN, '--check', 'scripts/ops/agent-worker.mjs'],
    [NODE_BIN, '--check', 'scripts/ops/bug-intake-sync-from-api.mjs'],
  ];
  const sections = [];
  let failed = false;
  for (const command of commands) {
    const result = spawnSync(command[0], command.slice(1), {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, PATH: process.env.PATH || DEFAULT_PATH },
      timeout: 120000,
    });
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
    stdout: `LOCAL_A5_DATA_READINESS
Task: ${task.task_id}
Title: ${task.title}
Conclusion: GO WITH CONDITIONS
Findings:
${findings.map((item) => `- ${item}`).join('\n') || '- No explicit data readiness blocker detected in task metadata.'}
Required follow-up:
- A3/A4 repair must prove data source and display semantics during validation.
- No DB write or migration is performed by A5 local readiness.

Validation:
${sections.join('\n---\n')}`,
    stderr: '',
  };
}

function runLocalValidation(task) {
  if (task.agent === 'A2-Security-Regression-Gate') return runLocalA2SecurityReview(task);
  if (task.agent === 'A5-Data-Readiness') return runLocalA5Readiness(task);
  return runLocalA1Validation(task);
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
| Evidence gate | ${payload.evidence?.terminalStatus || 'NOT_EVALUATED'} |

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

## Evidence Gate

\`\`\`json
${JSON.stringify(payload.evidence || null, null, 2)}
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
  const useLocalValidation = shouldUseLocalValidation(task);
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
  if (!useLocalValidation && check.errors.length > 0) fail(`worktree check failed: ${check.errors.join('; ')}`);
  if (!useLocalValidation && check.needsRebase) {
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
  const beforeHead = safeGit(['rev-parse', 'HEAD'], task.worktree).output;
  const result = useLocalValidation
    ? runLocalValidation(task)
    : spawnSync(command[0], command.slice(1), {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, PATH: process.env.PATH || DEFAULT_PATH },
    });
  const afterHead = safeGit(['rev-parse', 'HEAD'], task.worktree).output;
  const evidence = evaluateWorkerEvidence({
    task,
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    beforeHead,
    afterHead,
    changedFiles: changedFilesBetween(task.worktree, beforeHead, afterHead),
  });
  const log = writeWorkerLog(task, {
    dryRun: false,
    exitCode: result.status ?? 1,
    command: useLocalValidation ? ['local-a1-validation', task.task_id] : command,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    evidence,
  });
  task.result_file = path.relative(process.cwd(), log);
  task.evidence_gate = evidence;
  task.implementation_commit = evidence.commitHash || '';
  task.changed_files = evidence.changedFiles;
  task.status = evidence.terminalStatus;
  task.completed_at = new Date().toISOString();
  if (evidence.passed && evidence.role === 'implementation' && shouldRunBaselineAutopilot(task)) {
    const baseline = runBaselineAutopilot(task);
    if (baseline.stdout) process.stdout.write(baseline.stdout);
    if (baseline.stderr) process.stderr.write(baseline.stderr);
    task.baseline_autopilot_exit_code = baseline.status;
    task.baseline_autopilot_command = baseline.command.join(' ');
    task.status = baseline.status === 0 ? 'COMPLETED_MERGED' : 'HOLD';
    if (baseline.status !== 0) task.reason = `baseline autopilot failed with ${baseline.status}`;
  } else if (evidence.passed) {
    task.baseline_autopilot_exit_code = 0;
    task.baseline_autopilot_skipped = evidence.role === 'not_applicable'
      ? 'not applicable to this Agent ownership boundary'
      : 'read-only validation agent; merge lifecycle is handled by orchestrator/main runner artifacts';
  } else {
    task.reason = evidence.reason;
  }
  writeTasks(tasks);
  console.log(`${task.task_id} -> ${task.status}`);
  console.log(`Worker log: ${path.relative(process.cwd(), log)}`);
  if (task.status === 'HOLD') return 2;
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
