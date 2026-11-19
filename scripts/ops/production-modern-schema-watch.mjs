/** Serial native observation throughout the original-S session. New/changed
 * actors are never adopted by name, PPID, application_name or a JSON flag. */
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {ChildProcess,execFileSync} from 'node:child_process';
import {CONTRACT} from './production-config-guard.mjs';import {executionEnv} from './capture-production-runtime.mjs';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {captureMaintenanceSchedulers,captureModernSchemaProcessIdentities,observeMaintenanceProcessIdentity,observeMaintenanceContainerIdentity,STABLE_MODERN_CENSUS_PARENT} from './production-maintenance-root-readers.mjs';
import {inspectModernSchemaContainer,MODERN_SCHEMA_EXECUTOR_SQL,classifyModernSchemaDatabaseExecutors} from './production-modern-schema-executors.mjs';
import {verifyModernSchemaChild,pinModernSchemaChild,isOriginalModernSchemaChildTerminal} from './production-modern-schema-processes.mjs';import {assertOriginalModernSchemaProcess} from './production-modern-schema-session-lease.mjs';
import {readPinnedFile} from './production-trusted-paths.mjs';
import {RETAINED_INVENTORY_CLASSIFICATION,verifyRetainedModernSchemaInventoryPin} from './production-modern-schema-inventory.mjs';
import {matchesModernSchemaRehearsalVolume} from './production-modern-schema-postgres.mjs';
const fail=code=>{throw Error('MODERN_SCHEMA_WATCH_HOLD='+code);};
const native=(binary,args)=>{try{return execFileSync(binary,args,{env:executionEnv(),encoding:'utf8',timeout:5000,maxBuffer:2*1024*1024,stdio:['ignore','pipe','pipe']}).trim();}catch{fail('NATIVE_CONTINUITY_OBSERVATION_UNAVAILABLE');}};
const identity=value=>({id:value.id,imageId:value.imageId,name:value.name,startedAt:value.state.StartedAt,running:value.state.Running,pid:value.state.Pid,restarts:value.restarts,
 networkMode:value.networkMode,ports:value.ports,networks:value.networks,labels:value.labels,mounts:value.mounts,privileged:value.privileged,pidMode:value.pidMode,readonly:value.readonly,
 capDrop:value.capDrop,user:value.user,restartPolicy:value.restartPolicy,entrypointSha256:canonicalDigest(value.entrypoint),cmdSha256:canonicalDigest(value.cmd)});
const potential=value=>/\/(?:node|nodejs|python[0-9.]*|java|pm2|supervisord|nomad|kubelet|psql|pg_restore|pgbench)$/.test(value.exe)||value.erpControlReference;
const linuxOnly=({pid,parentPid,startTicks,bootId})=>({pid,parentPid,startTicks,bootId});
const nativeTicks=value=>typeof value==='string'&&/^[1-9][0-9]*$/.test(value);
class PendingOriginalChildExit extends Error{
 constructor(entry,cause){super(cause.message);this.entries=new Set([entry]);}
}
export class ModernSchemaExecutorWatch {
 #reapRoles=new WeakMap();
 constructor({context,preparation,state,rootLease,session,client,privateRuntime,admit},dependencies={}){
  if(typeof admit!=='function'||canonicalDigest(preparation.originalSnapshot.containers)!==context.runtimeSnapshotSha256)fail('ORIGINAL_PREPARATION_REQUIRED');
  Object.assign(this,{context,preparation,state,rootLease,session,client,runtime:privateRuntime,admit});this.run=dependencies.run??native;
  this.captureProcesses=dependencies.captureProcesses??captureModernSchemaProcessIdentities;this.inspectProcess=dependencies.processIdentity??observeMaintenanceProcessIdentity;
  this.resources=new Map(preparation.ownedResources.map(record=>[record.containerId,record]));this.baseline=null;this.foreignProcesses=new Map();this.readers=[];this.readCommand=null;
  this.migration=null;this.waitingMigration=null;this.composeChild=null;this.descendants=[];this.candidate=null;this.last=null;this.failed=null;this.timer=null;this.pending=Promise.resolve();this.serial=Promise.resolve();this.running=false;
 }
 async check(){if(this.failed)throw this.failed;this.runtime.guard();if(await this.admit()!==true)fail('ORIGINAL_NATIVE_LEASE_REQUIRED');this.runtime.guard();}
 async registerReadTransport(client){
  await this.check();const entry=pinModernSchemaChild(client.child);this.runtime.children.add(entry);
  const {rows:[backend]}=await client.query(`SELECT pg_backend_pid() AS pid,(SELECT oid::integer FROM pg_database WHERE datname=current_database()) AS "databaseOid",
   trunc(EXTRACT(epoch FROM backend_start)*1000000)::text AS "backendStartMicros",current_setting('default_transaction_read_only')='on' AS readonly,
   (SELECT system_identifier::text FROM pg_control_system()) AS "systemIdentifier" FROM pg_stat_activity WHERE pid=pg_backend_pid()`);
  if(backend.readonly!==true||backend.databaseOid!==this.rootLease.database.databaseOid||backend.systemIdentifier!==this.rootLease.database.systemIdentifier)fail('ORIGINAL_OWNED_READ_CHANNEL_REQUIRED');
  const pin={pid:backend.pid,databaseOid:backend.databaseOid,backendStartMicros:backend.backendStartMicros,nativeProofSha256:canonicalDigest({backend,child:entry.pin})};
  this.readers.push({client,entry,pin});return pin;
 }
 allowDescendants(entry,role='CONTROLLED_DESCENDANT'){
  verifyModernSchemaChild(entry,this.inspectProcess(entry.pin.pid));
  const phases={SCHEMA_DRIVER:['DDL_STARTED'],FORMAL_API_BODY:['SCHEMA_RECEIPTED'],FORMAL_COMPOSE:['API_BODY']};
  if(role!=='CONTROLLED_DESCENDANT'){
   if(!phases[role]?.includes(this.state.read().phase)||this.runtime.isCommand(entry)!==true)fail('EXACT_ONESHOT_BODY_PHASE_REQUIRED');
   this.#reapRoles.set(entry,role);
  }
  this.descendants.push(entry);
 }
 allowCompose(entry){this.allowDescendants(entry,'FORMAL_COMPOSE');this.composeChild=entry;}
 registerResource(record){
  if(!/^[a-f0-9]{64}$/.test(record?.containerId??'')||record.owner!==this.context.owner||!/^sha256:[a-f0-9]{64}$/.test(record.imageId??''))fail('ROOT_NATIVE_CREATED_RESOURCE_REQUIRED');
  if(this.resources.has(record.containerId))fail('CREATION_RECEIPT_REPLAY');this.resources.set(record.containerId,structuredClone(record));
 }
 allowReadonlyBackup(entry,applicationName){
  if(!(entry?.child instanceof ChildProcess)||!['fenced-backup','schema-before','schema-after'].some(suffix=>applicationName===`phoenix-schema-${this.context.owner}-${suffix}`)
   ||!entry.child.spawnargs.includes(this.preparation.originalSnapshot.containers.db.id)||!entry.child.spawnargs.some(arg=>arg.includes('exec env -i ')&&arg.includes(' pg_dump ')))fail('ORIGINAL_READONLY_BACKUP_PROCESS_REQUIRED');
  verifyModernSchemaChild(entry,this.inspectProcess(entry.pin.pid));this.readCommand={entry,applicationName,native:null};
 }
 clearReadonlyBackup(){this.readCommand=null;}
 allowNativeMigration(backend,resource){
  if(!resource.backendProof||!same(backend.backend,resource.backendProof.backend)||backend.containerId!==resource.containerId||backend.networkId!==this.preparation.hostSurface.ingressScope.networkId)fail('NATIVE_MIGRATION_BINDING_REQUIRED');
  if(this.migration&&this.migration.containerId!==backend.containerId)fail('PRIOR_MIGRATION_STILL_REGISTERED');
  this.migration={address:backend.clientAddress,sessionPid:backend.backend.pid,backendStartMicros:backend.backend.backendStartMicros,applicationName:backend.backend.applicationName,containerIdentityVerified:true,containerId:backend.containerId};
 }
 clearMigration(){this.migration=null;this.waitingMigration=null;}
 containers(){return this.run('/usr/bin/docker',['ps','-a','--no-trunc','-q']).split('\n').filter(Boolean).sort().map(id=>inspectModernSchemaContainer(id,this.run));}
 verifyResource(actual,record){
  if(actual.imageId!==record.imageId||actual.labels?.['phoenix.schema.owner']!==this.context.owner||actual.labels?.['phoenix.schema.role']!==record.role||actual.privileged!==false||actual.pidMode==='host'||actual.pidMode?.startsWith('container:')
   ||actual.networkMode==='host'||actual.restarts!==0||actual.state.OOMKilled!==false||actual.restartPolicy?.Name!=='no')fail('OWNED_RESOURCE_CHANGED');
  if(record.role.startsWith('controlled-migration-')){
   if(record.networkId!==this.preparation.hostSurface.ingressScope.networkId||actual.networkMode!==record.networkId||actual.user!=='phoenix'||actual.readonly!==true||!same(actual.capDrop,['ALL'])
    ||Object.keys(actual.ports??{}).length||actual.mounts.length!==1||actual.mounts[0].Source!==record.gateDirectory||actual.mounts[0].Destination!=='/run/phoenix-modern-schema-gate'||actual.mounts[0].RW!==false)fail('EXACT_CONTROLLED_MIGRATION_CONTAINER_REQUIRED');
  }else if(record.role.startsWith('rehearsal-')){
   const [network]=JSON.parse(this.run('/usr/bin/docker',['network','inspect',record.networkId]));
   if(network.Internal!==true||record.networkId===this.preparation.hostSurface.ingressScope.networkId||network.Labels?.['phoenix.schema.owner']!==this.context.owner
    ||actual.networkMode!==record.networkId||Object.values(actual.networks??{}).length!==1||Object.keys(actual.ports??{}).length)fail('OWNED_REHEARSAL_NETWORK_CHANGED');
   if(record.role==='rehearsal-database'){
    if(!matchesModernSchemaRehearsalVolume(actual.mounts,record))fail('OWNED_REHEARSAL_VOLUME_CHANGED');
   }else{
    if(actual.readonly!==true||actual.user!=='phoenix'||!same(actual.capDrop,['ALL']))fail('OWNED_REHEARSAL_EXECUTOR_CHANGED');
    if(record.role.endsWith('-api')){
     const expected=path.join(this.runtime.directory,`schema-release-${record.stage??'fenced'}-rehearsal-${this.context.owner}`,'control-'+record.role.slice('rehearsal-'.length));
     if(actual.mounts.length!==1||actual.mounts[0].Type!=='bind'||actual.mounts[0].Source!==expected||actual.mounts[0].Destination!=='/run/phoenix-background-control'||actual.mounts[0].RW!==false)fail('OWNED_REHEARSAL_PUBLIC_MOUNT_CHANGED');
    }else if(actual.mounts.length)fail('OWNED_REHEARSAL_UNEXPECTED_MOUNT');
   }
  }else if(record.role==='readonly-inventory'){
   if(actual.state.Running!==false||actual.state.ExitCode!==0||actual.state.Pid!==0||actual.networkMode!=='none'||actual.readonly!==true||actual.user!=='phoenix'||!same(actual.mounts,[])||!same(actual.capDrop,['ALL']))fail('READONLY_INVENTORY_PROBE_CHANGED');
  }else fail('UNREVIEWED_CREATED_ACTOR_ROLE');
 }
 #verifyRetainedInventory(values){
  for(const pin of this.preparation.hostSurface.inertArtifacts??[]){
   if(pin.classification!==RETAINED_INVENTORY_CLASSIFICATION)continue;
   const actual=values.find(candidate=>candidate.id===pin.id);
   if(!actual)fail('RETAINED_ARTIFACT_CHANGED');
   verifyRetainedModernSchemaInventoryPin(actual,pin,{docker:args=>this.run('/usr/bin/docker',args)});
  }
 }
 verifyContainers(values){
  this.#verifyRetainedInventory(values);
  const pre=this.preparation.originalSnapshot.containers,byId=new Map(values.map(value=>[value.id,value]));let runtimeAddress=this.preparation.hostSurface.runtimeAddress;
  for(const service of ['web','db']){const actual=byId.get(pre[service].id);
   if(!actual||actual.imageId!==pre[service].image||actual.state.StartedAt!==pre[service].startedAt||actual.restarts!==pre[service].restartCount||actual.state.Running!==true||actual.state.Health?.Status!=='healthy')fail('UNCHANGED_WEB_DATABASE_REQUIRED');}
  const phase=this.state.read().phase,old=byId.get(pre.api.id),stopIntent=!['REGISTERED','DRAINED','INGRESS_FENCED'].includes(phase);
  if(old){
   if(old.imageId!==pre.api.image||old.state.StartedAt!==pre.api.startedAt||old.restarts!==pre.api.restartCount||old.state.OOMKilled!==false||old.state.Restarting||old.state.Paused
    ||(!stopIntent&&(old.state.Running!==true||old.state.Health?.Status!=='healthy')))fail('ORIGINAL_R_CHANGED');
   if(!old.state.Running&&(old.state.ExitCode!==0||old.state.Pid!==0||old.restartPolicy.Name!=='no'))fail('ORIGINAL_R_NOT_CLEANLY_STOPPED');
  }else if(!this.composeChild||!['API_BODY','API_VERIFIED','OPEN_INTENT','OPEN_PUBLISHED','INGRESS_RELEASED','COMPLETED_OPEN'].includes(phase))fail('ORIGINAL_R_DISAPPEARED_WITHOUT_CONTROLLED_COMPOSE');
  const newApis=values.filter(value=>value.labels?.['com.docker.compose.project']===this.preparation.floor.project&&value.labels?.['com.docker.compose.service']==='api'&&value.id!==pre.api.id);
  if(newApis.length){
   if(!this.composeChild||newApis.length!==1)fail('UNREGISTERED_API_REPLACEMENT');const next=newApis[0];
   if(next.name!=='/phoenix-v3-api'||next.imageId!==this.context.candidateImageId||next.restarts!==0||next.state.OOMKilled!==false||next.state.Restarting||next.privileged!==false||next.pidMode==='host'||Object.values(next.networks??{}).length!==1
    ||Object.values(next.networks)[0].NetworkID!==this.preparation.hostSurface.ingressScope.networkId||!same(next.ports,{'3100/tcp':[{HostIp:'127.0.0.1',HostPort:'3100'}]}))fail('CANDIDATE_NATIVE_IDENTITY_CHANGED');
   const pin={id:next.id,image:next.imageId,startedAt:next.state.StartedAt};
   if(this.candidate&&(this.candidate.id!==pin.id||this.candidate.image!==pin.image||this.candidate.startedAt!=='0001-01-01T00:00:00Z'&&this.candidate.startedAt!==pin.startedAt))fail('SECOND_CANDIDATE_OR_RESTART');
   this.candidate=pin;
  }
  const permitted=new Set([pre.api.id,pre.web.id,pre.db.id,...this.resources.keys(),...(this.candidate?[this.candidate.id]:[])]);
  for(const actual of values){
   if(actual.privileged||actual.pidMode==='host'||actual.pidMode?.startsWith('container:')||actual.networkMode==='host'||actual.name.toLowerCase().includes('watchtower'))fail('SHARED_OR_UNMANAGED_EXECUTOR');
   const own=this.resources.get(actual.id);if(own)this.verifyResource(actual,own);
   else if(!permitted.has(actual.id)){
    const prior=this.baseline?.get(actual.id);
    if(!prior){
     const inert=this.preparation.hostSurface.inertArtifacts?.find(pin=>pin.id===actual.id),foreign=this.preparation.hostSurface.foreignContainerPins?.find(pin=>pin.id===actual.id);
     if(inert){if(canonicalDigest(actual)!==inert.identitySha256)fail('RETAINED_ARTIFACT_CHANGED');}
     else if(!foreign||foreign.identitySha256!==canonicalDigest(observeMaintenanceContainerIdentity(actual.id)))fail('UNREGISTERED_FOREIGN_CONTAINER');
    }else if(!same(prior,identity(actual)))fail('NEW_OR_CHANGED_FOREIGN_CONTAINER');
   }
  }
  const [network]=JSON.parse(this.run('/usr/bin/docker',['network','inspect',this.preparation.hostSurface.ingressScope.networkId]));
  if(Object.keys(network.Containers??{}).some(id=>!permitted.has(id)))fail('UNKNOWN_DATABASE_NETWORK_MEMBER');
  const next=values.find(value=>value.id===this.candidate?.id),address=next&&Object.values(next.networks)[0]?.IPAddress;
  if(['API_VERIFIED','OPEN_INTENT','OPEN_PUBLISHED','INGRESS_RELEASED','COMPLETED_OPEN'].includes(phase)
   &&(!next||next.state.Running!==true||next.state.Health?.Status!=='healthy'||!address))fail('VERIFIED_CANDIDATE_RUNTIME_LOST');
  const candidate=next?.state.Running&&address?{address,containerId:next.id,imageId:next.imageId,phase,nativePinSha256:canonicalDigest(identity(next))}:null;
  return {runtimeAddress,oldRuntimeStopped:!old?.state.Running,oldPresent:!!old,candidate};
 }
 #observeGoneFormalChild(row,root,census){
  const pin=root.pin,role=this.#reapRoles.get(root);
  if(!['FORMAL_API_BODY','FORMAL_COMPOSE'].includes(role)||this.runtime.isCommand(root)!==true||pin.parentPid!==process.pid)return null;
  const captured=entry=>entry&&Number.isSafeInteger(entry.pid)&&entry.pid>1&&
   ![pin.pid,process.pid,process.ppid,this.session?.child?.pid].includes(entry.pid)&&
   !this.readers.some(reader=>reader.entry.child.pid===entry.pid)&&census.get(entry.pid)===entry&&
   entry[STABLE_MODERN_CENSUS_PARENT]===true&&entry.pidNamespace===pin.pidNamespace&&
   nativeTicks(entry.startTicks)&&BigInt(entry.startTicks)>=BigInt(pin.startTicks);
  if(!captured(row))return null;
  const chain=[row];
  if(row.ppid!==pin.pid){
   // The formal Bash can run a short-lived helper with one child of its own.
   // Both must come from this census and the helper must be directly rooted.
   if(role!=='FORMAL_API_BODY')return null;
   const parent=census.get(row.ppid);
   if(!captured(parent)||parent.pid===row.pid||parent.ppid!==pin.pid||BigInt(parent.startTicks)>BigInt(row.startTicks))return null;
   chain.push(parent);
  }
  const pending=this.state.read();
  if(pending.owner!==this.context.owner||pending.phase!=='API_BODY'||pending.status!=='RUNNING')return null;
  const absent=entry=>{
   try{fs.lstatSync(`/proc/${entry.pid}`);return false;}
   catch(error){return ['ENOENT','ESRCH'].includes(error.code);}
  };
  if(!chain.every(absent))return null;
  let original;
  try{
   if(role==='FORMAL_COMPOSE')original=this.#verifyOriginalCompose(root);
   else{
    verifyModernSchemaChild(root,this.inspectProcess(pin.pid));
    assertOriginalModernSchemaProcess(linuxOnly(pin),{pid:pin.pid});
    original={pendingExit:null};
   }
  }catch{return null;}
  return original&&chain.every(absent)?original:null;
 }
 verifyProcesses(containers,initialize=false,proveLateCandidate){
  const namespaces=new Set();for(const value of containers)if(value.state.Running){try{namespaces.add(fs.readlinkSync(`/proc/${value.state.Pid}/ns/pid`));}catch{fail('NATIVE_CONTAINER_NAMESPACE_UNOBSERVABLE');}}
  const owned=this.runtime.registeredChildren();let pendingExit=null;
  const recordExit=exit=>{
   if(!exit)return;
   if(!pendingExit)pendingExit=exit;
   else for(const entry of exit.entries)pendingExit.entries.add(entry);
  };
  const rows=this.captureProcesses(),census=new Map();
  for(const row of rows)census.set(row.pid,census.has(row.pid)?null:row);
  for(const row of rows){
   if(row.pid===process.pid||row.pid===process.ppid||namespaces.has(row.pidNamespace))continue;
   const entry=owned.find(item=>item.pin.pid===row.pid);if(entry){
    try{verifyModernSchemaChild(entry,row);}catch(error){
     // Only this runtime's bounded commands may finish between the /proc
     // sweep and Node's exit callback. Persistent channels remain strict;
     // explicitly registered body stages must await the real event and rescan.
     const persistent=this.session?.child===entry.child||this.readers.some(reader=>reader.entry.child===entry.child);
     if(persistent||!isOriginalModernSchemaChildTerminal(entry))throw error;
     const role=this.#reapRoles.get(entry),phase=this.state.read().phase;
     const bodyPhase=role==='SCHEMA_DRIVER'?phase==='DDL_STARTED':phase==='API_BODY'&&['FORMAL_API_BODY','FORMAL_COMPOSE'].includes(role);
     if((bodyPhase&&this.runtime.isCommand?.(entry)===true)
      ||(['DDL_STARTED','API_BODY'].includes(phase)&&this.runtime.isClosingChannel?.(entry)===true)){
      recordExit(new PendingOriginalChildExit(entry,error));
      continue;
     }
     if(this.descendants.some(parent=>parent.child===entry.child)||this.runtime.isCommand?.(entry)!==true)throw error;
    }
    continue;
   }
   let descendant=false;for(const root of this.descendants){
    if(root.child.exitCode!==null||root.child.signalCode!==null)continue;
    let pinnedLive=false;
    try{
     verifyModernSchemaChild(root,this.inspectProcess(root.pin.pid));pinnedLive=true;
     assertOriginalModernSchemaProcess(linuxOnly(root.pin),{pid:row.pid});descendant=true;break;
    }catch{}
    // A sampled descendant may be gone before we walk its live ancestry.
    // The formal Bash still needs live proof. Only original Compose may use
    // the same strict native terminal proof as late candidate observation.
    if(!initialize&&(pinnedLive||root===this.composeChild)){
     const original=this.#observeGoneFormalChild(row,root,census);
     if(original){recordExit(original.pendingExit);descendant=true;break;}
    }
   }
   if(descendant||!potential(row))continue;const digest=canonicalDigest(row);
   if(initialize){if(!this.preparation.hostSurface.foreignProcessPins?.some(pin=>pin.pid===row.pid&&pin.identitySha256===digest))fail('UNREGISTERED_HOST_EXECUTOR');this.foreignProcesses.set(row.pid,digest);}
   else if(this.foreignProcesses.get(row.pid)!==digest&&proveLateCandidate?.(row)!==true)fail('NEW_OR_CHANGED_HOST_EXECUTOR');
  }
  if(pendingExit)throw pendingExit;
 }
 #verifyOriginalCompose(entry){
  const pending=this.state.read();
  if(pending.owner!==this.context.owner||pending.phase!=='API_BODY'||pending.status!=='RUNNING'||
   !entry||entry!==this.composeChild||this.#reapRoles.get(entry)!=='FORMAL_COMPOSE'||this.runtime.isCommand(entry)!==true||
   entry.child.exitCode!==null||entry.child.signalCode!==null||
   this.session?.child===entry.child||this.readers.some(reader=>reader.entry.child===entry.child))return null;
  try{
   verifyModernSchemaChild(entry,this.inspectProcess(entry.pin.pid));
   assertOriginalModernSchemaProcess(linuxOnly(entry.pin),{pid:entry.pin.pid});
   return {pendingExit:null};
  }catch(error){
   if(!isOriginalModernSchemaChildTerminal(entry))throw error;
   // Preserve the exact original identity long enough to classify this
   // census. Kernel termination is not a successful Compose result.
   return {pendingExit:new PendingOriginalChildExit(entry,error)};
  }
 }
 #refreshLateComposeCandidate(previous,row){
  const compose=this.composeChild,prior=this.candidate;
  if(!compose||this.#reapRoles.get(compose)!=='FORMAL_COMPOSE'||row.pidNamespace===compose.pin.pidNamespace||
   previous.some(container=>container.id===prior?.id&&container.state.Running))return null;
  const original=this.#verifyOriginalCompose(compose);
  if(!original)return null;
  const values=this.containers();
  let runtime,pin;
  try{runtime=this.verifyContainers(values);pin=this.candidate;}finally{this.candidate=prior;}
  if(!runtime.oldRuntimeStopped||!runtime.candidate||!pin)return null;
  const candidate=values.find(value=>value.id===pin.id);
  if(candidate.state.Paused!==false||!Number.isSafeInteger(candidate.state.Pid)||candidate.state.Pid<=1)return null;
  const originalId=this.preparation.originalSnapshot.containers.api.id;
  const others=list=>list.filter(value=>value.id!==originalId&&value.id!==candidate.id).map(identity);
  if(!same(others(previous),others(values)))fail('UNRELATED_CONTAINER_CHANGED_DURING_COMPOSE');
  const pid=candidate.state.Pid,init=this.inspectProcess(pid);
  if(init.pid!==pid||!init.exe||!nativeTicks(init.startTicks)||!/^[a-f0-9]{64}$/.test(init.cgroupSha256)||
   BigInt(init.startTicks)<BigInt(compose.pin.startTicks)||
   init.pidNamespace!==row.pidNamespace||init.pidNamespace===compose.pin.pidNamespace)return null;
  return {
   values,runtime,pin,
   proves:observation=>Number.isSafeInteger(observation.pid)&&observation.pid>1&&
    observation.pidNamespace===init.pidNamespace&&observation.cgroupSha256===init.cgroupSha256&&
    nativeTicks(observation.startTicks)&&BigInt(observation.startTicks)>=BigInt(init.startTicks)&&
    same(observation,this.inspectProcess(observation.pid)),
   confirm:()=>{
    const fresh=inspectModernSchemaContainer(candidate.id,this.run);
    if(!same(identity(fresh),identity(candidate))||fresh.state.OOMKilled!==false||fresh.state.Restarting!==false||fresh.state.Paused!==false||
     !same(init,this.inspectProcess(pid)))fail('LATE_COMPOSE_CANDIDATE_CHANGED_DURING_CENSUS');
    const current=this.#verifyOriginalCompose(compose);
    if(!current||(original.pendingExit&&!current.pendingExit))fail('LATE_COMPOSE_CANDIDATE_CHANGED_DURING_CENSUS');
    return current.pendingExit;
   },
  };
 }
 observeHostContainers(initialize=false){
  const values=this.containers(),runtime=this.verifyContainers(values);
  let attempted=false,late=null,pendingExit=null;
  try{
   this.verifyProcesses(values,initialize,row=>{
    // Retain this entire /proc census; only the independently verified late
    // candidate may account for rows missing from the first Docker snapshot.
    if(!attempted){attempted=true;late=this.#refreshLateComposeCandidate(values,row);}
    return late?.proves(row)===true;
   });
  }catch(error){
   if(!(error instanceof PendingOriginalChildExit))throw error;
   pendingExit=error;
  }
  const lateExit=late?.confirm();
  if(pendingExit&&lateExit)for(const entry of lateExit.entries)pendingExit.entries.add(entry);
  if(pendingExit||lateExit)throw pendingExit??lateExit;
  if(!late)return {values,runtime};
  this.candidate=late.pin;
  return {values:late.values,runtime:late.runtime};
 }
 serially(work){const result=this.serial.then(work);this.serial=result.catch(()=>{});return result;}
 startLeaseHeartbeat(onError){
  let pending=null,active=true;
  const timer=setInterval(()=>{
   if(!active||pending)return;
   pending=this.serially(async()=>{if(active)await this.check();})
    .catch(error=>{active=false;clearInterval(timer);onError(error);})
    .finally(()=>{pending=null;});
  },1000);
  return async()=>{active=false;clearInterval(timer);await pending;};
 }
 withNativeCreate(work){return this.serially(async()=>{await this.check();const result=await work();await this.check();return result;});}
 async observeHostAfterOriginalExit(work){
  const reaped=new Set();
  for(;;){
   try{return await this.session.withSynchronousObservation(work);}catch(error){
    if(!(error instanceof PendingOriginalChildExit))throw error;
    const deadline=performance.now()+3000;
    for(const {child} of error.entries){
     if(reaped.has(child)||reaped.size>=4)fail('ORIGINAL_CHILD_EXIT_UNRESOLVED');reaped.add(child);
     if(child.exitCode===null&&child.signalCode===null)await new Promise((resolve,reject)=>{
      const finish=()=>{clearTimeout(timer);resolve();},timer=setTimeout(()=>{child.removeListener('exit',finish);reject(Error('MODERN_SCHEMA_WATCH_HOLD=ORIGINAL_CHILD_EXIT_UNRESOLVED'));},Math.max(1,deadline-performance.now()));
      child.once('exit',finish);
     });
     if(child.exitCode!==0||child.signalCode!==null)fail('ORIGINAL_CHILD_EXIT_FAILED');
    }
    await this.check(); // New original-S/authority check, then a whole new census.
   }
  }
 }
 async closeBodyChannel(channel,options){
  await channel.drainForClose();return this.serially(()=>channel.close(options));
 }
 startBodyChannel(channel,entry){return this.serially(async()=>{
  const verify=()=>{
   const role=this.#reapRoles.get(entry),phase=this.state.read().phase;
   if(channel.runtime!==this.runtime||channel.owner!==this.context.owner||!((role==='SCHEMA_DRIVER'&&phase==='DDL_STARTED'&&channel.profile==='CONTROLLED_MIGRATION')
    ||(role==='FORMAL_API_BODY'&&phase==='SCHEMA_RECEIPTED'&&channel.profile==='FORMAL_API')))fail('EXACT_ORIGINAL_CHANNEL_STAGE_REQUIRED');
   verifyModernSchemaChild(entry,this.inspectProcess(entry.pin.pid));
  };
  await this.check();verify();await channel.start(entry);await this.check();verify();channel.assertReadyOriginalBody(entry);
 });}
 observe(initialize=false){return this.serially(()=>this.observeNative(initialize));}
 async observeNative(initialize=false){
  await this.check();
  const {values,runtime,schedulers}=await this.observeHostAfterOriginalExit(()=>{
   this.runtime.guard();this.assertHealthy();
   if(this.state.read().status!=='RUNNING')fail('RUNNING_ORIGINAL_OBSERVATION_REQUIRED');
   const {values,runtime}=this.observeHostContainers(initialize);
   const schedulers=captureMaintenanceSchedulers({includeDatabaseEntrypoints:true});if(canonicalDigest(schedulers)!==this.preparation.hostSurface.schedulerSha256||schedulers.some(value=>value.erpControlReference))fail('SCHEDULER_DEFINITION_CHANGED_OR_UNACCOUNTED');
   return {values,runtime,schedulers};
  });
  for(const reader of this.readers){if(reader.client.broken)fail('OWNED_READ_TRANSPORT_LOST');verifyModernSchemaChild(reader.entry,this.inspectProcess(reader.entry.pin.pid));}
  const {rows:[{observation}]}=await this.client.query(MODERN_SCHEMA_EXECUTOR_SQL),database=JSON.parse(observation),ownedReadSessions=this.readers.map(reader=>reader.pin);
  if(this.readCommand){
   const matches=database.sessions.filter(row=>row.applicationName===this.readCommand.applicationName&&row.clientAddress===null);
   const child=this.readCommand.entry.child,finished=child.exitCode!==null||child.signalCode!==null;
   if(finished){if(child.exitCode!==0||child.signalCode||matches.length)fail('REMOTE_READONLY_BACKUP_RESULT_UNRESOLVED');}
   else verifyModernSchemaChild(this.readCommand.entry,this.inspectProcess(this.readCommand.entry.pin.pid));
   if(matches.length>1)fail('SECOND_READONLY_BACKUP_EXECUTOR');
   if(matches.length){const actual=matches[0],pin={pid:actual.pid,databaseOid:actual.databaseOid,backendStartMicros:actual.backendStartMicros,nativeProofSha256:canonicalDigest({pid:actual.pid,databaseOid:actual.databaseOid,backendStartMicros:actual.backendStartMicros,applicationName:actual.applicationName,clientAddress:actual.clientAddress,child:this.readCommand.entry.pin})};
    if(this.readCommand.native&&!same(this.readCommand.native,pin))fail('READONLY_BACKUP_BACKEND_CHANGED');this.readCommand.native??=pin;ownedReadSessions.push(pin);}
  }
  let migration=this.migration;
  if(!migration){
   for(const resource of this.resources.values()){
    if(!resource.role?.startsWith('controlled-migration-'))continue;const actual=values.find(row=>row.id===resource.containerId);if(!actual?.state.Running)continue;
    if(fs.existsSync(path.join(resource.gateDirectory,'permit.json')))fail('PERMITTED_BACKEND_NOT_NATIVELY_REGISTERED');
    const preload=fs.readFileSync(path.join(resource.gateDirectory,'preload.cjs'));if(createHash('sha256').update(preload).digest('hex')!==resource.preloadSha256)fail('ORIGINAL_GATE_PROGRAM_CHANGED');
    const address=Object.values(actual.networks)[0]?.IPAddress,app=`phoenix-schema-${this.context.owner}-${resource.mode}`;
    const matches=database.sessions.filter(row=>row.clientAddress===address&&row.applicationName===app);
    if(matches.length>1)fail('SECOND_WAITING_MIGRATION_BACKEND');if(!matches.length)continue;const found=matches[0];if(found.openTransaction)fail('UNPERMITTED_MIGRATION_TRANSACTION');
    migration={address,sessionPid:found.pid,backendStartMicros:found.backendStartMicros,applicationName:app,containerIdentityVerified:true,containerId:resource.containerId};
    if(this.waitingMigration&&!same(this.waitingMigration,migration))fail('WAITING_MIGRATION_BACKEND_CHANGED');this.waitingMigration??=migration;
   }
  }
  const executors=classifyModernSchemaDatabaseExecutors(database,{...runtime,originalLease:this.rootLease,migration,ownedReadSessions});
  await this.check();if(initialize)this.baseline=new Map(values.map(value=>[value.id,identity(value)]));this.last={schema:'phoenix.modern-schema-original-session-observation/v1',owner:this.context.owner,contextDigest:canonicalDigest(this.context),phase:this.state.read().phase,
   executors,containersSha256:canonicalDigest(values.map(identity)),schedulerSha256:canonicalDigest(schedulers),oldRuntimeStopped:runtime.oldRuntimeStopped,
   candidate:this.candidate,checkedAt:new Date().toISOString(),model:'TRUSTED_ROOT_FD9_EXCLUSIVE_WRITER'};return this.last;
 }
 async initialize(){return this.observe(true);}
 observeRecoveryHost(admit){return this.serially(async()=>{
  this.runtime.guard();const pending=this.state.read();
  if(this.running||!['R_STOPPED','FRESH_RECHECKED','BACKUP_VERIFIED'].includes(pending.phase)||pending.status!=='HOLD'||this.state.ddlIntentExists()||typeof admit!=='function'||await admit()!==true)fail('SAME_LEASE_PRE_DDL_RECOVERY_HOST_REQUIRED');
  const values=this.containers(),pre=this.preparation.originalSnapshot.containers,known=new Set([pre.api.id,pre.web.id,pre.db.id,...this.resources.keys()]);
  this.#verifyRetainedInventory(values);
  for(const value of values){
   if(value.privileged||value.pidMode==='host'||value.pidMode?.startsWith('container:')||value.networkMode==='host'||value.name.toLowerCase().includes('watchtower'))fail('RECOVERY_UNKNOWN_SHARED_EXECUTOR');
   const own=this.resources.get(value.id);if(own){this.verifyResource(value,own);continue;}
   if(value.id===pre.api.id){
    const baseline=structuredClone(this.baseline.get(value.id)),current=identity(value);for(const key of ['startedAt','running','pid','restartPolicy','networks']){delete baseline[key];delete current[key];}
    if(!same(baseline,current)||value.state.OOMKilled!==false||value.state.Restarting||value.state.Paused)fail('RECOVERY_ORIGINAL_RUNTIME_STATIC_IDENTITY_CHANGED');
    const endpoints=Object.values(value.networks??{});if(endpoints.length!==1||(endpoints[0].NetworkID!==this.preparation.ingressScope.networkId&&(value.state.Running||endpoints[0].NetworkID!=='')))fail('RECOVERY_ORIGINAL_NETWORK_CHANGED');
    if(value.state.Running&&value.state.StartedAt!==pre.api.startedAt){
     const file=path.join(this.runtime.directory,`schema-release-original-recovery-intent-${this.context.owner}.json`),intent=JSON.parse(readPinnedFile(file,{contract:CONTRACT}));
     if(intent.owner!==this.context.owner||intent.contextDigest!==canonicalDigest(this.context)||intent.originalContainerId!==pre.api.id||intent.originalImageId!==pre.api.image)fail('CONTROLLED_ORIGINAL_RESTART_INTENT_REQUIRED');
    }
   }else if([pre.web.id,pre.db.id].includes(value.id)){
    if(!same(this.baseline.get(value.id),identity(value))||!value.state.Running||value.state.Health?.Status!=='healthy')fail('RECOVERY_WEB_DATABASE_CHANGED');
   }else if(!this.baseline.has(value.id)||!same(this.baseline.get(value.id),identity(value)))fail('RECOVERY_FOREIGN_EXECUTOR_CHANGED');
  }
  if(![pre.api.id,pre.web.id,pre.db.id].every(id=>values.some(value=>value.id===id)))fail('RECOVERY_ORIGINAL_CONTAINERS_MISSING');
  const [network]=JSON.parse(this.run('/usr/bin/docker',['network','inspect',this.preparation.hostSurface.ingressScope.networkId]));
  if(Object.keys(network.Containers??{}).some(id=>!known.has(id)))fail('RECOVERY_UNKNOWN_DATABASE_NETWORK_MEMBER');
  this.verifyProcesses(values);
  const schedulers=captureMaintenanceSchedulers({includeDatabaseEntrypoints:true});if(canonicalDigest(schedulers)!==this.preparation.hostSurface.schedulerSha256)fail('RECOVERY_SCHEDULER_CHANGED');
  if(await admit()!==true)fail('SAME_LEASE_PRE_DDL_RECOVERY_HOST_REQUIRED');this.runtime.guard();return true;
 });}
 start(){
  if(this.running||!this.baseline)fail('SINGLE_INITIALIZED_WATCH_REQUIRED');this.running=true;
  const next=()=>{if(!this.running)return;this.timer=setTimeout(()=>{
   this.pending=this.observe().catch(error=>{this.failed??=error;this.running=false;}).finally(next);
  },500);};next();
 }
 async stop(){this.running=false;clearTimeout(this.timer);await this.pending;if(this.failed)throw this.failed;}
 assertHealthy(){if(this.failed)throw this.failed;return true;}
}
