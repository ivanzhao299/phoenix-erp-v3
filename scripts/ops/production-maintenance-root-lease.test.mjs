/** Synthetic transport/catalog race tests; NO PostgreSQL or production proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {RootControlLease,rootPsqlProgram,validateRootDatabaseBinding} from './production-maintenance-root-lease.mjs';
import {rootLeaseFixture} from '../ci/maintenance-root-lease-fixture.mjs';
const manual=/SESSION_CHILDREN_UNVERIFIED_MANUAL_RECOVERY_REQUIRED/;
function fixture(overrides={}) {
  const f=rootLeaseFixture({now:Date.parse('2026-10-18T12:00:00.000Z')});
  let child,closed=false,locks=[],scanChange=x=>x;
  const queries=[];
  const launch=()=>{
    child=spawn(process.execPath,['-e',`let b='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>{b+=s;let n;while((n=b.indexOf('\\n'))>=0){b=b.slice(n+1);process.stdout.write('t\\n');}});`],{stdio:['pipe','pipe','pipe']});
    const write=child.stdin.write.bind(child.stdin);child.stdin.write=(sql,...args)=>{queries.push(sql.trim());if(sql.includes('pg_try_advisory_lock'))locks.push(Number(/17455,(\d)/.exec(sql)[1]));return write(sql,...args);};
    child.once('close',()=>{closed=true;locks=[];});return child;
  };
  const run=args=>{
    if(args[0]==='inspect')return [f.database.containerId,f.database.imageId,f.database.containerStartedAt,true,'healthy'].map(JSON.stringify).join('\t');
    const identity={pid:4321,databaseOid:f.database.databaseOid,backendStartedAt:'2026-10-18T11:59:59.123456Z',applicationName:'phoenix-maintenance-control:'+f.context.owner};
    return JSON.stringify(scanChange({sampledAt:new Date(f.now).toISOString(),databaseOid:f.database.databaseOid,postmasterStartedAt:f.database.postmasterStartedAt,clusterSystemIdentifier:f.database.clusterSystemIdentifier,serverVersionNum:180000,statsVisible:true,
      backends:closed?[]:[{...identity,backendType:'client backend'}],locks:closed?[]:locks.map(key=>({pid:identity.pid,databaseOid:identity.databaseOid,namespace:17455,key,keyForm:2,mode:'ExclusiveLock',granted:true}))}));
  };
  const lease=new RootControlLease({...f.options,...overrides.options},{...f.dependencies,spawn:launch,run,...overrides.dependencies});
  return {...f,lease,queries,get child(){return child;},get closed(){return closed;},changeScan(fn){scanChange=fn;}};
}
test('bound root acquires each exclusive key once; repeated observations never reacquire',async()=>{
  const f=fixture();try{
    assert.equal(await f.lease.acquire(),f.lease);await f.lease.observe();await f.lease.observe();
    assert.equal(f.queries.filter(q=>q.includes('pg_try_advisory_lock')).length,2);
    assert.equal(f.lease.initialObservation.candidateProof,false);assert.equal(f.lease.initialObservation.productionReleaseAuthorized,false);
    assert.throws(()=>f.lease.session.query('SELECT 42;'),/FIXED_QUERY_REQUIRED/);
    assert.throws(()=>f.lease.session.query('SELECT pg_try_advisory_lock(17455,1);'),/REENTRANT_LOCK_ATTEMPT/);
    const released=await f.lease.close();assert.equal(released.ownedBackendGone,true);assert.equal(f.closed,true);assert.equal(await f.lease.close(),released);
  }finally{await f.lease.close().catch(()=>{});}
});
test('binding copies are immutable and malformed microsecond or owner bindings reject',()=>{
  const f=fixture();f.context.owner='bad';assert.equal(f.lease.context.owner,'23456789-1');assert.throws(()=>{f.lease.context.owner='bad';},TypeError);
  assert.throws(()=>validateRootDatabaseBinding({...f.database,postmasterStartedAt:'2026-10-18T00:00:00.000Z'},f.lease.context),/EXACT_DATABASE_BINDING/);
  assert.throws(()=>rootPsqlProgram('1; SELECT'),/OWNER_REQUIRED/);
});
test('guard and authority rejection create no launch record or child',async()=>{
  for(const dependencies of [{guard(){throw Error('GUARD_DENIED');}},{admit:async()=>{throw Error('AUTHORITY_DENIED');}}]){
    const f=fixture({dependencies});await assert.rejects(f.lease.acquire(),/DENIED/);assert.equal(f.child,undefined);assert.equal(f.records.size,0);
    await assert.rejects(f.lease.close(),/NOT_STARTED/);assert.equal(f.records.size,0);
  }
});
test('concurrent close while admission is pending prevents any later spawn',async()=>{
  let release;const f=fixture({dependencies:{admit:()=>new Promise(r=>{release=r;})}});
  const acquiring=f.lease.acquire();await assert.rejects(f.lease.close(),/NOT_STARTED/);release(true);
  await assert.rejects(acquiring,/CLOSING/);assert.equal(f.child,undefined);assert.equal(f.records.size,0);
});
test('registration failure after spawn closes saved original child and remains manual HOLD',async()=>{
  const f=fixture({options:{registerOwnedChild(){throw Error('REGISTER_FAILED');}}});
  await assert.rejects(f.lease.acquire(),manual);assert.equal(f.closed,true);assert.equal(f.lease.session.child,null);
  assert.ok([...f.records.values()].some(r=>r.outcome==='MANUAL_RECOVERY_REQUIRED'));assert.equal(f.records.has(f.lease.releaseFile),false);
});
test('abort inside registration cannot leak partially assigned child or certify release',async()=>{
  const abort=new AbortController();const f=fixture({options:{signal:abort.signal,registerOwnedChild(child){abort.abort();return {registered:true,pid:child.pid};}}});
  await assert.rejects(f.lease.acquire(),manual);assert.equal(f.closed,true);assert.equal(f.records.has(f.lease.releaseFile),false);
});
test('missing server receipt still attempts EOF and independent release scan, preserving HOLD',async()=>{
  const f=fixture();const immutable=f.store.immutable;f.store.immutable=(file,value)=>{if(file===f.lease.serverFile)throw Error('OWNED_DISK_FAILURE');immutable(file,value);};
  await assert.rejects(f.lease.acquire(),manual);assert.equal(f.closed,true);assert.equal(f.records.has(f.lease.releaseFile),false);
});
test('record corruption does not prevent cleanup and never becomes verified release',async()=>{
  const f=fixture();await f.lease.acquire();f.records.delete(f.lease.serverFile);
  await assert.rejects(f.lease.close(),manual);assert.equal(f.closed,true);assert.equal(f.records.has(f.lease.releaseFile),false);
});
test('failed observation poisons lease even if later scans would succeed',async()=>{
  const f=fixture();try{await f.lease.acquire();f.changeScan(v=>({...v,statsVisible:false}));await assert.rejects(f.lease.observe(),/DATABASE_IDENTITY_OR_VISIBILITY/);
    f.changeScan(v=>v);await assert.rejects(f.lease.observe(),/LEASE_NOT_HELD/);
  }finally{await f.lease.close();}
});
test('release observation failure remains cached HOLD after later recovery',async()=>{
  const f=fixture();await f.lease.acquire();f.changeScan(v=>({...v,statsVisible:false}));const closing=f.lease.close();await assert.rejects(closing,manual);
  f.changeScan(v=>v);assert.equal(f.lease.close(),closing);await assert.rejects(f.lease.close(),manual);assert.equal(f.records.has(f.lease.releaseFile),false);
});
test('client killed while final acquire scan returns two locks cannot return HELD',async()=>{
  const f=fixture();let killed=false;f.changeScan(v=>{if(v.locks.length===2&&!killed){killed=true;f.child.kill();}return v;});
  await assert.rejects(f.lease.acquire(),/CLIENT_CHANGED_OR_LOST/);assert.equal(killed,true);assert.equal(f.closed,true);assert.equal(f.lease.initialObservation,undefined);
});
test('client killed while final observe scan returns two locks poisons observation',async()=>{
  const f=fixture();await f.lease.acquire();let killed=false;f.changeScan(v=>{if(v.locks.length===2&&!killed){killed=true;f.child.kill();}return v;});
  await assert.rejects(f.lease.observe(),/CLIENT_CHANGED_OR_LOST/);await assert.rejects(f.lease.observe(),/LEASE_NOT_HELD/);await f.lease.close();assert.equal(f.closed,true);
});
test('client reference swapped while original close settles is never closed or certified',async()=>{
  const f=fixture();await f.lease.acquire();let touched=false;
  const other={stdin:{end(){touched=true;}},kill(){touched=true;},exitCode:null,signalCode:null};
  f.child.once('close',()=>{f.lease.session.child=other;});
  await assert.rejects(f.lease.close(),manual);assert.equal(touched,false);assert.equal(f.closed,true);assert.equal(f.records.has(f.lease.releaseFile),false);
});
test('total deadline crossed inside synchronous inspect prevents later catalog IO and poisons lease',async()=>{
  const f=fixture();await f.lease.acquire();let clock=f.now,reads=0,passedTimeout;
  const run=f.lease.run;f.lease.now=()=>clock;f.lease.run=(args,input,options)=>{reads++;passedTimeout=options.timeoutMs;const value=run(args,input);clock+=11;return value;};
  await assert.rejects(f.lease.observe({timeoutMs:10}),/OPERATION_DEADLINE/);assert.equal(reads,1);assert.ok(passedTimeout<=10);
  await assert.rejects(f.lease.observe(),/LEASE_NOT_HELD/);f.lease.run=run;f.lease.now=()=>f.now;await f.lease.close();
});
test('aborted operation does not issue catalog reads or re-acquire admission',async()=>{
  const f=fixture();await f.lease.acquire();const controller=new AbortController();controller.abort();let reads=0;const run=f.lease.run;f.lease.run=(...args)=>{reads++;return run(...args);};
  await assert.rejects(f.lease.observe({signal:controller.signal}),/OPERATION_ABORTED/);assert.equal(reads,0);await f.lease.close();
});
test('concurrent cancelled observation poisons a previously waiting observation',async()=>{
  const f=fixture();await f.lease.acquire();const query=f.lease.session.query.bind(f.lease.session);let resume;
  f.lease.session.query=sql=>new Promise((resolve,reject)=>{resume=()=>query(sql).then(resolve,reject);});
  const first=f.lease.observe();const controller=new AbortController();controller.abort();
  await assert.rejects(f.lease.observe({signal:controller.signal}),/OPERATION_ABORTED/);resume();await assert.rejects(first,/LEASE_NOT_HELD/);
  await f.lease.close();
});
test('cleanup after old window and owner marker archived does not reopen or reacquire',async()=>{
  const f=fixture();await f.lease.acquire();f.archive();f.lease.now=()=>f.now+1200000;
  // Server clock must match the cleanup observation, independently of window.
  f.changeScan(v=>({...v,sampledAt:new Date(f.now+1200000).toISOString()}));
  assert.equal((await f.lease.close()).ownedBackendGone,true);assert.equal(f.queries.filter(q=>q.includes('pg_try_advisory_lock')).length,2);
});
test('fixed shell rejects connection-string-like database identifiers before psql',async()=>{
  const child=spawn('/bin/sh',['-c',rootPsqlProgram('23456789-1')],{env:{POSTGRES_USER:'fixture_owner',POSTGRES_DB:'host=elsewhere'},stdio:['pipe','pipe','pipe']});
  const result=await new Promise(resolve=>child.once('close',code=>resolve(code)));assert.equal(result,64);
});
