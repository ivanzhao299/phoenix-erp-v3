import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync,spawn } from 'node:child_process';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { validateContext,validateDatabaseContainer,validateStatus,findRunnerAncestor,runFixture,KINDS,TARGET,STATE,controlPathExists,cleanupNotStarted,inspectCleanupProcess,waitFixtureProcessExit,validateApiListeners } from './background-control-api-fixture.mjs';
const sha='a'.repeat(40),id='c'.repeat(64),bootId='00000000-0000-4000-8000-000000000001';
const c={GITHUB_ACTIONS:'true',CI:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Linux',RUNNER_ARCH:'X64',GITHUB_REPOSITORY:'ivanzhao299/phoenix-erp-v3',GITHUB_RUN_ID:'1234',GITHUB_RUN_ATTEMPT:'1',GITHUB_JOB:'regression',GITHUB_SHA:sha,GITHUB_WORKSPACE:'/home/runner/work/phoenix-erp-v3/phoenix-erp-v3',RUNNER_TEMP:'/home/runner/work/_temp',NODE_ENV:'test',APP_ENV:'test',DB_HOST:'127.0.0.1',DB_PORT:'5432',DB_USER:'phoenix_v3',DB_NAME:'phoenix_erp',PORT:'3100',BACKGROUND_FIXTURE_POSTGRES_ID:id,uid:1001};
const facts={workspace:c.GITHUB_WORKSPACE,temp:c.RUNNER_TEMP,workspaceUid:1001,tempUid:1001,production:false,runner:{pid:10,start:'50'},head:sha,originApproved:true,mainRegular:true};
const prepareNetworkAudit=()=>({path:'/test-audit',fd:3,close:()=>{}});
const status={protocolVersion:1,bootId,owner:'ci-1234-1-regression',generation:1,phase:'FENCED',poisoned:false,stopping:false,inFlight:0,pendingChildren:0,taskGraphs:0,controlSession:{connected:true,broken:false,sessionPid:50,databaseOid:15000,backendStartedAt:'2026-10-01T00:00:00.000Z',applicationName:`phoenix-fence:${bootId}`}};
test('only exact disposable hosted test context is accepted; production and spoofed path inputs fail closed',()=>{
  assert.equal(validateContext(c,facts).targetSha,sha);
  for(const delta of [{GITHUB_ACTIONS:'false'},{CI:'false'},{RUNNER_ENVIRONMENT:'self-hosted'},{NODE_ENV:'production'},{APP_ENV:'production'},{DB_HOST:'47.236.122.224'},{DB_USER:'postgres'},{DB_NAME:'production'},{DB_PORT:'5433'},{PORT:'3101'},{GITHUB_WORKSPACE:'/data/phoenix-erp'},{RUNNER_TEMP:'/tmp'},{GITHUB_REPOSITORY:'other/repo'},{BACKGROUND_FIXTURE_POSTGRES_ID:'postgres'},{GITHUB_SHA:'main'}])assert.throws(()=>validateContext({...c,...delta},facts),/CI_BACKGROUND_HOLD=/);
  for(const delta of [{production:true},{runner:null},{workspaceUid:0},{tempUid:0},{head:'b'.repeat(40)},{originApproved:false},{mainRegular:false},{workspace:'/data/phoenix-erp'}])assert.throws(()=>validateContext(c,{...facts,...delta}),/CI_BACKGROUND_HOLD=/);
});
test('real Runner.Worker process ancestor is required, not an environment flag alone',()=>{
  const tree={5:{pid:5,ppid:4,exe:'/usr/bin/node'},4:{pid:4,ppid:2,exe:'/bin/bash'},2:{pid:2,ppid:1,start:'100',exe:'/home/runner/runners/2.330.0/bin/Runner.Worker'}};
  assert.equal(findRunnerAncestor(5,p=>tree[p]).pid,2);
  assert.throws(()=>findRunnerAncestor(4,p=>({...tree[p],exe:'/bin/bash'})),/REAL_HOSTED_RUNNER_REQUIRED/);
});
test('only the observed hosted cached layout with a strict numeric version is admitted through real ancestry',()=>{
  // Read-only hosted diagnostic run 39057912017, head e50c1baf0dfcbdc7f2c2029196df78caef5e414a.
  const worker='/home/runner/actions-runner/cached/2.337.0/bin/Runner.Worker';
  const tree={5:{pid:5,ppid:4,exe:'/usr/local/bin/node'},4:{pid:4,ppid:2,exe:'/usr/bin/bash'},2:{pid:2,ppid:1,start:'100',exe:worker}};
  assert.deepEqual(findRunnerAncestor(5,p=>tree[p]),{pid:2,start:'100',exe:worker});
  const patchedWorker='/home/runner/actions-runner/cached/2.337.1/bin/Runner.Worker';
  assert.deepEqual(findRunnerAncestor(5,p=>({...tree[p],...(p===2?{exe:patchedWorker}:{})})),{pid:2,start:'100',exe:patchedWorker});
  for(const exe of [
    `${c.GITHUB_WORKSPACE}/actions-runner/cached/2.337.0/bin/Runner.Worker`,
    `${c.GITHUB_WORKSPACE}${worker}`,
    '/home/runner/actions-runner/cached/2.337.0/bin/Runner.Listener',
    '/home/runner/actions-runner/cached/2.337.0/bin/Runner.Worker.fake',
    '/home/runner/actions-runner/cached/2.337.0/bin/Runner.Worker (deleted)',
    '/home/runner/actions-runner/cached/2.337/bin/Runner.Worker',
    '/home/runner/actions-runner/cached/2.337.0.1/bin/Runner.Worker',
    '/home/runner/actions-runner/cached/latest/bin/Runner.Worker',
    '/home/runner/actions-runner/cached/v2.337.0/bin/Runner.Worker',
    '/home/runner/actions-runner/cached/2.337.0-preview/bin/Runner.Worker',
    '/home/runner/actions-runner/cached/2.337.0/../2.337.0/bin/Runner.Worker',
    '/tmp/Runner.Worker',
  ])assert.throws(()=>findRunnerAncestor(5,p=>({...tree[p],...(p===2?{exe}:{})})),/REAL_HOSTED_RUNNER_REQUIRED/);
});
test('a valid cached Worker outside the caller ancestor chain cannot satisfy admission',()=>{
  const tree={5:{pid:5,ppid:4,exe:'/usr/local/bin/node'},4:{pid:4,ppid:1,exe:'/usr/bin/bash'},2:{pid:2,ppid:1,start:'100',exe:'/home/runner/actions-runner/cached/2.337.0/bin/Runner.Worker'}};
  const visited=[];
  assert.throws(()=>findRunnerAncestor(5,p=>{visited.push(p);return tree[p];}),/REAL_HOSTED_RUNNER_REQUIRED/);
  assert.deepEqual(visited,[5,4]);
});
test('only the exact supplied healthy PostgreSQL service and local port may back a fixture',()=>{
  const inspect={Id:id,Config:{Image:'postgres:18-alpine'},State:{Running:true,Health:{Status:'healthy'}},NetworkSettings:{Ports:{'5432/tcp':[{HostIp:'127.0.0.1',HostPort:'5432'}]}},Mounts:[]};
  assert.equal(validateDatabaseContainer(c,inspect),true);assert.equal(validateDatabaseContainer(c,{...inspect,Config:{Image:'postgres:16.14-alpine'}}),true);
  for(const x of [{...inspect,Id:'d'.repeat(64)},{...inspect,Config:{Image:'postgres:latest'}},{...inspect,State:{Running:false}},{...inspect,Mounts:[{Type:'bind',Source:'/data/phoenix-erp-data/postgres'}]},{...inspect,NetworkSettings:{Ports:{'5432/tcp':[{HostIp:'0.0.0.0',HostPort:'6432'}]}}}])assert.throws(()=>validateDatabaseContainer(c,x),/JOB_POSTGRES_SERVICE_REQUIRED/);
  for(const HostIp of ['0.0.0.0','::','::1','127.0.0.2'])assert.throws(()=>validateDatabaseContainer(c,{...inspect,NetworkSettings:{Ports:{'5432/tcp':[{HostIp,HostPort:'5432'}]}}}),/JOB_POSTGRES_SERVICE_REQUIRED/);
});
test('kernel listener proof rejects wildcard, foreign address, unknown inode and duplicate API listeners',()=>{
  const row=address=>['0:',`${address}:0C1C`,'00000000:0000','0A','0','0','0','0','0','55'];const owned=new Set(['55']);
  for(const address of ['0100007F','00000000000000000000000001000000'])assert.equal(validateApiListeners([row(address)],owned),true);
  for(const address of ['00000000','00000000000000000000000000000000','0200007F','010200C0'])assert.throws(()=>validateApiListeners([row(address)],owned),/API_LISTENER_NOT_OWNED_LOOPBACK/);
  assert.throws(()=>validateApiListeners([row('0100007F')],new Set(['99'])),/API_LISTENER_NOT_OWNED_LOOPBACK/);
  assert.throws(()=>validateApiListeners([row('0100007F'),row('0100007F')],owned),/API_LISTENER_NOT_OWNED_LOOPBACK/);
});
test('real boot UUID, exact fenced owner/generation and connected control identity are required',()=>{
  const binding={owner:status.owner,generation:1,phase:'FENCED',sha};assert.equal(validateStatus(status,binding),status);
  for(const delta of [{phase:'OPEN'},{bootId:'legacy'},{generation:2},{owner:'other'},{poisoned:true},{stopping:true},{inFlight:-1},{controlSession:{...status.controlSession,connected:false}},{controlSession:{...status.controlSession,applicationName:'fake'}}])assert.throws(()=>validateStatus({...status,...delta},binding),/CI_BACKGROUND_HOLD=/);
  assert.deepEqual(KINDS,['LOCAL','EXTERNAL_READ','NOTIFICATION']);assert.ok(!KINDS.some(k=>k.startsWith('CHANJET_')));
});
test('invalid CI context causes zero sudo, writes, or API starts',async()=>{
  let sudo=0,starts=0,writes=0;
  await assert.rejects(runFixture('start',{...c,NODE_ENV:'production'},{approve:x=>validateContext(x,facts),rootCall:()=>sudo++,start:()=>starts++,persist:()=>writes++}),/HOSTED_TEST_CI_ONLY/);
  assert.deepEqual([sudo,starts,writes],[0,0,0]);
});
test('positive fixture explicitly prepares root HOLD then owns process before requesting OPEN',async()=>{
  const trace=[];const child={pid:55,exitCode:null,on:()=>{},unref:()=>{}};
  const result=await runFixture('start',c,{prepareNetworkAudit,approve:()=>validateContext(c,facts),processStat:()=>({pid:54,start:'88'}),rootCall:op=>{trace.push(op);return{phase:op==='root-open'?'OPEN':'FENCED',identityClass:'CI_HOST_FIXTURE_NOT_OCI',productionReceipt:false};},start:()=>{trace.push('start');return child;},status:async()=>status,persist:()=>trace.push('evidence')});
  assert.deepEqual(trace,['root-prepare','start','root-register','root-open','evidence']);assert.equal(result.productionReceipt,false);
});
test('network journal setup follows readonly approval and closes the inherited capability after launch',async()=>{
  const trace=[];let preparation;
  await runFixture('start',c,{approve:()=>trace.push('readonly'),processStat:()=>({pid:54,start:'88'}),prepareNetworkAudit:()=>{trace.push('journal');return{path:'/test-audit',fd:9,close:()=>trace.push('close-fd')};},rootCall:(op,_c,input)=>{trace.push(op);if(op==='root-prepare')preparation=input;return{};},start:()=>{trace.push('start');return{pid:55,exitCode:null,on:()=>{},unref:()=>{}};},status:async()=>status,persist:()=>{}});
  assert.deepEqual(preparation.networkAudit,{path:'/test-audit',fd:9});
  assert.deepEqual(trace,['readonly','journal','root-prepare','start','close-fd','root-register','root-open']);
  let created=0;
  await assert.rejects(runFixture('start',c,{approve:()=>{throw Error('CI_BACKGROUND_HOLD=READONLY_REJECTED');},prepareNetworkAudit:()=>created++}),/READONLY_REJECTED/);assert.equal(created,0);
});
test('root preparation or audit rejection never starts or publishes a successful API fixture',async()=>{
  let closed=0,started=0;
  await assert.rejects(runFixture('start',c,{approve:()=>{},processStat:()=>({pid:54}),prepareNetworkAudit:()=>({path:'/test-audit',fd:3,close:()=>closed++}),rootCall:op=>{if(op==='root-prepare')throw Error('CI_BACKGROUND_HOLD=NETWORK_AUDIT_UNTRUSTED');return{phase:'NOT_STARTED'};},start:()=>started++}),/NETWORK_AUDIT_UNTRUSTED/);
  assert.deepEqual([closed,started],[1,0]);
  const trace=[];
  await assert.rejects(runFixture('start',c,{prepareNetworkAudit,approve:()=>{},processStat:()=>({pid:54}),rootCall:op=>{trace.push(op);if(op==='root-open')throw Error('CI_BACKGROUND_HOLD=NETWORK_ATTEMPT_DENIED');return{};},start:()=>({pid:55,exitCode:null,on:()=>{},unref:()=>{}}),status:async()=>status,persist:()=>assert.fail('no success after network denial')}),/NETWORK_ATTEMPT_DENIED/);
  assert.deepEqual(trace,['root-prepare','root-register','root-open','root-cleanup']);
});
test('partial prepare and failed cleanup are explicitly retained as HOLD with safe reason enums',async()=>{
  let start=0;
  await assert.rejects(runFixture('start',c,{prepareNetworkAudit,approve:()=>{},processStat:()=>({pid:54}),rootCall:op=>{throw Error(`CI_BACKGROUND_HOLD=${op==='root-prepare'?'NETWORK_AUDIT_UNTRUSTED':'SOURCE_IDENTITY_CHANGED'}`);},start:()=>start++}),error=>error.message==='CI_BACKGROUND_HOLD=CLEANUP_INCOMPLETE'&&error.primaryHold==='NETWORK_AUDIT_UNTRUSTED'&&error.cleanupHold==='SOURCE_IDENTITY_CHANGED');assert.equal(start,0);
  await assert.rejects(runFixture('start',c,{prepareNetworkAudit,approve:()=>{},processStat:()=>({pid:54}),rootCall:op=>{if(op==='root-open')throw Error('CI_BACKGROUND_HOLD=NETWORK_ATTEMPT_DENIED');if(op==='root-cleanup')throw Error('CI_BACKGROUND_HOLD=NETWORK_ATTEMPT_DENIED');return{};},start:()=>({pid:55,exitCode:null,on:()=>{},unref:()=>{}}),status:async()=>status,persist:()=>assert.fail('no CLOSED or success')}),error=>error.message==='CI_BACKGROUND_HOLD=CLEANUP_INCOMPLETE'&&error.primaryHold==='NETWORK_ATTEMPT_DENIED'&&error.cleanupHold==='NETWORK_ATTEMPT_DENIED');
});
test('failed root verification performs no OPEN and cleanup is bounded to this fixture operation',async()=>{
  const trace=[];const child={pid:55,exitCode:null,on:()=>{},unref:()=>{}};
  await assert.rejects(runFixture('start',c,{prepareNetworkAudit,approve:()=>{},processStat:()=>({pid:54}),rootCall:op=>{trace.push(op);if(op==='root-register')throw Error('CI_BACKGROUND_HOLD=OWNED_API_PROCESS_REQUIRED');return{};},start:()=>child}),/OWNED_API_PROCESS_REQUIRED/);
  assert.deepEqual(trace,['root-prepare','root-register','root-cleanup']);
});
test('startup timeout never requests OPEN or writes success evidence',async()=>{
  let clock=0;const trace=[];
  await assert.rejects(runFixture('start',c,{prepareNetworkAudit,approve:()=>{},processStat:()=>({pid:54}),rootCall:op=>{trace.push(op);return{};},start:()=>({pid:55,exitCode:null,on:()=>{},unref:()=>{}}),now:()=>clock+=50000,status:async()=>({...status,phase:'HOLD'}),sleep:async()=>{},persist:()=>assert.fail('no success artifact')}),/API_STARTUP_TIMEOUT/);
  assert.deepEqual(trace,['root-prepare','root-register','root-cleanup']);
});
test('fixture helper has no production approvals, provider bypass, or production state mutation path',()=>{
  const source=fs.readFileSync(new URL('./background-control-api-fixture.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/ALLOW_FREEZE_TOUCH|ALLOW_SECURITY_TOUCH|workflow_dispatch|floor\.json|active\.json|transaction\.json/);
  assert.match(source,/remount,bind,ro/);assert.match(source,/CI_HOST_FIXTURE_NOT_OCI/);assert.match(source,/BEGIN READ ONLY/);
});
test('real local invocation refuses spoofed CI flags before sudo or privileged writes',()=>{
  const r=spawnSync(process.execPath,[new URL('./background-control-api-fixture.mjs',import.meta.url).pathname,'start'],{encoding:'utf8',env:{PATH:'/definitely-no-sudo',GITHUB_ACTIONS:'true',NODE_ENV:'production',APP_ENV:'test'},timeout:5000});
  assert.equal(r.status,1);assert.equal(r.stdout,'');assert.match(r.stderr,/CI_BACKGROUND_HOLD=HOSTED_TEST_CI_ONLY/);
});
test('all three positive workflows use the fixture, preserve job boundaries and leave production bootstrap profiles unchanged',()=>{
  for(const name of ['regression.yml','batch3-quality-e2e.yml','deploy.yml']){
    const w=fs.readFileSync(new URL(`../../.github/workflows/${name}`,import.meta.url),'utf8');
    assert.match(w,/BACKGROUND_FIXTURE_POSTGRES_ID: \$\{\{ job\.services\.postgres\.id \}\}/);
    assert.match(w,/background-control-api-fixture\.sh start/);assert.match(w,/background-control-api-fixture\.sh cleanup/);
    assert.doesNotMatch(w,/nohup node dist\/main/);assert.match(w,/APP_ENV: test/);
    if(name==='deploy.yml'){assert.match(w,/^  build-push:$/m);assert.match(w,/Production-equivalent isolated API bootstrap SQL proof/);}
  }
});
test('cleanup treats only confirmed ENOENT/ESRCH as exit; EACCES/EIO and an alive PID retain HOLD',()=>{
  for(const code of ['EACCES','EIO','EPERM','ELOOP']){
    let probes=0;
    assert.throws(()=>inspectCleanupProcess(55,{read:()=>{throw Object.assign(Error('injected'),{code});},probe:()=>probes++}),/API_PROCESS_STATE_UNVERIFIED/);
    assert.equal(probes,0);
  }
  for(const code of ['ENOENT','ESRCH']){
    const read=()=>{throw Object.assign(Error('gone metadata'),{code});};
    assert.equal(inspectCleanupProcess(55,{read,probe:()=>{throw Object.assign(Error('gone PID'),{code:'ESRCH'});}}),null);
    assert.throws(()=>inspectCleanupProcess(55,{read,probe:()=>{}}),/API_PROCESS_STATE_UNVERIFIED/);
    assert.throws(()=>inspectCleanupProcess(55,{read,probe:()=>{throw Object.assign(Error('denied'),{code:'EPERM'});}}),/API_PROCESS_STATE_UNVERIFIED/);
  }
});
test('post-TERM metadata failure cannot advance cleanup to unmount/delete or CLOSED',async()=>{
  for(const code of ['EACCES','EIO']){
    const retained={mount:true,state:true,closed:false};let polls=0;
    await assert.rejects((async()=>{
      await waitFixtureProcessExit({pid:55,start:'88'},{sleep:async()=>{},inspect:()=>inspectCleanupProcess(55,{read:()=>{if(polls++===0)return{start:'88'};throw Object.assign(Error('injected'),{code});}})});
      retained.mount=false;retained.state=false;retained.closed=true;
    })(),/API_PROCESS_STATE_UNVERIFIED/);
    assert.deepEqual(retained,{mount:true,state:true,closed:false});assert.equal(polls,2);
  }
  await waitFixtureProcessExit({pid:55,start:'88'},{inspect:()=>null});
  await assert.rejects(waitFixtureProcessExit({pid:55,start:'88'},{inspect:()=>({start:'99'})}),/API_PID_REUSED/);
});
test('missing root state reports NOT_STARTED only when both target path and mount are absent',()=>{
  assert.deepEqual(cleanupNotStarted({exists:()=>false,rows:()=>[]}),{phase:'NOT_STARTED'});
  assert.equal(cleanupNotStarted({exists:p=>p===STATE,rows:()=>assert.fail('owned state follows normal checks')}),null);
  assert.throws(()=>cleanupNotStarted({exists:p=>p===TARGET,rows:()=>[]}),/ORPHANED_CONTROL/);
  assert.throws(()=>cleanupNotStarted({exists:()=>false,rows:()=>[['1','2','3','4',TARGET,'ro']]}),/ORPHANED_CONTROL/);
  assert.throws(()=>controlPathExists(TARGET,()=>{throw Object.assign(Error('unreadable'),{code:'EACCES'});}),/CONTROL_PATH_UNVERIFIED/);
  assert.throws(()=>controlPathExists(STATE,()=>{throw Object.assign(Error('io'),{code:'EIO'});}),/CONTROL_PATH_UNVERIFIED/);
  assert.equal(controlPathExists(TARGET,()=>{throw Object.assign(Error('absent'),{code:'ENOENT'});}),false);
});
test('a real live process with a deleted cwd is HOLD, not a false stopped receipt',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'background-live-cwd-'));
  const child=spawn(process.execPath,['-e',"process.stdout.write('READY');setInterval(()=>{},1000)"],{cwd:dir,stdio:['ignore','pipe','ignore']});
  try{
    const ready=await once(child.stdout,'data',{signal:AbortSignal.timeout(5000)});assert.match(String(ready[0]),/READY/);
    fs.rmdirSync(dir);
    assert.throws(()=>inspectCleanupProcess(child.pid),/API_PROCESS_STATE_UNVERIFIED/);
    const exited=once(child,'exit');child.kill('SIGTERM');await exited;
    assert.equal(inspectCleanupProcess(child.pid),null);
  }finally{
    if(child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await exited;}
    if(fs.existsSync(dir))fs.rmdirSync(dir);
  }
});
