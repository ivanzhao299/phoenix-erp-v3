import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { CONTRACT, git, secureJson } from './production-config-guard.mjs';
import { executionEnv } from './capture-production-runtime.mjs';
export const ADMISSION_PATH = 'apps/api/src/database/migrations/1791878400000-CreateChanjetExecutionAdmissions.ts';
export const ADMISSION_NAME = 'CreateChanjetExecutionAdmissions1791878400000';
export const receiptName = 'chanjet-admission-schema.json';
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function validateSchemaReceipt(receipt, scope, blob) {
  if (scope.changed.length !== 1 || scope.changed[0] !== ADMISSION_PATH
    || receipt?.schema !== 'phoenix.chanjet-admission-schema/v1' || receipt.outcome !== 'SUCCESS'
    || receipt.baseline !== scope.baseline || receipt.migrationPath !== ADMISSION_PATH || receipt.migrationName !== ADMISSION_NAME
    || receipt.sourceBlob !== blob || !/^[a-f0-9]{40}$/.test(receipt.sourceSha || '')
    || !/^\d+-\d+$/.test(receipt.runId || '') || !/^[a-f0-9]{64}$/.test(receipt.backupSha256 || '')
    || !/^[a-f0-9]{64}$/.test(receipt.beforeLedgerSha256 || '') || !/^[a-f0-9]{64}$/.test(receipt.afterLedgerSha256 || '')) throw Error('MIGRATION_SCOPE=HOLD:ADMISSION_SCHEMA_RECEIPT_REQUIRED');
  return true;
}
export function assertAdmissionSchemaApplied(root, scope) {
  if (!scope.changed.length) return false;
  const receipt = secureJson(path.join(CONTRACT.stateDirectory, receiptName));
  validateSchemaReceipt(receipt, scope, git(root, ['rev-parse', `${scope.target}:${ADMISSION_PATH}`]));
  git(root, ['merge-base', '--is-ancestor', receipt.sourceSha, scope.target]);
  if (git(root, ['rev-parse', `${receipt.sourceSha}:${ADMISSION_PATH}`]) !== receipt.sourceBlob) throw Error('MIGRATION_SCOPE=HOLD:SCHEMA_SOURCE');
  const ledgerSql = `SELECT jsonb_build_object('legacy',coalesce((SELECT jsonb_agg(jsonb_build_object('filename',filename,'applied_at',extract(epoch from applied_at)*1000) ORDER BY filename) FROM schema_migrations),'[]'::jsonb),'typeorm',coalesce((SELECT jsonb_agg(jsonb_build_object('timestamp',timestamp,'name',name) ORDER BY timestamp,name) FROM migrations),'[]'::jsonb))::text;`;
  const out = execFileSync('docker', ['exec','-i','-e','PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=1000','phoenix-v3-db','sh','-c','exec psql -X -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "${POSTGRES_DB:-$POSTGRES_USER}"'], {
    env: executionEnv(), input: `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; ${ledgerSql} SELECT count(*) FROM migrations WHERE name='${ADMISSION_NAME}' AND timestamp=1791878400000; SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('chanjet_admission_row_guard','chanjet_admission_truncate_guard','chanjet_request_row_guard','chanjet_request_truncate_guard'); COMMIT;`, encoding:'utf8', timeout:10000, killSignal:'SIGKILL' });
  const ledgerLine = out.split(/\r?\n/).find(x=>x.startsWith('{'));
  if (!ledgerLine || digest(JSON.stringify(JSON.parse(ledgerLine))) !== receipt.afterLedgerSha256) throw Error('MIGRATION_SCOPE=HOLD:APPLIED_LEDGER_DRIFT');
  if (out.split(/\r?\n/).filter(x=>/^\d+$/.test(x)).join(',') !== '1,4') throw Error('MIGRATION_SCOPE=HOLD:SCHEMA_NOT_APPLIED');
  return true;
}

/** Registry of controlled out-of-band migration applications.
 * A v3 floor re-anchor with pending migrations is legal only when every
 * changed migration was applied through the reviewed single-shot channel
 * (scripts/deploy-schema-first.sh in controlled-pending-migration-apply.yml)
 * and the production ledger still matches the digest recorded at apply time.
 * The chanjet admission migration keeps its dedicated legacy receipt. */
export const RECEIPT_DIRECTORY = 'migration-apply-receipts';
export const LEDGER_SQL = `SELECT jsonb_build_object('legacy',coalesce((SELECT jsonb_agg(jsonb_build_object('filename',filename,'applied_at',extract(epoch from applied_at)*1000) ORDER BY filename) FROM schema_migrations),'[]'::jsonb),'typeorm',coalesce((SELECT jsonb_agg(jsonb_build_object('timestamp',timestamp,'name',name) ORDER BY timestamp,name) FROM migrations),'[]'::jsonb))::text;`;
export function readProductionLedger() {
  const out = execFileSync('docker', ['exec','-i','-e','PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=1000','phoenix-v3-db','sh','-c','exec psql -X -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "${POSTGRES_DB:-$POSTGRES_USER}"'], {
    env: executionEnv(), input: `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; ${LEDGER_SQL} COMMIT;`, encoding: 'utf8', timeout: 10000, killSignal: 'SIGKILL' });
  const ledgerLine = out.split(/\r?\n/).find(x => x.startsWith('{'));
  if (!ledgerLine) throw Error('MIGRATION_SCOPE=HOLD:LEDGER_UNREADABLE');
  return JSON.parse(ledgerLine);
}
export function validateRegistryReceipt(receipt, { migrationPath, sourceBlob }) {
  const name = path.basename(migrationPath, '.ts');
  const match = /^(\d+)-([A-Za-z0-9]+)$/.exec(name);
  if (receipt?.schema !== 'phoenix.migration-apply-receipt/v1' || receipt.outcome !== 'SUCCESS'
    || receipt.migrationPath !== migrationPath || !match
    || String(receipt.migrationTimestamp) !== match[1] || receipt.migrationName !== match[2]
    || receipt.sourceBlob !== sourceBlob || !/^[a-f0-9]{40}$/.test(receipt.sourceSha || '')
    || !/^\d+-\d+$/.test(receipt.runId || '')
    || !/^[a-f0-9]{64}$/.test(receipt.beforeLedgerSha256 || '') || !/^[a-f0-9]{64}$/.test(receipt.afterLedgerSha256 || '')) throw Error('MIGRATION_SCOPE=HOLD:MIGRATION_APPLY_RECEIPT_INVALID');
  return true;
}
export function assertScopeMigrationsReceipted(root, scope) {
  if (!scope.changed.length) return false;
  if (scope.changed.length === 1 && scope.changed[0] === ADMISSION_PATH) return assertAdmissionSchemaApplied(root, scope);
  const ledger = readProductionLedger();
  const applied = new Set(ledger.typeorm.map(row => `${row.timestamp}:${row.name}`));
  for (const migrationPath of scope.changed) {
    const name = path.basename(migrationPath, '.ts');
    const match = /^(\d+)-([A-Za-z0-9]+)$/.exec(name);
    if (!match) throw Error(`MIGRATION_SCOPE=HOLD:MIGRATION_NAME_UNPARSEABLE:${name}`);
    const sourceBlob = git(root, ['rev-parse', `${scope.target}:${migrationPath}`]);
    const receipt = secureJson(path.join(CONTRACT.stateDirectory, RECEIPT_DIRECTORY, `${name}.json`));
    validateRegistryReceipt(receipt, { migrationPath, sourceBlob });
    git(root, ['merge-base', '--is-ancestor', receipt.sourceSha, scope.target]);
    if (git(root, ['rev-parse', `${receipt.sourceSha}:${migrationPath}`]) !== receipt.sourceBlob) throw Error('MIGRATION_SCOPE=HOLD:MIGRATION_SOURCE_BLOB_DRIFT');
    if (!applied.has(`${match[1]}:${match[2]}`)) throw Error(`MIGRATION_SCOPE=HOLD:MIGRATION_NOT_APPLIED:${name}`);
  }
  if (digest(JSON.stringify(ledger)) !== receiptLedgerDigest(scope, root)) throw Error('MIGRATION_SCOPE=HOLD:APPLIED_LEDGER_DRIFT');
  return true;
}
function receiptLedgerDigest(scope, root) {
  // The freshest receipt pins the ledger digest the promotion must observe.
  let freshest = null;
  for (const migrationPath of scope.changed) {
    const name = path.basename(migrationPath, '.ts');
    const receipt = secureJson(path.join(CONTRACT.stateDirectory, RECEIPT_DIRECTORY, `${name}.json`));
    if (!freshest || String(receipt.appliedAt) > String(freshest.appliedAt)) freshest = receipt;
  }
  return freshest.afterLedgerSha256;
}
