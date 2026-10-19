/** Candidate half of the ONE maintenance factory. All capabilities are compiled
 * by its root factory, never deserialized from the release plan. This module
 * does not install a production registry or grant release authority. */
import path from 'node:path';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {CONTRACT,verifyContext} from './production-config-guard.mjs';
import {MaintenanceReceiptStore,bindingDigest,canonicalDigest,same,hold,HASH} from './production-maintenance-receipts.mjs';
import {acquireRootControlLease} from './production-maintenance-root-lease.mjs';
import {OwnedCandidateBindingObserver} from './production-maintenance-owned-candidate-observer.mjs';
import {OwnedCandidateObservationQueue} from './production-maintenance-observation-queue.mjs';
import {collectCandidateServerBinding} from './production-maintenance-candidate-binding.mjs';
import {readLegacyProjection} from './production-maintenance-public-control.mjs';
import {inspectDockerRuntime} from './production-maintenance-runtime.mjs';
import {completeLegacyMaintenanceDeployment} from './production-deployment-state.mjs';
import {BackgroundManifestPublisher,HOLD_KINDS,PUBLIC_DIRECTORY,readPublicManifest,inspectPublicDirectory,validateParticipants} from './background-control-manifest.mjs';

const pinKeys=['id','imageId','revision','startedAt','restartCount'];
const pinEqual=(a,b)=>pinKeys.every(key=>a?.[key]===b?.[key]);
const dbPinEqual=(a,b)=>pinKeys.filter(key=>key!=='revision').every(key=>a?.[key]===b?.[key]);
const manifestDigest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Serializes the whole binding/ingress/inventory capture, not only the SQL
 * reader inside it. Waiting consumes the original budget. Expiry poisons the
 * gate and retains actual unsettled work for close; it never clears that debt. */
export class MaintenanceObservationGate{
 #tail=Promise.resolve();#pending=new Set();#fatal=null;#closing=false;#joined=null;#window;
 constructor(window){if(!window||!Number.isFinite(Date.parse(window.start))||!Number.isFinite(Date.parse(window.end))||Date.parse(window.start)>=Date.parse(window.end))hold('FACTORY_OBSERVATION_WINDOW');this.#window=structuredClone(window);}
 #poison(code){this.#fatal||=Error('MAINTENANCE_HOLD=FACTORY_OBSERVATION_'+code);for(const entry of this.#pending)entry.controller.abort();return this.#fatal;}
 async run(options,action){
  if(this.#fatal)throw this.#fatal;if(this.#closing)hold('FACTORY_OBSERVATION_CLOSING');
  const {timeoutMs=10000,signal}=options||{};
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000||typeof action!=='function'||signal&&!(signal instanceof AbortSignal))hold('FACTORY_OBSERVATION_BUDGET');
  const wall=Date.now(),mono=performance.now(),previous=this.#tail,controller=new AbortController(),entry={controller,work:null};let timer;
  let lastWall=wall,lastMono=mono;
  const remaining=()=>{const now=Date.now(),at=performance.now();if(this.#fatal)throw this.#fatal;
   if(this.#closing||signal?.aborted||controller.signal.aborted||now<lastWall||at<lastMono||now-wall>=timeoutMs||at-mono>=timeoutMs
    ||now<Date.parse(this.#window.start)||now>=Date.parse(this.#window.end))throw this.#poison('DEADLINE_OR_ABORT');
   lastWall=now;lastMono=at;return Math.max(1,Math.floor(Math.min(timeoutMs-(now-wall),timeoutMs-(at-mono),Date.parse(this.#window.end)-now)));};
  const abort=()=>{this.#poison('ABORTED');};signal?.addEventListener('abort',abort,{once:true});
  try{
   remaining();this.#pending.add(entry);
   entry.work=previous.then(async()=>{const value=await action({signal:controller.signal,remaining,timeoutMs:remaining()});remaining();return value;})
    .catch(error=>{throw this.#poison(error?.message==='MAINTENANCE_HOLD=FACTORY_OBSERVATION_DEADLINE_OR_ABORT'?'DEADLINE_OR_ABORT':'SOURCE_FAILED');});
   this.#tail=entry.work.then(()=>undefined,()=>undefined);
   entry.work.then(()=>this.#pending.delete(entry),()=>this.#pending.delete(entry));
   return await Promise.race([entry.work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(this.#poison('DEADLINE')),remaining());})]);
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 }
 debt(){return {pendingCaptures:this.#pending.size,closing:this.#closing,failed:this.#fatal!==null};}
 join({timeoutMs=10000}={}){
  if(this.#joined)return this.#joined;if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)hold('FACTORY_OBSERVATION_JOIN_BUDGET');
  this.#closing=true;for(const entry of this.#pending)entry.controller.abort();
  return this.#joined=(async()=>{let timer;try{await Promise.race([Promise.allSettled([...this.#pending].map(entry=>entry.work)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('MAINTENANCE_HOLD=FACTORY_OBSERVATION_CAPTURE_UNSETTLED')),timeoutMs);})]);if(this.#pending.size)hold('FACTORY_OBSERVATION_CAPTURE_UNSETTLED');}finally{clearTimeout(timer);}})();
 }
}
/** The same ordered keys as BackgroundManifestPublisher.open. Canonical JSON is
 * deliberately not used for the externally established manifest protocol. */
export function nextMaintenanceOpenManifest(current,context,participants){
 validateParticipants(participants,{targetSha:context.targetSha});
 if(current?.phase!=='FENCED'||current.owner!==context.owner||current.targetSha!==context.targetSha||current.generation!==2
  ||!same(current.participants,participants))hold('FACTORY_OPEN_FROM_OWNED_ADOPTED_FENCE_REQUIRED');
 return {protocolVersion:1,phase:'OPEN',owner:context.owner,generation:current.generation+1,targetSha:context.targetSha,participants};
}
export function createMaintenanceCandidateFactory({plan,store,issue,verifyEvidence,verifyAuthority,ingress,readDatabaseIdentity,verifyExecutorInventory}){
 const context=structuredClone(plan.context),owner=context.owner,digest=bindingDigest(context);
 if(!(store instanceof MaintenanceReceiptStore)||![issue,verifyEvidence,verifyAuthority,readDatabaseIdentity,verifyExecutorInventory].every(f=>typeof f==='function')
  ||!ingress||typeof ingress.observe!=='function'||typeof ingress.release!=='function'||typeof ingress.status!=='function')hold('FACTORY_FIXED_CANDIDATE_CAPABILITIES_REQUIRED');
 let root=null,queue=null,replacement=null,candidate=null,lease=null,health=null,closed=null,originalState=null;
 const captures=new MaintenanceObservationGate(context.window);
 const guard=()=>verifyContext(CONTRACT.repository,CONTRACT.stateDirectory);
 const state=()=>{guard();const value=store.readOwnedState();if(value.contextDigest!==digest)hold('FACTORY_CANDIDATE_OWNER_CHANGED');return value;};
 const participants=()=>{if(!candidate)hold('FACTORY_CANDIDATE_NOT_REGISTERED');return [{containerId:candidate.api.id,revision:context.targetSha,bootId:candidate.bootId,allowedKinds:[...HOLD_KINDS]}];};
 const formal=()=>{const value=store.read(path.join(store.directory,`deploy-${owner}.json`));if(value.outcome!=='SUCCESS'||value.target!==context.targetSha||value.floorSha!==context.targetSha
  ||value.deployMode!=='api'||value.switched?.api!==true||value.switched?.web!==false||value.maintenance?.owner!==owner)hold('FACTORY_FORMAL_SUCCESS_REQUIRED');return value;};
 // Adoption changes the public and private projection inside the Session's
 // public-control adapter. Derive mode from actual source on EVERY read; a
 // later health producer cannot repair a stale PRE_ADOPTION mode.
 const mode=()=>{
  const current=state();
  if(!['CANDIDATE_REPLACED','CANDIDATE_FENCED','VERIFIED_FENCED','COMPLETED_OPEN'].includes(current.phase)
   ||current.phase==='COMPLETED_OPEN'&&current.status!=='OPEN_COMMIT_PENDING')hold('FACTORY_FENCED_OBSERVATION_PHASE');
  if(fs.existsSync(path.join(store.directory,'background-control.json'))){const publicValue=readPublicManifest(PUBLIC_DIRECTORY);if(publicValue.generation===2&&publicValue.phase==='FENCED'&&publicValue.owner===owner&&publicValue.targetSha===context.targetSha){
   const privateValue=store.read(path.join(store.directory,'background-control.json'));
   if(privateValue.phase!=='FENCED'||privateValue.owner!==owner||privateValue.generation!==2||privateValue.manifestDigest!==manifestDigest(publicValue)||privateValue.maintenanceContextDigest!==digest)hold('FACTORY_ADOPTION_SOURCE_CHANGED');
   return 'ADOPTED';
  }hold('FACTORY_UNEXPECTED_MODERN_PROJECTION');}
  const legacy=readLegacyProjection(PUBLIC_DIRECTORY,inspectPublicDirectory);
  if(legacy.owner!==owner||legacy.targetSha!==context.targetSha)hold('FACTORY_LEGACY_PROJECTION_CHANGED');
  return 'PRE_ADOPTION';
 };
 const observe=options=>captures.run(options,async budget=>{
  if(!queue||!replacement)hold('FACTORY_ORIGINAL_CANDIDATE_OBSERVER_REQUIRED');const before=state();
  const observation=await queue.observe({expectedStateDigest:before.stateDigest,mode:mode(),timeoutMs:budget.remaining(),signal:budget.signal});budget.remaining();
  const isolation=await ingress.observe();budget.remaining();if(await verifyExecutorInventory({phase:before.phase,candidateId:observation.runtime.api.id,signal:budget.signal})!==true)hold('FACTORY_EXECUTOR_INVENTORY_UNVERIFIED');budget.remaining();
  if(!same(state(),before)||observation.contextDigest!==digest||observation.stateDigest!==before.stateDigest||observation.candidateReplacementSha256!==replacement.evidenceSha256
   ||isolation.state!=='FENCED'||isolation.contextDigest!==digest||isolation.owner!==owner)hold('FACTORY_CANDIDATE_OBSERVATION_CHANGED');
  return {observation,isolation};
 });
 const verifyCompanions=()=>{
  for(const service of ['web','db']){const actual=inspectDockerRuntime(context.preSnapshot[service].id);if(!(service==='db'?dbPinEqual:pinEqual)(actual,context.preSnapshot[service])||actual.running!==true||actual.health!=='healthy')hold('FACTORY_WEB_DB_CHANGED');}
 };
 const observedCandidate=({observation,isolation})=>{
  const api=inspectDockerRuntime(observation.runtime.api.id);
  if(!pinEqual(api,observation.runtime.api)||!pinEqual(api,replacement.body.candidate)||api.running!==true||api.health!=='healthy'
   ||api.imageId!==context.candidate.imageId||api.revision!==context.targetSha)hold('FACTORY_ACTUAL_CANDIDATE_RUNTIME_REQUIRED');
  verifyCompanions();
  const status=observation.status;
  if(status.owner!==owner||status.phase!=='FENCED'||status.inFlight!==0||status.pendingChildren!==0||status.taskGraphs!==0
   ||status.poisoned!==false||status.stopping!==false||status.controlSession?.connected!==true||status.controlSession.broken!==false)hold('FACTORY_BACKGROUND_NOT_DENIED_AND_EMPTY');
  // FENCED + actual exclusive root admission lock + independently observed API
  // control backend is the typed source of DENIED; statusSnapshot intentionally
  // has no synthetic admissionState field.
  return {owner,api:structuredClone(candidate?.api||api),bootId:status.bootId,controlSession:structuredClone(status.controlSession),admissionState:'DENIED',
   inFlight:status.inFlight,pendingChildren:status.pendingChildren,taskGraphs:status.taskGraphs,poisoned:status.poisoned,stopping:status.stopping,
   chanjetPolicy:'HOLD',readonlySync:false,inboundSync:false,web:structuredClone(context.preSnapshot.web),db:structuredClone(context.preSnapshot.db),
   candidateReplacementSha256:replacement.evidenceSha256,continuousIngress:true,unknownExecutors:0,runMigration:false,
   isolationObservationSha256:canonicalDigest(isolation),bindingObservationSha256:canonicalDigest(observation)};
 };
 const leaseProof=async options=>{
  const sources=await observe(options),body=observedCandidate(sources);
  if(candidate&&(!pinEqual(body.api,candidate.api)||body.bootId!==candidate.bootId||!same(body.controlSession,candidate.controlSession)))hold('FACTORY_CANDIDATE_INCARNATION_CHANGED');
  // root observations have already independently verified the exact original
  // server backend and both held exclusive advisory locks.
  return issue('CANDIDATE_CONTROL_LEASE',{...body,phase:'FENCED',connected:true,admissionExclusive:true,executionExclusive:true},sources);
 };
 const close=(options={})=>closed||=(async()=>{
  const started=performance.now(),timeoutMs=options.timeoutMs??10000;
  if(!queue)hold('FACTORY_ORIGINAL_ROOT_NOT_REGISTERED');await captures.join({timeoutMs});
  // The ingress adapter separately retains abort-ignoring authority reads after
  // its outer timeout. A settled capture does not settle that inner resource.
  if(ingress.status().pendingAuthorityReads!==0)hold('FACTORY_INGRESS_AUTHORITY_READ_UNSETTLED');
  const remaining=Math.floor(timeoutMs-(performance.now()-started));if(remaining<1)hold('FACTORY_ORIGINAL_ROOT_RELEASE_BUDGET');
  const released=await queue.close({timeoutMs:remaining});
  if(released.rootRelease?.ownedBackendGone!==true||released.rootRelease.localClientClosed!==true||!HASH.test(released.rootRelease.serverObservationSha256||''))hold('FACTORY_ORIGINAL_RELEASE_UNVERIFIED');
  return issue('CANDIDATE_CONTROL_RELEASED',{owner,connected:false,admissionExclusive:false,executionExclusive:false,ownedBackendGone:true,
   serverObservationSha256:released.rootRelease.serverObservationSha256},{released},{cleanupOnly:true});
 })();
 const producers={
  async registerStartedCandidate(request){
   if(root||queue||lease||candidate)hold('FACTORY_CANDIDATE_REGISTRATION_REUSED');replacement=structuredClone(request.replacement);originalState=state();
   if(originalState.phase!=='CANDIDATE_REPLACED'||originalState.stateDigest!==request.state.stateDigest||await verifyEvidence(replacement,{kind:'CANDIDATE_REPLACEMENT',context})!==true)hold('FACTORY_REPLACEMENT_REQUIRED');
   const database=await readDatabaseIdentity({signal:request.signal});
   root=await acquireRootControlLease({context,approval:plan.approval,expectedStateDigest:originalState.stateDigest,database,
    registerOwnedChild:request.registerOwnedChild,signal:request.signal,timeoutMs:30000},{store,verifyAuthority});
   try{queue=new OwnedCandidateObservationQueue(new OwnedCandidateBindingObserver({context,replacementEvidence:replacement,rootLease:root}));}
   catch(error){const released=await root.close({timeoutMs:10000});if(released.localClientClosed!==true||released.ownedBackendGone!==true)hold('FACTORY_PRE_HANDOFF_ROOT_RELEASE_UNVERIFIED');throw error;}
   lease=Object.freeze({observe:leaseProof,close});
   // Register the original child/lease before its binding read can fail. A
   // failure then follows Session's actual close/join path, never a lost client.
   request.registerControlSession(root.session,lease);
   // The initial state is CR, before the engine can append CANDIDATE_FENCED.
   // Use the actual server registration observer here; the phase-aware lease
   // queue is first consumed only after that engine commit. Never rename CR as
   // a CF lease observation merely to satisfy an earlier validator.
   const observation=await collectCandidateServerBinding({context,expectedStateDigest:originalState.stateDigest,replacementEvidence:replacement,
    rootLease:root,mode:'PRE_ADOPTION',signal:request.signal,timeoutMs:10000});
   const isolation=await ingress.observe();
   if(!same(state(),originalState)||await verifyExecutorInventory({phase:originalState.phase,candidateId:observation.runtime.api.id,signal:request.signal})!==true)hold('FACTORY_INITIAL_CANDIDATE_SOURCE_CHANGED');
   const sources={observation,isolation};candidate=observedCandidate(sources);
   return {evidence:await issue('CANDIDATE_FENCED',{...candidate,registrationOnly:true,runtimeCreated:false,runtimeRestarted:false},sources),lease};
  },
  async collectAdoption(request){
   const sources=await observe({signal:request.signal,timeoutMs:10000}),body=observedCandidate(sources);
   if(!candidate||!pinEqual(body.api,candidate.api)||body.bootId!==candidate.bootId||!same(body.controlSession,candidate.controlSession))hold('FACTORY_ADOPTION_CANDIDATE_CHANGED');
   return {evidence:await issue('CANDIDATE_PUBLIC_ADOPTION',{...body,rootLocks:{admissionExclusive:true,executionExclusive:true}},sources),participants:participants()};
  },
  async capturePostAndStartup(request){
   await observe({signal:request.signal,timeoutMs:10000});if(mode()!=='ADOPTED')hold('FACTORY_ACTUAL_ADOPTION_BEFORE_POST_REQUIRED');
   health=await queue.observeHealth({expectedStateDigest:state().stateDigest,signal:request.signal,timeoutMs:30000});
   store.immutable(request.files.post,health.post);store.immutable(request.files.log,health.startup);
   return {apiReadiness:health.apiReadiness,webHttp:health.webHttp,liveReinspectSha256:health.liveReinspectSha256};
  },
  async completeFormalDeployment(request){
   const controlLease=await leaseProof({signal:request.signal,timeoutMs:10000});
   return completeLegacyMaintenanceDeployment({root:CONTRACT.repository,context,state:request.state,approval:plan.approval,files:request.files,controlLease,signal:request.signal},{verifyAuthority,verifyEvidence});
  },
  async collectVerifiedCandidate(request){
   const sources=await observe({signal:request.signal,timeoutMs:10000}),actual=observedCandidate(sources),completed=formal();
   if(!health||health.apiReadiness.ready!==true||health.webHttp.accepted!==true||!HASH.test(health.liveReinspectSha256)||!pinEqual(actual.api,candidate.api))hold('FACTORY_POST_HEALTH_NOT_VERIFIED');
   // These facts were collected by the original bounded health observer, then
   // independently verified against the actual formal files by the Session.
   return issue('VERIFIED_FENCED',{...actual,apiReadiness:'PASS',webHttpSmoke:'PASS',liveReinspect:'PASS',
    startupEvidenceSha256:request.formal.digests.log,preSnapshotSha256:request.formal.digests.pre,postSnapshotSha256:request.formal.digests.post,
    unfinishedTransaction:false,formalDeploymentOutcome:completed.outcome},{...sources,health,completed,formalDigests:request.formal.digests});
  },
  async readFormalCompletion(request){
   const sources=await observe({signal:request.signal,timeoutMs:10000}),completed=formal(),next=nextMaintenanceOpenManifest(readPublicManifest(PUBLIC_DIRECTORY),context,participants());
   return issue('COMPLETION',{outcome:completed.outcome,owner,floorSha:completed.floorSha,api:candidate.api,bootId:candidate.bootId,
    successReceiptSha256:canonicalDigest(completed),publicManifestSha256:manifestDigest(next),allowedKinds:[...HOLD_KINDS],
    chanjetPolicy:'HOLD',readonlySync:false,inboundSync:false,ingressReleaseAuthorized:true},{...sources,completed,next});
  },
  async publishOpen(request){
   const publisher=new BackgroundManifestPublisher(),manifest=await publisher.open({owner,previousFloorSha:context.previousFloorSha,targetSha:context.targetSha},participants(),value=>request.verifySuccess(value.participants));
   // Do not call the FENCED observation queue after actual public OPEN. The
   // ingress release verifier rechecks actual formal/private/public/runtime and
   // the same root backend instead; an OPEN lease probe is a protocol error.
   const released=await ingress.release();guard();const actual=readPublicManifest(PUBLIC_DIRECTORY),completed=formal();
   if(!same(manifest,actual)||actual.phase!=='OPEN'||released.state!=='RELEASED'||released.owner!==owner)hold('FACTORY_OPEN_OR_INGRESS_RELEASE_UNVERIFIED');
   return issue('OPEN_PUBLISHED',{owner,bootId:candidate.bootId,publicManifestSha256:manifestDigest(actual),phase:actual.phase,ingressReleased:true,chanjetPolicy:'HOLD'},{actual,released,completed});
  },
 };
 return Object.freeze({producers:Object.freeze(producers),
  async verifyCandidateBinding(envelope,request){
   if(!candidate||await verifyEvidence(envelope,{kind:'CANDIDATE_PUBLIC_ADOPTION',context})!==true)return false;
   const sources=await observe({timeoutMs:10000}),body=observedCandidate(sources);
   return request.stateDigest===state().stateDigest&&same(request.participants,participants())&&pinEqual(body.api,envelope.body.api)&&body.bootId===envelope.body.bootId&&same(body.controlSession,envelope.body.controlSession);
  },
  async verifyFormalOpen(){
   guard();if(!root||!candidate)return false;const completed=formal(),manifest=readPublicManifest(PUBLIC_DIRECTORY),privateValue=store.read(path.join(store.directory,'background-control.json'));
   if(manifest.phase!=='OPEN'||manifest.owner!==owner||manifest.targetSha!==context.targetSha||manifest.generation!==3||!same(manifest.participants,participants())
    ||privateValue.phase!=='OPEN'||privateValue.manifestDigest!==manifestDigest(manifest)||privateValue.owner!==owner||privateValue.generation!==3
    ||privateValue.targetSha!==context.targetSha||privateValue.previousFloorSha!==context.previousFloorSha||privateValue.maintenanceContextDigest!==digest
    ||completed.active.api.imageId!==candidate.api.imageId||completed.active.api.revision!==candidate.api.revision)return false;
   const actual=inspectDockerRuntime(candidate.api.id);if(!pinEqual(actual,candidate.api)||actual.running!==true||actual.health!=='healthy')return false;
   verifyCompanions();if(await verifyExecutorInventory({phase:'COMPLETED_OPEN',candidateId:candidate.api.id})!==true)return false;
   root.assertHeld();const observed=await root.observe({timeoutMs:10000});return observed.mode==='HELD'&&observed.contextDigest===digest
    &&same(observed.database,root.database)&&observed.observation.backends.length===1&&observed.observation.backends[0].applicationName===`phoenix-maintenance-control:${owner}`;
  },
  cleanupDebt(){return {captures:captures.debt(),ingress:ingress.status(),candidateQueue:queue?.cleanupDebt()||null,unregisteredRoot:root!==null&&queue===null};},
 });
}
