import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {collectMaintenanceDatabaseSnapshot,discoverMaintenanceDatabaseIdentity,validateDatabaseObservation,DATABASE_IDENTITY_SQL,DATABASE_OBSERVATION_SQL,DATABASE_OBSERVATION_SQL_SHA256,DATABASE_OBSERVATION_PSQL} from './production-maintenance-database-observer.mjs';
import {validateDatabaseQuiescence} from './production-maintenance-runtime.mjs';
const at='2026-10-18T07:40:00.000Z';
const binding={containerId:'a'.repeat(64),imageId:'sha256:'+'b'.repeat(64),containerStartedAt:at,postmasterStartedAt:at,clusterSystemIdentifier:'1234567890',databaseOid:16384,previousFloorSha:'c'.repeat(40),targetSha:'d'.repeat(40)};
const zero=()=>({sampledAt:at,postmasterStartedAt:at,clusterSystemIdentifier:'1234567890',databaseOid:16384,serverVersionNum:160014,statsVisibilityComplete:true,currentDatabaseClientSessions:0,otherDatabaseClientSessions:0,clientSessionsWithOpenTransaction:0,idleInTransactionSessions:0,currentDatabasePreparedTransactions:0,otherDatabasePreparedTransactions:0});
const interval={startedAt:at,finishedAt:at};
const pin=()=>[binding.containerId,binding.imageId,binding.containerStartedAt,true,'healthy'].map(JSON.stringify).join('\t');
test('root identity preserves actual microseconds and verifies original runtime before and after the bounded read',()=>{
  const runtime={containerId:binding.containerId,imageId:binding.imageId,containerStartedAt:binding.containerStartedAt};
  const identity={databaseOid:binding.databaseOid,postmasterStartedAt:'2026-10-18T07:40:00.123456Z',clusterSystemIdentifier:binding.clusterSystemIdentifier};
  const trace=[];
  const value=discoverMaintenanceDatabaseIdentity(runtime,{guard:()=>trace.push('guard'),run:(args,input)=>{
    trace.push(args[0]);if(args[0]==='inspect')return pin();
    assert.deepEqual(args,['exec','-i',runtime.containerId,'/bin/sh','-c',DATABASE_OBSERVATION_PSQL]);assert.equal(input,DATABASE_IDENTITY_SQL);return JSON.stringify(identity);
  }});
  assert.deepEqual(trace,['guard','inspect','exec','guard','inspect']);assert.deepEqual(value,{...runtime,...identity});
  for(const delta of [{postmasterStartedAt:at},{databaseOid:0},{clusterSystemIdentifier:'unknown'},{ownershipComplete:true}]){
    assert.throws(()=>discoverMaintenanceDatabaseIdentity(runtime,{guard:()=>{},run:args=>args[0]==='inspect'?pin():JSON.stringify({...identity,...delta})}),/DATABASE_IDENTITY_FIELDS/);
  }
  let reads=0;
  assert.throws(()=>discoverMaintenanceDatabaseIdentity(runtime,{guard:()=>{},run:args=>args[0]==='inspect'?(++reads===1?pin():pin().replace('healthy','unhealthy')):JSON.stringify(identity)}),/DATABASE_RUNTIME_DRIFT/);
  assert.throws(()=>discoverMaintenanceDatabaseIdentity({...runtime,sql:'SELECT 1'}),/EXACT_DATABASE_RUNTIME_PIN_REQUIRED/);
});
test('zero aggregate snapshot cannot satisfy database quiescence or grant any admission',()=>{
  const snapshot=validateDatabaseObservation(zero(),binding,interval);
  assert.equal(snapshot.result,'HOLD');assert.equal(snapshot.ownershipComplete,false);assert.equal(snapshot.persistentRunning,null);assert.equal(snapshot.persistentQueued,null);
  for(const key of ['continuousDrainProof','reconciliationApproved','productionMutation','admissionOrApprovalGranted'])assert.equal(snapshot[key],false);
  assert.throws(()=>validateDatabaseQuiescence(snapshot),/DATABASE_OR_PERSISTENT_WORK_REMAINS/);
  assert.ok(snapshot.reasons.includes('EXTERNAL_EFFECT_RECONCILIATION_UNVERIFIED'));
});
test('idle client, prepared transactions in either database, and hidden stats remain visible HOLD findings',()=>{
  for(const delta of [{currentDatabaseClientSessions:1},{otherDatabaseClientSessions:1},{currentDatabasePreparedTransactions:1},{otherDatabasePreparedTransactions:1}]){
    const result=validateDatabaseObservation({...zero(),...delta},binding,interval);assert.equal(result.result,'HOLD');assert.ok(result.reasons.includes('DATABASE_WORK_OBSERVED'));
  }
  const result=validateDatabaseObservation({...zero(),statsVisibilityComplete:false},binding,interval);assert.ok(result.reasons.includes('STATS_VISIBILITY_INCOMPLETE'));
});
test('unknown fields, malformed counts, wrong database, stale/future samples and arbitrary binding never become receipts',()=>{
  for(const delta of [{postmasterStartedAt:'2026-10-18T07:39:00.000Z'},{clusterSystemIdentifier:'999'}, {query:'SECRET_SQL_SENTINEL'},{databaseOid:99},{currentDatabaseClientSessions:-1},{currentDatabaseClientSessions:'0'},{statsVisibilityComplete:'true'},{sampledAt:'2026-10-18T07:30:00.000Z'},{sampledAt:'2026-10-18T07:50:00.000Z'},{clientSessionsWithOpenTransaction:1}])assert.throws(()=>validateDatabaseObservation({...zero(),...delta},binding,interval),e=>!e.message.includes('SECRET_SQL_SENTINEL'));
  assert.throws(()=>validateDatabaseObservation(zero(),{...binding,connectionString:'SECRET_SQL_SENTINEL'},interval));
  assert.throws(()=>validateDatabaseObservation(zero(),binding,{...interval,finishedAt:'2026-10-18T07:41:00.000Z'}));
});
test('collector checks protected context and exact DB runtime twice and runs only its fixed readonly SQL',()=>{
  const trace=[];const result=collectMaintenanceDatabaseSnapshot(binding,{guard:()=>trace.push('guard'),now:()=>at,run:(args,input)=>{
    trace.push(args[0]);
    if(args[0]==='inspect'){assert.equal(args[1],binding.containerId);assert.equal(input,undefined);assert.ok(!args.join(' ').includes('Config.Env'));return pin();}
    assert.deepEqual(args.slice(0,4),['exec','-i',binding.containerId,'/bin/sh']);assert.equal(args.length,6);assert.equal(input,DATABASE_OBSERVATION_SQL);return JSON.stringify(zero());
  }});
  assert.deepEqual(trace,['guard','inspect','exec','guard','inspect']);assert.equal(result.result,'HOLD');
});
test('guard refusal, DB identity drift, read errors and raw stderr cannot leak or produce a snapshot',()=>{
  let calls=0;assert.throws(()=>collectMaintenanceDatabaseSnapshot(binding,{guard:()=>{throw Error('EXPECTED_GUARD');},run:()=>calls++}),/EXPECTED_GUARD/);assert.equal(calls,0);
  let inspections=0;
  assert.throws(()=>collectMaintenanceDatabaseSnapshot(binding,{guard:()=>{},now:()=>at,run:args=>args[0]==='exec'?JSON.stringify(zero()):++inspections===1?pin():pin().replace('healthy','unhealthy')}),/DATABASE_RUNTIME_DRIFT/);
  assert.throws(()=>collectMaintenanceDatabaseSnapshot(binding,{guard:()=>{},now:()=>at,run:args=>{if(args[0]==='inspect')return pin();throw Error('SECRET_ERROR_SENTINEL');}}),e=>e.message==='MAINTENANCE_DATABASE_HOLD=DATABASE_READ_OR_JSON_FAILED');
  assert.throws(()=>collectMaintenanceDatabaseSnapshot({...binding,sql:'SELECT 1'},{}),/EXACT_DATABASE_BINDING_REQUIRED/);
});
test('query is immutable aggregate-only read SQL, excludes its own session and observes prepared transactions independently',()=>{
  assert.equal(createHash('sha256').update(DATABASE_OBSERVATION_SQL).digest('hex'),DATABASE_OBSERVATION_SQL_SHA256);
  assert.match(DATABASE_OBSERVATION_SQL,/^BEGIN READ ONLY;/);assert.match(DATABASE_OBSERVATION_SQL,/ROLLBACK;\n$/);
  assert.doesNotMatch(DATABASE_OBSERVATION_SQL,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|COPY|ALTER|CREATE|DROP|pg_terminate_backend|pg_cancel_backend)\b/i);
  assert.ok(!/query\s*[,)]|client_addr|application_name|usename/.test(DATABASE_OBSERVATION_SQL));
  assert.match(DATABASE_OBSERVATION_SQL,/pg_prepared_xacts/);assert.match(DATABASE_OBSERVATION_SQL,/pid<>pg_catalog\.pg_backend_pid/);
});

test('conninfo and URI parameters are rejected by the actual shell before psql can execute',()=>{
  for(const delta of [{POSTGRES_DB:'postgresql://unapproved.invalid/db'},{POSTGRES_DB:'host=unapproved.invalid dbname=foo'},{POSTGRES_USER:'foo bar'},{POSTGRES_USER:'-option'},{POSTGRES_DB:'a'.repeat(64)}]){
    const result=spawnSync('/bin/sh',['-c',DATABASE_OBSERVATION_PSQL],{env:{PATH:'/usr/bin:/bin',POSTGRES_USER:'fixture_owner',POSTGRES_DB:'phoenix_erp',...delta},encoding:'utf8',timeout:1000});
    assert.equal(result.status,64);assert.equal(result.stdout,'');assert.equal(result.stderr,'');
  }
  assert.match(DATABASE_OBSERVATION_PSQL,/\/usr\/bin\/env -i/);assert.match(DATABASE_OBSERVATION_PSQL,/--host=\/var\/run\/postgresql --port=5432/);
  assert.match(DATABASE_OBSERVATION_PSQL,/\/usr\/bin\/timeout -s TERM -k 1 8/);assert.match(DATABASE_OBSERVATION_SQL,/SET LOCAL search_path=pg_catalog/);
});
