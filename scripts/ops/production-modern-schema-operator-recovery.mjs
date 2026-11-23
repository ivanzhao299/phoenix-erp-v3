/** Read-only checkpoints for a new, separately authorized recovery session.
 * The failed release and its native observations stay in their original files.
 * Authority to start R or change either fence belongs to the caller. */
import fs from 'node:fs';
import {exactHeldAttempt,readInterruptedBoot,guardInterruptedEdge} from './production-remediation-interrupted-boot.mjs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import {CONTRACT,git} from './production-config-guard.mjs';
import {readPinnedFile} from './production-trusted-paths.mjs';
import {captureRuntime,executionEnv} from './capture-production-runtime.mjs';
import {assertSameBinding,readPublicManifest,validateManifest,validateParticipants} from './background-control-manifest.mjs';
import {inspectApiParticipant,verifyParticipantStatus} from './background-control-coordinator.mjs';
import {canonicalDigest,HASH,same} from './production-maintenance-receipts.mjs';
import {API_READINESS_PROGRAM} from './production-maintenance-candidate-health.mjs';
import {captureModernSchemaCatalog} from './production-modern-schema-catalog.mjs';
import {modernSchemaOriginalSessionExitSql} from './production-modern-schema-completion.mjs';
import {classifyModernSchemaDatabaseExecutors,inspectModernSchemaContainer,inspectModernSchemaContainers,MODERN_SCHEMA_EXECUTOR_SQL} from './production-modern-schema-executors.mjs';
import {captureMaintenanceSchedulers,captureModernSchemaProcessIdentities,observeMaintenanceContainerIdentity} from './production-maintenance-root-readers.mjs';
import {pinModernSchemaChild,verifyModernSchemaChild} from './production-modern-schema-processes.mjs';
import {captureModernSchemaFacts,defaultOffEvidenceFromFacts} from './production-modern-schema-facts.mjs';
import {ModernSchemaIngress} from './production-modern-schema-ingress.mjs';
import {ingressIdentity} from './maintenance-ingress-policy.mjs';
import {ModernSchemaPrivateRuntime} from './production-modern-schema-private.mjs';
import {ModernSchemaReadClient} from './production-modern-schema-read-client.mjs';
import {ModernSchemaRegistry,validateModernSchemaPreparation} from './production-modern-schema-registration.mjs';
import {captureModernSchemaLedger} from './production-modern-schema-schema-result.mjs';
import {confirmsResidualTermEvents,originalStopExitIsProved,originalStalledTermBindingMatches,protectedStalledShutdownMatches,
  ORIGINAL_IDLE_EXECUTOR_SQL,ORIGINAL_LISTENER_CLOSED_PROGRAM,ORIGINAL_TERM_EVENT_FORMAT} from './production-modern-schema-stop.mjs';
import {MODERN_SCHEMA_LEASE_SQL,parseModernSchemaLease} from './production-modern-schema-session-lease.mjs';
import {MODERN_SCHEMA_PHASES,modernSchemaReleaseBinding,validateModernSchemaPending} from './production-modern-schema-state.mjs';
import {validateRegisteredFrozenLegacyScope,validateRegisteredModernSchemaApproval} from './production-modern-schema-authority.mjs';
import {digest} from './chanjet-admission-schema-receipt.mjs';


export function sameOperatorControlSession(actual,expected){
  const keys=['sessionPid','databaseOid','backendStartedAt','backendStartedAtUs','applicationName'];
  return actual?.connected===true&&expected?.connected===true&&actual.broken===false&&expected.broken===false&&
    keys.every(key=>actual[key]===expected[key]);
}

const fail = code => { throw Error('MODERN_SCHEMA_OPERATOR_RECOVERY_HOLD=' + code); };
const ownerPattern = /^[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$/;
const noRestart = {Name:'no',MaximumRetryCount:0};
const marker = 'schema-release-pending.json';
const controlName = 'background-control.json';
const isHash = value => typeof value === 'string' && HASH.test(value);
const isWitnessedStopIncident = ({owner,targetSha,phase}) => owner==='44855835842-1'
  && targetSha==='cb843973bdff0ebabc6d4fc68d39d16a1be10522' && phase==='R_STOP_INTENT';
const formalTermIntentPath=(directory,owner)=>path.join(directory,`schema-release-session-${owner}`,'stalled-original-term-intent.json');
export function isResidualStopIntent(pending,store){
  return isWitnessedStopIncident(pending)||pending.phase==='R_STOP_INTENT'&&ownerPattern.test(pending.owner??'')&&
    !!store?.io.lstatSync(formalTermIntentPath(store.directory,pending.owner),{throwIfNoEntry:false});
}
export const isExpiredVerifiedOriginal = pending => pending.owner==='44883169227-1'&&
  pending.targetSha==='45fe9bf6ded83740965de1b81143a08b3ac07369'&&pending.phase==='FRESH_RECHECKED'&&
  pending.sequence===5&&pending.status==='HOLD';
export function readVerifiedRecoveryOwnership(store,pending,proof){
  if(!isExpiredVerifiedOriginal(pending))fail('EXACT_RECOVERY_OWNERSHIP_SCOPE_REQUIRED');
  const certificate=store.read(`schema-release-operator-recovery-container-ownership-${pending.owner}.json`);
  const registry=store.read('maintenance-host-ownership-registry.json');
  const {pins}=certificate;
  if(certificate.schema!=='phoenix.private-verified-recovery-container-ownership/v1'||certificate.owner!==pending.owner||
      certificate.targetSha!==pending.targetSha||certificate.pendingSha256!==canonicalDigest(pending)||
      certificate.originalRecoveryProofSha256!==canonicalDigest(proof)||certificate.productionMutation!==false||
      registry.schema!=='phoenix.maintenance-reviewed-host-ownership/v1'||!isHash(certificate.registryEvidenceSha256)||
      certificate.registryEvidenceSha256!==registry.evidenceSha256||!Array.isArray(registry.containers)||
      !Array.isArray(pins)||pins.length!==2||new Set(pins.map(pin=>pin.id)).size!==2||
      pins.some(pin=>!isHash(pin.id)||!isHash(pin.identitySha256)||registry.containers.filter(row=>
        row.owner==='REVIEWED_FOREIGN_PRODUCTION_NEIGHBOUR'&&row.id===pin.id&&row.identitySha256===pin.identitySha256).length!==1))
    fail('EXACT_RECOVERY_CONTAINER_OWNERSHIP_REQUIRED');
  return {pins,sha256:canonicalDigest(certificate)};
}
const nativeDocker = args => {
  try {
    return execFileSync('/usr/bin/docker',args,{env:executionEnv(),encoding:'utf8',timeout:5000,
      maxBuffer:2*1024*1024,stdio:['ignore','pipe','pipe']}).trim();
  } catch { fail('DOCKER_OBSERVATION_UNAVAILABLE'); }
};

export function verifyRecoveryHostProcesses(preparation,docker=nativeDocker,ownedChildren=[],extraContainerPins=[]){
  const {api,web,db}=preparation.originalSnapshot.containers;
  const known=new Set([api.id,web.id,db.id]);
  const {foreignContainerPins,foreignProcessPins}=preparation.hostSurface;
  const ids=docker(['ps','--no-trunc','-q']).split('\n').filter(Boolean).sort();
  if(!ids.includes(web.id)||!ids.includes(db.id))fail('RECOVERY_HOST_CONTAINER_UNACCOUNTED');
  const containers=inspectModernSchemaContainers(ids,(_binary,args)=>docker(args));
  const namespaces=new Set();
  for(const container of containers){
    if(container.state.Running!==true||container.privileged!==false||container.pidMode==='host'||
        container.pidMode?.startsWith('container:')||container.networkMode==='host')fail('RECOVERY_HOST_CONTAINER_UNACCOUNTED');
    if(!known.has(container.id)){
      const identity=observeMaintenanceContainerIdentity(container.id);
      const historical=foreignContainerPins.some(pin=>pin.id===container.id&&pin.identitySha256===canonicalDigest(identity));
      const updated=!identity.erpBind&&identity.project!==preparation.floor.project&&
        extraContainerPins.some(pin=>pin.id===container.id&&pin.identitySha256===canonicalDigest(identity));
      if((!historical&&!updated)||
          identity.pid!==container.state.Pid||identity.imageId!==container.imageId)fail('RECOVERY_HOST_CONTAINER_UNACCOUNTED');
    }
    namespaces.add(fs.readlinkSync(`/proc/${container.state.Pid}/ns/pid`));
  }
  const processProof=verifyRecoveryHostProcessCensus(captureModernSchemaProcessIdentities(),foreignProcessPins,namespaces,ownedChildren);
  const schedulers=captureMaintenanceSchedulers({includeDatabaseEntrypoints:true});
  if(schedulers.some(row=>row.erpControlReference)||canonicalDigest(schedulers)!==preparation.hostSurface.schedulerSha256)
    fail('RECOVERY_HOST_SCHEDULER_CHANGED');
  if(!same(ids,docker(['ps','--no-trunc','-q']).split('\n').filter(Boolean).sort()))fail('RECOVERY_HOST_CONTAINER_SET_CHANGED');
  return processProof;
}
export function verifyRecoveryHostProcessCensus(census,foreignProcessPins,namespaces,ownedChildren){
  const ownedPids=new Set();
  for(const entry of ownedChildren){
    const rows=census.filter(row=>row.pid===entry.pin.pid);
    if(rows.length!==1||ownedPids.has(entry.pin.pid))fail('RECOVERY_OWNED_HOST_CHILD_UNACCOUNTED');
    verifyModernSchemaChild(entry,rows[0]);
    ownedPids.add(entry.pin.pid);
  }
  const processes=census.filter(row=>row.pid!==process.pid&&row.pid!==process.ppid&&!ownedPids.has(row.pid)&&
    !namespaces.has(row.pidNamespace)&&(/\/(?:node|nodejs|python[0-9.]*|java|pm2|supervisord|nomad|kubelet|psql|pg_restore|pgbench)$/.test(row.exe)||row.erpControlReference));
  const observed=processes.map(row=>({pid:row.pid,identitySha256:canonicalDigest(row),erpControlReference:row.erpControlReference===true}));
  if(observed.some(row=>row.erpControlReference||!foreignProcessPins.some(pin=>same(row,pin))))fail('RECOVERY_HOST_PROCESS_UNACCOUNTED');
  return canonicalDigest(observed);
}

function readHistoricalApproval(store,context,{now}){
  const grant = store.read(`schema-release-approval-${context.owner}.json`);
  const frozen = context.testManifestSha256?store.read(`schema-release-frozen-test-${context.owner}-${context.testManifestSha256}.json`):null;
  validateRegisteredModernSchemaApproval(grant,context,now());
  validateRegisteredFrozenLegacyScope(frozen,grant,context);
  return {approvalSha256:canonicalDigest(grant),contextDigest:canonicalDigest(context)};
}

function bindHistoricalStop({store,owner,recoveryLease,readApproval,validatePreparation,heldInspection}){
  const key = suffix => `schema-release-${suffix}-${owner}.json`;
  const preparation = store.read(key('preparation'));
  const stepName = (phase,sequence) => `schema-release-step-${owner}-${sequence}-${phase.toLowerCase().replaceAll('_','-')}.json`;
  const recordedPending=store.read(marker);
  const adopting=isExpiredVerifiedOriginal(recordedPending);
  if(heldInspection&&!exactHeldAttempt(recordedPending))fail('EXACT_INTERRUPTED_RELEASE_REQUIRED');
  const incident=isWitnessedStopIncident(recordedPending);
  const residual=isResidualStopIntent(recordedPending,store);
  const fresh=recordedPending.phase==='FRESH_RECHECKED';
  const requiredSteps=residual?4:fresh?6:5;
  const steps = MODERN_SCHEMA_PHASES.slice(0,requiredSteps).map((phase,sequence) => store.read(stepName(phase,sequence)));
  const stopAt = Date.parse(steps[residual?3:4].recordedAt);
  if(!Number.isFinite(stopAt))fail('ORIGINAL_STOP_TIME_REQUIRED');
  const {context,preparationSha256} = validatePreparation(preparation,stopAt);
  const contextDigest = canonicalDigest(context);
  const binding = modernSchemaReleaseBinding(context,preparationSha256);
  const pending = validateModernSchemaPending(recordedPending,binding);
  if(context.owner!==owner||pending.phase!==MODERN_SCHEMA_PHASES[requiredSteps-1]||pending.sequence!==requiredSteps-1||
      pending.status!=='HOLD'||!pending.lease||pending.receiptSha256!==canonicalDigest(steps.at(-1)))fail('EXACT_STOPPED_HOLD_REQUIRED');
  const checkNoLaterEffects = () => {
    const excluded = ['transaction.json','policy-transition.json','cutover-pending.json',`deploy-${owner}.json`,
      ...['schema-receipt','open-commit-intent','original-recovery-open-commit-intent','ingress-released'].map(key),
      ...(!adopting&&!heldInspection?[key('original-recovery-intent')]:[]),
      ...(heldInspection?[key('original-recovery-verified'),key('operator-fenced-start-verified')]:[]),
      ...MODERN_SCHEMA_PHASES.slice(requiredSteps).map((phase,index)=>stepName(phase,index+requiredSteps))];
    if(excluded.some(file=>store.exists(file)))fail('LATER_EFFECT_OR_INTENT_PRESENT');
    // These create-only directories precede any migration driver or formal API process.
    for(const role of ['migration','body']){
      if(store.io.lstatSync(path.join(store.directory,`schema-release-${role}-${owner}`),{throwIfNoEntry:false})){
        fail('LATER_EXECUTION_DIRECTORY_PRESENT');
      }
    }
  };
  checkNoLaterEffects();
  if(!same(pending.lease.database,recoveryLease.database)||
      (pending.lease.sessionPid===recoveryLease.sessionPid&&pending.lease.backendStartMicros===recoveryLease.backendStartMicros)||
      BigInt(recoveryLease.backendStartMicros)<=BigInt(pending.lease.backendStartMicros))fail('DISTINCT_NEW_SESSION_ON_ORIGINAL_PRIMARY_REQUIRED');
  const approval = readApproval(context,{now:()=>stopAt});
  for(const [sequence,step] of steps.entries()){
    assertSameBinding(step,binding);
    const phase = MODERN_SCHEMA_PHASES[sequence];
    if(step.schema!=='phoenix.modern-schema-release-step/v1'||step.sequence!==sequence||step.to!==phase||
        step.from!==(MODERN_SCHEMA_PHASES[sequence-1]??null)||
        step.previousDigest!==(sequence===0?null:canonicalDigest(steps[sequence-1])))fail('ORIGINAL_STEP_CHAIN_CHANGED');
    if(sequence===0){
      if(step.payload?.approvalSha256!==approval.approvalSha256||approval.contextDigest!==contextDigest||
          !same(step.payload.supervisor,pending.supervisor))fail('ORIGINAL_REGISTRATION_NOT_BOUND');
    } else if(step.payload?.schema!=='phoenix.modern-schema-step-evidence/v1'||step.payload.kind!==phase||
        step.payload.contextDigest!==contextDigest||step.payload.evidenceSha256!==canonicalDigest(step.payload.evidence)){
      fail('ORIGINAL_STEP_EVIDENCE_INVALID');
    }
  }
  const {api,web,db} = preparation.originalSnapshot.containers;
  const intent = steps[3].payload.evidence;
  const stop = residual?null:steps[4].payload.evidence.runtimeStopReceipt;
  const policy = residual?intent.originalRestartPolicy:stop?.originalRestartPolicy;
  if(canonicalDigest(preparation.originalSnapshot.containers)!==context.runtimeSnapshotSha256||
      !['no','always','unless-stopped'].includes(policy?.Name)||policy.MaximumRetryCount!==0||
      !same(intent.originalRestartPolicy,policy))fail('EXACT_ORIGINAL_STOP_RECEIPT_REQUIRED');
  if(residual&&intent.originalSnapshotSha256!==context.runtimeSnapshotSha256)fail('EXACT_ORIGINAL_STOP_INTENT_REQUIRED');
  if(!residual&&(stop?.schema!=='phoenix.modern-schema-original-runtime-stopped/v1'||stop.containerId!==api.id||
      stop.imageId!==api.image||stop.startedAt!==api.startedAt||stop.restartCount!==api.restartCount||
      stop.signal!=='TERM'||!originalStopExitIsProved(stop,context)||stop.pid!==0||stop.oomKilled!==false||stop.automaticKill!==false||
      stop.oldDatabaseSessionsGone!==true||!same(stop.currentRestartPolicy,noRestart)||
      !protectedStalledShutdownMatches(stop,context,pending.lease)))fail('EXACT_ORIGINAL_STOP_RECEIPT_REQUIRED');

  const closed = store.exists(key('session-closed'))?store.read(key('session-closed')):null;
  const {database} = pending.lease;
  const provesOldAbsent = value => value?.primary===true&&value.originalSessionPresent===false&&
    value.databaseOid===database.databaseOid&&value.systemIdentifier===database.systemIdentifier&&
    value.postmasterStartMicros===database.postmasterStartMicros;
  if(closed&&(closed.schema!=='phoenix.modern-schema-original-session-closed/v1'||closed.outcome!=='ORIGINAL_SESSION_ABSENT'||
      closed.originalLeaseSha256!==canonicalDigest(pending.lease)||!provesOldAbsent(closed.nativeObservation)))fail('ORIGINAL_SESSION_CLOSE_RECEIPT_REQUIRED');

  const hold = store.read(`recovery-modern-schema-${owner}.json`);
  const catalogKey = key('hold-observation-schema');
  const catalog = store.read(catalogKey);
  if(hold.schema!=='phoenix.modern-schema-release-hold-observation/v1'||hold.owner!==owner||hold.targetSha!==context.targetSha||
      hold.phase!==pending.phase||hold.backgroundAdmissionCommitted!==false||hold.originalRecoveryCommitted!==false||
      hold.terminalComplete!==false||hold.defaultOff!==true||
      hold.nativeSchema?.status!=='OBSERVED'||hold.nativeSchema.file!==store.file(catalogKey)||
      hold.nativeSchema.sha256!==canonicalDigest(catalog)||catalog.schema!=='phoenix.modern-schema-catalog-facts/v1'||
      catalog.owner!==owner||catalog.stage!=='hold-observation'||catalog.readOnly!==true||catalog.releaseAuthorized!==false||
      !same(catalog.databasePin,db)||!isHash(catalog.schemaSha256))fail('ORIGINAL_HOLD_LEDGER_AND_CATALOG_REQUIRED');
  let beforeCatalog=null, beforeFactsSha256=null, adopted=null, interrupted=null, requireHostCensus=residual||adopting;
  if(residual){
    const first=store.read(key('supervisor-first-hold'));
    const failure=first.failure;
    if(!closed||first.schema!=='phoenix.modern-schema-supervisor-first-hold/v1'||first.owner!==owner||
        first.contextDigest!==contextDigest||first.pendingPhase!=='R_STOP_INTENT'||
        !['SUPERVISOR','EXECUTOR_WATCH'].includes(failure?.source)||
        (incident?(failure.source!=='SUPERVISOR'||failure.code!=='UNCLASSIFIED'||failure.stage!=='BEFORE_STOPPED_PROOF'):
          !['BEFORE_STOPPED_PROOF','R_STOPPED_STEP'].includes(failure.stage)))
      fail('EXACT_RESIDUAL_ORIGINAL_STOP_INTENT_REQUIRED');
  }
  if(closed){
    const observed=hold.nativeExecutors?.value;
    if(hold.nativeLedger?.status!=='OBSERVED'||hold.nativeLedger.sha256!==context.beforeLedgerSha256||
        digest(JSON.stringify(hold.nativeLedger.ledger))!==context.beforeLedgerSha256||
        hold.nativeExecutors?.status!=='OBSERVED'||observed?.primary!==true||observed.databaseOid!==database.databaseOid||
        observed.systemIdentifier!==database.systemIdentifier||observed.postmasterStartMicros!==database.postmasterStartMicros)
      fail('ORIGINAL_HOLD_LEDGER_AND_CATALOG_REQUIRED');
  }else{
    if(fresh)fail('ORIGINAL_SESSION_CLOSE_RECEIPT_REQUIRED');
    const first=store.read(key('supervisor-first-hold'));
    beforeCatalog=store.read(key('before-schema'));
    if(first.schema!=='phoenix.modern-schema-supervisor-first-hold/v1'||first.owner!==owner||first.contextDigest!==contextDigest||
        first.pendingPhase!=='R_STOPPED'||first.failure?.stage!=='FENCED_BACKUP'||first.failure.source!=='SUPERVISOR'||
        first.failure.code!=='MODERN_SCHEMA_BACKUP_HOLD=CLEANUP_UNRESOLVED'||
        !same(hold.nativeLedger,{status:'UNAVAILABLE'})||!same(hold.nativeExecutors,{status:'UNAVAILABLE'})||
        !store.exists(key('fenced-audit-boundary'))||beforeCatalog.schema!==catalog.schema||beforeCatalog.owner!==owner||
        beforeCatalog.stage!=='before'||beforeCatalog.readOnly!==true||beforeCatalog.releaseAuthorized!==false||
        !same(beforeCatalog.databasePin,db)||beforeCatalog.schemaSha256!==catalog.schemaSha256)
      fail('ORIGINAL_READ_CHANNEL_LOSS_EVIDENCE_REQUIRED');
  }
  if(fresh){
    beforeCatalog=store.read(key('before-schema'));
    const first=store.read(key('supervisor-first-hold')),facts=store.read(key('before-facts'));
    const audit=store.read(key('fenced-audit-boundary')),evidence=steps[5].payload.evidence;
    const failure=first.failure,backupHold=failure?.source==='SUPERVISOR'&&
      ['MODERN_SCHEMA_BACKUP_HOLD=CLEANUP_UNRESOLVED','MODERN_SCHEMA_BACKUP_HOLD=WINDOW'].includes(failure.code)||
      failure?.source==='EXECUTOR_WATCH'&&
        ['MODERN_SCHEMA_EXECUTORS_HOLD=ORIGINAL_CONTROL_CHILD_UNPROVED','MODERN_SCHEMA_WATCH_HOLD=NEW_OR_CHANGED_HOST_EXECUTOR'].includes(failure.code);
    const allowedFailure=adopting||heldInspection?failure?.source==='SUPERVISOR'&&failure.stage==='FENCED_REHEARSAL'&&
      failure.code==='MODERN_SCHEMA_SUPERVISOR_HOLD=INSUFFICIENT_WINDOW_TO_RECOVER_ORIGINAL':
      backupHold&&failure.stage==='FENCED_BACKUP';
    if(first.schema!=='phoenix.modern-schema-supervisor-first-hold/v1'||first.owner!==owner||first.contextDigest!==contextDigest||
        first.pendingPhase!==pending.phase||!allowedFailure||
        beforeCatalog.schema!==catalog.schema||beforeCatalog.owner!==owner||beforeCatalog.stage!=='before'||
        beforeCatalog.readOnly!==true||beforeCatalog.releaseAuthorized!==false||!same(beforeCatalog.databasePin,db)||
        beforeCatalog.schemaSha256!==catalog.schemaSha256||evidence.schemaFile!==store.file(key('before-schema'))||
        evidence.schemaSha256!==canonicalDigest(beforeCatalog)||evidence.factsFile!==store.file(key('before-facts'))||
        evidence.factsSha256!==canonicalDigest(facts)||facts.schema!=='phoenix.modern-schema-database-facts/v1'||
        facts.readOnly!==true||facts.releaseAuthorized!==false||!audit?.comparison||
        evidence.auditRecheckSha256!==canonicalDigest(audit.comparison)||evidence.beforeLedgerSha256!==context.beforeLedgerSha256||
        !isHash(evidence.executorsSha256))fail('EXACT_FROZEN_BACKUP_FACTS_REQUIRED');
    beforeFactsSha256=evidence.factsSha256;
    requireHostCensus=Boolean(heldInspection)||adopting||failure.code==='MODERN_SCHEMA_WATCH_HOLD=NEW_OR_CHANGED_HOST_EXECUTOR';
    if(heldInspection){
      if(!closed||closed.transportClosed!==true)fail('ORIGINAL_TRANSPORT_EXIT_REQUIRED');
      interrupted=readInterruptedBoot(store,{pending,preparation,steps,beforeFactsSha256,catalog,policy},heldInspection);
    }
    if(adopting){
      const intent=store.read(key('original-recovery-intent')),proof=store.read(key('original-recovery-verified'));
      const recoveryCatalogs=['recovery-before','recovery-after'].map(stage=>store.read(key(stage+'-schema')));
      const [before,after]=recoveryCatalogs;
      if(intent.schema!=='phoenix.modern-schema-original-recovery-intent/v1'||intent.owner!==owner||intent.contextDigest!==contextDigest||
          intent.preparationSha256!==preparationSha256||!same(intent.originalLease,pending.lease)||
          intent.originalContainerId!==api.id||intent.originalImageId!==api.image||!same(intent.originalRestartPolicy,policy)||
          intent.pendingSha256!==canonicalDigest(pending)||intent.originalLedgerSha256!==context.beforeLedgerSha256||
          intent.beforeFactsSha256!==beforeFactsSha256||intent.automaticRetry!==false||
          proof.schema!=='phoenix.modern-schema-original-recovery-proof/v1'||proof.owner!==owner||proof.contextDigest!==contextDigest||
          proof.targetSha!==context.runtimeSha||proof.attemptedTargetSha!==context.targetSha||!same(proof.originalLease,pending.lease)||
          proof.approvalSha256!==approval.approvalSha256||proof.intentSha256!==canonicalDigest(intent)||!same(proof.originalRestartPolicy,policy)||
          proof.outcome!=='ABORTED_BEFORE_DDL_ORIGINAL_R_RECOVERED'||proof.formalTargetSuccess!==false||proof.schemaChanged!==false||
          proof.businessActivation!==false||proof.automaticRetry!==false||proof.databaseFactsSha256!==beforeFactsSha256||
          !(Date.parse(api.startedAt)<Date.parse(proof.startedAt)&&Date.parse(proof.startedAt)<Date.parse(context.window.end))||
          !same(proof.originalRuntime,{...preparation.originalBackground.participant,bootId:proof.originalRuntime?.bootId})||
          proof.originalRuntime.bootId===preparation.originalBackground.participant.bootId||
          intent.beforeCatalogSha256!==canonicalDigest(before)||proof.beforeCatalogSha256!==canonicalDigest(before)||
          proof.afterCatalogSha256!==canonicalDigest(after)||
          recoveryCatalogs.some((receipt,index)=>receipt.schema!==catalog.schema||receipt.owner!==owner||
            receipt.stage!==['recovery-before','recovery-after'][index]||receipt.readOnly!==true||receipt.releaseAuthorized!==false||
            receipt.schemaSha256!==catalog.schemaSha256||!same(receipt.databasePin,db)))
        fail('PROTECTED_VERIFIED_ORIGINAL_RECOVERY_REQUIRED');
      validateParticipants([proof.originalRuntime],{targetSha:context.runtimeSha});
      const ownership=readVerifiedRecoveryOwnership(store,pending,proof);
      adopted={intent,proof,recoveryCatalogs,ownership};
    }
  }
  return {key,context,contextDigest,binding,pending,preparation,steps,policy,residual,incident,stop,api,web,db,catalog,hold,closed,adopted,interrupted,
    beforeCatalog,beforeFactsSha256,requireHostCensus,checkNoLaterEffects,provesOldAbsent};
}

function bindFencedStart({started,owner,context,contextDigest,pending,hold,closed,installed,manifest,prior,api}){
  const plan = {
    schema:'phoenix.operator-original-fenced-restart/v1',owner,contextDigest,targetSha:context.targetSha,runtimeSha:context.runtimeSha,
    pendingSha256:canonicalDigest(pending),holdSha256:canonicalDigest(hold),sessionClosedSha256:canonicalDigest(closed),
    stoppedSha256:started.stoppedSha256,ingressSha256:canonicalDigest(installed),fencedSha256:canonicalDigest(manifest),
    bootOnly:true,ingressRelease:false,backgroundAdmission:false,
  };
  const {planSha,participant,startedAt,readiness,controlSession,outcome,checkedAt,...recordedPlan} = started;
  validateParticipants([participant],{targetSha:context.runtimeSha});
  if(!same(recordedPlan,plan)||planSha!==canonicalDigest(plan)||!isHash(plan.stoppedSha256)||
      !same(participant,{...prior,bootId:participant.bootId})||participant.bootId===prior.bootId||
      outcome!=='EXACT_ORIGINAL_HEALTHY_FENCED'||!(Date.parse(startedAt)>Date.parse(api.startedAt))||
      !(Date.parse(checkedAt)>=Date.parse(startedAt))||readiness?.status!==200||readiness.ready!==true||
      readiness.dbConnected!==true||!controlSession)fail('PROTECTED_FENCED_START_RECEIPT_REQUIRED');
  return {startedAt,participant,controlSession};
}

/** The transport supplies a live admission check for its new recovery authority
 * and sealed dual-lock session. An optional ingress observer returns the
 * current installed inet/bridge identity as a SHA-256 string. */
export async function createModernSchemaOperatorRecoveryVerifier({
  owner,recoveryOwner,recoveryLease:inputLease,requireAdmission,observeFences,controlChild,heldInspection,
},dependencies={}){
  if(typeof owner!=='string'||typeof recoveryOwner!=='string'||!ownerPattern.test(owner)||!ownerPattern.test(recoveryOwner)||
      owner===recoveryOwner||typeof requireAdmission!=='function'||(observeFences!==undefined&&typeof observeFences!=='function')){
    fail('EXACT_NEW_RECOVERY_AUTHORITY_REQUIRED');
  }
  const recoveryLease = structuredClone(inputLease);
  modernSchemaOriginalSessionExitSql(recoveryLease);
  const store = dependencies.store??new ModernSchemaRegistry();
  const runtime = dependencies.privateRuntime??new ModernSchemaPrivateRuntime();
  const readPublic = dependencies.readPublic??readPublicManifest;
  const docker = dependencies.docker??nativeDocker;
  const inspect = dependencies.inspectContainer??(id=>inspectModernSchemaContainer(id,(_binary,args)=>docker(args)));
  const getHead = dependencies.readHead??(()=>git(CONTRACT.repository,['rev-parse','HEAD'],{timeoutMs:5000}));
  const admit = async () => {
    store.guard();
    if(await requireAdmission()!==true)fail('RECOVERY_ADMISSION_LOST');
    store.guard();
    return true;
  };
  await admit();
  const source = bindHistoricalStop({store,owner,recoveryLease,heldInspection,
    readApproval:dependencies.readApproval??((context,options)=>readHistoricalApproval(store,context,options)),
    validatePreparation:dependencies.validatePreparation??validateModernSchemaPreparation});
  const {key,context,contextDigest,binding,pending,preparation,policy,residual,api,web,db,hold,catalog,provesOldAbsent,adopted,interrupted} = source;
  let formalTerm=null,formalTerminalEvents=null;
  if(residual){
    const term=path.join(store.directory,`schema-release-session-${owner}`,'original-r-term');
    const read=dependencies.readProtectedTerm??(file=>readPinnedFile(file,{contract:CONTRACT}));
    if(!read(term+'.stdout').equals(Buffer.from(api.id+'\n'))||read(term+'.stderr').length!==0)
      fail('EXACT_FIRST_TERM_ACCEPTANCE_REQUIRED');
    if(!source.incident){
      const intentFile=formalTermIntentPath(store.directory,owner),intent=JSON.parse(read(intentFile));
      if(intent.schema!=='phoenix.modern-schema-stalled-original-term-intent/v1'||
          intent.originalLeaseSha256!==canonicalDigest(pending.lease)||
          Date.parse(intent.recordedAt)<Date.parse(source.steps[3].recordedAt)||
          !originalStalledTermBindingMatches(intent,context,api.id,api.startedAt))
        fail('PROTECTED_FORMAL_STALLED_TERM_INTENT_REQUIRED');
      formalTerm=intent;
      const nativeFile=path.join(path.dirname(intentFile),'stalled-original-termination-native.json');
      if(store.io.lstatSync(nativeFile,{throwIfNoEntry:false})){
        const receipt=JSON.parse(read(nativeFile));
        if(!same(receipt.intent,intent)||!confirmsResidualTermEvents(receipt.events,api.id,intent.recordedAt,receipt.exitCode))
          fail('NATIVE_FORMAL_STALLED_TERM_RECEIPT_INVALID');
        formalTerminalEvents=receipt.events;
      }
    }
  }
  for(const original of [catalog,...(source.beforeCatalog?[source.beforeCatalog]:[]),...(adopted?.recoveryCatalogs??[]),...(interrupted?[interrupted.catalog]:[])]){
    const originalDirectory=adopted?.recoveryCatalogs.includes(original)||interrupted?.catalog===original?'recovery':'session';
    const originalCatalogFile = path.join(store.directory,`schema-release-${originalDirectory}-${owner}`,`catalog-${original.stage}.stdout`);
    if(original.raw?.path!==originalCatalogFile||!isHash(original.raw.sha256)||
        !Number.isSafeInteger(original.raw.bytes)||original.raw.bytes<1||original.raw.bytes>16*1024*1024||
        !same(await runtime.digest(originalCatalogFile),original.raw))fail('ORIGINAL_NATIVE_CATALOG_BYTES_CHANGED');
  }
  const stoppedPin = {containerId:api.id,imageId:api.image,restartPolicy:policy};
  const manifest = validateManifest(readPublic());
  const control = store.read(controlName);
  const generation = store.read('background-generation.json');
  const prior = preparation.originalBackground.participant;
  const {hostSurface,ingressScope} = preparation;
  const historicalApiSessions=residual?hold.nativeExecutors.value.sessions?.filter(row=>row.clientAddress===hostSurface.runtimeAddress):[];
  if(residual&&(!Array.isArray(historicalApiSessions)||historicalApiSessions.length>1||
      historicalApiSessions.some(row=>row.openTransaction!==false||row.applicationName!=='')))fail('ORIGINAL_RESIDUAL_BACKEND_NOT_PROVED');
  assertSameBinding(control,binding);
  if(manifest.phase!=='FENCED'||manifest.owner!==owner||manifest.targetSha!==context.targetSha||
      !same(manifest.participants,[prior])||prior.containerId!==api.id||prior.revision!==context.runtimeSha||
      control.phase!=='FENCED'||control.generation!==manifest.generation||control.manifestDigest!==digest(JSON.stringify(manifest))||
      generation.schema!=='phoenix.background-generation/1'||generation.generation!==manifest.generation||
      canonicalDigest(ingressScope)!==context.ingressScopeSha256||!same(ingressScope,hostSurface.ingressScope))fail('EXACT_ORIGINAL_BACKGROUND_FENCE_REQUIRED');
  const installed = store.read(key('ingress-installed'));
  if(installed.schema!=='phoenix.modern-schema-ingress-observation/v1'||installed.owner!==owner||installed.contextDigest!==contextDigest||
      installed.scopeSha256!==context.ingressScopeSha256||installed.state!=='FENCED'||!isHash(installed.identitySha256)||
      !same(installed,source.steps[2].payload.evidence.ingressObservation))fail('ORIGINAL_INGRESS_RECEIPT_REQUIRED');
  const fencedStartKey = key('operator-fenced-start-verified');
  const started = store.exists(fencedStartKey)?store.read(fencedStartKey):null;
  if(started&&(adopted||residual||!source.closed||source.beforeFactsSha256))fail('DIRECT_RECOVERY_REQUIRES_STOPPED_RUNTIME');
  const fencedStart = started?bindFencedStart({started,owner,context,contextDigest,pending,hold,closed:source.closed,
    installed,manifest,prior,api}):null;
  if(!observeFences){
    const ingress = new ModernSchemaIngress({context,scope:ingressScope,privateRuntime:runtime,admit});
    if(!same(ingress.host,installed.host))fail('ORIGINAL_INGRESS_HOST_CHANGED');
    observeFences = async () => {
      await ingress.check('OPERATOR_RECOVERY_OBSERVE');
      const identity = canonicalDigest(ingressIdentity(ingress.tables()));
      await ingress.check('OPERATOR_RECOVERY_OBSERVE');
      return identity;
    };
  }
  const check = async () => {
    await admit();
    source.checkNoLaterEffects();
    if(interrupted)guardInterruptedEdge(store.directory);
    if(adopted&&(!same(store.read(key('original-recovery-intent')),adopted.intent)||
       !same(store.read(key('original-recovery-verified')),adopted.proof)||
       !same(readVerifiedRecoveryOwnership(store,pending,adopted.proof),adopted.ownership)))fail('VERIFIED_ORIGINAL_RECOVERY_MOVED');
    if(!same(store.read(marker),pending)||!same(store.read(controlName),control)||!same(readPublic(),manifest)||
        !same(store.read('background-generation.json'),generation)||!same(store.read('floor.json'),preparation.floor)||
        !same(store.read('active.json'),preparation.active)||getHead()!==preparation.rootHeadSha||
        !same(store.exists(fencedStartKey)?store.read(fencedStartKey):null,started))fail('ORIGINAL_PHASE_FENCE_OR_PINS_CHANGED');
    if(await observeFences({owner,recoveryOwner,context,preparation,installed,manifest})!==installed.identitySha256)fail('NATIVE_INGRESS_IDENTITY_CHANGED');
    return admit();
  };
  const residualTermKey=key('operator-residual-term-intent');
  const readTermEvents=term=>docker(['events','--since',term.recordedAt,'--until',new Date().toISOString(),
    '--filter','type=container','--filter','container='+api.id,'--filter','event=kill','--filter','event=die',
    '--format',ORIGINAL_TERM_EVENT_FORMAT]);
  const hasResidualTermIntent=()=>{
    if(formalTerm)return confirmsResidualTermEvents(formalTerminalEvents??readTermEvents(formalTerm),api.id,formalTerm.recordedAt);
    if(!residual||!store.exists(residualTermKey))return false;
    const term=store.read(residualTermKey);
    if(!(term.schema==='phoenix.modern-operator-residual-term-intent/v1'&&term.owner===owner&&term.targetSha===context.targetSha&&
      ownerPattern.test(term.recoveryOwner??'')&&term.recoveryOwner!==owner&&term.containerId===api.id&&term.imageId===api.image&&
      term.startedAt===api.startedAt&&Number.isSafeInteger(term.pid)&&term.pid>1&&term.signal==='TERM'&&
      term.pendingSha256===canonicalDigest(pending)&&term.migrationAuthorized===false&&
      Date.parse(term.recordedAt)>Date.parse(pending.updatedAt)))return false;
    const originalRecovery=store.read(`schema-release-operator-recovery-intent-${term.recoveryOwner}.json`);
    if(originalRecovery.schema!=='phoenix.modern-operator-recovery-intent/v1'||originalRecovery.owner!==owner||
        originalRecovery.recoveryOwner!==term.recoveryOwner||originalRecovery.pendingSha256!==term.pendingSha256||
        originalRecovery.target!==context.targetSha||originalRecovery.migrationAuthorized!==false||
        term.recoveryLeaseSha256!==canonicalDigest(originalRecovery.newLease))return false;
    return confirmsResidualTermEvents(readTermEvents(term),api.id,term.recordedAt);
  };
  const inspectHost = (running,requireOriginalFencedBoot=false,residualRunning=false) => {
    if(!same(captureRuntime(docker),preparation.active.active))fail('ORIGINAL_RUNTIME_IMAGES_CHANGED');
    for(const pin of [web,db]){
      const current = inspect(pin.id);
      if(current.id!==pin.id||current.imageId!==pin.image||current.restarts!==pin.restartCount||
          current.state.StartedAt!==pin.startedAt||current.state.Running!==true||current.state.Health?.Status!=='healthy'){
        fail('ORIGINAL_WEB_OR_DATABASE_CHANGED');
      }
    }
    const current = inspect(api.id);
    const expectedExit=fencedStart?0:source.stop?.exitCode??0;
    const [endpoint,...extra] = Object.values(current.networks??{});
    if(current.id!==api.id||current.name!=='/phoenix-v3-api'||current.imageId!==api.image||current.restarts!==api.restartCount||
        current.labels?.['com.docker.compose.project']!==preparation.floor.project||current.labels?.['com.docker.compose.service']!=='api'||
        current.state.OOMKilled!==false||current.state.Dead!==false||current.state.Restarting!==false||current.state.Paused!==false||
        current.state.Running!==running||!same(current.restartPolicy,adopted?policy:noRestart)||!endpoint||extra.length)fail('ORIGINAL_API_IDENTITY_CHANGED');
    if(running){
      const startedAt = Date.parse(current.state.StartedAt);
      const anchor = fencedStart?.startedAt??api.startedAt;
      const healthy=residualRunning?'unhealthy':'healthy';
      const expectedStart=residualRunning?api.startedAt:anchor;
      if(current.state.Status!=='running'||current.state.Health?.Status!==healthy||current.state.Pid<2||
          (adopted&&current.state.StartedAt!==adopted.proof.startedAt)||(interrupted&&current.state.StartedAt!==interrupted.bootAt)||
          (requireOriginalFencedBoot||residualRunning?current.state.StartedAt!==expectedStart:!(startedAt>Date.parse(anchor)))||
          endpoint.NetworkID!==ingressScope.networkId||
          endpoint.IPAddress!==hostSurface.runtimeAddress||endpoint.GlobalIPv6Address!=='')fail('RECOVERED_API_RUNTIME_NOT_READY');
    } else if(current.state.Status!=='exited'||current.state.StartedAt!==(fencedStart?.startedAt??api.startedAt)||
        !(current.state.ExitCode===expectedExit||residual&&current.state.ExitCode===143&&hasResidualTermIntent())||
        current.state.Pid!==0||![ingressScope.networkId,''].includes(endpoint.NetworkID)||
        (fencedStart&&!(Date.parse(current.state.FinishedAt)>Date.parse(fencedStart.startedAt)))){
      fail('EXACT_ORIGINAL_API_STOP_REQUIRED');
    }
    const [network] = JSON.parse(docker(['network','inspect',ingressScope.networkId]));
    const expectedMembers = [web.id,db.id,...(running?[api.id]:[])].sort();
    if(network?.Id!==ingressScope.networkId||!same(Object.keys(network.Containers??{}).sort(),expectedMembers))fail('EXACT_ORIGINAL_NETWORK_MEMBERS_REQUIRED');
    const ids = docker(['ps','--no-trunc','-q','--filter',`label=com.docker.compose.project=${preparation.floor.project}`,
      '--filter','label=com.docker.compose.service=api']).split('\n').filter(Boolean);
    if(!same(ids,running?[api.id]:[]))fail('UNEXPECTED_RUNNING_API');
    return residualRunning?{startedAt:current.state.StartedAt,pid:current.state.Pid}:current.state.StartedAt;
  };

  await check();
  const directory = runtime.createDirectory(recoveryOwner,'recovery');
  const client = dependencies.client??new ModernSchemaReadClient({databaseContainer:db.id});
  let stage = 'READY', baseline = null, ownedChildren=[];
  const verifyRuntime = (startedAt, expectedFencedBoot=false) => {
    const actual = (dependencies.inspectParticipant??inspectApiParticipant)(prior,preparation.floor.project,docker);
    const participant = {...prior,bootId:actual.status?.bootId};
    validateParticipants([participant],{targetSha:context.runtimeSha});
    const status = verifyParticipantStatus(actual,participant,manifest);
    const matchesExpectedBoot = expectedFencedBoot
      ? same(participant,fencedStart.participant)&&sameOperatorControlSession(status.controlSession,fencedStart.controlSession)
      : participant.bootId!==fencedStart?.participant.bootId;
    if(!matchesExpectedBoot||participant.bootId===prior.bootId||actual.imageId!==api.image||actual.startedAt!==startedAt||
        (adopted&&!same(participant,adopted.proof.originalRuntime))||
        actual.restartCount!==api.restartCount||status.inFlight!==0||status.taskGraphs!==0||status.pendingChildren!==0){
      fail('ORIGINAL_API_QUIESCENT_NEW_BOOT_REQUIRED');
    }
    const probe = JSON.parse(docker(['exec',api.id,'/usr/bin/env','-i','PATH=/usr/local/bin:/usr/bin:/bin','/usr/local/bin/node','-e',API_READINESS_PROGRAM]));
    if(probe.status!==200||probe.ready!==true||probe.dbConnected!==true||!isHash(probe.bodySha256))fail('ORIGINAL_API_READY_PROBE_REQUIRED');
    return {participant,controlSession:status.controlSession,readiness:probe};
  };
  const observeNative = async (running,verifiedApi,residualIdle=false) => {
    const {rows:[old]} = await client.query(modernSchemaOriginalSessionExitSql(pending.lease));
    if(!provesOldAbsent(old))fail('ORIGINAL_SESSION_REAPPEARED_OR_PRIMARY_CHANGED');
    const {rows:[{jsonb_build_object:holders}]} = await client.query(MODERN_SCHEMA_LEASE_SQL);
    if(!same(parseModernSchemaLease(JSON.parse(holders)),recoveryLease))fail('NEW_RECOVERY_LEASE_NOT_OBSERVED');
    const controlSession = verifiedApi?.controlSession;
    const applicationName = verifiedApi?`phoenix-fence:${verifiedApi.participant.bootId}`:null;
    for(let attempt=0;attempt<3;attempt++){
      const {rows:[{observation:raw,idle_pids:idlePids}]} = await client.query(residualIdle?ORIGINAL_IDLE_EXECUTOR_SQL:MODERN_SCHEMA_EXECUTOR_SQL);
      const observed = JSON.parse(raw);
      // This classifier slot names the current lock owner. The original lease
      // is bound separately to the failed release and checked for absence.
      const executors = classifyModernSchemaDatabaseExecutors(observed,{runtimeAddress:hostSurface.runtimeAddress,
        originalLease:recoveryLease,oldRuntimeStopped:!running&&!residualIdle});
      if(residualIdle){
        const idle=JSON.parse(idlePids);
        const incumbent=observed.sessions.filter(row=>row.clientAddress===hostSurface.runtimeAddress);
        if(!Array.isArray(idle)||observed.workers.length!==0||incumbent.length>historicalApiSessions.length||
            incumbent.some(row=>!same(row,historicalApiSessions[0])||!idle.includes(row.pid)))fail('ORIGINAL_RESIDUAL_BACKEND_NOT_PROVED');
      }
      const applicationSessions = observed.sessions.filter(row=>row.applicationName===applicationName);
      const apiControl = controlSession&&applicationSessions[0];
      if(controlSession&&(controlSession.applicationName!==applicationName||applicationSessions.length!==1||
          apiControl.pid!==controlSession.sessionPid||apiControl.databaseOid!==controlSession.databaseOid||
          apiControl.clientAddress!==hostSurface.runtimeAddress||
          BigInt(apiControl.backendStartMicros)/1000n!==BigInt(Date.parse(controlSession.backendStartedAt)))){
        fail('NEW_API_CONTROL_SESSION_NOT_OBSERVED');
      }
      const active = observed.sessions.filter(row=>row.openTransaction!==false);
      if(active.length===0)return executors;
      if(active.length!==1||active[0]!==apiControl||apiControl.openTransaction!==true)fail('UNEXPECTED_OPEN_DATABASE_TRANSACTION');
      // The incumbent sends a fixed identity heartbeat once a second. Sample
      // again when only that exact backend is active, and require a quiet view.
      if(attempt<2)await pause(40);
    }
    fail('API_CONTROL_SESSION_NOT_QUIESCENT');
  };
  const collect = async (running,stage) => {
    await check();
    const startedAt = inspectHost(running);
    const first = running?verifyRuntime(startedAt):null;
    await observeNative(running,first);
    const ledger = await (dependencies.captureLedger??captureModernSchemaLedger)(client);
    if(ledger.sha256!==context.beforeLedgerSha256||digest(JSON.stringify(ledger.ledger))!==context.beforeLedgerSha256||
        (source.closed&&!same(ledger.ledger,hold.nativeLedger.ledger)))fail('NATIVE_LEDGER_CHANGED');
    const facts = await (dependencies.captureFacts??captureModernSchemaFacts)(client);
    const off = (dependencies.verifyDefaultOff??defaultOffEvidenceFromFacts)(context.runtimeSha,facts,{stage:'BEFORE_SCHEMA',floor:preparation.floor,plan:context});
    if(off.verified!==true||facts.schema!=='phoenix.modern-schema-database-facts/v1'||facts.readOnly!==true||
        facts.releaseAuthorized!==false||!isHash(facts.allDataSha256)||!isHash(facts.businessDataSha256)||
        !same(facts.database,{name:recoveryLease.database.name,systemIdentifier:recoveryLease.database.systemIdentifier})){
      fail('NEW_NATIVE_DATABASE_FACTS_REQUIRED');
    }
    if(source.beforeFactsSha256&&source.beforeFactsSha256!==canonicalDigest(facts))fail('ORIGINAL_FROZEN_BACKUP_FACTS_CHANGED');
    const schema = await (dependencies.captureCatalog??captureModernSchemaCatalog)({
      owner:recoveryOwner,stage,databasePin:db,privateRuntime:runtime,directory,admit:check,
    });
    if(schema.receipt?.schema!=='phoenix.modern-schema-catalog-facts/v1'||schema.receipt.schemaSha256!==catalog.schemaSha256||
        schema.receipt.owner!==recoveryOwner||
        schema.receipt.stage!==stage||schema.receipt.readOnly!==true||schema.receipt.releaseAuthorized!==false||
        !same(schema.receipt.databasePin,db))fail('NATIVE_SCHEMA_CHANGED_SINCE_ORIGINAL_HOLD');
    const latest = await (dependencies.captureLedger??captureModernSchemaLedger)(client);
    if(!same(ledger,latest))fail('NATIVE_LEDGER_MOVED_DURING_CHECKPOINT');
    const executors = await observeNative(running,first);
    await check();
    if(inspectHost(running)!==startedAt)fail('ORIGINAL_API_START_TIME_CHANGED');
    const last = running?verifyRuntime(startedAt):null;
    if(first&&(!same(first.participant,last.participant)||!sameOperatorControlSession(first.controlSession,last.controlSession))){
      fail('RECOVERED_API_BOOT_CHANGED_DURING_CHECKPOINT');
    }
    const hostProcessesSha256=observeCurrentHost();
    return {startedAt,ledgerSha256:ledger.sha256,catalogSha256:schema.receipt.schemaSha256,
      catalogReceiptSha256:canonicalDigest(schema.receipt),factsSha256:canonicalDigest(facts),
      allDataSha256:facts.allDataSha256,businessDataSha256:facts.businessDataSha256,executors,
      ...(hostProcessesSha256?{hostProcessesSha256}:{}),...last};
  };
  const observeCurrentHost=()=>{
    if(!source.requireHostCensus)return null;
    const proof=(dependencies.verifyHostProcesses??verifyRecoveryHostProcesses)(preparation,docker,ownedChildren,adopted?.ownership.pins);
    if(!isHash(proof))fail('RECOVERY_HOST_PROOF_REQUIRED');
    return proof;
  };
  try{
    await client.start();
    if(source.requireHostCensus&&!dependencies.verifyHostProcesses){
      ownedChildren=[pinModernSchemaChild(controlChild),pinModernSchemaChild(client.child)];
    }
  }catch(error){try{await client.close();}catch{}throw error;}
  const checkpoint = async (next,done,work) => {
    stage = next;
    try{
      const result = await work();
      stage = done;
      return result;
    }catch(error){
      stage = 'FAILED';
      throw error;
    }
  };
  return {
    stoppedPin:structuredClone(stoppedPin),
    manifest:structuredClone(manifest),
    async verifyInterruptedOriginal(){
      if(!interrupted||stage!=='READY')fail('EXACT_INTERRUPTED_RELEASE_REQUIRED');
      return checkpoint('CAPTURING_INTERRUPTED','STARTED_VERIFIED',async()=>{
        const observed=await collect(true,'recovery-after');
        if(observed.startedAt!==interrupted.bootAt||!observed.hostProcessesSha256||observed.factsSha256!==source.beforeFactsSha256)
          fail('INTERRUPTED_RECHECK_CHANGED');
        const historical=readInterruptedBoot(store,source,heldInspection);
        if(!same(historical,interrupted))fail('INTERRUPTED_EVIDENCE_CHANGED');
        return {...observed,participant:{...observed.participant,allowedKinds:[]},originalFencedParticipant:observed.participant,
          schema:'phoenix.modern-schema-operator-recovery-verified/v1',owner,recoveryOwner,contextDigest,
          recoveredSha:context.runtimeSha,attemptedTargetSha:context.targetSha,pendingSha256:canonicalDigest(pending),
          recoveryLeaseSha256:canonicalDigest(recoveryLease),ingressIdentitySha256:installed.identitySha256,
          inspectionOwner:heldInspection,inspectionSha256:interrupted.inspectionSha256,originalIntentSha256:interrupted.intentSha256,
          outcome:'ORIGINAL_R_READY_UNDER_BOTH_FENCES',formalTargetSuccess:false,releaseAuthorized:false};
      });
    },
    async verifyAdoptedOriginal(){
      if(!adopted||stage!=='READY')fail('EXACT_VERIFIED_ORIGINAL_ADOPTION_REQUIRED');
      return checkpoint('CAPTURING_ADOPTED','STARTED_VERIFIED',async()=>{
        const observed=await collect(true,'recovery-after');
        return {...observed,schema:'phoenix.modern-schema-operator-recovery-verified/v1',owner,recoveryOwner,
          contextDigest,recoveredSha:context.runtimeSha,attemptedTargetSha:context.targetSha,
          pendingSha256:canonicalDigest(pending),recoveryLeaseSha256:canonicalDigest(recoveryLease),
          adoptedRecoveryProofSha256:canonicalDigest(adopted.proof),adoptedOwnershipSha256:adopted.ownership.sha256,
          ingressIdentitySha256:installed.identitySha256,
          outcome:'ORIGINAL_R_READY_UNDER_BOTH_FENCES',formalTargetSuccess:false,releaseAuthorized:false};
      });
    },
    async verifyResidualOriginal(){
      if(!source.incident||stage!=='READY'||store.exists(residualTermKey))fail('SINGLE_RESIDUAL_ORIGINAL_TERM_REQUIRED');
      await check();
      const actual=inspectHost(true,false,true);
      const noListener=()=>docker(['exec',api.id,'/usr/bin/env','-i','/usr/local/bin/node','-e',ORIGINAL_LISTENER_CLOSED_PROGRAM])==='LISTENER_CLOSED';
      if(!noListener())fail('ORIGINAL_RESIDUAL_LISTENER_NOT_CLOSED');
      await observeNative(false,undefined,true);
      const ledger=await (dependencies.captureLedger??captureModernSchemaLedger)(client);
      if(ledger.sha256!==context.beforeLedgerSha256||!same(ledger.ledger,hold.nativeLedger.ledger))fail('NATIVE_LEDGER_CHANGED');
      observeCurrentHost();
      await check();
      if(!same(actual,inspectHost(true,false,true))||!noListener())fail('RESIDUAL_ORIGINAL_IDENTITY_MOVED');
      await observeNative(false,undefined,true);
      return {key:residualTermKey,record:{schema:'phoenix.modern-operator-residual-term-intent/v1',owner,recoveryOwner,
        targetSha:context.targetSha,containerId:api.id,imageId:api.image,...actual,signal:'TERM',pendingSha256:canonicalDigest(pending),
        recordedAt:new Date().toISOString(),recoveryLeaseSha256:canonicalDigest(recoveryLease),migrationAuthorized:false}};
    },
    async verifyFencedBoot(){
      if(!fencedStart||stage!=='READY')fail('SINGLE_PROTECTED_FENCED_BOOT_CHECK_REQUIRED');
      return checkpoint('CAPTURING_FENCED_BOOT','FENCED_BOOT_VERIFIED',async()=>{
        await check();
        const startedAt = inspectHost(true,true);
        const observed = verifyRuntime(startedAt,true);
        await observeNative(true,observed);
        await check();
        if(inspectHost(true,true)!==startedAt)fail('ORIGINAL_FENCED_BOOT_CHANGED');
        return {startedAt,...verifyRuntime(startedAt,true)};
      });
    },
    async captureStopped(){
      if(adopted||interrupted||stage!==(fencedStart?'FENCED_BOOT_VERIFIED':'READY'))fail('SINGLE_STOPPED_CHECKPOINT_REQUIRED');
      return checkpoint('CAPTURING_STOPPED','STOPPED_VERIFIED',async()=>{
        baseline=await collect(false,'recovery-before');
        return structuredClone(baseline);
      });
    },
    async verifyStarted(){
      if(stage!=='STOPPED_VERIFIED')fail('VERIFIED_STOPPED_CHECKPOINT_REQUIRED');
      return checkpoint('CAPTURING_STARTED','STARTED_VERIFIED',async()=>{
        const observed=await collect(true,'recovery-after');
        if(observed.factsSha256!==baseline.factsSha256||observed.ledgerSha256!==baseline.ledgerSha256||
            observed.catalogSha256!==baseline.catalogSha256)fail('NATIVE_DATABASE_CHANGED_DURING_ORIGINAL_RESTART');
        return {...observed,schema:'phoenix.modern-schema-operator-recovery-verified/v1',owner,recoveryOwner,
          contextDigest,recoveredSha:context.runtimeSha,attemptedTargetSha:context.targetSha,
          pendingSha256:canonicalDigest(pending),recoveryLeaseSha256:canonicalDigest(recoveryLease),
          stoppedCheckpointSha256:canonicalDigest(baseline),ingressIdentitySha256:installed.identitySha256,
          outcome:'ORIGINAL_R_READY_UNDER_BOTH_FENCES',formalTargetSuccess:false,releaseAuthorized:false};
      });
    },
    async verifyHostBeforeOpen(){
      if(stage!=='STARTED_VERIFIED')fail('ORIGINAL_API_NOT_VERIFIED');
      await check();
      const proof=observeCurrentHost();
      await check();
      return proof;
    },
    async close(){
      if(stage.startsWith('CAPTURING_'))fail('CHECKPOINT_IN_PROGRESS');
      stage='CLOSED';
      await client.close();
    },
  };
}
