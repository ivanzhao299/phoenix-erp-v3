/** Persistent maintenance ingress, under an explicitly verified trusted-root,
 * FD9-exclusive-writer model. This is not protection against arbitrary root.
 * No CLI, default authority, automatic retry, TTL removal or finally-unfence. */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {CONTRACT,verifyContext} from './production-config-guard.mjs';
import {executionEnv} from './capture-production-runtime.mjs';
import {bindingDigest,canonicalDigest,same,validateMaintenanceContext,MaintenanceReceiptStore} from './production-maintenance-receipts.mjs';
import {compileOwnedIngressRules,projectOwnedIngressTable,ingressIdentity} from './maintenance-ingress-policy.mjs';
const PREFIX='phoenix_maintenance',ID=/^[a-f0-9]{64}$/;
const fail=code=>Error('MAINTENANCE_INGRESS_HOLD='+code);
const fixedRun=(binary,args,{timeoutMs,input}={})=>{
 try{return execFileSync(binary,args,{env:executionEnv(),input,encoding:'utf8',timeout:timeoutMs,maxBuffer:262144,stdio:['pipe','pipe','pipe']}).trim();}
 catch{throw fail('COMMAND_OUTCOME_UNVERIFIED');}
};
const inspectNetwork='{{json .Id}}\t{{json .Driver}}\t{{json .Scope}}\t{{json .EnableIPv6}}\t{{json .IPAM.Config}}\t{{json .Options}}\t{{json .Containers}}\t{{json .Labels}}';
const MODEL='TRUSTED_ROOT_FD9_EXCLUSIVE_WRITER';
export class PersistentMaintenanceIngressController {
 #context;#scope;#compiled;#store;#guard;#run;#authority;#now;#mono;#readIdentity;
 #state='NEW';#fatal=null;#baseline=null;#host;#installedAt=null;#authorityReads=new Set();#released=false;#busy=false;
 constructor({context,scope,authority,store},dependencies={}){
  validateMaintenanceContext(context);this.#context=structuredClone(context);this.#scope=structuredClone(scope);
  const expected=['networkId','bridge','interfaceIndex','subnet','port'];
  if(!scope||!same(Object.keys(scope).sort(),expected.sort())||!ID.test(scope.networkId)||!Number.isSafeInteger(scope.interfaceIndex)||scope.interfaceIndex<1
   ||!Array.isArray(context.networkIsolation?.networks)||context.networkIsolation.networks.length!==1||context.networkIsolation.networks[0].id!==scope.networkId)throw fail('EXACT_NETWORK_SCOPE_REQUIRED');
  this.#compiled=compileOwnedIngressRules({owner:bindingDigest(context).slice(0,32),bridge:scope.bridge,subnet:scope.subnet,port:scope.port},PREFIX);
  this.#guard=dependencies.guard||(()=>verifyContext(CONTRACT.repository,CONTRACT.stateDirectory));this.#run=dependencies.run||fixedRun;
  this.#authority=authority;this.#store=store||new MaintenanceReceiptStore(context);this.#now=dependencies.now||Date.now;this.#mono=dependencies.monotonic||(()=>performance.now());
  this.#readIdentity=dependencies.readHostIdentity||(()=>({bootId:fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim(),networkNamespace:fs.readlinkSync('/proc/self/ns/net')}));
 }
 #poison(error){
  this.#fatal||=/^MAINTENANCE_INGRESS_HOLD=[A-Z_]+$/.test(error?.message||'')?error:fail('VALIDATION_OR_EFFECT_UNVERIFIED');
  if(/^MAINTENANCE_HOLD=[A-Z_]{1,100}$/.test(error?.message||''))this.#fatal.ingressFailureClass=error.message;
  if(error?.message==='MAINTENANCE_HOLD=ROOT_READER_HOST_PROCESS_OWNERSHIP_UNVERIFIED')this.#fatal.unverifiedHostProcess=error.unverifiedHostProcess;
  // Redacted diagnostic only: retain the wrapped cause's class and first
  // frames so an isolated fixture HOLD names its actual origin.
  this.#fatal.ingressUnderlying??={name:error?.name||null,message:error?.message||null,
   frames:String(error?.stack||'').split('\n').slice(1,5).map(line=>line.trim()).filter(Boolean)};
  this.#state='HOLD';return this.#fatal;
 }
 #budget(){const start=this.#mono(),wall=this.#now();let last=start,lastWall=wall;
  // 30s bounded effect budget: each underlying command stays individually
  // bounded, but an exclusive first-switch VM can saturate its single event
  // loop with legitimate promotion work while this controller observes; a
  // 10s aggregate cap converted those load spikes into fixture HOLDs.
  const capMs=30000;
  return()=>{if(this.#fatal)throw this.#fatal;this.#guard();const at=this.#mono(),now=this.#now();if(![start,wall,at,now].every(Number.isFinite)||at<last||now<lastWall||at-start>=capMs||now-wall>=capMs||now<Date.parse(this.#context.window.start)||now>=Date.parse(this.#context.window.end))throw fail('DEADLINE_OR_WINDOW');last=at;lastWall=now;return Math.max(1,Math.floor(Math.min(capMs-(at-start),capMs-(now-wall),Date.parse(this.#context.window.end)-now)));};
 }
 #hostIdentity(check){check();const value=this.#readIdentity();check();if(!value||!same(Object.keys(value).sort(),['bootId','networkNamespace'])||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value.bootId)||!/^net:\[[1-9][0-9]*\]$/.test(value.networkNamespace))throw fail('HOST_IDENTITY_UNVERIFIED');if(this.#host&&!same(this.#host,value))throw fail('BOOT_OR_NAMESPACE_CHANGED');return value;}
 #command(binary,args,check){let completed=false;
  try{const timeoutMs=Math.min(check(),10000),result=this.#run(binary,args,{timeoutMs});completed=true;check();return result;}
  catch(error){error.ingressCommand={program:path.basename(binary),operation:args.includes('--file')?'APPLY_KERNEL_PROGRAM':args[0],completed,state:this.#state};throw error;}
 }
 async #admit(operation,check,method='verifyExclusiveWriter'){
  // Authority waits keep their own fixed 10s bound even when the aggregate
  // observation budget has more room left.
  const admitMs=Math.min(check(),10000);
  const controller=new AbortController(),request=Object.freeze({model:MODEL,operation,context:structuredClone(this.#context),contextDigest:bindingDigest(this.#context),scope:structuredClone(this.#scope),scopeDigest:canonicalDigest(this.#scope),signal:controller.signal,timeoutMs:admitMs});
  let timer;const work=Promise.resolve().then(()=>{check();return this.#authority?.[method]?.(request);});this.#authorityReads.add(work);work.then(()=>this.#authorityReads.delete(work),()=>this.#authorityReads.delete(work));
  try{const result=await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(fail('AUTHORITY_TIMEOUT'));},admitMs);})]);check();
   if(result!==true)throw fail(method==='verifyFormalOpen'?'FORMAL_OPEN_NOT_VERIFIED':'EXCLUSIVE_WRITER_NOT_VERIFIED');
  }finally{clearTimeout(timer);controller.abort();}
 }
 #network(check){
  const row=this.#command('/usr/bin/docker',['inspect',this.#scope.networkId,'--format',inspectNetwork],check).split('\t').map(JSON.parse);
  const [id,driver,scope,ipv6,configs,options,members,labels]=row;
  if(row.length!==8||id!==this.#scope.networkId||driver!=='bridge'||scope!=='local'||ipv6!==false||!Array.isArray(configs)||configs.length!==1||configs[0].Subnet!==this.#scope.subnet||typeof options!=='object'||options===null||Array.isArray(options))throw fail('NETWORK_SCOPE_CHANGED');
  if(labels?.['com.docker.compose.project']!=='phoenix-erp'||!members||Object.getPrototypeOf(members)!==Object.prototype)throw fail('EXCLUSIVE_ERP_NETWORK_REQUIRED');
  let candidateId=null;
  const pre=this.#context.preSnapshot,known=new Map(['api','web','db'].map(service=>[pre[service].id,`phoenix-v3-${service}`]));
  for(const [containerId,member] of Object.entries(members)){
   if(!ID.test(containerId)||typeof member?.Name!=='string')throw fail('NETWORK_MEMBER_UNVERIFIED');
   if(known.has(containerId)){if(member.Name!==known.get(containerId))throw fail('NETWORK_MEMBER_IDENTITY_CHANGED');continue;}
   // A new endpoint is allowed only during the one owned replacement intent or
   // its committed candidate history, and must be the exact reviewed API image.
   const state=this.#store.readOwnedState();
   const marker=state.phase==='PROMOTION_PREPARED'?this.#store.read(this.#store.markerFile):null;
   if(member.Name!=='phoenix-v3-api'||state?.contextDigest!==bindingDigest(this.#context)
    ||!['PROMOTION_PREPARED','CANDIDATE_REPLACED','CANDIDATE_FENCED','VERIFIED_FENCED','COMPLETED_OPEN'].includes(state.phase)
    ||(state.phase==='PROMOTION_PREPARED'&&marker.operation!=='REPLACE_CANDIDATE'))throw fail('SHARED_OR_UNKNOWN_NETWORK_MEMBER');
   if(state.phase!=='PROMOTION_PREPARED'){
    const replacement=state.receipts.map(ref=>this.#store.readReceipt(ref)).find(record=>record.kind==='CANDIDATE_REPLACEMENT');
    if(replacement?.payload?.body?.candidate?.id!==containerId)throw fail('CANDIDATE_NOT_IN_COMMITTED_REPLACEMENT');
   }
   const actual=this.#command('/usr/bin/docker',['inspect',containerId,'--format','{{json .Id}}\t{{json .Image}}\t{{json .Name}}\t{{json (index .Config.Labels "com.docker.compose.project")}}\t{{json (index .Config.Labels "com.docker.compose.service")}}'],check).split('\t').map(JSON.parse);
   if(!same(actual,[containerId,this.#context.candidate.imageId,'/phoenix-v3-api','phoenix-erp','api']))throw fail('UNAPPROVED_CANDIDATE_ENDPOINT');
   if(candidateId!==null)throw fail('MULTIPLE_API_ENDPOINTS');candidateId=containerId;
  }
  if(!Object.hasOwn(members,pre.web.id)||!Object.hasOwn(members,pre.db.id))throw fail('ERP_WEB_DB_NETWORK_IDENTITY_CHANGED');
  const apiId=candidateId||pre.api.id;
  const ports=JSON.parse(this.#command('/usr/bin/docker',['inspect',apiId,'--format','{{json .HostConfig.PortBindings}}'],check));
  if(!same(ports,{'3100/tcp':[{HostIp:'127.0.0.1',HostPort:'3100'}]}))throw fail('EXCLUSIVE_PUBLISHED_ERP_PORT_REQUIRED');
  const bridge=options['com.docker.network.bridge.name']||'br-'+id.slice(0,12);if(bridge!==this.#scope.bridge)throw fail('BRIDGE_CHANGED');
  const links=JSON.parse(this.#command('/usr/sbin/ip',['-json','-details','link','show','dev',bridge],check));
  if(!Array.isArray(links)||links.length!==1||links[0].ifindex!==this.#scope.interfaceIndex||links[0].ifname!==bridge||links[0].linkinfo?.info_kind!=='bridge')throw fail('BRIDGE_IDENTITY_CHANGED');
 }
 #tables(check){return ['inet','bridge'].map(family=>projectOwnedIngressTable(JSON.parse(this.#command('/usr/sbin/nft',['--json','--handle','list','table',family,this.#compiled.table],check)),family,{owner:bindingDigest(this.#context).slice(0,32),bridge:this.#scope.bridge,subnet:this.#scope.subnet,port:this.#scope.port},PREFIX));}
 #file(kind){return path.join(this.#store.directory,`maintenance-ingress-${kind}-${this.#context.owner}.json`);}
 #write(kind,value,check){check();this.#store.immutable(this.#file(kind),value);check();if(!same(this.#store.read(this.#file(kind)),value))throw fail('DURABLE_INTENT_CHANGED');}
 #program(kind,value,check){this.#write(kind,value,check);return this.#file(kind);}
 async install(){
  if(this.#state!=='NEW')throw this.#poison(fail('INSTALL_ALREADY_ATTEMPTED'));this.#state='INSTALLING';const check=this.#budget();
  try{await this.#admit('INSTALL_MAINTENANCE_INGRESS',check);this.#host=this.#hostIdentity(check);this.#network(check);
   const listed=JSON.parse(this.#command('/usr/sbin/nft',['--json','list','tables'],check));
   if(!Array.isArray(listed.nftables)||listed.nftables.some(row=>row.table?.name===this.#compiled.table))throw fail('OWNED_TABLE_ALREADY_EXISTS');
   const program=JSON.parse(this.#compiled.program),file=this.#program('install',program,check);
   this.#write('install-intent',{schema:'phoenix.persistent-maintenance-ingress-intent/v1',model:MODEL,operation:'INSTALL',owner:this.#context.owner,contextDigest:bindingDigest(this.#context),scopeDigest:canonicalDigest(this.#scope),programDigest:canonicalDigest(program),host:this.#host,automaticUnfence:false},check);
   await this.#admit('INSTALL_MAINTENANCE_INGRESS',check);this.#hostIdentity(check);this.#network(check);
   if(!same(this.#store.read(file),program))throw fail('PROGRAM_CHANGED');
   this.#command('/usr/sbin/nft',['--json','--file',file],check);
   if(!same(this.#store.read(file),program))throw fail('PROGRAM_CHANGED');
   this.#hostIdentity(check);this.#network(check);this.#baseline=ingressIdentity(this.#tables(check));this.#installedAt=new Date(this.#now()).toISOString();
   this.#write('installed',{schema:'phoenix.persistent-maintenance-ingress-installed/v1',owner:this.#context.owner,contextDigest:bindingDigest(this.#context),scopeDigest:canonicalDigest(this.#scope),identity:this.#baseline,host:this.#host,installedAt:this.#installedAt,model:MODEL},check);
   this.#state='FENCED';return this.#observation(check);
  }catch(error){throw this.#poison(error);}
 }
 #observation(check){const host=this.#hostIdentity(check);this.#network(check);const observed=ingressIdentity(this.#tables(check));if(!same(observed,this.#baseline))throw fail('PERSISTENT_RULE_IDENTITY_CHANGED');
  return {schema:'phoenix.persistent-maintenance-ingress-observation/v1',owner:this.#context.owner,contextDigest:bindingDigest(this.#context),scopeDigest:canonicalDigest(this.#scope),model:MODEL,state:'FENCED',table:this.#compiled.table,identityDigest:canonicalDigest(observed),host,installedAt:this.#installedAt,checkedAt:new Date(this.#now()).toISOString(),expiresAt:this.#context.window.end,automaticUnfence:false,rootAdversaryResistance:false,productionAuthority:false};
 }
 async observe(){if(this.#state!=='FENCED'||this.#busy)throw this.#poison(fail('EXCLUSIVE_FENCED_OBSERVATION_REQUIRED'));this.#busy=true;const check=this.#budget();try{await this.#admit('OBSERVE_MAINTENANCE_INGRESS',check);return this.#observation(check);}catch(error){throw this.#poison(error);}finally{this.#busy=false;}}
 async release(){
  if(this.#state!=='FENCED'||this.#released||this.#busy)throw this.#poison(fail('SINGLE_RELEASE_FROM_FENCED_REQUIRED'));this.#released=true;this.#state='RELEASING';const check=this.#budget();
  try{await this.#admit('RELEASE_MAINTENANCE_INGRESS',check);this.#observation(check);
   // This fixed verifier reads formal/private/public state and actual candidate
   // identity itself; no caller-supplied success receipt is accepted.
   await this.#admit('RELEASE_MAINTENANCE_INGRESS',check,'verifyFormalOpen');
   const program={nftables:['bridge','inet'].map(family=>({delete:{table:{family,name:this.#compiled.table}}}))},file=this.#program('release',program,check);
   this.#write('release-intent',{schema:'phoenix.persistent-maintenance-ingress-release/v1',owner:this.#context.owner,contextDigest:bindingDigest(this.#context),scopeDigest:canonicalDigest(this.#scope),identityDigest:canonicalDigest(this.#baseline),programDigest:canonicalDigest(program),automaticRetry:false},check);
   await this.#admit('RELEASE_MAINTENANCE_INGRESS',check);this.#observation(check);await this.#admit('RELEASE_MAINTENANCE_INGRESS',check,'verifyFormalOpen');if(!same(this.#store.read(file),program))throw fail('PROGRAM_CHANGED');
   this.#command('/usr/sbin/nft',['--json','--file',file],check);if(!same(this.#store.read(file),program))throw fail('PROGRAM_CHANGED');
   const tables=JSON.parse(this.#command('/usr/sbin/nft',['--json','list','tables'],check));if(!Array.isArray(tables.nftables)||tables.nftables.some(row=>row.table?.name===this.#compiled.table))throw fail('RELEASE_OUTCOME_UNVERIFIED');
   this.#hostIdentity(check);this.#network(check);this.#write('released',{schema:'phoenix.persistent-maintenance-ingress-released/v1',owner:this.#context.owner,contextDigest:bindingDigest(this.#context),scopeDigest:canonicalDigest(this.#scope),identityDigest:canonicalDigest(this.#baseline),checkedAt:new Date(this.#now()).toISOString(),outcome:'EXACT_OWNED_TABLES_ABSENT'},check);this.#state='RELEASED';return {state:'RELEASED',owner:this.#context.owner,contextDigest:bindingDigest(this.#context),automaticRetry:false};
  }catch(error){throw this.#poison(error);}
 }
 status(){return {state:this.#state,automaticUnfence:false,pendingAuthorityReads:this.#authorityReads.size,originalReleaseAttempted:this.#released,productionAuthority:false};}
}
