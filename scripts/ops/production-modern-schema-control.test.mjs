import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import {BackgroundManifestPublisher,SCHEMA_RELEASE_PURPOSE,validateBinding,assertSameBinding,bindingFromPrivateRecord,assertNoCutoverControlFiles,readSchemaReleasePending,assertNoCutoverControlState} from './background-control-manifest.mjs';
const base={owner:'123-1',previousFloorSha:'a'.repeat(40),targetSha:'b'.repeat(40),deployMode:'api',previousConfigFloorSha:'c'.repeat(40)};
const binding={...base,purpose:SCHEMA_RELEASE_PURPOSE,schemaRelease:{contextDigest:'d'.repeat(64),preparationSha256:'e'.repeat(64)}};
const participant={bootId:'30000000-0000-4000-8000-000000000003',containerId:'f'.repeat(64),revision:base.previousFloorSha,allowedKinds:['LOCAL']};
function fixture(){
 const state={pending:null,record:null,manifest:null,authority:false,effects:[]};
 const publisher=new BackgroundManifestPublisher({}, {guard(){},inspect(){},readPrivate:()=>structuredClone(state.record),readPublic:()=>structuredClone(state.manifest),readCutoverPending:()=>null,
  readSchemaReleasePending:()=>structuredClone(state.pending),verifySchemaReleaseAuthority:()=>state.authority,readHighWater:()=>0,writeHighWater(){},
  writePrivate:value=>{state.record=structuredClone(value);state.effects.push('private:'+value.phase);},writePublic:value=>{state.manifest=structuredClone(value);state.effects.push('public:'+value.phase);}});
 return {state,publisher};
}
test('schema release purpose and complete hashes survive private receipt binding without downgrade',()=>{
 validateBinding(binding);assert.deepEqual(bindingFromPrivateRecord({...binding,phase:'FENCED'}),binding);
 for(const change of [b=>delete b.purpose,b=>delete b.schemaRelease,b=>b.schemaRelease.contextDigest='0'.repeat(64),b=>b.schemaRelease.preparationSha256='0'.repeat(64)]){
  const copy=structuredClone(binding);change(copy);assert.throws(()=>assertSameBinding(copy,binding),/HOLD=/);
 }
 assert.throws(()=>assertNoCutoverControlState({schemaRelease:{}}),/DEDICATED_RECOVERY/);
 assert.throws(()=>validateBinding({...binding,purpose:'PRODUCTION_CUTOVER',cutover:{}}),/CUTOVER_BINDING_REQUIRED/);
});
test('the original controlled OPEN migration path rejects schema pending before audit, backup or DDL',()=>{
 const source=fs.readFileSync(new URL('../../.github/workflows/controlled-pending-migration-apply.yml',import.meta.url),'utf8');
 const check=source.indexOf('cutover-pending.json schema-release-pending.json; do');assert.ok(check>0);assert.ok(check<source.indexOf('STAGE="$STATE_DIR/migration-apply-'));
 assert.ok(source.includes('Object.hasOwn(record,"schemaRelease")'));assert.ok(source.includes('record?.phase !== "OPEN"'));
});
test('ordinary API/full/web admission refuses any pending pathname without opening or parsing raw evidence',()=>{
 let reads=0;assert.throws(()=>assertNoCutoverControlFiles('/owned',{exists:file=>file.endsWith('/schema-release-pending.json'),read:()=>{reads++;return null;}}),/SCHEMA_RELEASE_DEDICATED_RECOVERY_REQUIRED/);assert.equal(reads,0);
 for(const value of [null,[],false])assert.throws(()=>readSchemaReleasePending('/owned',{lstat:()=>({}),read:()=>value}),/PENDING_INVALID/);
 assert.equal(readSchemaReleasePending('/owned',{lstat:()=>{throw Object.assign(Error('absent'),{code:'ENOENT'});}}),null);
});
test('normal publishers and arbitrary typed flags cannot bypass pending admission or invoke OPEN verification',async()=>{
 for(const pending of [{},false,{...binding,schema:'phoenix.modern-schema-release-pending/v1',phase:'REGISTERED'}]){
  const {state,publisher}=fixture();state.pending=pending;assert.throws(()=>publisher.fence(base,[participant]),/DEDICATED_RECOVERY/);assert.deepEqual(state.effects,[]);
 }
 const {state,publisher}=fixture();state.pending={...binding,schema:'phoenix.modern-schema-release-pending/v1',phase:'REGISTERED'};
 assert.throws(()=>publisher.fence(binding,[participant]),/SCHEMA_RELEASE_AUTHORITY_REQUIRED/);assert.deepEqual(state.effects,[]);
 state.authority=true;publisher.fence(binding,[participant]);let calls=0;
 await assert.rejects(publisher.open(binding,[{...participant,revision:base.targetSha}],async()=>{calls++;return true;}),/FORMAL_COMPLETION_REQUIRED/);assert.equal(calls,0);assert.equal(state.manifest.phase,'FENCED');
 state.pending.phase='OPEN_INTENT';state.authority=false;
 await assert.rejects(publisher.open(binding,[{...participant,revision:base.targetSha}],async()=>{calls++;return true;}),/FORMAL_COMPLETION_REQUIRED/);assert.equal(calls,0);
});
test('typed OPEN requires fixed completion authority both before and after awaited formal verification',async()=>{
 const {state,publisher}=fixture();state.pending={...binding,schema:'phoenix.modern-schema-release-pending/v1',phase:'REGISTERED'};state.authority=true;publisher.fence(binding,[participant]);state.pending.phase='OPEN_INTENT';
 await assert.rejects(publisher.open(binding,[{...participant,revision:base.targetSha}],async()=>{state.authority=false;return true;}),/FORMAL_COMPLETION_REQUIRED/);assert.equal(state.manifest.phase,'FENCED');
});
