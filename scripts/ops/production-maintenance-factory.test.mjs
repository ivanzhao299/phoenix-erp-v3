/** Source custody tests use only owned temporary files. They are not the
 * continuous Docker/ERP factory acceptance or a production release receipt. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createFactorySourceJournal} from './production-maintenance-factory.mjs';
import {createMaintenanceEvidence,bindingDigest} from './production-maintenance-receipts.mjs';
import {fixture,harness} from '../ci/maintenance-transition-fixture.mjs';
async function use(action){const h=harness(fixture({clock:Date.now}));try{await action(h,createFactorySourceJournal(h.context,h.store));}finally{fs.rmSync(h.directory,{recursive:true});}}
const request=(h,kind)=>({kind,context:h.context,bindingDigest:bindingDigest(h.context)});
test('a valid self-hash without actual factory source custody is rejected',()=>use(async(h,j)=>{
 const envelope=createMaintenanceEvidence('PRE',h.context,{healthy:true});
 assert.equal(await j.verify(envelope,request(h,'PRE')),false);
 h.store.immutable(path.join(h.directory,`maintenance-source-${h.context.owner}-${envelope.evidenceSha256}.json`),{envelope});
 assert.equal(await j.verify(envelope,request(h,'PRE')),false);
}));
test('issued envelope and source are copied before returning and persist with exact custody',()=>use(async(h,j)=>{
 const source={schema:'owned-fixture-source/v1',actual:{counter:1}},body={value:4};
 const envelope=j.issue('PRE',body,source);source.actual.counter=2;body.value=5;
 assert.equal(await j.verify(envelope,request(h,'PRE')),true);
 const file=path.join(h.directory,`maintenance-source-${h.context.owner}-${envelope.evidenceSha256}.json`),capsule=h.store.read(file);
 assert.equal(capsule.source.actual.counter,1);assert.equal(capsule.envelope.body.value,4);
 envelope.body.value=9;assert.equal(await j.verify(envelope,request(h,'PRE')),false);
}));
test('disk tampering cannot be accepted by the original issuer',()=>use(async(h,j)=>{
 const envelope=j.issue('PRE',{value:1},{value:2}),file=path.join(h.directory,`maintenance-source-${h.context.owner}-${envelope.evidenceSha256}.json`);
 const capsule=h.store.read(file);capsule.source.value=3;fs.writeFileSync(file,JSON.stringify(capsule));
 assert.equal(await j.verify(envelope,request(h,'PRE')),false);
}));
test('a new process journal cannot reconstruct prior successful actions from disk',()=>use(async(h,j)=>{
 const envelope=j.issue('PRE',{value:1},{value:2}),other=createFactorySourceJournal(h.context,h.store);
 assert.equal(await other.verify(envelope,request(h,'PRE')),false);
 assert.equal(await j.verify(envelope,request(h,'PRE')),true);
}));
test('the same envelope cannot be re-sealed with different source facts',()=>use(async(h,j)=>{
 const envelope=j.issue('PRE',{value:1},{value:2});
 assert.throws(()=>j.seal('PRE',envelope,{value:3}),/SOURCE_REUSED_OR_CHANGED/);
 assert.equal(await j.verify(envelope,request(h,'PRE')),true);
}));
test('a legitimate later source projection cannot rewrite historical source custody',()=>use(async(h,j)=>{
 const old=j.issue('LEGACY_PUBLIC_FENCED',{generation:1},{manifest:{generation:1}});
 const later=j.issue('CANDIDATE_PUBLIC_ADOPTED',{generation:2},{manifest:{generation:2}});
 assert.equal(await j.verify(old,request(h,'LEGACY_PUBLIC_FENCED')),true);
 assert.equal(await j.verify(later,request(h,'CANDIDATE_PUBLIC_ADOPTED')),true);
 assert.equal(await j.verify(old,request(h,'CANDIDATE_PUBLIC_ADOPTED')),false);
 assert.equal(await j.verify(old,{...request(h,'LEGACY_PUBLIC_FENCED'),bindingDigest:'a'.repeat(64)}),false);
}));
test('cleanup-only records never authorize normal effects and cannot disguise PRE as cleanup',()=>use(async(h,j)=>{
 const envelope=j.issue('CANDIDATE_CONTROL_RELEASED',{connected:false},{closed:true},{cleanupOnly:true});
 assert.equal(await j.verify(envelope,request(h,'CANDIDATE_CONTROL_RELEASED')),false);
 assert.equal(await j.verify(envelope,{...request(h,'CANDIDATE_CONTROL_RELEASED'),purpose:'OWNED_RESOURCE_CLEANUP_ONLY'}),true);
 assert.throws(()=>j.issue('PRE',{healthy:true},{},{cleanupOnly:true}),/CLEANUP_SOURCE_BINDING/);
}));
test('a store bound to a different target cannot receive source custody',()=>use(async(h)=>{
 const other=structuredClone(h.context);other.targetSha='d'.repeat(40);other.candidate.revision=other.targetSha;
 assert.throws(()=>createFactorySourceJournal(other,h.store),/EXACT_SOURCE_STORE_REQUIRED/);
}));
