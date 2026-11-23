/** GitHub-signed dispatch identity only. Neither environment membership nor
 * this token is an owner instruction, independent approval, or release grant. */
import {createHash,createPublicKey,verify} from 'node:crypto';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
const REPO='ivanzhao299/phoenix-erp-v3',REPO_ID='1239767008',OWNER_ID='154717306';
const DELEGATE={id:'7245339',login:'emvia'},WORKFLOW='.github/workflows/deploy.yml';
const ISSUER='https://token.actions.githubusercontent.com',JWKS=ISSUER+'/.well-known/jwks';
const sha=value=>createHash('sha256').update(value).digest('hex');
const fail=code=>{throw Error('MODERN_SCHEMA_IDENTITY_HOLD='+code);};
const match=(re,value)=>typeof value==='string'&&re.test(value);
const runnerFailures=new WeakMap();
const failRunner=code=>{
 const error=Error('MODERN_SCHEMA_RUNNER_IDENTITY_HOLD='+code);
 runnerFailures.set(error,code);
 throw error;
};
export const publicModernSchemaRunnerIdentityFailure=error=>runnerFailures.get(error)??'UNVERIFIED';
function expectedBinding(value){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).sort().join(',')!=='owner,preparationSha256,targetSha'
  ||!match(/^[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$/,value.owner)||!match(/^[a-f0-9]{40}$/,value.targetSha)||!match(/^[a-f0-9]{64}$/,value.preparationSha256))fail('EXACT_PREPARATION_BINDING_REQUIRED');
 return structuredClone(value);
}
export function modernSchemaIdentityAudience(expected){return 'urn:phoenix:modern-schema:'+canonicalDigest(expectedBinding(expected));}
function decode(value){
 if(!match(/^[A-Za-z0-9_-]+$/,value))fail('JWT_ENCODING');
 const bytes=Buffer.from(value,'base64url');if(bytes.toString('base64url')!==value)fail('JWT_ENCODING');return bytes;
}
/** Pure signature/claim verifier. Only the fixed network reader below supplies
 * production keys; JSON, JWT headers and dispatch inputs cannot choose a key URL. */
export function verifyModernSchemaIdentityToken(token,expected,{jwks,now=Date.now()}={}){
 const binding=expectedBinding(expected);
 if(typeof token!=='string'||token.length>16384||token.split('.').length!==3||!Number.isSafeInteger(now))fail('JWT_REQUIRED');
 const parts=token.split('.');let header,claims;
 try{header=JSON.parse(decode(parts[0]).toString());claims=JSON.parse(decode(parts[1]).toString());}catch{fail('JWT_JSON_REQUIRED');}
 if(!header||header.alg!=='RS256'||header.typ!=='JWT'||typeof header.kid!=='string'||!header.kid||header.kid.length>256
  ||Object.keys(header).some(key=>!['alg','typ','kid','x5t'].includes(key)))fail('JWT_HEADER_REQUIRED');
 if(!jwks||!Array.isArray(jwks.keys)||!jwks.keys.length||jwks.keys.length>100||new Set(jwks.keys.map(key=>key.kid)).size!==jwks.keys.length)fail('ISSUER_KEYS_REQUIRED');
 const keys=jwks.keys.filter(key=>key.kid===header.kid);if(keys.length!==1)fail('ISSUER_KEY_NOT_UNIQUE');const key=keys[0];
 if(key.kty!=='RSA'||key.alg!=='RS256'||key.use!=='sig'||key.e!=='AQAB'||!match(/^[A-Za-z0-9_-]+$/,key.n)||decode(key.n).length<256)fail('ISSUER_RSA_KEY_REQUIRED');
 try{if(!verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),createPublicKey({key:{kty:'RSA',n:key.n,e:key.e},format:'jwk'}),decode(parts[2])))fail('JWT_SIGNATURE');}
 catch{fail('JWT_SIGNATURE');}
 if(!claims||Object.getPrototypeOf(claims)!==Object.prototype)fail('JWT_CLAIMS_REQUIRED');
 const [runId,attempt]=binding.owner.split('-');
 const subjects=[`repo:${REPO}:environment:production`,'repo:ivanzhao299@'+OWNER_ID+'/phoenix-erp-v3@'+REPO_ID+':environment:production'];
 const values={iss:ISSUER,aud:modernSchemaIdentityAudience(binding),repository:REPO,repository_id:REPO_ID,repository_owner:'ivanzhao299',repository_owner_id:OWNER_ID,
  actor:DELEGATE.login,actor_id:DELEGATE.id,run_id:runId,run_attempt:attempt,event_name:'workflow_dispatch',ref:'refs/heads/main',ref_type:'branch',
  sha:binding.targetSha,workflow_sha:binding.targetSha,workflow_ref:`${REPO}/${WORKFLOW}@refs/heads/main`,environment:'production',runner_environment:'github-hosted'};
 if(Object.entries(values).some(([key,value])=>claims[key]!==value)||!subjects.includes(claims.sub)
  ||(Object.hasOwn(claims,'job_workflow_ref')||Object.hasOwn(claims,'job_workflow_sha'))
    &&(claims.job_workflow_ref!==values.workflow_ref||claims.job_workflow_sha!==values.workflow_sha)
  ||!match(/^[1-9][0-9]{0,19}$/,claims.check_run_id)||typeof claims.jti!=='string'||!claims.jti||claims.jti.length>256)fail('EXACT_JOB_CLAIMS_REQUIRED');
 const seconds=Math.floor(now/1000);
 if(!['iat','nbf','exp'].every(key=>Number.isSafeInteger(claims[key])&&claims[key]>0)||claims.exp<=claims.iat||claims.exp-claims.iat>600
  ||claims.iat>seconds+30||claims.nbf>seconds+30||claims.nbf>claims.exp||claims.exp<=seconds||seconds-claims.iat>600)fail('JWT_TIME_UNVERIFIED');
 return {schema:'phoenix.modern-schema-dispatch-identity/v1',kind:'IDENTITY_ONLY',...binding,repository:REPO,repositoryId:REPO_ID,repositoryOwnerId:OWNER_ID,
  actor:DELEGATE.login,actorId:DELEGATE.id,runId,attempt,triggeringActorVerified:false,checkRunId:claims.check_run_id,workflowPath:WORKFLOW,environment:'production',
  tokenSha256:sha(token),jtiSha256:sha(claims.jti),issuerKeyId:header.kid,issuedAt:new Date(claims.iat*1000).toISOString(),expiresAt:new Date(claims.exp*1000).toISOString(),
  requiredReviewersUsed:false,ownerIdentityAsserted:false,productionAuthorized:false};
}
async function boundedJson(url,options,fetcher){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetcher(url,{...options,signal:controller.signal,redirect:'error'});if(!response.ok)fail('ISSUER_READ_FAILED');
  const chunks=[];let size=0;for await(const part of response.body){size+=part.length;if(size>1024*1024)fail('ISSUER_RESPONSE_SIZE');chunks.push(part);}
  return JSON.parse(Buffer.concat(chunks).toString());
 }catch{fail('ISSUER_READ_FAILED');}finally{clearTimeout(timer);}
}
export async function collectModernSchemaIdentity(token,expected,dependencies={}){
 const binding=expectedBinding(expected),fetcher=dependencies.fetch??fetch,now=dependencies.now??Date.now;
 const keys=await boundedJson(JWKS,{method:'GET',headers:{Accept:'application/json'}},fetcher);
 return verifyModernSchemaIdentityToken(token,binding,{jwks:keys,now:now()});
}
/** Fixed GitHub API observations bind the signed check ID to this still-live
 * deploy job and this attempt's real rerun actor. They confer no approval. */
export async function collectModernSchemaLiveJob(identity,dependencies={}){
 const binding=expectedBinding({owner:identity?.owner,targetSha:identity?.targetSha,preparationSha256:identity?.preparationSha256});
 if(identity.kind!=='IDENTITY_ONLY'||identity.actorId!==DELEGATE.id||identity.actor!==DELEGATE.login
  ||!match(/^[1-9][0-9]{0,19}$/,identity.checkRunId)||identity.productionAuthorized!==false)fail('SIGNED_IDENTITY_REQUIRED');
 const now=dependencies.now??Date.now,started=performance.now(),fetcher=dependencies.fetch??fetch;
 const credential=dependencies.credential??process.env.GITHUB_TOKEN;
 if(typeof credential!=='string'||!credential||/[\r\n]/.test(credential))fail('GITHUB_READ_CHANNEL_REQUIRED');
 const base='/repos/'+REPO,runPath=base+'/actions/runs/'+identity.runId;
 const read=endpoint=>boundedJson('https://api.github.com'+endpoint,{method:'GET',headers:{Authorization:'Bearer '+credential,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}},fetcher);
 const actor=value=>String(value?.id)===DELEGATE.id&&value.login===DELEGATE.login&&value.type==='User';
 const repository=value=>String(value?.id)===REPO_ID&&value.full_name===REPO&&String(value.owner?.id)===OWNER_ID;
 const validRun=value=>String(value?.id)===identity.runId&&String(value.run_attempt)===identity.attempt&&repository(value.repository)&&repository(value.head_repository)
  &&actor(value.actor)&&actor(value.triggering_actor)&&value.head_sha===binding.targetSha&&value.head_branch==='main'&&value.event==='workflow_dispatch'
  &&(!dependencies.successor||value.display_title===dependencies.successor.selection)
  &&value.path===WORKFLOW&&value.status==='in_progress'&&value.conclusion===null;
 const latest=await read(runPath),attempt=await read(runPath+'/attempts/'+identity.attempt);
 if(!validRun(latest)||!validRun(attempt))fail('LIVE_DISPATCH_ATTEMPT_MISMATCH');
 const list=await read(runPath+'/attempts/'+identity.attempt+'/jobs?per_page=100&page=1');
 if(!Number.isSafeInteger(list?.total_count)||list.total_count<1||list.total_count>100||!Array.isArray(list.jobs)||list.jobs.length!==list.total_count)fail('COMPLETE_JOB_LIST_REQUIRED');
 const jobs=list.jobs.filter(job=>job.check_run_url==='https://api.github.com'+base+'/check-runs/'+identity.checkRunId);
 if(jobs.length!==1)fail('EXACT_CHECK_JOB_REQUIRED');const job=jobs[0];
 if(String(job.run_id)!==identity.runId||job.head_sha!==binding.targetSha||job.name!=='Deploy · api'||job.status!=='in_progress'||job.conclusion!==null
  ||!Number.isSafeInteger(job.id)||job.id<1)fail('LIVE_API_JOB_MISMATCH');
 let candidateCiSha256;
 if(dependencies.successor){
  const ciId=dependencies.successor.approval.ciRunId;
  if(!/^[1-9][0-9]{0,19}$/.test(ciId)||ciId===identity.runId)fail('CANDIDATE_CI_REQUIRED');
  const ciPath=base+'/actions/runs/'+ciId,ci=await read(ciPath);
  if(String(ci.id)!==ciId||!repository(ci.repository)||!repository(ci.head_repository)||ci.head_sha!==binding.targetSha||
     ci.head_branch!=='main'||ci.event!=='push'||ci.path!==WORKFLOW||ci.status!=='completed'||ci.conclusion!=='success'||
     !Number.isSafeInteger(ci.run_attempt)||ci.run_attempt<1)fail('CANDIDATE_CI_REQUIRED');
  const checks=await read(ciPath+'/attempts/'+ci.run_attempt+'/jobs?per_page=100&page=1');
  if(!Array.isArray(checks.jobs)||checks.total_count!==checks.jobs.length||checks.total_count>100)fail('COMPLETE_CANDIDATE_CI_REQUIRED');
  const selected=['Type-check & Regression','Build & Push api','Build & Push web'].map(name=>{
   const matches=checks.jobs.filter(item=>item.name===name);
   if(matches.length!==1)fail('COMPLETE_CANDIDATE_CI_REQUIRED');
   const [item]=matches;
   if(String(item.run_id)!==ciId||item.head_sha!==binding.targetSha||item.status!=='completed'||item.conclusion!=='success'||
    !Array.isArray(item.steps)||name.startsWith('Build & Push')&&!item.steps.some(s=>s.name==='Build & push '+name.split(' ').at(-1)+' image'&&s.conclusion==='success'))fail('CANDIDATE_CI_REQUIRED');
   return {id:item.id,name,conclusion:item.conclusion};
  });
  const acceptanceId=dependencies.successor.approval.acceptanceRunId;
  if(!/^[1-9][0-9]{0,19}$/.test(acceptanceId)||[ciId,identity.runId].includes(acceptanceId))fail('CANDIDATE_ACCEPTANCE_REQUIRED');
  const acceptancePath=base+'/actions/runs/'+acceptanceId,acceptance=await read(acceptancePath);
  if(String(acceptance.id)!==acceptanceId||!repository(acceptance.repository)||!repository(acceptance.head_repository)||
    acceptance.path!=='.github/workflows/production-remediation-acceptance.yml'||!['push','workflow_dispatch'].includes(acceptance.event)||
    acceptance.head_sha!==ci.head_sha||acceptance.head_branch!=='main'||acceptance.status!=='completed'||acceptance.conclusion!=='success'||
    !Number.isSafeInteger(acceptance.run_attempt)||acceptance.run_attempt<1)fail('CANDIDATE_ACCEPTANCE_REQUIRED');
  const acceptanceJobs=await read(acceptancePath+'/attempts/'+acceptance.run_attempt+'/jobs?per_page=100&page=1');
  if(!Array.isArray(acceptanceJobs.jobs)||acceptanceJobs.total_count!==acceptanceJobs.jobs.length||acceptanceJobs.total_count>100)fail('CANDIDATE_ACCEPTANCE_REQUIRED');
  const acceptanceSteps=[
   ['PostgreSQL 18 / transactions','Run transaction, role and migration acceptance'],
   ['PostgreSQL 18 / transactions','Verify pilot ingress in a disposable network namespace'],
   ['PostgreSQL 18 / browser','Exercise desktop and mobile Chromium'],
   ['Previous API and historical receipts on the expanded schema','Rehearse the deployed database and a cold installation'],
  ];
  const verified=acceptanceSteps.map(([name,step])=>{
   const matches=acceptanceJobs.jobs.filter(j=>j.name===name);
   if(matches.length!==1||String(matches[0].run_id)!==acceptanceId||matches[0].head_sha!==ci.head_sha||
     matches[0].status!=='completed'||matches[0].conclusion!=='success'||
     !matches[0].steps?.some(s=>s.name===step&&s.conclusion==='success'))fail('CANDIDATE_ACCEPTANCE_REQUIRED');
   return {id:matches[0].id,name:matches[0].name,step};
  });
  candidateCiSha256=canonicalDigest({id:ciId,attempt:ci.run_attempt,targetSha:ci.head_sha,jobs:selected,acceptanceId,acceptanceAttempt:acceptance.run_attempt,verified});
 }
 const final=await read(runPath+'/attempts/'+identity.attempt),finalJob=await read(base+'/actions/jobs/'+job.id);
 if(!validRun(final)||finalJob.id!==job.id||finalJob.check_run_url!==job.check_run_url||finalJob.run_id!==job.run_id||finalJob.head_sha!==job.head_sha
  ||finalJob.name!==job.name||finalJob.status!=='in_progress'||finalJob.conclusion!==null||performance.now()-started>60000
  ||!Number.isFinite(Date.parse(identity.expiresAt))||now()>=Date.parse(identity.expiresAt))fail('LIVE_IDENTITY_EXPIRED_OR_MOVED');
 return {...structuredClone(identity),...(dependencies.successor?{candidateCiSha256,delegatedSelection:dependencies.successor.selection}:{}),triggeringActorVerified:true,jobId:String(job.id),jobName:job.name,serverFactsSha256:canonicalDigest({latest,attempt,list,final,finalJob}),observedAt:new Date(now()).toISOString()};
}
function actionsIdentityChannel(env){
 const raw=env.ACTIONS_ID_TOKEN_REQUEST_URL,credential=env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
 if(typeof raw!=='string'||!raw)failRunner('CHANNEL_URL_REQUIRED');
 let url;
 try{url=new URL(raw);}catch{failRunner('CHANNEL_URL_INVALID');}
 if(/[\x00-\x20\x7f]/.test(raw))failRunner('CHANNEL_URL_INVALID');
 const [,authority,rawPath]=/^https:\/\/([^/?#\\]+)(\/[^?#\\]*)?(?:\?|$)/i.exec(raw)??[];
 if(url.protocol!=='https:'||!url.hostname.endsWith('.actions.githubusercontent.com')||url.username||url.password||authority?.includes('@')
  ||raw.includes('#')||url.port)failRunner('CHANNEL_AUTHORITY_UNAPPROVED');
 // The hosted route has a fixed empty component immediately before idtoken.
 // Check the exact layout without normalizing the path sent to the provider.
 const segments=rawPath?.split('/')??[];
 const hostedJob=segments.length===6&&segments[2]===''&&segments[3]==='idtoken';
 const shortRoute=(segments.length===2||segments.length===3)&&segments.at(-1)==='idtoken';
 const names=hostedJob?[segments[1],segments[4],segments[5]]:segments.slice(1,-1);
 if(rawPath!==url.pathname||!(hostedJob||shortRoute)
  ||!names.every(segment=>/^[A-Za-z0-9._~-]{1,256}$/.test(segment)&&!['.','..','idtoken'].includes(segment)))failRunner('CHANNEL_ROUTE_UNAPPROVED');
 const versions=url.searchParams.getAll('api-version');
 if([...url.searchParams.keys()].some(key=>key.toLowerCase()==='audience')
  ||(hostedJob&&(versions.length!==1||!versions[0].trim())))failRunner('CHANNEL_QUERY_UNAPPROVED');
 if(typeof credential!=='string'||!credential)failRunner('CHANNEL_CREDENTIAL_REQUIRED');
 if(/[\x00-\x20\x7f]/.test(credential))failRunner('CHANNEL_CREDENTIAL_INVALID');
 return {raw,credential};
}

/** Local preflight only. The preparation-bound token is requested later. */
export function verifyModernSchemaRunnerIdentityChannel(env){
 actionsIdentityChannel(env);
}

async function readRunnerIdentity(url,credential,fetcher){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  let response;
  try{
   response=await fetcher(url,{method:'GET',headers:{Authorization:'Bearer '+credential,Accept:'application/json'},signal:controller.signal,redirect:'error'});
  }catch{failRunner(controller.signal.aborted?'TIMEOUT':'TRANSPORT_FAILED');}
  if(controller.signal.aborted)failRunner('TIMEOUT');
  if(!response?.ok)failRunner([401,403].includes(response?.status)?'HTTP_AUTHORIZATION':'HTTP_STATUS');
  const chunks=[];let size=0;
  try{
   for await(const part of response.body){
    if(!(part instanceof Uint8Array))failRunner('RESPONSE_BODY');
    size+=part.byteLength;
    if(size>1024*1024)failRunner('RESPONSE_SIZE');
    chunks.push(part);
   }
  }catch(error){
   if(runnerFailures.has(error))throw error;
   failRunner(controller.signal.aborted?'TIMEOUT':'RESPONSE_BODY');
  }
  if(controller.signal.aborted)failRunner('TIMEOUT');
  try{return JSON.parse(Buffer.concat(chunks).toString());}catch{failRunner('RESPONSE_JSON');}
 }finally{clearTimeout(timer);}
}

/** Runs only in the real Actions job. The caller delivers the returned value
 * through private SSH input. */
export async function requestModernSchemaIdentityToken(expected,dependencies={}){
 const binding=expectedBinding(expected);
 const {raw,credential}=actionsIdentityChannel(dependencies.env??process.env);
 const separator=raw.includes('?')?(raw.endsWith('?')||raw.endsWith('&')?'':'&'):'?';
 const url=raw+separator+'audience='+encodeURIComponent(modernSchemaIdentityAudience(binding));
 const data=await readRunnerIdentity(url,credential,dependencies.fetch??fetch);
 if(!match(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,data?.value)||data.value.length>16384)failRunner('TOKEN_FORMAT');
 return data.value;
}
