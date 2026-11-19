import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import test from 'node:test';
import {executionEnv} from './capture-production-runtime.mjs';
import {assertModernSchemaBusinessUnchanged,captureModernSchemaFacts,captureModernSchemaFactsPair} from './production-modern-schema-facts.mjs';
import {ModernSchemaReadClient} from './production-modern-schema-read-client.mjs';

const enabled=process.env.PHOENIX_FACTS_PG_FIXTURE==='1';
const docker=args=>execFileSync('/usr/bin/docker',args,{env:executionEnv(),encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']}).trim();
const seed=`
 CREATE TABLE chanjet_read_snapshots (id bigint PRIMARY KEY, payload_hash text, raw_payload jsonb);
 INSERT INTO chanjet_read_snapshots
 SELECT '-9223372036854775808'::bigint+i*219,'same',jsonb_build_object('value',i)
 FROM generate_series(0,255) i ORDER BY i DESC;
 INSERT INTO chanjet_read_snapshots VALUES (9223372036854775807,'same','{}');

 CREATE TABLE mon_device_property_history (id uuid PRIMARY KEY, erp_house_code varchar(50), property_code varchar(50),
  value decimal(18,2), collect_time bigint, log_date date, created_at timestamp);
 INSERT INTO mon_device_property_history
 SELECT md5(i::text)::uuid,'house','property',i/100.0,i,'2026-11-01'::date,'2026-11-01'::timestamp
 FROM generate_series(1,65539) i;
 CREATE TABLE generic_integer ("unusual key" integer PRIMARY KEY);
 INSERT INTO generic_integer SELECT i FROM generate_series(-512,512) i;
 CREATE TABLE smallint_threshold (id smallint PRIMARY KEY);
 INSERT INTO smallint_threshold SELECT i FROM generate_series(-512,511) i;
 CREATE TABLE generic_text (id text PRIMARY KEY);
 INSERT INTO generic_text SELECT i::text FROM generate_series(1,1030) i;

 CREATE TABLE inherited (id bigint PRIMARY KEY, value text);
 CREATE TABLE inherited_child () INHERITS (inherited);
 INSERT INTO inherited SELECT i,'parent' FROM generate_series(1,1030) i;
 INSERT INTO inherited_child VALUES (2049,'child');
 CREATE TABLE partitioned (id bigint PRIMARY KEY) PARTITION BY RANGE(id);
 CREATE TABLE partitioned_p PARTITION OF partitioned FOR VALUES FROM (0) TO (2000);
 INSERT INTO partitioned SELECT i FROM generate_series(1,1030) i;
`;

async function verifyLegacyDictionarySequence(client,sql){
 sql(`
  CREATE SEQUENCE public.sys_dict_id_seq;
  CREATE TABLE public.sys_dict (id integer PRIMARY KEY DEFAULT nextval('public.sys_dict_id_seq'::regclass), label text);
  CREATE SEQUENCE public.sys_dict_id_seq1 OWNED BY public.sys_dict.id;
  CREATE SEQUENCE public.business_seq;
  CREATE TABLE public.business (id bigint PRIMARY KEY DEFAULT nextval('public.business_seq'::regclass));
  CREATE SCHEMA other;
  CREATE SEQUENCE other.sys_dict_id_seq;
 `);
 const before=await captureModernSchemaFacts(client);
 sql("INSERT INTO public.sys_dict(label) VALUES ('dictionary migration')");
 const after=await captureModernSchemaFacts(client,{projection:before});
 assertModernSchemaBusinessUnchanged(before,after);
 assert.notEqual(before.allDataSha256,after.allDataSha256);
 const facts=after.sequences.filter(sequence=>sequence.schema==='public'&&sequence.name.startsWith('sys_dict_id_seq'));
 assert.deepEqual(facts.map(({name,ownerSchema,ownerTable,isCalled})=>({name,ownerSchema,ownerTable,isCalled})),[
  {name:'sys_dict_id_seq',ownerSchema:null,ownerTable:null,isCalled:true},
  {name:'sys_dict_id_seq1',ownerSchema:'public',ownerTable:'sys_dict',isCalled:false},
 ]);
 assert.deepEqual(Object.keys(facts[0]).sort(),['isCalled','lastValue','name','ownerSchema','ownerTable','schema']);

 const normalDefault="ALTER TABLE public.sys_dict ALTER COLUMN id SET DEFAULT nextval('public.sys_dict_id_seq'::regclass)";
 for(const [change,reset] of [
  ['ALTER SEQUENCE public.sys_dict_id_seq OWNED BY public.business.id','ALTER SEQUENCE public.sys_dict_id_seq OWNED BY NONE'],
  ["ALTER TABLE public.business ALTER COLUMN id SET DEFAULT nextval('public.sys_dict_id_seq'::regclass)",
   "ALTER TABLE public.business ALTER COLUMN id SET DEFAULT nextval('public.business_seq'::regclass)"],
  [normalDefault+' + 0',normalDefault],
  ['ALTER TABLE public.sys_dict ALTER COLUMN id DROP DEFAULT',normalDefault],
  ["CREATE FUNCTION public.dict_next() RETURNS bigint LANGUAGE SQL BEGIN ATOMIC SELECT nextval('public.sys_dict_id_seq'::regclass); END; ALTER TABLE public.sys_dict ALTER COLUMN id SET DEFAULT public.dict_next()",
   normalDefault+'; DROP FUNCTION public.dict_next()'],
  ["CREATE VIEW public.business_sequence_use AS SELECT nextval('public.sys_dict_id_seq'::regclass)",
   'DROP VIEW public.business_sequence_use'],
 ]){
  const prior=await captureModernSchemaFacts(client);
  sql(change);
  const altered=await captureModernSchemaFacts(client,{projection:prior});
  assert.throws(()=>assertModernSchemaBusinessUnchanged(prior,altered),/ORIGINAL_BUSINESS_FACTS_CHANGED/);
  sql("SELECT nextval('public.sys_dict_id_seq'::regclass)");
  const advanced=await captureModernSchemaFacts(client,{projection:altered});
  assert.throws(()=>assertModernSchemaBusinessUnchanged(altered,advanced),/ORIGINAL_BUSINESS_FACTS_CHANGED/);
  sql(reset);
 }
 for(const advance of ["SELECT nextval('public.business_seq'::regclass)","SELECT nextval('other.sys_dict_id_seq'::regclass)",
  'INSERT INTO public.business(id) VALUES (100)']){
  const businessBefore=await captureModernSchemaFacts(client);
  sql(advance);
  const businessAfter=await captureModernSchemaFacts(client,{projection:businessBefore});
  assert.throws(()=>assertModernSchemaBusinessUnchanged(businessBefore,businessAfter),/ORIGINAL_BUSINESS_FACTS_CHANGED/);
 }
}

async function verifyFactsPair(client,sql){
 sql('CREATE SEQUENCE public.pair_a START WITH 11; CREATE SEQUENCE public.pair_z START WITH 99');
 const original=await captureModernSchemaFacts(client);
 sql(`ALTER TABLE public.generic_integer ADD COLUMN extra text DEFAULT 'first';
  CREATE TABLE public.pair_new (id integer PRIMARY KEY);
  CREATE SEQUENCE public.pair_mid START WITH 55`);
 const independentFull=await captureModernSchemaFacts(client);
 const independentProjection=await captureModernSchemaFacts(client,{projection:original});
 const scans=new Map();
 let sequenceBatches=0,sequenceAdvanced=false;
 const pair=await captureModernSchemaFactsPair({async query(statement,parameters){
  const result=await client.query(statement,parameters);
  if(statement.includes('AS "upperKey"')){
   const table=statement.match(/FROM ONLY "public"\."([^"]+)"/)?.[1];
   scans.set(table,(scans.get(table)??0)+1);
  }
  assert.doesNotMatch(statement,/^SELECT count\(\*\)::integer AS count FROM/);
  if(statement.includes(' AS "sequenceIndex"')){
   sequenceBatches++;
   if(!sequenceAdvanced){
    sql("SELECT setval('public.pair_a'::regclass,42); UPDATE public.generic_integer SET extra='second' WHERE \"unusual key\"=0");
    sequenceAdvanced=true;
   }
  }
  return result;
 }},{projection:original});
 assert.deepEqual(pair.full,independentFull);
 assert.deepEqual(pair.projected,independentProjection);
 assertModernSchemaBusinessUnchanged(original,pair.projected);
 assert.equal(scans.get('chanjet_read_snapshots'),3);
 assert.equal(scans.get('generic_integer'),4);
 assert.equal(sequenceBatches,1);
 assert.equal(pair.full.sequences.find(sequence=>sequence.name==='pair_a').lastValue,'11');
 assert.equal(pair.projected.sequences.find(sequence=>sequence.name==='pair_a').lastValue,'11');
 assert.deepEqual(pair.projected.newTables,[{schema:'public',table:'pair_new',kind:'r',columns:['id'],rows:0}]);
 assert.notStrictEqual(pair.projected.tables[0].columns,pair.full.tables[0].columns);
 assert.notStrictEqual(pair.projected.sequences[0],pair.full.sequences[0]);

 const reordered={...original,sequences:[...original.sequences].reverse()};
 const later=await captureModernSchemaFactsPair(client,{projection:reordered});
 assert.notEqual(later.full.allDataSha256,pair.full.allDataSha256);
 assert.deepEqual(later.projected.sequences.map(({name})=>name),['pair_z','pair_a']);
 assert.deepEqual(later.full.sequences.map(({name})=>name),['pair_a','pair_mid','pair_z']);
 assert.deepEqual(later.projected,await captureModernSchemaFacts(client,{projection:reordered}));
 sql('INSERT INTO public.pair_new VALUES (1)');
 await assert.rejects(captureModernSchemaFactsPair(client,{projection:original}),/NEW_BUSINESS_TABLE_NOT_EMPTY/);
 sql('TRUNCATE public.pair_new; ALTER TABLE public.generic_integer RENAME TO hidden_original');
 await assert.rejects(captureModernSchemaFactsPair(client,{projection:original}),/ORIGINAL_BUSINESS_COLUMNS_REMOVED/);
 sql('ALTER TABLE public.hidden_original RENAME TO generic_integer; ALTER TABLE public.generic_integer DROP COLUMN "unusual key"');
 await assert.rejects(captureModernSchemaFactsPair(client,{projection:original}),/ORIGINAL_BUSINESS_COLUMNS_REMOVED/);
 sql('ALTER TABLE public.generic_integer ADD COLUMN "unusual key" integer; DROP SEQUENCE public.pair_z');
 await assert.rejects(captureModernSchemaFactsPair(client,{projection:original}),/ORIGINAL_SEQUENCE_REMOVED/);
}

for(const version of ['16.14-alpine','18-alpine']){
 test(`PostgreSQL ${version} facts cover keyed scans, sequence classification and paired projections`,{skip:!enabled,timeout:45000},async()=>{
  const container=docker(['run','-d','--pull=never','--rm','--network','none','--memory','256m',
   '--name','phoenix-facts-test-'+randomUUID(),'--label','phoenix.test=modern-schema-facts',
   '-e','POSTGRES_USER=postgres','-e','POSTGRES_DB=postgres','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:'+version]);
  const sql=statement=>docker(['exec',container,'psql','-h','127.0.0.1','-XqAt','-v','ON_ERROR_STOP=1','-U','postgres','-c',statement]);
  let client;
  try{
   let ready=false;
   for(let attempt=0;attempt<40&&!ready;attempt++){
    try{ready=sql('SELECT 1')==='1';}catch{await delay(250);}
   }
   assert.ok(ready,'isolated TCP server must finish initialization');
   sql(seed);
   client=new ModernSchemaReadClient({databaseContainer:container,guard(){}});
   await client.start();
   const completeScans=new Set(),segmentCounts=new Map();
   let lockChecked=false;
   const observedClient={async query(statement,parameters){
    if(statement.includes('JOIN pg_index')&&parameters[0]==='"public"."chanjet_read_snapshots"'&&!lockChecked){
     const lock=sql("SELECT count(*) FROM pg_locks l JOIN pg_stat_activity s ON s.pid=l.pid WHERE l.relation='chanjet_read_snapshots'::regclass AND l.mode='AccessShareLock' AND l.granted AND s.application_name='phoenix-modern-schema-read'");
     assert.equal(lock,'1');
     lockChecked=true;
    }
    const table=statement.match(/FROM (?:ONLY )?"public"\."([^"]+)"/)?.[1];
    if(table&&statement.includes(' AS "blockIndex"'))completeScans.add(table);
    const result=await client.query(statement,parameters);
    if(table&&statement.includes('AS "upperKey"')&&result.rows[0].rows)segmentCounts.set(table,(segmentCounts.get(table)??0)+1);
    return result;
   }};
   const facts=await captureModernSchemaFacts(observedClient);
   assert.ok(lockChecked);
   const rowCounts=Object.fromEntries(facts.tables.map(table=>[table.table,table.rows]));
   assert.deepEqual(rowCounts,{chanjet_read_snapshots:257,generic_integer:1025,generic_text:1030,
    inherited:1031,inherited_child:1,mon_device_property_history:65539,partitioned:1030,partitioned_p:1030,smallint_threshold:1024});
   assert.deepEqual(Object.fromEntries(segmentCounts),{chanjet_read_snapshots:3,generic_integer:2,mon_device_property_history:3});
   assert.deepEqual([...completeScans].sort(),['generic_text','inherited','inherited_child','partitioned','partitioned_p','smallint_threshold']);

   sql('CLUSTER mon_device_property_history USING mon_device_property_history_pkey');
   assert.deepEqual(await captureModernSchemaFacts(client,{projection:facts}),facts);
   let inserted=false;
   const duringWrite={async query(statement,parameters){
    const result=await client.query(statement,parameters);
    if(!inserted&&statement.includes('AS "startsAtLower"')){
     sql("INSERT INTO chanjet_read_snapshots VALUES (0,'same','{}')");
     inserted=true;
    }
    return result;
   }};
   assert.deepEqual(await captureModernSchemaFacts(duringWrite,{projection:facts}),facts);
   assert.ok(inserted);
   sql('INSERT INTO smallint_threshold VALUES (32767)');
   const later=await captureModernSchemaFacts(observedClient);
   assert.equal(later.tables.find(table=>table.table==='chanjet_read_snapshots').rows,258);
   assert.equal(later.tables.find(table=>table.table==='smallint_threshold').rows,1025);
   assert.equal(segmentCounts.get('smallint_threshold'),2);
   assert.notEqual(later.businessDataSha256,facts.businessDataSha256);
   sql('TRUNCATE mon_device_property_history');
   await verifyFactsPair(client,sql);
   await verifyLegacyDictionarySequence(client,sql);
  }finally{
   try{await client?.close();}finally{docker(['stop',container]);}
  }
 });
}
