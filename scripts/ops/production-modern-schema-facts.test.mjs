import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {captureModernSchemaFacts,foldModernSchemaTableFacts,modernSchemaTableFactsSql} from './production-modern-schema-facts.mjs';
import {bindModernSchemaReadSql,ModernSchemaReadClient} from './production-modern-schema-read-client.mjs';

const block=(blockIndex,blockRows,sha256,totalRows)=>({blockIndex,blockRows,sha256,totalRows});
const sha=char=>char.repeat(64);
const columns=['id','value'];

test('native facts SQL hashes each original row once and materializes only deterministic bounded blocks',()=>{
 const sql=modernSchemaTableFactsSql({schema:'quoted"schema',table:'quoted"table',columns:['id','quoted"column']});
 assert.match(sql,/WITH hashed AS MATERIALIZED/);
 assert.equal(sql.match(/to_jsonb\(/g).length,1);
 assert.match(sql,/FROM "quoted""schema"\."quoted""table"/);
 assert.match(sql,/SELECT "id","quoted""column"/);
 assert.match(sql,/row_number\(\) OVER \(ORDER BY row_hash COLLATE "C"\)-1\)\/1024/);
 assert.match(sql,/string_agg\(row_hash,'' ORDER BY row_hash COLLATE "C"\)/);
 assert.doesNotMatch(sql,/jsonb_agg/);
});

test('empty, exact full and tail blocks fold deterministically with row count and column order',()=>{
 const empty=foldModernSchemaTableFacts(columns,[block(null,null,null,0)]);
 const full=foldModernSchemaTableFacts(columns,[block(0,1024,sha('a'),1024)]);
 const tailRows=[block(0,1024,sha('a'),1025),block(1,1,sha('b'),1025)];
 const tail=foldModernSchemaTableFacts(columns,tailRows);
 assert.deepEqual(tail,foldModernSchemaTableFacts([...columns],structuredClone(tailRows)));
 assert.deepEqual([empty.rows,full.rows,tail.rows],[0,1024,1025]);
 assert.equal(new Set([empty.sha256,full.sha256,tail.sha256]).size,3);
 assert.notEqual(tail.sha256,foldModernSchemaTableFacts([...columns].reverse(),tailRows).sha256);
 assert.notEqual(tail.sha256,foldModernSchemaTableFacts(columns,[tailRows[0],block(1,1,sha('a'),1025)]).sha256);
});

test('native facts refuse missing, duplicate, reordered, lossy, malformed and overlarge block evidence',()=>{
 const a=block(0,1024,sha('a'),1025),b=block(1,1,sha('b'),1025);
 for(const result of [
  [],[a],[b,a],[a,a],[a,b,b],[{...a,totalRows:2147483648}],[{...a,totalRows:'1025'},b],
  [a,{...b,blockIndex:'1'}],[a,{...b,totalRows:1026}],[{...a,blockRows:1023},b],[a,{...b,blockRows:0}],
  [a,{...b,blockRows:1024}],[a,{...b,sha256:sha('A')}],[a,{...b,sha256:{}}],
  [a,{...b,privateData:'must not be accepted'}],[block(0,0,sha('a'),0)],[block(null,null,null,0),block(null,null,null,0)],
  [block(null,null,null,-1)],[{totalRows:0}],
 ])assert.throws(()=>foldModernSchemaTableFacts(columns,result),{message:'MODERN_SCHEMA_FACTS_HOLD=NATIVE_TABLE_HASH_REQUIRED'});
});

test('the native read client admits only the fixed facts memory control',async()=>{
 const client=new ModernSchemaReadClient({guard(){throw Error('FIXTURE_GUARD_REACHED');}});
 await assert.rejects(client.query("SET LOCAL search_path=pg_catalog; SET LOCAL work_mem='4MB'"),/FIXTURE_GUARD_REACHED/);
 for(const sql of ["SET LOCAL work_mem='8MB'","SET work_mem='4MB'","SET LOCAL work_mem='4MB'; COMMIT"]){
  assert.throws(()=>client.query(sql),/MODERN_SCHEMA_READ_HOLD/);
 }
});

const snapshotTable={schema:'public',table:'chanjet_read_snapshots',kind:'r',columns:['id','payload_hash','raw_payload']};
const minKey=-9223372036854775808n,maxKey=9223372036854775807n;
const digest=value=>createHash('sha256').update(value).digest('hex');
const mirrorRows=count=>Array.from({length:count},(_,index)=>({
 id:String(index===count-1?maxKey:minKey+BigInt(index)*219n),
 payload_hash:'unchanged',
 raw_payload:{body:'value '+index},
}));

function snapshotClient(data,{table=snapshotTable,verifiedKey=true,keyType='int8',lockError,override=()=>{},sequences=[],sequenceResult=rows=>rows}={}){
 const keys=[...data].sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:1);
 const calls=[];
 let sequenceOffset=0;
 return {calls,async query(sql,parameters=[]){
  if(sql==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'||sql==='ROLLBACK'){
   calls.push(sql);
   return {rows:[]};
  }
  if(sql.startsWith('SET LOCAL')){
   assert.match(sql,/statement_timeout='20s'.*lock_timeout='3s'.*work_mem='4MB'/);
   calls.push('limits');
   return {rows:[]};
  }
  bindModernSchemaReadSql(sql,parameters);
  if(sql.startsWith('SELECT current_database')){
   return {rows:[{name:'fixture',systemIdentifier:'1',primary:true,readonly:'on',isolation:'repeatable read'}]};
  }
  if(sql.includes('array_agg(a.attname'))return {rows:[table]};
  if(sql.includes('LEFT JOIN pg_depend'))return {rows:sequences};
  if(sql.includes(' AS "sequenceIndex"')){
   calls.push('sequence batch');
   const batch=sequences.slice(sequenceOffset,sequenceOffset+32);
   const clauses=batch.map(({schema,name},index)=>`SELECT ${index} AS "sequenceIndex",last_value::text AS "lastValue",is_called AS "isCalled" FROM "${schema}"."${name}"`);
   assert.equal(sql,clauses.join(' UNION ALL ')+' ORDER BY "sequenceIndex"');
   sequenceOffset+=batch.length;
   return {rows:sequenceResult(batch.map((sequence,index)=>({sequenceIndex:index,lastValue:String(sequenceOffset+index),isCalled:true})))};
  }
  if(sql.includes('JOIN pg_index')){
   calls.push('locked key');
   assert.match(sql,/^WITH locked_relation AS MATERIALIZED \(\s*SELECT 1 FROM ONLY "public"\."chanjet_read_snapshots" LIMIT 0/);
   assert.match(sql,/AND NOT EXISTS \(SELECT 1 FROM locked_relation\)/);
   assert.deepEqual(parameters,['"public"."chanjet_read_snapshots"']);
   if(lockError)throw lockError;
   assert.match(sql,/c.relkind='r' AND NOT c.relispartition/);
   assert.match(sql,/FROM pg_inherits WHERE inhrelid=c.oid OR inhparent=c.oid/);
   assert.match(sql,/a.attnotnull[\s\S]*t.typname IN \('int2','int4','int8','uuid'\)/);
   assert.match(sql,/m.amname='btree'[\s\S]*o.opcdefault/);
   assert.match(sql,/i.indisprimary AND i.indisvalid[\s\S]*i.indnkeyatts=1 AND i.indnatts=1 AND i.indkey\[0\]=a.attnum/);
   return {rows:verifiedKey?[{keyColumn:'id',keyType}]:[]};
  }
  if(sql.includes('AS "upperKey"')){
   calls.push('segment');
   assert.match(sql,/SELECT "id" FROM ONLY "public"."chanjet_read_snapshots"[\s\S]*ORDER BY "id" OFFSET 128 LIMIT 1\) AS upper_key/);
   assert.match(sql,/boundary\.upper_key::text AS "upperKey"/);
   assert.match(sql,/WHERE boundary\.upper_key IS NOT NULL AND "id"<boundary\.upper_key/);
   assert.match(sql,/UNION ALL \(SELECT [\s\S]*WHERE boundary\.upper_key IS NULL/);
   const lower=parameters[0]??null;
   const tail=keys.filter(row=>lower===null||BigInt(row.id)>=BigInt(lower));
   const actual=tail[128]?.id??null,replacement=override('boundary',actual,lower);
   const upper=replacement===undefined?actual:replacement;
   assert.match(sql,/SELECT "id","payload_hash","raw_payload" FROM ONLY "public"."chanjet_read_snapshots"/);
   assert.match(sql,/ORDER BY "id" LIMIT 129/);
   assert.match(sql,/sha256\(convert_to\(to_jsonb\(phoenix_original_row\)::text,'UTF8'\)\)/);
   assert.deepEqual(parameters,lower===null?[]:[lower]);
   const range=tail.filter(row=>upper===null||BigInt(row.id)<BigInt(upper)).slice(0,129);
   const segment={upperKey:upper,hasUpper:upper!==null,rows:range.length,startsAtLower:lower===null||range[0]?.id===lower,
    sha256:range.length?digest(range.map(row=>digest(JSON.stringify(row))).sort().join('')):null};
   return {rows:override('digest',segment,lower)??[segment]};
  }
  if(sql===modernSchemaTableFactsSql(table)){
   calls.push('complete scan');
   assert.doesNotMatch(sql,/FROM ONLY/);
   return {rows:[data.length?block(0,data.length,sha('a'),data.length):block(null,null,null,0)]};
  }
  assert.fail('Unexpected facts query');
 }};
}

test('Chanjet facts are deterministic across row order and cover exact, partial and empty segments',async()=>{
 const observations=[];
 for(const count of [0,128,129,257]){
  const data=mirrorRows(count);
  const client=snapshotClient(data);
  const facts=await captureModernSchemaFacts(client);
  assert.equal(facts.tables[0].rows,count);
  assert.equal(client.calls.filter(call=>call==='segment').length,Math.max(1,Math.ceil(count/128)));
  assert.deepEqual(client.calls.slice(0,4),['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','limits','locked key','segment']);
  assert.equal(client.calls.at(-1),'ROLLBACK');
  assert.deepEqual(facts,await captureModernSchemaFacts(snapshotClient(data.reverse()),{projection:facts}));
  assert.deepEqual(Object.keys(facts.tables[0]).sort(),['columns','kind','rows','schema','sha256','table']);
  observations.push(facts.businessDataSha256);
 }
 assert.equal(new Set(observations).size,observations.length);
 const data=mirrorRows(257);
 const original=await captureModernSchemaFacts(snapshotClient(data));
 data[128].raw_payload.body='changed with the same payload_hash';
 assert.notEqual((await captureModernSchemaFacts(snapshotClient(data))).businessDataSha256,original.businessDataSha256);
});

test('Chanjet facts reject malformed, skipped and repeated ranges and roll back',async()=>{
 const data=mirrorRows(257),badRange=/MODERN_SCHEMA_FACTS_HOLD=NATIVE_TABLE_SEGMENT_REQUIRED/;
 for(const override of [
  (step,value,lower)=>step==='boundary'&&lower===null?data[129].id:undefined,
  (step,value,lower)=>step==='boundary'&&lower===null?data[127].id:undefined,
  (step)=>step==='boundary'?null:undefined,
  (step,value,lower)=>step==='boundary'&&lower!==null?lower:undefined,
  (step,value,lower)=>step==='boundary'&&lower!==null?String(BigInt(lower)-1n):undefined,
  (step)=>step==='boundary'?'9223372036854775808':undefined,
  (step)=>step==='boundary'?'-0':undefined,
  (step,value)=>step==='digest'?[{...value,upperKey:null}]:undefined,
  (step,value)=>step==='digest'?[value,value]:undefined,
  (step,value,lower)=>step==='digest'&&lower!==null?[{...value,startsAtLower:false}]:undefined,
  (step,value,lower)=>step==='digest'&&lower!==null?[{...value,rows:0,sha256:null}]:undefined,
  (step,value)=>step==='digest'?[{...value,sha256:sha('A')}]:undefined,
 ]){
  const client=snapshotClient(data,{override});
  await assert.rejects(captureModernSchemaFacts(client),badRange);
  assert.equal(client.calls.at(-1),'ROLLBACK');
 }
});

test('unverified keys and unsupported relations fall back to the complete scan',async()=>{
 for(const options of [{verifiedKey:false},{table:{...snapshotTable,kind:'p'}},
  {table:{...snapshotTable,columns:['raw_payload']}}]){
  const client=snapshotClient(mirrorRows(1),options);
  const facts=await captureModernSchemaFacts(client);
  assert.equal(facts.tables[0].rows,1);
  assert.equal(client.calls[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(client.calls.at(-1),'ROLLBACK');
  assert.deepEqual(client.calls.slice(2,-1),options.table?.kind==='p'?['complete scan']:['locked key','complete scan']);
 }
});

test('an unverified relation lock fails and standalone capture rolls back',async()=>{
 const standalone=snapshotClient(mirrorRows(1),{lockError:Error('fixture lock timeout')});
 await assert.rejects(captureModernSchemaFacts(standalone),/fixture lock timeout/);
 assert.deepEqual(standalone.calls,['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','limits','locked key','ROLLBACK']);
 const client=snapshotClient(mirrorRows(1),{lockError:Error('fixture lock timeout')});
 await assert.rejects(captureModernSchemaFacts(client,{withinSnapshot:true}),/fixture lock timeout/);
 assert.deepEqual(client.calls,['limits','locked key']);
});

test('sequence facts batch exact names without persisting the transport ordinals',async()=>{
 const sequences=Array.from({length:65},(_,index)=>({schema:'public',name:'test_seq_'+index,ownerSchema:null,ownerTable:null}));
 const client=snapshotClient([],{sequences});
 const facts=await captureModernSchemaFacts(client);
 assert.equal(client.calls.filter(call=>call==='sequence batch').length,3);
 assert.deepEqual(facts.sequences.map(({name})=>name),sequences.map(({name})=>name));
 assert.ok(facts.sequences.every(sequence=>!Object.hasOwn(sequence,'sequenceIndex')));
 for(const sequenceResult of [rows=>rows.slice(1),rows=>rows.reverse(),rows=>[rows[0],...rows.slice(0,-1)],
  rows=>[{...rows[0],lastValue:42},...rows.slice(1)],rows=>[{...rows[0],isCalled:'true'},...rows.slice(1)]]){
  await assert.rejects(captureModernSchemaFacts(snapshotClient([],{sequences,sequenceResult})),/EXACT_SEQUENCE_STATE_REQUIRED/);
 }
 const absent={...facts,sequences:[{schema:'other',name:'missing'}]};
 await assert.rejects(captureModernSchemaFacts(snapshotClient([],{sequences}),{projection:absent}),/ORIGINAL_SEQUENCE_REMOVED/);
});
