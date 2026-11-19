import assert from 'node:assert/strict';
import test from 'node:test';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
import {classifyModernSchemaDatabaseExecutors} from './production-modern-schema-executors.mjs';
import {ModernSchemaExecutorWatch} from './production-modern-schema-watch.mjs';

const id = digit => digit.repeat(64);
const image = digit => 'sha256:' + id(digit);
const networkId = id('a');
const rootLease = {database:{name:'owned',databaseOid:1234,systemIdentifier:'913442',postmasterStartMicros:'672310'},
  sessionPid:501,backendStartMicros:'672332'};
const started = '2026-11-19T05:00:00.000000000Z';
const endpoint = ip => ({fixture: {NetworkID: networkId, IPAddress: ip}});
function container(service, digit, ip) {
  return {
    id:id(digit),imageId:image(digit),name:'/phoenix-v3-'+service,
    labels:{'com.docker.compose.project':'phoenix-erp','com.docker.compose.service':service},
    state:{StartedAt:started,Running:true,Health:{Status:'healthy'},ExitCode:0,Pid:55,OOMKilled:false,Restarting:false,Paused:false},
    ports:service==='api'?{'3100/tcp':[{HostIp:'127.0.0.1',HostPort:'3100'}]}:{},restartPolicy:{Name:'no'},restarts:0,
    networkMode:networkId,networks:endpoint(ip),mounts:[],privileged:false,pidMode:'',readonly:false,capDrop:[],user:'phoenix',entrypoint:[],cmd:[],
  };
}
function fixture() {
  const old=container('api','1','172.19.0.3'),web=container('web','2','172.19.0.2'),db=container('db','3','172.19.0.4');
  // The Docker bridge can recycle the original API address. Authorization
  // comes from the new exact native container pin and from R gone, not the IP.
  const candidate=container('api','4','172.19.0.3');
  const pin = value => ({id:value.id,image:value.imageId,startedAt:value.state.StartedAt,restartCount:0});
  const containers={api:pin(old),web:pin(web),db:pin(db)};
  const context={runtimeSnapshotSha256:canonicalDigest(containers),candidateImageId:candidate.imageId,owner:'9001-1'};
  const status={phase:'API_BODY',members:[]};
  const watch=new ModernSchemaExecutorWatch({context,
    preparation:{originalSnapshot:{containers},ownedResources:[],floor:{project:'phoenix-erp'},
      hostSurface:{runtimeAddress:'172.19.0.3',ingressScope:{networkId}}},
    state:{read:()=>({phase:status.phase})},rootLease,admit:()=>true}, {
    run(binary,args) {
      assert.deepEqual([binary,args],['/usr/bin/docker',['network','inspect',networkId]]);
      return JSON.stringify([{Id:networkId,Containers:Object.fromEntries(status.members.map(record=>[record.id,{}]))}]);
    },
  });
  const check = (...members) => {status.members=members;return watch.verifyContainers(members);};
  return {watch,old,web,db,candidate,status,check};
}
const databaseObservation = sessions => ({primary:true,statsComplete:true,databaseOid:1234,
  systemIdentifier:'913442',postmasterStartMicros:'672310',preparedTransactions:0,enabledSubscriptions:0,workers:[],observerPid:899,
  sessions:[{pid:501,databaseOid:1234,backendStartMicros:'672332',clientAddress:null,applicationName:'lease'},...sessions]});
const session = (pid,ip) => ({pid,databaseOid:1234,backendStartMicros:'672395',clientAddress:ip,applicationName:'fixture_api'});

test('original CID can disappear only at controlled Compose; replacement sessions cover all release phases', () => {
  const f=fixture();
  assert.throws(()=>f.check(f.web,f.db,f.candidate),/ORIGINAL_R_DISAPPEARED_WITHOUT_CONTROLLED_COMPOSE/);
  f.watch.composeChild={fixture:true};
  for(const phase of ['API_BODY','API_VERIFIED','OPEN_INTENT','OPEN_PUBLISHED','INGRESS_RELEASED','COMPLETED_OPEN']) {
    f.status.phase=phase;
    const pin=f.check(f.web,f.db,f.candidate);
    assert.equal(pin.oldRuntimeStopped,true);
    assert.equal(pin.candidate.containerId,f.candidate.id);
    assert.deepEqual(classifyModernSchemaDatabaseExecutors(databaseObservation([session(502,'172.19.0.3')]),
      {...pin,originalLease:rootLease}).runtimeSessionPids,[502]);
  }
});
test('stopped original address and unknown sessions have no authority before the actual candidate', () => {
  const f=fixture();
  f.status.phase='DDL_STARTED';
  f.old.state.Running=false;
  f.old.state.Pid=0;
  const pin=f.check(f.web,f.db,f.old);
  assert.throws(()=>classifyModernSchemaDatabaseExecutors(databaseObservation([session(502,'172.19.0.3')]),
    {...pin,originalLease:rootLease}),/UNKNOWN_OR_NEW_DATABASE_EXECUTOR/);
  f.status.phase='API_BODY';f.watch.composeChild={fixture:true};
  const admitted=f.check(f.web,f.db,f.candidate);
  assert.throws(()=>classifyModernSchemaDatabaseExecutors(databaseObservation([session(502,'172.19.0.9')]),
    {...admitted,originalLease:rootLease}),/UNKNOWN_OR_NEW_DATABASE_EXECUTOR/);
});
test('a restarted or substituted candidate cannot inherit the original watch',()=>{
  const f=fixture();
  f.watch.composeChild={fixture:true};f.check(f.web,f.db,f.candidate);
  f.candidate.restarts=1;
  assert.throws(()=>f.check(f.web,f.db,f.candidate),/CANDIDATE_NATIVE_IDENTITY_CHANGED/);
  f.candidate.restarts=0;
  f.candidate.state.StartedAt='2026-11-19T05:01:00.000000000Z';
  assert.throws(()=>f.check(f.web,f.db,f.candidate),/SECOND_CANDIDATE_OR_RESTART/);
});


test('lost, stopped or unhealthy verified candidate prevents terminal watch even without a DB session', () => {
  const f=fixture();
  f.watch.composeChild={fixture:true};
  f.check(f.web,f.db,f.candidate);
  f.status.phase='OPEN_PUBLISHED';
  assert.throws(()=>f.check(f.web,f.db),/VERIFIED_CANDIDATE_RUNTIME_LOST/);
  f.candidate.state.Running=false;
  assert.throws(()=>f.check(f.web,f.db,f.candidate),/VERIFIED_CANDIDATE_RUNTIME_LOST/);
  f.candidate.state.Running=true;
  f.candidate.state.Health.Status='unhealthy';
  assert.throws(()=>f.check(f.web,f.db,f.candidate),/VERIFIED_CANDIDATE_RUNTIME_LOST/);
});
