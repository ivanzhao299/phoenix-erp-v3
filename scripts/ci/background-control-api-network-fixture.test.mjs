import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import guard from './background-control-api-network-fixture.cjs';
const preload=new URL('./background-control-api-network-fixture.cjs',import.meta.url).pathname;
let undiciPath;try{undiciPath=createRequire(import.meta.url).resolve('undici');}catch{/* Explicitly reported NOT_RUN when this optional package is absent. */}
const row=(seq,event='READY',pid=55)=>JSON.stringify({protocolVersion:1,pid,seq,event})+'\n';
async function childProof(code,{append=true}={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ci-network-transport-'));const file=path.join(dir,'audit.jsonl');
  const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|(append?fs.constants.O_APPEND:0),0o600);
  const child=spawn(process.execPath,['--require',preload,'-e',`(async()=>{${code}})().then(()=>process.exit(0),()=>process.exit(79));`],{env:{PATH:process.env.PATH},stdio:['ignore','pipe','pipe',fd]});fs.closeSync(fd);
  let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
  const timer=setTimeout(()=>child.kill('SIGKILL'),10000);
  try{const [exitCode,signal]=await once(child,'exit');return {exitCode,signal,stdout,stderr,pid:child.pid,audit:fs.readFileSync(file,'utf8')};}
  finally{clearTimeout(timer);fs.unlinkSync(file);fs.rmdirSync(dir);}
}
async function listen(server,port,host='127.0.0.1'){server.listen(port,host);await once(server,'listening');}
async function close(server){server.closeAllConnections?.();await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
test('audit requires complete unique READY, exact PID and contiguous allowlisted events; denied attempts are HOLD',()=>{
  assert.equal(guard.readAudit(row(1)+row(2,'ALLOW_TCP'),55).denied,0);
  for(const text of ['',row(1).trimEnd(),row(1)+row(3,'ALLOW_TCP'),row(1)+row(2,'READY'),row(1)+row(2,'ALLOW_TCP',56),row(1)+row(2,'UNKNOWN'),JSON.stringify({protocolVersion:1,pid:55,seq:1,event:'READY',url:'redacted'})+'\n'])assert.throws(()=>guard.readAudit(text,55),/NETWORK_AUDIT_INCOMPLETE/);
  assert.throws(()=>guard.readAudit(row(1)+row(2,'DENY_TARGET'),55),/NETWORK_ATTEMPT_DENIED/);
});
test('real local API TCP, HTTP and native fetch remain usable under the fixed preload',async()=>{
  let connections=0,httpRequests=0;
  const api=http.createServer((_q,r)=>{httpRequests++;r.end('ok');});api.on('connection',()=>connections++);await listen(api,3100);
  try{
    const r=await childProof(`const net=require('node:net');await new Promise((resolve,reject)=>{const s=net.connect({host:'127.0.0.1',port:3100});s.on('connect',()=>s.end());s.on('close',resolve);s.on('error',reject);s.resume();});const http=require('node:http');await new Promise((resolve,reject)=>http.get('http://127.0.0.1:3100/',r=>{r.resume();r.on('end',resolve);}).on('error',reject));const r=await fetch('http://127.0.0.1:3100/');if(await r.text()!=='ok')throw Error();`);
    assert.equal(r.exitCode,0,r.audit);assert.equal(r.stderr,'');assert.equal(r.stdout,'');assert.ok(connections>=3);assert.equal(httpRequests,2);
    assert.equal(guard.readAudit(r.audit,r.pid).denied,0);assert.match(r.audit,/ALLOW_TCP/);assert.match(r.audit,/ALLOW_HTTP/);assert.match(r.audit,/ALLOW_FETCH/);
  }finally{await close(api);}
});
test('remote, unknown host/port, Unix socket, TLS, DNS and custom routing are refused before any external connection',async()=>{
  const r=await childProof(`const net=require('node:net'),tls=require('node:tls'),http=require('node:http'),https=require('node:https'),dns=require('node:dns');const cases=[()=>net.connect({host:'192.0.2.1',port:5432}),()=>net.connect({host:'localhost',port:5432}),()=>net.connect({host:'127.0.0.1',port:9999}),()=>net.connect('/tmp/ci-network-never-connect.sock'),()=>net.connect({path:'/tmp/ci-network-never-connect.sock'}),()=>tls.connect({host:'127.0.0.1',port:3100}),()=>https.get('https://127.0.0.1:3100/'),()=>http.get('http://192.0.2.1:3100/'),()=>http.get({hostname:'127.0.0.1',port:5432}),()=>dns.lookup('example.invalid',()=>{}),()=>new dns.Resolver().resolve4('example.invalid',()=>{}),()=>net.connect({host:'127.0.0.1',port:5432,lookup:()=>{throw Error('custom');}})];for(const f of cases){let denied=false;try{f();}catch(e){denied=/^CI_NETWORK_HOLD=DENY_/.test(e.message);}if(!denied)throw Error();}for(const u of ['http://192.0.2.1:3100/','http://127.0.0.1:5432/','https://127.0.0.1:3100/']){let denied=false;try{await fetch(u);}catch(e){denied=/^CI_NETWORK_HOLD=DENY_/.test(e.message);}if(!denied)throw Error();}`);
  assert.equal(r.exitCode,0);assert.equal(r.stderr,'');assert.equal(r.stdout,'');
  assert.throws(()=>guard.readAudit(r.audit,r.pid),/NETWORK_ATTEMPT_DENIED/);
  for(const e of ['DENY_TARGET','DENY_UNIX','DENY_TLS','DENY_DNS','DENY_CUSTOM'])assert.ok(r.audit.includes(e));
  assert.doesNotMatch(r.audit,/192\.0\.2|example|127\.0|localhost|sock|headers|body/i);
});
test('a real local HTTP redirect toward a remote endpoint is recorded and never followed',async()=>{
  let requests=0;
  const api=http.createServer((_q,r)=>{requests++;r.writeHead(302,{Location:'http://192.0.2.1:3100/'});r.end();});await listen(api,3100);
  try{
    const r=await childProof(`let denied=false;try{await fetch('http://127.0.0.1:3100/');}catch(e){denied=e.message==='CI_NETWORK_HOLD=DENY_REDIRECT';}if(!denied)throw Error();`);
    assert.equal(r.exitCode,0);assert.equal(r.stderr,'');assert.equal(requests,1);assert.match(r.audit,/DENY_REDIRECT/);assert.throws(()=>guard.readAudit(r.audit,r.pid),/NETWORK_ATTEMPT_DENIED/);
  }finally{await close(api);}
});
test('an absent or non-append audit descriptor fails before transport installation',async()=>{
  const child=spawn(process.execPath,['--require',preload,'-e','process.exit(0)'],{env:{PATH:process.env.PATH},stdio:['ignore','ignore','ignore']});
  const [code]=await once(child,'exit');assert.notEqual(code,0);
  const r=await childProof('throw Error("must not run")',{append:false});assert.notEqual(r.exitCode,0);assert.equal(r.audit,'');
});
test('ES module named transports receive the same restrictions after preload',async()=>{
  const r=await childProof(`const net=await import('node:net'),http=await import('node:http'),dns=await import('node:dns');for(const f of [()=>net.connect({host:'192.0.2.1',port:3100}),()=>http.get('http://127.0.0.1:5432/'),()=>dns.lookup('example.invalid',()=>{})]){let denied=false;try{f();}catch(e){denied=/^CI_NETWORK_HOLD=DENY_/.test(e.message);}if(!denied)throw Error();}`);
  assert.equal(r.exitCode,0);assert.equal(r.stderr,'');assert.throws(()=>guard.readAudit(r.audit,r.pid),/NETWORK_ATTEMPT_DENIED/);
});
test('an owned real Unix listener receives zero connections from a refused Unix attempt',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ci-network-unix-'));const socket=path.join(dir,'owned.sock');let connections=0;
  const server=net.createServer(s=>{connections++;s.destroy();});server.listen(socket);await once(server,'listening');
  try{
    const r=await childProof(`let denied=false;try{require('node:net').connect(${JSON.stringify(socket)});}catch(e){denied=e.message==='CI_NETWORK_HOLD=DENY_UNIX';}if(!denied)throw Error();`);
    assert.equal(r.exitCode,0);assert.equal(connections,0);assert.match(r.audit,/DENY_UNIX/);assert.throws(()=>guard.readAudit(r.audit,r.pid),/NETWORK_ATTEMPT_DENIED/);
  }finally{await close(server);if(fs.existsSync(socket))fs.unlinkSync(socket);fs.rmdirSync(dir);}
});
test('the approved literal IPv6 loopback API address supports real native fetch',async()=>{
  const server=http.createServer((_q,r)=>r.end('ok'));await listen(server,3100,'::1');
  try{
    const r=await childProof(`const r=await fetch('http://[::1]:3100/');if(await r.text()!=='ok')throw Error();`);
    assert.equal(r.exitCode,0,r.audit);assert.equal(guard.readAudit(r.audit,r.pid).denied,0);
  }finally{await close(server);}
});
test('UDP and every child process entry point are default-denied inside the API child',async()=>{
  const r=await childProof(`const dgram=require('node:dgram'),child=require('node:child_process');for(const f of [()=>dgram.createSocket('udp4'),...['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'].map(k=>()=>child[k]('ci-never-execute')),()=>new child.ChildProcess().spawn({})]){let denied=false;try{f();}catch(e){denied=/^CI_NETWORK_HOLD=DENY_(UDP|CHILD_PROCESS)$/.test(e.message);}if(!denied)throw Error();}`);
  assert.equal(r.exitCode,0);assert.equal(r.stderr,'');assert.match(r.audit,/DENY_UDP/);assert.match(r.audit,/DENY_CHILD_PROCESS/);assert.throws(()=>guard.readAudit(r.audit,r.pid),/NETWORK_ATTEMPT_DENIED/);
});
test('the real wildcard API bind is constrained to literal loopback and unknown listeners fail',async()=>{
  const r=await childProof(`const net=require('node:net');const s=net.createServer();await new Promise((resolve,reject)=>{s.once('error',reject);s.listen(3100,'0.0.0.0',resolve);});if(s.address().address!=='127.0.0.1')throw Error();await new Promise(resolve=>s.close(resolve));for(const args of [[3101,'127.0.0.1'],[3100,'192.0.2.1'],[{path:'/tmp/ci-network-never-listen.sock'}],[{fd:99,port:3100}]]){let denied=false;try{net.createServer().listen(...args);}catch(e){denied=e.message==='CI_NETWORK_HOLD=DENY_LISTEN';}if(!denied)throw Error();}`);
  assert.equal(r.exitCode,0,r.audit);assert.match(r.audit,/ALLOW_LISTEN/);assert.match(r.audit,/DENY_LISTEN/);assert.throws(()=>guard.readAudit(r.audit,r.pid),/NETWORK_ATTEMPT_DENIED/);
});
test('direct undici remote requests and automatic redirects are blocked',{skip:undiciPath?false:'NOT_RUN: optional standalone undici package is unavailable'},async()=>{
  const remote=await childProof(`const u=require(${JSON.stringify(undiciPath)});await u.request('http://192.0.2.1:3100/');`);
  assert.notEqual(remote.exitCode,0);assert.throws(()=>guard.readAudit(remote.audit,remote.pid),/NETWORK_ATTEMPT_DENIED/);
  let requests=0;const server=http.createServer((_q,r)=>{requests++;r.writeHead(302,{Location:'http://192.0.2.1:3100/'});r.end();});await listen(server,3100);
  try{
    const redirect=await childProof(`const u=require(${JSON.stringify(undiciPath)});await u.request('http://127.0.0.1:3100/',{maxRedirections:3});`);
    assert.notEqual(redirect.exitCode,0);assert.equal(requests,1);assert.throws(()=>guard.readAudit(redirect.audit,redirect.pid),/NETWORK_ATTEMPT_DENIED/);
  }finally{await close(server);}
});
