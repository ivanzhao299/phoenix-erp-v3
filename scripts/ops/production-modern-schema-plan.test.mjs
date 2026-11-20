import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {collectModernSchemaHostSurface} from './production-modern-schema-executors.mjs';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
import {deriveModernSchemaPlan,bindCompiledSchemaInventory,readCommittedSchemaInventory,collectModernSchemaPlan,
 collectRetainedModernSchemaInventory,verifyRetainedModernSchemaInventoryPin,MODERN_SCHEMA_IMAGE_INVENTORY_PROGRAM} from './production-modern-schema-plan.mjs';
const hash=c=>c.repeat(64),sha=c=>c.repeat(40);
function unit(n){const timestamp=1795000000000+n,name='OwnedMigration'+n;return {path:`apps/api/src/database/migrations/${timestamp}-${name}.ts`,sourceBlob:sha('a'),timestamp,className:name+timestamp,effectiveName:name+timestamp,sourceSha256:hash('b')};}
function fixture(count=2){
 const source=Array.from({length:count},(_,n)=>unit(n+1)),compiled=source.map(u=>({file:path.posix.basename(u.path,'.ts')+'.js',className:u.className,effectiveName:u.effectiveName,timestamp:u.timestamp,compiledSha256:hash('c')}));
 const legacyTime=1790000000000.625;
 return {targetSha:sha('d'),runtimeSha:sha('e'),candidateImageId:'sha256:'+hash('f'),source,runtimeSource:[source[0]],compiled,
  ledger:{legacy:[{filename:'20260101_owned.sql',applied_at:legacyTime}],typeorm:[{timestamp:Math.round(legacyTime),name:'20260101_owned'},{timestamp:source[0].timestamp,name:source[0].effectiveName}]},
  canonicalLegacy:['20260101_owned.sql'],retired:[],changedMigrationPaths:source.slice(1).map(x=>x.path)};
}
test('complete pending is computed from all exact image/ledger tuples, beyond the twenty-item diagnostic sample',()=>{
 const f=fixture(27),plan=deriveModernSchemaPlan(f);assert.equal(plan.pendingCount,26);assert.equal(plan.pendingMigrations.length,26);assert.equal(plan.ledgerValidation.diagnostics.canonical_typeorm_pending.length,20);
 assert.equal(plan.beforeLedgerSha256,createHash('sha256').update(JSON.stringify(f.ledger)).digest('hex'));assert.equal(plan.releaseAuthorized,false);assert.equal(plan.readOnly,true);
});
test('an old runtime source that is genuinely missing from the ledger is pending even outside changed paths',()=>{
 const f=fixture();f.ledger.typeorm=f.ledger.typeorm.filter(x=>x.name!==f.source[0].effectiveName);const plan=deriveModernSchemaPlan(f);
 assert.equal(plan.pendingCount,2);assert.equal(plan.changedMigrationPaths.length,1);assert.deepEqual(plan.pendingMigrations.map(x=>x.effectiveName),f.source.map(x=>x.effectiveName));
});
test('exact timestamp/name and bridge checks cannot be replaced by basename aliases or diagnostics',()=>{
 for(const change of [f=>f.ledger.typeorm[1].timestamp++,f=>f.ledger.typeorm[1].name='OwnedMigration1',f=>f.ledger.typeorm.push({...f.ledger.typeorm[1]}),
  f=>f.ledger.typeorm[0].timestamp++,f=>f.ledger.legacy.push({...f.ledger.legacy[0]}),f=>f.ledger.legacy[0].filename='unknown.sql',f=>f.ledger.typeorm.push({timestamp:1792000000000,name:'UnknownApplied1792000000000'})]){
  const f=fixture();change(f);assert.throws(()=>deriveModernSchemaPlan(f),/HOLD=/);
 }
});
test('a source already applied beyond R needs independent protected prior provenance and is never replayed',()=>{
 const f=fixture();f.ledger.typeorm.push({timestamp:f.source[1].timestamp,name:f.source[1].effectiveName});
 assert.throws(()=>deriveModernSchemaPlan(f),/PRIOR_APPLY_PROVENANCE_REQUIRED/);let checked=0;
 const plan=deriveModernSchemaPlan(f,{verifyPriorProvenance:u=>{checked++;assert.equal(u.path,f.source[1].path);return true;}});assert.equal(checked,1);assert.equal(plan.pendingCount,0);
});
test('R sources cannot be modified or removed while pretending this is an additive schema release',()=>{
 for(const change of [f=>f.source[0]={...f.source[0],sourceBlob:sha('c')},f=>f.runtimeSource.push(unit(99)),f=>f.changedMigrationPaths=[],f=>f.changedMigrationPaths.push('scripts/deploy-schema-first.sh')]){
  const f=fixture();change(f);assert.throws(()=>deriveModernSchemaPlan(f),/SOURCE_CHANGED_OR_REMOVED|EXACT_ADDITIVE/);
 }
});
test('all compiled files must match the exact source unit, raw effective name and actual compiled bytes hash',()=>{
 for(const change of [f=>f.compiled.pop(),f=>f.compiled[0].effectiveName+=' ',f=>f.compiled[0].timestamp++,f=>f.compiled[0].file='other.js',
  f=>f.compiled[0].className='Other',f=>f.compiled[0].compiledSha256=null,f=>f.compiled[1]={...f.compiled[0]}]){
  const f=fixture();change(f);assert.throws(()=>bindCompiledSchemaInventory(f.source,f.compiled),/HOLD=/);
 }
});
test('the actual committed R105 and c811125 are regular source blobs with exact additive identities',()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),r=readCommittedSchemaInventory(root,'cb42966edfa717b0984936951143d84973c1a263'),t=readCommittedSchemaInventory(root,'c811330e4182660e299d8bf44a35794ba0846470');
 assert.equal(r.length,105);assert.equal(t.length,125);for(const u of r)assert.deepEqual(t.find(v=>v.path===u.path),u);assert.equal(t.filter(u=>!r.some(v=>v.path===u.path)).length,20);
});
test('unsafe source arguments cannot cause a Git, Docker or database operation',async()=>{
 let guard=false;await assert.rejects(collectModernSchemaPlan({query:()=>assert.fail('No database read')},{targetSha:'--help',runtimeSha:sha('e'),candidateImageId:'sha256:'+hash('f'),owner:'1-1'},
  {guard:()=>{guard=true;},inspectImage:()=>assert.fail('No Docker operation')}),/EXACT_PLAN_BINDING/);assert.equal(guard,false);
});

function retainedFixture({formerOwner='9000-1',id=hash('b')}={}){
 const f=fixture(),owner='9001-1',revision=sha('a'),imageId=f.candidateImageId;
 const timestamp='2026-11-19T00:00:00.000Z',args=['-e',MODERN_SCHEMA_IMAGE_INVENTORY_PROGRAM];
 const state={Status:'exited',Running:false,Pid:0,ExitCode:0,OOMKilled:false,Restarting:false,Paused:false,Dead:false,StartedAt:timestamp,FinishedAt:timestamp};
 const native={id,imageId,state,entrypoint:['node'],cmd:args,user:'phoenix',labels:{
  'phoenix.schema.owner':formerOwner,'phoenix.schema.role':'readonly-inventory','org.opencontainers.image.revision':revision},
  name:'/retained-fixture',ports:{},mounts:[],capDrop:['ALL'],networkMode:'none',networks:{none:{IPAddress:'',GlobalIPv6Address:''}},readonly:true,pidMode:'',privileged:false,
  restarts:0,restartPolicy:{Name:'no',MaximumRetryCount:0}};
 const receipt={completedAtMs:Date.parse(timestamp)+1000,value:{owner:formerOwner,targetSha:revision,
  schema:'phoenix.modern-schema-public-preparation-hold/v1',prepared:false,failure:'HOST_SURFACE'}};
 const repository='ghcr.io/ivanzhao299/phoenix-erp-v3/api',manifest='sha256:'+hash('e');
 const pull={bytes:Buffer.from(`Digest: ${manifest}\nStatus: Downloaded newer image\n${repository}:sha-${revision}\n`),completedAtMs:Date.parse(timestamp)-1000};
 const bakedEnv=['NODE_ENV=production','PATH=/usr/local/bin:/usr/bin:/bin'];
 const inspector=[id,imageId,state,timestamp,imageId,'node',args,['no-new-privileges'],null,'private','',null,null,null,{},[],null,null,false,'','private',false,bakedEnv,'/app'];
 const image=[imageId,revision,[`${repository}@${manifest}`],bakedEnv,'/app'];
 const log={major:20,uid:100,records:f.compiled};
 const binding={owner,targetSha:f.targetSha},calls=[];
 const dependencies={
  directory:'/owned-state',
  readReceipt(file){assert.equal(file,'/owned-state/.transport-'+formerOwner+'-prepare.receipt');return receipt;},
  readPull(file){assert.equal(file,'/owned-state/schema-release-preparation-'+formerOwner+'/candidate-pull.stdout');return pull;},
  absent(file){assert.ok(file.startsWith('/owned-state/'));return true;},
  git(_root,args){assert.deepEqual(args,['merge-base','--is-ancestor',revision,f.targetSha]);},
  readSource(_root,ref){assert.equal(ref,revision);return f.source;},
  docker(args){
   calls.push(args[0]);
   if(args[0]==='inspect'){assert.equal(args[1],id);return inspector.map(value=>JSON.stringify(value)).join('\t');}
   if(args[0]==='image'){assert.deepEqual(args.slice(0,3),['image','inspect',imageId]);return image.map(value=>JSON.stringify(value)).join('\t');}
   assert.deepEqual(args,['logs',id]);return JSON.stringify(log);
  },
 };
 return {native,receipt,pull,inspector,image,log,binding,dependencies,calls,owner};
}
test('a prior failed prepare can retain its exact inert inventory and continuous native pin',()=>{
 const {native,binding,receipt,pull,dependencies,inspector,calls}=retainedFixture();
 const pin=collectRetainedModernSchemaInventory(native,binding,dependencies);
 assert.equal(pin.id,native.id);
 assert.equal(pin.classification,'RETAINED_FAILED_PREPARATION_READONLY_INVENTORY');
 assert.deepEqual(calls,['inspect','image','logs']);
 verifyRetainedModernSchemaInventoryPin(native,pin,dependencies);
 assert.deepEqual(calls,['inspect','image','logs','inspect']);
 inspector[7]=[];
 assert.throws(()=>verifyRetainedModernSchemaInventoryPin(native,pin,dependencies),/RETAINED_INVENTORY_NATIVE_PIN_REQUIRED/);
 inspector[7]=['no-new-privileges'];
 receipt.value.failure='BACKUP';
 assert.throws(()=>verifyRetainedModernSchemaInventoryPin(native,pin,dependencies),/RETAINED_INVENTORY_PIN_CHANGED/);
 receipt.value.failure='HOST_SURFACE';
 pull.completedAtMs--;
 assert.throws(()=>verifyRetainedModernSchemaInventoryPin(native,pin,dependencies),/RETAINED_INVENTORY_PIN_CHANGED/);
 receipt.value.failure='HOST_SURFACE_SINGLE_IPV4_RUNTIME_NETWORK_REQUIRED';
 assert.equal(collectRetainedModernSchemaInventory(native,binding,dependencies).id,native.id);
 for(const failure of ['BACKUP','BACKUP_FACTS','BACKUP_CLEANUP_UNRESOLVED']){
  receipt.value.failure=failure;
  assert.equal(collectRetainedModernSchemaInventory(native,binding,dependencies).id,native.id);
 }
 const backupPin=collectRetainedModernSchemaInventory(native,binding,dependencies);
 receipt.value.owner='9000-2';
 assert.throws(()=>verifyRetainedModernSchemaInventoryPin(native,backupPin,dependencies),/RETAINED_FAILED_PREPARATION_REQUIRED/);
});

test('a completed, unconsumed preparation binds its exact inert inventory and cannot be reused as authorization',()=>{
 const f=retainedFixture(),{native,binding,dependencies,receipt,log}=f;
 const owner=native.labels['phoenix.schema.owner'],targetSha=native.labels['org.opencontainers.image.revision'];
 const prepared={schema:'phoenix.modern-schema-preparation/v1',context:{owner,targetSha,candidateImageId:native.imageId},
  ownedResources:[{containerId:native.id,imageId:native.imageId,owner,role:'readonly-inventory',revision:targetSha,network:'none',readonly:true,
   running:false,exitCode:0,productionAuthority:false,inventorySha256:canonicalDigest(log.records)}]};
 const seal=()=>({...prepared,preparationSha256:canonicalDigest(prepared)});
 const stamp=receipt.completedAtMs-500;
 dependencies.readPrepared=file=>{
  assert.equal(file,`/owned-state/schema-release-preparation-${owner}.json`);
  return {value:seal(),completedAtMs:stamp};
 };
 const publicReceipt=()=>({schema:'phoenix.modern-schema-public-preparation/v1',owner,targetSha,prepared:true,preparationSha256:seal().preparationSha256});
 receipt.value=publicReceipt();
 const pin=collectRetainedModernSchemaInventory(native,binding,dependencies);
 assert.equal(pin.classification,'RETAINED_UNCONSUMED_PREPARATION_READONLY_INVENTORY');
 verifyRetainedModernSchemaInventoryPin(native,pin,dependencies);
 dependencies.absent=file=>!file.endsWith('-run.receipt');
 assert.throws(()=>verifyRetainedModernSchemaInventoryPin(native,pin,dependencies),/RETAINED_FAILED_PREPARATION_REQUIRED/);
 dependencies.absent=()=>true;
 prepared.ownedResources[0].containerId=hash('c');receipt.value=publicReceipt();
 assert.throws(()=>collectRetainedModernSchemaInventory(native,binding,dependencies),/RETAINED_UNCONSUMED_PREPARATION_REQUIRED/);
 prepared.ownedResources[0].containerId=native.id;prepared.ownedResources[0].inventorySha256=hash('f');receipt.value=publicReceipt();
 assert.throws(()=>collectRetainedModernSchemaInventory(native,binding,dependencies),/RETAINED_UNCONSUMED_PREPARATION_INVENTORY_CHANGED/);
});

test('labels cannot replace protected prior failure, ancestry, output or exact isolation',()=>{
 for(const mutate of [
  f=>{f.receipt.value.owner='8888-1';},f=>{f.receipt.value.targetSha=sha('b');},
  f=>{f.receipt.value.prepared=true;},f=>{f.receipt.value.failure='HOST_SURFACE_OTHER_PRIVATE';},
  f=>{f.receipt.value.failure='BACKUP_OTHER_PRIVATE';},
  f=>{f.receipt.value.extra='not a public receipt';},f=>{f.receipt.completedAtMs=Date.parse(f.native.state.FinishedAt)-1;},
  f=>{f.dependencies.readReceipt=()=>{throw Error('missing or untrusted');};},
  f=>{f.dependencies.readPull=()=>{throw Error('missing or untrusted');};},
  f=>{f.pull.bytes=Buffer.concat([Buffer.from('Digest: sha256:'+hash('1')+'\n'),f.pull.bytes]);},
  f=>{f.pull.bytes=Buffer.from(f.pull.bytes.toString().replace(':sha-'+sha('a'),':sha-'+sha('b')));},
  f=>{f.pull.completedAtMs=Date.parse(f.native.state.StartedAt)+1;},
  f=>{f.image[2]=['example.org/api@sha256:'+hash('e')];},
  f=>{f.image[2]=['ghcr.io/ivanzhao299/phoenix-erp-v3/api@sha256:'+hash('f')];},
  f=>{f.image[1]=sha('b');},f=>{f.inspector[22]=['NODE_OPTIONS=--require=/different'];},
  f=>{f.inspector[23]='/different';},f=>{f.inspector[20]='host';},f=>{f.inspector[21]=true;},
  f=>{f.dependencies.absent=()=>false;},f=>{f.dependencies.git=()=>{throw Error('not ancestor');};},
  f=>{f.native.labels['phoenix.schema.owner']=f.owner;},
  f=>{f.native.state.ExitCode=1;},f=>{f.native.state.Pid=42;},f=>{f.native.state.OOMKilled=true;},
  f=>{f.native.restarts=1;},f=>{f.native.privileged=true;},f=>{f.native.pidMode='host';},
  f=>{f.native.networkMode='bridge';},f=>{f.native.mounts.push({Type:'bind'});},f=>{f.native.capDrop=[];},
  f=>{f.native.readonly=false;},f=>{f.native.user='root';},f=>{f.inspector[4]='mutable:tag';},
  f=>{f.inspector[6]=['-e','unreviewed'];},f=>{f.inspector[7]=['seccomp=unconfined'];},
  f=>{f.inspector[8]=['SYS_ADMIN'];},f=>{f.inspector[14]={'3100/tcp':[]};},
  f=>{f.log.records[0].className='NotInGit';},f=>{f.log.extra='not inventory';},
 ]){
  const f=retainedFixture();mutate(f);
  assert.throws(()=>collectRetainedModernSchemaInventory(f.native,f.binding,f.dependencies));
  assert.ok(f.calls.every(operation=>['inspect','image','logs'].includes(operation)));
 }
});

test('the formal host surface sorts retained pins and holds on two exact probes for one prior owner',()=>{
 const first=retainedFixture(),other=retainedFixture({formerOwner:'8999-1',id:hash('a')});
 const duplicate=retainedFixture({id:hash('a')});
 const networkId=hash('9'),bridge='br-'+networkId.slice(0,12);
 const runtime=Object.fromEntries(['api','web','db'].map((service,index)=>{
  const id=hash(String(index+1)),imageId='sha256:'+hash('1'),state={Running:true,Pid:process.pid,StartedAt:'started',Health:{Status:'healthy'}};
  const port=index===0?'3100':index===2?'5432':null;
  return [service,{id,imageId,state,restarts:0,name:'/'+service,networks:{prod:{NetworkID:networkId,IPAddress:'172.29.248.'+(index+2),GlobalIPv6Address:''}},
   ports:port?{[port+'/tcp']:[{HostIp:'127.0.0.1',HostPort:port}]}:{},networkMode:'prod',mounts:[],privileged:false,pidMode:'',labels:{},
   readonly:false,capDrop:[],user:'phoenix',restartPolicy:{Name:'always'},entrypoint:null,cmd:null}];
 }));
 const containers=Object.fromEntries(Object.entries(runtime).map(([service,value])=>[service,{id:value.id,image:value.imageId,startedAt:value.state.StartedAt,restartCount:0}]));
 const net={Id:networkId,Driver:'bridge',Scope:'local',EnableIPv6:false,IPAM:{Config:[{Subnet:'172.29.248.0/24'}]},
  Labels:{'com.docker.compose.project':'phoenix-erp'},Containers:Object.fromEntries(Object.values(runtime).map(value=>[value.id,{}]))};
 const collect=(retained)=>{
  const values=[...Object.values(runtime),...retained.map(f=>f.native)];
  const fixtureForFile=file=>retained.find(f=>file.includes(f.native.labels['phoenix.schema.owner'])).dependencies;
  return collectModernSchemaHostSurface({containers,targetSha:first.binding.targetSha,deployRunId:first.binding.owner},{
   guard(){},captureSchedulers:()=>[],processIds:()=>[],
   retainedInventory:{...first.dependencies,readReceipt:file=>fixtureForFile(file).readReceipt(file),readPull:file=>fixtureForFile(file).readPull(file)},
   run(binary,args){
    if(binary==='/usr/sbin/ip')return JSON.stringify([{ifname:bridge,ifindex:2,linkinfo:{info_kind:'bridge'}}]);
    assert.equal(binary,'/usr/bin/docker');
    switch(args[0]){
     case 'ps':return values.map(value=>value.id).join('\n');
     case 'network':return JSON.stringify([net]);
     case 'exec':return '{"nonLoopback":0}';
     case 'inspect':{
      if(!args[3].includes('.Name'))return retained.find(f=>f.native.id===args[1]).dependencies.docker(args);
      const v=values.find(value=>value.id===args[1]);
      return [v.id,v.imageId,v.name,v.state,v.restarts,v.networkMode,v.ports,v.networks,v.labels,v.mounts,v.privileged,v.pidMode,v.readonly,v.capDrop,
       v.user,v.restartPolicy,v.entrypoint,v.cmd].map(value=>JSON.stringify(value)).join('\t');
     }
     case 'image':return first.dependencies.docker(args);
     case 'logs':return retained.find(f=>f.native.id===args[1]).dependencies.docker(args);
     default:assert.fail('Unexpected Docker operation');
    }
   },
  });
 };
 const forward=collect([first,other]),backward=collect([other,first]);
 assert.deepEqual(forward.inertArtifacts.map(pin=>pin.id),[other.native.id,first.native.id]);
 assert.equal(forward.inertArtifactsSha256,backward.inertArtifactsSha256);
 assert.throws(()=>collect([first,duplicate]),/MODERN_SCHEMA_EXECUTORS_HOLD=RETAINED_INVENTORY_OWNER_REUSED/);
});

test('only the two exact isolated probes of an archived pre-DDL recovery are retained',()=>{
 const first=retainedFixture(),second=retainedFixture({id:hash('c')});
 const {native,log,receipt}=first,owner=native.labels['phoenix.schema.owner'],targetSha=native.labels['org.opencontainers.image.revision'];
 const recoveryOwner='9100-2',runtimeSha=sha('e');
 const preparation={schema:'phoenix.modern-schema-preparation/v1',context:{owner,targetSha,runtimeSha,candidateImageId:native.imageId},
  ownedResources:[{containerId:native.id,imageId:native.imageId,owner,role:'readonly-inventory',revision:targetSha,network:'none',readonly:true,
   running:false,exitCode:0,productionAuthority:false,inventorySha256:canonicalDigest(log.records)}]};
 const preparationSha256=canonicalDigest(preparation);
 const pending={schema:'phoenix.modern-schema-release-pending/v1',owner,targetSha,status:'HOLD',phase:'R_STOPPED',sequence:4,
  schemaRelease:{preparationSha256,contextDigest:canonicalDigest(preparation.context)}};
 const open={schema:'phoenix.modern-operator-original-open/v1',owner,recoveryOwner,formalTargetSuccess:false,manifest:{phase:'OPEN',targetSha:runtimeSha}};
 const archive={schema:'phoenix.modern-operator-pre-ddl-recovery-archive/v1',owner,recoveryOwner,requestedTargetSha:targetSha,originalRuntimeSha:runtimeSha,
  pending:{...pending,stateDigest:canonicalDigest(pending)},formalTargetSuccess:false,schemaChanged:false,markerArchived:true,publicOpenSha256:canonicalDigest(open)};
 const evidence={schema:'phoenix.modern-operator-retained-inventory/v1',owner,recoveryOwner,targetSha,preparationSha256,archiveSha256:canonicalDigest(archive),
  migrationAuthorized:false,probes:[{id:native.id,stage:'prepare',identitySha256:canonicalDigest(native)},
   {id:second.native.id,stage:'supervise',identitySha256:canonicalDigest(second.native)}]};
 for(const f of [first,second]){
  const files=new Map([
   [`schema-release-operator-retained-inventory-${owner}.json`,evidence],
   [`schema-release-operator-archive-${recoveryOwner}.json`,archive],
   [`schema-release-operator-public-open-verified-${recoveryOwner}.json`,open],
   [`schema-release-preparation-${owner}.json`,{...preparation,preparationSha256}],
  ]);
  f.dependencies.absent=file=>!files.has(path.basename(file));
  f.dependencies.readRecovered=file=>({value:files.get(path.basename(file)),completedAtMs:receipt.completedAtMs});
  f.dependencies.readReceipt=()=>assert.fail('Archived inventory cannot be mistaken for unused preparation');
 }
 const pins=[first,second].map(f=>collectRetainedModernSchemaInventory(f.native,f.binding,f.dependencies));
 assert.deepEqual(pins.map(pin=>pin.probeStage),['prepare','supervise']);
 for(const [i,f] of [first,second].entries()){
  assert.equal(pins[i].classification,'RETAINED_PRE_DDL_RECOVERED_READONLY_INVENTORY');
  verifyRetainedModernSchemaInventoryPin(f.native,pins[i],f.dependencies);
 }
 const other=retainedFixture({id:hash('f')});
 assert.throws(()=>collectRetainedModernSchemaInventory(other.native,first.binding,first.dependencies),/RECOVERED_INVENTORY_EXACT_NATIVE_PIN_REQUIRED/);
 second.native.restartPolicy.Name='always';
 assert.throws(()=>verifyRetainedModernSchemaInventoryPin(second.native,pins[1],second.dependencies),/RETAINED_INVENTORY_PIN_CHANGED/);
 archive.schemaChanged=true;
 evidence.archiveSha256=canonicalDigest(archive);
 assert.throws(()=>collectRetainedModernSchemaInventory(first.native,first.binding,first.dependencies),/RECOVERED_INVENTORY_ARCHIVE_REQUIRED/);
});

test('original-lease recovery retains probes only with a sealed OPEN and native original session exit',()=>{
 const f=retainedFixture(),{native,log,dependencies}=f,owner=native.labels['phoenix.schema.owner'],
  targetSha=native.labels['org.opencontainers.image.revision'],runtimeSha=sha('e');
 const lhs={schema:'phoenix.modern-schema-preparation/v1',context:{owner,targetSha,runtimeSha,candidateImageId:native.imageId,beforeLedgerSha256:hash('f')},
  ownedResources:[{containerId:native.id,imageId:native.imageId,owner,role:'readonly-inventory',network:'none',readonly:true,
   running:false,exitCode:0,productionAuthority:false,inventorySha256:canonicalDigest(log.records)}]};
 const contextDigest=canonicalDigest(lhs.context),preparationSha256=canonicalDigest(lhs);
 const database={databaseOid:43,systemIdentifier:'421',postmasterStartMicros:'17329'};
 const lease={sessionPid:37,database},leaseSha256=canonicalDigest(lease);
 const pending={schema:'phoenix.modern-schema-release-pending/v1',owner,targetSha,status:'HOLD',phase:'R_STOPPED',sequence:4,lease,
  schemaRelease:{contextDigest,preparationSha256}};
 const stateDigest=canonicalDigest(pending),originalRuntime={containerId:hash('4'),revision:runtimeSha};
 const proof={schema:'phoenix.modern-schema-original-recovery-proof/v1',owner,contextDigest,outcome:'ABORTED_BEFORE_DDL_ORIGINAL_R_RECOVERED',
  targetSha:runtimeSha,attemptedTargetSha:targetSha,formalTargetSuccess:false,schemaChanged:false,businessActivation:false,originalLease:lease,originalRuntime};
 const publicManifest={phase:'OPEN',owner,targetSha:runtimeSha,participants:[originalRuntime]};
 const intent={schema:'phoenix.modern-schema-recovery-open-commit-intent/v1',owner,contextDigest,pendingStateDigest:stateDigest,publicManifest,
  leaseSha256,recoveryProofSha256:canonicalDigest(proof)};
 const committed={schema:'phoenix.modern-schema-recovery-open-committed/v1',owner,contextDigest,recoveredSha:runtimeSha,attemptedTargetSha:targetSha,
  commitIntentSha256:canonicalDigest(intent),publicManifestSha256:canonicalDigest(publicManifest),formalTargetSuccess:false,
  backgroundAdmissionCommitted:true,releaseAuthorized:false};
 const archive={schema:'phoenix.modern-schema-recovered-forward-archive/v1',owner,contextDigest,preparationSha256,originalLedgerSha256:lhs.context.beforeLedgerSha256,
  recoveredSha:runtimeSha,attemptedTargetSha:targetSha,defaultOff:true,formalTargetSuccess:false,automaticRetry:false,originalSessionSha256:leaseSha256,
  pending:{...pending,stateDigest},committed};
 const closed={schema:'phoenix.modern-schema-original-session-closed/v1',outcome:'ORIGINAL_SESSION_ABSENT',
  originalLeaseSha256:leaseSha256,nativeObservation:{...database,primary:true,originalSessionPresent:false}};
 const registry={schema:'phoenix.modern-operator-retained-inventory/v1',owner,recoveryOwner:owner,targetSha,preparationSha256,
  archiveSha256:canonicalDigest(archive),proofKind:'originalLease',migrationAuthorized:false,
  probes:[{id:native.id,stage:'prepare',identitySha256:canonicalDigest(native)},{id:hash('c'),stage:'supervise',identitySha256:hash('f')}]};
 const named={
  'operator-retained-inventory':registry,'original-recovery-forward-archive':archive,'original-recovery-open-commit-intent':intent,
  'original-recovery-verified':proof,'session-closed':closed,'preparation':{...lhs,preparationSha256},
 };
 const get=file=>named[path.basename(file).slice('schema-release-'.length,-(`-${owner}.json`.length))];
 dependencies.absent=file=>!get(file);
 dependencies.readRecovered=file=>({value:get(file),completedAtMs:f.receipt.completedAtMs});
 const pin=collectRetainedModernSchemaInventory(native,f.binding,dependencies);
 assert.equal(pin.classification,'RETAINED_PRE_DDL_RECOVERED_READONLY_INVENTORY');
 verifyRetainedModernSchemaInventoryPin(native,pin,dependencies);
 const rebind = (phase,sequence) => {
  archive.pending={...pending,phase,sequence};
  archive.pending.stateDigest=canonicalDigest(archive.pending);
  intent.pendingStateDigest=archive.pending.stateDigest;
  committed.commitIntentSha256=canonicalDigest(intent);
  registry.archiveSha256=canonicalDigest(archive);
 };
 for(const [phase,sequence] of [['FRESH_RECHECKED',5],['BACKUP_VERIFIED',6]]){
  rebind(phase,sequence);
  assert.equal(collectRetainedModernSchemaInventory(native,f.binding,dependencies).probeStage,'prepare');
 }
 for(const [phase,sequence] of [['FRESH_RECHECKED',4],['DDL_STARTED',7]]){
  rebind(phase,sequence);
  assert.throws(()=>collectRetainedModernSchemaInventory(native,f.binding,dependencies),/RECOVERED_INVENTORY_ARCHIVE_REQUIRED/);
 }
 rebind('R_STOPPED',4);
 closed.nativeObservation.originalSessionPresent=true;
 assert.throws(()=>collectRetainedModernSchemaInventory(native,f.binding,dependencies),/RECOVERED_INVENTORY_ARCHIVE_REQUIRED/);
});
