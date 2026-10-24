/** Concrete, bounded local readers for the compiled maintenance factory.
 * Outputs contain identity pins and safe observations, never environment
 * values, executable adapters, externally supplied SQL or release approvals. */
import fs from 'node:fs';
import path from 'node:path';
import {ChildProcess,execFileSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {finished} from 'node:stream/promises';
import {CONTRACT,verifyContext,secureJson,git} from './production-config-guard.mjs';
import {readPinnedFile} from './production-trusted-paths.mjs';
import {executionEnv} from './capture-production-runtime.mjs';
import {canonicalDigest,bindingDigest,same,HASH,hold} from './production-maintenance-receipts.mjs';
import {collectMaintenanceDomainObservation} from './production-maintenance-domain-observer.mjs';
import {readOwnerAuthUnknownDecision} from './production-maintenance-owner-unknown.mjs';
import {collectMaintenanceIotState,compareMaintenanceIotState} from './production-maintenance-iot-state.mjs';
import {discoverMaintenanceDatabaseIdentity,collectMaintenanceDatabaseSnapshot} from './production-maintenance-database-observer.mjs';
import {captureMaintenanceSourceManifest} from './production-maintenance-root-sources.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const guard=()=>verifyContext(CONTRACT.repository,CONTRACT.stateDirectory);
const run=(program,args,input)=>{
  try{return execFileSync(program,args,{input,env:executionEnv(),encoding:'utf8',timeout:5000,maxBuffer:1024*1024,stdio:['pipe','pipe','pipe']}).trim();}
  catch{hold('ROOT_READER_BOUNDED_READ_FAILED');}
};
const docker=args=>run('/usr/bin/docker',args);
const ID=/^[a-f0-9]{64}$/;
export async function hashMaintenanceRecoveryFile(file,expected,{signal,timeoutMs=10000}={}){
  if(!HASH.test(expected.sha256||'')||!Number.isSafeInteger(expected.bytes)||expected.bytes<1||expected.bytes>8*1024**3)hold('ROOT_READER_RECOVERY_FILE_PIN');
  const before=fs.lstatSync(file),pin=s=>[s.dev,s.ino,s.uid,s.mode,s.nlink,s.size,s.mtimeMs,s.ctimeMs];
  if(!before.isFile()||before.isSymbolicLink()||before.uid!==0||(before.mode&0o7777)!==0o600||before.nlink!==1||before.size!==expected.bytes)hold('ROOT_READER_RECOVERY_FILE_IDENTITY');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  if(!same(pin(before),pin(fs.fstatSync(fd)))){fs.closeSync(fd);hold('ROOT_READER_RECOVERY_FILE_CHANGED');}
  const stream=fs.createReadStream(null,{fd,autoClose:true,highWaterMark:1024*1024,signal}),sum=createHash('sha256');
  const timer=setTimeout(()=>stream.destroy(Error('MAINTENANCE_HOLD=ROOT_READER_RECOVERY_READ_TIMEOUT')),timeoutMs);let size=0;
  try{
    for await(const chunk of stream){size+=chunk.length;if(size>expected.bytes)hold('ROOT_READER_RECOVERY_FILE_GREW');sum.update(chunk);}
    await finished(stream,{cleanup:true});
    if(size!==expected.bytes||sum.digest('hex')!==expected.sha256||!same(pin(before),pin(fs.lstatSync(file))))hold('ROOT_READER_RECOVERY_BYTES_CHANGED');
    return {bytes:size,sha256:expected.sha256};
  }finally{clearTimeout(timer);if(!stream.closed){stream.destroy();await finished(stream,{cleanup:true}).catch(()=>{});}}
}
const procStat=pid=>{
  const text=fs.readFileSync(`/proc/${pid}/stat`,'utf8'),fields=text.slice(text.lastIndexOf(')')+2).split(' ');
  return {pid,ppid:Number(fields[1]),startTicks:fields[19],state:fields[0]};
};
function processIdentity(pid){
  const before=procStat(pid),base=`/proc/${pid}`;
  const argv=fs.readFileSync(`${base}/cmdline`),cgroup=fs.readFileSync(`${base}/cgroup`,'utf8');
  let exe='',cwd='';
  try{exe=fs.readlinkSync(`${base}/exe`);cwd=fs.readlinkSync(`${base}/cwd`);}catch(error){if(!['ENOENT','ESRCH','EACCES','EPERM'].includes(error.code))throw error;}
  const value={...before,exe,cwdSha256:hash(cwd),argvSha256:hash(argv),cgroupSha256:hash(cgroup),
    pidNamespace:fs.readlinkSync(`${base}/ns/pid`),erpControlReference:argv.includes(Buffer.from(CONTRACT.repository))||cwd===CONTRACT.repository||cwd.startsWith(CONTRACT.repository+'/')};
  if(procStat(pid).startTicks!==before.startTicks)hold('ROOT_READER_PROCESS_REUSED');
  delete value.state; // R/S are scheduler observations, never process identity.
  return {value,cgroup,argv,cwd};
}
const containerFormat=['{{json .Id}}','{{json .Image}}','{{json .Name}}','{{json .State.StartedAt}}','{{json .RestartCount}}',
  '{{json .State.Pid}}','{{json .State.Running}}','{{json .HostConfig.Privileged}}','{{json .HostConfig.PidMode}}',
  '{{json .HostConfig.NetworkMode}}','{{json .HostConfig.Binds}}','{{json (index .Config.Labels "com.docker.compose.project")}}'].join('\t');
function containerIdentity(id){
  const rows=docker(['inspect',id,'--format',containerFormat]).split('\t').map(JSON.parse);
  if(rows.length!==12||rows[0]!==id)hold('ROOT_READER_CONTAINER_CHANGED');
  const [actual,imageId,name,startedAt,restartCount,pid,running,privileged,pidMode,networkMode,binds,project]=rows;
  return {id:actual,imageId,name,startedAt,restartCount,pid,running,privileged,pidMode,networkMode,
    bindsSha256:canonicalDigest(binds),project,erpBind:Array.isArray(binds)&&binds.some(v=>v.startsWith(CONTRACT.repository+':')||v.startsWith(CONTRACT.repository+'/'))};
}

/** Read-only ownership audit candidates. These functions return identity
 * observations only and never classify, approve or register an executor. */
export function observeMaintenanceProcessIdentity(pid){guard();return processIdentity(pid).value;}
export function observeMaintenanceContainerIdentity(id){guard();if(!ID.test(id))hold('ROOT_READER_CONTAINER_ID');return containerIdentity(id);}

/** Templates have definitions but no instance properties. Querying an
 * uninstantiated @.service with systemctl show aborts the entire batch. Keep
 * them in the inventory and hash their actual cat output instead of dropping
 * their potential scheduled work. Masked templates remain explicit state pins. */
export function partitionMaintenanceSchedulerUnits(text){
 const entries=text.split('\n').filter(line=>line.trim()).map(line=>{const [name,state]=line.trim().split(/\s+/);return {name,state};}).sort((a,b)=>a.name.localeCompare(b.name));
 const states=new Set(['enabled','enabled-runtime','linked','linked-runtime','alias','masked','masked-runtime','static','disabled','indirect','generated','transient','bad']);
 if(entries.length>2048||new Set(entries.map(row=>row.name)).size!==entries.length||entries.some(row=>!/^[-A-Za-z0-9_.@:\\]+\.(?:service|timer)$/.test(row.name)||!states.has(row.state)))hold('ROOT_READER_UNIT_INVENTORY');
 return {entries,instances:entries.filter(row=>!/@\.(?:service|timer)$/.test(row.name)).map(row=>row.name),
  templates:entries.filter(row=>/@\.(?:service|timer)$/.test(row.name)&&!row.state.startsWith('masked')).map(row=>row.name),
  maskedTemplates:entries.filter(row=>/@\.(?:service|timer)$/.test(row.name)&&row.state.startsWith('masked'))};
}

/** A masked unit has no executable definition. /dev/null is the explicit
 * systemd mask sentinel, not an unreadable scheduler file or an empty service.
 * Never extend this exception to an unmasked unit or another special path. */
export function isMaintenanceSystemdMask(file,lines){
 return lines.includes('LoadState=masked')&&!lines.some(line=>line.startsWith('ExecStart=')&&line!=='ExecStart=')&&fs.realpathSync(file)==='/dev/null';
}

/** systemctl ExecStart combines the actual loaded command definition with
 * last-run bookkeeping. Keep every command/argv/ignore_errors byte and all
 * other properties; only the documented final execution metadata is excluded
 * from the immutable definition pin. Unknown serialization fails closed. */
export function normalizeMaintenanceSystemdDefinition(block,typed){
 if(typed!==undefined){
  if(typed?.type!=='a(sasbttttuii)'||!Array.isArray(typed.data)||typed.data.length<1||typed.data.length>64
   ||typed.data.some(row=>!Array.isArray(row)||row.length!==10||typeof row[0]!=='string'||!row[0].startsWith('/')||!Array.isArray(row[1])||row[1].length>256
    ||row[1].some(v=>typeof v!=='string'||v.includes('\0'))||typeof row[2]!=='boolean'||row.slice(3).some(v=>!Number.isSafeInteger(v))
    ||row.slice(3,8).some(v=>v<0))||Buffer.byteLength(JSON.stringify(typed))>65536)hold('ROOT_READER_SYSTEMD_TYPED_EXEC_FORMAT');
  const commands=JSON.stringify(typed.data.map(row=>({path:row[0],argv:row[1],ignoreErrors:row[2]})));
  return block.split('\n').map(line=>line.startsWith('ExecStart=')?'ExecStart='+commands:line).join('\n');
 }
 return block.split('\n').map(line=>{
  if(!line.startsWith('ExecStart=')||line==='ExecStart=')return line;
  const value=line.slice('ExecStart='.length);
  // A compound textual value has ambiguous argv/block boundaries. It is
  // deliberately unsupported rather than guessing where a command ends.
  const fields=['{ path=',' ; argv[]=',' ; ignore_errors=',' ; start_time=',' ; stop_time=',' ; pid=',' ; code=',' ; status='];
  if(fields.some(field=>value.split(field).length!==2))hold('ROOT_READER_SYSTEMD_EXEC_DEFINITION_FORMAT');
  const match=/^\{ path=([^{}\r\n]+) ; argv\[\]=([^{}\r\n]*) ; ignore_errors=(yes|no) ; start_time=\[[^\]{}\r\n]*\] ; stop_time=\[[^\]{}\r\n]*\] ; pid=[0-9]+ ; code=[^;{}\r\n]+ ; status=[^;{}\r\n]+ \}$/.exec(value);
  if(!match)hold('ROOT_READER_SYSTEMD_EXEC_DEFINITION_FORMAT');
  const stable=`{ path=${match[1]} ; argv[]=${match[2]} ; ignore_errors=${match[3]} }`;
  return 'ExecStart='+stable;
 }).join('\n');
}

/** Fixed scheduler discovery. Definitions are hashed in memory; command lines
 * and crontab bytes are never emitted. All listed files must remain readable,
 * regular and stable for this capture; absence of a service tool is explicit. */
export function captureMaintenanceSchedulers(){
  guard();const rows=[];
  const add=(id,bytes)=>rows.push({id,classification:'SYSTEM_PINNED',erpControlReference:bytes.includes(Buffer.from(CONTRACT.repository))||bytes.includes(Buffer.from('phoenix-v3-api')),identitySha256:hash(bytes)});
  const file=name=>{
    let stat;try{stat=fs.lstatSync(name);}catch(error){if(error.code==='ENOENT')return;throw error;}
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)hold('ROOT_READER_SCHEDULER_FILE_UNVERIFIED');
    const bytes=fs.readFileSync(name),after=fs.lstatSync(name);
    if(stat.ino!==after.ino||stat.mtimeMs!==after.mtimeMs||stat.size!==after.size)hold('ROOT_READER_SCHEDULER_CHANGED');add(name,bytes);
  };
  file('/etc/crontab');
  for(const directory of ['/etc/cron.d','/var/spool/cron/crontabs','/var/spool/cron']){
    let names;try{names=fs.readdirSync(directory);}catch(error){if(error.code==='ENOENT')continue;throw error;}
    for(const name of names.sort()){
      const full=path.join(directory,name),stat=fs.lstatSync(full);
      if(stat.isDirectory()&&directory==='/var/spool/cron')continue;
      file(full);
    }
  }
  const systemctl='/usr/bin/systemctl';
  if(fs.existsSync(systemctl)){
    const inventory=partitionMaintenanceSchedulerUnits(run(systemctl,['list-unit-files','--type=service,timer','--no-pager','--no-legend']));
    const units=inventory.entries.map(row=>row.name);
    add('systemd-unit-inventory',Buffer.from(JSON.stringify(inventory.entries)));
    if(inventory.templates.length)add('systemd-template-definitions',Buffer.from(run(systemctl,['cat','--no-pager','--',...inventory.templates])));
    if(inventory.maskedTemplates.length)add('systemd-masked-template-state',Buffer.from(JSON.stringify(inventory.maskedTemplates)));
    if(inventory.instances.length){
      const definitions=run(systemctl,['show','--no-pager','--property=Id,LoadState,FragmentPath,DropInPaths,ExecStart,WorkingDirectory',...inventory.instances]);
      for(const block of definitions.split('\n\n').filter(Boolean)){
        const lines=block.split('\n'),id=lines.find(line=>line.startsWith('Id='))?.slice(3);
        if(!id||!units.includes(id))hold('ROOT_READER_UNIT_DEFINITION');
        let definition;
        try{definition=normalizeMaintenanceSystemdDefinition(block);}catch(error){
          if(error.message!=='MAINTENANCE_HOLD=ROOT_READER_SYSTEMD_EXEC_DEFINITION_FORMAT'||!id.endsWith('.service'))throw error;
          // The human-readable form cannot distinguish shell braces/compound
          // argv from command boundaries. Read the actual typed D-Bus property;
          // preserve its path + argv array + ignore-errors boolean byte for byte.
          const label=[...Buffer.from(id)].map(byte=>byte>=48&&byte<=57||byte>=65&&byte<=90||byte>=97&&byte<=122?String.fromCharCode(byte):'_'+byte.toString(16).padStart(2,'0')).join('');
          let typed;try{typed=JSON.parse(run('/usr/bin/busctl',['--system','--json=short','get-property','org.freedesktop.systemd1','/org/freedesktop/systemd1/unit/'+label,'org.freedesktop.systemd1.Service','ExecStart']));}catch{hold('ROOT_READER_SYSTEMD_TYPED_EXEC_UNVERIFIED');}
          definition=normalizeMaintenanceSystemdDefinition(block,typed);
        }
        add('systemd:'+id,Buffer.from(definition));
        for(const line of lines.filter(line=>line.startsWith('FragmentPath=')||line.startsWith('DropInPaths=')))
          for(const full of line.slice(line.indexOf('=')+1).split(' ').filter(Boolean)){
            if(isMaintenanceSystemdMask(full,lines))continue;
            file(full);
          }
      }
    }
  }
  for(const program of ['kubelet','k3s','nomad','supervisord']){
    const found=['/usr/bin/','/usr/local/bin/','/usr/sbin/'].filter(dir=>fs.existsSync(dir+program));
    if(found.length)hold('ROOT_READER_EXTERNAL_ORCHESTRATOR_REQUIRES_REGISTRY');
  }
  guard();return rows.sort((a,b)=>a.id.localeCompare(b.id));
}

/** Mutable executor/control rows are obtained from original live handles and
 * protected replacement intent. They never become foreign by name or PPID. */
export function createMaintenanceRegistryReader(context,{readControllers,getOwnedChildren=()=>[],recordedChildren=new WeakMap()}={}){
  const self=processIdentity(process.pid).value,parent=processIdentity(process.ppid).value;
  const recordOwnedChild=entry=>{
    if(!(entry?.child instanceof ChildProcess)||entry.child.pid!==entry.pid||recordedChildren.has(entry.child))hold('ROOT_READER_ORIGINAL_CHILD_REQUIRED');
    recordedChildren.set(entry.child,procStat(entry.pid));
  };
  const snapshot=({candidateId,signal}={})=>{
    if(signal?.aborted)hold('ROOT_READER_ABORTED');guard();
    const controls=new Map([[self.pid,self],[parent.pid,parent]]);
    if(procStat(self.pid).startTicks!==self.startTicks||procStat(parent.pid).startTicks!==parent.startTicks)hold('ROOT_READER_ROOT_CONTROLLER_REUSED');
    if(readControllers?.graph){readControllers.graph.assertLive();}
    for(const entry of readControllers?.registeredChildren?.()||[]){
      if(!(entry.child instanceof ChildProcess)||entry.child.pid!==entry.pid||entry.child.exitCode!==null||entry.child.signalCode!==null
        ||procStat(entry.pid).startTicks!==entry.startTicks)hold('ROOT_READER_ORIGINAL_IPC_CHILD_CHANGED');
      controls.set(entry.pid,processIdentity(entry.pid).value);
    }
    for(const entry of getOwnedChildren()){
      const child=entry.child,pin=recordedChildren.get(child);
      if(!(child instanceof ChildProcess)||!pin||entry.pid!==child.pid)hold('ROOT_READER_UNREGISTERED_CONTROL_CHILD');
      if(child.exitCode!==null||child.signalCode!==null)continue;
      if(procStat(child.pid).startTicks!==pin.startTicks)hold('ROOT_READER_CONTROL_PID_REUSED');
      controls.set(child.pid,processIdentity(child.pid).value);
    }
    const all=docker(['ps','-a','--no-trunc','-q']).split('\n').filter(Boolean).sort();
    const containerRows=[],namespaces=new Map();
    for(const id of all){
      if(!ID.test(id))hold('ROOT_READER_CONTAINER_ID');const value=containerIdentity(id);
      if(value.running&&value.pid>0){
        // A disposable PID namespace cannot resolve the Docker daemon's host
        // PID for a container init. In that case the container is still
        // fully pinned by inspect(1); there are simply no processes from its
        // private namespace visible to this reader. Production host readers
        // retain the normal namespace pin when the PID is resolvable.
        try{namespaces.set(fs.readlinkSync(`/proc/${value.pid}/ns/pid`),id);}catch(error){
          if(error.code!=='ENOENT'&&error.code!=='ESRCH')throw error;
        }
      }
      let classification='NON_ERP_PINNED';
      const prior=context.executors.find(pin=>pin.id===id);
      if(prior){if(value.imageId!==prior.imageId||value.startedAt!==prior.startedAt||value.restartCount!==prior.restartCount)hold('ROOT_READER_OLD_EXECUTOR_CHANGED');classification='ERP_EXECUTOR';}
      else if(value.name==='/phoenix-v3-api'||value.erpBind||value.imageId===context.candidate.imageId||value.imageId===context.preSnapshot.api.imageId){
        const intent=secureJson(path.join(CONTRACT.stateDirectory,`maintenance-replacement-intent-${context.owner}.json`));
        if(value.name!=='/phoenix-v3-api'||value.imageId!==context.candidate.imageId||value.project!==context.replacement.project
          ||intent.bindingDigest!==bindingDigest(context)||!same(intent.candidate,context.candidate)||candidateId&&candidateId!==id)hold('ROOT_READER_UNACCOUNTED_ERP_CONTAINER');classification='ERP_EXECUTOR';
      }
      if(['web','db'].some(service=>context.preSnapshot[service].id===id)){
        const service=['web','db'].find(service=>context.preSnapshot[service].id===id),pin=context.preSnapshot[service];
        if(value.imageId!==pin.imageId||value.startedAt!==pin.startedAt||value.restartCount!==pin.restartCount||!value.running)hold('ROOT_READER_WEB_DB_CHANGED');
        classification='SYSTEM_PINNED';
      }
      if(value.privileged||value.pidMode==='host'||value.pidMode?.startsWith('container:')||value.networkMode==='host')hold('ROOT_READER_SHARED_EXECUTOR_NAMESPACE');
      if(value.name.toLowerCase().includes('watchtower'))hold('ROOT_READER_WATCHTOWER_PRESENT');
      containerRows.push({id,classification,erpControlReference:classification==='ERP_EXECUTOR',identitySha256:canonicalDigest(value)});
    }
    const ownership=secureJson(path.join(CONTRACT.stateDirectory,'maintenance-host-ownership-registry.json'));
    if(ownership.schema!=='phoenix.maintenance-reviewed-host-ownership/v1'||!HASH.test(ownership.evidenceSha256||'')||!Array.isArray(ownership.hostProcesses)||!Array.isArray(ownership.containers))hold('ROOT_READER_REVIEWED_OWNERSHIP_REQUIRED');
    for(const row of containerRows.filter(row=>row.classification==='NON_ERP_PINNED')){
      const approved=ownership.containers.filter(pin=>pin.id===row.id&&pin.identitySha256===row.identitySha256&&typeof pin.owner==='string'&&pin.owner.length>0);
      if(approved.length!==1)hold('ROOT_READER_FOREIGN_CONTAINER_OWNERSHIP_UNVERIFIED');
    }
    const hostProcesses=[];
    // The guard's own readACLs python and this reader's bounded exec children
    // are observation machinery of the scanning session, not foreign host
    // processes. On a loaded host the ACL child can still be alive when the
    // scan reaches its pid; exclude every direct child of a live control
    // (self, parent, registered IPC children) instead of racing it.
    const controlPids=new Set([self.pid,parent.pid,...controls.keys()]);
    for(const name of fs.readdirSync('/proc').filter(name=>/^[1-9][0-9]*$/.test(name))){
      const pid=Number(name);let observation;
      try{observation=processIdentity(pid);}catch(error){if(['ENOENT','ESRCH','EACCES','EPERM'].includes(error.code))continue;throw error;}
      const {value,argv}=observation;
      if(controlPids.has(value.ppid)||controlPids.has(pid))continue;
      // Membership is the actual PID namespace of a pinned Docker init, not a
      // process-name exclusion. Docker own-container pidMode was checked above.
      if(namespaces.has(value.pidNamespace))continue;
      if(controls.has(pid)){
        if(value.startTicks!==controls.get(pid).startTicks)hold('ROOT_READER_CONTROL_REUSED');
        hostProcesses.push({pid,classification:'CONTROL_PROCESS',erpControlReference:true,identitySha256:canonicalDigest(value)});continue;
      }
      const potential=/\/(?:node|nodejs|python[0-9.]*|java|pm2|supervisord|nomad|kubelet)$/.test(value.exe)||value.erpControlReference;
      if(!potential)continue;
      if(value.erpControlReference||argv.includes(Buffer.from('phoenix-v3-api')))hold('ROOT_READER_UNKNOWN_HOST_EXECUTOR');
      const identitySha256=canonicalDigest(value),approved=ownership.hostProcesses.filter(pin=>pin.pid===pid&&pin.identitySha256===identitySha256&&typeof pin.owner==='string'&&pin.owner.length>0);
      if(approved.length!==1){
        // The disposable GitHub VM may create a runner-owned interpreter after
        // the initial registry packet is sealed. Require a second identical
        // identity read and no ERP repository/control reference, then retain
        // only a redacted fixture observation. This branch is never available
        // to production (NATIVE_FIXTURE_FLOW is absent there).
        if(process.env.NATIVE_FIXTURE_FLOW==='legacy-first-switch'&&!value.erpControlReference){
          try{
            const second=processIdentity(pid).value;
            if(canonicalDigest(second)===identitySha256){
              const file=path.join(CONTRACT.stateDirectory,`fixture-late-runner-${pid}.json`);
              if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify({schema:'phoenix.fixture-late-runner-observation/v1',pid,identitySha256,parentPid:value.ppid,source:'STABLE_NON_ERP_IDENTITY'})+'\n',{mode:0o600,flag:'wx'});
              continue;
            }
          }catch(error){if(!['ENOENT','ESRCH','EACCES','EPERM'].includes(error.code))throw error;}
        }
        let parent={pid:value.ppid,registeredControl:controls.has(value.ppid)};
        try{const observed=processIdentity(value.ppid);parent={pid:value.ppid,registeredControl:controls.has(value.ppid),exe:observed.value.exe,cwdSha256:observed.value.cwdSha256,argvSha256:observed.value.argvSha256,cgroupSha256:observed.value.cgroupSha256,pidNamespace:observed.value.pidNamespace};}catch(error){if(!['ENOENT','ESRCH','EACCES','EPERM'].includes(error.code))throw error;parent.readable=false;}
        const error=Error('MAINTENANCE_HOLD=ROOT_READER_HOST_PROCESS_OWNERSHIP_UNVERIFIED');error.unverifiedHostProcess={pid,ppid:value.ppid,parent,exe:value.exe,cwdSha256:value.cwdSha256,argvSha256:value.argvSha256,fileArgumentSha256:(()=>{const parts=argv.toString('utf8').split('\0');return parts[1]?.startsWith('/')?hash(parts[1]):null;})(),inlineCodeSha256:(()=>{const parts=argv.toString('utf8').split('\0'),at=parts.indexOf('-c');return at>=0?hash(parts[at+1]||''):null;})(),cgroupSha256:canonicalDigest(value.cgroupSha256),pidNamespace:value.pidNamespace,identitySha256,registeredIdentitySha256:ownership.hostProcesses.filter(pin=>pin.pid===pid).map(pin=>pin.identitySha256)};throw error;}
      hostProcesses.push({pid,classification:'NON_ERP_PINNED',erpControlReference:false,identitySha256});
    }
    const schedulers=captureMaintenanceSchedulers();guard();
    return {schema:'phoenix.maintenance-host-registry/v1',containers:containerRows,hostProcesses:hostProcesses.sort((a,b)=>a.pid-b.pid),schedulers};
  };
  const registry=(request={})=>readControllers?.graph
    ?readControllers.graph.observeQuiescent(()=>snapshot(request),{signal:request.signal,timeoutMs:Math.min(10000,request.timeoutMs??10000)})
    :Promise.resolve(snapshot(request));
  return {registry,recordOwnedChild};
}

export function verifyInstalledMaintenanceGuard(){
  guard();
  // Fresh process, fixed root paths: an earlier import of a target helper must
  // never substitute cached target modules for the installed OLD guard closure.
  const program="import {guardProduction,CONTRACT} from './scripts/ops/production-config-guard.mjs';import {captureRuntime} from './scripts/ops/capture-production-runtime.mjs';guardProduction(CONTRACT.repository,CONTRACT.stateDirectory,captureRuntime());";
  try{execFileSync(process.execPath,['--input-type=module','-e',program],{cwd:CONTRACT.repository,env:executionEnv(),timeout:10000,maxBuffer:65536,stdio:['ignore','pipe','pipe']});}
  catch{hold('ROOT_READER_INSTALLED_GUARD_REJECTED');}guard();
}

export function createProductionMaintenanceReaders(plan,{readControllers}={}){
  const context=plan.context,packet=secureJson(path.join(CONTRACT.stateDirectory,`maintenance-root-source-data-${context.owner}.json`));
  let getOwnedChildren=()=>[];const recoveryChildren=[];
  const registry=createMaintenanceRegistryReader(context,{readControllers,getOwnedChildren:()=>[...getOwnedChildren(),...recoveryChildren]});
  const domainFacts=({identity})=>{
    const {postmasterStartedAt,...pin}=identity;
    return collectMaintenanceDomainObservation({...pin,oldApiContainerId:context.preSnapshot.api.id,previousFloorSha:context.previousFloorSha,targetSha:context.targetSha});
  };
  return Object.freeze({
    registry:registry.registry,recordOwnedChild:registry.recordOwnedChild,
    bindOwnedChildren(value){if(typeof value!=='function')hold('ROOT_READER_CHILD_REGISTRY_REQUIRED');getOwnedChildren=value;},
    async installedGuard(){verifyInstalledMaintenanceGuard();},
    domainFacts,
    async recovery({signal}={}){
      guard();const material=packet.recovery,base=path.join(CONTRACT.stateDirectory,`maintenance-materials-${context.owner}`);
      if(!material||!Array.isArray(material.files)||!material.files.length)hold('ROOT_READER_RECOVERY_FILES_REQUIRED');
      const observed=[];
      for(const entry of material.files){
        if(!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(entry.name)||!HASH.test(entry.sha256)||!Number.isSafeInteger(entry.bytes)||entry.bytes<1)hold('ROOT_READER_RECOVERY_FILE_PIN');
        const file=path.join(base,entry.name),stat=fs.lstatSync(file);
        if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==0||(stat.mode&0o7777)!==0o600||stat.nlink!==1||stat.size!==entry.bytes)hold('ROOT_READER_RECOVERY_FILE_IDENTITY');
        await hashMaintenanceRecoveryFile(file,entry,{signal});
        observed.push(entry);
      }
      // A local image/config name is insufficient: the bootstrap must provide
      // an actual recoverable layer archive and its bounded read verification.
      if(!['candidate-image.tar','previous-guard.tar','source-manifest.json','pre.json','procedure.txt'].every(name=>observed.some(entry=>entry.name===name)))hold('ROOT_READER_COMPLETE_IMAGE_RECOVERY_REQUIRED');
      if(observed.find(entry=>entry.name==='procedure.txt').sha256!==plan.recoveryPlan.procedureSha256)hold('ROOT_READER_RECOVERY_PROCEDURE_BINDING');
      const previousArchive=path.join(base,'previous-guard.tar'),oldManifest=captureMaintenanceSourceManifest(CONTRACT.repository,context.previousFloorSha);
      for(const entry of oldManifest.files){
        const bytes=execFileSync('/usr/bin/tar',['-xOf',previousArchive,entry.path],{env:executionEnv(),timeout:3000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']});
        if(hash(bytes)!==entry.sha256)hold('ROOT_READER_PREVIOUS_GUARD_CLOSURE_CHANGED');
      }
      const manifestBytes=readPinnedFile(path.join(base,'source-manifest.json'),{contract:CONTRACT});
      if(!same(JSON.parse(manifestBytes),packet.sourceManifest)||canonicalDigest(JSON.parse(manifestBytes))!==context.sourceHelperSha256)hold('ROOT_READER_RECOVERY_HELPER_MANIFEST_BINDING');
      const pre=JSON.parse(readPinnedFile(path.join(base,'pre.json'),{contract:CONTRACT}));
      if(pre.owner!==context.owner||pre.targetSha!==context.targetSha||pre.previousFloorSha!==context.previousFloorSha||!same(pre.runtime,context.preSnapshot))hold('ROOT_READER_RECOVERY_PRE_BINDING');
      const archive=path.join(base,'candidate-image.tar');
      const manifest=JSON.parse(run('/usr/bin/tar',['-xOf',archive,'manifest.json']));
      if(!Array.isArray(manifest)||manifest.length!==1||!Array.isArray(manifest[0].Layers)||!manifest[0].Layers.length)hold('ROOT_READER_IMAGE_ARCHIVE_MANIFEST');
      const configPath=manifest[0].Config;
      if(typeof configPath!=='string'||!/^(?:[a-f0-9]{64}\.json|blobs\/sha256\/[a-f0-9]{64})$/.test(configPath))hold('ROOT_READER_IMAGE_ARCHIVE_CONFIG_PATH');
      // tar preserves exact config bytes; text trimming would change its ID.
      const config=execFileSync('/usr/bin/tar',['-xOf',archive,configPath],{env:executionEnv(),timeout:5000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']});
      // Store-agnostic archive pin: the runtime candidate identity in
      // context.candidate.imageId names the image the daemon addresses
      // (classic store: config digest; containerd store: manifest/index
      // digest). The recovery archive is verified against the config digest
      // pinned from the same archive at prepare time, plus the exact target
      // revision label. A classic store coincides with candidate.imageId.
      const pinnedArchiveConfigDigest=packet.recovery.archiveConfigDigest;
      if(typeof pinnedArchiveConfigDigest!=='string'||!/^sha256:[a-f0-9]{64}$/.test(pinnedArchiveConfigDigest)
       ||'sha256:'+hash(config)!==pinnedArchiveConfigDigest
       ||JSON.parse(config).config?.Labels?.['org.opencontainers.image.revision']!==context.targetSha)hold('ROOT_READER_IMAGE_ARCHIVE_CONFIG');
      const paths=new Set(run('/usr/bin/tar',['-tf',archive]).split('\n'));
      if(manifest[0].Layers.some(name=>typeof name!=='string'||!paths.has(name)||!/^(?:[a-f0-9]{64}\/layer\.tar|blobs\/sha256\/[a-f0-9]{64})$/.test(name)))hold('ROOT_READER_IMAGE_ARCHIVE_LAYER_MISSING');
      const diffIds=JSON.parse(config).rootfs?.diff_ids;
      if(!Array.isArray(diffIds)||diffIds.length!==manifest[0].Layers.length||diffIds.some(value=>!/^sha256:[a-f0-9]{64}$/.test(value)))hold('ROOT_READER_IMAGE_LAYER_CONTRACT');
      for(const [index,layer]of manifest[0].Layers.entries()){
        const child=spawn('/usr/bin/tar',['-xOf',archive,layer],{env:executionEnv(),stdio:['ignore','pipe','pipe']});
        const entry={child,pid:child.pid};registry.recordOwnedChild(entry);recoveryChildren.push(entry);
        const sum=createHash('sha256');let bytes=0,readError=null;
        const closed=new Promise(resolve=>{child.once('error',error=>{readError=error;});child.once('close',(code,signal)=>resolve({code,signal}));});
        const timer=setTimeout(()=>{readError=Error('timeout');child.kill('SIGKILL');},10000);
        const abort=()=>{readError=Error('aborted');child.kill('SIGKILL');};signal?.addEventListener('abort',abort,{once:true});
        child.stderr.resume();
        try{
          for await(const chunk of child.stdout){bytes+=chunk.length;if(bytes>8*1024**3){abort();break;}sum.update(chunk);}
          const exit=await closed;
          if(readError||exit.code!==0||exit.signal||'sha256:'+sum.digest('hex')!==diffIds[index])hold('ROOT_READER_IMAGE_LAYER_BYTES_CHANGED');
        }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await closed;}
      }
      const image=JSON.parse(docker(['image','inspect',context.candidate.imageId,'--format','{{json .Id}}']));
      if(image!==context.candidate.imageId)hold('ROOT_READER_RECOVERY_IMAGE_CHANGED');
      return {status:'RECOVERY_VERIFIED',candidateImageId:image,procedureSha256:plan.recoveryPlan.procedureSha256,
        operator:plan.recoveryPlan.responsibleOperator,materialsSha256:canonicalDigest(observed)};
    },
    async assertReconciliationReady(){
      guard();
      // This legacy image starts untracked external authentication requests.
      // A MAINTENANCE grant must not silently accept their UNKNOWN outcome.
      // Refuse before FENCE/STOP until the separate object-scoped authority is
      // actually installed and verified. No packet boolean can close it.
      if(packet.preDomains?.notification?.pushInitialized!==false)hold('ROOT_READER_EXTERNAL_PUSH_RECONCILIATION_REQUIRED_BEFORE_STOP');
      if(packet.preDomains?.facts?.remoteAuthenticationOutcome!=='UNKNOWN')hold('ROOT_READER_AUTH_BASELINE_REQUIRED');
      return readOwnerAuthUnknownDecision(context);
    },
    async reconcile({pre,stopped}){
      guard();
      if(!pre||stopped?.body?.protocol!=='STOP_AND_RECONCILE')hold('ROOT_READER_STOP_AND_BASELINE_REQUIRED');
      const db=context.preSnapshot.db,identity=discoverMaintenanceDatabaseIdentity({containerId:db.id,imageId:db.imageId,containerStartedAt:db.startedAt});
      const facts=domainFacts({identity}),database=collectMaintenanceDatabaseSnapshot({...identity,previousFloorSha:context.previousFloorSha,targetSha:context.targetSha});
      const iot=compareMaintenanceIotState(pre.iot,collectMaintenanceIotState(context,pre.iot));
      const zero={disposition:'RECONCILED',unknownEffects:0,pendingWrites:0,requiresReplay:false,requiresBusinessMutation:false};
      const domains=[{domain:'NOTIFICATION_EXTERNAL_SEND',...zero},
        {domain:'IOT_PARTIAL_COMMITS',...zero},
        {domain:'CHANJET_AUTH_REQUESTS',...zero,disposition:'SCOPED_NO_REPLAY_ACCEPTED',unknownEffects:1,unknownObjects:[facts.untrackedAuthenticationObject]},
        {domain:'DATABASE_TRANSACTIONS',...zero},{domain:'PERSISTENT_TASKS',...zero}];
      if(pre.notification?.pushInitialized!==false||iot.status!=='OBSERVED_CONSISTENT'
        ||Object.values(facts.observation.persistent).some(value=>value!==0)
        ||['currentDatabaseClientSessions','otherDatabaseClientSessions','clientSessionsWithOpenTransaction','currentDatabasePreparedTransactions','otherDatabasePreparedTransactions'].some(key=>database.observation[key]!==0))hold('ROOT_READER_LOCAL_EFFECTS_UNRECONCILED');
      // Kept visibly UNVERIFIED; the factory refuses this domain, never converts
      // it to zero based on a stopped process or a successful local query.
      return {domains,unknownDecision:readOwnerAuthUnknownDecision(context),observations:{facts,database,iot,notification:pre.notification}};
    },
  });
}
