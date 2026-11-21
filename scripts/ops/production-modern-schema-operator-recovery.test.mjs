import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {spawn} from 'node:child_process';
import {modernSchemaFixture} from '../ci/modern-schema-release.fixture.mjs';
import {digest} from './chanjet-admission-schema-receipt.mjs';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
import {MODERN_SCHEMA_PHASES,modernSchemaReleaseBinding,modernSchemaStepEvidence} from './production-modern-schema-state.mjs';
import {MODERN_SCHEMA_LEASE_SQL} from './production-modern-schema-session-lease.mjs';
import {MODERN_SCHEMA_EXECUTOR_SQL} from './production-modern-schema-executors.mjs';
import {confirmsResidualTermEvents,createModernSchemaOperatorRecoveryVerifier,sameOperatorControlSession,verifyRecoveryHostProcessCensus} from './production-modern-schema-operator-recovery.mjs';
import {pinModernSchemaChild} from './production-modern-schema-processes.mjs';

const hash = char => char.repeat(64);
const at = minutes => new Date(Date.UTC(2026,10,19,0,minutes)).toISOString();
const noRestart = {Name:'no',MaximumRetryCount:0};
const originalPolicy = {Name:'unless-stopped',MaximumRetryCount:0};
const oldBoot = '18e1af09-55ec-4d57-8e9c-aea4165ad5b5';
const newBoot = 'b19847d5-2fb3-48f0-93e4-ae54ef5c4337';
const firstBoot = 'e464eb48-78b8-4eb4-a25d-1c86e785b159';

function fixture({residual=false}={}){
  const {context} = modernSchemaFixture();
  if(residual)Object.assign(context,{owner:'44855835842-1',targetSha:'cb843973bdff0ebabc6d4fc68d39d16a1be10522'});
  const {owner} = context, recoveryOwner = '98765-1';
  const key = suffix => `schema-release-${suffix}-${owner}.json`;
  const keyStep = (phase,sequence) => `schema-release-step-${owner}-${sequence}-${phase.toLowerCase().replaceAll('_','-')}.json`;
  const pins = Object.fromEntries(['api','web','db'].map((name,index)=>{
    const id=hash(String(index+1));
    return [name,{id,image:'sha256:'+id,restartCount:0,startedAt:at(0),ociRevision:context.runtimeSha}];
  }));
  const prior = {containerId:pins.api.id,revision:context.runtimeSha,bootId:oldBoot,allowedKinds:['LOCAL']};
  const ledger = {legacy:[],typeorm:[{timestamp:1745578930000,name:'Owned'}]};
  const database = {name:'original',schema:'public',databaseOid:72,systemIdentifier:'522',postmasterStartMicros:'700100'};
  const oldLease = {database,sessionPid:653,backendStartMicros:'700104'};
  const recoveryLease = {database,sessionPid:655,backendStartMicros:'700200'};
  context.beforeLedgerSha256 = digest(JSON.stringify(ledger));
  context.runtimeSnapshotSha256 = canonicalDigest(pins);
  context.databaseIdentitySha256 = canonicalDigest({name:database.name,schema:database.schema,systemIdentifier:database.systemIdentifier});
  const scope = {networkId:hash('4'),bridge:'br-exact',interfaceIndex:7,subnet:'172.20.0.0/24',port:3100};
  context.ingressScopeSha256=canonicalDigest(scope);
  const manifest = {protocolVersion:1,phase:'FENCED',owner,generation:84,targetSha:context.targetSha,participants:[prior]};
  const preparationSha256 = hash('1'), contextDigest = canonicalDigest(context);
  const approvalSha256 = hash('3');
  const supervisor = {pid:999,parentPid:998,startTicks:'700002',bootId:oldBoot};
  const binding = modernSchemaReleaseBinding(context,preparationSha256);
  const originalSnapshot = {containers:pins};
  const active = {active:Object.fromEntries(['api','web'].map(name=>[name,{imageId:pins[name].image,revision:context.runtimeSha}]))};
  const floor = {project:'phoenix-erp',chanjetPolicy:'HOLD',readonlyApproval:null};
  const runtimeAddress = '172.20.0.5';
  const preparation = {context,preparationSha256,originalSnapshot,active,floor,ingressScope:scope,rootHeadSha:context.targetSha,
    originalBackground:{participant:prior},hostSurface:{runtimeAddress,ingressScope:scope}};
  const installed = {schema:'phoenix.modern-schema-ingress-observation/v1',owner,contextDigest,scopeSha256:context.ingressScopeSha256,
    state:'FENCED',identitySha256:hash('5')};
  const stop = {schema:'phoenix.modern-schema-original-runtime-stopped/v1',containerId:pins.api.id,imageId:pins.api.image,startedAt:pins.api.startedAt,
    restartCount:0,signal:'TERM',exitCode:0,pid:0,oomKilled:false,automaticKill:false,oldDatabaseSessionsGone:true,
    currentRestartPolicy:noRestart,originalRestartPolicy:originalPolicy};
  const registry = new Map(), directories = new Set();
  const store = {directory:'/protected',io:{lstatSync:file=>directories.has(file)?{}:undefined},guard(){},
    file:name=>path.join('/protected',name),exists:name=>registry.has(name),read:name=>{
      assert.ok(registry.has(name),name);return structuredClone(registry.get(name));
    }};
  const phase=residual?'R_STOP_INTENT':'R_STOPPED',terminalSequence=residual?3:4;
  const payloads = [{approvalSha256,supervisor},{},{ingressObservation:installed},
    {originalRestartPolicy:originalPolicy,originalSnapshotSha256:context.runtimeSnapshotSha256},{runtimeStopReceipt:stop}];
  let receiptSha256 = null;
  for(const [sequence,phase] of MODERN_SCHEMA_PHASES.slice(0,terminalSequence+1).entries()){
    const step = {...binding,schema:'phoenix.modern-schema-release-step/v1',sequence,to:phase,from:MODERN_SCHEMA_PHASES[sequence-1]??null,
      previousDigest:receiptSha256,payload:sequence===0?payloads[0]:modernSchemaStepEvidence(context,phase,payloads[sequence]),recordedAt:at(sequence+2)};
    receiptSha256=canonicalDigest(step);
    registry.set(keyStep(phase,sequence),step);
  }
  const pending = {schema:'phoenix.modern-schema-release-pending/v1',...binding,supervisor,phase,status:'HOLD',sequence:terminalSequence,
    lease:oldLease,receiptSha256,updatedAt:at(7)};
  registry.set('schema-release-pending.json',{...pending,stateDigest:canonicalDigest(pending)});
  const oldGone = {primary:true,databaseOid:database.databaseOid,systemIdentifier:database.systemIdentifier,
    postmasterStartMicros:database.postmasterStartMicros,originalSessionPresent:false};
  registry.set(key('session-closed'),{schema:'phoenix.modern-schema-original-session-closed/v1',
    outcome:'ORIGINAL_SESSION_ABSENT',originalLeaseSha256:canonicalDigest(oldLease),nativeObservation:oldGone});
  const catalogKey = key('hold-observation-schema');
  const rawCatalog = {path:path.join('/protected',`schema-release-session-${owner}`,'catalog-hold-observation.stdout'),
    bytes:2000,sha256:hash('e')};
  const holdCatalog = {schema:'phoenix.modern-schema-catalog-facts/v1',owner,stage:'hold-observation',readOnly:true,releaseAuthorized:false,
    databasePin:pins.db,schemaSha256:hash('6'),raw:rawCatalog};
  registry.set(catalogKey,holdCatalog);
  if(residual)registry.set(key('supervisor-first-hold'),{schema:'phoenix.modern-schema-supervisor-first-hold/v1',owner,contextDigest,
    pendingPhase:phase,failure:{source:'SUPERVISOR',stage:'BEFORE_STOPPED_PROOF',code:'UNCLASSIFIED'}});
  registry.set(`recovery-modern-schema-${owner}.json`,{schema:'phoenix.modern-schema-release-hold-observation/v1',
    owner,targetSha:context.targetSha,phase,backgroundAdmissionCommitted:false,originalRecoveryCommitted:false,terminalComplete:false,defaultOff:true,
    nativeLedger:{status:'OBSERVED',ledger,sha256:context.beforeLedgerSha256},
    nativeSchema:{status:'OBSERVED',file:store.file(catalogKey),sha256:canonicalDigest(holdCatalog)},
    nativeExecutors:{status:'OBSERVED',value:{...oldGone,preparedTransactions:0,sessions:[]}},
  });
  registry.set(key('preparation'),preparation);
  registry.set(key('ingress-installed'),installed);
  registry.set('background-control.json',{...binding,phase:'FENCED',generation:84,manifestDigest:digest(JSON.stringify(manifest))});
  registry.set('background-generation.json',{schema:'phoenix.background-generation/1',generation:84});
  registry.set('floor.json',floor);
  registry.set('active.json',active);
  const flags = {running:false,admitted:true,fenced:true,oldPresent:false,foreign:false,leaseOk:true,originalDb:true,ready:true,
    newBoot,startedAt:at(9),previousStartedAt:pins.api.startedAt,finishedAt:at(8),catalogSha256:holdCatalog.schemaSha256,
    rawSha256:rawCatalog.sha256,factsSha256:hash('7'),heartbeatSamples:0,wrongControlName:false,
    ledgerSha256:context.beforeLedgerSha256,address:runtimeAddress,residualRunning:false,listenerClosed:true,firstTermAccepted:true,exitCode:0};
  const events = [];
  const pid = 756, controlSession = {sessionPid:pid,databaseOid:database.databaseOid,backendStartedAt:at(9),connected:true,broken:false};
  const session = (sessionPid,backendStartMicros,clientAddress) => ({pid:sessionPid,backendStartMicros,clientAddress,databaseOid:database.databaseOid,openTransaction:false});
  const parseSessionStart = atTime => String(Date.parse(atTime)*1000);
  const historicalIdle={...session(pid,parseSessionStart(at(0)),runtimeAddress),applicationName:''};
  const parameters = {owner,recoveryOwner,recoveryLease,requireAdmission:async()=>flags.admitted,
    observeFences:async()=>flags.fenced?installed.identitySha256:hash('a')};
  const dependencies = {store,readPublic:()=>structuredClone(manifest),readHead:()=>preparation.rootHeadSha,
    // The fixture drives the pre-existing preparation and approval validators
    // through their adapter boundary without recreating unrelated audit data.
    validatePreparation:(_record,when)=>{assert.equal(when,Date.parse(at(residual?5:6)));return {context,preparationSha256};},
    readApproval:(_context,{now})=>{assert.equal(now(),Date.parse(at(residual?5:6)));return {contextDigest,approvalSha256};},
    readProtectedTerm:file=>Buffer.from(file.endsWith('.stdout')&&flags.firstTermAccepted?pins.api.id+'\n':''),
    privateRuntime:{
      digest:async file=>{
        assert.ok([rawCatalog.path,rawCatalog.path.replace('hold-observation','before')].includes(file));
        return {...rawCatalog,path:file,sha256:flags.rawSha256};
      },
      createDirectory:(id,role)=>{assert.equal(id,recoveryOwner);assert.equal(role,'recovery');return '/protected/recovery';},
    },
    client:{async start(){events.push('reader-start');},async close(){events.push('reader-close');},async query(sql){
      if(sql===MODERN_SCHEMA_LEASE_SQL){
        const holder={...recoveryLease,databaseOid:database.databaseOid,sessionPid:flags.leaseOk?recoveryLease.sessionPid:888};
        return {rows:[{jsonb_build_object:JSON.stringify({...database,primary:true,holders:[holder]})}]};
      }
      if(sql===MODERN_SCHEMA_EXECUTOR_SQL||sql.includes('AS idle_pids')){
        const sessions=[session(recoveryLease.sessionPid,recoveryLease.backendStartMicros,null)];
        if(flags.running&&!flags.residualRunning)sessions.push({...session(pid,parseSessionStart(flags.startedAt),runtimeAddress),
          applicationName:flags.wrongControlName?'wrong':`phoenix-fence:${flags.newBoot}`,
          openTransaction:flags.heartbeatSamples>0&&flags.heartbeatSamples-- > 0});
        if(flags.residualRunning&&flags.residualBackend)sessions.push({...historicalIdle,openTransaction:flags.residualActive===true});
        if(flags.foreign)sessions.push(session(899,'700233','172.20.0.250'));
        const observation={...database,primary:true,statsComplete:true,preparedTransactions:0,
          enabledSubscriptions:0,sessions,workers:[],observerPid:984};
        return {rows:[{observation:JSON.stringify(observation),idle_pids:JSON.stringify(flags.residualActive?[]:[pid])}]};
      }
      assert.match(sql,/originalSessionPresent/);
      return {rows:[{...oldGone,originalSessionPresent:flags.oldPresent}]};
    }},
    docker(args){
      switch(args[0]){
        case 'inspect':return args[1].endsWith('api')?pins.api.image:pins.web.image;
        case 'image':return context.runtimeSha;
        case 'network':return JSON.stringify([{Id:scope.networkId,Containers:Object.fromEntries([
          pins.web.id,pins.db.id,...(flags.running?[pins.api.id]:[]),
        ].map(id=>[id,{}]))}]);
        case 'ps':return flags.running?pins.api.id:'';
        case 'events':return flags.termEvents??'';
        case 'exec':
          assert.equal(args[1],pins.api.id);
          if(args.at(-1).includes('LISTENER_CLOSED'))return flags.listenerClosed?'LISTENER_CLOSED':'UNRESOLVED';
          return JSON.stringify({status:flags.ready?200:503,ready:flags.ready,dbConnected:flags.ready,bodySha256:hash('8')});
        default:assert.fail(args[0]);
      }
    },
    inspectContainer(id){
      const [name,pin]=Object.entries(pins).find(([,pin])=>id===pin.id);
      const api=name==='api',running=!api||flags.running;
      return {id,imageId:pin.image,name:'/phoenix-v3-'+name,restarts:0,restartPolicy:noRestart,
        state:{Running:running,Status:running?'running':'exited',StartedAt:api?(running?flags.startedAt:flags.previousStartedAt):pin.startedAt,
          FinishedAt:flags.finishedAt,Health:{Status:name==='db'&&!flags.originalDb||api&&flags.residualRunning?'unhealthy':'healthy'},Pid:running?100:0,
          ExitCode:api?flags.exitCode:0,OOMKilled:false,Dead:false,Restarting:false,Paused:false},
        labels:{'com.docker.compose.project':floor.project,'com.docker.compose.service':name},
        networks:{native:{NetworkID:running?scope.networkId:'',IPAddress:flags.address,GlobalIPv6Address:''}}};
    },
    inspectParticipant:()=>({containerId:pins.api.id,revision:context.runtimeSha,imageId:pins.api.image,startedAt:flags.startedAt,restartCount:0,
      status:{protocolVersion:1,bootId:flags.newBoot,phase:'FENCED',owner,generation:84,poisoned:false,stopping:false,inFlight:0,taskGraphs:0,pendingChildren:0,
        controlSession:{...controlSession,backendStartedAt:flags.startedAt,applicationName:`phoenix-fence:${flags.newBoot}`}}}),
    captureLedger:async()=>({ledger,sha256:flags.ledgerSha256}),
    captureFacts:async()=>({schema:'phoenix.modern-schema-database-facts/v1',database:{name:database.name,systemIdentifier:database.systemIdentifier},
      allDataSha256:flags.factsSha256,businessDataSha256:flags.factsSha256,readOnly:true,releaseAuthorized:false}),
    verifyDefaultOff:()=>({verified:true}),
    verifyHostProcesses:()=>{
      events.push('host-process-check');
      if(flags.foreignHost)throw Error('MODERN_SCHEMA_OPERATOR_RECOVERY_HOLD=RECOVERY_HOST_PROCESS_UNACCOUNTED');
      return hash('3');
    },
    captureCatalog:async({owner,stage,databasePin,admit})=>{
      await admit();
      return {receipt:{schema:'phoenix.modern-schema-catalog-facts/v1',owner,stage,databasePin,
        readOnly:true,releaseAuthorized:false,schemaSha256:flags.catalogSha256}};
    },
  };
  const firstStartKey=key('operator-fenced-start-verified');
  const firstStart=(options={})=>{
    const startedAt=at(8),plan={schema:'phoenix.operator-original-fenced-restart/v1',owner,contextDigest,targetSha:context.targetSha,
      runtimeSha:context.runtimeSha,pendingSha256:canonicalDigest(registry.get('schema-release-pending.json')),
      holdSha256:canonicalDigest(registry.get(`recovery-modern-schema-${owner}.json`)),
      sessionClosedSha256:canonicalDigest(registry.get(key('session-closed'))),stoppedSha256:hash('9'),
      ingressSha256:canonicalDigest(installed),fencedSha256:canonicalDigest(manifest),bootOnly:true,ingressRelease:false,backgroundAdmission:false};
    registry.set(firstStartKey,{...plan,planSha:canonicalDigest(plan),participant:{...prior,bootId:firstBoot},startedAt,
      readiness:{status:200,ready:true,dbConnected:true,bodySha256:hash('8')},
      controlSession:{...controlSession,backendStartedAt:startedAt,applicationName:`phoenix-fence:${firstBoot}`},
      outcome:'EXACT_ORIGINAL_HEALTHY_FENCED',checkedAt:at(8),...options});
    Object.assign(flags,{running:true,startedAt,newBoot:firstBoot});
  };
  const terminateFirst=()=>Object.assign(flags,{running:false,previousStartedAt:at(8),finishedAt:at(9)});
  const resumeOriginal=()=>Object.assign(flags,{running:true,startedAt:at(10),newBoot});
  const failReadChannel=()=>{
    registry.delete(key('session-closed'));
    Object.assign(registry.get(`recovery-modern-schema-${owner}.json`),{
      nativeLedger:{status:'UNAVAILABLE'},nativeExecutors:{status:'UNAVAILABLE'},
    });
    registry.set(key('fenced-audit-boundary'),{});
    registry.set(key('supervisor-first-hold'),{schema:'phoenix.modern-schema-supervisor-first-hold/v1',owner,contextDigest,
      pendingPhase:'R_STOPPED',failure:{source:'SUPERVISOR',stage:'FENCED_BACKUP',code:'MODERN_SCHEMA_BACKUP_HOLD=CLEANUP_UNRESOLVED'}});
    registry.set(key('before-schema'),{...holdCatalog,stage:'before',raw:{...rawCatalog,path:rawCatalog.path.replace('hold-observation','before')}});
  };
  const failAfterFreshCheck=async(failure={source:'SUPERVISOR',stage:'FENCED_BACKUP',code:'MODERN_SCHEMA_BACKUP_HOLD=CLEANUP_UNRESOLVED'})=>{
    const ownerHold=registry.get(`recovery-modern-schema-${owner}.json`);
    ownerHold.phase='FRESH_RECHECKED';
    const facts=await dependencies.captureFacts();
    const catalog={...holdCatalog,stage:'before',raw:{...rawCatalog,path:rawCatalog.path.replace('hold-observation','before')}};
    const audit={comparison:{fenced:true}};
    registry.set(key('before-facts'),facts);
    registry.set(key('before-schema'),catalog);
    registry.set(key('fenced-audit-boundary'),audit);
    registry.set(key('supervisor-first-hold'),{schema:'phoenix.modern-schema-supervisor-first-hold/v1',owner,contextDigest,
      pendingPhase:ownerHold.phase,failure});
    const step={...binding,schema:'phoenix.modern-schema-release-step/v1',sequence:5,to:ownerHold.phase,from:'R_STOPPED',
      previousDigest:pending.receiptSha256,recordedAt:at(7),payload:modernSchemaStepEvidence(context,ownerHold.phase,{
        beforeLedgerSha256:context.beforeLedgerSha256,schemaFile:store.file(key('before-schema')),schemaSha256:canonicalDigest(catalog),
        factsFile:store.file(key('before-facts')),factsSha256:canonicalDigest(facts),auditRecheckSha256:canonicalDigest(audit.comparison),
        executorsSha256:hash('a'),
      })};
    registry.set(keyStep(ownerHold.phase,5),step);
    const advanced={...pending,phase:ownerHold.phase,sequence:5,receiptSha256:canonicalDigest(step),updatedAt:at(8)};
    registry.set('schema-release-pending.json',{...advanced,stateDigest:canonicalDigest(advanced)});
  };
  return {context,flags,parameters,dependencies,registry,directories,events,key,keyStep,oldLease,manifest,pins,installed,stop,
    firstStartKey,firstStart,terminateFirst,resumeOriginal,failReadChannel,failAfterFreshCheck,
    recordHistoricalIdle:()=>registry.get(`recovery-modern-schema-${owner}.json`).nativeExecutors.value.sessions.push(historicalIdle),
    verifier:()=>createModernSchemaOperatorRecoveryVerifier(parameters,dependencies)};
}

test('fresh original-primary checkpoints compare stopped and resumed R under both unchanged fences',async()=>{
  const f=fixture(), verifier=await f.verifier();
  await assert.rejects(verifier.verifyStarted(),/VERIFIED_STOPPED_CHECKPOINT_REQUIRED/);
  assert.deepEqual(verifier.stoppedPin,{containerId:f.pins.api.id,imageId:f.pins.api.image,restartPolicy:originalPolicy});
  const before=await verifier.captureStopped();
  f.flags.running=true;
  const observed=await verifier.verifyStarted();
  assert.equal(observed.stoppedCheckpointSha256,canonicalDigest(before));
  assert.equal(observed.participant.bootId,newBoot);
  assert.equal(observed.recoveredSha,f.context.runtimeSha);
  assert.equal(observed.attemptedTargetSha,f.context.targetSha);
  assert.equal(observed.outcome,'ORIGINAL_R_READY_UNDER_BOTH_FENCES');
  assert.equal(observed.formalTargetSuccess,false);
  assert.equal(observed.releaseAuthorized,false);
  assert.equal(f.registry.has(f.key('before-facts')),false);
  assert.equal(f.registry.get('schema-release-pending.json').phase,'R_STOPPED');
  await verifier.close();
  assert.deepEqual(f.events,['reader-start','reader-close']);
});

test('exact stopped-intent recovery proves no listener or backend before issuing one new TERM intent',async()=>{
  const f=fixture({residual:true});
  Object.assign(f.flags,{running:true,residualRunning:true,startedAt:f.pins.api.startedAt});
  const verifier=await f.verifier();
  try{
    const result=await verifier.verifyResidualOriginal();
    assert.equal(result.record.signal,'TERM');
    assert.equal(result.record.migrationAuthorized,false);
    assert.equal(result.record.containerId,f.pins.api.id);
    f.registry.set(result.key,result.record);
    f.registry.set('schema-release-operator-recovery-intent-'+f.parameters.recoveryOwner+'.json',{
      schema:'phoenix.modern-operator-recovery-intent/v1',owner:f.parameters.owner,recoveryOwner:f.parameters.recoveryOwner,
      pendingSha256:result.record.pendingSha256,target:f.context.targetSha,migrationAuthorized:false,newLease:f.parameters.recoveryLease,
    });
    const stamp=BigInt(Date.parse(result.record.recordedAt))*1000000n;
    f.flags.termEvents=['kill\t'+f.pins.api.id+'\t15\t\t'+(stamp+1n),'die\t'+f.pins.api.id+'\t\t143\t'+(stamp+2n)].join('\n');
    await assert.rejects(verifier.verifyResidualOriginal(),/SINGLE_RESIDUAL_ORIGINAL_TERM_REQUIRED/);
    Object.assign(f.flags,{running:false,residualRunning:false,exitCode:143});
    const before=await verifier.captureStopped();
    f.resumeOriginal();
    const after=await verifier.verifyStarted();
    assert.equal(after.stoppedCheckpointSha256,canonicalDigest(before));
    assert.equal(after.formalTargetSuccess,false);
    assert.equal(f.registry.has(f.keyStep('R_STOPPED',4)),false);
  }finally{await verifier.close();}
});

test('a residual terminal status needs the exact native signal and exit event in sequence',()=>{
  const cid=hash('3'),start='2026-11-21T03:20:00.000Z',ns=BigInt(Date.parse(start))*1000000n;
  const kill=`kill\t${cid}\t15\t\t${ns+1n}`,die=`die\t${cid}\t\t143\t${ns+2n}`;
  assert.equal(confirmsResidualTermEvents(kill+'\n'+die,cid,start),true);
  assert.equal(confirmsResidualTermEvents(die+'\n'+kill,cid,start),false);
  assert.equal(confirmsResidualTermEvents(kill+'\n'+die.replace('143','137'),cid,start),false);
  assert.equal(confirmsResidualTermEvents(kill.replace(cid,hash('4'))+'\n'+die,cid,start),false);
  assert.equal(confirmsResidualTermEvents(kill+'\n'+die,cid,'2026-11-21T03:20:00.001Z'),false);
});

test('stopped-intent recovery rejects unproved first TERM and unbound terminal code',async()=>{
  const f=fixture({residual:true});
  f.flags.firstTermAccepted=false;
  await assert.rejects(f.verifier(),/EXACT_FIRST_TERM_ACCEPTANCE_REQUIRED/);
  Object.assign(f.flags,{firstTermAccepted:true,exitCode:143});
  const verifier=await f.verifier();
  try{await assert.rejects(verifier.captureStopped(),/EXACT_ORIGINAL_API_STOP_REQUIRED/);}
  finally{await verifier.close();}
});

test('stopped-intent recovery excludes a listener and unknown or active backends',async()=>{
  const f=fixture({residual:true});
  Object.assign(f.flags,{running:true,residualRunning:true,startedAt:f.pins.api.startedAt,listenerClosed:false});
  const verifier=await f.verifier();
  try{
    await assert.rejects(verifier.verifyResidualOriginal(),/ORIGINAL_RESIDUAL_LISTENER_NOT_CLOSED/);
    Object.assign(f.flags,{listenerClosed:true,residualBackend:true});
    await assert.rejects(verifier.verifyResidualOriginal(),/ORIGINAL_RESIDUAL_BACKEND_NOT_PROVED/);
  }finally{await verifier.close();}
});

test('only the previously observed idle residual backend may remain before TERM',async()=>{
  const f=fixture({residual:true});
  f.recordHistoricalIdle();
  Object.assign(f.flags,{running:true,residualRunning:true,startedAt:f.pins.api.startedAt,residualBackend:true,residualActive:true});
  const verifier=await f.verifier();
  try{
    await assert.rejects(verifier.verifyResidualOriginal(),/ORIGINAL_RESIDUAL_BACKEND_NOT_PROVED/);
    f.flags.residualActive=false;
    assert.equal((await verifier.verifyResidualOriginal()).record.containerId,f.pins.api.id);
  }finally{await verifier.close();}
});

test('a protected fenced-start can continue only through its observed boot, TERM and a distinct resumed boot',async()=>{
  const f=fixture();
  f.firstStart();
  const verifier=await f.verifier();
  await assert.rejects(verifier.captureStopped(),/SINGLE_STOPPED_CHECKPOINT_REQUIRED/);
  f.flags.heartbeatSamples=1;
  const first=await verifier.verifyFencedBoot();
  assert.equal(first.participant.bootId,firstBoot);
  assert.equal(first.startedAt,at(8));
  f.terminateFirst();
  assert.equal((await verifier.captureStopped()).startedAt,first.startedAt);
  f.resumeOriginal();
  const resumed=await verifier.verifyStarted();
  assert.equal(resumed.participant.bootId,newBoot);
  assert.equal(resumed.startedAt,at(10));
  assert.equal(resumed.allDataSha256,f.flags.factsSha256);
  assert.equal(resumed.readiness.ready,true);
  await verifier.close();
});

test('fenced-start rejects an altered plan or a mismatched live boot before TERM',async()=>{
  const f=fixture();
  f.firstStart({fencedSha256:hash('0')});
  await assert.rejects(f.verifier(),/PROTECTED_FENCED_START_RECEIPT_REQUIRED/);
  f.firstStart();
  f.flags.newBoot=newBoot;
  const verifier=await f.verifier();
  await assert.rejects(verifier.verifyFencedBoot(),/ORIGINAL_API_QUIESCENT_NEW_BOOT_REQUIRED/);
  await verifier.close();
});

test('a superficially stopped old container and replaying the prior fenced boot are rejected',async()=>{
  const f=fixture();
  f.firstStart();
  const verifier=await f.verifier();
  await verifier.verifyFencedBoot();
  f.flags.running=false;
  await assert.rejects(verifier.captureStopped(),/EXACT_ORIGINAL_API_STOP_REQUIRED/);
  await verifier.close();

  const g=fixture();
  g.firstStart();
  const other=await g.verifier();
  await other.verifyFencedBoot();
  g.terminateFirst();
  await other.captureStopped();
  g.resumeOriginal();
  g.flags.newBoot=firstBoot;
  await assert.rejects(other.verifyStarted(),/ORIGINAL_API_QUIESCENT_NEW_BOOT_REQUIRED/);
  await other.close();
});

test('old-session reuse, missing closure, orphan later intents and driver directories bar new recovery',async()=>{
  const f=fixture();
  await assert.rejects(createModernSchemaOperatorRecoveryVerifier({...f.parameters,recoveryLease:f.oldLease},f.dependencies),/DISTINCT_NEW_SESSION/);
  const close=f.registry.get(f.key('session-closed'));f.registry.delete(f.key('session-closed'));
  await assert.rejects(f.verifier(),/supervisor-first-hold/);
  f.registry.set(f.key('session-closed'),close);
  f.registry.set(f.keyStep('DDL_STARTED',7),{});
  await assert.rejects(f.verifier(),/LATER_EFFECT_OR_INTENT_PRESENT/);
  f.registry.delete(f.keyStep('DDL_STARTED',7));
  f.directories.add(path.join('/protected',`schema-release-migration-${f.context.owner}`));
  await assert.rejects(f.verifier(),/LATER_EXECUTION_DIRECTORY_PRESENT/);
  assert.deepEqual(f.events,[]);
});

test('a failed historical read connection uses a new stopped baseline and preserves all unavailable records',async()=>{
  const f=fixture();f.failReadChannel();
  const recovery=await f.verifier();
  const stopped=await recovery.captureStopped();
  f.resumeOriginal();
  const resumed=await recovery.verifyStarted();
  assert.equal(resumed.stoppedCheckpointSha256,canonicalDigest(stopped));
  assert.equal(resumed.formalTargetSuccess,false);
  assert.equal(f.registry.has(f.key('session-closed')),false);
  assert.equal(f.registry.get(`recovery-modern-schema-${f.context.owner}.json`).nativeLedger.status,'UNAVAILABLE');
  await recovery.close();
});

test('a held fresh snapshot binds live stopped and restarted checkpoints to the original frozen facts',async()=>{
  const f=fixture();await f.failAfterFreshCheck();
  const operator=await f.verifier(),stopped=await operator.captureStopped();
  assert.equal(stopped.factsSha256,canonicalDigest(f.registry.get(f.key('before-facts'))));
  f.resumeOriginal();
  assert.equal((await operator.verifyStarted()).outcome,'ORIGINAL_R_READY_UNDER_BOTH_FENCES');
  await operator.close();
});

for(const code of ['MODERN_SCHEMA_EXECUTORS_HOLD=ORIGINAL_CONTROL_CHILD_UNPROVED','MODERN_SCHEMA_WATCH_HOLD=NEW_OR_CHANGED_HOST_EXECUTOR']){
 test(`the fixed ${code} backup hold requires frozen pre-DDL recovery evidence`,async()=>{
  const f=fixture(),failure={source:'EXECUTOR_WATCH',stage:'FENCED_BACKUP',code};
  await f.failAfterFreshCheck(failure);
  const operator=await f.verifier();
  assert.equal((await operator.captureStopped()).factsSha256,canonicalDigest(f.registry.get(f.key('before-facts'))));
  await operator.close();
  failure.stage='DDL_AND_AFTER';
  await assert.rejects(f.verifier(),/EXACT_FROZEN_BACKUP_FACTS_REQUIRED/);
 });
}

test('a still-live unmatched host process blocks both original boot and publication',async()=>{
  const source={source:'EXECUTOR_WATCH',stage:'FENCED_BACKUP',code:'MODERN_SCHEMA_WATCH_HOLD=NEW_OR_CHANGED_HOST_EXECUTOR'};
  const f=fixture();await f.failAfterFreshCheck(source);
  const stopped=await f.verifier();
  f.flags.foreignHost=true;
  await assert.rejects(stopped.captureStopped(),/RECOVERY_HOST_PROCESS_UNACCOUNTED/);
  await stopped.close();
  f.flags.foreignHost=false;
  const resumed=await f.verifier();await resumed.captureStopped();
  f.resumeOriginal();
  assert.equal((await resumed.verifyStarted()).hostProcessesSha256,hash('3'));
  f.flags.foreignHost=true;
  await assert.rejects(resumed.verifyHostBeforeOpen(),/RECOVERY_HOST_PROCESS_UNACCOUNTED/);
  await resumed.close();
});

test('host recovery census accepts only native pins for its live control process',{timeout:5000},async()=>{
  const child=spawn('/usr/bin/sleep',['10'],{stdio:'ignore'});
  const exited=new Promise(resolve=>child.once('exit',resolve));
  try{
    const entry=pinModernSchemaChild(child);
    const row={...entry.pin,ppid:entry.pin.parentPid,erpControlReference:true};
    assert.equal(verifyRecoveryHostProcessCensus([row],[],new Set(),[entry]),canonicalDigest([]));
    assert.throws(()=>verifyRecoveryHostProcessCensus([row],[],new Set(),[]),/RECOVERY_HOST_PROCESS_UNACCOUNTED/);
    assert.throws(()=>verifyRecoveryHostProcessCensus([{...row,exe:'/tmp/unrelated'}],[],new Set(),[entry]),/ORIGINAL_CONTROL_CHILD_UNPROVED/);
    assert.throws(()=>verifyRecoveryHostProcessCensus([],[],new Set(),[entry]),/RECOVERY_OWNED_HOST_CHILD_UNACCOUNTED/);
  }finally{child.kill('SIGTERM');await exited;}
});

test('a fresh-snapshot hold rejects any later step, altered audit, or live facts drift before starting R',async()=>{
  const f=fixture();await f.failAfterFreshCheck();
  f.registry.set(f.keyStep('BACKUP_VERIFIED',6),{});
  await assert.rejects(f.verifier(),/LATER_EFFECT_OR_INTENT_PRESENT/);
  f.registry.delete(f.keyStep('BACKUP_VERIFIED',6));
  f.registry.get(f.key('fenced-audit-boundary')).comparison.fenced=false;
  await assert.rejects(f.verifier(),/EXACT_FROZEN_BACKUP_FACTS_REQUIRED/);
  f.registry.get(f.key('fenced-audit-boundary')).comparison.fenced=true;
  const operator=await f.verifier();
  f.flags.factsSha256=hash('d');
  await assert.rejects(operator.captureStopped(),/ORIGINAL_FROZEN_BACKUP_FACTS_CHANGED/);
  await operator.close();
});

test('read connection loss cannot replace a missing audit or divergent pre-DDL and hold catalogs',async()=>{
  const f=fixture();f.failReadChannel();
  f.registry.delete(f.key('fenced-audit-boundary'));
  await assert.rejects(f.verifier(),/ORIGINAL_READ_CHANNEL_LOSS_EVIDENCE_REQUIRED/);
  f.registry.set(f.key('fenced-audit-boundary'),{});
  f.registry.get(f.key('before-schema')).schemaSha256=hash('9');
  await assert.rejects(f.verifier(),/ORIGINAL_READ_CHANNEL_LOSS_EVIDENCE_REQUIRED/);
});

for(const [flag,value,error] of [
  ['oldPresent',true,/ORIGINAL_SESSION_REAPPEARED/],
  ['leaseOk',false,/NEW_RECOVERY_LEASE_NOT_OBSERVED/],
  ['foreign',true,/UNKNOWN_OR_NEW_DATABASE_EXECUTOR/],
  ['ledgerSha256',hash('f'),/NATIVE_LEDGER_CHANGED/],
  ['catalogSha256',hash('9'),/NATIVE_SCHEMA_CHANGED/],
]){
  test(`read connection loss still refuses a new baseline when ${flag} differs`,async()=>{
    const f=fixture();f.failReadChannel();
    const recovery=await f.verifier();
    f.flags[flag]=value;
    await assert.rejects(recovery.captureStopped(),error);
    await recovery.close();
  });
}

test('the historical hold catalog is tied to its protected native raw bytes',async()=>{
  const f=fixture();
  f.flags.rawSha256=hash('a');
  await assert.rejects(f.verifier(),/ORIGINAL_NATIVE_CATALOG_BYTES_CHANGED/);
  assert.deepEqual(f.events,[]);
});

for(const [flag,value,error] of [
  ['oldPresent',true,/ORIGINAL_SESSION_REAPPEARED/],
  ['leaseOk',false,/NEW_RECOVERY_LEASE_NOT_OBSERVED/],
  ['foreign',true,/UNKNOWN_OR_NEW_DATABASE_EXECUTOR/],
  ['catalogSha256',hash('9'),/NATIVE_SCHEMA_CHANGED/],
  ['ledgerSha256',hash('f'),/NATIVE_LEDGER_CHANGED/],
  ['originalDb',false,/ORIGINAL_WEB_OR_DATABASE_CHANGED/],
]){
  test(`stopped checkpoint requires current native evidence when ${flag} moves`,async()=>{
    const f=fixture(), verifier=await f.verifier();
    f.flags[flag]=value;
    await assert.rejects(verifier.captureStopped(),error);
    await verifier.close();
    assert.equal(f.events.at(-1),'reader-close');
  });
}

for(const [flag,value,error] of [
  ['admitted',false,/RECOVERY_ADMISSION_LOST/],
  ['fenced',false,/NATIVE_INGRESS_IDENTITY_CHANGED/],
  ['newBoot',oldBoot,/QUIESCENT_NEW_BOOT_REQUIRED/],
  ['factsSha256',hash('d'),/NATIVE_DATABASE_CHANGED_DURING_ORIGINAL_RESTART/],
  ['ready',false,/ORIGINAL_API_READY_PROBE_REQUIRED/],
  ['address','172.20.0.99',/RECOVERED_API_RUNTIME_NOT_READY/],
  ['wrongControlName',true,/NEW_API_CONTROL_SESSION_NOT_OBSERVED/],
  ['heartbeatSamples',3,/API_CONTROL_SESSION_NOT_QUIESCENT/],
]){
  test(`started checkpoint rejects ${flag} drift`,async()=>{
    const f=fixture(), verifier=await f.verifier();
    await verifier.captureStopped();
    f.flags.running=true;f.flags[flag]=value;
    await assert.rejects(verifier.verifyStarted(),error);
    await verifier.close();
  });
}

test('the verified control backend identity is stable while the heartbeat query count changes', () => {
  const observed={connected:true,broken:false,sessionPid:17,databaseOid:42,backendStartedAt:'2026-11-20T00:50:00.999Z',
    backendStartedAtUs:'2026-11-20T00:50:00.999321Z',applicationName:'phoenix-fence:verified',cleanup:{queriesPending:0}};
  assert.equal(sameOperatorControlSession(observed,{...observed,cleanup:{queriesPending:1}}),true);
  for(const change of [{connected:false},{broken:true},{sessionPid:18},{databaseOid:43},
    {backendStartedAtUs:'2026-11-20T00:50:00.999824Z'},{applicationName:'phoenix-fence:replaced'}]){
    assert.equal(sameOperatorControlSession(observed,{...observed,...change}),false);
  }
});
