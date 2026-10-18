import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateDatabaseSql,validateCandidateDatabaseSnapshot,collectCandidateDatabaseSnapshot} from './production-maintenance-candidate-database.mjs';
const at='2026-10-18T10:30:00.000Z';
const binding=()=>({owner:'1234-1',previousFloorSha:'a'.repeat(40),targetSha:'b'.repeat(40),
  database:{containerId:'c'.repeat(64),imageId:'sha256:'+'d'.repeat(64),containerStartedAt:at,postmasterStartedAt:at,clusterSystemIdentifier:'123456789',databaseOid:16384},
  root:{sessionPid:101,backendStartedAt:at},candidate:{sessionPid:102,backendStartedAt:at,bootId:'01234567-0123-4123-8123-0123456789ab'}});
const row=(b,root)=>({pid:b[root?'root':'candidate'].sessionPid,databaseOid:b.database.databaseOid,backendStartedAt:at,
  applicationName:root?`phoenix-maintenance-control:${b.owner}`:`phoenix-fence:${b.candidate.bootId}`,backendType:'client backend'});
const sample=(b=binding())=>({sampledAt:at,postmasterStartedAt:at,clusterSystemIdentifier:b.database.clusterSystemIdentifier,databaseOid:b.database.databaseOid,
  serverVersionNum:180000,statsVisibilityComplete:true,rootBackends:[row(b,true)],candidateBackends:[row(b,false)],
  rootLocks:[1,2].map(key=>({databaseOid:b.database.databaseOid,namespace:17455,key,keyForm:2,mode:'ExclusiveLock',granted:true}))});
const interval={startedAt:at,finishedAt:at};
test('held snapshot binds both server backends and exact locks without creating drain or admission evidence',()=>{
  const b=binding(),s=validateCandidateDatabaseSnapshot(sample(b),b,interval);
  assert.equal(s.result,'ROOT_HELD_SNAPSHOT');
  for(const k of ['continuousDrainProof','clientLifecycleSettlementProved','persistentOwnershipComplete','registryInstalled','admissionOrApprovalGranted','productionMutation'])assert.equal(s[k],false);
  assert.deepEqual(s.binding,b);assert.match(s.querySha256,/^[a-f0-9]{64}$/);
});
test('PID reuse, wrong backend start, duplicate application name and hidden stats fail closed',()=>{
  for(const mutate of [s=>s.rootBackends[0].backendStartedAt='2026-10-18T10:29:00.000Z',s=>s.rootBackends[0].applicationName='unowned',s=>s.rootBackends[0].pid++,
    s=>s.candidateBackends[0].databaseOid++,s=>s.candidateBackends[0].backendType='background worker',s=>s.candidateBackends.push({...s.candidateBackends[0],pid:103}),
    s=>s.rootBackends.push({...s.rootBackends[0],pid:104}),s=>s.statsVisibilityComplete=false]){
    const s=sample();mutate(s);assert.throws(()=>validateCandidateDatabaseSnapshot(s,binding(),interval),/CANDIDATE_DATABASE_HOLD=/);
  }
});
test('both exclusive granted two-integer locks must belong to the expected database and namespace',()=>{
  for(const mutate of [s=>s.rootLocks.pop(),s=>s.rootLocks[0].mode='ShareLock',s=>s.rootLocks[0].granted=false,
    s=>s.rootLocks[0].databaseOid++,s=>s.rootLocks[0].namespace++,s=>s.rootLocks[0].keyForm=1,s=>s.rootLocks.push({...s.rootLocks[0],key:3})]){
    const s=sample();mutate(s);assert.throws(()=>validateCandidateDatabaseSnapshot(s,binding(),interval),/EXCLUSIVE_ROOT_LOCKS_REQUIRED/);
  }
});
test('client exit cannot stand in for root backend absence; released snapshot rejects retained backend or locks',()=>{
  const s=sample();assert.throws(()=>validateCandidateDatabaseSnapshot(s,binding(),{...interval,expectRoot:'RELEASED'}),/ROOT_BACKEND_OR_LOCKS_REMAIN/);
  s.rootBackends=[];assert.throws(()=>validateCandidateDatabaseSnapshot(s,binding(),{...interval,expectRoot:'RELEASED'}),/ROOT_BACKEND_OR_LOCKS_REMAIN/);
  s.rootLocks=[];assert.equal(validateCandidateDatabaseSnapshot(s,binding(),{...interval,expectRoot:'RELEASED'}).result,'ROOT_BACKEND_ABSENT_SNAPSHOT');
  assert.throws(()=>validateCandidateDatabaseSnapshot(s,binding(),interval),/ROOT_BACKEND_NOT_UNIQUE/);
});
test('cluster restart, malformed or stale observation, unknown fields and arbitrary connection inputs are refused',()=>{
  for(const delta of [{clusterSystemIdentifier:'999'},{postmasterStartedAt:'2020-01-01T00:00:00.000Z'},{sampledAt:'2026-10-18T10:20:00.000Z'},
    {sampledAt:'2026-10-18T11:00:00.000Z'},{serverVersionNum:150000},{rootLocks:null},{query:'SECRET_SENTINEL'},{statsVisibilityComplete:'true'}])assert.throws(()=>validateCandidateDatabaseSnapshot({...sample(),...delta},binding(),interval),e=>e.message.startsWith('CANDIDATE_DATABASE_HOLD=')&&!e.message.includes('SECRET_SENTINEL'));
  assert.throws(()=>candidateDatabaseSql({...binding(),connectionString:'SECRET_SENTINEL'}),/EXACT_BINDING_REQUIRED/);
  const b=binding();b.owner="1234-1'; SELECT 1;--";assert.throws(()=>candidateDatabaseSql(b),/EXACT_BINDING_REQUIRED/);
  const c=binding();c.root.sessionPid=c.candidate.sessionPid;assert.throws(()=>candidateDatabaseSql(c),/DISTINCT_BACKENDS_REQUIRED/);
});
test('actual collector pins full container identity and protected context around the fixed readonly query',()=>{
  const b=binding(),calls=[];
  const run=(args,input)=>{calls.push(args[0]);if(args[0]==='inspect'){assert.equal(args[1],b.database.containerId);return [b.database.containerId,b.database.imageId,at,true,'healthy'].map(JSON.stringify).join('\t');}
    assert.equal(args[2],b.database.containerId);assert.equal(args.length,6);assert.equal(input,candidateDatabaseSql(b));return JSON.stringify(sample(b));};
  const result=collectCandidateDatabaseSnapshot(b,{}, {guard:()=>calls.push('guard'),run,now:()=>at});
  assert.deepEqual(calls,['guard','inspect','exec','guard','inspect']);assert.equal(result.result,'ROOT_HELD_SNAPSHOT');
});
test('guard failure, runtime drift and raw subprocess errors never become successful observations',()=>{
  let calls=0;assert.throws(()=>collectCandidateDatabaseSnapshot(binding(),{}, {guard:()=>{throw Error('EXPECTED_GUARD');},run:()=>calls++}),/EXPECTED_GUARD/);assert.equal(calls,0);
  const b=binding();const pin=()=>[b.database.containerId,b.database.imageId,at,true,'healthy'].map(JSON.stringify).join('\t');let n=0;
  assert.throws(()=>collectCandidateDatabaseSnapshot(b,{}, {guard:()=>{},now:()=>at,run:args=>args[0]==='exec'?JSON.stringify(sample(b)):++n===1?pin():pin().replace('healthy','unhealthy')}),/DATABASE_RUNTIME_CHANGED/);
  assert.throws(()=>collectCandidateDatabaseSnapshot(b,{}, {guard:()=>{},now:()=>at,run:args=>{if(args[0]==='inspect')return pin();throw Error('SECRET_SENTINEL');}}),e=>e.message==='CANDIDATE_DATABASE_HOLD=DATABASE_READ_OR_JSON_FAILED');
  assert.throws(()=>collectCandidateDatabaseSnapshot(b,{expectRoot:'ASSUME_RELEASED'},{}),/EXPECTED_ROOT_STATE_REQUIRED/);
});
test('SQL reads only fixed catalogs and contains no lock acquisition, cancellation or business data',()=>{
  const sql=candidateDatabaseSql(binding());assert.match(sql,/^BEGIN READ ONLY;/);assert.match(sql,/ROLLBACK;\n$/);
  assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|COPY|pg_terminate_backend|pg_cancel_backend|pg_advisory_lock|pg_try_advisory_lock)\b/i);
  assert.match(sql,/pg_catalog\.pg_locks/);assert.match(sql,/pid=101 OR application_name='phoenix-maintenance-control:1234-1'/);
  assert.doesNotMatch(sql,/client_addr|query\s*[,)]|usename/);
});
