import assert from 'node:assert/strict';import test from 'node:test';
import path from 'node:path';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
import {classifyModernSchemaDatabaseExecutors,collectReviewedRetainedRehearsalApi} from './production-modern-schema-executors.mjs';
const originalLease={database:{databaseOid:16400,systemIdentifier:'5839',postmasterStartMicros:'10000'},sessionPid:321,backendStartMicros:'11000'};
const session=(pid,address,app='ordinary')=>({pid,databaseOid:16400,backendStartMicros:String(11000+pid),clientAddress:address,openTransaction:false,applicationName:app});
const original={...session(321,null),backendStartMicros:'11000'};
const observation=()=>({primary:true,statsComplete:true,databaseOid:16400,systemIdentifier:'5839',postmasterStartMicros:'10000',preparedTransactions:0,enabledSubscriptions:0,
 workers:[],observerPid:100,sessions:[original]});
const scope={runtimeAddress:'172.29.248.4',originalLease,oldRuntimeStopped:true};
test('after R stops, the old address, a copied application name, or a replacement S cannot become owned executors',()=>{
 for(const other of [session(400,scope.runtimeAddress),session(400,null,'phoenix-modern-schema-read'),{...original,pid:322}]){
  const value=observation();value.sessions.push(other);assert.throws(()=>classifyModernSchemaDatabaseExecutors(value,scope),/UNKNOWN_OR_NEW_DATABASE_EXECUTOR/);
 }
 const missing=observation();missing.sessions=[];assert.throws(()=>classifyModernSchemaDatabaseExecutors(missing,scope),/ORIGINAL_CONTROL_SESSION_MISSING/);
});
test('prepared transactions, subscriptions, invisible stats and unknown workers stop release even with no runtime sessions',()=>{
 for(const change of [{preparedTransactions:1},{enabledSubscriptions:1},{statsComplete:false},{workers:[{pid:400,databaseOid:16400,type:'logical replication worker'}]}]){
  assert.throws(()=>classifyModernSchemaDatabaseExecutors({...observation(),...change},scope),/HOLD=/);
 }
});
test('only the exact root-native migration backend can transact during the controlled CLI phase',()=>{
 const value=observation(),actual={...session(400,'172.29.248.8','phoenix-schema-owned-run'),openTransaction:true};value.sessions.push(actual);
 const migration={address:actual.clientAddress,sessionPid:actual.pid,backendStartMicros:actual.backendStartMicros,applicationName:actual.applicationName,containerIdentityVerified:true};
 assert.deepEqual(classifyModernSchemaDatabaseExecutors(value,{...scope,migration}).migrationSessionPids,[400]);
 for(const change of [{sessionPid:401},{backendStartMicros:'99999'},{address:'172.29.248.9'},{containerIdentityVerified:false}]){
  assert.throws(()=>classifyModernSchemaDatabaseExecutors(value,{...scope,migration:{...migration,...change}}),/HOLD=/);
 }
});

function rehearsalFixture(runtimeRole='original-api'){
 const owner='12001-1',directory='/protected',rehearsal=path.join(directory,`schema-release-prepare-rehearsal-${owner}`);
 const id='a'.repeat(64),networkId='c'.repeat(64),imageId='sha256:'+'b'.repeat(64),role='rehearsal-'+runtimeRole;
 const runtimeSha='0'.repeat(40),targetSha='1'.repeat(40),revision=runtimeRole==='original-api'?runtimeSha:targetSha;
 const container={id,imageId,networkMode:networkId,privileged:false,pidMode:'',restarts:0,readonly:true,user:'phoenix',capDrop:['ALL'],
  restartPolicy:{Name:'no'},entrypoint:['/sbin/tini'],cmd:['--','node','dist/main'],ports:{},
  labels:{'phoenix.schema.owner':owner,'phoenix.schema.role':role},
  mounts:[{Type:'bind',Source:path.join(rehearsal,'control-'+runtimeRole),Destination:'/run/phoenix-background-control',RW:false}],
  state:{Running:false,Status:'exited',ExitCode:0,Pid:0,OOMKilled:false,Restarting:false,Paused:false,StartedAt:'2026-11-19T19:00:00Z'}};
 const record={containerId:id,imageId,owner,stage:'prepare',role,networkId};
 const proof={role:runtimeRole,imageId,revision,containerId:id,startedAt:container.state.StartedAt,cleanTerm:true,crossedCronMinute:true,backgroundWrites:0};
 const digestKey=runtimeRole==='original-api'?'originalRuntimeProofSha256':'candidateRuntimeProofSha256';
 const receipt={schema:'phoenix.modern-schema-isolated-rehearsal/v1',owner,runtimeSha,targetSha,isolatedRestore:true,
  productionMutation:false,backgroundWrites:0,outcome:'PASS',resources:[record],[digestKey]:canonicalDigest(proof)};
 const input={context:{owner,targetSha},oldRuntimeCompatibility:receipt,rehearsalDirectory:rehearsal};
 const prepared={...input,preparationSha256:canonicalDigest(input)};
 const files=new Map([[path.join(directory,`schema-release-preparation-${owner}.json`),prepared],
  [path.join(rehearsal,'rehearsal-receipt.json'),receipt],[path.join(rehearsal,`created-${id}.json`),record],
  [path.join(rehearsal,`${runtimeRole}-runtime-proof.json`),proof]]);
 const network={Id:networkId,Internal:true,EnableIPv6:false,Driver:'bridge',
  Labels:{'phoenix.schema.owner':owner,'phoenix.schema.role':'rehearsal-network'},Containers:{}};
 const request={owner:'12002-1',targetSha:'2'.repeat(40),networkId:'d'.repeat(64),
  registration:{id,owner:'REVIEWED_STOPPED_ISOLATED_REHEARSAL',identitySha256:'f'.repeat(64)}};
 const deps={directory,readJson:file=>files.get(file),run(binary,args){
  if(args[0]==='network')return JSON.stringify([network]);
  if(args[0]==='image')return revision;
  assert.equal(binary,'/usr/bin/git');assert.deepEqual(args.slice(-4),['merge-base','--is-ancestor',targetSha,request.targetSha]);return '';
 }};
 return {container,request,deps,proof,network,revision};
}

test('only pinned, stopped earlier rehearsal APIs with sealed native role proof remain inert',()=>{
 for(const role of ['original-api','candidate-api']){
  const {container,request,deps,revision}=rehearsalFixture(role);
  const pin=collectReviewedRetainedRehearsalApi(container,request,deps);
  assert.equal(pin.classification,'RETAINED_REVIEWED_REHEARSAL_API');
  assert.equal(pin.revision,revision);
  assert.equal(pin.identitySha256,canonicalDigest(container));
 }
});

test('changes to runtime identity, the mounted control, custody or isolated network stop review',()=>{
 const mutations=[
  f=>{f.container.state.Running=true;},
  f=>{f.container.mounts[0].RW=true;},
  f=>{f.request.registration.owner='UNREVIEWED';},
  f=>{f.proof.cleanTerm=false;},
  f=>{f.network.Containers.foreign={};},
  f=>{f.request.networkId=f.container.networkMode;},
 ];
 for(const mutate of mutations){
  const fixture=rehearsalFixture();mutate(fixture);
  assert.throws(()=>collectReviewedRetainedRehearsalApi(fixture.container,fixture.request,fixture.deps),/RETAINED_REHEARSAL_API_/);
 }
});
