import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { auditSql } from './audit-daily-egg-inbound.mjs';
import { LEDGER_SQL } from './chanjet-admission-schema-receipt.mjs';
import { catalogSql as existingCatalogSql, legacyControlSql } from './egg-source-house-release.mjs';
import { confirmedDailyRowsSql, reviewConfirmedLegacyFacts, verifyConfirmedModernSchemaSources } from './production-modern-schema-confirmed-scope.mjs';
import { canonicalDigest } from './production-maintenance-receipts.mjs';
import { captureRuntime, executionEnv } from './capture-production-runtime.mjs';
import { CONTRACT, MIGRATION_PATHS } from './production-config-guard.mjs';

export const baseline='9c35bedfa5750735106496459c67c7156dfdd88c';
export const unit='1795658400000-EggSourceLegacyCreationGate';
export const seal='scripts/ops/egg-source-legacy-creation-reviewed-head';
const migration='apps/api/src/database/migrations/'+unit+'.ts';
const entry={timestamp:1795658400000,name:'EggSourceLegacyCreationGate1795658400000'};
const previousEntry={timestamp:1795654800000,name:'EggSourceHouseContract1795654800000'};
const revision=/^[a-f0-9]{40}$/;
const digest=/^[a-f0-9]{64}$/;
const hold=reason=>{throw new Error('EGG_SOURCE_LEGACY_CREATION_HOLD='+reason);};
const hash=value=>createHash('sha256').update(value).digest('hex');
const previousMigration='apps/api/src/database/migrations/1795654800000-EggSourceHouseContract.ts';
const independentMigration='apps/api/src/database/migrations/1795651200000-EggSourceIndependentPermissions.ts';
const existingTriggers=[
  ['md_egg_source_change_events','egg_source_event_require_house_protocol','require_egg_source_house_protocol','O',7],
  ['md_egg_source_change_events','egg_source_event_require_independent_writer','require_independent_egg_source_writer','O',7],
  ['md_egg_source_house_rollouts','egg_source_house_rollout_managed','guard_egg_source_house_rollout','O',31],
  ['md_egg_source_organization_grants','egg_source_organization_grants_managed','guard_egg_source_organization_grants','O',31],
  ['md_egg_source_changes','egg_source_require_house_protocol','require_egg_source_house_protocol','O',23],
  ['md_egg_source_changes','egg_source_require_independent_writer','require_independent_egg_source_writer','O',23],
];
const sourceAnchors=[
  'scripts/ops/audit-daily-egg-inbound.mjs',
  'scripts/ops/production-modern-schema-confirmed-scope.mjs',
  'scripts/ops/production-legacy-egg-audit-evidence.mjs',
  'scripts/ops/production-lossless-json.mjs',
  'scripts/ops/egg-source-house-release.mjs',
];

export function verifySource(target,git) {
  if (!revision.test(target)) hold('TARGET_SHA');
  const parents=value=>git('show','-s','--format=%P',value).split(' ');
  const [base,mergeHead,...extra]=parents(target);
  if (base!==baseline || !revision.test(mergeHead??'') || extra.length) hold('EXACT_MAIN_MERGE');
  const reviewed=git('show',target+':'+seal);
  if (!revision.test(reviewed) || parents(mergeHead).join(' ')!==reviewed || git('show',reviewed+':'+seal)!=='PENDING'
    || git('diff','--no-renames','--name-status',reviewed,mergeHead)!=='M\t'+seal
    || git('rev-parse',mergeHead+'^{tree}')!==git('rev-parse',target+'^{tree}')) hold('REVIEWED_TREE');
  git('merge-base','--is-ancestor',baseline,reviewed);
  if (git('diff','--no-renames','--name-status',baseline,target,'--',...MIGRATION_PATHS)!=='A\t'+migration) hold('MIGRATION_SET');
  if (git('diff','--no-renames','--name-only',baseline,target,'--',...CONTRACT.criticalFiles,...sourceAnchors)) hold('CONFIG_OR_AUDIT_FLOOR');
  const [mode,type,blob]=git('ls-tree',target,'--',migration).split(/[ \t]/);
  if (mode!=='100644'||type!=='blob'||!revision.test(blob)) hold('MIGRATION_BLOB');
  return {target,reviewed,baseline,migrations:[{path:migration,blob}]};
}

const added=row=>String(row.timestamp)===String(entry.timestamp);
export function withoutLegacyCreation(ledger) {
  return {...ledger,typeorm:ledger.typeorm.filter(row=>!added(row))};
}
export function verifyAppliedLedger(before,after) {
  if (!Array.isArray(before?.typeorm) || !Array.isArray(after?.typeorm) || before.typeorm.some(added)
    || canonicalDigest(before.legacy)!==canonicalDigest(after.legacy)
    || canonicalDigest(before.typeorm)!==canonicalDigest(withoutLegacyCreation(after).typeorm)
    || canonicalDigest(after.typeorm.filter(added))!==canonicalDigest([entry])) hold('AFTER_LEDGER');
}

const functions=['guard_egg_source_legacy_creation','prevent_egg_source_legacy_reopening'];
const triggers=[
  ['md_egg_source_changes','egg_source_legacy_creation_guard',functions[0],'O',7,true],
  ['md_egg_source_write_control','egg_source_legacy_creation_permanent',functions[1],'O',27,true],
  ['md_egg_source_write_control','egg_source_write_control_no_truncate',functions[1],'O',34,true],
];
const sqlList=names=>names.map(value=>"'"+value+"'").join(',');
export const gateCatalogSql=`
SELECT jsonb_build_object(
  'column',(SELECT jsonb_build_array(format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid))
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='public.md_egg_source_write_control'::regclass
      AND a.attname='legacy_creates_enabled' AND NOT a.attisdropped),
  'control',(SELECT jsonb_agg(jsonb_build_array(id,to_jsonb(w)->'legacy_creates_enabled') ORDER BY id)
    FROM md_egg_source_write_control w),
  'triggers',COALESCE((SELECT jsonb_agg(jsonb_build_array(tbl.relname,t.tgname,p.proname,t.tgenabled,t.tgtype::int,
    CASE WHEN t.tgname='egg_source_legacy_creation_permanent' THEN
      t.tgattr::text=(SELECT a.attnum::text FROM pg_attribute a
        WHERE a.attrelid=tbl.oid AND a.attname='legacy_creates_enabled' AND NOT a.attisdropped)
      ELSE t.tgattr::text='' END) ORDER BY t.tgname)
    FROM pg_trigger t JOIN pg_class tbl ON tbl.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
    JOIN pg_namespace ns ON ns.oid=tbl.relnamespace JOIN pg_namespace pns ON pns.oid=p.pronamespace
    WHERE ns.nspname='public' AND pns.nspname='public' AND NOT t.tgisinternal
      AND t.tgname IN (${sqlList(triggers.map(row=>row[1]))})),'[]'::jsonb),
  'functions',COALESCE((SELECT jsonb_object_agg(proname,btrim(prosrc)) FROM pg_proc
    WHERE pronamespace='public'::regnamespace AND proname IN (${sqlList(functions)})), '{}'::jsonb)
)::text;`;
const retainedStateSql=`
SELECT jsonb_build_object(
 'control',(SELECT jsonb_agg(to_jsonb(w)-'legacy_creates_enabled' ORDER BY id) FROM md_egg_source_write_control w),
 'independentWriter',(SELECT p.prosrc FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
   AND p.proname='require_independent_egg_source_writer' AND p.pronargs=0),
 'rollouts',(SELECT COALESCE(jsonb_agg(to_jsonb(w) ORDER BY company_code,house_code),'[]') FROM md_egg_source_house_rollouts w),
 'grants',(SELECT COALESCE(jsonb_agg(to_jsonb(g) ORDER BY id),'[]') FROM md_egg_source_organization_grants g)
)::text;`;

export function extractDefinitions(source) {
  const entries=[...source.matchAll(/CREATE FUNCTION ([a-z_]+)\(\) RETURNS trigger LANGUAGE plpgsql AS \$\$([\s\S]*?)\$\$;/g)];
  if (canonicalDigest(entries.map(row=>row[1]).sort())!==canonicalDigest(functions)) hold('SOURCE_FUNCTIONS');
  return Object.fromEntries(entries.map(row=>[row[1],row[2].trim()]));
}

export function validateGateCatalog(catalog,defs) {
  if (!defs) {
    if (catalog.column!==null || canonicalDigest(catalog.control)!==canonicalDigest([[1,null]])
      || catalog.triggers?.length!==0 || Object.keys(catalog.functions??{}).length) hold('PARTIALLY_APPLIED');
    return;
  }
  if (canonicalDigest(catalog.column)!==canonicalDigest(['boolean',true,'true'])
    || canonicalDigest(catalog.control)!==canonicalDigest([[1,true]])
    || canonicalDigest(catalog.triggers)!==canonicalDigest(triggers)
    || canonicalDigest(Object.fromEntries(Object.entries(catalog.functions??{}).map(([key,body])=>[key,body.trim()])))!==canonicalDigest(defs)) {
    hold('NEW_GATE_NOT_DEFAULT_COMPATIBLE');
  }
}

function readDefinitions(source,names) {
  return Object.fromEntries([...source.matchAll(/CREATE FUNCTION ([a-z_]+)\(\) RETURNS trigger LANGUAGE plpgsql AS \$\$([\s\S]*?)\$\$;/g)]
    .filter(row=>names.includes(row[1])).map(row=>[row[1],row[2].trim()]));
}
export function validateExistingCatalog(catalog,expected,independentWriter) {
  const column=catalog.contract;
  if (catalog.databaseMajor<16 || catalog.newTables!==true || catalog.controlColumns!==5
    || !Array.isArray(column) || column[0]!=='smallint' || column[1]!==true || !/^(?:1|'1'::smallint)$/.test(column[2])
    || canonicalDigest(catalog.triggers)!==canonicalDigest(existingTriggers)
    || canonicalDigest(Object.fromEntries(Object.entries(catalog.definitions??{}).map(([key,body])=>[key,body.trim()])))!==canonicalDigest(expected.house)
    || independentWriter?.trim()!==expected.independent?.require_independent_egg_source_writer) hold('HOUSE_CATALOG');
}

function snapshot(actualLedger,existing,defs) {
  const sql=[
    'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;', 'SET LOCAL search_path=public;',
    "SET LOCAL statement_timeout='30s';", "SET LOCAL lock_timeout='3s';", 'SET LOCAL row_security=off;',
    auditSql,confirmedDailyRowsSql+';',LEDGER_SQL,existingCatalogSql,legacyControlSql,retainedStateSql,gateCatalogSql,'ROLLBACK;',
  ].join('\n');
  const output=execFileSync('docker',['exec','-i','-e','PGOPTIONS=-c default_transaction_read_only=on','phoenix-v3-db','sh','-c',
    'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
    {input:sql,env:executionEnv(),encoding:'utf8',timeout:75000,maxBuffer:20*1024*1024,stdio:['pipe','pipe','pipe']});
  const lines=output.trimEnd().split('\n');
  if (lines.length!==7) hold('READONLY_SNAPSHOT');
  const [originalAudit,dailyRowsRaw,ledger,catalogRaw,legacyRaw,retainedRaw,gateRaw]=lines;
  const ledgerState=JSON.parse(ledger);
  if (hash(JSON.stringify(ledgerState))!==actualLedger) hold('LEDGER_MOVED');
  if (!ledgerState.typeorm.some(row=>String(row.timestamp)===String(previousEntry.timestamp) && row.name===previousEntry.name)) hold('HOUSE_MIGRATION_NOT_APPLIED');
  const catalog=JSON.parse(catalogRaw);
  const retained=JSON.parse(retainedRaw);
  validateExistingCatalog(catalog,existing,retained.independentWriter);
  validateGateCatalog(JSON.parse(gateRaw),defs);
  const audit=JSON.parse(originalAudit);
  if (audit.retired_duplicate_qty!==0) hold('RETIRED_BATCH_STOCK');
  const facts=reviewConfirmedLegacyFacts({originalAudit,dailyRowsRaw});
  return {
    originalConclusion:audit.conclusion,stableExactAuditSha256:facts.stableExactAuditSha256,dailyRowsSha256:facts.dailyRowsSha256,
    retainedSchemaSha256:canonicalDigest(catalog),
    retainedConfigSha256:canonicalDigest([JSON.parse(legacyRaw),retained]),
  };
}

function releaseEvidence(env,reviewed,actualLedger,beforeLedger,existing,defs) {
  if (![actualLedger,beforeLedger,env.VET_CI_SHA256].every(value=>digest.test(value??''))
    || !/^ghcr\.io\/ivanzhao299\/phoenix-erp-v3\/api@sha256:[a-f0-9]{64}$/.test(env.VET_API_IMAGE??'')) hold('CANDIDATE_IMAGE');
  const runtime=captureRuntime();
  if (env.RUNNING_CHECKOUT!==baseline || !['api','web'].every(service=>runtime[service]?.revision===baseline)) hold('RUNNING_BASELINE');
  return {
    reviewed,runtime,ledgerSha256:beforeLedger,apiImage:env.VET_API_IMAGE,ciSha256:env.VET_CI_SHA256,
    sourceDirectiveSha256:verifyConfirmedModernSchemaSources(CONTRACT.repository,undefined,reviewed.target),
    ...snapshot(actualLedger,existing,defs),scopedConclusion:'GO_EGG_SOURCE_LEGACY_CREATION_EXACT_SCHEMA_ONLY',
  };
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const env=process.env;
    const git=(...args)=>execFileSync('git',['--no-replace-objects','-c','safe.directory='+process.cwd(),
      '-c','core.hooksPath=/dev/null',...args],{encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']}).trim();
    const reviewed=verifySource(env.TARGET_SHA,git);
    const action=process.argv[2];
    if (action==='source') {
      console.log(JSON.stringify(reviewed));
    } else {
    const existing={
      house:readDefinitions(git('show',baseline+':'+previousMigration),[
        'guard_egg_source_house_rollout','guard_egg_source_organization_grants','require_egg_source_house_protocol',
      ]),
      independent:readDefinitions(git('show',baseline+':'+independentMigration),['require_independent_egg_source_writer']),
    };
    if (Object.keys(existing.house).length!==3 || Object.keys(existing.independent).length!==1) hold('BASELINE_FUNCTIONS');
    if (action==='inspect') {
      if (env.PENDING_CLASSES?.trim()!==unit) hold('PENDING_SET');
      const proof=releaseEvidence(env,reviewed,env.LEDGER_SHA256,env.LEDGER_SHA256,existing);
      console.error('AUDIT_CONCLUSION='+proof.originalConclusion);
      console.error('EGG_SOURCE_LEGACY_CREATION_SCOPED_CONCLUSION='+proof.scopedConclusion);
      console.log(canonicalDigest(proof));
    } else if (action==='after'||action==='recover') {
      const after=JSON.parse(env.AFTER_LEDGER);
      const before=action==='after' ? JSON.parse(env.BEFORE_LEDGER) : withoutLegacyCreation(after);
      verifyAppliedLedger(before,after);
      const beforeChecksum=hash(JSON.stringify(before));
      if (beforeChecksum!==env.EXPECTED_BEFORE_LEDGER_SHA256) hold('BEFORE_LEDGER');
      const defs=extractDefinitions(git('show',reviewed.target+':'+migration));
      const proof=releaseEvidence(env,reviewed,hash(env.AFTER_LEDGER),beforeChecksum,existing,defs);
      if (!digest.test(env.EXPECTED_VET_INSPECTION_SHA256??'') || canonicalDigest(proof)!==env.EXPECTED_VET_INSPECTION_SHA256) hold('AFTER_EVIDENCE_MOVED');
      console.log('EGG_SOURCE_LEGACY_CREATION_POST_MIGRATION=EXACT_LEDGER_LEGACY_CREATION_PRESERVED');
    } else hold('COMMAND');
    }
  } catch (error) {
    console.error(error.message.startsWith('EGG_SOURCE_LEGACY_CREATION_HOLD=') ? error.message : 'EGG_SOURCE_LEGACY_CREATION_HOLD=SOURCE_OR_AUDIT_EVIDENCE');
    process.exitCode=1;
  }
}
