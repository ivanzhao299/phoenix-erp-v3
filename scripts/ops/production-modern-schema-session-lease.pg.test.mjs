/** Actual owned PG18 sessions, advisory locks and backend microsecond pins. */
import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {execFileSync,spawn} from 'node:child_process';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
import {MODERN_SCHEMA_LEASE_SQL,parseModernSchemaLease,originalModernSchemaSessionPredicate,assertModernSchemaLeaseStillOriginal,ModernSchemaControlSession,pinOriginalModernSchemaSession} from './production-modern-schema-session-lease.mjs';
test('new PostgreSQL session or missing original key cannot inherit a real dual-lock release lease',{skip:process.env.MODERN_SCHEMA_LEASE_PG!=='1'},async()=>{
 const labels=JSON.parse(execFileSync('/usr/bin/docker',['inspect','phoenix-temp-reversal-20261118','--format','{{json .Config.Labels}}'],{encoding:'utf8'}));assert.equal(labels['phoenix.fixture'],'temp-reversal');
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),{Client}=createRequire(path.join(root,'apps/api/package.json'))('pg');
 const open=async()=>{const c=new Client({host:'127.0.0.1',port:44889,user:'postgres',database:'modern_schema_fixed_scope_20261119'});await c.connect();return c;};
 const original=await open(),observer=await open();let successor;
 const observe=async()=>JSON.parse((await observer.query(MODERN_SCHEMA_LEASE_SQL)).rows[0].jsonb_build_object);
 const check=async(client,sql)=>Object.values((await client.query(sql)).rows[0])[0];
 try{
  await original.query('SELECT pg_advisory_lock(17455,1),pg_advisory_lock(17455,2)');
  const first=parseModernSchemaLease(await observe());assert.equal(await check(original,originalModernSchemaSessionPredicate(first)),true);
  assert.equal(await check(observer,originalModernSchemaSessionPredicate(first)),false);
  await original.query('SELECT pg_advisory_unlock(17455,2)');const missing=await observe();assert.throws(()=>parseModernSchemaLease(missing),/DUAL_LOCK_SESSION/);
  await original.query('SELECT pg_advisory_lock(17455,2)');const reacquired=parseModernSchemaLease(await observe());assert.deepEqual(reacquired,first);
  await original.end();successor=await open();await successor.query('SELECT pg_advisory_lock(17455,1),pg_advisory_lock(17455,2)');
  const replacement=await observe();assert.notEqual(replacement.holders[0].sessionPid,first.sessionPid);
  assert.throws(()=>assertModernSchemaLeaseStillOriginal(first,{read:()=>replacement}),/ORIGINAL_SESSION_LOST_OR_REPLACED/);
  assert.equal(await check(successor,originalModernSchemaSessionPredicate(first)),false);
 }finally{await original.end().catch(()=>{});if(successor)await successor.end();await observer.end();}
});
test('actual modern sealed psql adapter refuses early unlock and same-backend reacquisition',{skip:process.env.MODERN_SCHEMA_LEASE_PG!=='1'},async()=>{
 const container='phoenix-temp-reversal-20261118',database='modern_schema_fixed_scope_20261119';
 const labels=JSON.parse(execFileSync('/usr/bin/docker',['inspect',container,'--format','{{json .Config.Labels}}'],{encoding:'utf8'}));assert.equal(labels['phoenix.fixture'],'temp-reversal');
 let closing=false;const session=new ModernSchemaControlSession({}, {isClosing:()=>closing,spawn:(binary,args,options)=>{
  const actual=[...args];actual[actual.indexOf('phoenix-v3-db')]=container;actual[actual.length-1]=actual.at(-1).replace('"$POSTGRES_USER"','postgres').replace('"$POSTGRES_DB"',database);return spawn(binary,actual,options);
 }});
 const read=sql=>JSON.parse(execFileSync('/usr/bin/docker',['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',database],{input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe']}));
 try{
  assert.equal(await session.tryLock(1),true);assert.equal(await session.tryLock(2),true);
  const raw=read(MODERN_SCHEMA_LEASE_SQL),context={databaseIdentitySha256:canonicalDigest({name:raw.name,schema:raw.schema,systemIdentifier:raw.systemIdentifier})};
  const pinned=await pinOriginalModernSchemaSession(session,context,{read});
  await assert.rejects(session.unlock(1),/EARLY_UNLOCK_FORBIDDEN/);await assert.rejects(session.tryLock(1),/REACQUIRE_FORBIDDEN/);
  await assert.rejects(session.query('SELECT pg_advisory_unlock_all();'),/MUTATION_FORBIDDEN/);
  await assert.rejects(session.query('BEGIN READ ONLY;'),/FIXED_CONTROL_READ_REQUIRED/);
  assert.equal(assertModernSchemaLeaseStillOriginal(pinned,{read}),true);
 }finally{closing=true;if(session.connected()){await session.unlock(2).catch(()=>{});await session.unlock(1).catch(()=>{});}await session.close();}
});
