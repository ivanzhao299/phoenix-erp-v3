import {ModernSchemaPrivateRuntime} from './production-modern-schema-private.mjs';
import {ModernSchemaIngress} from './production-modern-schema-ingress.mjs';
import {checkHeldNative,readHeldHandoff,retireVerifiedIngress,guardHeldContinuation} from './production-remediation-fence-transfer.mjs';
import {assertHeldEdge,heldOwner} from './production-remediation-held-facts.mjs';
import {API_READINESS_PROGRAM} from './production-maintenance-candidate-health.mjs';
/** The ordinary Web transaction consumes the exact image inspected before the
 * API maintenance. All checks run on the root host under the same deploy FD9. */
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {ModernSchemaRegistry} from './production-modern-schema-registration.mjs';
import {readRegisteredModernSchemaApproval} from './production-modern-schema-authority.mjs';
import {captureRuntime,executionEnv} from './capture-production-runtime.mjs';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {successorDecisions,successorWebReserveMs} from './production-modern-schema-successor.mjs';

const ownerFormat=/^[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$/;
const receiptOnly='RECEIPT_ONLY';
const fail=()=>{throw Error('MODERN_SCHEMA_WEB_HOLD=EXACT_COMPLETED_API_AND_WINDOW_REQUIRED');};
export function checkSuccessorWeb(phase,env,deps={}){
 const target=env.TARGET_SHA,selection=env.MODERN_SCHEMA_WEB_SELECTION??'',store=deps.store??new ModernSchemaRegistry();
 if(!/^[a-f0-9]{40}$/.test(target)||!['admit','before','after','seal'].includes(phase)||!['web','full'].includes(env.DEPLOY_MODE))fail();
 const consumedName='schema-release-1123-consumed-'+target+'.json';
 store.guard();
 if(!store.exists(consumedName)){if(selection)fail();return;}
 const consumed=store.read(consumedName),owner=consumed.owner;
 const sealedName='schema-release-1123-web-completed-'+target+'.json';
 if(store.exists(sealedName)){
  const seal=store.read(sealedName);
  if(seal.schema!=='phoenix.remediation-1123-completed-web/v1'||seal.apiOwner!==owner||seal.targetSha!==target||
     !/^[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$/.test(seal.webOwner))fail();
  const formal=store.read('deploy-'+seal.webOwner+'.json');
  if(formal.target!==target||formal.deployMode!=='web'||formal.outcome!=='SUCCESS'||canonicalDigest(formal)!==seal.formalSha256||
     formal.active?.api?.imageId!==seal.apiImageId||formal.active?.web?.imageId!==seal.webImageId)fail();
  if(selection){
   if(selection!=='web1123-'+owner||!same(formal.active,(deps.captureRuntime??captureRuntime)()))fail();
   return receiptOnly;
  }
  return;
 }
 if(env.DEPLOY_MODE!=='web')fail();
 if(!/^[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$/.test(owner)||selection!=='web1123-'+owner||
    store.exists('schema-release-pending.json')||store.exists('cutover-pending.json')||env.RUN_MIG!=='false'||env.BUILD_API!=='false'||
    env.BUILD_WEB!=='true'||env.APPROVE_PRODUCTION!=='true'||env.PRESERVE_ARTIFACTS!=='true')fail();
 const prepared=store.read('schema-release-preparation-'+owner+'.json'),context=prepared.context;
 const decisions=successorDecisions(store,prepared.successorDecisions?.selection,context.floorSha,context);
 const access=store.read('schema-release-1123-api-access-'+owner+'.json');
 if(access.targetSha!==target||access.contextDigest!==canonicalDigest(context)||access.apiAccess?.businessAccess!=='AVAILABLE'||
    !['ROLE_BOUNDARY_VERIFIED','PILOT_NOT_READY'].includes(access.apiAccess.pilotStatus))fail();
 const intentName='schema-release-1123-web-verified-'+target+'.json';
 const intent=store.exists(intentName)?store.read(intentName):null;
 const receiptRecovery=phase==='seal'||phase==='admit'&&Boolean(intent);
 const now=(deps.now??Date.now)();
 let approval;
 if(receiptRecovery){
  if(!intent||store.exists('schema-release-revoked-'+owner+'.json'))fail();
  approval=store.read('schema-release-approval-'+owner+'.json');
 }else{
  const deadline=Date.parse(context.window.end);
  if(now<Date.parse(context.window.start)||now>=deadline||phase!=='after'&&deadline-now<successorWebReserveMs)fail();
  approval=(deps.readApproval??readRegisteredModernSchemaApproval)(context).grant;
 }
 const formal=store.read('deploy-'+owner+'.json');
 const terminal=store.exists('schema-release-terminal-'+owner+'.json')?store.read('schema-release-terminal-'+owner+'.json'):null;
 const archive=store.exists('schema-release-forward-terminal-archive-'+owner+'.json')?store.read('schema-release-forward-terminal-archive-'+owner+'.json'):null;
 const receiptMatches=terminal?.schema==='phoenix.modern-schema-terminal-open/v1'&&terminal.phase==='COMPLETED_OPEN'&&
    terminal.formalDeploymentSha256===canonicalDigest(formal)&&terminal.defaultOff===true&&terminal.contextDigest===canonicalDigest(context);
 const apiIntent=archive&&store.read('schema-release-open-commit-intent-'+owner+'.json');
 const archiveMatches=archive?.schema==='phoenix.modern-schema-forward-terminal-archive/v1'&&archive.defaultOff===true&&
    archive.contextDigest===canonicalDigest(context)&&archive.openCommitIntentSha256===canonicalDigest(apiIntent)&&apiIntent.formalDeploymentSha256===canonicalDigest(formal);
 const pins=(deps.captureRuntime??captureRuntime)();
 const webRef='ghcr.io/ivanzhao299/phoenix-erp-v3/web:sha-'+target;
 if(!same(decisions,prepared.successorDecisions)||approval.authorizationDigest!==consumed.authorizationDigest||context.owner!==owner||context.targetSha!==target||
    consumed.preparationSha256!==prepared.preparationSha256||consumed.targetSha!==target||(!receiptMatches&&!archiveMatches)||
    formal.outcome!=='SUCCESS'||formal.target!==target||formal.deployMode!=='api'||formal.active.api.imageId!==context.candidateImageId||
    pins.api.imageId!==context.candidateImageId||pins.api.revision!==target)fail();
 if(phase==='admit'&&!receiptRecovery)return;
 const image=(deps.image??(ref=>execFileSync('/usr/bin/docker',['image','inspect',ref,'--format','{{.Id}} {{index .Config.Labels "org.opencontainers.image.revision"}}'],
   {env:executionEnv(),encoding:'utf8',timeout:5000,stdio:['ignore','pipe','pipe']}).trim()))(webRef);
 if(image!==decisions.webImageId+' '+target||
   phase!=='before'&&(pins.web.imageId!==decisions.webImageId||pins.web.revision!==target))fail();
 const webOwner=receiptRecovery?intent.webOwner:env.DEPLOY_RUN_ID;
 if(!ownerFormat.test(webOwner)||webOwner===owner)fail();
 if(phase==='before')return;
 const evidenceBinding={schema:'phoenix.remediation-1123-verified-web/v1',apiOwner:owner,webOwner,targetSha:target,
  apiTerminalSha256:canonicalDigest(receiptMatches?terminal:archive),approvalSha256:canonicalDigest(approval),
  contextDigest:canonicalDigest(context),apiImageId:pins.api.imageId,webImageId:pins.web.imageId};
 const web=store.read('deploy-'+webOwner+'.json');
 if(web.deployMode!=='web'||web.target!==target||!same(web.active,pins)||web.configSha!==target||web.floorSha!==target||
    web.switched?.api!==false||web.switched?.web!==true||!same(web.candidates?.web,pins.web)||!same(web.previous?.api,pins.api))fail();
 if(phase==='after'){
  if(intent||web.outcome!=='SWITCHING')fail();
  store.immutable(intentName,{...evidenceBinding,checkedAt:now,expectedFormalSha256:canonicalDigest({...web,outcome:'SUCCESS'})});
  return;
 }
 const active=store.read('active.json');
 if(!receiptRecovery||phase==='seal'&&webOwner!==env.DEPLOY_RUN_ID||
    !Number.isSafeInteger(intent.checkedAt)||intent.checkedAt<Date.parse(context.window.start)||intent.checkedAt>=Date.parse(context.window.end)||
    !same(intent,{...evidenceBinding,checkedAt:intent.checkedAt,expectedFormalSha256:canonicalDigest(web)})||
    web.outcome!=='SUCCESS'||active.outcome!=='SUCCESS'||active.configSha!==target||active.floorSha!==target||!same(active.active,pins)||
    store.exists('transaction.json')||store.exists('policy-transition.json'))fail();
 store.immutable(sealedName,{schema:'phoenix.remediation-1123-completed-web/v1',apiOwner:owner,webOwner,targetSha:target,
  formalSha256:canonicalDigest(web),apiImageId:pins.api.imageId,webImageId:pins.web.imageId,
  verificationSha256:canonicalDigest(intent)});
 return receiptOnly;
}
export async function runSuccessorWeb(phase,env){
 const store=new ModernSchemaRegistry(),target=env.TARGET_SHA,marker='schema-release-1123-handoff-'+heldOwner+'.json';
 if(!store.exists(marker))return checkSuccessorWeb(phase,env,{store});
 const witness=store.read(marker);
 const completed='schema-release-handoff-removed-'+witness.recoveryOwner+'.json';
 if(store.exists(completed)&&store.exists('schema-release-1123-origin-open.json')&&!env.MODERN_SCHEMA_WEB_SELECTION)return checkSuccessorWeb(phase,env,{store});
 const handoff=readHeldHandoff(store,target),runtime=new ModernSchemaPrivateRuntime();
 const consumed=store.read('schema-release-1123-consumed-'+target+'.json'),selection='web1123-'+consumed.owner;
 if(env.DEPLOY_MODE!=='web'||env.MODERN_SCHEMA_WEB_SELECTION!==selection)fail();
 const checkedPhase=phase==='held-readiness'?'before':phase;
 const result=checkSuccessorWeb(checkedPhase,env,{store});
 const sealedName='schema-release-1123-web-completed-'+target+'.json';
 if(!store.exists(sealedName)){
  guardHeldContinuation(handoff,store.directory);
  await checkHeldNative({handoff,store,runtime,admit:async()=>{store.guard();return true;}});
  if(phase==='held-readiness'){
   const current=captureRuntime(),formal=store.read('deploy-'+consumed.owner+'.json');
   if(current.api.revision!==target||!same(current.api,formal.active.api))fail();
   const cid=execFileSync('/usr/bin/docker',['inspect','--format','{{.Id}}','phoenix-v3-api'],{env:executionEnv(),encoding:'utf8',timeout:5000}).trim();
   if(!/^[a-f0-9]{64}$/.test(cid))fail();
   const live=JSON.parse(execFileSync('/usr/bin/docker',['exec',cid,'/usr/bin/env','-i','PATH=/usr/local/bin:/usr/bin:/bin','/usr/local/bin/node','-e',API_READINESS_PROGRAM],
    {env:executionEnv(),encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']}));
   if(live.status!==200||live.ready!==true||live.dbConnected!==true||!same(captureRuntime(),current))fail();
  }
  return result;
 }
 if(!['admit','seal'].includes(phase))fail();
 // If formal SUCCESS and the protected seal exist, a fresh invocation can
 // confirm an uncertain delete without repeating either deployment.
 const seal=store.read(sealedName);
 const approvalEnd=Date.parse(store.read('schema-release-preparation-'+consumed.owner+'.json').context.window.end);
 const authorizeRemoval=()=>{
  if(!Number.isFinite(approvalEnd)||Date.now()>=approvalEnd)fail();
  guardHeldContinuation(handoff,store.directory);
 };
 const verify=async()=>{
  store.guard();assertHeldEdge(store.directory,{forceProbe:true});
  if(checkSuccessorWeb('admit',env,{store})!==receiptOnly||!same(store.read(sealedName),seal)||
   !same(store.read(marker),witness)||store.exists('transaction.json')||store.exists('policy-transition.json')||
   store.exists('schema-release-pending.json')||store.exists('schema-release-revoked-'+consumed.owner+'.json'))fail();
  return true;
 };
 const ingress=new ModernSchemaIngress({context:handoff.original.context,scope:handoff.original.ingressScope,privateRuntime:runtime,admit:verify});
 const proof=store.read('schema-release-ingress-installed-'+heldOwner+'.json');
 await ingress.check('COMPLETED_WEB_NATIVE_RETIRE');
 if(proof.identitySha256!==witness.ingressIdentitySha256)fail();
 await retireVerifiedIngress({ingress,proof,store,runtime,owner:witness.recoveryOwner,verify,authorizeRemoval,
  binding:{originalOwner:heldOwner,targetSha:target,webOwner:seal.webOwner,apiOwner:consumed.owner,
   archiveSha256:witness.archiveSha256,webSealSha256:canonicalDigest(seal)}});
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const result=await runSuccessorWeb(process.argv[2],process.env);if(result)console.log(result);}catch{console.error('MODERN_SCHEMA_WEB_HOLD');process.exitCode=1;}
}
