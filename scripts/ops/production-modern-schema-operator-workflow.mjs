/** Execute only the reviewed stopped-original recovery in the fixed hosted job. */
import {createProductionSsh} from './production-modern-schema-workflow.mjs';
import {pathToFileURL} from 'node:url';
import {forwardApiRecoveryAllowed} from './production-modern-schema-forward-api.mjs';

const repository='ivanzhao299/phoenix-erp-v3';
const fixed={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
 GITHUB_JOB:'recover',RUNNER_ENVIRONMENT:'github-hosted',GITHUB_ACTOR:'emvia',GITHUB_ACTOR_ID:'7245339',GITHUB_TRIGGERING_ACTOR:'emvia',
 GITHUB_WORKFLOW_REF:repository+'/.github/workflows/production-modern-original-recovery.yml@refs/heads/main',
};
const sha=/^[a-f0-9]{40}$/;
const owner=/^[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$/;
const fail=code=>{throw Error('ORIGINAL_RECOVERY_WORKFLOW_HOLD='+code);};

export function runModernOriginalRecoveryWorkflow(env,deps={}){
 const attempt=env.ORIGINAL_RELEASE_OWNER,recovery=env.GITHUB_RUN_ID+'-'+env.GITHUB_RUN_ATTEMPT;
 const target=env.ORIGINAL_ATTEMPTED_SHA,execution=env.GITHUB_SHA,prior=env.OPERATOR_COMMITTED_OWNER??'';
 const inspecting=env.INSPECT_HELD_FACTS==='true',handoff=env.APPROVE_HELD_TAKEOVER==='true';
 const drainedIncident=attempt==='45228188093-1'&&target==='3e2ea4ea4de5ccbc102f1e17ae4dbc48c0cfb8e2';
 const rehearsal=env.REHEARSE_HELD_TAKEOVER==='true',witness=env.OPERATOR_HELD_REHEARSAL??'';
 if(handoff?rehearsal||!owner.test(witness)||[attempt,recovery,env.OPERATOR_HELD_INSPECTION].includes(witness):witness!=='')fail('EXACT_OPERATOR_RECOVERY_ACTION_REQUIRED');
 if(rehearsal&&prior!=='')fail('EXACT_OPERATOR_RECOVERY_ACTION_REQUIRED');
 const heldInspection=env.OPERATOR_HELD_INSPECTION??'';
 if(handoff||rehearsal){
  const firstIncident=attempt==='45144287071-1'&&target==='98dfab3411fbddb8c1646f2db20df2799291cd3d';
  if(inspecting||(!firstIncident&&!drainedIncident)||(drainedIncident&&(prior!==''||heldInspection!=='45168560404-1'))||
     !owner.test(heldInspection)||[attempt,recovery,prior].includes(heldInspection)||
     env.APPROVE_STOPPED_ORIGINAL!=='false'||env.APPROVE_FORWARD_API!=='false')fail('EXACT_OPERATOR_RECOVERY_ACTION_REQUIRED');
 }else if(heldInspection!=='')fail('EXACT_OPERATOR_RECOVERY_ACTION_REQUIRED');
 const forward=env.APPROVE_FORWARD_API==='true';
 if(inspecting&&(attempt!=='45144287071-1'||target!=='98dfab3411fbddb8c1646f2db20df2799291cd3d'||prior!==''||
   env.APPROVE_STOPPED_ORIGINAL!=='false'||env.APPROVE_FORWARD_API!=='false'))fail('EXACT_OPERATOR_RECOVERY_ACTION_REQUIRED');
 if(forward ? env.APPROVE_STOPPED_ORIGINAL!=='false'||prior!==''||!forwardApiRecoveryAllowed(attempt,target,recovery,execution)
   : !inspecting&&!handoff&&!rehearsal&&env.APPROVE_STOPPED_ORIGINAL!=='true')fail('EXACT_OPERATOR_RECOVERY_ACTION_REQUIRED');
 if(Object.entries(fixed).some(([key,value])=>env[key]!==value)||!owner.test(attempt??'')||!owner.test(recovery)||attempt===recovery||
  !sha.test(target??'')||!sha.test(execution??'')||execution!==env.GITHUB_WORKFLOW_SHA||(prior!==''&&(!owner.test(prior)||[attempt,recovery].includes(prior))))fail('EXACT_GITHUB_RECOVERY_REQUIRED');
 const registryToken=env.MODERN_SCHEMA_WEB_READ_TOKEN;
 if(forward&&(typeof registryToken!=='string'||!/^[A-Za-z0-9_.-]{10,2048}$/.test(registryToken)))fail('SCOPED_WEB_READ_CHANNEL_REQUIRED');
 const ssh=(deps.createSsh??createProductionSsh)(env,{TARGET_SHA:target,MODERN_SCHEMA_EXECUTION_SHA:execution,
  ORIGINAL_RELEASE_OWNER:attempt,OPERATOR_RECOVERY_OWNER:recovery,OPERATOR_COMMITTED_OWNER:prior,...(handoff||rehearsal?{OPERATOR_HELD_INSPECTION:heldInspection,OPERATOR_HELD_REHEARSAL:witness}:{})},{operatorRecovery:true});
 try{
  const drainedAction=drainedIncident&&(rehearsal||handoff);
  const result=ssh.exchange(drainedAction?(rehearsal?'rehearse-drained':'settle-drained'):inspecting?'check-held':rehearsal?'rehearse-held':handoff?'handoff-held':forward?'recover-target':'recover-original',forward?registryToken+'\n':'');
  if(result.status===24)fail('RECOVERY_LOCK_BUSY');
  let content;try{content=JSON.parse(result.stdout);}catch{fail('BOUND_RECOVERY_RECEIPT_REQUIRED');}
  if(drainedAction){
   const success=rehearsal?'DRAINED_REHEARSED':'DRAINED_SETTLED';
   const base={schema:'phoenix.1123-drained-public/v1',originalOwner:attempt,recoveryOwner:recovery,publicHeld:true,mutationAuthorized:false};
   const valid=content&&Object.getPrototypeOf(content)===Object.prototype&&Object.entries(base).every(([k,v])=>content[k]===v);
   const keys=Object.keys(content??{}).sort().join(',');
   if(!valid||!(content.outcome===success&&result.status===0&&keys==='mutationAuthorized,originalOwner,outcome,publicHeld,recoveryOwner,schema'||
    content.outcome==='HOLD'&&result.status!==0&&keys==='code,mutationAuthorized,originalOwner,outcome,publicHeld,recoveryOwner,schema'&&/^[A-Z_]+_HOLD=[A-Z0-9_]+$/.test(content.code)))fail('BOUND_DRAINED_RECEIPT_REQUIRED');
   return content;
  }
  if(inspecting){
   const keys=Object.keys(content??{}).sort().join(',');
   const validComparison=keys==='after,before,changedSequences,changedTables,outcome,releaseAuthorized'&&
    content.before==='cca24f95e5f524c40d2a7f0fb447557cebfeaa0548551328f42b81abe2ed1a7e'&&/^[a-f0-9]{64}$/.test(content.after)&&
    [content.changedSequences,content.changedTables].every(n=>Number.isSafeInteger(n)&&n>=0)&&
    (content.outcome==='MATCH'?content.before===content.after&&!content.changedTables&&!content.changedSequences:
     content.outcome==='DIFFERENCE'&&content.before!==content.after);
   const validHold=keys==='code,outcome,releaseAuthorized'&&content.outcome==='HOLD'&&/^[A-Z_]+_HOLD=[A-Z0-9_]+$/.test(content.code);
   if((!validComparison&&!validHold)||content.releaseAuthorized!==false||(result.status===0)!==(content.outcome==='MATCH'))fail('BOUND_HELD_FACTS_RECEIPT_REQUIRED');
   return {...content,originalOwner:attempt,recoveryOwner:recovery};
  }
  if(forward){
   if(!content||Object.getPrototypeOf(content)!==Object.prototype||
    Object.keys(content).sort().join(',')!=='defaultOff,originalOwner,outcome,recoveryOwner,schema,targetSha'||
    content.schema!=='phoenix.modern-forward-api-public/v1'||content.originalOwner!==attempt||content.recoveryOwner!==recovery||
    content.targetSha!==target||content.defaultOff!==true||!['TARGET_OPEN','HOLD'].includes(content.outcome)||
    (result.status===0)!==(content.outcome==='TARGET_OPEN'))fail('BOUND_FORWARD_RECOVERY_RECEIPT_REQUIRED');
   return content;
  }
  if(!content||Object.getPrototypeOf(content)!==Object.prototype||
   Object.keys(content).sort().join(',')!=='formalTargetSuccess,originalOwner,outcome,recoveryOwner,schema'||
   content.schema!=='phoenix.modern-original-recovery-public/v1'||content.originalOwner!==attempt||content.recoveryOwner!==recovery||
   content.formalTargetSuccess!==false||![rehearsal?'HANDOFF_REHEARSED':handoff?'HANDOFF_EDGE_HELD':'ORIGINAL_OPEN','HOLD'].includes(content.outcome)||
   (result.status===0)!==(content.outcome===(rehearsal?'HANDOFF_REHEARSED':handoff?'HANDOFF_EDGE_HELD':'ORIGINAL_OPEN')))fail('BOUND_RECOVERY_RECEIPT_REQUIRED');
  return content;
 }finally{ssh.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const value=runModernOriginalRecoveryWorkflow(process.env);console.log(JSON.stringify(value));if(!['ORIGINAL_OPEN','TARGET_OPEN','MATCH','HANDOFF_EDGE_HELD','HANDOFF_REHEARSED','DRAINED_REHEARSED','DRAINED_SETTLED'].includes(value.outcome))process.exitCode=1;}
 catch(error){console.error(/^ORIGINAL_RECOVERY_WORKFLOW_HOLD=[A-Z0-9_]+$/.test(error.message)?error.message:'ORIGINAL_RECOVERY_WORKFLOW_HOLD=UNVERIFIED');process.exitCode=1;}
}
