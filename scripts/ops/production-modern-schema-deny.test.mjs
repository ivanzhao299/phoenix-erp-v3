import assert from 'node:assert/strict';import test from 'node:test';import {createHash} from 'node:crypto';
import {denyModernSchemaBackground} from './production-modern-schema-deny.mjs';
import {modernSchemaFixture} from '../ci/modern-schema-release.fixture.mjs';
import {modernSchemaReleaseBinding} from './production-modern-schema-state.mjs';
import {readLinuxProcessIdentity} from './production-modern-schema-session-lease.mjs';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fixture(){
 const {context}=modernSchemaFixture(),binding=modernSchemaReleaseBinding(context,'a'.repeat(64));
 const state={binding,read:()=>({...binding,phase:'OPEN_PUBLISHED',supervisor:readLinuxProcessIdentity(process.pid)}),store:{exists:()=>false,read:()=>{throw Error('absent');}}};
 const memory={manifest:{protocolVersion:1,phase:'OPEN',owner:context.owner,generation:8,targetSha:context.targetSha,
  participants:[{containerId:'a'.repeat(64),bootId:'30000000-0000-4000-8000-000000000003',revision:context.targetSha,allowedKinds:['LOCAL']}]},control:null,high:8,failPublic:false};
 memory.control={...binding,phase:'OPEN',generation:8,manifestDigest:sha(memory.manifest)};
 const publisher={guard(){},readPrivate:()=>structuredClone(memory.control),readPublic:()=>structuredClone(memory.manifest),readHighWater:()=>memory.high,
  writeHighWater:g=>{memory.high=g;},writePrivate:v=>{memory.control=structuredClone(v);},writePublic:v=>{if(memory.failPublic)throw Error('disk full');memory.manifest=structuredClone(v);}};
 return {context,state,memory,publisher};
}
test('interrupted private-first denial retries the exact missing public write and remains idempotently denied',()=>{
 const f=fixture();f.memory.failPublic=true;
 assert.throws(()=>denyModernSchemaBackground(f),/disk full/);
 assert.equal(f.memory.control.phase,'CODE_HOLD');assert.equal(f.memory.manifest.phase,'OPEN');
 f.memory.failPublic=false;assert.equal(denyModernSchemaBackground(f).backgroundDenied,true);
 assert.equal(f.memory.manifest.phase,'CODE_HOLD');assert.equal(f.memory.manifest.generation,9);
 assert.equal(denyModernSchemaBackground(f).backgroundDenied,true);assert.equal(f.memory.high,9);
});
test('a changed denial intermediate is never repaired by accepting an unrelated OPEN',()=>{
 const f=fixture();f.memory.failPublic=true;assert.throws(()=>denyModernSchemaBackground(f));
 f.memory.failPublic=false;f.memory.manifest.targetSha='e'.repeat(40);
 assert.throws(()=>denyModernSchemaBackground(f));assert.equal(f.memory.manifest.phase,'OPEN');
});
test('an unpublished private OPEN may be safely denied while the protected public FENCED remains',()=>{
 const f=fixture();f.memory.manifest.phase='FENCED';f.memory.manifest.generation=7;
 const expected={...f.memory.manifest,phase:'OPEN',generation:8};
 f.memory.control.manifestDigest=sha(expected);
 f.state.store.read=()=>({schema:'phoenix.modern-schema-open-commit-intent/v1',contextDigest:canonicalDigest(f.context),
  fencedPublicManifestSha256:canonicalDigest(f.memory.manifest),expectedPublicManifest:expected});
 assert.equal(denyModernSchemaBackground(f).backgroundDenied,true);assert.equal(f.memory.manifest.phase,'CODE_HOLD');
});
test('a committed public OPEN cannot be undone by the failure-only denial API',()=>{
 const f=fixture();f.state.store.exists=()=>true;f.state.store.read=()=>({expectedPublicManifest:f.memory.manifest});
 assert.throws(()=>denyModernSchemaBackground(f),/PUBLIC_OPEN_ALREADY_COMMITTED_FORWARD_ONLY/);
 assert.equal(f.memory.control.phase,'OPEN');assert.equal(f.memory.manifest.phase,'OPEN');
});
test('an interrupted initial FENCE is completed as denial without claiming a successful drain',()=>{
 for(const published of [false,true]){
  const f=fixture(),original=structuredClone(f.memory.manifest);original.owner='prior-1';original.targetSha=f.context.runtimeSha;
  const expected={...f.memory.manifest,phase:'FENCED'};
  f.memory.control={...f.memory.control,phase:'PUBLISHING_FENCE',manifestDigest:sha(expected)};
  f.memory.manifest=published?expected:original;
  f.state.store.read=()=>({originalBackground:{manifest:original}});
  assert.equal(denyModernSchemaBackground(f).backgroundDenied,true);
  assert.equal(f.memory.control.phase,'FENCED');assert.deepEqual(f.memory.manifest,expected);
 }
});
