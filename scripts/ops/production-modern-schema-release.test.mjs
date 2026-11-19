import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import test from 'node:test';
import {readModernSchemaRunRequest,runModernSchemaEntry} from './production-modern-schema-release.mjs';

const targetSha='a'.repeat(40),owner='9001-1',floor='b'.repeat(40),preparationSha256='c'.repeat(64);
const stream=value=>Readable.from([Buffer.from(value)]);
const env=Object.freeze({DEPLOY_MODE:'api',BUILD_API:'true',BUILD_WEB:'false',RUN_MIG:'false',APPROVE_PRODUCTION:'true',
  PRESERVE_ARTIFACTS:'true',ROTATE_CHANJET_CREDENTIALS:'false',ONE_TIME_CONFIG_FLOOR_TRANSITION:'false',TARGET_SHA:targetSha,
  DEPLOY_RUN_ID:owner,DEPLOY_RUN_ATTEMPT:'1',APPROVED_CONFIG_FLOOR_SHA:targetSha,APPROVED_PREVIOUS_FLOOR_SHA:floor,
  API_IMAGE:'ghcr.io/ivanzhao299/phoenix-erp-v3/api:sha-'+targetSha});
const request=Object.freeze({
  schema:'phoenix.modern-schema-run-input/v1',preparationSha256,identityToken:'fixture.jwt.claim',githubReadToken:'fixture_read_token',
});
const prepared=Object.freeze({schema:'phoenix.modern-schema-public-preparation/v1',owner,targetSha,preparationSha256,prepared:true});
const completed=Object.freeze({schema:'phoenix.modern-schema-public-result/v1',owner,targetSha,outcome:'SUCCESS',defaultOff:true});

test('run accepts only a bounded fixed frame with both private credentials',async()=>{
  assert.deepEqual(await readModernSchemaRunRequest(stream(JSON.stringify(request))),request);
  for(const invalid of [
    JSON.stringify({...request,mode:'full'}),'x'.repeat(20481),JSON.stringify({...request,identityToken:'a b c'}),
    JSON.stringify({...request,githubReadToken:''}),JSON.stringify({...request,preparationSha256:'d'.repeat(63)}),
  ]) await assert.rejects(readModernSchemaRunRequest(stream(invalid)),/ENTRY_HOLD/);
});

test('wrong dispatch modes and extra operations cannot enter either privileged path',async()=>{
  const deps={prepare:()=>assert.fail('Invalid intent called prepare'),supervise:()=>assert.fail('Invalid intent called supervise')};
  for(const [args,overrides] of [
    [['execute'],{}],[['run','prepare'],{}],[['run'],{BUILD_WEB:'true'}],
    [['prepare'],{RUN_MIG:'true'}],[['prepare'],{GHCR_LOGIN_TOKEN:'fixture-secret'}],
  ]) await assert.rejects(runModernSchemaEntry(args,{...env,...overrides},stream(''),deps));
});

test('prepare success returns the exact public digest and never reads run authorization',async()=>{
  const response=await runModernSchemaEntry(['prepare'],env,Readable.from((function*(){assert.fail('prepare read private stdin');})()),{
    async prepare(received){assert.equal(received,env);return prepared;},
    supervise(){assert.fail('prepare invoked supervisor');},
  });
  assert.deepEqual(response,{result:prepared,exitCode:0});
});

test('prepare failures report only enumerated stages, and cannot echo diagnostics',async()=>{
  for(const stage of ['HISTORICAL_AUDIT','fixture-secret-stage-class']){
    const response=await runModernSchemaEntry(['prepare'],env,stream(''),{
      async prepare(_,{onStage}){onStage(stage);throw Error('fixture-secret-runner-text');},
    });
    assert.equal(response.exitCode,1);
    assert.deepEqual(response.result,{schema:'phoenix.modern-schema-public-preparation-hold/v1',owner,targetSha,prepared:false,
      failure:stage==='HISTORICAL_AUDIT'?stage:'UNSPECIFIED'});
    assert.doesNotMatch(JSON.stringify(response),/fixture-secret/);
  }
});

test('unexpected preparation statements and private fields do not become public receipts',async()=>{
  for(const result of [{...prepared,owner:'9001-2'},{...prepared,privateMessage:'fixture-secret'},null]){
    const response=await runModernSchemaEntry(['prepare'],env,stream(''),{prepare:async()=>result});
    assert.equal(response.exitCode,1);
    assert.equal(response.result.prepared,false);
    assert.doesNotMatch(JSON.stringify(response),/fixture-secret/);
  }
});

test('the supervisor receives only the exact bound run request and retains no credentials after return',async()=>{
  let handedOff;
  const response=await runModernSchemaEntry(['run'],env,stream(JSON.stringify(request)),{
    async supervise(received,input){assert.equal(received,env);assert.deepEqual(input,request);handedOff=input;return completed;},
  });
  assert.deepEqual(response,{result:completed,exitCode:0});
  assert.equal(handedOff.identityToken,null);
  assert.equal(handedOff.githubReadToken,null);
});

test('run rejects malformed requests, mismatched results, and supervisor diagnostics',async()=>{
  const invalid=await runModernSchemaEntry(['run'],env,stream('{'),{supervise:async()=>assert.fail('malformed request reached supervisor')});
  const responses=[invalid];
  for(const supervise of [
    async()=>({...completed,defaultOff:false}),
    async()=>({...completed,owner:'9001-2'}),
    async()=>({...completed,privateMessage:'fixture-secret'}),
    async()=>{throw Error('fixture-private-sql');},
  ]) responses.push(await runModernSchemaEntry(['run'],env,stream(JSON.stringify(request)),{supervise}));
  for(const response of responses){
    assert.equal(response.exitCode,1);
    assert.deepEqual(response.result,{...completed,outcome:'HOLD'});
    assert.doesNotMatch(JSON.stringify(response),/fixture/);
  }
});


test('protected finalize consumes no authorization or executable request',async()=>{
  const response=await runModernSchemaEntry(['finalize'],env,stream(''),{
    async finalize(received){assert.equal(received,env);return completed;},
    supervise(){assert.fail('completion must never start a release');},
    prepare(){assert.fail('completion must never start preparation');},
  });
  assert.deepEqual(response,{result:completed,exitCode:0});
  for(const input of ['\n','{}',JSON.stringify(request)]){
    const next=await runModernSchemaEntry(['finalize'],env,stream(input),{
      finalize(){assert.fail('completion accepted supplied payload');},
    });
    assert.deepEqual(next,{result:{...completed,outcome:'HOLD'},exitCode:1});
  }
});
