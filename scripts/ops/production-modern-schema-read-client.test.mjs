import test from 'node:test';import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';import {PassThrough,Writable} from 'node:stream';
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

function clientWithHandshake(row){
 const child=new EventEmitter();
 Object.assign(child,{stdout:new PassThrough(),stderr:new PassThrough(),exitCode:null,signalCode:null});
 let spawnArgs,sql;
 child.stdin=new Writable({
  write(chunk,_encoding,done){
   sql=String(chunk);
   const start=sql.match(/^SELECT '([^']+:START)';/)[1];
   child.stdout.write(start+'\n'+JSON.stringify(row)+'\n'+start.replace(/START$/,'END')+'\n');
   done();
  },
  final(done){
   queueMicrotask(()=>{child.exitCode=0;child.emit('exit',0,null);child.stdout.end();child.stderr.end();});
   done();
  },
 });
 const client=new ModernSchemaReadClient({guard(){},spawn:(_binary,args)=>{spawnArgs=args;return child;}});
 return {client,child,launch:()=>spawnArgs,query:()=>sql};
}

test('readers require native serial planning in addition to protected read-only primary',async()=>{
 const f=clientWithHandshake({readonly:true,primary:true,serial:true});
 try{
  await f.client.start();
  assert.match(f.launch().find(value=>value.startsWith('PGOPTIONS=')),/-c max_parallel_workers_per_gather=0(?: |$)/);
  assert.match(f.launch().find(value=>value.startsWith('PGOPTIONS=')),/-c idle_in_transaction_session_timeout=25000(?: |$)/);
  assert.match(f.query(),/current_setting\('max_parallel_workers_per_gather'\)='0' AS serial/);
  assert.throws(()=>f.client.query('SET LOCAL max_parallel_workers_per_gather=2'),/READ_STATEMENT_REQUIRED/);
  assert.throws(()=>f.client.query("SET idle_in_transaction_session_timeout='90s'"),/READ_STATEMENT_REQUIRED/);
  assert.throws(()=>f.client.query("SET LOCAL idle_in_transaction_session_timeout='0s'"),/READ_STATEMENT_REQUIRED/);
  await f.client.query("SET LOCAL idle_in_transaction_session_timeout='90s'");
  assert.match(f.query(),/\nSET LOCAL idle_in_transaction_session_timeout='90s';\n/);
 }finally{await f.client.close();}
});

test('readers close a transport that cannot prove its native session profile',async()=>{
 for(const [row,expected] of [
  [{readonly:true,primary:true,serial:false},/SERIAL_READ_CHANNEL_REQUIRED/],
  [{readonly:true,primary:true},/SERIAL_READ_CHANNEL_REQUIRED/],
  [{readonly:true,primary:false,serial:true},/PRIMARY_READONLY_CHANNEL_REQUIRED/],
 ]){
  const f=clientWithHandshake(row);
  await assert.rejects(f.client.start(),expected);
  assert.equal(f.child.exitCode,0);
  await assert.rejects(f.client.query('SELECT 1'),/DATABASE_CHANNEL_LOST/);
 }
});
