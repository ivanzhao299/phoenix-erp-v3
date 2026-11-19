/** Read-only recognition of the schema-first command before it switched to
 * plain docker run. A retained one-off is evidence, never a current actor. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {CONTRACT} from './production-config-guard.mjs';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {ancestors,parseMountInfo,readACLs,readPinnedFile} from './production-trusted-paths.mjs';
import {readModernSchemaSourceGit} from './production-modern-schema-inventory.mjs';

export const HISTORICAL_COMPOSE_CLASSIFICATION='RETAINED_HISTORICAL_COMPOSE_SCHEMA_PAIR';
const ARCHIVE='/opt/phoenix/backups/migration-evidence';
const UPLOADS='/data/phoenix-erp-data/uploads';
const CONTROL='/var/lib/phoenix-background-control';
const NAME=/^\/phoenix-migrate-schema-first-([a-z0-9]{8})(-show)?$/;
const EVIDENCE_NAME=/^schema-first\.([A-Za-z0-9]{8})$/;
const ID=/^[a-f0-9]{64}$/;
const SHA=/^[a-f0-9]{40}$/;
const IMAGE=/^sha256:[a-f0-9]{64}$/;
const SOURCES=new Set(['https://github.com/ivanzhao299/phoenix-erp','https://github.com/ivanzhao299/phoenix-erp-v3']);
const FILES={'candidate-image.txt':72,'run.log':32*1024**2,'show.log':8*1024**2,'verified-image.txt':72};
const fail=()=>{throw Error('MODERN_SCHEMA_HISTORICAL_COMPOSE_HOLD');};
const empty=value=>value===null||(Array.isArray(value)?value.length===0:same(value,{}));
function timestamp(value){
 const parsed=/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?Z$/.exec(value??'');
 const millis=parsed&&Date.parse(parsed[1]+'Z');
 if(!Number.isSafeInteger(millis)||millis<=0)fail();
 return BigInt(millis)*1_000_000n+BigInt((parsed[2]??'').padEnd(9,'0'));
}
const argv=role=>['-d','dist/database/data-source.js','migration:'+role,...(role==='run'?['--transaction','all']:[])];
const mount=(source,destination,RW)=>({Type:'bind',Source:source,Destination:destination,RW});
const expectedMounts=[mount(UPLOADS,'/app/uploads',true),mount(CONTROL,'/run/phoenix-background-control',false)];
function hasBind(mounts,expected){
 return mounts.filter(actual=>Object.entries(expected).every(([key,value])=>actual?.[key]===value)).length===1;
}

export function isHistoricalComposeSchemaCandidate(container){
 const labels=container.labels;
 return NAME.test(container.name)&&(labels?.['com.docker.compose.oneoff']!==undefined||
  labels?.['com.docker.compose.project']==='phoenix-erp'&&labels?.['com.docker.compose.service']==='api');
}
function groupPairs(values){
 const groups=new Map();
 for(const value of values){
  const named=NAME.exec(value.name);
  if(!named||!ID.test(value.id)||!IMAGE.test(value.imageId))fail();
  const key=named[1],role=named[2]?'show':'run',pair=groups.get(key)??{};
  if(pair[role])fail();
  pair[role]=value;groups.set(key,pair);
 }
 for(const pair of groups.values())if(!pair.run||!pair.show||pair.run.id===pair.show.id||pair.run.imageId!==pair.show.imageId)fail();
 return groups;
}
function assertStopped(container,role,{id,name}){
 const {state,labels,networks}=container;
 if(!ID.test(id)||typeof name!=='string'||!name||!['', 'private'].includes(container.pidMode)||
  labels?.['com.docker.compose.project']!=='phoenix-erp'||labels?.['com.docker.compose.service']!=='api'||
  labels?.['com.docker.compose.oneoff']!=='True'||container.privileged!==false||
  container.networkMode!==name||!empty(container.ports)||container.user!=='phoenix'||
  container.restarts!==0||container.restartPolicy?.Name!=='no'||container.restartPolicy.MaximumRetryCount!==0||
  state.Status!=='exited'||state.Running!==false||state.Restarting!==false||state.Paused!==false||state.Pid!==0||
  state.OOMKilled!==false||state.Dead!==false||state.ExitCode!==0||!same(container.entrypoint,['./node_modules/.bin/typeorm'])||
  !same(container.cmd,argv(role))||container.mounts.length!==2||!expectedMounts.every(expected=>hasBind(container.mounts,expected)))fail();
 const endpoints=Object.entries(networks??{});
 if(endpoints.length!==1||endpoints.some(([key,endpoint])=>key!==name||
  endpoint?.NetworkID!==id||['EndpointID','IPAddress','GlobalIPv6Address','MacAddress','Gateway','IPv6Gateway']
   .some(field=>endpoint?.[field]!=='')))fail();
}
const hostKeys=['IpcMode','UTSMode','UsernsMode','CgroupnsMode','PublishAllPorts','AutoRemove','CapAdd',
 'Devices','DeviceRequests','DeviceCgroupRules','VolumesFrom','Tmpfs','Binds','Mounts'];
const nativeFormat=['{{json .Id}}','{{json .Image}}','{{json .State}}','{{json .Created}}','{{json .Config.Image}}',
 '{{json .Path}}','{{json .Args}}','{{json (index .NetworkSettings "Ports")}}',
 ...hostKeys.map(key=>`{{json (index .HostConfig "${key}")}}`)].join('\t');
function nativePins(values,docker){
 const ids=values.map(value=>value.id);
 const observed=docker(['inspect','--type','container','--format',nativeFormat,...ids]).split('\n');
 if(observed.length!==values.length)fail();
 return new Map(observed.map((line,index)=>{
  const row=line.split('\t').map(JSON.parse),value=values[index];
  const [id,image,state,created,requested,binary,args,ports,ipc,uts,userns,cgroupns,publish,autoRemove,
   capAdd,devices,requests,rules,volumesFrom,tmpfs]=row;
  if(row.length!==8+hostKeys.length||id!==value.id||image!==value.imageId||!same(state,value.state)||requested!==image||
   binary!=='./node_modules/.bin/typeorm'||!same(args,value.cmd)||
   !Object.values(ports??{}).every(empty)||!['','private'].includes(ipc)||uts!==''||userns!==''||
   !['','private'].includes(cgroupns)||publish!==false||autoRemove!==false||
   ![capAdd,devices,requests,rules,volumesFrom,tmpfs].every(empty))fail();
  const createdAt=timestamp(created),startedAt=timestamp(state.StartedAt),finishedAt=timestamp(state.FinishedAt);
  if(!(createdAt<=startedAt&&startedAt<=finishedAt))fail();
  return [id,{sha256:canonicalDigest(row),createdAt,finishedAt}];
 }));
}

const directoryIdentity=stat=>[stat.dev,stat.ino,stat.uid,stat.mode].map(String);
const fileIdentity=stat=>[stat.dev,stat.ino,stat.uid,stat.mode,stat.nlink,stat.size,stat.mtimeNs,stat.ctimeNs].map(String);
export function readHistoricalComposeEvidence(keys,{content=false,archive=ARCHIVE,io=fs,acl=readACLs,
 readMounts=()=>parseMountInfo(fs.readFileSync('/proc/self/mountinfo','utf8'))}={}){
 const inspectDirectory=(name,privateDirectory=false)=>{
  const stat=io.lstatSync(name,{bigint:true});
  if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==0n||io.realpathSync(name)!==name||
   (stat.mode&0o022n)!==0n||privateDirectory&&(stat.mode&0o7777n)!==0o700n)fail();
  return directoryIdentity(stat);
 };
 const parents=ancestors(archive),parentPins=parents.map(name=>inspectDirectory(name));
 const names=io.readdirSync(archive),selections=new Map();
 for(const key of keys){
  const matches=names.filter(name=>EVIDENCE_NAME.exec(name)?.[1].toLowerCase()===key);
  if(matches.length!==1)fail();
  selections.set(key,path.join(archive,matches[0]));
 }
 const allDirectories=[...parents,...selections.values()];
 const evidencePaths=new Set([...allDirectories,...[...selections.values()].flatMap(directory=>
  Object.keys(FILES).map(name=>path.join(directory,name)))]);
 const boundary=readMounts().filter(observed=>evidencePaths.has(observed.target));
 if(boundary.length!==1||!CONTRACT.controlMounts.some(allowed=>Object.entries(allowed)
  .every(([key,value])=>boundary[0][key]===value)))fail();
 const acls=acl(allDirectories);
 if(acls.length!==allDirectories.length||acls.some(row=>row.length!==2||row.some(value=>value!==false)))fail();
 return new Map([...selections].map(([key,directory])=>{
  const directoryPin=inspectDirectory(directory,true),files={},bytes={};
  for(const [name,limit] of Object.entries(FILES)){
   const file=path.join(directory,name),stat=io.lstatSync(file,{bigint:true});
   if(!stat.isFile()||stat.uid!==0n||(stat.mode&0o7777n)!==0o600n||stat.nlink!==1n||stat.size<1n||stat.size>BigInt(limit))fail();
   files[name]={pin:fileIdentity(stat),mtimeNs:String(stat.mtimeNs)};
   if(content){
    bytes[name]=readPinnedFile(file,{trustedParent:false},{fs:io});
    if(BigInt(bytes[name].length)!==stat.size||!same(files[name].pin,fileIdentity(io.lstatSync(file,{bigint:true}))))fail();
   }
  }
  const metadataSha256=canonicalDigest({directory,directoryPin,parentPins,files,boundary});
  return [key,{metadataSha256,files,bytes}];
 }));
}
function verifyCompletedEvidence(observation,pair,native){
 const {files,bytes}=observation,run=native.get(pair.run.id),show=native.get(pair.show.id);
 const image=Buffer.from(pair.run.imageId+'\n');
 const [candidateTime,runTime,showTime,verifiedTime]=Object.keys(FILES).map(name=>BigInt(files[name].mtimeNs));
 if(!image.equals(bytes['candidate-image.txt'])||!image.equals(bytes['verified-image.txt'])||
  !(candidateTime<=run.createdAt&&run.finishedAt<=show.createdAt&&show.finishedAt<=verifiedTime)||
  !(candidateTime<=runTime&&runTime<=show.createdAt&&run.finishedAt<=showTime&&showTime<=verifiedTime)||
  bytes['show.log'].includes('[ ]')||!/^\s*\[X\]\s+\d+\s+\S+/m.test(bytes['show.log'].toString('utf8')))fail();
 return canonicalDigest(Object.fromEntries(Object.entries(bytes).map(([name,value])=>
  [name,createHash('sha256').update(value).digest('hex')])));
}
export function collectHistoricalComposeSchemaArtifacts(values,{api,network,apiRevision,docker},
 {readEvidence=readHistoricalComposeEvidence,sourceGit=readModernSchemaSourceGit}={}){
 if(!values.length)return [];
 if(!SHA.test(apiRevision)||!expectedMounts.every(expected=>hasBind(api.mounts,expected))||
  ![network.Id,network.Name].includes(api.networkMode)||values.some(value=>Object.hasOwn(network.Containers??{},value.id)))fail();
 const scope={id:network.Id,name:network.Name},pairs=groupPairs(values);
 const native=nativePins(values,docker),byImage=new Map();
 for(const [key,pair] of pairs){
  for(const [role,value] of Object.entries(pair))assertStopped(value,role,scope);
  const image=pair.run.imageId;
  if(!byImage.has(image)){
   const [id,revision,source]=docker(['image','inspect',image,'--format',
    '{{json .Id}}\t{{json (index .Config.Labels "org.opencontainers.image.revision")}}\t{{json (index .Config.Labels "org.opencontainers.image.source")}}']).split('\t').map(JSON.parse);
   if(id!==image||!SHA.test(revision)||!SOURCES.has(source))fail();
   sourceGit(CONTRACT.repository,['merge-base','--is-ancestor',revision,apiRevision]);
   byImage.set(image,revision);
  }
 }
 const keys=[...pairs.keys()],evidence=readEvidence(keys,{content:true}),after=readEvidence(keys),result=[];
 for(const [key,pair] of pairs){
  const record=evidence.get(key);
  if(!record||record.metadataSha256!==after.get(key)?.metadataSha256)fail();
  const evidenceSha256=verifyCompletedEvidence(record,pair,native);
  for(const [role,value] of Object.entries(pair)){
   result.push({id:value.id,classification:HISTORICAL_COMPOSE_CLASSIFICATION,key,role,scope,revision:byImage.get(value.imageId),
    identitySha256:canonicalDigest(value),nativeSha256:native.get(value.id).sha256,
    evidenceMetadataSha256:record.metadataSha256,evidenceSha256});
  }
 }
 return result;
}
export function verifyHistoricalComposeSchemaArtifacts(values,artifacts,{networkId,docker},
 {readEvidence=readHistoricalComposeEvidence}={}){
 const selected=artifacts.filter(pin=>pin.classification===HISTORICAL_COMPOSE_CLASSIFICATION);
 if(!selected.length)return new Set();
 const ids=new Set(selected.map(pin=>pin.id));
 const candidates=values.filter(value=>ids.has(value.id)),pairs=groupPairs(candidates);
 if(ids.size!==selected.length||candidates.length!==ids.size)fail();
 const native=nativePins(candidates,docker),evidence=readEvidence([...pairs.keys()]);
 for(const [key,pair] of pairs){
  for(const [role,value] of Object.entries(pair)){
   const pin=selected.find(item=>item.id===value.id);
   if(pin.key!==key||pin.role!==role||pin.scope?.id!==networkId||pin.identitySha256!==canonicalDigest(value)||
    pin.nativeSha256!==native.get(value.id).sha256||pin.evidenceMetadataSha256!==evidence.get(key)?.metadataSha256)fail();
   assertStopped(value,role,pin.scope);
  }
 }
 return ids;
}
