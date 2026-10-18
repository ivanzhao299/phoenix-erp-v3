/** Actual owned PG/root transport; API/Docker candidate, storage and authority
 * remain explicit synthetic test doubles. Never actual ERP or release proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {collectCandidateServerBinding} from './production-maintenance-candidate-binding.mjs';
import {DockerPostgresControlSession} from './background-control-coordinator.mjs';
import {candidateBindingFixture} from '../ci/maintenance-candidate-binding-fixture.mjs';
import {ownedFixtureDeadline,assertSuccessfulFixtureRecord} from '../ci/owned-fixture-deadline.mjs';

const enabled=process.env.MAINTENANCE_BINDING_PG_FIXTURE==='1';
const env={PATH:'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',DOCKER_HOST:'unix:///var/run/docker.sock'};
const boot='01234567-0123-4123-8123-0123456789ab',app='phoenix-fence:'+boot;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
for(const image of ['postgres:16.14-alpine','postgres:18-alpine'])test(`candidate binding with actual ${image} and synthetic API`,{skip:!enabled,timeout:120000},async t=>{
  const deadline=ownedFixtureDeadline({signal:t.signal,timeoutMs:119000}),owner=randomUUID(),name='phoenix-binding-'+owner;
  const children=[],cases=[],observations=[];let id,createAttempted=false,cleaning=false,peer,fixture;
  const record={schema:'phoenix.candidate-binding-pg-fixture/v1',owner,image,actualPostgresAndRootTransport:true,actualErp:false,
    candidateRuntimeAndApi:'SYNTHETIC_TEST_DOUBLE',maintenanceAuthorityAndStorage:'SYNTHETIC_TEST_DOUBLE',productionConnectionExecuted:false,productionMutation:false,cases,observations};
  const docker=(args,input,options={})=>{
    if(!cleaning)deadline.assertActive();let value;
    try{value=execFileSync('/usr/bin/docker',args,{input,env,encoding:'utf8',timeout:Math.min(10000,options.timeoutMs||10000),maxBuffer:65536,stdio:['pipe','pipe','pipe']}).trim();}
    catch{throw Error('OWNED_BINDING_FIXTURE_COMMAND_FAILED');}
    if(!cleaning)deadline.assertActive();return value;
  };
  const track=child=>{const owned={child,closed:false};owned.done=new Promise(resolve=>child.once('close',()=>{owned.closed=true;resolve();}));children.push(owned);return {registered:true,pid:child.pid};};
  const sub=(label,fn)=>t.test(label,async()=>{deadline.assertActive();await fn();deadline.assertActive();cases.push(label);});
  try{
    createAttempted=true;id=docker(['run','--pull=never','--detach','--name',name,'--label','phoenix.fixture.owner='+owner,'--network','none','--tmpfs',
      (image.includes(':18')?'/var/lib/postgresql':'/var/lib/postgresql/data')+':rw,nosuid,noexec,size=256m',
      '-e','POSTGRES_USER=fixture_owner','-e','POSTGRES_DB=phoenix_erp','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','PGDATA=/var/lib/postgresql/data',
      '--health-cmd','pg_isready -U fixture_owner -d phoenix_erp','--health-interval','1s','--health-timeout','2s','--health-retries','60',image]);
    assert.match(id,/^[a-f0-9]{64}$/);record.containerId=id;let healthy=false;
    for(let n=0;n<300;n++){
      if(docker(['inspect',id,'--format','{{.State.Health.Status}}'])==='healthy'&&docker(['exec',id,'cat','/proc/1/comm'])==='postgres'){healthy=true;break;}
      await delay(100);
    }
    assert.equal(healthy,true);assert.equal(docker(['inspect',id,'--format','{{.HostConfig.NetworkMode}}']),'none');
    assert.equal(docker(['inspect',id,'--format','{{index .Config.Labels "phoenix.fixture.owner"}}']),owner);
    const direct=sql=>docker(['exec','-i',id,'psql','--username=fixture_owner','--dbname=phoenix_erp','-X','-qAt','--set=ON_ERROR_STOP=1'],sql);
    const [imageId,containerStartedAt]=docker(['inspect',id,'--format','{{json .Image}}\t{{json .State.StartedAt}}']).split('\t').map(JSON.parse);
    const database={containerId:id,imageId,containerStartedAt,...JSON.parse(direct(`SELECT json_build_object('databaseOid',(SELECT oid::bigint FROM pg_database WHERE datname=current_database()),'postmasterStartedAt',to_char(pg_postmaster_start_time() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'clusterSystemIdentifier',(SELECT system_identifier::text FROM pg_control_system()));`))};
    peer=new DockerPostgresControlSession({commandTimeoutMs:3000},{spawn:()=>{
      const child=spawn('/usr/bin/docker',['exec','-i','-e','PGAPPNAME='+app,id,'psql','--username=fixture_owner','--dbname=phoenix_erp','-X','-qAt','--set=ON_ERROR_STOP=1'],{env,stdio:['pipe','pipe','pipe']});track(child);return child;
    }});await peer.start();
    const identity=JSON.parse(direct(`SELECT json_build_object('sessionPid',pid,'backendStartedAt',to_char(backend_start AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'backendStartedAtUs',to_char(backend_start AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) FROM pg_stat_activity WHERE application_name='${app}';`));
    fixture=await candidateBindingFixture({database,rootRun:docker,databaseRun:docker,realRoot:true,now:Date.now,registerOwnedChild:track,candidateIdentity:identity});
    const collect=()=>collectCandidateServerBinding({...fixture.request,signal:t.signal},fixture.dependencies);
    const rootPid=fixture.lease.initialObservation.observation.backends[0].pid;
    await sub('PRE_ADOPTION binds actual original root locks and distinct microsecond candidate backend',async()=>{
      const result=await collect();assert.equal(result.result,'OBSERVATION_ONLY');assert.equal(result.database.observation.rootLocks.length,2);
      assert.equal(result.database.observation.rootBackends[0].pid,rootPid);assert.equal(result.database.observation.candidateBackends[0].pid,identity.sessionPid);
      assert.equal(result.database.observation.candidateBackends[0].backendStartedAt,identity.backendStartedAtUs);observations.push(result);
    });
    await sub('same PID and millisecond with a different raw microsecond is rejected by actual catalog',async()=>{
      const before=fixture.status.controlSession.backendStartedAtUs,changed=before.slice(0,-2)+(before.at(-2)==='9'?'8':String(Number(before.at(-2))+1))+'Z';
      assert.equal(Date.parse(before),Date.parse(changed));fixture.status.controlSession.backendStartedAtUs=changed;
      try{await assert.rejects(collect(),/CANDIDATE_BINDING_HOLD=/);}finally{fixture.status.controlSession.backendStartedAtUs=before;}
      assert.equal(await peer.ping(),true);
    });
    await sub('ADOPTED links recorded candidate and generation without changing real root ownership',async()=>{
      fixture.adopt();const result=await collect();assert.equal(result.mode,'ADOPTED');assert.equal(result.projection.generation,2);observations.push(result);
      assert.equal(result.database.observation.rootBackends[0].pid,rootPid);assert.equal(children.filter(child=>!child.closed).length,2);
    });
    await sub('closed candidate connection cannot be replaced by a synthetic healthy API report',async()=>{
      await peer.close();await assert.rejects(collect(),/CANDIDATE_BINDING_HOLD=/);
      const root=await fixture.lease.observe();assert.equal(root.observation.backends[0].pid,rootPid);assert.equal(root.observation.locks.length,2);
    });
    await sub('original root release is settled in PostgreSQL and its local child',async()=>{
      assert.equal((await fixture.lease.close()).ownedBackendGone,true);
      assert.equal(direct("SELECT count(*) FROM pg_stat_activity WHERE application_name='phoenix-maintenance-control:23456789-1';"),'0');
      assert.equal(children.every(child=>child.closed),true);
    });
    assert.equal(cases.length,5);record.result='PASS';
  }catch(error){record.result='FAIL';record.failure='OWNED_BINDING_PG_FIXTURE_FAILED';throw error;}
  finally{
    cleaning=true;const failures=[];
    if(fixture)try{await fixture.lease.close();}catch{failures.push('ROOT_CLOSE_UNVERIFIED');}
    if(peer)try{await peer.close();}catch{failures.push('PEER_CLOSE_UNVERIFIED');}
    if(createAttempted&&!id){record.pendingOwnedContainerName=name;failures.push('CREATE_OUTCOME_UNVERIFIED');}
    if(id)try{
      assert.equal(docker(['inspect',id,'--format','{{index .Config.Labels "phoenix.fixture.owner"}}']),owner);
      docker(['stop','--time','10',id]);assert.equal(docker(['inspect',id,'--format','{{.State.Running}}']),'false');docker(['rm','-v',id]);
      assert.equal(docker(['ps','-aq','--no-trunc','--filter','label=phoenix.fixture.owner='+owner]),'');record.containerCleanup='OWNED_CONTAINER_REMOVED_CONFIRMED';
    }catch{failures.push('OWNED_CONTAINER_CLEANUP_UNVERIFIED');}
    for(const child of children){let timer;try{await Promise.race([child.done,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('CHILD_CLOSE_UNVERIFIED')),3000);})]);}
      catch{failures.push('LOCAL_CHILD_CLOSE_UNVERIFIED');}finally{clearTimeout(timer);}}
    record.localChildrenClosed=children.every(child=>child.closed);record.originalLocalChildren=children.length;
    record.cleanup=failures.length?'UNVERIFIED_REQUIRES_OWNED_FIXTURE_RECOVERY':'ALL_OWNED_RESOURCES_SETTLED';
    if(failures.length){record.result='FAIL';record.cleanupFailures=failures;}
    Object.assign(record,deadline.finalize(record));const directory=fileURLToPath(new URL('../../artifacts/maintenance-candidate-binding/',import.meta.url));
    fs.mkdirSync(directory,{recursive:true,mode:0o700});const out=path.join(directory,owner+'.json');fs.writeFileSync(out,JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});console.log('OWNED_BINDING_PG_RECEIPT='+out);
    if(failures.length)throw Error('OWNED_BINDING_FIXTURE_CLEANUP_UNVERIFIED');assertSuccessfulFixtureRecord(record);
  }
});
