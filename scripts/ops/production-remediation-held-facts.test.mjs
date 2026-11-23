import assert from 'node:assert/strict';
import test from 'node:test';
import {compareHeldFacts,participantStartMicros,heldOwner,heldTarget} from './production-remediation-held-facts.mjs';
import {runModernOriginalRecoveryWorkflow} from './production-modern-schema-operator-workflow.mjs';

const db={database:{name:'fixture',systemIdentifier:'55'},readOnly:true,releaseAuthorized:false,
 tables:[{schema:'public',table:'tools',sha256:'one'}],sequences:[{schema:'public',name:'tools_id_seq',lastValue:'4',isCalled:true}]};
test('full facts include table content, sequence state, additions and removals',()=>{
 assert.equal(compareHeldFacts(db,structuredClone(db)).outcome,'MATCH');
 for(const [key,changedTables,changedSequences] of [['tables',1,0],['sequences',0,1]]){
  for(const replacement of [[],[...db[key],{schema:'other',table:'tools',name:'tools_id_seq'}],db[key].map(r=>({...r,changed:true}))]){
   const result=compareHeldFacts(db,{...db,[key]:replacement});
   assert.equal(result.outcome,'DIFFERENCE');assert.equal(result.changedTables,changedTables);assert.equal(result.changedSequences,changedSequences);
  }
 }
 assert.throws(()=>compareHeldFacts(db,{...db,readOnly:false}),/DATABASE_FACT_SCOPE/);
 assert.throws(()=>compareHeldFacts(db,{...db,tables:[...db.tables,...db.tables]}),/DUPLICATE_FACT/);
});
test('fenced participant retains exact native backend start microsecond',()=>{
 assert.equal(participantStartMicros('1970-01-01T00:00:01.000019Z'),'1000019');
 assert.throws(()=>participantStartMicros('1970-01-01T00:00:01.000Z'),/BOOT_TIME/);
});
const repository='ivanzhao299/phoenix-erp-v3',revision='a'.repeat(40);
const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_JOB:'recover',
 RUNNER_ENVIRONMENT:'github-hosted',GITHUB_ACTOR:'emvia',GITHUB_ACTOR_ID:'7245339',GITHUB_TRIGGERING_ACTOR:'emvia',
 GITHUB_WORKFLOW_REF:repository+'/.github/workflows/production-modern-original-recovery.yml@refs/heads/main',GITHUB_WORKFLOW_SHA:revision,
 GITHUB_SHA:revision,GITHUB_RUN_ID:'49112',GITHUB_RUN_ATTEMPT:'1',APPROVE_STOPPED_ORIGINAL:'false',APPROVE_FORWARD_API:'false',
 INSPECT_HELD_FACTS:'true',ORIGINAL_RELEASE_OWNER:heldOwner,ORIGINAL_ATTEMPTED_SHA:heldTarget};
test('fixed diagnostic cannot select either deployment operation or relay other output',()=>{
 const before='cca24f95e5f524c40d2a7f0fb447557cebfeaa0548551328f42b81abe2ed1a7e';
 const ok={before,after:before,outcome:'MATCH',changedTables:0,changedSequences:0,releaseAuthorized:false};
 const run=(patch={},receipt=ok,status=0)=>runModernOriginalRecoveryWorkflow({...env,...patch},{createSsh:()=>({
  exchange(command,stdin){assert.equal(command,'check-held');assert.equal(stdin,'');return {stdout:JSON.stringify(receipt),status};},close(){}
 })});
 assert.equal(run().outcome,'MATCH');
 for(const patch of [{ORIGINAL_RELEASE_OWNER:'4321-1'},{ORIGINAL_ATTEMPTED_SHA:revision},{APPROVE_FORWARD_API:'true'},{APPROVE_STOPPED_ORIGINAL:'true'},{OPERATOR_COMMITTED_OWNER:'331-1'}])
  assert.throws(()=>run(patch),/EXACT_OPERATOR_RECOVERY_ACTION_REQUIRED/);
 for(const bad of [{...ok,releaseAuthorized:true},{...ok,changedSequences:1},{...ok,unexpected:1}])
  assert.throws(()=>run({},bad),/BOUND_HELD_FACTS_RECEIPT_REQUIRED/);
 assert.equal(run({},{outcome:'HOLD',code:'HELD_FACTS_HOLD=LEDGER_CHANGED',releaseAuthorized:false},1).outcome,'HOLD');
});
