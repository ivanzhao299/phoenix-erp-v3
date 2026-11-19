import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {ModernSchemaPrivateRuntime} from './production-modern-schema-private.mjs';import {ModernSchemaBodyChannel} from './production-modern-schema-body-channel.mjs';
import {readLinuxProcessIdentity} from './production-modern-schema-session-lease.mjs';
import {ModernSchemaExecutorWatch} from './production-modern-schema-watch.mjs';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
import {closeModernSchemaBodyResources} from './production-modern-schema-api-body.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),script=path.join(root,'scripts/ops/production-modern-schema-body-ipc.py');
const quoted=value=>"'"+value.replaceAll("'","'\"'\"'")+"'";
function fixture(){
 const directory=fs.mkdtempSync(path.join(root,'artifacts/modern-schema-body-channel-'));
 const runtime=new ModernSchemaPrivateRuntime({directory,root,expectedUid:process.getuid(),guard(){},inspectDirectory:dir=>{const s=fs.statSync(dir);return {dev:s.dev,ino:s.ino,mode:s.mode};}});
 const work=runtime.createDirectory('1234-1','body');
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
 const processIdentity=pid=>{const p=readLinuxProcessIdentity(pid);return {pid,ppid:p.parentPid,startTicks:p.startTicks,exe:fs.readlinkSync(`/proc/${pid}/exe`),argvSha256:hash(fs.readFileSync(`/proc/${pid}/cmdline`)),cwdSha256:hash(fs.readlinkSync(`/proc/${pid}/cwd`)),pidNamespace:fs.readlinkSync(`/proc/${pid}/ns/pid`)};};
 return {runtime,directory,work,dependencies:{script,processIdentity,expectedUid:process.getuid(),inheritFd9:false}};
}
test('actual Unix peer credentials admit only the original suspended body descendant and keep results private',async()=>{
 const f=fixture(),calls=[],pidFile=path.join(f.work,'server-pid'),input=path.join(f.work,'body.sh');
 const channel=new ModernSchemaBodyChannel({owner:'1234-1',privateRuntime:f.runtime,directory:f.work,onRequest:request=>{assert.equal(channel.assertActivePeer(),true);calls.push(request);}},f.dependencies);
 fs.writeFileSync(input,`server_pid="$(cat ${quoted(pidFile)})"\n/usr/bin/python3 -I -S ${quoted(script)} request "/proc/$server_pid/fd/10/${channel.socketName}" "$server_pid" state begin\nprintf 'private-body-result'\n`,{mode:0o600});
 try{
  const result=await f.runtime.run({binary:'/bin/bash',args:['-Eeuo','pipefail'],directory:f.work,stem:'body',inputFile:input,deferInput:true,onSpawn:async entry=>{
   await channel.start(entry);const fd=f.runtime.openOutput(pidFile);try{fs.writeFileSync(fd,String(channel.entry.child.pid));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  }});
  assert.deepEqual(calls,[{operation:'state',args:['begin']}]);assert.equal(fs.readFileSync(result.stdout,'utf8'),'private-body-result');
 }finally{await channel.close();}
 assert.equal(fs.existsSync(channel.socketFile),false);
});
test('a sibling process with the same UID cannot impersonate a descendant by sending JSON identity fields',async()=>{
 const f=fixture(),input=path.join(f.work,'body.sh');fs.writeFileSync(input,'true\n',{mode:0o600});let calls=0;
 const channel=new ModernSchemaBodyChannel({owner:'1234-1',privateRuntime:f.runtime,directory:f.work,onRequest:()=>{calls++;}},f.dependencies);
 try{
  await f.runtime.run({binary:'/bin/bash',args:['-Eeuo','pipefail'],directory:f.work,stem:'body',inputFile:input,deferInput:true,onSpawn:async entry=>{
   await channel.start(entry);
   await assert.rejects(f.runtime.run({binary:'/usr/bin/python3',args:['-I','-S',script,'request',channel.socket,String(channel.entry.child.pid),'state','begin'],directory:f.work,stem:'sibling-request'}),/CHILD_RESULT_UNVERIFIED/);
  }});
  assert.equal(calls,0);assert.ok(channel.failed);
 }finally{await assert.rejects(channel.close());}
});
test('migration proxy arguments use private stdin, never client argv, and results stream from a protected file',async()=>{
 const f=fixture(),secret='synthetic-private-credential-never-an-argv',pidFile=path.join(f.work,'server-pid'),input=path.join(f.work,'migration.sh'),out=path.join(f.work,'result.stdout');
 fs.writeFileSync(out,'synthetic-private-cli-output\n',{mode:0o600});let peerArgv;
 const channel=new ModernSchemaBodyChannel({owner:'1234-1',privateRuntime:f.runtime,directory:f.work,onRequest:request=>{
  assert.deepEqual(request,{operation:'docker',args:['run','DB_PASSWORD='+secret]});peerArgv=fs.readFileSync(`/proc/${channel.activePeer.peer.pid}/cmdline`,'utf8');return {stdoutFile:out};
 }},{...f.dependencies,operationProfile:'CONTROLLED_MIGRATION'});
 fs.writeFileSync(input,`server_pid="$(cat ${quoted(pidFile)})"\nprintf '%s\\0' run ${quoted('DB_PASSWORD='+secret)} | /usr/bin/python3 -I -S ${quoted(script)} request-docker "/proc/$server_pid/fd/10/${channel.socketName}" "$server_pid"\n`,{mode:0o600});
 try{
  const result=await f.runtime.run({binary:'/bin/bash',args:['-Eeuo','pipefail'],directory:f.work,stem:'private-migration',inputFile:input,deferInput:true,onSpawn:async entry=>{
   await channel.start(entry);const fd=f.runtime.openOutput(pidFile);try{fs.writeFileSync(fd,String(channel.entry.child.pid));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  }});
  assert.equal(peerArgv.includes(secret),false);assert.equal(fs.readFileSync(result.stdout,'utf8'),'synthetic-private-cli-output\n');
 }finally{await channel.close();}
});
async function idleChannelFixture(customScript){
 const f=fixture(),input=path.join(f.work,'idle.sh');fs.writeFileSync(input,'true\n',{mode:0o600});
 const channel=new ModernSchemaBodyChannel({owner:'1234-1',privateRuntime:f.runtime,directory:f.work,onRequest:()=>assert.fail('No request expected')},
  {...f.dependencies,...(customScript?{script:customScript(f)}:{})});
 await f.runtime.run({binary:'/bin/bash',args:['-Eeuo','pipefail'],directory:f.work,stem:'idle-body',inputFile:input,deferInput:true,onSpawn:entry=>channel.start(entry)});
 return {...f,channel};
}
test('planned original IPC closure requires real exit zero and drained output before unlinking its socket',async()=>{
 const f=await idleChannelFixture();await f.channel.close({expectedGraceful:true});
 assert.equal(f.channel.entry.child.exitCode,0);assert.equal(f.channel.entry.child.signalCode,null);assert.equal(f.channel.entry.streamsClosed,true);
 assert.equal(f.runtime.isClosingChannel(f.channel.entry),true);assert.equal(fs.existsSync(f.channel.socketFile),false);
 await assert.rejects(f.channel.handle({kind:'REQUEST',sequence:1,request:{operation:'state',args:['complete']}}),/SINGLE_FIXED_REQUEST_REQUIRED/);
});
test('a native IPC server that exited before planned close cannot be relabeled as a clean close',async()=>{
 const f=await idleChannelFixture(f=>{
  const altered=path.join(f.work,'unexpected-zero.py');
  fs.writeFileSync(altered,fs.readFileSync(script,'utf8').replace('import sys\n','import sys\nimport signal\nsignal.signal(signal.SIGUSR1, lambda *_: sys.exit(0))\n'),{mode:0o600});return altered;
 }),child=f.channel.entry.child;child.kill('SIGUSR1');const deadline=performance.now()+2000;let state;
 do{
  const raw=fs.readFileSync('/proc/'+child.pid+'/stat','utf8');state=raw.slice(raw.lastIndexOf(')')+2).split(' ')[0];
  if(state==='Z')break;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);
 }while(performance.now()<deadline);
 assert.equal(state,'Z');assert.equal(child.exitCode,null);
 await assert.rejects(f.channel.close({expectedGraceful:true}));assert.equal(f.runtime.isClosingChannel(f.channel.entry),false);
 assert.equal(child.exitCode,0);assert.equal(f.channel.expectedClosing,false);assert.ok(f.channel.failed);
});
test('a real late IPC frame after close latches HOLD even when the Python child exits zero',async()=>{
 const f=await idleChannelFixture(f=>{
  const altered=path.join(f.work,'late-frame.py'),source=fs.readFileSync(script,'utf8'),needle='if not sys.stdin.readline():\n                break';
  assert.equal(source.split(needle).length,2);
  fs.writeFileSync(altered,source.replace(needle,'if not sys.stdin.readline():\n                print(json.dumps({"kind":"REQUEST","sequence":999}), flush=True)\n                break'),{mode:0o600});return altered;
 });
 await assert.rejects(f.channel.close({expectedGraceful:true}),/FRAME_AFTER_CLOSE/);
 assert.equal(f.channel.entry.child.exitCode,0);assert.equal(f.channel.entry.streamsClosed,true);assert.equal(fs.existsSync(f.channel.socketFile),true);
});
test('planned close cannot retire an IPC instance while its actual original request is unresolved',async()=>{
 const f=fixture(),input=path.join(f.work,'request.sh'),pidFile=path.join(f.work,'pid');let entered,release;
 const began=new Promise(resolve=>{entered=resolve;}),pending=new Promise(resolve=>{release=resolve;});
 const channel=new ModernSchemaBodyChannel({owner:'1234-1',privateRuntime:f.runtime,directory:f.work,onRequest:async()=>{entered();await pending;}},f.dependencies);
 fs.writeFileSync(input,`server_pid="$(cat ${quoted(pidFile)})"\n/usr/bin/python3 -I -S ${quoted(script)} request "/proc/$server_pid/fd/10/${channel.socketName}" "$server_pid" state begin\n`,{mode:0o600});
 const run=f.runtime.run({binary:'/bin/bash',args:['-Eeuo','pipefail'],directory:f.work,stem:'unresolved-body',inputFile:input,deferInput:true,onSpawn:async entry=>{
  await channel.start(entry);fs.writeFileSync(pidFile,String(channel.entry.child.pid),{mode:0o600});
 }});run.catch(()=>{});
 try{
  await began;assert.ok(channel.activePeer);let closed=false;
  const closing=channel.close({expectedGraceful:true}).finally(()=>{closed=true;});closing.catch(()=>{});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(closed,false);assert.equal(channel.handlers.size,1);
  assert.equal(channel.entry.child.exitCode,null);assert.throws(()=>channel.assertActivePeer(),/ACTIVE_ORIGINAL_REQUEST_REQUIRED/);
  release();await assert.rejects(closing);assert.equal(channel.handlers.size,0);
  assert.equal(f.runtime.isClosingChannel(channel.entry),false);
 }finally{release();await assert.rejects(run,/CHILD_RESULT_UNVERIFIED/);}
});
test('failed original Bash cleanup drains a handler awaiting watch.observe outside both queues',{timeout:5000},async()=>{
 const f=fixture(),input=path.join(f.work,'failed.sh'),pidFile=path.join(f.work,'pid');let entered,release,body,observations=0;
 const began=new Promise(resolve=>{entered=resolve;}),continueHandler=new Promise(resolve=>{release=resolve;});
 const watch=new ModernSchemaExecutorWatch({context:{runtimeSnapshotSha256:canonicalDigest({})},
  preparation:{originalSnapshot:{containers:{}},ownedResources:[]},privateRuntime:f.runtime,admit:()=>true});
 watch.observeNative=async()=>{observations++;return 'FRESH_OBSERVATION';};
 const channel=new ModernSchemaBodyChannel({owner:'1234-1',privateRuntime:f.runtime,directory:f.work,onRequest:async()=>{
  entered();await continueHandler;await watch.observe();
 }},f.dependencies);
 fs.writeFileSync(input,`server_pid="$(cat ${quoted(pidFile)})"\n/usr/bin/python3 -I -S ${quoted(script)} request "/proc/$server_pid/fd/10/${channel.socketName}" "$server_pid" state begin\n`,{mode:0o600});
 const run=f.runtime.run({binary:'/bin/bash',args:['-Eeuo','pipefail'],directory:f.work,stem:'failed-parent',inputFile:input,deferInput:true,onSpawn:async entry=>{
  body=entry;await channel.start(entry);fs.writeFileSync(pidFile,String(channel.entry.child.pid),{mode:0o600});
 }});run.catch(()=>{});
 await began;body.child.kill('SIGTERM');await assert.rejects(run,/CHILD_RESULT_UNVERIFIED/);
 let closed=false;const closing=watch.closeBodyChannel(channel,{expectedGraceful:false}).finally(()=>{closed=true;});closing.catch(()=>{});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(closed,false);assert.equal(channel.handlers.size,1);assert.equal(channel.entry.child.exitCode,null);
 release();await assert.rejects(closing);assert.equal(observations,1);assert.equal(channel.handlers.size,0);assert.equal(closed,true);
});
test('diagnostic IO failure cannot skip the actual IPC drain and shutdown or replace an earlier failure',async()=>{
 for(const primaryError of [undefined,Error('original body failure')]){
  const f=await idleChannelFixture(),syncFailure=Error('synthetic diagnostic EIO');let fdClosed=false,drained=false;
  await assert.rejects(closeModernSchemaBodyResources({diagnostic:42,channel:f.channel,watch:{async closeBodyChannel(channel,options){
   await channel.drainForClose();drained=true;await channel.close(options);
  }},expectedGraceful:true,primaryError},{fsyncSync(){throw syncFailure;},closeSync(){fdClosed=true;}}),error=>error===(primaryError??syncFailure));
  assert.equal(fdClosed,true);assert.equal(drained,true);assert.equal(f.channel.entry.child.exitCode,0);assert.equal(f.channel.entry.streamsClosed,true);
 }
});
test('late handler diagnostics remain in the open private FD until IPC drain and shutdown finish',async()=>{
 const f=await idleChannelFixture(),file=path.join(f.work,'private-adapters.log'),fd=f.runtime.openOutput(file),oldLog=console.log;
 const primaryError=Error('original body failed');
 console.log=value=>fs.writeSync(fd,String(value)+'\n');
 try{
  await assert.rejects(closeModernSchemaBodyResources({diagnostic:fd,channel:f.channel,expectedGraceful:true,primaryError,
   watch:{async closeBodyChannel(channel,options){await Promise.resolve();console.log('FLOOR_REANCHOR_PRECHECK=version:3;critical:false');await channel.close(options);}}}),error=>error===primaryError);
 }finally{console.log=oldLog;}
 assert.equal(fs.readFileSync(file,'utf8'),'FLOOR_REANCHOR_PRECHECK=version:3;critical:false\n');assert.equal(f.channel.entry.streamsClosed,true);
 assert.throws(()=>fs.fstatSync(fd),{code:'EBADF'});
});
