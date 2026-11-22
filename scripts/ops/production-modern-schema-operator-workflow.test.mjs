import assert from 'node:assert/strict';
import test from 'node:test';
import {runModernOriginalRecoveryWorkflow} from './production-modern-schema-operator-workflow.mjs';
import {assertForwardApiPublicationState} from './production-modern-schema-forward-api.mjs';

const repository='ivanzhao299/phoenix-erp-v3';
const owner='7911-2',recoveryOwner='7912-1',target='a'.repeat(40),execution='b'.repeat(40);
const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_JOB:'recover',
 RUNNER_ENVIRONMENT:'github-hosted',GITHUB_ACTOR:'emvia',GITHUB_ACTOR_ID:'7245339',GITHUB_TRIGGERING_ACTOR:'emvia',
 GITHUB_WORKFLOW_REF:repository+'/.github/workflows/production-modern-original-recovery.yml@refs/heads/main',GITHUB_WORKFLOW_SHA:execution,
 GITHUB_SHA:execution,GITHUB_RUN_ID:'7912',GITHUB_RUN_ATTEMPT:'1',APPROVE_STOPPED_ORIGINAL:'true',ORIGINAL_RELEASE_OWNER:owner,ORIGINAL_ATTEMPTED_SHA:target};
const success={schema:'phoenix.modern-original-recovery-public/v1',originalOwner:owner,recoveryOwner,formalTargetSuccess:false,outcome:'ORIGINAL_OPEN'};

test('only the exact authorized recovery job can select the dedicated private command',()=>{
  let closed=0;
  const createSsh=(_env,host,opts)=>{
    assert.deepEqual(host,{TARGET_SHA:target,MODERN_SCHEMA_EXECUTION_SHA:execution,ORIGINAL_RELEASE_OWNER:owner,OPERATOR_RECOVERY_OWNER:recoveryOwner,OPERATOR_COMMITTED_OWNER:''});
    assert.deepEqual(opts,{operatorRecovery:true});
    return {exchange(operation,input){assert.deepEqual([operation,input],['recover-original','']);return {status:0,stdout:JSON.stringify(success)};},close(){closed++;}};
  };
  assert.deepEqual(runModernOriginalRecoveryWorkflow(env,{createSsh}),success);
  assert.equal(closed,1);
  for(const patch of [{GITHUB_REF:'refs/heads/other'},{GITHUB_ACTOR:'another'},{GITHUB_TRIGGERING_ACTOR:'another'},{APPROVE_STOPPED_ORIGINAL:'false'}]){
    assert.throws(()=>runModernOriginalRecoveryWorkflow({...env,...patch},{createSsh:()=>assert.fail('Invalid request reached SSH')}),/EXACT_(GITHUB_RECOVERY|OPERATOR_RECOVERY_ACTION)_REQUIRED/);
  }
});

test('the transport only relays its fixed binding and cannot report formal target success',()=>{
  for(const [status,result] of [[1,success],[0,{...success,recoveryOwner:'7999-1'}],[0,{...success,formalTargetSuccess:true}],[0,{...success,private:'forbidden'}]]){
    const createSsh=()=>({exchange:()=>({status,stdout:JSON.stringify(result)}),close(){}});
    assert.throws(()=>runModernOriginalRecoveryWorkflow(env,{createSsh}),/BOUND_RECOVERY_RECEIPT_REQUIRED/);
  }
});

test('forward completion is pinned to a distinct previously published recovery owner',()=>{
  for(const candidate of [owner,recoveryOwner,'../../operator']) {
    assert.throws(()=>runModernOriginalRecoveryWorkflow({...env,OPERATOR_COMMITTED_OWNER:candidate},
      {createSsh:()=>assert.fail('Invalid committed owner reached SSH')}),/EXACT_GITHUB_RECOVERY_REQUIRED/);
  }
  const result=runModernOriginalRecoveryWorkflow({...env,OPERATOR_COMMITTED_OWNER:'7913-2'},{createSsh:(_env,host)=>{
    assert.equal(host.OPERATOR_COMMITTED_OWNER,'7913-2');
    return {exchange:()=>({status:0,stdout:JSON.stringify(success)}),close(){}};
  }});
  assert.deepEqual(result,success);
});

test('distinct protected attempts can run at the same exact Git revision',()=>{
  const sameRevision={...env,ORIGINAL_ATTEMPTED_SHA:execution};
  const result=runModernOriginalRecoveryWorkflow(sameRevision,{createSsh:(_env,host)=>{
    assert.equal(host.TARGET_SHA,host.MODERN_SCHEMA_EXECUTION_SHA);
    assert.notEqual(host.ORIGINAL_RELEASE_OWNER,host.OPERATOR_RECOVERY_OWNER);
    return {exchange:()=>({status:0,stdout:JSON.stringify(success)}),close(){}};
  }});
  assert.deepEqual(result,success);
  assert.throws(()=>runModernOriginalRecoveryWorkflow({...sameRevision,ORIGINAL_RELEASE_OWNER:recoveryOwner},
    {createSsh:()=>assert.fail('One attempt cannot recover itself')}),/EXACT_GITHUB_RECOVERY_REQUIRED/);
});

test('forward API handoff requires the exact original owner, revision and explicit action', () => {
  const targetSha = 'eaeec067bbc5f0e9c70cefc50b665d988d55b153';
  const originalOwner = '44917766283-1';
  const forward = {...env, ORIGINAL_RELEASE_OWNER: originalOwner, ORIGINAL_ATTEMPTED_SHA: targetSha,
    APPROVE_STOPPED_ORIGINAL: 'false', APPROVE_FORWARD_API: 'true'};
  const receipt = {schema: 'phoenix.modern-forward-api-public/v1', originalOwner, recoveryOwner,
    targetSha, defaultOff: true, outcome: 'TARGET_OPEN'};
  const createSsh = () => ({
    exchange(operation, input) {
      assert.deepEqual([operation, input], ['recover-target', '']);
      return {status: 0, stdout: JSON.stringify(receipt)};
    },
    close() {},
  });
  assert.deepEqual(runModernOriginalRecoveryWorkflow(forward, {createSsh}), receipt);
  for (const patch of [{ORIGINAL_RELEASE_OWNER: owner}, {ORIGINAL_ATTEMPTED_SHA: target},
    {APPROVE_STOPPED_ORIGINAL: 'true'}, {OPERATOR_COMMITTED_OWNER: '7913-1'}]) {
    assert.throws(() => runModernOriginalRecoveryWorkflow({...forward, ...patch},
      {createSsh: () => assert.fail('Unexpected SSH request')}), /EXACT_OPERATOR_RECOVERY_ACTION_REQUIRED/);
  }
  for (const patch of [{targetSha: target}, {outcome: 'ORIGINAL_OPEN'}, {defaultOff: false}, {private: true}]) {
    assert.throws(() => runModernOriginalRecoveryWorkflow(forward, {
      createSsh: () => ({exchange: () => ({status: 0, stdout: JSON.stringify({...receipt, ...patch})}), close() {}}),
    }), /BOUND_FORWARD_RECOVERY_RECEIPT_REQUIRED/);
  }
});

test('forward API resumes exact partial writes and never opens with partial native fencing', () => {
  const typed = {phase: 'FENCED'}, fenced = {phase: 'FENCED', generation: 10};
  const ordinary = {phase: 'OPEN'}, manifest = {phase: 'OPEN', generation: 11};
  const base = {typed, fenced, ordinary, manifest, current: typed, projection: fenced,
    high: {generation: 10}, ingressCount: 2};
  assert.doesNotThrow(() => assertForwardApiPublicationState(base));
  assert.doesNotThrow(() => assertForwardApiPublicationState({...base, high: {generation: 11}, current: ordinary}));
  const committed = {...base, high: {generation: 11}, current: ordinary, projection: manifest};
  assert.doesNotThrow(() => assertForwardApiPublicationState(committed));
  assert.doesNotThrow(() => assertForwardApiPublicationState({...committed, ingressCount: 0}));
  for (const drift of [{ingressCount: 1}, {current: typed}, {high: {generation: 10}},
    {projection: {...manifest, targetSha: target}}]) {
    assert.throws(() => assertForwardApiPublicationState({...committed, ...drift}), /COMMITTED_OPEN_CHANGED/);
  }
  assert.throws(() => assertForwardApiPublicationState({...base, ingressCount: 0}), /UNPUBLISHED_DENIAL_CHANGED/);
});
