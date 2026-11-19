import assert from 'node:assert/strict';
import test from 'node:test';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
import {closeModernSchemaOriginalSession,observeCommittedModernSchemaOpen,confirmModernSchemaPublicDurability} from './production-modern-schema-completion.mjs';
import {modernSchemaFixture} from '../ci/modern-schema-release.fixture.mjs';
import {createHash} from 'node:crypto';
const lease={database:{databaseOid:16400,systemIdentifier:'5839',postmasterStartMicros:'10000'},sessionPid:321,backendStartMicros:'11000'};
const absent={primary:true,...lease.database,originalSessionPresent:false};
test('a successful local close is insufficient while the actual original server backend remains',async()=>{
 let time=0,queries=0;
 await assert.rejects(closeModernSchemaOriginalSession({coordinator:{async close(){}},lease,guard(){},client:{async query(){queries++;return {rows:[{...absent,originalSessionPresent:true}]};}}},
  {now:()=>time,pause:async ms=>{time+=ms;}}),/ORIGINAL_SERVER_SESSION_REMAINS/);
 assert.ok(queries>1);
});
test('lost local close response is resolved only by absent original native backend on the same primary',async()=>{
 const result=await closeModernSchemaOriginalSession({coordinator:{async close(){throw Error('response lost');}},lease,guard(){},client:{async query(){return {rows:[absent]};}}});
 assert.equal(result.outcome,'ORIGINAL_SESSION_ABSENT');assert.equal(result.transportClosed,false);
 for(const change of [{primary:false},{databaseOid:16401},{systemIdentifier:'5840'},{postmasterStartMicros:'10001'}]){
  await assert.rejects(closeModernSchemaOriginalSession({coordinator:{async close(){}},lease,guard(){},client:{async query(){return {rows:[{...absent,...change}]};}}}),/PRIMARY_IDENTITY_UNVERIFIED/);
 }
});
test('lost public OPEN response is a commit only for the exact earlier full-evidence intent',()=>{
 const {context}=modernSchemaFixture(),manifest={phase:'OPEN',owner:context.owner,targetSha:context.targetSha,generation:9,participants:[]};
 const intent={schema:'phoenix.modern-schema-open-commit-intent/v1',owner:context.owner,targetSha:context.targetSha,contextDigest:canonicalDigest(context),
  defaultOff:true,originalLease:lease,expectedPublicManifest:structuredClone(manifest),expectedPublicManifestSha256:canonicalDigest(manifest)};
 const control={phase:'OPEN',owner:context.owner,targetSha:context.targetSha,generation:9,manifestDigest:createHash('sha256').update(JSON.stringify(manifest)).digest('hex')};
 const args={context,lease,store:{exists:()=>true,read:()=>intent},publisher:{readPublic:()=>manifest,readPrivate:()=>control,readHighWater:()=>9}};
 assert.equal(observeCommittedModernSchemaOpen(args).backgroundAdmissionCommitted,true);
 manifest.phase='FENCED';assert.equal(observeCommittedModernSchemaOpen(args),null);manifest.phase='OPEN';
 control.generation=8;assert.throws(()=>observeCommittedModernSchemaOpen(args),/COMMITTED_PUBLIC_PROJECTION_UNVERIFIED/);
});
test('a visible public rename cannot confirm commit while the directory fsync fails or projection changes',()=>{
 const value={phase:'OPEN',generation:9};let failed=true,reads=0;
 const deps={inspect:()=>[{dev:1,ino:2}],fs:{openSync:()=>7,fsyncSync(){if(failed)throw Error('fsync failed');},closeSync(){}}};
 assert.throws(()=>confirmModernSchemaPublicDurability(()=>value,()=>{},deps),/fsync failed/);
 failed=false;assert.equal(confirmModernSchemaPublicDurability(()=>value,()=>{},deps).durabilityConfirmed,true);
 assert.throws(()=>confirmModernSchemaPublicDurability(()=>({...value,generation:9+reads++}),()=>{},deps),/PUBLIC_PROJECTION_CHANGED/);
});
test('public FENCED disproves an OPEN commit before attempting to parse an interrupted private intent',()=>{
 const {context}=modernSchemaFixture();let reads=0;
 const result=observeCommittedModernSchemaOpen({context,lease,store:{exists:()=>true,read(){reads++;throw Error('partial JSON');}},publisher:{readPublic:()=>({phase:'FENCED',owner:context.owner})}});
 assert.equal(result,null);assert.equal(reads,0);
});
