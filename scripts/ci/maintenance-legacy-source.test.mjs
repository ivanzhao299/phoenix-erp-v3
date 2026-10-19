import test from 'node:test';import assert from 'node:assert/strict';
import {requireLegacySourceExperiment} from './maintenance-legacy-source.fixture.mjs';
test('legacy executable experiment refuses ambient/default mode before creating resources',()=>{
 for(const value of [undefined,'1','true','production'])assert.throws(()=>requireLegacySourceExperiment({LEGACY_SOURCE_PROTOCOL_FIXTURE:value}),/EXPLICIT_OWNED_MODE/);
});

import fs from 'node:fs';import path from 'node:path';
import {OwnedErpCandidateCapsule,CONTROL_TARGET} from './maintenance-erp-candidate.fixture.mjs';
const oldSha='226878864f184d26f41a890e666ebed52547db14';
let sequence=0;
async function ownedLegacyMock({stopFails=false}={}){
 const owner=`${Date.now()}-${process.pid+sequence++}`,capsule=new OwnedErpCandidateCapsule({owner});
 const apiId='a'.repeat(64),dbId='d'.repeat(64),networkId='e'.repeat(64),imageId='sha256:'+'b'.repeat(64);
 const pg={id:dbId,major:16,networkId},commands=[],sqlTargets=[];
 capsule.sourceSha=oldSha;capsule.imageId=imageId;capsule.archivedDependencyLock={testOnly:true};
 capsule.resources.push({id:dbId,role:'pg16',type:'container'},{id:networkId,role:'pg16-internal-network',type:'network'});
 let stopped=false;
 const labels={'phoenix.test.owner':owner,'phoenix.test.kind':'maintenance-erp-candidate','org.opencontainers.image.revision':oldSha};
 const resource=id=>({Id:id,Image:id===apiId?imageId:'sha256:'+'c'.repeat(64),Config:{Labels:{...labels}},RestartCount:0,
  State:{Running:id===apiId?!stopped:true,StartedAt:'2026-10-19T00:00:00.000Z',Pid:id===apiId&&stopped?0:123,OOMKilled:false,Health:{Status:'healthy'},ExitCode:0},
  Mounts:[{Destination:CONTROL_TARGET,Source:path.join(capsule.root,'pg16-LEGACY-public'),RW:false}]});
 capsule.inspectContainer=id=>{assert.ok([apiId,dbId].includes(id),'UNEXPECTED_TEST_INSPECT_TARGET');return resource(id);};
 capsule.helper=()=>{};capsule.publishRootManifest=()=>{};
 capsule.request=(_target,url)=>url==='/api/readiness'?{status:200,body:{status:'READY',db:'connected'}}:{status:404};
 capsule.sql=(target,sql)=>{sqlTargets.push({target,sql});return '0';};
 capsule.docker=args=>{
  commands.push(args);
  if(args[0]==='run')return apiId;
  if(args[0]==='network')return JSON.stringify({Id:networkId,Internal:true,Labels:labels});
  if(args[0]==='stop'){if(stopFails)throw Error('TEST_STOP_OUTCOME_UNKNOWN');stopped=true;return apiId;}
  throw Error('UNEXPECTED_TEST_DOCKER_COMMAND');
 };
 const legacy=await capsule.startLegacySource(pg);
 return {capsule,legacy,commands,sqlTargets,apiId,dbId};
}
test('legacy stop rejects mutation of the original branded object before any stop or SQL',async()=>{
 const {capsule,legacy,commands,sqlTargets,apiId,dbId}=await ownedLegacyMock();
 const pin={...legacy.originalPin},pg=legacy.pg,app=legacy.captureApp,source=capsule.sourceSha,image=capsule.imageId;
 const cases=[
  [()=>legacy.id='f'.repeat(64),()=>legacy.id=apiId],
  [()=>legacy.originalPin={...pin,id:'f'.repeat(64)},()=>legacy.originalPin={...pin}],
  [()=>legacy.originalPin.imageId='sha256:'+'f'.repeat(64),()=>legacy.originalPin={...pin}],
  [()=>legacy.pg={...pg},()=>legacy.pg=pg],
  [()=>pg.id='f'.repeat(64),()=>pg.id=dbId],
  [()=>pg.major=18,()=>pg.major=16],
  [()=>pg.networkId='f'.repeat(64),()=>pg.networkId='e'.repeat(64)],
  [()=>legacy.captureApp='different',()=>legacy.captureApp=app],
  [()=>capsule.sourceSha='f'.repeat(40),()=>capsule.sourceSha=source],
  [()=>capsule.imageId='sha256:'+'f'.repeat(64),()=>capsule.imageId=image],
 ];
 for(const [mutate,restore]of cases){mutate();await assert.rejects(capsule.stopLegacySource(legacy));restore();}
 await assert.rejects(capsule.stopLegacySource({...legacy}),/UNREGISTERED/);
 assert.equal(commands.filter(c=>c[0]==='stop').length,0);assert.equal(sqlTargets.length,0);
 await capsule.stopLegacySource(legacy);
 assert.deepEqual(commands.filter(c=>c[0]==='stop'),[['stop','--signal','SIGTERM','--time','30',apiId]]);
 assert.equal(sqlTargets.length,1);assert.equal(sqlTargets[0].target.id,dbId);assert.equal(Object.isFrozen(sqlTargets[0].target),true);
 await assert.rejects(capsule.stopLegacySource(legacy),/ALREADY_ATTEMPTED/);
 assert.equal(commands.filter(c=>c[0]==='stop').length,1);
 assert.ok(fs.existsSync(path.join(capsule.root,'resources.json')));
});
test('unknown stop outcome consumes the original single attempt and never authorizes retry',async()=>{
 const {capsule,legacy,commands}=await ownedLegacyMock({stopFails:true});
 await assert.rejects(capsule.stopLegacySource(legacy),/OUTCOME_UNKNOWN/);
 await assert.rejects(capsule.stopLegacySource(legacy),/ALREADY_ATTEMPTED/);
 assert.equal(commands.filter(c=>c[0]==='stop').length,1);
});
