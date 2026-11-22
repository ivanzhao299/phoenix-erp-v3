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
 const forward=env.APPROVE_FORWARD_API==='true';
 if(forward ? env.APPROVE_STOPPED_ORIGINAL!=='false'||prior!==''||!forwardApiRecoveryAllowed(attempt,target,recovery,execution)
   : env.APPROVE_STOPPED_ORIGINAL!=='true')fail('EXACT_OPERATOR_RECOVERY_ACTION_REQUIRED');
 if(Object.entries(fixed).some(([key,value])=>env[key]!==value)||!owner.test(attempt??'')||!owner.test(recovery)||attempt===recovery||
  !sha.test(target??'')||!sha.test(execution??'')||execution!==env.GITHUB_WORKFLOW_SHA||(prior!==''&&(!owner.test(prior)||[attempt,recovery].includes(prior))))fail('EXACT_GITHUB_RECOVERY_REQUIRED');
 const ssh=(deps.createSsh??createProductionSsh)(env,{TARGET_SHA:target,MODERN_SCHEMA_EXECUTION_SHA:execution,
  ORIGINAL_RELEASE_OWNER:attempt,OPERATOR_RECOVERY_OWNER:recovery,OPERATOR_COMMITTED_OWNER:prior},{operatorRecovery:true});
 try{
  const result=ssh.exchange(forward?'recover-target':'recover-original','');
  if(result.status===24)fail('RECOVERY_LOCK_BUSY');
  let content;try{content=JSON.parse(result.stdout);}catch{fail('BOUND_RECOVERY_RECEIPT_REQUIRED');}
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
   content.formalTargetSuccess!==false||!['ORIGINAL_OPEN','HOLD'].includes(content.outcome)||
   (result.status===0)!==(content.outcome==='ORIGINAL_OPEN'))fail('BOUND_RECOVERY_RECEIPT_REQUIRED');
  return content;
 }finally{ssh.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const value=runModernOriginalRecoveryWorkflow(process.env);console.log(JSON.stringify(value));if(!['ORIGINAL_OPEN','TARGET_OPEN'].includes(value.outcome))process.exitCode=1;}
 catch(error){console.error(/^ORIGINAL_RECOVERY_WORKFLOW_HOLD=[A-Z0-9_]+$/.test(error.message)?error.message:'ORIGINAL_RECOVERY_WORKFLOW_HOLD=UNVERIFIED');process.exitCode=1;}
}
