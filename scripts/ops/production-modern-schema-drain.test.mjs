import assert from 'node:assert/strict';import test from 'node:test';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {modernSchemaFixture} from '../ci/modern-schema-release.fixture.mjs';
import {modernSchemaReleaseBinding} from './production-modern-schema-state.mjs';
import {ModernSchemaPrivateRuntime} from './production-modern-schema-private.mjs';
import {persistModernSchemaOriginalDrain} from './production-modern-schema-drain.mjs';
import {assertBackgroundFence} from './phoenix-production-compose.mjs';
import {createModernSchemaFormalBodyAdapters} from './production-modern-schema-formal-body.mjs';
test('the original drain producer supplies the real formal guard before its first promotion effect',async t=>{
 const {context}=modernSchemaFixture(),preparationSha256='f'.repeat(64),directory=fs.mkdtempSync(path.join(os.tmpdir(),'phoenix-modern-drain-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const binding=modernSchemaReleaseBinding(context,preparationSha256),participant={containerId:'a'.repeat(64),revision:context.runtimeSha,
  bootId:'30000000-0000-4000-8000-000000000003',startedAt:'2026-11-19T00:00:00.000Z',restartCount:0};
 const manifest={protocolVersion:1,phase:'FENCED',owner:context.owner,generation:7,targetSha:context.targetSha,participants:[{...participant,allowedKinds:['LOCAL']}]};
 const record={protocolVersion:1,...binding,phase:'FENCED',generation:7,manifestDigest:createHash('sha256').update(JSON.stringify(manifest)).digest('hex')};
 const readState=file=>JSON.parse(fs.readFileSync(file,'utf8'));
 fs.writeFileSync(path.join(directory,'background-control.json'),JSON.stringify(record),{mode:0o600});
 let promoted=0;const oldImage='sha256:'+'c'.repeat(64);
 const env={DEPLOY_RUN_ID:context.owner,TARGET_SHA:context.targetSha};
 const adapters=()=>createModernSchemaFormalBodyAdapters({context,preparationSha256,rootLease:{fixtureOnly:true},originalProcess:{pid:process.pid},originalChild:{pin:{pid:123}},admit:async()=>true},{
  root:'/unused/owned-checkout',directory,guard(){},checkProcess:()=>true,checkLease:()=>true,checkChild:()=>true,
  backgroundFence:(dir,options)=>assertBackgroundFence(dir,{...options,readState,readManifest:()=>manifest}),
  dockerRead(args){if(args[0]==='image')return context.runtimeSha;
   return [participant.containerId,'/phoenix-v3-api',oldImage,participant.startedAt,false,'exited',0,false,0,'no'].map(v=>JSON.stringify(v)).join('\\t');},
  async promote(){promoted++;},executeCompose(){assert.fail('promotion must not compose');},
 });
 assert.throws(()=>assertBackgroundFence(directory,{env,readState,readManifest:()=>manifest,verifyOldExecutor:()=>true}),/BACKGROUND_DRAIN_PROOF_REQUIRED/);
 await assert.rejects(adapters().promote(directory+'/floor-stage-'+context.owner),/PROMOTE_UNVERIFIED/);assert.equal(promoted,0);
 const runtime=new ModernSchemaPrivateRuntime({directory,expectedUid:process.getuid(),guard(){},inspectDirectory:p=>{const s=fs.lstatSync(p);return {dev:s.dev,ino:s.ino};}});
 const rootLease={database:{name:'owned',schema:'public',databaseOid:16400,systemIdentifier:'5839',postmasterStartMicros:'10000'},sessionPid:321,backendStartMicros:'11000'};
 const coordinator={binding,closed:false,ready:true,session:{connected:()=>true,query:async()=>true},publisher:{assertOwned:()=>({record,manifest})},verifyQuiescent:async()=>[participant]};
 const drain={protocolVersion:1,outcome:'DRAINED',...binding,generation:7,participants:[participant]};
 const request={context,preparationSha256,rootLease,coordinator,privateRuntime:runtime,drain,admit:async()=>true};
 const receipt=await persistModernSchemaOriginalDrain(request,{checkLease:()=>true});
 assert.equal(receipt.file,path.join(directory,`background-drain-${context.owner}.json`));
 assert.deepEqual(assertBackgroundFence(directory,{env,readState,readManifest:()=>manifest,verifyOldExecutor:()=>true}),drain);
 await adapters().promote(directory+'/floor-stage-'+context.owner);assert.equal(promoted,1);
 await assert.rejects(persistModernSchemaOriginalDrain(request,{checkLease:()=>true}),/EEXIST/);
});
test('missing original S or a changed native drain cannot publish the formal handoff',async()=>{
 const {context}=modernSchemaFixture(),preparationSha256='f'.repeat(64),binding=modernSchemaReleaseBinding(context,preparationSha256);
 let writes=0;const rootLease={database:{databaseOid:16400,systemIdentifier:'5839',postmasterStartMicros:'10000'},sessionPid:321,backendStartMicros:'11000'};
 const coordinator={binding,closed:false,ready:true,session:{connected:()=>true,query:async()=>false},publisher:{assertOwned(){assert.fail();}},verifyQuiescent(){assert.fail();}};
 await assert.rejects(persistModernSchemaOriginalDrain({context,preparationSha256,rootLease,coordinator,drain:{...binding},admit:async()=>true,
  privateRuntime:{guard(){},publishJson(){writes++;}}},{checkLease:()=>true}),/ORIGINAL_NATIVE_DUAL_SESSION_REQUIRED/);
 coordinator.session.query=async()=>true;
 coordinator.publisher.assertOwned=()=>({record:{phase:'FENCED',generation:7},manifest:{phase:'FENCED'}});
 coordinator.verifyQuiescent=async()=>[{containerId:'a'.repeat(64)}];
 await assert.rejects(persistModernSchemaOriginalDrain({context,preparationSha256,rootLease,coordinator,drain:{...binding,protocolVersion:1,outcome:'DRAINED',generation:7,participants:[{containerId:'b'.repeat(64)}]},admit:async()=>true,
  privateRuntime:{guard(){},publishJson(){writes++;}}},{checkLease:()=>true}),/EXACT_ORIGINAL_DRAIN_REQUIRED/);
 assert.equal(writes,0);
});
