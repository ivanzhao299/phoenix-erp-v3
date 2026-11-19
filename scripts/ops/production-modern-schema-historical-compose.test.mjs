import assert from 'node:assert/strict';
import test from 'node:test';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
import {collectModernSchemaHostSurface,inspectModernSchemaContainer} from './production-modern-schema-executors.mjs';
import {ModernSchemaExecutorWatch} from './production-modern-schema-watch.mjs';
import {publicModernSchemaPreparationFailure} from './production-modern-schema-public-preparation.mjs';
import {collectHistoricalComposeSchemaArtifacts,HISTORICAL_COMPOSE_CLASSIFICATION,
 isHistoricalComposeSchemaCandidate,readHistoricalComposeEvidence,verifyHistoricalComposeSchemaArtifacts} from './production-modern-schema-historical-compose.mjs';

const hash=c=>c.repeat(64),revision=c=>c.repeat(40);
const mounts=[
 {Type:'bind',Source:'/data/phoenix-erp-data/uploads',Destination:'/app/uploads',RW:true},
 {Type:'bind',Source:'/var/lib/phoenix-background-control',Destination:'/run/phoenix-background-control',RW:false},
];
const network={Name:'phoenix-erp_default',Id:hash('8'),Containers:{}};
const imageId='sha256:'+hash('4');
const stamp=offset=>`2026-11-20T00:00:00.0000000${String(offset).padStart(2,'0')}Z`;
const quoted=values=>values.map(value=>JSON.stringify(value)).join('\t');
const containerRow=value=>quoted([value.id,value.imageId,value.name,value.state,value.restarts,value.networkMode,value.ports,value.networks,value.labels,value.mounts,
 value.privileged,value.pidMode,value.readonly,value.capDrop,value.user,value.restartPolicy,value.entrypoint,value.cmd]);
function fixture(){
 const values=['run','show'].map((role,index)=>{
  const name='/phoenix-migrate-schema-first-ab12cd34'+(role==='show'?'-show':'');
  const state={Status:'exited',Running:false,Restarting:false,Paused:false,Pid:0,OOMKilled:false,Dead:false,ExitCode:0,
   StartedAt:stamp(index*10+3),FinishedAt:stamp(index*10+6)};
  const cmd=['-d','dist/database/data-source.js','migration:'+role,...(role==='run'?['--transaction','all']:[])];
  return {id:hash(String(index+6)),imageId,name,state,networkMode:network.Name,
   ports:{},networks:{[network.Name]:{NetworkID:network.Id,EndpointID:'',IPAddress:'',GlobalIPv6Address:'',MacAddress:'',Gateway:'',IPv6Gateway:''}},
   labels:{'com.docker.compose.project':'phoenix-erp','com.docker.compose.service':'api','com.docker.compose.oneoff':'True'},
   mounts:structuredClone(mounts),privileged:false,pidMode:'',restarts:0,readonly:false,capDrop:null,user:'phoenix',
   restartPolicy:{Name:'no',MaximumRetryCount:0},entrypoint:['./node_modules/.bin/typeorm'],cmd};
 });
 const asNs=offset=>String(BigInt(Date.parse('2026-11-20T00:00:00Z'))*1_000_000n+BigInt(offset));
 const metadataSha256=hash('9'),evidence={metadataSha256,files:{
  'candidate-image.txt':{mtimeNs:asNs(0)},'run.log':{mtimeNs:asNs(4)},'show.log':{mtimeNs:asNs(14)},'verified-image.txt':{mtimeNs:asNs(20)},
 },bytes:{'candidate-image.txt':Buffer.from(imageId+'\n'),'verified-image.txt':Buffer.from(imageId+'\n'),
  'run.log':Buffer.from('no migrations pending\n'),'show.log':Buffer.from('[X] 1 LoadedMigration\n')}};
 const img=[imageId,revision('a'),'https://github.com/ivanzhao299/phoenix-erp'];
 const reads=[];
 const f={values,evidence,img,reads,extra:{},scope:{api:{mounts,networkMode:network.Name},network:structuredClone(network),apiRevision:revision('b')}};
 f.dependencies={
  readEvidence(keys,{content=false}={}){
   assert.deepEqual(keys,['ab12cd34']);reads.push(content);
   const record=content?evidence:{metadataSha256:evidence.metadataSha256};
   return new Map([['ab12cd34',record]]);
  },
  sourceGit(root,args){assert.ok(root.endsWith('/phoenix-erp'));assert.deepEqual(args,['merge-base','--is-ancestor',revision('a'),revision('b')]);},
 };
 f.docker=args=>{
  if(args[0]==='image')return quoted(img);
  assert.deepEqual(args.slice(0,4),['inspect','--type','container','--format']);
  return args.slice(5).map(id=>{
   const index=values.findIndex(value=>value.id===id);
   const value=values[index];
   const row=[id,value.imageId,value.state,stamp(index*10+2),value.imageId,value.entrypoint[0],value.cmd,{'3100/tcp':null},
    'private','','','private',false,false,null,[],null,null,null,null,null,null];
   return quoted(row.map((item,column)=>Object.hasOwn(f.extra,column)?f.extra[column]:item));
  }).join('\n');
 };
 f.scope.docker=f.docker;
 f.collect=(subset=f.values)=>collectHistoricalComposeSchemaArtifacts(subset,f.scope,f.dependencies);
 f.verify=(pins,subset=f.values)=>verifyHistoricalComposeSchemaArtifacts(subset,pins,{networkId:network.Id,docker:f.docker},f.dependencies);
 return f;
}

test('historical Compose admission binds both fixed roles to the same image, source, protected evidence and native state',()=>{
 const f=fixture();
 assert.ok(f.values.every(isHistoricalComposeSchemaCandidate));
 assert.equal(isHistoricalComposeSchemaCandidate({...f.values[0],labels:{}}),false);
 const pins=f.collect();
 assert.deepEqual(pins.map(pin=>pin.role),['run','show']);
 assert.ok(pins.every(pin=>pin.classification===HISTORICAL_COMPOSE_CLASSIFICATION));
 assert.equal(pins[0].evidenceSha256,pins[1].evidenceSha256);
 assert.deepEqual([...f.verify(pins)],f.values.map(value=>value.id));
 assert.deepEqual(f.reads,[true,false,false]);
});

test('unbound roles, incomplete pairs, shared privileges, disallowed mounts, malformed evidence and reversed chronology fail closed',()=>{
 for(const alter of [
  f=>{f.values.pop();},f=>{f.values[1].name=f.values[0].name;},f=>{f.values[1].imageId='sha256:'+hash('3');},
  f=>{f.values[0].labels['com.docker.compose.oneoff']='false';},f=>{f.values[0].cmd[4]='each';},
  f=>{f.values[0].state.Pid=42;},f=>{f.values[0].state.Running=true;},f=>{f.values[0].state.ExitCode=1;},f=>{f.values[0].state.Paused=true;},
  f=>{f.values[0].restarts=1;},f=>{f.values[0].restartPolicy.Name='always';},f=>{f.values[0].pidMode='host';},
  f=>{f.extra[8]='host';},f=>{f.extra[9]='container:other';},f=>{f.extra[12]=true;},f=>{f.extra[14]=['SYS_ADMIN'];},
  f=>{f.extra[4]='unverified-tag';},f=>{f.extra[7]={'3100/tcp':[{HostIp:'127.0.0.1',HostPort:'49100'}]};},
  f=>{f.values[0].mounts[0].Source='/other/uploads';},f=>{f.values[0].mounts[1].RW=true;},
  f=>{f.scope.api={...f.scope.api,mounts:[]};},
  f=>{f.values[0].networks[network.Name].EndpointID=hash('a');},f=>{f.scope.network.Containers[f.values[0].id]={};},
  f=>{f.img[2]='https://example.org/unknown';},f=>{f.dependencies.sourceGit=()=>assert.fail('source is not ancestor');},
  f=>{f.evidence.bytes['candidate-image.txt']=Buffer.from('unexpected image\n');},
  f=>{f.evidence.bytes['show.log']=Buffer.from('[X] 1 Initial\n[ ] Next\n');},
  f=>{f.evidence.files['verified-image.txt'].mtimeNs=f.evidence.files['candidate-image.txt'].mtimeNs;},
  f=>{f.values[0].state.FinishedAt=stamp(15);},
  f=>{f.dependencies.readEvidence=()=>new Map();},
 ]){
  const f=fixture();alter(f);
  assert.throws(()=>f.collect());
 }
});

test('raw mount enumeration can change while the formal full native pin is stable',()=>{
 const value=fixture().values[0];
 const inspect=()=>inspectModernSchemaContainer(value.id,()=>containerRow(value));
 const first=inspect();value.mounts.reverse();
 assert.deepEqual(inspect(),first);
 value.mounts[0].RW=!value.mounts[0].RW;
 assert.notDeepEqual(inspect(),first);
});

test('archive ancestry and individual files cannot be replaced by unknown or stacked mounts',()=>{
 const archive='/opt/phoenix/backups/migration-evidence',directory=archive+'/schema-first.AB12CD34';
 const root={id:'10',device:'8:1',target:'/',root:'/',filesystem:'ext4'};
 const io={realpathSync:name=>name,readdirSync:()=>['schema-first.AB12CD34'],lstatSync(name){
  const file=/\.txt$|\.log$/.test(name);
  return {dev:1n,ino:BigInt(name.length),uid:0n,mode:file?0o600n:name===directory?0o700n:0o755n,nlink:1n,size:1n,
   mtimeNs:1n,ctimeNs:1n,isFile:()=>file,isDirectory:()=>!file,isSymbolicLink:()=>false};
 }};
 const read=boundary=>readHistoricalComposeEvidence(['ab12cd34'],{io,readMounts:()=>boundary,acl:names=>names.map(()=>[false,false])});
 assert.equal(read([root]).size,1);
 for(const changed of [
  [{...root,filesystem:'nfs'}],[root,{...root,id:'11'}],[root,{...root,id:'11',target:'/opt'}],
  [root,{...root,id:'11',target:directory}],[root,{...root,id:'11',target:directory+'/verified-image.txt'}],
 ])assert.throws(()=>read(changed),/HISTORICAL_COMPOSE_HOLD/);
 assert.notEqual(read([root]).get('ab12cd34').metadataSha256,read([{...root,id:'11'}]).get('ab12cd34').metadataSha256);
});

test('the formal host surface classifies the complete historical pair and keeps unrelated Compose containers blocked',()=>{
 const f=fixture(),services=['api','web','db'],core=services.map((service,index)=>({...f.values[0],id:hash(String(index+1)),name:'/phoenix-v3-'+service,
  state:{...f.values[0].state,Status:'running',Running:true,Pid:process.pid,Health:{Status:'healthy'}},
  ports:index===1?{}:{[index===0?'3100/tcp':'5432/tcp']:[{HostIp:'127.0.0.1',HostPort:index===0?'3100':'5432'}]},
  networks:{[network.Name]:{NetworkID:network.Id,IPAddress:'172.30.0.'+(index+2),GlobalIPv6Address:''}}}));
 const actualNetwork={...network,Driver:'bridge',Scope:'local',EnableIPv6:false,IPAM:{Config:[{Subnet:'172.30.0.0/24'}]},
  Labels:{'com.docker.compose.project':'phoenix-erp'},Containers:Object.fromEntries(core.map(value=>[value.id,{}]))};
 const pre=Object.fromEntries(services.map((service,index)=>[service,{id:core[index].id,image:imageId,startedAt:core[index].state.StartedAt,restartCount:0,ociRevision:revision('b')}]));
 const surface=extra=>{
  const values=[...core,...extra];
  return collectModernSchemaHostSurface({containers:pre},{historicalCompose:f.dependencies,guard(){},captureSchedulers:()=>[],processIds:()=>[],
   run(binary,args){
    if(binary==='/usr/sbin/ip')return JSON.stringify([{ifname:'br-'+network.Id.slice(0,12),ifindex:8,linkinfo:{info_kind:'bridge'}}]);
    if(args[0]==='ps')return values.map(value=>value.id).join('\n');
    if(args[0]==='network')return JSON.stringify([actualNetwork]);
    if(args[0]==='exec')return '{"nonLoopback":0}';
    if(args[0]==='inspect'&&args[1]!=='--type')return containerRow(values.find(value=>value.id===args[1]));
    return f.docker(args);
   }});
 };
 const accepted=surface(f.values);
 assert.deepEqual(accepted.inertArtifacts.map(x=>x.classification),[HISTORICAL_COMPOSE_CLASSIFICATION,HISTORICAL_COMPOSE_CLASSIFICATION]);
 assert.equal(accepted.productionAuthorized,false);
 assert.throws(()=>surface(f.values.slice(0,1)),/HISTORICAL_COMPOSE_ARTIFACT_UNVERIFIED/);
 assert.throws(()=>surface([...f.values,{...f.values[0],id:hash('5'),name:'/unrelated-compose'}]),/AUXILIARY_ERP_CONTAINER_UNACCOUNTED/);
});

test('watch excludes only verified historical CIDs from replacement detection and revalidates during recovery',async()=>{
 const f=fixture(),inertArtifacts=f.collect();
 const services=['api','web','db'];
 const core=services.map((service,index)=>({...f.values[0],id:hash(String(index+1)),name:'/phoenix-v3-'+service,
  labels:{'com.docker.compose.project':'phoenix-erp','com.docker.compose.service':service},
  state:{...f.values[0].state,Status:'running',Running:true,Pid:324,Health:{Status:'healthy'}}}));
 const original=Object.fromEntries(services.map((service,index)=>[service,{id:core[index].id,image:imageId,startedAt:core[index].state.StartedAt,restartCount:0}]));
 const ingressScope={networkId:network.Id};
 const watch=new ModernSchemaExecutorWatch({
  context:{runtimeSnapshotSha256:canonicalDigest(original)},
  preparation:{originalSnapshot:{containers:original},ownedResources:[],floor:{project:'phoenix-erp'},
   hostSurface:{inertArtifacts,ingressScope,runtimeAddress:'172.30.0.2'}},
  state:{read:()=>({phase:'BACKUP_VERIFIED',status:'HOLD'}),ddlIntentExists:()=>false},
  privateRuntime:{guard(){}},admit:()=>true,
 },{historicalCompose:f.dependencies,run(_binary,args){
  if(args[0]==='network')return JSON.stringify([{Containers:Object.fromEntries(core.map(value=>[value.id,{}]))}]);
  return f.docker(args);
 }});
 const complete=[...core,...f.values];
 assert.equal(watch.verifyContainers(complete).candidate,null);
 assert.throws(()=>watch.verifyContainers(complete.slice(0,-1)),/HISTORICAL_COMPOSE_ARTIFACT_CHANGED/);
 const foreign={...f.values[0],id:hash('5')};
 assert.throws(()=>watch.verifyContainers([...complete,foreign]),/UNREGISTERED_API_REPLACEMENT/);
 f.evidence.metadataSha256=hash('7');
 watch.containers=()=>complete;
 await assert.rejects(watch.observeRecoveryHost(()=>true),/HISTORICAL_COMPOSE_ARTIFACT_CHANGED/);
 assert.equal(publicModernSchemaPreparationFailure('HOST_SURFACE',Error('MODERN_SCHEMA_EXECUTORS_HOLD=HISTORICAL_COMPOSE_ARTIFACT_UNVERIFIED')),
  'HOST_SURFACE_HISTORICAL_COMPOSE_ARTIFACT_UNVERIFIED');
});
