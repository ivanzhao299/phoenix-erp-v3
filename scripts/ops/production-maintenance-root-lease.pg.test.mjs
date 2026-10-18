/** Actual adapter against uniquely owned network-none PG16/18, never production.
 * Authority/store injection is fixture-only; it does not install a registry. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {RootControlLease,rootPsqlProgram} from './production-maintenance-root-lease.mjs';
import {DockerPostgresControlSession} from './background-control-coordinator.mjs';
import {rootLeaseFixture} from '../ci/maintenance-root-lease-fixture.mjs';
const enabled=process.env.MAINTENANCE_ROOT_PG_FIXTURE==='1',manual=/SESSION_CHILDREN_UNVERIFIED_MANUAL_RECOVERY_REQUIRED/;
const env={PATH:'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',DOCKER_HOST:'unix:///var/run/docker.sock'};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function docker(args,input){try{return execFileSync('/usr/bin/docker',args,{input,env,encoding:'utf8',timeout:12000,maxBuffer:65536,stdio:['pipe','pipe','pipe']}).trim();}catch{throw Error('OWNED_ROOT_FIXTURE_COMMAND_FAILED');}}
for(const image of ['postgres:16.14-alpine','postgres:18-alpine'])test(`actual ${image} root control lease and failures`,{skip:!enabled,timeout:180000},async t=>{
  const owner=randomUUID(),name='phoenix-root-lease-'+owner,cases=[],leases=[],peers=[],children=[];let id,createAttempted=false,sequence=0;
  const record={schema:'phoenix.root-control-isolated-fixture/v1',owner,image,fixtureAuthorityAndStoreOnly:true,productionConnectionExecuted:false,productionMutation:false,cases};
  const sub=async(label,fn)=>t.test(label,async()=>{await fn();cases.push(label);});
  try{
    createAttempted=true;id=docker(['run','--detach','--name',name,'--label','phoenix.fixture.owner='+owner,'--network','none','--tmpfs',
      (image.includes(':18')?'/var/lib/postgresql':'/var/lib/postgresql/data')+':rw,nosuid,noexec,size=256m','-e','POSTGRES_USER=fixture_owner','-e','POSTGRES_DB=phoenix_erp','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','PGDATA=/var/lib/postgresql/data',
      '--health-cmd','pg_isready -U fixture_owner -d phoenix_erp','--health-interval','1s','--health-timeout','2s','--health-retries','60',image]);
    assert.match(id,/^[a-f0-9]{64}$/);record.containerId=id;
    const healthy=async()=>{for(let n=0;n<300;n++){if(docker(['inspect',id,'--format','{{.State.Health.Status}}'])==='healthy'&&docker(['exec',id,'cat','/proc/1/comm'])==='postgres')return;await delay(100);}throw Error('OWNED_FINAL_PG_SERVER_NOT_READY');};await healthy();
    const pin=()=>docker(['inspect',id,'--format','{{json .Id}}\t{{json .Image}}\t{{json .State.StartedAt}}\t{{json .State.Running}}\t{{json .HostConfig.NetworkMode}}']).split('\t').map(JSON.parse);
    const initial=pin();assert.equal(initial[0],id);assert.equal(initial[4],'none');assert.equal(docker(['inspect',id,'--format','{{index .Config.Labels "phoenix.fixture.owner"}}']),owner);
    const direct=q=>docker(['exec','-i',id,'psql','--host=/var/run/postgresql','--port=5432','--username=fixture_owner','--dbname=phoenix_erp','--no-password','-X','-qAt','--set=ON_ERROR_STOP=1'],q);
    const facts=()=>({containerId:id,imageId:pin()[1],containerStartedAt:pin()[2],...JSON.parse(direct(`SELECT json_build_object('databaseOid',(SELECT oid::bigint FROM pg_catalog.pg_database WHERE datname=current_database()),'postmasterStartedAt',to_char(pg_catalog.pg_postmaster_start_time() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'clusterSystemIdentifier',(SELECT system_identifier::text FROM pg_catalog.pg_control_system()));`))});
    const database=facts();record.database=database;
    const make=(options={},dependencies={})=>{
      const f=rootLeaseFixture({database,owner:`23456789-${++sequence}`});
      const register=options.registerOwnedChild||f.options.registerOwnedChild;
      const lease=new RootControlLease({...f.options,...options,registerOwnedChild:child=>{
        const owned={child,closed:false};owned.done=new Promise(resolve=>child.once('close',()=>{owned.closed=true;resolve();}));children.push(owned);return register(child);
      }},{...f.dependencies,now:Date.now,run:docker,...dependencies});leases.push(lease);return {...f,lease};
    };
    const peer=async ownerName=>{
      const session=new DockerPostgresControlSession({commandTimeoutMs:3000},{spawn:()=>spawn('/usr/bin/docker',['exec','-i',id,'/bin/sh','-c',rootPsqlProgram(ownerName)],{env,stdio:['pipe','pipe','pipe']})});
      peers.push(session);await session.start();return session;
    };
    const gone=ownerName=>assert.equal(Number(direct(`SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE application_name='phoenix-maintenance-control:${ownerName}';`)),0);
    await sub('microsecond server identity and two actual exclusive locks; normal EOF release',async()=>{
      if(process.env.MAINTENANCE_ROOT_FIXTURE_NEGATIVE==='1')assert.fail('CONTROLLED_ROOT_FIXTURE_FAILURE_SENTINEL');
      const f=make();await f.lease.acquire();const observation=await f.lease.observe();await f.lease.observe();
      assert.match(observation.observation.backends[0].backendStartedAt,/\.\d{6}Z$/);assert.equal(observation.observation.locks.length,2);
      assert.deepEqual(observation.observation.locks.map(l=>[l.namespace,l.key,l.keyForm,l.mode,l.granted]),[[17455,1,2,'ExclusiveLock',true],[17455,2,2,'ExclusiveLock',true]]);
      assert.equal(observation.productionReleaseAuthorized,false);assert.equal(observation.candidateProof,false);
      assert.equal((await f.lease.close()).ownedBackendGone,true);gone(f.context.owner);assert.deepEqual(pin(),initial);
    });
    await sub('partial lock contention releases only its own connection and preserves competitor',async()=>{
      const competitor=await peer('77777777-1');try{
        assert.equal(await competitor.tryLock(2),true);const f=make();await assert.rejects(f.lease.acquire(),/ROOT_CONTROL_LOCK_CONTENDED/);
        gone(f.context.owner);assert.equal(f.records.get(f.lease.releaseFile).ownedBackendGone,true);assert.equal(await competitor.ping(),true);
        const count=Number(direct("SELECT count(*) FROM pg_catalog.pg_locks WHERE locktype='advisory' AND classid=17455 AND objid=2 AND objsubid=2 AND granted;"));assert.equal(count,1);
      }finally{await competitor.close();}
    });
    await sub('database OID mismatch cannot certify identity, even after client exits',async()=>{
      const f=make({database:{...database,databaseOid:database.databaseOid+1}});await assert.rejects(f.lease.acquire(),manual);gone(f.context.owner);assert.equal(f.records.has(f.lease.releaseFile),false);
    });
    await sub('duplicate named owner backend rejects discovery without terminating peer',async()=>{
      const f=make(),duplicate=await peer(f.context.owner);try{await assert.rejects(f.lease.acquire(),manual);assert.equal(await duplicate.ping(),true);assert.equal(f.records.has(f.lease.releaseFile),false);}finally{await duplicate.close();}gone(f.context.owner);
    });
    await sub('actual restricted statistics role cannot certify the lease',async()=>{
      direct('CREATE ROLE root_fixture_limited; GRANT EXECUTE ON FUNCTION pg_control_system() TO root_fixture_limited;');
      const f=make({}, {run:(args,input)=>docker(args,input?'SET ROLE root_fixture_limited;\n'+input:input)});
      await assert.rejects(f.lease.acquire(),manual);gone(f.context.owner);assert.equal(f.records.has(f.lease.releaseFile),false);
    });
    await sub('throwing original-child registration is bounded cleanup plus manual HOLD',async()=>{
      const f=make({registerOwnedChild(){throw Error('OWNED_REGISTRATION_FAILURE');}});await assert.rejects(f.lease.acquire(),manual);gone(f.context.owner);assert.equal(f.records.has(f.lease.releaseFile),false);
    });
    await sub('abort after persisted identity releases partial resources without granting admission',async()=>{
      const controller=new AbortController(),f=make({signal:controller.signal});const immutable=f.store.immutable;
      f.store.immutable=(file,value)=>{immutable(file,value);if(file===f.lease.serverFile)controller.abort();};
      await assert.rejects(f.lease.acquire(),/ROOT_CONTROL_ABORTED/);gone(f.context.owner);assert.equal(f.records.get(f.lease.releaseFile).ownedBackendGone,true);
    });
    await sub('identity receipt write failure still closes backend but never certifies release',async()=>{
      const f=make(),immutable=f.store.immutable;f.store.immutable=(file,value)=>{if(file===f.lease.serverFile)throw Error('OWNED_RECORD_WRITE_FAILURE');immutable(file,value);};
      await assert.rejects(f.lease.acquire(),manual);gone(f.context.owner);assert.equal(f.records.has(f.lease.releaseFile),false);
    });
    await sub('terminated real backend poisons observation; new observations cannot resurrect lease',async()=>{
      const f=make();await f.lease.acquire();const pid=f.lease.initialObservation.observation.backends[0].pid;
      assert.equal(direct(`SELECT pg_catalog.pg_terminate_backend(${pid});`),'t');await delay(100);
      await assert.rejects(f.lease.observe(),/MAINTENANCE_HOLD=/);await assert.rejects(f.lease.observe(),/LEASE_NOT_HELD/);
      assert.equal((await f.lease.close()).ownedBackendGone,true);gone(f.context.owner);
    });
    await sub('real database restart invalidates old pin and cleanup cannot claim success',async()=>{
      const f=make();await f.lease.acquire();docker(['restart','--time','10',id]);await healthy();
      await assert.rejects(f.lease.observe(),/MAINTENANCE_HOLD=/);await assert.rejects(f.lease.close(),manual);assert.equal(f.records.has(f.lease.releaseFile),false);
      assert.notEqual(pin()[2],initial[2]);
    });
    assert.equal(cases.length,10,'ALL_REQUIRED_SUBTESTS_MUST_COMPLETE_BEFORE_PASS');record.result='PASS';
  }catch(error){record.result='FAIL';record.failure='OWNED_ROOT_LEASE_TEST_FAILED';throw error;}
  finally{
    const failures=[];
    // A negative case may intentionally retain a manual HOLD; owner-only
    // container teardown below settles fixture resources, never production.
    for(const lease of leases)try{await lease.close();}catch{}
    for(const session of peers)try{await session.close();}catch{failures.push('PEER_CLOSE_UNVERIFIED');}
    if(createAttempted&&!id){record.pendingOwnedContainerName=name;failures.push('CREATE_OUTCOME_UNVERIFIED');}
    if(id)try{
      assert.equal(docker(['inspect',id,'--format','{{index .Config.Labels "phoenix.fixture.owner"}}']),owner);
      docker(['stop','--time','10',id]);assert.equal(docker(['inspect',id,'--format','{{.State.Running}}']),'false');docker(['rm','-v',id]);
      assert.equal(docker(['ps','-aq','--no-trunc','--filter','label=phoenix.fixture.owner='+owner]),'');record.containerCleanup='OWNED_CONTAINER_REMOVED_CONFIRMED';
    }catch{failures.push('OWNED_CONTAINER_CLEANUP_UNVERIFIED');}
    // Destroying the owned container settles its server, but local docker exec
    // children are a separate resource and must also produce their close event.
    for(const owned of children){let timer;try{await Promise.race([owned.done,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('LOCAL_CHILD_NOT_CLOSED')),3000);})]);assert.equal(owned.closed,true);}
      catch{failures.push('OWNED_LOCAL_CHILD_CLOSE_UNVERIFIED');}finally{clearTimeout(timer);}}
    record.originalLocalChildren=children.length;record.localChildrenClosed=children.every(x=>x.closed);
    if(failures.length){record.result='FAIL';record.cleanup='UNVERIFIED_REQUIRES_OWNED_FIXTURE_RECOVERY';record.cleanupFailures=failures;}
    else record.cleanup='ALL_OWNED_RESOURCES_SETTLED';
    const directory=fileURLToPath(new URL('../../artifacts/maintenance-root-control/',import.meta.url));fs.mkdirSync(directory,{recursive:true,mode:0o700});
    const out=path.join(directory,owner+'.json');fs.writeFileSync(out,JSON.stringify(record,null,2)+'\n',{mode:0o600,flag:'wx'});console.log('OWNED_ROOT_CONTROL_RECEIPT='+out);
    if(failures.length)throw Error('OWNED_FIXTURE_CLEANUP_UNVERIFIED');
  }
});
