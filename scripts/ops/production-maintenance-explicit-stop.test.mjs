/** Synthetic guarded transport tests. No Docker, production guard override CLI,
 * human approval, drain or reconciliation is provided by this fixture. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../ci/maintenance-transition-fixture.mjs';
import { canonicalDigest } from './production-maintenance-receipts.mjs';
import { DockerNetworkIsolationProducer } from './production-maintenance-runtime.mjs';
import { MAINTENANCE_OPERATIONS } from './production-maintenance-transition.mjs';
import { TERMINATION_POLICY_SCHEMA } from './production-maintenance-termination-policy.mjs';

function sample({policyPresent=true,approvalPresent=true,allowed=true,stopFailure=false,onAuthorize,onInfrastructure,clock,monotonic,onRead,twoExecutors=false}={}){
  const context=fixture().context,now=Date.parse(context.window.start)+1000;
  const api={...context.preSnapshot.api,pid:123,status:'running',restartPolicy:'no',restarting:false,dead:false,oomKilled:false};
  context.preSnapshot.api=api;context.executors=[api];
  if(twoExecutors)context.executors.push({...api,id:'9'.repeat(64)});
  const network={id:'e'.repeat(64),name:'isolated-test-net',driver:'bridge'};context.networkIsolation={networks:[network],approvedMounts:[]};
  const policy={schema:TERMINATION_POLICY_SCHEMA,protocol:'STOP_AND_RECONCILE',owner:context.owner,targetSha:context.targetSha,window:context.window,
    executors:context.executors.map(p=>Object.fromEntries(['id','imageId','revision','startedAt','restartCount'].map(k=>[k,p[k]]))),
    method:'DOCKER_STOP',stopSignal:'SIGTERM',timeoutSeconds:30,timeoutEscalation:'DOCKER_SIGKILL',commandTimeoutMs:35000,maxAttempts:1,recoveryOperator:'fixture-only'};
  if(policyPresent)context.terminationPolicy=policy;
  const approval={purpose:'MAINTENANCE',payload:{protocol:'STOP_AND_RECONCILE',operations:MAINTENANCE_OPERATIONS,
    ...(approvalPresent?{terminationPolicySha256:canonicalDigest(policy)}:{})}};
  const mutations=[],intents=new Map();let running=true;
  const run=(args)=>{
    onRead?.({args,running});
    if(args[0]==='ps')return[...context.executors.map(p=>p.id),context.preSnapshot.web.id,context.preSnapshot.db.id].join('\n');
    if(args[0]==='info')return'inactive';
    if(args[0]==='network'&&args[1]==='inspect')return[network.id,network.name,network.driver,'local'].map(JSON.stringify).join('\t');
    if(args[0]==='inspect'&&!context.executors.some(p=>p.id===args[1]))return['bridge',''].map(JSON.stringify).join('\t');
    if(args[0]==='inspect')return[args[1],api.imageId,0,running,'healthy',running?123:0,running?'running':'exited',false,false,running?0:137,false,api.startedAt,
      network.name,'no',false,'',[],{},null,null,[],[],'private',''].map(JSON.stringify).join('\t');
    assert.equal(intents.size,1,'durable intent must precede the simulated signal');
    mutations.push(args);if(stopFailure)throw Error('synthetic command outcome unknown');running=false;return'';
  };
  const producer=new DockerNetworkIsolationProducer({context,approval,now:clock||(()=>now),
    infrastructureEvidence:{body:{hostInventoryComplete:true,orchestratorsDisabled:true,unknownHostExecutors:0,swarmActive:false,watchtowerPresent:false,
      classifiedNonExecutorIds:[context.preSnapshot.web.id,context.preSnapshot.db.id]}},
    store:{directory:'/fixture-only',immutable:(file,body)=>{if(intents.has(file))throw Error('synthetic O_EXCL existing intent');intents.set(file,structuredClone(body));},read:file=>structuredClone(intents.get(file))},
    authority:{verifyAuthority:async(a,request)=>{await onAuthorize?.({producer,request,approval:a,intents});return allowed;},
      verifyInfrastructure:async(e,request)=>{await onInfrastructure?.({producer,request,intents});return allowed;}}}, {guard:()=>{},run,...(monotonic?{monotonic}:{})});
  producer.enforcedAt=new Date(now-1).toISOString();
  return{context,approval,producer,api,mutations,intents};
}
test('missing explicit termination policy or exact approval digest denies before target mutation',async()=>{
  for(const options of [{policyPresent:false},{approvalPresent:false}]){
    const f=sample(options);await assert.rejects(f.producer.stop(f.api.id),/MAINTENANCE_TERMINATION_HOLD/);assert.equal(f.mutations.length,0);assert.equal(f.intents.size,0);
  }
});
test('an uncooperative timed-out authority remains debt and blocks a different executor',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let reached,release,checks=0;
  const atGate=new Promise(resolve=>{reached=resolve;}),pending=new Promise(resolve=>{release=resolve;});
  const f=sample({twoExecutors:true,onAuthorize:async({request})=>{if(request.operation==='STOP_LEGACY'&&++checks===2){reached();await pending;}}});
  const work=f.producer.stop(f.api.id);await atGate;const rejected=assert.rejects(work,/STOP_AUTHORIZATION_TIMEOUT/);
  t.mock.timers.tick(10001);await rejected;
  assert.deepEqual(f.producer.cleanupDebt(),{pendingAuthorityPromises:1,unsettledStopScopes:1,productionEvidence:false});
  await assert.rejects(f.producer.stop('9'.repeat(64)),/STOP_PENDING_AUTHORITY_DEBT/);assert.equal(f.mutations.length,0);
  release(true);await new Promise(resolve=>setImmediate(resolve));assert.equal(f.producer.cleanupDebt().pendingAuthorityPromises,0);
  await assert.rejects(f.producer.stop(f.api.id),/STOP_ATTEMPT_REUSED_OR_ACTIVE/);assert.equal(f.mutations.length,0);
});
test('a caller-supplied policy digest never replaces independent authority',async()=>{
  const f=sample({allowed:false});await assert.rejects(f.producer.stop(f.api.id),/INDEPENDENT_NETWORK_MAINTENANCE_AUTHORITY_REQUIRED/);
  assert.equal(f.mutations.length,0);assert.equal(f.intents.size,0);
});
test('declared KILL escalation is scope-bound and cannot reuse an old policy digest',async()=>{
  const f=sample();f.context.terminationPolicy.recoveryOperator='changed';
  // Constructor captures context; mutate its compiled copy to test a stale
  // approval against an otherwise valid exact policy, not a global env flag.
  f.producer.context.terminationPolicy.recoveryOperator='changed';
  await assert.rejects(f.producer.stop(f.api.id),/POLICY_NOT_EXPLICITLY_IN_APPROVAL/);assert.equal(f.mutations.length,0);
});
test('direct mutation access cannot bypass durable typed STOP intent',async()=>{
  const f=sample();await assert.rejects(f.producer.mutate('STOP_LEGACY',['stop','--signal','SIGTERM','--time','30',f.api.id],35000),/STOP_TYPED_INTENT_REQUIRED/);
  assert.equal(f.intents.size,0);assert.equal(f.mutations.length,0);
});
test('one exact stop records intent first and sends explicit TERM despite image defaults',async()=>{
  const f=sample();const post=await f.producer.stop(f.api.id);
  assert.equal(f.intents.size,1);assert.equal(f.mutations.length,1);
  assert.deepEqual(f.mutations[0],['stop','--signal','SIGTERM','--time','30',f.api.id]);
  const intent=[...f.intents.values()][0];assert.equal(intent.terminationPolicySha256,f.approval.payload.terminationPolicySha256);
  assert.equal(intent.maxAttempts,1);assert.equal(intent.automaticRetry,false);assert.equal(intent.executor.id,f.api.id);
  assert.equal(post.terminationObservation,'NOT_COLLECTED');assert.equal(post.legacyDrainResult,'UNSUPPORTED');assert.equal(post.running,false);
  await assert.rejects(f.producer.stop(f.api.id),/STOP_ATTEMPT_REUSED_OR_ACTIVE/);assert.equal(f.mutations.length,1);
});
test('an uncertain first command retains intent and an explicit second attempt is denied before another signal',async()=>{
  const f=sample({stopFailure:true});await assert.rejects(f.producer.stop(f.api.id),/outcome unknown/);
  assert.equal(f.intents.size,1);assert.equal(f.mutations.length,1);
  await assert.rejects(f.producer.stop(f.api.id),/STOP_ATTEMPT_REUSED_OR_ACTIVE/);assert.equal(f.mutations.length,1);
});
for(const kind of ['authority','infrastructure'])test(`never-returning final ${kind} approval is bounded, aborted and cannot revive permission`,async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let reached,release,signal,stopChecks=0;
  const atGate=new Promise(resolve=>{reached=resolve;}),pending=new Promise(resolve=>{release=resolve;});
  const options=kind==='authority'?{onAuthorize:async({request})=>{
    if(request.operation==='STOP_LEGACY'&&++stopChecks===2){signal=request.signal;reached();await pending;}
  }}:{onInfrastructure:async({request,intents})=>{if(intents.size===1){signal=request.signal;reached();await pending;}}};
  const f=sample(options),work=f.producer.stop(f.api.id);
  await atGate;const rejected=assert.rejects(work,/STOP_AUTHORIZATION_TIMEOUT/);t.mock.timers.tick(10001);await rejected;
  assert.equal(signal.aborted,true);assert.equal(f.mutations.length,0);assert.equal(f.intents.size,1);
  release(true);await new Promise(resolve=>setImmediate(resolve));assert.equal(f.mutations.length,0);
  await assert.rejects(f.producer.stop(f.api.id),/STOP_ATTEMPT_REUSED_OR_ACTIVE/);
});
test('frozen wall clock cannot extend the monotonic operation deadline',async()=>{
  let mono=0;const f=sample({monotonic:()=>mono,onAuthorize:async()=>{mono=60000;}});
  await assert.rejects(f.producer.stop(f.api.id),/STOP_ADMISSION_DEADLINE_OR_CLOCK/);assert.equal(f.mutations.length,0);
});
test('the original window also expires monotonically while wall clock is frozen',async()=>{
  let mono=0;const now=Date.parse(fixture().context.window.end)-500;
  const f=sample({clock:()=>now,monotonic:()=>mono,onAuthorize:async()=>{mono=500;}});
  await assert.rejects(f.producer.stop(f.api.id),/STOP_ADMISSION_DEADLINE_OR_CLOCK/);assert.equal(f.mutations.length,0);
});
test('wall rollback and non-finite clocks reject admission',async()=>{
  let wall=Date.parse(fixture().context.window.start)+1000;
  const f=sample({clock:()=>wall,onAuthorize:async()=>{wall--;}});
  await assert.rejects(f.producer.stop(f.api.id),/STOP_ADMISSION_DEADLINE_OR_CLOCK/);assert.equal(f.mutations.length,0);
  const bad=sample({clock:()=>NaN});await assert.rejects(bad.producer.stop(bad.api.id),/STOP_ADMISSION_CLOCK/);assert.equal(bad.mutations.length,0);
});
test('late approval cannot silently shorten the complete 35-second Docker command slot',async()=>{
  let mono=0;const f=sample({monotonic:()=>mono,onAuthorize:async()=>{mono+=4500;},onInfrastructure:async()=>{mono+=4500;}});
  await assert.rejects(f.producer.stop(f.api.id),/STOP_FULL_COMMAND_BUDGET_UNAVAILABLE/);assert.equal(f.intents.size,1);assert.equal(f.mutations.length,0);
});
test('a synchronous slow authority cannot beat the timer by blocking its callback',async()=>{
  let mono=0;const f=sample({monotonic:()=>mono,onAuthorize:async()=>{mono=10001;}});
  await assert.rejects(f.producer.stop(f.api.id),/STOP_AUTHORIZATION_TIMEOUT/);assert.equal(f.mutations.length,0);
});
test('a readonly runner returning past its own budget cannot continue admission',async()=>{
  let mono=0;const f=sample({monotonic:()=>mono,onRead:({args})=>{if(args[0]==='ps')mono=10001;}});
  await assert.rejects(f.producer.stop(f.api.id),/STOP_READ_TIMEOUT/);assert.equal(f.mutations.length,0);
});
test('a late Docker command result is not a successful STOP and cannot trigger a retry',async()=>{
  let mono=0;const f=sample({monotonic:()=>mono,onRead:({args})=>{if(args[0]==='stop')mono=35000;}});
  await assert.rejects(f.producer.stop(f.api.id),/STOP_COMMAND_ACCEPTANCE_TIMEOUT/);assert.equal(f.intents.size,1);assert.equal(f.mutations.length,1);
  await assert.rejects(f.producer.stop(f.api.id),/STOP_ATTEMPT_REUSED_OR_ACTIVE/);assert.equal(f.mutations.length,1);
});
test('post-inspect expiration retains intent and cannot return successful STOP',async()=>{
  let mono=0;const f=sample({monotonic:()=>mono,onRead:({args,running})=>{if(!running&&args[0]==='inspect')mono=60000;}});
  await assert.rejects(f.producer.stop(f.api.id),/STOP_ADMISSION_DEADLINE_OR_CLOCK/);assert.equal(f.intents.size,1);assert.equal(f.mutations.length,1);
  await assert.rejects(f.producer.stop(f.api.id),/STOP_ATTEMPT_REUSED_OR_ACTIVE/);assert.equal(f.mutations.length,1);
});
test('intent-store loss never degrades to an in-memory-only one-shot',async()=>{
  const f=sample();f.producer.store={directory:'/fixture-only'};
  await assert.rejects(f.producer.stop(f.api.id),/IMMUTABLE_STOP_INTENT_STORE_REQUIRED/);assert.equal(f.mutations.length,0);
});
for(const field of ['window','policy','approval','intent'])test(`change during final authority await cancels effect: ${field}`,async()=>{
  let stopChecks=0;
  const f=sample({onAuthorize:async({producer,request,approval,intents})=>{
    if(request.operation!=='STOP_LEGACY'||++stopChecks!==2)return;
    await Promise.resolve();
    if(field==='window')producer.context.window.end=new Date(Date.parse(producer.context.window.end)+1000).toISOString();
    if(field==='policy'){
      producer.context.terminationPolicy.recoveryOperator='other-operator';
      approval.payload.terminationPolicySha256=canonicalDigest(producer.context.terminationPolicy);
    }
    if(field==='approval')approval.payload.extra='changed-after-independent-check';
    if(field==='intent')intents.values().next().value.automaticRetry=true;
  }});
  await assert.rejects(f.producer.stop(f.api.id),/MAINTENANCE_(?:TERMINATION_)?HOLD/);
  assert.equal(stopChecks,2);assert.equal(f.intents.size,1);assert.equal(f.mutations.length,0);
});
