/** Correlate existing candidate/control identities. Read-only observations are
 * never a lease, continuous ingress proof, adoption authority or registry. */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {CONTRACT,verifyContext} from './production-config-guard.mjs';
import {executionEnv} from './capture-production-runtime.mjs';
import {RootControlLease} from './production-maintenance-root-lease.mjs';
import {collectCandidateDatabaseSnapshot} from './production-maintenance-candidate-database.mjs';
import {validateCandidateReplacement} from './production-maintenance-replacement.mjs';
import {MaintenanceReceiptStore,validateMaintenanceContext,validateMaintenanceEvidence,bindingDigest,canonicalDigest,same,HASH,iso} from './production-maintenance-receipts.mjs';
import {PUBLIC_DIRECTORY,HOLD_KINDS,inspectPublicDirectory,readPublicManifest,validateManifest} from './background-control-manifest.mjs';
import {readLegacyProjection,validateLegacyFencedProjection} from './production-maintenance-public-control.mjs';

const fail=code=>{throw Error('CANDIDATE_BINDING_HOLD='+code);};
// Fixed non-secret categories for private diagnostics. Public rejection remains
// generic; arbitrary exception messages, paths, stderr and causes are discarded.
const PRIVATE_DIAGNOSTICS = new Set([
  'ROOT_CONTROL_OPERATION_DEADLINE','ROOT_CONTROL_OPERATION_ABORTED','ROOT_CONTROL_WINDOW_EXPIRED',
  ...['DIGEST','STATE','TIME','UNIQUE_CHAIN','CHAIN_ORDER','PENDING','CHANGED'].map(v=>'CANDIDATE_PHASE_ANCHOR_'+v)
].map(v=>'MAINTENANCE_HOLD='+v));
export function candidateBindingDiagnosticCode(error) {
  return PRIVATE_DIAGNOSTICS.has(error?.diagnosticCode)?error.diagnosticCode:undefined;
}
function opaqueFailure(error) {
  const failure=Error('CANDIDATE_BINDING_HOLD=OBSERVATION_UNVERIFIED');
  if(PRIVATE_DIAGNOSTICS.has(error?.message))Object.defineProperty(failure,'diagnosticCode',{value:error.message});
  return failure;
}

const CONTROL='/run/phoenix-background-control';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const rawTime=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(v)&&iso(v.slice(0,23)+'Z');
const keys=(v,n)=>v&&Object.getPrototypeOf(v)===Object.prototype&&same(Object.keys(v).sort(),[...n].sort());
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
// Docker nil and empty optional lists both mean no added capability/device.
export const CANDIDATE_DOCKER_LIST_COUNTS = Object.freeze(['CapAdd', 'Devices', 'DeviceRequests']
  .map(field => `(len (or .HostConfig.${field} ""))`));
// Do not read Health.Log, environment, log driver config or arbitrary labels.
const DOCKER_FIELDS=['.Id','.Image','.State.StartedAt','.State.Running','.State.Health.Status','.State.Pid','.State.Status','.State.Restarting','.State.Dead','.RestartCount',
  '(index .Config.Labels "com.docker.compose.project")','(index .Config.Labels "com.docker.compose.service")','.Mounts','.HostConfig.Privileged','.HostConfig.PidMode','.HostConfig.IpcMode',
  '.HostConfig.UTSMode','.HostConfig.UsernsMode','.HostConfig.NetworkMode','.HostConfig.RestartPolicy.Name',...CANDIDATE_DOCKER_LIST_COUNTS,'.HostConfig.SecurityOpt'].map(field=>'{{json '+field+'}}').join('\t');
// Docker represents unconfigured optional lists as nil; Go len needs a non-nil fallback.
// Nonempty lists still report their actual length and are rejected below.
// Fixed localhost endpoint, no caller URL, headers, credential or script input.
const STATUS_PROGRAM="fetch('http://127.0.0.1:3100/api/internal/background/status',{signal:AbortSignal.timeout(3000),redirect:'error'}).then(async r=>{if(!r.ok)process.exit(2);const t=await r.text();if(Buffer.byteLength(t)>32768)process.exit(4);process.stdout.write(t)}).catch(()=>process.exit(3))";
function productionRun(args,input,{timeoutMs}){
  try{return execFileSync('/usr/bin/docker',args,{input,env:executionEnv(),encoding:'utf8',timeout:timeoutMs,maxBuffer:65536,stdio:['pipe','pipe','pipe']}).trim();}
  catch{fail('BOUNDED_DOCKER_OBSERVATION_FAILED');}
}
export function inspectCandidateStorage(tuple,{check,remaining},dependencies={}){
  // Same /data mount+sentinel contract as require-phoenix-data-mount.sh, with
  // canonical sources as well: a /data symlink must not expose host controls.
  try{
    const disk=dependencies.fs||fs,exec=dependencies.execFileSync||execFileSync;
    for(const source of ['/data',tuple.PHOENIX_PG_DATA_DIR,tuple.PHOENIX_UPLOADS_DIR]){
      check();const entry=disk.lstatSync(source);check();
      if(!entry.isDirectory()||entry.isSymbolicLink())fail('STORAGE_PATH_ALIAS');
      check();const canonical=disk.realpathSync(source);check();if(canonical!==source)fail('STORAGE_PATH_ALIAS');
      check();const target=exec('/usr/bin/findmnt',['-T',source,'-no','TARGET'],{env:executionEnv(),encoding:'utf8',timeout:Math.min(3000,remaining()),maxBuffer:4096,stdio:['ignore','pipe','pipe']}).trim();check();
      if(target!=='/data')fail('STORAGE_MOUNT_REQUIRED');
    }
    check();const sentinel=disk.lstatSync('/data/.phoenix-data-volume');check();
    if(!sentinel.isFile()||sentinel.isSymbolicLink())fail('STORAGE_SENTINEL_REQUIRED');
  }catch(error){if(/^CANDIDATE_BINDING_HOLD=/.test(error?.message||''))throw error;fail('STORAGE_MOUNT_REQUIRED');}
}
function validateMounts(mounts,host,approved){
  if(!Array.isArray(mounts)||mounts.length>64||!host||host.Privileged!==false||host.PidMode!==''||host.IpcMode!=='private'
    ||host.UTSMode!==''||host.UsernsMode!==''||typeof host.NetworkMode!=='string'||!host.NetworkMode||host.NetworkMode==='host'
    ||host.NetworkMode.startsWith('container:')||host.RestartPolicy?.Name!=='no'||host.capAddCount!==0||host.deviceCount!==0||host.deviceRequestCount!==0
    ||(host.SecurityOpt!==null&&(!Array.isArray(host.SecurityOpt)||host.SecurityOpt.some(v=>!['no-new-privileges','no-new-privileges:true'].includes(v)))))fail('NAMESPACE_OR_RESTART_SCOPE');
  if(mounts.length!==approved.length)fail('APPROVED_COMPLETE_MOUNT_INVENTORY');
  const relevant=[];
  for(const mount of mounts){
    const dest=mount?.Destination;
    if(typeof dest!=='string'||!path.posix.isAbsolute(dest)||path.posix.normalize(dest)!==dest)fail('MOUNT_PATH');
    const expected=approved.find(m=>m.destination===dest);
    if(!expected||mount.Type!=='bind'||mount.Source!==expected.source||mount.RW!==!expected.readOnly||mount.Propagation!=='rprivate')fail('APPROVED_COMPLETE_MOUNT_INVENTORY');
    if(dest===CONTROL||dest.startsWith(CONTROL+'/')||CONTROL.startsWith(dest==='/'?'/':dest+'/'))relevant.push(mount);
  }
  if(relevant.length!==1||relevant[0].Destination!==CONTROL||relevant[0].Type!=='bind'||relevant[0].Source!==PUBLIC_DIRECTORY
    ||relevant[0].RW!==false||relevant[0].Propagation!=='rprivate')fail('EXACT_UNSHADOWED_READONLY_MOUNT_REQUIRED');
  return {source:PUBLIC_DIRECTORY,destination:CONTROL,type:'bind',readOnly:true,propagation:'rprivate'};
}
function runtimeSnapshot(replacement,run,approvedMounts){
  let fields;try{fields=run(['inspect',replacement.candidate.id,'--format',DOCKER_FIELDS]).split('\t').map(JSON.parse);}catch(error){if(error?.message==='CANDIDATE_BINDING_HOLD=DEADLINE_OR_ABORT')throw error;fail('RUNTIME_READ');}
  if(fields.length!==24)fail('RUNTIME_FIELDS');
  const [id,imageId,StartedAt,Running,health,Pid,Status,Restarting,Dead,restartCount,project,service,mounts,Privileged,PidMode,IpcMode,UTSMode,UsernsMode,NetworkMode,restartPolicy,capAddCount,deviceCount,deviceRequestCount,SecurityOpt]=fields;
  const state={StartedAt,Running,Health:{Status:health},Pid,Status,Restarting,Dead},host={Privileged,PidMode,IpcMode,UTSMode,UsernsMode,NetworkMode,RestartPolicy:{Name:restartPolicy},capAddCount,deviceCount,deviceRequestCount,SecurityOpt},c=replacement.candidate;
  if(id!==c.id||imageId!==c.imageId||state?.StartedAt!==c.startedAt||restartCount!==c.restartCount||state.Running!==true||state.Health?.Status!=='healthy'
    ||state.Pid!==c.pid||state.Status!=='running'||state.Restarting!==false||state.Dead!==false
    ||project!==replacement.project||service!=='api')fail('EXACT_CANDIDATE_RUNTIME_REQUIRED');
  const revision=run(['image','inspect',imageId,'--format','{{ index .Config.Labels "org.opencontainers.image.revision" }}']);
  if(revision!==c.revision)fail('OCI_REVISION');
  return {api:{id,imageId,revision,startedAt:state.StartedAt,restartCount},pid:state.Pid,project:replacement.project,controlMount:validateMounts(mounts,host,approvedMounts)};
}
function statusSnapshot(id,manifest,run){
  let s;try{s=JSON.parse(run(['exec',id,'node','-e',STATUS_PROGRAM]));}catch(error){if(error?.message==='CANDIDATE_BINDING_HOLD=DEADLINE_OR_ABORT')throw error;fail('API_STATUS_READ');}
  const c=s?.controlSession;
  if(s?.protocolVersion!==1||!UUID.test(s.bootId||'')||s.phase!=='FENCED'||s.owner!==manifest.owner||s.generation!==manifest.generation
    ||s.poisoned!==false||s.stopping!==false||!['inFlight','pendingChildren','taskGraphs'].every(k=>s[k]===0)
    ||c?.connected!==true||c.broken!==false||!Number.isSafeInteger(c.sessionPid)||c.sessionPid<1||c.sessionPid>2147483647
    ||!Number.isSafeInteger(c.databaseOid)||c.databaseOid<1||c.databaseOid>4294967295||!rawTime(c.backendStartedAtUs)
    ||c.backendStartedAtUs.slice(0,23)+'Z'!==c.backendStartedAt||c.applicationName!==`phoenix-fence:${s.bootId}`)fail('API_CONTROL_IDENTITY_OR_BACKGROUND_STATE');
  const cleanup=c.cleanup;
  // The one expected live control resource is debt until retirement. It is not
  // unsettled business work. Requiring debt=false would reject every live lease.
  if(!keys(cleanup,['acquirePending','queriesPending','retirementPending','terminationConfirmed','releaseConfirmed','debt'])
    ||cleanup.acquirePending!==false||cleanup.queriesPending!==0||cleanup.retirementPending!==false
    ||cleanup.terminationConfirmed!==false||cleanup.releaseConfirmed!==false||cleanup.debt!==true)fail('UNSETTLED_OR_INVALID_CONTROL_RESOURCE');
  return {protocolVersion:1,bootId:s.bootId,phase:s.phase,owner:s.owner,generation:s.generation,inFlight:0,pendingChildren:0,taskGraphs:0,
    poisoned:false,stopping:false,controlSession:{connected:true,broken:false,sessionPid:c.sessionPid,databaseOid:c.databaseOid,
      backendStartedAt:c.backendStartedAt,backendStartedAtUs:c.backendStartedAtUs,applicationName:c.applicationName,cleanup:structuredClone(cleanup)}};
}
function validateProjection(value,mode,context,stateDigest,bootId){
  if(!keys(value,['bootstrap','modern','manifest']))fail('PROJECTION_FIELDS');
  const {bootstrap,modern,manifest}=value;
  if(!keys(bootstrap,['schema','contextDigest','owner','previousFloorSha','targetSha','stateDigest','phase','manifestDigest','generation','capturedAt'])
    ||bootstrap.schema!=='phoenix.legacy-public-control/v1'||bootstrap.contextDigest!==bindingDigest(context)||bootstrap.owner!==context.owner
    ||bootstrap.previousFloorSha!==context.previousFloorSha||bootstrap.targetSha!==context.targetSha||!HASH.test(bootstrap.stateDigest||'')
    ||bootstrap.phase!=='PUBLISHING_LEGACY_FENCE'||bootstrap.generation!==1||!HASH.test(bootstrap.manifestDigest||'')||!iso(bootstrap.capturedAt))fail('PRIVATE_BOOTSTRAP_BINDING');
  if(mode==='PRE_ADOPTION'){
    validateLegacyFencedProjection(manifest);
    if(modern!==null||bootstrap.manifestDigest!==digest(manifest))fail('PRE_ADOPTION_PROJECTION');
  }else{
    validateManifest(manifest);
    if(!keys(modern,['protocolVersion','owner','previousFloorSha','targetSha','generation','phase','manifestDigest','maintenanceContextDigest','maintenanceStateDigest','adoptionEvidenceSha256','updatedAt'])
      ||modern.protocolVersion!==1||modern.owner!==context.owner||modern.previousFloorSha!==context.previousFloorSha||modern.targetSha!==context.targetSha
      ||modern.generation!==2||modern.phase!=='FENCED'||modern.manifestDigest!==digest(manifest)||modern.maintenanceContextDigest!==bindingDigest(context)
      ||modern.maintenanceStateDigest!==stateDigest||!HASH.test(modern.adoptionEvidenceSha256||'')||!iso(modern.updatedAt)
      ||manifest.generation!==2||manifest.phase!=='FENCED'||manifest.participants.length!==1)fail('ADOPTED_PRIVATE_BINDING');
    const p=manifest.participants[0];
    if(bootId&&(p.bootId!==bootId))fail('ADOPTED_BOOT_BINDING');
    if(p.revision!==context.targetSha||!same([...p.allowedKinds].sort(),[...HOLD_KINDS].sort()))fail('HOLD_PARTICIPANT_SCOPE');
  }
  if(manifest.owner!==context.owner||manifest.targetSha!==context.targetSha)fail('PUBLIC_OWNER_OR_TARGET');
  return structuredClone(value);
}

/** Caller owns/supervises the existing root lease and all outer read work. This
 * function never acquires/closes a lease, writes state, signs evidence or opens
 * ingress. Synchronous filesystem I/O still requires outer process supervision. */
async function collectCandidateBinding({context,expectedStateDigest,replacementEvidence,rootLease,mode='PRE_ADOPTION',signal,timeoutMs=30000},dependencies={},leasePhases=false){
  try{
    validateMaintenanceContext(context);context=structuredClone(context);replacementEvidence=structuredClone(replacementEvidence);
    if(!['PRE_ADOPTION','ADOPTED'].includes(mode)||!HASH.test(expectedStateDigest||'')||!(rootLease instanceof RootControlLease)
      ||!same(rootLease.context,context)||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000
      ||(signal&&!(signal instanceof AbortSignal)))fail('EXACT_OWNED_REQUEST');
    const now=dependencies.now||Date.now,monotonicNow=dependencies.monotonicNow||(()=>performance.now()),start=now(),monoStart=monotonicNow(),end=Math.min(start+timeoutMs,Date.parse(context.window.end)),monoEnd=monoStart+(end-start);
    let lastWall=start,lastMono=monoStart;
    const check=()=>{const at=now(),mono=monotonicNow();
      if(![start,monoStart,at,mono].every(Number.isFinite)||at<lastWall||mono<lastMono||at<Date.parse(context.window.start)||at>=end||mono>=monoEnd||signal?.aborted)fail('DEADLINE_OR_ABORT');
      lastWall=at;lastMono=mono;
    };
    const remaining=()=>{check();const left=Math.floor(Math.min(end-lastWall,monoEnd-lastMono));if(left<1)fail('DEADLINE_OR_ABORT');return left;};
    const guard=dependencies.guard||(()=>verifyContext(CONTRACT.repository,CONTRACT.stateDirectory));
    const store=dependencies.store||new MaintenanceReceiptStore(context);
    const run=(args,input)=>{check();guard();check();const raw=(dependencies.run||productionRun)(args,input,{timeoutMs:Math.min(10000,remaining())});check();
      if(typeof raw!=='string'||Buffer.byteLength(raw)>65536)fail('BOUNDED_OUTPUT');return raw;};
    let firstAnchor=null;
    const state=()=>{
      check();guard();check();store.assertCurrent();const s=store.readState();
      if(leasePhases){
        if(s?.schema!=='phoenix.legacy-maintenance-state/v1'||s.contextDigest!==bindingDigest(context)||s.stateDigest!==expectedStateDigest||!same(s.context,context)
          ||s.legacyDrainResult!=='UNSUPPORTED'||!iso(s.updatedAt)||Date.parse(s.updatedAt)<Date.parse(context.window.start)||Date.parse(s.updatedAt)>now())fail('PRIVATE_OWNER_STATE_CHANGED');
        // The immutable CR digest comes only from the genuine original lease.
        // Current VF/OPEN state is never disguised as an earlier CF snapshot.
        check();const anchor=store.readCandidateLeasePhaseAnchor({expectedStateDigest,replacementStateDigest:rootLease.expectedStateDigest});check();
        if(s.phase==='CANDIDATE_FENCED'){
          if(mode==='ADOPTED')store.assertOwnedIntent('VERIFY_CANDIDATE','CANDIDATE_FENCED',s.stateDigest);
        }else if(!['VERIFIED_FENCED','COMPLETED_OPEN'].includes(s.phase)||mode!=='ADOPTED')fail('LEASE_PHASE_PROJECTION_REQUIRED');
        if(!firstAnchor)firstAnchor=structuredClone(anchor);else if(!same(firstAnchor,anchor))fail('PHASE_ANCHOR_CHANGED');
      }else{
        if(s?.schema!=='phoenix.legacy-maintenance-state/v1'||s.contextDigest!==bindingDigest(context)||s.stateDigest!==expectedStateDigest||!same(s.context,context)
          ||s.legacyDrainResult!=='UNSUPPORTED'||s.status!==(s.phase==='CANDIDATE_REPLACED'?'HOLD_CANDIDATE_REVALIDATION_REQUIRED':'FENCED')
          ||!iso(s.updatedAt)||Date.parse(s.updatedAt)<Date.parse(context.window.start)||Date.parse(s.updatedAt)>now()
          ||!['CANDIDATE_REPLACED','CANDIDATE_FENCED'].includes(s.phase)||(mode==='ADOPTED'&&s.phase!=='CANDIDATE_FENCED'))fail('PRIVATE_OWNER_STATE_CHANGED');
        store.assertOwnedIntent(s.phase==='CANDIDATE_REPLACED'?'START_CANDIDATE':'VERIFY_CANDIDATE',s.phase,s.stateDigest);
      }
      check();return structuredClone(s);
    };
    const floorSnapshot=()=>{
      check();const floor=(dependencies.readFloor||(()=>store.read(path.join(store.directory,'floor.json'))))();check();
      const tuple=floor?.operationalTuple,source=tuple?.PHOENIX_UPLOADS_DIR;
      if(floor?.version!==3||floor.floorSha!==context.targetSha||floor.phase!=='READY'||floor.chanjetPolicy!=='HOLD'||floor.readonlyApproval!==null
        ||floor.project!==context.replacement.project||!/^phoenix[a-z0-9_-]*$/.test(floor.project||'')
        ||!keys(tuple,['PHOENIX_DATA_MOUNT_GUARD','PHOENIX_PG_DATA_DIR','PHOENIX_UPLOADS_DIR','CHANJET_READONLY_SYNC_ENABLED','CHANJET_ERP_INBOUND_SYNC_ENABLED'])
        ||tuple.PHOENIX_DATA_MOUNT_GUARD!=='true'||tuple.CHANJET_READONLY_SYNC_ENABLED!=='false'||tuple.CHANJET_ERP_INBOUND_SYNC_ENABLED!=='false')fail('APPROVED_FLOOR_RUNTIME_CONTRACT');
      for(const value of [source,tuple.PHOENIX_PG_DATA_DIR])if(typeof value!=='string'||!value.startsWith('/data/')||value.endsWith('/')||path.posix.normalize(value)!==value)fail('APPROVED_STORAGE_TUPLE');
      if(source===tuple.PHOENIX_PG_DATA_DIR||source.startsWith(tuple.PHOENIX_PG_DATA_DIR+'/')||tuple.PHOENIX_PG_DATA_DIR.startsWith(source+'/'))fail('UPLOADS_DATABASE_ALIAS');
      for(const protectedPath of [PUBLIC_DIRECTORY,CONTRACT.stateDirectory])if(source===protectedPath||source.startsWith(protectedPath+'/')||protectedPath.startsWith(source==='/'?'/':source+'/'))fail('UPLOADS_CONTROL_ALIAS');
      (dependencies.inspectStorage||inspectCandidateStorage)(tuple,{check,remaining});check();
      return {floorDigest:canonicalDigest(floor),mounts:[{source:PUBLIC_DIRECTORY,destination:CONTROL,type:'bind',readOnly:true},
        {source,destination:'/app/uploads',type:'bind',readOnly:false}]};
    };
    const readProjection=dependencies.readProjection||(()=>{
      const bootstrap=store.read(path.join(store.directory,'maintenance-public-control.json'));
      const modernFile=path.join(store.directory,'background-control.json');let modern=null;
      if(mode==='ADOPTED')modern=store.read(modernFile);else if(fs.existsSync(modernFile))fail('EXISTING_MODERN_OWNER');
      const manifest=mode==='ADOPTED'?readPublicManifest():readLegacyProjection(PUBLIC_DIRECTORY,inspectPublicDirectory);
      return {bootstrap,modern,manifest};
    });
    const projection=boot=>{check();const value=validateProjection(readProjection(),mode,context,leasePhases?firstAnchor.candidateStateDigest:expectedStateDigest,boot);check();
      for(const t of [value.bootstrap.capturedAt,...(value.modern?[value.modern.updatedAt]:[])])if(Date.parse(t)<Date.parse(context.window.start)||Date.parse(t)>now())fail('PROJECTION_TIME');
      return value;};
    const firstState=state(); check();
    let recorded;
    try{recorded=store.readCandidateBindingEvidence({expectedStateDigest:firstState.stateDigest,timeoutMs:Math.min(10000,remaining()),signal});}
    catch(error){if(error?.message==='MAINTENANCE_HOLD=CANDIDATE_BINDING_RECEIPT_UNIQUE')fail('UNIQUE_FORMAL_RECEIPT_REQUIRED');throw error;}check();
    if(recorded.stateDigest!==firstState.stateDigest)fail('CURRENT_CHAIN_REPLACEMENT_REQUIRED');
    const formalReplacement=recorded.replacement;
    if(!same(replacementEvidence,formalReplacement))fail('CURRENT_CHAIN_REPLACEMENT_REQUIRED');
    const replacement=validateCandidateReplacement(formalReplacement,context,{now:now()});
    const registered=firstState.phase!=='CANDIDATE_REPLACED'?validateMaintenanceEvidence(recorded.candidate,'CANDIDATE_FENCED',context,now()):null;
    if(replacement.project!==context.replacement?.project)fail('EXACT_PROJECT_REQUIRED');
    const beforeProjection=projection(),beforeFloor=floorSnapshot();
    const rootBefore=await RootControlLease.prototype.observe.call(rootLease,{signal,timeoutMs:remaining()});check();state();
    const beforeRuntime=runtimeSnapshot(replacement,run,beforeFloor.mounts),beforeStatus=statusSnapshot(beforeRuntime.api.id,beforeProjection.manifest,run);
    if(registered){
      const pin=value=>Object.fromEntries(['id','imageId','revision','startedAt','restartCount'].map(k=>[k,value?.[k]]));
      const session=value=>Object.fromEntries(['connected','broken','sessionPid','databaseOid','backendStartedAt','backendStartedAtUs','applicationName'].map(k=>[k,value?.[k]]));
      if(registered.candidateReplacementSha256!==formalReplacement.evidenceSha256||registered.owner!==context.owner||registered.bootId!==beforeStatus.bootId
        ||!same(pin(registered.api),beforeRuntime.api)||!same(session(registered.controlSession),session(beforeStatus.controlSession)))fail('FORMAL_CANDIDATE_BINDING');
    }
    if(mode==='ADOPTED'&&(beforeProjection.manifest.participants[0].containerId!==beforeRuntime.api.id
      ||beforeProjection.manifest.participants[0].bootId!==beforeStatus.bootId))fail('ADOPTED_RUNTIME_BINDING');
    const root=rootBefore.observation.backends[0],control=beforeStatus.controlSession;
    const binding={owner:context.owner,previousFloorSha:context.previousFloorSha,targetSha:context.targetSha,database:structuredClone(rootLease.database),
      root:{sessionPid:root.pid,backendStartedAt:root.backendStartedAt},candidate:{sessionPid:control.sessionPid,backendStartedAt:control.backendStartedAtUs,bootId:beforeStatus.bootId}};
    const database=(dependencies.collectDatabase||collectCandidateDatabaseSnapshot)(binding,{expectRoot:'HELD'},{guard,run,now:()=>new Date(now()).toISOString()});check();
    if(database?.schema!=='phoenix.candidate-database-observation/v2'||database.result!=='ROOT_HELD_SNAPSHOT'||!same(database.binding,binding))fail('DATABASE_BINDING');
    const afterStatus=statusSnapshot(beforeRuntime.api.id,beforeProjection.manifest,run),afterRuntime=runtimeSnapshot(replacement,run,beforeFloor.mounts),afterProjection=projection(beforeStatus.bootId),afterFloor=floorSnapshot();
    const rootAfter=await RootControlLease.prototype.observe.call(rootLease,{signal,timeoutMs:remaining()});check();state();
    const rootCore=v=>({contextDigest:v.contextDigest,database:v.database,backends:v.observation.backends,locks:v.observation.locks});
    if(!same(beforeStatus,afterStatus)||!same(beforeRuntime,afterRuntime)||!same(beforeProjection,afterProjection)||!same(beforeFloor,afterFloor)||!same(rootCore(rootBefore),rootCore(rootAfter)))fail('OBSERVATION_CHANGED');
    const result={schema:leasePhases?'phoenix.candidate-lease-binding-observation/v1':'phoenix.candidate-server-binding-observation/v1',result:'OBSERVATION_ONLY',mode,contextDigest:bindingDigest(context),stateDigest:expectedStateDigest,
      startedAt:new Date(start).toISOString(),finishedAt:new Date(now()).toISOString(),candidateReplacementSha256:replacementEvidence.evidenceSha256,
      ...(leasePhases?{authorizationCandidateStateDigest:firstAnchor.candidateStateDigest,phaseAnchor:structuredClone(firstAnchor),phaseAnchorSha256:canonicalDigest(firstAnchor)}:{}),
      runtime:beforeRuntime,status:beforeStatus,approvedRuntimeContractSha256:beforeFloor.floorDigest,projection:{bootstrapSha256:canonicalDigest(beforeProjection.bootstrap),modernSha256:beforeProjection.modern?canonicalDigest(beforeProjection.modern):null,
        publicManifestSha256:digest(beforeProjection.manifest),owner:context.owner,generation:beforeProjection.manifest.generation},
      rootBefore,rootAfter,database,continuousDrainProof:false,continuousIngressProof:false,persistentOwnershipComplete:false,registryInstalled:false,
      admissionOrApprovalGranted:false,productionMutation:false,outerProcessSupervisionRequired:true};
    check();return result;
  }catch(error){if(/^CANDIDATE_BINDING_HOLD=[A-Z_]+$/.test(error?.message||''))throw error;throw opaqueFailure(error);}
}

/** Operation-level START/VERIFY collector: preserve its original exact intent
 * and phase contract. Request JSON cannot select the internal lease policy. */
export function collectCandidateServerBinding(request,dependencies={}){
  return collectCandidateBinding(request,dependencies,false);
}
/** Cross-phase read-only lease correlation. This still does not grant ingress,
 * continuous drain, adoption, approval or production eligibility. The caller
 * owns the genuine original root lease and every outer read process. */
export function collectCandidateLeaseBinding(request,dependencies={}){
  return collectCandidateBinding(request,dependencies,true);
}
