/** Pure and dependency-injected tests for the fixture-only external legacy
 * connection drain protocol. No Docker, PostgreSQL, root or production state
 * is touched; production behaviour with the fixture gate closed must remain
 * exactly zero effects. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fixture,time} from '../ci/maintenance-transition-fixture.mjs';
import {
  captureLegacyExternalIdentity,validateLegacyExternalIdentity,planExternalLegacySessionDrain,
  drainExternalLegacySessions,normalizeExternalSessionRow,cidrContains,legacyExternalIdentityFile,
  EXTERNAL_DRAIN_PSQL,EXTERNAL_SESSION_LISTING_SQL,
} from './production-maintenance-external-drain.mjs';

const networkId='e'.repeat(64);
const CLIENT_IP='172.18.0.4';
function protocol(){
  const f=fixture();
  f.context.networkIsolation={networks:[{id:networkId,name:'phoenix-erp_default',driver:'bridge'}],
    ingressScope:{networkId,bridge:'br-eeeeeeeeeeee',interfaceIndex:7,subnet:'172.18.0.0/16',port:3100},approvedMounts:[]};
  const api=f.context.preSnapshot.api,db=f.context.preSnapshot.db,web=f.context.preSnapshot.web;
  const rawLegacy=(pid,{ip=CLIENT_IP,database='api_bootstrap_fixture',user='erp_candidate_writer',state='idle',openTx=false}={})=>({pid,usename:user,datname:database,
    client_addr:`${ip}/32`,application_name:'',state,backend_type:'client backend',open_transaction:openTx});
  const rawObserver=(pid=90)=>({pid,usename:'erp_fixture_admin',datname:'api_bootstrap_fixture',client_addr:null,
    application_name:'phoenix-maintenance-observer',state:'active',backend_type:'client backend',open_transaction:false});
  const containers=[{id:api.id,ipv4Address:`${CLIENT_IP}/16`},{id:db.id,ipv4Address:'172.18.0.2/16'},{id:web.id,ipv4Address:'172.18.0.3/16'}];
  const identity=captureLegacyExternalIdentity({context:f.context,networkId,containers,
    sessions:[rawLegacy(84),rawLegacy(85)],capturedAt:time(0)});
  const binding={containerId:db.id,imageId:db.imageId,containerStartedAt:db.startedAt,databaseOid:16384};
  return {f,api,db,web,rawLegacy,rawObserver,containers,identity,binding};
}
/** Fake transport: every observable effect is recorded; production guards are
 * injected so the suite needs neither root nor Docker. */
function transport(p,{stopped={},members=null,sessions=null,afterSessions=[],terminate='t',terminateThrows=false}={}){
  const effects={inspects:[],networkInspects:[],listings:0,terminations:[],receipts:[]};
  const stoppedRow=()=>[p.api.id,p.api.imageId,p.api.restartCount,stopped.running??false,stopped.status??'exited',
    stopped.restarting??false,stopped.pid??0,stopped.startedAt??p.api.startedAt,0].map(value=>JSON.stringify(value)).join('\t');
  const networkRow=()=>[networkId,members??{[p.db.id]:{IPv4Address:'172.18.0.2/16'},[p.web.id]:{IPv4Address:'172.18.0.3/16'}}]
    .map(value=>JSON.stringify(value)).join('\t');
  const list=(count)=>JSON.stringify(count===0?[]:(sessions??[p.rawLegacy(84),p.rawObserver()]));
  const run=(args,input)=>{
    if(args[0]==='inspect'&&args[1]===p.api.id){effects.inspects.push(args);return stoppedRow();}
    if(args[0]==='network'){effects.networkInspects.push(args);return networkRow();}
    if(args[0]==='exec'&&input===EXTERNAL_SESSION_LISTING_SQL){effects.listings+=1;
      return JSON.stringify((effects.listings===1?(sessions??[p.rawLegacy(84),p.rawObserver()]):afterSessions));}
    if(args[0]==='exec'&&input&&String(input).startsWith('SELECT pg_terminate_backend(')){
      if(terminateThrows)throw Error('synthetic psql failure');
      effects.terminations.push(input);return terminate;}
    throw Error('UNEXPECTED_FAKE_DOCKER_COMMAND '+JSON.stringify(args));
  };
  const dependencies={run,guard:()=>{},wait:async()=>{},readIdentity:()=>structuredClone(p.identity),
    writeReceipt:receipt=>{effects.receipts.push(structuredClone(receipt));},outputDirectory:'/fixture-only'};
  return {effects,dependencies};
}
const gateEnv={NATIVE_FIXTURE_FLOW:'legacy-first-switch',NATIVE_FIXTURE_HOSTED:'github-hosted-exclusive-vm'};

test('cidr membership handles boundaries and rejects malformed input',()=>{
  assert.equal(cidrContains('172.18.0.0/16','172.18.0.4'),true);
  assert.equal(cidrContains('172.18.0.0/16','172.19.0.4'),false);
  assert.equal(cidrContains('172.18.0.0/32','172.18.0.0'),true);
  assert.equal(cidrContains('0.0.0.0/0','203.0.113.9'),true);
  for(const [subnet,ip] of [['not-a-cidr','172.18.0.4'],['172.18.0.0/16','no-ip'],['172.18.0.0/99','172.18.0.4'],['','172.18.0.4']])
    assert.equal(cidrContains(subnet,ip),false);
});
test('identity capture derives owner from the actual legacy client address only',()=>{
  const p=protocol();
  assert.deepEqual(validateLegacyExternalIdentity(structuredClone(p.identity),p.f.context),p.identity);
  assert.equal(p.identity.clientIp,CLIENT_IP);
  assert.equal(p.identity.database,'api_bootstrap_fixture');
  assert.equal(p.identity.databaseUser,'erp_candidate_writer');
  assert.equal(p.identity.observedSessionCount,2);
  assert.equal(p.identity.productionMutation,false);
});
test('identity capture rejects ambiguous owners, absent sessions and shared addresses',()=>{
  const p=protocol();
  assert.throws(()=>captureLegacyExternalIdentity({context:p.f.context,networkId,containers:p.containers,
    sessions:[p.rawLegacy(84),p.rawLegacy(85,{database:'other_db'})],capturedAt:time(0)}),/OWNER_AMBIGUOUS/);
  assert.throws(()=>captureLegacyExternalIdentity({context:p.f.context,networkId,containers:p.containers,
    sessions:[p.rawObserver()],capturedAt:time(0)}),/LEGACY_SESSIONS_ABSENT/);
  assert.throws(()=>captureLegacyExternalIdentity({context:p.f.context,networkId,
    containers:[...p.containers,{id:'d'.repeat(64),ipv4Address:`${CLIENT_IP}/16`}],sessions:[p.rawLegacy(84)],capturedAt:time(0)}),/NOT_EXCLUSIVE/);
  const wrongNetwork=structuredClone(p.identity);wrongNetwork.networkId='f'.repeat(64);
  assert.throws(()=>validateLegacyExternalIdentity(wrongNetwork,p.f.context),/IDENTITY_NETWORK/);
  const wrongDigest=structuredClone(p.identity);wrongDigest.contextDigest='0'.repeat(64);
  assert.throws(()=>validateLegacyExternalIdentity(wrongDigest,p.f.context),/IDENTITY_BINDING/);
  const wrongPin=structuredClone(p.identity);wrongPin.apiContainer.startedAt=time(-1000);
  assert.throws(()=>validateLegacyExternalIdentity(wrongPin,p.f.context),/IDENTITY_BINDING/);
});
test('identity path is bound to the owner namespace',()=>{
  assert.equal(legacyExternalIdentityFile('/var/lib/phoenix-erp/production-deployment-state','123-4'),
    '/var/lib/phoenix-erp/production-deployment-state/maintenance-legacy-external-identity-123-4.json');
  assert.throws(()=>legacyExternalIdentityFile('/state','not-an-owner'),/EXTERNAL_DRAIN_IDENTITY_PATH/);
});
test('planner matches only the exact stopped legacy address, database and user',()=>{
  const p=protocol();
  const ready=planExternalLegacySessionDrain({identity:p.identity,sessions:[normalizeExternalSessionRow(p.rawLegacy(84))]});
  assert.equal(ready.status,'READY');assert.equal(ready.unknown.length,0);
  for(const variant of [{ip:'172.18.0.9'},{database:'other_db'},{user:'erp_fixture_admin'}]){
    const plan=planExternalLegacySessionDrain({identity:p.identity,sessions:[normalizeExternalSessionRow(p.rawLegacy(84,variant))]});
    assert.equal(plan.status,'HOLD');assert.equal(plan.reason,'UNKNOWN_SESSION_PRESENT');assert.equal(plan.matched.length,0);
  }
});
test('planner excludes protocol-owned observer ghosts but never treats them as targets',()=>{
  const p=protocol();
  const plan=planExternalLegacySessionDrain({identity:p.identity,
    sessions:[normalizeExternalSessionRow(p.rawLegacy(84)),normalizeExternalSessionRow(p.rawObserver())]});
  assert.equal(plan.status,'READY');assert.equal(plan.matched.length,1);assert.equal(plan.unknown.length,0);
  const empty=planExternalLegacySessionDrain({identity:p.identity,sessions:[normalizeExternalSessionRow(p.rawObserver())]});
  assert.equal(empty.status,'EMPTY');
});
test('planner refuses open transactions, non-idle sessions and duplicated pids',()=>{
  const p=protocol();
  assert.equal(planExternalLegacySessionDrain({identity:p.identity,sessions:[normalizeExternalSessionRow(p.rawLegacy(84,{openTx:true}))]}).reason,'MATCHED_SESSION_OPEN_TRANSACTION');
  assert.equal(planExternalLegacySessionDrain({identity:p.identity,sessions:[normalizeExternalSessionRow(p.rawLegacy(84,{state:'active'}))]}).reason,'MATCHED_SESSION_NOT_IDLE');
  assert.throws(()=>planExternalLegacySessionDrain({identity:p.identity,
    sessions:[normalizeExternalSessionRow(p.rawLegacy(84)),normalizeExternalSessionRow(p.rawLegacy(84))]}),/PID_DUPLICATED/);
  assert.throws(()=>planExternalLegacySessionDrain({identity:p.identity,sessions:[{pid:1}]}),/SESSION_LISTING/);
});
test('production gate closed performs zero effects and keeps observation-only behaviour',async()=>{
  const p=protocol(),t=transport(p);
  const result=await drainExternalLegacySessions({context:p.f.context,databaseBinding:p.binding,
    dependencies:t.dependencies,env:{}});
  assert.equal(result.status,'DISABLED');assert.equal(result.attempted,false);
  assert.equal(t.effects.inspects.length+t.effects.networkInspects.length+t.effects.listings+t.effects.terminations.length,0);
});
test('exact stopped identity drains exactly the matched stale session and after count is zero',async()=>{
  const p=protocol(),t=transport(p,{sessions:[p.rawLegacy(84),p.rawObserver()]});
  const result=await drainExternalLegacySessions({context:p.f.context,databaseBinding:p.binding,
    dependencies:t.dependencies,env:gateEnv});
  assert.equal(result.status,'DRAINED');assert.equal(result.attempted,true);
  assert.deepEqual(t.effects.terminations,['SELECT pg_terminate_backend(84) AS terminated;']);
  assert.equal(t.effects.listings,2);
  const receipt=t.effects.receipts.at(-1);
  assert.equal(receipt.fixtureOnly,true);assert.equal(receipt.productionMutation,false);assert.equal(receipt.failureReason,null);
  assert.equal(receipt.beforeCount,1);assert.equal(receipt.afterCount,0);
  assert.equal(receipt.oldRuntimeIdentity.id,p.api.id);assert.equal(receipt.oldRuntimeIdentity.clientIp,CLIENT_IP);
  assert.equal(receipt.oldRuntimeIdentity.databaseUser,'erp_candidate_writer');
  assert.deepEqual(receipt.termination,[{pid:84,clientAddr:CLIENT_IP,usename:'erp_candidate_writer',datname:'api_bootstrap_fixture',terminated:true}]);
  assert.equal(receipt.stoppedConfirmed,true);assert.equal(receipt.addressExclusive,true);
});
test('multiple matched stale sessions are each terminated exactly once',async()=>{
  const p=protocol(),t=transport(p,{sessions:[p.rawLegacy(84),p.rawLegacy(85),p.rawObserver()]});
  const result=await drainExternalLegacySessions({context:p.f.context,databaseBinding:p.binding,
    dependencies:t.dependencies,env:gateEnv});
  assert.equal(result.status,'DRAINED');
  assert.deepEqual(t.effects.terminations,['SELECT pg_terminate_backend(84) AS terminated;','SELECT pg_terminate_backend(85) AS terminated;']);
  assert.equal(t.effects.receipts.at(-1).beforeCount,2);assert.equal(t.effects.receipts.at(-1).afterCount,0);
});
test('a session the planner cannot pin to the stopped identity is an immediate HOLD',async()=>{
  const p=protocol(),t=transport(p,{sessions:[p.rawLegacy(84),p.rawLegacy(97,{ip:'172.18.0.9'})]});
  await assert.rejects(drainExternalLegacySessions({context:p.f.context,databaseBinding:p.binding,
    dependencies:t.dependencies,env:gateEnv}),/EXTERNAL_LEGACY_DRAIN_UNKNOWN_SESSION_PRESENT/);
  assert.equal(t.effects.terminations.length,0);
  const receipt=t.effects.receipts.at(-1);
  assert.equal(receipt.failureReason,'UNKNOWN_SESSION_PRESENT');
  assert.deepEqual(receipt.matchedSessions.map(session=>session.pid),[84]);
});
test('a matched session with an open transaction is never terminated',async()=>{
  const p=protocol(),t=transport(p,{sessions:[p.rawLegacy(84,{openTx:true})]});
  await assert.rejects(drainExternalLegacySessions({context:p.f.context,databaseBinding:p.binding,
    dependencies:t.dependencies,env:gateEnv}),/MATCHED_SESSION_OPEN_TRANSACTION/);
  assert.equal(t.effects.terminations.length,0);
});
test('termination reporting false or failing leaves a HOLD receipt and no pass',async()=>{
  const p=protocol();
  const falseOutcome=transport(p,{terminate:'f'});
  await assert.rejects(drainExternalLegacySessions({context:p.f.context,databaseBinding:p.binding,
    dependencies:falseOutcome.dependencies,env:gateEnv}),/TERMINATION_RETURNED_FALSE/);
  assert.equal(falseOutcome.effects.receipts.at(-1).failureReason,'TERMINATION_RETURNED_FALSE');
  const throwing=transport(p,{terminateThrows:true});
  await assert.rejects(drainExternalLegacySessions({context:p.f.context,databaseBinding:p.binding,
    dependencies:throwing.dependencies,env:gateEnv}),/TERMINATION_COMMAND_FAILED/);
  assert.equal(throwing.effects.receipts.at(-1).failureReason,'TERMINATION_COMMAND_FAILED');
});
test('a surviving or reappearing legacy session after termination is a HOLD, not a pass',async()=>{
  const p=protocol();
  const survivor=transport(p,{afterSessions:[p.rawLegacy(84)]});
  await assert.rejects(drainExternalLegacySessions({context:p.f.context,databaseBinding:p.binding,
    dependencies:survivor.dependencies,env:gateEnv}),/TERMINATION_INEFFECTIVE/);
  const reappeared=transport(p,{afterSessions:[p.rawLegacy(91)]});
  await assert.rejects(drainExternalLegacySessions({context:p.f.context,databaseBinding:p.binding,
    dependencies:reappeared.dependencies,env:gateEnv}),/SESSION_REAPPEARED/);
  const unknownAfter=transport(p,{afterSessions:[p.rawLegacy(97,{ip:'172.18.0.9'})]});
  await assert.rejects(drainExternalLegacySessions({context:p.f.context,databaseBinding:p.binding,
    dependencies:unknownAfter.dependencies,env:gateEnv}),/EXTERNAL_LEGACY_DRAIN_UNKNOWN_SESSION_PRESENT/);
});
test('legacy container restart, reattachment or address reassignment forbids the drain',async()=>{
  const p=protocol();
  for(const [label,options] of [
    ['restart observed',{stopped:{running:true,status:'running',pid:123}}],
    ['restart count bumped',{stopped:{}}],  // handled below by mutation
    ['startedAt changed',{stopped:{startedAt:'2026-10-01T00:00:00.000000000Z'}}],
  ]){
    const t=transport(p,options);
    if(label==='restart count bumped'){const original=t.dependencies.run;
      t.dependencies.run=(args,input)=>args[0]==='inspect'?[p.api.id,p.api.imageId,p.api.restartCount+1,false,'exited',false,0,p.api.startedAt,0].map(v=>JSON.stringify(v)).join('\t'):original(args,input);}
    await assert.rejects(drainExternalLegacySessions({context:p.f.context,databaseBinding:p.binding,
      dependencies:t.dependencies,env:gateEnv}),/LEGACY_RUNTIME_IDENTITY_DRIFT/,label);
    assert.equal(t.effects.terminations.length,0,label);assert.equal(t.effects.listings,0,label);
  }
  const reattached=transport(p,{members:{[p.api.id]:{IPv4Address:'172.18.0.9/16'},[p.db.id]:{IPv4Address:'172.18.0.2/16'}}});
  await assert.rejects(drainExternalLegacySessions({context:p.f.context,databaseBinding:p.binding,
    dependencies:reattached.dependencies,env:gateEnv}),/LEGACY_CONTAINER_REATTACHED/);
  assert.equal(reattached.effects.terminations.length,0);
  const reassigned=transport(p,{members:{[p.db.id]:{IPv4Address:'172.18.0.2/16'},newbie:{IPv4Address:`${CLIENT_IP}/16`}}});
  await assert.rejects(drainExternalLegacySessions({context:p.f.context,databaseBinding:p.binding,
    dependencies:reassigned.dependencies,env:gateEnv}),/LEGACY_ADDRESS_REASSIGNED/);
  assert.equal(reassigned.effects.terminations.length,0);
});
test('an unreadable or drifting identity record or database binding HOLDS before any effect',async()=>{
  const p=protocol();
  const missing=transport(p);missing.dependencies.readIdentity=()=>{throw Error('ENOENT');};
  await assert.rejects(drainExternalLegacySessions({context:p.f.context,databaseBinding:p.binding,
    dependencies:missing.dependencies,env:gateEnv}),/IDENTITY_RECORD_UNREADABLE/);
  assert.equal(missing.effects.inspects.length,0);
  const drifting=transport(p);drifting.dependencies.readIdentity=()=>{const bad=structuredClone(p.identity);bad.apiContainer.id='b'.repeat(64);return bad;};
  await assert.rejects(drainExternalLegacySessions({context:p.f.context,databaseBinding:p.binding,
    dependencies:drifting.dependencies,env:gateEnv}),/IDENTITY_RECORD_INVALID/);
  assert.equal(drifting.effects.inspects.length,0);
  const wrongDatabase=transport(p);
  await assert.rejects(drainExternalLegacySessions({context:p.f.context,
    databaseBinding:{...p.binding,containerId:'c'.repeat(64)},dependencies:wrongDatabase.dependencies,env:gateEnv}),/DATABASE_BINDING_DRIFT/);
  assert.equal(wrongDatabase.effects.inspects.length,0);
});
test('no stale sessions left is EMPTY, not an attempted drain',async()=>{
  const p=protocol(),t=transport(p,{sessions:[p.rawObserver()]});
  const result=await drainExternalLegacySessions({context:p.f.context,databaseBinding:p.binding,
    dependencies:t.dependencies,env:gateEnv});
  assert.equal(result.status,'EMPTY');assert.equal(result.attempted,false);
  assert.equal(t.effects.terminations.length,0);
  assert.equal(t.effects.receipts.at(-1).afterCount,0);
});
test('the receipt output must be bound before any effect can run',async()=>{
  const p=protocol(),t=transport(p);
  await assert.rejects(drainExternalLegacySessions({context:p.f.context,databaseBinding:p.binding,
    dependencies:{...t.dependencies,outputDirectory:null},env:gateEnv}),/RECEIPT_OUTPUT_UNBOUND/);
  assert.equal(t.effects.inspects.length,0);
});
test('the mutation-capable psql wrapper stays distinct from the read-only observer',()=>{
  assert.equal(EXTERNAL_DRAIN_PSQL.includes('phoenix-external-legacy-drain'),true);
  assert.equal(EXTERNAL_DRAIN_PSQL.includes('default_transaction_read_only'),false);
  assert.equal(EXTERNAL_SESSION_LISTING_SQL.includes('pg_terminate_backend'),false);
});
test('root sources invoke the bounded drain inside databaseQuiescence before the final HOLD',()=>{
  const source=fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'production-maintenance-root-sources.mjs'),'utf8');
  const quiescence=source.indexOf('async databaseQuiescence(request){');
  const drainCall=source.indexOf('drainExternalLegacySessions({context,databaseBinding:identity})');
  const finalHold=source.indexOf("Error('MAINTENANCE_HOLD=ROOT_SOURCE_DATABASE_OR_PERSISTENT_WORK_REMAINS')");
  assert.ok(quiescence>=0&&drainCall>quiescence&&finalHold>drainCall);
});
