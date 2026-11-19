/** Record a controlled out-of-band migration application as a durable receipt.
 * Runs on the production host after scripts/deploy-schema-first.sh applied the
 * pending TypeORM migrations from the reviewed candidate image. The receipt is
 * what later lets a v3 floor re-anchor tolerate the applied migrations
 * (see assertScopeMigrationsReceipted in chanjet-admission-schema-receipt.mjs).
 * Refuses to record anything the production ledger cannot confirm. */
import fs from 'node:fs';
import path from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { CONTRACT, git, secureJson, verifyContext } from './production-config-guard.mjs';
import { atomicState } from './production-atomic-state.mjs';
import { inspectTrustedDirectory } from './production-trusted-paths.mjs';
import { RECEIPT_DIRECTORY, digest, readProductionLedger, validateRegistryReceipt } from './chanjet-admission-schema-receipt.mjs';

const hold = reason => { throw new Error(`MIGRATION_RECEIPT=HOLD_${reason}`); };

/**
 * A prior successful receipt is immutable evidence of the migration identity.
 * Run/ledger timing fields naturally differ when a later reviewed target
 * replays receipt recording; accepting those differences must not permit a
 * different source blob, path, timestamp or outcome.
 */
export function isCompatibleReceipt(existing, expected, dependencies = {}) {
  const immutable = ['schema', 'outcome', 'migrationPath', 'migrationTimestamp',
    'migrationName', 'sourceBlob'];
  if (!immutable.every(key => existing?.[key] === expected?.[key])) return false;
  try {
    // Reuse the production registry validator; no reduced replay-only schema.
    validateRegistryReceipt(expected, expected);
    validateRegistryReceipt(existing, expected);
    if (!/^[a-f0-9]{40}$/.test(expected.sourceBlob || '')) return false;
    const root = dependencies.root || CONTRACT.repository;
    const sourceGit = dependencies.git || git;
    for (const sha of [existing.sourceSha, expected.sourceSha]) {
      if (sourceGit(root, ['cat-file', '-t', sha]) !== 'commit') return false;
      const blob = sourceGit(root, ['rev-parse', `${sha}:${expected.migrationPath}`]);
      if (blob !== expected.sourceBlob || sourceGit(root, ['cat-file', '-t', blob]) !== 'blob') return false;
    }
    sourceGit(root, ['merge-base', '--is-ancestor', existing.sourceSha, expected.sourceSha]);
    const ledger = dependencies.ledger ?? readProductionLedger();
    return Array.isArray(ledger?.typeorm) && ledger.typeorm.some(row =>
      String(row.timestamp) === String(expected.migrationTimestamp)
      && (row.name === expected.migrationName || row.name === `${expected.migrationName}${expected.migrationTimestamp}`));
  } catch {
    // Missing objects, unverifiable ancestry, invalid receipts or ledger read
    // errors all refuse reuse. The caller holds rather than replacing evidence.
    return false;
  }
}

function ensureReceiptDirectory(directory) {
  const receiptDirectory = path.join(directory, RECEIPT_DIRECTORY);
  try { fs.mkdirSync(receiptDirectory, { mode: 0o700 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  inspectTrustedDirectory(receiptDirectory, CONTRACT);
  const fd = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

/** Record the pending units of one verified modern schema effect. The caller
 * owns the pinned read channel and must recheck its ledger after publication. */
export async function publishVerifiedMigrationApplyReceipts({
  root = CONTRACT.repository, directory = CONTRACT.stateDirectory, targetSha, runId,
  beforeLedgerSha256, verifiedLedger, pendingMigrations, publish,
}, dependencies = {}) {
  const guard = dependencies.guard ?? (() => verifyContext(root, directory));
  const sourceGit = dependencies.git ?? git;
  const readOptional = dependencies.readOptional ?? secureJsonOptional;
  if (!/^[a-f0-9]{40}$/.test(targetSha || '') || !/^\d+-\d+$/.test(runId || '')
    || !/^[a-f0-9]{64}$/.test(beforeLedgerSha256 || '') || typeof publish !== 'function'
    || !Array.isArray(pendingMigrations) || !pendingMigrations.length) hold('VERIFIED_INPUT');
  const afterLedgerSha256 = verifiedLedger?.sha256;
  const serialized = JSON.stringify(verifiedLedger?.ledger);
  if (!/^[a-f0-9]{64}$/.test(afterLedgerSha256 || '') || typeof serialized !== 'string'
    || digest(serialized) !== afterLedgerSha256) hold('VERIFIED_LEDGER');
  const ledger = JSON.parse(serialized);
  if (!Array.isArray(ledger?.legacy) || !Array.isArray(ledger?.typeorm)) hold('VERIFIED_LEDGER');
  guard();
  if (sourceGit(root, ['cat-file', '-t', targetSha]) !== 'commit') hold('VERIFIED_TARGET');
  const files = new Set(), timestamps = new Set(), drafts = [];
  const appliedAt = new Date().toISOString();
  for (const unit of pendingMigrations) {
    const migrationPath = unit?.path;
    const match = /^apps\/api\/src\/database\/migrations\/(\d+)-([A-Za-z0-9]+)\.ts$/.exec(migrationPath ?? '');
    if (!match) hold('VERIFIED_PATH_SCOPE');
    const [, timestamp, migrationName] = match, migrationTimestamp = Number(timestamp);
    if (!Number.isSafeInteger(migrationTimestamp) || unit.timestamp !== migrationTimestamp || unit.effectiveName !== migrationName + timestamp
      || files.has(migrationPath) || timestamps.has(migrationTimestamp)) hold('VERIFIED_UNIT_IDENTITY');
    files.add(migrationPath);
    timestamps.add(migrationTimestamp);
    const sourceBlob = sourceGit(root, ['rev-parse', `${targetSha}:${migrationPath}`]);
    if (!/^[a-f0-9]{40}$/.test(sourceBlob) || unit.sourceBlob !== sourceBlob || sourceGit(root, ['cat-file', '-t', sourceBlob]) !== 'blob') hold('VERIFIED_SOURCE_BLOB');
    const rows = ledger.typeorm.filter(row => String(row?.timestamp) === timestamp
      && (row.name === unit.effectiveName || row.name === migrationName));
    if (rows.length !== 1 || rows[0].name !== unit.effectiveName) hold('VERIFIED_UNIT_NOT_APPLIED');
    const receipt = {
      schema: 'phoenix.migration-apply-receipt/v1', outcome: 'SUCCESS',
      migrationPath, migrationTimestamp, migrationName, runId, appliedAt, sourceSha: targetSha,
      sourceBlob, beforeLedgerSha256, afterLedgerSha256,
    };
    validateRegistryReceipt(receipt, { migrationPath, sourceBlob });
    const file = path.join(directory, RECEIPT_DIRECTORY, `${timestamp}-${migrationName}.json`);
    const prior = readOptional(file);
    if (prior !== undefined && (!isCompatibleReceipt(prior, receipt, { root, git: sourceGit, ledger })
      || prior.runId !== runId || prior.sourceSha !== targetSha
      || prior.beforeLedgerSha256 !== beforeLedgerSha256 || prior.afterLedgerSha256 !== afterLedgerSha256)) hold('VERIFIED_RECEIPT_CONFLICT');
    if (prior === undefined) drafts.push({ file, receipt });
    await setImmediate(); // let the original supervisor keep observing the host
  }
  guard();
  if (drafts.length) (dependencies.ensureDirectory ?? ensureReceiptDirectory)(directory);
  for (const { file, receipt } of drafts) {
    publish(file, receipt); // protected create-only publication, never replace
    await setImmediate();
  }
  guard();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = CONTRACT.repository;
    const targetSha = process.env.TARGET_SHA || '';
    const runId = process.env.MIGRATION_RUN_ID || '';
    const beforeLedgerSha256 = process.env.BEFORE_LEDGER_SHA256 || '';
    const migrationPaths = process.argv.slice(2);
    if (!/^[a-f0-9]{40}$/.test(targetSha) || !/^\d+-\d+$/.test(runId) || !/^[a-f0-9]{64}$/.test(beforeLedgerSha256)) hold('INPUT');
    if (!migrationPaths.length) hold('NO_MIGRATIONS');
    verifyContext(root, CONTRACT.stateDirectory);
    // atomicState pins the parent directory, so create the root-only receipts
    // directory exactly once with the control-root mode contract.
    const receiptDirectory = path.join(CONTRACT.stateDirectory, RECEIPT_DIRECTORY);
    if (!fs.existsSync(receiptDirectory)) fs.mkdirSync(receiptDirectory, { mode: 0o700 });
    const ledger = readProductionLedger();
    const ledgerDigest = digest(JSON.stringify(ledger));
    const isApplied = (timestamp, fileClassName) => ledger.typeorm.some(
      row => String(row.timestamp) === String(timestamp) && (row.name === fileClassName || row.name === `${fileClassName}${timestamp}`));
    for (const migrationPath of migrationPaths) {
      if (!migrationPath.startsWith('apps/api/src/database/migrations/')) hold('PATH_SCOPE');
      const name = path.basename(migrationPath, '.ts');
      const match = /^(\d+)-([A-Za-z0-9]+)$/.exec(name);
      if (!match) hold(`NAME:${name}`);
      const sourceBlob = git(root, ['rev-parse', `${targetSha}:${migrationPath}`]);
      if (!isApplied(match[1], match[2])) hold(`NOT_APPLIED:${name}`);
      const receipt = {
        schema: 'phoenix.migration-apply-receipt/v1', outcome: 'SUCCESS',
        migrationPath, migrationTimestamp: Number(match[1]), migrationName: match[2],
        runId, appliedAt: new Date().toISOString(), sourceSha: targetSha, sourceBlob,
        beforeLedgerSha256, afterLedgerSha256: ledgerDigest,
      };
      const file = path.join(CONTRACT.stateDirectory, RECEIPT_DIRECTORY, `${name}.json`);
      const existing = secureJsonOptional(file);
      if (existing !== undefined) {
        if (isCompatibleReceipt(existing, receipt, { root, ledger })) {
          console.log(`MIGRATION_RECEIPT=ALREADY_RECORDED;migration=${name}`);
          continue;
        }
        hold(`RECEIPT_EXISTS:${name}`);
      }
      atomicState(file, receipt);
      console.log(`MIGRATION_RECEIPT=RECORDED;migration=${name};run=${runId};ledger=${ledgerDigest.slice(0, 12)}`);
    }
    // Sanity: the recorded digest must reproduce from a fresh read.
    if (digest(JSON.stringify(readProductionLedger())) !== ledgerDigest) hold('LEDGER_UNSTABLE');
    console.log('MIGRATION_RECEIPT=COMPLETE');
  } catch (error) {
    const message = String(error?.message || '').replace(/\s+/g, ' ').slice(0, 200);
    console.error(message.startsWith('MIGRATION_RECEIPT=') ? message : `MIGRATION_RECEIPT=HOLD_VALIDATION:${message}`);
    process.exitCode = 1;
  }
}
export function secureJsonOptional(file, dependencies = {}) {
  // secureJson intentionally wraps filesystem failures in a trusted-path HOLD.
  // Probe absence separately: only lstat ENOENT means there is no receipt.
  // Never reinterpret a failed secure read or JSON null/false as permission to
  // replace an existing receipt (including a dangling symlink).
  try { (dependencies.lstat || fs.lstatSync)(file); }
  catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }
  return (dependencies.readJson || secureJson)(file);
}
