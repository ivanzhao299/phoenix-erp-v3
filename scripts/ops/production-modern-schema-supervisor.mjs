import {readHeldHandoff,checkHeldNative,checkHeldWindow,guardHeldContinuation} from './production-remediation-fence-transfer.mjs';
/** Concrete original modern session: schema prelude -> reviewed formal API
 * body -> real OPEN -> ingress release -> ordinary trusted terminal state. */
import fs from 'node:fs';import path from 'node:path';
import {CONTRACT,verifyContext,secureJson,git,requireCleanMain,guardProduction} from './production-config-guard.mjs';
import {captureRuntime,executionEnv} from './capture-production-runtime.mjs';import {captureSnapshot} from './production-deployment-evidence.mjs';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {readRuntimeAccess} from './production-modern-schema-runtime-access.mjs';
import {readCompletedModernSchemaPredecessor} from './production-modern-schema-predecessor.mjs';
import {successorDecisions, successorRuntime,successorWebReserveMs} from './production-modern-schema-successor.mjs';
import {readRegisteredModernSchemaApproval} from './production-modern-schema-authority.mjs';
import {ModernSchemaRegistry,registerModernSchemaRelease,validateModernSchemaPreparation} from './production-modern-schema-registration.mjs';
import {ModernSchemaPrivateRuntime} from './production-modern-schema-private.mjs';import {ModernSchemaReadClient} from './production-modern-schema-read-client.mjs';
import {modernSchemaDispatchFromEnvironment,observeModernSchemaOriginalBackground} from './production-modern-schema-preparation.mjs';
import {verifyModernSchemaStage} from './production-modern-schema-stage.mjs';import {collectModernSchemaPlan} from './production-modern-schema-plan.mjs';
import {assertInitialModernSchemaProfile,captureModernSchemaFacts,assertModernSchemaBusinessUnchanged,defaultOffEvidenceFromFacts,captureModernSchemaDefaultOff} from './production-modern-schema-facts.mjs';
import {readConfirmedScopeInAuditSnapshot,verifyConfirmedModernSchemaSources} from './production-modern-schema-confirmed-scope.mjs';import {collectLegacyEggAuditEvidence} from './production-legacy-egg-audit-evidence.mjs';
import {modernSchemaMigrationEvidenceDigest,compareStableLegacyAudit} from './production-modern-schema-audit-recheck.mjs';
import {ModernSchemaReleaseState,modernSchemaStepEvidence,classifyModernSchemaRecovery} from './production-modern-schema-state.mjs';
import {ModernSchemaControlSession,pinOriginalModernSchemaSession,originalModernSchemaSessionPredicate,assertModernSchemaLeaseStillOriginal,assertOriginalModernSchemaProcess,verifyOriginalModernSchemaAdmission} from './production-modern-schema-session-lease.mjs';
import {pinModernSchemaChild} from './production-modern-schema-processes.mjs';
import {BackgroundManifestPublisher,assertSameBinding,readPublicManifest,HOLD_KINDS} from './background-control-manifest.mjs';
import {BackgroundFenceCoordinator,inspectApiParticipant,verifyCompletedDeployment} from './background-control-coordinator.mjs';
import {collectModernSchemaHostSurface,MODERN_SCHEMA_EXECUTOR_SQL,classifyModernSchemaDatabaseExecutors} from './production-modern-schema-executors.mjs';
import {ModernSchemaExecutorWatch} from './production-modern-schema-watch.mjs';import {ModernSchemaIngress} from './production-modern-schema-ingress.mjs';
import {persistModernSchemaOriginalDrain} from './production-modern-schema-drain.mjs';
import {stopOriginalModernSchemaRuntime} from './production-modern-schema-stop.mjs';import {observeModernSchemaDiskSpace} from './production-modern-schema-disk.mjs';
import {createModernSchemaBackup} from './production-modern-schema-backup.mjs';import {rehearseModernSchemaRelease} from './production-modern-schema-rehearsal.mjs';
import {captureModernSchemaCatalog} from './production-modern-schema-catalog.mjs';import {captureModernSchemaLedger,verifyModernSchemaEffect} from './production-modern-schema-schema-result.mjs';
import {runModernSchemaMigrationDriver} from './production-modern-schema-migration-driver.mjs';import {observeModernSchemaCliBackend} from './production-modern-schema-gated-cli.mjs';
import {runModernSchemaFormalApiBody} from './production-modern-schema-api-body.mjs';import {prepareModernSchemaOpenCommit,finalizeCommittedModernSchemaOpen} from './production-modern-schema-terminal.mjs';
import {closeModernSchemaOriginalSession,observeCommittedModernSchemaOpen,confirmModernSchemaPublicDurability} from './production-modern-schema-completion.mjs';
import {denyModernSchemaBackground} from './production-modern-schema-deny.mjs';import {recoverModernSchemaBeforeDdl,observeCommittedModernSchemaRecoveryOpen,finalizeCommittedModernSchemaRecoveredOriginal} from './production-modern-schema-recover-original.mjs';
const fail=code=>{throw Error('MODERN_SCHEMA_SUPERVISOR_HOLD='+code);};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const participantOf=actual=>({containerId:actual.containerId,revision:actual.revision,bootId:actual.status.bootId,allowedKinds:[...HOLD_KINDS]});
const HOLD_STAGES=[
 'BEFORE_STOPPED_PROOF','DRAINED_COMMIT','NATIVE_WATCH_CONSTRUCT','PRIMARY_READ_CHANNEL','WATCH_READ_CHANNEL','NATIVE_WATCH_INITIALIZE',
 'NATIVE_WATCH_HEARTBEAT','NATIVE_INGRESS_CONSTRUCT','NATIVE_FENCE_BUDGET','NATIVE_INGRESS_INSTALL','R_STOPPED_STEP','FRESH_CONFIRMED_SCOPE','FRESH_AUDIT_EVIDENCE','FRESH_REFERENCE_EVIDENCE','FRESH_AUDIT_COMPARE','FRESH_LEDGER',
 'BEFORE_CATALOG_ADMISSION','BEFORE_CATALOG_OUTPUT','BEFORE_CATALOG_CHILD_ADMISSION','BEFORE_CATALOG_DUMP','BEFORE_CATALOG_RECEIPT',
 'FENCED_DISK','FENCED_BACKUP','FENCED_REHEARSAL','FINAL_PRE_DDL_RECHECK','DDL_AND_AFTER',
];
const EARLY_NATIVE_STAGES=new Set(HOLD_STAGES.slice(1,HOLD_STAGES.indexOf('R_STOPPED_STEP')));
const HOLD_CODES=new Set([
 'MODERN_SCHEMA_SUPERVISOR_HOLD=INSUFFICIENT_WINDOW_BEFORE_FENCE',
 'MODERN_SCHEMA_WATCH_HOLD=ORIGINAL_PREPARATION_REQUIRED',
 'MODERN_SCHEMA_EXECUTORS_HOLD=UNKNOWN_OR_CROSS_DATABASE_CLIENT',
 'BACKGROUND_HOLD=CONTROL_SESSION_TIMEOUT',
 'MAINTENANCE_HOLD=ROOT_READER_BOUNDED_READ_FAILED',
 'MODERN_SCHEMA_WATCH_HOLD=ORIGINAL_OWNED_READ_CHANNEL_REQUIRED',
 'MODERN_SCHEMA_WATCH_HOLD=UNREGISTERED_HOST_EXECUTOR',
 'MODERN_SCHEMA_WATCH_HOLD=UNREGISTERED_FOREIGN_CONTAINER',
 'MODERN_SCHEMA_WATCH_HOLD=HELD_RESOURCE_REMOVED_OR_CHANGED',
 'MODERN_SCHEMA_WATCH_HOLD=HISTORICAL_COMPOSE_ARTIFACT_CHANGED',
 'MODERN_SCHEMA_LEASE_HOLD=ORIGINAL_CONTROL_CHANNEL_NOT_IDLE',
 'MODERN_SCHEMA_LEASE_HOLD=SYNCHRONOUS_OBSERVATION_REQUIRED',
 'MODERN_SCHEMA_LEASE_HOLD=OBSERVATION_CONTROL_REENTRY_FORBIDDEN',
 'HANDOFF_TRANSFER_HOLD=INGRESS_CHANGED',
 'HANDOFF_TRANSFER_HOLD=CUMULATIVE_CUTOFF',
 'HELD_RESOURCES_HOLD=CLONE_ISOLATION_SET',
 'HELD_RESOURCES_HOLD=CLONE_ISOLATION_CHANGED',
 'MODERN_SCHEMA_INGRESS_HOLD=EXACT_NATIVE_SCOPE_REQUIRED',
 'MODERN_SCHEMA_INGRESS_HOLD=ORIGINAL_BRIDGE_CHANGED',
 'MODERN_SCHEMA_INGRESS_HOLD=ORIGINAL_NETWORK_CHANGED',
 'MODERN_SCHEMA_INGRESS_HOLD=NATIVE_KERNEL_OBSERVATION_OR_EFFECT_UNRESOLVED',
 'MODERN_SCHEMA_SUPERVISOR_HOLD=FROZEN_CONFIRMED_CASE_CHANGED',
 'MODERN_SCHEMA_SUPERVISOR_HOLD=FENCED_LEDGER_CHANGED',
 'MODERN_SCHEMA_SUPERVISOR_HOLD=FENCED_AUDIT_BOUNDARY_CHANGED',
 'MODERN_SCHEMA_HOLD=FENCED_AUDIT_BOUNDARY_UNVERIFIED',
 'MODERN_SCHEMA_SUPERVISOR_HOLD=FROZEN_BACKUP_SNAPSHOT_LEDGER_CHANGED',
 'MODERN_SCHEMA_SUPERVISOR_HOLD=ORIGINAL_NATIVE_SESSION_LOST',
 'MODERN_SCHEMA_HOLD=FRESH_FENCED_AUDIT_TIME_UNVERIFIED',
 'MODERN_SCHEMA_HOLD=REVIEWED_AUDIT_FACTS_MOVED',
 'MODERN_SCHEMA_HOLD=AUDIT_BINDING_OR_STRUCTURAL_HOLD',
 'MODERN_SCHEMA_HOLD=FROZEN_LEGACY_CLAIM_UNVERIFIED',
 'MODERN_SCHEMA_HOLD=REFERENCE_COVERAGE_UNVERIFIED',
 'MODERN_SCHEMA_HOLD=REGISTERED_SOURCE_AUDIT_MISMATCH',
 'MODERN_SCHEMA_HOLD=APPROVAL_WINDOW_CLOSED',
 'LEGACY_EGG_AUDIT_DATABASE_IDENTITY_MISMATCH',
 'MODERN_SCHEMA_READ_HOLD=DATABASE_CHANNEL_LOST',
 'MODERN_SCHEMA_READ_HOLD=READ_DEADLINE',
 'MODERN_SCHEMA_READ_HOLD=ROOT_CONTEXT_LOST',
 'MODERN_SCHEMA_READ_HOLD=FRAME_SIZE',
 'MODERN_SCHEMA_READ_HOLD=SERIAL_READ_CHANNEL_REQUIRED',
 'MODERN_SCHEMA_STATE_HOLD=WINDOW_EXPIRED',
 'MODERN_SCHEMA_LEASE_HOLD=PRIMARY_OBSERVATION_UNAVAILABLE',
 'MODERN_SCHEMA_LEASE_HOLD=ORIGINAL_NATIVE_SESSION_LOST',
 'MODERN_SCHEMA_LEASE_HOLD=ORIGINAL_SESSION_LOST_OR_REPLACED',
 'MODERN_SCHEMA_WATCH_HOLD=NATIVE_CONTINUITY_OBSERVATION_UNAVAILABLE',
 'MODERN_SCHEMA_WATCH_HOLD=NATIVE_CONTAINER_NAMESPACE_UNOBSERVABLE',
 'MODERN_SCHEMA_WATCH_HOLD=NEW_OR_CHANGED_FOREIGN_CONTAINER',
 'MODERN_SCHEMA_WATCH_HOLD=RETAINED_ARTIFACT_CHANGED',
 'MODERN_SCHEMA_WATCH_HOLD=UNKNOWN_DATABASE_NETWORK_MEMBER',
 'MODERN_SCHEMA_WATCH_HOLD=NEW_OR_CHANGED_HOST_EXECUTOR',
 'MODERN_SCHEMA_WATCH_HOLD=EXACT_STALLED_ORIGINAL_STOP_STAGE_REQUIRED',
 'MODERN_SCHEMA_WATCH_HOLD=NATIVE_STALLED_ORIGINAL_STOP_PROOF_REQUIRED',
 'MODERN_SCHEMA_WATCH_HOLD=EXACT_FENCED_REHEARSAL_READER_REQUIRED',
 'MODERN_SCHEMA_WATCH_HOLD=EXACT_FENCED_REHEARSAL_CHILD_REQUIRED',
 'MODERN_SCHEMA_WATCH_HOLD=EXACT_FENCED_REHEARSAL_DATABASE_REQUIRED',
 'MODERN_SCHEMA_WATCH_HOLD=FENCED_REHEARSAL_READER_LOST',
 'MODERN_SCHEMA_WATCH_HOLD=FENCED_REHEARSAL_READER_CLOSE_UNVERIFIED',
 'MODERN_SCHEMA_WATCH_HOLD=OWNED_READ_TRANSPORT_LOST',
 'MODERN_SCHEMA_WATCH_HOLD=ORIGINAL_READONLY_BACKUP_PROCESS_REQUIRED',
 'MODERN_SCHEMA_WATCH_HOLD=REMOTE_READONLY_BACKUP_RESULT_UNRESOLVED',
 'MODERN_SCHEMA_WATCH_HOLD=READONLY_BACKUP_BACKEND_CHANGED',
 'MODERN_SCHEMA_WATCH_HOLD=SECOND_READONLY_BACKUP_EXECUTOR',
 'MODERN_SCHEMA_WATCH_HOLD=SCHEDULER_DEFINITION_CHANGED_OR_UNACCOUNTED',
 'MAINTENANCE_HOLD=ROOT_READER_MODERN_PROCESS_VISIBILITY_REQUIRED',
 'MODERN_SCHEMA_EXECUTORS_HOLD=ORIGINAL_CONTROL_CHILD_UNPROVED',
 'MODERN_SCHEMA_EXECUTORS_HOLD=CONTAINER_IDENTITY_REQUIRED',
 'MODERN_SCHEMA_EXECUTORS_HOLD=SURFACE_OBSERVATION_UNAVAILABLE',
 'MODERN_SCHEMA_EXECUTORS_HOLD=UNKNOWN_OR_NEW_DATABASE_EXECUTOR',
 'MODERN_SCHEMA_EXECUTORS_HOLD=UNKNOWN_DATABASE_APPLY_OR_EXTENSION_WORKER',
 'MODERN_SCHEMA_EXECUTORS_HOLD=ORIGINAL_CONTROL_SESSION_MISSING',
 'MODERN_SCHEMA_CATALOG_HOLD=ORIGINAL_FENCED_LEASE_REQUIRED',
 'MODERN_SCHEMA_CATALOG_HOLD=BOUNDED_SCHEMA_DUMP_REQUIRED',
 'MODERN_SCHEMA_PRIVATE_HOLD=CHILD_IDENTITY_UNPROVED',
 'MODERN_SCHEMA_PRIVATE_HOLD=CHILD_START_FAILED',
 'MODERN_SCHEMA_PRIVATE_HOLD=CHILD_DEADLINE',
 'MODERN_SCHEMA_PRIVATE_HOLD=CHILD_EXIT_BEFORE_ADMISSION',
 'MODERN_SCHEMA_PRIVATE_HOLD=CHILD_RESULT_UNVERIFIED',
 'MODERN_SCHEMA_PRIVATE_HOLD=PRIVATE_FILE_CHANGED',
 'MODERN_SCHEMA_DISK_HOLD=INSUFFICIENT_ROOT_STATE_OR_DOCKER_SPACE',
 'MODERN_SCHEMA_BACKUP_HOLD=SOURCE_GUARD',
 'MODERN_SCHEMA_BACKUP_HOLD=DISK',
 'MODERN_SCHEMA_BACKUP_HOLD=VERSION',
 'MODERN_SCHEMA_BACKUP_HOLD=FACTS',
 'MODERN_SCHEMA_BACKUP_HOLD=LEDGER',
 'MODERN_SCHEMA_BACKUP_HOLD=EXPORT_SNAPSHOT',
 'MODERN_SCHEMA_BACKUP_HOLD=EXECUTION',
 'MODERN_SCHEMA_BACKUP_HOLD=WINDOW',
 'MODERN_SCHEMA_BACKUP_HOLD=SNAPSHOT_CONTINUITY',
 'MODERN_SCHEMA_BACKUP_HOLD=VERIFICATION',
 'MODERN_SCHEMA_BACKUP_HOLD=CLEANUP_UNRESOLVED',
 'MODERN_SCHEMA_SUPERVISOR_HOLD=INSUFFICIENT_WINDOW_TO_RECOVER_ORIGINAL',
 'MODERN_SCHEMA_SUPERVISOR_HOLD=INSUFFICIENT_WINDOW_BEFORE_DDL',
 'MODERN_SCHEMA_STOP_HOLD=ORIGINAL_TERM_TIMEOUT_KEEP_FENCED',
 'MODERN_SCHEMA_STOP_HOLD=ORIGINAL_TERM_RESULT_UNRESOLVED',
 'MODERN_SCHEMA_STOP_HOLD=STALLED_ORIGINAL_FIRST_TERM_NOT_ACKNOWLEDGED',
 'MODERN_SCHEMA_STOP_HOLD=STALLED_ORIGINAL_FENCES_UNVERIFIED',
 'MODERN_SCHEMA_STOP_HOLD=STALLED_ORIGINAL_IDENTITY_CHANGED',
 'MODERN_SCHEMA_STOP_HOLD=STALLED_ORIGINAL_LISTENER_NOT_CLOSED',
 'MODERN_SCHEMA_STOP_HOLD=STALLED_ORIGINAL_EXECUTOR_NOT_IDLE',
 'MODERN_SCHEMA_STOP_HOLD=STALLED_ORIGINAL_EXECUTOR_CHANGED',
 'MODERN_SCHEMA_STOP_HOLD=STALLED_ORIGINAL_TERM_NOT_ACKNOWLEDGED',
 'MODERN_SCHEMA_STOP_HOLD=STALLED_ORIGINAL_TERMINAL_EVENTS_REQUIRED',
]);

/** First observed failure and elapsed time only. Error text, stacks, causes,
 * queries and command output never enter this protected stage receipt. */
export function createModernSchemaFirstHoldEvidence(now=()=>performance.now()){
 let stage=HOLD_STAGES[0],started=now(),first=null;
 const elapsed=[];
 const current=()=>({stage,elapsedMs:Math.max(0,Math.ceil(now()-started))});
 return {
  enter(next){
   if(!HOLD_STAGES.includes(next)||next===stage)fail('INVALID_PRIVATE_HOLD_STAGE');
   elapsed.push(current());stage=next;started=now();
  },
  record(error,source){
   if(first)return first;
   if(!['SUPERVISOR','EXECUTOR_WATCH','LEASE_HEARTBEAT'].includes(source))fail('INVALID_PRIVATE_HOLD_SOURCE');
   let code='UNCLASSIFIED',nativeProcessReason=null,nativeHostProcess=null,errorType=null;
   try{
    const message=error?.message;
    if(HOLD_CODES.has(message))code=message;
    const reason=error?.nativeProcessCensusReason;
    if(message==='MAINTENANCE_HOLD=ROOT_READER_MODERN_PROCESS_VISIBILITY_REQUIRED'&&
     ['PERMISSION_DENIED','IDENTITY_UNVERIFIED','EXISTENCE_UNVERIFIED','PROC_ENTRY_CHURN_PERSISTS'].includes(reason))nativeProcessReason=reason;
    if(['MODERN_SCHEMA_WATCH_HOLD=NEW_OR_CHANGED_HOST_EXECUTOR','MODERN_SCHEMA_WATCH_HOLD=UNREGISTERED_HOST_EXECUTOR'].includes(message)){
     const sample=error.nativeHostProcess,kinds=['UNAVAILABLE','PYTHON','SHELL','NODE','POSTGRES_TOOL','JAVA','DOCKER','OTHER'];
     if(sample&&Number.isSafeInteger(sample.pid)&&sample.pid>1&&Number.isSafeInteger(sample.ppid)&&sample.ppid>=0&&
      kinds.includes(sample.kind)&&kinds.includes(sample.parentKind)&&
      [sample.identitySha256,sample.argvSha256,sample.groupSha256].every(value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value))){
      const {pid,ppid,kind,parentKind,identitySha256,argvSha256,groupSha256}=sample;
      nativeHostProcess=Object.freeze({pid,ppid,kind,parentKind,identitySha256,argvSha256,groupSha256,
       erpControlReference:sample.erpControlReference===true,registeredParent:sample.registeredParent===true,ownedDumpParent:sample.ownedDumpParent===true});
     }
    }
    if(code==='UNCLASSIFIED'&&EARLY_NATIVE_STAGES.has(stage)){
     const name=error?.name;
     if(['TypeError','ReferenceError','SyntaxError','RangeError'].includes(name))errorType=name;
    }
    if(code==='UNCLASSIFIED'&&['BEFORE_CATALOG_OUTPUT','BEFORE_CATALOG_RECEIPT'].includes(stage)){
     const errno=error?.code;
     if(['EACCES','EEXIST','EIO','EMFILE','ENFILE','ENOENT','ENOSPC','EPERM','EROFS'].includes(errno))code='CATALOG_FILE_'+errno;
    }
   }catch{/* Even an error without readable fields receives a bounded code. */}
   first=Object.freeze({source,code,...(errorType?{errorType}:{}),...(nativeProcessReason?{nativeProcessReason}:{}),...(nativeHostProcess?{nativeHostProcess}:{}),
    ...current(),priorStages:Object.freeze(elapsed.map(item=>Object.freeze(item)))});
   return first;
  },
 };
}
export function assertModernSchemaWindowBudget({end,factsElapsedMs,operation,inFlightMs=0,recoveryReserveMs=0},now=Date.now()){
 // Both paths need two further original-database scans. The fixed margin
 // covers their separate migration/switch or original-recovery operations.
 const remainingMs=Date.parse(end)-now;
 const fixedMargin=operation==='ddl'?240000:150000;
 const requiredMs=Math.max(Math.ceil(factsElapsedMs*2*1.15)+fixedMargin,recoveryReserveMs)+inFlightMs;
 if(!['ddl','recoverOriginal'].includes(operation)||!Number.isSafeInteger(factsElapsedMs)||factsElapsedMs<=0||
  !Number.isSafeInteger(inFlightMs)||inFlightMs<0||!Number.isSafeInteger(remainingMs)||remainingMs<requiredMs){
  fail(operation==='ddl'?'INSUFFICIENT_WINDOW_BEFORE_DDL':'INSUFFICIENT_WINDOW_TO_RECOVER_ORIGINAL');
 }
}
export function assertSuccessorFenceBudget(preparation,now=Date.now()){
 if(!preparation.successorDecisions)return;
 const timing=preparation.successorDecisions,measured=preparation.oldRuntimeCompatibility;
 const recovery=Math.max(timing.recoveryReserveMs,Math.ceil((measured.restoreMs+measured.originalReadyMs)*1.25)+150000);
 const required=Math.max(timing.rehearsalMs,measured.rehearsalMs)+recovery+successorWebReserveMs;
 if(!Number.isSafeInteger(required)||Date.parse(preparation.context.window.end)-now<required)fail('INSUFFICIENT_WINDOW_BEFORE_FENCE');
}
function latest(dispatch){requireCleanMain(CONTRACT.repository);if(git(CONTRACT.repository,['rev-parse','origin/main'],{timeoutMs:10000})!==dispatch.targetSha
 ||git(CONTRACT.repository,['ls-remote','origin','refs/heads/main'],{timeoutMs:10000}).split(/\s/)[0]!==dispatch.targetSha)fail('LATEST_APPROVED_MAIN_CHANGED');}
export async function superviseModernSchemaRelease(env,input){
 const dispatch=modernSchemaDispatchFromEnvironment(env),directory=CONTRACT.stateDirectory,root=CONTRACT.repository;
 const runtime=new ModernSchemaPrivateRuntime(),store=new ModernSchemaRegistry();runtime.guard();verifyModernSchemaStage(dispatch);latest(dispatch);
 const preparation=store.read(`schema-release-preparation-${dispatch.owner}.json`),validated=validateModernSchemaPreparation(preparation),context=validated.context;
 if(preparation.preparationSha256!==input.preparationSha256||context.targetSha!==dispatch.targetSha||context.owner!==dispatch.owner||context.floorSha!==dispatch.floorSha)fail('EXACT_PROTECTED_PREPARATION_REQUIRED');
 if(!same(preparation.stagedSource,verifyModernSchemaStage(dispatch)))fail('PREPARED_SOURCE_GRAPH_CHANGED');
 const handoff=preparation.successorDecisions?readHeldHandoff(store,dispatch.targetSha):null;
 let retainedNative=null;
 if(Boolean(handoff)!==Boolean(preparation.handoffSha256))fail('HELD_PREPARATION_CHANGED');
 if(preparation.successorDecisions)checkHeldWindow(handoff,context.window);
 if(handoff){
  if(handoff.handoffSha256!==preparation.handoffSha256)fail('HELD_PREPARATION_CHANGED');
  retainedNative=await checkHeldNative({handoff,store,runtime,admit:async()=>{runtime.guard();return true;}});
 }
 const sessionDirectory=runtime.createDirectory(context.owner,'session');
 await registerModernSchemaRelease({owner:context.owner,preparationSha256:input.preparationSha256,identityToken:input.identityToken},{identityDependencies:{credential:input.githubReadToken}});
 input.identityToken=null;input.githubReadToken=null;
 const client=new ModernSchemaReadClient(),watchClient=new ModernSchemaReadClient();let clientsStarted=false,state=null,coordinator=null,publisher=null,ingress=null,watch=null,rootLease=null;
 let originalProcess=null,beforeFacts=null,beforeFactsElapsedMs=null,beforeLedger=null,beforeCatalog=null,originalRestartPolicy=null,committed=false,recovering=false,closeHeartbeat=null,fatal=null;
 const ownedResources=[...preparation.ownedResources];let recoveryResult=null,openCommitIntent=null,terminalComplete=false;
 const firstHold=createModernSchemaFirstHoldEvidence();
 const enter=stage=>{
  // The async watcher may already have failed while a collector waited.
  if(watch?.failed)firstHold.record(watch.failed,'EXECUTOR_WATCH');
  firstHold.enter(stage);
 };
 const denialAdmission=()=>{runtime.guard();if(!originalProcess||originalProcess.pid!==process.pid||assertOriginalModernSchemaProcess(originalProcess)!==true)fail('ORIGINAL_DENIAL_SUPERVISOR_LOST');
  if(state)assertSameBinding(state.read(),state.binding);return true;};
 const native=async({allowHeld=false}={})=>{
  const observeHost=()=>{
   if(handoff){guardHeldContinuation(handoff,directory);retainedNative?.recheck();}
   runtime.guard();
   if(allowHeld){
    const pending=state?.read();
    if(!recovering||!rootLease||!watch||pending?.status!=='HOLD'||
     !['R_STOPPED','FRESH_RECHECKED','BACKUP_VERIFIED'].includes(pending.phase)||state.ddlIntentExists())
     fail('SAME_LEASE_PRE_DDL_RECOVERY_REQUIRED');
   }else{
    if(fatal)throw fatal;
    watch?.assertHealthy();
   }
   if(env.TARGET_SHA!==context.targetSha||env.DEPLOY_RUN_ID!==context.owner)fail('ORIGINAL_HOST_ENVIRONMENT_CHANGED');
   const record=store.read(`schema-release-preparation-${context.owner}.json`);if(!same(record,preparation)||record.preparationSha256!==input.preparationSha256)fail('PROTECTED_PREPARATION_CHANGED');
   if(originalProcess&&(originalProcess.pid!==process.pid||assertOriginalModernSchemaProcess(originalProcess)!==true))fail('ORIGINAL_SUPERVISOR_CHANGED');
   if(state){const pending=state.read();assertSameBinding(pending,state.binding);if(!allowHeld&&pending.status!=='RUNNING')fail('PENDING_NOT_RUNNING');}
   if(rootLease&&(!coordinator.session.connected()||assertModernSchemaLeaseStillOriginal(rootLease)!==true))fail('ORIGINAL_NATIVE_SESSION_LOST');
   const floor=secureJson(path.join(directory,'floor.json'));if(floor.chanjetPolicy!=='HOLD'||floor.readonlyApproval!==null)fail('CHANJET_HOLD_CHANGED');
   runtime.guard();
   // Last: the native observation above may itself cross the approval window.
   readRegisteredModernSchemaApproval(context);
  };
  if(rootLease){
   await verifyOriginalModernSchemaAdmission({session:coordinator.session,lease:rootLease,observeHost});
  }else observeHost();
  return true;
 };
 const admitHeldRecovery=()=>watch.observeRecoveryHost(()=>native({allowHeld:true}));
 const stopHeartbeat=async()=>{await closeHeartbeat?.();closeHeartbeat=null;if(fatal)throw fatal;};
 const windowBudget=(operation,inFlightMs)=>assertModernSchemaWindowBudget({end:context.window.end,factsElapsedMs:beforeFactsElapsedMs,operation,inFlightMs:(inFlightMs??0)+(operation==='ddl'&&preparation.successorDecisions?successorWebReserveMs:0),recoveryReserveMs:preparation.successorDecisions?Math.max(preparation.successorDecisions.recoveryReserveMs,Math.ceil((preparation.oldRuntimeCompatibility.restoreMs+preparation.oldRuntimeCompatibility.originalReadyMs)*1.25)+150000):0});
 const advance=async(from,to,evidence,options)=>{
  await native();
  if(to==='DDL_STARTED')windowBudget('ddl');
  state.advance(from,to,modernSchemaStepEvidence(context,to,evidence),options);await native();
 };
 const disk=async()=>{const {rows:[size]}=await client.query('SELECT pg_database_size(current_database())::text AS bytes');return observeModernSchemaDiskSpace({databaseBytes:size.bytes});};
 const observeFencedAudit=async()=>{
  await native();
  const pending=state.read(),current=publisher.readPrivate(),projected=publisher.readPublic();
  assertSameBinding(current,state.binding);
  if(!['R_STOPPED','BACKUP_VERIFIED'].includes(pending.phase)||pending.status!=='RUNNING'||state.ddlIntentExists()||
   current.phase!=='FENCED'||projected.phase!=='FENCED'||projected.owner!==context.owner||projected.targetSha!==context.targetSha||
   current.generation!==projected.generation||!same(projected,coordinator.manifest)||
   store.read('background-generation.json').generation!==projected.generation)fail('FENCED_AUDIT_BOUNDARY_CHANGED');
  const proof=await ingress.observe();
  await native();
  if(!same(state.read(),pending)||!same(publisher.readPrivate(),current)||!same(publisher.readPublic(),projected)||
   store.read('background-generation.json').generation!==projected.generation)fail('FENCED_AUDIT_BOUNDARY_CHANGED');
  return {schema:'phoenix.modern-schema-fenced-audit-observation/v1',owner:context.owner,contextDigest:canonicalDigest(context),
   phase:pending.phase,leaseSha256:canonicalDigest(rootLease),generation:projected.generation,
   ingressIdentitySha256:proof.identitySha256,backgroundSha256:canonicalDigest({current,projected}),checkedAt:new Date().toISOString()};
 };
 const audit=async({fenced=false,trackFencedStages=false}={})=>{
  const sourceDirective=verifyConfirmedModernSchemaSources(root,fs,context.targetSha);
  const before=fenced?await observeFencedAudit():null;
  if(trackFencedStages)enter('FRESH_AUDIT_EVIDENCE');
  const startedAt=new Date().toISOString();
  const fresh=await collectLegacyEggAuditEvidence(client,{targetSha:context.targetSha,floorSha:context.floorSha,runningApiSha:context.runtimeSha,ledgerSha256:context.beforeLedgerSha256,
   migrationEvidenceSha256:modernSchemaMigrationEvidenceDigest(context),databaseIdentity:{name:preparation.reviewedAudit.evidence.databaseIdentity.name,schema:'public',systemIdentifier:preparation.reviewedAudit.evidence.databaseIdentity.systemIdentifier},
   manifest:preparation.manifest},{
   async confirmScopeInSnapshot(originalAudit){
    if(trackFencedStages)enter('FRESH_CONFIRMED_SCOPE');
    const fixed=await readConfirmedScopeInAuditSnapshot(client,originalAudit,sourceDirective);
    if(!same(fixed.manifest,preparation.manifest))fail('FROZEN_CONFIRMED_CASE_CHANGED');
    if(trackFencedStages)enter('FRESH_REFERENCE_EVIDENCE');
   },
  });
  const finishedAt=new Date().toISOString();
  if(trackFencedStages)enter('FRESH_AUDIT_COMPARE');
  const fences=fenced?{before,after:await observeFencedAudit()}:undefined;
  const comparison=compareStableLegacyAudit({context,reviewed:preparation.reviewedAudit,fresh,frozenManifest:preparation.manifest,
   sampleStartedAt:startedAt,sampleFinishedAt:finishedAt,fences});
  return {fresh,comparison,fences};
 };
 const auditFenced=trackFencedStages=>watch.observeFencedFacts(state.read().phase,()=>audit({fenced:true,trackFencedStages}));
 try{
  await client.start();await watchClient.start();clientsStarted=true;
  runtime.children.add(pinModernSchemaChild(client.child));runtime.children.add(pinModernSchemaChild(watchClient.child));
  const actual=captureRuntime();guardProduction(root,directory,actual,undefined,{allowFloorReanchor:true,reanchorTarget:context.targetSha,previousFloorSha:context.floorSha});
  if(!same(secureJson(path.join(directory,'floor.json')),preparation.floor)||!same(secureJson(path.join(directory,'active.json')),preparation.active)
   ||git(root,['rev-parse','HEAD'],{timeoutMs:10000})!==preparation.rootHeadSha)fail('PRE_EFFECT_FLOOR_OR_HEAD_CHANGED');
  const pre=captureSnapshot({phase:'PRE_SNAPSHOT',runId:context.owner,runAttempt:env.DEPLOY_RUN_ATTEMPT,targetSha:context.targetSha,floorSha:context.targetSha,deployMode:'api'});
  if(!same(pre.containers,preparation.originalSnapshot.containers))fail('PRE_EFFECT_RUNTIME_CHANGED');
  const background=observeModernSchemaOriginalBackground(pre,preparation.floor);
  if(!same(background.record,preparation.originalBackground.record)||!same(background.manifest,preparation.originalBackground.manifest))fail('ORIGINAL_OPEN_CHANGED');
  const observed=await collectModernSchemaPlan(client,{owner:context.owner,targetSha:context.targetSha,runtimeSha:context.runtimeSha,candidateImageId:context.candidateImageId});
  if(context.runtimeSha===successorRuntime){
   if(!same(await readRuntimeAccess(client,background.actual,context.targetSha),preparation.apiAccess))fail('PREVIEW_RUNTIME_AUTHORITY_CHANGED');
   const decisions=successorDecisions(store,env.MODERN_SCHEMA_1123_ACTION,context.floorSha,observed.plan);
   if(!same(readCompletedModernSchemaPredecessor(store,observed.plan),preparation.predecessor)||!same(decisions,preparation.successorDecisions))fail('PROTECTED_CANDIDATE_DECISIONS_CHANGED');
   if(Date.parse(context.window.end)-Date.now()<decisions.recoveryReserveMs+decisions.rehearsalMs+successorWebReserveMs)fail('INSUFFICIENT_WINDOW_BEFORE_DRAIN');
  }else assertInitialModernSchemaProfile(context.floorSha,observed.plan);
  if(!same(observed.plan,preparation.plan))fail('COMPLETE_PLAN_OR_LEDGER_CHANGED');ownedResources.push(observed.imageProof);
  const surface=collectModernSchemaHostSurface(pre,{ownedResources,predecessorResources:preparation.predecessor?.resources,successorStore:preparation.successorDecisions?store:null,handoff,getOwnedChildren:()=>runtime.registeredChildren()});
  if(!same(surface,preparation.hostSurface))fail('PRE_EFFECT_HOST_SURFACE_CHANGED');
  const ownedReadSessions=[];
  for(const reader of [client,watchClient]){
   const {rows:[backend]}=await reader.query(`SELECT pg_backend_pid() AS pid,(SELECT oid::bigint FROM pg_database WHERE datname=current_database()) AS "databaseOid",
    trunc(EXTRACT(epoch FROM backend_start)*1000000)::text AS "backendStartMicros",current_setting('default_transaction_read_only')='on' AS readonly,
    current_database() AS name,(SELECT system_identifier::text FROM pg_control_system()) AS "systemIdentifier" FROM pg_stat_activity WHERE pid=pg_backend_pid()`);
   if(backend.readonly!==true||canonicalDigest({name:backend.name,schema:'public',systemIdentifier:backend.systemIdentifier})!==context.databaseIdentitySha256)fail('PRE_EFFECT_OWNED_READ_BACKEND_CHANGED');
   ownedReadSessions.push({pid:backend.pid,databaseOid:backend.databaseOid,backendStartMicros:backend.backendStartMicros,nativeProofSha256:canonicalDigest({backend,child:pinModernSchemaChild(reader.child).pin})});
  }
  const {rows:[{observation:preEffectExecutors}]}=await client.query(MODERN_SCHEMA_EXECUTOR_SQL);
  classifyModernSchemaDatabaseExecutors(JSON.parse(preEffectExecutors),{runtimeAddress:surface.runtimeAddress,ownedReadSessions});
  await disk();await audit();await native();latest(dispatch);
  runtime.publishJson(path.join(directory,`deploy-${context.owner}-pre-evidence.json`),pre);
  // No external effect precedes a successful claim. Preserve partial local
  // evidence without sending a failed claim into the original-S guardian.
  assertSuccessorFenceBudget(preparation);
  const proposedState=new ModernSchemaReleaseState(context,input.preparationSha256),claimed=proposedState.claim();state=proposedState;originalProcess=claimed.supervisor;
  publisher=new BackgroundManifestPublisher({}, {verifySchemaReleaseAuthority:(binding,operation)=>{
   runtime.guard();readRegisteredModernSchemaApproval(context);const pending=state.read();assertSameBinding(pending,binding);
   if(originalProcess.pid!==process.pid||assertOriginalModernSchemaProcess(originalProcess)!==true||pending.status!=='RUNNING')return false;
   if(operation==='FENCE'){assertSuccessorFenceBudget(preparation);return pending.phase==='REGISTERED';}
   return operation==='OPEN'&&pending.phase==='INGRESS_RELEASED'&&!!rootLease&&assertModernSchemaLeaseStillOriginal(rootLease)===true
    &&!!openCommitIntent&&same(store.read(`schema-release-open-commit-intent-${context.owner}.json`),openCommitIntent)
    &&pending.receiptSha256===openCommitIntent.pendingReceiptSha256&&canonicalDigest(publisher.readPrivate())===openCommitIntent.fencedControlSha256
    &&canonicalDigest(publisher.readPublic())===openCommitIntent.fencedPublicManifestSha256;
  }});
  const session=new ModernSchemaControlSession({}, {isClosing:()=>coordinator?.closed===true});
  coordinator=new BackgroundFenceCoordinator({binding:state.binding,participants:background.manifest.participants,project:preparation.floor.project,timeoutMs:60000},{session,publisher});
  assertSuccessorFenceBudget(preparation);
  const drain=await coordinator.fenceAndDrain();runtime.children.add(pinModernSchemaChild(session.child));rootLease=await pinOriginalModernSchemaSession(session,context);
  const drainReceipt=await persistModernSchemaOriginalDrain({context,preparationSha256:input.preparationSha256,rootLease,coordinator,privateRuntime:runtime,drain,admit:()=>native()});
  enter('DRAINED_COMMIT');
  await advance('REGISTERED','DRAINED',{drain,drainReceipt,originalLease:rootLease},{lease:rootLease});
  enter('NATIVE_WATCH_CONSTRUCT');
  watch=new ModernSchemaExecutorWatch({context,preparation:{...preparation,ownedResources},state,rootLease,session,client:watchClient,privateRuntime:runtime,admit:()=>native()});
  enter('PRIMARY_READ_CHANNEL');
  await watch.registerReadTransport(client);
  enter('WATCH_READ_CHANNEL');
  await watch.registerReadTransport(watchClient);
  enter('NATIVE_WATCH_INITIALIZE');
  await watch.initialize();
  enter('NATIVE_WATCH_HEARTBEAT');
  closeHeartbeat=watch.startLeaseHeartbeat(error=>{
   fatal??=error;
   firstHold.record(error,error===watch.failed?'EXECUTOR_WATCH':'LEASE_HEARTBEAT');
  });
  enter('NATIVE_INGRESS_CONSTRUCT');
  ingress=new ModernSchemaIngress({context,scope:preparation.ingressScope,privateRuntime:runtime,admit:async operation=>{
   if(recovering&&operation==='OBSERVE')return admitHeldRecovery();
   await native();
   if(operation==='RELEASE_VERIFIED_FENCED'){
    if(state.read().phase!=='OPEN_INTENT')fail('FORMAL_READY_FENCED_REQUIRED');
    const current=publisher.readPrivate(),manifest=publisher.readPublic();if(current.phase!=='FENCED'||manifest.phase!=='FENCED')fail('FORMAL_READY_FENCED_REQUIRED');
    const participants=store.read(`schema-release-step-${context.owner}-11-open-intent.json`).payload.evidence.candidateParticipants;
    if(verifyCompletedDeployment(state.binding,participants)!==true)fail('REAL_FORMAL_SUCCESS_REQUIRED');await coordinator.verifyQuiescent(participants);
   }
   return true;
  }});
  enter('NATIVE_FENCE_BUDGET');
  assertSuccessorFenceBudget(preparation);
  enter('NATIVE_INGRESS_INSTALL');
  const installed=await ingress.install();
  await advance('DRAINED','INGRESS_FENCED',{ingressObservation:installed});watch.start();
  enter('BEFORE_STOPPED_PROOF');
  await disk();await watch.observe();await coordinator.verifyQuiescent();
  const original=pre.containers.api;
  originalRestartPolicy=JSON.parse((await import('node:child_process')).execFileSync('/usr/bin/docker',['inspect',original.id,'--format','{{json .HostConfig.RestartPolicy}}'],{env:executionEnv(),encoding:'utf8',timeout:5000,stdio:['ignore','pipe','pipe']}));
  await advance('INGRESS_FENCED','R_STOP_INTENT',{originalSnapshotSha256:context.runtimeSnapshotSha256,originalRestartPolicy});
  const verifyStopFences=async(watchLocked=false)=>{
   await native();if(!watchLocked)await watch.observe();
   const pending=state.read(),control=publisher.readPrivate(),projected=publisher.readPublic();
   if(pending.phase!=='R_STOP_INTENT'||pending.status!=='RUNNING'||state.ddlIntentExists()||
    control.phase!=='FENCED'||projected.phase!=='FENCED'||!same(projected,coordinator.manifest)||
    control.owner!==context.owner||control.generation!==projected.generation||
    store.read('background-generation.json').generation!==projected.generation)return false;
   const proof=await ingress.observe();
   await native();
   return proof.identitySha256===installed.identitySha256&&same(state.read(),pending)&&
    same(publisher.readPrivate(),control)&&same(publisher.readPublic(),projected);
  };
  const stopped=await stopOriginalModernSchemaRuntime({originalSnapshot:pre,privateRuntime:runtime,directory:sessionDirectory,
   admit:()=>native(),drainStillOriginal:()=>coordinator.verifyQuiescent(),stalledShutdown:{context,snapshot:original,client,
    lease:rootLease,runtimeAddress:surface.runtimeAddress,ownedReadSessions,verifyFences:verifyStopFences,
    withVerifiedStop:work=>watch.withVerifiedOriginalStop(work)}});
  const stoppedObservation=await watch.observe();stopped.oldDatabaseSessionsGone=stoppedObservation.executors.runtimeSessionPids.length===0;
  if(!stopped.oldDatabaseSessionsGone)fail('ORIGINAL_DATABASE_SESSIONS_NOT_GONE');
  enter('R_STOPPED_STEP');
  await advance('R_STOP_INTENT','R_STOPPED',{runtimeStopReceipt:stopped,nativeExecutors:stoppedObservation.executors});
  const fresh=await auditFenced(true);
  store.immutable(`schema-release-fenced-audit-boundary-${context.owner}.json`,{fences:fresh.fences,comparison:fresh.comparison});
  enter('FRESH_LEDGER');
  const ledger=await captureModernSchemaLedger(client);if(ledger.sha256!==context.beforeLedgerSha256)fail('FENCED_LEDGER_CHANGED');beforeLedger=ledger.ledger;
  const readCommand={onDumpStarted:(entry,app)=>watch.allowReadonlyBackup(entry,app),onDumpStopped:()=>watch.clearReadonlyBackup()};
  enter('BEFORE_CATALOG_ADMISSION');
  let beforeCatalogAdmitted=false;
  beforeCatalog=await captureModernSchemaCatalog({owner:context.owner,stage:'before',databasePin:pre.containers.db,privateRuntime:runtime,directory:sessionDirectory,admit:async()=>{
   const admitted=await native();
   if(!beforeCatalogAdmitted){enter('BEFORE_CATALOG_OUTPUT');beforeCatalogAdmitted=true;}
   return admitted;
  }},{
   onDumpStarted(entry,app){
    enter('BEFORE_CATALOG_CHILD_ADMISSION');readCommand.onDumpStarted(entry,app);enter('BEFORE_CATALOG_DUMP');
   },
   async onDumpStopped(){
    await readCommand.onDumpStopped();enter('BEFORE_CATALOG_RECEIPT');
   },
  });
  enter('FENCED_DISK');
  await disk();
  enter('FENCED_BACKUP');
  await watch.observe();
  const fencedBackup=await createModernSchemaBackup({owner:context.owner,stage:'fenced',client,databasePin:pre.containers.db,privateRuntime:runtime},{
   ...readCommand,assertFenced:async()=>{await native();await ingress.observe();},assertRecoveryWindow:ms=>windowBudget('recoverOriginal',ms),
   duringFencedFacts:read=>watch.duringFencedFacts('R_STOPPED',read),
   onSnapshotReady:async(source,{factsElapsedMs})=>{
    if(source.ledgerSha256!==ledger.sha256||!same(source.ledger,beforeLedger))fail('FROZEN_BACKUP_SNAPSHOT_LEDGER_CHANGED');
    beforeFacts=source.facts;
    beforeFactsElapsedMs=factsElapsedMs;
    const factsFile=path.join(directory,`schema-release-before-facts-${context.owner}.json`);
    runtime.publishJson(factsFile,beforeFacts);runtime.publishJson(path.join(directory,`schema-release-before-audit-${context.owner}.json`),fresh.fresh);
    await advance('R_STOPPED','FRESH_RECHECKED',{beforeLedgerSha256:ledger.sha256,factsFile,factsSha256:canonicalDigest(beforeFacts),
     schemaFile:beforeCatalog.file,schemaSha256:canonicalDigest(beforeCatalog.receipt),auditRecheckSha256:canonicalDigest(fresh.comparison),executorsSha256:canonicalDigest((await watch.observe()).executors)});
   },
  });
  if(fencedBackup.receipt.sourceLedgerSha256!==context.beforeLedgerSha256)fail('FENCED_BACKUP_LEDGER_CHANGED');
  enter('FENCED_REHEARSAL');
  const rehearsal=await rehearseModernSchemaRelease({owner:context.owner,stage:'fenced',backup:fencedBackup,plan:preparation.plan,runtimeImageId:pre.containers.api.image,privateRuntime:runtime},{
   assertFenced:async()=>{await native();await ingress.observe();},assertRecoveryWindow:ms=>windowBudget('recoverOriginal',ms),
   duringFencedFacts:read=>watch.observeFencedFacts('FRESH_RECHECKED',read),
   onCreated:record=>watch.registerResource(record),withNativeCreate:work=>watch.withNativeCreate(work),
   startFencedReader:(...args)=>watch.startFencedRehearsalReader(...args),closeFencedReader:client=>watch.closeFencedRehearsalReader(client),
  });
  await advance('FRESH_RECHECKED','BACKUP_VERIFIED',{backupReceiptFile:fencedBackup.receiptPath,backupReceiptSha256:canonicalDigest(fencedBackup.receipt),
   rehearsalFile:path.join(rehearsal.directory,'rehearsal-receipt.json'),rehearsalSha256:canonicalDigest(rehearsal.evidence)});
  enter('FINAL_PRE_DDL_RECHECK');
  const finalAudit=await auditFenced(false);
  store.immutable(`schema-release-final-audit-boundary-${context.owner}.json`,{fences:finalAudit.fences,comparison:finalAudit.comparison});
  await watch.observe();await ingress.observe();await advance('BACKUP_VERIFIED','DDL_STARTED',{beforeLedgerSha256:context.beforeLedgerSha256,backupReceiptSha256:canonicalDigest(fencedBackup.receipt),originalLeaseSha256:canonicalDigest(rootLease),pendingPlanSha256:canonicalDigest(context.pendingMigrations)});
  enter('DDL_AND_AFTER');
  const migrationDirectory=runtime.createDirectory(context.owner,'migration');
  const driver=await runModernSchemaMigrationDriver({context,originalSnapshot:pre,privateRuntime:runtime,directory:migrationDirectory,originalLease:rootLease,
   admit:async request=>{await native();if(request.stage==='AFTER_EXIT')watch.clearMigration();return true;},onCreated:record=>watch.registerResource(record),
   verifyNativeBackend:async(proof,resource)=>{
    // The attach and permit already own the watch queue.
    await native();const observed=await observeModernSchemaCliBackend(watchClient,proof,resource);
    watch.allowNativeMigration(observed,{...resource,backendProof:proof});await watch.observeNative();return observed;
   },
  },{expectedNetworkId:preparation.ingressScope.networkId,withNativeCreate:work=>watch.withNativeCreate(work),serializeAdmission:work=>watch.serially(work),
   onOriginalDriver:entry=>watch.allowDescendants(entry,'SCHEMA_DRIVER'),
   closeChannel:(channel,options)=>watch.closeBodyChannel(channel,options),startChannel:(channel,entry)=>watch.startBodyChannel(channel,entry)});
  const effect=await verifyModernSchemaEffect({context,preparationSha256:input.preparationSha256,rootLease,preparation,beforeFacts,beforeAudit:fresh.fresh,beforeLedger,driverReceipt:driver,fencedBackup,privateRuntime:runtime,migrationDirectory,admit:()=>native()},{
   client,duringFencedFacts:read=>watch.observeFencedFacts('DDL_STARTED',read),
  });
  await advance('DDL_STARTED','SCHEMA_RECEIPTED',{schemaReceiptFile:effect.file,schemaReceiptSha256:canonicalDigest(effect.bundle)});
  const body=await runModernSchemaFormalApiBody({context,preparation,preparationSha256:input.preparationSha256,rootLease,originalProcess,state,watch,privateRuntime:runtime,schemaReceipt:effect.bundle,admit:()=>native()});
  const candidateId=watch.candidate?.id;if(!candidateId)fail('ACTUAL_CANDIDATE_REQUIRED');
  const probe=inspectApiParticipant({containerId:candidateId,revision:context.targetSha,allowedKinds:[...HOLD_KINDS],bootId:JSON.parse((await import('node:child_process')).execFileSync('/usr/bin/docker',['exec',candidateId,'node','-e',"fetch('http://127.0.0.1:3100/api/internal/background/status',{signal:AbortSignal.timeout(2000)}).then(r=>r.json()).then(x=>process.stdout.write(JSON.stringify(x))).catch(()=>process.exit(64))"],{env:executionEnv(),encoding:'utf8',timeout:5000,maxBuffer:65536,stdio:['ignore','pipe','pipe']})).bootId},preparation.floor.project);
  const candidateParticipants=[participantOf(probe)],formalDeploymentFile=path.join(directory,`deploy-${context.owner}.json`),formal=secureJson(formalDeploymentFile);
  if(verifyCompletedDeployment(state.binding,candidateParticipants)!==true)fail('ACTUAL_FORMAL_SUCCESS_REQUIRED');
  if(preparation.successorDecisions){
   const apiAccess=await watch.serially(()=>readRuntimeAccess(client,probe,context.targetSha,preparation.apiAccess));
   store.immutable('schema-release-1123-api-access-'+context.owner+'.json',{targetSha:context.targetSha,contextDigest:canonicalDigest(context),apiAccess});
   await watch.observe();
  }
  await advance('API_BODY','API_VERIFIED',{schemaReceiptSha256:canonicalDigest(effect.bundle),formalDeploymentFile,formalDeploymentSha256:canonicalDigest(formal),candidateParticipants,bodyStdoutSha256:body.stdout.sha256,bodyStderrSha256:body.stderr.sha256});
  if(handoff)retainedNative.recheck();
  verifyModernSchemaStage(dispatch);await advance('API_VERIFIED','OPEN_INTENT',{schemaReceiptSha256:canonicalDigest(effect.bundle),formalDeploymentSha256:canonicalDigest(formal),candidateParticipants});
  await watch.stop();await watch.observe();
  const preOpenFacts=await captureModernSchemaFacts(client,{projection:beforeFacts});assertModernSchemaBusinessUnchanged(beforeFacts,preOpenFacts);
  if(!same(defaultOffEvidenceFromFacts(context.targetSha,preOpenFacts,{plan:context}),effect.bundle.defaultOffEvidence))fail('PRE_OPEN_DEFAULT_OFF_CHANGED');
  const preOpenFactsFile=path.join(directory,`schema-release-pre-open-facts-${context.owner}.json`);runtime.publishJson(preOpenFactsFile,preOpenFacts);
  const released=await ingress.releaseBeforeOpen();
  const preOpenOff=await captureModernSchemaDefaultOff(client,context.targetSha,{plan:context}),preOpenOffFile=path.join(directory,`schema-release-pre-open-off-${context.owner}.json`);runtime.publishJson(preOpenOffFile,preOpenOff);
  if((await captureModernSchemaLedger(client)).sha256!==effect.bundle.afterLedgerSha256)fail('PRE_OPEN_LEDGER_CHANGED');
  await advance('OPEN_INTENT','INGRESS_RELEASED',{ingressReleaseReceipt:released,fencedPublicManifestSha256:canonicalDigest(publisher.readPublic()),preOpenFactsFile,preOpenFactsSha256:canonicalDigest(preOpenFacts),preOpenOffFile,preOpenOffSha256:canonicalDigest(preOpenOff)});
  openCommitIntent=await prepareModernSchemaOpenCommit({state,context,preparationSha256:input.preparationSha256,rootLease,ingressReleaseReceipt:released,admit:async()=>{await native();await watch.observe();return true;}});
  const opened=await coordinator.publishOpenAfterSuccess(candidateParticipants);committed=true;
  if(!same(opened,openCommitIntent.expectedPublicManifest))fail('COMMITTED_OPEN_CHANGED');
  await advance('INGRESS_RELEASED','OPEN_PUBLISHED',{schemaReceiptSha256:canonicalDigest(effect.bundle),publicManifest:opened,privateControlSha256:canonicalDigest(publisher.readPrivate()),openCommitIntentSha256:canonicalDigest(openCommitIntent)});
  await advance('OPEN_PUBLISHED','COMPLETED_OPEN',{schemaReceiptSha256:canonicalDigest(effect.bundle),formalDeploymentSha256:canonicalDigest(formal),publicManifestSha256:canonicalDigest(opened),ingressReleaseReceiptSha256:canonicalDigest(released)});
  await stopHeartbeat();
  const cleanup=await closeModernSchemaOriginalSession({coordinator,lease:rootLease,client,guard:()=>{runtime.guard();if(assertOriginalModernSchemaProcess(originalProcess)!==true)fail('ORIGINAL_SUPERVISOR_CHANGED');}});
  runtime.publishJson(path.join(directory,`schema-release-session-closed-${context.owner}.json`),cleanup);
  const final=await finalizeCommittedModernSchemaOpen({context,preparationSha256:input.preparationSha256,client});
  if(final.outcome!=='SUCCESS'||final.pendingMarkerCleared!==true)fail('COMMITTED_TERMINAL_UNVERIFIED');terminalComplete=true;
  return {schema:'phoenix.modern-schema-public-result/v1',owner:context.owner,targetSha:context.targetSha,outcome:'SUCCESS',defaultOff:true};
 }catch(error){
  const failure=firstHold.record(error,watch?.failed&&error===watch.failed?'EXECUTOR_WATCH':fatal&&error===fatal?'LEASE_HEARTBEAT':'SUPERVISOR');
  if(state){
   let pendingPhase='UNAVAILABLE';
   try{pendingPhase=state.read().phase;}catch{}
   try{store.immutable(`schema-release-supervisor-first-hold-${context.owner}.json`,{
    schema:'phoenix.modern-schema-supervisor-first-hold/v1',owner:context.owner,contextDigest:canonicalDigest(context),pendingPhase,
    failure,recordedAt:new Date().toISOString(),
   });}catch{/* Diagnostics do not change denial or recovery. */}
  }
  try{await watch?.stop();}catch{}try{await stopHeartbeat();}catch{}
  let recoveryCommitted=null;
  // A public rename may have succeeded before its caller observed a response.
  // Classify that actual commit before any denial or attempted restoration.
  const observeCommit=()=>{
   if(!publisher)return false;
   const found=confirmModernSchemaPublicDurability(()=>{
    const target=observeCommittedModernSchemaOpen({context,store,publisher,lease:rootLease});
    recoveryCommitted=observeCommittedModernSchemaRecoveryOpen(context);return target??recoveryCommitted;
   },()=>runtime.guard());
   return !!found;
  };
  if(state&&!committed){try{committed=observeCommit();}catch{
   // Unknown publication is never treated as permission to roll it back.
   for(;;){try{runtime.guard();committed=observeCommit();break;}catch{}await pause(1000);}
  }}
  if(state&&!committed){
   try{state.hold('SCHEMA_RELEASE_FAILED');}catch{}
   let restoreEligible=false;try{restoreEligible=!state.ddlIntentExists()&&!!beforeFacts&&!!beforeLedger&&!!beforeCatalog&&!!originalRestartPolicy;}catch{}
   if(restoreEligible){
    try{recovering=true;recoveryResult=await recoverModernSchemaBeforeDdl({context,preparationSha256:input.preparationSha256,state,rootLease,session:coordinator.session,coordinator,ingress,privateRuntime:runtime,
     originalSnapshot:preparation.originalSnapshot,originalRestartPolicy,beforeFacts,beforeLedger,beforeCatalog:beforeCatalog.receipt,client,
     ownedReadSessions:watch.readers.filter(reader=>reader.client!==client).map(reader=>reader.pin),onPublicCommit:value=>{recoveryCommitted=value;committed=true;},
     admit:admitHeldRecovery});}catch{}finally{recovering=false;}
   }
   if(!committed){
    // Retain FD9 and the original S until independent durable denial and native
    // ingress denial are both observed. No timeout/finally path releases it.
    for(;;){
     try{
      denialAdmission();if(observeCommit()){committed=true;break;}
      const currentPrivate=publisher?publisher.readPrivate():secureJson(path.join(directory,'background-control.json'));
      const currentPublic=publisher?publisher.readPublic():readPublicManifest();
      const untouched=state.read().phase==='REGISTERED'&&same(currentPrivate,preparation.originalBackground.record)&&same(currentPublic,preparation.originalBackground.manifest);
      const denied=untouched?{backgroundDenied:true,originalOpenUntouched:true}:denyModernSchemaBackground({state,context,publisher});
      if(denied.backgroundDenied!==true)fail('DURABLE_BACKGROUND_DENIAL_REQUIRED');
      confirmModernSchemaPublicDurability(()=>({manifest:publisher?publisher.readPublic():readPublicManifest(),control:publisher?publisher.readPrivate():secureJson(path.join(directory,'background-control.json'))}),denialAdmission);
      if(ingress&&ingress.state!=='NEW')await ingress.reinstateForFailure(denialAdmission);
      break;
     }catch{}
     if(rootLease&&coordinator?.session.connected()){try{await coordinator.session.query(originalModernSchemaSessionPredicate(rootLease));}catch{}}
     await pause(1000);
    }
   }
  }
  if(state){
   const observation={schema:'phoenix.modern-schema-release-hold-observation/v1',owner:context.owner,targetSha:context.targetSha,
    backgroundAdmissionCommitted:committed,terminalComplete,originalRecoveryCommitted:!!recoveryCommitted,automaticRetry:false,automaticRollback:false,defaultOff:true};
   try{const current=state.read();observation.phase=current.phase;observation.disposition=committed?'OPEN_COMMITTED_FINALIZATION_REQUIRED':classifyModernSchemaRecovery({pending:current,ddlIntentExists:state.ddlIntentExists(),facts:{}}).disposition;}catch{observation.disposition=committed?'OPEN_COMMITTED_FINALIZATION_REQUIRED':'PROTECTED_PENDING_UNAVAILABLE_KEEP_DENIED';}
   try{const ledger=await captureModernSchemaLedger(client);observation.nativeLedger={status:'OBSERVED',sha256:ledger.sha256,ledger:ledger.ledger};}catch{observation.nativeLedger={status:'UNAVAILABLE'};}
   try{const {rows:[{observation:raw}]}=await client.query(MODERN_SCHEMA_EXECUTOR_SQL);observation.nativeExecutors={status:'OBSERVED',value:JSON.parse(raw)};}catch{observation.nativeExecutors={status:'UNAVAILABLE'};}
   try{const catalog=await captureModernSchemaCatalog({owner:context.owner,stage:'hold-observation',databasePin:preparation.originalSnapshot.containers.db,privateRuntime:runtime,directory:sessionDirectory,admit:()=>{runtime.guard();return true;}});observation.nativeSchema={status:'OBSERVED',file:catalog.file,sha256:canonicalDigest(catalog.receipt)};}catch{observation.nativeSchema={status:'UNAVAILABLE'};}
   try{store.immutable(`recovery-modern-schema-${context.owner}.json`,observation);}catch{}
  }
  // A committed OPEN is a forward-finalization state. Never undo the release
  // decision, recreate pending, restore R, or apply a denial after this point.
  let originalGone=false;
  if(coordinator&&rootLease){try{const cleanup=await closeModernSchemaOriginalSession({coordinator,lease:rootLease,client,guard:()=>{runtime.guard();if(assertOriginalModernSchemaProcess(originalProcess)!==true)fail('ORIGINAL_SUPERVISOR_CHANGED');}});
   originalGone=true;try{runtime.publishJson(path.join(directory,`schema-release-session-closed-${context.owner}.json`),cleanup);}catch{}
  }catch{}}
  else{try{await coordinator?.close();}catch{}}
  if(committed&&originalGone&&!recoveryCommitted){
   try{const result=await finalizeCommittedModernSchemaOpen({context,preparationSha256:input.preparationSha256,client});
    if(result.outcome==='SUCCESS'&&result.pendingMarkerCleared===true)return {schema:'phoenix.modern-schema-public-result/v1',owner:context.owner,targetSha:context.targetSha,outcome:'SUCCESS',defaultOff:true};
   }catch{}
  }
  if(recoveryCommitted&&originalGone){try{await finalizeCommittedModernSchemaRecoveredOriginal({context,preparationSha256:input.preparationSha256,client});}catch{}}
  return {schema:'phoenix.modern-schema-public-result/v1',owner:context.owner,targetSha:context.targetSha,outcome:'HOLD',defaultOff:true};
 }finally{await closeHeartbeat?.();await Promise.allSettled([client.close(),watchClient.close()]);}
}
