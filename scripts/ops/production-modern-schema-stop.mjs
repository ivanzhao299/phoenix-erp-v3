/** Exact original CID only; TERM has no Docker automatic KILL fallback.
 * This internal operation requires the durable R_STOP_INTENT and original S. */
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {executionEnv} from './capture-production-runtime.mjs';
import {CONTRACT} from './production-config-guard.mjs';
import {readPinnedFile} from './production-trusted-paths.mjs';
import {canonicalDigest,HASH,same} from './production-maintenance-receipts.mjs';
import {INITIAL_MODERN_SCHEMA_PROFILE} from './production-modern-schema-facts.mjs';
import {classifyModernSchemaDatabaseExecutors,MODERN_SCHEMA_EXECUTOR_SQL} from './production-modern-schema-executors.mjs';
const fail=code=>{throw Error('MODERN_SCHEMA_STOP_HOLD='+code);};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const run=args=>{try{return execFileSync('/usr/bin/docker',args,{env:executionEnv(),encoding:'utf8',timeout:5000,maxBuffer:65536,stdio:['ignore','pipe','pipe']}).trim();}catch{fail('ORIGINAL_RUNTIME_OBSERVATION_UNRESOLVED');}};
export const ORIGINAL_LISTENER_CLOSED_PROGRAM = `const socket=require('node:net').connect({host:'127.0.0.1',port:3100});
socket.setTimeout(2000);
socket.once('connect',()=>{socket.destroy();process.exit(1)});
socket.once('timeout',()=>process.exit(2));
socket.once('error',error=>{if(error.code!=='ECONNREFUSED')process.exit(3);console.log('LISTENER_CLOSED')});`;
export const ORIGINAL_TERM_EVENT_FORMAT='{{.Action}}\t{{.Actor.ID}}\t{{index .Actor.Attributes "signal"}}\t{{index .Actor.Attributes "exitCode"}}\t{{.TimeNano}}';
export const ORIGINAL_IDLE_EXECUTOR_SQL=`WITH original AS (${MODERN_SCHEMA_EXECUTOR_SQL.trim().slice(0,-1)})
SELECT observation,COALESCE((SELECT jsonb_agg(pid) FROM pg_stat_activity
 WHERE backend_type='client backend' AND state='idle' AND xact_start IS NULL),'[]'::jsonb)::text AS idle_pids
 FROM original;`;
export function confirmsResidualTermEvents(raw,containerId,recordedAt,exitCode=143){
  const rows=raw.trim().split('\n').map(line=>line.split('\t'));
  if(![0,143].includes(exitCode)||rows.length!==2||rows.some(row=>row.length!==5||row[1]!==containerId||!/^[0-9]{19}$/.test(row[4])))return false;
  const [signal,exit]=rows;
  const started=Date.parse(recordedAt);
  return Number.isFinite(started)&&signal[0]==='kill'&&signal[2]==='15'&&exit[0]==='die'&&exit[3]===String(exitCode)&&
    BigInt(signal[4])>=BigInt(started)*1000000n&&BigInt(exit[4])>BigInt(signal[4]);
}

const initialProfile=context=>context?.floorSha===INITIAL_MODERN_SCHEMA_PROFILE.floorSha&&context.runtimeSha===INITIAL_MODERN_SCHEMA_PROFILE.runtimeSha&&
  context.sourceInventorySha256===INITIAL_MODERN_SCHEMA_PROFILE.sourceInventorySha256&&
  context.runtimeInventorySha256===INITIAL_MODERN_SCHEMA_PROFILE.runtimeInventorySha256&&
  context.pendingMigrations?.length===INITIAL_MODERN_SCHEMA_PROFILE.pendingCount;

export function originalStalledTermBindingMatches(residual,context,containerId,startedAt){
  return initialProfile(context)&&residual?.owner===context.owner&&residual.targetSha===context.targetSha&&
    residual.containerId===containerId&&residual.startedAt===startedAt&&
    Number.isSafeInteger(residual.pid)&&residual.pid>1&&Date.parse(residual.recordedAt)>Date.parse(startedAt)&&
    Date.parse(residual.recordedAt)>=Date.parse(context.window?.start)&&Date.parse(residual.recordedAt)<Date.parse(context.window?.end)&&
    residual.initialAcknowledgementSha256===canonicalDigest({stdout:containerId,stderr:''})&&
    HASH.test(residual.originalLeaseSha256??'')&&HASH.test(residual.idleObservationsSha256??'');
}

export function originalStopExitIsProved(stop,context){
  const residual=stop?.stalledShutdown;
  if(!residual)return stop?.exitCode===0;
  return [0,143].includes(stop.exitCode)&&residual.schema==='phoenix.modern-schema-stalled-original-shutdown/v1'&&
    originalStalledTermBindingMatches(residual,context,stop.containerId,stop.startedAt)&&
    residual.commandAckSha256===residual.initialAcknowledgementSha256&&HASH.test(residual.nativeEventsSha256??'');
}

export function protectedStalledShutdownMatches(stop,context,lease,read=file=>readPinnedFile(file,{contract:CONTRACT})){
  if(!stop.stalledShutdown)return true;
  if(!originalStopExitIsProved(stop,context))return false;
  const native=JSON.parse(read(path.join(CONTRACT.stateDirectory,`schema-release-session-${context.owner}`,'stalled-original-termination-native.json')));
  const {schema,commandAckSha256,nativeEventsSha256,...intent}=stop.stalledShutdown;
  return native.exitCode===stop.exitCode&&
    same(native.intent,{...intent,schema:'phoenix.modern-schema-stalled-original-term-intent/v1'})&&
    intent.originalLeaseSha256===canonicalDigest(lease)&&canonicalDigest(native.events)===nativeEventsSha256&&
    confirmsResidualTermEvents(native.events,stop.containerId,intent.recordedAt,stop.exitCode);
}

async function finishStalledOriginal({scope,actual,privateRuntime,directory,command,observe,check,firstAck,now,sleep}){
  if(typeof scope.verifyFences!=='function'||typeof scope.withVerifiedStop!=='function'||!scope.client||!scope.lease)
    fail('ORIGINAL_TERM_TIMEOUT_KEEP_FENCED');
  const sample=async()=>{
    await check();
    if(await scope.verifyFences()!==true)fail('STALLED_ORIGINAL_FENCES_UNVERIFIED');
    const found=observe();
    if(found.state.Running===false&&found.state.ExitCode===0)return {stopped:found};
    if(found.id!==actual.id||found.state.Running!==true||found.state.Pid!==actual.state.Pid||
      !same(found.restartPolicy,{Name:'no',MaximumRetryCount:0}))fail('STALLED_ORIGINAL_IDENTITY_CHANGED');
    if(command(['exec',found.id,'/usr/bin/env','-i','/usr/local/bin/node','-e',ORIGINAL_LISTENER_CLOSED_PROGRAM])!=='LISTENER_CLOSED')
      fail('STALLED_ORIGINAL_LISTENER_NOT_CLOSED');
    const {rows:[{observation,idle_pids}]}=await scope.client.query(ORIGINAL_IDLE_EXECUTOR_SQL);
    const native=JSON.parse(observation),idle=JSON.parse(idle_pids);
    classifyModernSchemaDatabaseExecutors(native,{runtimeAddress:scope.runtimeAddress,originalLease:scope.lease,ownedReadSessions:scope.ownedReadSessions});
    const residual=native.sessions.filter(row=>row.clientAddress===scope.runtimeAddress);
    if(!Array.isArray(idle)||native.workers.length!==0||residual.length>1||
      residual.some(row=>row.openTransaction!==false||row.applicationName!==''||!idle.includes(row.pid)))fail('STALLED_ORIGINAL_EXECUTOR_NOT_IDLE');
    return {residual};
  };
  const first=await sample();
  if(first.stopped)return {stopped:first.stopped};
  await sleep(250);
  const confirmed=await sample();
  if(confirmed.stopped)return {stopped:confirmed.stopped};
  if(!same(first.residual,confirmed.residual))fail('STALLED_ORIGINAL_EXECUTOR_CHANGED');
  await check();
  const intent={schema:'phoenix.modern-schema-stalled-original-term-intent/v1',owner:scope.context.owner,targetSha:scope.context.targetSha,
    containerId:actual.id,startedAt:actual.state.StartedAt,pid:actual.state.Pid,recordedAt:new Date(now()).toISOString(),
    originalLeaseSha256:canonicalDigest(scope.lease),idleObservationsSha256:canonicalDigest(confirmed.residual),initialAcknowledgementSha256:firstAck};
  return scope.withVerifiedStop(async()=>{
    privateRuntime.publishJson(directory+'/stalled-original-term-intent.json',intent);
    await check();
    if(await scope.verifyFences(true)!==true)fail('STALLED_ORIGINAL_FENCES_UNVERIFIED');
    const live=observe();
    if(live.state.Running===false&&live.state.ExitCode===0)return {stopped:live};
    if(live.state.Running!==true||live.state.Pid!==intent.pid)fail('STALLED_ORIGINAL_IDENTITY_CHANGED');
    const retry=await privateRuntime.run({binary:'/usr/bin/docker',args:['kill','--signal=TERM',actual.id],directory,stem:'stalled-original-term',timeoutMs:5000});
    const ack=scope.readProtectedOutput??(file=>readPinnedFile(file,{contract:CONTRACT}));
    if(!ack(retry.stdout).equals(Buffer.from(actual.id+'\n'))||ack(retry.stderr).length!==0)fail('STALLED_ORIGINAL_TERM_NOT_ACKNOWLEDGED');
    const deadline=now()+5000;
    for(;;){
      await check();
      const stopped=observe();
      if(stopped.state.Running===false){
        const events=command(['events','--since',intent.recordedAt,'--until',new Date(now()).toISOString(),'--filter','type=container',
          '--filter','container='+actual.id,'--filter','event=kill','--filter','event=die','--format',ORIGINAL_TERM_EVENT_FORMAT]);
        if(!confirmsResidualTermEvents(events,actual.id,intent.recordedAt,stopped.state.ExitCode))fail('STALLED_ORIGINAL_TERMINAL_EVENTS_REQUIRED');
        privateRuntime.publishJson(directory+'/stalled-original-termination-native.json',{intent,events,exitCode:stopped.state.ExitCode});
        return {stopped,proof:{...intent,schema:'phoenix.modern-schema-stalled-original-shutdown/v1',
          commandAckSha256:canonicalDigest({stdout:actual.id,stderr:''}),nativeEventsSha256:canonicalDigest(events)}};
      }
      if(now()>=deadline)fail('ORIGINAL_TERM_TIMEOUT_KEEP_FENCED');
      await sleep(100);
    }
  });
}
export function observeOriginalModernSchemaRuntime(originalSnapshot,dependencies={}){
 const pin=originalSnapshot?.containers?.api;if(!/^[a-f0-9]{64}$/.test(pin?.id??'')||!/^sha256:[a-f0-9]{64}$/.test(pin.image??''))fail('ORIGINAL_RUNTIME_PIN_REQUIRED');
 const command=dependencies.run??run;
 const actual=command(['inspect',pin.id,'--format','{{json .Id}}\t{{json .Name}}\t{{json .Image}}\t{{json .State}}\t{{json .RestartCount}}\t{{json .HostConfig.RestartPolicy}}']).split('\t').map(JSON.parse);
 const [id,name,image,state,restarts,restartPolicy]=actual;
 if(id!==pin.id||name!=='/phoenix-v3-api'||image!==pin.image||state.StartedAt!==pin.startedAt||restarts!==pin.restartCount||state.OOMKilled!==false||state.Dead!==false||state.Restarting!==false||state.Paused!==false)fail('ORIGINAL_RUNTIME_CHANGED_OR_CRASHED');
 return {id,image,state,restarts,restartPolicy};
}
export async function stopOriginalModernSchemaRuntime({originalSnapshot,privateRuntime,directory,admit,drainStillOriginal,stalledShutdown},dependencies={}){
 if(typeof admit!=='function'||typeof drainStillOriginal!=='function')fail('ORIGINAL_CONTROL_ADMISSION_REQUIRED');
 const check=async()=>{privateRuntime.guard();if(await admit()!==true)fail('DURABLE_STOP_INTENT_REQUIRED');privateRuntime.guard();};
 await check();await drainStillOriginal();const before=observeOriginalModernSchemaRuntime(originalSnapshot,dependencies);
 if(before.state.Running!==true||before.state.Health?.Status!=='healthy'||!['always','unless-stopped','no'].includes(before.restartPolicy?.Name))fail('ORIGINAL_HEALTHY_RUNTIME_REQUIRED');
 const command=dependencies.run??run;
 const now=dependencies.now??Date.now,sleep=dependencies.sleep??pause;
 const observe=()=>observeOriginalModernSchemaRuntime(originalSnapshot,dependencies);
 await check();command(['update','--restart=no',before.id]);await check();
 const disabled=observeOriginalModernSchemaRuntime(originalSnapshot,dependencies);if(disabled.state.Running!==true||disabled.restartPolicy.Name!=='no')fail('ORIGINAL_RESTART_DISABLE_UNVERIFIED');
 await drainStillOriginal();await check();
 const first=await privateRuntime.run({binary:'/usr/bin/docker',args:['kill','--signal=TERM',before.id],directory,stem:'original-r-term',timeoutMs:10000});
 const deadline=now()+30000;let stopped,proof;
 for(;;){
  await check();const actual=observe();
  if(!actual.state.Running){stopped=actual;break;}
  if(now()>=deadline){
   if(!stalledShutdown||!initialProfile(stalledShutdown.context))fail('ORIGINAL_TERM_TIMEOUT_KEEP_FENCED');
   const read=stalledShutdown.readProtectedOutput??(file=>readPinnedFile(file,{contract:CONTRACT}));
   if(!read(first.stdout).equals(Buffer.from(before.id+'\n'))||read(first.stderr).length!==0||
       actual.state.Pid!==before.state.Pid||!same(stalledShutdown.snapshot,originalSnapshot.containers.api))
     fail('STALLED_ORIGINAL_FIRST_TERM_NOT_ACKNOWLEDGED');
   ({stopped,proof}=await finishStalledOriginal({scope:stalledShutdown,actual,
     privateRuntime,directory,command,observe,check,firstAck:canonicalDigest({stdout:before.id,stderr:''}),now,sleep}));
   break;
  }
  await sleep(100);
 }
 const receipt={schema:'phoenix.modern-schema-original-runtime-stopped/v1',containerId:before.id,imageId:before.image,startedAt:before.state.StartedAt,
  restartCount:before.restarts,originalRestartPolicy:before.restartPolicy,currentRestartPolicy:stopped.restartPolicy,
  exitCode:stopped.state.ExitCode,oomKilled:false,pid:0,signal:'TERM',automaticKill:false,oldDatabaseSessionsGone:false,
  ...(proof?{stalledShutdown:proof}:{})};
 if(stopped.state.Status!=='exited'||stopped.state.Pid!==0||!same(stopped.restartPolicy,{Name:'no',MaximumRetryCount:0})||
   !originalStopExitIsProved(receipt,stalledShutdown?.context))fail('ORIGINAL_TERM_RESULT_UNRESOLVED');
 await check();return receipt;
}
