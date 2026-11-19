/** Private, bounded child execution. Output is never streamed to Actions.
 * Original child handles remain registered on errors or timeout. */
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {createHash,randomBytes} from 'node:crypto';
import {CONTRACT,verifyContext} from './production-config-guard.mjs';import {executionEnv} from './capture-production-runtime.mjs';
import {inspectTrustedDirectory,assertRegularFile,assertSameDirectory} from './production-trusted-paths.mjs';
import {pinModernSchemaChild} from './production-modern-schema-processes.mjs';
const fail=code=>{throw Error('MODERN_SCHEMA_PRIVATE_HOLD='+code);};
export class ModernSchemaPrivateRuntime {
 constructor(dependencies={}){
  this.directory=dependencies.directory??CONTRACT.stateDirectory;this.guard=dependencies.guard??(()=>verifyContext(CONTRACT.repository,this.directory));
  this.root=dependencies.root??CONTRACT.repository;
  this.inspect=dependencies.inspectDirectory??(directory=>inspectTrustedDirectory(directory,CONTRACT));this.uid=dependencies.expectedUid??0;
  this.launch=dependencies.spawn??spawn;this.children=new Set();
 }
 syncDirectory(directory){const fd=fs.openSync(directory,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
 createDirectory(owner,role){
  if(!/^[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$/.test(owner??'')||!['preparation','prepare-backup','fenced-backup','prepare-rehearsal','fenced-rehearsal','migration','body'].includes(role))fail('EXACT_PRIVATE_SCOPE_REQUIRED');
  this.guard();const parent=this.inspect(this.directory),directory=path.join(this.directory,`schema-release-${role}-${owner}`);
  fs.mkdirSync(directory,{mode:0o700});this.syncDirectory(this.directory);this.inspect(directory);assertSameDirectory(parent,this.inspect(this.directory));this.guard();return directory;
 }
 openOutput(file){
  this.guard();this.inspect(path.dirname(file));const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
  try{assertRegularFile(fs.fstatSync(fd),{uid:this.uid});this.syncDirectory(path.dirname(file));}catch(error){fs.closeSync(fd);throw error;}return fd;
 }
 publishJson(file,value){
  const temporary=path.join(path.dirname(file),'.publish-'+randomBytes(16).toString('hex')),fd=this.openOutput(temporary);
  try{fs.writeFileSync(fd,JSON.stringify(value)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  // link is create-only. A crash before unlink leaves an inadmissible nlink=2
  // receipt rather than replacing a previously published result.
  this.guard();this.inspect(path.dirname(file));fs.linkSync(temporary,file);fs.unlinkSync(temporary);this.syncDirectory(path.dirname(file));
  const stat=fs.lstatSync(file);assertRegularFile(stat,{uid:this.uid});this.guard();return file;
 }
 registeredChildren(){return [...this.children].filter(entry=>entry.pin&&entry.child.exitCode===null&&entry.child.signalCode===null);}
 async run({binary,args,directory,stem,inputFile=null,deferInput=false,timeoutMs=300000,env=executionEnv(),inheritFd9=false,onSpawn=null}){
  if(!path.isAbsolute(binary)||!Array.isArray(args)||!args.every(arg=>typeof arg==='string'&&!arg.includes('\0'))||!/^[a-z][a-z0-9-]{0,50}$/.test(stem??'')||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>600000)fail('BOUNDED_COMMAND_REQUIRED');
  if(path.dirname(directory)!==this.directory||!/^schema-release-(?:preparation|prepare-backup|fenced-backup|prepare-rehearsal|fenced-rehearsal|migration|body)-[1-9][0-9]*-[1-9][0-9]*$/.test(path.basename(directory)))fail('OWNED_PRIVATE_DIRECTORY_REQUIRED');
  this.guard();this.inspect(directory);const out=path.join(directory,stem+'.stdout'),err=path.join(directory,stem+'.stderr');let stdout,stderr,stdin,child;
  try{
   stdout=this.openOutput(out);stderr=this.openOutput(err);
   if(inputFile){this.inspect(path.dirname(inputFile));const before=fs.lstatSync(inputFile);assertRegularFile(before,{uid:this.uid});stdin=fs.openSync(inputFile,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);const opened=fs.fstatSync(stdin);assertRegularFile(opened,{uid:this.uid});if(before.dev!==opened.dev||before.ino!==opened.ino||before.size!==opened.size)fail('INPUT_FILE_CHANGED');}
   if(deferInput&&(stdin===undefined||fs.fstatSync(stdin).size>1024*1024))fail('BOUNDED_DEFERRED_BODY_REQUIRED');
   const stdio=[deferInput?'pipe':stdin??'ignore',stdout,stderr];if(inheritFd9)while(stdio.length<=9)stdio.push(stdio.length===9?9:'ignore');
   child=this.launch(binary,args,{cwd:this.root,env,stdio,detached:inheritFd9});let inputFailed=false;
   // A supervised reader may close stdin between admission and delivery. EPIPE
   // must remain a controlled child failure, never an uncaught process error.
   child.stdin?.on('error',()=>{inputFailed=true;});
   const controller=new AbortController(),entry={child,pin:null,controller,outcome:'ACTIVE'};this.children.add(entry);
   let timer,deadline=false;
   const completion=new Promise((resolve,reject)=>{
    child.once('error',()=>{clearTimeout(timer);reject(Error('MODERN_SCHEMA_PRIVATE_HOLD=CHILD_START_FAILED'));});
    child.once('exit',(code,signal)=>{clearTimeout(timer);entry.outcome=deadline?'EXIT_AFTER_DEADLINE':'EXITED';resolve({code,signal});});
    timer=setTimeout(()=>{deadline=true;entry.outcome='DEADLINE_RESULT_UNRESOLVED';controller.abort();try{child.kill('SIGTERM');}catch{};reject(Error('MODERN_SCHEMA_PRIVATE_HOLD=CHILD_DEADLINE'));},timeoutMs);
   });
   completion.catch(()=>{});
   // Do not infer liveness from a stale PID if a very short observer already
   // exited. Only a confirmed vanished process may omit the live child pin.
   try{entry.pin=pinModernSchemaChild(child).pin;}catch{
    try{fs.lstatSync(`/proc/${child.pid}`);fail('CHILD_IDENTITY_UNPROVED');}catch(error){if(!['ENOENT','ESRCH'].includes(error.code))throw error;}
   }
   if(onSpawn){
    const admission=Promise.resolve().then(()=>onSpawn(entry,{signal:controller.signal}));admission.catch(()=>{});
    await Promise.race([admission,completion.then(()=>{throw Error('MODERN_SCHEMA_PRIVATE_HOLD=CHILD_EXIT_BEFORE_ADMISSION');})]);
   }
   if(deferInput){if(controller.signal.aborted)fail('CHILD_DEADLINE');child.stdin.end(fs.readFileSync(stdin));}
   const result=await completion;if(deadline||inputFailed||result.code!==0||result.signal)fail('CHILD_RESULT_UNVERIFIED');
   fs.fsyncSync(stdout);fs.fsyncSync(stderr);this.guard();return {stdout:out,stderr:err,exitCode:0,childPid:child.pid};
  }finally{if(deferInput)try{child?.stdin.end();}catch{};for(const fd of [stdin,stdout,stderr])if(fd!==undefined)fs.closeSync(fd);}
 }
 async digest(file){
  this.guard();const before=fs.lstatSync(file);assertRegularFile(before,{uid:this.uid});this.inspect(path.dirname(file));
  if(before.size<0||before.size>8*1024*1024*1024)fail('BOUNDED_PRIVATE_FILE_REQUIRED');const started=performance.now();
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let size=0;
  try{
   const opened=fs.fstatSync(fd);assertRegularFile(opened,{uid:this.uid});if(before.dev!==opened.dev||before.ino!==opened.ino||before.size!==opened.size||before.mtimeMs!==opened.mtimeMs||before.ctimeMs!==opened.ctimeMs)fail('PRIVATE_FILE_CHANGED');
   const sum=createHash('sha256'),buffer=Buffer.alloc(65536);let nextYield=16*1024*1024;
   for(;;){
    if(performance.now()-started>=120000)fail('PRIVATE_HASH_DEADLINE');
    const read=fs.readSync(fd,buffer,0,buffer.length,null);if(read===0)break;size+=read;if(size>before.size)fail('PRIVATE_FILE_GREW');sum.update(buffer.subarray(0,read));
    if(size>=nextYield){nextYield+=16*1024*1024;await new Promise(resolve=>setImmediate(resolve));this.guard();}
   }
   const after=fs.fstatSync(fd),named=fs.lstatSync(file);assertRegularFile(after,{uid:this.uid});assertRegularFile(named,{uid:this.uid});
   if(size!==before.size||[before,after,named].some(stat=>stat.dev!==opened.dev||stat.ino!==opened.ino||stat.size!==opened.size||stat.mtimeMs!==opened.mtimeMs||stat.ctimeMs!==opened.ctimeMs))fail('PRIVATE_FILE_CHANGED');
   this.guard();return {path:file,bytes:size,sha256:sum.digest('hex')};
  }finally{fs.closeSync(fd);}
 }
}
