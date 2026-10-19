/** Simulated server facts only; never a real user grant or runtime approval. */
import test from 'node:test';import assert from 'node:assert/strict';
import {collectOwnerDelegatedSourceProvenance,parseOwnerDelegatedSourceBody} from './production-maintenance-owner-source-provenance.mjs';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
const repository='ivanzhao299/phoenix-erp-v3',root='/repos/'+repository,pull=root+'/pulls/455',head='a'.repeat(40),tree='b'.repeat(40),main='c'.repeat(40),digest='d'.repeat(64);
function fixture(){
 const actor={id:71,login:'delegate-author',type:'User'};
 const request={repository,prNumber:455,sourceHeadSha:head,sourceTreeSha:tree,expectedMainSha:main,reviewId:100,delegateUserId:71,delegateLogin:actor.login,ownerDelegationDigest:digest,sourceReviewReceiptDigest:'e'.repeat(64)};
 const fields={SCHEMA:'phoenix.owner-delegated-source-review/v1',REPOSITORY:repository,PR_NUMBER:'455',SOURCE_HEAD_SHA:head,SOURCE_TREE_SHA:tree,
  OWNER_DELEGATION_SHA256:digest,DELEGATE_GITHUB_USER_ID:'71',SOURCE_REVIEW_RECEIPT_SHA256:request.sourceReviewReceiptDigest,
  SECURITY_TOUCH_DECISION:'APPROVED',FROZEN_BOUNDARY_DECISION:'APPROVED',DECISION_SCOPE:'SOURCE_ONLY',REVIEW_MODE:'OWNER_DELEGATED_COMMENT',RUNTIME_AUTHORIZATION:'NOT_GRANTED'};
 const review={id:100,state:'COMMENTED',commit_id:head,user:actor,submitted_at:'2026-10-19T01:00:00Z',pull_request_url:'https://api.github.com'+pull,
  body:'Owner delegated technical source review; no GitHub APPROVE or runtime authority.\n```phoenix-owner-delegated-source-review\n'+Object.entries(fields).map(([k,v])=>k+'='+v).join('\n')+'\n```'};
 const pr={number:455,user:actor,state:'open',merged:false,head:{sha:head,repo:{full_name:repository}},base:{ref:'main',repo:{full_name:repository}}};
 const permissions={permission:'write',role_name:'write',user:actor};
 const server={[pull]:pr,[pull+'/reviews?per_page=100&page=1']:[review],[pull+'/reviews/100']:review,[root+'/git/commits/'+head]:{sha:head,tree:{sha:tree}},[root+'/git/ref/heads/main']:{object:{sha:main}},[root+'/collaborators/'+actor.login+'/permission']:permissions};
 return {request,review,pr,server,permissions,api:async endpoint=>structuredClone(server[endpoint])};
}
const read=(f,overrides={})=>collectOwnerDelegatedSourceProvenance(f.request,{api:f.api,now:()=>Date.parse('2026-10-19T02:00:00Z'),...overrides});
test('actual COMMENT state, same author and write role are recorded honestly without runtime or owner-grant authority',async()=>{
 const f=fixture(),value=await read(f);
 assert.equal(value.outcome,'SERVER_SOURCE_FACTS_VERIFIED');assert.equal(value.realGithubState,'COMMENTED');assert.equal(value.selfAuthoredSource,true);assert.equal(value.permissionFact,'write');
 assert.equal(value.ownerGrantTrust,'NOT_VALIDATED_BY_SOURCE_COLLECTOR');assert.equal(value.mainMergeAuthorized,false);assert.equal(value.productionAuthorized,false);assert.equal(value.runtimeAuthorization,'NOT_GRANTED');
 assert.equal(value.submissionTiming,'PR_OPEN_AT_CAPTURE');assert.equal(value.decisionBodyTiming,'CAPTURED_WHILE_PR_OPEN');assert.equal(value.rawReviewRecordSha256,canonicalDigest(f.review));
});
test('inline affirmative verifier or production flag cannot mint authority',async()=>{
 const f=fixture();let called=false;const value=await read(f,{verifyOwnerGrant:()=>{called=true;return true;},verifyProtectedEnvironment:()=>true});
 assert.equal(called,false);assert.equal(value.productionAuthorized,false);
 await assert.rejects(()=>collectOwnerDelegatedSourceProvenance({...f.request,productionAuthorized:true},{api:f.api}),/EXACT_SOURCE_REQUEST_REQUIRED/);
});
test('source parser refuses ambiguous or runtime-grant blocks',()=>{
 const f=fixture();assert.equal(parseOwnerDelegatedSourceBody(f.review.body).DECISION_SCOPE,'SOURCE_ONLY');
 for(const body of [f.review.body+'\n'+f.review.body,f.review.body.replace('SOURCE_TREE_SHA='+tree,'SOURCE_TREE_SHA='+tree+'\nSOURCE_TREE_SHA='+tree),
  f.review.body.replace('RUNTIME_AUTHORIZATION=NOT_GRANTED','RUNTIME_AUTHORIZATION=APPROVED'),f.review.body.replace('REVIEW_MODE=OWNER_DELEGATED_COMMENT','REVIEW_MODE=GITHUB_APPROVE')])assert.throws(()=>parseOwnerDelegatedSourceBody(body));
});
for(const [name,change]of [
 ['source head',f=>f.pr.head.sha=main],['source tree',f=>f.server[root+'/git/commits/'+head].tree.sha=main],['main drift',f=>f.server[root+'/git/ref/heads/main'].object.sha=head],
 ['wrong actor id',f=>f.review.user={...f.review.user,id:72}],['wrong actor login',f=>f.review.user={...f.review.user,login:'someone-else'}],
 ['forged approve',f=>f.review.state='APPROVED'],['dismissal',f=>f.review.state='DISMISSED'],
 ['owner reference changed',f=>f.review.body=f.review.body.replace('OWNER_DELEGATION_SHA256='+digest,'OWNER_DELEGATION_SHA256='+'f'.repeat(64))],
 ['source receipt changed',f=>f.request.sourceReviewReceiptDigest='f'.repeat(64)],['permission identity changed',f=>f.permissions.user={...f.permissions.user,id:72}],
])test('refuses '+name,async()=>{const f=fixture();change(f);assert.equal((await read(f)).outcome,'HOLD');});
test('latest record and outstanding changes requested remain meaningful',async()=>{
 for(const other of [{state:'COMMENTED',user:{id:71,login:'delegate-author',type:'User'}},{state:'CHANGES_REQUESTED',user:{id:72,login:'other',type:'User'}}]){
  const f=fixture();f.server[pull+'/reviews?per_page=100&page=1'].push({...f.review,id:101,...other});assert.equal((await read(f)).outcome,'HOLD');
 }
});
test('record digest and before/after rereads reject review edit, deletion and source changes',async()=>{
 const f=fixture();f.request.pinnedReviewRecordSha256='f'.repeat(64);assert.equal((await read(f)).reason,'SOURCE_COMMENT_EDITED');
 for(const endpoint of [pull,pull+'/reviews/100',pull+'/reviews?per_page=100&page=1',root+'/git/ref/heads/main']){
  const g=fixture();let reads=0;const api=async e=>{const value=await g.api(e);if(e===endpoint&&++reads===2){if(Array.isArray(value))return [];return {...value,changed:true};}return value;};
  assert.equal((await read(g,{api})).reason,'SERVER_STATE_CHANGED_DURING_CAPTURE');
 }
});
test('post-merge attestation is never relabelled as a pre-merge source review',async()=>{
 const f=fixture();Object.assign(f.pr,{state:'closed',merged:true,merged_at:'2026-10-19T00:30:00Z'});
 const value=await read(f);assert.equal(value.submissionTiming,'SUBMITTED_AFTER_MERGE');assert.equal(value.decisionBodyTiming,'MERGED_PR_BODY_HISTORY_UNVERIFIED');assert.equal(value.mainMergeAuthorized,false);assert.equal(value.productionAuthorized,false);
});
test('API errors are fixed sanitized HOLD without raw credentials or response content',async()=>{
 const f=fixture(),value=await read(f,{api:async()=>{throw Error('synthetic-sensitive-error-not-for-evidence');}});
 assert.equal(value.reason,'API_UNAVAILABLE_OR_DENIED');assert.equal(JSON.stringify(value).includes('synthetic-sensitive'),false);
});

test('pre-merge submission plus a current digest cannot prove current editable body existed before merge',async()=>{
 for(const pin of [false,true]){const f=fixture();Object.assign(f.pr,{state:'closed',merged:true,merged_at:'2026-10-19T01:30:00Z'});
  if(pin)f.request.pinnedReviewRecordSha256=canonicalDigest(f.review);
  const value=await read(f);assert.equal(value.submissionTiming,'SUBMITTED_BEFORE_MERGE');assert.equal(value.decisionBodyTiming,'MERGED_PR_BODY_HISTORY_UNVERIFIED');assert.equal(value.productionAuthorized,false);
 }
});

test('mutable caller cannot retarget delegate, source or permission across awaits',async()=>{
 const f=fixture();let changed=false;const value=await read(f,{api:async endpoint=>{if(!changed&&endpoint.includes('/collaborators/')){changed=true;f.request.delegateUserId=99;f.request.delegateLogin='different';f.request.expectedMainSha=head;}return f.api(endpoint);}});
 assert.equal(changed,true);assert.equal(value.outcome,'SERVER_SOURCE_FACTS_VERIFIED');assert.equal(value.reviewerId,71);assert.equal(value.reviewer,'delegate-author');assert.equal(value.observedMainSha,main);
});
test('capture records a bounded chronology and rejects clock reversal',async()=>{
 const f=fixture(),value=await read(f);assert.equal(value.startedAt,'2026-10-19T02:00:00.000Z');assert.equal(value.checkedThrough,value.startedAt);
 let time=Date.parse(value.startedAt);const g=fixture(),failed=await read(g,{now:()=>time,api:async endpoint=>{const data=await g.api(endpoint);time--;return data;}});
 assert.equal(failed.reason,'CAPTURE_CLOCK_CHANGED');assert.equal(failed.productionAuthorized,false);
});
