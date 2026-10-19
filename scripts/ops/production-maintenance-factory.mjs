/** ONE compiled assembly of the seventeen maintenance producers. Read-source
 * capabilities below are code, never release-plan JSON. This assembly is not
 * installed by the production CLI until its real root source bootstrap and
 * continuous old-to-new fixture have passed. No default or fixture authority. */
import path from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {CONTRACT,verifyContext} from './production-config-guard.mjs';
import {MaintenanceReceiptStore,createMaintenanceEvidence,validateMaintenanceEvidence,bindingDigest,canonicalDigest,same,hold,HASH,iso,MAINTENANCE_EVIDENCE_SCHEMA} from './production-maintenance-receipts.mjs';
import {LegacyMaintenanceDeploymentSession,RELEASE_SCOPE,REQUIRED_PRODUCERS,validateReleasePlan,verifySessionFormalEvidence} from './production-maintenance-deployment-session.mjs';
import {MAINTENANCE_OPERATIONS,validateHealthyPre,validateRecoveryMaterial} from './production-maintenance-transition.mjs';
import {LegacyMaintenanceRuntime,DockerNetworkIsolationProducer,validateExecutorInventory,evaluateLegacyReconciliation} from './production-maintenance-runtime.mjs';
import {PersistentMaintenanceIngressController} from './production-maintenance-ingress-controller.mjs';
import {LegacyMaintenancePublicControl,readLegacyProjection} from './production-maintenance-public-control.mjs';
import {PUBLIC_DIRECTORY,inspectPublicDirectory,readPublicManifest} from './background-control-manifest.mjs';
import {ControlledComposeReplacement,DockerReplacementEvents} from './production-maintenance-replacement.mjs';
import {createMaintenanceCandidateFactory} from './production-maintenance-candidate-factory.mjs';
import {RegisteredMainFastForward} from './production-maintenance-gated-checkout.mjs';
import {promoteLegacyMaintenanceFloor} from './promote-production-config-floor.mjs';
import {beginLegacyMaintenanceDeployment,recordLegacyMaintenanceCandidate,switchLegacyMaintenanceDeployment} from './production-deployment-state.mjs';

const sourceMethods=['assertReady','capturePre','captureRecovery','inventory','infrastructure','verifyInfrastructure',
 'databaseQuiescence','reconciliation','readDatabaseIdentity','verifyAuthority','revalidateCheckout'];
const publicDigest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** The journal accepts only returns observed inside this assembly's compiled
 * producer calls. A disk file or a structurally valid self-hash cannot register
 * evidence. Historical source capsules survive legitimate projection changes;
 * live safety is separately re-observed at every effect. No restart adoption. */
export function createFactorySourceJournal(context,store){
 const issued=new Map(),digest=bindingDigest(context);
 if(!(store instanceof MaintenanceReceiptStore)||store.digest!==digest)hold('FACTORY_EXACT_SOURCE_STORE_REQUIRED');
 const seal=(kind,envelope,source,{cleanupOnly=false}={})=>{
  const {evidenceSha256,...content}=envelope||{};
  if(cleanupOnly){if(!['SESSION_FOREGROUND_SETTLED','SESSION_CHILDREN_JOINED','CANDIDATE_CONTROL_RELEASED'].includes(kind)
   ||content.schema!==MAINTENANCE_EVIDENCE_SCHEMA||content.kind!==kind||content.bindingDigest!==digest
   ||!HASH.test(evidenceSha256||'')||canonicalDigest(content)!==evidenceSha256||!iso(content.capturedAt)
   ||Date.parse(content.capturedAt)<Date.parse(context.window.start)||Date.parse(content.capturedAt)>Date.now())hold('FACTORY_CLEANUP_SOURCE_BINDING');}
  else validateMaintenanceEvidence(envelope,kind,context);
  const capsule=structuredClone({schema:'phoenix.maintenance-factory-source/v1',owner:context.owner,contextDigest:digest,kind,envelope,source,cleanupOnly});
  const file=path.join(store.directory,`maintenance-source-${context.owner}-${evidenceSha256}.json`);
  const prior=issued.get(evidenceSha256);
  if(prior){if(!same(prior.capsule,capsule)||!same(store.read(prior.file),capsule))hold('FACTORY_SOURCE_REUSED_OR_CHANGED');return structuredClone(envelope);}
  store.immutable(file,capsule);if(!same(store.read(file),capsule))hold('FACTORY_SOURCE_PERSIST_FAILED');
  // Never return the capsule or issuer map to a plan, observer, or caller.
  issued.set(evidenceSha256,{file,capsule});return structuredClone(envelope);
 };
 const issue=(kind,body,source,options)=>seal(kind,createMaintenanceEvidence(kind,context,body),source,options);
 const verify=async(envelope,request)=>{
  try{const entry=issued.get(envelope?.evidenceSha256);if(!entry||request.kind!==entry.capsule.kind
   ||request.context&&!same(request.context,context)||request.bindingDigest&&request.bindingDigest!==digest
   ||!same(entry.capsule.envelope,envelope)||!same(store.read(entry.file),entry.capsule))return false;
   if(entry.capsule.cleanupOnly)return request.purpose==='OWNED_RESOURCE_CLEANUP_ONLY';
   validateMaintenanceEvidence(envelope,request.kind,context);return true;
  }catch{return false;}
 };
 return {seal,issue,verify};
}

/** `sources` is supplied only by reviewed compiled root bootstrap code. In
 * particular its infrastructure/recovery observations must contain actual
 * independently checked source facts, not caller approval booleans. The fixed
 * production entry deliberately does not accept this dependency from JSON. */
export function assembleMaintenanceFactory({plan,sources,readControllers}){
 validateReleasePlan(plan);
 if(!sources||sourceMethods.some(name=>typeof sources[name]!=='function')||!readControllers?.graph
  ||typeof readControllers.capturePre!=='function'||typeof readControllers.verifyFormal!=='function')hold('FACTORY_REAL_ROOT_SOURCES_REQUIRED');
 const context=structuredClone(plan.context),digest=bindingDigest(context),store=new MaintenanceReceiptStore(context);
 const guard=()=>verifyContext(CONTRACT.repository,CONTRACT.stateDirectory),proofs=createFactorySourceJournal(context,store),pending=new Set();
 let infrastructure=null,bootstrap=null,candidateFactory,session;
 const read=async(name,request)=>{
  guard();const work=Promise.resolve().then(()=>sources[name](request));pending.add(work);
  try{const result=await work;guard();return result;}finally{pending.delete(work);}
 };
 const verifyAuthority=(approval,request)=>read('verifyAuthority',{approval,...request});
 const inventory=async(request={})=>{
  const result=await read('inventory',{context,...request});
  const expected=request.candidateId?[{...context.preSnapshot.api,id:request.candidateId,revision:context.targetSha,imageId:context.candidate.imageId}]:context.executors;
  validateExecutorInventory(result,expected);return result;
 };
 const ingress=new PersistentMaintenanceIngressController({context,scope:context.networkIsolation.ingressScope,store,authority:{
  async verifyExclusiveWriter(request){
   if(await verifyAuthority(plan.approval,{purpose:'MAINTENANCE',context,bindingDigest:digest,targetSha:context.targetSha})!==true)return false;
   return await read('verifyInfrastructure',{context,evidence:infrastructure,...request})===true;
  },verifyFormalOpen:()=>candidateFactory?.verifyFormalOpen()||false,
 }});
 const network=()=>new DockerNetworkIsolationProducer({context,approval:plan.approval,infrastructureEvidence:infrastructure,store,authority:{verifyAuthority,
  verifyInfrastructure:(evidence,request)=>read('verifyInfrastructure',{evidence,...request})}});
 let isolation=null;
 const observeIsolation=async()=>{
  if(!isolation)hold('FACTORY_NETWORK_ISOLATION_NOT_INSTALLED');
  const persistent=await ingress.observe(),actualInventory=await inventory(),raw=await isolation.observeIngress();
  if(persistent.state!=='FENCED'||persistent.contextDigest!==digest)hold('FACTORY_PERSISTENT_INGRESS_LOST');
  return proofs.issue('INGRESS_FENCE',{...raw.body,inventory:actualInventory,persistentIngressSha256:canonicalDigest(persistent)},
   {networkObservation:raw,persistent,inventory:actualInventory});
 };
 const legacy=new LegacyMaintenanceRuntime({context,authority:{
  verifyAuthorization:(_,operation)=>verifyAuthority(plan.approval,{purpose:'MAINTENANCE',operation,context,bindingDigest:digest,targetSha:context.targetSha}),
  async verifyContext(){guard();await inventory();return true;},
  verifyEvidence:(envelope,kind)=>proofs.verify(envelope,{kind,context}),
 },transport:{
  async fenceIngress(){await ingress.install();isolation=network();await isolation.fenceIngress();},
  observeIngress:observeIsolation,inventory:()=>inventory(),inspect:id=>isolation.inspect(id),stop:id=>isolation.stop(id),
  wait:ms=>delay(ms),databaseQuiescence:()=>read('databaseQuiescence',{context}),
 },evidenceFactory:(kind,_,body)=>proofs.issue(kind,body,{stopIntent:store.read(path.join(store.directory,`maintenance-stop-intent-${context.owner}-${context.preSnapshot.api.id}.json`)),body})});
 candidateFactory=createMaintenanceCandidateFactory({plan,store,issue:proofs.issue,verifyEvidence:proofs.verify,verifyAuthority,ingress,
  readDatabaseIdentity:request=>read('readDatabaseIdentity',{context,...request}),
  async verifyExecutorInventory(request){await inventory(request);return true;}});
 const publicControl=new LegacyMaintenancePublicControl({context},{store,verifyAuthority,verifyEvidence:proofs.verify,
  verifyCandidateBinding:candidateFactory.verifyCandidateBinding});
 const originalBootstrap=publicControl.bootstrap.bind(publicControl),originalAdoption=publicControl.adoptCandidate.bind(publicControl);
 publicControl.bootstrap=async()=>{
  const envelope=await originalBootstrap(),privateRecord=store.read(publicControl.privateFile),manifest=readLegacyProjection(PUBLIC_DIRECTORY,inspectPublicDirectory);
  if(envelope.body.privateRecordSha256!==canonicalDigest(privateRecord)||envelope.body.publicManifestSha256!==publicDigest(manifest))hold('FACTORY_BOOTSTRAP_RETURN_SOURCE_CHANGED');
  bootstrap=proofs.seal('LEGACY_PUBLIC_FENCED',envelope,{privateRecord,manifest});return bootstrap;
 };
 publicControl.adoptCandidate=async request=>{
  const envelope=await originalAdoption(request),privateRecord=store.read(publicControl.modernPrivate),manifest=readPublicManifest(PUBLIC_DIRECTORY);
  const archive=store.read(path.join(store.directory,`maintenance-public-adoption-${context.owner}.json`));
  if(envelope.body.privateRecordSha256!==canonicalDigest(privateRecord)||envelope.body.publicManifestSha256!==publicDigest(manifest)
   ||!same(archive.record,privateRecord)||archive.publicManifestSha256!==publicDigest(manifest))hold('FACTORY_ADOPTION_RETURN_SOURCE_CHANGED');
  return proofs.seal('CANDIDATE_PUBLIC_ADOPTED',envelope,{privateRecord,manifest,archive,adoptionEvidence:request.evidence,participants:request.participants});
 };
 const producers={
  async assertReady(request){
   const source=await read('assertReady',{...request,plan,producerNames:[...REQUIRED_PRODUCERS]});
   if(source?.sourceHelperSha256!==context.sourceHelperSha256||source.actualSourceClosureVerified!==true
    ||source.rootBootstrapVerified!==true||source.readSourceLifecycleTracked!==true)hold('FACTORY_SOURCE_CLOSURE_OR_BOOTSTRAP_UNVERIFIED');
   infrastructure=await read('infrastructure',{context});
   if(await read('verifyInfrastructure',{context,evidence:infrastructure})!==true)hold('FACTORY_INFRASTRUCTURE_UNVERIFIED');
   await inventory();return proofs.issue('SESSION_PRODUCERS_READY',{scope:RELEASE_SCOPE,operations:MAINTENANCE_OPERATIONS,sourceHelperSha256:context.sourceHelperSha256,detachedEffects:false},{source,infrastructure});
  },
  async capturePre(request){
   const recorder=await readControllers.capturePre({signal:request.signal,timeoutMs:10000}),actual=store.read(request.files.pre);
   if(recorder.digest!==canonicalDigest(actual))hold('FACTORY_REAL_PRE_RECORDER_BINDING');
   const source=await read('capturePre',{...request,formalPre:actual});validateHealthyPre(source.body,context);
   return proofs.issue('PRE',source.body,{recorder,formalPre:actual,observations:source.observations});
  },
  async captureRecovery(request){
   validateRecoveryMaterial(request.recoveryPlan,context);const source=await read('captureRecovery',request),body=source?.body;
   if(body?.planDigest!==canonicalDigest(plan.recoveryPlan)||body.materialsAvailable!==true||body.compatibleCandidateImageId!==context.candidate.imageId
    ||body.procedureSha256!==plan.recoveryPlan.procedureSha256||body.operatorConfirmed!==plan.recoveryPlan.responsibleOperator||!HASH.test(body.materialsSha256||''))hold('FACTORY_ACTUAL_RECOVERY_MATERIAL_UNVERIFIED');
   return proofs.issue('RECOVERY_MATERIAL',body,source.observations);
  },
  fenceIngress:()=>legacy.fenceIngress(),
  stopLegacy:()=>legacy.stopLegacy(),
  async collectReconciliation(request){
   const source=await read('reconciliation',{...request,stopped:session.engine.receipt(request.state,'STOP_LEGACY')});
   // This owner-delegated assembly does not manufacture the distinct object-
   // level UNKNOWN_EFFECTS approval. Actual unknown effects remain HOLD.
   if(evaluateLegacyReconciliation(source?.domains).result!=='RECONCILED')hold('FACTORY_FIVE_DOMAINS_UNRECONCILED');
   return {evidence:proofs.issue('RECONCILIATION',{domains:source.domains,approvedScopeDigest:plan.approval.payloadSha256},source.observations),unknownApprovals:[]};
  },
  async preparePromotion(request){
   const typed=async()=>({root:CONTRACT.repository,context,state:request.state,approval:plan.approval,files:request.files,bootstrap:request.bootstrap,isolation:await observeIsolation(),signal:request.signal});
   const dependencies={verifyAuthority,verifyEvidence:proofs.verify,async captureLegacyIsolation(binding){
    if(!same(binding.context,context)||binding.expectedStateDigest!==request.state.stateDigest||!same(binding.state,store.readOwnedState()))hold('FACTORY_LIVE_ISOLATION_REQUEST_CHANGED');
    return observeIsolation();}};
   // The installed OLD guard must validate OLD checkout/floor first. Only the
   // successful CODE_HOLD promotion permits the registered fast-forward.
   const promotion=await promoteLegacyMaintenanceFloor(await typed(),dependencies);
   const checkout=new RegisteredMainFastForward({root:CONTRACT.repository,previousSha:context.previousFloorSha,targetSha:context.targetSha,lockFile:path.join(store.directory,'mutation.lock')},{
    async revalidate(){if(await read('revalidateCheckout',{context,promotion,state:request.state,isolation:await observeIsolation()})!==true)hold('FACTORY_CHECKOUT_SOURCE_UNVERIFIED');},
    writeIntent:value=>store.immutable(path.join(store.directory,`maintenance-checkout-intent-${context.owner}.json`),value),registerOwnedChild:request.registerOwnedChild});
   const checkoutObservation=await checkout.run({signal:request.signal});
   await beginLegacyMaintenanceDeployment(await typed(),dependencies);await recordLegacyMaintenanceCandidate(await typed(),dependencies);await switchLegacyMaintenanceDeployment(await typed(),dependencies);
   const record=store.read(promotion.record);
   return proofs.issue('PROMOTION_PREPARED',{previousFloorSha:context.previousFloorSha,floorSha:context.targetSha,floorVersion:3,phase:'CODE_HOLD',owner:context.owner,
    chanjetPolicy:'HOLD',readonlySync:false,inboundSync:false,runMigration:false,webSwitched:false,promotionRecordSha256:canonicalDigest(record)},
    {record,checkoutObservation});
  },
  captureReplacementIsolation:observeIsolation,
  async verifyEmptyPublicFence(){
   if(!bootstrap)hold('FACTORY_ORIGINAL_PUBLIC_BOOTSTRAP_REQUIRED');
   const observed=await publicControl.observeEmptyFence({expectedStateDigest:store.readOwnedState().stateDigest,bootstrapEvidence:bootstrap});
   return observed.phase==='FENCED'&&observed.contextDigest===digest&&observed.participants.length===0;
  },
  ...candidateFactory.producers,
  async abortAndJoin(request){
   // Only these actual tracked source reads belong to the factory. Session
   // independently joins its own effects/probes/original children; it must not
   // accept a factory zero-count as proof those other resources disappeared.
   await Promise.allSettled([...pending]);
   const networkDebt=isolation?.cleanupDebt(),ingressDebt=ingress.status();
   if(pending.size||request.pendingReadProbes?.length||networkDebt?.pendingAuthorityPromises||ingressDebt.pendingAuthorityReads)hold('FACTORY_FOREGROUND_DEBT_UNSETTLED');
   const retained=readControllers.graph.inventory().participants.map(({role,pid,sourceSha256,argvSha256,phase,originalCloseObserved})=>({role,pid,sourceSha256,argvSha256,phase,originalCloseObserved}));
   return proofs.issue('SESSION_FOREGROUND_SETTLED',{owner:context.owner,stage:request.stage,scope:'FOREGROUND',graphClosed:false,
    foregroundOutstanding:0,activeMutators:0,activeReadProbes:0,outstandingChildren:0,detachedEffects:false,
    childInventorySha256:canonicalDigest([]),retainedParticipantCount:retained.length,retainedControllerInventorySha256:canonicalDigest(retained)},
    {networkDebt:networkDebt||null,ingressDebt,retained},{cleanupOnly:true});
  },
 };
 const makeReplacement=options=>{
  const replacement=new ControlledComposeReplacement(options,{store,verifyAuthority,verifyEvidence:proofs.verify,
   verifyPublicFence:producers.verifyEmptyPublicFence,events:new DockerReplacementEvents({registerChild:child=>session.registerObserverChild(child)})});
  const replace=replacement.replace.bind(replacement);
  replacement.replace=async()=>{
   const envelope=await replace(),intent=store.read(path.join(store.directory,`maintenance-replacement-intent-${context.owner}.json`)),
    result=store.read(path.join(store.directory,`maintenance-replacement-${context.owner}.json`)),events=store.read(path.join(store.directory,`maintenance-replacement-events-${context.owner}.json`));
   if(!same(envelope,result)||canonicalDigest(intent)!==envelope.body.replacementIntentSha256||canonicalDigest(events.events)!==envelope.body.eventsSha256)hold('FACTORY_REPLACEMENT_RETURN_SOURCE_CHANGED');
   return proofs.seal('CANDIDATE_REPLACEMENT',envelope,{intent,result,events,prerequisites:options.prerequisites});};
  return replacement;
 };
 session=new LegacyMaintenanceDeploymentSession({plan},{store,producers,verifyAuthority,verifyEvidence:proofs.verify,publicControl,makeReplacement,controlParticipants:readControllers.graph,
  async verifyFormalFiles(){const actual=verifySessionFormalEvidence({context,files:session.files}),independent=await readControllers.verifyFormal({timeoutMs:10000});
   if(!same(actual.digests,independent.digests)||canonicalDigest(actual.live)!==independent.liveDigest)hold('FACTORY_FORMAL_RECORDER_DISAGREES');return actual;}});
 return Object.freeze({run:()=>session.run(),registry:Object.freeze({names:Object.keys(producers),productionEntryInstalled:false}),
  debt:()=>({pendingSourceReads:pending.size,candidate:candidateFactory.cleanupDebt(),ingress:ingress.status(),network:isolation?.cleanupDebt()||null})});
}
