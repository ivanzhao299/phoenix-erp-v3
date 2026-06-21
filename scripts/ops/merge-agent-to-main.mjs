#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import path from 'node:path';

const args = process.argv.slice(2).map((arg) => arg.replace(/^–+/, '--'));
const targetBranch = args.find((arg) => !arg.startsWith('-'));
const dryRun = args.includes('--dry-run');
const allowCode = args.includes('--allow-code');
const yes = args.includes('--yes');
const schemaGateIndex = args.indexOf('--schema-gate');
const schemaGateRequestId = schemaGateIndex >= 0 ? args[schemaGateIndex + 1] : null;
const schemaGate = Boolean(schemaGateRequestId && !schemaGateRequestId.startsWith('-'));

function usage(exitCode = 1) {
  console.log(`Usage:
  node scripts/ops/merge-agent-to-main.mjs <agent-branch> [--dry-run] [--allow-code] [--yes]
  node scripts/ops/merge-agent-to-main.mjs <agent-branch> --schema-gate <request-id> [--dry-run] [--yes]

Examples:
  node scripts/ops/merge-agent-to-main.mjs w5-codex-orchestrator --dry-run
  node scripts/ops/merge-agent-to-main.mjs w5-a5-data-readiness --yes
  node scripts/ops/merge-agent-to-main.mjs w5-a3-backend-critical-path --allow-code --dry-run
  node scripts/ops/merge-agent-to-main.mjs w5-a3-backend-critical-path --schema-gate REQ-STORE-PAYMENT-UNIFIED-CODE-001 --dry-run`);
  process.exit(exitCode);
}

if (!targetBranch || args.includes('--help') || args.includes('-h') || (schemaGateIndex >= 0 && !schemaGate)) {
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

function readFileFromBranch(branch, file) {
  return runGit(['show', `${branch}:${file}`]);
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

function isStorePaymentRelatedOpsDoc(file) {
  return (
    file.startsWith('docs/ops/') &&
    /(STORE_PAYMENT|STORE-PAYMENT|UNIFIED_CODE|UNIFIED-CODE|REQ_STORE_PAYMENT|REQ-STORE-PAYMENT|A2_SCHEMA_SECURITY_REVIEW_STORE_PAYMENT_001_REPORT)/i.test(file)
  );
}

function checkSchemaGatePath(file, requestId) {
  if (requestId !== 'REQ-STORE-PAYMENT-UNIFIED-CODE-001') {
    fail(`unsupported schema gate request id: ${requestId}`);
  }

  const exactMigration = 'apps/api/src/database/migrations/1782041418112-CreateStorePaymentTables.ts';
  if (file === exactMigration) return;
  if (file.startsWith('apps/api/src/modules/store-payment/')) return;
  if (file === 'docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SCHEMA_IMPLEMENTATION_S1_REPORT.md') return;
  if (file === 'docs/ops/A2_SCHEMA_SECURITY_REVIEW_STORE_PAYMENT_001_REPORT.md') return;
  if (isStorePaymentRelatedOpsDoc(file)) return;

  fail(`path is not allowed in schema gate mode: ${file}`);
}

function checkSchemaGateFiles(files, requestId, branch) {
  console.log('\nSchema Gate mode enabled.');
  console.log(`Request ID: ${requestId}`);

  for (const file of files) {
    if (file.startsWith('apps/web/')) {
      fail(`apps/web changes are forbidden in schema gate mode: ${file}`);
    }
    if (
      file.startsWith('apps/api/src/modules/procurement/') ||
      file.startsWith('apps/api/src/modules/sales/') ||
      file.startsWith('apps/api/src/modules/finance/') ||
      file.startsWith('apps/api/src/modules/chanjet/')
    ) {
      fail(`business module path is forbidden in schema gate mode: ${file}`);
    }
    if ((file.endsWith('.entity.ts') || file.includes('/entities/')) && !file.startsWith('apps/api/src/modules/store-payment/')) {
      fail(`entity/schema path outside store-payment module is forbidden: ${file}`);
    }
    if (/fifo|store_code.*rename|customer.*fk|deploy/i.test(file)) {
      fail(`high-risk path signal is forbidden in schema gate mode: ${file}`);
    }
    checkSchemaGatePath(file, requestId);
  }

  const migrationFiles = files.filter((file) => file.startsWith('apps/api/src/database/migrations/'));
  const expectedMigration = 'apps/api/src/database/migrations/1782041418112-CreateStorePaymentTables.ts';
  if (migrationFiles.length !== 1 || migrationFiles[0] !== expectedMigration) {
    fail(`schema gate requires exactly one migration file: ${expectedMigration}`);
  }

  const migration = readFileFromBranch(branch, expectedMigration);
  if (/drop\s+column/i.test(migration)) {
    fail('migration contains DROP COLUMN');
  }
  if (/\binsert\s+into\b|\bupdate\s+[a-zA-Z0-9_".]+\b|\bdelete\s+from\b/i.test(migration)) {
    fail('migration contains data DML: INSERT INTO / UPDATE / DELETE FROM');
  }
  if (!/\bdown\s*\(/.test(migration)) {
    fail('migration must contain down()');
  }

  const allowedTables = new Set(['store_payment_accounts', 'store_payment_records']);
  const tablePattern = /\b(?:create|drop)\s+table(?:\s+if\s+(?:not\s+)?exists)?\s+["`]?([a-zA-Z0-9_]+)/gi;
  let match;
  while ((match = tablePattern.exec(migration)) !== null) {
    const tableName = match[1].replace(/["`]/g, '');
    if (!allowedTables.has(tableName)) {
      fail(`migration creates/drops a non-approved table: ${tableName}`);
    }
  }

  const typeormTablePattern = /\b(?:createTable|dropTable)\s*\(\s*(?:new\s+Table\s*\(\s*\{\s*name:\s*)?['"`]([a-zA-Z0-9_]+)/gi;
  while ((match = typeormTablePattern.exec(migration)) !== null) {
    const tableName = match[1].replace(/["`]/g, '');
    if (!allowedTables.has(tableName)) {
      fail(`migration creates/drops a non-approved table: ${tableName}`);
    }
  }

  const alterTablePattern = /\balter\s+table\s+["`]?([a-zA-Z0-9_]+)/gi;
  while ((match = alterTablePattern.exec(migration)) !== null) {
    const tableName = match[1].replace(/["`]/g, '');
    if (!allowedTables.has(tableName)) {
      fail(`migration alters a non-approved table: ${tableName}`);
    }
  }

  console.log('Allowed schema paths verified.');
  console.log('Migration safety checks passed.');
  console.log('No migration executed.');
  console.log('No database write executed.');
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

function isAncestor(ancestor, descendant) {
  try {
    runGit(['merge-base', '--is-ancestor', ancestor, descendant]);
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

console.log(`Current main HEAD: ${mainHead}`);
console.log(`Target branch HEAD (${targetBranch}): ${targetHead}`);

if (mainHead === targetHead) {
  console.log('\nTarget branch is already at main HEAD. Nothing to merge.');
  process.exit(0);
}

const targetAlreadyMerged = isAncestor(targetBranch, 'HEAD');
if (targetAlreadyMerged) {
  console.log('\nTarget branch is already merged into main. Nothing to merge.');
  process.exit(0);
}

const fastForwardCandidate = isAncestor('HEAD', targetBranch);
if (!fastForwardCandidate) {
  console.error('\nTarget branch has diverged from main. Refusing merge.');
  console.error('Please resolve manually with rebase, cherry-pick, or a new branch.');
  process.exit(1);
}

const files = listChangedFiles(targetBranch);

console.log('\nDiff file list:');
console.log(files.length ? files.map((file) => `  ${file}`).join('\n') : '  (no file changes)');
console.log('\nDiff stat:');
runGit(['diff', '--stat', `HEAD..${targetBranch}`], { stdio: 'inherit' });

if (schemaGate) {
  checkSchemaGateFiles(files, schemaGateRequestId, targetBranch);
} else {
  checkFreezeBoundaries(files);
}

console.log('\nFreeze boundary check: PASS');

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
