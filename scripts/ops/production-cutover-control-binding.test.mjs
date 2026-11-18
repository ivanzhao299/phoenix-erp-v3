import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {BackgroundManifestPublisher,validateBinding,assertSameBinding,bindingFromPrivateRecord,
  CUTOVER_PURPOSE,assertNoCutoverControlState,assertNoCutoverControlFiles,readCutoverPending,readBackgroundPrivate} from './background-control-manifest.mjs';

const sha='a'.repeat(40),hash='b'.repeat(64),base={owner:'123-1',previousFloorSha:sha,targetSha:sha};
const binding={...base,purpose:CUTOVER_PURPOSE,cutover:{manifestId:'10000000-0000-4000-8000-000000000001',manifestVersion:3,
  admissionId:'20000000-0000-4000-8000-000000000002',contentHash:hash,snapshotSha256:'c'.repeat(64),mode:'INIT'}};
const participant={bootId:'30000000-0000-4000-8000-000000000003',containerId:'d'.repeat(64),revision:sha,allowedKinds:['LOCAL']};
const clone=value=>structuredClone(value);
function fixture(pending=null){
  const state={pending:clone(pending),record:null,manifest:null,effects:[]};
  const publisher=new BackgroundManifestPublisher({}, {guard:()=>{},inspect:()=>({}),readCutoverPending:()=>clone(state.pending),
    readPrivate:()=>clone(state.record),readPublic:()=>clone(state.manifest),writePrivate:value=>{state.record=clone(value);state.effects.push('private:'+value.phase);},
    writePublic:value=>{state.manifest=clone(value);state.effects.push('public:'+value.phase);},readHighWater:()=>0,writeHighWater:()=>{}});
  return {state,publisher};
}
const pending=()=>({...clone(binding),schema:'phoenix.production-cutover-pending/1',phase:'PREPARED'});

test('cutover binding retains every exact private identity and keeps public projection free of business identifiers',()=>{
  validateBinding(binding);assertSameBinding(clone(binding),binding);
  const transported=bindingFromPrivateRecord({...clone(binding),phase:'FENCED'});assert.deepEqual(transported,binding);
  transported.cutover.mode='ATTACH';assert.equal(binding.cutover.mode,'INIT');
  const {state,publisher}=fixture(pending());publisher.fence(binding,[participant]);publisher.assertOwned(clone(binding));
  assert.deepEqual(state.record.cutover,binding.cutover);assert.equal(state.record.purpose,CUTOVER_PURPOSE);
  assert.equal(JSON.stringify(state.manifest).includes(binding.cutover.manifestId),false);
  assert.equal(Object.hasOwn(state.manifest,'purpose'),false);
});
test('missing or changed cutover fields never downgrade authorization to a deployment',()=>{
  for(const key of ['purpose','cutover']){
    const missing=clone(binding);delete missing[key];assert.throws(()=>validateBinding(missing),/CUTOVER_BINDING/);
  }
  assert.throws(()=>assertSameBinding(base,binding),/OWNER_OR_TRANSACTION/);
  assert.throws(()=>assertSameBinding(binding,base),/OWNER_OR_TRANSACTION/);
  for(const [key,value] of Object.entries({manifestId:'broken',admissionId:null,manifestVersion:'3',contentHash:'short',snapshotSha256:'short',mode:'REOPEN',extra:true})){
    const changed=clone(binding);changed.cutover[key]=value;assert.throws(()=>validateBinding(changed),/CUTOVER_BINDING/);
  }
  const changed=clone(binding);changed.cutover.contentHash='e'.repeat(64);assert.throws(()=>assertSameBinding(changed,binding),/OWNER_OR_TRANSACTION/);
  for(const extension of [{targetSha:'e'.repeat(40)},{deployMode:'api'},{configFloorSha:sha},{purpose:'DEPLOYMENT'}])
    assert.throws(()=>validateBinding({...binding,...extension}),/CUTOVER_BINDING/);
});
test('cutover fence requires its own prepared marker and never adopts another manifest or admission',()=>{
  for(const marker of [null,{}, {...pending(),phase:'UNKNOWN'}, {...pending(),cutover:{...binding.cutover,admissionId:'40000000-0000-4000-8000-000000000004'}}]){
    const {state,publisher}=fixture(marker);assert.throws(()=>publisher.fence(binding,[participant]),/CUTOVER_PENDING|OWNER_OR_TRANSACTION/);
    assert.deepEqual(state.effects,[]);
  }
});
test('ordinary fence and OPEN refuse pending-only or purpose-only states before invoking success verifier',async()=>{
  for(const marker of [{},false,'malformed',pending()]){
    const {state,publisher}=fixture(marker);assert.throws(()=>publisher.fence(base,[participant]),/CUTOVER_DEDICATED_RECOVERY/);assert.deepEqual(state.effects,[]);
  }
  const {state,publisher}=fixture(pending());publisher.fence(binding,[participant]);state.pending=null;let verified=false;
  await assert.rejects(publisher.open(clone(binding),[participant],async()=>{verified=true;return true;}),/CUTOVER_DEDICATED_RECOVERY/);
  assert.equal(verified,false);assert.equal(state.manifest.phase,'FENCED');
});
test('a marker appearing during an awaited ordinary OPEN verifier preserves FENCED and does not write OPEN',async()=>{
  const {state,publisher}=fixture();publisher.fence(base,[participant]);
  await assert.rejects(publisher.open(base,[participant],async()=>{state.pending={};return true;}),/CUTOVER_DEDICATED_RECOVERY/);
  assert.equal(state.record.phase,'FENCED');assert.equal(state.manifest.phase,'FENCED');assert.equal(state.effects.includes('private:OPEN'),false);
});
test('generic file admission refuses even a dangling or corrupt pending marker without reading private business state',()=>{
  for(const mode of ['dangling','empty','null','corrupt']){
    let read=false;assert.throws(()=>assertNoCutoverControlFiles('/owned',{exists:file=>file.endsWith('cutover-pending.json'),read:()=>{read=true;return mode;}}),/CUTOVER_DEDICATED_RECOVERY/);
    assert.equal(read,false);
  }
  assert.throws(()=>assertNoCutoverControlFiles('/owned',{exists:()=>{throw Error('unreadable');}}),/unreadable/);
  assert.equal(assertNoCutoverControlFiles('/owned',{exists:()=>false}),true);
  assert.throws(()=>assertNoCutoverControlState({purpose:'UNKNOWN'}),/CUTOVER_DEDICATED_RECOVERY/);
  assert.throws(()=>assertNoCutoverControlState({cutover:null}),/CUTOVER_DEDICATED_RECOVERY/);
});
test('a present JSON null pending file is invalid and cannot be confused with an absent marker',()=>{
  assert.throws(()=>readCutoverPending('/owned',{lstat:()=>({}),read:()=>null}),/CUTOVER_PENDING_INVALID/);
  assert.equal(readCutoverPending('/owned',{lstat:()=>{throw Object.assign(Error('absent'),{code:'ENOENT'});}}),null);
  assert.throws(()=>readCutoverPending('/owned',{lstat:()=>{throw Object.assign(Error('denied'),{code:'EACCES'});}}),/denied/);
});


test('default private control reader distinguishes absence from JSON null and propagates unreadable metadata',()=>{
  assert.throws(()=>readBackgroundPrivate('/owned',{lstat:()=>({}),read:()=>null}),/CONTROL_RECORD_INVALID/);
  assert.throws(()=>readBackgroundPrivate('/owned',{lstat:()=>({}),read:()=>[]}),/CONTROL_RECORD_INVALID/);
  assert.throws(()=>readBackgroundPrivate('/owned',{lstat:()=>({}),read:()=>{throw Error('OWNED_PRIVATE_INPUT_SNIPPET');}}),error=>error.message==='BACKGROUND_HOLD=CONTROL_RECORD_INVALID');
  assert.throws(()=>readCutoverPending('/owned',{lstat:()=>({}),read:()=>{throw Error('OWNED_PRIVATE_INPUT_SNIPPET');}}),error=>error.message==='BACKGROUND_HOLD=CUTOVER_PENDING_INVALID');
  assert.equal(readBackgroundPrivate('/owned',{lstat:()=>{throw Object.assign(Error('absent'),{code:'ENOENT'});}}),null);
  assert.throws(()=>readBackgroundPrivate('/owned',{lstat:()=>{throw Error('unreadable');}}),/unreadable/);
});

test('actual diagnostic export code removes cutover bindings from live and nested recovery JSON',()=>{
  const workflow=fs.readFileSync(new URL('../../.github/workflows/production-state-materialization.yml',import.meta.url),'utf8');
  const match=workflow.match(/redacted_json\(\) \{\s*node --input-type=module -e '([\s\S]*?)' "\$1"/);assert.ok(match,'Exact workflow redaction program required');
  const directory=fs.mkdtempSync(path.resolve('artifacts/cutover-export-'));
  const normal={phase:'OPEN',owner:base.owner,previousFloorSha:sha,targetSha:sha};
  const cutover={...clone(binding),phase:'FENCED'},input={normal,live:cutover,archived:[{name:'background-control.json',value:cutover}],pending:pending()};
  const file=path.join(directory,'owned-control.json');fs.writeFileSync(file,JSON.stringify(input),{mode:0o600});
  const result=spawnSync(process.execPath,['--input-type=module','-e',match[1],file],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  const exported=JSON.parse(result.stdout);assert.deepEqual(exported.normal,normal);
  for(const value of [exported.live,exported.archived[0].value,exported.pending]){
    assert.equal(value.cutoverRedacted,true);assert.equal(Object.hasOwn(value,'cutover'),false);assert.equal(value.owner,base.owner);
  }
  for(const privateValue of [binding.cutover.manifestId,binding.cutover.admissionId,binding.cutover.contentHash,binding.cutover.snapshotSha256])
    assert.equal(result.stdout.includes(privateValue),false);
  const sentinel='OWNED_PRIVATE_BINDING_MUST_NOT_APPEAR';fs.writeFileSync(file,'{"purpose":"PRODUCTION_CUTOVER","cutover":{"manifestId":"'+sentinel+'"}');
  const corrupt=spawnSync(process.execPath,['--input-type=module','-e',match[1],file],{encoding:'utf8'});
  assert.equal(corrupt.status,1);assert.equal(corrupt.stdout,'');assert.equal(corrupt.stderr,'STATE_EXPORT=HOLD_INVALID_JSON\n');
  assert.equal((corrupt.stdout+corrupt.stderr).includes(sentinel),false);
});
