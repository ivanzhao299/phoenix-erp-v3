import assert from 'node:assert/strict';
import test from 'node:test';
import {spawn} from 'node:child_process';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
import {classifyModernSchemaDatabaseExecutors} from './production-modern-schema-executors.mjs';
import {ModernSchemaExecutorWatch} from './production-modern-schema-watch.mjs';
import {pinModernSchemaChild} from './production-modern-schema-processes.mjs';

const id = digit => digit.repeat(64);
const image = digit => 'sha256:' + id(digit);
const networkId = id('a');
const rootLease = {database:{name:'owned',databaseOid:1234,systemIdentifier:'913442',postmasterStartMicros:'672310'},
  sessionPid:501,backendStartMicros:'672332'};
const started = '2026-11-19T05:00:00.000000000Z';
const endpoint = ip => ({fixture: {NetworkID: networkId, IPAddress: ip}});
function container(service, digit, ip) {
  return {
    id:id(digit),imageId:image(digit),name:'/phoenix-v3-'+service,
    labels:{'com.docker.compose.project':'phoenix-erp','com.docker.compose.service':service},
    state:{StartedAt:started,Running:true,Health:{Status:'healthy'},ExitCode:0,Pid:55,OOMKilled:false,Restarting:false,Paused:false},
    ports:service==='api'?{'3100/tcp':[{HostIp:'127.0.0.1',HostPort:'3100'}]}:{},restartPolicy:{Name:'no'},restarts:0,
    networkMode:networkId,networks:endpoint(ip),mounts:[],privileged:false,pidMode:'',readonly:false,capDrop:[],user:'phoenix',entrypoint:[],cmd:[],
  };
}
function fixture() {
  const old=container('api','1','172.19.0.3'),web=container('web','2','172.19.0.2'),db=container('db','3','172.19.0.4');
  // The Docker bridge can recycle the original API address. Authorization
  // comes from the new exact native container pin and from R gone, not the IP.
  const candidate=container('api','4','172.19.0.3');
  const pin = value => ({id:value.id,image:value.imageId,startedAt:value.state.StartedAt,restartCount:0});
  const containers={api:pin(old),web:pin(web),db:pin(db)};
  const context={runtimeSnapshotSha256:canonicalDigest(containers),candidateImageId:candidate.imageId,owner:'9001-1'};
  const status={phase:'API_BODY',members:[]};
  const watch=new ModernSchemaExecutorWatch({context,
    preparation:{originalSnapshot:{containers},ownedResources:[],floor:{project:'phoenix-erp'},
      hostSurface:{runtimeAddress:'172.19.0.3',ingressScope:{networkId}}},
    state:{read:()=>({phase:status.phase})},rootLease,admit:()=>true}, {
    run(binary,args) {
      assert.deepEqual([binary,args],['/usr/bin/docker',['network','inspect',networkId]]);
      return JSON.stringify([{Id:networkId,Containers:Object.fromEntries(status.members.map(record=>[record.id,{}]))}]);
    },
  });
  const check = (...members) => {status.members=members;return watch.verifyContainers(members);};
  return {watch,old,web,db,candidate,status,check};
}
const databaseObservation = sessions => ({primary:true,statsComplete:true,databaseOid:1234,
  systemIdentifier:'913442',postmasterStartMicros:'672310',preparedTransactions:0,enabledSubscriptions:0,workers:[],observerPid:899,
  sessions:[{pid:501,databaseOid:1234,backendStartMicros:'672332',clientAddress:null,applicationName:'lease'},...sessions]});
const session = (pid,ip) => ({pid,databaseOid:1234,backendStartMicros:'672395',clientAddress:ip,applicationName:'fixture_api'});

function lateComposeFixture(entry,{register=true,alreadyRunning=false}={}){
 const f=fixture(),{watch,web,db,candidate}=f;
 const initPid=91001,rowPid=91002,ns='pid:[90210]',group='a'.repeat(64);
 const init={pid:initPid,ppid:91000,pidNamespace:ns,startTicks:String(BigInt(entry.pin.startTicks)+1n),cgroupSha256:group,exe:'/sbin/tini'};
 const row={pid:rowPid,ppid:initPid,pidNamespace:ns,startTicks:String(BigInt(init.startTicks)+1n),cgroupSha256:group,exe:'/usr/local/bin/node'};
 const foreign={...row,pid:91003,pidNamespace:'pid:[90211]'};
 [web,db].forEach(value=>{value.state.Pid=process.pid;});
 candidate.state.Pid=alreadyRunning?process.pid:initPid;
 const counts={snapshots:0,censuses:0,confirm:0,initReads:0};
 const setup={first:alreadyRunning?[web,db,candidate]:[web,db],refreshed:[web,db,candidate],
  pending:{owner:watch.context.owner,phase:'API_BODY',status:'RUNNING'},rows:[row],initCheck:()=>init,rowCheck:()=>row,pinCheck:()=>candidate};
 watch.state.read=()=>setup.pending;
 watch.runtime={isCommand:record=>record===entry,registeredChildren:()=>[entry]};
 watch.inspectProcess=pid=>{
  if(pid===entry.pin.pid)return {...entry.pin,ppid:entry.pin.parentPid};
  if(pid===initPid)return setup.initCheck(++counts.initReads);
  assert.equal(pid,rowPid);
  return setup.rowCheck();
 };
 if(register)watch.allowCompose(entry);
 // A mutable property alone is not the private registered role.
 else watch.composeChild=entry;
 watch.captureProcesses=()=>{counts.censuses++;return setup.rows;};
 watch.containers=()=>{const list=++counts.snapshots===1?setup.first:setup.refreshed;f.status.members=list;return list;};
 const run=watch.run;
 watch.run=(binary,args)=>{
  if(args[0]==='network'&&setup.networkMembers){
   return JSON.stringify([{Id:networkId,Containers:Object.fromEntries(setup.networkMembers.map(value=>[value.id,{}]))}]);
  }
  if(args[0]!=='inspect')return run(binary,args);
  assert.deepEqual([binary,args[1]],['/usr/bin/docker',candidate.id]);
  counts.confirm++;
  const c=setup.pinCheck();
  return [c.id,c.imageId,c.name,c.state,c.restarts,c.networkMode,c.ports,c.networks,c.labels,c.mounts,c.privileged,c.pidMode,c.readonly,c.capDrop,c.user,c.restartPolicy,c.entrypoint,c.cmd]
   .map(cell=>JSON.stringify(cell)).join('\t');
 };
 return {...f,setup,counts,init,row,foreign};
}

test('late exact Compose candidate accounts for the retained initial census and supplies the DB candidate pin', {timeout:5000}, async()=>{
 const child=spawn('/usr/bin/sleep',['10'],{stdio:'ignore'});
 const exited=new Promise(resolve=>child.once('exit',resolve));
 try{
  const entry=pinModernSchemaChild(child);
  for(const alreadyCreated of [false,true]){
   const f=lateComposeFixture(entry);
   if(alreadyCreated)f.setup.first.push({...f.candidate,state:{...f.candidate.state,Pid:0,Running:false,StartedAt:'0001-01-01T00:00:00Z'}});
   const observed=f.watch.observeHostContainers();
   assert.equal(observed.values,f.setup.refreshed);
   assert.equal(observed.runtime.candidate.containerId,f.candidate.id);
   assert.equal(f.watch.candidate.id,f.candidate.id);
   assert.deepEqual(f.counts,{snapshots:2,censuses:1,confirm:1,initReads:2});
   assert.deepEqual(classifyModernSchemaDatabaseExecutors(databaseObservation([session(502,'172.19.0.3')]),
    {...observed.runtime,originalLease:rootLease}).runtimeSessionPids,[502]);
   assert.throws(()=>classifyModernSchemaDatabaseExecutors(databaseObservation([session(503,'172.19.0.9')]),
    {...observed.runtime,originalLease:rootLease}),/UNKNOWN_OR_NEW_DATABASE_EXECUTOR/);
  }
  const f=lateComposeFixture(entry,{alreadyRunning:true});
  f.setup.rows=[];
  assert.equal(f.watch.observeHostContainers().values,f.setup.first);
  assert.deepEqual(f.counts,{snapshots:1,censuses:1,confirm:0,initReads:0});
 }finally{child.kill('SIGTERM');await exited;}
});

test('late Compose proof retains strangers and fails on stale, ambiguous or unauthenticated evidence', {timeout:5000}, async()=>{
 const child=spawn('/usr/bin/sleep',['10'],{stdio:'ignore'});
 const exited=new Promise(resolve=>child.once('exit',resolve));
 try{
  const entry=pinModernSchemaChild(child);
  for(const [mutate,error,lists] of [
   [f=>{f.setup.rows=[f.row,f.foreign];},/NEW_OR_CHANGED_HOST_EXECUTOR/,2],
   [f=>{f.setup.rows=[f.foreign,f.row];},/NEW_OR_CHANGED_HOST_EXECUTOR/,2],
   [f=>{f.setup.rows=[f.row,{...f.foreign,pidNamespace:f.init.pidNamespace,cgroupSha256:'b'.repeat(64)}];},/NEW_OR_CHANGED_HOST_EXECUTOR/,2],
   [f=>{f.setup.rowCheck=()=>({...f.row,startTicks:String(BigInt(f.row.startTicks)+1n)});},/NEW_OR_CHANGED_HOST_EXECUTOR/,2],
   [f=>{f.setup.rowCheck=()=>{throw Error('fixture EACCES');};},/fixture EACCES/,2],
   [f=>{f.setup.initCheck=n=>n===1?f.init:{...f.init,startTicks:String(BigInt(f.init.startTicks)+1n)};},/LATE_COMPOSE_CANDIDATE_CHANGED/,2],
   [f=>{f.setup.pinCheck=()=>({...f.candidate,state:{...f.candidate.state,Pid:f.init.pid+1}});},/LATE_COMPOSE_CANDIDATE_CHANGED/,2],
   [f=>{f.candidate.restarts=1;},/CANDIDATE_NATIVE_IDENTITY_CHANGED/,2],
   [f=>{f.candidate.imageId=image('f');},/CANDIDATE_NATIVE_IDENTITY_CHANGED/,2],
   [f=>{f.setup.refreshed.push(container('api','5','172.19.0.9'));},/UNREGISTERED_API_REPLACEMENT/,2],
   [f=>{f.setup.refreshed=[f.web,f.db];},/NEW_OR_CHANGED_HOST_EXECUTOR/,2],
   [f=>{f.setup.refreshed[0]={...f.web,state:{...f.web.state,Pid:f.init.pid+9}};},/UNRELATED_CONTAINER_CHANGED_DURING_COMPOSE/,2],
   [f=>{f.setup.networkMembers=f.setup.refreshed;},/UNKNOWN_DATABASE_NETWORK_MEMBER/,1],
   [f=>{f.setup.pending.owner='10001-1';},/NEW_OR_CHANGED_HOST_EXECUTOR/,1],
   [f=>{f.setup.pending.phase='DDL_STARTED';f.setup.first=[f.web,f.db,f.old];f.old.state.Running=false;f.old.state.Pid=0;},/NEW_OR_CHANGED_HOST_EXECUTOR/,1],
   [f=>{f.setup.pending.status='HOLD';},/NEW_OR_CHANGED_HOST_EXECUTOR/,1],
  ]){
   const f=lateComposeFixture(entry);
   mutate(f);
   assert.throws(()=>f.watch.observeHostContainers(),error);
   assert.equal(f.counts.snapshots,lists);
   assert.equal(f.watch.candidate,null);
  }
  const unregistered=lateComposeFixture(entry,{register:false});
  assert.throws(()=>unregistered.watch.observeHostContainers(),/NEW_OR_CHANGED_HOST_EXECUTOR/);
  assert.equal(unregistered.counts.snapshots,1);
  const exitedCompose=lateComposeFixture(entry);
  child.kill('SIGTERM');
  await exited;
  assert.throws(()=>exitedCompose.watch.observeHostContainers(),/NEW_OR_CHANGED_HOST_EXECUTOR/);
  assert.equal(exitedCompose.counts.snapshots,1);
 }finally{child.kill('SIGTERM');await exited;}
});

test('lease heartbeat shares the watch queue and keeps at most one outstanding check', async t => {
  t.mock.timers.enable({apis:['setInterval']});
  const {watch} = fixture();
  let checks = 0, release;
  const block = new Promise(resolve => { release = resolve; });
  const errors = [];
  watch.check = async () => { checks++; await block; };
  const occupied = watch.serially(() => block);
  const stop = watch.startLeaseHeartbeat(error => errors.push(error));
  t.mock.timers.tick(1000);
  const first = watch.serial;
  t.mock.timers.tick(10000);
  assert.equal(watch.serial, first);
  assert.equal(checks, 0);
  release();
  await occupied;
  await first;
  await stop();
  t.mock.timers.tick(10000);
  assert.equal(checks, 1);
  assert.deepEqual(errors, []);
});

test('original CID can disappear only at controlled Compose; replacement sessions cover all release phases', () => {
  const f=fixture();
  assert.throws(()=>f.check(f.web,f.db,f.candidate),/ORIGINAL_R_DISAPPEARED_WITHOUT_CONTROLLED_COMPOSE/);
  f.watch.composeChild={fixture:true};
  for(const phase of ['API_BODY','API_VERIFIED','OPEN_INTENT','OPEN_PUBLISHED','INGRESS_RELEASED','COMPLETED_OPEN']) {
    f.status.phase=phase;
    const pin=f.check(f.web,f.db,f.candidate);
    assert.equal(pin.oldRuntimeStopped,true);
    assert.equal(pin.candidate.containerId,f.candidate.id);
    assert.deepEqual(classifyModernSchemaDatabaseExecutors(databaseObservation([session(502,'172.19.0.3')]),
      {...pin,originalLease:rootLease}).runtimeSessionPids,[502]);
  }
});
test('stopped original address and unknown sessions have no authority before the actual candidate', () => {
  const f=fixture();
  f.status.phase='DDL_STARTED';
  f.old.state.Running=false;
  f.old.state.Pid=0;
  const pin=f.check(f.web,f.db,f.old);
  assert.throws(()=>classifyModernSchemaDatabaseExecutors(databaseObservation([session(502,'172.19.0.3')]),
    {...pin,originalLease:rootLease}),/UNKNOWN_OR_NEW_DATABASE_EXECUTOR/);
  f.status.phase='API_BODY';f.watch.composeChild={fixture:true};
  const admitted=f.check(f.web,f.db,f.candidate);
  assert.throws(()=>classifyModernSchemaDatabaseExecutors(databaseObservation([session(502,'172.19.0.9')]),
    {...admitted,originalLease:rootLease}),/UNKNOWN_OR_NEW_DATABASE_EXECUTOR/);
});
test('a restarted or substituted candidate cannot inherit the original watch',()=>{
  const f=fixture();
  f.watch.composeChild={fixture:true};f.check(f.web,f.db,f.candidate);
  f.candidate.restarts=1;
  assert.throws(()=>f.check(f.web,f.db,f.candidate),/CANDIDATE_NATIVE_IDENTITY_CHANGED/);
  f.candidate.restarts=0;
  f.candidate.state.StartedAt='2026-11-19T05:01:00.000000000Z';
  assert.throws(()=>f.check(f.web,f.db,f.candidate),/SECOND_CANDIDATE_OR_RESTART/);
});


test('lost, stopped or unhealthy verified candidate prevents terminal watch even without a DB session', () => {
  const f=fixture();
  f.watch.composeChild={fixture:true};
  f.check(f.web,f.db,f.candidate);
  f.status.phase='OPEN_PUBLISHED';
  assert.throws(()=>f.check(f.web,f.db),/VERIFIED_CANDIDATE_RUNTIME_LOST/);
  f.candidate.state.Running=false;
  assert.throws(()=>f.check(f.web,f.db,f.candidate),/VERIFIED_CANDIDATE_RUNTIME_LOST/);
  f.candidate.state.Running=true;
  f.candidate.state.Health.Status='unhealthy';
  assert.throws(()=>f.check(f.web,f.db,f.candidate),/VERIFIED_CANDIDATE_RUNTIME_LOST/);
});
