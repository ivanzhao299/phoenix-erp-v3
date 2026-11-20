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
 const deps={directory,readJson:file=>files.get(file),lstat:file=>files.has(file)?{mtimeMs:Date.parse('2026-11-19T23:59:00Z')}:undefined,run(binary,args){
  if(args[0]==='network')return JSON.stringify([network]);
  if(args[0]==='image')return revision;
  assert.equal(binary,'/usr/bin/git');assert.deepEqual(args.slice(-4),['merge-base','--is-ancestor',targetSha,request.targetSha]);return '';
 }};
 return {container,request,deps,proof,network,revision,files,receipt,record,rehearsal,targetSha};
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

function completedRehearsalWithFailedPreparation(){
 const f=rehearsalFixture('candidate-api'),{files,receipt,record,rehearsal,targetSha}=f,owner=receipt.owner;
 const earlier=rehearsalFixture('original-api');
 earlier.record.containerId='4'.repeat(64);
 earlier.proof.containerId=earlier.record.containerId;
 const stamp=new Date(f.deps.lstat(path.join(rehearsal,'rehearsal-receipt.json')).mtimeMs-1000).toISOString();
 f.container.state.FinishedAt=stamp;
 const prepared=path.join(f.deps.directory,`schema-release-preparation-${owner}.json`);
 files.delete(prepared);
 const transport=path.join(f.deps.directory,`.transport-${owner}-prepare.receipt`);
 files.set(transport,{schema:'phoenix.modern-schema-public-preparation-hold/v1',owner,targetSha,prepared:false,
  failure:'HOST_SURFACE_FOREIGN_CONTAINER_OWNERSHIP_UNVERIFIED'});
 const backup={schema:'phoenix.modern-schema-protected-backup/v1',owner,stage:'prepare',format:'POSTGRES_CUSTOM',
  productionRestore:false,tocVerified:true,fullParseVerified:true,backup:{sha256:'c'.repeat(64)},sourceLedgerSha256:'d'.repeat(64)};
 files.set(path.join(f.deps.directory,`schema-release-prepare-backup-${owner}/backup-receipt.json`),backup);
 const resources=[record,earlier.record,...['database','migration-show','migration-run'].map((role,index)=>({
  ...record,role:'rehearsal-'+role,containerId:String(index+5).repeat(64),
 }))];
 for(const resource of resources)files.set(path.join(rehearsal,`created-${resource.containerId}.json`),resource);
 files.set(path.join(rehearsal,'original-api-runtime-proof.json'),earlier.proof);
 Object.assign(receipt,{resources,backupSha256:backup.backup.sha256,beforeLedgerSha256:backup.sourceLedgerSha256,
  businessFactsUnchanged:true,candidateReady:true,originalRuntimeReady:true,candidateImageId:record.imageId,
  originalRuntimeProofSha256:canonicalDigest(earlier.proof)});
 return {...f,earlier,transport,prepared,backup,owner};
}

test('a stopped rehearsal can be retained after a failed final prepare check without inventing preparation authority',()=>{
 const f=completedRehearsalWithFailedPreparation();
 const pin=collectReviewedRetainedRehearsalApi(f.container,f.request,f.deps);
 assert.match(pin.failedPreparationRehearsalSha256,/^[a-f0-9]{64}$/);
 assert.equal('preparationSha256' in pin,false);

 const changes=[
  u=>u.files.get(u.transport).failure='REHEARSAL',
  u=>u.files.set(u.prepared,{preparationSha256:'9'.repeat(64),context:{}}),
  u=>u.files.set(path.join(u.deps.directory,`schema-release-consumed-${u.owner}.json`),{}),
  u=>u.files.set(path.join(u.deps.directory,`.transport-${u.owner}-run.receipt`),{}),
  u=>u.files.set(path.join(u.deps.directory,`schema-release-approval-${u.owner}.json`),{}),
  u=>u.files.set(path.join(u.deps.directory,`schema-release-identity-${u.owner}.json`),{}),
  u=>u.files.delete(path.join(u.rehearsal,`created-${u.earlier.record.containerId}.json`)),
  u=>{u.backup.backup.sha256='7'.repeat(64);},
  u=>{u.receipt.candidateReady=false;},
  u=>{u.backup.sourceLedgerSha256='e'.repeat(64);},
  u=>{u.earlier.proof.backgroundWrites=1;},
  u=>{u.receipt.resources.push(u.record);},
  u=>{u.container.state.FinishedAt='2026-11-21T00:00:00Z';},
 ];
 for(const change of changes){
  const f=completedRehearsalWithFailedPreparation();
  change(f);
  assert.throws(()=>collectReviewedRetainedRehearsalApi(f.container,f.request,f.deps),/RETAINED_REHEARSAL_API_/);
 }
});
