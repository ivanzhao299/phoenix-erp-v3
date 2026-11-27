import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { auditSql } from './audit-daily-egg-inbound.mjs';
import { LEDGER_SQL } from './chanjet-admission-schema-receipt.mjs';
import { captureRuntime,executionEnv } from './capture-production-runtime.mjs';
import { confirmedDailyRowsSql,reviewConfirmedLegacyFacts,verifyConfirmedModernSchemaSources } from './production-modern-schema-confirmed-scope.mjs';
import { canonicalDigest } from './production-maintenance-receipts.mjs';
import { CONTRACT,MIGRATION_PATHS } from './production-config-guard.mjs';

export const baseline='f7c79160c2e63b33975a2219e71dd7127c0abda4';
export const unit='1795658900000-EggSourceCutoverEvidence';
export const seal='scripts/ops/egg-source-retirement-reviewed-head';
export const migration='apps/api/src/database/migrations/'+unit+'.ts';
const sha=/^[a-f0-9]{40}$/;
const digest=/^[a-f0-9]{64}$/;
const hold=reason=>{throw Error('EGG_SOURCE_RETIREMENT_HOLD='+reason);};
const hash=value=>createHash('sha256').update(value).digest('hex');

export function verifySource(target,git) {
  if (!sha.test(target??'')) hold('TARGET');
  const parents=value=>git('show','-s','--format=%P',value).split(' ');
  const [base,head,...extra]=parents(target);
  if (base!==baseline||!sha.test(head??'')||extra.length) hold('EXACT_MAIN_MERGE');
  const reviewed=git('show',target+':'+seal);
  if (!sha.test(reviewed)||parents(head).join(' ')!==reviewed||
      git('show',reviewed+':'+seal)!=='PENDING'||
      git('diff','--no-renames','--name-status',reviewed,head)!=='M\t'+seal||
      git('rev-parse',head+'^{tree}')!==git('rev-parse',target+'^{tree}')) hold('REVIEWED_TREE');
  git('merge-base','--is-ancestor',baseline,reviewed);
  if (git('diff','--no-renames','--name-status',baseline,target,'--',...MIGRATION_PATHS)!=='A\t'+migration) hold('MIGRATION_SET');
  if (git('diff','--no-renames','--name-only',baseline,target,'--',...CONTRACT.criticalFiles,
    'scripts/ops/audit-daily-egg-inbound.mjs','scripts/ops/production-modern-schema-confirmed-scope.mjs',
    'scripts/ops/production-legacy-egg-audit-evidence.mjs','scripts/ops/production-lossless-json.mjs')) hold('CONFIG_OR_AUDIT_FLOOR');
  const [mode,type,blob]=git('ls-tree',target,'--',migration).split(/[ \t]/);
  if (mode!=='100644'||type!=='blob'||!sha.test(blob)) hold('MIGRATION_BLOB');
  return {target,baseline,reviewed,migrations:[{path:migration,blob}]};
}

const entry={timestamp:1795658900000,name:'EggSourceCutoverEvidence1795658900000'};
const added=row=>String(row.timestamp)===String(entry.timestamp);
export const beforeEvidenceMigration=after=>({...after,typeorm:after.typeorm.filter(row=>!added(row))});
export function verifyAppliedLedger(before,after) {
  if (!Array.isArray(before?.typeorm)||!Array.isArray(after?.typeorm)||before.typeorm.some(added)||
      canonicalDigest(before)!==canonicalDigest(beforeEvidenceMigration(after))||
      canonicalDigest(after.typeorm.filter(added))!==canonicalDigest([entry])) hold('AFTER_LEDGER');
}

export const catalogSql=`
SELECT jsonb_build_object(
  'tables',ARRAY(SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=current_schema() AND c.relkind='r' AND c.relname IN ('md_egg_source_archive_marks','md_egg_source_cutover_records') ORDER BY c.relname),
  'triggers',ARRAY(SELECT c.relname::text||':'||t.tgname::text||':'||t.tgtype::text FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
    JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=current_schema() AND p.pronamespace=n.oid AND p.proname='guard_egg_source_cutover_record'
      AND t.tgenabled='O' AND NOT t.tgisinternal
      AND c.relname IN ('md_egg_source_archive_marks','md_egg_source_cutover_records') ORDER BY 1),
  'function',(SELECT btrim(prosrc) FROM pg_proc WHERE pronamespace=current_schema()::regnamespace
    AND pronargs=0 AND proname='guard_egg_source_cutover_record'),
  'columns',ARRAY(SELECT concat_ws(':',c.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,
      COALESCE(pg_get_expr(d.adbin,d.adrelid),''))
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
    LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    WHERE c.relnamespace=current_schema()::regnamespace AND a.attnum>0 AND NOT a.attisdropped
      AND c.relname IN ('md_egg_source_archive_marks','md_egg_source_cutover_records') ORDER BY c.relname,a.attnum),
  'constraints',ARRAY(SELECT concat_ws(':',c.relname,k.contype,k.convalidated,pg_get_constraintdef(k.oid,false))
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
    WHERE c.relnamespace=current_schema()::regnamespace AND k.contype<>'n'
      AND c.relname IN ('md_egg_source_archive_marks','md_egg_source_cutover_records') ORDER BY 1),
  'indexes',ARRAY(SELECT concat_ws(':',t.relname,c.relname,i.indisunique,pg_get_indexdef(i.indexrelid,1,false),
      CASE WHEN i.indnkeyatts>1 THEN pg_get_indexdef(i.indexrelid,2,false) ELSE '' END,COALESCE(pg_get_expr(i.indpred,i.indrelid),''))
    FROM pg_class c JOIN pg_index i ON i.indexrelid=c.oid JOIN pg_class t ON t.oid=i.indrelid
    WHERE c.relnamespace=current_schema()::regnamespace AND i.indisvalid AND i.indisready
      AND c.relname IN ('ix_egg_source_archive_latest','ix_egg_source_cutover_retire_once','ix_egg_source_cutover_sign_once') ORDER BY 1)
)::text;`;
export const retainedSql=`
SELECT jsonb_build_object(
  'paused',(SELECT writes_enabled=false FROM md_egg_source_write_control WHERE id=1),
  'control',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM md_egg_source_write_control c),
  'standard',(SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM md_egg_source_standard_grants g),
  'scoped',(SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM md_egg_source_organization_grants g),
  'rollouts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY company_code,house_code) FROM md_egg_source_house_rollouts r),
  'legacy',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM md_egg_source_changes c WHERE c.contract_version=1),
  'legacyEvents',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.change_id,e.action_key) FROM md_egg_source_change_events e
    JOIN md_egg_source_changes c ON c.id=e.change_id WHERE c.contract_version=1),
  'roleLegacy',(SELECT jsonb_agg(to_jsonb(g) ORDER BY role_id) FROM sys_role_menu_permission g JOIN sys_menu m USING(menu_id)
    WHERE m.menu_code='MENU_MD_EGG_SOURCE'),
  'setLegacy',(SELECT jsonb_agg(to_jsonb(g) ORDER BY set_id) FROM sys_permission_set_item g JOIN sys_menu m USING(menu_id)
    WHERE m.menu_code='MENU_MD_EGG_SOURCE')
)::text;`;

export function validateCatalog(actual,definition) {
  const normalized={...actual,function:actual.function?.trim()??null};
  if (definition ? normalized.function!==definition||canonicalDigest({...normalized,function:null})!==releasedShape
    : canonicalDigest(normalized)!==canonicalDigest({tables:[],triggers:[],function:null,columns:[],constraints:[],indexes:[]})) hold('CATALOG');
}

const releasedShape='5adadb6546b179b1725269bdcec2543ddb6e1924e573af605e58c4f928ea36f2';

function snapshot(expectedLedger,definition) {
  const parts=auditSql.split('jsonb_agg(to_jsonb(b) ORDER BY b.batch_no)');
  if (parts.length!==2) hold('HISTORICAL_AUDIT_PROJECTION');
  const pinned=parts.join("jsonb_agg(to_jsonb(b) - 'transfer_cost_currency' ORDER BY b.batch_no)");
  const sql=['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;', 'SET LOCAL search_path=public;',
    "SET LOCAL statement_timeout='30s';","SET LOCAL lock_timeout='3s';",'SET LOCAL row_security=off;',
    pinned,confirmedDailyRowsSql+';',LEDGER_SQL,retainedSql,catalogSql,
    ...(definition?["SELECT (NOT EXISTS(SELECT 1 FROM md_egg_source_archive_marks) AND NOT EXISTS(SELECT 1 FROM md_egg_source_cutover_records))::text;"]:[]),
    'ROLLBACK;'].join('\n');
  const rows=execFileSync('docker',['exec','-i','-e','PGOPTIONS=-c default_transaction_read_only=on',
    'phoenix-v3-db','sh','-c','exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
    {input:sql,env:executionEnv(),encoding:'utf8',timeout:75000,maxBuffer:20*1024*1024,stdio:['pipe','pipe','pipe']}).trimEnd().split('\n');
  if (rows.length!==(definition?6:5)) hold('SNAPSHOT');
  const [originalAudit,dailyRowsRaw,ledger,retained,catalog,empty]=rows;
  const parsed=JSON.parse(ledger);
  if (!parsed.typeorm.some(row=>String(row.timestamp)==='1795658800000'&&row.name==='EggSourceStandardGrants1795658800000')||
      hash(JSON.stringify(parsed))!==expectedLedger) hold('LEDGER_MOVED');
  if (JSON.parse(retained).paused!==true) hold('SOURCE_WRITES_MUST_BE_PAUSED');
  if (definition&&empty!=='true') hold('CANDIDATE_TABLES_NOT_EMPTY');
  validateCatalog(JSON.parse(catalog),definition);
  if (JSON.parse(originalAudit).retired_duplicate_qty!==0) hold('RETIRED_BATCH_STOCK');
  const facts=reviewConfirmedLegacyFacts({originalAudit,dailyRowsRaw});
  return {audit:facts.stableExactAuditSha256,daily:facts.dailyRowsSha256,retained:hash(retained)};
}

function evidence(env,reviewed,currentLedger,priorLedger,definition) {
  if (![currentLedger,priorLedger,env.VET_CI_SHA256].every(value=>digest.test(value??''))||
      !/^ghcr\.io\/ivanzhao299\/phoenix-erp-v3\/api@sha256:[a-f0-9]{64}$/.test(env.VET_API_IMAGE??'')) hold('CANDIDATE_IMAGE');
  const runtime=captureRuntime();
  if (env.RUNNING_CHECKOUT!==baseline||!['api','web'].every(service=>runtime[service]?.revision===baseline)) hold('RUNNING_BASELINE');
  return {reviewed,runtime,priorLedger,apiImage:env.VET_API_IMAGE,ci:env.VET_CI_SHA256,
    directive:verifyConfirmedModernSchemaSources(CONTRACT.repository,undefined,reviewed.target),
    ...snapshot(currentLedger,definition)};
}

if (process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const env=process.env;
    const git=(...args)=>execFileSync('git',['--no-replace-objects','-c','safe.directory='+process.cwd(),
      '-c','core.hooksPath=/dev/null',...args],{encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']}).trim();
    const reviewed=verifySource(env.TARGET_SHA,git);
    const action=process.argv[2];
    if (action==='source') console.log(JSON.stringify(reviewed));
    else if (action==='inspect') {
      if (env.PENDING_CLASSES?.trim()!==unit) hold('PENDING_SET');
      console.log(canonicalDigest(evidence(env,reviewed,env.LEDGER_SHA256,env.LEDGER_SHA256)));
    } else if (action==='after'||action==='recover') {
      const after=JSON.parse(env.AFTER_LEDGER);
      const before=action==='after'?JSON.parse(env.BEFORE_LEDGER):beforeEvidenceMigration(after);
      verifyAppliedLedger(before,after);
      const prior=hash(JSON.stringify(before));
      if (prior!==env.EXPECTED_BEFORE_LEDGER_SHA256) hold('BEFORE_LEDGER');
      const definition=git('show',reviewed.target+':'+migration).match(/CREATE FUNCTION guard_egg_source_cutover_record\(\) RETURNS trigger LANGUAGE plpgsql AS \$\$([\s\S]*?)\$\$;/)?.[1]?.trim();
      if (!definition||canonicalDigest(evidence(env,reviewed,hash(JSON.stringify(after)),prior,definition))!==env.EXPECTED_VET_INSPECTION_SHA256) hold('INSPECTION_MOVED');
      console.log('EGG_SOURCE_RETIREMENT_POST_MIGRATION=EXACT_LEDGER_AND_SOURCE_RECORDS_PRESERVED');
    } else hold('COMMAND');
  } catch (error) {
    console.error(/^EGG_SOURCE_RETIREMENT_HOLD=[A-Z0-9_]+$/.test(error.message)?error.message:'EGG_SOURCE_RETIREMENT_HOLD=UNVERIFIED');
    process.exitCode=1;
  }
}
