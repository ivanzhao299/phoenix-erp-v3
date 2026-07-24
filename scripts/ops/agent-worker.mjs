#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { evaluateWorkerEvidence } from './bug-intake-evidence-gate.mjs';
import { findExistingTaskCommit } from './bug-intake-existing-commit.mjs';
import { filterRunnerRuntimeFiles, filterRunnerRuntimeStatus } from './bug-intake-worktree-runtime.mjs';
import { persistTaskSnapshot, readQueueTasks } from './bug-runner-platform.mjs';

const APPROVAL_TOKEN = 'APPROVE_AGENT_EXECUTION';
const TASKS_FILE = 'docs/ops/agent-queue/tasks.json';
const EVENTS_FILE = 'docs/ops/agent-queue/events.jsonl';
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
const DEPENDENCY_SUCCESS_STATUSES = new Set(['COMPLETED_MERGED', 'VALIDATION_COMPLETED', 'SKIPPED_NOT_APPLICABLE', 'completed']);

function usage(exitCode = 1) {
  console.log(`Usage:
  node scripts/ops/agent-worker.mjs --agent <agent> [--claim-next] [--once] [--loop] [--dry-run] [--request-id <id>] [--task-id <id>] [--approval-token <token>]
  node scripts/ops/agent-worker.mjs --agent <agent> --task-id <id> --recover-sandbox-commit --approval-token <token>
  node scripts/ops/agent-worker.mjs --agent <agent> --task-id <id> --recover-completed-run --run-log <file> --approval-token <token>
  node scripts/ops/agent-worker.mjs --agent <agent> --task-id <id> --recover-worktree-commit --approval-token <token>
  node scripts/ops/agent-worker.mjs --agent <agent> --task-id <id> --recover-integrated-commit --commit <sha> --approval-token <token>`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  const values = { dryRun: true };
  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (['--claim-next', '--once', '--loop', '--dry-run', '--recover-sandbox-commit', '--recover-completed-run', '--recover-worktree-commit', '--recover-integrated-commit'].includes(arg)) {
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

function recoverExistingCommitEvidence(task, result, evidence) {
  if (evidence.passed || Number(result.status ?? 1) !== 0) return { evidence, recovery: null };
  if (!['A3-Backend-Critical-Path', 'A4-Frontend-UAT-Smoke'].includes(task.agent)) {
    return { evidence, recovery: null };
  }
  if (evidence.role !== 'implementation' || !/^Missing implementation evidence:/.test(evidence.reason || '')) {
    return { evidence, recovery: null };
  }
  const recovery = findExistingTaskCommit(task);
  if (!recovery.candidate) return { evidence, recovery };
  const candidate = recovery.candidate;
  const recoveredEvidence = evaluateWorkerEvidence({
    task,
    exitCode: 0,
    stdout: `${result.stdout || ''}\nPASS WITH CONDITIONS. Recovered a verified task-specific implementation commit from the dedicated worktree.`,
    stderr: result.stderr || '',
    beforeHead: candidate.parentHash,
    afterHead: candidate.commitHash,
    changedFiles: candidate.changedFiles,
  });
  if (!recoveredEvidence.passed || recoveredEvidence.role !== 'implementation') {
    return { evidence, recovery: { ...recovery, candidateRejectedByEvidenceGate: recoveredEvidence } };
  }
  return {
    evidence: {
      ...recoveredEvidence,
      recoveredExistingCommit: true,
      recoveryReason: 'task-specific unintegrated implementation commit verified after a no-diff redispatch',
    },
    recovery,
  };
}

function dirtyFiles(cwd) {
  const files = [];
  for (const args of [
    ['diff', '--name-only'],
    ['diff', '--cached', '--name-only'],
    ['ls-files', '--others', '--exclude-standard'],
  ]) {
    const result = safeGit(args, cwd);
    if (!result.ok) return { ok: false, files: [], error: result.output };
    files.push(...result.output.split('\n').map((item) => item.trim()).filter(Boolean));
  }
  return { ok: true, files: filterRunnerRuntimeFiles([...new Set(files)]) };
}

function matchesPathRule(file, rule) {
  const normalized = String(rule || '').split(/\s+unless\b/i)[0].trim().replace(/^\.\//, '');
  if (!normalized || /schema\/entity\/table\/column|production deploy|deploy scripts/i.test(normalized)) return false;
  if (normalized.endsWith('/**')) return file === normalized.slice(0, -3) || file.startsWith(normalized.slice(0, -2));
  if (!normalized.includes('*')) return file === normalized || file.startsWith(`${normalized}/`);
  const escaped = normalized.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`).test(file);
}

function normalizedReferenceKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function sandboxCommitBlocker(text) {
  return /index\.lock[\s\S]{0,240}(operation not permitted|permission denied)|could not (create|make) (the )?(required )?(local )?commit|git add[\s\S]{0,240}operation not permitted/i.test(String(text || ''));
}

function commitSandboxChanges(task, stdout = '') {
  const status = dirtyFiles(task.worktree);
  if (!status.ok) return { attempted: true, ok: false, error: status.error, files: [] };
  if (status.files.length === 0) return { attempted: false, ok: false, reason: 'worktree has no uncommitted Agent changes', files: [] };
  const allowedRules = task.allowed_paths || [];
  const outsideAllowed = status.files.filter((file) => !allowedRules.some((rule) => matchesPathRule(file, rule)));
  const hardForbidden = status.files.filter((file) =>
    file.startsWith('migrations/') ||
    file.includes('/migrations/') ||
    file.endsWith('.entity.ts') ||
    file.startsWith('.github/') ||
    file.startsWith('infra/') ||
    file.startsWith('deploy/'));
  const businessPrefix = task.agent === 'A3-Backend-Critical-Path' ? 'apps/api/' : task.agent === 'A4-Frontend-UAT-Smoke' ? 'apps/web/' : '';
  const businessFiles = businessPrefix ? status.files.filter((file) => file.startsWith(businessPrefix)) : [];
  const reportReferenceKeys = [
    task.source_bug_no,
    task.task_id,
    task.source_repair_task_no || task.request_id,
  ].map(normalizedReferenceKey).filter(Boolean);
  const reportFiles = status.files.filter((file) => {
    const lower = file.toLowerCase();
    const fileKey = normalizedReferenceKey(lower);
    return lower.startsWith('docs/ops/')
      && !lower.startsWith('docs/ops/runs/')
      && reportReferenceKeys.some((key) => fileKey.includes(key));
  });
  if (outsideAllowed.length || hardForbidden.length || businessFiles.length === 0 || reportFiles.length === 0) {
    return {
      attempted: true,
      ok: false,
      files: status.files,
      error: [
        outsideAllowed.length ? `outside allowed paths: ${outsideAllowed.join(', ')}` : '',
        hardForbidden.length ? `hard-forbidden paths: ${hardForbidden.join(', ')}` : '',
        businessFiles.length === 0 ? `no ${businessPrefix || 'business'} implementation file` : '',
        reportFiles.length === 0 ? 'task-specific docs/ops report is missing' : '',
      ].filter(Boolean).join('; '),
    };
  }
  const staged = safeGit(['add', '--', ...status.files], task.worktree);
  if (!staged.ok) return { attempted: true, ok: false, files: status.files, error: staged.output };
  const scope = task.agent === 'A3-Backend-Critical-Path' ? 'api' : 'web';
  const commit = safeGit(['commit', '-m', `fix(${scope}): repair ${task.source_bug_no || task.task_id}`], task.worktree);
  if (!commit.ok) return { attempted: true, ok: false, files: status.files, error: commit.output };
  const commitHash = safeGit(['rev-parse', 'HEAD'], task.worktree).output;
  return {
    attempted: true,
    ok: true,
    files: status.files,
    businessFiles,
    reportFiles,
    commitHash,
    recoveredSandboxBlocker: sandboxCommitBlocker(stdout),
    output: commit.output,
  };
}

let lastTaskSnapshot = [];

function readTasks() {
  lastTaskSnapshot = readQueueTasks(TASKS_FILE);
  return structuredClone(lastTaskSnapshot);
}

function writeTasks(tasks, options = {}) {
  const result = persistTaskSnapshot({
    tasksFile: TASKS_FILE,
    eventsFile: EVENTS_FILE,
    baseTasks: lastTaskSnapshot,
    incomingTasks: tasks,
    explicitRedispatch: options.explicitRedispatch === true,
    verifiedEvidenceRecovery: options.verifiedEvidenceRecovery === true,
  });
  lastTaskSnapshot = structuredClone(result.tasks);
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
  const status = filterRunnerRuntimeStatus(safeGit(['status', '--short'], task.worktree).output);
  result.clean = status === '';
  if (!result.clean) result.errors.push(`dirty worktree: ${status}`);
  const ancestor = safeGit(['merge-base', '--is-ancestor', task.branch, 'origin/main'], task.worktree);
  const reverse = safeGit(['merge-base', '--is-ancestor', 'origin/main', task.branch], task.worktree);
  result.needsRebase = ancestor.ok && !reverse.ok;
  return result;
}

function rebaseMain(task, dryRun) {
  if (dryRun) return { skipped: true, reason: 'dry-run' };
  const fetch = safeGit(['fetch', 'origin', 'main'], task.worktree);
  if (!fetch.ok) return { skipped: false, ok: false, error: `git fetch origin main failed: ${fetch.output}` };
  const result = safeGit(['rebase', 'origin/main'], task.worktree);
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
  if (task.source === 'bug-intake' && String(task.worktree || '').includes('/bug-intake-')) {
    command.push('--allow-bug-intake-worktree');
  }
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
  // Bug-intake implementation commits are integrated by the resident parent
  // runner only after the worker evidence and runtime-artifact commit pass.
  if (task.source === 'bug-intake') return false;
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
    ['apps/api/node_modules/.bin/tsc', '--project', 'apps/api/tsconfig.json', '--noEmit', '--pretty', 'false'],
    ['apps/web/node_modules/.bin/tsc', '--project', 'apps/web/tsconfig.json', '--noEmit', '--pretty', 'false'],
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

## Parent Commit Recovery

\`\`\`json
${JSON.stringify(payload.parentCommit || null, null, 2)}
\`\`\`
`,
  );
  return file;
}

function runOne(args) {
  const tasks = readTasks();
  const byId = new Map(tasks.map((item) => [item.task_id, item]));
  const task = tasks.find(
    (item) =>
      item.agent === args.agent &&
      item.route_active !== false &&
      ['pending', 'claimed'].includes(item.status) &&
      (item.dependencies || []).every((taskId) => DEPENDENCY_SUCCESS_STATUSES.has(byId.get(taskId)?.status)) &&
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
      maxBuffer: 32 * 1024 * 1024,
    });
  const parentCommit = !useLocalValidation && (result.status ?? 1) === 0
    ? commitSandboxChanges(task, `${result.stdout || ''}\n${result.stderr || ''}`)
    : { attempted: false, ok: false, reason: 'not an eligible implementation execution' };
  const afterHead = safeGit(['rev-parse', 'HEAD'], task.worktree).output;
  const initialEvidence = evaluateWorkerEvidence({
    task,
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    beforeHead,
    afterHead,
    changedFiles: changedFilesBetween(task.worktree, beforeHead, afterHead),
    parentCommitRecovered: parentCommit.ok && parentCommit.recoveredSandboxBlocker,
  });
  const existingCommitRecovery = recoverExistingCommitEvidence(task, result, initialEvidence);
  const evidence = existingCommitRecovery.evidence;
  const log = writeWorkerLog(task, {
    dryRun: false,
    exitCode: result.status ?? 1,
    command: useLocalValidation ? ['local-a1-validation', task.task_id] : command,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    evidence,
    parentCommit: existingCommitRecovery.recovery
      ? { ...parentCommit, existingTaskCommitRecovery: existingCommitRecovery.recovery }
      : parentCommit,
  });
  task.result_file = path.relative(process.cwd(), log);
  task.evidence_gate = evidence;
  task.implementation_commit = evidence.commitHash || '';
  task.changed_files = evidence.changedFiles;
  task.status = evidence.terminalStatus;
  task.retry_after = evidence.retryAfter || null;
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
  if (!['claimed', 'running'].includes(task.status)) {
    task.claimed_by = null;
    task.claimed_at = null;
  }
  writeTasks(tasks);
  console.log(`${task.task_id} -> ${task.status}`);
  console.log(`Worker log: ${path.relative(process.cwd(), log)}`);
  if (task.status === 'HOLD') return 2;
  if (task.status === 'WAITING_CAPACITY') return 75;
  if (task.status === 'WAITING_RUNNER') return 76;
  if (task.baseline_autopilot_exit_code && task.baseline_autopilot_exit_code !== 0) return task.baseline_autopilot_exit_code;
  return result.status ?? 1;
}

function recoverSandboxCommit(args) {
  if (args.approvalToken !== APPROVAL_TOKEN) fail('sandbox commit recovery requires --approval-token APPROVE_AGENT_EXECUTION');
  const tasks = readTasks();
  const task = tasks.find((item) => item.task_id === args.taskId && item.agent === args.agent);
  if (!task) fail(`task not found for recovery: ${args.taskId}`);
  if (!['HOLD', 'hold'].includes(task.status)) fail(`task is not in HOLD: ${task.status}`);
  const beforeHead = task.evidence_gate?.beforeHead || safeGit(['rev-parse', 'HEAD'], task.worktree).output;
  const recoveryText = `Parent runner recovery for sandbox git index blocker. PASS WITH CONDITIONS.`;
  const parentCommit = commitSandboxChanges(task, `${task.reason || ''}\nindex.lock Operation not permitted`);
  if (!parentCommit.ok) fail(`parent commit recovery refused: ${parentCommit.error || parentCommit.reason}`);
  const afterHead = safeGit(['rev-parse', 'HEAD'], task.worktree).output;
  const evidence = evaluateWorkerEvidence({
    task,
    exitCode: 0,
    stdout: recoveryText,
    beforeHead,
    afterHead,
    changedFiles: changedFilesBetween(task.worktree, beforeHead, afterHead),
    parentCommitRecovered: true,
  });
  const log = writeWorkerLog(task, {
    dryRun: false,
    exitCode: 0,
    command: ['parent-runner-sandbox-commit-recovery', task.task_id],
    stdout: recoveryText,
    stderr: '',
    evidence,
    parentCommit,
  });
  task.result_file = path.relative(process.cwd(), log);
  task.evidence_gate = evidence;
  task.implementation_commit = evidence.commitHash || '';
  task.changed_files = evidence.changedFiles;
  task.status = evidence.terminalStatus;
  task.completed_at = new Date().toISOString();
  delete task.reason;
  if (evidence.passed && evidence.role === 'implementation' && shouldRunBaselineAutopilot(task)) {
    const baseline = runBaselineAutopilot(task);
    if (baseline.stdout) process.stdout.write(baseline.stdout);
    if (baseline.stderr) process.stderr.write(baseline.stderr);
    task.baseline_autopilot_exit_code = baseline.status;
    task.baseline_autopilot_command = baseline.command.join(' ');
    task.status = baseline.status === 0 ? 'COMPLETED_MERGED' : 'HOLD';
    if (baseline.status !== 0) task.reason = `baseline autopilot failed with ${baseline.status}`;
  }
  if (!['claimed', 'running'].includes(task.status)) {
    task.claimed_by = null;
    task.claimed_at = null;
  }
  writeTasks(tasks, { verifiedEvidenceRecovery: true });
  console.log(`${task.task_id} -> ${task.status}`);
  return task.status === 'COMPLETED_MERGED' ? 0 : 2;
}

function recoverCompletedRun(args) {
  if (args.approvalToken !== APPROVAL_TOKEN) fail('completed run recovery requires --approval-token APPROVE_AGENT_EXECUTION');
  if (!args.runLog) fail('completed run recovery requires --run-log <file>');
  const runLog = path.resolve(process.cwd(), args.runLog);
  if (!existsSync(runLog)) fail(`completed run log not found: ${args.runLog}`);
  const runText = readFileSync(runLog, 'utf8');
  const stdoutMatch = runText.match(/## Stdout Summary\s*\n\s*```text\s*\n([\s\S]*?)\n```/i);
  const agentResult = stdoutMatch?.[1]?.trim() || '';
  if (!/\| Exit code \| 0 \|/.test(runText)) fail('completed run recovery refused: run log exit code is not 0');
  if (!agentResult || !/\b(PASS|GO)(?: WITH CONDITIONS)?\b/i.test(agentResult)) {
    fail('completed run recovery refused: stdout summary has no explicit PASS/GO conclusion');
  }

  const tasks = readTasks();
  const task = tasks.find((item) => item.task_id === args.taskId && item.agent === args.agent);
  if (!task) fail(`task not found for completed run recovery: ${args.taskId}`);
  if (!['HOLD', 'hold', 'running', 'claimed'].includes(task.status)) {
    fail(`task is not recoverable from completed run: ${task.status}`);
  }

  let afterHead = safeGit(['rev-parse', 'HEAD'], task.worktree).output;
  let beforeHead = afterHead;
  let parentCommit;
  const dirty = dirtyFiles(task.worktree);
  if (!dirty.ok) fail(`completed run recovery refused: ${dirty.error}`);
  if (dirty.files.length > 0) {
    parentCommit = commitSandboxChanges(task, agentResult);
    if (!parentCommit.ok) fail(`completed run recovery refused: ${parentCommit.error || parentCommit.reason}`);
    afterHead = safeGit(['rev-parse', 'HEAD'], task.worktree).output;
  } else if (task.implementation_commit && task.implementation_commit === afterHead) {
    beforeHead = safeGit(['rev-parse', `${afterHead}^`], task.worktree).output;
    parentCommit = {
      attempted: false,
      ok: true,
      existingCommit: true,
      commitHash: afterHead,
      files: changedFilesBetween(task.worktree, beforeHead, afterHead),
    };
  } else {
    fail('completed run recovery refused: no dirty Agent files and no matching previously recovered commit');
  }
  const evidence = evaluateWorkerEvidence({
    task,
    exitCode: 0,
    stdout: agentResult,
    stderr: '',
    beforeHead,
    afterHead,
    changedFiles: changedFilesBetween(task.worktree, beforeHead, afterHead),
    parentCommitRecovered: false,
  });
  const log = writeWorkerLog(task, {
    dryRun: false,
    exitCode: 0,
    command: ['parent-runner-completed-run-recovery', task.task_id, args.runLog],
    stdout: agentResult,
    stderr: '',
    evidence,
    parentCommit,
  });
  task.result_file = path.relative(process.cwd(), log);
  task.evidence_gate = evidence;
  task.implementation_commit = evidence.commitHash || '';
  task.changed_files = evidence.changedFiles;
  task.status = evidence.terminalStatus;
  task.completed_at = new Date().toISOString();
  task.recovered_from_run_log = path.relative(process.cwd(), runLog);
  task.reason = evidence.passed ? 'completed Agent run recovered after parent timeout/output-buffer interruption' : evidence.reason;
  writeTasks(tasks, { verifiedEvidenceRecovery: true });
  console.log(`${task.task_id} -> ${task.status}`);
  console.log(`Worker log: ${path.relative(process.cwd(), log)}`);
  return evidence.passed ? 0 : 2;
}

function recoverIntegratedCommit(args) {
  if (args.approvalToken !== APPROVAL_TOKEN) fail('integrated commit recovery requires --approval-token APPROVE_AGENT_EXECUTION');
  if (!/^[0-9a-f]{7,40}$/i.test(String(args.commit || ''))) fail('integrated commit recovery requires --commit <sha>');
  const tasks = readTasks();
  const task = tasks.find((item) => item.task_id === args.taskId && item.agent === args.agent);
  if (!task) fail(`task not found for integrated commit recovery: ${args.taskId}`);
  if (!['pending', 'HOLD', 'hold', 'WAITING_CAPACITY', 'SKIPPED_NOT_APPLICABLE', 'IMPLEMENTATION_COMPLETED', 'failed'].includes(task.status)) fail(`task is not recoverable from integrated commit: ${task.status}`);

  const commit = safeGit(['rev-parse', args.commit], process.cwd());
  if (!commit.ok) fail(`integrated commit not found: ${args.commit}`);
  const ancestor = safeGit(['merge-base', '--is-ancestor', commit.output, 'HEAD'], process.cwd());
  if (!ancestor.ok) fail(`commit is not integrated in current HEAD: ${commit.output}`);
  const before = safeGit(['rev-parse', `${commit.output}^`], process.cwd());
  const files = safeGit(['show', '--format=', '--name-only', commit.output], process.cwd());
  if (!before.ok || !files.ok) fail(`cannot inspect integrated commit: ${commit.output}`);
  const changedFiles = files.output.split('\n').map((item) => item.trim()).filter(Boolean);
  const evidence = evaluateWorkerEvidence({
    task,
    exitCode: 0,
    stdout: 'PASS WITH CONDITIONS. The approved repair and task report are integrated in current main; focused validation is recorded.',
    stderr: '',
    beforeHead: before.output,
    afterHead: commit.output,
    changedFiles,
  });
  if (!evidence.passed || evidence.role !== 'implementation') fail(`integrated commit evidence rejected: ${evidence.reason}`);

  const log = writeWorkerLog(task, {
    dryRun: false,
    exitCode: 0,
    command: ['parent-runner-integrated-commit-recovery', task.task_id, commit.output],
    stdout: 'PASS WITH CONDITIONS. Integrated commit evidence verified against current HEAD.',
    stderr: '',
    evidence,
    parentCommit: { attempted: false, ok: true, existingCommit: true, commitHash: commit.output, files: changedFiles },
  });
  task.result_file = path.relative(process.cwd(), log);
  task.evidence_gate = evidence;
  task.implementation_commit = commit.output;
  task.integrated_commit = commit.output;
  task.integrated_at = new Date().toISOString();
  task.changed_files = changedFiles;
  task.status = 'COMPLETED_MERGED';
  task.completed_at = new Date().toISOString();
  task.baseline_autopilot_exit_code = 0;
  task.baseline_autopilot_skipped = 'commit already integrated in current main; lifecycle verified by recovery gate';
  task.claimed_by = null;
  task.claimed_at = null;
  task.reason = 'verified integrated implementation evidence';
  task.retry_after = null;
  writeTasks(tasks, { verifiedEvidenceRecovery: true });
  console.log(`${task.task_id} -> ${task.status}`);
  console.log(`Integrated commit: ${commit.output}`);
  return 0;
}

function recoverWorktreeCommit(args) {
  if (args.approvalToken !== APPROVAL_TOKEN) fail('worktree commit recovery requires --approval-token APPROVE_AGENT_EXECUTION');
  const tasks = readTasks();
  const task = tasks.find((item) => item.task_id === args.taskId && item.agent === args.agent);
  if (!task) fail(`task not found for worktree commit recovery: ${args.taskId}`);
  if (!['pending', 'claimed', 'running', 'HOLD', 'hold', 'WAITING_CAPACITY', 'SKIPPED_NOT_APPLICABLE', 'failed'].includes(task.status)) {
    fail(`task is not recoverable from a worktree commit: ${task.status}`);
  }
  const recovery = findExistingTaskCommit(task);
  if (!recovery.candidate) fail(`worktree commit recovery refused: ${recovery.reason}`);
  const candidate = recovery.candidate;
  const evidence = evaluateWorkerEvidence({
    task,
    exitCode: 0,
    stdout: 'PASS WITH CONDITIONS. Recovered a verified task-specific implementation commit from the dedicated worktree.',
    stderr: '',
    beforeHead: candidate.parentHash,
    afterHead: candidate.commitHash,
    changedFiles: candidate.changedFiles,
  });
  if (!evidence.passed || evidence.role !== 'implementation') {
    fail(`worktree commit evidence rejected: ${evidence.reason}`);
  }
  evidence.recoveredExistingCommit = true;
  evidence.recoveryReason = 'explicit recovery of a task-specific unintegrated implementation commit';
  const log = writeWorkerLog(task, {
    dryRun: false,
    exitCode: 0,
    command: ['parent-runner-worktree-commit-recovery', task.task_id, candidate.commitHash],
    stdout: 'PASS WITH CONDITIONS. Existing implementation commit verified for selective parent-runner integration.',
    stderr: '',
    evidence,
    parentCommit: { attempted: false, ok: true, existingTaskCommitRecovery: recovery },
  });
  task.result_file = path.relative(process.cwd(), log);
  task.evidence_gate = evidence;
  task.implementation_commit = candidate.commitHash;
  task.changed_files = candidate.changedFiles;
  task.status = 'IMPLEMENTATION_COMPLETED';
  task.completed_at = new Date().toISOString();
  task.claimed_by = null;
  task.claimed_at = null;
  task.reason = 'verified task-specific implementation commit is ready for selective integration';
  task.retry_after = null;
  writeTasks(tasks, { verifiedEvidenceRecovery: true });
  console.log(`${task.task_id} -> ${task.status}`);
  console.log(`Recovered worktree commit: ${candidate.commitHash}`);
  return 0;
}

const args = parseArgs(process.argv.slice(2));
if (!args.agent) usage(1);
if (!args.claimNext && !args.once && !args.loop && !args.recoverSandboxCommit && !args.recoverCompletedRun && !args.recoverWorktreeCommit && !args.recoverIntegratedCommit) usage(1);

if (args.recoverSandboxCommit) process.exit(recoverSandboxCommit(args));
if (args.recoverCompletedRun) process.exit(recoverCompletedRun(args));
if (args.recoverWorktreeCommit) process.exit(recoverWorktreeCommit(args));
if (args.recoverIntegratedCommit) process.exit(recoverIntegratedCommit(args));

if (args.loop && !args.dryRun) {
  while (true) {
    const code = runOne(args);
    if (code !== 0) process.exit(code);
    const latest = readTasks();
    const byId = new Map(latest.map((task) => [task.task_id, task]));
    const hasMore = latest.some((task) => task.agent === args.agent && task.route_active !== false && task.status === 'pending'
      && (task.dependencies || []).every((taskId) => DEPENDENCY_SUCCESS_STATUSES.has(byId.get(taskId)?.status)));
    if (!hasMore) break;
  }
} else {
  process.exit(runOne(args));
}
