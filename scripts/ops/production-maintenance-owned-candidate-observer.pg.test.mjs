/** Actual owned PG/root close only. Authority/store synthetic; no candidate observation or production admission. */
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { ownedFixtureDeadline } from '../ci/owned-fixture-deadline.mjs';
import { RootControlLease } from './production-maintenance-root-lease.mjs';
import { OwnedCandidateBindingObserver } from './production-maintenance-owned-candidate-observer.mjs';
import { rootLeaseFixture } from '../ci/maintenance-root-lease-fixture.mjs';
const worktree=fileURLToPath(new URL('../../',import.meta.url));
const enabled=process.env.MAINTENANCE_OWNED_OBSERVER_PG_FIXTURE==='1';
const sourcePin=deadline=>{
 const git=args=>{deadline.assertActive();const value=execFileSync('/usr/bin/git',args,{cwd:worktree,encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']}).trim();deadline.assertActive();return value;};
 assert.match(git(['rev-parse','HEAD']),/^[a-f0-9]{40}$/);assert.equal(git(['status','--porcelain','--untracked-files=no']),'');
 return {head:git(['rev-parse','HEAD']),tree:git(['rev-parse','HEAD^{tree}']),helpers:Object.fromEntries(['production-maintenance-owned-candidate-observer.mjs','production-maintenance-root-lease.mjs','production-maintenance-candidate-binding.mjs','production-config-contract.json'].map(n=>{const f='scripts/ops/'+n;assert.equal(git(['hash-object',f]),git(['rev-parse','HEAD:'+f]));return[f,git(['hash-object',f])];}))};
};

const out=path.join(worktree,'artifacts/maintenance-owned-candidate-observer');
const env={PATH:'/usr/local/bin:/usr/bin:/bin',DOCKER_HOST:'unix:///var/run/docker.sock'};
for(const major of [16,18])test(`original root observer scoped close on actual PG${major}`,{skip:!enabled,timeout:120000},async t=>{
 const deadline=ownedFixtureDeadline({signal:t.signal,timeoutMs:119000}),pinned=sourcePin(deadline);fs.mkdirSync(out,{recursive:true,mode:0o700});
 const owner='owned-observer-'+randomUUID(),image=major===16?'postgres:16.14-alpine':'postgres:18-alpine',children=[],name='phoenix-'+owner;let id,root,observer,cleaning=false,createAttempted=false;
 const record={schema:'phoenix.actual-root-observer-close-fixture/v1',owner,sourceSha:pinned.head,pgMajor:major,image,result:'NOT_RUN',sourcePin:pinned,scope:'ORIGINAL_ROOT_RESOURCE_CLOSE_ONLY',authorityAndStore:'SYNTHETIC_TEST_ONLY',candidateBinding:'NOT_RUN',actualApi:'NOT_RUN',fullCandidateLease:false,registryInstalled:false,productionConnection:false,productionMutation:false,localChildren:children};
 const docker=(args,input,opts={})=>{if(!cleaning)deadline.assertActive();const value=execFileSync('/usr/bin/docker',args,{input,env,encoding:'utf8',timeout:Math.min(15000,opts.timeoutMs??15000),maxBuffer:65536,stdio:['pipe','pipe','pipe']}).trim();if(!cleaning)deadline.assertActive();return value;};
 try{
  createAttempted=true;id=docker(['run','--pull=never','-d','--name',name,'--label','phoenix.test.owner='+owner,'--network','none','--tmpfs',(major===16?'/var/lib/postgresql/data':'/var/lib/postgresql')+':rw,nosuid,nodev','-e','POSTGRES_USER=fixture_owner','-e','POSTGRES_DB=phoenix_erp','-e','POSTGRES_HOST_AUTH_METHOD=trust','--health-cmd','pg_isready -U fixture_owner -d phoenix_erp','--health-interval','1s','--health-timeout','2s','--health-retries','30',image]);assert.match(id,/^[a-f0-9]{64}$/);record.containerId=id;
  const sql=s=>docker(['exec','-i',id,'psql','-h','127.0.0.1','-U','fixture_owner','-d','phoenix_erp','-X','-qAt','--set=ON_ERROR_STOP=1'],s);
  const end=Date.now()+20000;for(;;){try{if(sql('SELECT 1;')==='1')break;}catch{}assert.ok(Date.now()<end);await new Promise(r=>setTimeout(r,100));}
  assert.equal(docker(['inspect',id,'--format','{{index .Config.Labels "phoenix.test.owner"}}']),owner);
  const [imageId,containerStartedAt]=docker(['inspect',id,'--format','{{json .Image}}\t{{json .State.StartedAt}}']).split('\t').map(JSON.parse);
  const database={containerId:id,imageId,containerStartedAt,...JSON.parse(sql(`SELECT json_build_object('databaseOid',(SELECT oid::bigint FROM pg_database WHERE datname=current_database()),'postmasterStartedAt',to_char(pg_postmaster_start_time() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'clusterSystemIdentifier',(SELECT system_identifier::text FROM pg_control_system()));`))};
  // Existing root observer requires the real DB health to be healthy.
  const healthyEnd=Date.now()+10000; while(docker(['inspect',id,'--format','{{.State.Health.Status}}'])!=='healthy'){assert.ok(Date.now()<healthyEnd);await new Promise(r=>setTimeout(r,100));}
  const f=rootLeaseFixture({now:Date.now(),database,owner:String(Date.now())+'-'+major});
  const run=(args,input,options)=>{
    assert.ok((args[0]==='inspect'&&args[1]===id)||(args[0]==='exec'&&args[1]==='-i'&&args[2]===id));
    // Health pin is real; don't substitute a formatted healthy value.
    return docker(args,input,options);
  };
  root=new RootControlLease({...f.options,signal:t.signal,registerOwnedChild(child){const entry={pid:child.pid,closed:false};children.push(entry);Object.defineProperty(entry,'done',{value:new Promise(resolve=>child.once('close',()=>{entry.closed=true;resolve();})),enumerable:false});return{registered:true,pid:child.pid};}}, {...f.dependencies,now:Date.now,run});
  await root.acquire();const held=await root.observe();assert.equal(held.observation.locks.length,2);
  observer=new OwnedCandidateBindingObserver({context:f.context,replacementEvidence:{evidenceSha256:'f'.repeat(64)},rootLease:root});
  const closing=observer.close();assert.equal(observer.close(),closing);const released=await closing;
  assert.equal(released.result,'ORIGINAL_ROOT_RELEASE_OBSERVED');assert.equal(released.rootRelease.ownedBackendGone,true);assert.equal(released.rootRelease.localClientClosed,true);
  assert.equal(children.length,1);assert.equal(children[0].closed,true);assert.equal(observer.cleanupDebt().rootCloseState,'RELEASE_VERIFIED');
  const backendCount=Number(sql(`SELECT count(*) FROM pg_stat_activity WHERE application_name='phoenix-maintenance-control:${f.context.owner}';`));assert.equal(backendCount,0);
  record.releasedServerScan=root.scan('RELEASED',root.budget({timeoutMs:10000}));record.independentBackendCount=backendCount;
  assert.deepEqual(sourcePin(deadline),pinned);record.result='PASS';record.heldRoot=held;record.wrapperRelease=released;record.localChildren=children;
 }catch{record.result='FAIL';record.failureCode='OWNED_NATIVE_ROOT_WRAPPER_CLOSE_UNVERIFIED';}
 finally{
  cleaning=true;
  if(root)try{await root.close();}catch{record.cleanup='ROOT_CLOSE_UNVERIFIED';}
  if(createAttempted&&!id){record.pendingOwnedContainerName=name;record.cleanup='CREATE_OUTCOME_UNVERIFIED';}
  if(id)try{assert.equal(docker(['inspect',id,'--format','{{index .Config.Labels "phoenix.test.owner"}}']),owner);docker(['stop','--time','10',id]);assert.equal(docker(['inspect',id,'--format','{{.State.Running}}']),'false');record.ownedContainerState='STOPPED_RETAINED';}catch{record.cleanup='OWNED_CONTAINER_CLEANUP_UNVERIFIED';}
  for(const child of children){let timer;try{await Promise.race([child.done,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('LOCAL_CHILD_CLOSE_UNVERIFIED')),3000);})]);}catch{record.cleanup='LOCAL_CHILD_CLOSE_UNVERIFIED';}finally{clearTimeout(timer);}}
  record.localChildrenClosed=children.every(child=>child.closed);
  if(record.cleanup)record.result='FAIL';
  if(t.signal.aborted){record.result='FAIL';record.failureCode='OWNED_FIXTURE_DEADLINE';}
  Object.assign(record,deadline.finalize(record));
  const p=path.join(out,owner+'.json');fs.writeFileSync(p,JSON.stringify(record,null,2)+'\n',{mode:0o600,flag:'wx'});
  // A persisted PASS is not sufficient: failure or deadline after persistence
  // must fail the Node test too. Hosted run outcome is mandatory for acceptance.
  if(deadline.expired()){record.result='FAIL';record.failureCode='OWNED_FIXTURE_DEADLINE_AFTER_PERSISTENCE';}
  console.log(JSON.stringify({pgMajor:major,result:record.result,cleanup:record.cleanup??'SCOPED_RESOURCES_SETTLED',evidence:p,fullCandidateLease:false}));
 }
 deadline.assertActive();
 assert.equal(record.result,'PASS','Native root lifecycle or cleanup failed; retained owned evidence required');
});
