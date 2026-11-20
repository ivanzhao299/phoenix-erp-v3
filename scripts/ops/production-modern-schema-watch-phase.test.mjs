import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
import {classifyModernSchemaDatabaseExecutors} from './production-modern-schema-executors.mjs';
import {ModernSchemaExecutorWatch} from './production-modern-schema-watch.mjs';
import {pinModernSchemaChild,isOriginalModernSchemaChildTerminal} from './production-modern-schema-processes.mjs';
import {STABLE_MODERN_CENSUS_PARENT} from './production-maintenance-root-readers.mjs';
import {readLinuxProcessIdentity} from './production-modern-schema-session-lease.mjs';

test('the native host fixture loads with only its deployed scripts directories', t => {
  const deployment=fs.mkdtempSync(path.join(os.tmpdir(),'phoenix-native-host-closure-'));
  t.after(()=>fs.rmSync(deployment,{recursive:true,force:true}));
  for(const component of ['ops','ci']){
    fs.cpSync(fileURLToPath(new URL('../'+component,import.meta.url)),path.join(deployment,'scripts',component),{recursive:true});
  }
  // No fixture admission environment. Linking must succeed before its own
  // preflight stops execution at the deliberate fixture-only guard.
  const result=spawnSync(process.execPath,['scripts/ci/modern-schema-native-host.fixture.mjs'],{
    cwd:deployment,env:{},encoding:'utf8',timeout:10000,
  });
  assert.equal(result.error,undefined);
  assert.equal(result.status,1);
  assert.equal(result.stderr.trim(),'MODERN_NATIVE_HOST_FIXTURE_HOLD');
});

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

function terminalComposeFixture(t,{code=0,includeOriginalRow=false,body='read -r ignored; exit "$1"',args=[]}={}){
 const child=spawn('/bin/bash',['--noprofile','--norc','-c',body,'--',String(code),...args],{stdio:['pipe','ignore','ignore']});
 const exited=new Promise(resolve=>child.once('exit',resolve));
 const entry=pinModernSchemaChild(child),f=lateComposeFixture(entry),{watch,setup,counts}=f;
 f.db.state.Pid=91004;
 f.web.state.Pid=91005;
 const namespaces=new Map([[f.init.pid,f.init.pidNamespace],[f.db.state.Pid,'pid:[90212]'],[f.web.state.Pid,'pid:[90213]']]);
 const readlink=fs.readlinkSync;
 const namespaceRead=t.mock.method(fs,'readlinkSync',(...args)=>{
  const pid=Number(/^\/proc\/(\d+)\/ns\/pid$/.exec(args[0])?.[1]);
  return namespaces.get(pid)??readlink(...args);
 });
 const identity=watch.inspectProcess;
 const terminalRow={...entry.pin,ppid:entry.pin.parentPid,exe:'',argvSha256:'',cwdSha256:''};
 watch.inspectProcess=pid=>pid===entry.pin.pid&&child.exitCode===null&&isOriginalModernSchemaChildTerminal(entry)?terminalRow:identity(pid);
 watch.captureProcesses=()=>{
  counts.censuses++;
  return includeOriginalRow&&child.exitCode===null?[terminalRow,...setup.rows]:setup.rows;
 };
 let inSlot=false,slots=0;
 watch.runtime.guard=()=>{};
 watch.session={withSynchronousObservation(work){
  slots++;
  inSlot=true;
  try{return Promise.resolve(work());}catch(error){return Promise.reject(error);}finally{inSlot=false;}
 }};
 child.once('exit',()=>assert.equal(inSlot,false));
 const stop=signal=>{
  if(signal)child.kill(signal);
  else child.stdin.end('\n');
  const deadline=performance.now()+2000,wait=new Int32Array(new SharedArrayBuffer(4));
  while(!isOriginalModernSchemaChildTerminal(entry)&&performance.now()<deadline)Atomics.wait(wait,0,0,10);
  assert.equal(isOriginalModernSchemaChildTerminal(entry),true);
  assert.equal(child.exitCode,null);
 };
 return {...f,entry,child,exited,stop,slots:()=>slots,restore:()=>namespaceRead.mock.restore()};
}

test('a true late candidate with just-terminated Compose revalidates only after the actual exit zero', {timeout:10000}, async t=>{
 for(const includeOriginalRow of [false,true]){
  const f=terminalComposeFixture(t,{includeOriginalRow});
  let admissions=0;
  f.watch.admit=()=>{
   admissions++;
   assert.equal(f.child.exitCode,0);
   assert.equal(f.watch.candidate,null);
   return true;
  };
  try{
   f.stop();
   const observed=await f.watch.observeHostAfterOriginalExit(()=>f.watch.observeHostContainers());
   assert.equal(observed.values,f.setup.refreshed);
   assert.equal(observed.runtime.candidate.containerId,f.candidate.id);
   assert.deepEqual(f.counts,{snapshots:3,censuses:2,confirm:1,initReads:2});
   assert.equal(f.slots(),2);
   assert.equal(admissions,1);
  }finally{f.restore();f.child.kill('SIGKILL');await f.exited;}
 }
});

test('a late candidate and pending Compose do not discard unknown original rows or skip the final pin', {timeout:10000}, async t=>{
 for(const [mutate,expected,confirmations] of [
  [f=>{f.setup.rows=[f.row,f.foreign];},/NEW_OR_CHANGED_HOST_EXECUTOR/,0],
  [f=>{f.setup.rows=[f.foreign,f.row];},/NEW_OR_CHANGED_HOST_EXECUTOR/,0],
  [f=>{f.setup.pinCheck=()=>({...f.candidate,state:{...f.candidate.state,Pid:f.init.pid+1}});},/LATE_COMPOSE_CANDIDATE_CHANGED/,1],
  [f=>{f.entry.pin.bootId='wrong boot';},/ORIGINAL_CONTROL_CHILD_UNPROVED/,0],
 ]){
  const f=terminalComposeFixture(t,{includeOriginalRow:true});
  try{
   f.stop();
   mutate(f);
   await assert.rejects(f.watch.observeHostAfterOriginalExit(()=>f.watch.observeHostContainers()),expected);
   assert.equal(f.slots(),1);
   assert.equal(f.counts.confirm,confirmations);
   assert.equal(f.watch.candidate,null);
  }finally{f.restore();f.child.kill('SIGKILL');await f.exited;}
 }
});

test('a proven late candidate cannot turn a failed or signalled Compose exit into success', {timeout:5000}, async t=>{
 for(const signal of [null,'SIGTERM']){
  const f=terminalComposeFixture(t,{code:7});
  try{
   f.stop(signal);
   await assert.rejects(f.watch.observeHostAfterOriginalExit(()=>f.watch.observeHostContainers()),/ORIGINAL_CHILD_EXIT_FAILED/);
   assert.equal(f.child.exitCode,signal?null:7);
   assert.equal(f.child.signalCode,signal);
   assert.equal(f.counts.confirm,1);
   assert.equal(f.slots(),1);
   assert.equal(f.watch.candidate,null);
  }finally{f.restore();f.child.kill('SIGKILL');await f.exited;}
 }
});

test('waiting for the original body exit cannot hide a second, nonzero Compose result', {timeout:5000}, async t=>{
 const f=terminalComposeFixture(t,{code:7});
 const body=spawn('/bin/bash',['--noprofile','--norc','-c','read -r ignored'],{stdio:['pipe','ignore','ignore']});
 const bodyExited=new Promise(resolve=>body.once('exit',resolve));
 try{
  const entry=pinModernSchemaChild(body);
  const inspect=f.watch.inspectProcess;
  f.watch.inspectProcess=pid=>pid===entry.pin.pid?{...entry.pin,ppid:entry.pin.parentPid}:inspect(pid);
  f.watch.runtime.isCommand=record=>record===entry||record===f.entry;
  f.watch.runtime.registeredChildren=()=>[entry,f.entry];
  f.setup.pending.phase='SCHEMA_RECEIPTED';
  f.watch.allowDescendants(entry,'FORMAL_API_BODY');
  f.setup.pending.phase='API_BODY';
  f.setup.rows=[{...entry.pin,ppid:entry.pin.parentPid,exe:'',argvSha256:'',cwdSha256:''},f.row];
  body.stdin.end('\n');
  f.stop();
  const deadline=performance.now()+2000,wait=new Int32Array(new SharedArrayBuffer(4));
  while(!isOriginalModernSchemaChildTerminal(entry)&&performance.now()<deadline)Atomics.wait(wait,0,0,10);
  assert.equal(isOriginalModernSchemaChildTerminal(entry),true);
  assert.equal(body.exitCode,null);
  await assert.rejects(f.watch.observeHostAfterOriginalExit(()=>f.watch.observeHostContainers()),/ORIGINAL_CHILD_EXIT_FAILED/);
  assert.equal(body.exitCode,0);
  assert.equal(f.child.exitCode,7);
  assert.equal(f.counts.confirm,1);
  assert.equal(f.slots(),1);
  assert.equal(f.watch.candidate,null);
 }finally{f.restore();body.kill('SIGKILL');f.child.kill('SIGKILL');await Promise.all([bodyExited,f.exited]);}
});

async function goneComposePluginFixture(t,{code=0,late=false}={}){
 const artifacts=fileURLToPath(new URL('../../artifacts/',import.meta.url));
 const directory=fs.mkdtempSync(path.join(artifacts,'modern-schema-cp40-plugin-'));
 const [started,stop,reaped]=['pid','stop','reaped'].map(name=>path.join(directory,name));
 const worker="const fs=require('fs');fs.writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{if(fs.existsSync(process.argv[2]))process.exit(0)},10)";
 const f=terminalComposeFixture(t,{code,body:'"$2" -e "$3" "$4" "$5" & worker=$!; wait "$worker"; : > "$6"; read -r ignored; exit "$1"',
  args:[process.execPath,worker,started,stop,reaped]});
 const cleanup=async()=>{
  fs.writeFileSync(stop,'');
  if(f.child.exitCode===null&&f.child.signalCode===null&&!f.child.stdin.writableEnded)f.child.stdin.end('\n');
  f.restore();
  await f.exited;
 };
 const waitFor=async file=>{
  const deadline=performance.now()+3000;
  while(!fs.existsSync(file)&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
  assert.ok(fs.existsSync(file));
 };
 try{
  await waitFor(started);
  const pid=Number(fs.readFileSync(started,'utf8')),identity=readLinuxProcessIdentity(pid);
  const row={pid,ppid:identity.parentPid,startTicks:identity.startTicks,
   exe:fs.readlinkSync(`/proc/${pid}/exe`),pidNamespace:fs.readlinkSync(`/proc/${pid}/ns/pid`)};
  assert.deepEqual(readLinuxProcessIdentity(pid),identity);
  assert.equal(row.ppid,f.entry.pin.pid);
  Object.defineProperty(row,STABLE_MODERN_CENSUS_PARENT,{value:true});
  fs.writeFileSync(stop,'');await waitFor(reaped);
  assert.throws(()=>fs.lstatSync(`/proc/${pid}`),{code:'ENOENT'});
  assert.equal(f.child.exitCode,null);
  if(!late)f.setup.first=f.setup.refreshed;
  f.setup.rows=[row];
  return {...f,plugin:row,cleanup};
 }catch(error){await cleanup();throw error;}
}

test('a reaped direct plugin belongs to the exact live or just-terminated original Compose', {timeout:10000}, async t=>{
 for(const terminal of [false,true]){
  const f=await goneComposePluginFixture(t);
  let admissions=0;
  f.watch.admit=()=>{admissions++;assert.equal(f.child.exitCode,0);return true;};
  try{
   if(terminal)f.stop();
   const census=f.watch.captureProcesses;
   f.watch.captureProcesses=()=>f.child.exitCode===0?[]:census();
   const observed=await f.watch.observeHostAfterOriginalExit(()=>f.watch.observeHostContainers());
   assert.equal(observed.runtime.candidate.containerId,f.candidate.id);
   assert.equal(f.slots(),terminal?2:1);
   assert.equal(admissions,terminal?1:0);
   assert.equal(f.child.exitCode,terminal?0:null);
  }finally{await f.cleanup();}
 }
});

test('a reaped plugin does not hide an incomplete census, bad original pin or failed exit', {timeout:15000}, async t=>{
 for(const [change,error,confirmed] of [
  [f=>{f.setup.rows=[f.plugin,f.foreign];},/NEW_OR_CHANGED_HOST_EXECUTOR/,0],
  [f=>{f.setup.rows=[f.foreign,f.plugin];},/NEW_OR_CHANGED_HOST_EXECUTOR/,0],
  [f=>{f.setup.pending.owner='7001-1';},/NEW_OR_CHANGED_HOST_EXECUTOR/,0],
  [f=>{f.setup.pending.phase='API_VERIFIED';},/NEW_OR_CHANGED_HOST_EXECUTOR/,0],
  [f=>{f.entry.pin.bootId='bad boot pin';},/NEW_OR_CHANGED_HOST_EXECUTOR/,0],
  [f=>{f.composeChild={...f.entry};f.watch.composeChild=f.composeChild;},/NEW_OR_CHANGED_HOST_EXECUTOR/,0],
  [f=>{f.setup.rows=[{...f.plugin}];},/NEW_OR_CHANGED_HOST_EXECUTOR/,0],
  [f=>{f.setup.rows=[f.plugin,f.row];f.setup.pinCheck=()=>({...f.candidate,state:{...f.candidate.state,Pid:f.init.pid+1}});},/LATE_COMPOSE_CANDIDATE_CHANGED/,1],
  [()=>{},/ORIGINAL_CHILD_EXIT_FAILED/,0],
 ]){
  const f=await goneComposePluginFixture(t,{code:7,late:confirmed>0});
  try{
   f.stop();change(f);
   await assert.rejects(f.watch.observeHostAfterOriginalExit(()=>f.watch.observeHostContainers()),error);
   assert.equal(f.slots(),1);
   assert.equal(f.counts.confirm,confirmed);
   if(confirmed)assert.equal(f.watch.candidate,null);
  }finally{await f.cleanup();}
 }
});

test('Compose plugin retirement requires both fresh absence reads', {timeout:5000}, async t=>{
 const f=await goneComposePluginFixture(t),lstat=fs.lstatSync,pluginPath=`/proc/${f.plugin.pid}`;
 try{
  for(const code of ['EACCES','EPERM']){
   const mocked=t.mock.method(fs,'lstatSync',(...args)=>{
    if(args[0]===pluginPath)throw Object.assign(Error(code),{code});
    return lstat(...args);
   });
   try{assert.throws(()=>f.watch.observeHostContainers(),/NEW_OR_CHANGED_HOST_EXECUTOR/);}finally{mocked.mock.restore();}
  }
  let reads=0;
  const mocked=t.mock.method(fs,'lstatSync',(...args)=>{
   if(args[0]===pluginPath&&++reads===2)return lstat(`/proc/${process.pid}`);
   return lstat(...args);
  });
  try{
   assert.throws(()=>f.watch.observeHostContainers(),/NEW_OR_CHANGED_HOST_EXECUTOR/);
   assert.equal(reads,2);
  }finally{mocked.mock.restore();}
 }finally{await f.cleanup();}
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

test('during long read-only observations the heartbeat independently refuses an unknown primary executor',async t=>{
 t.mock.timers.enable({apis:['setInterval']});
 const {watch}=fixture(),errors=[];
 const stop=watch.startLeaseHeartbeat(error=>errors.push(error));
 try{
  watch.check=async()=>{};
  watch.fencedFactRead=true;
  let observed=[];
  watch.client={query:async()=>({rows:[{observation:JSON.stringify(databaseObservation(observed))}]})};
  t.mock.timers.tick(1000);
  await watch.serial;
  await Promise.resolve();
  assert.deepEqual(errors,[]);
  observed=[session(711,'172.19.0.20')];
  t.mock.timers.tick(1000);
  await watch.serial;
  await Promise.resolve();
  assert.match(errors[0]?.message??'',/UNKNOWN_OR_NEW_DATABASE_EXECUTOR/);
 }finally{await stop();}
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

test('reviewed retained rehearsal remains inert only with its exact closed container fingerprint',()=>{
  const f=fixture();
  const retained=container('api','5','172.31.0.2');
  retained.labels={'phoenix.schema.owner':'8999-1','phoenix.schema.role':'rehearsal-original-api'};
  retained.networkMode=id('b');
  retained.networks={isolated:{NetworkID:retained.networkMode}};
  retained.ports={};
  retained.mounts=[{Type:'bind',Source:'/isolated/prepare/control-original-api',Destination:'/run/phoenix-background-control',RW:false}];
  Object.assign(retained.state,{Running:false,Pid:0,Status:'exited'});
  f.watch.preparation.hostSurface.inertArtifacts=[{id:retained.id,classification:'RETAINED_REVIEWED_REHEARSAL_API',identitySha256:canonicalDigest(retained)}];
  f.status.members=[f.old,f.web,f.db];
  const verify=artifact=>f.watch.verifyContainers([...f.status.members,artifact]);
  assert.equal(verify(retained).candidate,null);
  const restarted=structuredClone(retained);Object.assign(restarted.state,{Running:true,Pid:122,StartedAt:'2026-11-19T05:01:00Z'});
  assert.throws(()=>verify(restarted),/RETAINED_ARTIFACT_CHANGED/);
  const modified=structuredClone(retained);modified.mounts[0].RW=true;
  assert.throws(()=>verify(modified),/RETAINED_ARTIFACT_CHANGED/);
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

test('clean local pg_dump completion still needs a newer native backend sample', async () => {
 const {watch}=fixture();
 const app='phoenix-schema-9001-1-schema-before';
 const exact={...session(502,null),applicationName:app};
 const other={...exact,pid:503};
 const command={entry:{child:{exitCode:0,signalCode:null},pin:{pid:777}},applicationName:app,native:null};
 watch.readCommand=command;
 const prior=watch.observeReadonlyBackupBackend(databaseObservation([exact]));
 assert.equal(prior.closing,true);
 assert.equal(prior.pin.pid,502);
 assert.deepEqual(watch.observeReadonlyBackupBackend(databaseObservation([])),{pin:null,closing:false});
 assert.throws(()=>watch.observeReadonlyBackupBackend(databaseObservation([other])),/READONLY_BACKUP_BACKEND_CHANGED/);
 assert.throws(()=>watch.observeReadonlyBackupBackend(databaseObservation([exact,other])),/SECOND_READONLY_BACKUP_EXECUTOR/);
 command.entry.child.exitCode=1;
 assert.throws(()=>watch.observeReadonlyBackupBackend(databaseObservation([])),/REMOTE_READONLY_BACKUP_RESULT_UNRESOLVED/);
});

test('pg_dump retirement waits for the active sample and verifies native absence before forgetting its pin', async () => {
 const {watch}=fixture();
 const command={entry:{child:{exitCode:0,signalCode:null}}};
 watch.readCommand=command;
 let releaseOld,releaseNew,enteredNew;
 const old=new Promise(resolve=>{releaseOld=resolve;});
 const fresh=new Promise(resolve=>{releaseNew=resolve;});
 const started=new Promise(resolve=>{enteredNew=resolve;});
 watch.observeNative=async()=>{
  assert.equal(watch.readCommand,command);
  enteredNew();
  await fresh;
 };
 const observing=watch.serially(()=>old);
 const retiring=watch.clearReadonlyBackup();
 assert.equal(watch.readCommand,command);
 releaseOld();
 await observing;
 await started;
 assert.equal(watch.readCommand,command);
 releaseNew();
 await retiring;
 assert.equal(watch.readCommand,null);
});

test('only the read-only backup fact capture spreads the recurring native census',async()=>{
 const {watch}=fixture();
 const state={phase:'R_STOPPED',status:'RUNNING'};
 watch.state={read:()=>state,ddlIntentExists:()=>false};
 watch.running=true;
 let observations=0;
 watch.observe=async()=>{observations++;};
 const facts={readOnly:true};
 const got=await watch.duringFencedFacts('R_STOPPED',async()=>{
  assert.equal(watch.fencedFactRead,true);
  assert.equal(observations,0);
  await assert.rejects(watch.duringFencedFacts('R_STOPPED',async()=>assert.fail('Nested capture reached reader')),/ORIGINAL_FENCED_FACT_READ_REQUIRED/);
  return facts;
 });
 assert.equal(got,facts);
 assert.equal(watch.fencedFactRead,false);
 await assert.rejects(watch.duringFencedFacts('R_STOPPED',async()=>{throw Error('fact read failed');}),/fact read failed/);
 assert.equal(watch.fencedFactRead,false);
 state.phase='DDL_STARTED';
 await assert.rejects(watch.duringFencedFacts('DDL_STARTED',async()=>assert.fail('Unrecorded DDL reached reader')),/ORIGINAL_FENCED_FACT_READ_REQUIRED/);
 watch.state.ddlIntentExists=()=>true;
 watch.migration={};
 await assert.rejects(watch.duringFencedFacts('DDL_STARTED',async()=>assert.fail('Active migration reached reader')),/ORIGINAL_FENCED_FACT_READ_REQUIRED/);
 watch.migration=null;
 assert.equal(await watch.duringFencedFacts('DDL_STARTED',async()=>facts),facts);
 state.phase='FRESH_RECHECKED';watch.state.ddlIntentExists=()=>false;
 assert.equal(await watch.duringFencedFacts('FRESH_RECHECKED',async()=>facts),facts);
});

test('rehearsal or post-DDL facts cannot be returned before their second full observation',async()=>{
 const {watch}=fixture(),steps=[];
 watch.state={read:()=>({phase:'FRESH_RECHECKED',status:'RUNNING'}),ddlIntentExists:()=>false};
 watch.running=true;
 watch.observe=async()=>{
  steps.push('full observation');
  if(steps.length===3)throw Error('new unaccounted actor');
 };
 await assert.rejects(watch.observeFencedFacts('FRESH_RECHECKED',async()=>{
  steps.push('readonly facts');return {};
 }),/new unaccounted actor/);
 assert.deepEqual(steps,['full observation','readonly facts','full observation']);
 assert.equal(watch.fencedFactRead,false);
});

for(const inFlight of [false,true]){
 test('fenced fact capture restores one ordinary census timer with '+(inFlight?'an active observation':'a queued observation'),async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const {watch}=fixture();
  watch.state={read:()=>({phase:'R_STOPPED',status:'RUNNING'}),ddlIntentExists:()=>false};
  watch.baseline=new Map();
  let finishFacts,finishObservation,count=0;
  const facts=new Promise(resolve=>{finishFacts=resolve;});
  const observation=new Promise(resolve=>{finishObservation=resolve;});
  watch.observe=async()=>{if(++count===2&&inFlight)await observation;};
  watch.start();
  await watch.observe();
  const capture=watch.duringFencedFacts('R_STOPPED',()=>facts);
  await Promise.resolve();
  t.mock.timers.tick(500);
  assert.equal(count,2);
  if(!inFlight)await watch.pending;

  finishFacts();await capture;
  if(inFlight){
   t.mock.timers.tick(30000);
   assert.equal(count,2);
   finishObservation();await watch.pending;
  }
  t.mock.timers.tick(499);
  assert.equal(count,2);
  t.mock.timers.tick(1);
  await watch.pending;
  assert.equal(count,3);
  await watch.stop();
  t.mock.timers.tick(30000);
  assert.equal(count,3);
 });
}
