/** CI-only post-failure host metadata. Never a production receipt or acceptance rule. */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const REDACTED='REDACTED_INVALID_METADATA';
const REPO='ivanzhao299/phoenix-erp-v3';
const MAX_ROWS=32, MAX_BYTES=32768, MAX_UNITS=1024;
const unitPattern=/^[A-Za-z0-9][A-Za-z0-9_.@:-]{0,243}\.(service|timer)$/;
const pin=stat=>JSON.stringify([stat.dev,stat.ino,stat.mode,stat.nlink,stat.size,stat.mtimeMs,stat.ctimeMs]);
export function safeObservationUnit(value){return typeof value==='string'&&unitPattern.test(value)?value:REDACTED;}
export function safeObservationPath(value){
 if(typeof value!=='string'||value.length>512||!value.startsWith('/')||/[^A-Za-z0-9/_.@+:-]/.test(value))return REDACTED;
 const normalized=path.posix.normalize(value);
 const publicRoot=['/usr','/lib','/etc','/run','/opt','/snap','/var','/home','/data','/dev'].some(root=>normalized===root||normalized.startsWith(root+'/'));
 return publicRoot&&normalized.length<=512&&!/(?:token|secret|credential|private[-_]?key|\.env)(?:[./_-]|$)/i.test(normalized)?normalized:REDACTED;
}
export function requireSchedulerObservationContext(env,{uid,container,intent,intentStat,head}){
 if(uid!==0||container||env.CI!=='true'||env.GITHUB_ACTIONS!=='true'||env.RUNNER_ENVIRONMENT!=='github-hosted'
  ||env.GITHUB_REPOSITORY!==REPO||env.GITHUB_JOB!=='full-first-switch'||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'')
  ||!/^\d+$/.test(env.GITHUB_RUN_ID||'')||!['16','18'].includes(env.NATIVE_FIXTURE_MAJOR)
  ||!/^\d+$/.test(env.NATIVE_SCHEDULER_FAILURE_EXIT||'')||Number(env.NATIVE_SCHEDULER_FAILURE_EXIT)<1||Number(env.NATIVE_SCHEDULER_FAILURE_EXIT)>255
  ||!path.isAbsolute(env.RUNNER_TEMP||'')||env.NATIVE_FIXTURE_OUTPUT!==path.join(env.RUNNER_TEMP,`phoenix-full-first-switch-${env.NATIVE_FIXTURE_MAJOR}`))throw Error('CI_OBSERVATION_CONTEXT_REQUIRED');
 if(intent===undefined)return;
 if(!intentStat?.isFile()||intentStat.isSymbolicLink()||intentStat.uid!==0||(intentStat.mode&0o7777)!==0o600||intentStat.nlink!==1||intentStat.size>4096
  ||intent.fixtureOnly!==true||intent.productionReceipt!==false||intent.sourceSha!==env.GITHUB_SHA||head!==env.GITHUB_SHA
  ||intent.major!==Number(env.NATIVE_FIXTURE_MAJOR)||intent.disposition!=='CREATE_ONLY_IN_EXCLUSIVE_DISPOSABLE_VM')throw Error('CI_OBSERVATION_OWNED_INTENT_REQUIRED');
}
export function parseObservationUnits(text){
 const rows=text.split('\n').map(line=>line.trim().split(/\s+/)[0]).filter(Boolean);
 if(rows.length>MAX_UNITS)throw Error('CI_OBSERVATION_UNIT_LIMIT');
 return [...new Set(rows.filter(name=>safeObservationUnit(name)!==REDACTED&&!/@\.(service|timer)$/.test(name)))].sort();
}
export function parseObservationDefinitions(text){
 if(Buffer.byteLength(text)>1024*1024)throw Error('CI_OBSERVATION_DEFINITION_LIMIT');
 return text.split('\n\n').filter(Boolean).map(block=>{
  const entries=block.split('\n').filter(Boolean).map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)];});
  if(entries.length!==3||new Set(entries.map(([key])=>key)).size!==3||entries.some(([key])=>!['Id','LoadState','FragmentPath'].includes(key)))return null;
  return Object.fromEntries(entries);
 }).filter(Boolean);
}
export function safeObservationPackages(text,target){
 const packages=[];
 for(const line of text.trim().split('\n')){
  const match=/^([a-z0-9][a-z0-9+.-]{0,79}(?::[a-z0-9-]{1,20})?): (.+)$/.exec(line);
  if(!match||match[2]!==target)return ['UNVERIFIED'];
  packages.push(match[1]);
 }
 return packages.length&&packages.length<=4?[...new Set(packages)].sort():['UNVERIFIED'];
}
export function collectSchedulerLinkObservation(ops){
 const result={schema:'phoenix.ci-scheduler-link-observation/v1',fixtureOnly:true,productionReceipt:false,observedAt:ops.now(),
  observationOnly:true,failedObjectIdentified:false,rows:[],truncated:false,rejectedMetadataCount:0};
 const units=parseObservationUnits(ops.list());
 for(let at=0;at<units.length;at+=64){
  for(const item of parseObservationDefinitions(ops.show(units.slice(at,at+64)))){
   if(item.LoadState!=='loaded'||!units.includes(item.Id))continue;
   const unit=safeObservationUnit(item.Id),fragment=safeObservationPath(item.FragmentPath);
   if(unit===REDACTED||fragment===REDACTED){result.rejectedMetadataCount++;continue;}
   let before;try{before=ops.stat(fragment);}catch{continue;}
   if(!before.isSymbolicLink())continue;
   const row={unit,fragment,directTarget:REDACTED,targetType:'UNREADABLE',stable:'UNVERIFIED',packages:['UNVERIFIED']};
   try{
    const raw=ops.readlink(fragment),target=safeObservationPath(path.posix.resolve(path.posix.dirname(fragment),raw));
    row.directTarget=target;
    if(target!==REDACTED){
     let targetBefore;try{targetBefore=ops.stat(target);}catch(error){row.targetType=error?.code==='ENOENT'?'MISSING':'UNREADABLE';}
     if(targetBefore){
      row.targetType=targetBefore.isSymbolicLink()?'SYMLINK':targetBefore.isFile()?'REGULAR':targetBefore.isDirectory()?'DIRECTORY':'OTHER';
      row.stable=raw===ops.readlink(fragment)&&pin(before)===pin(ops.stat(fragment))&&pin(targetBefore)===pin(ops.stat(target))?'STABLE':'CHANGED';
      row.packages=ops.packages(target);
     }
    }
   }catch{/* Never emit raw filesystem or command errors. */}
   // Multiple candidates are observations; none is identified as the original failed object.
   if(result.rows.length>=MAX_ROWS||Buffer.byteLength(JSON.stringify({...result,rows:[...result.rows,row]}))>MAX_BYTES){result.truncated=true;return result;}
   result.rows.push(row);
  }
 }
 return result;
}
function main(){
 const env=process.env,context={uid:process.geteuid(),container:fs.existsSync('/.dockerenv')};
 requireSchedulerObservationContext(env,context);
 const intentFile=path.join(env.NATIVE_FIXTURE_OUTPUT,'host-intent.json'),intentStat=fs.lstatSync(intentFile);
 if(!intentStat.isFile()||intentStat.isSymbolicLink()||intentStat.uid!==0||(intentStat.mode&0o7777)!==0o600||intentStat.nlink!==1||intentStat.size>4096)throw Error('CI_OBSERVATION_OWNED_INTENT_REQUIRED');
 const run=(program,args,timeout=5000)=>execFileSync(program,args,{encoding:'utf8',timeout,maxBuffer:1024*1024,stdio:['ignore','pipe','ignore'],env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',SYSTEMD_COLORS:'0'}}).trim();
 const head=run('/usr/bin/git',['-c',`safe.directory=${env.NATIVE_FIXTURE_SOURCE}`,'-C',env.NATIVE_FIXTURE_SOURCE,'rev-parse','HEAD']);
 requireSchedulerObservationContext(env,{...context,intentStat,intent:JSON.parse(fs.readFileSync(intentFile,'utf8')),head});
 const deadline=Date.now()+20000,systemctl=args=>{if(Date.now()>deadline)throw Error('CI_OBSERVATION_DEADLINE');return run('/usr/bin/systemctl',args);};
 return collectSchedulerLinkObservation({now:()=>new Date().toISOString(),list:()=>systemctl(['list-unit-files','--type=service,timer','--no-pager','--no-legend']),
  show:units=>systemctl(['show','--no-pager','--property=Id,LoadState,FragmentPath','--',...units]),stat:fs.lstatSync,readlink:fs.readlinkSync,
  packages:target=>{try{return safeObservationPackages(run('/usr/bin/dpkg-query',['-S','--',target],2000),target);}catch(error){return [error?.status===1?'NOT_REGISTERED':'UNVERIFIED'];}}});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{process.stdout.write(JSON.stringify(main())+'\n');}
 catch{process.stdout.write(JSON.stringify({schema:'phoenix.ci-scheduler-link-observation/v1',fixtureOnly:true,productionReceipt:false,status:'UNVERIFIED'})+'\n');process.exitCode=1;}
}
