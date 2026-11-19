/** Exact original CID only; TERM has no Docker automatic KILL fallback.
 * This internal operation requires the durable R_STOP_INTENT and original S. */
import {execFileSync} from 'node:child_process';import {executionEnv} from './capture-production-runtime.mjs';import {same} from './production-maintenance-receipts.mjs';
const fail=code=>{throw Error('MODERN_SCHEMA_STOP_HOLD='+code);};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const run=args=>{try{return execFileSync('/usr/bin/docker',args,{env:executionEnv(),encoding:'utf8',timeout:5000,maxBuffer:65536,stdio:['ignore','pipe','pipe']}).trim();}catch{fail('ORIGINAL_RUNTIME_OBSERVATION_UNRESOLVED');}};
export function observeOriginalModernSchemaRuntime(originalSnapshot,dependencies={}){
 const pin=originalSnapshot?.containers?.api;if(!/^[a-f0-9]{64}$/.test(pin?.id??'')||!/^sha256:[a-f0-9]{64}$/.test(pin.image??''))fail('ORIGINAL_RUNTIME_PIN_REQUIRED');
 const command=dependencies.run??run;
 const actual=command(['inspect',pin.id,'--format','{{json .Id}}\t{{json .Name}}\t{{json .Image}}\t{{json .State}}\t{{json .RestartCount}}\t{{json .HostConfig.RestartPolicy}}']).split('\t').map(JSON.parse);
 const [id,name,image,state,restarts,restartPolicy]=actual;
 if(id!==pin.id||name!=='/phoenix-v3-api'||image!==pin.image||state.StartedAt!==pin.startedAt||restarts!==pin.restartCount||state.OOMKilled!==false||state.Dead!==false||state.Restarting!==false||state.Paused!==false)fail('ORIGINAL_RUNTIME_CHANGED_OR_CRASHED');
 return {id,image,state,restarts,restartPolicy};
}
export async function stopOriginalModernSchemaRuntime({originalSnapshot,privateRuntime,directory,admit,drainStillOriginal},dependencies={}){
 if(typeof admit!=='function'||typeof drainStillOriginal!=='function')fail('ORIGINAL_CONTROL_ADMISSION_REQUIRED');
 const check=async()=>{privateRuntime.guard();if(await admit()!==true)fail('DURABLE_STOP_INTENT_REQUIRED');privateRuntime.guard();};
 await check();await drainStillOriginal();const before=observeOriginalModernSchemaRuntime(originalSnapshot,dependencies);
 if(before.state.Running!==true||before.state.Health?.Status!=='healthy'||!['always','unless-stopped','no'].includes(before.restartPolicy?.Name))fail('ORIGINAL_HEALTHY_RUNTIME_REQUIRED');
 const command=dependencies.run??run;
 await check();command(['update','--restart=no',before.id]);await check();
 const disabled=observeOriginalModernSchemaRuntime(originalSnapshot,dependencies);if(disabled.state.Running!==true||disabled.restartPolicy.Name!=='no')fail('ORIGINAL_RESTART_DISABLE_UNVERIFIED');
 await drainStillOriginal();await check();
 await privateRuntime.run({binary:'/usr/bin/docker',args:['kill','--signal=TERM',before.id],directory,stem:'original-r-term',timeoutMs:10000});
 const deadline=Date.now()+30000;let stopped;
 for(;;){await check();const actual=observeOriginalModernSchemaRuntime(originalSnapshot,dependencies);
  if(!actual.state.Running){if(actual.state.Status!=='exited'||actual.state.ExitCode!==0||actual.state.Pid!==0||actual.restartPolicy.Name!=='no')fail('ORIGINAL_TERM_RESULT_UNRESOLVED');stopped=actual;break;}
  if(Date.now()>=deadline)fail('ORIGINAL_TERM_TIMEOUT_KEEP_FENCED');await pause(100);
 }
 await check();return {schema:'phoenix.modern-schema-original-runtime-stopped/v1',containerId:before.id,imageId:before.image,startedAt:before.state.StartedAt,
  restartCount:before.restarts,originalRestartPolicy:before.restartPolicy,currentRestartPolicy:stopped.restartPolicy,exitCode:0,oomKilled:false,pid:0,signal:'TERM',automaticKill:false,oldDatabaseSessionsGone:false};
}
