import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {ModernSchemaPrivateRuntime} from './production-modern-schema-private.mjs';
import {verifyModernSchemaChild,isOriginalModernSchemaChildTerminal,pinModernSchemaChild} from './production-modern-schema-processes.mjs';
import {ModernSchemaExecutorWatch} from './production-modern-schema-watch.mjs';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
import {spawn,spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
function fixture(){
 const directory=fs.mkdtempSync(path.join(root,'artifacts/modern-schema-private-'));
 const runtime=new ModernSchemaPrivateRuntime({directory,root,expectedUid:process.getuid(),guard(){},inspectDirectory:dir=>{const s=fs.statSync(dir);return {dev:s.dev,ino:s.ino,mode:s.mode};}});
 return {runtime,directory,work:runtime.createDirectory('1234-1','prepare-backup')};
}
test('actual controlled child uses a flat live pin and output stays exclusively in protected files',async()=>{
 const f=fixture();let pin;
 const result=await f.runtime.run({binary:process.execPath,args:['-e',"setTimeout(()=>{process.stdout.write('synthetic-private-output');process.stderr.write('synthetic-private-diagnostic');},100)"],directory:f.work,stem:'owned-child',onSpawn:entry=>{pin=entry.pin;assert.equal(typeof pin.pid,'number');assert.equal(f.runtime.registeredChildren()[0].pin.pid,pin.pid);}});
 assert.equal(result.exitCode,0);assert.equal(fs.statSync(result.stdout).mode&0o777,0o600);assert.equal(fs.readFileSync(result.stdout,'utf8'),'synthetic-private-output');
 const sum=await f.runtime.digest(result.stdout);assert.equal(sum.sha256,createHash('sha256').update('synthetic-private-output').digest('hex'));assert.equal(f.runtime.registeredChildren().length,0);
});
test('one deadline covers a never-resolving admission callback and retains the original child handle',async()=>{
 const f=fixture();let aborted=false;
 await assert.rejects(f.runtime.run({binary:process.execPath,args:['-e','setInterval(()=>{},1000)'],directory:f.work,stem:'hung-admission',timeoutMs:100,
  onSpawn:(_entry,{signal})=>{signal.addEventListener('abort',()=>{aborted=true;});return new Promise(()=>{});}}),/CHILD_DEADLINE/);
 assert.equal(aborted,true);assert.equal(f.runtime.children.size,1);const [entry]=f.runtime.children;assert.equal(typeof entry.child.pid,'number');
 if(entry.child.exitCode===null&&entry.child.signalCode===null)await new Promise(resolve=>entry.child.once('exit',resolve));
});
test('a deferred body cannot execute before its exact child has been admitted',async()=>{
 const f=fixture(),input=path.join(f.work,'body.sh');fs.writeFileSync(input,"printf 'synthetic-body'\n",{mode:0o600});let admitted=false;
 const result=await f.runtime.run({binary:'/bin/bash',args:['-Eeuo','pipefail'],directory:f.work,stem:'deferred-body',inputFile:input,deferInput:true,onSpawn:()=>{admitted=true;}});
 assert.equal(admitted,true);assert.equal(fs.readFileSync(result.stdout,'utf8'),'synthetic-body');
});
test('file growth yields the intended HOLD with one descriptor owner',async()=>{
 const f=fixture(),file=path.join(f.work,'growth');fs.writeFileSync(file,'before',{mode:0o600});const original=fs.readSync;let grown=false;
 fs.readSync=function(...args){const count=original.apply(this,args);if(!grown){grown=true;fs.appendFileSync(file,'after');}return count;};
 try{await assert.rejects(f.runtime.digest(file),error=>error.message==='MODERN_SCHEMA_PRIVATE_HOLD=PRIVATE_FILE_GREW');}finally{fs.readSync=original;}
});
test('a closed deferred-input pipe cannot terminate the supervisor or yield a successful child result',async()=>{
 const f=fixture(),file=path.join(f.work,'large-body.sh');fs.writeFileSync(file,'#'+'x'.repeat(100000)+'\n',{mode:0o600});
 await assert.rejects(f.runtime.run({binary:'/bin/bash',args:['-c','exec 0<&-; sleep 0.2; exit 0'],directory:f.work,stem:'closed-input',inputFile:file,deferInput:true,
  onSpawn:()=>new Promise(resolve=>setTimeout(resolve,50))}),/CHILD_RESULT_UNVERIFIED/);
});
test('a final JSON receipt is create-only, single-link and is not published after an incomplete write',()=>{
 const f=fixture(),file=path.join(f.work,'receipt.json');f.runtime.publishJson(file,{outcome:'COMPLETE'});
 assert.equal(fs.lstatSync(file).nlink,1);assert.equal(fs.lstatSync(file).mode&0o777,0o600);assert.deepEqual(JSON.parse(fs.readFileSync(file)),{outcome:'COMPLETE'});
 assert.throws(()=>f.runtime.publishJson(file,{outcome:'REPLACED'}));assert.deepEqual(JSON.parse(fs.readFileSync(file)),{outcome:'COMPLETE'});
 const missing=path.join(f.work,'incomplete.json'),original=fs.writeFileSync;fs.writeFileSync=()=>{throw Error('synthetic interrupted write');};
 try{assert.throws(()=>f.runtime.publishJson(missing,{outcome:'INCOMPLETE'}));}finally{fs.writeFileSync=original;}
 assert.equal(fs.existsSync(missing),false);
});

const nativeRow=entry=>{
 const base='/proc/'+entry.pin.pid,hash=value=>createHash('sha256').update(value).digest('hex');let exe='',cwd='';
 try{exe=fs.readlinkSync(base+'/exe');cwd=fs.readlinkSync(base+'/cwd');}catch(error){if(!['ENOENT','ESRCH'].includes(error.code))throw error;}
 return {pid:entry.pin.pid,ppid:entry.pin.parentPid,startTicks:entry.pin.startTicks,exe,
  argvSha256:hash(fs.readFileSync(base+'/cmdline')),cwdSha256:hash(cwd),pidNamespace:fs.readlinkSync(base+'/ns/pid')};
};
function commandWatch(runtime,entry){
 return new ModernSchemaExecutorWatch({context:{runtimeSnapshotSha256:canonicalDigest({})},
  preparation:{originalSnapshot:{containers:{}},ownedResources:[]},state:{read:()=>({phase:'DDL_STARTED',status:'RUNNING'})},privateRuntime:runtime,admit:()=>true},
  {captureProcesses:()=>entry.child.exitCode===null&&entry.child.signalCode===null?[nativeRow(entry)]:[],processIdentity:()=>nativeRow(entry)});
}
const finishFileCommand=(f,onSpawn,{exitCode=0}={})=>{
 const finished=path.join(f.work,'finish');
 return f.runtime.run({binary:'/bin/bash',args:['--noprofile','--norc','-c',
  'while [ ! -f "$1" ]; do read -r -t 0.01 ignored || :; done; exit "$2"','--',finished,String(exitCode)],
  directory:f.work,stem:'terminal-census',timeoutMs:5000,onSpawn:entry=>onSpawn(entry,()=>fs.writeFileSync(finished,''))});
};
test('real kernel zombie before the exit event is retired only by the bounded-command census',async()=>{
 const f=fixture();
 await finishFileCommand(f,(entry,finish)=>{
  finish();const deadline=performance.now()+2000;let state;
  do{
   const raw=fs.readFileSync('/proc/'+entry.pin.pid+'/stat','utf8');state=raw.slice(raw.lastIndexOf(')')+2).split(' ')[0];
   if(['Z','X','x'].includes(state))break;
   Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);
  }while(performance.now()<deadline);
  assert.ok(['Z','X','x'].includes(state));assert.equal(entry.child.exitCode,null);assert.equal(entry.child.signalCode,null);
  assert.equal(fs.readFileSync('/proc/'+entry.pin.pid+'/cmdline').length,0);
  assert.throws(()=>verifyModernSchemaChild(entry,nativeRow(entry)),/ORIGINAL_CONTROL_CHILD_UNPROVED/);
  assert.equal(isOriginalModernSchemaChildTerminal(entry),true);
  const watch=commandWatch(f.runtime,entry);assert.doesNotThrow(()=>watch.verifyProcesses([]));
  for(const [key,value]of [['parentPid',entry.pin.parentPid+1],['startTicks',entry.pin.startTicks+'0'],['bootId','different-boot'],['pidNamespace','different-namespace']]){
   assert.equal(isOriginalModernSchemaChildTerminal({...entry,pin:{...entry.pin,[key]:value}}),false);
  }
  for(const protect of [()=>watch.readers.push({entry}),()=>{watch.session={child:entry.child};},()=>watch.descendants.push(entry)]){
   protect();assert.throws(()=>watch.verifyProcesses([]),/ORIGINAL_CONTROL_CHILD_UNPROVED/);
   watch.readers=[];watch.session=null;watch.descendants=[];
  }
  const copied={...entry};assert.equal(f.runtime.isCommand(copied),false);
  const unregistered=commandWatch({registeredChildren:()=>[copied],isCommand:value=>f.runtime.isCommand(value)},copied);
  assert.throws(()=>unregistered.verifyProcesses([]),/ORIGINAL_CONTROL_CHILD_UNPROVED/);
 });
 assert.equal(f.runtime.registeredChildren().length,0);
});
const waitKernelTerminal=entry=>{
 const deadline=performance.now()+2000;let fields;
 do{
  const raw=fs.readFileSync('/proc/'+entry.pin.pid+'/stat','utf8');fields=raw.slice(raw.lastIndexOf(')')+2).trim().split(/\s+/);
  if(['Z','X','x'].includes(fields[0]))break;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);
 }while(performance.now()<deadline);
 assert.ok(['Z','X','x'].includes(fields[0]));assert.equal(Number(fields[17]),1);assert.equal(entry.child.exitCode,null);
};
async function startReapFixture(options){
 const f=fixture();let release;const ready=new Promise(resolve=>{release=resolve;});
 const execution=finishFileCommand(f,(entry,finish)=>{
  const watch=commandWatch(f.runtime,entry);let inSlot=false,queue=Promise.resolve();
  watch.session={withSynchronousObservation(work){const operation=queue.then(()=>{inSlot=true;try{return work();}finally{inSlot=false;}});queue=operation.catch(()=>{});return operation;}};
  watch.allowDescendants(entry,'SCHEMA_DRIVER');release({entry,finish,watch,inSlot:()=>inSlot});
 },options);execution.catch(()=>{});
 const result=await ready;await new Promise(resolve=>setImmediate(resolve));return {...f,...result,execution};
}
test('expected Bash retirement waits for its real exit outside the S slot and then rescans from the beginning',async()=>{
 const f=await startReapFixture();f.finish();waitKernelTerminal(f.entry);let scans=0,checked=false;
 f.watch.admit=()=>{checked=true;return true;};
 f.entry.child.once('exit',()=>assert.equal(f.inSlot(),false));
 const observation=f.watch.observeHostAfterOriginalExit(()=>{scans++;f.watch.verifyProcesses([]);return 'FULL_FRESH_HOST_OBSERVATION';});
 const responsive=f.watch.session.withSynchronousObservation(()=>{assert.equal(f.entry.child.exitCode,null);return 'S_QUEUE_STILL_USABLE';});
 const [run,observed,reply]=await Promise.all([f.execution,observation,responsive]);
 assert.equal(run.exitCode,0);assert.equal(observed,'FULL_FRESH_HOST_OBSERVATION');assert.equal(reply,'S_QUEUE_STILL_USABLE');assert.equal(scans,2);assert.equal(checked,true);
});
for(const mode of ['NONZERO','SIGNAL'])test('expected retirement cannot accept a real '+mode+' exit',async()=>{
 const f=await startReapFixture({exitCode:mode==='NONZERO'?7:0});
 if(mode==='SIGNAL')f.entry.child.kill('SIGTERM');else f.finish();waitKernelTerminal(f.entry);
 const outcomes=await Promise.allSettled([f.execution,f.watch.observeHostAfterOriginalExit(()=>f.watch.verifyProcesses([]))]);
 assert.match(outcomes[0].reason.message,/CHILD_RESULT_UNVERIFIED/);assert.match(outcomes[1].reason.message,/ORIGINAL_CHILD_EXIT_FAILED/);
});
test('a missing original exit notification remains bounded HOLD even if the kernel task is terminal',async()=>{
 const f=await startReapFixture();f.finish();waitKernelTerminal(f.entry);
 const originalOnce=f.entry.child.once;
 f.entry.child.once=function(event,listener){return event==='exit'?this:originalOnce.call(this,event,listener);};
 try{
  const outcomes=await Promise.allSettled([f.execution,f.watch.observeHostAfterOriginalExit(()=>f.watch.verifyProcesses([]))]);
  assert.equal(outcomes[0].status,'fulfilled');assert.match(outcomes[1].reason.message,/ORIGINAL_CHILD_EXIT_UNRESOLVED/);
 }finally{f.entry.child.once=originalOnce;}
});
test('registered Bash terminal state outside its exact phase has no retirement path',async()=>{
 const f=await startReapFixture();f.watch.state.read=()=>({phase:'API_VERIFIED',status:'RUNNING'});f.finish();waitKernelTerminal(f.entry);
 const outcomes=await Promise.allSettled([f.execution,f.watch.observeHostAfterOriginalExit(()=>f.watch.verifyProcesses([]))]);
 assert.equal(outcomes[0].status,'fulfilled');assert.match(outcomes[1].reason.message,/ORIGINAL_CONTROL_CHILD_UNPROVED/);
});
test('an unknown live executor in the same captured census cannot be discarded while waiting for an owned exit',async()=>{
 const f=await startReapFixture(),unknown=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{cwd:root,stdio:'ignore'});
 const native=pinModernSchemaChild(unknown);f.finish();waitKernelTerminal(f.entry);
 f.watch.captureProcesses=()=>[nativeRow(f.entry),nativeRow(native)];
 try{
  const outcomes=await Promise.allSettled([f.execution,f.watch.observeHostAfterOriginalExit(()=>f.watch.verifyProcesses([]))]);
  assert.equal(outcomes[0].status,'fulfilled');assert.match(outcomes[1].reason.message,/NEW_OR_CHANGED_HOST_EXECUTOR/);
 }finally{const exited=new Promise(resolve=>unknown.once('exit',resolve));unknown.kill('SIGTERM');await exited;}
});
test('an active original command never gets the terminal exception for changed identity',async()=>{
 const f=fixture();
 await finishFileCommand(f,(entry,finish)=>{
  try{
   assert.equal(isOriginalModernSchemaChildTerminal(entry),false);
   const watch=commandWatch(f.runtime,entry),row=nativeRow(entry);
   assert.doesNotThrow(()=>verifyModernSchemaChild(entry,row));
   for(const field of ['exe','argvSha256','cwdSha256','startTicks','ppid','pidNamespace']){
    watch.captureProcesses=()=>[{...row,[field]:field==='ppid'?row.ppid+1:'changed'}];
    assert.throws(()=>watch.verifyProcesses([]),/ORIGINAL_CONTROL_CHILD_UNPROVED/);
   }
  }finally{finish();}
 });
});
test('a zombie thread-group leader with a living native worker is never a terminal command',async()=>{
 const f=fixture(),source=path.join(f.work,'thread-leader.c'),binary=path.join(f.work,'thread-leader');
 const leaderExit=path.join(f.work,'leader-exit'),workerExit=path.join(f.work,'worker-exit');
 fs.writeFileSync(source,`#include <pthread.h>
#include <unistd.h>
static const char *worker_exit;
static void *worker(void *unused) { while(access(worker_exit,F_OK)!=0) usleep(1000); return 0; }
int main(int argc,char **argv) {
 if(argc!=3) return 2; worker_exit=argv[2]; pthread_t thread;
 if(pthread_create(&thread,0,worker,0)!=0) return 3;
 while(access(argv[1],F_OK)!=0) usleep(1000);
 pthread_exit(0);
}
`);
 const compiled=spawnSync('/usr/bin/cc',['-pthread',source,'-o',binary],{encoding:'utf8',timeout:10000});
 assert.equal(compiled.status,0,compiled.stderr);
 await f.runtime.run({binary,args:[leaderExit,workerExit],directory:f.work,stem:'threaded-terminal',timeoutMs:5000,onSpawn:entry=>{
  try{
   fs.writeFileSync(leaderExit,'');let fields;const deadline=performance.now()+2000;
   do{
    const raw=fs.readFileSync('/proc/'+entry.pin.pid+'/stat','utf8');fields=raw.slice(raw.lastIndexOf(')')+2).trim().split(/\s+/);
    if(fields[0]==='Z'&&Number(fields[17])>1)break;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);
   }while(performance.now()<deadline);
   assert.equal(fields[0],'Z');assert.ok(Number(fields[17])>1);assert.equal(entry.child.exitCode,null);
   assert.equal(isOriginalModernSchemaChildTerminal(entry),false);
   assert.throws(()=>commandWatch(f.runtime,entry).verifyProcesses([]),/ORIGINAL_CONTROL_CHILD_UNPROVED/);
  }finally{fs.writeFileSync(workerExit,'');}
 }});
});
