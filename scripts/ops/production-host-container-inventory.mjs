/** Read-only production state projection. It never admits a release. */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {CONTRACT} from './production-config-guard.mjs';
import {executionEnv} from './capture-production-runtime.mjs';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {assertRootIdentity,inspectTrustedDirectory,readPinnedFile} from './production-trusted-paths.mjs';

const CID=/^[a-f0-9]{64}$/;
const SHA=/^[a-f0-9]{40}$/;
const IMAGE=/^sha256:[a-f0-9]{64}$/;
const REGISTRY='maintenance-host-ownership-registry.json';
const CORE=['api','web','db'];
const PROJECT='phoenix-erp';
const PROJECT_REPOSITORIES=new Set([
  'https://github.com/ivanzhao299/phoenix-erp','https://github.com/ivanzhao299/phoenix-erp-v3',
]);
const STATES=new Set(['created','running','paused','restarting','removing','exited','dead']);
const MAX_CONTAINERS=128;
const fail=code=>{throw Error('HOST_CONTAINER_INVENTORY='+code);};
const match=(pattern,value)=>typeof value==='string'&&pattern.test(value);
const integer=value=>Number.isSafeInteger(value)&&value>=0;

// Keep the first 12 fields and identity mapping aligned with the legacy
// ownership observer. Its root/FD9 guard belongs to the release path.
export const LEGACY_CONTAINER_FIELDS=[
  '{{json .Id}}','{{json .Image}}','{{json .Name}}','{{json .State.StartedAt}}','{{json .RestartCount}}',
  '{{json .State.Pid}}','{{json .State.Running}}','{{json .HostConfig.Privileged}}','{{json .HostConfig.PidMode}}',
  '{{json .HostConfig.NetworkMode}}','{{json .HostConfig.Binds}}','{{json (index .Config.Labels "com.docker.compose.project")}}',
];
export function legacyContainerIdentity(rows,repository=CONTRACT.repository){
  const [id,imageId,name,startedAt,restartCount,pid,running,privileged,pidMode,networkMode,binds,project]=rows;
  return {id,imageId,name,startedAt,restartCount,pid,running,privileged,pidMode,networkMode,
    bindsSha256:canonicalDigest(binds),project,erpBind:Array.isArray(binds)&&binds.some(v=>v.startsWith(repository+':')||v.startsWith(repository+'/'))};
}

const label=key=>`{{with index .Config "Labels"}}{{json (index . "${key}")}}{{else}}null{{end}}`;
const inspectFormat=[...LEGACY_CONTAINER_FIELDS.slice(0,-1),label('com.docker.compose.project'),
  label('com.docker.compose.service'),'{{json .State.Status}}',
  '{{with index .State "Health"}}{{json (index . "Status")}}{{else}}null{{end}}','{{json .HostConfig.RestartPolicy.Name}}',
  '{{json .HostConfig.ReadonlyRootfs}}','{{json .Mounts}}','{{json .HostConfig.PortBindings}}',
  '{{json .NetworkSettings.Networks}}','{{json .Config.Entrypoint}}','{{json .Config.Cmd}}',
  label('phoenix.schema.role'),'{{json .Config.User}}',
].join('\t');
const imageFormat=[
  '{{json .Id}}',label('org.opencontainers.image.revision'),label('org.opencontainers.image.source'),
].join('\t');
function readDocker(args){
  try {
    return execFileSync('/usr/bin/docker',args,{env:executionEnv(),encoding:'utf8',
      timeout:5000,maxBuffer:2*1024*1024,stdio:['ignore','pipe','pipe']}).trim();
  } catch { fail('HOLD_OBSERVATION_UNAVAILABLE'); }
}
function requireRootIdentity(){
  try { assertRootIdentity(CONTRACT); }
  catch { fail('HOLD_EXECUTION_UID'); }
}
function readProtectedRecord(name){
  const directory=CONTRACT.stateDirectory,file=path.join(directory,name);
  try {
    if(fs.realpathSync(directory)!==directory)fail('HOLD_STATE_PATH');
    inspectTrustedDirectory(directory,CONTRACT);
  } catch { fail('HOLD_STATE_PATH'); }
  const before=fs.lstatSync(file,{bigint:true,throwIfNoEntry:false});
  if(!before)return null;
  if(before.size<1n||before.size>1024n*1024n)fail('HOLD_PROTECTED_RECORD');
  const bytes=readPinnedFile(file,{contract:CONTRACT});
  const after=fs.lstatSync(file,{bigint:true});
  if(bytes.length!==Number(before.size)||['dev','ino','mtimeNs','ctimeNs','size'].some(key=>before[key]!==after[key]))fail('HOLD_PROTECTED_RECORD');
  return {value:JSON.parse(bytes),digest:createHash('sha256').update(bytes).digest('hex'),
    filePin:['dev','ino','mtimeNs','ctimeNs','size'].map(key=>String(after[key]))};
}
function listIds(docker){
  const output=docker(['ps','-a','--no-trunc','-q']);
  const ids=output?output.split('\n'): [];
  if(ids.length>MAX_CONTAINERS||ids.some(id=>!match(CID,id))||new Set(ids).size!==ids.length)fail('HOLD_CONTAINER_ROSTER_INVALID');
  return ids.sort();
}
function rows(text,expected,width){
  let result;
  try { result=text.split('\n').map(line=>line.split('\t').map(JSON.parse)); }
  catch { fail('HOLD_OBSERVATION_UNAVAILABLE'); }
  if(result.length!==expected.length||result.some((row,index)=>row.length!==width||row[0]!==expected[index]))fail('HOLD_OBSERVATION_UNAVAILABLE');
  return result;
}
function inspectAll(docker,ids){
  if(!ids.length)return {containers:[],images:[]};
  const containers=rows(docker(['inspect','--type','container','--format',inspectFormat,...ids]),ids,24);
  if(containers.some(row=>!match(IMAGE,row[1])||typeof row[2]!=='string'||typeof row[3]!=='string'||
    !integer(row[4])||!integer(row[5])||typeof row[6]!=='boolean'||typeof row[7]!=='boolean'||
    typeof row[8]!=='string'||typeof row[9]!=='string'||!(row[10]===null||Array.isArray(row[10])&&row[10].every(v=>typeof v==='string'))||
    !STATES.has(row[13])||typeof row[16]!=='boolean'||!Array.isArray(row[17])))fail('HOLD_OBSERVATION_UNAVAILABLE');
  const imageIds=[...new Set(containers.map(row=>row[1]))].sort();
  const images=rows(docker(['image','inspect','--format',imageFormat,...imageIds]),imageIds,3);
  return {containers,images};
}
function corroborateCore(first,active){
  if(active?.version!==CONTRACT.version||active.outcome!=='SUCCESS')fail('HOLD_CORE_IDENTITY');
  for(const service of CORE){
    const candidates=first.containers.filter(row=>row[2]==='/phoenix-v3-'+service||(row[11]===PROJECT&&row[12]===service));
    if(candidates.length!==1)fail('HOLD_CORE_IDENTITY');
    const row=candidates[0],image=first.images.find(item=>item[0]===row[1]);
    if(row[2]!=='/phoenix-v3-'+service||row[11]!==PROJECT||row[12]!==service||row[6]!==true||row[5]===0||
      row[13]!=='running'||row[14]!=='healthy')fail('HOLD_CORE_IDENTITY');
    if(service!=='db'&&(!match(SHA,image[1])||active.active?.[service]?.revision!==image[1]||
      active.active[service].imageId!==row[1]))fail('HOLD_CORE_IDENTITY');
  }
}
function validateRegistry(record){
  if(!record)return [];
  const value=record.value;
  if(value?.schema!=='phoenix.maintenance-reviewed-host-ownership/v1'||!match(CID,value.evidenceSha256)||
    !Array.isArray(value.containers)||!Array.isArray(value.hostProcesses)||
    value.containers.some(pin=>!match(CID,pin?.id)||!match(CID,pin.identitySha256)))fail('HOLD_REGISTRY_UNVERIFIED');
  return value.containers;
}
function pinEvidence(pins,id,digest){
  const registered=pins.filter(pin=>pin.id===id);
  const matching=registered.filter(pin=>pin.identitySha256===digest);
  const qualified=matching.filter(pin=>typeof pin.owner==='string'&&pin.owner.length>0);
  const status=qualified.length===1?'EXACT_PIN':qualified.length>1?'AMBIGUOUS_PINS':
    matching.length?'OWNER_UNUSABLE':registered.length?'IDENTITY_CHANGED':'NO_PIN';
  return {status,registered:registered.length,identityMatches:matching.length,qualifiedMatches:qualified.length};
}
function classify(row,knownProject,revisionShape,active){
  const name=row[2],sameActiveImage=['api','web'].some(service=>active.active[service].imageId===row[1]);
  if(CORE.some(service=>name==='/phoenix-v3-'+service))return 'CORE_'+row[12].toUpperCase();
  if(row[7]||row[8]==='host'||row[8].startsWith('container:')||row[9]==='host'||name.toLowerCase().includes('watchtower'))return 'SHARED_OR_UNMANAGED_SHAPE';
  if(knownProject&&revisionShape&&row[13]==='exited'&&row[5]===0&&!row[6]&&row[15]==='no'&&
    !row[10]?.length&&row[17].length===0&&row[23]==='phoenix'&&
    /^\/phoenix-migrate-schema-first-[a-z0-9]{8}(?:-show)?$/.test(name)&&same(row[20],['./node_modules/.bin/typeorm'])&&
    ['run','show'].some(verb=>same(row[21],['-d','dist/database/data-source.js','migration:'+verb,...(verb==='run'?['--transaction','all']:[])])))return 'HISTORICAL_SCHEMA_TOOL_SHAPE';
  if(row[22]==='readonly-inventory')return 'SCHEMA_INVENTORY_ROLE_LABEL';
  if(row[11]===PROJECT||sameActiveImage||row[17].some(mount=>mount.Type==='bind'&&[CONTRACT.repository,CONTRACT.controlRoot]
    .some(root=>mount.Source===root||mount.Source?.startsWith(root+'/'))))return 'AUXILIARY_PHOENIX_SHAPE';
  return 'OTHER_CONTAINER';
}
function project(row,image,active,pins){
  const identitySha256=canonicalDigest(legacyContainerIdentity(row));
  const knownProject=PROJECT_REPOSITORIES.has(image[2]),revisionShape=match(SHA,image[1]);
  return {id:row[0],identitySha256,classification:classify(row,knownProject,revisionShape,active),
    ownership:pinEvidence(pins,row[0],identitySha256),
    oci:{knownProjectSource:knownProject,revisionPresent:revisionShape,
      matchesActiveApi:revisionShape&&active.active.api.revision===image[1],
      matchesActiveWeb:revisionShape&&active.active.web.revision===image[1]},
    runtime:{state:row[13],running:row[6],pidZero:row[5]===0,restartCount:row[4],
      restartDisabled:row[15]==='no',network:row[9]==='none'?'NONE':row[9]==='host'?'HOST':row[9].startsWith('container:')?'SHARED':'OTHER',
      networkCount:Object.keys(row[19]??{}).length,privileged:row[7],sharedPid:row[8]==='host'||row[8].startsWith('container:'),
      readonlyRootfs:row[16],mountCount:row[17].length,bindMountCount:row[17].filter(mount=>mount.Type==='bind').length,
      hasPublishedPorts:Object.keys(row[18]??{}).length>0}};
}

export function collectProductionHostContainerInventory(expectedMainSha,{docker=readDocker,readRecord=readProtectedRecord,
  guard=requireRootIdentity}={}){
  if(!match(SHA,expectedMainSha))fail('HOLD_EXPECTED_MAIN_SHA');
  guard();
  const activeBefore=readRecord('active.json'),registryBefore=readRecord(REGISTRY);
  const ids=listIds(docker),first=inspectAll(docker,ids);
  if(!same(ids,listIds(docker)))fail('HOLD_CONTAINER_ROSTER_CHANGED');
  const second=inspectAll(docker,ids);
  if(!same(ids,listIds(docker)))fail('HOLD_CONTAINER_ROSTER_CHANGED');
  if(!same(first,second))fail('HOLD_CONTAINER_OBSERVATION_CHANGED');
  const activeAfter=readRecord('active.json'),registryAfter=readRecord(REGISTRY);
  if(!same(activeBefore,activeAfter)||!same(registryBefore,registryAfter))fail('HOLD_PROTECTED_RECORD_CHANGED');
  corroborateCore(first,activeBefore?.value);
  const pins=validateRegistry(registryBefore),visible=new Set(ids),active=activeBefore.value;
  return {schema:'phoenix.production-host-container-inventory/v1',expectedMainSha,projectionOnly:true,releaseAuthorized:false,
    registry:registryBefore?'REVIEWED_SHAPE':'ABSENT',
    containers:first.containers.map(row=>project(row,first.images.find(image=>image[0]===row[1]),active,pins)),
    registryOnlyCidCount:new Set(pins.map(pin=>pin.id).filter(id=>!visible.has(id))).size};
}

const publicFailures=new Set([
  'HOLD_EXPECTED_MAIN_SHA','HOLD_OBSERVATION_UNAVAILABLE','HOLD_PROTECTED_RECORD','HOLD_CONTAINER_ROSTER_INVALID',
  'HOLD_CORE_IDENTITY','HOLD_REGISTRY_UNVERIFIED','HOLD_CONTAINER_ROSTER_CHANGED','HOLD_CONTAINER_OBSERVATION_CHANGED',
  'HOLD_PROTECTED_RECORD_CHANGED','HOLD_EXECUTION_UID','HOLD_STATE_PATH',
].map(code=>'HOST_CONTAINER_INVENTORY='+code));
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try {console.log('HOST_CONTAINER_INVENTORY='+JSON.stringify(collectProductionHostContainerInventory(process.argv[2])));}
  catch(error){console.log(publicFailures.has(error?.message)?error.message:'HOST_CONTAINER_INVENTORY=HOLD_UNVERIFIED');}
}
