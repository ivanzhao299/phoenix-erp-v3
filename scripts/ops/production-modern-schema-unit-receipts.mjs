import fs from 'node:fs';
import path from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { CONTRACT, git, secureJson, verifyContext } from './production-config-guard.mjs';
import { inspectTrustedDirectory } from './production-trusted-paths.mjs';
import { ADMISSION_PATH, digest, MIGRATION_TOOLING_PATHS, RECEIPT_DIRECTORY, validateRegistryReceipt } from './chanjet-admission-schema-receipt.mjs';
import { isCompatibleReceipt, secureJsonOptional } from './record-migration-apply-receipt.mjs';

const hold = reason => { throw new Error(`MIGRATION_RECEIPT=HOLD_${reason}`); };

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

/** Registry-only verification against the caller's already verified full ledger.
 * The dedicated admission-only path still requires its live trigger evidence. */
export async function verifyScopeRegistryReceiptsFromLedger(root, scope, ledger, dependencies = {}) {
  if (scope.changed.length === 1 && scope.changed[0] === ADMISSION_PATH) throw Error('MIGRATION_SCOPE=HOLD:ADMISSION_SCHEMA_RECEIPT_REQUIRED');
  const receiptPaths = scope.changed.filter(migrationPath => !MIGRATION_TOOLING_PATHS.has(migrationPath));
  if (!receiptPaths.length) return [];
  if (!Array.isArray(ledger?.legacy) || !Array.isArray(ledger?.typeorm)) throw Error('MIGRATION_SCOPE=HOLD:LEDGER_UNREADABLE');
  const read = dependencies.readJson ?? secureJson, sourceGit = dependencies.git ?? git;
  const directory = dependencies.directory ?? CONTRACT.stateDirectory;
  const isApplied = (timestamp, fileClassName) => ledger.typeorm.some(
    row => String(row?.timestamp) === String(timestamp) && (row.name === fileClassName || row.name === `${fileClassName}${timestamp}`));
  const records = [];
  let freshest = null;
  for (const migrationPath of receiptPaths) {
    const name = path.basename(migrationPath, '.ts');
    const match = /^(\d+)-([A-Za-z0-9]+)$/.exec(name);
    if (!match) throw Error(`MIGRATION_SCOPE=HOLD:MIGRATION_NAME_UNPARSEABLE:${name}`);
    const sourceBlob = sourceGit(root, ['rev-parse', `${scope.target}:${migrationPath}`]);
    const file = path.join(directory, RECEIPT_DIRECTORY, `${name}.json`);
    const receipt = read(file);
    validateRegistryReceipt(receipt, { migrationPath, sourceBlob });
    sourceGit(root, ['merge-base', '--is-ancestor', receipt.sourceSha, scope.target]);
    if (sourceGit(root, ['rev-parse', `${receipt.sourceSha}:${migrationPath}`]) !== receipt.sourceBlob) throw Error('MIGRATION_SCOPE=HOLD:MIGRATION_SOURCE_BLOB_DRIFT');
    if (!isApplied(match[1], match[2])) throw Error(`MIGRATION_SCOPE=HOLD:MIGRATION_NOT_APPLIED:${name}`);
    if (!freshest || String(receipt.appliedAt) > String(freshest.appliedAt)) freshest = receipt;
    records.push({ migrationPath, file, receipt });
    await setImmediate();
  }
  if (digest(JSON.stringify(ledger)) !== freshest.afterLedgerSha256) throw Error('MIGRATION_SCOPE=HOLD:APPLIED_LEDGER_DRIFT');
  return records;
}
