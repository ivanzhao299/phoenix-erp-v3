/** The original supervisor can restore its exact stopped R before any DDL
 * intent. A lost lease or a possible DDL result always requires separate
 * reconciliation. This path never promotes T or restores database data. */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {CONTRACT,git} from './production-config-guard.mjs';
import {executionEnv,captureRuntime} from './capture-production-runtime.mjs';
import {atomicState} from './production-atomic-state.mjs';
import {assertRegularFile,assertSameDirectory} from './production-trusted-paths.mjs';
import {assertNoCutoverControlState,assertSameBinding,atomicPublicManifest,PUBLIC_DIRECTORY,readPublicManifest,validateBinding,validateManifest,validateParticipants} from './background-control-manifest.mjs';
import {inspectApiParticipant,verifyParticipantStatus} from './background-control-coordinator.mjs';
import {canonicalDigest,HASH,same} from './production-maintenance-receipts.mjs';
import {LEDGER_SQL,digest} from './chanjet-admission-schema-receipt.mjs';
import {ModernSchemaRegistry,validateModernSchemaPreparation} from './production-modern-schema-registration.mjs';
import {readRegisteredModernSchemaApproval,validateModernSchemaContext} from './production-modern-schema-authority.mjs';
import {modernSchemaReleaseBinding,validateModernSchemaPending} from './production-modern-schema-state.mjs';
import {assertModernSchemaLeaseStillOriginal,assertOriginalModernSchemaProcess} from './production-modern-schema-session-lease.mjs';
import {observeOriginalModernSchemaRuntime,originalStopExitIsProved,protectedStalledShutdownMatches} from './production-modern-schema-stop.mjs';
import {classifyModernSchemaDatabaseExecutors,inspectModernSchemaContainer,MODERN_SCHEMA_EXECUTOR_SQL} from './production-modern-schema-executors.mjs';
import {captureModernSchemaFacts,defaultOffEvidenceFromFacts} from './production-modern-schema-facts.mjs';
import {captureModernSchemaCatalog} from './production-modern-schema-catalog.mjs';
import {API_READINESS_PROGRAM} from './production-maintenance-candidate-health.mjs';
import {confirmModernSchemaPublicDurability,modernSchemaOriginalSessionExitSql} from './production-modern-schema-completion.mjs';
import {captureModernSchemaLedger} from './production-modern-schema-schema-result.mjs';
import {observeIngressAbsent} from './production-modern-schema-terminal.mjs';

const fail = code => { throw Error('MODERN_SCHEMA_RECOVERY_HOLD=' + code); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sleep = delay => new Promise(resolve => setTimeout(resolve,delay));
const markerName = 'schema-release-pending.json';
const controlName = 'background-control.json';
const safePhases = ['R_STOPPED','FRESH_RECHECKED','BACKUP_VERIFIED'];
function docker(args) {
  try {
    return execFileSync('/usr/bin/docker',args,{env:executionEnv(),encoding:'utf8',timeout:5000,
      maxBuffer:2*1024*1024,stdio:['ignore','pipe','pipe']}).trim();
  } catch {
    fail('NATIVE_DOCKER_OBSERVATION_UNAVAILABLE');
  }
}

/** Read-only classification of an actual public OPEN against its prior root
 * commit intent. Failure to observe a match carries no recovery authority. */
export function observeCommittedModernSchemaRecoveryOpen(input,deps={}) {
  const context=validateModernSchemaContext(input),contextDigest=canonicalDigest(context);
  const store=deps.store??new ModernSchemaRegistry(),readPublic=deps.readPublic??readPublicManifest;
  const key=suffix=>'schema-release-'+suffix+'-'+context.owner+'.json';
  const name=key('original-recovery-open-commit-intent');
  store.guard();
  const manifest=readPublic();
  if(!manifest||manifest.phase!=='OPEN'||manifest.owner!==context.owner||manifest.targetSha!==context.runtimeSha)return null;
  if(!store.exists(name))return null;
  const intent=store.read(name);
  validateManifest(manifest);
  const control=store.read(controlName),proof=store.read(key('original-recovery-verified')),ingress=store.read(key('ingress-released'));
  if(intent.schema!=='phoenix.modern-schema-recovery-open-commit-intent/v1'||intent.owner!==context.owner||
      intent.contextDigest!==contextDigest||intent.recoveredSha!==context.runtimeSha||intent.attemptedTargetSha!==context.targetSha||
      !HASH.test(intent.pendingStateDigest??'')||intent.leaseSha256!==canonicalDigest(proof.originalLease)||
      intent.recoveryProofSha256!==canonicalDigest(proof)||intent.ingressReceiptSha256!==canonicalDigest(ingress)||
      intent.ordinaryControlSha256!==canonicalDigest(control)||!same(intent.publicManifest,manifest)||
      control.protocolVersion!==1||control.phase!=='OPEN'||control.owner!==context.owner||control.targetSha!==context.runtimeSha||
      control.generation!==manifest.generation||control.manifestDigest!==hash(JSON.stringify(manifest))||
      store.read('background-generation.json').generation!==manifest.generation||
      proof.schema!=='phoenix.modern-schema-original-recovery-proof/v1'||proof.owner!==context.owner||proof.contextDigest!==contextDigest||
      proof.targetSha!==context.runtimeSha||proof.attemptedTargetSha!==context.targetSha||
      proof.outcome!=='ABORTED_BEFORE_DDL_ORIGINAL_R_RECOVERED'||proof.formalTargetSuccess!==false||proof.schemaChanged!==false||
      ingress.schema!=='phoenix.modern-schema-ingress-released/v1'||ingress.owner!==context.owner||
      ingress.outcome!=='EXACT_OWNED_TABLES_ABSENT'||ingress.contextDigest!==contextDigest)fail('RECOVERY_OPEN_COMMIT_UNPROVED');
  store.guard();
  return {schema:'phoenix.modern-schema-recovery-open-committed/v1',owner:context.owner,contextDigest,recoveredSha:context.runtimeSha,
    attemptedTargetSha:context.targetSha,commitIntentSha256:canonicalDigest(intent),publicManifestSha256:canonicalDigest(manifest),
    generation:manifest.generation,backgroundAdmissionCommitted:true,formalTargetSuccess:false,readOnly:true,releaseAuthorized:false};
}

export async function recoverModernSchemaBeforeDdl({
  context:input,preparationSha256,state,rootLease,session,coordinator,ingress,privateRuntime,
  originalSnapshot,originalRestartPolicy,beforeFacts,beforeLedger,beforeCatalog,client,ownedReadSessions=[],admit,onPublicCommit,
},deps={}) {
  const context=validateModernSchemaContext(input),binding=modernSchemaReleaseBinding(context,preparationSha256);
  const contextDigest=binding.schemaRelease.contextDigest;
  const store=deps.store??new ModernSchemaRegistry(),now=deps.now??Date.now,readDocker=deps.docker??docker;
  const authority=deps.authority??(()=>readRegisteredModernSchemaApproval(context));
  const checkProcess=deps.checkProcess??assertOriginalModernSchemaProcess;
  const checkLease=deps.checkLease??assertModernSchemaLeaseStillOriginal;
  const observeRuntime=deps.observeRuntime??(id=>inspectModernSchemaContainer(id,(_binary,args)=>readDocker(args)));
  const readPublic=deps.readPublic??readPublicManifest;
  const writePublic=deps.writePublic??(value=>atomicPublicManifest(PUBLIC_DIRECTORY,value));
  const write=deps.atomicWrite??((name,value)=>atomicState(store.file(name),value));
  const readHead=deps.readHead??(()=>git(CONTRACT.repository,['rev-parse','HEAD']));
  const readApi=deps.inspectApi??((participant,project)=>inspectApiParticipant(participant,project,readDocker));
  const inventoryApi=deps.inventoryApi??(project=>{
    if(!/^phoenix[a-z0-9_-]*$/.test(project??''))fail('ORIGINAL_PROJECT_UNVERIFIED');
    const ids=readDocker(['ps','--no-trunc','-q','--filter','label=com.docker.compose.project='+project,
      '--filter','label=com.docker.compose.service=api']).split('\n').filter(Boolean);
    if(ids.some(id=>!HASH.test(id))||new Set(ids).size!==ids.length)fail('API_INVENTORY_UNVERIFIED');
    return ids;
  });
  const captureFacts=deps.captureFacts??captureModernSchemaFacts;
  const captureCatalog=deps.captureCatalog??captureModernSchemaCatalog;
  if(typeof admit!=='function'||typeof client?.query!=='function'||typeof ingress?.releaseRecoveredOriginal!=='function'||
      typeof state?.ddlIntentExists!=='function'||coordinator?.session!==session||!rootLease)fail('ORIGINAL_RECOVERY_SUPERVISOR_REQUIRED');
  const key=suffix=>'schema-release-'+suffix+'-'+context.owner+'.json';
  const readPending=()=>{
    store.guard();
    const pending=validateModernSchemaPending(state.read(),binding);
    if(!safePhases.includes(pending.phase)||pending.supervisor.pid!==process.pid||!same(pending.lease,rootLease)||
        checkProcess(pending.supervisor)!==true||checkLease(rootLease)!==true||!session.connected()||
        state.ddlIntentExists()||store.exists(key('schema-receipt'))||store.exists('transaction.json')||
        store.exists('policy-transition.json')||store.exists('cutover-pending.json')||
        now()<Date.parse(context.window.start)||now()>=Date.parse(context.window.end))fail('NO_DDL_AND_ORIGINAL_LEASE_REQUIRED');
    return pending;
  };
  const pending=readPending(),file=store.file(markerName),dirPin=store.inspect(store.directory);
  const markerPin=()=>{
    const stat=store.io.lstatSync(file);assertRegularFile(stat,{uid:store.uid});
    return [stat.dev,stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs];
  };
  const initialPin=markerPin();
  const original=()=>same(readPending(),pending)&&same(markerPin(),initialPin)&&same(store.read(markerName),pending);
  const verify=async stage=>{
    if(!original()||await admit(stage)!==true||!original())fail('ORIGINAL_RECOVERY_AUTHORITY_LOST');
    const approved=authority();
    if(approved?.contextDigest!==contextDigest||!HASH.test(approved.approvalSha256??''))fail('ORIGINAL_REGISTRATION_REQUIRED');
    return approved.approvalSha256;
  };

  const approvalSha256=await verify('RECOVERY_VERIFY_STOPPED_ORIGINAL');
  const preparation=store.read(key('preparation'));
  const approved=(deps.validatePreparation??validateModernSchemaPreparation)(preparation,now());
  if(approved.preparationSha256!==preparationSha256||!same(approved.context,context)||
      canonicalDigest(originalSnapshot.containers)!==context.runtimeSnapshotSha256||!same(preparation.originalSnapshot,originalSnapshot))fail('EXACT_PREPARED_ORIGINAL_REQUIRED');
  const {api,web,db}=originalSnapshot.containers, prior=preparation.originalBackground.participant;
  const restart=originalRestartPolicy?.Name;
  if(!['no','always','unless-stopped'].includes(restart)||originalRestartPolicy.MaximumRetryCount!==0)fail('EXACT_ORIGINAL_RESTART_POLICY_REQUIRED');
  const stopStep=store.read('schema-release-step-'+context.owner+'-4-r-stopped.json');
  assertSameBinding(stopStep,binding);
  const stopProof=stopStep.payload?.evidence,stop=stopProof?.runtimeStopReceipt;
  if(stopStep.sequence!==4||stopStep.to!=='R_STOPPED'||stopStep.payload?.schema!=='phoenix.modern-schema-step-evidence/v1'||
      stopStep.payload.kind!=='R_STOPPED'||stopStep.payload.contextDigest!==contextDigest||
      !stop||canonicalDigest(stopProof)!==stopStep.payload.evidenceSha256||!same(stop.originalRestartPolicy,originalRestartPolicy)||
      stop.schema!=='phoenix.modern-schema-original-runtime-stopped/v1'||stop.signal!=='TERM'||!originalStopExitIsProved(stop,context)||stop.pid!==0||
      stop.oomKilled!==false||stop.automaticKill!==false||stop.oldDatabaseSessionsGone!==true||!protectedStalledShutdownMatches(stop,context,rootLease)||
      stop.containerId!==api.id||stop.imageId!==api.image||stop.startedAt!==api.startedAt||stop.restartCount!==api.restartCount)fail('ORIGINAL_STOP_RECEIPT_REQUIRED');
  const protectedFacts=store.read(key('before-facts')),protectedSchema=store.read(key('before-schema')),protectedAudit=store.read(key('before-audit'));
  if(!same(beforeFacts,protectedFacts)||!same(beforeCatalog?.receipt??beforeCatalog,protectedSchema)||
      protectedFacts.schema!=='phoenix.modern-schema-database-facts/v1'||!HASH.test(protectedFacts.allDataSha256??'')||
      !HASH.test(protectedFacts.businessDataSha256??'')||protectedSchema.schema!=='phoenix.modern-schema-catalog-facts/v1'||
      protectedSchema.stage!=='before'||protectedSchema.owner!==context.owner||protectedSchema.readOnly!==true||
      !same(protectedSchema.databasePin,db)||!HASH.test(protectedSchema.schemaSha256??'')||
      typeof protectedAudit.originalAudit!=='string'||protectedAudit.evidence?.schema!=='phoenix.legacy-egg-audit-evidence/v1'||
      protectedAudit.evidence.originalAuditSha256!==hash(protectedAudit.originalAudit)||protectedAudit.evidence.observedLedgerSha256!==context.beforeLedgerSha256||
      protectedAudit.evidence.originalConclusion!==context.originalConclusion||JSON.parse(protectedAudit.originalAudit).conclusion!==context.originalConclusion||
      (typeof beforeLedger==='string'?beforeLedger:digest(JSON.stringify(beforeLedger)))!==context.beforeLedgerSha256)fail('PROTECTED_PRE_DDL_FACTS_REQUIRED');

  const unchangedDeployment=()=>{
    if(!same(store.read('floor.json'),preparation.floor)||!same(store.read('active.json'),preparation.active)||
        readHead()!==preparation.rootHeadSha||!same(captureRuntime(readDocker),preparation.active.active))fail('ORIGINAL_DEPLOYMENT_STATE_CHANGED');
    for(const pin of [web,db]){
      const got=observeRuntime(pin.id);
      if(got.id!==pin.id||got.imageId!==pin.image||got.restarts!==pin.restartCount||got.state.StartedAt!==pin.startedAt||
          got.state.Running!==true||got.state.Health?.Status!=='healthy')fail('ORIGINAL_WEB_OR_DATABASE_RUNTIME_CHANGED');
    }
  };
  unchangedDeployment();
  const current=(deps.observeStopped??observeOriginalModernSchemaRuntime)(originalSnapshot,{run:readDocker});
  if(current.state.Running!==false||current.state.Status!=='exited'||current.state.ExitCode!==stop.exitCode||current.state.Pid!==0||
      current.restartPolicy?.Name!=='no'||readDocker(['image','inspect',api.image,'--format','{{ index .Config.Labels "org.opencontainers.image.revision" }}'])!==context.runtimeSha||
      inventoryApi(preparation.floor.project).length!==0)fail('EXACT_STOPPED_ORIGINAL_EXECUTOR_REQUIRED');
  const typed=store.read(controlName),fenced=validateManifest(readPublic());
  assertSameBinding(typed,binding);
  if(typed.phase!=='FENCED'||fenced.phase!=='FENCED'||typed.owner!==fenced.owner||fenced.targetSha!==context.targetSha||
      typed.generation!==fenced.generation||typed.manifestDigest!==hash(JSON.stringify(fenced))||!same(coordinator.manifest,fenced)||
      store.read('background-generation.json').generation!==fenced.generation)fail('ORIGINAL_FENCED_GENERATION_REQUIRED');

  const requireFixedAdmit=async stage=>{
    if(await verify(stage)!==approvalSha256)fail('ORIGINAL_REGISTRATION_CHANGED');
    return true;
  };
  const directory=privateRuntime.createDirectory(context.owner,'recovery');
  const actualData=async(running,stage)=>{
    await requireFixedAdmit(stage);
    const {rows:[{jsonb_build_object}]}=await client.query(LEDGER_SQL);
    if(digest(JSON.stringify(JSON.parse(jsonb_build_object)))!==context.beforeLedgerSha256)fail('ORIGINAL_LEDGER_CHANGED');
    const facts=await captureFacts(client,{projection:protectedFacts});
    if(facts.allDataSha256!==protectedFacts.allDataSha256||facts.businessDataSha256!==protectedFacts.businessDataSha256||
        !same(facts.database,protectedFacts.database)||facts.newTables.length!==0)fail('PRE_DDL_NATIVE_FACTS_CHANGED');
    const {rows:[{observation}]}=await client.query(MODERN_SCHEMA_EXECUTOR_SQL);
    const executors=classifyModernSchemaDatabaseExecutors(JSON.parse(observation),{runtimeAddress:preparation.hostSurface.runtimeAddress,
      originalLease:rootLease,oldRuntimeStopped:!running,ownedReadSessions});
    await requireFixedAdmit(stage);
    unchangedDeployment();
    return {factsSha256:canonicalDigest(facts),executors};
  };
  const catalog=async(stage,admissionStage)=>{
    const observed=await captureCatalog({owner:context.owner,stage,databasePin:db,privateRuntime,directory,
      admit:()=>requireFixedAdmit(admissionStage)});
    if(observed.receipt.schemaSha256!==protectedSchema.schemaSha256)fail('ORIGINAL_NATIVE_CATALOG_CHANGED');
    return canonicalDigest(observed.receipt);
  };
  await ingress.observe();
  const before=await actualData(false,'RECOVERY_PRE_RESTART');
  const firstCatalogSha256=await catalog('recovery-before','RECOVERY_PRE_RESTART');
  const intent={schema:'phoenix.modern-schema-original-recovery-intent/v1',owner:context.owner,contextDigest,preparationSha256,
    originalLease:rootLease,originalContainerId:api.id,originalImageId:api.image,originalRestartPolicy,
    pendingSha256:canonicalDigest(pending),originalLedgerSha256:context.beforeLedgerSha256,
    beforeFactsSha256:before.factsSha256,beforeCatalogSha256:firstCatalogSha256,automaticRetry:false};
  store.immutable(key('original-recovery-intent'),intent);
  await requireFixedAdmit('RECOVERY_START_ORIGINAL');
  await privateRuntime.run({binary:'/usr/bin/docker',args:['start',api.id],directory,stem:'original-r-start',timeoutMs:20000});
  await requireFixedAdmit('RECOVERY_AWAIT_ORIGINAL');
  const deadline=performance.now()+30000,ready=deps.sleep??sleep;
  let recoveredStart;
  for(;;){
    await requireFixedAdmit('RECOVERY_AWAIT_ORIGINAL');
    const actual=observeRuntime(api.id);
    const endpoint=Object.values(actual.networks??{});
    if(actual.id!==api.id||actual.imageId!==api.image||actual.name!=='/phoenix-v3-api'||actual.state.OOMKilled||
        actual.state.Restarting||actual.state.Paused||actual.restartPolicy?.Name!=='no'||actual.state.Running!==true||
        actual.state.StartedAt===api.startedAt||!Number.isFinite(Date.parse(actual.state.StartedAt))||
        endpoint.length!==1||endpoint[0].NetworkID!==preparation.hostSurface.ingressScope.networkId||
        endpoint[0].IPAddress!==preparation.hostSurface.runtimeAddress)fail('RECOVERED_ORIGINAL_RUNTIME_UNVERIFIED');
    recoveredStart??=actual.state.StartedAt;
    if(recoveredStart!==actual.state.StartedAt)fail('RECOVERED_RUNTIME_RESTARTED');
    if(actual.state.Health?.Status==='healthy')break;
    if(performance.now()>=deadline)fail('ORIGINAL_READY_TIMEOUT');
    await ready(200);
  }
  const first=readApi(prior,preparation.floor.project);
  const participant={...prior,bootId:first.status?.bootId};
  validateParticipants([participant],{targetSha:context.runtimeSha});
  if(participant.bootId===prior.bootId)fail('NEW_ORIGINAL_BOOT_REQUIRED');
  const verifyReady=(manifest,actual=readApi(participant,preparation.floor.project))=>{
    const status=verifyParticipantStatus(actual,participant,manifest);
    if(actual.imageId!==api.image||actual.startedAt!==recoveredStart||status.inFlight||status.taskGraphs||status.pendingChildren)fail('ORIGINAL_QUIESCENT_BOOT_CHANGED');
    const probe=JSON.parse(readDocker(['exec',api.id,'/usr/bin/env','-i','PATH=/usr/local/bin:/usr/bin:/bin','/usr/local/bin/node','-e',API_READINESS_PROGRAM]));
    if(probe.ready!==true||probe.dbConnected!==true||probe.status!==200)fail('ORIGINAL_READY_UNPROVED');
    return {...status.controlSession,bootId:participant.bootId};
  };
  verifyReady(fenced);
  await coordinator.verifyQuiescent([participant]);
  const after=await actualData(true,'RECOVERY_VERIFY_RESTORED_ORIGINAL');
  const afterCatalogSha256=await catalog('recovery-after','RECOVERY_VERIFY_RESTORED_ORIGINAL');
  if(before.factsSha256!==after.factsSha256)fail('RECOVERED_ORIGINAL_FACTS_CHANGED');

  await requireFixedAdmit('RECOVERY_RESTORE_RESTART_POLICY');
  if(restart!=='no'){
    await privateRuntime.run({binary:'/usr/bin/docker',args:['update','--restart='+restart,api.id],directory,stem:'restore-original-restart-policy',timeoutMs:10000});
  }
  if(!same(observeRuntime(api.id).restartPolicy,originalRestartPolicy))fail('RECOVERED_RESTART_POLICY_UNVERIFIED');

  const recovery={schema:'phoenix.modern-schema-original-recovery-proof/v1',owner:context.owner,targetSha:context.runtimeSha,attemptedTargetSha:context.targetSha,
    contextDigest,originalLease:rootLease,approvalSha256,originalRuntime:participant,startedAt:recoveredStart,originalRestartPolicy,
    intentSha256:canonicalDigest(intent),beforeCatalogSha256:firstCatalogSha256,afterCatalogSha256,
    databaseFactsSha256:after.factsSha256,outcome:'ABORTED_BEFORE_DDL_ORIGINAL_R_RECOVERED',formalTargetSuccess:false,
    schemaChanged:false,businessActivation:false,automaticRetry:false};
  store.immutable(key('original-recovery-verified'),recovery);

  const generation=fenced.generation+1;
  const manifest=validateManifest({protocolVersion:1,phase:'OPEN',owner:context.owner,generation,targetSha:context.runtimeSha,participants:[participant]});
  const baseline=preparation.originalBackground.record;
  const ordinary=validateBinding({...baseline,owner:context.owner,targetSha:context.runtimeSha,generation,phase:'OPEN',
    manifestDigest:hash(JSON.stringify(manifest)),updatedAt:new Date(now()).toISOString()});
  if(Object.hasOwn(ordinary,'purpose')||Object.hasOwn(ordinary,'schemaRelease')||Object.hasOwn(ordinary,'cutover')||Object.hasOwn(ordinary,'holdReason'))fail('ORIGINAL_ORDINARY_OPEN_REQUIRED');
  const verifyFenced=async stage=>{
    await requireFixedAdmit(stage);
    if(!same(store.read(controlName),typed)||!same(readPublic(),fenced)||store.read('background-generation.json').generation!==fenced.generation||
        await session.verifyParticipants([verifyReady(fenced)])!==true)fail('ORIGINAL_FENCE_CHANGED');
    return requireFixedAdmit(stage);
  };
  await coordinator.verifyQuiescent([participant]);
  await verifyFenced('RECOVERY_RELEASE_INGRESS_WHILE_FENCED');
  const ingressReceipt=await ingress.releaseRecoveredOriginal(()=>verifyFenced('RECOVERY_RELEASE_INGRESS_WHILE_FENCED'));
  const verifyIngressReleased=()=>{
    if(ingressReceipt?.schema!=='phoenix.modern-schema-ingress-released/v1'||ingressReceipt.owner!==context.owner||
        ingressReceipt.contextDigest!==contextDigest||ingressReceipt.outcome!=='EXACT_OWNED_TABLES_ABSENT'||ingressReceipt.automaticRetry!==false||
        ingress.state!=='RELEASED'||ingress.names().length!==0||!same(store.read(key('ingress-released')),ingressReceipt))fail('ORIGINAL_NATIVE_INGRESS_RELEASE_UNVERIFIED');
  };
  verifyIngressReleased();
  await verifyFenced('RECOVERY_PUBLISH_ORIGINAL_OPEN');
  const commitIntent={schema:'phoenix.modern-schema-recovery-open-commit-intent/v1',owner:context.owner,contextDigest,
    recoveredSha:context.runtimeSha,attemptedTargetSha:context.targetSha,pendingStateDigest:pending.stateDigest,
    leaseSha256:canonicalDigest(rootLease),recoveryProofSha256:canonicalDigest(recovery),ingressReceiptSha256:canonicalDigest(ingressReceipt),
    fencedManifestSha256:canonicalDigest(fenced),ordinaryControlSha256:canonicalDigest(ordinary),publicManifest:manifest};
  const intentName=key('original-recovery-open-commit-intent');
  store.immutable(intentName,commitIntent);
  await verifyFenced('RECOVERY_PUBLISH_ORIGINAL_OPEN');
  verifyIngressReleased();verifyReady(fenced);unchangedDeployment();
  if(!original()||!same(store.read(intentName),commitIntent))fail('RECOVERY_OPEN_COMMIT_INTENT_CHANGED');
  write(controlName,ordinary);
  write('background-generation.json',{schema:'phoenix.background-generation/1',generation,updatedAt:new Date(now()).toISOString()});
  if(!original()||!same(readPublic(),fenced)||!same(store.read(controlName),ordinary))fail('RECOVERY_OPEN_COMMIT_INTENT_CHANGED');

  // Public OPEN is the background admission commit. If its response is lost,
  // the exact protected intent/readback decides whether cleanup must continue.
  let writeError;
  try {writePublic(manifest);}catch(error){writeError=error;}
  const observeCommit=()=>observeCommittedModernSchemaRecoveryOpen(context,{store,readPublic});
  const committed=observeCommit();
  if(!committed){if(writeError)throw writeError;fail('RECOVERY_PUBLIC_OPEN_COMMIT_MISSING');}
  if(writeError){
    const sync=deps.syncPublicDirectory??(()=>{
      const fd=fs.openSync(PUBLIC_DIRECTORY,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
      try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    });
    sync();
    if(!same(observeCommit(),committed))fail('RECOVERY_OPEN_COMMIT_DURABILITY_UNVERIFIED');
  }
  if(typeof onPublicCommit==='function')onPublicCommit(committed);
  const verifyOpen=async()=>{
    await requireFixedAdmit('RECOVERY_VERIFY_ORIGINAL_OPEN');
    if(!same(observeCommit(),committed)||await session.verifyParticipants([verifyReady(manifest)])!==true)fail('RECOVERED_PUBLIC_OPEN_UNVERIFIED');
    return requireFixedAdmit('RECOVERY_VERIFY_ORIGINAL_OPEN');
  };
  const openDeadline=performance.now()+8000;
  for(;;){
    await requireFixedAdmit('RECOVERY_AWAIT_ORIGINAL_OPEN');
    const actual=readApi(participant,preparation.floor.project),status=verifyParticipantStatus(actual,participant);
    if(status.owner===manifest.owner&&status.generation===manifest.generation&&status.phase==='OPEN')break;
    if(status.owner!==fenced.owner||status.generation!==fenced.generation||status.phase!=='FENCED'||performance.now()>=openDeadline)fail('RECOVERED_OPEN_NOT_OBSERVED');
    await ready(150);
  }
  await verifyOpen();
  const archive={...recovery,schema:'phoenix.modern-schema-before-ddl-recovery-archive/v1',
    oldTypedControl:typed,pending,ordinaryControl:ordinary,publicManifest:manifest,ingressReceipt,committed};
  store.immutable(key('original-recovery-archive'),archive);
  await requireFixedAdmit('RECOVERY_CLEAR_PENDING');
  if(!same(store.read(controlName),ordinary)||!same(readPublic(),manifest)||store.read('background-generation.json').generation!==generation||
      ingress.state!=='RELEASED'||ingress.names().length!==0||!same(store.read(key('ingress-released')),ingressReceipt))fail('RECOVERY_TERMINAL_NATIVE_STATE_CHANGED');
  verifyReady(manifest);
  if(!original()||!same(store.read(key('original-recovery-archive')),archive))fail('RECOVERY_PENDING_CHANGED');
  // S is still the original held session here. Only the forward finalizer may
  // remove pending after another read-only backend proves that S disappeared.
  return {...recovery,committed,archiveSha256:canonicalDigest(archive),pendingMarkerCleared:false,forwardFinalizationRequired:true};
}

/** Complete the original-runtime recovery after its durable public admission.
 * This path only archives the existing recovery and clears its own marker. */
export async function finalizeCommittedModernSchemaRecoveredOriginal({context:input,preparationSha256,client},deps={}){
  const context=validateModernSchemaContext(input),binding=modernSchemaReleaseBinding(context,preparationSha256);
  const {contextDigest}=binding.schemaRelease,store=deps.store??new ModernSchemaRegistry(),readPublic=deps.readPublic??readPublicManifest;
  const key=suffix=>'schema-release-'+suffix+'-'+context.owner+'.json';
  const forwardName=key('original-recovery-forward-archive');
  const readDocker=deps.docker??docker,observeRuntime=deps.observeRuntime??(id=>inspectModernSchemaContainer(id,(_binary,args)=>readDocker(args)));
  const readApi=deps.inspectApi??((participant,project)=>inspectApiParticipant(participant,project,readDocker));
  const confirmDurability=deps.confirmDurability??confirmModernSchemaPublicDurability;
  const ingressAbsent=deps.ingressAbsent??observeIngressAbsent;
  const exclusions=['transaction.json','policy-transition.json','cutover-pending.json',key('schema-receipt'),
    key('open-commit-intent'),'schema-release-step-'+context.owner+'-7-ddl-started.json', 'deploy-'+context.owner+'.json'];
  const guard=()=>{
    store.guard();
    if(exclusions.some(name=>store.exists(name)))fail('RECOVERY_FORWARD_DDL_OR_DEPLOYMENT_PRESENT');
  };
  guard();
  const directory=store.inspect(store.directory),marker=store.file(markerName);
  const current=store.exists(markerName)?store.read(markerName):null;
  const previous=store.exists(forwardName)?store.read(forwardName):null;
  const originalArchive=store.exists(key('original-recovery-archive'))?store.read(key('original-recovery-archive')):null;
  const pending=validateModernSchemaPending(current??previous?.pending??originalArchive?.pending,binding);
  const statPin=()=>{
    const stat=store.io.lstatSync(marker);assertRegularFile(stat,{uid:store.uid});
    return [stat.dev,stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs];
  };
  const pin=current?statPin():null;
  const exactPending=()=>{
    if(pin? !same(pin,statPin())||!same(store.read(markerName),pending) : store.exists(markerName))fail('RECOVERY_FORWARD_PENDING_CHANGED');
  };
  const intent=store.read(key('original-recovery-open-commit-intent')),recovery=store.read(key('original-recovery-verified'));
  const preparation=store.read(key('preparation')),approvalTime=Date.parse(pending.updatedAt);
  const approved=(deps.validatePreparation??validateModernSchemaPreparation)(preparation,approvalTime);
  const committed=observeCommittedModernSchemaRecoveryOpen(context,{store,readPublic});
  const manifest=intent.publicManifest,ordinary=store.read(controlName),released=store.read(key('ingress-released'));
  const before=store.read(key('before-facts')),beforeCatalog=store.read(key('before-schema'));
  const catalogBefore=store.read(key('recovery-before-schema')),catalogAfter=store.read(key('recovery-after-schema'));
  const source=store.read(key('original-recovery-intent'));
  const {api,web,db}=preparation.originalSnapshot.containers;
  if(!committed||!safePhases.includes(pending.phase)||intent.pendingStateDigest!==pending.stateDigest||
      !same(pending.lease,recovery.originalLease)||approved.preparationSha256!==preparationSha256||!same(approved.context,context)||
      canonicalDigest(preparation.originalSnapshot.containers)!==context.runtimeSnapshotSha256||manifest.participants.length!==1||
      !same(manifest.participants[0],recovery.originalRuntime)||recovery.originalRuntime.containerId!==api.id||
      recovery.schemaChanged!==false||recovery.businessActivation!==false||recovery.automaticRetry!==false||
      source.schema!=='phoenix.modern-schema-original-recovery-intent/v1'||canonicalDigest(source)!==recovery.intentSha256||
      source.preparationSha256!==preparationSha256||source.originalLedgerSha256!==context.beforeLedgerSha256||
      source.pendingSha256!==canonicalDigest(pending)||source.beforeFactsSha256!==recovery.databaseFactsSha256||
      canonicalDigest(before)!==recovery.databaseFactsSha256||
      canonicalDigest(catalogBefore)!==recovery.beforeCatalogSha256||canonicalDigest(catalogAfter)!==recovery.afterCatalogSha256||
      catalogBefore.schemaSha256!==beforeCatalog.schemaSha256||catalogAfter.schemaSha256!==beforeCatalog.schemaSha256||
      released.automaticRetry!==false)fail('RECOVERY_FORWARD_EVIDENCE_CHANGED');
  assertNoCutoverControlState(ordinary);
  const beforeOff=defaultOffEvidenceFromFacts(context.runtimeSha,before,{stage:'BEFORE_SCHEMA',floor:preparation.floor});
  const archive={schema:'phoenix.modern-schema-recovered-forward-archive/v1',owner:context.owner,contextDigest,
    recoveredSha:context.runtimeSha,attemptedTargetSha:context.targetSha,preparationSha256,pending,committed,
    ordinaryControlSha256:canonicalDigest(ordinary),originalLedgerSha256:context.beforeLedgerSha256,
    originalSessionSha256:canonicalDigest(pending.lease),defaultOff:true,formalTargetSuccess:false,automaticRetry:false};
  if(previous&&!same(previous,archive))fail('RECOVERY_FORWARD_ARCHIVE_CHANGED');
  if(originalArchive&&(!same(originalArchive.pending,pending)||!same(originalArchive.ordinaryControl,ordinary)||
      !same(originalArchive.publicManifest,manifest)||!same(originalArchive.committed,committed)))fail('RECOVERY_FORWARD_ORIGINAL_ARCHIVE_CHANGED');

  const exactCurrent=()=>{
    guard();exactPending();assertSameDirectory(directory,store.inspect(store.directory));
    if(!same(observeCommittedModernSchemaRecoveryOpen(context,{store,readPublic}),committed)||
      !same(store.read(key('original-recovery-open-commit-intent')),intent)||!same(store.read(key('original-recovery-verified')),recovery)||
      !same(store.read('floor.json'),preparation.floor)||!same(store.read('active.json'),preparation.active)||
      ingressAbsent(context,released)!==true)fail('RECOVERY_FORWARD_PROJECTION_CHANGED');
    return committed;
  };
  const verifyExactRuntime=()=>{
    exactCurrent();
    const participant=manifest.participants[0],actual=readApi(participant,preparation.floor.project);
    verifyParticipantStatus(actual,participant,manifest);
    const observed=observeRuntime(api.id);
    const ready=JSON.parse(readDocker(['exec',api.id,'/usr/bin/env','-i','PATH=/usr/local/bin:/usr/bin:/bin','/usr/local/bin/node','-e',API_READINESS_PROGRAM]));
    if(actual.imageId!==api.image||actual.startedAt!==recovery.startedAt||observed.state.Running!==true||observed.state.StartedAt!==recovery.startedAt||
      observed.restarts!==api.restartCount||!same(observed.restartPolicy,recovery.originalRestartPolicy)||
      ready.ready!==true||ready.dbConnected!==true||ready.status!==200)fail('RECOVERY_FORWARD_ORIGINAL_RUNTIME_CHANGED');
    for(const expected of [web,db]){
      const live=observeRuntime(expected.id);
      if(live.id!==expected.id||live.imageId!==expected.image||live.restarts!==expected.restartCount||
        live.state.StartedAt!==expected.startedAt||live.state.Running!==true||live.state.Health?.Status!=='healthy')fail('RECOVERY_FORWARD_PEER_CHANGED');
    }
  };
  const verifyNative=async()=>{
    verifyExactRuntime();
    const lease=pending.lease,{rows:[backend]}=await client.query(modernSchemaOriginalSessionExitSql(lease));
    if(backend?.primary!==true||backend.originalSessionPresent!==false||backend.databaseOid!==lease.database.databaseOid||
      backend.systemIdentifier!==lease.database.systemIdentifier||backend.postmasterStartMicros!==lease.database.postmasterStartMicros||
      (await captureModernSchemaLedger(client)).sha256!==context.beforeLedgerSha256)fail('RECOVERY_FORWARD_NATIVE_DATABASE_CHANGED');
    const {rows}=await client.query("SELECT to_regclass('public.' || name) IS NOT NULL AS present,name FROM unnest(ARRAY["+
      beforeOff.observedTables.map(row=>"'"+row.table+"'").join(',')+"]) AS name ORDER BY name");
    if(rows.length!==beforeOff.observedTables.length)fail('RECOVERY_FORWARD_OFF_UNOBSERVED');
    for(const expected of beforeOff.observedTables){
      const matches=rows.filter(row=>row.name===expected.table);
      const expectedPresent=expected.presence==='PRESENT_ZERO';
      if(matches.length!==1||matches[0].present!==expectedPresent)fail('RECOVERY_FORWARD_OFF_CHANGED');
      if(expectedPresent){
        const {rows:[{count}]}=await client.query('SELECT count(*)::text AS count FROM public."'+expected.table+'"');
        if(count!=='0')fail('RECOVERY_FORWARD_OFF_CHANGED');
      }
    }
    if(confirmDurability(exactCurrent,guard)?.durabilityConfirmed!==true)fail('RECOVERY_FORWARD_PUBLIC_NOT_DURABLE');
  };
  await verifyNative();
  if(!previous)store.immutable(forwardName,archive);
  const fd=store.io.openSync(store.directory,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
  let durable=false;
  try{
    const archiveFile=store.file(forwardName);
    const archiveFd=store.io.openSync(archiveFile,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    try{
      assertRegularFile(store.io.fstatSync(archiveFd),{uid:store.uid});
      if(!same(JSON.parse(store.io.readFileSync(archiveFd,'utf8')),archive))fail('RECOVERY_FORWARD_ARCHIVE_CHANGED');
      store.io.fsyncSync(archiveFd);
    }finally{store.io.closeSync(archiveFd);}
    store.io.fsyncSync(fd);
    verifyExactRuntime();
    if(!same(store.read(forwardName),archive))fail('RECOVERY_FORWARD_ARCHIVE_CHANGED');
    if(pin){
      store.io.unlinkSync(marker);
      try{store.io.fsyncSync(fd);}catch{
        guard();assertSameDirectory(directory,store.inspect(store.directory));
        if(!store.exists(markerName))store.immutable(markerName,pending);
        fail('RECOVERY_PENDING_DURABILITY_UNVERIFIED');
      }
    }
    durable=true;
  }finally{try{store.io.closeSync(fd);}catch(error){if(!durable)throw error;}}
  return {...committed,pendingMarkerCleared:true,defaultOff:true,archiveSha256:canonicalDigest(archive)};
}
