/** Resource provenance for the two completed previews and the failed fenced
 * capsule. A stopped clone can be retained without certifying its rehearsal. */
import fs from 'node:fs';
import path from 'node:path';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {CONTRACT} from './production-config-guard.mjs';
import {readPinnedFile} from './production-trusted-paths.mjs';
import {successorBinding,validateSuccessorInspection} from './production-modern-schema-successor.mjs';
const owner='45144287071-1',inspectionOwner='45141252692-1';
const continuationPreviewOwner='45175249756-1';
const drainedPreviewOwner='45223920315-1',drainedOwner='45228188093-1';
const drainedTarget='3e2ea4ea4de5ccbc102f1e17ae4dbc48c0cfb8e2';
const drainedIdentities=new Map([
 ['26706d7aff6912e1455ec371485ddf4751ff08686e6cf4ff83de77df964a5f37','397097291f6726acefbcf2ac368ae5ea3b18c9a5c6a97e2ded5393fb5ff51e17'],
 ['3eae2d372fcca4ed678d192124e5b278619faa18b291dd7f47cf4090e37790ed','da0b9228037b500a2615c3861524c3e50421844fb827a251d8b25abb4d0e7df6'],
 ['5ec90c8f4e1fdad1e8f82203c24b74517d234cac58fe09c76106f786c31788ec','e6977cac5410b64dfff4a60b2f1d0a9cb51f81ff7d02d047bdc8bc5c40dadc23'],
 ['60bcd88687b40bc0415d3df4a54a17d2f318a174f0cd594811ae01f9ce3c5a06','1a9b6991c4e3492e0c4a142ad744ce888a72bb9264ce5d1e5ab0bc789f1d3d3c'],
 ['7a45af371596a3d5b9f75c81235469a829c740d2190562da47f3e7cdc38f903f','f00dba98e6a34b8a79d06536e0996dcd3335667f73448ba96bd3982da2a5a9cf'],
 ['d55fd3d1d5d99df05983d76e06a833d350575f48ac7aa22904da809021de1ed4','4ff27dfe5a99079eb747123e81680f41304e79873fa7771f3138ba94bbc0f417'],
 ['fdd488dd1c356316543e162eca74eaf2b44d533692ad15f4ef8ceb27627a8a05','41d9b8f7a1cb36253382ad979feaa1072a73bcb840178ce4e65c98b1825f852a'],
]);
const superviseProbe='d55fd3d1d5d99df05983d76e06a833d350575f48ac7aa22904da809021de1ed4';
const continuationPreviewDigest='8458aab8137fd7d7b6acdd9737accd08ef8f9a5d471dfe46bec65086e6953374';
const artifact='RETAINED_1123_FENCED_ATTEMPT';
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
export function oldResourceOwner(value,extended=false,settled=false){
 return value===owner||value===inspectionOwner||extended&&value===continuationPreviewOwner||settled&&[drainedPreviewOwner,drainedOwner].includes(value);
}
export function isHeldResource(value){return value?.classification===artifact;}

export function readHeldCapsules(store,{entry:anchor,extended,settlement,handoffSha256},read=checkedFile){
 const arch=store.read('schema-release-operator-archive-'+anchor.recoveryOwner+'.json');
 check(anchor.owner===owner&&anchor.archiveSha256===canonicalDigest(arch)&&
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
 if(extended){
  const preview=store.read('schema-release-1123-inspect-'+continuationPreviewOwner+'.json');
  validateSuccessorInspection(preview,successorBinding(preview.binding.floorSha,preview.binding));
  check(preview.owner===continuationPreviewOwner&&preview.binding.targetSha===anchor.executionSha&&
   preview.inspectionSha256===continuationPreviewDigest&&preview.resourcePins.length===6&&
   same(preview.resourcePins.map(pin=>pin.role).sort(),['readonly-inventory','rehearsal-candidate-api','rehearsal-database',
    'rehearsal-migration-run','rehearsal-migration-show','rehearsal-original-api']),'EXACT_CONTINUATION_PREVIEW');
  for(const record of preview.resourcePins){
   check(record.owner===continuationPreviewOwner&&!result.has(record.containerId)&&/^[a-f0-9]{64}$/.test(record.identitySha256),'CONTINUATION_PREVIEW_PIN');
   result.set(record.containerId,{record,identity:record.identitySha256});
  }
 }
 if(settlement){
  const preview=store.read('schema-release-1123-inspect-'+drainedPreviewOwner+'.json');
  validateSuccessorInspection(preview,successorBinding(preview.binding.floorSha,preview.binding));
  check(preview.owner===drainedPreviewOwner&&preview.binding.targetSha===drainedTarget&&preview.resourcePins.length===6&&
   preview.inspectionSha256==='c692e807b37eb63fbbad521094bae9b61a9c316c9c999002184b87602b494d35','EXACT_DRAINED_PREVIEW');
  for(const record of preview.resourcePins){
   check(record.owner===drainedPreviewOwner&&!result.has(record.containerId)&&/^[a-f0-9]{64}$/.test(record.identitySha256),'DRAINED_PREVIEW_PIN');
   result.set(record.containerId,{record,identity:record.identitySha256});
  }
  const prepared=store.read('schema-release-preparation-'+drainedOwner+'.json');
  const {preparationSha256,...preparedContent}=prepared;
  check(preparationSha256==='271443ca5ccae853a353033267ce0d8d7b92be6f87ff74c48a39f9f23ba3ce43'&&
   canonicalDigest(preparedContent)===preparationSha256&&prepared.context.owner===drainedOwner&&prepared.context.targetSha===drainedTarget&&
   prepared.ownedResources.length===6&&
   prepared.oldRuntimeCompatibility.resources.length===5,'DRAINED_FAILED_PREPARATION');
  const capsule=path.join(store.directory,'schema-release-prepare-rehearsal-'+drainedOwner);
  check(same(JSON.parse(read(path.join(capsule,'rehearsal-receipt.json'))),prepared.oldRuntimeCompatibility),'DRAINED_ISOLATED_REHEARSAL');
  const inventory=prepared.ownedResources.find(record=>record.role==='readonly-inventory');
  check(inventory?.owner===drainedOwner&&inventory.imageId===prepared.context.candidateImageId&&inventory.revision===drainedTarget,'DRAINED_OWNED_INVENTORY');
  for(const record of prepared.oldRuntimeCompatibility.resources){
   check(record.owner===drainedOwner&&prepared.ownedResources.some(entry=>same(record,entry))&&
    same(JSON.parse(read(path.join(capsule,'created-'+record.containerId+'.json'))),record),'DRAINED_CREATED_RESOURCE');
  }
  for(const record of [...prepared.ownedResources,{...inventory,containerId:superviseProbe}]){
   check(drainedIdentities.has(record.containerId)&&!result.has(record.containerId),'DRAINED_PROTECTED_CID');
   result.set(record.containerId,{record,identity:drainedIdentities.get(record.containerId)});
  }
 }
 check(result.size===(settlement?31:extended?18:12),'EXACT_CAPSULE_SET');
 return {anchor:handoffSha256??canonicalDigest(anchor),pins:result,extended,settled:Boolean(settlement)};
}

export function heldCapsulePin(candidate,source){
 const prior=source.pins.get(candidate.id),record=prior?.record;
 const role=candidate.labels?.['phoenix.schema.role'],formerOwner=candidate.labels?.['phoenix.schema.owner'];
 check(prior&&record.containerId===candidate.id&&record.role===role&&record.owner===formerOwner&&oldResourceOwner(formerOwner,source.extended,source.settled)&&
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
 const extraOwners=[continuationPreviewOwner,drainedPreviewOwner,drainedOwner];
 const extra=extraOwners.map(value=>db.filter(pin=>pin.formerOwner===value).length);
 check(extra.every(count=>count<=1)&&extra[1]===extra[2]&&db.length===3+extra.reduce((a,b)=>a+b,0)&&new Set(db.map(pin=>pin.networkId)).size===db.length&&
  new Set(db.map(pin=>pin.volume)).size===db.length,'CLONE_ISOLATION_SET');
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
