/** Isolated protected files + simulated server responses; no production grant. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {ownerSourceBindingDigest} from './production-maintenance-owner-source-provenance.mjs';
import path from 'node:path';
import {collectMaintenanceGithubAuthority} from './production-maintenance-github-authority.mjs';
import {canonicalDigest,bindingDigest,MAINTENANCE_AUTHORITY_SCHEMA} from './production-maintenance-receipts.mjs';
import {harness,now,hash,time} from '../ci/maintenance-transition-fixture.mjs';
const repository='ivanzhao299/phoenix-erp-v3',base='/repos/'+repository;
function fixture(){
 const h=harness(),context=h.context,owner=context.owner.split('-').map(Number),head='a'.repeat(40),tree='b'.repeat(40),actor={id:7245339,login:'emvia',type:'User'};
 const payload=structuredClone(h.material.approval.payload),reviewId=123,prNumber=456,pull=base+'/pulls/'+prNumber,receipt=hash('1');
 const fields={SCHEMA:'phoenix.owner-delegated-source-review/v1',REPOSITORY:repository,PR_NUMBER:String(prNumber),SOURCE_HEAD_SHA:head,SOURCE_TREE_SHA:tree,OWNER_DELEGATION_SHA256:hash('a'),DELEGATE_GITHUB_USER_ID:String(actor.id),SOURCE_REVIEW_RECEIPT_SHA256:receipt,SECURITY_TOUCH_DECISION:'APPROVED',FROZEN_BOUNDARY_DECISION:'APPROVED',DECISION_SCOPE:'SOURCE_ONLY',REVIEW_MODE:'OWNER_DELEGATED_COMMENT',RUNTIME_AUTHORIZATION:'NOT_GRANTED'};
 const review={id:reviewId,state:'COMMENTED',commit_id:head,user:actor,submitted_at:time(-2000),pull_request_url:'https://api.github.com'+pull,body:'```phoenix-owner-delegated-source-review\n'+Object.entries(fields).map(([k,v])=>k+'='+v).join('\n')+'\n```'};
 const grant={schema:'phoenix.owner-delegated-maintenance-grant/v1',repository,authorityKind:'OWNER_DELEGATED',authorizationOrigin:'TRUSTED_INTERACTIVE_USER',authorizationRef:'OWNER_DIRECT_AUTHORIZATION_20261018_AND_EXPEDITED_20261019',authorizationDigest:hash('a'),delegate:{githubUserId:actor.id,githubLogin:actor.login},context:structuredClone(context),source:{headSha:head,treeSha:tree,prNumber,reviewId,reviewRecordDigest:canonicalDigest(review),sourceProvenanceDigest:hash('c'),mergedMainSha:context.targetSha},dispatch:{runId:owner[0],attempt:owner[1],actorId:actor.id,workflowSha:context.targetSha,workflowPath:'.github/workflows/deploy.yml',event:'workflow_dispatch'},maintenanceWindowConfirmationDigest:hash('d'),scope:{mode:'api',buildApi:true,buildWeb:false,runMigration:false,chanjetPolicy:'HOLD',readonlySync:false,inboundSync:false,rotateCredentials:false,automaticRollback:false},payloadSha256:canonicalDigest(payload),evidence:{preSnapshotDigest:canonicalDigest(context.preSnapshot),recoveryMaterialDigest:hash('e'),candidateImageId:context.candidate.imageId,releaseArtifactId:789,releaseArtifactDigest:hash('f')},registeredAt:time(-1000),expiresAt:context.window.end};
 grant.source.sourceProvenanceDigest=ownerSourceBindingDigest({outcome:'SERVER_SOURCE_FACTS_VERIFIED',repository,prNumber,sourceHeadSha:head,sourceTreeSha:tree,observedMainSha:context.targetSha,ownerDelegationDigest:grant.authorizationDigest,sourceReviewReceiptDigest:receipt,reviewId,reviewerId:actor.id,reviewer:actor.login,realGithubState:'COMMENTED',rawReviewRecordSha256:canonicalDigest(review),bodySha256:createHash('sha256').update(review.body).digest('hex'),sourceDecision:{securityTouch:'APPROVED',frozenBoundary:'APPROVED',scope:'SOURCE_ONLY'}});
 const approval={schema:MAINTENANCE_AUTHORITY_SCHEMA,authorityKind:'OWNER_DELEGATED',decision:'AUTHORIZED',purpose:'MAINTENANCE',bindingDigest:bindingDigest(context),payload,payloadSha256:canonicalDigest(payload),ownerGrantSha256:canonicalDigest(grant)};
 const source={repository,prNumber,sourceHeadSha:head,sourceTreeSha:tree,expectedMainSha:context.targetSha,reviewId,delegateUserId:actor.id,delegateLogin:actor.login,ownerDelegationDigest:grant.authorizationDigest,sourceReviewReceiptDigest:receipt,pinnedReviewRecordSha256:canonicalDigest(review)};
 const pr={number:prNumber,user:actor,state:'closed',merged:true,merged_at:time(-1500),merge_commit_sha:context.targetSha,head:{sha:head,repo:{full_name:repository}},base:{ref:'main',repo:{full_name:repository}}};
 const run={id:owner[0],run_attempt:owner[1],actor,triggering_actor:actor,head_sha:context.targetSha,repository:{full_name:repository},event:'workflow_dispatch',head_branch:'main',path:'.github/workflows/deploy.yml',status:'in_progress'};
 const responses={[pull]:pr,[pull+'/reviews?per_page=100&page=1']:[review],[pull+'/reviews/'+reviewId]:review,[base+'/git/commits/'+head]:{sha:head,tree:{sha:tree}},[base+'/git/ref/heads/main']:{object:{sha:context.targetSha}},[base+'/collaborators/emvia/permission']:{permission:'write',role_name:'write',user:actor},[base+'/actions/runs/'+owner[0]]:run,[base+'/compare/'+head+'...'+context.targetSha]:{base_commit:{sha:head},merge_base_commit:{sha:head},status:'ahead'}};
 const calls=[];const request={repository,prNumber,sourceHeadSha:head,reviewId,sourceReviewReceiptDigest:receipt,receiptDigest:grant.evidence.releaseArtifactDigest,pinnedReviewRecordSha256:canonicalDigest(review),context,purpose:'MAINTENANCE',operation:'STOP_LEGACY',authorityMode:'OWNER_DELEGATED',ownerApproval:approval,ownerSource:source};
 const dependencies={api:async endpoint=>{calls.push(endpoint);if(!Object.hasOwn(responses,endpoint))throw Error('UNEXPECTED_API');return structuredClone(responses[endpoint]);},now:()=>now,ownerAuthorityDependencies:{directory:h.directory,guard(){},inspectDirectory:()=>{const s=fs.statSync(h.directory);return {dev:s.dev,ino:s.ino,uid:s.uid,mode:s.mode};},expectedUid:process.getuid(),now:()=>now}};
 return {h,grant,approval,request,dependencies,run,pr,review,responses,calls,persist(){h.store.immutable(path.join(h.directory,`maintenance-owner-grant-${context.owner}.json`),grant);},close(){fs.rmSync(h.directory,{recursive:true});}};
}
async function use(action){const f=fixture();try{await action(f);}finally{f.close();}}
test('registered owner delegation + exact COMMENT + real-shaped run does not require environment reviewers',()=>use(async f=>{
 f.persist();const result=await collectMaintenanceGithubAuthority(f.request,f.dependencies);
 assert.equal(result.outcome,'AUTHORIZED');assert.equal(result.productionAuthorized,true);assert.equal(result.sourceReview.realGithubState,'COMMENTED');assert.equal(result.sourceReview.selfAuthoredSource,true);assert.equal(result.environment.requiredReviewersUsed,false);assert.equal(f.calls.some(c=>c.includes('/environments/')||c.endsWith('/approvals')),false);
}));
test('a COMMENT and dispatch alone cannot replace an actual protected grant',()=>use(async f=>{
 const r=await collectMaintenanceGithubAuthority(f.request,f.dependencies);assert.equal(r.reason,'PROTECTED_OWNER_GRANT_REQUIRED');assert.equal(r.productionAuthorized,false);assert.deepEqual(f.calls,[]);
 f.persist();const actual=await collectMaintenanceGithubAuthority(f.request,{api:f.dependencies.api,now:f.dependencies.now});assert.equal(actual.productionAuthorized,false);
}));
for(const [label,change]of [
 ['release artifact digest',f=>f.request.receiptDigest=hash('2')],
 ['main drift',f=>f.responses[base+'/git/ref/heads/main'].object.sha='f'.repeat(40)],
 ['run SHA',f=>f.run.head_sha='f'.repeat(40)],['actor',f=>f.run.actor={...f.run.actor,id:1}],['rerun actor',f=>f.run.triggering_actor={...f.run.actor,id:1}],['attempt',f=>f.run.run_attempt++],['push event',f=>f.run.event='push'],['other workflow',f=>f.run.path='.github/workflows/other.yml'],['completed run',f=>f.run.status='completed'],['wrong merge',f=>f.pr.merge_commit_sha='f'.repeat(40)],['edited COMMENT',f=>f.review.body+='\nchanged'],['source receipt',f=>f.request.ownerSource.sourceReviewReceiptDigest=hash('4')],['runtime Web scope',f=>f.request.ownerApproval.payload.operations.push('DEPLOY_WEB')]
])test('owner authority refuses '+label,()=>use(async f=>{f.persist();change(f);const result=await collectMaintenanceGithubAuthority(f.request,f.dependencies);assert.equal(result.productionAuthorized,false);}));
test('revocation during API capture refuses without environment calls or record cleanup',()=>use(async f=>{
 f.persist();const api=f.dependencies.api;let count=0;
 f.dependencies.api=async endpoint=>{const v=await api(endpoint);if(++count===4)f.h.store.immutable(path.join(f.h.directory,`maintenance-owner-revoked-${f.request.context.owner}.json`),{reason:'ISOLATED_TEST'});return v;};
 assert.equal((await collectMaintenanceGithubAuthority(f.request,f.dependencies)).productionAuthorized,false);
 assert.equal(fs.existsSync(path.join(f.h.directory,`maintenance-owner-revoked-${f.request.context.owner}.json`)),true);
}));

test('a root grant cannot claim a different stable source binding',()=>use(async f=>{
 f.grant.source.sourceProvenanceDigest=hash('2');f.approval.ownerGrantSha256=canonicalDigest(f.grant);f.persist();
 assert.equal((await collectMaintenanceGithubAuthority(f.request,f.dependencies)).reason,'OWNER_SOURCE_PROVENANCE_CHANGED');
}));
test('caller mutation while awaiting API cannot retarget the pinned owner request',()=>use(async f=>{
 f.persist();const api=f.dependencies.api;let called=false;
 f.dependencies.api=async endpoint=>{if(!called){called=true;f.request.receiptDigest=hash('2');f.request.context.targetSha='f'.repeat(40);}return api(endpoint);};
 const result=await collectMaintenanceGithubAuthority(f.request,f.dependencies);assert.equal(result.outcome,'AUTHORIZED');assert.equal(result.receiptDigest,f.grant.evidence.releaseArtifactDigest);
}));
