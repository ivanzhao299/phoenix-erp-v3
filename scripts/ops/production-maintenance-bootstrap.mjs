/** Protected legacy first-switch bootstrap. Compiled sources only; the dispatch
 * payload supplies source-review facts, never programs, paths or approval flags.
 * Preparation writes private evidence/recovery material; only the typed factory
 * may fence/stop/promote/switch. A failed prepare cannot stop the healthy API. */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {CONTRACT,verifyContext,secureJson,git,migrationScope} from './production-config-guard.mjs';
import {executionEnv} from './capture-production-runtime.mjs';
import {canonicalDigest,bindingDigest,hold,same,HASH,SHA,MAINTENANCE_CONTEXT_SCHEMA,MAINTENANCE_AUTHORITY_SCHEMA} from './production-maintenance-receipts.mjs';
import {RELEASE_SCOPE,validateReleasePlan} from './production-maintenance-deployment-session.mjs';
import {MAINTENANCE_OPERATIONS} from './production-maintenance-transition.mjs';
import {captureMaintenanceSourceManifest,inspectMaintenancePreRuntime,captureMaintenanceSchema,captureMaintenanceChanjetPolicy,verifyMaintenanceSourceManifest} from './production-maintenance-root-sources.mjs';
import {createMaintenanceRegistryReader,hashMaintenanceRecoveryFile,verifyInstalledMaintenanceGuard} from './production-maintenance-root-readers.mjs';
import {discoverMaintenanceDatabaseIdentity,DATABASE_OBSERVATION_PSQL} from './production-maintenance-database-observer.mjs';
import {captureLegacyExternalIdentity,legacyExternalIdentityFile,EXTERNAL_SESSION_LISTING_SQL} from './production-maintenance-external-drain.mjs';
import {collectMaintenanceDomainObservation} from './production-maintenance-domain-observer.mjs';
import {collectMaintenanceIotState} from './production-maintenance-iot-state.mjs';
import {collectOwnerDelegatedSourceProvenance,ownerSourceBindingDigest} from './production-maintenance-owner-source-provenance.mjs';
import {registerOwnerMaintenanceGrant} from './production-maintenance-github-authority.mjs';
import {validateOwnerAuthUnknownDecision} from './production-maintenance-owner-unknown.mjs';
import {runProductionMaintenanceSession,retainControllerOnRecoveryIncident} from './production-maintenance-production-entry.mjs';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const guard=()=>verifyContext(CONTRACT.repository,CONTRACT.stateDirectory);
const fixtureProgress=stage=>{
 if(process.env.NATIVE_FIXTURE_FLOW!=='legacy-first-switch'||!process.env.NATIVE_FIXTURE_OUTPUT)return;
 try{fs.writeFileSync(path.join(process.env.NATIVE_FIXTURE_OUTPUT,'progress.json'),JSON.stringify({schema:'phoenix.fixture-progress/v1',stage,at:new Date().toISOString()})+'\n',{mode:0o600});}catch{}
};
const command=(program,args,{input,timeout=10000,buffer=false,maxBuffer=1024*1024}={})=>{
 try{return execFileSync(program,args,{input,env:executionEnv(),encoding:buffer?undefined:'utf8',timeout,maxBuffer,stdio:['pipe','pipe','pipe']});}
 catch{hold('BOOTSTRAP_BOUNDED_COMMAND_FAILED');}
};
const docker=(args,options)=>command('/usr/bin/docker',args,options).trim();
function immutable(file,bytes){
 guard();const fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
 try{fs.fchmodSync(fd,0o600);fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 const dir=fs.openSync(path.dirname(file),fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}guard();
}
const writeJson=(file,value)=>immutable(file,JSON.stringify(value)+'\n');
export function validateLegacyDispatchScope(env=process.env){
 if(env.DEPLOY_MODE!=='api'||env.BUILD_API!=='true'||env.BUILD_WEB!=='false'||env.RUN_MIG!=='false'
  ||env.PRESERVE_ARTIFACTS!=='true'||env.ROTATE_CHANJET_CREDENTIALS!=='false'||env.ONE_TIME_CONFIG_FLOOR_TRANSITION!=='false'
  ||!SHA.test(env.TARGET_SHA||'')||env.APPROVED_CONFIG_FLOOR_SHA!==env.TARGET_SHA||!SHA.test(env.APPROVED_PREVIOUS_FLOOR_SHA||'')
  ||!/^\d+-\d+$/.test(env.DEPLOY_RUN_ID||''))hold('BOOTSTRAP_EXACT_API_ONLY_DISPATCH_REQUIRED');
 return {targetSha:env.TARGET_SHA,previousFloorSha:env.APPROVED_PREVIOUS_FLOOR_SHA,owner:env.DEPLOY_RUN_ID};
}
function decodeSource(value){
 if(typeof value!=='string'||value.length>65536)hold('BOOTSTRAP_SOURCE_INPUT_SIZE');
 let input;try{input=JSON.parse(value);}catch{hold('BOOTSTRAP_SOURCE_INPUT_JSON');}
 if(!input||!input.ownerSource||typeof input.sourceReviewReceiptBase64!=='string'||Object.keys(input).some(key=>!['ownerSource','sourceReviewReceiptBase64'].includes(key)))hold('BOOTSTRAP_SOURCE_INPUT_FIELDS');
 const bytes=Buffer.from(input.sourceReviewReceiptBase64,'base64');
 if(!bytes.length||bytes.length>32768||bytes.toString('base64')!==input.sourceReviewReceiptBase64||digest(bytes)!==input.ownerSource.sourceReviewReceiptDigest)hold('BOOTSTRAP_SOURCE_RECEIPT_BYTES');
 return {ownerSource:input.ownerSource,bytes};
}
async function releaseArtifact(id,expected){
 if(!/^[1-9][0-9]*$/.test(id||'')||!/^sha256:[a-f0-9]{64}$/.test(expected||''))hold('BOOTSTRAP_ACTUAL_ARTIFACT_REQUIRED');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const first=await fetch(`https://api.github.com/repos/ivanzhao299/phoenix-erp-v3/actions/artifacts/${id}/zip`,{redirect:'manual',signal:controller.signal,
   headers:{Authorization:'Bearer '+process.env.GHCR_LOGIN_TOKEN,Accept:'application/vnd.github+json'}});
  let response=first;
  if(first.status===302){
   const location=new URL(first.headers.get('location'));
   if(location.protocol!=='https:'||!['.blob.core.windows.net','.githubusercontent.com'].some(suffix=>location.hostname.endsWith(suffix)))hold('BOOTSTRAP_ARTIFACT_REDIRECT');
   // Deliberately no Authorization on the cross-origin signed download URL.
   response=await fetch(location,{redirect:'error',signal:controller.signal});
  }
  if(!response.ok)hold('BOOTSTRAP_ARTIFACT_DOWNLOAD');
  const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>1024*1024)hold('BOOTSTRAP_ARTIFACT_SIZE');chunks.push(chunk);}
  const bytes=Buffer.concat(chunks);if(!bytes.length||'sha256:'+digest(bytes)!==expected)hold('BOOTSTRAP_ARTIFACT_BYTES');return bytes;
 }catch(error){if(/^MAINTENANCE_HOLD=/.test(error.message))throw error;hold('BOOTSTRAP_ARTIFACT_UNVERIFIED');}finally{clearTimeout(timer);}
}
export function captureLegacyNetworkScope(context){
 const names=JSON.parse(docker(['inspect',context.preSnapshot.api.id,'--format','{{json .NetworkSettings.Networks}}']));
 if(!names||Object.keys(names).length!==1)hold('BOOTSTRAP_EXCLUSIVE_NETWORK_REQUIRED');
 const id=Object.values(names)[0].NetworkID;
 const rows=JSON.parse(docker(['network','inspect',id]));
 if(rows.length!==1)hold('BOOTSTRAP_NETWORK_IDENTITY');
 const n=rows[0],members=Object.keys(n.Containers||{}).sort(),expected=['api','web','db'].map(s=>context.preSnapshot[s].id).sort();
 if(n.Id!==id||n.Driver!=='bridge'||n.Scope!=='local'||n.EnableIPv6!==false||n.Labels?.['com.docker.compose.project']!=='phoenix-erp'
  ||n.IPAM?.Config?.length!==1||!same(members,expected))hold('BOOTSTRAP_EXCLUSIVE_ERP_BRIDGE_REQUIRED');
 const bridge=n.Options?.['com.docker.network.bridge.name']||'br-'+id.slice(0,12);
 if(!/^[a-zA-Z0-9_.-]{1,15}$/.test(bridge))hold('BOOTSTRAP_BRIDGE_NAME');
 const links=JSON.parse(command('/usr/sbin/ip',['-json','-details','link','show','dev',bridge]));
 if(links.length!==1||links[0].ifname!==bridge||links[0].linkinfo?.info_kind!=='bridge')hold('BOOTSTRAP_BRIDGE_IDENTITY');
 // Old compose bytes are already covered by its actual floor guard. Resolve
 // only its approved mount definitions; do not authorize arbitrary live binds.
 const compose=JSON.parse(command('/usr/bin/docker',['compose','--project-directory',CONTRACT.repository,'--file',path.join(CONTRACT.repository,'docker-compose.yml'),'--project-name','phoenix-erp','config','--format','json']));
 const approvedMounts=(compose.services?.api?.volumes||[]).map(m=>({source:m.source,destination:m.target,readWrite:m.read_only!==true}));
 const actual=JSON.parse(docker(['inspect',context.preSnapshot.api.id,'--format','{{json .Mounts}}']));
 if(!Array.isArray(actual)||actual.some(m=>m.Type!=='bind')||!same(actual.map(m=>({source:m.Source,destination:m.Destination,readWrite:m.RW})).sort((a,b)=>a.destination.localeCompare(b.destination)),approvedMounts.sort((a,b)=>a.destination.localeCompare(b.destination))))hold('BOOTSTRAP_OLD_COMPOSE_MOUNT_DRIFT');
 command('/bin/bash',[path.join(CONTRACT.repository,'scripts/ops/require-phoenix-data-mount.sh')]);
 return {approvedMounts,networks:[{id,name:n.Name,driver:n.Driver}],ingressScope:{networkId:id,bridge,interfaceIndex:links[0].ifindex,subnet:n.IPAM.Config[0].Subnet,port:3100}};
}
/** Private material preparation has no authority registration, FENCE or STOP.
 * The exclusive VM exercise reuses these exact default readers and archives;
 * only its separate fixture-owned authority is synthetic. */
export async function prepareMaintenanceRuntimeMaterials({owner,targetSha,previousFloorSha,previousWebSha,window,image}){
 fixtureProgress('PREPARE_START');guard();const root=CONTRACT.repository,state=CONTRACT.stateDirectory;
 if(!/^\d+-\d+$/.test(owner)||![targetSha,previousFloorSha].every(value=>SHA.test(value))
  ||!/^sha256:[a-f0-9]{64}$/.test(image||'')||!Number.isFinite(Date.parse(window?.end)))hold('BOOTSTRAP_EXACT_MATERIAL_REQUEST');
 const preSnapshot=inspectMaintenancePreRuntime();captureMaintenanceChanjetPolicy();
 if(preSnapshot.api.revision!==previousFloorSha||previousWebSha!==undefined&&preSnapshot.web.revision!==previousWebSha)hold('BOOTSTRAP_AUTHORIZED_RUNTIME_CHANGED');
 // Objective source fact: the old control endpoint must really be absent. A
 // status timeout, 401/403/500, or modern endpoint is never legacy permission.
 const status=command('/usr/bin/curl',['--silent','--output','/dev/null','--max-time','3','--write-out','%{http_code}','http://127.0.0.1:3100/api/internal/background/status']).trim();
 if(status!=='404')hold('BOOTSTRAP_LEGACY_404_REQUIRED');
 const sourceManifest=captureMaintenanceSourceManifest(root,targetSha);verifyMaintenanceSourceManifest(sourceManifest,{target:targetSha});
 const migration=migrationScope(root,previousFloorSha,targetSha);if(migration.changed.length)hold('BOOTSTRAP_MIGRATION_PATH_CHANGED');
 const revision=docker(['image','inspect',image,'--format','{{index .Config.Labels "org.opencontainers.image.revision"}}']);
 if(!/^sha256:[a-f0-9]{64}$/.test(image)||revision!==targetSha)hold('BOOTSTRAP_CANDIDATE_REVISION');
 const now=Date.now(),end=Math.min(now+CONTRACT.maximumTransitionMs,Date.parse(window.end));
 const context={schema:MAINTENANCE_CONTEXT_SCHEMA,protocolVersion:1,owner,previousFloorSha,previousApiSha:previousFloorSha,previousWebSha:preSnapshot.web.revision,targetSha,
  window:{start:new Date(now).toISOString(),end:new Date(end).toISOString()},candidate:{imageId:image,revision:targetSha},preSnapshot,executors:[preSnapshot.api],migrationPaths:[],sourceHelperSha256:canonicalDigest(sourceManifest),schemaEvidenceSha256:'0'.repeat(64),
  replacement:{project:'phoenix-erp',composeFileSha256:digest(command('/usr/bin/git',['-c',`safe.directory=${root}`,'show',`${targetSha}:docker-compose.yml`],{buffer:true}))}};
 const schema=captureMaintenanceSchema(context);context.schemaEvidenceSha256=canonicalDigest(schema);context.networkIsolation=captureLegacyNetworkScope(context);
 const termPins=context.executors.map(p=>Object.fromEntries(['id','imageId','revision','startedAt','restartCount'].map(k=>[k,p[k]])));
 context.terminationPolicy={schema:'phoenix.legacy-termination-policy/v1',protocol:'STOP_AND_RECONCILE',owner,targetSha,window:context.window,executors:termPins,method:'DOCKER_STOP',stopSignal:'SIGTERM',timeoutSeconds:30,timeoutEscalation:'DOCKER_SIGKILL',commandTimeoutMs:35000,maxAttempts:1,recoveryOperator:'emvia'};
 const db=preSnapshot.db,identity=discoverMaintenanceDatabaseIdentity({containerId:db.id,imageId:db.imageId,containerStartedAt:db.startedAt}),{postmasterStartedAt,...domainPin}=identity;
 const facts=collectMaintenanceDomainObservation({...domainPin,oldApiContainerId:preSnapshot.api.id,previousFloorSha,targetSha});
 const notification=JSON.parse(docker(['exec',preSnapshot.api.id,'node','-e',"console.log(JSON.stringify({pushInitialized:['VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT'].every(k=>!!process.env[k])}))"]));
 const preDomains={facts,iot:collectMaintenanceIotState(context),notification};
 // Read-only admission before generating a maintenance plan. This does not
 // grant object-scoped acceptance for old external authentication effects.
 if(facts.remoteAuthenticationOutcome==='UNKNOWN'){
  const decision=secureJson(path.join(state,`owner-scoped-auth-unknown-${targetSha}.json`));
  context.scopedUnknownDecisionSha256=canonicalDigest(decision);
  validateOwnerAuthUnknownDecision(decision,context);
 }
 const materialDir=path.join(state,`maintenance-materials-${owner}`);fs.mkdirSync(materialDir,{mode:0o700});
 const procedure=`API-only HOLD ${previousFloorSha} -> ${targetSha}\nOperator emvia. Retain all markers on HOLD. No old API automatic rollback, database restore, business replay, Web switch or migration. Use the archived compatible candidate and exact source manifest for manual inspection; do not restart a below-floor API.\n`;
 immutable(path.join(materialDir,'procedure.txt'),procedure);writeJson(path.join(materialDir,'source-manifest.json'),sourceManifest);
 writeJson(path.join(materialDir,'pre.json'),{owner,targetSha,previousFloorSha,runtime:preSnapshot});
 const oldFiles=captureMaintenanceSourceManifest(root,previousFloorSha).files.map(entry=>entry.path);
 fixtureProgress('PREVIOUS_GUARD_ARCHIVE_START');
 command('/usr/bin/git',['-c',`safe.directory=${root}`,'archive','--format=tar',`--output=${path.join(materialDir,'previous-guard.tar')}`,previousFloorSha,...oldFiles],{timeout:30000});fs.chmodSync(path.join(materialDir,'previous-guard.tar'),0o600);
 fixtureProgress('PREVIOUS_GUARD_ARCHIVE_DONE');fixtureProgress('CANDIDATE_IMAGE_SAVE_START');
 docker(['image','save','--output',path.join(materialDir,'candidate-image.tar'),image],{timeout:120000});fs.chmodSync(path.join(materialDir,'candidate-image.tar'),0o600);fixtureProgress('CANDIDATE_IMAGE_SAVE_DONE');
 const files=[];for(const name of ['candidate-image.tar','previous-guard.tar','source-manifest.json','pre.json','procedure.txt']){
  fixtureProgress(`HASH_START:${name}`);const file=path.join(materialDir,name),stat=fs.statSync(file);const sha256=command('/usr/bin/sha256sum',[file],{timeout:30000}).split(' ')[0];
  await hashMaintenanceRecoveryFile(file,{bytes:stat.size,sha256});files.push({name,bytes:stat.size,sha256});fixtureProgress(`HASH_DONE:${name}`);
 }
 fixtureProgress('REGISTRY_START');
 const registry=await createMaintenanceRegistryReader(context).registry();
 fixtureProgress('REGISTRY_DONE');
 const packet={schema:'phoenix.maintenance-root-source-data/v1',sourceManifest,registry,recovery:{files},preDomains};context.rootSourceDataSha256=canonicalDigest(packet);
 fixtureProgress('PACKET_DONE');
 // Immutable pre-stop identity of the legacy API's external database client,
 // recorded while the old container is still attached and its pool sessions
 // are live. Pure observation (network membership + actual pg_stat_activity
 // rows); the context digest is computed only after every context field is
 // final. The fixture-only external drain protocol revalidates this exact
 // record after the stop before any bounded effect; production never drains.
 const legacyNetworkId=context.networkIsolation.networks[0].id;
 const legacyNetworkMembers=Object.entries(JSON.parse(docker(['network','inspect',legacyNetworkId,'--format','{{json .Containers}}'])))
  .map(([id,value])=>({id,ipv4Address:value?.IPv4Address}));
 const legacyExternalSessions=JSON.parse(docker(['exec','-i',preSnapshot.db.id,'/bin/sh','-c',DATABASE_OBSERVATION_PSQL],{input:EXTERNAL_SESSION_LISTING_SQL}));
 fixtureProgress('LEGACY_EXTERNAL_IDENTITY_DONE');
 writeJson(legacyExternalIdentityFile(state,owner),captureLegacyExternalIdentity({context,networkId:legacyNetworkId,
  containers:legacyNetworkMembers,sessions:legacyExternalSessions,capturedAt:new Date().toISOString()}));
 const procedureSha256=digest(procedure),recoveryPlan={bindingDigest:bindingDigest(context),strategy:'COMPATIBLE_CANDIDATE_OR_HOLD',automaticOldRuntimeRollback:false,automaticDatabaseRestore:false,businessReplay:false,responsibleOperator:'emvia',procedureSha256,
  materials:[{kind:'CANDIDATE_IMAGE',sha256:files[0].sha256,imageId:image,revision:targetSha},{kind:'SOURCE_HELPERS',sha256:context.sourceHelperSha256},{kind:'PRE_SNAPSHOT',sha256:canonicalDigest(preSnapshot)},{kind:'RECOVERY_PROCEDURE',sha256:procedureSha256}],stopConditions:['INGRESS_LOST','UNKNOWN_SIDE_EFFECTS','CANDIDATE_FAILED','FLOOR_STATE_INCONSISTENT']};
 const payload={protocol:'STOP_AND_RECONCILE',operations:[...MAINTENANCE_OPERATIONS],recoveryPlanDigest:canonicalDigest(recoveryPlan),preSnapshotDigest:canonicalDigest(preSnapshot),terminationPolicySha256:canonicalDigest(context.terminationPolicy)};
 return {context,packet,recoveryPlan,payload};
}

export async function bootstrapLegacyFirstSwitch(){
 guard();const pins=validateLegacyDispatchScope(),{owner,targetSha,previousFloorSha}=pins,root=CONTRACT.repository,state=CONTRACT.stateDirectory;
 if(git(root,['rev-parse','HEAD'])!==previousFloorSha||git(root,['status','--porcelain','--untracked-files=all'])
  ||git(root,['ls-remote','origin','refs/heads/main'])!==`${targetSha}\trefs/heads/main`)hold('BOOTSTRAP_MAIN_OR_OLD_CHECKOUT_CHANGED');
 for(const file of ['transaction.json','policy-transition.json','maintenance-current.json','maintenance-transaction.json'])if(fs.existsSync(path.join(state,file)))hold('BOOTSTRAP_UNFINISHED_TRANSACTION');
 const floor=secureJson(path.join(state,'floor.json')),active=secureJson(path.join(state,'active.json'));
 if(floor.version!==3||floor.phase!=='READY'||floor.floorSha!==previousFloorSha||floor.chanjetPolicy!=='HOLD'||floor.readonlyApproval!==null||active.outcome!=='SUCCESS')hold('BOOTSTRAP_OLD_FLOOR_NOT_READY');
 verifyInstalledMaintenanceGuard();
 const template=secureJson(path.join(state,`owner-release-authorization-template-${targetSha}.json`));
 if(template.schema!=='phoenix.owner-maintenance-instruction/v1'||template.origin!=='TRUSTED_INTERACTIVE_USER'
  ||template.targetSha!==targetSha||template.previousFloorSha!==previousFloorSha||!same(template.scope,RELEASE_SCOPE)
  ||!HASH.test(template.authorizationDigest||'')||!HASH.test(template.maintenanceWindowConfirmationDigest||'')
  ||template.delegate?.githubUserId!==7245339||template.delegate?.githubLogin!=='emvia'
  ||!Number.isFinite(Date.parse(template.window?.start))||!Number.isFinite(Date.parse(template.window?.end))
  ||Date.now()<Date.parse(template.window.start)||Date.now()+180000>=Date.parse(template.window.end))hold('BOOTSTRAP_REAL_OWNER_WINDOW_REQUIRED');
 const source=decodeSource(process.env.MAINTENANCE_RELEASE_INPUT);
 if(source.ownerSource.expectedMainSha!==targetSha||source.ownerSource.ownerDelegationDigest!==template.authorizationDigest)hold('BOOTSTRAP_SOURCE_OWNER_BINDING');
 const provenance=await collectOwnerDelegatedSourceProvenance(source.ownerSource);
 if(provenance.outcome!=='SERVER_SOURCE_FACTS_VERIFIED')hold('BOOTSTRAP_EXACT_SOURCE_COMMENT_REQUIRED');
 // Candidate preparation precedes any ingress/floor/container mutation.
 if(!process.env.GHCR_LOGIN_TOKEN)hold('BOOTSTRAP_EPHEMERAL_ACTIONS_TOKEN_REQUIRED');
 docker(['login','ghcr.io','--username','ivanzhao299','--password-stdin'],{input:process.env.GHCR_LOGIN_TOKEN});
 const tag=`ghcr.io/ivanzhao299/phoenix-erp-v3/api:sha-${targetSha}`;
 docker(['pull',tag],{timeout:120000});
 const image=JSON.parse(docker(['image','inspect',tag,'--format','{{json .Id}}']));
 const {context,packet,recoveryPlan,payload}=await prepareMaintenanceRuntimeMaterials({owner,targetSha,previousFloorSha,
  previousWebSha:template.previousWebSha,window:template.window,image});
 const artifact=await releaseArtifact(process.env.MAINTENANCE_RELEASE_ARTIFACT_ID,process.env.MAINTENANCE_RELEASE_ARTIFACT_DIGEST);
 const [runId,attempt]=owner.split('-').map(Number),grant={schema:'phoenix.owner-delegated-maintenance-grant/v1',repository:'ivanzhao299/phoenix-erp-v3',authorityKind:'OWNER_DELEGATED',authorizationOrigin:'TRUSTED_INTERACTIVE_USER',authorizationRef:template.authorizationRef,authorizationDigest:template.authorizationDigest,delegate:template.delegate,context,
  source:{headSha:source.ownerSource.sourceHeadSha,treeSha:source.ownerSource.sourceTreeSha,prNumber:source.ownerSource.prNumber,reviewId:source.ownerSource.reviewId,reviewRecordDigest:provenance.rawReviewRecordSha256,sourceProvenanceDigest:ownerSourceBindingDigest(provenance),mergedMainSha:targetSha},
  dispatch:{runId,attempt,actorId:7245339,workflowSha:targetSha,workflowPath:'.github/workflows/deploy.yml',event:'workflow_dispatch'},maintenanceWindowConfirmationDigest:template.maintenanceWindowConfirmationDigest,scope:RELEASE_SCOPE,payloadSha256:canonicalDigest(payload),
  evidence:{preSnapshotDigest:canonicalDigest(context.preSnapshot),recoveryMaterialDigest:canonicalDigest(packet.recovery.files),candidateImageId:image,releaseArtifactId:Number(process.env.MAINTENANCE_RELEASE_ARTIFACT_ID),releaseArtifactDigest:digest(artifact)},registeredAt:new Date().toISOString(),expiresAt:context.window.end};
 const approval={schema:MAINTENANCE_AUTHORITY_SCHEMA,authorityKind:'OWNER_DELEGATED',decision:'AUTHORIZED',purpose:'MAINTENANCE',bindingDigest:bindingDigest(context),payload,payloadSha256:canonicalDigest(payload),ownerGrantSha256:canonicalDigest(grant)};
 const instruction=Object.fromEntries(['schema','origin','authorizationRef','authorizationDigest','maintenanceWindowConfirmationDigest','previousFloorSha','targetSha','window','delegate','scope'].map(k=>[k,template[k]]));
 writeJson(path.join(state,`maintenance-owner-instruction-${owner}.json`),instruction);immutable(path.join(state,`maintenance-release-artifact-${owner}.zip`),artifact);
 writeJson(path.join(state,`maintenance-root-source-data-${owner}.json`),packet);
 await registerOwnerMaintenanceGrant({grant,approval,ownerSource:source.ownerSource});
 const plan=validateReleasePlan({schema:'phoenix.legacy-maintenance-release-plan/v1',context,scope:RELEASE_SCOPE,approvedPreviousFloorSha:previousFloorSha,approvedFloorSha:targetSha,approval,recoveryPlan});
 writeJson(path.join(state,`maintenance-release-plan-${owner}.json`),plan);
 guard();return runProductionMaintenanceSession();
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{if(process.argv.length!==3||process.argv[2]!=='run')hold('BOOTSTRAP_FIXED_COMMAND_REQUIRED');await bootstrapLegacyFirstSwitch();console.log('LEGACY_FIRST_SWITCH=SUCCESS');}
 catch(error){console.error(/^\w+_HOLD=[A-Z0-9_]+$/.test(error.message)?error.message:'MAINTENANCE_HOLD=BOOTSTRAP_FAILED');process.exitCode=1;retainControllerOnRecoveryIncident(error);}
}
