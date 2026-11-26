import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { auditSql } from './audit-daily-egg-inbound.mjs';
import { LEDGER_SQL } from './chanjet-admission-schema-receipt.mjs';
import { confirmedDailyRowsSql, reviewConfirmedLegacyFacts, verifyConfirmedModernSchemaSources } from './production-modern-schema-confirmed-scope.mjs';
import { canonicalDigest } from './production-maintenance-receipts.mjs';
import { captureRuntime, executionEnv } from './capture-production-runtime.mjs';
import { CONTRACT, MIGRATION_PATHS } from './production-config-guard.mjs';

const baseline = '24ce3f015e2ba96ecfadbdf1ddf4dc2eb9872428';
const seal = 'scripts/ops/egg-source-permissions-reviewed-head';
export const unit = '1795651200000-EggSourceIndependentPermissions';
const migrationPath = 'apps/api/src/database/migrations/' + unit + '.ts';
const expectedLedgerEntry = { timestamp: 1795651200000, name: 'EggSourceIndependentPermissions1795651200000' };
const sha = /^[a-f0-9]{40}$/;
const hash = /^[a-f0-9]{64}$/;
const hold = reason => { throw Error('EGG_SOURCE_PERMISSIONS_HOLD=' + reason); };
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
  if (git('diff', '--no-renames', '--name-status', baseline, target, '--', ...MIGRATION_PATHS) !== 'A\t' + migrationPath) hold('MIGRATION_SET');
  if (git('diff', '--no-renames', '--name-only', baseline, target, '--', ...CONTRACT.criticalFiles)) hold('CONFIG_FLOOR');
  const [mode, type, blob] = git('ls-tree', target, '--', migrationPath).split(/[ \t]/);
  if (mode !== '100644' || type !== 'blob' || !sha.test(blob)) hold('MIGRATION_BLOB');
  return { target, reviewed, baseline, migrations: [{path:migrationPath,blob}] };
}

export function verifyAppliedLedger(before, after) {
  const added = row => String(row.timestamp) === String(expectedLedgerEntry.timestamp);
  if (!Array.isArray(before.typeorm) || !Array.isArray(after.typeorm) || before.typeorm.some(added)
      || canonicalDigest(before.legacy) !== canonicalDigest(after.legacy)
      || canonicalDigest(before.typeorm) !== canonicalDigest(after.typeorm.filter(row => !added(row)))
      || canonicalDigest(after.typeorm.filter(added)) !== canonicalDigest([expectedLedgerEntry])) hold('AFTER_LEDGER_DELTA');
}

const expectedMenu = ['MENU_MD_EGG_SOURCE','蛋品来源档案','MASTER','MENU_MASTER_DATA','/master-data/egg-sources'];
const expectedTriggers = [
  ['md_egg_source_change_events','egg_source_event_require_independent_writer','require_independent_egg_source_writer','O',7],
  ['sys_menu','egg_source_menu_managed','guard_egg_source_permission_configuration','O',31],
  ['md_egg_source_changes','egg_source_require_independent_writer','require_independent_egg_source_writer','O',23],
  ['sys_role_menu_permission','egg_source_role_grants_managed','guard_egg_source_permission_configuration','O',31],
];
const triggerNames = expectedTriggers.map(([,name]) => "'" + name + "'").join(',');
export const catalogSql = `
SELECT jsonb_build_object(
  'databaseMajor', current_setting('server_version_num')::int / 10000,
  'baseTables', to_regclass('public.md_egg_source_changes') IS NOT NULL
    AND to_regclass('public.md_egg_source_change_events') IS NOT NULL,
  'controlTable', to_regclass('public.md_egg_source_write_control') IS NOT NULL,
  'catalog', COALESCE((SELECT jsonb_agg(jsonb_build_array(menu_code,menu_name_zh,domain,parent_code,route))
    FROM sys_menu WHERE menu_code='MENU_MD_EGG_SOURCE' OR route='/master-data/egg-sources'),'[]'::jsonb),
  'triggers', COALESCE((SELECT jsonb_agg(jsonb_build_array(tbl.relname,t.tgname,proc.proname,t.tgenabled,t.tgtype::int) ORDER BY t.tgname)
    FROM pg_trigger t JOIN pg_class tbl ON tbl.oid=t.tgrelid JOIN pg_proc proc ON proc.oid=t.tgfoid
    JOIN pg_namespace tbl_ns ON tbl_ns.oid=tbl.relnamespace JOIN pg_namespace fn_ns ON fn_ns.oid=proc.pronamespace
    WHERE tbl_ns.nspname='public' AND fn_ns.nspname='public' AND NOT t.tgisinternal AND t.tgname IN (${triggerNames})),'[]'::jsonb)
)::text;`;
export const controlSql = `
SELECT jsonb_build_object(
  'control', COALESCE((SELECT jsonb_agg(jsonb_build_array(id,writes_enabled,ever_enabled,changed_by,change_reason,menu_inserted))
    FROM md_egg_source_write_control),'[]'::jsonb),
  'grants', (SELECT count(*) FROM sys_role_menu_permission JOIN sys_menu USING(menu_id) WHERE menu_code='MENU_MD_EGG_SOURCE')
    + (SELECT count(*) FROM sys_permission_set_item JOIN sys_menu USING(menu_id) WHERE menu_code='MENU_MD_EGG_SOURCE')
    + (SELECT count(*) FROM sys_data_scopes WHERE module_code='MENU_MD_EGG_SOURCE')
)::text;`;

export function validateCatalog(catalog, control) {
  if (!Number.isInteger(catalog?.databaseMajor) || catalog.databaseMajor < 16 || catalog.baseTables !== true) hold('PREVIOUS_SCHEMA');
  if (!control) {
    if (catalog.controlTable || !Array.isArray(catalog.catalog) || catalog.catalog.length ||
        !Array.isArray(catalog.triggers) || catalog.triggers.length) hold('PARTLY_APPLIED');
    return;
  }
  if (catalog.controlTable !== true || canonicalDigest(catalog.catalog) !== canonicalDigest([expectedMenu])
      || canonicalDigest(catalog.triggers) !== canonicalDigest(expectedTriggers)
      || canonicalDigest(control.control) !== canonicalDigest([[1,false,false,null,null,true]]) || control.grants !== 0) hold('POST_SCHEMA');
}

function snapshot(expectedLedger, after) {
  const sql = [
    'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;',
    'SET LOCAL search_path=public;',
    "SET LOCAL statement_timeout='30s';",
    "SET LOCAL lock_timeout='3s';",
    'SET LOCAL row_security=off;',
    auditSql,
    confirmedDailyRowsSql + ';',
    LEDGER_SQL,
    catalogSql,
    ...(after ? [controlSql] : []),
    'ROLLBACK;',
  ].join('\n');
  const output = execFileSync('docker', [
    'exec', '-i', '-e', 'PGOPTIONS=-c default_transaction_read_only=on', 'phoenix-v3-db', 'sh', '-c',
    'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
  ], { input:sql,env:executionEnv(),encoding:'utf8',timeout:75000,maxBuffer:20*1024*1024,stdio:['pipe','pipe','pipe'] });
  const rows = output.trimEnd().split('\n');
  if (rows.length !== (after ? 5 : 4)) hold('READONLY_SNAPSHOT');
  const [originalAudit,dailyRowsRaw,ledger,catalogRaw,controlRaw] = rows;
  if (sha256(JSON.stringify(JSON.parse(ledger))) !== expectedLedger) hold('LEDGER_MOVED');
  const catalog = JSON.parse(catalogRaw);
  validateCatalog(catalog, after ? JSON.parse(controlRaw) : null);
  const audit = JSON.parse(originalAudit);
  if (audit.retired_duplicate_qty !== 0) hold('RETIRED_BATCH_STOCK');
  const facts = reviewConfirmedLegacyFacts({ originalAudit,dailyRowsRaw });
  return {
    databaseMajor:catalog.databaseMajor,originalConclusion:audit.conclusion,
    stableExactAuditSha256:facts.stableExactAuditSha256,dailyRowsSha256:facts.dailyRowsSha256,
  };
}

function releaseEvidence(env, reviewed, actualLedger, beforeLedger, after) {
  if (!hash.test(actualLedger) || !hash.test(beforeLedger) || !hash.test(env.VET_CI_SHA256)
      || !/^ghcr\.io\/ivanzhao299\/phoenix-erp-v3\/api@sha256:[a-f0-9]{64}$/.test(env.VET_API_IMAGE)) hold('CANDIDATE_IMAGE');
  const runtime = captureRuntime();
  if (env.RUNNING_CHECKOUT !== baseline || !['api','web'].every(service => runtime[service]?.revision === baseline)) hold('RUNNING_BASELINE');
  return {
    reviewed,runtime,ledgerSha256:beforeLedger,apiImage:env.VET_API_IMAGE,ciSha256:env.VET_CI_SHA256,
    sourceDirectiveSha256:verifyConfirmedModernSchemaSources(CONTRACT.repository,undefined,reviewed.target),
    ...snapshot(actualLedger,after),scopedConclusion:'GO_EGG_SOURCE_PERMISSIONS_EXACT',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const env = process.env;
    const git = (...args) => execFileSync('git', [
      '--no-replace-objects','-c','safe.directory='+process.cwd(),'-c','core.hooksPath=/dev/null',...args,
    ], {encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']}).trim();
    const reviewed = verifySource(env.TARGET_SHA,git);
    const action = process.argv[2];
    if (action === 'source') console.log(JSON.stringify(reviewed));
    else if (action === 'inspect') {
      if (env.PENDING_CLASSES?.trim() !== unit) hold('PENDING_SET');
      const report = releaseEvidence(env,reviewed,env.LEDGER_SHA256,env.LEDGER_SHA256,false);
      console.error('AUDIT_CONCLUSION='+report.originalConclusion);
      console.error('EGG_SOURCE_PERMISSIONS_SCOPED_CONCLUSION='+report.scopedConclusion);
      console.error(JSON.stringify(report));
      console.log(canonicalDigest(report));
    } else if (action === 'after') {
      verifyAppliedLedger(JSON.parse(env.BEFORE_LEDGER),JSON.parse(env.AFTER_LEDGER));
      const report = releaseEvidence(env,reviewed,sha256(env.AFTER_LEDGER),sha256(env.BEFORE_LEDGER),true);
      if (!hash.test(env.EXPECTED_VET_INSPECTION_SHA256) || canonicalDigest(report) !== env.EXPECTED_VET_INSPECTION_SHA256) hold('HISTORICAL_FACTS_OR_RUNTIME_MOVED');
      console.log('EGG_SOURCE_PERMISSIONS_POST_MIGRATION=EXACT_LEDGER_CLOSED_WRITES_UNCHANGED_HISTORY');
    } else hold('COMMAND');
  } catch (error) {
    console.error(error.message.startsWith('EGG_SOURCE_PERMISSIONS_HOLD=') ? error.message : 'EGG_SOURCE_PERMISSIONS_HOLD=SOURCE_OR_AUDIT_EVIDENCE');
    process.exitCode=1;
  }
}
