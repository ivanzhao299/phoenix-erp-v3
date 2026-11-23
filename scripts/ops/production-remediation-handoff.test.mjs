import assert from 'node:assert/strict';
import test from 'node:test';
import {verifyCommandBoot,exactHeldAttempt,interruptedBoot,cutoff} from './production-remediation-interrupted-boot.mjs';
import {checkHeldWindow,retireVerifiedIngress} from './production-remediation-fence-transfer.mjs';
import {isHeldResource,heldCapsulePin,verifyHeldIsolation} from './production-remediation-held-resources.mjs';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
import {ingressIdentity} from './maintenance-ingress-policy.mjs';
import {runModernOriginalRecoveryWorkflow} from './production-modern-schema-operator-workflow.mjs';
const owner='45144287071-1',target='98dfab3411fbddb8c1646f2db20df2799291cd3d',cid='3'.repeat(64);

test('start command acceptance and native nanosecond boot must refer to exactly the same container boot',()=>{
 const ts=BigInt(Date.parse(interruptedBoot))*1000000n+687687n;
 const stdout={bytes:Buffer.from(cid+'\n'),mtimeNs:ts+90000000n},stderr={bytes:Buffer.alloc(0),mtimeNs:ts-21000000n};
 const valid={apiId:cid,bootAt:interruptedBoot,stdout,stderr};
 verifyCommandBoot(valid);
 for(const broken of [{apiId:'4'.repeat(64)},{stderr:{...stderr,bytes:Buffer.from('error')}},
  {stdout:{...stdout,mtimeNs:ts-1n}},{stderr:{...stderr,mtimeNs:ts+1n}},{stderr:{...stderr,mtimeNs:ts-21000000000n}}])
  assert.throws(()=>verifyCommandBoot({...valid,...broken}),/INTERRUPTED_BOOT_HOLD/);
});
test('exact held marker and incident deadline apply even to a two-minute release',()=>{
 const p={owner,targetSha:target,phase:'FRESH_RECHECKED',sequence:5,status:'HOLD',stateDigest:'c8415dc078bcfa3546e47f567031adb5495632a76a17ab86a7abab3178d4c9dc'};
 assert.ok(exactHeldAttempt(p));for(const field of Object.keys(p))assert.equal(exactHeldAttempt({...p,[field]:null}),false);
 checkHeldWindow({}, {end:new Date(cutoff).toISOString()});
 assert.throws(()=>checkHeldWindow({}, {end:new Date(cutoff+1000).toISOString()}),/CUMULATIVE_CUTOFF/);
});
test('a generic or foreign release cannot invoke fenced takeover or reuse the diagnostic owner',()=>{
 const repo='ivanzhao299/phoenix-erp-v3',sha='c'.repeat(40);
 const env={GITHUB_REPOSITORY:repo,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_JOB:'recover',RUNNER_ENVIRONMENT:'github-hosted',
  GITHUB_ACTOR:'emvia',GITHUB_ACTOR_ID:'7245339',GITHUB_TRIGGERING_ACTOR:'emvia',GITHUB_WORKFLOW_REF:repo+'/.github/workflows/production-modern-original-recovery.yml@refs/heads/main',
  GITHUB_WORKFLOW_SHA:sha,GITHUB_SHA:sha,GITHUB_RUN_ID:'773',GITHUB_RUN_ATTEMPT:'1',ORIGINAL_RELEASE_OWNER:owner,ORIGINAL_ATTEMPTED_SHA:target,
  APPROVE_STOPPED_ORIGINAL:'false',APPROVE_FORWARD_API:'false',APPROVE_HELD_TAKEOVER:'true',OPERATOR_HELD_INSPECTION:'772-1'};
 const call=patch=>runModernOriginalRecoveryWorkflow({...env,...patch},{createSsh:(_env,binding)=>({
  exchange(op){assert.equal(op,'handoff-held');assert.equal(binding.OPERATOR_HELD_INSPECTION,'772-1');return {status:0,stdout:JSON.stringify({schema:'phoenix.modern-original-recovery-public/v1',
   originalOwner:owner,recoveryOwner:'773-1',formalTargetSuccess:false,outcome:'HANDOFF_EDGE_HELD'})};},close(){}})});
 assert.equal(call({}).outcome,'HANDOFF_EDGE_HELD');
 for(const patch of [{OPERATOR_HELD_INSPECTION:'773-1'},{OPERATOR_HELD_INSPECTION:owner},{APPROVE_STOPPED_ORIGINAL:'true'},{INSPECT_HELD_FACTS:'true'},
  {APPROVE_HELD_TAKEOVER:'false'},{ORIGINAL_RELEASE_OWNER:'771-1'}])assert.throws(()=>call(patch),/EXACT_OPERATOR_RECOVERY_ACTION_REQUIRED/);
});
function retirement(){
 const files=new Map(),counts={n:2,calls:0};
 const store={file:n=>n,read:n=>files.get(n),exists:n=>files.has(n),
  immutable(n,v){assert.equal(files.has(n),false);files.set(n,structuredClone(v));}};
 const host={bootId:'fixture',namespace:'test'},tables=[];
 const ingress={compiled:{table:'phoenix_fixture_owned'},host,names:()=>Array(counts.n).fill('table'),tables:()=>tables,
  assertProgram:(n,v)=>assert.deepEqual(files.get(n),v)};
 const args={ingress,store,runtime:{publishJson:(n,v)=>store.immutable(n,v)},owner:'773-1',binding:{web:'verified-fixture'},
  proof:{host,identitySha256:canonicalDigest(ingressIdentity(tables))},verify:async()=>true,
  apply:async()=>{counts.calls++;counts.n=0;}};
 return {files,counts,args};
}
test('retirement denies a missing family, unknown absence, lost public hold and drifted intent',async()=>{
 for(const n of [0,1]){const {counts,args}=retirement();counts.n=n;await assert.rejects(retireVerifiedIngress(args),/INGRESS_CHANGED/);assert.equal(counts.calls,0);}
 const {args,counts,files}=retirement();await assert.rejects(retireVerifiedIngress({...args,verify:async()=>false}),/COMPLETED_WEB_AND_EDGE/);
 assert.equal(files.size,0);files.set('schema-release-handoff-remove-intent-773-1.json',{changed:true});
 await assert.rejects(retireVerifiedIngress(args),/INTENT_CHANGED/);assert.equal(counts.calls,0);
});
test('already committed native deletion can seal after lost ACK, or after a process exits before the seal',async()=>{
 const {args,counts}=retirement();let fail=true;
 const interrupted={...args,verify:async()=>{if(counts.n===0&&fail){fail=false;throw Error('interruption');}return true;},
  apply:async()=>{counts.calls++;counts.n=0;throw Error('lost nft acknowledge');}};
 await assert.rejects(retireVerifiedIngress(interrupted),/interruption/);
 await retireVerifiedIngress(interrupted);await retireVerifiedIngress(interrupted);assert.equal(counts.calls,1);
});
test('capsule network and actual local volume retain their isolated owner, empty membership and original mount',()=>{
 const pins=['a','b','c'].map((v,i)=>({classification:'RETAINED_1123_FENCED_ATTEMPT',formerOwner:i===2?'45141252692-1':owner,
  role:'rehearsal-database',networkId:v.repeat(64),volume:String(i).repeat(64)}));
 const network=pins.map(p=>({Id:p.networkId,Internal:true,EnableIPv6:false,Driver:'bridge',Scope:'local',Labels:{'phoenix.schema.owner':p.formerOwner,'phoenix.schema.role':'rehearsal-network'},Containers:{}}));
 const volumes=pins.map(p=>({Name:p.volume,Scope:'local',Driver:'local',Options:{},Labels:{'phoenix.schema.owner':p.formerOwner,'phoenix.schema.role':'rehearsal-data'}}));
 const run=(_bin,args)=>JSON.stringify(args[0]==='network'?network:volumes);
 assert.ok(isHeldResource(pins[0]));verifyHeldIsolation(pins,run);
 network[2].Containers.other={};assert.throws(()=>verifyHeldIsolation(pins,run),/ISOLATION_CHANGED/);delete network[2].Containers.other;
 volumes[1].Options.device='/unexpected';assert.throws(()=>verifyHeldIsolation(pins,run),/ISOLATION_CHANGED/);
 assert.throws(()=>heldCapsulePin({id:cid,labels:{}},{pins:new Map()}),/INERT_NATIVE_IDENTITY/);
});
