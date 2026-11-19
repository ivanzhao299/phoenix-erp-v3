/** Native server hashes preserve all original column values and sequences.
 * No row data, password hashes or numeric JSON values leave PostgreSQL. */
import {CONTRACT,secureJson} from './production-config-guard.mjs';import path from 'node:path';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
const fail=code=>{throw Error('MODERN_SCHEMA_FACTS_HOLD='+code);};
const quote=value=>'"'+value.replaceAll('"','""')+'"';
const tools=new Set(['migrations','schema_migrations','typeorm_metadata','sys_dict']);
const defaults=['production_cutover_scopes','production_batch_qualifications','production_cutover_apply_admissions','production_cutover_apply_results'];
export const INITIAL_MODERN_SCHEMA_PROFILE=Object.freeze({floorSha:'101916efbcd60956c9f8321d4859931049f966c3',runtimeSha:'cb42966edfa717b0984936951143d84973c1a263',
 sourceUnits:125,runtimeUnits:105,pendingCount:20,sourceInventorySha256:'c061666c12adc75ae20fbc68d76af9c69be81ce107fa9c728b7acf0e0824ce91',runtimeInventorySha256:'131d1302535ab3493b060b5c52d05e9ed70606c290c43f1d9301e8ff44a7787c'});
/** This first release does not broaden the default receipt trust boundary. A
 * complete diagnostic may find other pending/prior-applied arrangements; those
 * remain HOLD here rather than replaying or relabelling an old application. */
export function assertInitialModernSchemaProfile(floorSha,plan){
 const profile=INITIAL_MODERN_SCHEMA_PROFILE;
 if(floorSha!==profile.floorSha||Object.entries(profile).filter(([key])=>key!=='floorSha').some(([key,value])=>plan?.[key]!==value)
  ||!Array.isArray(plan.pendingMigrations)||plan.pendingMigrations.length!==profile.pendingCount||!same(plan.pendingMigrations.map(unit=>unit.path).sort(),plan.changedMigrationPaths))fail('OUTSIDE_REVIEWED_FIRST_RELEASE');return true;
}
const catalogSql=`SELECT n.nspname AS schema,c.relname AS table,c.relkind AS kind,
 array_agg(a.attname::text ORDER BY a.attnum) AS columns
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
 WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND c.relkind IN('r','p','m','f')
 GROUP BY n.nspname,c.relname,c.relkind ORDER BY n.nspname,c.relname`;
const sequencesSql=`SELECT n.nspname AS schema,c.relname AS name,onsp.nspname AS "ownerSchema",owner.relname AS "ownerTable"
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_depend d ON d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype IN('a','i')
 LEFT JOIN pg_class owner ON owner.oid=d.refobjid LEFT JOIN pg_namespace onsp ON onsp.oid=owner.relnamespace
 WHERE c.relkind='S' AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema' ORDER BY n.nspname,c.relname`;
export async function captureModernSchemaFacts(client,{projection=null,withinSnapshot=false}={}){
 if(!withinSnapshot)await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try{
  await client.query("SET LOCAL search_path=pg_catalog; SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='3s'; SET LOCAL row_security=off; SET LOCAL max_parallel_workers_per_gather=0; SET LOCAL TimeZone='UTC'; SET LOCAL DateStyle='ISO,YMD'; SET LOCAL IntervalStyle='iso_8601'; SET LOCAL bytea_output='hex'; SET LOCAL extra_float_digits=3");
  const {rows:[identity]}=await client.query(`SELECT current_database() AS name,(SELECT system_identifier::text FROM pg_control_system()) AS "systemIdentifier",NOT pg_is_in_recovery() AS primary,current_setting('transaction_read_only') AS readonly,current_setting('transaction_isolation') AS isolation`);
  if(identity.primary!==true||identity.readonly!=='on'||identity.isolation!=='repeatable read')fail('PRIMARY_READONLY_REQUIRED');
  const {rows:actual}=await client.query(catalogSql);if(actual.some(table=>table.kind==='f'))fail('FOREIGN_TABLE_OUTSIDE_SUPPORTED_SCOPE');
  const before=projection?.tables??actual,tables=[];
  if(!Array.isArray(before)||before.length>2048)fail('BOUNDED_TABLE_PROJECTION_REQUIRED');
  for(const table of before){
   const current=actual.find(row=>row.schema===table.schema&&row.table===table.table);
   if(!current||!Array.isArray(table.columns)||!table.columns.length||table.columns.some(column=>!current.columns.includes(column)))fail('ORIGINAL_BUSINESS_COLUMNS_REMOVED');
   const sql=`SELECT count(*)::integer AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(phoenix_original_row) ORDER BY (to_jsonb(phoenix_original_row)::text) COLLATE "C")::text,'[]'),'UTF8')),'hex') AS sha256
    FROM (SELECT ${table.columns.map(quote).join(',')} FROM ${quote(table.schema)}.${quote(table.table)}) AS phoenix_original_row`;
   const {rows:[hash]}=await client.query(sql);
   if(!Number.isSafeInteger(hash.rows)||hash.rows<0||!/^[a-f0-9]{64}$/.test(hash.sha256??''))fail('NATIVE_TABLE_HASH_REQUIRED');
   tables.push({schema:table.schema,table:table.table,kind:table.kind,columns:[...table.columns],rows:hash.rows,sha256:hash.sha256});
  }
  const {rows:currentSequences}=await client.query(sequencesSql),sequences=[];
  for(const sequence of projection?.sequences??currentSequences){
   if(!currentSequences.some(s=>s.schema===sequence.schema&&s.name===sequence.name))fail('ORIGINAL_SEQUENCE_REMOVED');
   const {rows:[value]}=await client.query(`SELECT last_value::text AS "lastValue",is_called AS "isCalled" FROM ${quote(sequence.schema)}.${quote(sequence.name)}`);
   if(!/^-?[0-9]+$/.test(value.lastValue??'')||typeof value.isCalled!=='boolean')fail('EXACT_SEQUENCE_STATE_REQUIRED');
   sequences.push({schema:sequence.schema,name:sequence.name,ownerSchema:sequence.ownerSchema,ownerTable:sequence.ownerTable,...value});
  }
  const newTables=projection?actual.filter(table=>!before.some(prior=>table.schema===prior.schema&&table.table===prior.table)):[];
  for(const table of newTables){
   const {rows:[{count}]}=await client.query(`SELECT count(*)::integer AS count FROM ${quote(table.schema)}.${quote(table.table)}`);
   if(!(table.schema==='public'&&tools.has(table.table))&&count!==0)fail('NEW_BUSINESS_TABLE_NOT_EMPTY');
   table.rows=count;
  }
  const businessTables=tables.filter(table=>!(table.schema==='public'&&tools.has(table.table))),businessSequences=sequences.filter(sequence=>!(sequence.ownerSchema==='public'&&tools.has(sequence.ownerTable)));
  const content={schema:'phoenix.modern-schema-database-facts/v1',database:{name:identity.name,systemIdentifier:identity.systemIdentifier},tables,sequences,newTables};
  return {...content,allDataSha256:canonicalDigest({tables,sequences}),businessDataSha256:canonicalDigest({tables:businessTables,sequences:businessSequences}),readOnly:true,releaseAuthorized:false};
 }finally{if(!withinSnapshot)await client.query('ROLLBACK');}
}
export function assertModernSchemaBusinessUnchanged(before,after){
 if(!same(before.database,after.database)||before.businessDataSha256!==after.businessDataSha256)fail('ORIGINAL_BUSINESS_FACTS_CHANGED');return true;
}
export function defaultOffEvidenceFromFacts(targetSha,facts,{stage='AFTER_SCHEMA',floor}={}){
 if(!/^[a-f0-9]{40}$/.test(targetSha??'')||!['BEFORE_SCHEMA','AFTER_SCHEMA'].includes(stage))fail('EXACT_OFF_EVIDENCE_SCOPE_REQUIRED');
 const policy=floor??secureJson(path.join(CONTRACT.stateDirectory,'floor.json'));
 if(policy.chanjetPolicy!=='HOLD'||policy.readonlyApproval!==null)fail('CHANJET_HOLD_REQUIRED');
 const counts=defaults.map(table=>{const observed=facts.tables.find(row=>row.schema==='public'&&row.table===table)??facts.newTables.find(row=>row.schema==='public'&&row.table===table);
  if(stage==='AFTER_SCHEMA'&&!observed)fail('TARGET_SCOPE_TABLE_MISSING');if(observed&&observed.rows!==0)fail('BUSINESS_ACTIVATION_ALREADY_PRESENT');
  return {table,presence:observed?'PRESENT_ZERO':'ABSENT_BEFORE_SCHEMA',rows:0};});
 return {schema:'phoenix.modern-schema-default-off-evidence/v1',targetSha,featureRollout:'OFF',scopeRows:0,qualificationRows:0,admissionRows:0,cutoverResultRows:0,
  chanjetPolicy:'HOLD',verified:true,stage,observedTables:counts,factsSha256:facts.businessDataSha256};
}
/** Recheck only the rollout authorities after ingress release. Exempt GETs may
 * initialize unrelated schema; they cannot be mistaken for rollout evidence. */
export async function captureModernSchemaDefaultOff(client,targetSha,{floor}={}){
 if(!/^[a-f0-9]{40}$/.test(targetSha??''))fail('EXACT_OFF_EVIDENCE_SCOPE_REQUIRED');
 const policy=floor??secureJson(path.join(CONTRACT.stateDirectory,'floor.json'));
 if(policy.chanjetPolicy!=='HOLD'||policy.readonlyApproval!==null)fail('CHANJET_HOLD_REQUIRED');
 const {rows}=await client.query(defaults.map(table=>`SELECT '${table}'::text AS table,count(*)::text AS rows FROM public.${quote(table)}`).join(' UNION ALL ')+' ORDER BY 1');
 if(rows.length!==defaults.length||!rows.every(row=>defaults.includes(row.table)&&row.rows==='0')||new Set(rows.map(row=>row.table)).size!==defaults.length)fail('BUSINESS_ACTIVATION_ALREADY_PRESENT');
 return {schema:'phoenix.modern-schema-live-default-off/v1',targetSha,observedTables:rows,featureRollout:'OFF',chanjetPolicy:'HOLD',verified:true,readOnly:true};
}
