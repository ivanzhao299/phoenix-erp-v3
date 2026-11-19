/** Native server hashes preserve all original column values and sequences.
 * No row data, password hashes or numeric JSON values leave PostgreSQL. */
import {CONTRACT,secureJson} from './production-config-guard.mjs';import path from 'node:path';
import {createHash} from 'node:crypto';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
const fail=code=>{throw Error('MODERN_SCHEMA_FACTS_HOLD='+code);};
const quote=value=>'"'+value.replaceAll('"','""')+'"';
const BLOCK_ROWS=1024;
const CHANJET_SEGMENT_ROWS=128;
const MON_HISTORY_SEGMENT_ROWS=32768;
const SEQUENCE_READ_BATCH=32;
const integerKeyLimits=new Map([
 ['int2',[-32768n,32767n]],
 ['int4',[-2147483648n,2147483647n]],
 ['int8',[-9223372036854775808n,9223372036854775807n]],
]);
const UUID_KEY=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const HASH=/^[a-f0-9]{64}$/;
const nativeRowHashSql="encode(sha256(convert_to(to_jsonb(phoenix_original_row)::text,'UTF8')),'hex')";
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
// One historical dict default uses an unowned sequence, distinct from the sequence it owns.
// Only a sole, direct catalog dependency qualifies that exact sequence as a tool.
const sequencesSql=`SELECT n.nspname AS schema,c.relname AS name,onsp.nspname AS "ownerSchema",owner.relname AS "ownerTable",
 CASE WHEN n.nspname='public' AND c.relname='sys_dict_id_seq' AND d.objid IS NULL THEN (
  SELECT count(*)=1 AND coalesce(bool_and(
   dep.classid='pg_attrdef'::regclass AND dep.deptype='n' AND dep.objsubid=0 AND dep.refobjsubid=0
   AND dict_schema.nspname='public' AND dict.relname='sys_dict' AND dict.relkind='r'
   AND col.attname='id' AND col.attnum>0 AND NOT col.attisdropped
   AND pg_get_expr(def.adbin,def.adrelid)='nextval(''public.sys_dict_id_seq''::regclass)'
  ),false)
  FROM pg_depend dep
  LEFT JOIN pg_attrdef def ON dep.classid='pg_attrdef'::regclass AND def.oid=dep.objid
  LEFT JOIN pg_class dict ON dict.oid=def.adrelid
  LEFT JOIN pg_namespace dict_schema ON dict_schema.oid=dict.relnamespace
  LEFT JOIN pg_attribute col ON col.attrelid=def.adrelid AND col.attnum=def.adnum
  WHERE dep.refclassid='pg_class'::regclass AND dep.refobjid=c.oid
 ) ELSE false END AS "legacyDictionaryTool"
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_depend d ON d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype IN('a','i')
 LEFT JOIN pg_class owner ON owner.oid=d.refobjid LEFT JOIN pg_namespace onsp ON onsp.oid=owner.relnamespace
 WHERE c.relkind='S' AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema' ORDER BY n.nspname,c.relname`;
export function modernSchemaTableFactsSql(table){
 // Both the count and the ordered blocks reuse one hash per source row.
 return `WITH hashed AS MATERIALIZED (
   SELECT ${nativeRowHashSql} COLLATE "C" AS row_hash
   FROM (SELECT ${table.columns.map(quote).join(',')} FROM ${quote(table.schema)}.${quote(table.table)}) AS phoenix_original_row
 ), numbered AS (
   SELECT row_hash,(row_number() OVER (ORDER BY row_hash COLLATE "C")-1)/${BLOCK_ROWS} AS block_index FROM hashed
 ), blocks AS (
   SELECT block_index,count(*)::integer AS block_rows,
    encode(sha256(convert_to(string_agg(row_hash,'' ORDER BY row_hash COLLATE "C"),'UTF8')),'hex') AS sha256
   FROM numbered GROUP BY block_index
 ), totals AS (
   SELECT count(*)::integer AS total_rows FROM hashed
 )
 SELECT block_index::integer AS "blockIndex",block_rows AS "blockRows",sha256,total_rows AS "totalRows"
 FROM totals LEFT JOIN blocks ON true ORDER BY block_index`;
}
export function foldModernSchemaTableFacts(columns,observed){
 const shape=row=>row&&Object.getPrototypeOf(row)===Object.prototype&&Object.keys(row).sort().join(',')==='blockIndex,blockRows,sha256,totalRows';
 const first=observed?.[0],rows=first?.totalRows;
 if(!Array.isArray(observed)||!shape(first)||!Number.isSafeInteger(rows)||rows<0||rows>2147483647)fail('NATIVE_TABLE_HASH_REQUIRED');
 const blockCount=Math.ceil(rows/BLOCK_ROWS);
 if(observed.length!==Math.max(1,blockCount))fail('NATIVE_TABLE_HASH_REQUIRED');
 if(!rows&&(first.blockIndex!==null||first.blockRows!==null||first.sha256!==null))fail('NATIVE_TABLE_HASH_REQUIRED');
 const blocks=rows?observed.map((block,index)=>{
  if(!shape(block)||block.totalRows!==rows||block.blockIndex!==index||block.blockRows!==Math.min(BLOCK_ROWS,rows-index*BLOCK_ROWS)||
    typeof block.sha256!=='string'||!HASH.test(block.sha256))fail('NATIVE_TABLE_HASH_REQUIRED');
  return block.sha256;
 }):[];
 return {rows,sha256:canonicalDigest({algorithm:'native-row-sha256-block-v1',columns,rows,blockRows:BLOCK_ROWS,blocks})};
}

// PostgreSQL locks the ONLY relation during query analysis, even at LIMIT 0.
const segmentKeySql=relation=>`WITH locked_relation AS MATERIALIZED (
 SELECT 1 FROM ONLY ${relation} LIMIT 0
)
 SELECT a.attname::text AS "keyColumn",t.typname::text AS "keyType"
 FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid
 JOIN pg_type t ON t.oid=a.atttypid
 JOIN pg_index i ON i.indrelid=c.oid
 JOIN pg_opclass o ON o.oid=i.indclass[0]
 JOIN pg_am m ON m.oid=o.opcmethod
 WHERE c.oid=to_regclass($1) AND c.relkind='r' AND NOT c.relispartition
 AND NOT EXISTS (SELECT 1 FROM locked_relation)
 AND NOT EXISTS (SELECT 1 FROM pg_inherits WHERE inhrelid=c.oid OR inhparent=c.oid)
 AND a.attnum>0 AND NOT a.attisdropped AND a.attnotnull
 AND t.typnamespace='pg_catalog'::regnamespace AND t.typname IN ('int2','int4','int8','uuid')
 AND m.amname='btree' AND o.opcnamespace='pg_catalog'::regnamespace AND o.opcdefault AND o.opcintype=t.oid
 AND i.indisprimary AND i.indisvalid AND i.indisready AND i.indislive AND i.indimmediate
 AND i.indnkeyatts=1 AND i.indnatts=1 AND i.indkey[0]=a.attnum AND i.indpred IS NULL AND i.indexprs IS NULL
 `;

function parseSegmentKey(value,type){
 if(typeof value!=='string')fail('NATIVE_TABLE_SEGMENT_REQUIRED');
 if(type==='uuid'&&UUID_KEY.test(value))return value;
 const limits=integerKeyLimits.get(type);
 if(!limits||!/^(?:0|-?[1-9][0-9]{0,18})$/.test(value))fail('NATIVE_TABLE_SEGMENT_REQUIRED');
 const integer=BigInt(value);
 if(integer<limits[0]||integer>limits[1])fail('NATIVE_TABLE_SEGMENT_REQUIRED');
 return integer;
}

async function readSegment(client,{relation,key,keyType,segmentRows,columns,includeSmall},lower){
 const lowerBound=lower===null?'':`${key}>=$1::${keyType}`;
 const probeOnly=lower===null&&!includeSmall;
 const page=condition=>`(SELECT ${columns.map(quote).join(',')} FROM ONLY ${relation}
  WHERE ${condition} ${lowerBound?'AND '+lowerBound:''} ORDER BY ${key} LIMIT ${segmentRows+1})`;
 // Keep a native upper index bound on full segments. An OR with the tail case
 // can turn it into a filter and scan the remainder when checking for an extra row.
 const bounded=page(`boundary.upper_key IS NOT NULL AND ${key}<boundary.upper_key`);
 const source=probeOnly?bounded:`${bounded} UNION ALL ${page('boundary.upper_key IS NULL')}`;
 // The lookahead is key-only. Hash only the bounded half-open interval in the same statement.
 const {rows}=await client.query(`WITH boundary AS MATERIALIZED (
  SELECT (SELECT ${key} FROM ONLY ${relation} ${lowerBound?'WHERE '+lowerBound:''}
   ORDER BY ${key} OFFSET ${segmentRows} LIMIT 1) AS upper_key
 )
 SELECT boundary.upper_key::text AS "upperKey", boundary.upper_key IS NOT NULL AS "hasUpper", segment.*
 FROM boundary CROSS JOIN LATERAL (
  WITH hashed AS MATERIALIZED (
   SELECT ${key} AS segment_key,${nativeRowHashSql} COLLATE "C" AS row_hash
   FROM (${source}) AS phoenix_original_row
  )
  SELECT count(*)::integer AS rows,
   ${lower===null?'true':`coalesce(bool_or(segment_key=$1::${keyType}),false)`} AS "startsAtLower",
   encode(sha256(convert_to(string_agg(row_hash,'' ORDER BY row_hash COLLATE "C"),'UTF8')),'hex') AS sha256
  FROM hashed
 ) AS segment`,lower===null?[]:[lower]);
 const [segment]=rows;
 const upper=segment?.upperKey;
 if(upper!==null){
  const parsed=parseSegmentKey(upper,keyType);
  if(lower!==null&&parsed<=parseSegmentKey(lower,keyType))fail('NATIVE_TABLE_SEGMENT_REQUIRED');
 }
 if(rows.length!==1||segment?.hasUpper!==(upper!==null)||segment.startsAtLower!==true||!Number.isSafeInteger(segment.rows)||
  segment.rows<0||segment.rows>segmentRows||
  (upper!==null&&segment.rows!==segmentRows)||(lower!==null&&segment.rows===0)||
  (probeOnly&&upper===null&&segment.rows!==0)||
  (segment.rows?(typeof segment.sha256!=='string'||!HASH.test(segment.sha256)):segment.sha256!==null)){
  fail('NATIVE_TABLE_SEGMENT_REQUIRED');
 }
 return segment;
}

async function captureSegmentedTableFacts(client,table){
 const {schema,table:name,columns}=table;
 const relation=`${quote(schema)}.${quote(name)}`;
 const {rows:keys}=await client.query(segmentKeySql(relation),[relation]);
 if(!keys.length)return null;
 const {keyColumn,keyType}=keys[0];
 if(keys.length!==1||typeof keyColumn!=='string'||(keyType!=='uuid'&&!integerKeyLimits.has(keyType))){
  fail('NATIVE_TABLE_KEY_REQUIRED');
 }
 if(!columns.includes(keyColumn))return null;

 const chanjet=schema==='public'&&name==='chanjet_read_snapshots';
 const monHistory=schema==='public'&&name==='mon_device_property_history';
 const segmentRows=chanjet?CHANJET_SEGMENT_ROWS:monHistory?MON_HISTORY_SEGMENT_ROWS:BLOCK_ROWS;
 const singleBlock=segmentRows===BLOCK_ROWS;
 const plan={relation,key:quote(keyColumn),keyType,segmentRows,columns,includeSmall:chanjet||singleBlock};
 let lower=null,rows=0;
 const segments=createHash('sha256');
 for(;;){
  const segment=await readSegment(client,plan,lower),upper=segment.upperKey;
  // A complete first interval of at most BLOCK_ROWS is exactly one legacy block.
  if(lower===null&&upper===null&&!chanjet){
   if(!singleBlock)return null;
   return foldModernSchemaTableFacts(columns,[{blockIndex:segment.rows?0:null,blockRows:segment.rows||null,
    sha256:segment.sha256,totalRows:segment.rows}]);
  }
  rows+=segment.rows;
  if(rows>2147483647)fail('NATIVE_TABLE_SEGMENT_REQUIRED');
  // Bind each half-open interval to its row count and digest without retaining its keys.
  if(segment.rows)segments.update(canonicalDigest({lower,upper,rows:segment.rows,sha256:segment.sha256}));
  if(upper===null)break;
  lower=upper;
 }
 const domain=chanjet&&keyColumn==='id'&&keyType==='int8'?{algorithm:'native-row-sha256-bigint-segment-v1'}:
  {algorithm:'native-row-sha256-key-segment-v1',keyColumn,keyType};
 return {rows,sha256:canonicalDigest({...domain,columns,rows,segmentRows,segmentsSha256:segments.digest('hex')})};
}

const relationKey=(schema,name)=>JSON.stringify([schema,name]);

async function captureSequenceValues(client,selected){
 const values=new Map();
 for(let offset=0;offset<selected.length;offset+=SEQUENCE_READ_BATCH){
  const batch=selected.slice(offset,offset+SEQUENCE_READ_BATCH);
  const sql=batch.map(({schema,name},index)=>`SELECT ${index} AS "sequenceIndex",last_value::text AS "lastValue",is_called AS "isCalled" FROM ${quote(schema)}.${quote(name)}`);
  const {rows}=await client.query(sql.join(' UNION ALL ')+' ORDER BY "sequenceIndex"');
  if(rows.length!==batch.length)fail('EXACT_SEQUENCE_STATE_REQUIRED');
  for(const [index,{schema,name}] of batch.entries()){
   const value=rows[index];
   if(value?.sequenceIndex!==index||typeof value.lastValue!=='string'||!/^-?[0-9]+$/.test(value.lastValue)||typeof value.isCalled!=='boolean'){
    fail('EXACT_SEQUENCE_STATE_REQUIRED');
   }
   values.set(relationKey(schema,name),{lastValue:value.lastValue,isCalled:value.isCalled});
  }
 }
 return values;
}

function sequenceFacts(selected,live,values){
 const sequences=[],businessSequences=[];
 for(const {schema,name,ownerSchema,ownerTable} of selected){
  const key=relationKey(schema,name);
  const fact={schema,name,ownerSchema,ownerTable,...values.get(key)};
  sequences.push(fact);
  const ownedTool=ownerSchema==='public'&&tools.has(ownerTable);
  const legacyTool=ownerSchema===null&&ownerTable===null&&live.get(key).legacyDictionaryTool===true;
  if(!ownedTool&&!legacyTool)businessSequences.push(fact);
 }
 return {sequences,businessSequences};
}

async function captureTableFacts(client,table,current){
 let hash=table.kind==='r'&&current.kind==='r'?await captureSegmentedTableFacts(client,table):null;
 if(hash===null){
  const {rows:observed}=await client.query(modernSchemaTableFactsSql(table));
  hash=foldModernSchemaTableFacts(table.columns,observed);
 }
 return {schema:table.schema,table:table.table,kind:table.kind,columns:[...table.columns],rows:hash.rows,sha256:hash.sha256};
}

function factsReceipt(identity,tables,{sequences,businessSequences},newTables){
 const businessTables=tables.filter(table=>!(table.schema==='public'&&tools.has(table.table)));
 const content={schema:'phoenix.modern-schema-database-facts/v1',database:{name:identity.name,systemIdentifier:identity.systemIdentifier},tables,sequences,newTables};
 return {...content,allDataSha256:canonicalDigest({tables,sequences}),businessDataSha256:canonicalDigest({tables:businessTables,sequences:businessSequences}),readOnly:true,releaseAuthorized:false};
}

async function collectModernSchemaFacts(client,{projection,withinSnapshot,includeFull}){
 if(!withinSnapshot)await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try{
  await client.query("SET LOCAL search_path=pg_catalog; SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='3s'; SET LOCAL row_security=off; SET LOCAL max_parallel_workers_per_gather=0; SET LOCAL work_mem='4MB'; SET LOCAL TimeZone='UTC'; SET LOCAL DateStyle='ISO,YMD'; SET LOCAL IntervalStyle='iso_8601'; SET LOCAL bytea_output='hex'; SET LOCAL extra_float_digits=3");
  const {rows:[identity]}=await client.query(`SELECT current_database() AS name,(SELECT system_identifier::text FROM pg_control_system()) AS "systemIdentifier",NOT pg_is_in_recovery() AS primary,current_setting('transaction_read_only') AS readonly,current_setting('transaction_isolation') AS isolation`);
  if(identity.primary!==true||identity.readonly!=='on'||identity.isolation!=='repeatable read')fail('PRIMARY_READONLY_REQUIRED');
  const {rows:actual}=await client.query(catalogSql);if(actual.some(table=>table.kind==='f'))fail('FOREIGN_TABLE_OUTSIDE_SUPPORTED_SCOPE');
  const originals=projection?.tables??actual;
  if(!Array.isArray(originals)||originals.length>2048||(includeFull&&actual.length>2048))fail('BOUNDED_TABLE_PROJECTION_REQUIRED');
  const byTable=new Map(actual.map(table=>[relationKey(table.schema,table.table),table]));
  const requested=originals.map(table=>{
   const key=relationKey(table.schema,table.table),current=byTable.get(key);
   if(!current||!Array.isArray(table.columns)||!table.columns.length||table.columns.some(column=>!current.columns.includes(column)))fail('ORIGINAL_BUSINESS_COLUMNS_REMOVED');
   return {table,current,key};
  });
  const fullTables=new Map();
  if(includeFull){
   for(const [key,table] of byTable)fullTables.set(key,await captureTableFacts(client,table,table));
  }
  const tables=[];
  for(const {table,current,key} of requested){
   // The segmentation policy also depends on relkind and exact column order.
   if(includeFull&&table.kind===current.kind&&same(table.columns,current.columns)){
    tables.push({...fullTables.get(key),columns:[...table.columns]});
   }else{
    tables.push(await captureTableFacts(client,table,current));
   }
  }
  const {rows:currentSequences}=await client.query(sequencesSql);
  const liveSequences=new Map(currentSequences.map(sequence=>[relationKey(sequence.schema,sequence.name),sequence]));
  const originalSequences=projection?.sequences??currentSequences;
  if(originalSequences.some(sequence=>!liveSequences.has(relationKey(sequence.schema,sequence.name))))fail('ORIGINAL_SEQUENCE_REMOVED');
  const values=await captureSequenceValues(client,includeFull?currentSequences:originalSequences);

  const originalKeys=new Set(requested.map(row=>row.key)),newTables=[];
  for(const [key,table] of byTable){
   if(!projection||originalKeys.has(key))continue;
   let count=fullTables.get(key)?.rows;
   if(!includeFull){
    const {rows:[observed]}=await client.query(`SELECT count(*)::integer AS count FROM ${quote(table.schema)}.${quote(table.table)}`);
    count=observed.count;
   }
   if(!(table.schema==='public'&&tools.has(table.table))&&count!==0)fail('NEW_BUSINESS_TABLE_NOT_EMPTY');
   newTables.push({...table,columns:[...table.columns],rows:count});
  }
  const projected=factsReceipt(identity,tables,sequenceFacts(originalSequences,liveSequences,values),newTables);
  if(!includeFull)return projected;
  const full=factsReceipt(identity,[...fullTables.values()],sequenceFacts(currentSequences,liveSequences,values),[]);
  return {projected,full};
 }finally{if(!withinSnapshot)await client.query('ROLLBACK');}
}

export async function captureModernSchemaFacts(client,{projection=null,withinSnapshot=false}={}){
 return collectModernSchemaFacts(client,{projection,withinSnapshot,includeFull:false});
}

/** Collect original-column proof and current full facts on one read-only snapshot. */
export async function captureModernSchemaFactsPair(client,{projection,withinSnapshot=false}={}){
 if(!Array.isArray(projection?.tables)||!Array.isArray(projection.sequences))fail('BOUNDED_TABLE_PROJECTION_REQUIRED');
 return collectModernSchemaFacts(client,{projection,withinSnapshot,includeFull:true});
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
