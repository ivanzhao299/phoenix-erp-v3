/** Fixed real read-controller graph for the ONE production factory. No plan can
 * select worker paths, programs, verifiers, users or environment approval flags. */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {fork,execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {CONTRACT,verifyContext} from './production-config-guard.mjs';
import {readPinnedFile} from './production-trusted-paths.mjs';
import {bindingDigest,same} from './production-maintenance-receipts.mjs';
import {validateReleasePlan} from './production-maintenance-deployment-session.mjs';
import {MaintenanceControlParticipants,CONTROL_PARTICIPANT_ROLES} from './production-maintenance-control-participants.mjs';
const workerFile=fileURLToPath(new URL('./production-maintenance-controller-worker.mjs',import.meta.url));
const fail=code=>Error('MAINTENANCE_CONTROLLER_HOLD='+code);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function createMaintenanceReadControllers(plan){
 validateReleasePlan(plan);verifyContext(CONTRACT.repository,CONTRACT.stateDirectory);
 const own=fs.fstatSync(9),original=fs.statSync(`/proc/${process.ppid}/fd/9`);
 if(own.dev!==original.dev||own.ino!==original.ino)throw fail('ORIGINAL_SELF_FD9_REQUIRED');
 const context=structuredClone(plan.context),digest=bindingDigest(context),clients=new Map(),registeredChildren=new Map();
 const expected=execFileSync('/usr/bin/git',['-c',`safe.directory=${CONTRACT.repository}`,'show',`${context.targetSha}:scripts/ops/production-maintenance-controller-worker.mjs`],{cwd:CONTRACT.repository,timeout:5000,maxBuffer:65536,stdio:['ignore','pipe','pipe']});
 const bytes=readPinnedFile(workerFile,{contract:CONTRACT}),sourceSha256=hash(bytes);
 if(!bytes.equals(expected))throw fail('WORKER_SOURCE_NOT_EXACT_TARGET');
 const definitions=CONTROL_PARTICIPANT_ROLES.map(role=>({role,sourceSha256,
  async start(options){
   verifyContext(CONTRACT.repository,CONTRACT.stateDirectory);
   if(clients.has(role)||hash(readPinnedFile(workerFile,{contract:CONTRACT}))!==sourceSha256)throw fail('SINGLE_PINNED_WORKER_REQUIRED');
   const child=fork(workerFile,[context.owner,role],{execPath:process.execPath,execArgv:[],env:{PATH:'/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'},stdio:['ignore','pipe','pipe','ipc','ignore','ignore','ignore','ignore','ignore',9]});
   const stat=fs.readFileSync(`/proc/${child.pid}/stat`,'utf8'),startTicks=stat.slice(stat.lastIndexOf(')')+2).split(' ')[19];
   registeredChildren.set(role,{child,pid:child.pid,startTicks});
   const pending=new Map();let broken=null,closing=false,closed=false;
   const joined=new Promise(resolve=>child.once('close',()=>{closed=true;for(const p of pending.values())p.reject(fail('ORIGINAL_CHILD_CLOSED'));pending.clear();resolve();}));
   const poison=()=>{broken||=fail('WORKER_PROTOCOL_OR_LIFECYCLE');for(const p of pending.values())p.reject(broken);};
   child.on('error',poison);child.stderr.on('data',poison);child.stdout.on('data',poison);
   child.on('message',message=>{
    const p=pending.get(message?.id);
    if(!p||Object.keys(message).some(k=>!['id','value','error'].includes(k))||Object.hasOwn(message,'value')===Object.hasOwn(message,'error')){poison();return;}
    pending.delete(message.id);
    if(Object.hasOwn(message,'error')){broken||=fail('WORKER_OBSERVATION_FAILED');p.reject(broken);}else p.resolve(message.value);
   });
   const client={child,joined,role,pending,
    rpc(operation,{nonce=randomUUID(),timeoutMs=10000,signal}={}){
     if((broken&&!['CLOSE'].includes(operation))||closed||!child.connected||closing&&operation!=='CLOSE')return Promise.reject(broken||fail('WORKER_UNAVAILABLE'));
     if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000||signal?.aborted)return Promise.reject(fail('RPC_BUDGET_OR_ABORT'));
     const id=randomUUID();let timer,abort;
     const work=new Promise((resolve,reject)=>{
      // Do not erase an expired RPC. Only its actual reply or original close
      // settles the debt; the controller graph remains permanently poisoned.
      pending.set(id,{resolve,reject});
      abort=()=>{broken||=fail('RPC_ABORTED');reject(broken);};signal?.addEventListener('abort',abort,{once:true});
      timer=setTimeout(()=>{broken||=fail('RPC_TIMEOUT');reject(broken);},timeoutMs);
      child.send({id,operation,nonce},error=>{if(error){broken||=fail('RPC_SEND_FAILED');reject(broken);}});
     });
     return work.finally(()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);});
    },
    async close(options){if(closing)throw fail('SINGLE_CLOSE_REQUIRED');closing=true;await client.rpc('CLOSE',options);await joined;if(!closed||child.exitCode!==0||child.signalCode!==null||pending.size)throw fail('ORIGINAL_CLOSE_OR_DEBT_UNVERIFIED');}
   };
   clients.set(role,client);options.registerOwnedChild(child);
   const hello=await client.rpc('INIT',options);
   if(!same(hello,{ready:true,role,owner:context.owner,contextDigest:digest,sourceSha256}))throw fail('EXACT_ROLE_HANDSHAKE_REQUIRED');
   return client;
  },
  probe:(client,options)=>client.rpc('HEALTH',options),
  close:(client,options)=>client.close(options)
 }));
 const graph=new MaintenanceControlParticipants({context,definitions});
 return {graph,registeredChildren:()=>[...registeredChildren.values()],async capturePre(options){const client=clients.get('EVIDENCE_RECORDER');if(!client)throw fail('RECORDER_NOT_BOOTSTRAPPED');return client.rpc('CAPTURE_PRE',options);},
  async verifyFormal(options){const client=clients.get('EVIDENCE_RECORDER');if(!client)throw fail('RECORDER_NOT_BOOTSTRAPPED');return client.rpc('VERIFY_FORMAL',options);}};
}
