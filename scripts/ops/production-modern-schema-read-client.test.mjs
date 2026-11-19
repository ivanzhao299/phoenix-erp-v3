import test from 'node:test';import assert from 'node:assert/strict';
import {bindModernSchemaReadSql,ModernSchemaReadClient} from './production-modern-schema-read-client.mjs';
test('parameter data including SQL syntax stays hexadecimal text, never executable SQL',()=>{
 const data="x');DELETE FROM inv_batches;--\n\\! injected",query=bindModernSchemaReadSql('SELECT $1::text, $2::text[], $3::int, $4::boolean, $5::text',[data,[data,'safe'],123,true,null]);
 assert.equal(query.includes(data),false);assert.equal(query.includes(Buffer.from(data).toString('hex')),true);assert.ok(query.endsWith('NULL::text'));
 assert.equal(bindModernSchemaReadSql("SELECT '$1;inside', \"$1\", $1 -- $99\n",['safe']).includes("'$1;inside'"),true);
});
test('mutations, transaction downgrades, extra statements, missing params and psql commands are rejected before launch',()=>{
 for(const [sql,parameters]of [['DELETE FROM inv_batches',[]],['BEGIN READ WRITE',[]],['SET default_transaction_read_only=off',[]],['SELECT 1; DROP TABLE inv_batches',[]],['SELECT 1\n\\! echo untrusted',[]],['SELECT $1',[]],['SELECT 1',['unused']],['SELECT $1',[{}]]])
  assert.throws(()=>bindModernSchemaReadSql(sql,parameters),/READ_HOLD=/);
 const client=new ModernSchemaReadClient({spawn:()=>assert.fail('Must not launch'),guard(){}});assert.throws(()=>client.query('TRUNCATE inv_batches'),/READ_HOLD=/);
});
test('array and expanded query limits apply before any SQL is sent',()=>{
 for(const value of [['a'.repeat(65537)],Array(1025).fill('x'),['a'.repeat(40000),'b'.repeat(40000)]])assert.throws(()=>bindModernSchemaReadSql('SELECT $1',[value]),/PARAMETER_TYPE/);
 assert.throws(()=>bindModernSchemaReadSql('SELECT $1,$2,$3',['a'.repeat(65536),'b'.repeat(65536),'c'.repeat(65536)]),/EXPANDED_QUERY_SIZE/);
});
