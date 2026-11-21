/** Controlled forward recovery of an exact pre-DDL HOLD under a fresh lease. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {CONTRACT,git,verifyContext} from './production-config-guard.mjs';
import {atomicState} from './production-atomic-state.mjs';
import {assertRegularFile} from './production-trusted-paths.mjs';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {executionEnv} from './capture-production-runtime.mjs';
import {assertSameBinding,atomicPublicManifest,PUBLIC_DIRECTORY,readPublicManifest,validateBinding,validateManifest} from './background-control-manifest.mjs';
import {inspectApiParticipant,verifyParticipantStatus} from './background-control-coordinator.mjs';
import {ModernSchemaRegistry} from './production-modern-schema-registration.mjs';
import {verifyModernSchemaStage} from './production-modern-schema-stage.mjs';
import {modernSchemaReleaseBinding,validateModernSchemaPending} from './production-modern-schema-state.mjs';
import {inspectModernSchemaContainer} from './production-modern-schema-executors.mjs';
import {ModernSchemaIngress} from './production-modern-schema-ingress.mjs';
import {ingressIdentity} from './maintenance-ingress-policy.mjs';
import {ModernSchemaPrivateRuntime} from './production-modern-schema-private.mjs';
import {ModernSchemaControlSession,pinOriginalModernSchemaSession,readLinuxProcessIdentity,verifyOriginalModernSchemaAdmission} from './production-modern-schema-session-lease.mjs';
import {ModernSchemaReadClient} from './production-modern-schema-read-client.mjs';
import {pinModernSchemaChild} from './production-modern-schema-processes.mjs';
import {closeModernSchemaOriginalSession,confirmModernSchemaPublicDurability} from './production-modern-schema-completion.mjs';
import {createModernSchemaOperatorRecoveryVerifier,isExpiredVerifiedOriginal,isResidualStopIntent,readVerifiedRecoveryOwnership,
 sameOperatorControlSession,verifyRecoveryHostProcesses} from './production-modern-schema-operator-recovery.mjs';
import {originalStopExitIsProved} from './production-modern-schema-stop.mjs';

const ownerShape=/^[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$/;
const shaShape=/^[a-f0-9]{40}$/;
const hold=reason=>{throw Error('ORIGINAL_OPERATOR_RECOVERY_HOLD='+reason);};
const requireThat=(condition,reason)=>{if(!condition)hold(reason);};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const orderedDigest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const docker=(args,timeout=10000)=>execute('/usr/bin/docker',args,timeout);
function execute(binary,args,timeout=10000){
 return execFileSync(binary,args,{env:executionEnv(),encoding:'utf8',timeout,maxBuffer:2*1024*1024,stdio:['ignore','pipe','pipe']}).trim();
}
async function waitContainer(id,observe,expectation){
 const end=Date.now()+35000;
 do{
  await observe();
  const data=inspectModernSchemaContainer(id);
  if(expectation(data))return data;
  await pause(250);
 }while(Date.now()<end);
 hold('EXACT_CONTAINER_TRANSITION_UNVERIFIED');
}

function putOnce(store,name,value){
 if(!store.exists(name))store.immutable(name,value);
 requireThat(same(store.read(name),value),'IMMUTABLE_OPERATOR_EVIDENCE_CHANGED');
}

async function finishPublished({store,runtime,ingress,admission,session,lease,guard,closeLease,owner,prior,target,context,pending,previousFenced,policy}){
 const key=kind=>`schema-release-operator-${kind}-${prior}.json`;
 const record=store.read(key('recovery-intent'));
 const intent=store.read(key('open-intent'));
 const verified=store.read(key('original-verified'));
 const prepared=store.read(`schema-release-preparation-${owner}.json`);
 const {manifest,ordinary}=intent;
 const publicMatches=()=>same(readPublicManifest(),manifest)&&same(store.read('background-control.json'),ordinary);
 const {participant,startedAt}=verified;
 const generation=manifest.generation;
 const api=prepared.originalSnapshot.containers.api;
 const archive=key('archive');
 requireThat(record.schema==='phoenix.modern-operator-recovery-intent/v1'&&record.owner===owner&&record.recoveryOwner===prior&&
  record.target===target&&record.migrationAuthorized===false&&record.pendingSha256===canonicalDigest(pending)&&
  intent.schema==='phoenix.modern-operator-open-intent/v1'&&intent.owner===owner&&intent.recoveryOwner===prior&&
  same(intent.previousProjection,previousFenced)&&intent.pendingSha256===record.pendingSha256&&
  intent.verifiedSha256===canonicalDigest(verified)&&verified.schema==='phoenix.modern-operator-original-verified/v1'&&
  verified.owner===owner&&verified.recoveryOwner===prior&&verified.formalTargetSuccess===false&&
  verified.newLeaseSha256===canonicalDigest(record.newLease)&&
  record.previousLeaseSha256===canonicalDigest(pending.lease)&&
  same(record.newLease.database,lease.database)&&verified.runtimeSha===context.runtimeSha&&
  verified.verification?.startedAt===startedAt&&same(verified.verification?.participant,participant)&&
  participant.containerId===api.id&&participant.revision===context.runtimeSha&&
  generation===previousFenced.generation+1&&Number.isSafeInteger(generation)&&
  same(validateManifest(manifest),{protocolVersion:1,phase:'OPEN',owner:prepared.originalBackground.record.owner,
   targetSha:context.runtimeSha,generation,participants:[participant]})&&same(validateBinding(ordinary),{...prepared.originalBackground.record,
   generation,phase:'OPEN',manifestDigest:orderedDigest(manifest),updatedAt:ordinary.updatedAt}),'PROTECTED_OPERATOR_OPEN_INTENT_REQUIRED');
 let adoptedOwnership;
 if(isExpiredVerifiedOriginal(pending)){
  const priorProof=store.read(`schema-release-original-recovery-verified-${owner}.json`);
  adoptedOwnership=readVerifiedRecoveryOwnership(store,pending,priorProof);
  requireThat(record.adoptedRecoveryProofSha256===canonicalDigest(priorProof)&&
   verified.verification.adoptedRecoveryProofSha256===record.adoptedRecoveryProofSha256&&
   record.adoptedOwnershipSha256===adoptedOwnership.sha256&&verified.verification.adoptedOwnershipSha256===adoptedOwnership.sha256&&
   priorProof.owner===owner&&priorProof.formalTargetSuccess===false&&priorProof.startedAt===startedAt&&
   same(priorProof.originalRuntime,participant)&&priorProof.schemaChanged===false,'VERIFIED_ORIGINAL_ADOPTION_PROOF_REQUIRED');
 }else if(record.originalFencedBootSha256===null){
  const evidence=store.read(key('stopped-native'));
  requireThat(evidence.schema==='phoenix.modern-operator-stopped-native/v1'&&evidence.owner===owner&&evidence.recoveryOwner===prior&&
   evidence.previousLeaseSha256===record.previousLeaseSha256&&evidence.newLeaseSha256===verified.newLeaseSha256&&
   evidence.originalBackendAbsent===true&&evidence.releaseAuthorized===false&&
   canonicalDigest(evidence.stopped)===verified.verification.stoppedCheckpointSha256,'NEW_STOPPED_NATIVE_PROOF_REQUIRED');
 }
 if(same(readPublicManifest(),previousFenced)){
  // A previous process may have stopped between writing the private and public
  // projections. Adopt only its fully verified boot under the still intact denial.
  const previous=store.read('background-control.json');
  requireThat(!same(lease,record.newLease)&&(same(previous,intent.previousControl)||same(previous,ordinary))&&
   store.read('background-generation.json').generation===previousFenced.generation,'UNPUBLISHED_INTENT_CHANGED');
  await ingress.check('OPERATOR_ADOPT_OPEN_INTENT');
  const installed=store.read(`schema-release-ingress-installed-${owner}.json`);
  requireThat(ingress.names().length===2&&canonicalDigest(ingressIdentity(ingress.tables()))===installed.identitySha256,
   'ORIGINAL_NATIVE_INGRESS_CHANGED');
  const active=inspectModernSchemaContainer(api.id),actual=inspectApiParticipant(participant,prepared.floor.project);
  const status=verifyParticipantStatus(actual,participant,previousFenced);
  requireThat(active.imageId===api.image&&active.state.StartedAt===startedAt&&same(active.restartPolicy,policy)&&
   actual.startedAt===startedAt&&status.inFlight===0&&status.taskGraphs===0&&status.pendingChildren===0&&
   sameOperatorControlSession(status.controlSession,verified.verification.controlSession)&&
   await session.verifyParticipants([{...status.controlSession,bootId:participant.bootId}])===true,'VERIFIED_FENCED_BOOT_CHANGED');
  const oldObserver=new ModernSchemaReadClient();
  try{
   await oldObserver.start();
   const closed=await closeModernSchemaOriginalSession({coordinator:{close:async()=>{}},lease:record.newLease,client:oldObserver,guard});
   requireThat(closed.outcome==='ORIGINAL_SESSION_ABSENT','PRIOR_OPERATOR_SESSION_PRESENT');
  }finally{await oldObserver.close();}
  await admission();
  if(verified.verification.hostProcessesSha256)verifyRecoveryHostProcesses(prepared,undefined,[pinModernSchemaChild(session.child)],adoptedOwnership?.pins);
  requireThat(same(readPublicManifest(),previousFenced)&&same(store.read('background-control.json'),previous)&&
   canonicalDigest(ingressIdentity(ingress.tables()))===installed.identitySha256,'UNPUBLISHED_INTENT_CHANGED');
  if(!same(previous,ordinary))atomicState(store.file('background-control.json'),ordinary);
  try{atomicPublicManifest(PUBLIC_DIRECTORY,manifest);}catch{}
 }
 requireThat(confirmModernSchemaPublicDurability(()=>publicMatches()?manifest:null,guard)?.durabilityConfirmed===true,'DURABLE_ORIGINAL_OPEN_REQUIRED');
 await admission();
 const high=store.read('background-generation.json');
 requireThat(high.generation===previousFenced.generation||high.generation===generation,'OPEN_GENERATION_CHANGED');
 if(high.generation===previousFenced.generation)atomicState(store.file('background-generation.json'),
  {schema:'phoenix.background-generation/1',generation,updatedAt:new Date().toISOString()});
 const verifyOpen=async()=>{
  await waitContainer(api.id,admission,data=>{
   if(data.imageId!==api.image||data.state.Health?.Status!=='healthy'||!same(data.restartPolicy,policy))return false;
   const actual=inspectApiParticipant(participant,prepared.floor.project);
   return actual.startedAt===startedAt&&actual.status.phase==='OPEN'&&actual.status.owner===manifest.owner&&actual.status.generation===generation;
  });
  const actual=inspectApiParticipant(participant,prepared.floor.project);
  const status=verifyParticipantStatus(actual,participant,manifest);
  requireThat(actual.startedAt===startedAt&&sameOperatorControlSession(status.controlSession,verified.verification.controlSession)&&
   await session.verifyParticipants([{...status.controlSession,bootId:participant.bootId}])===true&&publicMatches(),'ACTUAL_ORIGINAL_OPEN_UNVERIFIED');
  };
 await verifyOpen();
 await ingress.check('OPERATOR_FORWARD_OPEN');
 const remove={nftables:['bridge','inet'].map(family=>({delete:{table:{family,name:ingress.compiled.table}}}))};
 const removeFile=store.file(key('remove-owned-ingress'));
 requireThat(intent.nativeRemoveSha256===canonicalDigest(remove),'EXACT_NATIVE_REMOVE_INTENT_REQUIRED');
 ingress.assertProgram(removeFile,remove);
 if(ingress.names().length!==0){
  const installed=store.read(`schema-release-ingress-installed-${owner}.json`);
  requireThat(ingress.names().length===2&&canonicalDigest(ingressIdentity(ingress.tables()))===installed.identitySha256,'ORIGINAL_NATIVE_INGRESS_CHANGED');
  try{execute('/usr/sbin/nft',['--json','--file',removeFile]);}catch{}
 }
 requireThat(ingress.names().length===0,'OWNED_INGRESS_RELEASE_UNVERIFIED');
 await verifyOpen();
 const open={schema:'phoenix.modern-operator-original-open/v1',owner,recoveryOwner:prior,manifest,
  originalRuntimeSha:context.runtimeSha,formalTargetSuccess:false,intentSha256:canonicalDigest(intent)};
 putOnce(store,key('public-open-verified'),open);
 await closeLease();
 const observer=new ModernSchemaReadClient();
 try{
  await observer.start();
  const newExit=await closeModernSchemaOriginalSession({coordinator:{close:()=>session.close()},lease,client:observer,guard});
  requireThat(newExit.outcome==='ORIGINAL_SESSION_ABSENT'&&newExit.transportClosed===true,'NEW_LEASE_EXIT_UNVERIFIED');
  const priorExit=same(lease,record.newLease)?newExit:await closeModernSchemaOriginalSession({
   coordinator:{close:async()=>{}},lease:record.newLease,client:observer,guard});
  requireThat(priorExit.outcome==='ORIGINAL_SESSION_ABSENT','COMMITTED_LEASE_EXIT_UNVERIFIED');
  const exitFile=key('lease-closed');
  if(!store.exists(exitFile))store.immutable(exitFile,priorExit);
  const savedExit=store.read(exitFile);
  requireThat(savedExit.originalLeaseSha256===canonicalDigest(record.newLease)&&savedExit.outcome==='ORIGINAL_SESSION_ABSENT'&&
   savedExit.transportClosed===true&&same(savedExit.nativeObservation,priorExit.nativeObservation),'COMMITTED_LEASE_EXIT_CHANGED');
 }finally{await observer.close();}
 guard();
 requireThat(publicMatches()&&ingress.names().length===0,'FINAL_PUBLIC_ORIGINAL_CHANGED');
 const saved={schema:'phoenix.modern-operator-pre-ddl-recovery-archive/v1',owner,recoveryOwner:prior,pending,
  originalRuntimeSha:context.runtimeSha,requestedTargetSha:target,formalTargetSuccess:false,schemaChanged:false,markerArchived:true,
  publicOpenSha256:canonicalDigest(open)};
 putOnce(store,archive,saved);
 const pendingName='schema-release-pending.json';
 if(store.exists(pendingName)){
  guard();fs.unlinkSync(store.file(pendingName));
 }
 runtime.syncDirectory(store.directory);
 requireThat(!store.exists(pendingName)&&publicMatches(),'TERMINAL_PENDING_CLEANUP_FAILED');
 return 'ORIGINAL_OPEN';
}

async function recover(env){
 const owner=env.ORIGINAL_RELEASE_OWNER,recoveryOwner=env.OPERATOR_RECOVERY_OWNER,target=env.TARGET_SHA,executionSha=env.MODERN_SCHEMA_EXECUTION_SHA;
 requireThat(ownerShape.test(owner??'')&&ownerShape.test(recoveryOwner??'')&&owner!==recoveryOwner&&shaShape.test(target??'')&&shaShape.test(executionSha??''),'FIXED_RECOVERY_SCOPE_REQUIRED');
 const root=CONTRACT.repository,directory=CONTRACT.stateDirectory,store=new ModernSchemaRegistry(),runtime=new ModernSchemaPrivateRuntime();
 const established=verifyModernSchemaStage({owner:recoveryOwner,targetSha:executionSha});
 const prep=store.read(`schema-release-preparation-${owner}.json`),{context,preparationSha256}=prep;
 requireThat(context.owner===owner&&context.targetSha===target&&same(verifyModernSchemaStage({owner,targetSha:target},
  {stageDirectory:path.join(directory,`modern-schema-stage-${owner}`)}),prep.stagedSource),'EXACT_ORIGINAL_REVIEWED_SOURCE_REQUIRED');
 const prior=env.OPERATOR_COMMITTED_OWNER??'';
 requireThat(prior===''||(ownerShape.test(prior)&&prior!==owner&&prior!==recoveryOwner),'FIXED_COMMITTED_OWNER_REQUIRED');
 const priorArchive=prior&&`schema-release-operator-archive-${prior}.json`;
 const pendingName='schema-release-pending.json',markerPresent=store.exists(pendingName);
 const pending=validateModernSchemaPending(markerPresent?store.read(pendingName):store.read(priorArchive).pending,modernSchemaReleaseBinding(context,preparationSha256));
 const priorIntent=prior?store.read(`schema-release-operator-open-intent-${prior}.json`):null;
 const typed=priorIntent?.previousControl??store.read('background-control.json'),fenced=priorIntent?.previousProjection??readPublicManifest();
 const generationBefore=store.read('background-generation.json');
 assertSameBinding(typed,modernSchemaReleaseBinding(context,preparationSha256));
 const {api,web,db}=prep.originalSnapshot.containers;
 const startKey=`schema-release-operator-fenced-start-verified-${owner}.json`,closeKey=`schema-release-session-closed-${owner}.json`;
 const started=store.exists(startKey)?store.read(startKey):null;
 const held=store.read(`recovery-modern-schema-${owner}.json`),closed=store.exists(closeKey)?store.read(closeKey):null;
 const residual=isResidualStopIntent(pending,store);
 const fresh=pending.phase==='FRESH_RECHECKED';
 const adopting=isExpiredVerifiedOriginal(pending);
 const priorParticipant=prep.originalBackground.participant;
 const originalStep=store.read(`schema-release-step-${owner}-${residual?'3-r-stop-intent':'4-r-stopped'}.json`);
 const stop=originalStep.payload.evidence.runtimeStopReceipt;
 const provedStalledStop=stop?.stalledShutdown&&originalStopExitIsProved(stop,context);
 const recoverAlreadyStopped=!adopting&&!started&&(!closed||fresh||residual||provedStalledStop);
 const originalPolicy=residual?originalStep.payload.evidence.originalRestartPolicy:stop.originalRestartPolicy;
 const originalProof=store.read(`schema-release-ingress-installed-${owner}.json`);
 const supervisor=readLinuxProcessIdentity(process.pid),deadline=Date.now()+25*60*1000;
 const newKey=kind=>`schema-release-operator-${kind}-${recoveryOwner}.json`;
 const pendingPath=store.file(pendingName),initialStat=markerPresent?fs.lstatSync(pendingPath):null;
 if(initialStat)assertRegularFile(initialStat);
 const pinnedStat=stat=>[stat.dev,stat.ino,stat.mtimeMs,stat.ctimeMs,stat.size];
 const sourceSteps=fs.readdirSync(directory).filter(name=>name.startsWith(`schema-release-step-${owner}-`)).sort();
 requireThat((residual||fresh||pending.phase==='R_STOPPED')&&pending.status==='HOLD'&&pending.sequence===(residual?3:fresh?5:4)&&
  sourceSteps.length===pending.sequence+1&&(!fresh||closed&&!started)&&
  (!residual||closed&&!started)&&
  held.disposition==='PRE_DDL_FACTS_UNPROVED_KEEP_FENCED'&&
  (recoverAlreadyStopped&&!closed||held.nativeLedger?.sha256===context.beforeLedgerSha256&&
    closed?.outcome==='ORIGINAL_SESSION_ABSENT'&&closed.originalLeaseSha256===canonicalDigest(pending.lease))&&
  typed.phase==='FENCED'&&fenced.phase==='FENCED'&&typed.owner===owner&&fenced.owner===owner&&fenced.targetSha===target&&
  typed.manifestDigest===orderedDigest(fenced)&&(generationBefore.generation===fenced.generation||(prior&&generationBefore.generation===fenced.generation+1))&&
  (adopting||recoverAlreadyStopped||started?.outcome==='EXACT_ORIGINAL_HEALTHY_FENCED'&&
    started.participant.containerId===api.id&&started.participant.revision===context.runtimeSha&&
    started.pendingSha256===canonicalDigest(pending)&&started.fencedSha256===canonicalDigest(fenced))&&
  ['no','always','unless-stopped'].includes(originalPolicy.Name)&&originalPolicy.MaximumRetryCount===0,'EXACT_HELD_ORIGINAL_REQUIRED');
 const unchanged=()=>{
  verifyContext(root,directory);
  requireThat(Date.now()<deadline&&same(readLinuxProcessIdentity(process.pid),supervisor)&&
   (markerPresent?same(store.read(pendingName),pending)&&same(pinnedStat(fs.lstatSync(pendingPath)),pinnedStat(initialStat)):
    !store.exists(pendingName)&&same(store.read(priorArchive).pending,pending))&&
   !fs.lstatSync(`/proc/${pending.supervisor.pid}`,{throwIfNoEntry:false})&&
   !['transaction.json','policy-transition.json','cutover-pending.json',`schema-release-schema-receipt-${owner}.json`].some(name=>store.exists(name))&&
   same(fs.readdirSync(directory).filter(name=>name.startsWith(`schema-release-step-${owner}-`)).sort(),sourceSteps)&&
   same(store.read('floor.json'),prep.floor)&&same(store.read('active.json'),prep.active)&&git(root,['rev-parse','HEAD'])===prep.rootHeadSha,'SOURCE_SIDE_CHANGED');
  for(const pin of [web,db]){
   const observed=inspectModernSchemaContainer(pin.id);
   requireThat(observed.imageId===pin.image&&observed.state.Running===true&&observed.state.Health?.Status==='healthy'&&
    observed.state.StartedAt===pin.startedAt&&observed.restarts===pin.restartCount,'ORIGINAL_WEB_DATABASE_CHANGED');
  }
 };
 const readHeld=()=>{
  requireThat(same(store.read('background-control.json'),typed)&&same(readPublicManifest(),fenced)&&
   same(store.read('background-generation.json'),generationBefore),'BACKGROUND_DENIAL_CHANGED');
 };
 unchanged();if(!prior)readHeld();
 let closing=false,verifier,recoveryLease,stoppedByRecovery=false,publicPublished=false,ordinary,manifest,ingress;
 const session=new ModernSchemaControlSession({}, {isClosing:()=>closing});
 try{
  await session.start();
  requireThat(await session.tryLock(1)===true&&await session.tryLock(2)===true,'NEW_NATIVE_EXCLUSIVE_LEASE_REQUIRED');
  recoveryLease=await pinOriginalModernSchemaSession(session,context);
  requireThat(same(recoveryLease.database,pending.lease.database)&&
   (recoveryLease.sessionPid!==pending.lease.sessionPid||recoveryLease.backendStartMicros!==pending.lease.backendStartMicros),'FRESH_LEASE_NOT_ORIGINAL_REQUIRED');
  const admission=()=>verifyOriginalModernSchemaAdmission({session,lease:recoveryLease,observeHost:unchanged});
  ingress=new ModernSchemaIngress({context,scope:prep.ingressScope,privateRuntime:runtime,admit:admission});
  const observeFence=async()=>{
   readHeld();await ingress.check('OBSERVE');
   const identity=canonicalDigest(ingressIdentity(ingress.tables()));
   requireThat(originalProof.identitySha256===identity,'ORIGINAL_NATIVE_INGRESS_CHANGED');
   return identity;
  };
  const complete=async(commitOwner)=>finishPublished({store,runtime,ingress,admission,session,lease:recoveryLease,guard:unchanged,
   closeLease:async()=>{await verifier?.close();verifier=null;closing=true;},owner,prior:commitOwner,target,context,pending,previousFenced:fenced,policy:originalPolicy});
  if(prior){
   requireThat(priorIntent&&(same(readPublicManifest(),priorIntent.manifest)||same(readPublicManifest(),fenced)),'PREVIOUS_EXACT_OPEN_INTENT_REQUIRED');
   return await complete(prior);
  }
  await observeFence();
  verifier=await createModernSchemaOperatorRecoveryVerifier({owner,recoveryOwner,recoveryLease,requireAdmission:admission,observeFences:observeFence,
   controlChild:session.child});
  if(started){
   await verifier.verifyFencedBoot();
   const incumbent=inspectModernSchemaContainer(api.id),fencedApi=inspectApiParticipant(started.participant,prep.floor.project);
   verifyParticipantStatus(fencedApi,started.participant,fenced);
   requireThat(incumbent.imageId===api.image&&incumbent.state.Running===true&&incumbent.state.Health?.Status==='healthy'&&
    incumbent.state.StartedAt===started.startedAt&&fencedApi.status.phase==='FENCED'&&
    fencedApi.status.inFlight===0&&fencedApi.status.taskGraphs===0&&fencedApi.status.pendingChildren===0&&incumbent.restartPolicy.Name==='no','EXACT_FENCED_INCUMBENT_REQUIRED');
  }
  const priorRecovery=adopting?store.read(`schema-release-original-recovery-verified-${owner}.json`):null;
  store.immutable(newKey('recovery-intent'),{schema:'phoenix.modern-operator-recovery-intent/v1',owner,recoveryOwner,target,executionSha,
   newSupervisor:supervisor,newLease:recoveryLease,previousLeaseSha256:canonicalDigest(pending.lease),pendingSha256:canonicalDigest(pending),
    reviewedSourceSha256:established.sha256,originalFencedBootSha256:started?canonicalDigest(started):null,migrationAuthorized:false,
    ...(priorRecovery?{adoptedRecoveryProofSha256:canonicalDigest(priorRecovery),
       adoptedOwnershipSha256:readVerifiedRecoveryOwnership(store,pending,priorRecovery).sha256}:{})});
  await admission();await observeFence();
  if(residual&&inspectModernSchemaContainer(api.id).state.Running===true){
   const term=await verifier.verifyResidualOriginal();
   store.immutable(term.key,term.record);
   await admission();await observeFence();
   const live=inspectModernSchemaContainer(api.id);
   requireThat(live.id===api.id&&live.imageId===api.image&&live.state.Pid===term.record.pid&&
    live.state.StartedAt===term.record.startedAt&&live.state.Running===true&&live.restartPolicy.Name==='no','RESIDUAL_ORIGINAL_IDENTITY_MOVED');
   requireThat(docker(['kill','--signal=TERM',api.id])===api.id,'EXACT_RESIDUAL_TERM_NOT_ACKNOWLEDGED');
   await waitContainer(api.id,admission,data=>data.imageId===api.image&&data.state.Status==='exited'&&
    data.state.Pid===0&&[0,143].includes(data.state.ExitCode));
  }
  if(started){
   docker(['kill','--signal=TERM',api.id]);stoppedByRecovery=true;
   await waitContainer(api.id,admission,data=>data.imageId===api.image&&data.state.Status==='exited'&&data.state.Pid===0&&data.state.ExitCode===0);
  }
  let verification;
  if(adopting){
   verification=await verifier.verifyAdoptedOriginal();
  }else{
   const stopped=await verifier.captureStopped();
   if(recoverAlreadyStopped){
    store.immutable(newKey('stopped-native'),{schema:'phoenix.modern-operator-stopped-native/v1',owner,recoveryOwner,
     previousLeaseSha256:canonicalDigest(pending.lease),newLeaseSha256:canonicalDigest(recoveryLease),
     observedAt:new Date().toISOString(),originalBackendAbsent:true,stopped,releaseAuthorized:false});
   }
   await admission();await observeFence();
   docker(['start',api.id],25000);
   await waitContainer(api.id,admission,data=>data.imageId===api.image&&data.state.Running===true&&data.state.Health?.Status==='healthy');
   verification=await verifier.verifyStarted();
  }
  await observeFence();
  const next=inspectApiParticipant(priorParticipant,prep.floor.project);
  const participant={...priorParticipant,bootId:next.status.bootId};
  const status=verifyParticipantStatus(next,participant,fenced);
  requireThat(same(verification.participant,participant)&&verification.startedAt===next.startedAt&&sameOperatorControlSession(verification.controlSession,status.controlSession)&&
   participant.bootId!==(started?.participant.bootId??priorParticipant.bootId)&&next.imageId===api.image&&status.phase==='FENCED'&&status.inFlight===0&&
   status.taskGraphs===0&&status.pendingChildren===0&&await session.verifyParticipants([{...status.controlSession,bootId:participant.bootId}])===true,'DATA_VERIFIED_ORIGINAL_NOT_QUIESCENT');
  store.immutable(newKey('original-verified'),{schema:'phoenix.modern-operator-original-verified/v1',owner,recoveryOwner,verification,
   runtimeSha:context.runtimeSha,participant,startedAt:next.startedAt,newLeaseSha256:canonicalDigest(recoveryLease),formalTargetSuccess:false});
  if(!adopting&&originalPolicy.Name!=='no')docker(['update','--restart='+originalPolicy.Name,api.id]);
  requireThat(same(inspectModernSchemaContainer(api.id).restartPolicy,originalPolicy),'EXACT_ORIGINAL_RESTART_POLICY_REQUIRED');
  await observeFence();
  const generation=fenced.generation+1;
  requireThat(Number.isSafeInteger(generation),'GENERATION_EXHAUSTED');
  const former=prep.originalBackground.record;
  manifest=validateManifest({protocolVersion:1,phase:'OPEN',owner:former.owner,targetSha:context.runtimeSha,generation,participants:[participant]});
  ordinary=validateBinding({...former,generation,phase:'OPEN',manifestDigest:orderedDigest(manifest),updatedAt:new Date().toISOString()});
  requireThat(!ordinary.purpose&&!ordinary.schemaRelease&&!ordinary.cutover&&ordinary.targetSha===context.runtimeSha,'EXACT_ORDINARY_RUNTIME_AUTHORITY_REQUIRED');
  const remove={nftables:['bridge','inet'].map(family=>({delete:{table:{family,name:ingress.compiled.table}}}))};
  const removeFile=path.join(directory,newKey('remove-owned-ingress'));
  runtime.publishJson(removeFile,remove);
  store.immutable(newKey('open-intent'),{schema:'phoenix.modern-operator-open-intent/v1',owner,recoveryOwner,previousControl:typed,previousProjection:fenced,
   pendingSha256:canonicalDigest(pending),ordinary,manifest,verifiedSha256:canonicalDigest(store.read(newKey('original-verified'))),nativeRemoveSha256:canonicalDigest(remove)});
  await observeFence();
  await verifier.verifyHostBeforeOpen();
  await admission();readHeld();
  atomicState(store.file('background-control.json'),ordinary);
  await admission();
  requireThat(same(readPublicManifest(),fenced)&&same(store.read('background-control.json'),ordinary)&&
   canonicalDigest(ingressIdentity(ingress.tables()))===originalProof.identitySha256,'COMMIT_INTENT_CHANGED');
  try{atomicPublicManifest(PUBLIC_DIRECTORY,manifest);}catch{}
  publicPublished=same(readPublicManifest(),manifest);
  requireThat(publicPublished,'ORIGINAL_PUBLIC_COMMIT_UNVERIFIED');
  return await complete(recoveryOwner);
 }catch(error){
  // Preserve the native denial on a failure before the public OPEN commit.
  let fallbackVerified=false;
  try{
   const publicNow=readPublicManifest();
   if(!publicPublished&&manifest&&same(publicNow,manifest))publicPublished=true;
   if(!prior&&!publicPublished&&same(publicNow,fenced)){
    if(ingress){
     unchanged();
     // No ingress deletion can execute before a durable OPEN publication.
     requireThat(ingress.names().length===2&&canonicalDigest(ingressIdentity(ingress.tables()))===originalProof.identitySha256,
      'ORIGINAL_DENIAL_CHANGED');
     if(ordinary&&same(store.read('background-control.json'),ordinary))atomicState(store.file('background-control.json'),typed);
    }
    if(stoppedByRecovery){
     unchanged();requireThat(same(store.read('background-control.json'),typed),'RECOVERY_DENIAL_CHANGED');
     const original=inspectModernSchemaContainer(api.id);
     if(original.imageId===api.image&&original.state.Status==='exited'&&original.state.ExitCode===0&&original.state.Pid===0&&original.restartPolicy.Name==='no')
      docker(['start',api.id],25000);
    }
    fallbackVerified=ingress?.names().length===2&&same(store.read('background-control.json'),typed);
   }
  }catch{}
  const code=typeof error?.message==='string'&&/^[A-Z_]+_HOLD=[A-Z0-9_]+$/.test(error.message)?error.message:'UNCLASSIFIED';
  try{store.immutable(newKey('hold'),{schema:'phoenix.modern-operator-recovery-hold/v1',owner,recoveryOwner,publicPublished,fallbackVerified,code});}catch{}
  return 'HOLD';
 }finally{try{await verifier?.close();}finally{closing=true;await session.close();}}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let outcome='HOLD';
 try{outcome=await recover(process.env);}catch(error){
  const owner=process.env.ORIGINAL_RELEASE_OWNER,recoveryOwner=process.env.OPERATOR_RECOVERY_OWNER;
  const code=typeof error?.message==='string'&&/^[A-Z_]+_HOLD=[A-Z0-9_]+$/.test(error.message)?error.message:'UNCLASSIFIED';
  if(ownerShape.test(owner??'')&&ownerShape.test(recoveryOwner??'')&&owner!==recoveryOwner){
   try{new ModernSchemaRegistry().immutable(`schema-release-operator-preflight-hold-${recoveryOwner}.json`,
    {schema:'phoenix.modern-operator-recovery-preflight-hold/v1',owner,recoveryOwner,code});}catch{}
  }
 }
 console.log(JSON.stringify({schema:'phoenix.modern-original-recovery-public/v1',originalOwner:process.env.ORIGINAL_RELEASE_OWNER,
  recoveryOwner:process.env.OPERATOR_RECOVERY_OWNER,formalTargetSuccess:false,outcome}));
 if(outcome!=='ORIGINAL_OPEN')process.exitCode=1;
}
