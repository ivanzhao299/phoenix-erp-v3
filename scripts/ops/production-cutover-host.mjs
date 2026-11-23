/** Dedicated pilot invocation. No authority, ingress or release material is synthesized by this program. */
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {compileOwnedIngressRules,ingressIdentity,projectOwnedIngressTable} from './maintenance-ingress-policy.mjs';
import {createInterface} from 'node:readline';
import {pathToFileURL} from 'node:url';
import {CONTRACT,verifyContext,requireCleanMain,secureJson} from './production-config-guard.mjs';
import {executionEnv} from './capture-production-runtime.mjs';
import {atomicState} from './production-atomic-state.mjs';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
import {BackgroundManifestPublisher,readCutoverPending,readSchemaReleasePending,bindingFromPrivateRecord,assertSameBinding,CUTOVER_PURPOSE} from './background-control-manifest.mjs';
import {BackgroundFenceCoordinator,DockerPostgresControlSession,inventoryApiContainers,inspectApiParticipant} from './background-control-coordinator.mjs';
import {verifyCutoverRuntimeBundle} from './production-cutover-runtime-bundle.mjs';

const directory=CONTRACT.stateDirectory;
const fail=code=>{throw Error('CUTOVER_HOST_HOLD='+code);};
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const num=v=>Number.isSafeInteger(v)&&v>0;
const name=v=>typeof v==='string'&&/^[a-z_][a-z0-9_]{0,62}$/.test(v);
const digits=v=>typeof v==='string'&&/^[1-9][0-9]{0,19}$/.test(v);
const secure=name=>secureJson(path.join(directory,name));

export function validateSiteAuthority(a,binding,record,operation){
  if(a?.schema!=='phoenix.production-cutover-site-authority/1'||binding.purpose!==CUTOVER_PURPOSE)fail('SITE_AUTHORITY');
  assertSameBinding(a.binding,binding);
  if(a.fenceGeneration!==record.generation||!num(a.fenceGeneration)||!num(a.environmentGeneration)
    ||typeof a.environmentId!=='string'||!/^[A-Za-z0-9_.-]{1,128}$/.test(a.environmentId)
    ||!digits(a.operatorId)||!name(a.database)||!name(a.executorRole)||!digits(a.clusterIdentifier)
    ||!/^phoenix[a-z0-9_-]*$/.test(a.project)||!num(a.peerUid)||!num(a.peerGid)
    ||![a.deploymentEvidenceSha256,a.sourceAttestationSha256,a.drainAttestationSha256,a.treeSha256].every(hash)
    ||a.bundle?.revision!==binding.targetSha||!/^sha256:[a-f0-9]{64}$/.test(a.bundle?.imageId))fail('SITE_IDENTITY');
  if(operation==='execute'||operation==='prepare'){
    const start=Date.parse(a.windowStart),end=Date.parse(a.windowEnd);
    if(!Number.isFinite(start)||!Number.isFinite(end)||start>Date.now()||end<=Date.now()||end-start>180*60000)fail('WINDOW_CLOSED');
  }
  return {...binding.cutover,sourceSha:binding.targetSha,fenceOwner:binding.owner,fenceGeneration:a.fenceGeneration,
    environmentId:a.environmentId,environmentGeneration:a.environmentGeneration,operatorId:a.operatorId,
    authoritySha256:canonicalDigest(a),deploymentEvidenceSha256:a.deploymentEvidenceSha256};
}

const observe=(program,args)=>JSON.parse(execFileSync(program,args,{env:executionEnv(),encoding:'utf8',timeout:5000,
  maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']}));

function checkSource(a,binding,source){
  if(canonicalDigest(source)!==a.sourceAttestationSha256||source.schema!=='phoenix.cutover-source-attestation/1'
    ||source.revision!==binding.targetSha||source.imageId!==a.bundle.imageId||source.treeSha256!==a.treeSha256
    ||!hash(source.reviewedBuildDigest)||!hash(source.nativeAbiRehearsalDigest))fail('SOURCE_ATTESTATION');
}
export function verifySiteEvidence(a,binding,manifest,source,drain,io=observe){
  checkSource(a,binding,source);
  return ingressSurface(a,binding,manifest,drain,io);
}
export function ingressSurface(a,binding,manifest,drain,io=observe){
  if(canonicalDigest(drain)!==a.drainAttestationSha256||drain.schema!=='phoenix.cutover-ingress-drain/1'
    ||drain.owner!==binding.owner||drain.generation!==manifest.generation||drain.manifestId!==binding.cutover.manifestId
    ||!hash(drain.inFlightDrainDigest)||!hash(drain.networkId)||!num(drain.interfaceIndex)
    ||!hash(drain.approvedIngressCoverageDigest))fail('DRAIN_ATTESTATION');
  const scope=drain.ruleScope,prefix='phoenix_maintenance';
  if(scope?.owner!==canonicalDigest(binding).slice(0,32))fail('INGRESS_OWNER_MISMATCH');
  const compiled=compileOwnedIngressRules(scope,prefix),{table}=compiled;
  const [network]=io('/usr/bin/docker',['network','inspect',drain.networkId]);
  if(network?.Id!==drain.networkId||network.Driver!=='bridge'||network.Scope!=='local'||network.EnableIPv6!==false
    ||network.IPAM?.Config?.length!==1||network.IPAM.Config[0].Subnet!==scope.subnet
    ||(network.Options?.['com.docker.network.bridge.name']||'br-'+network.Id.slice(0,12))!==scope.bridge
    ||manifest.participants.some(p=>!Object.hasOwn(network.Containers??{},p.containerId)))fail('INGRESS_NETWORK_CHANGED');
  for(const p of manifest.participants){
    const actual=io('/usr/bin/docker',['inspect','--format','{{json .NetworkSettings.Networks}}',p.containerId]);
    if(Object.values(actual).length!==1||Object.values(actual)[0]?.NetworkID!==drain.networkId)fail('EXTRA_API_INGRESS');
  }
  const links=io('/usr/sbin/ip',['-json','-details','link','show','dev',scope.bridge]);
  if(links.length!==1||links[0].ifindex!==drain.interfaceIndex||links[0].linkinfo?.info_kind!=='bridge')fail('INGRESS_BRIDGE_CHANGED');
  const families=()=>{
    const {nftables}=io('/usr/sbin/nft',['--json','list','tables']);
    if(!Array.isArray(nftables))fail('INGRESS_INVENTORY');
    return nftables.flatMap(v=>v.table?.name===table?[v.table.family]:[]).sort();
  };
  const identity=()=>{
    if(JSON.stringify(families())!=='["bridge","inet"]')fail('INGRESS_TABLE_INCOMPLETE');
    return canonicalDigest(ingressIdentity(['inet','bridge'].map(family=>projectOwnedIngressTable(
      io('/usr/sbin/nft',['--json','--handle','list','table',family,table]),family,scope,prefix))));
  };
  const apply=program=>execFileSync('/usr/sbin/nft',['--json','--file','-'],{input:JSON.stringify(program),env:executionEnv(),
    timeout:5000,maxBuffer:65536,stdio:['pipe','ignore','pipe']});
  return {
    identity, families,
    install(write=apply){
      if(families().length)fail('INGRESS_ALREADY_PRESENT');
      write(JSON.parse(compiled.program));
      return identity();
    },
    release(expected,write=apply){
      if(identity()!==expected)fail('INGRESS_HANDLES_CHANGED');
      write({nftables:['bridge','inet'].map(family=>({delete:{table:{family,name:table}}}))});
      if(families().length)fail('INGRESS_RELEASE_UNRESOLVED');
    },
  };
}
function verifyPeerSocket(){
  const dir='/run/phoenix-cutover-postgres';
  const st=fs.lstatSync(dir);
  if(!st.isDirectory()||st.uid!==0||(st.mode&0o022)!==0||fs.realpathSync(dir)!==dir)fail('PEER_DIRECTORY');
  const names=fs.readdirSync(dir);
  if(!names.includes('.s.PGSQL.5432')||names.some(n=>!['.s.PGSQL.5432','.s.PGSQL.5432.lock'].includes(n))
    ||!fs.lstatSync(path.join(dir,'.s.PGSQL.5432')).isSocket())fail('PEER_SOCKET');
  if(names.includes('.s.PGSQL.5432.lock')&&!fs.lstatSync(path.join(dir,'.s.PGSQL.5432.lock')).isFile())fail('PEER_LOCK');
}
export function workerArgs(a){
  return ['run','--rm','--interactive','--pull=never','--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges',
    '--no-healthcheck','--pids-limit=48','--memory=768m','--user',String(a.peerUid)+':'+String(a.peerGid),
    '--mount','type=bind,src=/run/phoenix-cutover-postgres,dst=/run/phoenix-cutover-postgres,readonly',
    '--entrypoint','/usr/local/bin/node',a.bundle.imageId,'/app/dist/scripts/production-cutover-worker.js','--host-stdio'];
}

export async function runCutoverWorker({operation,a,permit,control,check,onBackend=()=>{},launch=spawn}){
  let child,deadline;
  try{
    child=launch('/usr/bin/docker',workerArgs(a),{env:executionEnv(),stdio:['pipe','pipe','ignore']});
    const exit=new Promise(resolve=>{child.once('error',()=>resolve(-1));child.once('close',code=>resolve(code));});
    child.stdin.on('error',()=>{});
    deadline=setTimeout(()=>{child.stdin.destroy();child.kill();},150000);
    const lines=createInterface({input:child.stdout})[Symbol.asyncIterator]();
    const frame=async step=>{
      const {value,done}=await lines.next();if(done||value.length>1024*1024)fail('CONTROL_CHANNEL_LOST');
      const v=JSON.parse(value);if(v.step!==step)fail('CONTROL_PROTOCOL');return v;
    };
    const send=v=>child.stdin.write(JSON.stringify(v)+'\n');
    send({operation,permit,database:a.database,role:a.executorRole});
    const {backend}=await frame('BACKEND');
    if(!num(backend.pid)||![backend.start_micros,backend.server_micros,backend.database_oid].every(digits))fail('BACKEND_IDENTITY');
    const verifyBackend=async()=>{
      const locks=operation==='recover'?'true':`(SELECT count(*)=2 FROM pg_locks WHERE locktype='advisory' AND pid=${backend.pid} AND database=${backend.database_oid} AND classid=17455 AND objid IN(1,2) AND objsubid=2 AND mode='ExclusiveLock' AND granted)`;
      if(!await control.query(`SELECT NOT pg_is_in_recovery() AND (SELECT system_identifier::text FROM pg_control_system())='${a.clusterIdentifier}'
        AND current_database()='${a.database}' AND trunc(extract(epoch FROM pg_postmaster_start_time())*1000000)=${backend.server_micros}
        AND EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=${backend.pid} AND datid=${backend.database_oid} AND datname=current_database()
          AND usename='${a.executorRole}' AND trunc(extract(epoch FROM backend_start)*1000000)=${backend.start_micros}) AND ${locks};`.replace(/\s+/g,' ')))fail('BACKEND_CHANGED');
    };
    await verifyBackend();
    if(operation==='execute')onBackend(backend);
    send({step:'CONTINUE'});
    if(operation==='execute')for(let i=0;i<2;i++){
      await frame('RECHECK');await check();await verifyBackend();send({step:'VERIFIED'});
    }
    const {outcome}=await frame('OUTCOME');child.stdin.end();
    if(await exit!==0||!['COMMITTED','UNPROVEN'].includes(outcome?.status)
      ||outcome.status==='COMMITTED'&&(outcome.receipt?.manifestId!==permit.manifestId||outcome.receipt?.mode!==permit.mode
        ||outcome.receipt?.contentHash!==permit.contentHash))fail('UNPROVEN');
    return outcome;
  }finally{clearTimeout(deadline);child?.stdin.destroy();if(child?.exitCode===null)child.kill();}
}

export async function pilotLifecycle(operation,site){
  const {binding,permit,publisher,coordinator,participants,ingress,read,write,guard,assertDrained,worker,archive}=site;
  const fenceRecord=()=>publisher.assertOwned(binding);
  const original=()=>{
    const result=read('drain');
    if(result?.authoritySha256!==permit.authoritySha256||result.generation!==permit.fenceGeneration
      ||!hash(result.kernelIdentitySha256)||canonicalDigest(result.participants)!==canonicalDigest(participants))fail('ORIGINAL_DRAIN_REQUIRED');
    return result;
  };
  const terminal=()=>{
    const value=read('open-intent');
    if(value?.authoritySha256!==permit.authoritySha256||value.generation!==permit.fenceGeneration
      ||value.kernelIdentitySha256!==original().kernelIdentitySha256||!hash(value.receiptSha256))fail('VERIFIED_OPEN_INTENT_REQUIRED');
    return value;
  };
  const note=(kind,fields)=>write(kind,{purpose:CUTOVER_PURPOSE,authoritySha256:permit.authoritySha256,generation:permit.fenceGeneration,
    observedAt:new Date().toISOString(),...fields});
  const check=async()=>{
    guard();
    const {record,manifest}=fenceRecord();
    if(record.phase!=='FENCED'||manifest.phase!=='FENCED'||record.generation!==permit.fenceGeneration
      ||ingress().identity()!==original().kernelIdentitySha256)fail('ORIGINAL_FENCE_CHANGED');
    await assertDrained(manifest);
    guard();
  };
  if(operation==='prepare'){
    guard();
    if(publisher.nextGeneration()!==permit.fenceGeneration||read('attempt')||read('install-intent'))fail('PREPARATION_CHANGED');
    const previous=publisher.readPrivate(),publicPrevious=publisher.readPublic();
    if(!previous||!publicPrevious||previous.phase!=='OPEN'||publicPrevious.phase!=='OPEN'||publicPrevious.targetSha!==binding.targetSha
      ||canonicalDigest(publicPrevious.participants)!==canonicalDigest(participants))fail('ORIGINAL_OPEN_REQUIRED');
    await coordinator.inspectParticipants(participants,publicPrevious,false);
    write('pending',{schema:'phoenix.production-cutover-pending/1',phase:'PREPARED',...binding});
    // Publish the purpose-specific durable marker before any native deny.
    guard();
    if(publisher.assertFenceStart(binding,participants)!==permit.fenceGeneration)fail('PREPARATION_CHANGED');
    note('install-intent',{participants});
    const kernelIdentitySha256=ingress().install();
    const drain=await coordinator.fenceAndDrain();
    if(drain.generation!==permit.fenceGeneration||ingress().identity()!==kernelIdentitySha256)fail('ORIGINAL_FENCE_CHANGED');
    await assertDrained(coordinator.manifest);
    await coordinator.verifyQuiescent();
    note('drain',{kernelIdentitySha256,participants,backgroundDrainSha256:canonicalDigest(drain)});
    return 'FENCED';
  }

  if(operation==='recover'&&publisher.readPublic()?.phase==='OPEN'){
    guard();const intent=terminal(),open=publisher.assertCompletedCutoverOpen(binding,permit.fenceGeneration);
    const outcome=await worker('recover',async()=>{});
    if(outcome.status!=='COMMITTED'||canonicalDigest(outcome.receipt)!==intent.receiptSha256)fail('ORIGINAL_RESULT_CHANGED');
    const native=ingress(),families=native.families();
    if(families.length){
      coordinator.manifest=open;
      await coordinator.acquire(1,Date.now()+30000);
      await coordinator.acquire(2,Date.now()+30000);
      await assertDrained(open);
      guard();publisher.assertCompletedCutoverOpen(binding,permit.fenceGeneration);
      native.release(intent.kernelIdentitySha256);
    }
    if(native.families().length)fail('INGRESS_RELEASE_UNRESOLVED');
    note('opened',{receiptSha256:intent.receiptSha256,publicManifestSha256:canonicalDigest(open)});
    archive();
    return 'COMMITTED_OPEN';
  }

  await check();
  const prior=read('attempt');
  if(operation==='execute'){
    if(prior)fail('USE_ORIGINAL_RECOVERY');
    note('attempt',{permit});
  }else if(!prior||canonicalDigest(prior.permit)!==canonicalDigest(permit))fail('ORIGINAL_ATTEMPT_REQUIRED');

  const outcome=await worker(operation,check);
  note(operation==='recover'?'recovery-'+randomUUID():'execute-result',{permit,outcome});
  if(outcome.status!=='COMMITTED')return 'UNPROVEN';
  const receiptSha256=canonicalDigest(outcome.receipt);
  const drain=original();
  // Re-establish a native SQL lease before publishing OPEN. The executor's locks
  // are relinquished only after its process exits, while native ingress stays closed.
  await coordinator.acquire(1,Date.now()+30000);
  await coordinator.acquire(2,Date.now()+30000);
  await check();
  const fresh=await worker('recover',async()=>{});
  if(fresh.status!=='COMMITTED'||canonicalDigest(fresh.receipt)!==receiptSha256)fail('ORIGINAL_RESULT_CHANGED');
  const previousIntent=read('open-intent');
  if(previousIntent&&terminal().receiptSha256!==receiptSha256)fail('ORIGINAL_RESULT_CHANGED');
  note('open-intent',{receiptSha256,kernelIdentitySha256:drain.kernelIdentitySha256});
  const open=await publisher.openCompletedCutover(binding,participants,async()=>{
    await check();
    if(!coordinator.held.has(1)||!coordinator.held.has(2)||await coordinator.session.ping()!==true)return false;
    return coordinator.session.connected();
  });
  guard();
  publisher.assertCompletedCutoverOpen(binding,permit.fenceGeneration);
  if(await coordinator.session.ping()!==true)fail('SQL_LEASE_LOST');
  ingress().release(drain.kernelIdentitySha256);
  note('opened',{receiptSha256,publicManifestSha256:canonicalDigest(open)});
  archive();
  return 'COMMITTED_OPEN';
}

export async function runSiteCutover(operation){
  if(!['prepare','execute','recover'].includes(operation))fail('DEDICATED_OPERATION_REQUIRED');
  verifyContext(CONTRACT.repository,directory);
  const a=secure('cutover-host-authority.json'),binding=bindingFromPrivateRecord(a.binding),authority=canonicalDigest(a);
  const permit=validateSiteAuthority(a,binding,{generation:a.fenceGeneration},operation);
  const prefix='cutover-host-'+permit.admissionId;
  const filename=kind=>kind==='pending'?'cutover-pending.json':prefix+'-'+kind+'.json';
  const exists=name=>!!fs.lstatSync(path.join(directory,name),{throwIfNoEntry:false});
  const read=kind=>exists(filename(kind))?secure(filename(kind)):null;
  const write=(kind,value)=>atomicState(path.join(directory,filename(kind)),value);
  const guard=()=>{
    verifyContext(CONTRACT.repository,directory);
    if(canonicalDigest(secure('cutover-host-authority.json'))!==authority||readSchemaReleasePending()!==null
      ||exists('transaction.json'))fail('AUTHORITY_CHANGED');
    const pending=readCutoverPending();
    if(pending){if(pending.schema!=='phoenix.production-cutover-pending/1'||pending.phase!=='PREPARED')fail('PREPARATION_CHANGED');assertSameBinding(pending,binding);}
    else if(operation!=='prepare')fail('PREPARED_PILOT_REQUIRED');
    validateSiteAuthority(a,binding,{generation:permit.fenceGeneration},operation);
  };
  guard();
  if(operation==='prepare'&&(read('pending')||read('opened')||read('open-intent')))fail('ORIGINAL_ATTEMPT_EXISTS');
  requireCleanMain(CONTRACT.repository,binding.targetSha);
  verifyPeerSocket();
  const runtime=verifyCutoverRuntimeBundle(a.bundle);
  if(runtime.receipt.treeSha256!==a.treeSha256)fail('REGISTERED_TREE_CHANGED');
  const publisher=new BackgroundManifestPublisher({}, {verifyCutoverReleaseAuthority:(_binding,generation)=>{
    guard();
    const intent=read('open-intent');
    return intent?.authoritySha256===authority&&intent.generation===generation&&hash(intent.receiptSha256);
  }});
  const control=new DockerPostgresControlSession();
  const reference=publisher.readPublic();
  const participants=reference?.participants;
  const runningApis=inventoryApiContainers(a.project);
  if(!Array.isArray(participants)||participants.length!==1||participants[0].containerId!==runtime.receipt.apiPin.containerId
    ||runningApis.length!==1||runningApis[0]!==participants[0].containerId)fail('ORIGINAL_API_CHANGED');
  const pin=runtime.receipt.apiPin,inspected=inspectApiParticipant(participants[0],a.project);
  if(inspected.startedAt!==pin.startedAt||inspected.restartCount!==pin.restartCount)fail('ORIGINAL_API_CHANGED');
  const coordinator=new BackgroundFenceCoordinator({binding,project:a.project,participants},{publisher,session:control});
  if(reference.phase==='FENCED')coordinator.manifest=reference;
  const ingress=()=>{
    guard();
    return verifySiteEvidence(a,binding,{participants,generation:permit.fenceGeneration},
      secure('cutover-source-attestation.json'),secure('cutover-drain-attestation.json'));
  };
  const assertDrained=async manifest=>{
    const snapshots=await coordinator.inspectParticipants(participants,manifest,true);
    if(!snapshots.some(p=>p.containerId===pin.containerId&&p.startedAt===pin.startedAt&&p.restartCount===pin.restartCount))fail('ORIGINAL_API_CHANGED');
    if(!await control.query(`SELECT EXISTS(SELECT 1 FROM public.production_cutover_control_environments e WHERE
      e.environment_id='${a.environmentId}' AND e.generation=${a.environmentGeneration} AND e.executor_role='${a.executorRole}'
      AND e.generation=(SELECT max(generation) FROM public.production_cutover_control_environments)
      AND e.deployment_evidence_sha256='${a.deploymentEvidenceSha256}' AND e.cluster_identifier='${a.clusterIdentifier}'
      AND e.database_name=current_database() AND NOT EXISTS(SELECT 1 FROM pg_stat_activity p
      WHERE p.datid=e.database_oid AND p.usesysid=ANY(e.api_role_oids) AND p.xact_start IS NOT NULL));`.replace(/\s+/g,' ')))fail('API_TRANSACTION_OR_ENVIRONMENT_CHANGED');
  };
  await control.start();
  try{
    if(!await control.query(`SELECT NOT pg_is_in_recovery() AND (SELECT system_identifier::text FROM pg_control_system())='${a.clusterIdentifier}'
      AND current_database()='${a.database}';`.replace(/\s+/g,' ')))fail('PRIMARY_IDENTITY_CHANGED');
    ingress();
    return await pilotLifecycle(operation,{a,binding,permit,publisher,coordinator,participants,ingress,read,write,guard,assertDrained,
      worker:(op,check)=>runCutoverWorker({operation:op,a,permit,control,check,
        onBackend:backend=>write('backend',{purpose:CUTOVER_PURPOSE,permit,backend})}),
      archive:()=>{
        guard();
        const destination=path.join(directory,prefix+'-pending-archived.json');
        if(exists(path.basename(destination)))fail('ARCHIVE_ALREADY_EXISTS');
        fs.renameSync(path.join(directory,'cutover-pending.json'),destination);
        const parent=fs.openSync(directory,'r');
        try{fs.fsyncSync(parent);}finally{fs.closeSync(parent);}
      }});
  }finally{await coordinator.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    if(process.argv.length!==3)fail('DEDICATED_OPERATION_REQUIRED');
    const result=await runSiteCutover(process.argv[2]);
    console.log('PRODUCTION_CUTOVER='+result);
    if(!['FENCED','COMMITTED_OPEN'].includes(result))process.exitCode=2;
  }catch{console.error('PRODUCTION_CUTOVER=HOLD');process.exitCode=2;}
}
