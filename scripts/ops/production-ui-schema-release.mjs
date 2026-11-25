import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { auditSql } from './audit-daily-egg-inbound.mjs';
import { LEDGER_SQL } from './chanjet-admission-schema-receipt.mjs';
import { confirmedDailyRowsSql, reviewConfirmedLegacyFacts } from './production-modern-schema-confirmed-scope.mjs';
import { canonicalDigest } from './production-maintenance-receipts.mjs';
import { captureRuntime, executionEnv } from './capture-production-runtime.mjs';
import { MIGRATION_PATHS } from './production-config-guard.mjs';

const baseline = 'b80d326812b011966b3d98580ad001e20ac1acb2';
export const units = [
  '1795565100000-LegacyMobileProductionSummary',
  '1795565200000-FarmMedicineInboundReceipts',
  '1795565300000-ScopedFarmFeedLedger',
];
const seal = 'scripts/ops/production-ui-schema-reviewed-head';
const paths = units.map(unit => 'apps/api/src/database/migrations/' + unit + '.ts');
const sha = /^[a-f0-9]{40}$/;
const hash = /^[a-f0-9]{64}$/;
const hold = reason => { throw Error('PRODUCTION_UI_SCHEMA_HOLD=' + reason); };
const sha256 = value => createHash('sha256').update(value).digest('hex');

export function verifySource(target, git) {
  if (!sha.test(target)) hold('TARGET_SHA');
  const parents = revision => git('show', '-s', '--format=%P', revision).split(' ');
  const [base, sealed, ...extra] = parents(target);
  if (base !== baseline || !sha.test(sealed ?? '') || extra.length) hold('EXACT_MAIN_MERGE');
  const reviewed = git('show', target + ':' + seal);
  if (!sha.test(reviewed) || parents(sealed).join(' ') !== reviewed || git('show', reviewed + ':' + seal) !== 'PENDING'
      || git('diff', '--no-renames', '--name-status', reviewed, sealed) !== 'M\t' + seal
      || git('rev-parse', sealed + '^{tree}') !== git('rev-parse', target + '^{tree}')) hold('REVIEWED_TREE');
  git('merge-base', '--is-ancestor', baseline, reviewed);
  if (git('diff', '--no-renames', '--name-status', baseline, target, '--', ...MIGRATION_PATHS) !== paths.map(p => 'A\t' + p).join('\n')) {
    hold('MIGRATION_SET');
  }
  const migrations = paths.map(path => {
    const [mode, type, blob] = git('ls-tree', target, '--', path).split(/[ \t]/);
    if (mode !== '100644' || type !== 'blob' || !sha.test(blob)) hold('MIGRATION_BLOB');
    return { path, blob };
  });
  return { target, reviewed, baseline, migrations };
}

export function verifyAppliedLedger(before, after) {
  const expected = units.map(unit => {
    const [timestamp, name] = unit.split('-');
    return { timestamp: Number(timestamp), name: name + timestamp };
  });
  const added = row => expected.some(entry => String(entry.timestamp) === String(row.timestamp));
  if (!Array.isArray(before.typeorm) || !Array.isArray(after.typeorm) || before.typeorm.some(added)
      || canonicalDigest(before.legacy) !== canonicalDigest(after.legacy)
      || canonicalDigest(before.typeorm) !== canonicalDigest(after.typeorm.filter(row => !added(row)))
      || canonicalDigest(after.typeorm.filter(added)) !== canonicalDigest(expected)) hold('AFTER_LEDGER_DELTA');
}

const catalogSql = `
SELECT jsonb_build_object(
  'databaseMajor', current_setting('server_version_num')::int / 10000,
  'dailyColumn', (SELECT jsonb_build_object('text', atttypid = 'text'::regtype, 'nullable', NOT attnotnull, 'default', atthasdef)
    FROM pg_attribute WHERE attrelid = 'public.brd_daily_logs'::regclass AND attname = 'production_input_kind' AND NOT attisdropped),
  'medicineReceiptTable', to_regclass('public.farm_medicine_inbound_receipts') IS NOT NULL,
  'feedDayTable', to_regclass('public.farm_feed_days') IS NOT NULL,
  'feedItemTable', to_regclass('public.farm_feed_day_items') IS NOT NULL,
  'legacyFeedTable', to_regclass('public.farm_feed_ledger') IS NOT NULL
)::text;`;
const newFactsSql = `
SELECT jsonb_build_object(
  'dailyMarked', (SELECT count(*) FROM brd_daily_logs WHERE production_input_kind IS NOT NULL),
  'medicineReceipts', (SELECT count(*) FROM farm_medicine_inbound_receipts),
  'feedDays', (SELECT count(*) FROM farm_feed_days),
  'feedItems', (SELECT count(*) FROM farm_feed_day_items)
)::text;`;

export function validateCatalog(catalog, after) {
  if (!Number.isInteger(catalog?.databaseMajor) || catalog.databaseMajor < 16) hold('DATABASE_VERSION');
  if (after) {
    if (catalog.dailyColumn?.text !== true || catalog.dailyColumn.nullable !== true || catalog.dailyColumn.default !== false
        || !catalog.medicineReceiptTable || !catalog.feedDayTable || !catalog.feedItemTable || !catalog.legacyFeedTable) hold('POST_SCHEMA');
  } else if (catalog.dailyColumn !== null || catalog.medicineReceiptTable || catalog.feedDayTable || catalog.feedItemTable) {
    hold('PARTLY_APPLIED');
  }
}

function snapshot(expectedLedger, after) {
  const sql = [
    'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;',
    'SET LOCAL search_path=public;',
    "SET LOCAL statement_timeout='30s';",
    "SET LOCAL lock_timeout='3s';",
    'SET LOCAL row_security=off;',
    auditSql,
    confirmedDailyRowsSql.replace('to_jsonb(d)', "to_jsonb(d) - 'production_input_kind'") + ';',
    LEDGER_SQL,
    catalogSql,
    ...(after ? [newFactsSql] : []),
    'ROLLBACK;',
  ].join('\n');
  const output = execFileSync('docker', [
    'exec', '-i', '-e', 'PGOPTIONS=-c default_transaction_read_only=on', 'phoenix-v3-db', 'sh', '-c',
    'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
  ], { input: sql, env: executionEnv(), encoding: 'utf8', timeout: 75000, maxBuffer: 20 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
  const rows = output.trimEnd().split('\n');
  if (rows.length !== (after ? 5 : 4)) hold('READONLY_SNAPSHOT');
  const [originalAudit, dailyRowsRaw, ledger, catalog, newFacts] = rows;
  if (sha256(JSON.stringify(JSON.parse(ledger))) !== expectedLedger) hold('LEDGER_MOVED');
  const schema = JSON.parse(catalog);
  validateCatalog(schema, after);
  if (after && Object.values(JSON.parse(newFacts)).some(count => count !== 0)) hold('NEW_FACTS_ALREADY_WRITTEN');
  const original = JSON.parse(originalAudit);
  if (original.retired_duplicate_qty !== 0) hold('RETIRED_BATCH_STOCK');
  const facts = reviewConfirmedLegacyFacts({ originalAudit, dailyRowsRaw });
  return {
    databaseMajor: schema.databaseMajor, originalConclusion: original.conclusion,
    stableExactAuditSha256: facts.stableExactAuditSha256, dailyRowsSha256: facts.dailyRowsSha256,
  };
}

function releaseEvidence(env, reviewed, actualLedger, beforeLedger, after) {
  if (!hash.test(actualLedger) || !hash.test(beforeLedger) || !hash.test(env.VET_CI_SHA256)
      || !/^ghcr\.io\/ivanzhao299\/phoenix-erp-v3\/api@sha256:[a-f0-9]{64}$/.test(env.VET_API_IMAGE)) hold('CANDIDATE_IMAGE');
  const runtime = captureRuntime();
  if (env.RUNNING_CHECKOUT !== baseline || !['api', 'web'].every(service => runtime[service]?.revision === baseline)) hold('RUNNING_BASELINE');
  return {
    reviewed, runtime, ledgerSha256: beforeLedger, apiImage: env.VET_API_IMAGE, ciSha256: env.VET_CI_SHA256,
    ...snapshot(actualLedger, after), scopedConclusion: 'GO_PRODUCTION_UI_SCHEMA_EXACT',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const env = process.env;
    const git = (...args) => execFileSync('git', [
      '--no-replace-objects', '-c', 'safe.directory=' + process.cwd(), '-c', 'core.hooksPath=/dev/null', ...args,
    ], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const reviewed = verifySource(env.TARGET_SHA, git);
    const action = process.argv[2];
    if (action === 'source') console.log(JSON.stringify(reviewed));
    else if (action === 'inspect') {
      if (env.PENDING_CLASSES?.trim().split(/\s+/).join('\n') !== units.join('\n')) hold('PENDING_SET');
      const report = releaseEvidence(env, reviewed, env.LEDGER_SHA256, env.LEDGER_SHA256, false);
      console.error('AUDIT_CONCLUSION=' + report.originalConclusion);
      console.error('PRODUCTION_UI_SCOPED_CONCLUSION=' + report.scopedConclusion);
      console.error(JSON.stringify(report));
      console.log(canonicalDigest(report));
    } else if (action === 'after') {
      verifyAppliedLedger(JSON.parse(env.BEFORE_LEDGER), JSON.parse(env.AFTER_LEDGER));
      const report = releaseEvidence(env, reviewed, sha256(env.AFTER_LEDGER), sha256(env.BEFORE_LEDGER), true);
      if (!hash.test(env.EXPECTED_VET_INSPECTION_SHA256) || canonicalDigest(report) !== env.EXPECTED_VET_INSPECTION_SHA256) {
        hold('HISTORICAL_FACTS_OR_RUNTIME_MOVED');
      }
      console.log('PRODUCTION_UI_POST_MIGRATION=EXACT_LEDGER_AND_UNCHANGED_HISTORY');
    } else hold('COMMAND');
  } catch (error) {
    console.error(error.message.startsWith('PRODUCTION_UI_SCHEMA_HOLD=') ? error.message : 'PRODUCTION_UI_SCHEMA_HOLD=SOURCE_OR_AUDIT_EVIDENCE');
    process.exitCode = 1;
  }
}
