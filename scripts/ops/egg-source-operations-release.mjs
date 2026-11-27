import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { auditSql } from './audit-daily-egg-inbound.mjs';
import { LEDGER_SQL } from './chanjet-admission-schema-receipt.mjs';
import { captureRuntime,executionEnv } from './capture-production-runtime.mjs';
import { confirmedDailyRowsSql,reviewConfirmedLegacyFacts,verifyConfirmedModernSchemaSources } from './production-modern-schema-confirmed-scope.mjs';
import { canonicalDigest } from './production-maintenance-receipts.mjs';
import { CONTRACT,MIGRATION_PATHS } from './production-config-guard.mjs';
import { catalogSql,retainedSql,validateCatalog,migration as priorMigration } from './egg-source-retirement-release.mjs';

export const baseline='560ab68bf173b4153d832e6795b33ae08c4473ad';
export const unit='1795659000000-EggSourceOperationReceipts';
export const seal='scripts/ops/egg-source-operations-reviewed-head';
export const migration='apps/api/src/database/migrations/'+unit+'.ts';
const sha=/^[a-f0-9]{40}$/;
const digest=/^[a-f0-9]{64}$/;
const hold=reason=>{throw Error('EGG_SOURCE_OPERATIONS_HOLD='+reason);};
const hash=value=>createHash('sha256').update(value).digest('hex');

export function verifySource(target,git) {
  if (!sha.test(target??'')) hold('TARGET');
  const parents=value=>git('show','-s','--format=%P',value).split(' ');
  const [base,head,...extra]=parents(target);
  if (base!==baseline||!sha.test(head??'')||extra.length) hold('EXACT_MAIN_MERGE');
  const reviewed=git('show',target+':'+seal);
  if (!sha.test(reviewed)||parents(head).join(' ')!==reviewed||git('show',reviewed+':'+seal)!=='PENDING'||
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

const entry={timestamp:1795659000000,name:'EggSourceOperationReceipts1795659000000'};
const added=row=>String(row.timestamp)===String(entry.timestamp);
export const beforeOperationsMigration=after=>({...after,typeorm:after.typeorm.filter(row=>!added(row))});
export function verifyAppliedLedger(before,after) {
  if (!Array.isArray(before?.typeorm)||!Array.isArray(after?.typeorm)||before.typeorm.some(added)||
      canonicalDigest(before)!==canonicalDigest(beforeOperationsMigration(after))||
      canonicalDigest(after.typeorm.filter(added))!==canonicalDigest([entry])) hold('AFTER_LEDGER');
}

const legacyKinds=['ARCHIVE','UNARCHIVE','LEGACY_GRANT','VERIFY','SIGN','RETIRE'];
const kindCheck=kinds=>`CHECK ((kind = ANY (ARRAY[${kinds.map(kind=>`'${kind}'::text`).join(', ')}])))`;
const oldCheck=kindCheck(legacyKinds);
const newCheck=kindCheck([...legacyKinds,'HOUSE_ROLLOUT','RETIRE_PILOT','OPERATION_CANCELLED']);
export function validateOperationsCatalog(actual,definition,kindDefinition,applied) {
  const expected=applied?newCheck:oldCheck;
  if (kindDefinition!==expected||!Array.isArray(actual?.constraints)) hold('KIND_CHECK');
  const matching=actual.constraints.filter(value=>value.startsWith('md_egg_source_cutover_records:c:')&&value.endsWith(':'+expected));
  if (matching.length!==1) hold('KIND_CHECK_MISSING');
  const unchanged=actual.constraints.map(value=>value===matching[0]?value.slice(0,-expected.length)+oldCheck:value);
  validateCatalog({...actual,constraints:unchanged},definition);
}

const kindSql=`SELECT pg_get_constraintdef(k.oid,false) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
  WHERE c.relnamespace=current_schema()::regnamespace AND c.relname='md_egg_source_cutover_records'
    AND k.contype='c' AND k.convalidated AND k.conname='md_egg_source_cutover_records_kind_check';`;
const receiptsSql=`SELECT jsonb_build_array(
  (SELECT jsonb_agg(to_jsonb(e) ORDER BY request_id) FROM md_egg_source_cutover_records e),
  (SELECT jsonb_agg(to_jsonb(a) ORDER BY seq) FROM md_egg_source_archive_marks a)
)::text;`;

function snapshot(expectedLedger,definition,applied) {
  const parts=auditSql.split('jsonb_agg(to_jsonb(b) ORDER BY b.batch_no)');
  if (parts.length!==2) hold('HISTORICAL_AUDIT_PROJECTION');
  const pinned=parts.join("jsonb_agg(to_jsonb(b) - 'transfer_cost_currency' ORDER BY b.batch_no)");
  const sql=['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;','SET LOCAL search_path=public;',
    "SET LOCAL statement_timeout='30s';","SET LOCAL lock_timeout='3s';",'SET LOCAL row_security=off;',
    pinned,confirmedDailyRowsSql+';',LEDGER_SQL,retainedSql,catalogSql,kindSql,receiptsSql,'ROLLBACK;'].join('\n');
  const rows=execFileSync('docker',['exec','-i','-e','PGOPTIONS=-c default_transaction_read_only=on',
    'phoenix-v3-db','sh','-c','exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
    {input:sql,env:executionEnv(),encoding:'utf8',timeout:75000,maxBuffer:20*1024*1024,stdio:['pipe','pipe','pipe']}).trimEnd().split('\n');
  if (rows.length!==7) hold('SNAPSHOT');
  const [originalAudit,dailyRowsRaw,ledger,retained,catalog,kindDefinition,receipts]=rows;
  const parsed=JSON.parse(ledger);
  if (!parsed.typeorm.some(row=>String(row.timestamp)==='1795658900000'&&row.name==='EggSourceCutoverEvidence1795658900000')||
      hash(JSON.stringify(parsed))!==expectedLedger) hold('LEDGER_MOVED');
  if (JSON.parse(retained).paused!==true) hold('SOURCE_WRITES_MUST_BE_PAUSED');
  if (!definition) hold('BASELINE_TRIGGER');
  validateOperationsCatalog(JSON.parse(catalog),definition,kindDefinition,applied);
  if (JSON.parse(originalAudit).retired_duplicate_qty!==0) hold('RETIRED_BATCH_STOCK');
  const facts=reviewConfirmedLegacyFacts({originalAudit,dailyRowsRaw});
  return {audit:facts.stableExactAuditSha256,daily:facts.dailyRowsSha256,retained:hash(retained),receipts:hash(receipts)};
}

function evidence(env,reviewed,currentLedger,priorLedger,definition,applied) {
  if (![currentLedger,priorLedger,env.VET_CI_SHA256].every(value=>digest.test(value??''))||
      !/^ghcr\.io\/ivanzhao299\/phoenix-erp-v3\/api@sha256:[a-f0-9]{64}$/.test(env.VET_API_IMAGE??'')) hold('CANDIDATE_IMAGE');
  const runtime=captureRuntime();
  if (env.RUNNING_CHECKOUT!==baseline||!['api','web'].every(service=>runtime[service]?.revision===baseline)) hold('RUNNING_BASELINE');
  return {reviewed,runtime,priorLedger,apiImage:env.VET_API_IMAGE,ci:env.VET_CI_SHA256,
    directive:verifyConfirmedModernSchemaSources(CONTRACT.repository,undefined,reviewed.target),
    ...snapshot(currentLedger,definition,applied)};
}

if (process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const env=process.env;
    const git=(...args)=>execFileSync('git',['--no-replace-objects','-c','safe.directory='+process.cwd(),
      '-c','core.hooksPath=/dev/null',...args],{encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']}).trim();
    const reviewed=verifySource(env.TARGET_SHA,git);
    const action=process.argv[2];
    const definition=git('show',baseline+':'+priorMigration).match(/CREATE FUNCTION guard_egg_source_cutover_record\(\) RETURNS trigger LANGUAGE plpgsql AS \$\$([\s\S]*?)\$\$;/)?.[1]?.trim();
    if (action==='source') console.log(JSON.stringify(reviewed));
    else if (action==='inspect') {
      if (env.PENDING_CLASSES?.trim()!==unit) hold('PENDING_SET');
      console.log(canonicalDigest(evidence(env,reviewed,env.LEDGER_SHA256,env.LEDGER_SHA256,definition,false)));
    } else if (action==='after'||action==='recover') {
      const after=JSON.parse(env.AFTER_LEDGER);
      const before=action==='after'?JSON.parse(env.BEFORE_LEDGER):beforeOperationsMigration(after);
      verifyAppliedLedger(before,after);
      const prior=hash(JSON.stringify(before));
      if (prior!==env.EXPECTED_BEFORE_LEDGER_SHA256) hold('BEFORE_LEDGER');
      if (canonicalDigest(evidence(env,reviewed,hash(JSON.stringify(after)),prior,definition,true))!==env.EXPECTED_VET_INSPECTION_SHA256) hold('INSPECTION_MOVED');
      console.log('EGG_SOURCE_OPERATIONS_POST_MIGRATION=EXACT_LEDGER_AND_SOURCE_RECORDS_PRESERVED');
    } else hold('COMMAND');
  } catch (error) {
    console.error(/^EGG_SOURCE_OPERATIONS_HOLD=[A-Z0-9_]+$/.test(error.message)?error.message:'EGG_SOURCE_OPERATIONS_HOLD=UNVERIFIED');
    process.exitCode=1;
  }
}
