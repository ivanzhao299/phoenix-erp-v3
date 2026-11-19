import test from 'node:test';import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';import {PassThrough,Writable} from 'node:stream';
import {ModernSchemaControlSession,verifyOriginalModernSchemaAdmission} from './production-modern-schema-session-lease.mjs';
function fixture(answer=()=>true,isClosing=()=>false){
 const child=new EventEmitter(),sql=[];child.stdout=new PassThrough();child.stderr=new PassThrough();child.exitCode=null;
 child.kill=()=>{child.exitCode=1;queueMicrotask(()=>child.emit('exit',1));};
 child.stdin=new Writable({write(chunk,_encoding,done){const text=String(chunk).trim();sql.push(text);
  if(answer(text)!==false)queueMicrotask(()=>child.stdout.write('t\n'));done();},
 final(done){child.exitCode=0;queueMicrotask(()=>child.emit('exit',0));done();}});
 return {sql,child,session:new ModernSchemaControlSession({commandTimeoutMs:30},{spawn:()=>child,isClosing}),reply:()=>child.stdout.write('t\n')};
}
test('modern observation shares the actual query queue and blocks longer than the unchanged query budget only while idle',async()=>{
 let delayed=false;const f=fixture(sql=>!delayed);await f.session.start();delayed=true;
 try{
  const first=f.session.query('SELECT true;');let observed=false;
  const slot=f.session.withSynchronousObservation(()=>{assert.equal(f.session.pending,null);observed=true;
   Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,70);return 'observed';});
  const next=f.session.query('SELECT true;');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.sql.length,2);assert.equal(observed,false);delayed=false;f.reply();
  assert.deepEqual(await Promise.all([first,slot,next]),[true,'observed',true]);assert.equal(f.sql.length,3);
  assert.equal(f.session.commandTimeoutMs,30);assert.equal(f.session.connected(),true);
 }finally{await f.session.close();}
});
test('a real unanswered original queue command still times out and prevents every queued observation',async()=>{
 let respond=true;const f=fixture(()=>respond);await f.session.start();respond=false;let ran=false;
 const first=f.session.query('SELECT true;'),slot=f.session.withSynchronousObservation(()=>{ran=true;});
 const results=await Promise.allSettled([first,slot]);
 assert.match(results[0].reason.message,/CONTROL_SESSION_TIMEOUT/);assert.match(results[1].reason.message,/ORIGINAL_CONTROL_CHANNEL_NOT_IDLE/);
 assert.equal(ran,false);assert.equal(f.session.connected(),false);await f.session.close();
});
test('closed and originally rejected queues never run a host observation or replace the original failure',async()=>{
 const f=fixture();await f.session.start();await f.session.close();let ran=false;
 await assert.rejects(f.session.withSynchronousObservation(()=>{ran=true;}),/ORIGINAL_CONTROL_CHANNEL_NOT_IDLE/);assert.equal(ran,false);
 const g=fixture();await g.session.start();const original=Error('original queue failure');g.session.queue=Promise.reject(original);
 await assert.rejects(g.session.withSynchronousObservation(()=>{ran=true;}),error=>error===original);assert.equal(ran,false);await g.session.close();
});
test('observation failure is preserved and does not close or replace the original connected S',async()=>{
 const f=fixture();await f.session.start();const original=Error('native census failure');
 await assert.rejects(f.session.withSynchronousObservation(()=>{throw original;}),error=>error===original);
 assert.equal(f.session.child,f.child);assert.equal(await f.session.ping(),true);await f.session.close();
});
test('closing after enqueue or inside the synchronous observation cannot produce an observation result',async()=>{
 let closing=false;const f=fixture(()=>true,()=>closing);await f.session.start();let ran=false;
 const slot=f.session.withSynchronousObservation(()=>{ran=true;});closing=true;
 await assert.rejects(slot,/ORIGINAL_CONTROL_CHANNEL_NOT_IDLE/);assert.equal(ran,false);
 closing=false;await assert.rejects(f.session.withSynchronousObservation(()=>{closing=true;return true;}),/ORIGINAL_CONTROL_CHANNEL_NOT_IDLE/);
 await f.session.close();
});
test('every control reentry is rejected without sending SQL, including nested slots and locks',async()=>{
 const f=fixture();await f.session.start();
 try{
  for(const invoke of [()=>f.session.query('SELECT true;'),()=>f.session.ping(),()=>f.session.start(),()=>f.session.close(),
   ()=>f.session.tryLock(1),()=>f.session.unlock(1),()=>f.session.verifyParticipants([]),()=>f.session.withSynchronousObservation(()=>true)]){
   const before=f.sql.length;let denied;
   await assert.rejects(f.session.withSynchronousObservation(()=>{denied=invoke();return true;}),/OBSERVATION_CONTROL_REENTRY_FORBIDDEN/);
   await assert.rejects(denied,/OBSERVATION_CONTROL_REENTRY_FORBIDDEN/);assert.equal(f.sql.length,before);assert.equal(f.session.connected(),true);
  }
 }finally{await f.session.close();}
});
test('async callbacks and returned promises cannot carry a control operation across await',async()=>{
 const f=fixture();await f.session.start();let entered=false;
 try{
  await assert.rejects(f.session.withSynchronousObservation(async()=>{entered=true;}),/SYNCHRONOUS_OBSERVATION_REQUIRED/);assert.equal(entered,false);
  const before=f.sql.length;let continuation;
  await assert.rejects(f.session.withSynchronousObservation(()=>{
   continuation=Promise.resolve().then(()=>f.session.query('SELECT true;'));return continuation;
  }),/SYNCHRONOUS_OBSERVATION_REQUIRED/);
  await assert.rejects(continuation,/OBSERVATION_CONTROL_REENTRY_FORBIDDEN/);assert.equal(f.sql.length,before);
  assert.equal(await f.session.ping(),true);
 }finally{await f.session.close();}
});
test('the actual admission path rejects approval expiry, revocation and held phase across a queued census',async()=>{
 const lease={database:{databaseOid:123,systemIdentifier:'913442',postmasterStartMicros:'672310'},sessionPid:501,backendStartMicros:'672332'};
 for(const changed of ['EXPIRED','REVOKED','HELD','FATAL']){
  const f=fixture();await f.session.start();let authority='VALID',checks=0,permitted=false;
  try{
   const admission=verifyOriginalModernSchemaAdmission({session:f.session,lease,observeHost:()=>{
    checks++;if(authority!=='VALID')throw Error('CURRENT_AUTHORITY_'+authority);
   }}).then(()=>{permitted=true;});
   const census=f.session.withSynchronousObservation(()=>{authority=changed;});
   await assert.rejects(admission,new RegExp('CURRENT_AUTHORITY_'+changed));await census;
   assert.equal(checks,2);assert.equal(permitted,false);assert.equal(f.session.connected(),true);
   assert.ok(f.sql.at(-1).includes('pg_backend_pid()=501'));
  }finally{await f.session.close();}
 }
});
test('post-query native observation crossing the window cannot return admission',async()=>{
 const f=fixture();await f.session.start();let clock=0,checks=0;
 const lease={database:{databaseOid:123,systemIdentifier:'913442',postmasterStartMicros:'672310'},sessionPid:501,backendStartMicros:'672332'};
 try{
  await assert.rejects(verifyOriginalModernSchemaAdmission({session:f.session,lease,observeHost:()=>{
   if(++checks===2)clock=11; // Native read completes after the ten-unit window.
   if(clock>10)throw Error('FINAL_APPROVAL_EXPIRED');
  }}),/FINAL_APPROVAL_EXPIRED/);
  assert.equal(checks,2);assert.equal(f.session.connected(),true);
 }finally{await f.session.close();}
});
