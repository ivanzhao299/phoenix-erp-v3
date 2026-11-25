import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { auditSql } from './audit-daily-egg-inbound.mjs';
import { LEDGER_SQL } from './chanjet-admission-schema-receipt.mjs';
import { confirmedDailyRowsSql, reviewConfirmedLegacyFacts } from './production-modern-schema-confirmed-scope.mjs';
import { canonicalDigest } from './production-maintenance-receipts.mjs';
import { captureRuntime } from './capture-production-runtime.mjs';
import { MIGRATION_PATHS } from './production-config-guard.mjs';

const baseline='081cf2bd25c061ff0033a72a28b69a4ebf7d50ae';
const baseMain='e7258a6d9d752ababe25a26fe80b4931261d10c4';
export const units=['1795564800000-EggSourceChanges','1795564900000-EggCollectionProductionDay','1795565000000-ApprovedEggProductDomainExtension'];
const sealFile='scripts/ops/egg-source-reviewed-head';
const paths=units.map(unit=>'apps/api/src/database/migrations/'+unit+'.ts');
const hash=/^[a-f0-9]{64}$/;
const sha=/^[a-f0-9]{40}$/;
const hold=reason=>{throw Error('EGG_SOURCE_RELEASE_HOLD='+reason);};

function source(target) {
  if (!sha.test(target)) hold('TARGET_SHA');
  const git=(...args)=>execFileSync('git',['--no-replace-objects','-c','safe.directory='+process.cwd(),
    '-c','core.hooksPath=/dev/null',...args],{encoding:'utf8',timeout:15000}).trim();
  const parents=revision=>git('show','-s','--format=%P',revision).split(' ');
  const [base,sealed,...extra]=parents(target);
  if(base!==baseMain||!sha.test(sealed??'')||extra.length)hold('EXACT_MAIN_MERGE');
  const reviewed=git('show',target+':'+sealFile);
  if(!sha.test(reviewed)||parents(sealed).join(' ')!==reviewed||git('show',reviewed+':'+sealFile)!=='PENDING'
    ||git('diff','--no-renames','--name-status',reviewed,sealed)!=='M\t'+sealFile
    ||git('rev-parse',sealed+'^{tree}')!==git('rev-parse',target+'^{tree}'))hold('REVIEWED_TREE');
  git('merge-base','--is-ancestor',baseMain,reviewed);
  if (git('diff','--no-renames','--name-status',baseline,target,'--',...MIGRATION_PATHS)!==paths.map(p=>'A\t'+p).join('\n')) hold('MIGRATION_SET');
  const migrations=paths.map(path=>{
    const [mode,type,blob]=git('ls-tree',target,'--',path).split(/[ \t]/);
    if(mode!=='100644'||type!=='blob'||!sha.test(blob)) hold('MIGRATION_BLOB');
    return {path,blob};
  });
  return {target,reviewed,baseline,migrations};
}

const catalogSql=`
WITH anchors(name,needle) AS (VALUES
  ('guard_production_cutover_metadata','IF current_state<>''DRAFT'' OR (TG_OP=''UPDATE'' AND EXISTS('),
  ('guard_cutover_executor_write','IF TG_TABLE_NAME=''production_cutover_scopes'' THEN'),
  ('guard_cutover_apply_admission','SELECT * INTO backend FROM pg_stat_activity WHERE pid=NEW.backend_pid'),
  ('check_cutover_apply_completion','expected_scopes:=jsonb_array_length(d.boundary->''houses'');'),
  ('guard_official_raw_posted','shift.production_date IS DISTINCT FROM NEW.production_date')
), definitions AS (
  SELECT anchors.name,needle,pg_get_functiondef(proc.oid) AS body,proc.proowner,proc.prosecdef,proc.proconfig
  FROM anchors LEFT JOIN pg_proc proc ON proc.oid=to_regprocedure('public.'||anchors.name||'()')
)
SELECT jsonb_build_object(
  'databaseMajor',current_setting('server_version_num')::int/10000,
  'extensionAvailable',EXISTS(SELECT 1 FROM pg_available_extensions WHERE name='btree_gist'),
  'pendingObjectsClear',to_regclass('public.md_egg_source_changes') IS NULL
    AND to_regclass('public.md_egg_history_reviews') IS NULL
    AND to_regprocedure('public.approved_egg_domain_extension(uuid,uuid,text,text,text)') IS NULL,
  'existingConstraint',EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.md_egg_source_profiles'::regclass
    AND conname='uq_egg_source_house_date'),
  'activeOverlaps',(SELECT count(*) FROM md_egg_source_profiles a JOIN md_egg_source_profiles b
    ON a.profile_code<b.profile_code AND a.company_code=b.company_code AND a.house_code=b.house_code
    WHERE a.status='ACTIVE' AND b.status='ACTIVE' AND a.effective_date<=COALESCE(b.expire_date,'infinity'::date)
      AND b.effective_date<=COALESCE(a.expire_date,'infinity'::date)),
  'anchors',(SELECT count(*) FROM definitions WHERE (length(body)-length(replace(body,needle,'')))=length(needle)),
  'functionShapes',(SELECT jsonb_agg(jsonb_build_array(name,encode(sha256(convert_to(body,'UTF8')),'hex'),proowner,prosecdef,proconfig) ORDER BY name) FROM definitions),
  'migrationRoleReady',EXISTS(SELECT 1 FROM pg_roles migration_role WHERE migration_role.rolname=:'migration_role'
    AND migration_role.rolcanlogin AND (
      migration_role.rolsuper OR (
        has_database_privilege(migration_role.oid,current_database(),'CREATE') AND
        has_schema_privilege(migration_role.oid,'public','CREATE') AND
        NOT EXISTS(SELECT 1 FROM definitions WHERE proowner IS NULL OR NOT pg_has_role(migration_role.oid,proowner,'USAGE')) AND
        EXISTS(SELECT 1 FROM pg_class tbl WHERE tbl.oid='public.md_egg_source_profiles'::regclass
          AND pg_has_role(migration_role.oid,tbl.relowner,'USAGE')))))
)::text;
`;
function productionSnapshot(expectedLedger) {
  let migrationRole='phoenix_v3';
  try{
    const value=execFileSync('grep',['-m1','-E','^DB_USER=','/data/phoenix-erp/.env'],{encoding:'utf8',
      stdio:['ignore','pipe','pipe'],timeout:3000}).trimEnd().slice('DB_USER='.length);
    migrationRole=value.replace(/^"/,'').replace(/"$/,'')||migrationRole;
  }catch(error){if(error.status!==1)hold('MIGRATION_ROLE');}
  if(!/^[A-Za-z_][A-Za-z_0-9]{0,62}$/.test(migrationRole))hold('MIGRATION_ROLE');
  const sql=['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;','SET LOCAL search_path=public;',
    "SET LOCAL statement_timeout='30s';","SET LOCAL lock_timeout='3s';",'SET LOCAL row_security=off;',
    auditSql,confirmedDailyRowsSql+';',LEDGER_SQL,catalogSql,'ROLLBACK;'].join('\n');
  const output=execFileSync('docker',['exec','-i','-e','PGOPTIONS=-c default_transaction_read_only=on','phoenix-v3-db',
    'sh','-c','exec psql -X -qAt -v ON_ERROR_STOP=1 -v migration_role="$1" -U "$POSTGRES_USER" -d "$POSTGRES_DB"','snapshot',migrationRole],
    {input:sql,encoding:'utf8',timeout:75000,maxBuffer:20*1024*1024});
  const [originalAudit,dailyRowsRaw,ledgerLine,catalogLine,...extra]=output.trimEnd().split('\n');
  if(!catalogLine||extra.length)hold('SOURCE_AUDIT_SNAPSHOT');
  if(createHash('sha256').update(JSON.stringify(JSON.parse(ledgerLine))).digest('hex')!==expectedLedger)hold('SOURCE_SNAPSHOT_LEDGER_MOVED');
  const catalog=JSON.parse(catalogLine);
  if(catalog.databaseMajor<16||!catalog.extensionAvailable||!catalog.existingConstraint||!catalog.pendingObjectsClear||
      !catalog.migrationRoleReady||catalog.activeOverlaps!==0||catalog.anchors!==5)hold('SOURCE_CATALOG');
  return {originalAudit,dailyRowsRaw,catalog};
}

export function verifyAppliedLedger(before,after) {
  const expected=units.map(unit=>{
    const [stamp,name]=unit.split('-');
    return {timestamp:Number(stamp),name:name+stamp};
  });
  const isNew=row=>expected.some(entry=>String(entry.timestamp)===String(row.timestamp));
  if(!Array.isArray(before.typeorm)||!Array.isArray(after.typeorm)||before.typeorm.some(isNew)
    ||canonicalDigest(before.legacy)!==canonicalDigest(after.legacy)
    ||canonicalDigest(before.typeorm)!==canonicalDigest(after.typeorm.filter(row=>!isNew(row)))
    ||canonicalDigest(after.typeorm.filter(isNew))!==canonicalDigest(expected)) hold('AFTER_LEDGER_DELTA');
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const env=process.env;
    const reviewed=source(env.TARGET_SHA);
    if(process.argv[2]==='source') console.log(JSON.stringify(reviewed));
    else if(process.argv[2]==='after') verifyAppliedLedger(JSON.parse(env.BEFORE_LEDGER),JSON.parse(env.AFTER_LEDGER));
    else if(process.argv[2]==='inspect'){
      const runtime=captureRuntime();
      if(env.RUNNING_CHECKOUT!==baseline||!['api','web'].every(service=>runtime?.[service]?.revision===baseline
        && /^sha256:[0-9a-f]{64}$/.test(runtime[service].imageId))) hold('RUNNING_BASELINE');
      if(env.PENDING_CLASSES.trim().split(/\s+/).join('\n')!==units.join('\n')) hold('PENDING_SET');
      if(!hash.test(env.LEDGER_SHA256)||!hash.test(env.VET_CI_SHA256)
        ||!/^ghcr\.io\/ivanzhao299\/phoenix-erp-v3\/api@sha256:[0-9a-f]{64}$/.test(env.VET_API_IMAGE)) hold('CANDIDATE_IMAGE');
      const snapshot=productionSnapshot(env.LEDGER_SHA256);
      const audit=JSON.parse(snapshot.originalAudit);
      console.error('AUDIT_CONCLUSION='+audit.conclusion);
      if(audit.retired_duplicate_qty!==0) hold('RETIRED_BATCH_STOCK');
      const facts=reviewConfirmedLegacyFacts(snapshot),catalog=snapshot.catalog;
      const evidence={reviewed,runtime,catalog,apiImage:env.VET_API_IMAGE,ciSha256:env.VET_CI_SHA256,
        ledgerSha256:env.LEDGER_SHA256,originalConclusion:audit.conclusion,scopedConclusion:'GO_EGG_SOURCE_413_415_EXACT',
        stableExactAuditSha256:facts.stableExactAuditSha256,dailyRowsSha256:facts.dailyRowsSha256};
      console.error(JSON.stringify(evidence));
      console.log(canonicalDigest(evidence));
    }else hold('COMMAND');
  }catch(error){
    console.error('EGG_SOURCE_RELEASE=HOLD');
    console.error(error.message.startsWith('EGG_SOURCE_RELEASE_HOLD=')?error.message:
      'EGG_SOURCE_RELEASE_HOLD=SOURCE_OR_AUDIT_EVIDENCE');
    process.exitCode=1;
  }
}
