/** Read-only diagnosis of the generic ownership fallback. Only its fixed
 * verdict crosses the production boundary. */
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
const ACTIVE_SERVICES=['api','web'];
const CORE=[...ACTIVE_SERVICES,'db'];
const PROJECT='phoenix-erp';
const STATES=new Set(['created','running','paused','restarting','removing','exited','dead']);
const MAX_CONTAINERS=128;
const PREFIX='HOST_CONTAINER_OWNERSHIP_DIAGNOSIS=';
const fail=code=>{throw Error(PREFIX+code);};
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
const coreName=service=>'/phoenix-v3-'+service;
const coreMatch=CORE.map(service=>`(eq .Name "${coreName(service)}")`).join(' ');
const coreHealth=`{{if or ${coreMatch}}}{{with index .State "Health"}}{{json (index . "Status")}}{{else}}null{{end}}{{else}}null{{end}}`;
const inspectFormat=[...LEGACY_CONTAINER_FIELDS.slice(0,-1),label('com.docker.compose.project'),
  '{{json .State.Status}}',coreHealth,'{{json .HostConfig.RestartPolicy.Name}}',
  '{{json .Mounts}}','{{json .Config.Entrypoint}}','{{json .Config.Cmd}}',
  label('phoenix.schema.role'),'{{json .Config.User}}','{{json .State.Restarting}}','{{json .State.Paused}}',
].join('\t');
const imageFormat=[
  '{{json .Id}}',label('org.opencontainers.image.revision'),
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
  const containers=rows(docker(['inspect','--type','container','--format',inspectFormat,...ids]),ids,22);
  if(containers.some(row=>!match(IMAGE,row[1])||typeof row[2]!=='string'||typeof row[3]!=='string'||
    !integer(row[4])||!integer(row[5])||typeof row[6]!=='boolean'||typeof row[7]!=='boolean'||
    typeof row[8]!=='string'||typeof row[9]!=='string'||!(row[10]===null||Array.isArray(row[10])&&row[10].every(v=>typeof v==='string'))||
    !STATES.has(row[12])||!Array.isArray(row[15])||
    typeof row[20]!=='boolean'||typeof row[21]!=='boolean'))fail('HOLD_OBSERVATION_UNAVAILABLE');
  // Docker enumerates MountPoints in map order. Keep every mount object and
  // duplicate while stabilizing only this array for the two-sample comparison.
  for(const row of containers){
    row[15]=row[15].map(mount=>({mount,digest:canonicalDigest(mount)}))
      .sort((a,b)=>a.digest.localeCompare(b.digest)).map(({mount})=>mount);
  }
  const imageIds=[...new Set(containers.filter(row=>ACTIVE_SERVICES.some(service=>row[2]===coreName(service)))
    .map(row=>row[1]))].sort();
  const images=imageIds.length?rows(docker(['image','inspect','--format',imageFormat,...imageIds]),imageIds,2):[];
  return {containers,images};
}
function corroborateCore(first,active){
  const pins=active?.active;
  if(active?.version!==CONTRACT.version||active.outcome!=='SUCCESS'||
    ACTIVE_SERVICES.some(service=>!match(IMAGE,pins?.[service]?.imageId)||!match(SHA,pins?.[service]?.revision)))fail('HOLD_CORE_RECORD');
  // The deployment snapshot's metadataFor resolves the fixed runtime names.
  for(const service of CORE){
    const candidates=first.containers.filter(row=>row[2]===coreName(service));
    if(candidates.length!==1)fail('HOLD_CORE_ROSTER');
    const row=candidates[0];
    if(row[6]!==true||row[5]===0||row[12]!=='running')fail('HOLD_CORE_RUNTIME_STATE');
    if(row[13]!=='healthy')fail('HOLD_CORE_HEALTH');
    if(service!=='db'&&(pins[service].imageId!==row[1]||
      pins[service].revision!==first.images.find(item=>item[0]===row[1])?.[1]))fail('HOLD_CORE_IMAGE_IDENTITY');
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
function genericMismatch(pins,row){
  const digest=canonicalDigest(legacyContainerIdentity(row));
  const registered=pins.filter(pin=>pin.id===row[0]);
  const matching=registered.filter(pin=>pin.identitySha256===digest);
  const qualified=matching.filter(pin=>typeof pin.owner==='string'&&pin.owner.length>0);
  return qualified.length===1?null:qualified.length>1?'AMBIGUOUS_PINS':
    matching.length?'OWNER_UNUSABLE':registered.length?'IDENTITY_CHANGED':'NO_PIN';
}
function reachesGenericFallback(row,active){
  const name=row[2],sameActiveImage=ACTIVE_SERVICES.some(service=>active.active[service].imageId===row[1]);
  if(CORE.some(service=>name===coreName(service)))return false;
  if(row[7]||row[8]==='host'||row[8].startsWith('container:')||row[9]==='host'||name.toLowerCase().includes('watchtower'))return false;
  // These shapes enter other release branches. Their provenance, ancestry
  // and admission remain the responsibility of those branches.
  if(row[12]==='exited'&&row[5]===0&&!row[6]&&!row[20]&&!row[21]&&row[14]==='no'&&row[15].length===0&&row[19]==='phoenix'&&
    /^\/phoenix-migrate-schema-first-[a-z0-9]{8}(?:-show)?$/.test(name)&&same(row[16],['./node_modules/.bin/typeorm'])&&
    ['run','show'].some(verb=>same(row[17],['-d','dist/database/data-source.js','migration:'+verb,...(verb==='run'?['--transaction','all']:[])])))return false;
  if(row[18]==='readonly-inventory')return false;
  // A rehearsal label alone does not establish current-release ownership.
  return row[11]!==PROJECT&&!sameActiveImage&&!row[15].some(mount=>mount.Type==='bind'&&[CONTRACT.repository,CONTRACT.controlRoot]
    .some(root=>mount.Source===root||mount.Source?.startsWith(root+'/')));
}

export function diagnoseProductionHostContainerOwnership(expectedMainSha,{docker=readDocker,readRecord=readProtectedRecord,
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
  const pins=validateRegistry(registryBefore);
  const generic=first.containers.filter(row=>reachesGenericFallback(row,activeBefore.value));
  if(generic.length&&!registryBefore)fail('HOLD_REGISTRY_UNVERIFIED');
  const mismatches=[...new Set(generic.map(row=>genericMismatch(pins,row)).filter(Boolean))];
  return mismatches.length>1?'MIXED':mismatches[0]??'NO_GENERIC_MISMATCH';
}

const publicFailures=new Set([
  'HOLD_EXPECTED_MAIN_SHA','HOLD_OBSERVATION_UNAVAILABLE','HOLD_PROTECTED_RECORD','HOLD_CONTAINER_ROSTER_INVALID',
  'HOLD_CORE_RECORD','HOLD_CORE_ROSTER','HOLD_CORE_RUNTIME_STATE','HOLD_CORE_HEALTH','HOLD_CORE_IMAGE_IDENTITY',
  'HOLD_REGISTRY_UNVERIFIED','HOLD_CONTAINER_ROSTER_CHANGED','HOLD_CONTAINER_OBSERVATION_CHANGED',
  'HOLD_PROTECTED_RECORD_CHANGED','HOLD_EXECUTION_UID','HOLD_STATE_PATH',
].map(code=>PREFIX+code));
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try {console.log(PREFIX+diagnoseProductionHostContainerOwnership(process.argv[2]));}
  catch(error){console.log(publicFailures.has(error?.message)?error.message:PREFIX+'HOLD_UNVERIFIED');}
}
