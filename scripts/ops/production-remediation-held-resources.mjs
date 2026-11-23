/** Resource provenance for the two completed previews and the failed fenced
 * capsule. A stopped clone can be retained without certifying its rehearsal. */
import fs from 'node:fs';
import path from 'node:path';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {CONTRACT} from './production-config-guard.mjs';
import {readPinnedFile} from './production-trusted-paths.mjs';
const owner='45144287071-1',inspectionOwner='45141252692-1';
const artifact='RETAINED_1123_FENCED_ATTEMPT';
const archiveName='schema-release-1123-handoff-'+owner+'.json';
const preparationDigest='9df223b69e845f63f3b517c77ff847d8d65269bd1ab5d207dcae0affbeb61b91';
const previewDigest='79cff47bcf8818099117378d287d9490ff356236a6712819e04c25691c49f705';
const networkPrep='666242a0d66c0894f77e70600b54f0960e44e47067ee924ee9ef06e51c5b4b64';
const networkFenced='8babbda9208efd28b0529967d4a46d792fc2675f3824509265e6bbbdb1be5098';
const prepareIdentity=new Map([
 ['6e5e2f261cb43fef45477502ddc65675b1528a5bfe566de49d08104e637d445e','60902e6b4881e4c8d516daf83e4a4704e9486fed1cb8b5480a0c3702692f11e9'],
 ['f00455db4f571dd8309fcdaa3bcf0b6b3383c973a119017886e503598a52028e','6b7bd166a5e729df7f38c69c5bc0ba8fc7827c3dcf04af89fd9ecd8d1aee5f4e'],
 ['92fac31519768dd19906f2790379751d608a921a88baa64e048ffccbac54e2c6','2ecbad8dfc6ca4d1b0c8e47dd1468bdbec1df322839a87e8efa0af71c6bbaed0'],
 ['144e41e2dc2af6076a98ae31ba20beb0b8d80f09d24004c853d11a2b59f1a336','2d886ba73b758abdb4598516c2308dcfa02ed56def6267982d3ed5e7aa8a5319'],
 ['f42a4f115cef8ae493065de79ee763ae46f1f4e5c28e07c861eb43a1f875c775','c6f0cff9cd217fab0f57729a5dfcc73128b2cfbbdefc495f68346848c2b1b791']]);
const partialId='947984adc7caa9c59f572d2e66b3fd4a6d83cc686a73b018d32fe2c9bb8fd384';
const partialIdentity='e02e446cfbe7a5d4b13de8152e7ed8e740889090d095903c21c1b2b64fb0a498';
const check=(ok,code)=>{if(!ok)throw Error('HELD_RESOURCES_HOLD='+code);};
const checkedFile=file=>{
 const stat=fs.lstatSync(file);check(stat.size>0&&stat.size<=2*1024*1024,'CAPSULE_EVIDENCE_SIZE');
 return readPinnedFile(file,{contract:CONTRACT});
};
export function oldResourceOwner(value){return value===owner||value===inspectionOwner;}
export function isHeldResource(value){return value?.classification===artifact;}

export function readHeldCapsules(store,target,read=checkedFile){
 const anchor=store.read(archiveName),arch=store.read('schema-release-operator-archive-'+anchor.recoveryOwner+'.json');
 check(anchor.owner===owner&&anchor.executionSha===target&&anchor.archiveSha256===canonicalDigest(arch)&&
  arch.pending.stateDigest==='c8415dc078bcfa3546e47f567031adb5495632a76a17ab86a7abab3178d4c9dc'&&arch.schemaChanged===false&&
  arch.formalTargetSuccess===false&&anchor.outerIngressHeld===true&&same(anchor.backgroundGrants,[]),'SOURCE_ARCHIVE');
 const prep=store.read('schema-release-preparation-'+owner+'.json'),{preparationSha256,...content}=prep;
 check(preparationSha256===preparationDigest&&canonicalDigest(content)===preparationDigest,'ORIGINAL_PREPARATION');
 const inspect=store.read('schema-release-1123-inspect-'+inspectionOwner+'.json'),{inspectionSha256,...inspected}=inspect;
 check(inspectionSha256===previewDigest&&canonicalDigest(inspected)===previewDigest&&inspect.owner===inspectionOwner&&inspect.resourcePins.length===6,'ORIGINAL_PREVIEW');
 const result=new Map(inspect.resourcePins.map(pin=>[pin.containerId,{record:pin,identity:pin.identitySha256}]));
 for(const stage of ['prepare','fenced']){
  const dir=path.join(store.directory,'schema-release-'+stage+'-rehearsal-'+owner);
  const json=name=>JSON.parse(read(path.join(dir,name)));
  const isolation=json('network-volume.json');
  check(canonicalDigest(isolation)===(stage==='prepare'?networkPrep:networkFenced)&&isolation.owner===owner&&
   isolation.network.Internal===true&&isolation.network.EnableIPv6===false,'ISOLATION_EVIDENCE');
  const files=fs.readdirSync(dir).filter(n=>/^create-[1-9][0-9]*\.stdout$/.test(n));
  const created=files.map(file=>{const id=read(path.join(dir,file)).toString();
   check(/^[a-f0-9]{64}\n$/.test(id),'NATIVE_CREATE');const record=json('created-'+id.trim()+'.json');
   check(record.schema==='phoenix.modern-schema-owned-rehearsal-container/v1'&&record.owner===owner&&record.stage===stage&&
    record.containerId===id.trim()&&record.networkId===isolation.network.Id&&record.volume===isolation.volume.Name,'NATIVE_CREATE_BINDING');
   return record;
  });
  let complete;
  if(stage==='prepare'){
   complete=json('rehearsal-receipt.json');
   check(same(complete,prep.oldRuntimeCompatibility)&&complete.outcome==='PASS'&&created.length===5&&
    created.every(record=>complete.resources.some(r=>same(r,record))&&prep.ownedResources.some(r=>same(r,record))),'COMPLETED_CAPSULE');
  }else check(created.length===1&&created[0].containerId===partialId&&created[0].role==='rehearsal-database'&&
   !fs.lstatSync(path.join(dir,'rehearsal-receipt.json'),{throwIfNoEntry:false}),'PARTIAL_CAPSULE');
  for(const record of created){
   if(stage==='prepare')check(prepareIdentity.has(record.containerId),'RECORDED_CREATE');
   check(!result.has(record.containerId),'DUPLICATE_CID');
   result.set(record.containerId,{record,identity:stage==='fenced'?partialIdentity:prepareIdentity.get(record.containerId)});
  }
 }
 check(result.size===12,'EXACT_CAPSULE_SET');
 return {anchor:canonicalDigest(anchor),pins:result};
}

export function heldCapsulePin(candidate,source){
 const prior=source.pins.get(candidate.id),record=prior?.record;
 const role=candidate.labels?.['phoenix.schema.role'],formerOwner=candidate.labels?.['phoenix.schema.owner'];
 check(prior&&record.containerId===candidate.id&&record.role===role&&record.owner===formerOwner&&oldResourceOwner(formerOwner)&&
  candidate.imageId===record.imageId&&candidate.state.Status==='exited'&&candidate.state.Running===false&&candidate.state.Pid===0&&
  candidate.state.ExitCode===0&&!candidate.state.OOMKilled&&!candidate.state.Restarting&&!candidate.state.Paused&&candidate.restarts===0&&
  !candidate.privileged&&candidate.restartPolicy.Name==='no'&&['','private'].includes(candidate.pidMode)&&
  Object.values(candidate.networks??{}).every(n=>!n.IPAddress&&!n.GlobalIPv6Address&&!n.EndpointID)&&
  (role==='readonly-inventory'?candidate.networkMode==='none':candidate.networkMode===record.networkId),'INERT_NATIVE_IDENTITY');
 const identitySha256=canonicalDigest(candidate);
 check(prior.identity===identitySha256,'SEALED_CID_IDENTITY');
 if(role==='rehearsal-database'){
  check(candidate.mounts.length===1&&candidate.mounts[0].Type==='volume'&&candidate.mounts[0].Name===record.volume&&
   ['/var/lib/postgresql','/var/lib/postgresql/data'].includes(candidate.mounts[0].Destination),'CLONE_MOUNT');
 }else{
  check(candidate.readonly===true&&candidate.user==='phoenix'&&same(candidate.capDrop,['ALL']),'ISOLATED_PROCESS');
  if(role.endsWith('-api')){
   const expected=path.join(CONTRACT.stateDirectory,'schema-release-prepare-rehearsal-'+formerOwner,'control-'+role.slice(10));
   check(candidate.mounts.length===1&&candidate.mounts[0].Type==='bind'&&candidate.mounts[0].Source===expected&&
    candidate.mounts[0].Destination==='/run/phoenix-background-control'&&!candidate.mounts[0].RW,'API_CLONE_MOUNT');
  }else check(candidate.mounts.length===0,'PROCESS_MOUNTS');
 }
 return {id:candidate.id,classification:artifact,formerOwner,role,identitySha256,
  ...(role==='rehearsal-database'?{networkId:record.networkId,volume:record.volume}:{}),originalEvidenceSha256:canonicalDigest(record),archivedHandoffSha256:source.anchor};
}

export function verifyHeldIsolation(pins,run){
 const db=pins.filter(pin=>isHeldResource(pin)&&pin.role==='rehearsal-database');
 if(!db.length)return;
 check(db.length===3&&new Set(db.map(pin=>pin.networkId)).size===3&&new Set(db.map(pin=>pin.volume)).size===3,'CLONE_ISOLATION_SET');
 const networks=JSON.parse(run('/usr/bin/docker',['network','inspect',...db.map(pin=>pin.networkId)]));
 const volumes=JSON.parse(run('/usr/bin/docker',['volume','inspect',...db.map(pin=>pin.volume)]));
 for(const pin of db){
  const net=networks.find(n=>n.Id===pin.networkId),vol=volumes.find(v=>v.Name===pin.volume);
  check(net?.Internal===true&&net.EnableIPv6===false&&net.Driver==='bridge'&&net.Scope==='local'&&
   net.Labels?.['phoenix.schema.owner']===pin.formerOwner&&net.Labels?.['phoenix.schema.role']==='rehearsal-network'&&Object.keys(net.Containers??{}).length===0&&
   vol?.Driver==='local'&&vol.Scope==='local'&&vol.Labels?.['phoenix.schema.owner']===pin.formerOwner&&
   vol.Labels?.['phoenix.schema.role']==='rehearsal-data'&&Object.keys(vol.Options??{}).length===0,'CLONE_ISOLATION_CHANGED');
 }
}
