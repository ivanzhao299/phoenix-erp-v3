/** The ordinary Web transaction consumes the exact image inspected before the
 * API maintenance. All checks run on the root host under the same deploy FD9. */
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {ModernSchemaRegistry} from './production-modern-schema-registration.mjs';
import {readRegisteredModernSchemaApproval} from './production-modern-schema-authority.mjs';
import {captureRuntime,executionEnv} from './capture-production-runtime.mjs';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {successorDecisions,successorWebReserveMs} from './production-modern-schema-successor.mjs';

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
  if(selection&&selection!=='web1123-'+owner)fail();
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
 if(['admit','before'].includes(phase)&&Date.parse(context.window.end)-(deps.now??Date.now)()<successorWebReserveMs)fail();
 const original=(deps.readApproval??readRegisteredModernSchemaApproval)(context);
 const formal=store.read('deploy-'+owner+'.json');
 const terminal=store.exists('schema-release-terminal-'+owner+'.json')?store.read('schema-release-terminal-'+owner+'.json'):null;
 const archive=store.exists('schema-release-forward-terminal-archive-'+owner+'.json')?store.read('schema-release-forward-terminal-archive-'+owner+'.json'):null;
 const receiptMatches=terminal?.schema==='phoenix.modern-schema-terminal-open/v1'&&terminal.phase==='COMPLETED_OPEN'&&
    terminal.formalDeploymentSha256===canonicalDigest(formal)&&terminal.defaultOff===true&&terminal.contextDigest===canonicalDigest(context);
 const intent=archive&&store.read('schema-release-open-commit-intent-'+owner+'.json');
 const archiveMatches=archive?.schema==='phoenix.modern-schema-forward-terminal-archive/v1'&&archive.defaultOff===true&&
    archive.contextDigest===canonicalDigest(context)&&archive.openCommitIntentSha256===canonicalDigest(intent)&&intent.formalDeploymentSha256===canonicalDigest(formal);
 const pins=(deps.captureRuntime??captureRuntime)();
 const webRef='ghcr.io/ivanzhao299/phoenix-erp-v3/web:sha-'+target;
 if(!same(decisions,prepared.successorDecisions)||original.grant.authorizationDigest!==consumed.authorizationDigest||context.owner!==owner||context.targetSha!==target||
    consumed.preparationSha256!==prepared.preparationSha256||consumed.targetSha!==target||(!receiptMatches&&!archiveMatches)||
    formal.outcome!=='SUCCESS'||formal.target!==target||formal.deployMode!=='api'||formal.active.api.imageId!==context.candidateImageId||
    pins.api.imageId!==context.candidateImageId||pins.api.revision!==target)fail();
 if(phase==='admit')return;
 const image=(deps.image??(ref=>execFileSync('/usr/bin/docker',['image','inspect',ref,'--format','{{.Id}} {{index .Config.Labels "org.opencontainers.image.revision"}}'],
   {env:executionEnv(),encoding:'utf8',timeout:5000,stdio:['ignore','pipe','pipe']}).trim()))(webRef);
 if(image!==decisions.webImageId+' '+target||
   phase!=='before'&&(pins.web.imageId!==decisions.webImageId||pins.web.revision!==target))fail();
 if(phase==='seal'){
  const webOwner=env.DEPLOY_RUN_ID;
  if(!/^[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$/.test(webOwner)||webOwner===owner)fail();
  const web=store.read('deploy-'+webOwner+'.json');
  if(web.deployMode!=='web'||web.outcome!=='SUCCESS'||web.target!==target||!same(web.active,pins))fail();
  store.immutable(sealedName,{schema:'phoenix.remediation-1123-completed-web/v1',apiOwner:owner,webOwner,targetSha:target,
   formalSha256:canonicalDigest(web),apiImageId:pins.api.imageId,webImageId:pins.web.imageId});
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{checkSuccessorWeb(process.argv[2],process.env);}catch{console.error('MODERN_SCHEMA_WEB_HOLD');process.exitCode=1;}
}
