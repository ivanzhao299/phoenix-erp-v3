import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { localTerminationDocker, terminationBudget, inspectOwnedTerminationRuntime, isolatedTerminationStream } from './production-maintenance-termination-fixture.mjs';

test('a remote ambient Docker context cannot select the fixture command endpoint',()=>{
  const remote={DOCKER_HOST:'tcp://example.invalid:2376',DOCKER_CONTEXT:'production',HTTPS_PROXY:'http://example.invalid',DOCKER_TLS_VERIFY:'1'};
  const saved=Object.fromEntries(Object.keys(remote).map(k=>[k,process.env[k]]));Object.assign(process.env,remote);
  try {
    let call;
    const run=localTerminationDocker({runFile:(file,args,options)=>{call={file,args,options};return 'owned\n';}});
    assert.equal(run(['inspect','1'.repeat(64)]),'owned');
    assert.equal(call.file,'/usr/bin/docker');assert.deepEqual(call.args.slice(0,2),['--host','unix:///var/run/docker.sock']);
    assert.deepEqual(Object.keys(call.options.env).sort(),['DOCKER_HOST','PATH']);assert.equal(call.options.env.DOCKER_HOST,'unix:///var/run/docker.sock');
  } finally { for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;} }
});
test('the one 35-second budget never resets, and rollback or non-finite clocks hold',()=>{
  let now=0;const remaining=terminationBudget(()=>now);assert.equal(remaining(),35000);now=34000;assert.equal(remaining(),1000);
  now=35000;assert.throws(remaining,/deadline/);now=36000;assert.throws(remaining,/deadline/);
  now=0;const backwards=terminationBudget(()=>now);now=10;backwards();now=9;assert.throws(backwards,/clock/);
  assert.throws(()=>terminationBudget(()=>NaN),/clock/);
});
test('inspect deadline exhaustion prohibits starting a second image inspection',()=>{
  let now=0,calls=0;const remaining=terminationBudget(()=>now),id='a'.repeat(64),imageId='sha256:'+'b'.repeat(64),owner='fixture-only';
  const run=(args,options)=>{calls++;assert.equal(args[0],'inspect');assert.equal(options.timeout,35000);now=35000;
    return [id,imageId,{StartedAt:'2026-10-18T00:00:00Z',Running:false,ExitCode:137,OOMKilled:false,Pid:0},0,
      {'phoenix.test.owner':owner,'phoenix.test.kind':'termination-observation'},'SIGTERM'].map(JSON.stringify).join('\t');};
  assert.throws(()=>inspectOwnedTerminationRuntime({id,imageId},{run,owner,remaining}),/deadline/);assert.equal(calls,1);
});
test('a changed image or owner cannot reach the next command',()=>{
  const id='a'.repeat(64),imageId='sha256:'+'b'.repeat(64);let calls=0;
  const run=()=>{calls++;return[id,imageId,{},0,{'phoenix.test.owner':'other','phoenix.test.kind':'termination-observation'},'SIGTERM'].map(JSON.stringify).join('\t');};
  assert.throws(()=>inspectOwnedTerminationRuntime({id,imageId},{run,owner:'expected'}));assert.equal(calls,1);
});

function streamFixture({onKill}={}) {
  const child=new EventEmitter();Object.assign(child,{pid:321,exitCode:null,signalCode:null,stdout:new PassThrough(),stderr:new PassThrough()});
  const signals=[],registrations=[],id='a'.repeat(64),start='2026-10-18T00:00:00.000Z';
  child.kill=signal=>{signals.push(signal);onKill?.(child);return true;};
  let spawnCall;
  const observer=isolatedTerminationStream({id,start,register:original=>registrations.push(original),spawnProcess:(...args)=>{spawnCall=args;return child;}});
  return {child,observer,signals,registrations,spawnCall,id,start};
}
const row=(f,Action,timeNano='1792281600000000001')=>JSON.stringify({Type:'container',Action,Actor:{ID:f.id,Attributes:{}},timeNano})+'\n';
const closed=child=>{child.stdout.end();child.stderr.end();child.emit('close',null,'SIGTERM');};
test('original event child is registered synchronously with fixed local endpoint, not declared ready',async()=>{
  const f=streamFixture({onKill:child=>queueMicrotask(()=>closed(child))});
  assert.equal(f.registrations[0],f.child);assert.deepEqual(f.spawnCall[1].slice(0,2),['--host','unix:///var/run/docker.sock']);
  f.observer.assertLocalProcessLive();assert.equal('ready' in f.observer,false);
  const result=await f.observer.close(()=>1000);assert.equal(result.stdioClosed,true);assert.equal(result.productionAuthority,false);assert.deepEqual(f.signals,['SIGTERM']);
});
test('fragmented rows retain exact nanoseconds; command suffixes are discarded before retention',async()=>{
  const f=streamFixture({onKill:child=>queueMicrotask(()=>closed(child))});
  const text=row(f,'exec_create: confidential command');f.child.stdout.write(text.slice(0,19));f.child.stdout.write(text.slice(19));
  assert.equal(f.observer.snapshot()[0].timeNano,'1792281600000000001');assert.equal(f.observer.snapshot()[0].Action,'exec_create');
  assert.equal(JSON.stringify(f.observer.snapshot()).includes('confidential'),false);await f.observer.close(()=>1000);
});
test('exit never substitutes for original stdout/stderr close',async()=>{
  const f=streamFixture({onKill:child=>child.emit('exit',null,'SIGTERM')});let settled=false;
  const promise=f.observer.close(()=>1000).then(r=>{settled=true;return r;});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false);closed(f.child);await promise;
});
test('a conflicting row flushed during close is present in the final sequence',async()=>{
  let f;f=streamFixture({onKill:child=>queueMicrotask(()=>{child.stdout.write(row(f,'kill','1792281600000000002'));closed(child);})});
  f.child.stdout.write(row(f,'kill'));const earlier=f.observer.snapshot();assert.equal(earlier.length,1);
  await f.observer.close(()=>1000);assert.equal(f.observer.snapshot().length,2);assert.equal(earlier.length,1);
});
test('a missing stdio close times out once, retaining debt without SIGKILL or target retry',async()=>{
  const f=streamFixture();await assert.rejects(f.observer.close(()=>15),/close timeout/);
  assert.deepEqual(f.signals,['SIGTERM']);assert.equal(f.observer.disposition().cleanupDebt,true);
  await assert.rejects(f.observer.close(()=>15),/single-use/);closed(f.child);
});
for(const fault of ['stderr','malformed','partial-tail','early-exit','saturation'])test(`sticky observer fault: ${fault}`,async()=>{
  const f=streamFixture({onKill:child=>queueMicrotask(()=>closed(child))});
  if(fault==='stderr')f.child.stderr.write('private error never retained');
  if(fault==='malformed')f.child.stdout.write('not JSON\n');
  if(fault==='partial-tail')f.child.stdout.write('{"unfinished":');
  if(fault==='early-exit'){f.child.exitCode=1;f.child.emit('exit',1,null);}
  if(fault==='saturation')for(let n=0;n<256;n++)f.child.stdout.write(row(f,'exec_die',String(1792281600000000001n+BigInt(n))));
  await assert.rejects(f.observer.close(()=>1000),/incomplete/);assert.deepEqual(f.signals,['SIGTERM']);
});
test('registration failure exposes an original-child cleanup handle without target STOP authority',async()=>{
  const child=new EventEmitter();Object.assign(child,{pid:123,stdout:new PassThrough(),stderr:new PassThrough()});const signals=[];
  child.kill=signal=>{signals.push(signal);queueMicrotask(()=>closed(child));return true;};
  let pending;
  assert.throws(()=>isolatedTerminationStream({id:'a'.repeat(64),start:'2026-10-18T00:00:00.000Z',spawnProcess:()=>child,
    register:()=>{throw Error('owned registry unavailable');}}),error=>{pending=error.originalObserverHandle;return error.originalObserverChild===child&&/registry unavailable/.test(error.message);});
  assert.equal(pending.disposition().cleanupDebt,true);await pending.close(()=>1000);assert.equal(pending.disposition().cleanupDebt,false);
  assert.deepEqual(signals,['SIGTERM']);
});
