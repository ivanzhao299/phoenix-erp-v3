/** Native SO_PEERCRED bridge to the one original body. No public socket API,
 * bearer token, authority environment, or caller-selected executable body. */
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {createInterface} from 'node:readline';
import {executionEnv} from './capture-production-runtime.mjs';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {pinModernSchemaChild,verifyModernSchemaChild} from './production-modern-schema-processes.mjs';
import {readLinuxProcessIdentity,assertOriginalModernSchemaProcess} from './production-modern-schema-session-lease.mjs';
import {observeMaintenanceProcessIdentity} from './production-maintenance-root-readers.mjs';
const fail=code=>{throw Error('MODERN_SCHEMA_BODY_CHANNEL_HOLD='+code);};
export class ModernSchemaBodyChannel {
 constructor({owner,privateRuntime,directory,onRequest},dependencies={}){
  if(!/^[1-9][0-9]*-[1-9][0-9]*$/.test(owner??'')||typeof onRequest!=='function')fail('EXACT_PRIVATE_CHANNEL_REQUIRED');
  this.owner=owner;this.runtime=privateRuntime;this.directory=directory;this.onRequest=onRequest;
  this.script=dependencies.script??new URL('./production-modern-schema-body-ipc.py',import.meta.url).pathname;
  this.socketName='m-'+canonicalDigest({owner,directory}).slice(0,20)+'.sock';this.socketFile=path.join(this.runtime.directory,this.socketName);this.socket=null;
  this.inspectProcess=dependencies.processIdentity??observeMaintenanceProcessIdentity;this.uid=dependencies.expectedUid??0;this.inheritFd9=dependencies.inheritFd9??true;
  this.profile=dependencies.operationProfile??'FORMAL_API';if(!['FORMAL_API','CONTROLLED_MIGRATION'].includes(this.profile))fail('FIXED_OPERATION_PROFILE_REQUIRED');
  this.originalBody=null;this.entry=null;this.activePeer=null;this.failed=null;this.sequence=0;this.closing=false;
 }
 async start(originalBody){
  this.runtime.guard();this.originalBody=originalBody;
  if(!originalBody?.pin||!path.isAbsolute(this.script)||fs.lstatSync(this.script).isSymbolicLink())fail('ORIGINAL_BODY_AND_FIXED_SCRIPT_REQUIRED');
  const err=this.runtime.openOutput(path.join(this.directory,'body-channel.stderr'));
  const socketDirectory=fs.openSync(this.runtime.directory,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW),stdio=['pipe','pipe',err];
  while(stdio.length<10)stdio.push(stdio.length===9&&this.inheritFd9?9:'ignore');stdio.push(socketDirectory);
  let child;
  try{child=spawn('/usr/bin/python3',['-I','-S',this.script,'serve','/proc/self/fd/10/'+this.socketName,String(process.pid),String(this.uid)],{cwd:this.runtime.root,env:executionEnv(),stdio});}
  finally{fs.closeSync(err);fs.closeSync(socketDirectory);}
  this.socket=`/proc/${child.pid}/fd/10/${this.socketName}`;
  child.stdin.on('error',()=>{});const entry={...pinModernSchemaChild(child),outcome:'ACTIVE'};this.entry=entry;this.runtime.children.add(entry);
  const ready=new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('MODERN_SCHEMA_BODY_CHANNEL_HOLD=START_DEADLINE')),5000);
   child.once('error',()=>{clearTimeout(timer);reject(Error('MODERN_SCHEMA_BODY_CHANNEL_HOLD=START_FAILED'));});
   child.once('exit',()=>{clearTimeout(timer);entry.outcome='EXITED';if(!this.closing)this.failed??=Error('MODERN_SCHEMA_BODY_CHANNEL_HOLD=CHANNEL_EXITED');reject(this.failed??Error('MODERN_SCHEMA_BODY_CHANNEL_HOLD=CHANNEL_CLOSED'));});
   const lines=createInterface({input:child.stdout});let bytes=0,waiting=true;
   child.stdout.on('data',data=>{bytes+=data.length;if(bytes>16384){this.failed??=Error('MODERN_SCHEMA_BODY_CHANNEL_HOLD=FRAME_LIMIT');child.stdin.end();}});
   lines.on('line',line=>{
    let frame;try{frame=JSON.parse(line);}catch{this.failed??=Error('MODERN_SCHEMA_BODY_CHANNEL_HOLD=INVALID_FRAME');child.stdin.end();return;}
    if(waiting){waiting=false;clearTimeout(timer);if(!same(frame,{kind:'READY',pid:child.pid})){reject(Error('MODERN_SCHEMA_BODY_CHANNEL_HOLD=SERVER_IDENTITY'));return;}
     try{const stat=fs.lstatSync(this.socketFile);if(!stat.isSocket()||stat.uid!==this.uid||(stat.mode&0o777)!==0o600)fail('PRIVATE_KERNEL_SOCKET_REQUIRED');this.socketPin={dev:stat.dev,ino:stat.ino};resolve();}catch(error){reject(error);}return;}
    bytes=0;this.handle(frame).catch(error=>{this.failed??=error;try{child.stdin.write(JSON.stringify({sequence:frame.sequence,ok:false})+'\n');}catch{}});
   });
  });await ready;this.runtime.guard();return this;
 }
 verifyPeer(peer){
  if(!Number.isSafeInteger(peer?.pid)||peer.uid!==this.uid)fail('NATIVE_ROOT_PEER_REQUIRED');
  const identity=readLinuxProcessIdentity(peer.pid),{pid,parentPid,startTicks,bootId}=this.originalBody.pin;
  assertOriginalModernSchemaProcess({pid,parentPid,startTicks,bootId},{pid:peer.pid});
  const argv=fs.readFileSync(`/proc/${peer.pid}/cmdline`).toString().split('\0');
  if(argv[0]!=='/usr/bin/python3'||argv[1]!=='-I'||argv[2]!=='-S'||argv[3]!==this.script||argv[4]!== (this.profile==='CONTROLLED_MIGRATION'?'request-docker':'request')||argv[5]!==this.socket||argv[6]!==String(this.entry.child.pid))fail('FIXED_ORIGINAL_BODY_CLIENT_REQUIRED');
  return identity;
 }
 assertActivePeer(){
  if(this.failed||!this.activePeer||!this.entry||!this.originalBody)fail('ACTIVE_ORIGINAL_REQUEST_REQUIRED');
  this.runtime.guard();verifyModernSchemaChild(this.entry,this.inspectProcess(this.entry.pin.pid));verifyModernSchemaChild(this.originalBody,this.inspectProcess(this.originalBody.pin.pid));
  if(!same(this.activePeer.identity,this.verifyPeer(this.activePeer.peer)))fail('ORIGINAL_REQUEST_PEER_CHANGED');
  const stat=fs.lstatSync(this.socketFile);if(stat.dev!==this.socketPin.dev||stat.ino!==this.socketPin.ino||!stat.isSocket()||stat.uid!==this.uid||(stat.mode&0o777)!==0o600)fail('SOCKET_CHANGED');return true;
 }
 async handle(frame){
  if(this.failed||this.activePeer||frame?.kind!=='REQUEST'||frame.sequence!==this.sequence+1||!frame.request||!same(Object.keys(frame.request).sort(),['args','operation'])
   ||!(this.profile==='CONTROLLED_MIGRATION'?['docker']:['state','promote','compose','readiness']).includes(frame.request.operation)||!Array.isArray(frame.request.args)||frame.request.args.length>(this.profile==='CONTROLLED_MIGRATION'?64:8)
   ||!frame.request.args.every(arg=>typeof arg==='string'&&arg.length<=(this.profile==='CONTROLLED_MIGRATION'?2048:512)&&!arg.includes('\0')))fail('SINGLE_FIXED_REQUEST_REQUIRED');
  this.sequence=frame.sequence;this.activePeer={peer:frame.peer,identity:this.verifyPeer(frame.peer)};
  try{this.assertActivePeer();const result=await this.onRequest(frame.request);this.assertActivePeer();
   if(result!==undefined&&(this.profile!=='CONTROLLED_MIGRATION'||!same(Object.keys(result),['stdoutFile'])||typeof result.stdoutFile!=='string'||!path.isAbsolute(result.stdoutFile)))fail('FIXED_PRIVATE_RESULT_REQUIRED');
   this.entry.child.stdin.write(JSON.stringify({sequence:frame.sequence,ok:true,...result})+'\n');}
  finally{this.activePeer=null;}
 }
 async close(){
  this.closing=true;const child=this.entry?.child;if(!child)return;child.stdin.end();if(child.exitCode===null&&child.signalCode===null)await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('MODERN_SCHEMA_BODY_CHANNEL_HOLD=CLOSE_UNRESOLVED')),3000);child.once('exit',()=>{clearTimeout(timer);resolve();});
  });
  this.runtime.guard();const stat=fs.lstatSync(this.socketFile);if(stat.dev!==this.socketPin?.dev||stat.ino!==this.socketPin?.ino||!stat.isSocket()||stat.uid!==this.uid)fail('SOCKET_CHANGED');
  fs.unlinkSync(this.socketFile);this.runtime.syncDirectory(this.runtime.directory);if(this.failed)throw this.failed;
 }
}
