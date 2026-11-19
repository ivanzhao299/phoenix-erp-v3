import assert from 'node:assert/strict';
import test from 'node:test';
import {foldModernSchemaTableFacts,modernSchemaTableFactsSql} from './production-modern-schema-facts.mjs';
import {ModernSchemaReadClient} from './production-modern-schema-read-client.mjs';

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
