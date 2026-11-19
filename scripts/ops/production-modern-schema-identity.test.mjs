import test from 'node:test';import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {verifyModernSchemaIdentityToken,modernSchemaIdentityAudience,collectModernSchemaIdentity,requestModernSchemaIdentityToken,collectModernSchemaLiveJob,verifyModernSchemaRunnerIdentityChannel,publicModernSchemaRunnerIdentityFailure} from './production-modern-schema-identity.mjs';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const key={...publicKey.export({format:'jwk'}),kid:'synthetic-issuer-key',use:'sig',alg:'RS256'},jwks={keys:[key]},now=Date.UTC(2026,10,19),seconds=Math.floor(now/1000);
const expected={owner:'44442309367-1',targetSha:'a'.repeat(40),preparationSha256:'b'.repeat(64)};
function claims(){return {iss:'https://token.actions.githubusercontent.com',aud:modernSchemaIdentityAudience(expected),sub:'repo:ivanzhao299/phoenix-erp-v3:environment:production',
 repository:'ivanzhao299/phoenix-erp-v3',repository_id:'1239767008',repository_owner:'ivanzhao299',repository_owner_id:'154717306',actor:'emvia',actor_id:'7245339',
 run_id:'44442309367',run_attempt:'1',event_name:'workflow_dispatch',ref:'refs/heads/main',ref_type:'branch',sha:expected.targetSha,workflow_sha:expected.targetSha,
 workflow_ref:'ivanzhao299/phoenix-erp-v3/.github/workflows/deploy.yml@refs/heads/main',environment:'production',runner_environment:'github-hosted',check_run_id:'123456789',jti:'synthetic-test-jti',iat:seconds-1,nbf:seconds-1,exp:seconds+299};}
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
function token(value=claims(),header={alg:'RS256',typ:'JWT',kid:key.kid}){const prefix=encode(header)+'.'+encode(value);return prefix+'.'+sign('RSA-SHA256',Buffer.from(prefix),privateKey).toString('base64url');}
test('actual RSA signature binds the delegated publisher, immutable repository IDs and exact preparation',()=>{
 const jwt=token(),result=verifyModernSchemaIdentityToken(jwt,expected,{jwks,now});assert.equal(result.kind,'IDENTITY_ONLY');assert.equal(result.productionAuthorized,false);
 assert.equal(result.requiredReviewersUsed,false);assert.equal(result.ownerIdentityAsserted,false);assert.equal(result.tokenSha256,createHash('sha256').update(jwt).digest('hex'));
 assert.equal(JSON.stringify(result).includes(jwt),false);
 const immutable=claims();immutable.sub='repo:ivanzhao299@154717306/phoenix-erp-v3@1239767008:environment:production';assert.equal(verifyModernSchemaIdentityToken(token(immutable),expected,{jwks,now}).kind,'IDENTITY_ONLY');
 const same=claims();same.job_workflow_ref=same.workflow_ref;same.job_workflow_sha=same.workflow_sha;assert.equal(verifyModernSchemaIdentityToken(token(same),expected,{jwks,now}).kind,'IDENTITY_ONLY');
});
function liveFixture(){
 const identity=verifyModernSchemaIdentityToken(token(),expected,{jwks,now}),base='/repos/ivanzhao299/phoenix-erp-v3',actor={id:7245339,login:'emvia',type:'User'};
 const repo={id:1239767008,full_name:'ivanzhao299/phoenix-erp-v3',owner:{id:154717306}};
 const run={id:44442309367,run_attempt:1,actor,triggering_actor:actor,repository:repo,head_repository:repo,head_sha:expected.targetSha,head_branch:'main',event:'workflow_dispatch',path:'.github/workflows/deploy.yml',status:'in_progress',conclusion:null};
 const job={id:987654321,run_id:run.id,head_sha:run.head_sha,name:'Deploy · api',status:'in_progress',conclusion:null,check_run_url:'https://api.github.com'+base+'/check-runs/'+identity.checkRunId};
 const responses={[base+'/actions/runs/'+run.id]:run,[base+'/actions/runs/'+run.id+'/attempts/1']:run,[base+'/actions/runs/'+run.id+'/attempts/1/jobs?per_page=100&page=1']:{total_count:1,jobs:[job]},[base+'/actions/jobs/'+job.id]:job};
 const calls=[],fetch=async(url,options)=>{assert.equal(options.redirect,'error');const parsed=new URL(url);assert.equal(parsed.origin,'https://api.github.com');const key=parsed.pathname+parsed.search;assert.ok(Object.hasOwn(responses,key));calls.push(key);return new Response(JSON.stringify(responses[key]));};
 return {identity,run,job,responses,calls,dependencies:{fetch,credential:'synthetic-read-token',now:()=>now}};
}
test('live server run, rerun actor, exact check ID and still-running API job are required together',async()=>{
 const f=liveFixture(),result=await collectModernSchemaLiveJob(f.identity,f.dependencies);assert.equal(result.triggeringActorVerified,true);assert.equal(result.jobId,'987654321');
 assert.equal(result.productionAuthorized,false);assert.equal(result.requiredReviewersUsed,false);assert.equal(result.ownerIdentityAsserted,false);assert.equal(f.calls.length,5);
});
for(const [name,change]of [
 ['rerun actor',f=>f.run.triggering_actor={id:1,login:'other',type:'User'}],['attempt',f=>f.run.run_attempt=2],['recycled repository',f=>f.run.repository.id=1],
 ['completed run',f=>f.run.status='completed'],['wrong workflow',f=>f.run.path='.github/workflows/other.yml'],['another job',f=>f.job.check_run_url+='1'],
 ['wrong job mode',f=>f.job.name='Deploy · full'],['completed job',f=>f.job.status='completed'],['different head',f=>f.job.head_sha='f'.repeat(40)],
 ['incomplete list',f=>Object.values(f.responses).find(x=>x.jobs).total_count=101],['expired token',f=>f.dependencies.now=()=>now+600000]
])test('server identity refuses '+name,async()=>{const f=liveFixture();change(f);await assert.rejects(collectModernSchemaLiveJob(f.identity,f.dependencies),/IDENTITY_HOLD=/);});
test('job completion during the final server read cannot register',async()=>{
 const f=liveFixture(),fetch=f.dependencies.fetch;f.dependencies.fetch=async(url,options)=>{if(url.endsWith('/actions/jobs/987654321'))f.job.status='completed';return fetch(url,options);};
 await assert.rejects(collectModernSchemaLiveJob(f.identity,f.dependencies),/EXPIRED_OR_MOVED/);
});
for(const [name,change]of [
 ['audience',c=>c.aud='urn:other'],['other repository',c=>c.repository='other/repo'],['recycled name',c=>c.repository_id='123'],['owner ID',c=>c.repository_owner_id='123'],
 ['wrong actor',c=>c.actor='owner'],['wrong immutable actor',c=>c.actor_id='123'],['run',c=>c.run_id='44442309368'],['attempt',c=>c.run_attempt='2'],
 ['fork event',c=>c.event_name='pull_request_target'],['branch',c=>c.ref='refs/heads/feature'],['commit',c=>c.sha='c'.repeat(40)],['workflow commit',c=>c.workflow_sha='c'.repeat(40)],
 ['workflow path',c=>c.workflow_ref=c.workflow_ref.replace('deploy.yml','other.yml')],['environment',c=>c.environment='staging'],['reusable workflow',c=>c.job_workflow_ref='other/repo/workflow.yml@main'],['half reusable pair',c=>c.job_workflow_ref=c.workflow_ref],['wrong reusable sha',c=>{c.job_workflow_ref=c.workflow_ref;c.job_workflow_sha='b'.repeat(40);}],
 ['self-hosted runner',c=>c.runner_environment='self-hosted'],['missing actual job',c=>delete c.check_run_id],['expired',c=>c.exp=seconds],['future issuance',c=>c.iat=seconds+60],['missing nbf',c=>delete c.nbf]
])test(`signed ${name} mismatch still holds`,()=>{const c=claims();change(c);assert.throws(()=>verifyModernSchemaIdentityToken(token(c),expected,{jwks,now}),/IDENTITY_HOLD=/);});
test('none, alternate algorithms, attacker key URLs and modified bytes do not verify',()=>{
 for(const header of [{alg:'none',typ:'JWT',kid:key.kid},{alg:'HS256',typ:'JWT',kid:key.kid},{alg:'RS256',typ:'JWT',kid:key.kid,jku:'https://attacker.invalid/key'}])assert.throws(()=>verifyModernSchemaIdentityToken(token(claims(),header),expected,{jwks,now}),/JWT_HEADER/);
 const jwt=token(),pieces=jwt.split('.');pieces[1]=encode({...claims(),actor:'owner'});assert.throws(()=>verifyModernSchemaIdentityToken(pieces.join('.'),expected,{jwks,now}),/JWT_SIGNATURE/);
 assert.throws(()=>verifyModernSchemaIdentityToken(jwt,expected,{jwks:{keys:[key,key]},now}),/ISSUER_KEYS/);
 const rogue=generateKeyPairSync('rsa',{modulusLength:2048}).publicKey.export({format:'jwk'});assert.throws(()=>verifyModernSchemaIdentityToken(jwt,expected,{jwks:{keys:[{...rogue,kid:key.kid,use:'sig',alg:'RS256'}]},now}),/JWT_SIGNATURE/);
});
test('the production key collector only reads the fixed GitHub issuer endpoint',async()=>{
 const calls=[],jwt=token();const fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(jwks));};
 const result=await collectModernSchemaIdentity(jwt,expected,{fetch,now:()=>now});assert.equal(result.kind,'IDENTITY_ONLY');assert.equal(calls[0].url,'https://token.actions.githubusercontent.com/.well-known/jwks');assert.equal(calls[0].options.redirect,'error');
});
const runnerBase='https://pipelines.actions.githubusercontent.com';
const runnerRoute='/runner.job/dispatch-123/idtoken/token_456';
const runnerUrl=runnerBase+runnerRoute+'?api-version=2.0&opaque=%2f%20+%7E%2B';
const runnerEnv={ACTIONS_ID_TOKEN_REQUEST_URL:runnerUrl,ACTIONS_ID_TOKEN_REQUEST_TOKEN:'synthetic-not-a-real-credential'};
const reason=code=>({message:'MODERN_SCHEMA_RUNNER_IDENTITY_HOLD='+code});

test('hosted and legacy token requests preserve the original query and bind the audience',async()=>{
 const jwt=token(),audience=modernSchemaIdentityAudience(expected);
 const hostedTrailing=runnerBase+'/runner.job/idtoken/dispatch-123/token_456/?api-version=2.0&opaque=%2f%20+%7E%2B';
 for(const raw of [runnerUrl,hostedTrailing,runnerBase+'/owned/idtoken?api-version=2.0',runnerBase+'/idtoken']){
  const env={...runnerEnv,ACTIONS_ID_TOKEN_REQUEST_URL:raw};
  verifyModernSchemaRunnerIdentityChannel(env);
  const fetch=async(url,options)=>{
   assert.equal(url,raw+(raw.includes('?')?'&':'?')+'audience='+encodeURIComponent(audience));
   assert.deepEqual(new URL(url).searchParams.getAll('audience'),[audience]);
   assert.equal(options.method,'GET');
   assert.equal(options.redirect,'error');
   assert.equal(options.headers.Authorization,'Bearer '+env.ACTIONS_ID_TOKEN_REQUEST_TOKEN);
   return new Response(JSON.stringify({value:jwt}));
  };
  assert.equal(await requestModernSchemaIdentityToken(expected,{env,fetch}),jwt);
 }
});

test('channel preflight fails closed before the credential can be sent',async()=>{
 for(const [patch,code] of [
  [{ACTIONS_ID_TOKEN_REQUEST_URL:''},'CHANNEL_URL_REQUIRED'],
  [{ACTIONS_ID_TOKEN_REQUEST_URL:'synthetic-invalid-url'},'CHANNEL_URL_INVALID'],
  [{ACTIONS_ID_TOKEN_REQUEST_URL:runnerBase+runnerRoute+'?api-version=2.0\n'},'CHANNEL_URL_INVALID'],
  [{ACTIONS_ID_TOKEN_REQUEST_URL:'http://pipelines.actions.githubusercontent.com'+runnerRoute},'CHANNEL_AUTHORITY_UNAPPROVED'],
  [{ACTIONS_ID_TOKEN_REQUEST_URL:'https://pipelines.actions.githubusercontent.com.attacker.invalid'+runnerRoute},'CHANNEL_AUTHORITY_UNAPPROVED'],
  [{ACTIONS_ID_TOKEN_REQUEST_URL:'https://user@pipelines.actions.githubusercontent.com'+runnerRoute},'CHANNEL_AUTHORITY_UNAPPROVED'],
  [{ACTIONS_ID_TOKEN_REQUEST_URL:'https://@pipelines.actions.githubusercontent.com'+runnerRoute+'?api-version=2.0'},'CHANNEL_AUTHORITY_UNAPPROVED'],
  [{ACTIONS_ID_TOKEN_REQUEST_URL:runnerBase+':444'+runnerRoute},'CHANNEL_AUTHORITY_UNAPPROVED'],
  [{ACTIONS_ID_TOKEN_REQUEST_URL:runnerUrl+'#fragment'},'CHANNEL_AUTHORITY_UNAPPROVED'],
  [{ACTIONS_ID_TOKEN_REQUEST_URL:runnerUrl+'#'},'CHANNEL_AUTHORITY_UNAPPROVED'],
  [{ACTIONS_ID_TOKEN_REQUEST_URL:runnerBase+'/unrelated/a/b/c?api-version=2.0'},'CHANNEL_ROUTE_UNAPPROVED'],
  [{ACTIONS_ID_TOKEN_REQUEST_URL:runnerBase+'/a/idtoken/idtoken/c?api-version=2.0'},'CHANNEL_ROUTE_UNAPPROVED'],
  [{ACTIONS_ID_TOKEN_REQUEST_URL:runnerBase+'/a/%2e%2e'+runnerRoute+'?api-version=2.0'},'CHANNEL_ROUTE_UNAPPROVED'],
  [{ACTIONS_ID_TOKEN_REQUEST_URL:runnerBase+'/a/b/idtoken/a%2fb?api-version=2.0'},'CHANNEL_ROUTE_UNAPPROVED'],
  [{ACTIONS_ID_TOKEN_REQUEST_URL:runnerBase+runnerRoute+'//?api-version=2.0'},'CHANNEL_ROUTE_UNAPPROVED'],
  [{ACTIONS_ID_TOKEN_REQUEST_URL:runnerBase+'/runner.job/idtoken//dispatch-123/token_456?api-version=2.0'},'CHANNEL_ROUTE_UNAPPROVED'],
  [{ACTIONS_ID_TOKEN_REQUEST_URL:runnerBase+'//runner.job/idtoken/dispatch-123/token_456?api-version=2.0'},'CHANNEL_ROUTE_UNAPPROVED'],
  [{ACTIONS_ID_TOKEN_REQUEST_URL:runnerBase+'/owned/idtoken/?api-version=2.0'},'CHANNEL_ROUTE_UNAPPROVED'],
  [{ACTIONS_ID_TOKEN_REQUEST_URL:runnerBase+runnerRoute},'CHANNEL_QUERY_UNAPPROVED'],
  [{ACTIONS_ID_TOKEN_REQUEST_URL:runnerUrl+'&api-version=2.1'},'CHANNEL_QUERY_UNAPPROVED'],
  [{ACTIONS_ID_TOKEN_REQUEST_URL:runnerUrl+'&audience=other'},'CHANNEL_QUERY_UNAPPROVED'],
  [{ACTIONS_ID_TOKEN_REQUEST_URL:runnerUrl+'&%41UDIENCE=other'},'CHANNEL_QUERY_UNAPPROVED'],
  [{ACTIONS_ID_TOKEN_REQUEST_TOKEN:''},'CHANNEL_CREDENTIAL_REQUIRED'],
  [{ACTIONS_ID_TOKEN_REQUEST_TOKEN:'synthetic\r\nnot-forwarded'},'CHANNEL_CREDENTIAL_INVALID'],
 ]){
  const env={...runnerEnv,...patch};
  assert.throws(()=>verifyModernSchemaRunnerIdentityChannel(env),reason(code));
  await assert.rejects(requestModernSchemaIdentityToken(expected,{env,fetch:()=>assert.fail('Credential must not be sent')}),reason(code));
 }
});

test('runner request failures expose only fixed codes and discard response and transport details',async()=>{
 const fake='private-synthetic-sentinel';
 for(const [fetch,code] of [
  [()=>{throw Error(fake);},'TRANSPORT_FAILED'],
  [()=>new Response(fake,{status:401}),'HTTP_AUTHORIZATION'],
  [()=>new Response(fake,{status:403}),'HTTP_AUTHORIZATION'],
  [()=>new Response(fake,{status:503}),'HTTP_STATUS'],
  [()=>new Response(fake,{status:302}),'HTTP_STATUS'],
  [()=>new Response(null),'RESPONSE_BODY'],
  [()=>new Response(new ReadableStream({start(controller){controller.error(Error(fake));}})),'RESPONSE_BODY'],
  [()=>new Response(fake.repeat(65536)),'RESPONSE_SIZE'],
  [()=>new Response(fake),'RESPONSE_JSON'],
  [()=>new Response(JSON.stringify({value:fake})),'TOKEN_FORMAT'],
  [()=>new Response(JSON.stringify({value:'a..b'})),'TOKEN_FORMAT'],
  [()=>new Response(JSON.stringify({value:'a'.repeat(16384)+'.b.c'})),'TOKEN_FORMAT'],
 ]){
  await assert.rejects(requestModernSchemaIdentityToken(expected,{env:runnerEnv,fetch}),error=>{
   assert.equal(publicModernSchemaRunnerIdentityFailure(error),code);
   assert.equal(error.message,reason(code).message);
   assert.doesNotMatch(error.stack,new RegExp(fake));
   return true;
  });
 }
 assert.equal(publicModernSchemaRunnerIdentityFailure(Error(reason('TOKEN_FORMAT').message)),'UNVERIFIED');
});

test('runner timeout is classified by its own deadline',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const fetch=(_,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('synthetic deadline details')),{once:true}));
 const rejected=assert.rejects(requestModernSchemaIdentityToken(expected,{env:runnerEnv,fetch}),reason('TIMEOUT'));
 t.mock.timers.tick(15000);
 await rejected;
});
