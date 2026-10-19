/** Fixed read/record IPC worker for the ONE maintenance factory. This process
 * never approves a release, changes Floor, signals a service or removes a fence. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {CONTRACT,verifyContext,secureJson} from './production-config-guard.mjs';
import {MaintenanceReceiptStore,bindingDigest,canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {verifyRegisteredOwnerMaintenanceAuthority} from './production-maintenance-owner-authority.mjs';
import {validateReleasePlan,formalEvidencePaths,verifySessionFormalEvidence} from './production-maintenance-deployment-session.mjs';
import {PUBLIC_DIRECTORY,readPublicManifest} from './background-control-manifest.mjs';
import {CONTROL_PARTICIPANT_ROLES} from './production-maintenance-control-participants.mjs';
import {captureSnapshot} from './production-deployment-evidence.mjs';
import {executionEnv} from './capture-production-runtime.mjs';
import {compileOwnedIngressRules,projectOwnedIngressTable,ingressIdentity} from './maintenance-ingress-policy.mjs';
const error=code=>Error('MAINTENANCE_CONTROLLER_HOLD='+code);
const self=fileURLToPath(import.meta.url),sourceSha256=createHash('sha256').update(fs.readFileSync(self)).digest('hex');
const guard=()=>verifyContext(CONTRACT.repository,CONTRACT.stateDirectory);
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&same(Object.keys(v).sort(),[...keys].sort());
const exists=file=>{try{fs.lstatSync(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw error('UNREADABLE_CONTROL_PATH');}};
export async function runMaintenanceControllerWorker(owner,role){
 if(!/^\d+-\d+$/.test(owner||'')||!CONTROL_PARTICIPANT_ROLES.includes(role)||!process.connected)throw error('FIXED_IPC_ENTRY_REQUIRED');
 guard();
 const planFile=path.join(CONTRACT.stateDirectory,`maintenance-release-plan-${owner}.json`),plan=validateReleasePlan(secureJson(planFile));
 if(plan.context.owner!==owner||plan.approval.authorityKind!=='OWNER_DELEGATED')throw error('EXACT_OWNER_PLAN_REQUIRED');
 const context=plan.context,contextDigest=bindingDigest(context),files=formalEvidencePaths(CONTRACT.stateDirectory,owner);
 const store=new MaintenanceReceiptStore(context,{guard});let initialized=false,fatal=null,pending=0,tail=Promise.resolve();
 const check=()=>{guard();if(!same(secureJson(planFile),plan)||Date.now()<Date.parse(context.window.start)||Date.now()>=Date.parse(context.window.end))throw error('PLAN_OR_WINDOW_CHANGED');};
 const read=(binary,args)=>{check();try{return execFileSync(binary,args,{env:executionEnv(),encoding:'utf8',timeout:3000,maxBuffer:65536,stdio:['ignore','pipe','pipe']}).trim();}catch{throw error('BOUNDED_READ_FAILED');}};
 const evidenceState=()=>{
  check();const state=store.readState();
  if(state&&(state.contextDigest!==contextDigest||!same(state.context,context)))throw error('STATE_CONTEXT_CHANGED');
  const refs=state?.receipts||[];
  return {phase:state?.phase||'PRE_SESSION',stateDigest:state?.stateDigest||null,receiptDigests:refs.map(ref=>canonicalDigest(store.readReceipt(ref)))};
 };
 const ingressState=()=>{
  const state=evidenceState(),installedFile=path.join(store.directory,`maintenance-ingress-installed-${owner}.json`);
  if(!exists(installedFile)){
   if(!['PRE_SESSION','PREPARED'].includes(state.phase))throw error('REQUIRED_PERSISTENT_INGRESS_ABSENT');
   return {phase:'PRE_INSTALL',enforcementClaim:false};
  }
  const installed=store.read(installedFile),scope=context.networkIsolation?.ingressScope;
  if(!scope||installed.owner!==owner||installed.contextDigest!==contextDigest||installed.scopeDigest!==canonicalDigest(scope))throw error('INGRESS_SCOPE_CHANGED');
  const compiled=compileOwnedIngressRules({owner:contextDigest.slice(0,32),bridge:scope.bridge,subnet:scope.subnet,port:scope.port},'phoenix_maintenance');
  const releasedFile=path.join(store.directory,`maintenance-ingress-released-${owner}.json`);
  if(exists(releasedFile)){
   const released=store.read(releasedFile),formal=store.read(path.join(store.directory,`deploy-${owner}.json`));
   if(state.phase!=='COMPLETED_OPEN'||formal.outcome!=='SUCCESS'||formal.target!==context.targetSha||formal.floorSha!==context.targetSha||formal.deployMode!=='api'||formal.maintenance?.owner!==owner||formal.switched?.web!==false||released.contextDigest!==contextDigest||released.outcome!=='EXACT_OWNED_TABLES_ABSENT')throw error('RELEASE_WITHOUT_FORMAL_SUCCESS');
   const manifest=readPublicManifest(PUBLIC_DIRECTORY);
   if(manifest.phase!=='OPEN'||manifest.owner!==owner||manifest.targetSha!==context.targetSha||manifest.generation!==3)throw error('RELEASE_WITHOUT_ACTUAL_PUBLIC_OPEN');
   const tables=JSON.parse(read('/usr/sbin/nft',['--json','list','tables']));
   if(!Array.isArray(tables.nftables)||tables.nftables.some(r=>r.table?.name===compiled.table))throw error('INGRESS_RELEASE_NOT_OBSERVED');
   return {phase:'RELEASED',recordDigest:canonicalDigest(released),formalDigest:canonicalDigest(formal)};
  }
  const projection=['inet','bridge'].map(family=>projectOwnedIngressTable(JSON.parse(read('/usr/sbin/nft',['--json','--handle','list','table',family,compiled.table])),family,{owner:contextDigest.slice(0,32),bridge:scope.bridge,subnet:scope.subnet,port:scope.port},'phoenix_maintenance'));
  if(!same(ingressIdentity(projection),installed.identity))throw error('PERSISTENT_RULES_CHANGED');
  return {phase:'FENCED',identityDigest:canonicalDigest(ingressIdentity(projection)),installedDigest:canonicalDigest(installed)};
 };
 const capturePre=()=>{
  if(role!=='EVIDENCE_RECORDER')throw error('ROLE_OPERATION_DENIED');
  check();const state=store.readState();if(state)throw error('PRE_CAPTURE_AFTER_STATE_START');
  const snapshot=captureSnapshot({phase:'PRE_SNAPSHOT',runId:owner,runAttempt:owner.split('-')[1],targetSha:context.targetSha,floorSha:context.targetSha,deployMode:'api'},args=>read('/usr/bin/docker',args));
  for(const service of ['api','web','db']){
   const actual=snapshot.containers[service],pin=context.preSnapshot[service];
   if(actual.id!==pin.id||actual.image!==pin.imageId||actual.startedAt!==pin.startedAt||actual.restartCount!==pin.restartCount||actual.running!==true||actual.health!=='healthy'||(service!=='db'&&actual.ociRevision!==pin.revision))throw error('ACTUAL_PRE_CHANGED');
  }
  store.immutable(files.pre,snapshot);return {file:path.basename(files.pre),digest:canonicalDigest(store.read(files.pre))};
 };
 const verifyFormal=()=>{
  if(role!=='EVIDENCE_RECORDER')throw error('ROLE_OPERATION_DENIED');check();
  const formal=verifySessionFormalEvidence({context,files});check();
  return {digests:formal.digests,liveDigest:canonicalDigest(formal.live)};
 };
 const actualHealth=async()=>{
  check();let observation;
  if(role==='AUTHORITY_READER'){
   const expected={context,bindingDigest:contextDigest,targetSha:context.targetSha,purpose:'MAINTENANCE'};
   if(await verifyRegisteredOwnerMaintenanceAuthority(plan.approval,expected,{guard})!==true)throw error('OWNER_REGISTRATION_OR_REVOCATION');
   observation={authorityKind:'OWNER_DELEGATED',grantDigest:plan.approval.ownerGrantSha256};
  }else if(role==='EVIDENCE_RECORDER')observation=evidenceState();else observation=ingressState();
  check();return canonicalDigest(observation);
 };
 process.on('message',message=>{
  pending++;if(pending>16){fatal||=error('QUEUE_CAPACITY');}
  tail=tail.then(async()=>{
   try{
    if(!exact(message,['id','operation','nonce'])||typeof message.id!=='string'||!/^[a-f0-9-]{36}$/.test(message.id)||!['INIT','HEALTH','CLOSE','CAPTURE_PRE','VERIFY_FORMAL'].includes(message.operation))throw error('FIXED_REQUEST_REQUIRED');
    if(message.operation==='CLOSE'){if(pending!==1)throw error('PENDING_WORK_REMAINS');process.send({id:message.id,value:{closed:true}},()=>process.disconnect());return;}
    if(fatal)throw fatal;
    let value;
    if(message.operation==='INIT'){if(initialized)throw error('REINITIALIZATION');initialized=true;await actualHealth();value={ready:true,role,owner,contextDigest,sourceSha256};}
    else{if(!initialized)throw error('HANDSHAKE_REQUIRED');
     if(message.operation==='HEALTH'){if(typeof message.nonce!=='string'||!/^[a-f0-9-]{36}$/.test(message.nonce))throw error('NONCE_REQUIRED');await actualHealth();value={schema:'phoenix.maintenance-control-participant-health/v1',role,owner,contextDigest,sourceSha256,childPid:process.pid,nonce:message.nonce,healthy:true,pending:pending-1,protocolVersion:1};}
     else value=message.operation==='CAPTURE_PRE'?capturePre():verifyFormal();
    }
    process.send({id:message.id,value});
   }catch(e){fatal||=/^MAINTENANCE_CONTROLLER_HOLD=[A-Z_]+$/.test(e?.message||'')?e:error('OBSERVATION_FAILED');if(process.connected)process.send({id:message?.id||null,error:fatal.message});}
   finally{pending--;}
  });
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{if(process.argv.length!==4)throw error('FIXED_IPC_ENTRY_REQUIRED');await runMaintenanceControllerWorker(process.argv[2],process.argv[3]);}
 catch{process.exitCode=1;process.disconnect?.();}
}
