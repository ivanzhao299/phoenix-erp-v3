/** Resolve the one pre-effect HOLD after the first continuation drained the
 * incumbent. The older kernel fences and public maintenance stay installed. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {CONTRACT,git} from './production-config-guard.mjs';
import {atomicState} from './production-atomic-state.mjs';
import {assertRegularFile,readPinnedFile} from './production-trusted-paths.mjs';
import {PUBLIC_DIRECTORY,assertSameBinding,atomicPublicManifest,readPublicManifest,validateBinding,validateManifest} from './background-control-manifest.mjs';
import {inspectApiParticipant,verifyParticipantStatus} from './background-control-coordinator.mjs';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {ModernSchemaRegistry,validateModernSchemaPreparation} from './production-modern-schema-registration.mjs';
import {verifyModernSchemaStage} from './production-modern-schema-stage.mjs';
import {modernSchemaReleaseBinding,validateModernSchemaPending} from './production-modern-schema-state.mjs';
import {ModernSchemaPrivateRuntime} from './production-modern-schema-private.mjs';
import {ModernSchemaControlSession,pinOriginalModernSchemaSession,verifyOriginalModernSchemaAdmission} from './production-modern-schema-session-lease.mjs';
import {ModernSchemaReadClient} from './production-modern-schema-read-client.mjs';
import {closeModernSchemaOriginalSession,confirmModernSchemaPublicDurability,modernSchemaOriginalSessionExitSql} from './production-modern-schema-completion.mjs';
import {pinModernSchemaChild} from './production-modern-schema-processes.mjs';
import {sameOperatorControlSession,verifyRecoveryHostProcesses} from './production-modern-schema-operator-recovery.mjs';
import {classifyModernSchemaDatabaseExecutors,inspectModernSchemaContainer,MODERN_SCHEMA_EXECUTOR_SQL} from './production-modern-schema-executors.mjs';
import {captureModernSchemaCatalog} from './production-modern-schema-catalog.mjs';
import {captureModernSchemaFacts,defaultOffEvidenceFromFacts} from './production-modern-schema-facts.mjs';
import {captureModernSchemaLedger} from './production-modern-schema-schema-result.mjs';
import {assertHeldEdge,compareHeldFacts,heldOwner,participantStartMicros} from './production-remediation-held-facts.mjs';
import {isReviewedDrainedContinuation,sealedHandoffRevision,isReviewedContinuation} from './production-remediation-fence-transfer.mjs';
import {ModernSchemaIngress} from './production-modern-schema-ingress.mjs';
import {ingressIdentity} from './maintenance-ingress-policy.mjs';

export const drainedOwner='45228188093-1';
export const drainedTarget='3e2ea4ea4de5ccbc102f1e17ae4dbc48c0cfb8e2';
export const drainedArchive='schema-release-1123-drained-archive-'+drainedOwner+'.json';
const intentKey='schema-release-1123-drained-intent-'+drainedOwner+'.json';
const preparationPin='271443ca5ccae853a353033267ce0d8d7b92be6f87ff74c48a39f9f23ba3ce43';
const pendingPin='c8f45239386e8f6f19de8937a55054047238d8a22910e24e1329b62d6bcc614f';
const factsPin='cca24f95e5f524c40d2a7f0fb447557cebfeaa0548551328f42b81abe2ed1a7e';
const catalogPin='5c70ba6edeb3bf7d69c657efe8592e60b3c1b9cbbdee4298965bf9dc7e7cf105';
const anchorPin='255a16c597e3554f5bf90b11941c5b8c8ff3f2c7cf199aac448b4a5780fc1596';
const runtimeRevision='6bb88544275dfef591cb96c0078f73e88496433b';
const ownerShape=/^[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$/;
const shaShape=/^[a-f0-9]{40}$/;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const check=(yes,code)=>{if(!yes)throw Error('DRAINED_HOLD='+code);};
const fileKey=(kind,owner=drainedOwner)=>'schema-release-'+kind+'-'+owner+'.json';
const rehearsalKey=id=>fileKey('1123-drained-rehearsal',id);
const scopedResult=(recoveryOwner,outcome,code)=>({schema:'phoenix.1123-drained-public/v1',originalOwner:drainedOwner,recoveryOwner,outcome,
 publicHeld:true,mutationAuthorized:false,...(code?{code}:{})});
function putOnce(store,key,value){
 if(!store.exists(key))store.immutable(key,value);
 check(same(store.read(key),value),'IMMUTABLE_EVIDENCE_CHANGED');
}
export function exactDrainedPending(value){
 return value.owner===drainedOwner&&value.targetSha===drainedTarget&&value.stateDigest===pendingPin&&
  value.sequence===1&&value.phase==='DRAINED'&&value.status==='HOLD'&&value.holdReason==='SCHEMA_RELEASE_FAILED';
}
export function drainedProjections(preparation,fenced,recordedAt){
 check(fenced.phase==='FENCED'&&fenced.owner===drainedOwner&&fenced.targetSha===drainedTarget&&fenced.generation===114&&
  same(fenced.participants,[preparation.originalBackground.participant])&&same(fenced.participants[0].allowedKinds,[]),'ORIGINAL_DRAIN_PROJECTION');
 const prior=preparation.originalBackground;
 const manifest=validateManifest({...prior.manifest,phase:'OPEN',generation:115});
 check(manifest.targetSha===runtimeRevision&&same(manifest.participants,fenced.participants),'SAME_QUIESCENT_BOOT');
 const record=validateBinding({...prior.record,phase:'OPEN',generation:manifest.generation,manifestDigest:digest(manifest),updatedAt:recordedAt});
 check(!record.purpose&&!record.schemaRelease&&!record.cutover,'ORDINARY_CONTROL_REQUIRED');
 return {manifest,record,high:{schema:'phoenix.background-generation/1',generation:manifest.generation,updatedAt:recordedAt}};
}

async function execute(env){
 const recoveryOwner=env.OPERATOR_RECOVERY_OWNER,executionSha=env.MODERN_SCHEMA_EXECUTION_SHA,witness=env.OPERATOR_HELD_REHEARSAL??'';
 const inspecting=env.OPERATOR_RECOVERY_MODE==='rehearse-drained';
 check((inspecting||env.OPERATOR_RECOVERY_MODE==='settle-drained')&&env.ORIGINAL_RELEASE_OWNER===drainedOwner&&env.TARGET_SHA===drainedTarget&&
  env.OPERATOR_HELD_INSPECTION==='45168560404-1'&&!env.OPERATOR_COMMITTED_OWNER&&ownerShape.test(recoveryOwner??'')&&
  recoveryOwner!==drainedOwner&&shaShape.test(executionSha??'')&&executionSha!==drainedTarget&&
  (inspecting?!witness:ownerShape.test(witness)&&![drainedOwner,recoveryOwner].includes(witness)),'EXACT_INCIDENT');
 const store=new ModernSchemaRegistry(),runtime=new ModernSchemaPrivateRuntime(),dir=store.directory;
 verifyModernSchemaStage({owner:recoveryOwner,targetSha:executionSha});
 check(isReviewedDrainedContinuation(executionSha)&&isReviewedContinuation(sealedHandoffRevision,drainedTarget),'EXACT_SUCCESSOR_SOURCE');
 const existing=store.exists(intentKey)?store.read(intentKey):null;
 const marker='schema-release-pending.json',markerPresent=store.exists(marker),markerPath=store.file(marker);
 const markerIdentity=()=>{
  const stat=fs.lstatSync(markerPath,{bigint:true});
  assertRegularFile(fs.lstatSync(markerPath));
  return [stat.dev,stat.ino,stat.ctimeNs,stat.mtimeNs,stat.size];
 };
 const initialIdentity=markerPresent?markerIdentity():null;
 const exactMarker=()=>markerIdentity().every((value,index)=>value===initialIdentity[index]);
 check(markerPresent||(!inspecting&&existing&&store.exists(drainedArchive)),'ORIGINAL_PENDING_REQUIRED');
 const preparation=store.read(fileKey('preparation')),registered=store.read(fileKey('step',drainedOwner+'-0-registered')),
  drained=store.read(fileKey('step',drainedOwner+'-1-drained'));
 const {context,preparationSha256}=validateModernSchemaPreparation(preparation,Date.parse(drained.recordedAt));
 const binding=modernSchemaReleaseBinding(context,preparationSha256),initial=markerPresent?store.read(marker):store.read(drainedArchive).pending;
 const pending=validateModernSchemaPending(initial,binding);
 check(preparationSha256===preparationPin&&preparation.handoffSha256===anchorPin&&exactDrainedPending(pending)&&
  same(verifyModernSchemaStage({owner:drainedOwner,targetSha:drainedTarget},{stageDirectory:path.join(dir,'modern-schema-stage-'+drainedOwner)}),preparation.stagedSource),'PROTECTED_FAILED_PREPARATION');
 assertSameBinding(registered,binding);assertSameBinding(drained,binding);
 check(registered.sequence===0&&registered.to==='REGISTERED'&&registered.from===null&&same(registered.payload.supervisor,pending.supervisor)&&
  drained.sequence===1&&drained.from==='REGISTERED'&&drained.to==='DRAINED'&&canonicalDigest(registered)===drained.previousDigest&&
  pending.receiptSha256===canonicalDigest(drained)&&drained.payload.contextDigest===canonicalDigest(context)&&
  drained.payload.evidenceSha256===canonicalDigest(drained.payload.evidence)&&same(drained.payload.evidence.originalLease,pending.lease),'EXACT_DRAINED_CHAIN');
 const grant=store.read(fileKey('approval')),consumed=store.read('schema-release-1123-consumed-'+drainedTarget+'.json');
 check(registered.payload.approvalSha256===canonicalDigest(grant)&&consumed.owner===drainedOwner&&consumed.targetSha===drainedTarget&&consumed.preparationSha256===preparationSha256,'FAILED_APPROVAL_CUSTODY');
 const drain=store.read('background-drain-'+drainedOwner+'.json'),detail=drained.payload.evidence;
 check(same(detail.drain,drain)&&drain.outcome==='DRAINED'&&drain.generation===114&&canonicalDigest(drain)===detail.drainReceipt.sha256&&
  detail.drainReceipt.file===store.file('background-drain-'+drainedOwner+'.json'),'PROTECTED_DRAIN');
 const closed=store.read(fileKey('session-closed')),hold=store.read('recovery-modern-schema-'+drainedOwner+'.json'),catalog=store.read(fileKey('hold-observation-schema'));
 const anchor=store.read(fileKey('1123-handoff',heldOwner)),oldPrep=store.read(fileKey('preparation',heldOwner)),oldIngress=store.read(fileKey('ingress-installed',heldOwner));
 const baseline=store.read(fileKey('before-facts',heldOwner));
 const backupFile=path.join(dir,'schema-release-prepare-backup-'+drainedOwner,'backup-receipt.json');
 const backup=JSON.parse(readPinnedFile(backupFile,{contract:CONTRACT}));
 check(closed.originalLeaseSha256===canonicalDigest(pending.lease)&&closed.outcome==='ORIGINAL_SESSION_ABSENT'&&closed.transportClosed===true&&
  hold.phase==='DRAINED'&&hold.terminalComplete===false&&hold.defaultOff===true&&hold.backgroundAdmissionCommitted===false&&
  hold.nativeLedger?.sha256===context.beforeLedgerSha256&&hold.nativeSchema?.sha256===canonicalDigest(catalog)&&catalog.schemaSha256===catalogPin&&
  canonicalDigest(anchor)===anchorPin&&anchor.ingressIdentitySha256===oldIngress.identitySha256,'EXACT_HELD_EVIDENCE');
 check(preparation.backupReceiptPath===backupFile&&preparation.backupReceiptSha256===canonicalDigest(backup)&&
  backup.sourceBusinessFactsSha256===baseline.businessDataSha256&&backup.sourceLedgerSha256===context.beforeLedgerSha256&&canonicalDigest(baseline)===factsPin,
  'FROZEN_BASELINE_REQUIRED');
 const {api,web,db}=preparation.originalSnapshot.containers,deadline=Date.now()+27*60_000;
 const oldManifest=preparation.originalBackground.manifest,priorParticipant=preparation.originalBackground.participant;
 check(oldManifest.generation===113&&same(oldManifest.participants,[priorParticipant])&&same(priorParticipant.allowedKinds,[])&&
  same(drain.participants,[{containerId:api.id,bootId:priorParticipant.bootId,revision:context.runtimeSha,startedAt:api.startedAt,restartCount:api.restartCount}]),
  'ORIGINAL_BOOT_BINDING');
 const originalManifest=validateManifest({protocolVersion:1,phase:'FENCED',owner:drainedOwner,generation:drain.generation,targetSha:drainedTarget,participants:[priorParticipant]});
 const protectedControl=existing?.priorControl??store.read('background-control.json');
 assertSameBinding(protectedControl,binding);
 check(protectedControl.phase==='FENCED'&&protectedControl.generation===114&&protectedControl.manifestDigest===digest(originalManifest),'EXACT_HELD_CONTROL');

 let committed=false,expected=existing?.expected??null,closing=false,lease,proof;
 if(existing){
  check(!inspecting&&existing.executionSha===executionSha&&existing.witness===witness&&existing.pendingSha256===canonicalDigest(pending)&&
   same(existing.expected,drainedProjections(preparation,originalManifest,existing.recordedAt)),'EXACT_RESUMABLE_INTENT');
 }
 const noLater=()=>{
  const seq=fs.readdirSync(dir).filter(name=>name.startsWith('schema-release-step-'+drainedOwner+'-')).sort();
  const nft=JSON.parse(execFileSync('/usr/sbin/nft',['--json','list','tables'],{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','ignore']}));
  check(Array.isArray(nft.nftables)&&!nft.nftables.some(row=>row.table?.name==='phoenix_maintenance_'+canonicalDigest(context).slice(0,32)),'UNEXPECTED_DRAINED_NATIVE_TABLE');
  check(same(seq,[fileKey('step',drainedOwner+'-0-registered'),fileKey('step',drainedOwner+'-1-drained')])&&
   !['transaction.json','policy-transition.json','cutover-pending.json','deploy-'+drainedOwner+'.json',fileKey('schema-receipt'),
    fileKey('ingress-install-intent'),fileKey('ingress-install-program'),fileKey('ingress-installed'),fileKey('open-commit-intent')].some(n=>store.exists(n))&&
   !['migration','body'].some(role=>fs.existsSync(path.join(dir,'schema-release-'+role+'-'+drainedOwner))), 'LATER_EFFECT_OR_INTENT_PRESENT');
 };
 const projections=()=>{
  const manifest=readPublicManifest(),control=store.read('background-control.json'),high=store.read('background-generation.json');
  check((same(manifest,originalManifest)||expected&&same(manifest,expected.manifest))&&
   (same(control,protectedControl)||expected&&same(control,expected.record))&&
   (high.generation===114||expected&&same(high,expected.high)),'PROJECTION_MOVED');
  return {manifest,control,high};
 };
 const guard=()=>{
  store.guard();assertHeldEdge(dir);
  check(Date.now()<deadline&&!fs.existsSync('/proc/'+pending.supervisor.pid)&&
   (markerPresent?exactMarker()&&same(store.read(marker),pending):!store.exists(marker)&&same(store.read(drainedArchive).pending,pending))&&
   same(store.read('floor.json'),preparation.floor)&&same(store.read('active.json'),preparation.active)&&
   git(CONTRACT.repository,['rev-parse','HEAD'])===preparation.rootHeadSha,'HOST_GUARD');
  noLater();projections();
 };
 const projectionOpen=()=>{
  const {manifest,control,high}=projections();
  return expected&&same(manifest,expected.manifest)&&same(control,expected.record)&&same(high,expected.high)?manifest:null;
 };
 const apiObservation=manifest=>{
  for(const pin of [api,web,db]){
   const seen=inspectModernSchemaContainer(pin.id);
   check(seen.state.Running===true&&seen.state.Health?.Status==='healthy'&&seen.id===pin.id&&seen.imageId===pin.image&&
    seen.state.StartedAt===pin.startedAt&&seen.restarts===pin.restartCount,'ORIGINAL_RUNTIME_CHANGED');
  }
  const actual=inspectApiParticipant(priorParticipant,preparation.floor.project);
  const status=verifyParticipantStatus(actual,priorParticipant,manifest);
  check(actual.imageId===api.image&&actual.startedAt===api.startedAt&&status.inFlight===0&&status.taskGraphs===0&&status.pendingChildren===0,'ORIGINAL_NOT_QUIESCENT');
  return status;
 };
 guard();
 const session=new ModernSchemaControlSession({}, {isClosing:()=>closing}),reader=new ModernSchemaReadClient({databaseContainer:db.id});
 try{
  await session.start();check(await session.tryLock(1)&&await session.tryLock(2),'NEW_NATIVE_DUAL_LEASE');
  lease=await pinOriginalModernSchemaSession(session,context);
  check(same(lease.database,pending.lease.database)&&BigInt(lease.backendStartMicros)>BigInt(pending.lease.backendStartMicros),'SAME_PRIMARY_NEW_BACKEND');
  const admit=()=>verifyOriginalModernSchemaAdmission({session,lease,observeHost:guard});
  const ingress=new ModernSchemaIngress({context:oldPrep.context,scope:oldPrep.ingressScope,privateRuntime:runtime,admit});
  const observeOldFence=()=>{
   check(ingress.names().length===2&&same(ingress.host,oldIngress.host)&&canonicalDigest(ingressIdentity(ingress.tables()))===oldIngress.identitySha256,'OLD_NATIVE_FENCE_CHANGED');
  };
  const fence=async()=>{
   await ingress.check('DRAINED_OLD_FENCE');
   observeOldFence();
   return true;
  };
  await reader.start();
  let before=apiObservation(projections().manifest);
  const absent=async()=>{
   const {rows:[row]}=await reader.query(modernSchemaOriginalSessionExitSql(pending.lease));
   check(row.primary===true&&row.originalSessionPresent===false&&row.databaseOid===lease.database.databaseOid&&
    row.systemIdentifier===lease.database.systemIdentifier&&row.postmasterStartMicros===lease.database.postmasterStartMicros,'FAILED_LEASE_STILL_PRESENT');
  };
  const census=async()=>{
   await absent();
   const {rows:[{observation}]}=await reader.query(MODERN_SCHEMA_EXECUTOR_SQL),native=JSON.parse(observation),control=before.controlSession;
   classifyModernSchemaDatabaseExecutors(native,{runtimeAddress:preparation.hostSurface.runtimeAddress,originalLease:lease});
   check(native.workers.length===0&&native.sessions.filter(row=>row.pid===control.sessionPid&&row.applicationName===control.applicationName&&
    row.backendStartMicros===participantStartMicros(control.backendStartedAtUs)&&row.clientAddress===preparation.hostSurface.runtimeAddress).length===1,'ORIGINAL_BACKEND_PIN');
   check(native.sessions.every(row=>row.openTransaction===false||row.pid===control.sessionPid),'OTHER_OPEN_DATABASE_TRANSACTION');
   return verifyRecoveryHostProcesses(preparation,undefined,[pinModernSchemaChild(session.child),pinModernSchemaChild(reader.child)]);
  };
  await fence();await census();
  const ledger=await captureModernSchemaLedger(reader),facts=await captureModernSchemaFacts(reader),comparison=compareHeldFacts(baseline,facts);
  check(ledger.sha256===context.beforeLedgerSha256&&same(ledger.ledger,hold.nativeLedger.ledger)&&comparison.outcome==='MATCH'&&
   defaultOffEvidenceFromFacts(context.runtimeSha,facts,{floor:preparation.floor,plan:context,stage:'BEFORE_SCHEMA'}).verified,'FROZEN_FACTS_CHANGED');
  const work=runtime.createDirectory(recoveryOwner,'recovery');
  const observed=await captureModernSchemaCatalog({owner:recoveryOwner,stage:'recovery-after',databasePin:db,privateRuntime:runtime,directory:work,admit});
  check(observed.receipt.schemaSha256===catalogPin&&same(await captureModernSchemaLedger(reader),ledger),'NATIVE_CATALOG_OR_LEDGER_CHANGED');
  const hostSha256=await census();
  await fence();
  const final=apiObservation(projections().manifest);
  check(sameOperatorControlSession(before.controlSession,final.controlSession)&&
   await session.verifyParticipants([{...final.controlSession,bootId:priorParticipant.bootId}])===true,'ORIGINAL_PARTICIPANT_CHANGED');
  proof={pendingSha256:canonicalDigest(pending),factsSha256:comparison.after,schemaSha256:observed.receipt.schemaSha256,ledgerSha256:ledger.sha256,
   hostSha256,oldIngressSha256:oldIngress.identitySha256,publicHeld:true,schemaChanged:false,originalBootAt:api.startedAt};
  if(!inspecting){
   const rehearsed=store.read(rehearsalKey(witness));
   const raw=JSON.parse(readPinnedFile(path.join(dir,'.transport-'+witness+'-recover-rehearse-drained.receipt'),{contract:CONTRACT}));
   check(rehearsed.executionSha===executionSha&&rehearsed.recoveryOwner===witness&&same(rehearsed.proof,proof)&&
    rehearsed.leaseExit?.outcome==='ORIGINAL_SESSION_ABSENT'&&rehearsed.leaseExit.transportClosed&&
    same(raw,scopedResult(witness,'DRAINED_REHEARSED')),'EXACT_REHEARSAL_REQUIRED');
   const recordedAt=existing?.recordedAt??new Date().toISOString();
   expected=drainedProjections(preparation,originalManifest,recordedAt);
   const intent={schema:'phoenix.1123-drained-settlement-intent/v1',executionSha,witness,recordedAt,priorControl:protectedControl,expected,
    pendingSha256:canonicalDigest(pending),proof,witnessSha256:canonicalDigest(rehearsed)};
   putOnce(store,intentKey,intent);
   await fence();
   const current=projections();
   if(!same(current.control,expected.record))atomicState(store.file('background-control.json'),expected.record);
   if(!same(current.manifest,expected.manifest))atomicPublicManifest(PUBLIC_DIRECTORY,expected.manifest);
   if(!same(current.high,expected.high))atomicState(store.file('background-generation.json'),expected.high);
   check(confirmModernSchemaPublicDurability(projectionOpen,guard)?.durabilityConfirmed,'DURABLE_EMPTY_GRANT_PROJECTION');
   for(let i=0;i<45;i++){
    await fence();
    try{before=apiObservation(expected.manifest);committed=true;break;}catch{}
    await new Promise(resolve=>setTimeout(resolve,350));
   }
   check(committed&&sameOperatorControlSession(final.controlSession,before.controlSession)&&
    await session.verifyParticipants([{...before.controlSession,bootId:priorParticipant.bootId}])===true,'RECOVERED_ORIGINAL_BOOT_UNVERIFIED');
  }
  closing=true;
  const leaseExit=await closeModernSchemaOriginalSession({coordinator:{close:()=>session.close()},lease,client:reader,guard});
  check(leaseExit.outcome==='ORIGINAL_SESSION_ABSENT'&&leaseExit.transportClosed===true,'RECOVERY_SESSION_EXIT');
  await absent();guard();observeOldFence();
  if(inspecting){
   apiObservation(originalManifest);
   putOnce(store,rehearsalKey(recoveryOwner),{schema:'phoenix.1123-drained-rehearsal/v1',executionSha,recoveryOwner,proof,leaseExit});
   return 'DRAINED_REHEARSED';
  }
  const intent=store.read(intentKey);
  check(projectionOpen()&&same(intent.expected,expected),'SETTLED_PROJECTION_MOVED');
  const archived={schema:'phoenix.1123-drained-settled/v1',executionSha,witness,pending,expected,proof,intentSha256:canonicalDigest(intent),
   leaseExit,outerIngressHeld:true,formalTargetSuccess:false,automaticRetry:false};
  if(store.exists(drainedArchive)){
   const saved=store.read(drainedArchive);
   check(same({...saved,leaseExit},archived)&&saved.leaseExit?.outcome==='ORIGINAL_SESSION_ABSENT'&&saved.leaseExit.transportClosed===true,'SETTLEMENT_ARCHIVE_CHANGED');
  }else store.immutable(drainedArchive,archived);
  guard();
  const fd=fs.openSync(dir,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
  try{
   if(markerPresent){check(exactMarker(),'PENDING_FILE_REPLACED');fs.unlinkSync(markerPath);}
   fs.fsyncSync(fd);
  }finally{fs.closeSync(fd);}
  check(!store.exists(marker)&&projectionOpen(),'SETTLEMENT_PENDING_REMAINS');
  return 'DRAINED_SETTLED';
 }finally{try{await reader.close();}finally{closing=true;await session.close();}}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let outcome='HOLD',code=null;
 try{outcome=await execute(process.env);}catch(error){code=/^[A-Z_]+_HOLD=[A-Z0-9_]+$/.test(error?.message)?error.message:'DRAINED_HOLD=UNCLASSIFIED';}
 console.log(JSON.stringify(scopedResult(process.env.OPERATOR_RECOVERY_OWNER,outcome,code)));
 if(outcome==='HOLD')process.exitCode=1;
}
