import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter,once} from 'node:events';import http from 'node:http';import {spawn} from 'node:child_process';import {performance} from 'node:perf_hooks';
import {kernelRemaining,kernelCommandTimeout,boundedOwnedHttpProbe,ownedHttpProbeProgram} from './maintenance-kernel-ingress-probes.mjs';
test('fractional final millisecond cannot turn into timeout zero or launch a command',()=>{
 let time=0,calls=0;const remaining=kernelRemaining(10,()=>time);time=9.5;
 assert.throws(()=>{kernelCommandTimeout(remaining());calls++;},/DEADLINE/);assert.equal(calls,0);
 for(const n of [0,-1,NaN,0.5,Infinity])assert.throws(()=>kernelCommandTimeout(n));
 for(const n of [0,-1,35001,Infinity])assert.throws(()=>kernelCommandTimeout(100,n));
 assert.equal(kernelCommandTimeout(5,35000),5);
});
test('clock rollback and late acceptance are rejected',()=>{let n=10;const r=kernelRemaining(100,()=>n);n=9;assert.throws(r);});
for(const mode of ['no-connect','slow-response','destroy-no-close'])test(`absolute probe deadline and actual close: ${mode}`,async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const ledger=[],request=new EventEmitter();let destroyed=0;
 request.destroy=()=>{destroyed++;if(mode!=='destroy-no-close')request.emit('close');};
 const response=Object.assign(new EventEmitter(),{statusCode:200,resume(){}});
 const work=boundedOwnedHttpProbe('http://127.0.0.1:3100/',{remaining:()=>5000,ledger,requestFactory:(_url,_opts,receive)=>{if(mode==='slow-response')queueMicrotask(()=>receive(response));return request;}});
 await Promise.resolve();const outcome=work.then(value=>({value}),error=>({error}));
 for(let i=0;i<6;i++){t.mock.timers.tick(100);if(mode==='slow-response')response.emit('data','x');}
 assert.equal(destroyed,0);t.mock.timers.tick(100);assert.equal(destroyed,1);
 if(mode==='destroy-no-close'){assert.equal(ledger[0].pending,true);t.mock.timers.tick(500);assert.match((await outcome).error.message,/UNCLOSED/);assert.equal(ledger[0].pending,true);request.emit('close');assert.equal(ledger[0].pending,false);}
 else if(mode==='slow-response'){assert.match((await outcome).error.message,/CLOSE_DEADLINE/);assert.equal(ledger[0].closeObserved,true);}
 else{assert.deepEqual((await outcome).value,{kind:'ERROR',code:'FIXTURE_TIMEOUT'});assert.equal(ledger[0].closeObserved,true);}
});
test('ordinary response is not accepted until original request closes',async()=>{
 const request=Object.assign(new EventEmitter(),{destroy(){}}),response=Object.assign(new EventEmitter(),{statusCode:200,resume(){}});const ledger=[];let receive,settled=false;
 const work=boundedOwnedHttpProbe('http://127.0.0.1:3100/',{remaining:()=>5000,ledger,requestFactory:(_u,_o,cb)=>{receive=cb;return request;}}).then(v=>{settled=true;return v;});
 receive(response);response.emit('end');await Promise.resolve();assert.equal(settled,false);request.emit('close');assert.deepEqual(await work,{kind:'HTTP',status:200});assert.equal(ledger[0].pending,false);
});
test('insufficient start budget launches no request',async()=>{let count=0;await assert.rejects(boundedOwnedHttpProbe('x',{remaining:()=>1199,requestFactory:()=>{count++;}}),/BUDGET/);assert.equal(count,0);});

test('an early HTTP response cannot become a successful timeout when close is delayed',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const request=Object.assign(new EventEmitter(),{destroy(){this.emit('close');}}),response=Object.assign(new EventEmitter(),{statusCode:200,resume(){}});let receive;
 const work=boundedOwnedHttpProbe('x',{remaining:()=>5000,requestFactory:(_u,_o,cb)=>{receive=cb;return request;}});const outcome=work.catch(error=>error);
 receive(response);response.emit('end');t.mock.timers.tick(700);assert.match((await outcome).message,/CLOSE_DEADLINE/);
});
test('synchronously delayed request closure cannot beat the absolute timer callback',async()=>{
 let now=0,receive;const request=Object.assign(new EventEmitter(),{destroy(){}}),response=Object.assign(new EventEmitter(),{statusCode:200,resume(){}});
 const work=boundedOwnedHttpProbe('x',{remaining:()=>5000,monotonicNow:()=>now,requestFactory:(_u,_o,cb)=>{receive=cb;return request;}});const outcome=work.catch(error=>error);receive(response);response.emit('end');now=701;request.emit('close');assert.match((await outcome).message,/CLOSE_DEADLINE/);
});

test('correct marker response headers without end are network admission, never kernel deny',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const marker='a'.repeat(32)+'-candidate';let receive;const request=Object.assign(new EventEmitter(),{destroy(){this.emit('close');}}),response=Object.assign(new EventEmitter(),{statusCode:200,headers:{'x-phoenix-fixture':marker},resume(){}});
 const work=boundedOwnedHttpProbe('x',{remaining:()=>5000,expectedMarker:marker,requestFactory:(_u,_o,cb)=>{receive=cb;return request;}});const outcome=work.catch(error=>error);receive(response);t.mock.timers.tick(700);assert.match((await outcome).message,/CLOSE_DEADLINE/);
});

test('actual Node readonly client with correct headers and endless body exits failure and closes original stdio', {timeout:5000}, async()=>{
 const boundedJoin=async(work,ms,debt)=>{let timer;try{return await Promise.race([work,new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error(`TEST_RESOURCE_JOIN_TIMEOUT:${debt()}`)),ms);})]);}finally{clearTimeout(timer);}};
 const marker='b'.repeat(32)+'-candidate',sockets=new Set();const server=http.createServer((_request,response)=>{
  response.writeHead(200,{'x-phoenix-fixture':marker});response.flushHeaders();const timer=setInterval(()=>response.write('x'),30);response.once('close',()=>clearInterval(timer));
 });server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
 let child,closed,stdioClosed=false,primary;const cleanupErrors=[];
 try{
  await boundedJoin(new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);}),500,()=>`server-listen;sockets=${sockets.size}`);
  const started=performance.now();child=spawn(process.execPath,['-e',ownedHttpProbeProgram,`http://127.0.0.1:${server.address().port}/`,marker],{stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH}});
  closed=once(child,'close');closed.catch(()=>{});child.once('close',()=>{stdioClosed=true;});let output='',errors='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>errors+=b);
  const [code,signal]=await boundedJoin(closed,2500,()=>`original-pid=${child.pid};stdioClosed=${stdioClosed}`);assert.equal(code,70);assert.equal(signal,null);assert.equal(output,'');assert.match(errors,/CLIENT_HOLD/);assert.match(errors,/FORCED_FAILURE_EXIT/);assert.ok(performance.now()-started<4000);
 }catch(error){primary=error;}finally{
  if(child&&!stdioClosed){
   // Only the saved child is eligible for a signal; exit alone is not stdio closure.
   if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
   try{await boundedJoin(closed,700,()=>`original-pid=${child.pid};stdioClosed=${stdioClosed}`);}catch(error){cleanupErrors.push(error);}
  }
  for(const socket of sockets)socket.destroy();
  try{await boundedJoin(new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())),500,()=>`owned-server;sockets=${sockets.size}`);}catch(error){cleanupErrors.push(error);}
 }
 if(primary||cleanupErrors.length)throw new AggregateError([...(primary?[primary]:[]),...cleanupErrors],'Owned HTTP test failure; cleanup debt retained in causes');
});
