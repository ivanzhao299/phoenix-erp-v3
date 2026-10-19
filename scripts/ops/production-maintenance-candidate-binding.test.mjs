/** Synthetic transport/catalog races, no real PG/API/production proof. */
import test from 'node:test';import assert from 'node:assert/strict';
import {collectCandidateServerBinding,inspectCandidateStorage,candidateBindingDiagnosticCode} from './production-maintenance-candidate-binding.mjs';
import {candidateBindingFixture} from '../ci/maintenance-candidate-binding-fixture.mjs';
const hold=/CANDIDATE_BINDING_HOLD=/;
async function using(action){const f=await candidateBindingFixture();try{return await action(f);}finally{await f.lease.close().catch(()=>{});assert.equal(f.closed,true);}}
test('PRE_ADOPTION correlates exact original root, candidate raw identity and empty public projection without creating authority',()=>using(async f=>{
  const count=f.records.size,r=await collectCandidateServerBinding(f.request,f.dependencies);
  assert.equal(r.result,'OBSERVATION_ONLY');assert.equal(r.mode,'PRE_ADOPTION');assert.equal(r.database.binding.candidate.backendStartedAt,f.status.controlSession.backendStartedAtUs);
  assert.equal(r.projection.generation,1);assert.equal(r.status.controlSession.cleanup.debt,true);
  for(const key of ['continuousDrainProof','continuousIngressProof','persistentOwnershipComplete','registryInstalled','admissionOrApprovalGranted','productionMutation'])assert.equal(r[key],false);
  assert.equal(f.records.size,count);assert.equal(f.closed,false);assert.ok(f.calls.every(args=>!args.some(x=>['stop','start','restart','rm','kill','up','down','run'].includes(x))));
}));
test('ADOPTED requires the exact private/public candidate and current owner generation',()=>using(async f=>{
  f.adopt();const r=await collectCandidateServerBinding(f.request,f.dependencies);assert.equal(r.mode,'ADOPTED');assert.equal(r.projection.generation,2);assert.ok(r.projection.modernSha256);
}));
for(const [name,mutate]of [
  ['recreated same-image container',f=>f.runtime.Id='b'.repeat(64)],['runtime start drift',f=>f.runtime.State.StartedAt=new Date().toISOString()],['restart',f=>f.runtime.RestartCount=1],
  ['wrong compose project',f=>f.runtime.Labels['com.docker.compose.project']='phoenix-other'],['host PID namespace',f=>f.runtime.HostConfig.PidMode='host'],
  ['host network',f=>f.runtime.HostConfig.NetworkMode='host'],['privileged',f=>f.runtime.HostConfig.Privileged=true],['restart enabled',f=>f.runtime.HostConfig.RestartPolicy.Name='always'],
  ['SYS_ADMIN capability',f=>f.runtime.HostConfig.CapAdd=['SYS_ADMIN']],['device',f=>f.runtime.HostConfig.Devices=[{}]],['device request',f=>f.runtime.HostConfig.DeviceRequests=[{}]],
  ['unconfined security',f=>f.runtime.HostConfig.SecurityOpt=['seccomp=unconfined']],
  ['writable projection',f=>f.runtime.Mounts[0].RW=true],['wrong host source',f=>f.runtime.Mounts[0].Source='/tmp/other'],
  ['child file shadow',f=>f.runtime.Mounts.push({...f.runtime.Mounts[0],Destination:'/run/phoenix-background-control/manifest.json'})],
  ['ancestor shadow',f=>f.runtime.Mounts.push({...f.runtime.Mounts[0],Destination:'/run'})],
  ['writable control alias',f=>f.runtime.Mounts.push({...f.runtime.Mounts[0],Destination:'/tmp/control-alias',RW:true})],
  ['docker socket',f=>f.runtime.Mounts.push({Type:'bind',Source:'/var/run/docker.sock',Destination:'/var/run/docker.sock',RW:true,Propagation:'rprivate'})],
  ['unapproved uploads alias',f=>f.runtime.Mounts[1].Source='/var/lib'],['floor target drift',f=>f.floor.floorSha='c'.repeat(40)],
  ['floor and mount agree on host socket',f=>f.runtime.Mounts[1].Source=f.floor.operationalTuple.PHOENIX_UPLOADS_DIR='/var/run/docker.sock'],
  ['floor and mount agree on host root',f=>f.runtime.Mounts[1].Source=f.floor.operationalTuple.PHOENIX_UPLOADS_DIR='/'],
  ['floor and mount agree on database',f=>f.runtime.Mounts[1].Source=f.floor.operationalTuple.PHOENIX_UPLOADS_DIR=f.floor.operationalTuple.PHOENIX_PG_DATA_DIR],
  ['floor and mount agree on database ancestor',f=>f.runtime.Mounts[1].Source=f.floor.operationalTuple.PHOENIX_UPLOADS_DIR='/data/owned-fixture'],
  ['wrong floor project',f=>f.floor.project='phoenix-other'],['missing full storage tuple',f=>delete f.floor.operationalTuple.PHOENIX_PG_DATA_DIR],
  ['disabled storage guard',f=>f.floor.operationalTuple.PHOENIX_DATA_MOUNT_GUARD='false'],['unexpected tuple field',f=>f.floor.operationalTuple.extra='ignored'],
  ['missing native US',f=>delete f.status.controlSession.backendStartedAtUs],['pending query',f=>f.status.controlSession.cleanup.queriesPending=1],
  ['retirement',f=>f.status.controlSession.cleanup.retirementPending=true],['fake no-resource debt',f=>f.status.controlSession.cleanup.debt=false],
  ['task graph',f=>f.status.taskGraphs=1],['poison',f=>f.status.poisoned=true],['stopping',f=>f.status.stopping=true],
  ['OPEN status',f=>f.status.phase='OPEN'],['different generation',f=>f.status.generation=2],['different owner',f=>f.status.owner='other'],
  ['private owner drift',f=>f.projection.bootstrap.owner='other'],['private state mismatch',f=>f.state.stateDigest='a'.repeat(64)]
])test('rejects '+name,()=>using(async f=>{mutate(f);await assert.rejects(collectCandidateServerBinding(f.request,f.dependencies),hold);}));
test('structurally valid caller tombstone for another actual candidate cannot replace the current formal receipt',()=>using(async f=>{
  f.forgeReplacement('b'.repeat(64));await assert.rejects(collectCandidateServerBinding(f.request,f.dependencies),/CURRENT_CHAIN_REPLACEMENT_REQUIRED/);assert.equal(f.calls.length,0);
}));
test('missing formal replacement and wrong recorded candidate binding fail closed',()=>using(async f=>{
  const replacementRef=f.state.receipts.pop();await assert.rejects(collectCandidateServerBinding(f.request,f.dependencies),/UNIQUE_FORMAL_RECEIPT_REQUIRED/);f.state.receipts.push(replacementRef);
  f.adopt();const ref=f.state.receipts.at(-1),row=f.receiptRows.get(ref.digest);row.payload.body.controlSession.backendStartedAtUs='2026-10-18T00:00:00.000001Z';
  await assert.rejects(collectCandidateServerBinding(f.request,f.dependencies),hold);
}));
test('same PID/MS but distinct raw US catalog identity is rejected',()=>using(async f=>{
  f.catalog(v=>({...v,candidateBackends:[{...v.candidateBackends[0],backendStartedAt:v.candidateBackends[0].backendStartedAt.replace('456Z','457Z')}]}));
  await assert.rejects(collectCandidateServerBinding(f.request,f.dependencies),hold);
}));
test('duplicate application name and missing root lock cannot be promoted into an observation',()=>using(async f=>{
  f.catalog(v=>({...v,candidateBackends:[...v.candidateBackends,{...v.candidateBackends[0],pid:1234}]}));await assert.rejects(collectCandidateServerBinding(f.request,f.dependencies),hold);
  f.catalog(v=>({...v,rootLocks:v.rootLocks.slice(0,1)}));await assert.rejects(collectCandidateServerBinding(f.request,f.dependencies),hold);
}));
test('runtime drift between status samples invalidates the whole collection',()=>using(async f=>{
  let statuses=0;f.hook(args=>{if(args[2]==='node'&&++statuses===2)f.status.bootId='11234567-0123-4123-8123-0123456789ab';});
  await assert.rejects(collectCandidateServerBinding(f.request,f.dependencies),hold);assert.equal(f.closed,false);
}));
test('wrong mode and incomplete adopted binding never reach production IO',()=>using(async f=>{
  await assert.rejects(collectCandidateServerBinding({...f.request,mode:'ASSUME_APPROVED'},f.dependencies),hold);
  await assert.rejects(collectCandidateServerBinding({...f.request,mode:'ADOPTED'},f.dependencies),hold);assert.equal(f.calls.length,0);
}));
test('abort and elapsed absolute deadline prevent later IO without releasing the held root resource',()=>using(async f=>{
  const controller=new AbortController();controller.abort();await assert.rejects(collectCandidateServerBinding({...f.request,signal:controller.signal},f.dependencies),hold);assert.equal(f.calls.length,0);
  f.dependencies.monotonicNow=()=>0;f.lease.monotonicNow=()=>0;
  f.hook(()=>f.advance(11));await assert.rejects(collectCandidateServerBinding({...f.request,timeoutMs:10},f.dependencies),hold);assert.equal(f.calls.length,1);assert.equal(f.closed,false);
}));
test('unclassified IO errors are redacted and cannot become successful receipts',()=>using(async f=>{
  f.hook(()=>{throw Error('SECRET_SENTINEL');});await assert.rejects(collectCandidateServerBinding(f.request,f.dependencies),e=>/^CANDIDATE_BINDING_HOLD=[A-Z_]+$/.test(e.message)&&!e.message.includes('SECRET_SENTINEL'));
}));
test('control cleanup failures preserve strict rejection with private closed diagnostics',()=>using(async f=>{
 const original=structuredClone(f.status.controlSession.cleanup);
 for(const [field,value,diagnostic]of [['queriesPending',1,'QUERY_PENDING'],['acquirePending',true,'ACQUIRE_PENDING'],['debt',false,'DEBT_INVALID'],['retirementPending',true,'RETIREMENT_PENDING'],['terminationConfirmed',true,'TERMINATED'],['releaseConfirmed',true,'RELEASED']]){
  f.status.controlSession.cleanup={...original,[field]:value};
  await assert.rejects(collectCandidateServerBinding(f.request,f.dependencies),error=>error.message==='CANDIDATE_BINDING_HOLD=UNSETTLED_OR_INVALID_CONTROL_RESOURCE'&&candidateBindingDiagnosticCode(error)==='CANDIDATE_CONTROL_CLEANUP_'+diagnostic);
 }
 f.status.controlSession.cleanup={...original,secretField:'NEVER_EXPORT_SECRET'};
 await assert.rejects(collectCandidateServerBinding(f.request,f.dependencies),error=>candidateBindingDiagnosticCode(error)==='CANDIDATE_CONTROL_CLEANUP_SHAPE_INVALID'&&!error.message.includes('NEVER_EXPORT'));
}));
test('candidate wall clock freeze cannot extend the shared monotonic budget across synchronous IO',()=>using(async f=>{
  let elapsed=0;f.dependencies.monotonicNow=()=>elapsed;f.lease.monotonicNow=()=>0;f.hook(()=>{elapsed=11;});
  await assert.rejects(collectCandidateServerBinding({...f.request,timeoutMs:10},f.dependencies),/DEADLINE_OR_ABORT/);assert.equal(f.calls.length,1);assert.equal(f.closed,false);
}));
test('candidate wall rollback above start prevents the next read without releasing the held root',()=>using(async f=>{
  let wall=f.now;f.dependencies.now=()=>wall;f.hook(()=>{wall+=2;});
  f.dependencies.readFloor=()=>{wall-=1;return structuredClone(f.floor);};
  // The second floor read rolls back from a later accepted sample, not below start.
  let count=0;const read=f.dependencies.readFloor;f.dependencies.readFloor=()=>{if(++count===1)return structuredClone(f.floor);return read();};
  await assert.rejects(collectCandidateServerBinding(f.request,f.dependencies),/DEADLINE_OR_ABORT/);assert.equal(f.closed,false);
}));
test('candidate rejects nonfinite clock values before observation IO',()=>using(async f=>{
  for(const clock of ['now','monotonicNow'])for(const value of [NaN,Infinity,-Infinity]){
    await assert.rejects(collectCandidateServerBinding(f.request,{...f.dependencies,[clock]:()=>value}),/DEADLINE_OR_ABORT/);
  }assert.equal(f.calls.length,0);assert.equal(f.closed,false);
}));
test('candidate rejects monotonic rollback before any subsequent API read',()=>using(async f=>{
  let mono=0,reads=0;f.dependencies.monotonicNow=()=>mono;f.hook(()=>{mono=++reads===1?20:10;});
  await assert.rejects(collectCandidateServerBinding(f.request,f.dependencies),/DEADLINE_OR_ABORT/);
  assert.equal(f.calls.length,2);assert.equal(f.calls.some(args=>args[2]==='node'),false);assert.equal(f.closed,false);
}));
test('storage checks recheck one absolute budget before any next filesystem or findmnt operation',()=>{
  let left=10;const calls=[];
  const check=()=>{if(left<=0)throw Error('CANDIDATE_BINDING_HOLD=DEADLINE_OR_ABORT');};
  const disk={lstatSync(file){calls.push(['stat',file]);return {isDirectory:()=>true,isSymbolicLink:()=>false};},realpathSync(file){calls.push(['real',file]);return file;}};
  assert.throws(()=>inspectCandidateStorage({PHOENIX_PG_DATA_DIR:'/data/pg',PHOENIX_UPLOADS_DIR:'/data/uploads'},{check,remaining:()=>{check();return left;}},
    {fs:disk,execFileSync(bin,args,options){calls.push(['findmnt',args[1]]);assert.equal(options.timeout,10);left=0;return '/data\n';}}),/DEADLINE_OR_ABORT/);
  assert.deepEqual(calls,[['stat','/data'],['real','/data'],['findmnt','/data']]);
});
test('storage symlink and wrong mount are rejected before downstream observations',()=>{
  for(const mode of ['symlink','wrong-mount']){
    const disk={lstatSync:()=>({isDirectory:()=>true,isSymbolicLink:()=>mode==='symlink'}),realpathSync:file=>file};
    assert.throws(()=>inspectCandidateStorage({PHOENIX_PG_DATA_DIR:'/data/pg',PHOENIX_UPLOADS_DIR:'/data/uploads'},
      {check(){},remaining:()=>100},{fs:disk,execFileSync:()=>'/'}),/CANDIDATE_BINDING_HOLD=STORAGE_/);
  }
});

for(const [message,diagnostic] of [
  ['MAINTENANCE_HOLD=ROOT_CONTROL_OPERATION_DEADLINE','MAINTENANCE_HOLD=ROOT_CONTROL_OPERATION_DEADLINE'],
  ['MAINTENANCE_HOLD=RECEIPT_SNAPSHOT_DEADLINE','MAINTENANCE_HOLD=RECEIPT_SNAPSHOT_DEADLINE'],
  ['UNEXPECTED_RAW_SENTINEL_MUST_NOT_ESCAPE',undefined]
])test('opaque collector rejection retains only fixed private category '+String(diagnostic),()=>using(async f=>{
  await assert.rejects(collectCandidateServerBinding({...f.request,mode:'PRE_ADOPTION'},{...f.dependencies,guard(){throw Error(message);}}),error=>{
    assert.equal(error.message,'CANDIDATE_BINDING_HOLD=OBSERVATION_UNVERIFIED');assert.equal(error.diagnosticCode,diagnostic);assert.equal(candidateBindingDiagnosticCode(error),diagnostic);
    assert.equal(candidateBindingDiagnosticCode({diagnosticCode:'ARBITRARY_RAW_SENTINEL'}),undefined);
    assert.equal(JSON.stringify(error).includes(message),false);assert.equal(error.cause,undefined);return true;
  });
}));
