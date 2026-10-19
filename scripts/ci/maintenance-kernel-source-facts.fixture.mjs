/** Read-only exclusive-VM kernel facts. Installed package metadata is not proof
 * of running binary/source equivalence and never grants a barrier capability. */
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const fail=()=>{throw Error('KERNEL_SOURCE_FACTS_HOLD=INVALID_OR_UNAVAILABLE');};
const exact=(value,fields)=>value&&Object.getPrototypeOf(value)===Object.prototype&&JSON.stringify(Object.keys(value).sort())===JSON.stringify([...fields].sort());
const single=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max&&/^[\x20-\x7e]+$/.test(value);
const digest=value=>createHash('sha256').update(value).digest('hex');
export function validateKernelSourceFacts(value){
 if(!exact(value,['release','version','architecture','bootId','networkNamespace','versionSignature','installedImagePackage','livepatch','tainted']))fail();
 if(!/^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/.test(value.release)||!single(value.version,512)||!['x86_64','aarch64'].includes(value.architecture)
  ||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value.bootId)||!/^net:\[[1-9][0-9]{0,19}\]$/.test(value.networkNamespace)
  ||!Number.isSafeInteger(value.tainted)||value.tainted<0)fail();
 if(!exact(value.versionSignature,['state','value'])||!['PRESENT','UNAVAILABLE'].includes(value.versionSignature.state)
  ||(value.versionSignature.state==='PRESENT'?!single(value.versionSignature.value,512):value.versionSignature.value!==null))fail();
 const pkg=value.installedImagePackage;
 if(!exact(pkg,['state','name','version','sourceName','sourceVersion'])||!['INSTALLED_METADATA_ONLY','QUERY_UNAVAILABLE'].includes(pkg.state)||pkg.name!=='linux-image-'+value.release)fail();
 if(pkg.state==='QUERY_UNAVAILABLE'){
  if([pkg.version,pkg.sourceName,pkg.sourceVersion].some(field=>field!==null))fail();
 }else if(![pkg.version,pkg.sourceVersion].every(field=>typeof field==='string'&&/^[A-Za-z0-9][A-Za-z0-9.+:~_-]{0,255}$/.test(field))||!/^[a-z0-9][a-z0-9+.-]{0,127}$/.test(pkg.sourceName))fail();
 if(!exact(value.livepatch,['state','entries'])||!['DIRECTORY_PRESENT','DIRECTORY_UNAVAILABLE'].includes(value.livepatch.state)||!Array.isArray(value.livepatch.entries)||value.livepatch.entries.length>32
  ||(value.livepatch.state==='DIRECTORY_UNAVAILABLE'&&value.livepatch.entries.length)||value.livepatch.entries.some(entry=>!exact(entry,['name','enabled'])||!single(entry.name,128)||!/^[A-Za-z0-9_.+-]+$/.test(entry.name)||![true,false,null].includes(entry.enabled))
  ||new Set(value.livepatch.entries.map(entry=>entry.name)).size!==value.livepatch.entries.length)fail();
 const facts=structuredClone(value);
 return Object.freeze({schema:'phoenix.owned-kernel-source-facts/v1',fixtureOnly:true,productionAuthority:false,barrierCapability:false,continuousIngressProof:false,
  sourceBinding:'UNVERIFIED',runningBinaryToPackageBinding:'UNVERIFIED',facts,factsSha256:digest(JSON.stringify(facts))});
}
export function collectOwnedKernelSourceFacts(){
 if(process.getuid?.()!==0||process.env.RUNNER_ENVIRONMENT!=='github-hosted'||fs.existsSync('/.dockerenv'))fail();
 const startedAt=new Date().toISOString(),started=performance.now();
 const run=(command,args)=>execFileSync(command,args,{env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C'},encoding:'utf8',timeout:3000,maxBuffer:4096,stdio:['ignore','pipe','pipe']}).trim();
 const release=run('/usr/bin/uname',['-r']),version=run('/usr/bin/uname',['-v']),architecture=run('/usr/bin/uname',['-m']);
 if(!/^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/.test(release))fail();
 const optional=file=>{try{return {state:'PRESENT',value:fs.readFileSync(file,'utf8').trim()};}catch(error){if(error.code==='ENOENT')return {state:'UNAVAILABLE',value:null};fail();}};
 const name='linux-image-'+release;let installedImagePackage;
 try{
  const fields=run('/usr/bin/dpkg-query',['--show','--showformat=${Package}\t${Version}\t${source:Package}\t${source:Version}\t${Status}',name]).split('\t');
  if(fields.length!==5||fields[0]!==name||fields[4]!=='install ok installed')fail();
  installedImagePackage={state:'INSTALLED_METADATA_ONLY',name,version:fields[1],sourceName:fields[2],sourceVersion:fields[3]};
 }catch(error){if(error.status!==1)fail();installedImagePackage={state:'QUERY_UNAVAILABLE',name,version:null,sourceName:null,sourceVersion:null};}
 let livepatch;
 try{
  const names=fs.readdirSync('/sys/kernel/livepatch').sort();if(names.length>32||names.some(value=>!/^[A-Za-z0-9_.+-]{1,128}$/.test(value)))fail();
  livepatch={state:'DIRECTORY_PRESENT',entries:names.map(name=>{const raw=optional('/sys/kernel/livepatch/'+name+'/enabled');if(raw.state==='PRESENT'&&!['0','1'].includes(raw.value))fail();return {name,enabled:raw.state==='UNAVAILABLE'?null:raw.value==='1'};})};
 }catch(error){if(error.code!=='ENOENT')fail();livepatch={state:'DIRECTORY_UNAVAILABLE',entries:[]};}
 const before=fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim(),networkNamespace=fs.readlinkSync('/proc/self/ns/net');
 const value=validateKernelSourceFacts({release,version,architecture,bootId:before,networkNamespace,versionSignature:optional('/proc/version_signature'),installedImagePackage,livepatch,tainted:Number(fs.readFileSync('/proc/sys/kernel/tainted','utf8').trim())});
 if(fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim()!==before||fs.readlinkSync('/proc/self/ns/net')!==networkNamespace||run('/usr/bin/uname',['-r'])!==release)fail();
 const finishedAt=new Date().toISOString();if(Date.parse(finishedAt)<Date.parse(startedAt)||performance.now()-started>30000)fail();
 return Object.freeze({...value,collection:{startedAt,finishedAt,snapshotConsistency:'NOT_PROVED_SEQUENTIAL_READS'}});
}

