/** Read-only checkpoints for a new, separately authorized recovery session.
 * The failed release and its native observations stay in their original files.
 * Authority to start R or change either fence belongs to the caller. */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import {CONTRACT,git} from './production-config-guard.mjs';
import {captureRuntime,executionEnv} from './capture-production-runtime.mjs';
import {assertSameBinding,readPublicManifest,validateManifest,validateParticipants} from './background-control-manifest.mjs';
import {inspectApiParticipant,verifyParticipantStatus} from './background-control-coordinator.mjs';
import {canonicalDigest,HASH,same} from './production-maintenance-receipts.mjs';
import {API_READINESS_PROGRAM} from './production-maintenance-candidate-health.mjs';
import {captureModernSchemaCatalog} from './production-modern-schema-catalog.mjs';
import {modernSchemaOriginalSessionExitSql} from './production-modern-schema-completion.mjs';
import {classifyModernSchemaDatabaseExecutors,inspectModernSchemaContainer,MODERN_SCHEMA_EXECUTOR_SQL} from './production-modern-schema-executors.mjs';
import {captureModernSchemaFacts,defaultOffEvidenceFromFacts} from './production-modern-schema-facts.mjs';
import {ModernSchemaIngress} from './production-modern-schema-ingress.mjs';
import {ingressIdentity} from './maintenance-ingress-policy.mjs';
import {ModernSchemaPrivateRuntime} from './production-modern-schema-private.mjs';
import {ModernSchemaReadClient} from './production-modern-schema-read-client.mjs';
import {ModernSchemaRegistry,validateModernSchemaPreparation} from './production-modern-schema-registration.mjs';
import {captureModernSchemaLedger} from './production-modern-schema-schema-result.mjs';
import {MODERN_SCHEMA_LEASE_SQL,parseModernSchemaLease} from './production-modern-schema-session-lease.mjs';
import {MODERN_SCHEMA_PHASES,modernSchemaReleaseBinding,validateModernSchemaPending} from './production-modern-schema-state.mjs';
import {validateRegisteredFrozenLegacyScope,validateRegisteredModernSchemaApproval} from './production-modern-schema-authority.mjs';
import {digest} from './chanjet-admission-schema-receipt.mjs';

const fail = code => { throw Error('MODERN_SCHEMA_OPERATOR_RECOVERY_HOLD=' + code); };
const ownerPattern = /^[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$/;
const noRestart = {Name:'no',MaximumRetryCount:0};
const marker = 'schema-release-pending.json';
const controlName = 'background-control.json';
const isHash = value => typeof value === 'string' && HASH.test(value);
const nativeDocker = args => {
  try {
    return execFileSync('/usr/bin/docker',args,{env:executionEnv(),encoding:'utf8',timeout:5000,
      maxBuffer:2*1024*1024,stdio:['ignore','pipe','pipe']}).trim();
  } catch { fail('DOCKER_OBSERVATION_UNAVAILABLE'); }
};

function readHistoricalApproval(store,context,{now}){
  const grant = store.read(`schema-release-approval-${context.owner}.json`);
  const frozen = context.testManifestSha256?store.read(`schema-release-frozen-test-${context.owner}-${context.testManifestSha256}.json`):null;
  validateRegisteredModernSchemaApproval(grant,context,now());
  validateRegisteredFrozenLegacyScope(frozen,grant,context);
  return {approvalSha256:canonicalDigest(grant),contextDigest:canonicalDigest(context)};
}

function bindHistoricalStop({store,owner,recoveryLease,readApproval,validatePreparation}){
  const key = suffix => `schema-release-${suffix}-${owner}.json`;
  const preparation = store.read(key('preparation'));
  const stepName = (phase,sequence) => `schema-release-step-${owner}-${sequence}-${phase.toLowerCase().replaceAll('_','-')}.json`;
  const steps = MODERN_SCHEMA_PHASES.slice(0,5).map((phase,sequence) => store.read(stepName(phase,sequence)));
  const stopAt = Date.parse(steps[4].recordedAt);
  if(!Number.isFinite(stopAt))fail('ORIGINAL_STOP_TIME_REQUIRED');
  const {context,preparationSha256} = validatePreparation(preparation,stopAt);
  const contextDigest = canonicalDigest(context);
  const binding = modernSchemaReleaseBinding(context,preparationSha256);
  const pending = validateModernSchemaPending(store.read(marker),binding);
  if(context.owner!==owner||pending.phase!=='R_STOPPED'||pending.sequence!==4||pending.status!=='HOLD'||!pending.lease||
      pending.receiptSha256!==canonicalDigest(steps[4]))fail('EXACT_STOPPED_HOLD_REQUIRED');
  const checkNoLaterEffects = () => {
    const excluded = ['transaction.json','policy-transition.json','cutover-pending.json',`deploy-${owner}.json`,
      ...['schema-receipt','open-commit-intent','original-recovery-intent','original-recovery-open-commit-intent','ingress-released'].map(key),
      ...MODERN_SCHEMA_PHASES.slice(5).map((phase,index)=>stepName(phase,index+5))];
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
  const stop = steps[4].payload.evidence.runtimeStopReceipt;
  const policy = stop?.originalRestartPolicy;
  if(canonicalDigest(preparation.originalSnapshot.containers)!==context.runtimeSnapshotSha256||
      stop?.schema!=='phoenix.modern-schema-original-runtime-stopped/v1'||stop.containerId!==api.id||
      stop.imageId!==api.image||stop.startedAt!==api.startedAt||stop.restartCount!==api.restartCount||
      stop.signal!=='TERM'||stop.exitCode!==0||stop.pid!==0||stop.oomKilled!==false||stop.automaticKill!==false||
      stop.oldDatabaseSessionsGone!==true||!same(stop.currentRestartPolicy,noRestart)||
      !['no','always','unless-stopped'].includes(policy?.Name)||policy.MaximumRetryCount!==0||
      !same(steps[3].payload.evidence.originalRestartPolicy,policy))fail('EXACT_ORIGINAL_STOP_RECEIPT_REQUIRED');

  const closed = store.read(key('session-closed'));
  const {database} = pending.lease;
  const provesOldAbsent = value => value?.primary===true&&value.originalSessionPresent===false&&
    value.databaseOid===database.databaseOid&&value.systemIdentifier===database.systemIdentifier&&
    value.postmasterStartMicros===database.postmasterStartMicros;
  if(closed.schema!=='phoenix.modern-schema-original-session-closed/v1'||closed.outcome!=='ORIGINAL_SESSION_ABSENT'||
      closed.originalLeaseSha256!==canonicalDigest(pending.lease)||!provesOldAbsent(closed.nativeObservation))fail('ORIGINAL_SESSION_CLOSE_RECEIPT_REQUIRED');

  const hold = store.read(`recovery-modern-schema-${owner}.json`);
  const catalogKey = key('hold-observation-schema');
  const catalog = store.read(catalogKey);
  if(hold.schema!=='phoenix.modern-schema-release-hold-observation/v1'||hold.owner!==owner||hold.targetSha!==context.targetSha||
      hold.phase!=='R_STOPPED'||hold.backgroundAdmissionCommitted!==false||hold.originalRecoveryCommitted!==false||
      hold.terminalComplete!==false||hold.defaultOff!==true||hold.nativeLedger?.status!=='OBSERVED'||
      hold.nativeLedger.sha256!==context.beforeLedgerSha256||digest(JSON.stringify(hold.nativeLedger.ledger))!==context.beforeLedgerSha256||
      hold.nativeExecutors?.status!=='OBSERVED'||hold.nativeExecutors.value?.primary!==true||
      hold.nativeExecutors.value.databaseOid!==database.databaseOid||
      hold.nativeExecutors.value.systemIdentifier!==database.systemIdentifier||
      hold.nativeExecutors.value.postmasterStartMicros!==database.postmasterStartMicros||
      hold.nativeSchema?.status!=='OBSERVED'||hold.nativeSchema.file!==store.file(catalogKey)||
      hold.nativeSchema.sha256!==canonicalDigest(catalog)||catalog.schema!=='phoenix.modern-schema-catalog-facts/v1'||
      catalog.owner!==owner||catalog.stage!=='hold-observation'||catalog.readOnly!==true||catalog.releaseAuthorized!==false||
      !same(catalog.databasePin,db)||!isHash(catalog.schemaSha256))fail('ORIGINAL_HOLD_LEDGER_AND_CATALOG_REQUIRED');
  return {key,context,contextDigest,binding,pending,preparation,steps,stop,api,web,db,catalog,hold,closed,
    checkNoLaterEffects,provesOldAbsent};
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
  owner,recoveryOwner,recoveryLease:inputLease,requireAdmission,observeFences,
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
  const source = bindHistoricalStop({store,owner,recoveryLease,
    readApproval:dependencies.readApproval??((context,options)=>readHistoricalApproval(store,context,options)),
    validatePreparation:dependencies.validatePreparation??validateModernSchemaPreparation});
  const {key,context,contextDigest,binding,pending,preparation,stop,api,web,db,hold,catalog,provesOldAbsent} = source;
  const originalCatalogFile = path.join(store.directory,`schema-release-session-${owner}`,'catalog-hold-observation.stdout');
  if(catalog.raw?.path!==originalCatalogFile||!isHash(catalog.raw.sha256)||
      !Number.isSafeInteger(catalog.raw.bytes)||catalog.raw.bytes<1||catalog.raw.bytes>16*1024*1024||
      !same(await runtime.digest(originalCatalogFile),catalog.raw))fail('ORIGINAL_NATIVE_CATALOG_BYTES_CHANGED');
  const stoppedPin = {containerId:api.id,imageId:api.image,restartPolicy:stop.originalRestartPolicy};
  const manifest = validateManifest(readPublic());
  const control = store.read(controlName);
  const generation = store.read('background-generation.json');
  const prior = preparation.originalBackground.participant;
  const {hostSurface,ingressScope} = preparation;
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
    if(!same(store.read(marker),pending)||!same(store.read(controlName),control)||!same(readPublic(),manifest)||
        !same(store.read('background-generation.json'),generation)||!same(store.read('floor.json'),preparation.floor)||
        !same(store.read('active.json'),preparation.active)||getHead()!==preparation.rootHeadSha||
        !same(store.exists(fencedStartKey)?store.read(fencedStartKey):null,started))fail('ORIGINAL_PHASE_FENCE_OR_PINS_CHANGED');
    if(await observeFences({owner,recoveryOwner,context,preparation,installed,manifest})!==installed.identitySha256)fail('NATIVE_INGRESS_IDENTITY_CHANGED');
    return admit();
  };
  const inspectHost = (running,requireOriginalFencedBoot=false) => {
    if(!same(captureRuntime(docker),preparation.active.active))fail('ORIGINAL_RUNTIME_IMAGES_CHANGED');
    for(const pin of [web,db]){
      const current = inspect(pin.id);
      if(current.id!==pin.id||current.imageId!==pin.image||current.restarts!==pin.restartCount||
          current.state.StartedAt!==pin.startedAt||current.state.Running!==true||current.state.Health?.Status!=='healthy'){
        fail('ORIGINAL_WEB_OR_DATABASE_CHANGED');
      }
    }
    const current = inspect(api.id);
    const [endpoint,...extra] = Object.values(current.networks??{});
    if(current.id!==api.id||current.name!=='/phoenix-v3-api'||current.imageId!==api.image||current.restarts!==api.restartCount||
        current.labels?.['com.docker.compose.project']!==preparation.floor.project||current.labels?.['com.docker.compose.service']!=='api'||
        current.state.OOMKilled!==false||current.state.Dead!==false||current.state.Restarting!==false||current.state.Paused!==false||
        current.state.Running!==running||!same(current.restartPolicy,noRestart)||!endpoint||extra.length)fail('ORIGINAL_API_IDENTITY_CHANGED');
    if(running){
      const startedAt = Date.parse(current.state.StartedAt);
      const anchor = fencedStart?.startedAt??api.startedAt;
      if(current.state.Status!=='running'||current.state.Health?.Status!=='healthy'||current.state.Pid<2||
          (requireOriginalFencedBoot?current.state.StartedAt!==anchor:!(startedAt>Date.parse(anchor)))||
          endpoint.NetworkID!==ingressScope.networkId||
          endpoint.IPAddress!==hostSurface.runtimeAddress||endpoint.GlobalIPv6Address!=='')fail('RECOVERED_API_RUNTIME_NOT_READY');
    } else if(current.state.Status!=='exited'||current.state.StartedAt!==(fencedStart?.startedAt??api.startedAt)||current.state.ExitCode!==0||
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
    return current.state.StartedAt;
  };

  await check();
  const directory = runtime.createDirectory(recoveryOwner,'recovery');
  const client = dependencies.client??new ModernSchemaReadClient({databaseContainer:db.id});
  let stage = 'READY', baseline = null;
  const verifyRuntime = (startedAt, expectedFencedBoot=false) => {
    const actual = (dependencies.inspectParticipant??inspectApiParticipant)(prior,preparation.floor.project,docker);
    const participant = {...prior,bootId:actual.status?.bootId};
    validateParticipants([participant],{targetSha:context.runtimeSha});
    const status = verifyParticipantStatus(actual,participant,manifest);
    const matchesExpectedBoot = expectedFencedBoot
      ? same(participant,fencedStart.participant)&&same(status.controlSession,fencedStart.controlSession)
      : participant.bootId!==fencedStart?.participant.bootId;
    if(!matchesExpectedBoot||participant.bootId===prior.bootId||actual.imageId!==api.image||actual.startedAt!==startedAt||
        actual.restartCount!==api.restartCount||status.inFlight!==0||status.taskGraphs!==0||status.pendingChildren!==0){
      fail('ORIGINAL_API_QUIESCENT_NEW_BOOT_REQUIRED');
    }
    const probe = JSON.parse(docker(['exec',api.id,'/usr/bin/env','-i','PATH=/usr/local/bin:/usr/bin:/bin','/usr/local/bin/node','-e',API_READINESS_PROGRAM]));
    if(probe.status!==200||probe.ready!==true||probe.dbConnected!==true||!isHash(probe.bodySha256))fail('ORIGINAL_API_READY_PROBE_REQUIRED');
    return {participant,controlSession:status.controlSession,readiness:probe};
  };
  const observeNative = async (running,verifiedApi) => {
    const {rows:[old]} = await client.query(modernSchemaOriginalSessionExitSql(pending.lease));
    if(!provesOldAbsent(old))fail('ORIGINAL_SESSION_REAPPEARED_OR_PRIMARY_CHANGED');
    const {rows:[{jsonb_build_object:holders}]} = await client.query(MODERN_SCHEMA_LEASE_SQL);
    if(!same(parseModernSchemaLease(JSON.parse(holders)),recoveryLease))fail('NEW_RECOVERY_LEASE_NOT_OBSERVED');
    const controlSession = verifiedApi?.controlSession;
    const applicationName = verifiedApi?`phoenix-fence:${verifiedApi.participant.bootId}`:null;
    for(let attempt=0;attempt<3;attempt++){
      const {rows:[{observation:raw}]} = await client.query(MODERN_SCHEMA_EXECUTOR_SQL);
      const observed = JSON.parse(raw);
      // This classifier slot names the current lock owner. The original lease
      // is bound separately to the failed release and checked for absence.
      const executors = classifyModernSchemaDatabaseExecutors(observed,{runtimeAddress:hostSurface.runtimeAddress,
        originalLease:recoveryLease,oldRuntimeStopped:!running});
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
    if(ledger.sha256!==context.beforeLedgerSha256||!same(ledger.ledger,hold.nativeLedger.ledger))fail('NATIVE_LEDGER_CHANGED');
    const facts = await (dependencies.captureFacts??captureModernSchemaFacts)(client);
    const off = (dependencies.verifyDefaultOff??defaultOffEvidenceFromFacts)(context.runtimeSha,facts,{stage:'BEFORE_SCHEMA',floor:preparation.floor});
    if(off.verified!==true||facts.schema!=='phoenix.modern-schema-database-facts/v1'||facts.readOnly!==true||
        facts.releaseAuthorized!==false||!isHash(facts.allDataSha256)||!isHash(facts.businessDataSha256)||
        !same(facts.database,{name:recoveryLease.database.name,systemIdentifier:recoveryLease.database.systemIdentifier})){
      fail('NEW_NATIVE_DATABASE_FACTS_REQUIRED');
    }
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
    if(first&&(!same(first.participant,last.participant)||!same(first.controlSession,last.controlSession))){
      fail('RECOVERED_API_BOOT_CHANGED_DURING_CHECKPOINT');
    }
    return {startedAt,ledgerSha256:ledger.sha256,catalogSha256:schema.receipt.schemaSha256,
      catalogReceiptSha256:canonicalDigest(schema.receipt),factsSha256:canonicalDigest(facts),
      allDataSha256:facts.allDataSha256,businessDataSha256:facts.businessDataSha256,executors,...last};
  };
  try{await client.start();}catch(error){try{await client.close();}catch{}throw error;}
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
      if(stage!==(fencedStart?'FENCED_BOOT_VERIFIED':'READY'))fail('SINGLE_STOPPED_CHECKPOINT_REQUIRED');
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
    async close(){
      if(stage.startsWith('CAPTURING_'))fail('CHECKPOINT_IN_PROGRESS');
      stage='CLOSED';
      await client.close();
    },
  };
}
