/** Isolated protocol test: real ERP Next images and PG, API health peer only.
 * Supplied images are borrowed; this test never relabels or deletes them. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import * as evidence from '../ops/production-deployment-evidence.mjs';
import {readFormalDeploymentEvidence} from '../ops/chanjet-readonly-production-audit.mjs';
import {ownedFixtureDeadline,assertSuccessfulFixtureRecord} from './owned-fixture-deadline.mjs';
import {selectOwnedComposeSubnet} from './owned-compose-ipam.mjs';
const beforeImage=process.env.WEB_COMPOSE_BEFORE_IMAGE,targetImage=process.env.WEB_COMPOSE_TARGET_IMAGE;
const enabled=Boolean(beforeImage&&targetImage);
if(process.env.WEB_COMPOSE_REQUIRED==='1'&&!enabled)throw Error('REAL_TWO_IMAGE_WEB_FIXTURE_REQUIRED');
test('actual Compose Web-only replacement, evidence refusal and owner cleanup',{skip:!enabled,timeout:240000},async t=>{
  const deadline=ownedFixtureDeadline({signal:t.signal,timeoutMs:239000});let cleaning=false;
  for(const image of [beforeImage,targetImage])assert.match(image,/^sha256:[a-f0-9]{64}$/);assert.notEqual(beforeImage,targetImage);
  const owner=randomUUID(),project='phoenix-web-proof-'+owner,dir=path.resolve('artifacts/web-compose-evidence',owner),cases=[];
  fs.mkdirSync(dir,{recursive:true,mode:0o700});const config=path.join(dir,'docker-config');fs.mkdirSync(config,{mode:0o700});
  const env={PATH:process.env.PATH,DOCKER_HOST:'unix:///var/run/docker.sock',DOCKER_CONFIG:config},file=path.join(dir,'compose.json');
  const persist=(name,value)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
  let commandFailures=0;
  const docker=(args)=>{if(!cleaning)deadline.assertActive();try{const result=execFileSync('/usr/bin/docker',args,{env,encoding:'utf8',timeout:30000,maxBuffer:128*1024,stdio:['ignore','pipe','pipe']}).trim();if(!cleaning)deadline.assertActive();return result;}catch(error){
    if(commandFailures<8)persist('command-failure-'+(++commandFailures)+'.private.json',{operation:args.slice(0,2),status:error.status??null,signal:error.signal??null,code:error.code??null,stderr:String(error.stderr||'').slice(0,8192),stdout:String(error.stdout||'').slice(0,8192)});
    throw Error('OWNED_WEB_COMPOSE_DOCKER_COMMAND_FAILED');}};
  const record={schema:'phoenix.actual-web-compose-fixture/v1',owner,project,beforeImage,targetImage,imagesBorrowed:true,cases,productionAccess:false,productionReleaseEligibility:'NOT_EVALUATED',apiScope:'MOCK_HEALTH_PEER_ONLY',webScope:'ACTUAL_ERP_NEXT_STANDALONE',databaseScope:'ACTUAL_OWNED_POSTGRES',observationScope:'POSITIVE_REPLACEMENT_PHASE_THEN_INTENTIONAL_OWNED_FAULTS_AND_TEARDOWN'};
  let composition,commandOutcomeUnknown=false,creationAttempted=false;
  const compose=args=>{try{return docker(['compose','--project-name',project,'--file',file,...args]);}catch(error){commandOutcomeUnknown=true;throw error;}};
  const labelsOf=id=>JSON.parse(docker(['inspect',id,'--format','{{json .Config.Labels}}']));
  const owned=id=>{assert.match(id,/^[a-f0-9]{64}$/);const labels=labelsOf(id);assert.equal(labels['phoenix.fixture.owner'],owner);assert.equal(labels['com.docker.compose.project'],project);return id;};
  const discover=service=>{
    assert.ok(['api','web','db'].includes(service));const ids=docker(['ps','-aq','--no-trunc','--filter','label=com.docker.compose.project='+project,'--filter','label=com.docker.compose.service='+service]).split('\n').filter(Boolean);
    assert.equal(ids.length,1,'one actual Compose service identity');return owned(ids[0]);
  };
  const run=args=>{const selected=[...args];if(selected[0]==='inspect'){const service=selected[1].replace('phoenix-v3-','');selected[1]=discover(service);}else assert.ok(selected[0]==='image'&&selected[1]==='inspect');return docker(selected);};
  // The unchanged API health peer also acts as an HTTP observer on this
  // internal network. The fixed Compose DNS endpoint survives real replacement;
  // no host port, outside network or manual container-ID routing is involved.
  const httpProbe=(route,method='GET')=>{
    assert.ok(['/','/api/__fixture/http-failure','/api/__fixture/restart'].includes(route));assert.ok(['GET','POST'].includes(method));
    const request={method,headers:method==='POST'?{'x-fixture-owner':owner}:{}};
    const program=`fetch(${JSON.stringify('http://web:3000'+route)},{...${JSON.stringify(request)},signal:AbortSignal.timeout(5000)}).then(async r=>{const text=await r.text();process.stdout.write(JSON.stringify({status:r.status,html:/<html/i.test(text)}));}).catch(()=>process.exit(2));`;
    return JSON.parse(docker(['exec',discover('api'),'node','-e',program]));
  };
  const waitHealthy=async service=>{for(let n=0;n<180;n++){const id=discover(service);if(docker(['inspect',id,'--format','{{.State.Health.Status}}'])==='healthy'){
    if(service!=='db'||docker(['exec',id,'cat','/proc/1/comm'])==='postgres')return id;
  }await delay(250);}throw Error('OWNED_COMPOSE_HEALTH_TIMEOUT');};
  try{
    const revisions=[beforeImage,targetImage].map(image=>{const labels=JSON.parse(docker(['image','inspect',image,'--format','{{json .Config.Labels}}']));assert.equal(labels['phoenix.fixture.kind'],'erp-web-evidence');assert.match(labels['org.opencontainers.image.revision'],/^[a-f0-9]{40}$/);return labels['org.opencontainers.image.revision'];});
    assert.notEqual(revisions[0],revisions[1]);record.beforeSha=revisions[0];record.targetSha=revisions[1];
    const networkIds=docker(['network','ls','-q','--no-trunc']).split('\n').filter(Boolean);assert.ok(networkIds.length<512);
    const cidrs=networkIds.length?docker(['network','inspect',...networkIds,'--format','{{json .IPAM.Config}}']).split('\n').flatMap(line=>(JSON.parse(line)||[]).map(item=>item.Subnet).filter(value=>typeof value==='string'&&!value.includes(':'))):[];
    const routes=JSON.parse(execFileSync('/usr/sbin/ip',['-j','-4','route','show'],{env,encoding:'utf8',timeout:3000,maxBuffer:65536}));
    for(const route of routes)if(route.dst&&route.dst!=='default')cidrs.push(route.dst.includes('/')?route.dst:route.dst+'/32');
    const subnet=selectOwnedComposeSubnet(cidrs,parseInt(owner.slice(0,4),16)%512);record.isolatedSubnet=subnet;
    record.fixedEndpoint='http://web:3000';record.hostPortsPublished=false;
    const app=(image,peer=false)=>({image,command:['node','/fixture/web-evidence-runtime.fixture.mjs',...(peer?['--peer-only']:[])],environment:{PHOENIX_FIXTURE_OWNER:owner},labels:{'phoenix.fixture.owner':owner},restart:'on-failure:1',
      healthcheck:{test:['CMD','node','-e',`fetch('http://127.0.0.1:${peer?3100:3000}/${peer?'api/readiness':''}').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`],interval:'1s',timeout:'3s',retries:30,start_period:'1s'}});
    // API is already at the candidate revision; only Web is switched here.
    composition={services:{api:app(targetImage,true),web:app(beforeImage),db:{image:'postgres:18-alpine',environment:{POSTGRES_HOST_AUTH_METHOD:'trust',POSTGRES_USER:'fixture_owner',POSTGRES_DB:'web_evidence_fixture',PGDATA:'/var/lib/postgresql/data'},tmpfs:['/var/lib/postgresql:rw,nosuid,noexec,size=256m'],labels:{'phoenix.fixture.owner':owner},healthcheck:{test:['CMD','pg_isready','-U','fixture_owner','-d','web_evidence_fixture'],interval:'1s',timeout:'3s',retries:60}}},networks:{default:{internal:true,ipam:{config:[{subnet}]},labels:{'phoenix.fixture.owner':owner}}}};
    persist('resources.json',{owner,project,composeFile:file,creationIntent:true,imagesBorrowed:true});persist('compose.json',composition);creationAttempted=true;
    compose(['up','-d','--no-build','--pull','never']);for(const service of ['api','db','web'])await waitHealthy(service);
    const binding={runId:Date.now()+'-1',runAttempt:1,targetSha:revisions[1],configFloorSha:revisions[1],deployMode:'web',evidenceSchema:evidence.MODE_EVIDENCE_SCHEMA};
    const snapshot=phase=>evidence.captureSnapshot({phase,...binding,floorSha:binding.configFloorSha},run);
    const pre=snapshot('PRE_SNAPSHOT'),oldWeb=pre.containers.web.id;persist('pre.json',pre);
    const oldHttp=httpProbe('/');assert.equal(oldHttp.status,200);assert.equal(oldHttp.html,true);
    assert.throws(()=>evidence.compareSnapshots(pre,snapshot('POST_SNAPSHOT'),'web'),/WEB_IDENTITY/);cases.push('OLD_HEALTHY_WEB_IS_NOT_TARGET');
    composition.services.web.image=targetImage;persist('compose.json',composition);
    compose(['up','-d','--no-deps','--no-build','--pull','never','web']);await waitHealthy('web');
    const newWeb=discover('web');assert.notEqual(newWeb,oldWeb);assert.equal(docker(['ps','-aq','--no-trunc','--filter','id='+oldWeb]),'');
    const webResponse=httpProbe('/');assert.equal(webResponse.status,200);assert.equal(webResponse.html,true);
    const apiCode=docker(['exec',discover('api'),'node','-e',"fetch('http://127.0.0.1:3100/api/readiness').then(r=>process.stdout.write(String(r.status))).catch(()=>process.exit(2))"]);assert.equal(apiCode,'200');
    const post=snapshot('POST_SNAPSHOT'),capturedAt=new Date().toISOString();
    assert.equal(post.containers.web.image,targetImage);assert.equal(post.containers.web.ociRevision,revisions[1]);
    const streams=evidence.captureDockerLogStreams({containerId:newWeb,startedAt:post.containers.web.startedAt,capturedAt},args=>spawnSync('/usr/bin/docker',args,{env,encoding:'utf8',timeout:10000,maxBuffer:evidence.MAX_LOG_BYTES,stdio:['ignore','pipe','pipe']}));
    const summaryArgs={...binding,floorSha:binding.configFloorSha,service:'web',containerId:newWeb,startedAt:post.containers.web.startedAt,capturedAt,stdout:streams.stdout,stderr:streams.stderr,readinessVerified:true,webHttpVerified:true};
    const summary=evidence.summarizeStartupLogs(summaryArgs);assert.equal(summary.result,'PASS_REDACTED_SUMMARY');assert.match(streams.stdout,/Ready in \d+(?:\.\d+)?\s*(?:ms|s)/);assert.match(streams.stderr,/WEB_EVIDENCE_FIXTURE_STDERR_CHANNEL=READY/);
    const log=evidence.startupBundle(post,{web:summary}),files={pre:path.join(dir,`deploy-${binding.runId}-pre-evidence.json`),post:path.join(dir,`deploy-${binding.runId}-post-evidence.json`),log:path.join(dir,`deploy-${binding.runId}-startup-evidence.json`)};
    for(const [key,value] of Object.entries({pre,post,log}))fs.writeFileSync(files[key],JSON.stringify(value),{mode:0o600});
    const verified=evidence.verifyEvidenceFiles(files.pre,files.post,files.log,binding);assert.equal(verified.comparison.api,'UNCHANGED');assert.equal(verified.comparison.db,'UNCHANGED');evidence.verifyLiveSnapshot(post,binding,run);
    const actual=Object.fromEntries(['api','web'].map(service=>[service,{revision:post.containers[service].ociRevision,imageId:post.containers[service].image}]));assert.equal(readFormalDeploymentEvidence(dir,actual,binding.configFloorSha,evidence,run).status,'PASS');
    cases.push('ACTUAL_COMPOSE_WEB_ONLY_PRE_POST_STARTUP_LIVE');record.oldWebRetired=true;record.fixedEndpointSwitched=true;record.apiDbIdentityUnchanged=true;
    const response=httpProbe('/api/__fixture/http-failure');assert.equal(response.status,503);
    const failure=evidence.summarizeStartupLogs({...summaryArgs,webHttpVerified:false});assert.equal(failure.result,'UNVERIFIED_STARTUP_EVIDENCE');cases.push('ACTUAL_HTTP_FAILURE_REJECTED');
    const wrongSha=revisions[1]==='b'.repeat(40)?'c'.repeat(40):'b'.repeat(40),wrong={pre:structuredClone(pre),post:structuredClone(post),log:structuredClone(log)},wrongFiles={};
    for(const [key,value] of Object.entries(wrong)){value.targetSha=wrongSha;if(key==='log')value.services.web.targetSha=wrongSha;wrongFiles[key]=path.join(dir,'wrong-oci-'+key+'.json');fs.writeFileSync(wrongFiles[key],JSON.stringify(value),{mode:0o600});}
    assert.throws(()=>evidence.verifyEvidenceFiles(wrongFiles.pre,wrongFiles.post,wrongFiles.log,{...binding,targetSha:wrongSha}),/WEB_IDENTITY/);cases.push('ACTUAL_IMAGE_OCI_MISMATCH_REJECTED');
    docker(['restart','--time','5',discover('api')]);await waitHealthy('api');assert.throws(()=>evidence.verifyLiveSnapshot(post,binding,run),/API_TOCTOU/);cases.push('ACTUAL_API_RESTART_REJECTED');
    const beforeDb=snapshot('POST_SNAPSHOT');docker(['restart','--time','5',discover('db')]);await waitHealthy('db');assert.throws(()=>evidence.verifyLiveSnapshot(beforeDb,binding,run),/DB_TOCTOU/);cases.push('ACTUAL_DB_RESTART_REJECTED');
    const beforeRecreate=snapshot('POST_SNAPSHOT');compose(['up','-d','--no-deps','--no-build','--pull','never','--force-recreate','web']);await waitHealthy('web');
    assert.equal(evidence.metadataFor('web',run).image,targetImage);assert.throws(()=>evidence.verifyLiveSnapshot(beforeRecreate,binding,run),/WEB_TOCTOU/);cases.push('ACTUAL_SAME_IMAGE_WEB_RECREATE_REJECTED');
    const beforeRestart=snapshot('POST_SNAPSHOT'),restart=httpProbe('/api/__fixture/restart','POST');assert.equal(restart.status,200);
    let restarted=false;for(let n=0;n<180;n++){const state=evidence.metadataFor('web',run);if(state.health==='healthy'&&state.restartCount>0&&state.startedAt!==beforeRestart.containers.web.startedAt){restarted=true;break;}await delay(250);}assert.equal(restarted,true);
    assert.throws(()=>evidence.verifyLiveSnapshot(beforeRestart,binding,run),/WEB_TOCTOU/);cases.push('ACTUAL_WEB_PROCESS_RESTART_REJECTED');
    deadline.assertActive();assert.equal(cases.length,8);record.result='PASS';record.rawLogsPersisted=false;record.startupEvidence='ACTUAL_NEXT_STDOUT_STDERR';
  }catch(error){record.result='FAIL';record.failure='OWNED_WEB_COMPOSE_TEST_FAILED';throw error;}
  finally{
    cleaning=true;
    const failures=[];
    // Every cleanup is independent. Unknown command completion never becomes
    // a PASS merely because an instantaneous inventory happened to be empty.
    if(creationAttempted){
      let ids=[];try{ids=docker(['ps','-aq','--no-trunc','--filter','label=com.docker.compose.project='+project]).split('\n').filter(Boolean);}catch{failures.push('CONTAINER_INVENTORY_UNVERIFIED');}
      for(const id of ids){try{owned(id);docker(['stop','--time','5',id]);}catch{failures.push('OWNED_CONTAINER_STOP_UNVERIFIED');}try{owned(id);docker(['rm','-v',id]);}catch{failures.push('OWNED_CONTAINER_REMOVE_UNVERIFIED');}}
      let networks=[];try{networks=docker(['network','ls','-q','--no-trunc','--filter','label=com.docker.compose.project='+project]).split('\n').filter(Boolean);}catch{failures.push('NETWORK_INVENTORY_UNVERIFIED');}
      for(const id of networks)try{const labels=JSON.parse(docker(['network','inspect',id,'--format','{{json .Labels}}']));assert.equal(labels['phoenix.fixture.owner'],owner);assert.equal(labels['com.docker.compose.project'],project);docker(['network','rm',id]);}catch{failures.push('OWNED_NETWORK_REMOVE_UNVERIFIED');}
      try{for(let n=0;n<2;n++){assert.equal(docker(['ps','-aq','--no-trunc','--filter','label=com.docker.compose.project='+project]),'');assert.equal(docker(['network','ls','-q','--no-trunc','--filter','label=com.docker.compose.project='+project]),'');if(n===0)await delay(250);}}catch{failures.push('POST_CLEANUP_INVENTORY_UNVERIFIED');}
    }
    if(commandOutcomeUnknown)failures.push('COMPOSE_COMMAND_OUTCOME_UNVERIFIED');
    record.cleanup=failures.length?'UNVERIFIED_REQUIRES_OWNED_RECOVERY':'OWNED_CONTAINERS_AND_NETWORKS_REMOVED_CONFIRMED';record.cleanupFailures=failures;
    if(failures.length)record.result='FAIL';Object.assign(record,deadline.finalize(record));persist('results.json',record);console.log('WEB_COMPOSE_EVIDENCE_RECEIPT='+path.join(dir,'results.json'));
    if(failures.length)throw Error('OWNED_WEB_COMPOSE_CLEANUP_UNVERIFIED');
    assertSuccessfulFixtureRecord(record);
  }
});
