import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {isOwnerDelegatedMaintenanceApproval,validateRegisteredOwnerMaintenanceGrant,verifyRegisteredOwnerMaintenanceAuthority} from './production-maintenance-owner-authority.mjs';
import {canonicalDigest,bindingDigest,MAINTENANCE_AUTHORITY_SCHEMA} from './production-maintenance-receipts.mjs';
import {LegacyMaintenanceTransition} from './production-maintenance-transition.mjs';
import {fixture,harness,now,hash,time} from '../ci/maintenance-transition-fixture.mjs';
function setup(){
 const h=harness(),context=h.context,expected={context,bindingDigest:bindingDigest(context),targetSha:context.targetSha,purpose:'MAINTENANCE',operation:'FENCE_INGRESS'};
 const payload=structuredClone(h.material.approval.payload),owner=context.owner.split('-').map(Number);
 const grant={schema:'phoenix.owner-delegated-maintenance-grant/v1',repository:'ivanzhao299/phoenix-erp-v3',authorityKind:'OWNER_DELEGATED',authorizationOrigin:'TRUSTED_INTERACTIVE_USER',authorizationRef:'OWNER_DIRECT_AUTHORIZATION_20261018_AND_EXPEDITED_20261019',authorizationDigest:hash('a'),delegate:{githubUserId:7245339,githubLogin:'emvia'},context:structuredClone(context),
  source:{headSha:'a'.repeat(40),treeSha:'b'.repeat(40),prNumber:455,reviewId:123,reviewRecordDigest:hash('b'),sourceProvenanceDigest:hash('c'),mergedMainSha:context.targetSha},
  dispatch:{runId:owner[0],attempt:owner[1],actorId:7245339,workflowSha:context.targetSha,workflowPath:'.github/workflows/deploy.yml',event:'workflow_dispatch'},maintenanceWindowConfirmationDigest:hash('d'),
  scope:{mode:'api',buildApi:true,buildWeb:false,runMigration:false,chanjetPolicy:'HOLD',readonlySync:false,inboundSync:false,rotateCredentials:false,automaticRollback:false},payloadSha256:canonicalDigest(payload),
  evidence:{preSnapshotDigest:canonicalDigest(context.preSnapshot),recoveryMaterialDigest:hash('e'),candidateImageId:context.candidate.imageId,releaseArtifactId:456,releaseArtifactDigest:hash('f')},registeredAt:time(-1000),expiresAt:context.window.end};
 const approval={schema:MAINTENANCE_AUTHORITY_SCHEMA,authorityKind:'OWNER_DELEGATED',decision:'AUTHORIZED',purpose:'MAINTENANCE',bindingDigest:bindingDigest(context),payload,payloadSha256:canonicalDigest(payload),ownerGrantSha256:canonicalDigest(grant)};
 const file=path.join(h.directory,`maintenance-owner-grant-${context.owner}.json`);
 const deps={directory:h.directory,guard:()=>{},inspectDirectory:()=>{const s=fs.statSync(h.directory);return {dev:s.dev,ino:s.ino,uid:s.uid,mode:s.mode};},expectedUid:process.getuid(),now:()=>now};
 return {h,context,expected,approval,grant,file,deps,persist(){h.store.immutable(file,grant);},close(){fs.rmSync(h.directory,{recursive:true});}};
}
async function use(action){const f=setup();try{await action(f);}finally{f.close();}}

test('honest owner delegation contains no GitHub APPROVE or invented reviewer identity',()=>use(async f=>{
 assert.equal(isOwnerDelegatedMaintenanceApproval(f.approval,f.expected),true);assert.equal(f.approval.decision,'AUTHORIZED');assert.equal('serverRecord' in f.approval,false);assert.equal(validateRegisteredOwnerMaintenanceGrant(f.grant,f.approval,f.expected,now),true);
 assert.equal(await verifyRegisteredOwnerMaintenanceAuthority(f.approval,f.expected,f.deps),false);f.persist();assert.equal(await verifyRegisteredOwnerMaintenanceAuthority(f.approval,f.expected,f.deps),true);
 assert.equal(await verifyRegisteredOwnerMaintenanceAuthority(f.approval,f.expected),false,'actual protected-root guard cannot be bypassed by synthetic fixture files');
}));
test('COMMENT source facts, environment switches or copied hashes never create an owner approval',()=>use(async f=>{
 for(const changes of [{decision:'APPROVED'},{authorityKind:'GITHUB_REVIEW'},{purpose:'UNKNOWN_EFFECTS'},{serverRecord:{state:'APPROVED'}},{ALLOW_SECURITY_TOUCH:true},{sourceProvenanceDigest:hash('a')}])assert.equal(isOwnerDelegatedMaintenanceApproval({...f.approval,...changes},f.expected),false);
 assert.equal(isOwnerDelegatedMaintenanceApproval(f.approval,{...f.expected,purpose:'UNKNOWN_EFFECTS'}),false);
 const extra=structuredClone(f.approval);extra.payload.operations.push('UNKNOWN_EFFECTS');extra.payloadSha256=canonicalDigest(extra.payload);assert.equal(isOwnerDelegatedMaintenanceApproval(extra,f.expected),false);
}));
for(const [label,change] of [
 ['new runtime',g=>g.context.targetSha='c'.repeat(40)],['old floor',g=>g.context.previousFloorSha='d'.repeat(40)],['wrong delegate',g=>g.delegate.githubUserId=1],['wrong actor',g=>g.dispatch.actorId=1],['new attempt',g=>g.dispatch.attempt++],['wrong workflow',g=>g.dispatch.workflowPath='.github/workflows/other.yml'],['unbound workflow SHA',g=>g.dispatch.workflowSha='c'.repeat(40)],['no window confirmation',g=>delete g.maintenanceWindowConfirmationDigest],['full deploy',g=>g.scope.mode='full'],['migration',g=>g.scope.runMigration=true],['Web deploy',g=>g.scope.buildWeb=true],['Chanjet active',g=>g.scope.chanjetPolicy='READONLY_ACTIVE'],['wrong PRE',g=>g.evidence.preSnapshotDigest=hash('1')],['wrong candidate',g=>g.evidence.candidateImageId='sha256:'+hash('2')],['missing artifact',g=>delete g.evidence.releaseArtifactDigest],['unbound source merge',g=>g.source.mergedMainSha='c'.repeat(40)],['future grant',g=>g.registeredAt=time(1)],['unknown extra field',g=>g.permission='ADMIN'],['other repo',g=>g.repository='other/repo']])test(`root-registered ${label} cannot reuse a grant`,()=>use(async f=>{
 change(f.grant);f.approval.ownerGrantSha256=canonicalDigest(f.grant);assert.throws(()=>validateRegisteredOwnerMaintenanceGrant(f.grant,f.approval,f.expected,now));f.persist();assert.equal(await verifyRegisteredOwnerMaintenanceAuthority(f.approval,f.expected,f.deps),false);
}));
test('grant expiry and a protected revocation fail closed without clearing any marker',()=>use(async f=>{
 f.persist();assert.equal(await verifyRegisteredOwnerMaintenanceAuthority(f.approval,f.expected,{...f.deps,now:()=>Date.parse(f.context.window.end)}),false);
 const revoked=path.join(f.h.directory,`maintenance-owner-revoked-${f.context.owner}.json`);fs.symlinkSync(path.join(f.h.directory,'missing'),revoked);
 assert.equal(await verifyRegisteredOwnerMaintenanceAuthority(f.approval,f.expected,f.deps),false);assert.equal(fs.lstatSync(revoked).isSymbolicLink(),true);
}));
test('grant symlink, hardlink and nonprivate mode cannot act as protected registration',async()=>{
 for(const kind of ['symlink','hardlink','mode'])await use(async f=>{
  f.persist();if(kind==='mode')fs.chmodSync(f.file,0o644);if(kind==='hardlink')fs.linkSync(f.file,path.join(f.h.directory,'second'));if(kind==='symlink'){const actual=f.file+'.actual';fs.renameSync(f.file,actual);fs.symlinkSync(actual,f.file);}
  assert.equal(await verifyRegisteredOwnerMaintenanceAuthority(f.approval,f.expected,f.deps),false);
 });
});
test('real isolated transition consumes only exact protected delegation, never author self-APPROVE',()=>use(async f=>{
 f.persist();const material=structuredClone(f.h.material);material.approval=f.approval;
 const engine=new LegacyMaintenanceTransition({context:f.context},{...f.h.dependencies,verifyAuthority:(approval,expected)=>verifyRegisteredOwnerMaintenanceAuthority(approval,expected,f.deps)});
 const state=await engine.prepare(material);assert.equal(state.phase,'PREPARED');assert.deepEqual(f.h.calls,[]);
 assert.equal(f.h.store.readReceipt(state.receipts.find(r=>f.h.store.readReceipt(r).kind==='MAINTENANCE_AUTHORITY')).payload.authorityKind,'OWNER_DELEGATED');
}));
test('uninstalled owner verifier still refuses before any transition mutation',()=>use(async f=>{
 const engine=new LegacyMaintenanceTransition({context:f.context},{...f.h.dependencies,verifyAuthority:undefined});const material=structuredClone(f.h.material);material.approval=f.approval;
 await assert.rejects(engine.prepare(material),/INDEPENDENT_AUTHORITY/);assert.deepEqual(fs.readdirSync(f.h.directory),[]);
}));

test('typed admission uses real protected owner grant and refuses later revocation before STOP',()=>use(async f=>{
 const {assertLegacyMaintenanceAdmission}=await import('./production-maintenance-admission.mjs');f.persist();const material=structuredClone(f.h.material);material.approval=f.approval;
 const verify=(approval,expected)=>verifyRegisteredOwnerMaintenanceAuthority(approval,expected,f.deps);
 const engine=new LegacyMaintenanceTransition({context:f.context},{...f.h.dependencies,verifyAuthority:verify,adapters:{...f.h.adapters,fenceIngress:async request=>{
  const admission=await assertLegacyMaintenanceAdmission({directory:f.h.directory,context:f.context,approval:f.approval,operation:'FENCE_INGRESS',expectedPhase:request.state.phase,expectedStateDigest:request.state.stateDigest,requiredBudgetMs:10000},{...f.deps,verifyAuthority:verify});assert.equal(admission.result,'ADMITTED');return f.h.ingress;
 }}});
 await engine.prepare(material);assert.equal((await engine.fenceIngress()).phase,'INGRESS_FENCED');
 f.h.store.immutable(path.join(f.h.directory,`maintenance-owner-revoked-${f.context.owner}.json`),{reason:'SYNTHETIC_REVOKED_FIXTURE_ONLY'});
 await assert.rejects(engine.stopLegacy(),/INDEPENDENT_AUTHORITY/);assert.equal(f.h.calls.includes('STOP'),false);
}));
