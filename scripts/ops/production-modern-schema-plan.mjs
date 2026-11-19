/** Complete readonly source/image/ledger planning. No migration, registry
 * writes, authority, baseline insertion, database initialization or replay. */
import path from 'node:path';import {createHash} from 'node:crypto';
import {CONTRACT,secureJson,verifyContext} from './production-config-guard.mjs';
import {evaluateLedger,validateRetiredRegistry} from '../ledger-preflight.mjs';
import {LEDGER_SQL,validateRegistryReceipt,RECEIPT_DIRECTORY} from './chanjet-admission-schema-receipt.mjs';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {bindCompiledSchemaInventory,inspectModernSchemaImage,readCommittedSchemaInventory,
 readModernSchemaSourceGit as git,MODERN_SCHEMA_SOURCE_DIRECTORY as SOURCE} from './production-modern-schema-inventory.mjs';
export {bindCompiledSchemaInventory,collectRetainedModernSchemaInventory,inspectModernSchemaImage,
 MODERN_SCHEMA_IMAGE_INVENTORY_PROGRAM,readCommittedSchemaInventory,RETAINED_INVENTORY_CLASSIFICATION,
 verifyRetainedModernSchemaInventoryPin} from './production-modern-schema-inventory.mjs';
const SHA=/^[a-f0-9]{40}$/;
const hash=value=>createHash('sha256').update(value).digest('hex');
const hold=code=>{throw Error('MODERN_SCHEMA_PLAN_HOLD='+code);};
const match=(re,value)=>typeof value==='string'&&re.test(value);
function completeLedger(ledger,canonicalLegacy,source,retired){
 if(!ledger||!Array.isArray(ledger.legacy)||!Array.isArray(ledger.typeorm)||!Array.isArray(canonicalLegacy)||!canonicalLegacy.length
  ||new Set(ledger.legacy.map(row=>row.filename)).size!==ledger.legacy.length)hold('LEDGER_SHAPE');
 const rows=ledger.legacy.map(row=>{
  if(typeof row.filename!=='string'||typeof row.applied_at!=='number'||!Number.isFinite(row.applied_at)||row.applied_at<0||row.applied_at>Number.MAX_SAFE_INTEGER)hold('LEGACY_LEDGER_IDENTITY');
  // SQL bridge creation casts positive numeric milliseconds to bigint, rounding
  // rather than truncating the submillisecond value. Preserve original bytes.
  return {...row,applied_at:new Date(Math.round(row.applied_at)).toISOString()};
 });
 const result=evaluateLedger({schemaRows:rows,typeormRows:ledger.typeorm,canonicalLegacy,
  canonicalTypeorm:source.map(unit=>({effective_name:unit.effectiveName,timestamp:unit.timestamp})),retiredTypeorm:validateRetiredRegistry(retired),mode:'pre-migration'});
 if(!result.pass||result.diagnostics.bridge_timestamp_mismatch.length||result.diagnostics.bridge_state==='PARTIAL')hold('STRUCTURAL_LEDGER_DRIFT');
 for(const row of ledger.typeorm){
  if(typeof row.name!=='string'||!/^\d{13}$/.test(String(row.timestamp))||!Number.isSafeInteger(Number(row.timestamp)))hold('EXACT_LEDGER_TUPLE_REQUIRED');
 }
 return result;
}
/** The caller is the fixed collector below. Prior provenance is re-read from
 * the protected registry, never accepted as a boolean in release JSON. */
export function deriveModernSchemaPlan({targetSha,runtimeSha,candidateImageId,source,runtimeSource,compiled,ledger,canonicalLegacy,retired,changedMigrationPaths},dependencies={}){
 if(!match(SHA,targetSha)||!match(SHA,runtimeSha)||targetSha===runtimeSha||!match(/^sha256:[a-f0-9]{64}$/,candidateImageId))hold('EXACT_PLAN_BINDING');
 const bound=bindCompiledSchemaInventory(source,compiled),runtimeByPath=new Map(runtimeSource.map(unit=>[unit.path,unit]));
 for(const prior of runtimeSource){const next=source.find(unit=>unit.path===prior.path);if(!next||!same(prior,next))hold('RUNTIME_SOURCE_CHANGED_OR_REMOVED');}
 const validation=completeLedger(ledger,canonicalLegacy,source,retired),byName=new Map(ledger.typeorm.map(row=>[row.name,row]));
 const pendingMigrations=[];
 for(const unit of bound){
  const applied=byName.get(unit.effectiveName);
  if(!applied){pendingMigrations.push({path:unit.path,sourceBlob:unit.sourceBlob,timestamp:unit.timestamp,effectiveName:unit.effectiveName,compiledSha256:unit.compiledSha256});continue;}
  if(String(applied.timestamp)!==String(unit.timestamp))hold('APPLIED_TIMESTAMP_MISMATCH');
  if(!runtimeByPath.has(unit.path)&&(dependencies.verifyPriorProvenance??(()=>false))(unit)!==true)hold('PRIOR_APPLY_PROVENANCE_REQUIRED');
 }
 const expectedChanged=source.filter(unit=>!runtimeByPath.has(unit.path)).map(unit=>unit.path).sort();
 const changed=[...changedMigrationPaths].sort();
 if(new Set(changed).size!==changed.length||!same(changed,expectedChanged))hold('EXACT_ADDITIVE_MIGRATION_SCOPE_REQUIRED');
 return {schema:'phoenix.modern-schema-migration-plan/v1',targetSha,runtimeSha,candidateImageId,sourceInventorySha256:canonicalDigest(source),runtimeInventorySha256:canonicalDigest(runtimeSource),
  candidateInventorySha256:canonicalDigest(compiled),beforeLedgerSha256:hash(JSON.stringify(ledger)),pendingMigrations,changedMigrationPaths:changed,
  sourceUnits:source.length,runtimeUnits:runtimeSource.length,pendingCount:pendingMigrations.length,ledgerValidation:validation,readOnly:true,releaseAuthorized:false};
}
export async function collectModernSchemaPlan(client,{targetSha,runtimeSha,candidateImageId,owner},dependencies={}){
 const root=dependencies.root??CONTRACT.repository,guard=dependencies.guard??(()=>verifyContext(root,CONTRACT.stateDirectory));
 if(!match(SHA,targetSha)||!match(SHA,runtimeSha)||targetSha===runtimeSha||!match(/^sha256:[a-f0-9]{64}$/,candidateImageId)||!match(/^[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$/,owner))hold('EXACT_PLAN_BINDING');
 guard();git(root,['merge-base','--is-ancestor',runtimeSha,targetSha]);
 const source=readCommittedSchemaInventory(root,targetSha),runtimeSource=readCommittedSchemaInventory(root,runtimeSha);
 const canonicalLegacy=git(root,['ls-tree','-r','--name-only',targetSha,'--','apps/api/migrations']).split('\n')
  .filter(file=>/^apps\/api\/migrations\/2026[A-Za-z0-9_.-]+\.sql$/.test(file)).map(file=>path.posix.basename(file)).sort();
 const retired=JSON.parse(git(root,['show',`${targetSha}:scripts/ci/retired-typeorm-migrations.json`]));
 const changedMigrationPaths=git(root,['diff','--name-only','--no-renames',runtimeSha,targetSha,'--','migrations','apps/api/ddl','apps/api/migrations',SOURCE,'scripts/db-migrate.sh','scripts/deploy-schema-first.sh']).trim().split('\n').filter(Boolean).sort();
 const probe=(dependencies.inspectImage??inspectModernSchemaImage)(candidateImageId,owner);if(probe.proof.revision!==targetSha)hold('CANDIDATE_REVISION_MISMATCH');
 guard();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try{
  await client.query("SET LOCAL search_path=public; SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='1s'; SET LOCAL row_security=off");
  const {rows:[database]}=await client.query(`SELECT pg_catalog.current_database() AS name,'public'::text AS schema,
    (SELECT oid::bigint FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database()) AS "databaseOid",
    (SELECT oid::bigint FROM pg_catalog.pg_namespace WHERE nspname='public') AS "schemaOid",
    (SELECT system_identifier::text FROM pg_catalog.pg_control_system()) AS "systemIdentifier",
    trunc(extract(epoch FROM pg_catalog.pg_postmaster_start_time())*1000000)::text AS "postmasterStartMicros",
    current_setting('server_version_num')::integer AS "serverVersionNum",NOT pg_catalog.pg_is_in_recovery() AS primary,
    current_setting('transaction_read_only')='on' AS "readOnly",current_setting('transaction_isolation') AS isolation`);
  if(!database?.primary||database.readOnly!==true||database.isolation!=='repeatable read')hold('PRIMARY_READ_ONLY_SNAPSHOT_REQUIRED');
  const {rows:[row]}=await client.query(LEDGER_SQL),ledger=JSON.parse(row.jsonb_build_object);
  const verifyPriorProvenance=unit=>{
   try{
    const receipt=(dependencies.readRegistry??secureJson)(path.join(dependencies.directory??CONTRACT.stateDirectory,RECEIPT_DIRECTORY,path.posix.basename(unit.path,'.ts')+'.json'));
    validateRegistryReceipt(receipt,{migrationPath:unit.path,sourceBlob:unit.sourceBlob});
    git(root,['merge-base','--is-ancestor',receipt.sourceSha,targetSha]);
    return git(root,['rev-parse',`${receipt.sourceSha}:${unit.path}`]).trim()===unit.sourceBlob;
   }catch{return false;}
  };
  const plan=deriveModernSchemaPlan({targetSha,runtimeSha,candidateImageId,source,runtimeSource,compiled:probe.records,ledger,canonicalLegacy,retired,changedMigrationPaths},{verifyPriorProvenance});
  guard();return {plan,database,imageProof:probe.proof,sourceInventory:source,runtimeSourceInventory:runtimeSource,compiledInventory:probe.records,ledger};
 }finally{await client.query('ROLLBACK');}
}
