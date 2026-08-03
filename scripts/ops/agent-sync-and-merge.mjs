#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { isStaticAgentBranch } from './agent-task-workspace.mjs';

const MAIN_ROOT = process.env.PHOENIX_ERP_MAIN_ROOT || process.cwd();
const RUN_ARTIFACT_PREFIX = 'docs/ops/runs/';
const RUN_ARTIFACT_COMMIT = 'docs(ops): record generated ops run artifacts';

function usage(exitCode = 1) {
  console.log(`Usage:
  node scripts/ops/agent-sync-and-merge.mjs <branch> [--dry-run] [--yes] [--allow-code] [--schema-gate <request-id>] [--staging-bootstrap] [--auto-commit-runs] [--skip-auto-commit-runs]

Examples:
  node scripts/ops/agent-sync-and-merge.mjs w5-codex-orchestrator --dry-run
  node scripts/ops/agent-sync-and-merge.mjs w5-codex-orchestrator --yes
  node scripts/ops/agent-sync-and-merge.mjs codex/task/bugtask-20260728-0001-a3/g1/a3 --allow-code --dry-run
  node scripts/ops/agent-sync-and-merge.mjs w5-codex-orchestrator --staging-bootstrap --dry-run`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  const values = {
    dryRun: true,
    autoCommitRuns: true,
  };
  values.branch = normalized.find((arg) => !arg.startsWith('--'));
  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--dry-run') values.dryRun = true;
    else if (arg === '--yes') {
      values.yes = true;
      values.dryRun = false;
    } else if (arg === '--allow-code') values.allowCode = true;
    else if (arg === '--staging-bootstrap') values.stagingBootstrap = true;
    else if (arg === '--auto-commit-runs') values.autoCommitRuns = true;
    else if (arg === '--skip-auto-commit-runs') values.autoCommitRuns = false;
    else if (arg === '--schema-gate') {
      values.schemaGate = normalized[i + 1];
      i += 1;
    }
  }
  return values;
}

function fail(message, extra = {}) {
  console.error(`ERROR: ${message}`);
  for (const [key, value] of Object.entries(extra)) {
    if (value) console.error(`${key}: ${value}`);
  }
  process.exit(1);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf8',
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function safe(command, args, options = {}) {
  try {
    return { ok: true, output: run(command, args, options) };
  } catch (error) {
    return { ok: false, output: error.stderr?.toString() || error.message };
  }
}

function statusEntries(cwd) {
  const output = run('git', ['status', '--short'], { cwd });
  if (!output) return [];
  return output.split('\n').filter(Boolean).map((line) => ({
    raw: line,
    path: line.slice(3).trim(),
  }));
}

function allRunArtifacts(entries) {
  return entries.length > 0 && entries.every((entry) => entry.path.startsWith(RUN_ARTIFACT_PREFIX));
}

function findWorktree(branch) {
  const output = run('git', ['worktree', 'list', '--porcelain'], { cwd: MAIN_ROOT });
  const records = output.split('\n\n').filter(Boolean);
  for (const record of records) {
    const lines = Object.fromEntries(
      record.split('\n').map((line) => {
        const [key, ...rest] = line.split(' ');
        return [key, rest.join(' ')];
      }),
    );
    if (lines.branch === `refs/heads/${branch}`) return lines.worktree;
  }
  return null;
}

function conflictFiles(cwd) {
  const output = safe('git', ['diff', '--name-only', '--diff-filter=U'], { cwd });
  return output.output || '';
}

function scriptPath(script) {
  const local = `${MAIN_ROOT}/${script}`;
  if (existsSync(local)) return script;
  return `${process.cwd()}/${script}`;
}

const args = parseArgs(process.argv.slice(2));
if (!args.branch) usage(1);
if (!args.dryRun && isStaticAgentBranch(args.branch)) {
  fail('canonical Agent branches are template-only; merge a task-generation branch through agent-auto-merge.mjs');
}

if (process.cwd() !== MAIN_ROOT) {
  fail(`must run from ${MAIN_ROOT}`, { current: process.cwd() });
}

const inside = safe('git', ['rev-parse', '--is-inside-work-tree'], { cwd: MAIN_ROOT });
if (!inside.ok || inside.output !== 'true') fail('main root is not a git repository');

const currentBranch = run('git', ['branch', '--show-current'], { cwd: MAIN_ROOT });
if (currentBranch !== 'main') fail(`current branch must be main, got ${currentBranch || '(detached)'}`);

let mainStatus = statusEntries(MAIN_ROOT);
let autoCommittedRuns = false;
let pendingRunArtifactCommit = false;
if (mainStatus.length > 0) {
  if (!allRunArtifacts(mainStatus)) {
    fail('main worktree dirty with non docs/ops/runs files', {
      status: mainStatus.map((entry) => entry.raw).join('\n'),
    });
  }
  if (!args.autoCommitRuns) {
    fail('main has docs/ops/runs artifacts and --skip-auto-commit-runs was set', {
      status: mainStatus.map((entry) => entry.raw).join('\n'),
    });
  }
  if (args.dryRun) {
    pendingRunArtifactCommit = true;
    console.log('Main has generated docs/ops/runs artifacts. Dry-run: would auto-commit them.');
    console.log(mainStatus.map((entry) => entry.raw).join('\n'));
  } else {
    run('git', ['add', ...mainStatus.map((entry) => entry.path)], { cwd: MAIN_ROOT });
    run('git', ['commit', '-m', RUN_ARTIFACT_COMMIT], { cwd: MAIN_ROOT, stdio: 'inherit' });
    autoCommittedRuns = true;
  }
}

mainStatus = statusEntries(MAIN_ROOT);
if (mainStatus.length > 0 && !args.dryRun) {
  fail('main worktree is still dirty after run artifact handling', {
    status: mainStatus.map((entry) => entry.raw).join('\n'),
  });
}

const worktree = findWorktree(args.branch);
if (!worktree) fail(`no worktree found for branch ${args.branch}`);

const targetStatus = statusEntries(worktree);
if (targetStatus.length > 0) {
  fail('target worktree is dirty; refusing automatic rebase', {
    worktree,
    status: targetStatus.map((entry) => entry.raw).join('\n'),
  });
}

console.log(`Main root: ${MAIN_ROOT}`);
console.log(`Target branch: ${args.branch}`);
console.log(`Target worktree: ${worktree}`);
console.log(`Mode: ${args.dryRun ? 'dry-run' : 'yes'}`);

if (args.dryRun) {
  console.log(`Dry-run: would run git rebase main in ${worktree}`);
} else {
  const rebase = safe('git', ['rebase', 'main'], { cwd: worktree });
  if (!rebase.ok) {
    fail('git rebase main failed; manual intervention required', {
      worktree,
      conflicts: conflictFiles(worktree),
      next: 'Run git rebase --continue or git rebase --abort in the target worktree.',
      error: rebase.output,
    });
  }
  console.log('Rebase completed.');
}

const mergeCommand = [
  'node',
  scriptPath('scripts/ops/merge-agent-to-main.mjs'),
  args.branch,
  args.dryRun ? '--dry-run' : '--yes',
];
if (args.allowCode) mergeCommand.push('--allow-code');
if (args.stagingBootstrap) mergeCommand.push('--staging-bootstrap');
if (args.schemaGate) mergeCommand.push('--schema-gate', args.schemaGate);

console.log(`Merge preflight command: ${mergeCommand.join(' ')}`);
if (args.dryRun && pendingRunArtifactCommit) {
  console.log('Dry-run: merge preflight would run after committing docs/ops/runs artifacts.');
  console.log('\nSummary:');
  console.log('Auto-committed docs/ops/runs: Would commit');
  console.log('Real merge executed: No');
  console.log('Push executed: No');
  console.log('Deploy executed: No');
  console.log('Migration executed: No');
  console.log('Database written: No');
  process.exit(0);
}
const mergeResult = spawnSync(mergeCommand[0], mergeCommand.slice(1), {
  cwd: MAIN_ROOT,
  encoding: 'utf8',
});
if (mergeResult.stdout) process.stdout.write(mergeResult.stdout);
if (mergeResult.stderr) process.stderr.write(mergeResult.stderr);
if ((mergeResult.status ?? 1) !== 0) {
  fail(`merge preflight failed with exit code ${mergeResult.status ?? 1}`);
}

console.log('\nFinal main status:');
console.log(run('git', ['status', '--short'], { cwd: MAIN_ROOT }) || '(clean)');
console.log('\nRecent main log:');
console.log(run('git', ['log', '--oneline', '--decorate', '-8'], { cwd: MAIN_ROOT }));

const gateScript = `${MAIN_ROOT}/scripts/ci/check-w5-closeout-gate.mjs`;
if (existsSync(gateScript)) {
  console.log('\nRunning W5 closeout gate:');
  const gate = spawnSync('node', ['scripts/ci/check-w5-closeout-gate.mjs'], {
    cwd: MAIN_ROOT,
    encoding: 'utf8',
  });
  if (gate.stdout) process.stdout.write(gate.stdout);
  if (gate.stderr) process.stderr.write(gate.stderr);
  if ((gate.status ?? 1) !== 0) fail(`check-w5-closeout-gate failed with exit code ${gate.status ?? 1}`);
} else {
  console.log('\nW5 closeout gate script not found; skipped.');
}

console.log('\nSummary:');
console.log(`Auto-committed docs/ops/runs: ${autoCommittedRuns ? 'Yes' : 'No'}`);
console.log(`Real merge executed: ${args.dryRun ? 'No' : 'Yes'}`);
console.log('Push executed: No');
console.log('Deploy executed: No');
console.log('Migration executed: No');
console.log('Database written: No');
