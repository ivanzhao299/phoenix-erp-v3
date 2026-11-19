import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {ModernSchemaPrivateRuntime} from './production-modern-schema-private.mjs';
import {verifyModernSchemaChild} from './production-modern-schema-processes.mjs';
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
