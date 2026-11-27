import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { auditSql } from './audit-daily-egg-inbound.mjs';
import { LEDGER_SQL } from './chanjet-admission-schema-receipt.mjs';
import { confirmedDailyRowsSql, reviewConfirmedLegacyFacts, verifyConfirmedModernSchemaSources } from './production-modern-schema-confirmed-scope.mjs';
import { canonicalDigest } from './production-maintenance-receipts.mjs';
import { captureRuntime, executionEnv } from './capture-production-runtime.mjs';
import { CONTRACT, MIGRATION_PATHS } from './production-config-guard.mjs';

export const baseline='fa9467c05dc1773f98ba2ada46bf72c6b5d5fdb8';
export const unit='1795658800000-EggSourceStandardGrants';
export const seal='scripts/ops/egg-source-standard-reviewed-head';
const migration='apps/api/src/database/migrations/'+unit+'.ts';
const addedEntry={timestamp:1795658800000,name:'EggSourceStandardGrants1795658800000'};
const sha=/^[a-f0-9]{40}$/;
const digest=/^[a-f0-9]{64}$/;
const hold=reason=>{throw Error('EGG_SOURCE_STANDARD_HOLD='+reason);};
const hash=value=>createHash('sha256').update(value).digest('hex');

export function verifySource(target,git) {
  if (!sha.test(target??'')) hold('TARGET');
  const parents=value=>git('show','-s','--format=%P',value).split(' ');
  const [base,head,...extra]=parents(target);
  if (base!==baseline || !sha.test(head??'') || extra.length) hold('EXACT_MAIN_MERGE');
  const reviewed=git('show',target+':'+seal);
  if (!sha.test(reviewed) || parents(head).join(' ')!==reviewed ||
    git('show',reviewed+':'+seal)!=='PENDING' ||
    git('diff','--no-renames','--name-status',reviewed,head)!=='M\t'+seal ||
    git('rev-parse',head+'^{tree}')!==git('rev-parse',target+'^{tree}')) hold('REVIEWED_TREE');
  git('merge-base','--is-ancestor',baseline,reviewed);
  if (git('diff','--no-renames','--name-status',baseline,target,'--',...MIGRATION_PATHS)!=='A\t'+migration) hold('MIGRATION_SET');
  if (git('diff','--no-renames','--name-only',baseline,target,'--',...CONTRACT.criticalFiles,
    'scripts/ops/audit-daily-egg-inbound.mjs','scripts/ops/production-modern-schema-confirmed-scope.mjs',
    'scripts/ops/production-legacy-egg-audit-evidence.mjs','scripts/ops/production-lossless-json.mjs')) hold('CONFIG_OR_AUDIT_FLOOR');
  const [mode,type,blob]=git('ls-tree',target,'--',migration).split(/[ \t]/);
  if(mode!=='100644'||type!=='blob'||!sha.test(blob)) hold('MIGRATION_BLOB');
  return {target,baseline,reviewed,migrations:[{path:migration,blob}]};
}

const isAdded=row=>String(row.timestamp)===String(addedEntry.timestamp);
export function beforeStandardMigration(after) {
  return {...after,typeorm:after.typeorm.filter(row=>!isAdded(row))};
}
export function verifyAppliedLedger(before,after) {
  if (!Array.isArray(before?.typeorm) || !Array.isArray(after?.typeorm) || before.typeorm.some(isAdded)
    || canonicalDigest(before)!==canonicalDigest(beforeStandardMigration(after))
    || canonicalDigest(after.typeorm.filter(isAdded))!==canonicalDigest([addedEntry])) hold('AFTER_LEDGER');
}
const triggers=[
  ['md_egg_source_changes','egg_source_change_standard_protocol','require_egg_source_standard_protocol','O',23],
  ['md_egg_source_organization_grants','egg_source_converted_scope_immutable','protect_converted_egg_source_scope','O',31],
  ['md_egg_source_change_events','egg_source_event_standard_protocol','require_egg_source_standard_protocol','O',7],
  ['md_egg_source_standard_grants','egg_source_standard_grants_managed','guard_egg_source_standard_grants','O',31],
];
const functions=[...new Set(triggers.map(row=>row[2]))].sort();
const sqlList=values=>values.map(value=>"'"+value+"'").join(',');
export function extractFunctions(source) {
  const definitions=Object.fromEntries([...source.matchAll(/CREATE FUNCTION ([a-z_]+)\(\) RETURNS trigger LANGUAGE plpgsql AS \$\$([\s\S]*?)\$\$;/g)]
    .map(row=>[row[1],row[2].trim()]));
  if (canonicalDigest(Object.keys(definitions).sort())!==canonicalDigest(functions)) hold('DECLARED_FUNCTIONS');
  return definitions;
}
const catalogSql=`
SELECT jsonb_build_object(
  'tableKind',(SELECT relkind FROM pg_class WHERE oid=to_regclass('public.md_egg_source_standard_grants')),
  'viewKind',(SELECT relkind FROM pg_class WHERE oid=to_regclass('public.md_egg_source_effective_grants')),
  'viewHash',encode(sha256(convert_to(regexp_replace(pg_get_viewdef(to_regclass('public.md_egg_source_effective_grants'),false),
    '[[:space:]]+',' ','g'),'UTF8')),'hex'),
  'columns',(SELECT jsonb_agg(jsonb_build_array(attname,format_type(atttypid,atttypmod),attnotnull,attidentity) ORDER BY attnum)
    FROM pg_attribute WHERE attrelid=to_regclass('public.md_egg_source_standard_grants') AND attnum>0 AND NOT attisdropped),
  'constraints',(SELECT jsonb_agg(jsonb_build_array(contype,pg_get_constraintdef(oid),convalidated) ORDER BY conname)
    FROM pg_constraint WHERE conrelid=to_regclass('public.md_egg_source_standard_grants') AND contype<>'n'),
  'functions',COALESCE((SELECT jsonb_object_agg(p.proname,btrim(p.prosrc)) FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace AND p.pronargs=0 AND p.proname IN (${sqlList(functions)})),'{}'::jsonb),
  'triggers',COALESCE((SELECT jsonb_agg(jsonb_build_array(c.relname,t.tgname,p.proname,t.tgenabled,t.tgtype::int) ORDER BY t.tgname)
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
    WHERE c.relnamespace='public'::regnamespace AND p.pronamespace='public'::regnamespace AND NOT t.tgisinternal
      AND t.tgattr::text='' AND t.tgname IN (${sqlList(triggers.map(row=>row[1]))})),'[]'::jsonb)
)::text;`;
const retainedSql=`
SELECT jsonb_build_object(
  'control',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM md_egg_source_write_control c),
  'grants',(SELECT COALESCE(jsonb_agg(to_jsonb(g) ORDER BY id),'[]') FROM md_egg_source_organization_grants g),
  'rollouts',(SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY company_code,house_code),'[]') FROM md_egg_source_house_rollouts r),
  'roleLegacy',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.role_id,p.menu_id) FROM sys_role_menu_permission p
    JOIN sys_menu m USING(menu_id) WHERE m.menu_code='MENU_MD_EGG_SOURCE'),
  'setLegacy',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.set_id,p.menu_id) FROM sys_permission_set_item p
    JOIN sys_menu m USING(menu_id) WHERE m.menu_code='MENU_MD_EGG_SOURCE'),
  'menuDataScope',(SELECT jsonb_agg(to_jsonb(scope) ORDER BY scope.id) FROM sys_data_scopes scope
    WHERE scope.module_code='MENU_MD_EGG_SOURCE'),
  'protocol',(SELECT jsonb_agg(jsonb_build_array(c.relname,t.tgname,t.tgenabled,t.tgtype::int,p.prosrc,t.tgattr::text) ORDER BY t.tgname)
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
    WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal AND c.relname IN (
      'md_egg_source_write_control','md_egg_source_changes','md_egg_source_change_events',
      'md_egg_source_organization_grants','md_egg_source_house_rollouts') AND t.tgname NOT IN (${sqlList(triggers.map(row=>row[1]))}))
)::text;`;
const retainedViewSql=`
SELECT (NOT EXISTS(SELECT 1 FROM md_egg_source_standard_grants) AND NOT EXISTS(
 (SELECT role_id,set_id,scope_type,scope_code,company_code,actions FROM md_egg_source_organization_grants
  EXCEPT ALL SELECT * FROM md_egg_source_effective_grants)
 UNION ALL
 (SELECT * FROM md_egg_source_effective_grants
  EXCEPT ALL SELECT role_id,set_id,scope_type,scope_code,company_code,actions FROM md_egg_source_organization_grants)
 ))::text;`;

export function validateCatalog(catalog,definitions) {
  const expected=definitions ? {
    tableKind:'r',viewKind:'v',functions:definitions,triggers,
    viewHash:'d7a9fdb22e5a6eb49f3c29f0509b774872fa38811917713710a16b54172f4aa6',
    columns:[['id','bigint',true,'a'],['role_id','bigint',false,''],['set_id','bigint',false,''],
      ['actions','text[]',true,''],['revision','bigint',true,'']],
    constraints:[
      ['c',"CHECK (((actions <@ ARRAY['V'::text, 'C'::text, 'E'::text, 'A'::text]) AND (array_position(actions, NULL::text) IS NULL)))",true],
      ['c','CHECK (((role_id IS NOT NULL) <> (set_id IS NOT NULL)))',true],
      ['p','PRIMARY KEY (id)',true],
      ['c','CHECK ((revision > 0))',true],
      ['f','FOREIGN KEY (role_id) REFERENCES sys_role(role_id) ON DELETE CASCADE',true],
      ['u','UNIQUE (role_id)',true],
      ['f','FOREIGN KEY (set_id) REFERENCES sys_permission_set(set_id) ON DELETE CASCADE',true],
      ['u','UNIQUE (set_id)',true],
    ],
  } : {tableKind:null,viewKind:null,viewHash:null,columns:null,constraints:null,functions:{},triggers:[]};
  const normalized={...catalog,functions:Object.fromEntries(Object.entries(catalog?.functions??{}).map(([key,value])=>[key,value.trim()]))};
  if (canonicalDigest(normalized)!==canonicalDigest(expected)) hold('SCHEMA_SHAPE');
}

function snapshot(expectedLedger,definitions) {
  // The production inventory baseline includes this column. The confirmed historical audit
  // projects the old batch shape; the ordinary workflow still reports its own HOLD.
  const parts=auditSql.split('jsonb_agg(to_jsonb(b) ORDER BY b.batch_no)');
  if (parts.length!==2) hold('HISTORICAL_AUDIT_PROJECTION');
  const pinnedAudit=parts.join("jsonb_agg(to_jsonb(b) - 'transfer_cost_currency' ORDER BY b.batch_no)");
  const sql=['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;', 'SET LOCAL search_path=public;',
    "SET LOCAL statement_timeout='30s';", "SET LOCAL lock_timeout='3s';", 'SET LOCAL row_security=off;',
    pinnedAudit,confirmedDailyRowsSql+';',LEDGER_SQL,retainedSql,catalogSql,...(definitions?[retainedViewSql]:[]),'ROLLBACK;'].join('\n');
  const rows=execFileSync('docker',['exec','-i','-e','PGOPTIONS=-c default_transaction_read_only=on',
    'phoenix-v3-db','sh','-c','exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
    {input:sql,env:executionEnv(),encoding:'utf8',timeout:75000,maxBuffer:20*1024*1024,stdio:['pipe','pipe','pipe']}).trimEnd().split('\n');
  if (rows.length!==(definitions ? 6 : 5)) hold('SNAPSHOT');
  const [originalAudit,dailyRowsRaw,ledger,retained,catalog,viewUnchanged]=rows;
  const ledgerState=JSON.parse(ledger);
  if (hash(JSON.stringify(ledgerState))!==expectedLedger) hold('LEDGER_MOVED');
  if (!ledgerState.typeorm.some(row=>String(row.timestamp)==='1795658700000'&&row.name==='TransferCostEvidence1795658700000')) hold('BASELINE_LEDGER');
  if (definitions&&viewUnchanged!=='true') hold('PERMISSIONS_MOVED');
  validateCatalog(JSON.parse(catalog),definitions);
  const retainedState=JSON.parse(retained);
  if (retainedState.control?.length!==1 || retainedState.control[0]?.id!==1 ||
      retainedState.control[0]?.writes_enabled!==false) hold('SOURCE_WRITES_MUST_BE_PAUSED');
  if (JSON.parse(originalAudit).retired_duplicate_qty!==0) hold('RETIRED_BATCH_STOCK');
  const facts=reviewConfirmedLegacyFacts({originalAudit,dailyRowsRaw});
  return {audit:facts.stableExactAuditSha256,daily:facts.dailyRowsSha256,retained:canonicalDigest(retainedState)};
}

function evidence(env,reviewed,currentLedger,priorLedger,definitions) {
  if (![currentLedger,priorLedger,env.VET_CI_SHA256].every(value=>digest.test(value??''))
    || !/^ghcr\.io\/ivanzhao299\/phoenix-erp-v3\/api@sha256:[a-f0-9]{64}$/.test(env.VET_API_IMAGE??'')) hold('CANDIDATE_IMAGE');
  const runtime=captureRuntime();
  if (env.RUNNING_CHECKOUT!==baseline || !['api','web'].every(service=>runtime[service]?.revision===baseline)) hold('RUNNING_BASELINE');
  return {reviewed,runtime,priorLedger,apiImage:env.VET_API_IMAGE,ci:env.VET_CI_SHA256,
    directive:verifyConfirmedModernSchemaSources(CONTRACT.repository,undefined,reviewed.target),
    ...snapshot(currentLedger,definitions)};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try {
    const env=process.env;
    const git=(...args)=>execFileSync('git',['--no-replace-objects','-c','safe.directory='+process.cwd(),
      '-c','core.hooksPath=/dev/null',...args],{encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']}).trim();
    const reviewed=verifySource(env.TARGET_SHA,git);
    const action=process.argv[2];
    if(action==='source') console.log(JSON.stringify(reviewed));
    else if(action==='inspect'){
      if(env.PENDING_CLASSES?.trim()!==unit)hold('PENDING_SET');
      const proof=evidence(env,reviewed,env.LEDGER_SHA256,env.LEDGER_SHA256);
      console.error('AUDIT_CONCLUSION=HOLD');
      console.error('EGG_SOURCE_STANDARD_SCOPED_CONCLUSION=GO_EGG_SOURCE_STANDARD_SCHEMA_ONLY');
      console.log(canonicalDigest(proof));
    }else if(action==='after'||action==='recover'){
      const after=JSON.parse(env.AFTER_LEDGER);
      const before=action==='after'?JSON.parse(env.BEFORE_LEDGER):beforeStandardMigration(after);
      verifyAppliedLedger(before,after);
      const prior=hash(JSON.stringify(before));
      if(prior!==env.EXPECTED_BEFORE_LEDGER_SHA256)hold('BEFORE_LEDGER');
      const definitions=extractFunctions(git('show',reviewed.target+':'+migration));
      const proof=evidence(env,reviewed,hash(JSON.stringify(after)),prior,definitions);
      if(canonicalDigest(proof)!==env.EXPECTED_VET_INSPECTION_SHA256)hold('INSPECTION_MOVED');
      console.log('EGG_SOURCE_STANDARD_POST_MIGRATION=EXACT_LEDGER_AND_PERMISSIONS_PRESERVED');
    }else hold('COMMAND');
  }catch(error){
    console.error(/^EGG_SOURCE_STANDARD_HOLD=[A-Z0-9_]+$/.test(error.message)?error.message:'EGG_SOURCE_STANDARD_HOLD=UNVERIFIED');
    process.exitCode=1;
  }
}
