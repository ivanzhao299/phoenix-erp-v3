/** Owner-delegated COMMENT source provenance, never a runtime authority.
 * Keeps the real GitHub state/actor. An owner-grant digest is only a reference:
 * this reader cannot authenticate a user-channel grant or approve a release.
 * Existing independent-APPROVE/runtime validators are deliberately unchanged. */
import {createHash} from 'node:crypto';
import {githubReadOnlyApi} from './production-maintenance-github-authority.mjs';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
const REPOSITORY='ivanzhao299/phoenix-erp-v3';
const SHA=/^[a-f0-9]{40}$/,HASH=/^[a-f0-9]{64}$/;
const positive=n=>Number.isSafeInteger(n)&&n>0;
const login=s=>typeof s==='string'&&/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(s);
const iso=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(s)&&Number.isFinite(Date.parse(s));
const hash=s=>createHash('sha256').update(s).digest('hex');
const fail=code=>{throw Error('OWNER_SOURCE_PROVENANCE_HOLD='+code);};
const fields=['SCHEMA','REPOSITORY','PR_NUMBER','SOURCE_HEAD_SHA','SOURCE_TREE_SHA','OWNER_DELEGATION_SHA256','DELEGATE_GITHUB_USER_ID','SOURCE_REVIEW_RECEIPT_SHA256','SECURITY_TOUCH_DECISION','FROZEN_BOUNDARY_DECISION','DECISION_SCOPE','REVIEW_MODE','RUNTIME_AUTHORIZATION'];
export function parseOwnerDelegatedSourceBody(body){
 if(typeof body!=='string'||Buffer.byteLength(body)>65536)fail('BODY_REQUIRED');
 const normalized=body.replace(/\r\n/g,'\n'),blocks=[...normalized.matchAll(/^```phoenix-owner-delegated-source-review\n([\s\S]*?)\n```[ \t]*$/gm)];
 if(blocks.length!==1||(normalized.match(/```phoenix-owner-delegated-source-review/g)||[]).length!==1)fail('ONE_SOURCE_BLOCK_REQUIRED');
 const value={};for(const line of blocks[0][1].split('\n')){const m=/^([A-Z0-9_]+)=([^\r\n]+)$/.exec(line);
  if(!m||!fields.includes(m[1])||Object.hasOwn(value,m[1])||m[2]!==m[2].trim())fail('SOURCE_FIELD_AMBIGUOUS');value[m[1]]=m[2];}
 if(Object.keys(value).length!==fields.length||value.SCHEMA!=='phoenix.owner-delegated-source-review/v1'||value.REPOSITORY!==REPOSITORY
  ||!/^\d+$/.test(value.PR_NUMBER)||!SHA.test(value.SOURCE_HEAD_SHA)||!SHA.test(value.SOURCE_TREE_SHA)||!HASH.test(value.OWNER_DELEGATION_SHA256)
  ||!HASH.test(value.SOURCE_REVIEW_RECEIPT_SHA256)||!/^\d+$/.test(value.DELEGATE_GITHUB_USER_ID)
  ||value.SECURITY_TOUCH_DECISION!=='APPROVED'||value.FROZEN_BOUNDARY_DECISION!=='APPROVED'||value.DECISION_SCOPE!=='SOURCE_ONLY'
  ||value.REVIEW_MODE!=='OWNER_DELEGATED_COMMENT'||value.RUNTIME_AUTHORIZATION!=='NOT_GRANTED')fail('SOURCE_ONLY_BINDING_REQUIRED');
 return value;
}
async function reviews(api,pull){
 const values=[];for(let page=1;page<=20;page++){const batch=await api(`${pull}/reviews?per_page=100&page=${page}`);
  if(!Array.isArray(batch)||batch.length>100)fail('REVIEW_RESPONSE');values.push(...batch);if(batch.length<100)return values;}
 fail('REVIEW_PAGINATION_LIMIT');
}
export async function collectOwnerDelegatedSourceProvenance(input,dependencies={}){
 if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.values(Object.getOwnPropertyDescriptors(input)).some(d=>!Object.hasOwn(d,'value')))fail('EXACT_SOURCE_REQUEST_REQUIRED');
 const request=Object.freeze({...input});
 const allowed=['repository','prNumber','sourceHeadSha','sourceTreeSha','expectedMainSha','reviewId','delegateUserId','delegateLogin','ownerDelegationDigest','sourceReviewReceiptDigest','pinnedReviewRecordSha256'];
 if(!request||Object.keys(request).some(k=>!allowed.includes(k))||request.repository!==REPOSITORY||!positive(request.prNumber)||!positive(request.reviewId)
  ||!positive(request.delegateUserId)||!login(request.delegateLogin)||![request.sourceHeadSha,request.sourceTreeSha,request.expectedMainSha].every(s=>SHA.test(s||''))
  ||![request.ownerDelegationDigest,request.sourceReviewReceiptDigest].every(s=>HASH.test(s||''))
  ||(request.pinnedReviewRecordSha256!==undefined&&!HASH.test(request.pinnedReviewRecordSha256)))fail('EXACT_SOURCE_REQUEST_REQUIRED');
 const api=dependencies.api||githubReadOnlyApi,now=dependencies.now||Date.now;
 const root=`/repos/${REPOSITORY}`,pull=`${root}/pulls/${request.prNumber}`;
 const common={schema:'phoenix.owner-delegated-source-provenance/v1',repository:REPOSITORY,prNumber:request.prNumber,sourceHeadSha:request.sourceHeadSha,
  sourceTreeSha:request.sourceTreeSha,observedMainSha:request.expectedMainSha,ownerDelegationDigest:request.ownerDelegationDigest,ownerGrantTrust:'NOT_VALIDATED_BY_SOURCE_COLLECTOR',
  sourceReviewReceiptDigest:request.sourceReviewReceiptDigest,mainMergeAuthorized:false,productionAuthorized:false,runtimeAuthorization:'NOT_GRANTED'};
 try{
  const started=now();let checkedThrough=started;
  const clock=()=>{const value=now();if(!Number.isSafeInteger(value)||value<checkedThrough)fail('CAPTURE_CLOCK_CHANGED');checkedThrough=value;return value;};clock();
  const read=async endpoint=>{clock();let result;try{result=await api(endpoint);}catch{fail('API_UNAVAILABLE_OR_DENIED');}clock();return result;};
  const pr=await read(pull),reviewList=await reviews(read,pull),review=await read(`${pull}/reviews/${request.reviewId}`);
  const commit=await read(`${root}/git/commits/${request.sourceHeadSha}`),main=await read(`${root}/git/ref/heads/main`);
  if(pr?.number!==request.prNumber||pr.head?.sha!==request.sourceHeadSha||pr.base?.ref!=='main'||pr.base?.repo?.full_name!==REPOSITORY||pr.head?.repo?.full_name!==REPOSITORY
   ||!positive(pr.user?.id)||!login(pr.user?.login)||!['open','closed'].includes(pr.state)||(pr.state==='closed'&&pr.merged!==true))fail('PR_SCOPE_CHANGED');
  if(commit?.sha!==request.sourceHeadSha||commit.tree?.sha!==request.sourceTreeSha||main?.object?.sha!==request.expectedMainSha)fail('SOURCE_TREE_OR_MAIN_CHANGED');
  const selected=reviewList.find(r=>r.id===request.reviewId),latest=new Map();
  if(new Set(reviewList.map(r=>r.id)).size!==reviewList.length||reviewList.some(r=>!positive(r.id)||!positive(r.user?.id)))fail('REVIEW_RESPONSE');
  for(const row of [...reviewList].sort((a,b)=>a.id-b.id))latest.set(row.user.id,row);
  if([...latest.values()].some(r=>r.state==='CHANGES_REQUESTED'))fail('UNRESOLVED_CHANGES_REQUESTED');
  if(!selected||canonicalDigest(selected)!==canonicalDigest(review)||latest.get(request.delegateUserId)?.id!==request.reviewId)fail('SOURCE_COMMENT_SUPERSEDED');
  if(review.state!=='COMMENTED'||review.commit_id!==request.sourceHeadSha||review.user?.id!==request.delegateUserId||review.user?.login?.toLowerCase()!==request.delegateLogin.toLowerCase()
   ||review.user?.type!=='User'||!iso(review.submitted_at)||Date.parse(review.submitted_at)>clock()
   ||review.pull_request_url!==`https://api.github.com/repos/${REPOSITORY}/pulls/${request.prNumber}`)fail('EXACT_DELEGATE_COMMENT_REQUIRED');
  if(request.pinnedReviewRecordSha256&&canonicalDigest(review)!==request.pinnedReviewRecordSha256)fail('SOURCE_COMMENT_EDITED');
  const body=parseOwnerDelegatedSourceBody(review.body);
  for(const [key,value]of Object.entries({PR_NUMBER:String(request.prNumber),SOURCE_HEAD_SHA:request.sourceHeadSha,SOURCE_TREE_SHA:request.sourceTreeSha,
   OWNER_DELEGATION_SHA256:request.ownerDelegationDigest,DELEGATE_GITHUB_USER_ID:String(request.delegateUserId),SOURCE_REVIEW_RECEIPT_SHA256:request.sourceReviewReceiptDigest}))if(body[key]!==value)fail('COMMENT_BINDING_CHANGED');
  const permission=await read(`${root}/collaborators/${encodeURIComponent(request.delegateLogin)}/permission`);
  if(permission.user?.id!==request.delegateUserId||permission.user?.login?.toLowerCase()!==request.delegateLogin.toLowerCase()
   ||!['admin','maintain','write','triage','read','none'].includes(permission.role_name)||!['admin','write','read','none'].includes(permission.permission))fail('DELEGATE_ACCOUNT_FACTS_CHANGED');
  let submissionTiming='PR_OPEN_AT_CAPTURE',decisionBodyTiming='CAPTURED_WHILE_PR_OPEN';
  // submitted_at is the submission time, not a history of editable review
  // text. Even a caller-supplied current digest cannot prove pre-merge text.
  if(pr.merged===true){if(!iso(pr.merged_at)||Date.parse(pr.merged_at)>clock())fail('MERGE_TIME_UNKNOWN');
   submissionTiming=Date.parse(review.submitted_at)>Date.parse(pr.merged_at)?'SUBMITTED_AFTER_MERGE':'SUBMITTED_BEFORE_MERGE';
   decisionBodyTiming='MERGED_PR_BODY_HISTORY_UNVERIFIED';}
  const initial=[pr,reviewList,review,commit,main,permission];
  const final=[await read(pull),await reviews(read,pull),await read(`${pull}/reviews/${request.reviewId}`),await read(`${root}/git/commits/${request.sourceHeadSha}`),await read(`${root}/git/ref/heads/main`),await read(`${root}/collaborators/${encodeURIComponent(request.delegateLogin)}/permission`)];
  if(canonicalDigest(initial)!==canonicalDigest(final))fail('SERVER_STATE_CHANGED_DURING_CAPTURE');
  return {...common,outcome:'SERVER_SOURCE_FACTS_VERIFIED',startedAt:new Date(started).toISOString(),checkedThrough:new Date(clock()).toISOString(),reviewMode:'OWNER_DELEGATED_COMMENT',realGithubState:review.state,
   reviewId:review.id,reviewerId:review.user.id,reviewer:review.user.login,authorId:pr.user.id,author:pr.user.login,selfAuthoredSource:review.user.id===pr.user.id,
   permissionFact:permission.role_name,submissionTiming,decisionBodyTiming,submittedAt:review.submitted_at,bodySha256:hash(review.body),rawReviewRecordSha256:canonicalDigest(review),
   serverSnapshotSha256:canonicalDigest(initial),sourceDecision:{securityTouch:body.SECURITY_TOUCH_DECISION,frozenBoundary:body.FROZEN_BOUNDARY_DECISION,scope:'SOURCE_ONLY'}};
 }catch(error){return {...common,outcome:'HOLD',reason:/^OWNER_SOURCE_PROVENANCE_HOLD=([A-Z_]+)$/.exec(error?.message||'')?.[1]||'SERVER_RESPONSE_UNVERIFIED'};}
}
