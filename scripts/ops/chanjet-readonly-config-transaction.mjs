import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { CONTRACT, guardProduction, secureJson, git, requireCleanMain, rollbackEligibility } from './production-config-guard.mjs';
import { atomicState } from './production-deployment-state.mjs';
import { captureRuntime, executionEnv } from './capture-production-runtime.mjs';
import { readonlyEnvironment, validateReadonlyPolicy } from './chanjet-readonly-policy.mjs';
import { envRecords } from './update-managed-chanjet-env.mjs';
import { auditMappingScope, readDatabaseEvidence } from './chanjet-readonly-production-audit.mjs';
import { runCompose } from './phoenix-production-compose.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const hold=reason=>{throw new Error(`RESTORATION_HOLD=${reason}`);};
export function readonlyFlagSource(source,value) {
  if(!['true','false'].includes(value)) hold('FLAG_VALUE');
  const records=envRecords(source); const record=records.find(r=>r.key==='CHANJET_READONLY_SYNC_ENABLED');
  if(!record || !/^CHANJET_READONLY_SYNC_ENABLED=(?:true|false)(?:\r?\n)?$/.test(record.raw)) hold('NONCANONICAL_READONLY_FLAG');
  return records.map(r=>r===record?r.raw.replace(/=(true|false)/,`=${value}`):r.raw).join('');
}
export function switchPlan(floor, operation, approval, now=Date.now()) {
  const mode=floor.chanjetPolicy||'HOLD';
  if(!['READONLY_VERIFY','READONLY_ACTIVE','HOLD'].includes(operation)) hold('OPERATION');
  if(operation==='READONLY_VERIFY' && mode!=='HOLD') hold('VERIFY_REQUIRES_HOLD');
  if(operation==='READONLY_ACTIVE' && mode!=='READONLY_VERIFY') hold('ACTIVE_REQUIRES_FIRST_SYNC');
  if(operation==='READONLY_ACTIVE') {
    const before={...floor.readonlyApproval};delete before.verifiedRunId;delete before.verifiedEvidenceRunId;
    const after={...approval};delete after.verifiedRunId;delete after.verifiedEvidenceRunId;
    if(JSON.stringify(before)!==JSON.stringify(after)) hold('APPROVAL_SCOPE_CHANGED');
  }
  validateReadonlyPolicy(operation,operation==='HOLD'?null:approval,floor.floorSha,now);
  return {...floor,chanjetPolicy:operation,readonlyApproval:operation==='HOLD'?null:approval,
    operationalTuple:{...floor.operationalTuple,CHANJET_READONLY_SYNC_ENABLED:operation==='HOLD'?'false':'true'}};
}
export function replaceReadonlyEnv(envPath, source, output, stage) {
  const original=fs.lstatSync(envPath), directory=fs.lstatSync(stage);
  if(!original.isFile() || original.isSymbolicLink() || original.nlink!==1 || (original.mode&0o777)!==0o600
    || !directory.isDirectory() || directory.isSymbolicLink() || directory.uid!==0 || (directory.mode&0o777)!==0o700 || directory.dev!==original.dev) hold('ENV_STAGING_OR_OWNER');
  const temp=path.join(stage,`env-${randomUUID()}`);let fd;
  try {
    fd=fs.openSync(temp,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW|fs.constants.O_WRONLY,0o600);
    fs.writeFileSync(fd,output);fs.fchownSync(fd,original.uid,original.gid);fs.fchmodSync(fd,0o600);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
    const current=fs.lstatSync(envPath);
    if(current.dev!==original.dev||current.ino!==original.ino||!fs.readFileSync(envPath).equals(source)) hold('ENV_CAS_CHANGED');
    fs.renameSync(temp,envPath);
    const parent=fs.openSync(path.dirname(envPath),'r');try{fs.fsyncSync(parent);}finally{fs.closeSync(parent);}
    const result=fs.lstatSync(envPath);
    if(result.uid!==original.uid||result.gid!==original.gid||(result.mode&0o777)!==0o600||!fs.readFileSync(envPath).equals(output)) hold('ENV_POSTCONDITION');
  } finally {if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
function database(sql) {
  return readDatabaseEvidence(`SELECT row_to_json(q) FROM (${sql}) q;`);
}
export async function configTransaction(root,operation,approval) {
  const directory=CONTRACT.stateDirectory,runId=process.env.DEPLOY_RUN_ID,target=process.env.TARGET_SHA;
  if(!/^\d+-\d+$/.test(runId||'')||process.env.APPROVED_CONFIG_FLOOR_SHA!==target)hold('EXACT_SHA_APPROVAL');
  requireCleanMain(root,target);
  if(git(root,['ls-remote','origin','refs/heads/main']).split(/\s/)[0]!==target)hold('LATEST_MAIN_CHANGED');
  const actual=captureRuntime();const floor=guardProduction(root,directory,actual);
  if(floor.floorSha!==target||actual.api.revision!==target||!rollbackEligibility(root,floor,actual.api).allowed)hold('API_REVISION_FLOOR');
  for(const name of ['transaction.json','policy-transition.json'])if(fs.existsSync(path.join(directory,name)))hold('UNFINISHED_TRANSACTION');
  const next=switchPlan(floor,operation,approval);
  const sql=fs.readFileSync(path.join(root,'scripts/ops/readonly-audits/chanjet-restoration-preflight.sql'),'utf8');
  const evidence=readDatabaseEvidence(sql);
  if(operation!=='HOLD')auditMappingScope(evidence,approval);
  if(operation==='READONLY_ACTIVE') {
    const proof = secureJson(path.join(directory, `first-sync-${approval.verifiedEvidenceRunId}.json`));
    if (proof.version !== 3 || proof.phase !== 'VERIFIED' || proof.target !== target || proof.approvalId !== approval.approvalId || proof.orchestrationRunId !== approval.verifiedRunId || proof.remoteWrite !== false || proof.erpInbound !== false || JSON.stringify(proof.scope) !== JSON.stringify(approval.verification) || JSON.stringify(proof.protectedBefore) !== JSON.stringify(proof.protectedAfter)) hold('FIRST_SYNC_EVIDENCE_REQUIRED');
    const run=database(`SELECT status, request_scope, result_summary FROM chanjet_sync_jobs WHERE request_scope->>'orchestrationRunId' = '${approval.verifiedRunId}' ORDER BY id DESC LIMIT 1`);
    const v=approval.verification;
    if(run.status!=='SUCCESS'||run.result_summary?.state!=='COMPLETED'||run.result_summary?.decision==='HOLD'||run.request_scope?.approvalId!==approval.approvalId
      || run.request_scope?.bookId!==v.bookId || run.request_scope?.period!==v.period || JSON.stringify(run.request_scope?.scope)!==JSON.stringify(v.scope)
      ||run.result_summary?.erpInbound?.applied===true||run.result_summary?.externalWriteEnabled!==false)hold('FIRST_CONTROLLED_SYNC_PROOF');
  }
  // Before VERIFY, the operator uses existing finance RBAC and a real readonly probe.
  // A token or source response is never printed or persisted in the transaction.
  if(operation==='READONLY_VERIFY') {
    const token=process.env.CHANJET_SYNC_OPERATOR_TOKEN;if(!token)hold('PROTECTED_REMOTE_READ_AUTH_REQUIRED');
    const v=approval.verification;
    const url=`http://127.0.0.1:3100/api/chanjet/call?path=${encodeURIComponent(`/accounting/gl/statistics/receive/${v.bookId}`)}&q=${encodeURIComponent(`period=${v.period}`)}`;
    const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30_000)});
    const body=await response.json();if(!response.ok||body.success===false)hold('REMOTE_READ_AUTH');
  }
  const envPath=path.join(root,'.env'),source=fs.readFileSync(envPath),output=Buffer.from(readonlyFlagSource(source.toString('utf8'),next.operationalTuple.CHANJET_READONLY_SYNC_ENABLED));
  const stage='/data/.phoenix-env-staging';
  if(!fs.existsSync(stage))fs.mkdirSync(stage,{mode:0o700});
  const stageMeta=fs.lstatSync(stage);if(stageMeta.isSymbolicLink()||stageMeta.uid!==0||(stageMeta.mode&0o777)!==0o700)hold('ENV_STAGING');
  const backup=path.join(stage,`chanjet-readonly-before-${runId}.env`);
  fs.writeFileSync(backup,source,{flag:'wx',mode:0o600});
  const flags=f=>({...readonlyEnvironment(f),CHANJET_READONLY_SYNC_ENABLED:f.operationalTuple.CHANJET_READONLY_SYNC_ENABLED,CHANJET_ERP_INBOUND_SYNC_ENABLED:'false'});
  const startedAt=new Date().toISOString();
  const marker={version:3,operation,phase:'IN_PROGRESS',runId,target,previous:actual,candidateApi:actual.api,previousEnv:flags(floor),nextEnv:flags(next),startedAt,expiresAt:new Date(Date.now()+CONTRACT.maximumTransitionMs).toISOString()};
  const recordFile=path.join(directory,`chanjet-config-${runId}.json`);
  atomicState(recordFile,{version:3,previousFloor:floor,nextFloor:next,previous:actual,envBackup:backup,beforeSha256:hash(source),afterSha256:hash(output),evidence,marker});
  atomicState(path.join(directory,'policy-transition.json'),marker);
  // No Compose in this bounded config interval; interruptions retain the marker.
  replaceReadonlyEnv(envPath,source,output,stage);
  atomicState(path.join(directory,'floor.json'),next);
  guardProduction(root,directory,actual);
  runCompose(['up','-d','--no-deps','--wait','api']);
  guardProduction(root,directory,actual);
  if(JSON.stringify(captureRuntime())!==JSON.stringify(actual))hold('IMAGE_CHANGED_DURING_CONFIG');
  execFileSync('curl',['-fsS','--max-time','20','http://127.0.0.1:3100/api/readiness'],{env:executionEnv(),stdio:'ignore'});
  // Fully matching live flags are required before clearing the short-lived exception.
  const raw=JSON.parse(execFileSync('docker',['inspect','phoenix-v3-api','--format','{{json .Config.Env}}'],{env:executionEnv(),encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  if(Object.entries(marker.nextEnv).some(([k,v])=>!raw.includes(`${k}=${v}`)))hold('LIVE_CONFIG_NOT_SWITCHED');
  atomicState(recordFile,{version:3,operation,outcome:'SUCCESS',target,envBackup:backup,beforeSha256:hash(source),afterSha256:hash(output),startedAt,completedAt:new Date().toISOString(),remoteWrite:false,erpInbound:false});
  fs.unlinkSync(path.join(directory,'policy-transition.json'));
  console.log(`CHANJET_CONFIG_TRANSACTION=PASS;POLICY=${operation};ERP_INBOUND=false`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{await configTransaction(fs.realpathSync(process.cwd()),process.env.CHANJET_CONFIG_OPERATION,process.env.CHANJET_APPROVAL_JSON?JSON.parse(process.env.CHANJET_APPROVAL_JSON):null);}
  catch{console.error('CHANJET_CONFIG_TRANSACTION=HOLD;EVIDENCE_RETAINED');process.exitCode=1;}
}
