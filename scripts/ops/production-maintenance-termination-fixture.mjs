/** Helpers for opt-in synthetic LOCAL fixtures. No production adapter/CLI. */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { redactLegacyTerminationEvent } from './production-maintenance-termination-policy.mjs';

export const terminationEventFormat='{"Type":{{json .Type}},"Action":{{json .Action}},"Actor":{"ID":{{json .Actor.ID}},"Attributes":{'
  +'"signal":{{if index .Actor.Attributes "signal"}}{{json (index .Actor.Attributes "signal")}}{{else}}null{{end}},'
  +'"exitCode":{{if index .Actor.Attributes "exitCode"}}{{json (index .Actor.Attributes "exitCode")}}{{else}}null{{end}}}},"timeNano":"{{.TimeNano}}"}';

export function localTerminationDocker({runFile=execFileSync}={}) {
  return (args,options={})=>runFile('/usr/bin/docker',['--host','unix:///var/run/docker.sock',...args],{
    encoding:'utf8',timeout:10000,maxBuffer:1024*1024,stdio:['pipe','pipe','pipe'],...options,
    // No inherited DOCKER_CONTEXT, DOCKER_HOST, TLS or proxy configuration.
    env:{PATH:process.env.PATH,DOCKER_HOST:'unix:///var/run/docker.sock'}
  }).trim();
}
export function terminationBudget(clock=()=>performance.now()) {
  const begin=clock();let last=begin;
  assert.ok(Number.isFinite(begin),'stop observation clock');
  return ()=>{
    const now=clock();assert.ok(Number.isFinite(now)&&now>=last,'stop observation clock');last=now;
    const remaining=Math.floor(35000-(now-begin));assert.ok(remaining>0,'whole stop observation deadline');return remaining;
  };
}
export function inspectOwnedTerminationRuntime(resource,{run,owner,remaining=()=>10000}) {
  assert.match(resource.id,/^[a-f0-9]{64}$/);
  const [id,imageId,state,restartCount,labels,stopSignal]=run(['inspect',resource.id,'--format',
    '{{json .Id}}\t{{json .Image}}\t{{json .State}}\t{{json .RestartCount}}\t{{json .Config.Labels}}\t{{json .Config.StopSignal}}'],{timeout:remaining()}).split('\t').map(JSON.parse);
  assert.equal(id,resource.id);assert.equal(imageId,resource.imageId);
  assert.equal(labels['phoenix.test.owner'],owner);assert.equal(labels['phoenix.test.kind'],'termination-observation');assert.equal(stopSignal,'SIGTERM');
  const revision=run(['image','inspect',imageId,'--format','{{index .Config.Labels "org.opencontainers.image.revision"}}'],{timeout:remaining()});
  return {id,imageId,revision,startedAt:state.StartedAt,restartCount,running:state.Running,health:state.Health?.Status,
    exitCode:state.ExitCode,oomKilled:state.OOMKilled,pid:state.Pid};
}

/** An owned fixture CLI child only. Local process spawn is NOT subscription
 * readiness; no production caller may use this as continuous fence evidence.
 * The caller must register the original child before any target STOP. */
export function isolatedTerminationStream({id,start,register,spawnProcess=spawn}) {
  assert.match(id,/^[a-f0-9]{64}$/);assert.equal(typeof register,'function');
  assert.ok(typeof start==='string'&&new Date(start).toISOString()===start,'exact stream start required');
  const child=spawnProcess('/usr/bin/docker',['--host','unix:///var/run/docker.sock','events','--filter',`container=${id}`,
    '--since',start,'--format',terminationEventFormat],{env:{PATH:process.env.PATH,DOCKER_HOST:'unix:///var/run/docker.sock'},stdio:['ignore','pipe','pipe']});
  const rows=[];let tail='',bytes=0,failed=false,closing=false,closed=false,terminationSent=false;
  let resolveClose;const closedPromise=new Promise(resolve=>{resolveClose=resolve;});
  const fail=()=>{failed=true;};
  child.on('error',fail);child.once('exit',()=>{if(!closing)fail();});
  child.once('close',()=>{closed=true;if(!closing)fail();resolveClose();});
  child.stdout.on('error',fail);child.stderr.on('error',fail);child.stderr.on('data',fail);
  child.stdout.on('data',chunk=>{
    bytes+=chunk.length;if(bytes>65536){fail();return;}
    tail+=chunk.toString('utf8');
    for(;;){const end=tail.indexOf('\n');if(end<0)break;const row=tail.slice(0,end);tail=tail.slice(end+1);
      try{if(row.length>4096||rows.length>=255)throw Error('bound');const event=redactLegacyTerminationEvent(JSON.parse(row));assert.equal(event.Actor.ID,id);rows.push(event);}catch{fail();}}
    if(tail.length>4096)fail();
  });
  // Synchronous registration happens even if the asynchronous spawn will fail.
  // A registration exception retains this original child for the caller's
  // explicit disposition; it must never proceed to target STOP.
  const assertLive=()=>{assert.ok(!failed&&!closing&&!closed&&child.pid&&child.exitCode===null&&child.signalCode===null,'owned observer child lost');};
  const handle={
    child,
    snapshot:()=>structuredClone(rows),
    disposition:()=>({originalPid:child.pid,closeAttempted:closing,stdioClosed:closed,cleanupDebt:!closed,evidenceFailed:failed,terminationSent}),
    assertLocalProcessLive:assertLive,
    async waitForTerminal(remaining){
      for(;;){assertLive();remaining();if(rows.some(e=>e.Action==='die')&&rows.some(e=>e.Action==='stop'))return;
        await new Promise(resolve=>setTimeout(resolve,Math.min(20,remaining())));}
    },
    async close(remaining){
      assert.ok(!closing,'observer close is single-use');const preFailed=failed||closed;closing=true;
      if(!closed){terminationSent=child.kill('SIGTERM');}
      let timer;
      try{await Promise.race([closedPromise,new Promise((_,reject)=>{timer=setTimeout(()=>{fail();reject(Error('observer stdio close timeout'));},Math.min(2000,remaining()));})]);}
      finally{clearTimeout(timer);}
      assert.ok(!preFailed&&!failed&&closed&&tail==='','observer evidence/stdio close incomplete');remaining();
      return {originalPid:child.pid,closed:true,stdioClosed:true,terminationSent,additionalTargetSignal:false,productionAuthority:false};
    }
  };
  try{register(child);}catch(error){error.originalObserverChild=child;error.originalObserverHandle=handle;throw error;}
  return handle;
}
