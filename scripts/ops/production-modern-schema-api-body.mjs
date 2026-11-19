/** Execute only exact T's reviewed common API body under one suspended Bash
 * child. Typed operations return to the original native supervisor over IPC. */
import fs from 'node:fs';import path from 'node:path';import {format} from 'node:util';import {execFileSync} from 'node:child_process';
import {CONTRACT,secureJson} from './production-config-guard.mjs';import {executionEnv} from './capture-production-runtime.mjs';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {readCommittedModernSchemaDeploymentBody} from './production-modern-schema-body-source.mjs';
import {ModernSchemaBodyChannel} from './production-modern-schema-body-channel.mjs';
import {createModernSchemaFormalBodyAdapters} from './production-modern-schema-formal-body.mjs';import {modernSchemaStepEvidence} from './production-modern-schema-state.mjs';
import {strictSshCommand} from './production-trusted-paths.mjs';
const fail=code=>{throw Error('MODERN_SCHEMA_API_BODY_HOLD='+code);};
const quote=value=>"'"+value.replaceAll("'","'\"'\"'")+"'";
export async function runModernSchemaFormalApiBody({context,preparation,preparationSha256,rootLease,originalProcess,state,watch,privateRuntime,schemaReceipt,admit}){
 const root=CONTRACT.repository,directory=privateRuntime.createDirectory(context.owner,'body');
 const source=readCommittedModernSchemaDeploymentBody(root,context.targetSha);
 if(!same({bodySha256:source.bodySha256,workflowSha256:source.workflowSha256},preparation.bodySource))fail('EXACT_PREPARED_T_BODY_REQUIRED');
 let adapters,channel,composeCount=0;
 const schemaFile=path.join(privateRuntime.directory,`schema-release-schema-receipt-${context.owner}.json`),schemaSha256=canonicalDigest(schemaReceipt);
 const nativeAdmit=async()=>{
  privateRuntime.guard();watch.assertHealthy();if(await admit()!==true)fail('ORIGINAL_NATIVE_LEASE_REQUIRED');
  const pending=state.read();if(pending.phase!=='API_BODY'||pending.status!=='RUNNING'||canonicalDigest(secureJson(schemaFile))!==schemaSha256)fail('SAME_OWNER_SCHEMA_RECEIPT_AND_BODY_REQUIRED');
  channel.assertActivePeer();return true;
 };
 channel=new ModernSchemaBodyChannel({owner:context.owner,privateRuntime,directory,onRequest:async({operation,args})=>{
  if(!adapters)fail('ORIGINAL_SUSPENDED_BODY_REQUIRED');await nativeAdmit();
  if(operation==='state')await adapters.state(...args);
  else if(operation==='promote')await adapters.promote(...args);
  else if(operation==='compose')await adapters.compose(args);
  else if(operation==='readiness')await adapters.readiness(...args);
  else fail('FIXED_TYPED_BODY_OPERATION_REQUIRED');
 }});
 const pidFile=path.join(directory,'body-channel-pid'),file=path.join(directory,'formal-api-body.sh');
 const request=`/usr/bin/python3 -I -S ${quote(channel.script)} request "/proc/$server_pid/fd/10/${channel.socketName}" "$server_pid"`;
 const bootstrap=`set -Eeuo pipefail\nset +x\numask 077\ncd ${quote(root)}\nserver_pid="$(< ${quote(pidFile)})"\n`+
  `git() { command /usr/bin/timeout --signal=TERM 10s /usr/bin/git -c safe.directory=${quote(root)} -c core.hooksPath=/dev/null -c core.fsmonitor=false "$@"; }\n`+
  `docker() { if [ "\${1:-}" = compose ]; then shift; ${request} compose "$@"; else command /usr/bin/docker "$@"; fi; }\n`+
  `production_state() { ${request} state "$@"; }\nproduction_promote_floor() { ${request} promote "$@"; }\nproduction_api_readiness() { ${request} readiness; }\n`+
  `rollback_deploy() { trap - ERR; builtin printf '%s\\n' MODERN_SCHEMA_FORMAL_BODY_HOLD >&2; exit 64; }\n`+
  `assert_target_main() { test "$(git rev-parse refs/remotes/origin/main)" = "$TARGET_SHA"; test "$(git ls-remote --exit-code origin refs/heads/main)" = "$(builtin printf '%s\\trefs/heads/main' "$TARGET_SHA")"; }\n`+
  source.body+'perform_deployment\n';
 const fd=privateRuntime.openOutput(file);try{fs.writeFileSync(fd,bootstrap);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 let configured='';try{configured=execFileSync('/usr/bin/git',['-c',`safe.directory=${root}`,'config','--get','core.sshCommand'],{cwd:root,env:executionEnv(),encoding:'utf8',timeout:5000,maxBuffer:65536,stdio:['ignore','pipe','pipe']}).trim();}catch{}
 const gitSshCommand=strictSshCommand(process.env.GIT_SSH_COMMAND||configured,process.env.GIT_SSH||'');
 const env={...executionEnv(),GIT_SSH_COMMAND:gitSshCommand,STATE_DIR:privateRuntime.directory,DEPLOY_REPO_ROOT:root,TARGET_SHA:context.targetSha,DEPLOY_RUN_ID:context.owner,DEPLOY_RUN_ATTEMPT:context.owner.split('-')[1],
  APPROVED_CONFIG_FLOOR_SHA:context.targetSha,APPROVED_PREVIOUS_FLOOR_SHA:context.floorSha,DEPLOY_MODE:'api',BUILD_API:'true',BUILD_WEB:'false',RUN_MIG:'false',
  API_IMAGE:context.candidateImageId,WEB_IMAGE:preparation.originalSnapshot.containers.web.image,APPROVE_PRODUCTION:'true',PRESERVE_ARTIFACTS:'true',ROTATE_CHANJET_CREDENTIALS:'false',ONE_TIME_CONFIG_FLOOR_TRANSITION:'false',
  BACKGROUND_DEPLOYMENT_SUPERVISED:'true',MODERN_SCHEMA_BODY_SUPERVISED:'true',SKU_SOURCE_EFFECTIVE_DATE:'',SKU_SOURCE_PLAN_SHA256:''};
 const diagnostic=privateRuntime.openOutput(path.join(directory,'typed-adapters.stdout')),oldLog=console.log,oldError=console.error;
 console.log=(...values)=>fs.writeSync(diagnostic,format(...values)+'\n');console.error=(...values)=>fs.writeSync(diagnostic,format(...values)+'\n');let result;
 try{
  result=await privateRuntime.run({binary:'/bin/bash',args:['--noprofile','--norc','-Eeuo','pipefail'],directory,stem:'formal-api-body',inputFile:file,deferInput:true,inheritFd9:true,env,timeoutMs:300000,
   onSpawn:async entry=>{
    if(await admit()!==true)fail('ORIGINAL_NATIVE_LEASE_REQUIRED');watch.allowDescendants(entry);await channel.start(entry);
    const pidFd=privateRuntime.openOutput(pidFile);try{fs.writeFileSync(pidFd,String(channel.entry.child.pid));fs.fsyncSync(pidFd);}finally{fs.closeSync(pidFd);}
    state.advance('SCHEMA_RECEIPTED','API_BODY',modernSchemaStepEvidence(context,'API_BODY',{bodyChild:entry.pin,bodySourceSha256:source.bodySha256,workflowSourceSha256:source.workflowSha256,schemaReceiptSha256:schemaSha256}));
    adapters=createModernSchemaFormalBodyAdapters({context,preparationSha256,rootLease,originalProcess,originalChild:entry,admit:nativeAdmit},{
     executeCompose:async command=>{
      if(++composeCount!==1||command.binary!=='/usr/bin/docker'||command.cwd!==root)fail('EXACT_SINGLE_API_COMPOSE_REQUIRED');
      return privateRuntime.run({binary:command.binary,args:command.args,directory,stem:'formal-api-compose',env:command.env,timeoutMs:180000,inheritFd9:true,onSpawn:compose=>watch.allowCompose(compose)});
     },
    });
   }});
  if(!adapters?.completed()||composeCount!==1)fail('FORMAL_BODY_INCOMPLETE');if(await admit()!==true)fail('ORIGINAL_NATIVE_LEASE_REQUIRED');
 }finally{
  console.log=oldLog;console.error=oldError;fs.fsyncSync(diagnostic);fs.closeSync(diagnostic);if(channel.entry)await channel.close();
 }
 const receipt={schema:'phoenix.modern-schema-formal-api-body-result/v1',owner:context.owner,contextDigest:canonicalDigest(context),schemaReceiptSha256:schemaSha256,
  bodySourceSha256:source.bodySha256,workflowSourceSha256:source.workflowSha256,stdout:await privateRuntime.digest(result.stdout),stderr:await privateRuntime.digest(result.stderr),outcome:'BODY_COMPLETE',automaticRollback:false};
 privateRuntime.publishJson(path.join(directory,'formal-api-body-receipt.json'),receipt);return receipt;
}
