import {heldCapsulePin,oldResourceOwner,readHeldCapsules,verifyHeldIsolation} from './production-remediation-held-resources.mjs';
/** Fixed supported host surface. Unknown database clients, ERP containers,
 * schedulers, shared networks or host executors HOLD before stopping R.
 * Trusted root/FD9 model; this is not resistance to arbitrary hostile root. */
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {CONTRACT,verifyContext,secureJson} from './production-config-guard.mjs';import {executionEnv} from './capture-production-runtime.mjs';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {compileOwnedIngressRules} from './maintenance-ingress-policy.mjs';
import {captureMaintenanceSchedulers,observeMaintenanceProcessIdentity,observeMaintenanceContainerIdentity,captureModernSchemaProcessIdentities} from './production-maintenance-root-readers.mjs';
import {verifyModernSchemaChild} from './production-modern-schema-processes.mjs';
import {collectRetainedModernSchemaInventory,retainedModernSchemaInventorySlot} from './production-modern-schema-inventory.mjs';
import {isFailedModernSchemaPreparation} from './production-modern-schema-public-preparation.mjs';
import {matchesModernSchemaRehearsalVolume} from './production-modern-schema-postgres.mjs';
import {collectHistoricalComposeSchemaArtifacts,isHistoricalComposeSchemaCandidate} from './production-modern-schema-historical-compose.mjs';
import {successorBinding,validateSuccessorInspection} from './production-modern-schema-successor.mjs';
const fail=code=>{throw Error('MODERN_SCHEMA_EXECUTORS_HOLD='+code);};
const ID=/^[a-f0-9]{64}$/;
const RETAINED_REHEARSAL_OWNER='REVIEWED_STOPPED_ISOLATED_REHEARSAL';
const ipv4=value=>typeof value==='string'&&value.split('.').length===4&&value.split('.').every(part=>/^(?:0|[1-9][0-9]{0,2})$/.test(part)&&Number(part)<=255);
const run=(binary,args)=>{try{return execFileSync(binary,args,{env:executionEnv(),encoding:'utf8',timeout:10000,maxBuffer:2*1024*1024,stdio:['ignore','pipe','pipe']}).trim();}catch{fail('SURFACE_OBSERVATION_UNAVAILABLE');}};
export const MODERN_SCHEMA_EXECUTOR_SQL=`SELECT jsonb_build_object(
 'databaseOid',(SELECT oid::bigint FROM pg_database WHERE datname=current_database()),
 'systemIdentifier',(SELECT system_identifier::text FROM pg_control_system()),
 'postmasterStartMicros',trunc(extract(epoch FROM pg_postmaster_start_time())*1000000)::text,'primary',NOT pg_is_in_recovery(),
 'enabledSubscriptions',(SELECT count(*)::int FROM pg_subscription WHERE subenabled),
 'workers',COALESCE((SELECT jsonb_agg(jsonb_build_object('pid',pid,'leaderPid',leader_pid,'databaseOid',datid::bigint,'type',backend_type) ORDER BY pid)
  FROM pg_stat_activity WHERE backend_type NOT IN ('client backend','autovacuum launcher','autovacuum worker','background writer','checkpointer','startup','walwriter','walsender','walreceiver','archiver','summarizer','slotsync worker','walsummarizer','io worker','logical replication launcher')),'[]'::jsonb),
 'statsComplete',((SELECT rolsuper FROM pg_roles WHERE rolname=current_user) OR pg_has_role(current_user,'pg_read_all_stats','USAGE')),
 'observerPid',pg_backend_pid(),'preparedTransactions',(SELECT count(*)::int FROM pg_prepared_xacts),
 'sessions',COALESCE((SELECT jsonb_agg(jsonb_build_object('pid',pid,'databaseOid',datid::bigint,
  'backendStartMicros',trunc(extract(epoch FROM backend_start)*1000000)::text,'clientAddress',pg_catalog.host(client_addr),
  'openTransaction',xact_start IS NOT NULL,'applicationName',application_name) ORDER BY pid)
  FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid()),'[]'::jsonb))::text AS observation;`;
export function classifyModernSchemaDatabaseExecutors(value,{runtimeAddress,originalLease=null,oldRuntimeStopped=false,migration=null,ownedReadSessions=[],candidate=null}){
 if(!value||value.primary!==true||value.statsComplete!==true||!Number.isSafeInteger(value.databaseOid)||value.databaseOid<1||value.preparedTransactions!==0
  ||value.enabledSubscriptions!==0||!Array.isArray(value.workers)||!Array.isArray(value.sessions)||!Number.isSafeInteger(value.observerPid)||value.observerPid<2||!ipv4(runtimeAddress))fail('COMPLETE_DATABASE_VISIBILITY_REQUIRED');
 if(oldRuntimeStopped&&!originalLease)fail('ORIGINAL_CONTROL_LEASE_REQUIRED');
 if(originalLease&&(originalLease.database.databaseOid!==value.databaseOid||originalLease.database.systemIdentifier!==value.systemIdentifier||originalLease.database.postmasterStartMicros!==value.postmasterStartMicros))fail('ORIGINAL_PRIMARY_IDENTITY_CHANGED');
 if(migration&&(!ipv4(migration.address)||!Number.isSafeInteger(migration.sessionPid)||migration.sessionPid<2||!/^[1-9][0-9]{0,19}$/.test(migration.backendStartMicros??'')
   ||migration.containerIdentityVerified!==true||typeof migration.applicationName!=='string'||!migration.applicationName))fail('NATIVE_MIGRATION_BACKEND_REQUIRED');
 if(candidate&&(!oldRuntimeStopped||!ipv4(candidate.address)||!ID.test(candidate.containerId??'')||!/^sha256:[a-f0-9]{64}$/.test(candidate.imageId??'')
  ||!/^[a-f0-9]{64}$/.test(candidate.nativePinSha256??'')||!['API_BODY','API_VERIFIED','OPEN_INTENT','OPEN_PUBLISHED','INGRESS_RELEASED','COMPLETED_OPEN'].includes(candidate.phase)))fail('NATIVE_CONTROLLED_CANDIDATE_REQUIRED');
 const seen=new Set(),runtime=[],controls=[],migrators=[];
 if(!Array.isArray(ownedReadSessions)||ownedReadSessions.some(pin=>!Number.isSafeInteger(pin?.pid)||pin.pid<2||pin.databaseOid!==value.databaseOid||typeof pin.backendStartMicros!=='string'
  ||!/^[1-9][0-9]{0,19}$/.test(pin.backendStartMicros)||!/^[a-f0-9]{64}$/.test(pin.nativeProofSha256??'')))fail('EXACT_OWNED_READONLY_SESSION_REQUIRED');
 for(const session of value.sessions){
  if(!Number.isSafeInteger(session.pid)||session.pid<1||seen.has(session.pid)||session.databaseOid!==value.databaseOid
   ||!/^[1-9][0-9]{0,19}$/.test(session.backendStartMicros??''))fail('UNKNOWN_OR_CROSS_DATABASE_CLIENT');seen.add(session.pid);
  if(originalLease&&session.pid===originalLease.sessionPid&&session.backendStartMicros===originalLease.backendStartMicros
    &&session.databaseOid===originalLease.database.databaseOid&&session.clientAddress===null){controls.push(session.pid);continue;}
  if(ownedReadSessions.some(pin=>pin.pid===session.pid&&pin.backendStartMicros===session.backendStartMicros&&pin.databaseOid===session.databaseOid&&session.clientAddress===null))continue;
  if(!oldRuntimeStopped&&session.clientAddress===runtimeAddress){runtime.push(session.pid);continue;}
  if(candidate&&session.clientAddress===candidate.address){runtime.push(session.pid);continue;}
  if(migration&&migration.containerIdentityVerified===true&&session.pid===migration.sessionPid&&session.backendStartMicros===migration.backendStartMicros
   &&session.clientAddress===migration.address&&session.applicationName===migration.applicationName){migrators.push(session.pid);continue;}
  fail('UNKNOWN_OR_NEW_DATABASE_EXECUTOR');
 }
 if(originalLease&&controls.length!==1)fail('ORIGINAL_CONTROL_SESSION_MISSING');
 if(oldRuntimeStopped&&!candidate&&runtime.length)fail('ORIGINAL_API_DATABASE_SESSIONS_REMAIN');
 for(const worker of value.workers){
  if(worker.type!=='parallel worker'||worker.databaseOid!==value.databaseOid||!Number.isSafeInteger(worker.pid)||!Number.isSafeInteger(worker.leaderPid)
   ||![...runtime,...migrators].includes(worker.leaderPid))fail('UNKNOWN_DATABASE_APPLY_OR_EXTENSION_WORKER');
 }
 return {complete:true,databaseOid:value.databaseOid,observerPid:value.observerPid,runtimeSessionPids:runtime,originalControlSessionPids:controls,migrationSessionPids:migrators,
  preparedTransactions:0,unknownExecutors:0,observationSha256:canonicalDigest(value)};
}
const containerInspectFormat='{{json .Id}}\t{{json .Image}}\t{{json .Name}}\t{{json .State}}\t{{json .RestartCount}}\t{{json .HostConfig.NetworkMode}}\t{{json .HostConfig.PortBindings}}\t{{json .NetworkSettings.Networks}}\t{{json .Config.Labels}}\t{{json .Mounts}}\t{{json .HostConfig.Privileged}}\t{{json .HostConfig.PidMode}}\t{{json .HostConfig.ReadonlyRootfs}}\t{{json .HostConfig.CapDrop}}\t{{json .Config.User}}\t{{json .HostConfig.RestartPolicy}}\t{{json .Config.Entrypoint}}\t{{json .Config.Cmd}}';
function decodeModernSchemaContainer(id,row){
 const fields=row.split('\t').map(JSON.parse);
 const [actual,imageId,name,state,restarts,networkMode,ports,networks,labels,mounts,privileged,pidMode,readonly,capDrop,user,restartPolicy,entrypoint,cmd]=fields;
 if(actual!==id||!ID.test(id)||!/^sha256:[a-f0-9]{64}$/.test(imageId)||!state||!Array.isArray(mounts))fail('CONTAINER_IDENTITY_REQUIRED');
 const orderedMounts=mounts.map(mount=>({mount,digest:canonicalDigest(mount)}))
  .sort((a,b)=>a.digest.localeCompare(b.digest)).map(({mount})=>mount);
 return {id,imageId,name,state,restarts,networkMode,ports,networks,labels,mounts:orderedMounts,privileged,pidMode,readonly,capDrop,user,restartPolicy,entrypoint,cmd};
}

export function inspectModernSchemaContainer(id,command=run){
 return decodeModernSchemaContainer(id,command('/usr/bin/docker',['inspect',id,'--format',containerInspectFormat]));
}

/** Keep each native inventory result exact while sharing one Docker client
 * across a small group of IDs. The same per-container decoder is used. */
export function inspectModernSchemaContainers(ids,command=run){
 if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(id=>!ID.test(id??'')))fail('CONTAINER_IDENTITY_REQUIRED');
 const containers=[];
 const batchSize=16;
 for(let first=0;first<ids.length;first+=batchSize){
  const group=ids.slice(first,first+batchSize);
  const rows=command('/usr/bin/docker',['inspect','--type','container','--format',containerInspectFormat,...group]).split('\n');
  if(rows.length!==group.length)fail('CONTAINER_IDENTITY_REQUIRED');
  for(const [index,id] of group.entries())containers.push(decodeModernSchemaContainer(id,rows[index]));
 }
 return containers;
}

function retainFailedPreparationRehearsal({owner,directory,rehearsal,receipt,record,container},read,lstat){
 const file=name=>path.join(directory,name);
 const transport=file(`.transport-${owner}-prepare.receipt`);
 const exists=name=>Boolean(lstat(file(name),{throwIfNoEntry:false}));
 const failed=read(transport);
 const backup=read(file(`schema-release-prepare-backup-${owner}/backup-receipt.json`));
 const records=['rehearsal-database','rehearsal-migration-show','rehearsal-migration-run','rehearsal-original-api','rehearsal-candidate-api'];
 const expected=receipt.resources;
 const ended=Date.parse(container.state?.FinishedAt),sealed=lstat(transport).mtimeMs;
 if(!isFailedModernSchemaPreparation(failed,{owner,targetSha:receipt.targetSha})||
  failed.failure!=='HOST_SURFACE_FOREIGN_CONTAINER_OWNERSHIP_UNVERIFIED'||
  [`schema-release-preparation-${owner}.json`,`.transport-${owner}-run.receipt`,`schema-release-consumed-${owner}.json`,
   `schema-release-identity-${owner}.json`,`schema-release-approval-${owner}.json`].some(exists)||
  backup.schema!=='phoenix.modern-schema-protected-backup/v1'||backup.owner!==owner||backup.stage!=='prepare'||
  backup.format!=='POSTGRES_CUSTOM'||backup.productionRestore!==false||backup.tocVerified!==true||backup.fullParseVerified!==true||
  !ID.test(backup.backup?.sha256??'')||backup.backup.sha256!==receipt.backupSha256||
  !ID.test(backup.sourceLedgerSha256??'')||backup.sourceLedgerSha256!==receipt.beforeLedgerSha256||
  receipt.businessFactsUnchanged!==true||receipt.originalRuntimeReady!==true||receipt.candidateReady!==true||
  !Array.isArray(expected)||expected.length!==records.length||!same(expected.map(pin=>pin.role).sort(),records.sort())||
  new Set(expected.map(pin=>pin.containerId)).size!==records.length||
  !expected.every(pin=>{
   if(!ID.test(pin.containerId??'')||pin.owner!==owner||pin.stage!=='prepare'||pin.networkId!==record.networkId||pin.volume!==record.volume)return false;
   const created=path.join(rehearsal,`created-${pin.containerId}.json`);
   return Boolean(lstat(created,{throwIfNoEntry:false}))&&same(read(created),pin);
  })||
  expected.find(pin=>pin.role==='rehearsal-candidate-api').imageId!==receipt.candidateImageId||
  !Number.isFinite(ended)||!Number.isFinite(sealed)||ended>sealed||lstat(path.join(rehearsal,'rehearsal-receipt.json')).mtimeMs>sealed)
  fail('RETAINED_REHEARSAL_API_FAILED_PREPARATION_UNVERIFIED');
 for(const [role,revision,imageKey] of [['original-api',receipt.runtimeSha,'originalRuntimeProofSha256'],
  ['candidate-api',receipt.targetSha,'candidateRuntimeProofSha256']]){
  const owned=expected.find(pin=>pin.role==='rehearsal-'+role);
  const proof=read(path.join(rehearsal,role+'-runtime-proof.json'));
  if(proof?.role!==role||proof.revision!==revision||proof.containerId!==owned.containerId||proof.imageId!==owned.imageId||
   proof.cleanTerm!==true||proof.crossedCronMinute!==true||proof.backgroundWrites!==0||
   !Number.isFinite(Date.parse(proof.startedAt))||Date.parse(proof.startedAt)>sealed||canonicalDigest(proof)!==receipt[imageKey])
   fail('RETAINED_REHEARSAL_API_FAILED_PREPARATION_UNVERIFIED');
 }
 return {failedPreparationRehearsalSha256:canonicalDigest({receipt:failed,backupSha256:canonicalDigest(backup),rehearsalSha256:canonicalDigest(receipt)})};
}

export function collectReviewedRetainedRehearsalApi(container,{owner,networkId,targetSha,registration},dependencies={}){
 const formerOwner=container.labels?.['phoenix.schema.owner'],role=container.labels?.['phoenix.schema.role'];
 const runtimeRole=role?.slice('rehearsal-'.length),state=container.state;
 if(!ID.test(container.id??'')||!['rehearsal-original-api','rehearsal-candidate-api'].includes(role)||!/^[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$/.test(formerOwner??'')||formerOwner===owner||
  registration?.id!==container.id||registration.owner!==RETAINED_REHEARSAL_OWNER||!ID.test(registration.identitySha256??'')||
  container.labels?.['com.docker.compose.project']||container.privileged!==false||container.pidMode!==''||container.restarts!==0||
  container.restartPolicy?.Name!=='no'||container.readonly!==true||container.user!=='phoenix'||!same(container.capDrop,['ALL'])||
  !same(container.entrypoint,['/sbin/tini'])||!same(container.cmd,['--','node','dist/main'])||Object.keys(container.ports??{}).length||
  state?.Running!==false||state.Status!=='exited'||state.ExitCode!==0||state.Pid!==0||state.OOMKilled!==false||state.Restarting!==false||state.Paused!==false){
  fail('RETAINED_REHEARSAL_API_UNVERIFIED');
 }
 const directory=dependencies.directory??CONTRACT.stateDirectory,read=dependencies.readJson??secureJson,command=dependencies.run??run;
 const rehearsal=path.join(directory,`schema-release-prepare-rehearsal-${formerOwner}`),mount=container.mounts[0];
 if(container.mounts.length!==1||mount.Type!=='bind'||mount.Source!==path.join(rehearsal,'control-'+runtimeRole)||
  mount.Destination!=='/run/phoenix-background-control'||mount.RW!==false)fail('RETAINED_REHEARSAL_API_MOUNT_CHANGED');
 const preparedPath=path.join(directory,`schema-release-preparation-${formerOwner}.json`);
 const lstat=dependencies.lstat??fs.lstatSync;
 const receipt=read(path.join(rehearsal,'rehearsal-receipt.json'));
 const record=read(path.join(rehearsal,`created-${container.id}.json`));
 const proof=read(path.join(rehearsal,`${runtimeRole}-runtime-proof.json`));
 const original=role==='rehearsal-original-api',revision=original?receipt.runtimeSha:receipt.targetSha;
 if(receipt.schema!=='phoenix.modern-schema-isolated-rehearsal/v1'||
  receipt.owner!==formerOwner||receipt.outcome!=='PASS'||receipt.isolatedRestore!==true||receipt.productionMutation!==false||receipt.backgroundWrites!==0||
  !Array.isArray(receipt.resources)||receipt.resources.filter(item=>item.containerId===container.id).length!==1||
  !same(receipt.resources.find(item=>item.containerId===container.id),record)||record.role!==role||record.owner!==formerOwner||record.stage!=='prepare'||
  record.imageId!==container.imageId||record.networkId!==container.networkMode||record.networkId===networkId||!ID.test(record.networkId??'')||
  !/^[a-f0-9]{40}$/.test(revision??'')||!/^[a-f0-9]{40}$/.test(receipt.targetSha??'')||!/^[a-f0-9]{40}$/.test(targetSha??'')||
  canonicalDigest(proof)!==(original?receipt.originalRuntimeProofSha256:receipt.candidateRuntimeProofSha256)||proof.role!==runtimeRole||
  proof.containerId!==container.id||proof.imageId!==container.imageId||proof.revision!==revision||proof.startedAt!==state.StartedAt||
  proof.cleanTerm!==true||proof.crossedCronMinute!==true||proof.backgroundWrites!==0)fail('RETAINED_REHEARSAL_API_RECEIPT_CHANGED');
 let provenance;
 if(lstat(preparedPath,{throwIfNoEntry:false})){
  const prepared=read(preparedPath),{preparationSha256,...preparation}=prepared;
  if(preparationSha256!==canonicalDigest(preparation)||prepared.context?.owner!==formerOwner||
   prepared.context.targetSha!==receipt.targetSha||prepared.rehearsalDirectory!==rehearsal||!same(prepared.oldRuntimeCompatibility,receipt))
   fail('RETAINED_REHEARSAL_API_RECEIPT_CHANGED');
  provenance={preparationSha256};
 }else{
  provenance=retainFailedPreparationRehearsal({owner:formerOwner,directory,rehearsal,receipt,record,container},read,lstat);
 }
 const [network]=JSON.parse(command('/usr/bin/docker',['network','inspect',record.networkId]));
 if(network?.Id!==record.networkId||network.Internal!==true||network.EnableIPv6!==false||network.Driver!=='bridge'||
  network.Labels?.['phoenix.schema.owner']!==formerOwner||network.Labels?.['phoenix.schema.role']!=='rehearsal-network'||
  Object.keys(network.Containers??{}).length)fail('RETAINED_REHEARSAL_API_NETWORK_CHANGED');
 if(command('/usr/bin/docker',['image','inspect',container.imageId,'--format','{{index .Config.Labels "org.opencontainers.image.revision"}}'])!==revision)fail('RETAINED_REHEARSAL_API_SOURCE_CHANGED');
 command('/usr/bin/git',['-c',`safe.directory=${CONTRACT.repository}`,'-C',CONTRACT.repository,'merge-base','--is-ancestor',receipt.targetSha,targetSha]);
 return {id:container.id,identitySha256:canonicalDigest(container),classification:'RETAINED_REVIEWED_REHEARSAL_API',formerOwner,revision,...provenance};
}
export function collectModernSchemaHostSurface(preSnapshot,dependencies={}){
 const guard=dependencies.guard??(()=>verifyContext(CONTRACT.repository,CONTRACT.stateDirectory)),command=dependencies.run??run;
 guard();const pre=preSnapshot?.containers;if(!pre||!['api','web','db'].every(service=>ID.test(pre[service]?.id??'')))fail('EXACT_THREE_RUNTIME_PINS_REQUIRED');
 const actual=Object.fromEntries(['api','web','db'].map(service=>[service,inspectModernSchemaContainer(pre[service].id,command)]));
 for(const service of ['api','web','db'])if(actual[service].imageId!==pre[service].image||actual[service].state.StartedAt!==pre[service].startedAt||actual[service].restarts!==pre[service].restartCount
  ||actual[service].state.Running!==true||actual[service].state.Health?.Status!=='healthy')fail('RUNTIME_MOVED_BEFORE_STOP');
 const endpoints=Object.values(actual.api.networks??{});if(endpoints.length!==1||!ID.test(endpoints[0].NetworkID??'')||!endpoints[0].IPAddress||endpoints[0].GlobalIPv6Address)fail('SINGLE_IPV4_RUNTIME_NETWORK_REQUIRED');
 const networkId=endpoints[0].NetworkID;
 const [network]=JSON.parse(command('/usr/bin/docker',['network','inspect',networkId]));
 if(network.Id!==networkId||network.Driver!=='bridge'||network.Scope!=='local'||network.EnableIPv6!==false||network.IPAM?.Config?.length!==1
  ||network.Labels?.['com.docker.compose.project']!=='phoenix-erp'||!same(Object.keys(network.Containers??{}).sort(),['api','web','db'].map(s=>pre[s].id).sort()))fail('EXCLUSIVE_THREE_MEMBER_NETWORK_REQUIRED');
 for(const service of ['api','web','db'])if(Object.values(actual[service].networks??{}).length!==1||Object.values(actual[service].networks)[0].NetworkID!==networkId)fail('RUNTIME_NETWORK_CHANGED');
 if(!same(actual.api.ports,{'3100/tcp':[{HostIp:'127.0.0.1',HostPort:'3100'}]})||Object.keys(actual.db.ports??{}).join(',')!=='5432/tcp'
  ||actual.db.ports['5432/tcp']?.length!==1||actual.db.ports['5432/tcp'][0].HostIp!=='127.0.0.1'||!/^\d{1,5}$/.test(actual.db.ports['5432/tcp'][0].HostPort))fail('EXCLUSIVE_LOOPBACK_DATABASE_AND_API_PORTS_REQUIRED');
 const bridge=network.Options?.['com.docker.network.bridge.name']||'br-'+networkId.slice(0,12),subnet=network.IPAM.Config[0].Subnet;
 const links=JSON.parse(command('/usr/sbin/ip',['-json','-details','link','show','dev',bridge]));
 if(links.length!==1||links[0].ifname!==bridge||links[0].linkinfo?.info_kind!=='bridge'||!Number.isSafeInteger(links[0].ifindex)||links[0].ifindex<1)fail('EXACT_BRIDGE_REQUIRED');
 const ingressScope={networkId,bridge,interfaceIndex:links[0].ifindex,subnet,port:3100};compileOwnedIngressRules({owner:'a'.repeat(32),bridge,subnet,port:3100});
 const ipv6=command('/usr/bin/docker',['exec',pre.api.id,'node','-e',"const fs=require('fs');const rows=fs.readFileSync('/proc/net/if_inet6','utf8').trim().split('\\n').filter(Boolean);process.stdout.write(JSON.stringify({nonLoopback:rows.filter(row=>row.trim().split(/\\s+/).at(-1)!=='lo').length}));"]);
 if(JSON.parse(ipv6).nonLoopback!==0)fail('UNFENCED_NONLOOPBACK_IPV6');
 let registry;
 const ownership=()=>{
  registry??=(dependencies.readOwnership??(()=>secureJson(path.join(CONTRACT.stateDirectory,'maintenance-host-ownership-registry.json'))))();
  if(registry?.schema!=='phoenix.maintenance-reviewed-host-ownership/v1'||!/^[a-f0-9]{64}$/.test(registry.evidenceSha256??'')||!Array.isArray(registry.containers)||!Array.isArray(registry.hostProcesses))fail('REVIEWED_HOST_OWNERSHIP_UNAVAILABLE');return registry;
 };
 const holdStore=dependencies.successorStore;
 const held=holdStore?.exists('schema-release-1123-handoff-45144287071-1.json')?readHeldCapsules(holdStore,preSnapshot.targetSha):null;
 const all=command('/usr/bin/docker',['ps','-a','--no-trunc','-q']).split('\n').filter(Boolean),known=new Set(Object.values(pre).map(pin=>pin.id)),namespaces=new Set(),inertArtifacts=[],retainedOwners=new Set(),foreignContainerPins=[],historicalCompose=[];
 for(const id of all){const candidate=Object.values(actual).find(value=>value.id===id)??inspectModernSchemaContainer(id,command);
  if(candidate.privileged!==false||candidate.pidMode==='host'||candidate.pidMode?.startsWith('container:')||candidate.networkMode==='host'||candidate.name.toLowerCase().includes('watchtower'))fail('SHARED_OR_UNMANAGED_CONTAINER_EXECUTOR');
  if(candidate.state.Running){try{namespaces.add(fs.readlinkSync(`/proc/${candidate.state.Pid}/ns/pid`));}catch{fail('CONTAINER_PID_NAMESPACE_UNOBSERVABLE');}}
  if(known.has(id))continue;
  if(isHistoricalComposeSchemaCandidate(candidate)){historicalCompose.push(candidate);continue;}
  // Retained old schema-first containers are inert artifacts, not adopted
  // writers. Exact reviewed argv, no restart/namespace sharing/mounts, native
  // stopped PID and a source ancestor are all required; scheduler checks below
  // still deny local automatic activation. Re-observation binds the full pin.
  if(/^\/phoenix-migrate-schema-first-[a-z0-9]{8}(?:-show)?$/.test(candidate.name)&&candidate.state.Status==='exited'&&candidate.state.Running===false&&candidate.state.Pid===0
   &&candidate.state.Restarting===false&&candidate.state.Paused===false&&candidate.restartPolicy?.Name==='no'&&candidate.user==='phoenix'&&same(candidate.mounts,[])
   &&same(candidate.entrypoint,['./node_modules/.bin/typeorm'])&&[ ['-d','dist/database/data-source.js','migration:run','--transaction','all'],['-d','dist/database/data-source.js','migration:show'] ].some(args=>same(candidate.cmd,args))){
   const revision=command('/usr/bin/docker',['image','inspect',candidate.imageId,'--format','{{index .Config.Labels "org.opencontainers.image.revision"}}']);
   if(!/^[a-f0-9]{40}$/.test(revision))fail('HISTORICAL_MIGRATOR_SOURCE_UNVERIFIED');
   command('/usr/bin/git',['-c',`safe.directory=${CONTRACT.repository}`,'-C',CONTRACT.repository,'merge-base','--is-ancestor',revision,pre.api.ociRevision]);
   inertArtifacts.push({id,identitySha256:canonicalDigest(candidate),classification:'RETAINED_STOPPED_NO_RESTART_SCHEMA_ARTIFACT',revision});continue;
  }
  const formerOwner=candidate.labels?.['phoenix.schema.owner'],priorRole=candidate.labels?.['phoenix.schema.role'];
  if(held&&oldResourceOwner(formerOwner)&&held.pins.has(id)){
   inertArtifacts.push(heldCapsulePin(candidate,held));continue;
  }
  if(held&&oldResourceOwner(formerOwner)&&!(formerOwner==='45144287071-1'&&priorRole==='readonly-inventory'&&
    ['2934361c8930967bb06cc132f78ee0866e74c9f9b3a4e60bbe5f58349cbfece8','9c518200e4f495df408ac705ac1c692fd3f75914d75e330c765c06047c0fbb7c'].includes(id)))fail('EXTRA_HELD_RELEASE_RESOURCE');
  let prior;
  if(formerOwner==='44917766283-1'&&priorRole!=='readonly-inventory'){
   prior=dependencies.predecessorResources?.find(unit=>unit.containerId===id);
  }else if(formerOwner&&formerOwner!==preSnapshot.deployRunId&&/^[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$/.test(formerOwner)&&dependencies.successorStore){
   const name='schema-release-1123-inspect-'+formerOwner+'.json';
   if(dependencies.successorStore.exists(name)){
    const inspected=dependencies.successorStore.read(name);
    validateSuccessorInspection(inspected,successorBinding(inspected.binding.floorSha,inspected.binding));
    prior=inspected.resourcePins.find(unit=>unit.containerId===id);
    if(inspected.owner!==formerOwner||inspected.binding.targetSha!==preSnapshot.targetSha||prior?.identitySha256!==canonicalDigest(candidate))fail('RETAINED_INSPECTION_PIN_CHANGED');
   }
  }
  if(prior){
   if(prior.owner!==formerOwner||prior.role!==priorRole||prior.imageId!==candidate.imageId||
      candidate.state.Status!=='exited'||candidate.state.Running!==false||candidate.state.Pid!==0||candidate.state.Paused!==false||
      candidate.state.Restarting!==false||candidate.state.OOMKilled!==false||candidate.state.ExitCode!==0||candidate.restarts!==0||
      candidate.restartPolicy?.Name!=='no'||candidate.privileged!==false||!['','private'].includes(candidate.pidMode)||
      (priorRole==='readonly-inventory'?candidate.networkMode!=='none':candidate.networkMode!==prior.networkId)||
      !Object.values(candidate.networks??{}).every(value=>!value.IPAddress&&!value.GlobalIPv6Address&&!value.EndpointID)||
      !['readonly-inventory','rehearsal-database','rehearsal-original-api','rehearsal-candidate-api','rehearsal-migration-run','rehearsal-migration-show','controlled-migration-run','controlled-migration-show'].includes(priorRole)||
      priorRole!=='rehearsal-database'&&(candidate.readonly!==true||candidate.user!=='phoenix'||!same(candidate.capDrop,['ALL'])))fail('RETAINED_RELEASE_RESOURCE_CHANGED');
   inertArtifacts.push({id,identitySha256:canonicalDigest(candidate),classification:'SEALED_STOPPED_RELEASE_RESOURCE',formerOwner,role:priorRole});continue;
  }
  const own=(dependencies.ownedResources??[]).find(record=>record.containerId===id);
  if(own&&own.owner===preSnapshot.deployRunId&&own.imageId===candidate.imageId&&candidate.labels?.['phoenix.schema.owner']===own.owner&&candidate.labels?.['phoenix.schema.role']==='readonly-inventory'
    &&candidate.state.Running===false&&candidate.state.ExitCode===0&&candidate.networkMode==='none'&&candidate.readonly===true&&candidate.user==='phoenix'&&same(candidate.mounts,[])&&same(candidate.capDrop,['ALL']))continue;
  if(candidate.labels?.['phoenix.schema.role']==='readonly-inventory'&&candidate.labels?.['phoenix.schema.owner']!==preSnapshot.deployRunId){
   let artifact;
   try{artifact=collectRetainedModernSchemaInventory(candidate,{owner:preSnapshot.deployRunId,targetSha:preSnapshot.targetSha},
    {...dependencies.retainedInventory,docker:args=>command('/usr/bin/docker',args)});}
   catch{fail('RETAINED_INVENTORY_UNVERIFIED');}
   const slot=retainedModernSchemaInventorySlot(artifact);
   if(retainedOwners.has(slot))fail('RETAINED_INVENTORY_OWNER_REUSED');
   retainedOwners.add(slot);inertArtifacts.push(artifact);
   continue;
  }
  if(own&&own.owner===preSnapshot.deployRunId&&own.imageId===candidate.imageId&&candidate.labels?.['phoenix.schema.owner']===own.owner&&candidate.labels?.['phoenix.schema.role']===own.role
    &&['rehearsal-database','rehearsal-original-api','rehearsal-candidate-api','rehearsal-migration-run','rehearsal-migration-show'].includes(own.role)
    &&candidate.state.Running===false&&candidate.state.ExitCode===0&&candidate.state.OOMKilled===false&&candidate.state.Pid===0&&candidate.restarts===0
    &&ID.test(own.networkId??'')&&own.networkId!==networkId&&candidate.networkMode===own.networkId&&ID.test(own.volume??'')){
   const [isolation]=JSON.parse(command('/usr/bin/docker',['network','inspect',own.networkId]));
   if(isolation?.Internal!==true||isolation.EnableIPv6!==false||isolation.Labels?.['phoenix.schema.owner']!==own.owner||isolation.Labels?.['phoenix.schema.role']!=='rehearsal-network')fail('OWNED_REHEARSAL_ISOLATION_CHANGED');
   if(own.role==='rehearsal-database'){
    if(!matchesModernSchemaRehearsalVolume(candidate.mounts,own))fail('OWNED_REHEARSAL_STORAGE_CHANGED');
   }else{
    if(candidate.readonly!==true||candidate.user!=='phoenix'||!same(candidate.capDrop,['ALL']))fail('OWNED_REHEARSAL_RUNTIME_CHANGED');
    const expected=own.role.endsWith('-api')?[{source:path.join(CONTRACT.stateDirectory,`schema-release-prepare-rehearsal-${own.owner}`,'control-'+own.role.slice('rehearsal-'.length)),destination:'/run/phoenix-background-control'}]:[];
    if(candidate.mounts.length!==expected.length||candidate.mounts.some((mount,index)=>mount.Type!=='bind'||mount.Source!==expected[index].source||mount.Destination!==expected[index].destination||mount.RW!==false))fail('OWNED_REHEARSAL_MOUNTS_CHANGED');
   }
   continue;
  }
  const rehearsalRole=candidate.labels?.['phoenix.schema.role'];
  if(['rehearsal-original-api','rehearsal-candidate-api'].includes(rehearsalRole)&&candidate.labels?.['phoenix.schema.owner']!==preSnapshot.deployRunId){
   const legacyIdentity=(dependencies.containerIdentity??observeMaintenanceContainerIdentity)(id);
   const registrations=ownership().containers.filter(pin=>pin.id===id&&pin.owner===RETAINED_REHEARSAL_OWNER&&pin.identitySha256===canonicalDigest(legacyIdentity));
   if(registrations.length!==1)fail('RETAINED_REHEARSAL_API_OWNERSHIP_UNVERIFIED');
   inertArtifacts.push(collectReviewedRetainedRehearsalApi(candidate,{owner:preSnapshot.deployRunId,networkId,targetSha:preSnapshot.targetSha,registration:registrations[0]},
    {...dependencies.retainedRehearsal,run:command}));
   continue;
  }
  if(candidate.labels?.['com.docker.compose.project']==='phoenix-erp'||[pre.api.image,pre.web.image].includes(candidate.imageId)
   ||candidate.mounts.some(m=>m.Type==='bind'&&[CONTRACT.repository,CONTRACT.controlRoot].some(root=>m.Source===root||m.Source?.startsWith(root+'/'))))fail('AUXILIARY_ERP_CONTAINER_UNACCOUNTED');
  const legacyIdentity=(dependencies.containerIdentity??observeMaintenanceContainerIdentity)(id);
  if(legacyIdentity.id!==id||legacyIdentity.imageId!==candidate.imageId||legacyIdentity.startedAt!==candidate.state.StartedAt||legacyIdentity.restartCount!==candidate.restarts
    ||legacyIdentity.pid!==candidate.state.Pid||legacyIdentity.running!==candidate.state.Running)fail('FOREIGN_CONTAINER_IDENTITY_CHANGED');
  const pins=ownership().containers.filter(pin=>pin.id===id&&pin.identitySha256===canonicalDigest(legacyIdentity)&&typeof pin.owner==='string'&&pin.owner.length>0);
  if(pins.length!==1)fail('FOREIGN_CONTAINER_OWNERSHIP_UNVERIFIED');
  foreignContainerPins.push({id,identitySha256:canonicalDigest(legacyIdentity)});
 }
 if(held)verifyHeldIsolation(inertArtifacts,command);
 if(held&&[...held.pins.keys()].some(id=>!inertArtifacts.some(pin=>pin.id===id)))fail('HELD_REHEARSAL_SET_CHANGED');
 if(held&&!['45144287071-1:prepare','45144287071-1:supervise'].every(slot=>retainedOwners.has(slot)))fail('HELD_INVENTORY_SET_CHANGED');
 try{
  inertArtifacts.push(...collectHistoricalComposeSchemaArtifacts(historicalCompose,{api:actual.api,network,apiRevision:pre.api.ociRevision,
   docker:args=>command('/usr/bin/docker',args)},dependencies.historicalCompose));
 }catch{fail('HISTORICAL_COMPOSE_ARTIFACT_UNVERIFIED');}
 const scheduler=(dependencies.captureSchedulers??captureMaintenanceSchedulers)({includeDatabaseEntrypoints:true});
 if(scheduler.some(row=>row.erpControlReference===true))fail('LOCAL_DATABASE_OR_ERP_SCHEDULER_UNACCOUNTED');
 const controls=new Set([process.pid,process.ppid]),children=dependencies.getOwnedChildren?.()??[];
 const processReader=dependencies.processIdentity??observeMaintenanceProcessIdentity,processes=[];
 const batch=dependencies.processIds?null:(dependencies.captureProcesses??captureModernSchemaProcessIdentities)();
 for(const name of (batch?batch.map(row=>row.pid):dependencies.processIds())){
  const processId=Number(name);let observation;try{observation=batch?batch.find(row=>row.pid===processId):processReader(processId);}catch(error){
   try{fs.lstatSync(`/proc/${processId}`);}catch(gone){if(['ENOENT','ESRCH'].includes(gone.code))continue;}fail('HOST_PROCESS_IDENTITY_UNREADABLE');
  }
  if(controls.has(processId)||namespaces.has(observation.pidNamespace))continue;
  const controlled=children.find(entry=>entry.pin?.pid===processId);if(controlled){verifyModernSchemaChild(controlled,observation);continue;}
  const potential=/\/(?:node|nodejs|python[0-9.]*|java|pm2|supervisord|nomad|kubelet|psql|pg_restore|pgbench)$/.test(observation.exe)||observation.erpControlReference;
  if(!potential)continue;if(observation.erpControlReference===true)fail('AUXILIARY_HOST_ERP_EXECUTOR_UNACCOUNTED');
  const pins=ownership().hostProcesses.filter(pin=>pin.pid===processId&&pin.identitySha256===canonicalDigest(observation)&&typeof pin.owner==='string'&&pin.owner.length>0);
  if(pins.length!==1)fail('HOST_EXECUTOR_OWNERSHIP_UNVERIFIED');
  processes.push({pid:processId,identitySha256:canonicalDigest(observation),erpControlReference:observation.erpControlReference===true});
 }
 inertArtifacts.sort((a,b)=>a.id.localeCompare(b.id));
 guard();return {schema:'phoenix.modern-schema-host-surface/v1',model:'TRUSTED_ROOT_FD9_EXCLUSIVE_WRITER',ingressScope,
  runtimeAddress:endpoints[0].IPAddress,databasePublishedHostPort:Number(actual.db.ports['5432/tcp'][0].HostPort),runtimePinsSha256:canonicalDigest(pre),
  schedulerSha256:canonicalDigest(scheduler),processesSha256:canonicalDigest(processes),inertArtifactCount:inertArtifacts.length,inertArtifactsSha256:canonicalDigest(inertArtifacts),
  inertArtifacts,foreignContainerPins,foreignProcessPins:processes,unknownExecutors:0,nonLoopbackIpv6:0,readOnly:true,productionAuthorized:false};
}
