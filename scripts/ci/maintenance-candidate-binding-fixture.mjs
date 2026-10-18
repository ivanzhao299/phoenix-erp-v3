/** Synthetic authority, catalog and Docker rows ONLY. Child is an owned Node
 * responder, not PostgreSQL. No receipt from this helper is production proof. */
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {rootLeaseFixture} from './maintenance-root-lease-fixture.mjs';
import {RootControlLease} from '../ops/production-maintenance-root-lease.mjs';
import {createMaintenanceEvidence,canonicalDigest} from '../ops/production-maintenance-receipts.mjs';
import {PUBLIC_DIRECTORY,HOLD_KINDS} from '../ops/background-control-manifest.mjs';

const h=c=>c.repeat(64),sha=c=>c.repeat(40),json=v=>JSON.stringify(v),hash=v=>createHash('sha256').update(json(v)).digest('hex');
export async function candidateBindingFixture(options={}){
  const f=rootLeaseFixture({database:options.database}),at=delta=>new Date(f.now+delta).toISOString();let clock=f.now,child,closed=false,locks=[];
  const now=options.now||(()=>clock);
  const boot='01234567-0123-4123-8123-0123456789ab';
  Object.assign(f.state,{schema:'phoenix.legacy-maintenance-state/v1',context:structuredClone(f.context),status:'HOLD_CANDIDATE_REVALIDATION_REQUIRED',legacyDrainResult:'UNSUPPORTED',updatedAt:at(-5000)});
  f.store.assertOwnedIntent=(op,phase,digest)=>{assert.equal(phase,f.state.phase);assert.equal(digest,f.state.stateDigest);assert.equal(op,phase==='CANDIDATE_REPLACED'?'START_CANDIDATE':'VERIFY_CANDIDATE');};
  const rootRow={pid:4321,databaseOid:f.database.databaseOid,backendStartedAt:at(-1000).replace('Z','123Z'),applicationName:'phoenix-maintenance-control:'+f.context.owner,backendType:'client backend'};
  const rootRun=args=>args[0]==='inspect'?[f.database.containerId,f.database.imageId,f.database.containerStartedAt,true,'healthy'].map(json).join('\t'):
    json({sampledAt:new Date(clock).toISOString(),databaseOid:f.database.databaseOid,postmasterStartedAt:f.database.postmasterStartedAt,clusterSystemIdentifier:f.database.clusterSystemIdentifier,
      serverVersionNum:180000,statsVisible:true,backends:closed?[]:[rootRow],locks:closed?[]:locks.map(key=>({pid:rootRow.pid,databaseOid:f.database.databaseOid,namespace:17455,key,keyForm:2,mode:'ExclusiveLock',granted:true}))});
  const launch=()=>{
    child=spawn(process.execPath,['-e',"let b='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>{b+=s;let n;while((n=b.indexOf('\\n'))>=0){b=b.slice(n+1);process.stdout.write('t\\n');}});"],{stdio:['pipe','pipe','pipe']});
    const write=child.stdin.write.bind(child.stdin);child.stdin.write=(sql,...args)=>{if(sql.includes('pg_try_advisory_lock'))locks.push(Number(/17455,(\d)/.exec(sql)[1]));return write(sql,...args);};
    child.once('close',()=>{closed=true;locks=[];});return child;
  };
  const lease=new RootControlLease({...f.options,...(options.registerOwnedChild?{registerOwnedChild:options.registerOwnedChild}:{})},
    {...f.dependencies,now,run:options.rootRun||rootRun,...(options.realRoot?{}:{spawn:launch})});await lease.acquire();
  const candidate={id:h('a'),imageId:f.context.candidate.imageId,revision:f.context.targetSha,startedAt:at(-9500),restartCount:0,running:true,health:'healthy',
    pid:5555,status:'running',restarting:false,dead:false,restartPolicy:'no',service:'api',project:f.context.replacement.project};
  const body={protocol:'CONTROLLED_COMPOSE_REPLACEMENT',legacyDrainResult:'UNSUPPORTED',oldDisposition:'REMOVED_BY_CONTROLLED_REPLACEMENT',owner:f.context.owner,oldExecutor:f.context.preSnapshot.api,
    unexpectedExecutors:0,oldImageRetained:true,webDbUnchanged:true,coverageScope:'FIXED_REPLACEMENT_INTERVAL_ONLY',postReplacementState:'HOLD_CANDIDATE_REVALIDATION_REQUIRED',
    candidatePublicMount:{source:PUBLIC_DIRECTORY,destination:'/run/phoenix-background-control',type:'bind',readOnly:true},runMigration:false,webSwitched:false,interval:{start:at(-10000),end:at(-9000)},
    candidate,project:f.context.replacement.project,recoveryMaterialsSha256:h('a'),lifecycle:{oldDestroy:h('a'),candidateCreate:h('b'),candidateStart:h('c')}};
  for(const key of ['replacementIntentSha256','operationIntentSha256','stoppedEvidenceSha256','reconciliationEvidenceSha256','isolationEvidenceSha256','recoveryEvidenceSha256','composeFileSha256','overrideSha256','commandSha256','eventsSha256','preInventorySha256','postInventorySha256'])body[key]=h('a');
  const evidence=createMaintenanceEvidence('CANDIDATE_REPLACEMENT',f.context,body,{capturedAt:at(-8000)});
  const receiptRows=new Map();f.state.receipts=[];
  const addReceipt=(kind,payload)=>{
    const content={schema:'phoenix.maintenance-receipt/v1',contextDigest:f.state.contextDigest,owner:f.context.owner,sequence:f.state.receipts.length+1,
      previousDigest:f.state.receipts.at(-1)?.digest||null,kind,payload:structuredClone(payload),recordedAt:at(-5000)};
    const digest=canonicalDigest(content),ref={sequence:content.sequence,digest};receiptRows.set(digest,{...content,digest});f.state.receipts.push(ref);return ref;
  };
  addReceipt('CANDIDATE_REPLACEMENT',evidence);
  f.store.readReceipt=ref=>{const row=receiptRows.get(ref.digest);assert.ok(row);assert.equal(row.sequence,ref.sequence);return structuredClone(row);};
  // In-memory fixture seam only. Actual owner/file/digest/chain races are
  // exercised separately by production-maintenance-binding-receipts.test.mjs.
  f.store.readCandidateBindingEvidence=({expectedStateDigest})=>{
    assert.equal(expectedStateDigest,f.state.stateDigest);
    const rows=f.state.receipts.map(reference=>f.store.readReceipt(reference));
    const replacement=rows.filter(row=>row.kind==='CANDIDATE_REPLACEMENT'),candidate=rows.filter(row=>row.kind==='CANDIDATE_FENCED');
    if(replacement.length!==1||candidate.length!==(f.state.phase==='CANDIDATE_REPLACED'?0:1))throw Error('MAINTENANCE_HOLD=CANDIDATE_BINDING_RECEIPT_UNIQUE');
    return structuredClone({stateDigest:f.state.stateDigest,replacement:replacement[0].payload,candidate:candidate[0]?.payload??null});
  };
  const manifest={protocolVersion:1,phase:'FENCED',owner:f.context.owner,generation:1,targetSha:f.context.targetSha,participants:[]};
  const projection={bootstrap:{schema:'phoenix.legacy-public-control/v1',contextDigest:f.state.contextDigest,owner:f.context.owner,previousFloorSha:f.context.previousFloorSha,targetSha:f.context.targetSha,
    stateDigest:h('8'),phase:'PUBLISHING_LEGACY_FENCE',manifestDigest:hash(manifest),generation:1,capturedAt:at(-20000)},modern:null,manifest};
  const status={protocolVersion:1,bootId:boot,phase:'FENCED',owner:f.context.owner,generation:1,inFlight:0,pendingChildren:0,taskGraphs:0,poisoned:false,stopping:false,
    controlSession:{connected:true,broken:false,sessionPid:5432,databaseOid:f.database.databaseOid,backendStartedAt:at(-1200),backendStartedAtUs:at(-1200).replace('Z','456Z'),applicationName:'phoenix-fence:'+boot,
      cleanup:{acquirePending:false,queriesPending:0,retirementPending:false,terminationConfirmed:false,releaseConfirmed:false,debt:true}}};
  if(options.candidateIdentity)Object.assign(status.controlSession,options.candidateIdentity);
  const runtime={Id:candidate.id,Image:candidate.imageId,State:{StartedAt:candidate.startedAt,Running:true,Health:{Status:'healthy'},Pid:candidate.pid,Status:'running',Restarting:false,Dead:false},RestartCount:0,
    Labels:{'com.docker.compose.project':body.project,'com.docker.compose.service':'api'},Mounts:[{Type:'bind',Source:PUBLIC_DIRECTORY,Destination:'/run/phoenix-background-control',RW:false,Propagation:'rprivate'}],
    HostConfig:{Privileged:false,PidMode:'',IpcMode:'private',UTSMode:'',UsernsMode:'',NetworkMode:'phoenix-private',RestartPolicy:{Name:'no'},CapAdd:null,Devices:[],DeviceRequests:null,SecurityOpt:null}};
  const floor={version:3,floorSha:f.context.targetSha,phase:'READY',chanjetPolicy:'HOLD',readonlyApproval:null,project:f.context.replacement.project,
    operationalTuple:{PHOENIX_DATA_MOUNT_GUARD:'true',PHOENIX_PG_DATA_DIR:'/data/owned-fixture/pg',PHOENIX_UPLOADS_DIR:'/data/owned-fixture/uploads',CHANJET_READONLY_SYNC_ENABLED:'false',CHANJET_ERP_INBOUND_SYNC_ENABLED:'false'}};
  runtime.Mounts.push({Type:'bind',Source:floor.operationalTuple.PHOENIX_UPLOADS_DIR,Destination:'/app/uploads',RW:true,Propagation:'rprivate'});
  const calls=[];let hook=()=>{},catalogHook=v=>v,rootObserveHook=()=>{};
  const run=(args,input,options)=>{
    calls.push(structuredClone(args));hook(args);assert.ok(options.timeoutMs>=1&&options.timeoutMs<=10000);
    if(args[0]==='inspect'){
      if(args[1]===f.database.containerId)return databaseRun(args,input,options);
      assert.equal(args[1],candidate.id);const s=runtime.State,c=runtime.HostConfig;
      return [runtime.Id,runtime.Image,s.StartedAt,s.Running,s.Health.Status,s.Pid,s.Status,s.Restarting,s.Dead,runtime.RestartCount,
        runtime.Labels['com.docker.compose.project'],runtime.Labels['com.docker.compose.service'],runtime.Mounts,c.Privileged,c.PidMode,c.IpcMode,c.UTSMode,c.UsernsMode,c.NetworkMode,c.RestartPolicy.Name,
        c.CapAdd?.length||0,c.Devices?.length||0,c.DeviceRequests?.length||0,c.SecurityOpt].map(json).join('\t');
    }
    if(args[0]==='image')return candidate.revision;
    if(args[2]==='node'){assert.equal(args[1],candidate.id);assert.ok(args.at(-1).includes('/api/internal/background/status'));return json(status);}
    assert.equal(args[2],f.database.containerId);assert.ok(input.includes('rootBackends'));
    if(actualDatabaseRun)return actualDatabaseRun(args,input,options);
    return json(catalogHook({sampledAt:new Date(clock).toISOString(),postmasterStartedAt:f.database.postmasterStartedAt,clusterSystemIdentifier:f.database.clusterSystemIdentifier,databaseOid:f.database.databaseOid,
      serverVersionNum:180000,statsVisibilityComplete:true,rootBackends:[rootRow],candidateBackends:[{pid:status.controlSession.sessionPid,databaseOid:f.database.databaseOid,backendStartedAt:status.controlSession.backendStartedAtUs,
        applicationName:status.controlSession.applicationName,backendType:'client backend'}],rootLocks:locks.map(key=>({databaseOid:f.database.databaseOid,namespace:17455,key,keyForm:2,mode:'ExclusiveLock',granted:true}))}));
  };
  const actualDatabaseRun=options.databaseRun,databaseRun=actualDatabaseRun||rootRun;
  const originalRootRun=lease.run;lease.run=(...args)=>{rootObserveHook(args[0]);return originalRootRun(...args);};
  const request={context:f.context,expectedStateDigest:f.state.stateDigest,replacementEvidence:evidence,rootLease:lease};
  return {...f,lease,request,runtime,status,projection,calls,candidate,floor,receiptRows,get closed(){return closed;},advance(ms){clock+=ms;},
    hook(fn){hook=fn;},catalog(fn){catalogHook=fn;},rootHook(fn){rootObserveHook=fn;},
    adopt(){f.state.phase='CANDIDATE_FENCED';f.state.status='FENCED';status.generation=2;manifest.generation=2;manifest.participants=[{bootId:boot,containerId:candidate.id,revision:sha('b'),allowedKinds:[...HOLD_KINDS]}];
      addReceipt('CANDIDATE_FENCED',createMaintenanceEvidence('CANDIDATE_FENCED',f.context,{owner:f.context.owner,api:{id:candidate.id,imageId:candidate.imageId,revision:candidate.revision,startedAt:candidate.startedAt,restartCount:0},bootId:boot,
        controlSession:structuredClone(status.controlSession),candidateReplacementSha256:evidence.evidenceSha256},{capturedAt:at(-4000)}));
      projection.modern={protocolVersion:1,owner:f.context.owner,previousFloorSha:f.context.previousFloorSha,targetSha:f.context.targetSha,generation:2,phase:'FENCED',manifestDigest:hash(manifest),
        maintenanceContextDigest:f.state.contextDigest,maintenanceStateDigest:f.state.stateDigest,adoptionEvidenceSha256:h('d'),updatedAt:at(-1000)};request.mode='ADOPTED';},
    forgeReplacement(id){candidate.id=id;runtime.Id=id;request.replacementEvidence=createMaintenanceEvidence('CANDIDATE_REPLACEMENT',f.context,body,{capturedAt:at(-8000)});},
    dependencies:{guard(){},store:f.store,run,now,readProjection:()=>structuredClone(projection),readFloor:()=>structuredClone(floor),inspectStorage(){/* synthetic storage only */}}};
}
