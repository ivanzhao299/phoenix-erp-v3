import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { auditSql } from './audit-daily-egg-inbound.mjs';
import { LEDGER_SQL } from './chanjet-admission-schema-receipt.mjs';
import { confirmedDailyRowsSql, reviewConfirmedLegacyFacts, verifyConfirmedModernSchemaSources } from './production-modern-schema-confirmed-scope.mjs';
import { canonicalDigest } from './production-maintenance-receipts.mjs';
import { captureRuntime, executionEnv } from './capture-production-runtime.mjs';
import { CONTRACT, MIGRATION_PATHS } from './production-config-guard.mjs';

export const baseline = '22dfbcad84d4ed145a9286a18f1f87d4a923f585';
export const application = 'd0a6c64b970283b028d63c29930b50918ed45aa1';
export const units = [
  '1795658500000-InventoryStocktakeSubmissions',
  '1795658600000-WarehouseDailyCloseCapture',
  '1795658700000-TransferCostEvidence',
];
const paths = units.map(unit => 'apps/api/src/database/migrations/' + unit + '.ts');
const helper = 'scripts/ops/inventory-schema-1127-release.mjs';
const releaseChanges = [
  '.github/workflows/controlled-pending-migration-apply.yml',
  'scripts/ops/egg-source-permissions-inspection-receipt.mjs',
  helper,
  'scripts/ops/inventory-schema-1127-release.test.mjs',
  'scripts/ops/pending-migration-backup-paths.mjs',
].sort();
const sha = /^[a-f0-9]{40}$/;
const digest = /^[a-f0-9]{64}$/;
const hash = value => createHash('sha256').update(value).digest('hex');
const hold = reason => { throw new Error('INVENTORY_SCHEMA_HOLD=' + reason); };

export function verifySource(target, git) {
  if (!sha.test(target ?? '')) hold('TARGET_SHA');
  const parents = git('show', '-s', '--format=%P', target).split(' ');
  if (parents.length !== 2 || parents[0] !== application || !sha.test(parents[1])
      || git('rev-parse', parents[1] + '^{tree}') !== git('rev-parse', target + '^{tree}')) hold('EXACT_MAIN_MERGE');
  const changed = git('diff', '--no-renames', '--name-only', application, target).split('\n').sort();
  if (canonicalDigest(changed) !== canonicalDigest(releaseChanges)) hold('RELEASE_TOOLING_SCOPE');
  if (git('diff', '--no-renames', '--name-only', baseline, target, '--', ...CONTRACT.criticalFiles)) hold('PROTECTED_SOURCE_CHANGED');
  if (git('diff', '--no-renames', '--name-status', baseline, target, '--', ...MIGRATION_PATHS)
      !== paths.map(path => 'A\t' + path).join('\n')) hold('MIGRATION_SET');
  const migrations = paths.map(path => {
    const [mode, type, blob] = git('ls-tree', target, '--', path).split(/[ \t]/);
    if (mode !== '100644' || type !== 'blob' || !sha.test(blob)
        || git('rev-parse', application + ':' + path) !== blob) hold('MIGRATION_BLOB');
    return { path, blob };
  });
  return { target, application, baseline, reviewed: parents[1], migrations };
}

export const appliedTarget = '5cca99968a4beabb349f4e5102dee7bc8fe20f1d';
const appliedRun = '45891816599-1';

export function verifyWorkflowSource(target, git, recoveryRun) {
  if (!recoveryRun) return verifySource(target, git);
  if (recoveryRun !== appliedRun || !sha.test(target ?? '')) hold('RECOVERY_RUN');
  const parents = git('show', '-s', '--format=%P', target).split(' ');
  if (parents.length !== 2 || parents[0] !== appliedTarget || !sha.test(parents[1])
      || git('rev-parse', parents[1] + '^{tree}') !== git('rev-parse', target + '^{tree}')) hold('RECOVERY_MERGE');
  const allowed = releaseChanges.filter(file => file === helper || file === helper.replace('.mjs', '.test.mjs') || file.startsWith('.github/'));
  const changed = git('diff', '--no-renames', '--name-only', appliedTarget, target).split('\n').sort();
  if (canonicalDigest(changed) !== canonicalDigest(allowed)) hold('RECOVERY_TOOLING_SCOPE');
  if (git('diff', '--no-renames', '--name-only', baseline, target, '--', ...CONTRACT.criticalFiles, ...MIGRATION_PATHS)
      !== paths.join('\n')) hold('RECOVERY_APPLICATION_SCOPE');
  return verifySource(appliedTarget, git);
}

const historicalBatchProjection = 'jsonb_agg(to_jsonb(b) ORDER BY b.batch_no)';
export function inventoryAuditSql(after) {
  if (!after) return auditSql;
  const fragments = auditSql.split(historicalBatchProjection);
  if (fragments.length !== 2) hold('HISTORICAL_AUDIT_PROJECTION');
  return fragments.join("jsonb_agg(to_jsonb(b) - 'transfer_cost_currency' ORDER BY b.batch_no)");
}

const additions = units.map(unit => {
  const [timestamp, name] = unit.split('-');
  return { timestamp: Number(timestamp), name: name + timestamp };
});
const added = row => additions.some(entry => String(entry.timestamp) === String(row.timestamp));

export function withoutInventoryMigrations(ledger) {
  return { ...ledger, typeorm: ledger.typeorm.filter(row => !added(row)) };
}

export function verifyAppliedLedger(before, after) {
  if (!Array.isArray(before?.typeorm) || !Array.isArray(after?.typeorm) || before.typeorm.some(added)
      || canonicalDigest(before.legacy) !== canonicalDigest(after.legacy)
      || canonicalDigest(before.typeorm) !== canonicalDigest(withoutInventoryMigrations(after).typeorm)
      || canonicalDigest(after.typeorm.filter(added)) !== canonicalDigest(additions)) hold('AFTER_LEDGER_DELTA');
}

const newTables = ['wms_inbound_confirmation_receipts', 'wms_stocktake_submissions', 'wms_close_capture_epoch',
  'wms_close_capture', 'wms_daily_close_activation', 'wms_daily_closes', 'wms_close_event_claims', 'wms_atomic_transfer_receipts'];
const targets = {
  inv_batches: ['batch_no', 'company_code', 'warehouse_code', 'unit', 'qty', 'qty_available', 'updated_at'],
  inv_ledger: ['id', 'batch_no', 'company_code', 'warehouse_code', 'unit', 'change_type', 'qty_change', 'log_date'],
  wms_stocktake: ['id', 'stocktake_no', 'warehouse_code', 'status', 'item', 'batch_no', 'book_qty', 'actual_qty', 'sys_qty', 'act_qty', 'diff_qty'],
  wms_transfer: ['transfer_no'],
  wms_transfer_discrepancies: ['resolution_type'],
};
const triggers = {
  bind_wms_stocktake_batch_version: 'wms_stocktake',
  legacy_warehouse_close_readonly: 'wms_stocktake',
  inventory_wms_close_capture: 'inv_batches',
  ledger_wms_close_capture: 'inv_ledger',
};
const sqlList = names => names.map(name => "'" + name + "'").join(',');
export const catalogSql = `
SELECT jsonb_build_object(
  'major', current_setting('server_version_num')::int / 10000,
  'tables', COALESCE((SELECT jsonb_agg(c.relname ORDER BY c.relname) FROM pg_class c
    WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p')
      AND c.relname IN (${sqlList([...newTables, 'wms_inbound_items'])})), '[]'::jsonb),
  'columns', COALESCE((SELECT jsonb_object_agg(r.relname,r.columns) FROM (
    SELECT c.relname,jsonb_object_agg(a.attname,format_type(a.atttypid,a.atttypmod)) AS columns
    FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    WHERE c.relnamespace='public'::regnamespace AND c.relname IN (${sqlList([...Object.keys(targets), 'wms_inbound_items'])})
    GROUP BY c.relname) r), '{}'::jsonb),
  'triggers', COALESCE((SELECT jsonb_object_agg(t.tgname,jsonb_build_array(c.relname,t.tgenabled))
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    WHERE NOT t.tgisinternal AND c.relnamespace='public'::regnamespace AND t.tgname IN (${sqlList(Object.keys(triggers))})), '{}'::jsonb),
  'transferIdentity', EXISTS(SELECT 1 FROM pg_index i JOIN pg_attribute a
    ON a.attrelid=i.indrelid AND a.attnum=i.indkey[0] AND a.attname='transfer_no'
    WHERE i.indrelid=to_regclass('public.wms_transfer') AND i.indisvalid AND i.indisunique
      AND i.indnkeyatts=1 AND i.indpred IS NULL AND i.indexprs IS NULL),
  'discrepancyCheck', (SELECT pg_get_constraintdef(oid) FROM pg_constraint
    WHERE conrelid=to_regclass('public.wms_transfer_discrepancies')
      AND conname='wms_transfer_discrepancies_resolution_type_check' AND convalidated)
)::text;`;
const afterSql = `
SELECT jsonb_build_object(
  'enabledWarehouses',(SELECT count(*) FROM wms_daily_close_activation WHERE enabled),
  'frozenDays',(SELECT count(*) FROM wms_daily_closes),
  'populatedTransferCost',(SELECT count(*) FROM inv_batches WHERE transfer_cost_currency IS NOT NULL)
)::text;`;

export function validateCatalog(catalog, after) {
  if (!Number.isInteger(catalog?.major) || catalog.major < 16) hold('DATABASE_VERSION');
  for (const [table, names] of Object.entries(targets)) {
    if (!names.every(name => Object.hasOwn(catalog.columns?.[table] ?? {}, name))) hold('BASELINE_COLUMNS_' + table);
  }
  const exists = table => catalog.tables.includes(table);
  if (!newTables.every(table => exists(table) === after)) hold('PARTIAL_SCHEMA');
  const stocktake = catalog.columns.wms_stocktake;
  for (const column of ['document_kind', 'quantity_unit', 'quantity_delta', 'inventory_count_type', 'observed_batch_version']) {
    if (Object.hasOwn(stocktake, column) !== after) hold('STOCKTAKE_SCHEMA');
  }
  if (Object.hasOwn(catalog.columns.inv_batches, 'transfer_cost_currency') !== after || (after && !exists('wms_inbound_items'))) {
    hold('INVENTORY_SCHEMA');
  }
  if (exists('wms_inbound_items')) {
    const cols = catalog.columns.wms_inbound_items;
    const required = ['id', 'task_no', 'batch_no', 'product_code', 'qty', 'actual_qty', 'broken_qty', 'quantity_snapshot'];
    if (!required.every(name => Object.hasOwn(cols ?? {}, name))) hold('RECEIPT_COLUMNS');
    for (const name of ['qty', 'expected_qty', 'actual_qty', 'broken_qty']) {
      if (!cols[name]) continue;
      if (!after && /^(smallint|integer|bigint)$/.test(cols[name])) continue;
      const decimal = /^(?:numeric|decimal)(?:\(([0-9]+),\s*(-?[0-9]+)\))?$/.exec(cols[name]);
      if (!decimal || (decimal[1] !== undefined && (Number(decimal[2]) < 3 || Number(decimal[1]) <= Number(decimal[2])))) {
        hold('RECEIPT_QUANTITIES');
      }
    }
  }
  const actualTriggers = Object.entries(catalog.triggers).sort();
  const expectedTriggers = after ? Object.entries(triggers).map(([name, table]) => [name, [table, 'O']]).sort() : [];
  if (canonicalDigest(actualTriggers) !== canonicalDigest(expectedTriggers)) hold('CAPTURE_TRIGGERS');
  if (!catalog.transferIdentity) hold('TRANSFER_IDENTITY');
  if (!catalog.discrepancyCheck?.includes("'LOSS'") || !catalog.discrepancyCheck.includes("'ADJUSTMENT'")
      || catalog.discrepancyCheck.includes("'CUSTODY'") !== after) hold('TRANSFER_DISCREPANCY_CHECK');
}

function snapshot(expectedLedger, after) {
  const sql = ["BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;", "SET LOCAL search_path=public;",
    "SET LOCAL statement_timeout='30s';", "SET LOCAL lock_timeout='3s';", "SET LOCAL row_security=off;",
    inventoryAuditSql(after), confirmedDailyRowsSql + ';', LEDGER_SQL, catalogSql, ...(after ? [afterSql] : []), 'ROLLBACK;'].join('\n');
  const output = execFileSync('docker', ['exec', '-i', '-e', 'PGOPTIONS=-c default_transaction_read_only=on',
    'phoenix-v3-db', 'sh', '-c', 'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
  { input: sql, env: executionEnv(), encoding: 'utf8', timeout: 75000, maxBuffer: 20 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
  const rows = output.trimEnd().split('\n');
  if (rows.length !== (after ? 5 : 4)) hold('READONLY_SNAPSHOT');
  const [originalAudit, dailyRowsRaw, ledger, catalog, newFacts] = rows;
  if (hash(JSON.stringify(JSON.parse(ledger))) !== expectedLedger) hold('LEDGER_MOVED');
  const schema = JSON.parse(catalog);
  validateCatalog(schema, after);
  if (after && Object.values(JSON.parse(newFacts)).some(value => value !== 0)) hold('NEW_INVENTORY_FIELDS_ALREADY_USED');
  if (JSON.parse(originalAudit).retired_duplicate_qty !== 0) hold('RETIRED_BATCH_STOCK');
  const facts = reviewConfirmedLegacyFacts({ originalAudit, dailyRowsRaw });
  return { originalConclusion: 'HOLD', stableAudit: facts.stableExactAuditSha256, historicalDaily: facts.dailyRowsSha256 };
}

function evidence(env, reviewed, actualLedger, beforeLedger, after) {
  if (![actualLedger, beforeLedger, env.VET_CI_SHA256].every(value => digest.test(value ?? ''))
      || !/^ghcr\.io\/ivanzhao299\/phoenix-erp-v3\/api@sha256:[a-f0-9]{64}$/.test(env.VET_API_IMAGE ?? '')) hold('CANDIDATE_IMAGE');
  const runtime = captureRuntime();
  if (env.RUNNING_CHECKOUT !== baseline || !['api', 'web'].every(service => runtime[service]?.revision === baseline)) hold('RUNNING_BASELINE');
  const audit = snapshot(actualLedger, after);
  return { reviewed, runtime, ledger: beforeLedger, apiImage: env.VET_API_IMAGE, ci: env.VET_CI_SHA256,
    directive: verifyConfirmedModernSchemaSources(CONTRACT.repository, undefined, reviewed.target), audit };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const env = process.env;
    const git = (...args) => execFileSync('git', ['--no-replace-objects', '-c', 'safe.directory=' + process.cwd(),
      '-c', 'core.hooksPath=/dev/null', ...args], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const reviewed = verifyWorkflowSource(env.TARGET_SHA, git, env.RECOVERY_APPLY_RUN);
    const action = process.argv[2];
    if (action === 'source') console.log(JSON.stringify(reviewed));
    else if (action === 'inspect') {
      if (env.PENDING_CLASSES?.trim().split(/\s+/).join('\n') !== units.join('\n')) hold('PENDING_SET');
      const report = evidence(env, reviewed, env.LEDGER_SHA256, env.LEDGER_SHA256, false);
      console.error('AUDIT_CONCLUSION=HOLD');
      console.error('INVENTORY_SCOPED_CONCLUSION=GO_INVENTORY_SCHEMA_ONLY');
      console.log(canonicalDigest(report));
    } else if (action === 'after' || action === 'recover') {
      const after = JSON.parse(env.AFTER_LEDGER);
      const before = action === 'after' ? JSON.parse(env.BEFORE_LEDGER) : withoutInventoryMigrations(after);
      verifyAppliedLedger(before, after);
      const beforeDigest = hash(JSON.stringify(before));
      if (beforeDigest !== env.EXPECTED_BEFORE_LEDGER_SHA256) hold('BEFORE_LEDGER');
      const result = evidence(env, reviewed, hash(env.AFTER_LEDGER), beforeDigest, true);
      if (!digest.test(env.EXPECTED_VET_INSPECTION_SHA256 ?? '') || canonicalDigest(result) !== env.EXPECTED_VET_INSPECTION_SHA256) {
        hold('RELEASE_OR_LEGACY_FACTS_MOVED');
      }
      console.log('INVENTORY_POST_MIGRATION=EXACT_LEDGER_AND_SHADOW_ONLY');
    } else hold('COMMAND');
  } catch (error) {
    console.error(error.message.startsWith('INVENTORY_SCHEMA_HOLD=') ? error.message : 'INVENTORY_SCHEMA_HOLD=SOURCE_OR_AUDIT_EVIDENCE');
    process.exitCode = 1;
  }
}
