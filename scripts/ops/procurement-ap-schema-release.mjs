import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { auditSql } from './audit-daily-egg-inbound.mjs';
import { captureRuntime, executionEnv } from './capture-production-runtime.mjs';
import { digest, LEDGER_SQL } from './chanjet-admission-schema-receipt.mjs';
import { CONTRACT, MIGRATION_PATHS } from './production-config-guard.mjs';
import { canonicalDigest } from './production-maintenance-receipts.mjs';
import { confirmedDailyRowsSql, reviewConfirmedLegacyFacts, verifyConfirmedModernSchemaSources } from './production-modern-schema-confirmed-scope.mjs';

export const baseline = '88830e3991614a3d992e61aaeb55a15b2cf0b35a';
const approvedBatch = '78240407efd14e57684ebf8d12c8c11dd6b4620c';
const timestamp = 1795719000000;
const migrationName = 'EnsureFinanceApPaymentAllocations';
export const unit = `${timestamp}-${migrationName}`;
const migrationPath = `apps/api/src/database/migrations/${unit}.ts`;
const migrationBlob = 'b14adacf3c013f490a29f280edccab972555e481';
const ledgerEntry = { timestamp, name: migrationName + timestamp };
const ownershipComment = 'Finance V2 AP payment allocations created by ' + ledgerEntry.name;
const sha = /^[a-f0-9]{40}$/;
const hash = /^[a-f0-9]{64}$/;
const hold = code => { throw Error('PROCUREMENT_AP_SCHEMA_HOLD=' + code); };

export function verifySource(target, git) {
  if (!sha.test(target ?? '')) hold('TARGET');
  const [base, head, ...extra] = git('show', '-s', '--format=%P', target).split(' ');
  if (base !== baseline || !sha.test(head ?? '') || extra.length || git('rev-parse', head + '^{tree}') !== git('rev-parse', target + '^{tree}')) hold('EXACT_MAIN_MERGE');
  git('merge-base', '--is-ancestor', approvedBatch, head);
  const releaseFiles = new Set([
    '.github/workflows/controlled-pending-migration-apply.yml',
    'scripts/ops/procurement-ap-schema-release.mjs',
    'scripts/ops/procurement-ap-schema-release.test.mjs',
    'scripts/ops/egg-source-permissions-inspection-receipt.mjs',
    'scripts/ops/pending-migration-backup-paths.mjs',
  ]);
  if (git('diff', '--no-renames', '--name-only', approvedBatch, target).split('\n').some(file => !releaseFiles.has(file))) hold('REVIEWED_BATCH_CHANGED');
  if (git('diff', '--no-renames', '--name-status', baseline, target, '--', ...MIGRATION_PATHS) !== 'A\t' + migrationPath ||
      git('rev-parse', target + ':' + migrationPath) !== migrationBlob) hold('MIGRATION_SET');
  if (git('diff', '--no-renames', '--name-only', baseline, target, '--', ...CONTRACT.criticalFiles)) hold('CONFIG_FLOOR_CHANGED');
  return { target, baseline, migrations: [{ path: migrationPath, blob: migrationBlob }] };
}

function isCandidate(row) {
  return String(row.timestamp) === String(timestamp) || row.name === ledgerEntry.name;
}

export function ledgerBeforeApply(ledger, applied) {
  if (!Array.isArray(ledger?.typeorm) || !Array.isArray(ledger.legacy)) hold('LEDGER');
  const matches = ledger.typeorm.filter(isCandidate);
  if (!applied && matches.length === 0) return ledger;
  if (!applied || matches.length !== 1 || String(matches[0].timestamp) !== String(timestamp) ||
      matches[0].name !== ledgerEntry.name) hold('LEDGER_DELTA');
  return { ...ledger, typeorm: ledger.typeorm.filter(row => !isCandidate(row)) };
}

const current = 'fin_ap_payment_allocations';
const legacy = 'fin_ap_payments';
const commonColumns = 'id invoice_id company_code currency_code exchange_rate payment_date payment_method bank_account reference_no cash_account_id created_at updated_at created_by updated_by';
const requiredColumns = {
  [current]: (commonColumns + ' alloc_no company_name amount_original amount_base base_currency remark').split(' '),
  [legacy]: (commonColumns + ' payment_no supplier_code amount note').split(' '),
};
const storageSql = `SELECT coalesce(jsonb_object_agg(c.relname,jsonb_build_object(
    'kind',c.relkind,'comment',obj_description(c.oid,'pg_class'),
    'sequence',pg_get_serial_sequence(format('%I.%I',n.nspname,c.relname),'id'),
    'columns',(SELECT jsonb_agg(a.attname ORDER BY a.attname) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)
  )), '{}'::jsonb)::text
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('${current}','${legacy}');`;

export function storageBeforeApply(storage, applied) {
  for (const [table, row] of Object.entries(storage)) {
    if (!Object.hasOwn(requiredColumns, table) || row.kind !== 'r' || !row.sequence ||
        !Array.isArray(row.columns) || !requiredColumns[table].every(column => row.columns.includes(column))) hold('PAYMENT_STORAGE_CONTRACT');
  }
  const created = storage[current]?.comment === ownershipComment;
  if (!applied && created) hold('UNREGISTERED_STORAGE');
  if (applied && !storage[current] && !storage[legacy]) hold('PAYMENT_STORAGE_MISSING');
  if (!created) return storage;
  if (storage[legacy]) hold('UNEXPECTED_STORAGE_CREATION');
  return {};
}

function snapshot() {
  const sql = ['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;', 'SET LOCAL search_path=public;',
    "SET LOCAL statement_timeout='30s';", "SET LOCAL lock_timeout='3s';", 'SET LOCAL row_security=off;',
    auditSql, confirmedDailyRowsSql + ';', LEDGER_SQL, storageSql, 'ROLLBACK;'].join('\n');
  const rows = execFileSync('docker', ['exec', '-i', '-e', 'PGOPTIONS=-c default_transaction_read_only=on',
    'phoenix-v3-db', 'sh', '-c', 'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
  { input: sql, env: executionEnv(), encoding: 'utf8', timeout: 75000, maxBuffer: 20 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] })
    .trimEnd().split('\n');
  if (rows.length !== 4) hold('SNAPSHOT');
  const [originalAudit, dailyRowsRaw, ledger, storage] = rows;
  const facts = reviewConfirmedLegacyFacts({ originalAudit, dailyRowsRaw });
  return { audit: facts.stableExactAuditSha256, daily: facts.dailyRowsSha256, ledger: JSON.parse(ledger), storage: JSON.parse(storage) };
}

function evidence(env, reviewed, applied) {
  if (!hash.test(env.VET_CI_SHA256 ?? '') ||
      !/^ghcr\.io\/ivanzhao299\/phoenix-erp-v3\/api@sha256:[a-f0-9]{64}$/.test(env.VET_API_IMAGE ?? '')) hold('CANDIDATE_IMAGE');
  const runtime = captureRuntime();
  if (env.RUNNING_CHECKOUT !== baseline || !['api', 'web'].every(service => runtime[service]?.revision === baseline)) hold('RUNNING_BASELINE');
  const { audit, daily, ledger, storage } = snapshot();
  const beforeLedger = digest(JSON.stringify(ledgerBeforeApply(ledger, applied)));
  if (!applied && (env.PENDING_CLASSES?.trim() !== unit || env.LEDGER_SHA256 !== beforeLedger)) hold('PENDING_SET');
  if (applied && (env.EXPECTED_BEFORE_LEDGER_SHA256 !== beforeLedger ||
      canonicalDigest(ledger) !== canonicalDigest(JSON.parse(env.AFTER_LEDGER)))) hold('LEDGER_MOVED');
  if (applied && env.BEFORE_LEDGER &&
      canonicalDigest(ledgerBeforeApply(ledger, true)) !== canonicalDigest(JSON.parse(env.BEFORE_LEDGER))) hold('LEDGER_BEFORE_MOVED');
  return canonicalDigest({ reviewed, runtime, beforeLedger, audit, daily, storage: storageBeforeApply(storage, applied),
    apiImage: env.VET_API_IMAGE, ci: env.VET_CI_SHA256,
    confirmedSource: verifyConfirmedModernSchemaSources(CONTRACT.repository, undefined, reviewed.target) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const env = process.env;
    const git = (...args) => execFileSync('git', ['--no-replace-objects', '-c', 'safe.directory=' + process.cwd(),
      '-c', 'core.hooksPath=/dev/null', ...args], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const reviewed = verifySource(env.TARGET_SHA, git);
    const action = process.argv[2];
    if (action === 'source') console.log(JSON.stringify(reviewed));
    else if (action === 'inspect') console.log(evidence(env, reviewed, false));
    else if (action === 'after' || action === 'recover') {
      if (evidence(env, reviewed, true) !== env.EXPECTED_VET_INSPECTION_SHA256) hold('INSPECTION_MOVED');
      console.log('PROCUREMENT_AP_POST_MIGRATION=EXACT_LEDGER_AND_TEST_RECORDS_PRESERVED');
    } else hold('COMMAND');
  } catch (error) {
    console.error(/^PROCUREMENT_AP_SCHEMA_HOLD=[A-Z0-9_]+$/.test(error.message) ? error.message : 'PROCUREMENT_AP_SCHEMA_HOLD=EVIDENCE_UNVERIFIED');
    process.exitCode = 1;
  }
}
