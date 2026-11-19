import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {modernSchemaFixture} from '../ci/modern-schema-release.fixture.mjs';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
import {ModernSchemaRegistry} from './production-modern-schema-registration.mjs';
import {modernSchemaReleaseBinding} from './production-modern-schema-state.mjs';
import {finalizeCommittedModernSchemaRecoveredOriginal,observeCommittedModernSchemaRecoveryOpen,recoverModernSchemaBeforeDdl} from './production-modern-schema-recover-original.mjs';

const hash = char => char.repeat(64);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
test('FENCED recovery observation does not parse an inadmissible unfinished private intent',()=>{
 const {context}=modernSchemaFixture();let reads=0;
 assert.equal(observeCommittedModernSchemaRecoveryOpen(context,{store:{guard(){},exists:()=>true,read(){reads++;throw Error('nlink2 or incomplete');}},readPublic:()=>({phase:'FENCED'})}),null);
 assert.equal(reads,0);
});
const at = min => new Date(Date.UTC(2026,10,19,0,min)).toISOString();
function fixture(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'phoenix-test-recover-original-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const {context}=modernSchemaFixture(), preparationSha256=hash('1');
  const events=[], flags={running:false,lease:true,ddl:false,facts:true,catalog:true,canOpen:true,canCommit:true,readiness:true,foreign:false,fence:true,publicWrite:null};
  const container=(name,digit)=>({id:hash(digit),image:'sha256:'+hash(digit),ociRevision:context.runtimeSha,
    name:'/phoenix-v3-'+name,startedAt:at(0),restartCount:0});
  const originalSnapshot={containers:{api:container('api','1'),web:container('web','2'),db:container('db','3')}};
  const active={outcome:'SUCCESS',active:Object.fromEntries(['api','web'].map(name=>[name,{revision:context.runtimeSha,
    imageId:originalSnapshot.containers[name].image}]))};
  const floor={phase:'READY',floorSha:context.floorSha,project:'phoenix-erp',chanjetPolicy:'HOLD',readonlyApproval:null};
  const networkId=hash('4'),runtimeAddress='172.20.0.10';
  const sessionPid=632,database={name:'original',schema:'public',databaseOid:733,systemIdentifier:'521376',postmasterStartMicros:'700100'};
  const rootLease={database,sessionPid,backendStartMicros:'700104'};
  const beforeLedger={legacy:[],typeorm:[{timestamp:1745578930000,name:'Proof'}]};
  context.beforeLedgerSha256=sha(JSON.stringify(beforeLedger));
  context.runtimeSnapshotSha256=canonicalDigest(originalSnapshot.containers);
  const binding=modernSchemaReleaseBinding(context,preparationSha256), contextDigest=binding.schemaRelease.contextDigest;
  const prior={containerId:originalSnapshot.containers.api.id,revision:context.runtimeSha,
    bootId:'18e1af09-55ec-4d57-8e9c-aea4165ad5b5',allowedKinds:['LOCAL']};
  const newBoot='b19847d5-2fb3-48f0-93e4-ae54ef5c4337', newStart=at(7);
  const prepareControl={protocolVersion:1,owner:'8925-1',previousFloorSha:context.runtimeSha,targetSha:context.runtimeSha,
    deployMode:'api',phase:'OPEN',generation:9,manifestDigest:hash('6'),updatedAt:at(0)};
  const preparation={context,preparationSha256,rootHeadSha:context.runtimeSha,originalSnapshot,active,floor,
    originalBackground:{record:prepareControl,participant:prior},hostSurface:{runtimeAddress,ingressScope:{networkId}}};
  const originalRestartPolicy={Name:'unless-stopped',MaximumRetryCount:0};
  let currentPolicy={Name:'no',MaximumRetryCount:0};
  const beforeFacts={schema:'phoenix.modern-schema-database-facts/v1',database:{name:database.name,systemIdentifier:database.systemIdentifier},
    allDataSha256:hash('6'),businessDataSha256:hash('7'),tables:[],newTables:[]};
  const beforeCatalog={schema:'phoenix.modern-schema-catalog-facts/v1',owner:context.owner,stage:'before',readOnly:true,
    databasePin:originalSnapshot.containers.db,schemaSha256:hash('8')};
  const beforeRaw=JSON.stringify({conclusion:'HOLD'});
  const beforeAudit={originalAudit:beforeRaw,evidence:{schema:'phoenix.legacy-egg-audit-evidence/v1',originalAuditSha256:sha(beforeRaw),
    observedLedgerSha256:context.beforeLedgerSha256,originalConclusion:'HOLD'}};
  const fenced={protocolVersion:1,phase:'FENCED',owner:context.owner,generation:10,targetSha:context.targetSha,participants:[prior]};
  let manifest=fenced;
  const typed={...binding,protocolVersion:1,phase:'FENCED',generation:10,manifestDigest:sha(JSON.stringify(fenced)),updatedAt:at(2)};
  const inspectDirectory=dir=>{const s=fs.lstatSync(dir);return [{dev:s.dev,ino:s.ino}];};
  const store=new ModernSchemaRegistry({directory,expectedUid:process.getuid(),guard(){},inspectDirectory});
  const name=stem=>'schema-release-'+stem+'-'+context.owner+'.json';
  const write=(file,value)=>fs.writeFileSync(store.file(file),JSON.stringify(value)+'\n',{mode:0o600});
  const content={schema:'phoenix.modern-schema-release-pending/v1',...binding,phase:'FRESH_RECHECKED',sequence:5,status:'HOLD',
    lease:rootLease,supervisor:{pid:process.pid,parentPid:process.ppid,startTicks:'192849',bootId:'fixture'},
    receiptSha256:hash('9'),updatedAt:at(5)};
  const pending={...content,stateDigest:canonicalDigest(content)};
  write('schema-release-pending.json',pending);
  write('floor.json',floor);write('active.json',active);write('background-control.json',typed);
  write('background-generation.json',{generation:10});write(name('preparation'),preparation);
  write(name('before-facts'),beforeFacts);write(name('before-schema'),beforeCatalog);write(name('before-audit'),beforeAudit);
  const stopped={schema:'phoenix.modern-schema-original-runtime-stopped/v1',containerId:prior.containerId,imageId:originalSnapshot.containers.api.image,
    startedAt:originalSnapshot.containers.api.startedAt,restartCount:0,originalRestartPolicy,exitCode:0,pid:0,
    oomKilled:false,signal:'TERM',automaticKill:false,oldDatabaseSessionsGone:true};
  const stoppedEvidence={runtimeStopReceipt:stopped,nativeExecutors:{complete:true}};
  write('schema-release-step-'+context.owner+'-4-r-stopped.json',{...binding,schema:'phoenix.modern-schema-release-step/v1',
    sequence:4,to:'R_STOPPED',payload:{schema:'phoenix.modern-schema-step-evidence/v1',kind:'R_STOPPED',contextDigest,
      evidence:stoppedEvidence,evidenceSha256:canonicalDigest(stoppedEvidence)}});
  const inspectActual=id=>{
    const local=Object.values(originalSnapshot.containers).find(pin=>pin.id===id),api=id===prior.containerId;
    return {id, name:local.name,imageId:local.image,restarts:0,state:{Running:!api||flags.running,StartedAt:api&&flags.running?newStart:local.startedAt,
      OOMKilled:false,Restarting:false,Paused:false,Health:{Status:'healthy'}},restartPolicy:api?currentPolicy:{Name:'no'},
      networks:{owned:{NetworkID:networkId,IPAddress:runtimeAddress}}};
  };
  const session={connected:()=>flags.lease,verifyParticipants:async pins=>{assert.equal(pins[0].bootId,newBoot);return true;}};
  const coordinator={session,manifest:fenced,async verifyQuiescent(participants){
    assert.equal(manifest.phase,'FENCED');assert.equal(participants[0].bootId,newBoot);events.push('quiescent');
  }};
  const command=args=>{
    if(args[0]==='exec')return JSON.stringify({ready:flags.readiness,dbConnected:true,status:200});
    if(args[0]==='image')return context.runtimeSha;
    assert.equal(args[0],'inspect');
    return args[1]==='phoenix-v3-api'?active.active.api.imageId:active.active.web.imageId;
  };
  const args={context,preparationSha256,state:{read:()=>store.read('schema-release-pending.json'),ddlIntentExists:()=>flags.ddl},
    rootLease,session,coordinator,originalSnapshot,originalRestartPolicy,beforeFacts,beforeLedger,beforeCatalog,client:{async query(sql){
      if(sql.includes('AS observation')){
        const sessions=[{pid:sessionPid,databaseOid:733,backendStartMicros:'700104',clientAddress:null,applicationName:'root'}];
        if(flags.running)sessions.push({pid:644,databaseOid:733,backendStartMicros:'700110',clientAddress:runtimeAddress,applicationName:'api'});
        if(flags.foreign)sessions.push({pid:655,databaseOid:733,backendStartMicros:'700112',clientAddress:'172.20.0.9',applicationName:'foreign'});
        return {rows:[{observation:JSON.stringify({primary:true,statsComplete:true,databaseOid:733,observerPid:673,workers:[],
          systemIdentifier:'521376',postmasterStartMicros:'700100',enabledSubscriptions:0,preparedTransactions:0,sessions})}]};
      }
      return {rows:[{jsonb_build_object:JSON.stringify(beforeLedger)}]};
    }},
    ingress:{get state(){return flags.fence?'FENCED':'RELEASED';},names(){return flags.fence?['fixture-owned']:[];},async observe(){assert.equal(flags.fence,true);events.push('fenced');},
      async releaseRecoveredOriginal(admit){
        assert.equal(manifest.phase,'FENCED');assert.equal(await admit(),true);events.push('release-ingress');
        flags.fence=false;
        const receipt={schema:'phoenix.modern-schema-ingress-released/v1',contextDigest,owner:context.owner,
          outcome:'EXACT_OWNED_TABLES_ABSENT',automaticRetry:false};
        write(name('ingress-released'),receipt);return receipt;
      }},
    privateRuntime:{createDirectory(){return directory;},async run(command){
      events.push(command.args[0]);
      assert.ok(store.exists(name('original-recovery-intent')));
      assert.equal(command.args.at(-1),prior.containerId);
      if(command.args[0]==='start'){assert.equal(flags.fence,true);flags.running=true;}
      else {assert.equal(command.args[0],'update');currentPolicy=originalRestartPolicy;}
    }},admit:async stage=>(flags.canOpen||stage!=='RECOVERY_RELEASE_INGRESS_WHILE_FENCED')&&(flags.canCommit||stage!=='RECOVERY_PUBLISH_ORIGINAL_OPEN'),
      onPublicCommit(value){assert.equal(value.backgroundAdmissionCommitted,true);events.push('public-commit-observed');}};
  const deps={store,docker:command,now:()=>Date.parse(at(8)),authority:()=>({contextDigest,approvalSha256:hash('a')}),
    checkProcess:()=>true,checkLease:()=>flags.lease,observeRuntime:inspectActual,readPublic:()=>manifest,
    writePublic:value=>{
      assert.equal(flags.fence,false);assert.equal(manifest.phase,'FENCED');
      const intent=store.read(name('original-recovery-open-commit-intent'));
      assert.deepEqual(intent.publicManifest,value);
      assert.equal(store.read('background-generation.json').generation,value.generation);
      events.push('publish-public-open');
      if(flags.publicWrite==='beforeRename')throw Error('fenced publish failed');
      manifest=value;
      if(flags.publicWrite==='afterRename')throw Error('lost publication response after rename');
    },syncPublicDirectory(){events.push('sync-public-directory');},atomicWrite:write,
    readHead:()=>context.runtimeSha,validatePreparation:value=>value,inventoryApi:()=>[],
    observeStopped:()=>({state:{Running:false,Status:'exited',ExitCode:0,Pid:0},restartPolicy:{Name:'no'}}),
    async captureFacts(){return {...beforeFacts,allDataSha256:flags.facts?beforeFacts.allDataSha256:hash('0')};},
    async captureCatalog({stage,admit}){
      assert.equal(await admit(),true);
      const receipt={...beforeCatalog,stage,schemaSha256:flags.catalog?beforeCatalog.schemaSha256:hash('0')};
      write(name(stage+'-schema'),receipt);
      return {receipt};
    },
    inspectApi(participant){
      const bootId=flags.badBoot?prior.bootId:newBoot;
      return {containerId:participant.containerId,revision:context.runtimeSha,imageId:originalSnapshot.containers.api.image,
        startedAt:newStart,status:{protocolVersion:1,bootId,poisoned:false,stopping:false,owner:manifest.owner,
          phase:manifest.phase,generation:manifest.generation,inFlight:0,taskGraphs:0,pendingChildren:0,
          controlSession:{connected:true,broken:false,sessionPid:644,databaseOid:733,backendStartedAt:at(7)}}};
    }};
  return {args,deps,store,flags,events,name,changeManifest:()=>{manifest={...manifest,generation:99};},state:()=>store.read('background-control.json'),run:()=>recoverModernSchemaBeforeDdl(args,deps)};
}

test('same original native lease can release exact R only before DDL, after original boot and facts verification',async t=>{
  const f=fixture(t),result=await f.run();
  assert.equal(result.outcome,'ABORTED_BEFORE_DDL_ORIGINAL_R_RECOVERED');
  assert.equal(result.formalTargetSuccess,false);assert.equal(result.pendingMarkerCleared,false);assert.equal(result.forwardFinalizationRequired,true);
  assert.equal(f.state().targetSha,f.args.context.runtimeSha);assert.equal(f.state().phase,'OPEN');
  assert.equal(f.state().generation,11);assert.equal(f.store.exists('schema-release-pending.json'),true);
  assert.equal(f.store.exists('deploy-'+f.args.context.owner+'.json'),false);
  assert.deepEqual(f.events,['fenced','start','quiescent','update','quiescent','release-ingress','publish-public-open','public-commit-observed']);
});
test('DDL intent, lost lease, changed facts or catalog, unknown executor and missing protected audit forbid starting R',async t=>{
  for(const [name,value,error] of [
    ['ddl',true,/NO_DDL_AND_ORIGINAL_LEASE/],['lease',false,/NO_DDL_AND_ORIGINAL_LEASE/],
    ['facts',false,/PRE_DDL_NATIVE_FACTS_CHANGED/],['catalog',false,/ORIGINAL_NATIVE_CATALOG_CHANGED/],
    ['foreign',true,/UNKNOWN_OR_NEW_DATABASE_EXECUTOR/],
  ]){
    const f=fixture(t);f.flags[name]=value;await assert.rejects(f.run(),error);
    assert.equal(f.events.includes('start'),false);assert.equal(f.store.exists('schema-release-pending.json'),true);
    assert.equal(f.flags.fence,true);assert.equal(f.state().phase,'FENCED');
  }
  const f=fixture(t);
  fs.unlinkSync(f.store.file(f.name('before-audit')));
  await assert.rejects(f.run());assert.equal(f.events.includes('start'),false);
});
test('a restarted executor without new proof or lease loss preserves the pending deny and ingress',async t=>{
  for(const [name,value,error] of [['readiness',false,/ORIGINAL_READY_UNPROVED/],['canOpen',false,/AUTHORITY_LOST/],['badBoot',true,/NEW_ORIGINAL_BOOT/]]){
    const f=fixture(t);f.flags[name]=value;await assert.rejects(f.run(),error);
    assert.equal(f.events.includes('start'),true);assert.equal(f.store.exists('schema-release-pending.json'),true);
    assert.equal(f.flags.fence,true);assert.equal(f.state().phase,'FENCED');
  }
  const f=fixture(t);
  const wrapper=f.args.privateRuntime.run;
  f.args.privateRuntime.run=async (...args)=>{await wrapper(...args);f.flags.lease=false;};
  await assert.rejects(f.run(),/NO_DDL_AND_ORIGINAL_LEASE/);
  assert.equal(f.flags.fence,true);assert.equal(f.store.exists('schema-release-pending.json'),true);
});

test('last asynchronous admission cannot conceal a new boot, changed OPEN or reappearing ingress', async t=>{
  for(const [change,error] of [
    [f=>{f.flags.badBoot=true;},/PARTICIPANT_MISSING_POISONED_OR_UNCONNECTED/],
    [f=>f.changeManifest(),/RECOVERY_TERMINAL_NATIVE_STATE_CHANGED/],
    [f=>{f.flags.fence=true;},/RECOVERY_TERMINAL_NATIVE_STATE_CHANGED/],
  ]){
    const f=fixture(t);
    f.args.admit=async stage=>{if(stage==='RECOVERY_CLEAR_PENDING')change(f);return true;};
    await assert.rejects(f.run(),error);
    assert.equal(f.store.exists('schema-release-pending.json'),true);
  }
});

test('after real ingress release, pre-commit failure still leaves public FENCED and retains pending', async t=>{
  for(const mode of ['permission','write']){
    const f=fixture(t);
    if(mode==='permission')f.flags.canCommit=false;else f.flags.publicWrite='beforeRename';
    await assert.rejects(f.run(),mode==='permission'?/AUTHORITY_LOST/:/fenced publish failed/);
    assert.equal(f.flags.fence,false);
    assert.equal(f.deps.readPublic().phase,'FENCED');
    assert.equal(f.store.exists('schema-release-pending.json'),true);
    assert.equal(observeCommittedModernSchemaRecoveryOpen(f.args.context,f.deps),null);
    assert.ok(!f.events.includes('public-commit-observed'));
  }
});

test('exact protected public commit survives an interrupted response, and is never treated as unpublished', async t=>{
  const f=fixture(t);f.flags.publicWrite='afterRename';
  const result=await f.run();
  assert.equal(result.pendingMarkerCleared,false);
  assert.equal(result.committed.backgroundAdmissionCommitted,true);
  assert.deepEqual(observeCommittedModernSchemaRecoveryOpen(f.args.context,f.deps),result.committed);
  assert.ok(f.events.indexOf('sync-public-directory')<f.events.indexOf('public-commit-observed'));
  assert.equal(f.deps.readPublic().targetSha,f.args.context.runtimeSha);
  const again=fixture(t);again.flags.publicWrite='afterRename';
  again.deps.syncPublicDirectory=()=>{throw Error('unresolved public durability');};
  await assert.rejects(again.run(),/unresolved public durability/);
  assert.equal(again.store.exists('schema-release-pending.json'),true);
  assert.equal(again.events.includes('public-commit-observed'),false);
  assert.equal(observeCommittedModernSchemaRecoveryOpen(again.args.context,again.deps).backgroundAdmissionCommitted,true);
});

async function stoppedBeforeCleanup(t) {
  const f=fixture(t);
  f.args.admit=async stage=>stage!=='RECOVERY_CLEAR_PENDING';
  await assert.rejects(f.run(),/AUTHORITY_LOST/);
  assert.equal(f.deps.readPublic().phase,'OPEN');
  assert.equal(f.store.exists('schema-release-pending.json'),true);
  const {database}=f.args.rootLease,originalQuery=f.args.client.query;
  const state={oldS:false,durability:true,scopePresent:false,rebootAfterRead:false};
  f.args.client.query=async sql=>{
    if(sql.includes('originalSessionPresent'))return {rows:[{primary:true,databaseOid:database.databaseOid,
      systemIdentifier:database.systemIdentifier,postmasterStartMicros:database.postmasterStartMicros,originalSessionPresent:state.oldS}]};
    if(sql.includes('to_regclass')) {
      if(state.rebootAfterRead)f.flags.badBoot=true;
      return {rows:Array.from(sql.matchAll(/'(production_[a-z_]+)'/g),([,name])=>({name,present:state.scopePresent}))};
    }
    return originalQuery(sql);
  };
  const deps={...f.deps,authority(){throw Error('a recovered release cannot request new approval');},
    now:()=>Date.parse(f.args.context.window.end)+3600000,ingressAbsent:()=>!f.flags.fence,
    confirmDurability(read,guard){guard();read();return {durabilityConfirmed:state.durability};}};
  return {...f,forwardState:state,forward:()=>finalizeCommittedModernSchemaRecoveredOriginal(f.args,deps)};
}

test('original R release can finish after expiry without republishing OPEN or restarting R',async t=>{
  const f=await stoppedBeforeCleanup(t),events=[...f.events];
  const result=await f.forward();
  assert.equal(result.formalTargetSuccess,false);
  assert.equal(result.pendingMarkerCleared,true);
  assert.equal(result.defaultOff,true);
  assert.deepEqual(f.events,events);
  assert.equal(f.store.exists('schema-release-pending.json'),false);
  assert.deepEqual(await f.forward(),result);
});

test('R forward cleanup cannot clear a pending marker with an uncertain DDL, prior S or changed live proof',async t=>{
  for(const change of [
    f=>{f.forwardState.oldS=true;},f=>{f.forwardState.durability=false;},f=>{f.forwardState.scopePresent=true;},
    f=>{f.forwardState.rebootAfterRead=true;},
    f=>{f.flags.fence=true;},
    f=>f.store.immutable('schema-release-step-'+f.args.context.owner+'-7-ddl-started.json',{}),
  ]){
    const f=await stoppedBeforeCleanup(t);change(f);
    await assert.rejects(f.forward());
    assert.equal(f.store.exists('schema-release-pending.json'),true);
    assert.equal(f.deps.readPublic().phase,'OPEN');
  }
});
