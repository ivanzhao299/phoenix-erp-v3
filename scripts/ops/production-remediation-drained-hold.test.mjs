import assert from 'node:assert/strict';
import test from 'node:test';
import {drainedOwner,drainedProjections,drainedTarget,exactDrainedPending} from './production-remediation-drained-hold.mjs';
import {checkHeldWindow,isReviewedDrainedContinuation,isReviewedNetworkContinuation} from './production-remediation-fence-transfer.mjs';
import {runModernOriginalRecoveryWorkflow} from './production-modern-schema-operator-workflow.mjs';
import {createHash} from 'node:crypto';

const old='6bb88544275dfef591cb96c0078f73e88496433b';
const participant={containerId:'c'.repeat(64),bootId:'11111111-2222-4333-8444-555555555555',revision:old,allowedKinds:[]};
const previous={protocolVersion:1,phase:'OPEN',owner:'111-1',generation:113,targetSha:old,participants:[participant]};
const fenced={protocolVersion:1,phase:'FENCED',owner:drainedOwner,generation:114,targetSha:drainedTarget,participants:[participant]};
const prep={originalBackground:{participant,manifest:previous,record:{...previous,previousFloorSha:'b'.repeat(40)}}};

test('the failed DRAINED attempt produces one same-boot zero-grant successor projection',()=>{
 const recorded='2026-11-24T00:00:00Z',result=drainedProjections(prep,fenced,recorded);
 assert.deepEqual(result.manifest,{...previous,generation:115});
 assert.equal(result.record.manifestDigest,createHash('sha256').update(JSON.stringify(result.manifest)).digest('hex'));
 assert.equal(result.high.generation,115);
 for(const change of [{generation:113},{owner:'999-1'},{participants:[{...participant,allowedKinds:['OTHER']}]}])
  assert.throws(()=>drainedProjections(prep,{...fenced,...change},recorded),/DRAINED_HOLD/);
 const marker={owner:drainedOwner,targetSha:drainedTarget,stateDigest:'c8f45239386e8f6f19de8937a55054047238d8a22910e24e1329b62d6bcc614f',
  sequence:1,phase:'DRAINED',status:'HOLD',holdReason:'SCHEMA_RELEASE_FAILED'};
 assert.ok(exactDrainedPending(marker));
 for(const key of Object.keys(marker))assert.equal(exactDrainedPending({...marker,[key]:null}),false);
});

test('only the direct reviewed successor with a settlement can use a separately approved slot',()=>{
 const target='c'.repeat(40);
 const read=(parent,paths)=>args=>args[0]==='show'?parent:paths;
 const paths='scripts/ops/production-remediation-drained-hold.mjs\nscripts/ops/production-modern-schema-watch.mjs';
 assert.equal(isReviewedDrainedContinuation(target,read(drainedTarget,paths)),true);
 assert.equal(isReviewedDrainedContinuation(target,read(old,paths)),false);
 assert.equal(isReviewedDrainedContinuation(target,read(drainedTarget,paths+'\napps/api/src/main.ts')),false);
 const window={start:'2026-11-24T00:00:00Z',end:'2026-11-24T04:00:00Z'};
 checkHeldWindow({settlement:{}},window);
 assert.throws(()=>checkHeldWindow({extended:true},window),/CUMULATIVE_CUTOFF/);
 assert.throws(()=>checkHeldWindow(null,window),/SEALED_HANDOFF/);
 assert.throws(()=>checkHeldWindow({settlement:{}},{...window,end:'2026-11-24T06:00:01Z'}),/EXACT_FRESH_WINDOW/);
});

test('drained operations and their receipt never stand for an unrelated run or target',()=>{
 const repository='ivanzhao299/phoenix-erp-v3',execution='c'.repeat(40);
 const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_JOB:'recover',
  RUNNER_ENVIRONMENT:'github-hosted',GITHUB_ACTOR:'emvia',GITHUB_ACTOR_ID:'7245339',GITHUB_TRIGGERING_ACTOR:'emvia',
  GITHUB_WORKFLOW_REF:repository+'/.github/workflows/production-modern-original-recovery.yml@refs/heads/main',
  GITHUB_WORKFLOW_SHA:execution,GITHUB_SHA:execution,GITHUB_RUN_ID:'777',GITHUB_RUN_ATTEMPT:'1',ORIGINAL_RELEASE_OWNER:drainedOwner,
  ORIGINAL_ATTEMPTED_SHA:drainedTarget,APPROVE_STOPPED_ORIGINAL:'false',APPROVE_FORWARD_API:'false',OPERATOR_HELD_INSPECTION:'45168560404-1'};
 const read=(override,bad=false)=>runModernOriginalRecoveryWorkflow({...env,...override},{createSsh:(_env,host)=>({
  exchange(action){assert.equal(host.TARGET_SHA,drainedTarget);
   assert.equal(action,override.APPROVE_HELD_TAKEOVER==='true'?'settle-drained':'rehearse-drained');
   return {status:0,stdout:JSON.stringify({schema:'phoenix.1123-drained-public/v1',originalOwner:drainedOwner,recoveryOwner:bad?'999-1':'777-1',
    outcome:action==='rehearse-drained'?'DRAINED_REHEARSED':'DRAINED_SETTLED',publicHeld:true,mutationAuthorized:false})};
  },close(){},
 })});
 assert.equal(read({REHEARSE_HELD_TAKEOVER:'true'}).outcome,'DRAINED_REHEARSED');
 assert.equal(read({APPROVE_HELD_TAKEOVER:'true',OPERATOR_HELD_REHEARSAL:'100-1'}).outcome,'DRAINED_SETTLED');
 assert.throws(()=>read({APPROVE_HELD_TAKEOVER:'true'}),/EXACT_OPERATOR_RECOVERY_ACTION/);
 assert.throws(()=>read({REHEARSE_HELD_TAKEOVER:'true',OPERATOR_HELD_INSPECTION:'100-1'}),/EXACT_OPERATOR_RECOVERY_ACTION/);
 assert.throws(()=>read({REHEARSE_HELD_TAKEOVER:'true'},true),/BOUND_DRAINED_RECEIPT/);
});


test('the network-only continuation preserves the exact original settlement execution SHA',()=>{
 const settled='01bd5141428e76602ec15cd8e46d7baa159a7570',target='a'.repeat(40);
 const scope='scripts/ops/production-modern-schema-rehearsal.mjs\nscripts/ops/production-modern-schema-preparation.mjs';
 const read=(parent,paths)=>args=>args[0]==='show'?parent:paths;
 assert.equal(isReviewedNetworkContinuation(settled,target,read(settled,scope)),true);
 assert.equal(isReviewedNetworkContinuation(drainedTarget,target,read(settled,scope)),false);
 assert.equal(isReviewedNetworkContinuation(settled,target,read(drainedTarget,scope)),false);
 assert.equal(isReviewedNetworkContinuation(settled,target,read(settled,scope+'\napps/api/src/main.ts')),false);
});
