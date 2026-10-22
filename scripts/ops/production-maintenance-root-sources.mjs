/** Fixed production read capabilities for the legacy factory. The protected
 * bootstrap packet contains observations and material pins, never executable
 * adapters. No packet boolean is accepted as a release or drain decision. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {CONTRACT,verifyContext,git,migrationScope,secureJson} from './production-config-guard.mjs';
import {executionEnv,captureRuntime} from './capture-production-runtime.mjs';
import {readPinnedFile} from './production-trusted-paths.mjs';
import {bindingDigest,canonicalDigest,same,HASH,hold} from './production-maintenance-receipts.mjs';
import {validateReleasePlan,LegacyMaintenanceDeploymentSession} from './production-maintenance-deployment-session.mjs';
import {verifyOwnerAuthUnknownAuthority} from './production-maintenance-owner-unknown.mjs';
import {verifyRegisteredOwnerMaintenanceAuthority} from './production-maintenance-owner-authority.mjs';
import {inspectDockerRuntime,validateExecutorInventory} from './production-maintenance-runtime.mjs';
import {discoverMaintenanceDatabaseIdentity,collectMaintenanceDatabaseSnapshot,DATABASE_OBSERVATION_PSQL} from './production-maintenance-database-observer.mjs';
import {drainExternalLegacySessions} from './production-maintenance-external-drain.mjs';
import {bootstrapSchemaSql,assertBootstrapSchemaEvidence} from './api-bootstrap-schema-preflight.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const ID=/^[a-f0-9]{64}$/;
const schemaPath='apps/api/src/common/database/api-bootstrap-schema-contract.json';
const stablePinKeys=['id','imageId','startedAt','restartCount'];
const exactKeys=(value,keys)=>value&&Object.getPrototypeOf(value)===Object.prototype&&same(Object.keys(value).sort(),[...keys].sort());
const checkSignal=signal=>{if(signal?.aborted)hold('ROOT_SOURCE_ABORTED');};
const fixedDocker=(args,input)=>{
  try{return execFileSync('/usr/bin/docker',args,{input,env:executionEnv(),encoding:'utf8',timeout:10000,maxBuffer:1024*1024,stdio:['pipe','pipe','pipe']}).trim();}
  catch{hold('ROOT_SOURCE_BOUNDED_DOCKER_READ_FAILED');}
};
const sourceBytes=(root,target,file)=>execFileSync('/usr/bin/git',['-c',`safe.directory=${root}`,'-c','core.hooksPath=/dev/null',
  '-c','core.fsmonitor=false','show',`${target}:${file}`],{cwd:root,timeout:5000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']});
export function captureMaintenanceChanjetPolicy(run=fixedDocker){
  const code="const b=x=>x==='true'?true:x==='false'?false:'UNVERIFIED';console.log(JSON.stringify({policy:process.env.CHANJET_SYNC_POLICY==='HOLD'?'HOLD':'UNVERIFIED',readonly:b(process.env.CHANJET_READONLY_SYNC_ENABLED),inbound:b(process.env.CHANJET_ERP_INBOUND_SYNC_ENABLED)}))";
  let value;try{value=JSON.parse(run(['exec','phoenix-v3-api','node','-e',code]));}catch{hold('ROOT_SOURCE_CHANJET_POLICY_READ_FAILED');}
  if(!exactKeys(value,['policy','readonly','inbound'])||value.policy!=='HOLD'||value.readonly!==false||value.inbound!==false)hold('ROOT_SOURCE_CHANJET_POLICY');
  return value;
}
export function inspectMaintenancePreRuntime(dependencies={}){
  const inspect=dependencies.inspect||inspectDockerRuntime,run=dependencies.run||fixedDocker;
  const result={};
  for(const service of ['api','web','db']){
    const id=run(['inspect',`phoenix-v3-${service}`,'--format','{{.Id}}']);
    if(!ID.test(id))hold('ROOT_SOURCE_RUNTIME_ID_REQUIRED');
    const actual=inspect(id),pin={};
    for(const key of ['id','imageId','startedAt','restartCount','running','health','pid','restarting','dead'])pin[key]=actual[key];
    if(service!=='db')pin.revision=actual.revision;
    if(service==='db'){
      const mounts=JSON.parse(run(['inspect',id,'--format','{{json .Mounts}}']));
      if(!Array.isArray(mounts))hold('ROOT_SOURCE_DB_MOUNTS_REQUIRED');
      // Docker preserves mount semantics but does not promise array order
      // across daemon namespaces. Hash a deterministic view so entering the
      // disposable PID/mount namespace cannot look like a DB identity drift.
      mounts.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
      pin.mountsSha256=canonicalDigest(mounts);
    }
    result[service]=pin;
  }
  return result;
}

/** Source bytes must match the exact merged Git object. File paths are fixed
 * by Git and the compiler's literal relative-import graph, not by release JSON.
 * The alias is needed by the established floor helper staging contract. */
export function maintenanceSourceFiles(root,target){
  const names=git(root,['ls-tree','-r','--name-only',target,'--','scripts/ops']).split('\n')
    .filter(name=>/^scripts\/ops\/[a-z0-9-]+\.(?:mjs|json|py|sh)$/.test(name)&&!name.endsWith('.test.mjs'));
  if(!names.length||names.length>512)hold('ROOT_SOURCE_TARGET_FILE_INVENTORY');
  return [...names,schemaPath,'docker-compose.yml'].sort();
}
export function captureMaintenanceSourceManifest(root,target){
  return {schema:'phoenix.maintenance-target-source-files/v1',targetSha:target,
    files:maintenanceSourceFiles(root,target).map(file=>({path:file,sha256:digest(sourceBytes(root,target,file))}))};
}
export function verifyMaintenanceSourceManifest(manifest,{root=CONTRACT.repository,stageRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),target}={}){
  if(!same(manifest,captureMaintenanceSourceManifest(root,target)))hold('ROOT_SOURCE_MANIFEST_NOT_EXACT_TARGET');
  for(const entry of manifest.files){
    const file=path.join(stageRoot,entry.path);
    const bytes=readPinnedFile(file,{contract:CONTRACT});
    if(digest(bytes)!==entry.sha256)hold('ROOT_SOURCE_STAGED_BYTES_CHANGED');
  }
  const alias=readPinnedFile(path.join(stageRoot,'scripts/ops/api-bootstrap-schema-contract.json'),{contract:CONTRACT});
  if(digest(alias)!==manifest.files.find(entry=>entry.path===schemaPath)?.sha256)hold('ROOT_SOURCE_SCHEMA_ALIAS_CHANGED');
  return canonicalDigest(manifest);
}

/** Actual schema and server reads are kept outside plan interpretation. A new
 * schema gap, timeout or DB incarnation change is always a HOLD. */
export function captureMaintenanceSchema(context,dependencies={}){
  const run=dependencies.run||fixedDocker,guard=dependencies.guard||(()=>verifyContext(CONTRACT.repository,CONTRACT.stateDirectory));
  const readGit=dependencies.git||git,inspect=dependencies.inspect||inspectDockerRuntime;
  guard();const expected=context.preSnapshot.db,before=inspect(expected.id);
  if(stablePinKeys.some(key=>before[key]!==expected[key])||before.running!==true||before.health!=='healthy')hold('ROOT_SOURCE_DATABASE_CHANGED');
  const contract=JSON.parse(readGit(CONTRACT.repository,['show',`${context.targetSha}:${schemaPath}`]));
  let evidence;
  try{evidence=JSON.parse(run(['exec','-i',expected.id,'/bin/sh','-c',DATABASE_OBSERVATION_PSQL],
    `BEGIN READ ONLY; SET LOCAL search_path=pg_catalog; SET LOCAL statement_timeout='3s'; SET LOCAL lock_timeout='1s'; ${bootstrapSchemaSql(contract)} ROLLBACK;`));}
  catch{hold('ROOT_SOURCE_TARGET_SCHEMA_READ_FAILED');}
  const result=assertBootstrapSchemaEvidence(contract,evidence),after=inspect(expected.id);
  if(stablePinKeys.some(key=>after[key]!==before[key])||after.running!==true||after.health!=='healthy')hold('ROOT_SOURCE_DATABASE_CHANGED');
  guard();
  const stable={columns:[...evidence.columns].sort((a,b)=>`${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`)),
    extensions:[...evidence.extensions].sort(),retiredConstraints:[...evidence.retiredConstraints].sort()};
  return {contractSha256:canonicalDigest(contract),evidence:stable,result};
}

/** Registry is an immutable reviewed set of *observations*. Every observation
 * is repeated through a fixed reader at each boundary; the producer refuses
 * an unknown identity instead of trusting an approved:true field. */
export function verifyMaintenanceRegistry(expected,actual){
  if(!exactKeys(expected,['schema','containers','hostProcesses','schedulers'])
    ||expected.schema!=='phoenix.maintenance-host-registry/v1'||!exactKeys(actual,['schema','containers','hostProcesses','schedulers'])||actual.schema!==expected.schema)hold('ROOT_SOURCE_HOST_REGISTRY_CHANGED');
  for(const rows of [expected.containers,expected.hostProcesses,expected.schedulers,actual.containers,actual.hostProcesses,actual.schedulers]){
    if(!Array.isArray(rows)||rows.some(row=>!row||!['ERP_EXECUTOR','NON_ERP_PINNED','CONTROL_PROCESS','SYSTEM_PINNED'].includes(row.classification)
      ||!HASH.test(row.identitySha256)||row.erpControlReference!==false&&!['ERP_EXECUTOR','CONTROL_PROCESS'].includes(row.classification)))hold('ROOT_SOURCE_UNKNOWN_HOST_EXECUTOR');
  }
  // Executor/controller incarnations legitimately change during replacement.
  // Their live identities are verified by the fixed reader against context and
  // the original child graph; immutable unrelated neighbours must not change.
  const pinned=rows=>rows.filter(row=>!['ERP_EXECUTOR','CONTROL_PROCESS'].includes(row.classification));
  const differences={};
  for(const key of ['containers','hostProcesses','schedulers']){
    const before=key==='schedulers'?expected[key]:pinned(expected[key]),after=key==='schedulers'?actual[key]:pinned(actual[key]);
    if(same(before,after))continue;
    const identity=row=>String(row.id??row.pid),oldRows=new Map(before.map(row=>[identity(row),row])),newRows=new Map(after.map(row=>[identity(row),row]));
    differences[key]=[...new Set([...oldRows.keys(),...newRows.keys()])].filter(id=>!same(oldRows.get(id)??null,newRows.get(id)??null)).slice(0,32).map(id=>({id,before:oldRows.get(id)??null,after:newRows.get(id)??null}));
  }
  if(Object.keys(differences).length){const error=Error('MAINTENANCE_HOLD=ROOT_SOURCE_HOST_REGISTRY_CHANGED');error.registryDifference=differences;throw error;}
  return true;
}

export function createProductionMaintenanceSources(plan,{readControllers,readers}={}){
  validateReleasePlan(plan);const context=structuredClone(plan.context),owner=context.owner;
  const guard=()=>verifyContext(CONTRACT.repository,CONTRACT.stateDirectory);
  guard();
  if(!readControllers?.graph||!HASH.test(context.rootSourceDataSha256||''))hold('ROOT_SOURCE_BOOTSTRAP_BINDING_REQUIRED');
  const packetFile=path.join(CONTRACT.stateDirectory,`maintenance-root-source-data-${owner}.json`);
  const packet=secureJson(packetFile);
  if(packet.schema!=='phoenix.maintenance-root-source-data/v1'||canonicalDigest(packet)!==context.rootSourceDataSha256)hold('ROOT_SOURCE_DATA_BINDING');
  // Only a compiled reader constructor can supply these capabilities. The
  // public fixed entry never deserializes readers from a packet or environment.
  if(!readers||!['registry','recovery','domainFacts','reconcile','installedGuard'].every(name=>typeof readers[name]==='function'))hold('ROOT_SOURCE_FIXED_READERS_REQUIRED');
  const check=signal=>{checkSignal(signal);guard();if(!same(secureJson(packetFile),packet))hold('ROOT_SOURCE_DATA_CHANGED');};
  const registry=async request=>{check(request?.signal);const actual=await readers.registry({context,...request});verifyMaintenanceRegistry(packet.registry,actual);check(request?.signal);return actual;};
  const verifyAuthority=({approval,...expected})=>expected.purpose==='UNKNOWN_EFFECTS'
    ?verifyOwnerAuthUnknownAuthority(approval,expected,plan.approval):verifyRegisteredOwnerMaintenanceAuthority(approval,expected);
  const inventoryFromRegistry=(actual,request={})=>{
    const expected=actual.containers.filter(row=>row.classification==='ERP_EXECUTOR').map(row=>row.id);
    // The fixed live reader validates the old exact pin or protected replacement
    // intent. A candidate is never authorized by caller-supplied ID alone.
    if(expected.length!==1||request.candidateId&&expected[0]!==request.candidateId)hold('ROOT_SOURCE_EXECUTOR_PHASE_REQUIRED');
    if(actual.containers.some(row=>row.classification==='ERP_EXECUTOR'&&!expected.includes(row.id)))hold('ROOT_SOURCE_UNACCOUNTED_ERP_EXECUTOR');
    const dockerIds=fixedDocker(['ps','-a','--no-trunc','-q']).split('\n').filter(Boolean).sort();
    const classified=actual.containers.filter(row=>!expected.includes(row.id)).map(row=>row.id);
    const value={hostInventoryComplete:true,unaccountedExecutors:0,dockerExecutorIds:expected,allDockerIds:dockerIds,classifiedNonExecutorIds:classified};
    validateExecutorInventory(value,[{...context.preSnapshot.api,id:expected[0]}]);
    return value;
  };
  const inventory=async(request={})=>inventoryFromRegistry(await registry(request),request);
  const infrastructure=async request=>{
    // Use this call's fresh verified registry for its inventory. Repeating the
    // entire same observation here doubles all Docker/systemd/path reads; it
    // does not add another effect boundary. Docker IDs are still re-read below.
    const actual=await registry(request),inv=inventoryFromRegistry(actual,request);
    if(fixedDocker(['info','--format','{{.Swarm.LocalNodeState}}'])!=='inactive')hold('ROOT_SOURCE_SWARM_UNSUPPORTED');
    if(actual.schedulers.some(row=>row.erpControlReference||row.classification!=='SYSTEM_PINNED'&&row.classification!=='NON_ERP_PINNED'))hold('ROOT_SOURCE_ORCHESTRATOR_UNVERIFIED');
    const stable={...actual,containers:actual.containers.filter(row=>!['ERP_EXECUTOR','CONTROL_PROCESS'].includes(row.classification)),
      hostProcesses:actual.hostProcesses.filter(row=>!['ERP_EXECUTOR','CONTROL_PROCESS'].includes(row.classification))};
    return {schema:'phoenix.maintenance-live-infrastructure/v1',registrySha256:canonicalDigest(stable),body:{...inv,
      orchestratorsDisabled:true,unknownHostExecutors:0,swarmActive:false,watchtowerPresent:false}};
  };
  const database=()=>discoverMaintenanceDatabaseIdentity({containerId:context.preSnapshot.db.id,imageId:context.preSnapshot.db.imageId,containerStartedAt:context.preSnapshot.db.startedAt});
  const sources={
    bindSession(session){
      if(!(session instanceof LegacyMaintenanceDeploymentSession)||typeof readers.bindOwnedChildren!=='function')hold('ROOT_SOURCE_ORIGINAL_SESSION_REQUIRED');
      readers.bindOwnedChildren(()=>[...session.children,...session.controlChildren.values()]);
    },
    recordOwnedChild(entry){
      if(typeof readers.recordOwnedChild!=='function')hold('ROOT_SOURCE_ORIGINAL_CHILD_RECORDER_REQUIRED');
      readers.recordOwnedChild(entry);
    },
    async assertReady(request){
      check(request.signal);const source=verifyMaintenanceSourceManifest(packet.sourceManifest,{target:context.targetSha});
      if(source!==context.sourceHelperSha256)hold('ROOT_SOURCE_HELPER_BINDING');
      await readControllers.graph.check({signal:request.signal,timeoutMs:10000});
      if(await verifyAuthority({approval:plan.approval,purpose:'MAINTENANCE',context,bindingDigest:bindingDigest(context),targetSha:context.targetSha})!==true)hold('ROOT_SOURCE_OWNER_REGISTRATION_REQUIRED');
      await registry(request);await readers.installedGuard({context,signal:request.signal});
      if(typeof readers.assertReconciliationReady!=='function')hold('ROOT_SOURCE_PRE_STOP_RECONCILIATION_CHECK_REQUIRED');
      await readers.assertReconciliationReady({context,signal:request.signal});
      return {sourceHelperSha256:source,actualSourceClosureVerified:true,rootBootstrapVerified:true,readSourceLifecycleTracked:true};
    },
    async capturePre(request){
      check(request.signal);await readers.installedGuard({context,signal:request.signal});
      const actual=inspectMaintenancePreRuntime(),schema=captureMaintenanceSchema(context),scope=migrationScope(CONTRACT.repository,context.previousApiSha,context.targetSha);
      if(!same(actual,context.preSnapshot)||canonicalDigest(schema)!==context.schemaEvidenceSha256||scope.changed.length){
        const error=Error('MAINTENANCE_HOLD=ROOT_SOURCE_PRE_OR_SCHEMA_CHANGED');
        error.preAdmissionDifference={runtime:Object.fromEntries(['api','web','db'].map(service=>[service,Object.keys(actual[service]).filter(key=>actual[service][key]!==context.preSnapshot[service][key]).map(key=>({field:key,before:context.preSnapshot[service][key],after:actual[service][key]}))])),
          schemaChanged:canonicalDigest(schema)!==context.schemaEvidenceSha256,migrationPaths:scope.changed};
        throw error;
      }
      for(const name of ['transaction.json','policy-transition.json'])if(fs.existsSync(path.join(CONTRACT.stateDirectory,name)))hold('ROOT_SOURCE_PENDING_DEPLOYMENT');
      const runtime=captureRuntime(),policy=captureMaintenanceChanjetPolicy();
      return {body:{healthy:true,runtime:actual,schemaEvidenceSha256:context.schemaEvidenceSha256,migrationPaths:scope.changed,unfinishedTransaction:false,
        chanjetPolicy:'HOLD',readonlySync:false,inboundSync:false,inventory:await inventory(request)},observations:{formalPre:request.formalPre,schema,runtime,policy}};
    },
    async captureRecovery(request){
      check(request.signal);const actual=await readers.recovery({context,plan:plan.recoveryPlan,packet:packet.recovery,signal:request.signal});
      if(actual?.status!=='RECOVERY_VERIFIED'||actual.candidateImageId!==context.candidate.imageId||actual.procedureSha256!==plan.recoveryPlan.procedureSha256
        ||actual.operator!==plan.recoveryPlan.responsibleOperator||!HASH.test(actual.materialsSha256||''))hold('ROOT_SOURCE_RECOVERY_UNVERIFIED');
      return {body:{planDigest:canonicalDigest(plan.recoveryPlan),materialsAvailable:true,compatibleCandidateImageId:actual.candidateImageId,
        procedureSha256:actual.procedureSha256,operatorConfirmed:actual.operator,materialsSha256:actual.materialsSha256},observations:actual};
    },
    inventory,infrastructure,
    async verifyInfrastructure({evidence,...request}){
      check(request.signal);const live=await infrastructure(request);
      // Current executor inventory is independently verified above. Only foreign
      // identities and scheduler sources remain immutable across replacement.
      const stable=value=>({schema:value?.schema,registrySha256:value?.registrySha256,
        orchestratorsDisabled:value?.body?.orchestratorsDisabled,unknownHostExecutors:value?.body?.unknownHostExecutors,
        swarmActive:value?.body?.swarmActive,watchtowerPresent:value?.body?.watchtowerPresent});
      return same(stable(evidence),stable(live));
    },
    async databaseQuiescence(request){
      check(request.signal);await registry(request);const identity=database();
      // Allow the bounded old-container stop grace period to release backend
      // sessions before the first database drain sample.
      // The historical 22687886 runtime has no coordinated pool shutdown;
      // allow a bounded transport/PG release grace before declaring its old
      // client sessions unreconciled. This never terminates a backend.
      await new Promise(resolve=>setTimeout(resolve,90000));
      let snapshot,facts,counts,stable=0,externalDrain=null;
      // Health probes and short-lived observer clients can overlap one sample.
      // Require two consecutive zero observations inside a bounded window;
      // persistent work is never converted into a pass by this settling loop.
      for(let attempt=0;attempt<8;attempt++){
        check(request.signal);
        snapshot=collectMaintenanceDatabaseSnapshot({...identity,previousFloorSha:context.previousFloorSha,targetSha:context.targetSha});
        facts=await readers.domainFacts({context,identity,signal:request.signal});
        const s=snapshot.observation,p=facts.observation?.persistent;
        counts={statsVisibilityComplete:s.statsVisibilityComplete,currentDatabaseClientSessions:s.currentDatabaseClientSessions,
          otherDatabaseClientSessions:s.otherDatabaseClientSessions,clientSessionsWithOpenTransaction:s.clientSessionsWithOpenTransaction,
          currentDatabasePreparedTransactions:s.currentDatabasePreparedTransactions,otherDatabasePreparedTransactions:s.otherDatabasePreparedTransactions,
          persistentRunning:p?.runningJobs,persistentQueued:p?.queuedJobs,activeAdmissions:p?.activeAdmissions,reservedRequests:p?.reservedRequests};
        const zero=counts.statsVisibilityComplete===true&&Object.values(counts).every((n,index)=>index===0||n===0);
        if(zero)stable++;
        else{
          stable=0;
          // The historical 22687886 runtime can leave its idle client backend
          // retained by PostgreSQL after the container stop. Exactly once,
          // BEFORE the final determination, run the bounded fixture-only
          // external legacy-connection drain against sessions pinned to the
          // exact stopped identity. Production (fixture gate closed) keeps
          // pure observation with no effect and still HOLDs on any remainder;
          // any drain mismatch throws its own immediate HOLD.
          if(!externalDrain&&counts.statsVisibilityComplete===true&&counts.currentDatabaseClientSessions>0
            &&counts.otherDatabaseClientSessions===0&&counts.clientSessionsWithOpenTransaction===0
            &&counts.currentDatabasePreparedTransactions===0&&counts.otherDatabasePreparedTransactions===0
            &&counts.persistentRunning===0&&counts.persistentQueued===0
            &&counts.activeAdmissions===0&&counts.reservedRequests===0)
            externalDrain=await drainExternalLegacySessions({context,databaseBinding:identity});
        }
        if(stable>=2)break;
        if(attempt<7)await new Promise(resolve=>setTimeout(resolve,500));
      }
      if(stable<2){
        const error=Error('MAINTENANCE_HOLD=ROOT_SOURCE_DATABASE_OR_PERSISTENT_WORK_REMAINS');
        error.databaseQuiescenceCounts=counts;
        if(externalDrain)error.externalLegacyDrain={status:externalDrain.status,fixtureOnly:externalDrain.fixtureOnly,
          attempted:externalDrain.attempted??null,beforeCount:externalDrain.receipt?.beforeCount??null,
          afterCount:externalDrain.receipt?.afterCount??null,failureReason:externalDrain.receipt?.failureReason??null};
        try{
          const sql=`BEGIN READ ONLY; SET LOCAL search_path=pg_catalog; SET LOCAL statement_timeout='3s'; SELECT json_build_object('groups',(SELECT coalesce(json_agg(row_to_json(x) ORDER BY x.application_name,x.state),'[]'::json) FROM (SELECT coalesce(application_name,'') AS application_name,coalesce(state,'') AS state,backend_type,count(*)::integer AS count FROM pg_stat_activity WHERE backend_type='client backend' GROUP BY application_name,state,backend_type) x),'sessions',(SELECT coalesce(json_agg(json_build_object('pid',pid,'application_name',application_name,'usename',usename,'client_addr',client_addr::text,'backend_start',to_char(backend_start AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'state',state,'backend_type',backend_type) ORDER BY pid),'[]'::json) FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid())); ROLLBACK;`;
          error.databaseClientSummary=JSON.parse(execFileSync('/usr/bin/docker',['exec','-i',identity.containerId,'/bin/sh','-c',DATABASE_OBSERVATION_PSQL],{input:sql,env:executionEnv(),encoding:'utf8',timeout:10000,stdio:['pipe','pipe','pipe']}));
        }catch{error.databaseClientSummary=null;}
        throw error;
      }
      return {ownershipComplete:true,remainingConnections:0,openTransactions:0,preparedTransactions:0,persistentRunning:0,persistentQueued:0,
        registrySha256:canonicalDigest(packet.registry),databaseSnapshot:snapshot,persistentObservation:facts};
    },
    async reconciliation(request){check(request.signal);return readers.reconcile({context,pre:packet.preDomains,stopped:request.stopped,signal:request.signal});},
    async readDatabaseIdentity(request){check(request.signal);return database();},verifyAuthority,
    async revalidateCheckout(request){
      check(request.signal);await registry(request);
      const floor=secureJson(path.join(CONTRACT.stateDirectory,'floor.json'));
      if(floor.phase!=='CODE_HOLD'||floor.floorSha!==context.targetSha||floor.chanjetPolicy!=='HOLD'||floor.readonlyApproval!==null
        ||git(CONTRACT.repository,['rev-parse','HEAD'])!==context.previousFloorSha||git(CONTRACT.repository,['status','--porcelain','--untracked-files=all'])
        ||git(CONTRACT.repository,['ls-remote','origin','refs/heads/main'],{timeoutMs:5000})!==`${context.targetSha}\trefs/heads/main`)return false;
      return verifyAuthority({approval:plan.approval,purpose:'MAINTENANCE',context,bindingDigest:bindingDigest(context),targetSha:context.targetSha});
    },
  };
  return Object.freeze(sources);
}
