#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import path from 'node:path';

const args = process.argv.slice(2);
const targetBranch = args.find((arg) => !arg.startsWith('-'));
const dryRun = args.includes('--dry-run');
const allowCode = args.includes('--allow-code');
const yes = args.includes('--yes');

function usage(exitCode = 1) {
  console.log(`Usage:
  node scripts/ops/merge-agent-to-main.mjs <agent-branch> [--dry-run] [--allow-code] [--yes]

Examples:
  node scripts/ops/merge-agent-to-main.mjs w5-codex-orchestrator --dry-run
  node scripts/ops/merge-agent-to-main.mjs w5-a5-data-readiness --yes
  node scripts/ops/merge-agent-to-main.mjs w5-a3-backend-critical-path --allow-code --dry-run`);
  process.exit(exitCode);
}

if (!targetBranch || args.includes('--help') || args.includes('-h')) {
  usage(args.includes('--help') || args.includes('-h') ? 0 : 1);
}

function runGit(args, options = {}) {
  const result = execFileSync('git', args, {
    encoding: 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  });
  return typeof result === 'string' ? result.trim() : '';
}

function runNode(script) {
  const result = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`${script} failed with exit code ${result.status}`);
  }
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function ensureGitRepo() {
  try {
    runGit(['rev-parse', '--is-inside-work-tree']);
  } catch {
    fail('must run inside a git repository');
  }
}

function listChangedFiles(branch) {
  const output = runGit(['diff', '--name-only', `HEAD..${branch}`]);
  return output ? output.split('\n').filter(Boolean) : [];
}

function isAllowedOpsPath(file) {
  return (
    file.startsWith('docs/ops/') ||
    file.startsWith('scripts/ops/') ||
    file.startsWith('scripts/ci/') ||
    file.startsWith('.github/')
  );
}

function isCodePath(file) {
  return file.startsWith('apps/api/') || file.startsWith('apps/web/');
}

function hasFrozenSignal(file) {
  const normalized = file.replaceAll('\\', '/');
  const base = path.basename(normalized);
  const lower = normalized.toLowerCase();
  if (isAllowedOpsPath(normalized)) {
    return false;
  }
  return (
    normalized.startsWith('apps/api/src/database/migrations/') ||
    normalized.startsWith('migrations/') ||
    lower.includes('/migration/') ||
    lower.includes('/migrations/') ||
    base.endsWith('.entity.ts') ||
    lower.includes('/entities/') ||
    lower.includes('schema') ||
    lower.includes('table') ||
    lower.includes('column')
  );
}

function checkFreezeBoundaries(files) {
  const frozen = files.filter(hasFrozenSignal);
  if (frozen.length > 0) {
    fail(`frozen paths detected; refusing to merge:\n${frozen.map((f) => `  - ${f}`).join('\n')}`);
  }

  const codePaths = files.filter(isCodePath);
  if (codePaths.length > 0 && !allowCode) {
    fail(`code paths detected; rerun with --allow-code only if user approved code merging:\n${codePaths.map((f) => `  - ${f}`).join('\n')}`);
  }

  const disallowed = files.filter((file) => !isAllowedOpsPath(file) && !(allowCode && isCodePath(file)));
  if (disallowed.length > 0) {
    fail(`non-ops paths detected; default merge scope is docs/ops, scripts/ops, scripts/ci, .github:\n${disallowed.map((f) => `  - ${f}`).join('\n')}`);
  }
}

async function confirmMerge(branch) {
  if (yes || dryRun) return;
  const rl = createInterface({ input, output });
  const answer = await rl.question(`Fast-forward main to ${branch}? Type "yes" to continue: `);
  rl.close();
  if (answer !== 'yes') {
    fail('merge cancelled by user');
  }
}

function scriptExists(script) {
  try {
    runGit(['ls-files', '--error-unmatch', script]);
    return true;
  } catch {
    return false;
  }
}

ensureGitRepo();

const currentBranch = runGit(['branch', '--show-current']);
if (currentBranch !== 'main') {
  fail(`current branch must be main, got ${currentBranch || '(detached)'}`);
}

const status = runGit(['status', '--short']);
if (status) {
  fail(`main working tree must be clean:\n${status}`);
}

try {
  runGit(['rev-parse', '--verify', `${targetBranch}^{commit}`]);
} catch {
  fail(`target branch does not exist: ${targetBranch}`);
}

const mainHead = runGit(['rev-parse', '--short', 'HEAD']);
const targetHead = runGit(['rev-parse', '--short', targetBranch]);
const files = listChangedFiles(targetBranch);

console.log(`Current main HEAD: ${mainHead}`);
console.log(`Target branch HEAD (${targetBranch}): ${targetHead}`);
console.log('\nDiff file list:');
console.log(files.length ? files.map((file) => `  ${file}`).join('\n') : '  (no file changes)');
console.log('\nDiff stat:');
runGit(['diff', '--stat', `HEAD..${targetBranch}`], { stdio: 'inherit' });

checkFreezeBoundaries(files);

console.log('\nFreeze boundary check: PASS');

try {
  runGit(['merge-base', '--is-ancestor', 'HEAD', targetBranch]);
} catch {
  fail('target branch is not a fast-forward from main; refusing non-ff merge');
}

if (dryRun) {
  console.log('\nDry run complete. No merge performed.');
  process.exit(0);
}

await confirmMerge(targetBranch);

console.log(`\nMerging ${targetBranch} into main with --ff-only...`);
runGit(['merge', '--ff-only', targetBranch], { stdio: 'inherit' });

console.log('\nPost-merge branch:');
runGit(['branch', '--show-current'], { stdio: 'inherit' });
console.log('\nPost-merge status:');
const postStatus = runGit(['status', '--short']);
console.log(postStatus || '(clean)');
console.log('\nRecent log:');
runGit(['log', '--oneline', '--decorate', '-8'], { stdio: 'inherit' });

const ciScripts = [
  'scripts/ci/check-freeze-boundaries.mjs',
  'scripts/ci/check-security-regression.mjs',
  'scripts/ci/check-w5-closeout-gate.mjs',
];

for (const script of ciScripts) {
  if (scriptExists(script)) {
    console.log(`\nRunning ${script}...`);
    runNode(script);
  }
}

console.log('\nMerge completed.');
