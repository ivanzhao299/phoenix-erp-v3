import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { auditSql } from './audit-daily-egg-inbound.mjs';
import { LEDGER_SQL } from './chanjet-admission-schema-receipt.mjs';
import { confirmedDailyRowsSql, reviewConfirmedLegacyFacts, verifyConfirmedModernSchemaSources } from './production-modern-schema-confirmed-scope.mjs';
import { canonicalDigest } from './production-maintenance-receipts.mjs';
import { captureRuntime, executionEnv } from './capture-production-runtime.mjs';
import { CONTRACT, MIGRATION_PATHS } from './production-config-guard.mjs';

const baseline = '2deff2c343eb012a16d6f0ac4e305533c96705f5';
const originalMerge = '779d78aaec96f7a54b9f43c763d3c5a60c19b489';
const seal = 'scripts/ops/egg-source-house-reviewed-head';
const preflightSeal = 'scripts/ops/egg-source-house-preflight-reviewed-head';
const preflightFiles = [
  '.github/workflows/controlled-pending-migration-apply.yml',
  'scripts/ops/egg-source-house-release.mjs',
  'scripts/ops/egg-source-house-release.test.mjs',
  'scripts/ops/vet-1124-migration.test.mjs',
  preflightSeal,
].sort();
export const unit = '1795654800000-EggSourceHouseContract';
const migrationPath = 'apps/api/src/database/migrations/' + unit + '.ts';
export const expectedLedgerEntry = { timestamp: 1795654800000, name: 'EggSourceHouseContract1795654800000' };
const sha = /^[a-f0-9]{40}$/;
const hash = /^[a-f0-9]{64}$/;
const hold = reason => { throw Error('EGG_SOURCE_HOUSE_HOLD=' + reason); };
const sha256 = value => createHash('sha256').update(value).digest('hex');

function verifySealedMerge(target, baseCommit, sealPath, git) {
  const parents = revision => git('show', '-s', '--format=%P', revision).split(' ');
  const [base, sealed, ...extra] = parents(target);
  if (base !== baseCommit || !sha.test(sealed ?? '') || extra.length) hold('EXACT_MAIN_MERGE');
  const reviewed = git('show', target + ':' + sealPath);
  if (!sha.test(reviewed) || parents(sealed).join(' ') !== reviewed || git('show', reviewed + ':' + sealPath) !== 'PENDING'
      || git('diff', '--no-renames', '--name-status', reviewed, sealed) !== 'M\t' + sealPath
      || git('rev-parse', sealed + '^{tree}') !== git('rev-parse', target + '^{tree}')) hold('REVIEWED_TREE');
  git('merge-base', '--is-ancestor', baseCommit, reviewed);
  return reviewed;
}

export function verifySource(target, git) {
  if (!sha.test(target)) hold('TARGET_SHA');
  const approvedApplication = verifySealedMerge(originalMerge, baseline, seal, git);
  const reviewed = target===originalMerge ? approvedApplication : verifySealedMerge(target,originalMerge,preflightSeal,git);
  if (target!==originalMerge) {
    const changed = git('diff','--no-renames','--name-only',originalMerge,target).split('\n').sort();
    if (canonicalDigest(changed)!==canonicalDigest(preflightFiles)) hold('PREFLIGHT_ONLY_DIFF');
  }
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

const expectedTriggers = [
  ['md_egg_source_change_events','egg_source_event_require_house_protocol','require_egg_source_house_protocol','O',7],
  ['md_egg_source_house_rollouts','egg_source_house_rollout_managed','guard_egg_source_house_rollout','O',31],
  ['md_egg_source_organization_grants','egg_source_organization_grants_managed','guard_egg_source_organization_grants','O',31],
  ['md_egg_source_changes','egg_source_require_house_protocol','require_egg_source_house_protocol','O',23],
];
const legacyTriggers = [
  ['md_egg_source_change_events','egg_source_event_require_independent_writer','require_independent_egg_source_writer','O',7],
  ['md_egg_source_changes','egg_source_require_independent_writer','require_independent_egg_source_writer','O',23],
];
const triggerNames = [...expectedTriggers,...legacyTriggers].map(([,name]) => "'" + name + "'").join(',');
export const catalogSql = `
SELECT jsonb_build_object(
  'databaseMajor', current_setting('server_version_num')::int / 10000,
  'contract', COALESCE((SELECT jsonb_build_array(format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid))
    FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='public.md_egg_source_changes'::regclass AND a.attname='contract_version' AND NOT a.attisdropped),'null'::jsonb),
  'controlColumns', (SELECT count(*) FROM pg_attribute WHERE attrelid='public.md_egg_source_write_control'::regclass
    AND attname IN('house_writes_enabled','house_writes_ever_enabled','house_changed_at','house_changed_by','house_change_reason') AND NOT attisdropped),
  'newTables', to_regclass('public.md_egg_source_organization_grants') IS NOT NULL
    AND to_regclass('public.md_egg_source_house_rollouts') IS NOT NULL,
  'anyNewTables', to_regclass('public.md_egg_source_organization_grants') IS NOT NULL
    OR to_regclass('public.md_egg_source_house_rollouts') IS NOT NULL,
  'definitions', COALESCE((SELECT jsonb_object_agg(p.proname,p.prosrc)
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public'
      AND p.proname IN ('guard_egg_source_house_rollout','guard_egg_source_organization_grants','require_egg_source_house_protocol')),
    '{}'::jsonb),
  'triggers', COALESCE((SELECT jsonb_agg(jsonb_build_array(tbl.relname,t.tgname,proc.proname,t.tgenabled,t.tgtype::int) ORDER BY t.tgname)
    FROM pg_trigger t JOIN pg_class tbl ON tbl.oid=t.tgrelid JOIN pg_proc proc ON proc.oid=t.tgfoid
    JOIN pg_namespace tbl_ns ON tbl_ns.oid=tbl.relnamespace JOIN pg_namespace fn_ns ON fn_ns.oid=proc.pronamespace
    WHERE tbl_ns.nspname='public' AND fn_ns.nspname='public' AND NOT t.tgisinternal AND t.tgname IN (${triggerNames})),'[]'::jsonb)
)::text;`;
export const legacyControlSql = `
SELECT jsonb_build_object(
  'control',(SELECT jsonb_agg(jsonb_build_array(id,writes_enabled,ever_enabled,changed_by,change_reason,changed_at,menu_inserted) ORDER BY id)
    FROM md_egg_source_write_control),
  'roleGrants',(SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]'::jsonb)
    FROM sys_role_menu_permission x JOIN sys_menu USING(menu_id) WHERE menu_code='MENU_MD_EGG_SOURCE'),
  'setGrants',(SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]'::jsonb)
    FROM sys_permission_set_item x JOIN sys_menu USING(menu_id) WHERE menu_code='MENU_MD_EGG_SOURCE'),
  'dataScopes',(SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]'::jsonb)
    FROM sys_data_scopes x WHERE module_code='MENU_MD_EGG_SOURCE')
)::text;`;
export const newControlSql = `
SELECT jsonb_build_object(
  'control',(SELECT jsonb_agg(jsonb_build_array(id,house_writes_enabled,house_writes_ever_enabled,
    house_changed_at,house_changed_by,house_change_reason) ORDER BY id) FROM md_egg_source_write_control),
  'grants',(SELECT count(*) FROM md_egg_source_organization_grants),
  'rollouts',(SELECT count(*) FROM md_egg_source_house_rollouts),
  'changes',(SELECT count(*) FROM md_egg_source_changes WHERE contract_version<>1)
)::text;`;

export function validateCatalog(catalog, control, expectedDefinitions={}) {
  if (!Number.isInteger(catalog?.databaseMajor) || catalog.databaseMajor < 16) hold('PREVIOUS_SCHEMA');
  const triggers = (control ? [...legacyTriggers,...expectedTriggers] : legacyTriggers).slice().sort((a,b)=>a[1].localeCompare(b[1]));
  if (canonicalDigest(catalog.triggers) !== canonicalDigest(triggers)) hold('TRIGGERS');
  if (!control) {
    if (catalog.contract!==null || catalog.controlColumns!==0 || catalog.anyNewTables!==false || Object.keys(catalog.definitions??{}).length) hold('PARTLY_APPLIED');
    return;
  }
  const column = catalog.contract;
  const normalized = Object.fromEntries(Object.entries(catalog.definitions??{}).map(([name,body])=>[name,body.trim()]));
  if (canonicalDigest(normalized)!==canonicalDigest(expectedDefinitions)) hold('TRIGGER_DEFINITIONS');
  if (!Array.isArray(column) || column[0]!=='smallint' || column[1]!==true || !/^(?:1|'1'::smallint)$/.test(column[2])
      || catalog.controlColumns!==5 || catalog.newTables!==true
      || canonicalDigest(control.control)!==canonicalDigest([[1,false,false,null,null,null]])
      || control.grants!==0 || control.rollouts!==0 || control.changes!==0) hold('POST_SCHEMA');
}

export function withoutHouseMigration(ledger) {
  return {...ledger,typeorm:ledger.typeorm.filter(row=>String(row.timestamp)!==String(expectedLedgerEntry.timestamp))};
}

function definitions(source) {
  const entries = [...source.matchAll(/CREATE FUNCTION (guard_egg_source_house_rollout|guard_egg_source_organization_grants|require_egg_source_house_protocol)\(\) RETURNS trigger LANGUAGE plpgsql AS \$\$([\s\S]*?)\$\$;/g)];
  if (entries.length!==3 || new Set(entries.map(row=>row[1])).size!==3) hold('REVIEWED_TRIGGER_DEFINITIONS');
  return Object.fromEntries(entries.map(row=>[row[1],row[2].trim()]));
}

function snapshot(expectedLedger, after, expectedDefinitions) {
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
    legacyControlSql,
    ...(after ? [newControlSql] : []),
    'ROLLBACK;',
  ].join('\n');
  const output = execFileSync('docker', [
    'exec', '-i', '-e', 'PGOPTIONS=-c default_transaction_read_only=on', 'phoenix-v3-db', 'sh', '-c',
    'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
  ], { input:sql,env:executionEnv(),encoding:'utf8',timeout:75000,maxBuffer:20*1024*1024,stdio:['pipe','pipe','pipe'] });
  const rows = output.trimEnd().split('\n');
  if (rows.length !== (after ? 6 : 5)) hold('READONLY_SNAPSHOT');
  const [originalAudit,dailyRowsRaw,ledger,catalogRaw,legacyRaw,controlRaw] = rows;
  if (sha256(JSON.stringify(JSON.parse(ledger))) !== expectedLedger) hold('LEDGER_MOVED');
  const catalog = JSON.parse(catalogRaw);
  validateCatalog(catalog, after ? JSON.parse(controlRaw) : null, expectedDefinitions);
  const audit = JSON.parse(originalAudit);
  if (audit.retired_duplicate_qty !== 0) hold('RETIRED_BATCH_STOCK');
  const facts = reviewConfirmedLegacyFacts({ originalAudit,dailyRowsRaw });
  return {
    databaseMajor:catalog.databaseMajor,originalConclusion:audit.conclusion,
    stableExactAuditSha256:facts.stableExactAuditSha256,dailyRowsSha256:facts.dailyRowsSha256,
    legacyControlSha256:canonicalDigest(JSON.parse(legacyRaw)),
  };
}

function releaseEvidence(env, reviewed, actualLedger, beforeLedger, after, expectedDefinitions) {
  if (!hash.test(actualLedger) || !hash.test(beforeLedger) || !hash.test(env.VET_CI_SHA256)
      || !/^ghcr\.io\/ivanzhao299\/phoenix-erp-v3\/api@sha256:[a-f0-9]{64}$/.test(env.VET_API_IMAGE)) hold('CANDIDATE_IMAGE');
  for (const service of ['phoenix-v3-api','phoenix-v3-web']) {
    if (execFileSync('docker',['inspect',service,'--format','{{.State.Running}}'],
      {env:executionEnv(),encoding:'utf8',timeout:10000}).trim()!=='true') hold('BASELINE_SERVICE_STOPPED');
  }
  const runtime = captureRuntime();
  if (env.RUNNING_CHECKOUT !== baseline || !['api','web'].every(service => runtime[service]?.revision === baseline)) hold('RUNNING_BASELINE');
  return {
    reviewed,runtime,ledgerSha256:beforeLedger,apiImage:env.VET_API_IMAGE,ciSha256:env.VET_CI_SHA256,
    sourceDirectiveSha256:verifyConfirmedModernSchemaSources(CONTRACT.repository,undefined,reviewed.target),
    ...snapshot(actualLedger,after,expectedDefinitions),scopedConclusion:'GO_EGG_SOURCE_HOUSE_EXACT',
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
      console.error('EGG_SOURCE_HOUSE_SCOPED_CONCLUSION='+report.scopedConclusion);
      console.error(JSON.stringify(report));
      console.log(canonicalDigest(report));
    } else if (action === 'after' || action==='recover') {
      const after = JSON.parse(env.AFTER_LEDGER);
      const before = action==='after' ? JSON.parse(env.BEFORE_LEDGER) : withoutHouseMigration(after);
      verifyAppliedLedger(before,after);
      const beforeHash = sha256(JSON.stringify(before));
      if (beforeHash!==env.EXPECTED_BEFORE_LEDGER_SHA256) hold('BEFORE_LEDGER');
      const report = releaseEvidence(env,reviewed,sha256(env.AFTER_LEDGER),beforeHash,true,definitions(git('show',reviewed.target+':'+migrationPath)));
      if (!hash.test(env.EXPECTED_VET_INSPECTION_SHA256) || canonicalDigest(report) !== env.EXPECTED_VET_INSPECTION_SHA256) hold('HISTORICAL_FACTS_OR_RUNTIME_MOVED');
      console.log('EGG_SOURCE_HOUSE_POST_MIGRATION=EXACT_LEDGER_CLOSED_WRITES_UNCHANGED_HISTORY');
    } else hold('COMMAND');
  } catch (error) {
    console.error(error.message.startsWith('EGG_SOURCE_HOUSE_HOLD=') ? error.message : 'EGG_SOURCE_HOUSE_HOLD=SOURCE_OR_AUDIT_EVIDENCE');
    process.exitCode=1;
  }
}
