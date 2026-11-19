import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {ModernSchemaPrivateRuntime} from './production-modern-schema-private.mjs';import {ModernSchemaBodyChannel} from './production-modern-schema-body-channel.mjs';
import {readLinuxProcessIdentity} from './production-modern-schema-session-lease.mjs';
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
