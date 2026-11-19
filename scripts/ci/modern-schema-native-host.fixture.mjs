/** An isolated VM integration check. Native host control, kernel packets and
 * PostgreSQL sessions are real. No production registration or deploy runs. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync, spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {CONTRACT, verifyContext} from '../ops/production-config-guard.mjs';
import {executionEnv} from '../ops/capture-production-runtime.mjs';
import {canonicalDigest} from '../ops/production-maintenance-receipts.mjs';
import {ModernSchemaPrivateRuntime} from '../ops/production-modern-schema-private.mjs';
import {ModernSchemaRegistry} from '../ops/production-modern-schema-registration.mjs';
import {ModernSchemaReadClient} from '../ops/production-modern-schema-read-client.mjs';
import {ModernSchemaControlSession, originalModernSchemaSessionPredicate, pinOriginalModernSchemaSession} from '../ops/production-modern-schema-session-lease.mjs';
import {ModernSchemaIngress} from '../ops/production-modern-schema-ingress.mjs';
import {ModernSchemaExecutorWatch} from '../ops/production-modern-schema-watch.mjs';
import {collectModernSchemaHostSurface, inspectModernSchemaContainer} from '../ops/production-modern-schema-executors.mjs';
import {stopOriginalModernSchemaRuntime} from '../ops/production-modern-schema-stop.mjs';
import {modernSchemaReleaseBinding} from '../ops/production-modern-schema-state.mjs';
import {BackgroundManifestPublisher, HOLD_KINDS} from '../ops/background-control-manifest.mjs';
import {closeModernSchemaOriginalSession, confirmModernSchemaPublicDurability} from '../ops/production-modern-schema-completion.mjs';
import {readMaintenanceSchedulerDiagnostic} from '../ops/production-maintenance-root-readers.mjs';
import {pinModernSchemaChild} from '../ops/production-modern-schema-processes.mjs';
import {modernSchemaFixture} from './modern-schema-release.fixture.mjs';
import {ownedHttpProbeProgram} from './maintenance-kernel-ingress-probes.mjs';

const guard=()=>verifyContext(CONTRACT.repository,CONTRACT.stateDirectory);
const run=(program,args,seconds=10)=>execFileSync(program,args,{env:executionEnv(),encoding:'utf8',timeout:seconds*1000,maxBuffer:65536,stdio:['ignore','pipe','pipe']}).trim();
const docker=(...args)=>run('/usr/bin/docker',args);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const source=String.raw`
  const http=require('http'),net=require('net');
  const boot=Buffer.concat([Buffer.from([0,0,0,0,0,3,0,0]),Buffer.from('user\0postgres\0database\0postgres\0application_name\0owned-modern-api\0\0')]);
  boot.writeInt32BE(boot.length);
  const socket=net.createConnection({host:'phoenix-v3-db',port:5432},()=>socket.write(boot));
  socket.on('data',()=>{});socket.on('error',()=>process.exit(61));
  process.on('SIGTERM',()=>{socket.end();process.exit(0);});
  http.createServer((req,res)=>{res.setHeader('x-phoenix-fixture',process.env.FIXTURE_API);res.setHeader('Connection','close');res.end('fixture');}).listen(3100,'0.0.0.0');
`;
const OLD='ab'.repeat(16)+'-old',NEW='ab'.repeat(16)+'-candidate';
const health="fetch('http://127.0.0.1:3100/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))";
const fixApiArgs=(image,network,variant)=>['--name','phoenix-v3-api','--label','com.docker.compose.project=phoenix-erp',
  '--label','com.docker.compose.service=api','--network',network,'--restart=no','--publish','127.0.0.1:3100:3100',
  '--env','FIXTURE_API='+variant,'--health-cmd','node -e '+JSON.stringify(health),'--health-interval','1s',
  '--health-timeout','1s','--health-retries','5',image,'node','-e',source];

async function waitForHealth(id){
  for(let i=0;i<100;i++){
    const value=inspectModernSchemaContainer(id);
    if(value.state.Health?.Status==='healthy')return value;
    await pause(150);
  }
  throw Error('MODERN_HOST_FIXTURE_HEALTH_TIMEOUT');
}

async function main(){
  assert.equal(process.getuid(),0);
  assert.ok(['DISPOSABLE_GITHUB_VM','OWNED_NESTED_DOCKER_EXT4'].includes(process.env.MODERN_HOST_FIXTURE_ONLY));
  assert.equal(process.cwd(),CONTRACT.repository);
  guard();
  assert.equal(docker('ps','-a','-q'),'');
  const stateFile=path.join(CONTRACT.stateDirectory,'schema-release-pending.json');
  const receiptName=process.env.MODERN_HOST_FIXTURE_RESULT;
  assert.ok(receiptName==='/tmp/phoenix-modern-native-host-result.json');
  const receipt={schema:'phoenix.modern-native-host-fixture/v1',fixtureOnly:true,productionReceipt:false,productionAuthority:false,
    runtimeKind:'SYNTHETIC_API_REAL_KERNEL_DOCKER_FD9_PG18',stages:[],outcome:'PENDING'};
  const save=()=>fs.writeFileSync(receiptName,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
  const progress=label=>{receipt.stages.push(label);save();};
  save();
  let client,watchClient,session,closing=false;
  try{
  const network=docker('network','create','--label','com.docker.compose.project=phoenix-erp','phoenix-owned-modern-native');
  progress('NATIVE_DOCKER_NETWORK_CREATED');
  const sourceImage=docker('image','inspect','node:20-alpine','--format','{{.Id}}');
  const pgImage=docker('image','inspect','postgres:18-alpine','--format','{{.Id}}');
  const db=docker('run','-d','--name','phoenix-v3-db','--label','com.docker.compose.project=phoenix-erp','--label','com.docker.compose.service=db',
    '--network',network,'--restart=no','--publish','127.0.0.1:15432:5432','--env','POSTGRES_USER=postgres','--env','POSTGRES_DB=postgres',
    '--env','POSTGRES_HOST_AUTH_METHOD=trust','--tmpfs','/var/lib/postgresql:rw,nosuid,nodev,size=268435456,mode=1777',
    '--health-cmd','pg_isready -h 127.0.0.1 -U postgres -d postgres','--health-interval','1s','--health-timeout','1s',pgImage);
  progress('NATIVE_POSTGRES_STARTED');
  const web=docker('run','-d','--name','phoenix-v3-web','--label','com.docker.compose.project=phoenix-erp','--label','com.docker.compose.service=web',
    '--network',network,'--restart=no','--health-cmd','true','--health-interval','1s',sourceImage,'node','-e','setInterval(()=>{},1000)');
  await waitForHealth(db);progress('NATIVE_POSTGRES_READY');
  await waitForHealth(web);progress('NATIVE_WEB_PEER_READY');
  const old=docker('run','-d',...fixApiArgs(sourceImage,network,OLD));
  await waitForHealth(old);progress('NATIVE_ORIGINAL_API_READY');
  const pin=value=>({id:value.id,image:value.imageId,startedAt:value.state.StartedAt,restartCount:value.restarts});
  const originalSnapshot={deployRunId:'98765-1',containers:Object.fromEntries(Object.entries({api:old,web,db}).map(([k,id])=>[k,pin(inspectModernSchemaContainer(id))]))};
  const privateRuntime=new ModernSchemaPrivateRuntime();
  const surface=collectModernSchemaHostSurface(originalSnapshot);
  progress('NATIVE_HOST_SURFACE_PINNED');
  client=new ModernSchemaReadClient();
  watchClient=new ModernSchemaReadClient();
  session=new ModernSchemaControlSession({}, {isClosing:()=>closing});
  let phase='REGISTERED';
  const setPhase=value=>{phase=value;fs.writeFileSync(stateFile,JSON.stringify({...pending,phase})+'\n',{mode:0o600});};
  const selected=modernSchemaFixture().context;
  const {rows:[identity]}=await (async()=>{await client.start();return client.query('SELECT current_database() AS name,\'public\' AS schema,(SELECT system_identifier::text FROM pg_control_system()) AS "systemIdentifier"');})();
  const context={...selected,owner:originalSnapshot.deployRunId,runtimeSnapshotSha256:canonicalDigest(originalSnapshot.containers),
    candidateImageId:sourceImage,ingressScopeSha256:canonicalDigest(surface.ingressScope),databaseIdentitySha256:canonicalDigest(identity)};
  const binding=modernSchemaReleaseBinding(context,'f'.repeat(64));
  const pending={schema:'phoenix.modern-schema-release-pending/v1',...binding};
  setPhase('REGISTERED');
  const store=new ModernSchemaRegistry();
  const publisher=new BackgroundManifestPublisher({}, {verifySchemaReleaseAuthority:(b,operation)=>{
    guard();assert.deepEqual(b,binding);return operation==='FENCE'?phase==='REGISTERED':phase==='INGRESS_RELEASED';
  }});
  const oldParticipant={containerId:old,revision:context.runtimeSha,bootId:randomUUID(),allowedKinds:[...HOLD_KINDS]};
  let ingress;
    const fenced=publisher.fence(binding,[oldParticipant]);assert.equal(fenced.phase,'FENCED');
    assert.equal(await session.tryLock(1),true);assert.equal(await session.tryLock(2),true);
    privateRuntime.children.add(pinModernSchemaChild(session.child));
    const lease=await pinOriginalModernSchemaSession(session,context);
    const admit=async()=>{guard();return session.query(originalModernSchemaSessionPredicate(lease));};
    await watchClient.start();
    const watch=new ModernSchemaExecutorWatch({context,preparation:{originalSnapshot,hostSurface:surface,floor:{project:'phoenix-erp'},ownedResources:[]},
      state:{read:()=>({phase,status:'RUNNING'})},rootLease:lease,session,client:watchClient,privateRuntime,admit});
    await watch.registerReadTransport(client);await watch.registerReadTransport(watchClient);
    setPhase('DRAINED');
    const initial=await watch.initialize();assert.ok(initial.executors.runtimeSessionPids.length>=1);
    progress('FD9_PUBLIC_FENCED_NATIVE_ORIGINAL_DUAL_PG_SESSION_WATCH');
    const getIp=id=>Object.values(inspectModernSchemaContainer(id).networks)[0].IPAddress;
    const probe=(address,marker)=>JSON.parse(run(process.execPath,['-e',ownedHttpProbeProgram,'http://'+address+':3100/',marker]));
    const peerProbe=(address,marker)=>JSON.parse(docker('exec',web,'node','-e',ownedHttpProbeProgram,'http://'+address+':3100/',marker));
    assert.equal(probe('127.0.0.1',OLD).status,200);
    assert.equal(peerProbe(getIp(old),OLD).status,200);
    ingress=new ModernSchemaIngress({context,scope:surface.ingressScope,privateRuntime,admit});
    await ingress.install();setPhase('INGRESS_FENCED');
    const denied={kind:'ERROR',code:'FIXTURE_TIMEOUT'};
    assert.deepEqual(probe('127.0.0.1',OLD),denied);
    assert.deepEqual(probe(getIp(old),OLD),denied);
    assert.deepEqual(peerProbe(getIp(old),OLD),denied);
    progress('REAL_NFT_BLOCKS_PUBLISHED_DIRECT_AND_PEER_OLD_HTTP');
    setPhase('R_STOP_INTENT');
    const dir=privateRuntime.createDirectory(context.owner,'session');
    const stopped=await stopOriginalModernSchemaRuntime({originalSnapshot,privateRuntime,directory:dir,admit,drainStillOriginal:()=>admit()});
    assert.equal(stopped.exitCode,0);
    setPhase('R_STOPPED');
    assert.deepEqual((await watch.observe()).executors.runtimeSessionPids,[]);
    progress('REAL_TERM_REMOVES_OLD_NATIVE_PG_BACKEND_UNDER_ORIGINAL_S');
    setPhase('API_BODY');
    const candidateArgs=fixApiArgs(sourceImage,network,NEW);
    const create=spawn('/bin/sh',['-c','read signal; test "$signal" = go && /usr/bin/docker rm "$1" >/dev/null && shift && exec /usr/bin/docker run -d "$@"','owned-fixture',old,...candidateArgs],
      {env:executionEnv(),stdio:['pipe','pipe','pipe']});
    const newIdPromise=new Promise((resolve,reject)=>{
      let output='';
      create.stdout.setEncoding('utf8');create.stdout.on('data',chunk=>output+=chunk);
      create.stderr.resume();
      create.once('error',reject);create.once('close',code=>code===0?resolve(output.trim()):reject(Error('OWNED_COMPOSE_FIXTURE_FAILED')));
    });
    watch.allowCompose(pinModernSchemaChild(create));
    create.stdin.end('go\n');
    const newId=await newIdPromise;
    await waitForHealth(newId);
    const observation=await watch.observe();
    assert.equal(observation.candidate.id,newId);
    assert.equal(observation.oldRuntimeStopped,true);
    assert.ok(observation.executors.runtimeSessionPids.length>=1);
    setPhase('API_VERIFIED');
    await watch.observe();
    assert.deepEqual(probe('127.0.0.1',NEW),denied);
    assert.deepEqual(peerProbe(getIp(newId),NEW),denied);
    progress('REAL_CANDIDATE_NATIVE_WATCH_AND_HTTP_FENCE_BEHIND_SAME_S');
    setPhase('OPEN_INTENT');
    await ingress.releaseBeforeOpen();
    assert.equal(publisher.readPublic().phase,'FENCED');
    assert.equal(await admit(),true);
    assert.equal(probe('127.0.0.1',NEW).status,200);
    setPhase('INGRESS_RELEASED');
    const candidate={containerId:newId,revision:context.targetSha,bootId:randomUUID(),allowedKinds:[...HOLD_KINDS]};
    const opened=await publisher.open(binding,[candidate],async()=>admit());
    assert.deepEqual(confirmModernSchemaPublicDurability(()=>publisher.readPublic(),guard),
      {...opened,durabilityConfirmed:true});
    const closed=await closeModernSchemaOriginalSession({coordinator:{async close(){closing=true;await session.close();}},lease,client,guard});
    assert.equal(closed.outcome,'ORIGINAL_SESSION_ABSENT');
    progress('NATIVE_INGRESS_RELEASE_PRECEDES_DURABLE_PUBLIC_OPEN_AND_NATIVE_S_CLOSE');
    assert.equal(store.read('background-control.json').phase,'OPEN');
    receipt.outcome='PASS_NATIVE_HOST_COMPONENT_CHAIN';
    receipt.formalDeploymentBodyAndOidcExercised=false;save();
  }catch(error){
    receipt.outcome='HOLD';
    const message=String(error.message);
    receipt.failure=/^[A-Z_]+=[A-Z0-9_]+$/.test(message)?message:
      error.code==='ERR_ASSERTION'?'FIXTURE_ASSERTION':'FIXTURE_COMMAND_OR_TRANSPORT';
    const diagnostic=readMaintenanceSchedulerDiagnostic(error);
    if(diagnostic)receipt.schedulerDiagnostic=diagnostic;
    const at=/modern-schema-native-host[.]fixture[.]mjs:(\d+):/.exec(error.stack??'');
    if(at)receipt.failedLine=Number(at[1]);
    save();throw error;
  }finally{
    closing=true;
    await Promise.allSettled([client?.close(),watchClient?.close(),session?.close()]);
  }
}
await main().catch(()=>{console.error('MODERN_NATIVE_HOST_FIXTURE_HOLD');process.exitCode=1;});
