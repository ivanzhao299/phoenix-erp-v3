/** Dedicated pilot invocation. No authority, ingress or release material is synthesized by this program. */
import fs from 'node:fs';
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
import {BackgroundFenceCoordinator,DockerPostgresControlSession} from './background-control-coordinator.mjs';
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
  if(operation==='execute'){
    const start=Date.parse(a.windowStart),end=Date.parse(a.windowEnd);
    if(!Number.isFinite(start)||!Number.isFinite(end)||start>Date.now()||end<=Date.now()||end-start>180*60000)fail('WINDOW_CLOSED');
  }
  return {...binding.cutover,sourceSha:binding.targetSha,fenceOwner:binding.owner,fenceGeneration:a.fenceGeneration,
    environmentId:a.environmentId,environmentGeneration:a.environmentGeneration,operatorId:a.operatorId,
    authoritySha256:canonicalDigest(a),deploymentEvidenceSha256:a.deploymentEvidenceSha256};
}

const observe=(program,args)=>JSON.parse(execFileSync(program,args,{env:executionEnv(),encoding:'utf8',timeout:5000,
  maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']}));

export function verifySiteEvidence(a,binding,manifest,source,drain,io=observe){
  if(canonicalDigest(source)!==a.sourceAttestationSha256||source.schema!=='phoenix.cutover-source-attestation/1'
    ||source.revision!==binding.targetSha||source.imageId!==a.bundle.imageId||source.treeSha256!==a.treeSha256
    ||!hash(source.reviewedBuildDigest)||!hash(source.nativeAbiRehearsalDigest))fail('SOURCE_ATTESTATION');
  if(canonicalDigest(drain)!==a.drainAttestationSha256||drain.schema!=='phoenix.cutover-ingress-drain/1'
    ||drain.owner!==binding.owner||drain.generation!==manifest.generation||drain.manifestId!==binding.cutover.manifestId
    ||!hash(drain.inFlightDrainDigest)||!hash(drain.kernelIdentitySha256)||!hash(drain.networkId)
    ||!num(drain.interfaceIndex)||!hash(drain.approvedIngressCoverageDigest))fail('DRAIN_ATTESTATION');
  const scope=drain.ruleScope,prefix='phoenix_maintenance';
  const {table}=compileOwnedIngressRules(scope,prefix);
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
  const tables=['inet','bridge'].map(family=>projectOwnedIngressTable(io('/usr/sbin/nft',['--json','--handle','list','table',family,table]),family,scope,prefix));
  if(canonicalDigest(ingressIdentity(tables))!==drain.kernelIdentitySha256)fail('INGRESS_HANDLES_CHANGED');
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

export async function runSiteCutover(operation){
  if(!['execute','recover'].includes(operation))fail('DEDICATED_OPERATION_REQUIRED');
  verifyContext(CONTRACT.repository,directory);
  const pending=readCutoverPending();
  if(pending?.schema!=='phoenix.production-cutover-pending/1'||pending.phase!=='PREPARED'||readSchemaReleasePending()!==null)fail('PREPARED_PILOT_REQUIRED');
  const binding=bindingFromPrivateRecord(pending),publisher=new BackgroundManifestPublisher();
  const {record,manifest}=publisher.assertOwned(binding);
  if(record.phase!=='FENCED'||manifest.phase!=='FENCED')fail('FENCE_REQUIRED');
  const a=secure('cutover-host-authority.json'),permit=validateSiteAuthority(a,binding,record,operation);
  requireCleanMain(CONTRACT.repository,binding.targetSha);
  const runtime=verifyCutoverRuntimeBundle(a.bundle);
  if(runtime.receipt.treeSha256!==a.treeSha256)fail('REGISTERED_TREE_CHANGED');
  const control=new DockerPostgresControlSession();
  const coordinator=new BackgroundFenceCoordinator({binding,project:a.project,participants:manifest.participants},{publisher,session:control});
  const prefix=path.join(directory,'cutover-host-'+permit.admissionId);
  const check=async()=>{
    const current=readCutoverPending();
    if(!current||current.phase!=='PREPARED'||readSchemaReleasePending()!==null)fail('PREPARATION_CHANGED');
    assertSameBinding(bindingFromPrivateRecord(current),binding);
    const live=publisher.assertOwned(binding);
    if(live.record.phase!=='FENCED'||live.manifest.phase!=='FENCED'||live.record.generation!==permit.fenceGeneration
      ||canonicalDigest(secure('cutover-host-authority.json'))!==permit.authoritySha256)fail('AUTHORITY_CHANGED');
    validateSiteAuthority(a,binding,live.record,operation);
    verifyPeerSocket();
    verifySiteEvidence(a,binding,live.manifest,secure('cutover-source-attestation.json'),secure('cutover-drain-attestation.json'));
    await control.start();
    if(!await control.query(`SELECT EXISTS(SELECT 1 FROM public.production_cutover_control_environments e WHERE
      e.environment_id='${a.environmentId}' AND e.generation=${a.environmentGeneration} AND e.executor_role='${a.executorRole}'
      AND e.deployment_evidence_sha256='${a.deploymentEvidenceSha256}' AND NOT EXISTS(SELECT 1 FROM pg_stat_activity p
      WHERE p.datid=e.database_oid AND p.usesysid=ANY(e.api_role_oids) AND p.xact_start IS NOT NULL));`.replace(/\s+/g,' ')))fail('API_TRANSACTION_OR_ENVIRONMENT_CHANGED');
    const snapshots=await coordinator.inspectParticipants(manifest.participants,live.manifest,true);
    if(!snapshots.some(p=>p.containerId===runtime.receipt.apiPin.containerId&&p.startedAt===runtime.receipt.apiPin.startedAt
      &&p.restartCount===runtime.receipt.apiPin.restartCount))fail('ORIGINAL_API_CHANGED');
  };
  let child,deadline;
  try{
    await check();
    if(operation==='execute'){
      // FD9 serializes operators. A crash at ANY later point requires read-only reconciliation.
      if(fs.lstatSync(prefix+'-attempt.json',{throwIfNoEntry:false}))fail('USE_ORIGINAL_RECOVERY');
      atomicState(prefix+'-attempt.json',{purpose:CUTOVER_PURPOSE,permit,startedAt:new Date().toISOString()});
    }else if(canonicalDigest(secure(path.basename(prefix)+'-attempt.json').permit)!==canonicalDigest(permit))fail('ORIGINAL_ATTEMPT_REQUIRED');
    child=spawn('/usr/bin/docker',workerArgs(a),{env:executionEnv(),stdio:['pipe','pipe','ignore']});
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
    if(operation==='execute')atomicState(prefix+'-backend.json',{purpose:CUTOVER_PURPOSE,permit,backend});
    send({step:'CONTINUE'});
    if(operation==='execute')for(let i=0;i<2;i++){
      await frame('RECHECK');await check();await verifyBackend();send({step:'VERIFIED'});
    }
    const {outcome}=await frame('OUTCOME');child.stdin.end();
    if(await exit!==0||!['COMMITTED','UNPROVEN'].includes(outcome?.status))fail('UNPROVEN');
    atomicState(prefix+'-'+operation+'-result.json',{purpose:CUTOVER_PURPOSE,permit,outcome,observedAt:new Date().toISOString()});
    return outcome.status;
  }finally{clearTimeout(deadline);child?.stdin.destroy();if(child?.exitCode===null)child.kill();await control.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    if(process.argv.length!==3)fail('DEDICATED_OPERATION_REQUIRED');
    const result=await runSiteCutover(process.argv[2]);
    console.log('PRODUCTION_CUTOVER='+result+';fence=RETAINED');
    if(result!=='COMMITTED')process.exitCode=2;
  }catch{console.error('PRODUCTION_CUTOVER=HOLD;fence=RETAINED');process.exitCode=2;}
}
