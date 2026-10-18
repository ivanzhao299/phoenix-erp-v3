/** Owned local PG only. No published ports, production credentials or mounts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {randomUUID} from 'node:crypto';
import {collectCandidateDatabaseSnapshot} from './production-maintenance-candidate-database.mjs';
const enabled=process.env.MAINTENANCE_CANDIDATE_PG_FIXTURE==='1';
const env={PATH:'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',DOCKER_HOST:'unix:///var/run/docker.sock'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function docker(args,input){try{return execFileSync('/usr/bin/docker',args,{input,env,encoding:'utf8',timeout:12000,maxBuffer:65536,stdio:['pipe','pipe','pipe']}).trim();}catch{throw Error('OWNED_CANDIDATE_FIXTURE_COMMAND_FAILED');}}
const psql=['psql','--username=fixture_owner','-X','-qAt','--set=ON_ERROR_STOP=1'];
const identitySql="SELECT json_build_object('sessionPid',pg_backend_pid(),'backendStartedAt',to_char(backend_start AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')) FROM pg_stat_activity WHERE pid=pg_backend_pid();";
function session(id,applicationName,database='phoenix_erp'){
  const child=spawn('/usr/bin/docker',['exec','-i','-e',`PGAPPNAME=${applicationName}`,id,...psql,'--dbname='+database],{env,stdio:['pipe','pipe','pipe']});
  const lines=createInterface({input:child.stdout});child.stderr.on('data',()=>{});let pending=null,broken=false,closed=false,closePromise;
  const reject=()=>{broken=true;if(pending){clearTimeout(pending.timer);pending.reject(Error('OWNED_SESSION_LOST'));pending=null;}};
  child.on('error',reject);child.on('exit',reject);
  lines.on('line',line=>{if(!line.trim())return;const p=pending;if(!p){reject();return;}try{const v=line==='t'?true:line==='f'?false:JSON.parse(line);clearTimeout(p.timer);pending=null;p.resolve(v);}catch{reject();}});
  const query=sql=>new Promise((resolve,rejectQuery)=>{
    if(broken||pending||closed)return rejectQuery(Error('OWNED_SESSION_UNAVAILABLE'));
    const timer=setTimeout(()=>{broken=true;pending=null;rejectQuery(Error('OWNED_SESSION_TIMEOUT'));},5000);
    pending={resolve,reject:rejectQuery,timer};child.stdin.write(sql+'\n');
  });
  let settled=false;const exited=new Promise(resolve=>child.once('close',()=>{settled=true;resolve();}));
  const wait=async ms=>{let timer;try{await Promise.race([exited,new Promise((_,rejectClose)=>{timer=setTimeout(()=>rejectClose(Error('OWNED_SESSION_CLOSE_TIMEOUT')),ms);})]);}finally{clearTimeout(timer);}};
  return {query,close(){return closePromise??=(async()=>{closed=true;child.stdin.end();let failure;
    try{await wait(3000);}catch(error){failure=error;child.kill('SIGTERM');try{await wait(1000);}catch{child.kill('SIGKILL');await wait(1000);}}
    finally{lines.close();}
    if(!settled)throw Error('OWNED_SESSION_EXIT_UNVERIFIED');if(failure)throw failure;
  })();}};
}
for(const image of ['postgres:16.14-alpine','postgres:18-alpine'])test(`owned ${image} candidate root backend binding`,{skip:!enabled,timeout:120000},async t=>{
  const owner=randomUUID(),name=`phoenix-candidate-db-${owner}`,boot=randomUUID(),sessions=[],cases=[];let id,createAttempted=false;
  const record={schema:'phoenix.candidate-database-fixture/v2',owner,image,productionConnectionExecuted:false,productionMutation:false,cases};
  const add=(applicationName,database)=>{const s=session(id,applicationName,database);sessions.push(s);return s;};
  try{
    const mount=image.includes(':18')?'/var/lib/postgresql':'/var/lib/postgresql/data';
    createAttempted=true;
    id=docker(['run','--detach','--name',name,'--label',`phoenix.fixture.owner=${owner}`,'--network','none','--tmpfs',`${mount}:rw,nosuid,noexec,size=256m`,
      '-e','POSTGRES_USER=fixture_owner','-e','POSTGRES_DB=phoenix_erp','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','PGDATA=/var/lib/postgresql/data',
      '--health-cmd','pg_isready -U fixture_owner -d phoenix_erp','--health-interval','1s','--health-timeout','2s','--health-retries','60',image]);
    assert.match(id,/^[a-f0-9]{64}$/);record.containerId=id;
    let healthy=false;for(let n=0;n<300;n++){
      const h=docker(['inspect',id,'--format','{{if .State.Health}}{{.State.Health.Status}}{{end}}']);
      if(h==='healthy'&&docker(['exec',id,'cat','/proc/1/comm'])==='postgres'){healthy=true;break;}
      await sleep(100);
    }assert.equal(healthy,true);assert.equal(docker(['exec',id,'cat','/proc/1/comm']),'postgres');
    const [full,imageId,containerStartedAt,seenOwner,network]=docker(['inspect',id,'--format','{{json .Id}}\t{{json .Image}}\t{{json .State.StartedAt}}\t{{json (index .Config.Labels "phoenix.fixture.owner")}}\t{{json .HostConfig.NetworkMode}}']).split('\t').map(JSON.parse);
    assert.equal(full,id);assert.equal(seenOwner,owner);assert.equal(network,'none');
    const direct=sql=>docker(['exec','-i',id,...psql,'--dbname=phoenix_erp'],sql);
    const facts=JSON.parse(direct("SELECT json_build_object('databaseOid',(SELECT oid::bigint FROM pg_database WHERE datname=current_database()),'postmasterStartedAt',to_char(pg_postmaster_start_time() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'),'clusterSystemIdentifier',(SELECT system_identifier::text FROM pg_control_system()));"));
    const root=add('phoenix-maintenance-control:1234-1'),candidate=add(`phoenix-fence:${boot}`);
    const rootIdentity=await root.query(identitySql),candidateIdentity=await candidate.query(identitySql);
    const binding={owner:'1234-1',previousFloorSha:'a'.repeat(40),targetSha:'b'.repeat(40),database:{containerId:id,imageId,containerStartedAt,...facts},root:rootIdentity,candidate:{...candidateIdentity,bootId:boot}};
    record.binding=binding;
    const collect=(changed={},options={})=>collectCandidateDatabaseSnapshot({...binding,...changed},options,{guard:()=>{},run:docker});
    await root.query('SELECT pg_advisory_lock(17455,1); SELECT pg_advisory_lock(17455,2); SELECT true;');
    await t.test('actual two exclusive locks and distinct root/candidate backends are bound',()=>{
      if(process.env.MAINTENANCE_CANDIDATE_FIXTURE_NEGATIVE==='1')assert.fail('CONTROLLED_FIXTURE_FAILURE_SENTINEL');
      assert.equal(collect().result,'ROOT_HELD_SNAPSHOT');cases.push('HELD_IDENTITIES_AND_LOCKS');
    });
    await t.test('same PID and millisecond cannot conceal a different raw backend or postmaster microsecond',()=>{
      const change=value=>value.slice(0,-2)+(value.at(-2)==='9'?'8':String(Number(value.at(-2))+1))+'Z';
      for(const part of ['root','candidate','database']){
        const key=part==='database'?'postmasterStartedAt':'backendStartedAt',value=binding[part][key],altered=change(value);
        assert.match(value,/\.\d{6}Z$/);assert.notEqual(value,altered);assert.equal(Date.parse(value),Date.parse(altered));
        assert.throws(()=>collect({[part]:{...binding[part],[key]:altered}}),/BACKEND_IDENTITY_CHANGED|DATABASE_IDENTITY_OR_VISIBILITY/);
      }cases.push('RAW_MICROSECOND_IDENTITY_NOT_MS_ALIAS');
    });
    await t.test('old millisecond-only binding is explicitly refused rather than padded or inferred',()=>{
      for(const part of ['root','candidate','database']){
        const key=part==='database'?'postmasterStartedAt':'backendStartedAt';
        assert.throws(()=>collect({[part]:{...binding[part],[key]:new Date(binding[part][key]).toISOString()}}),/EXACT_.*BINDING_REQUIRED/);
      }cases.push('LEGACY_MS_BINDING_REFUSED');
    });
    await t.test('wrong root PID, candidate boot, backend start, database OID and cluster fail closed',()=>{
      for(const changed of [{root:{...binding.root,sessionPid:2000000000}},{root:{...binding.root,backendStartedAt:'2020-01-01T00:00:00.000Z'}},
        {candidate:{...binding.candidate,bootId:randomUUID()}},{database:{...binding.database,databaseOid:1}},{database:{...binding.database,clusterSystemIdentifier:'1'}}])assert.throws(()=>collect(changed),/CANDIDATE_DATABASE_HOLD=/);
      cases.push('WRONG_BACKEND_DATABASE_CLUSTER');
    });
    await t.test('duplicate candidate boot and duplicate root owner cannot be hidden by PID match',async()=>{
      for(const app of [`phoenix-fence:${boot}`,'phoenix-maintenance-control:1234-1']){
        const duplicate=add(app);await duplicate.query(identitySql);assert.throws(()=>collect(),/BACKEND_NOT_UNIQUE|ROOT_BACKEND_NOT_UNIQUE/);await duplicate.close();
      }cases.push('DUPLICATE_BOOT_AND_OWNER');
    });
    await t.test('a real candidate backend in another database is rejected',async()=>{
      const otherBoot=randomUUID(),other=add(`phoenix-fence:${otherBoot}`,'postgres');
      const identity=await other.query(identitySql);
      try{assert.throws(()=>collect({candidate:{...identity,bootId:otherBoot}}),/BACKEND_IDENTITY_CHANGED/);}
      finally{await other.close();}cases.push('OTHER_DATABASE_CANDIDATE');
    });
    await t.test('actual restricted catalog visibility cannot certify the root lease',()=>{
      direct('CREATE ROLE candidate_observer_limited; GRANT EXECUTE ON FUNCTION pg_control_system() TO candidate_observer_limited;');
      assert.throws(()=>collectCandidateDatabaseSnapshot(binding,{}, {guard:()=>{},run:(args,input)=>docker(args,input?'SET ROLE candidate_observer_limited;\n'+input:input)}),/DATABASE_IDENTITY_OR_VISIBILITY/);
      cases.push('RESTRICTED_STATS_REFUSED');
    });
    await t.test('unlocking the execution key is not a lease',async()=>{
      await root.query('SELECT pg_advisory_unlock(17455,2);');assert.throws(()=>collect(),/EXCLUSIVE_ROOT_LOCKS_REQUIRED/);
      await root.query('SELECT pg_advisory_lock(17455,2); SELECT true;');cases.push('MISSING_EXECUTION_LOCK');
    });
    await t.test('two shared locks cannot impersonate exclusive root fencing',async()=>{
      await root.query('SELECT pg_advisory_unlock_all(); SELECT pg_advisory_lock_shared(17455,1); SELECT pg_advisory_lock_shared(17455,2); SELECT true;');
      assert.throws(()=>collect(),/EXCLUSIVE_ROOT_LOCKS_REQUIRED/);
      await root.query('SELECT pg_advisory_unlock_all(); SELECT pg_advisory_lock(17455,1); SELECT pg_advisory_lock(17455,2); SELECT true;');cases.push('SHARED_IS_NOT_EXCLUSIVE');
    });
    await t.test('unlocking all locks but retaining root backend does not prove close settlement',async()=>{
      await root.query('SELECT pg_advisory_unlock_all(); SELECT true;');assert.throws(()=>collect({}, {expectRoot:'RELEASED'}),/ROOT_BACKEND_OR_LOCKS_REMAIN/);
      await root.query('SELECT pg_advisory_lock(17455,1); SELECT pg_advisory_lock(17455,2); SELECT true;');cases.push('IDLE_ROOT_BACKEND_NOT_GONE');
    });
    await root.close();
    await t.test('fresh server observation verifies root backend and its locks are actually gone',()=>{assert.equal(collect({}, {expectRoot:'RELEASED'}).result,'ROOT_BACKEND_ABSENT_SNAPSHOT');cases.push('SERVER_RELEASE_OBSERVED');});
    await t.test('legal post-release shared task locks do not imply old root ownership',async()=>{
      await candidate.query('SELECT pg_advisory_lock_shared(17455,1); SELECT pg_advisory_lock_shared(17455,2); SELECT true;');
      assert.equal(collect({}, {expectRoot:'RELEASED'}).result,'ROOT_BACKEND_ABSENT_SNAPSHOT');cases.push('NEW_SHARED_LOCKS_NOT_OLD_LEASE');
    });
    assert.equal(cases.length,12,'ALL_SUBTESTS_MUST_COMPLETE_BEFORE_PASS_RECEIPT');record.result='PASS';
  }catch(error){record.result='FAIL';record.failure='OWNED_CANDIDATE_DATABASE_TEST_FAILED';throw error;}
  finally{
    const cleanupFailures=[];
    try{for(const s of sessions){try{await s.close();}catch{cleanupFailures.push('SESSION_CLOSE_FAILED');}}
      if(createAttempted&&!id){cleanupFailures.push('CREATE_OUTCOME_UNVERIFIED');record.pendingOwnedContainerName=name;}
      if(id){try{assert.equal(docker(['inspect',id,'--format','{{ index .Config.Labels "phoenix.fixture.owner" }}']),owner);docker(['stop','--time','10',id]);assert.equal(docker(['inspect',id,'--format','{{.State.Running}}']),'false');docker(['rm','-v',id]);assert.equal(docker(['ps','-aq','--no-trunc','--filter',`label=phoenix.fixture.owner=${owner}`]),'');record.containerCleanup='OWNED_CONTAINER_REMOVED_CONFIRMED';}catch{cleanupFailures.push('OWNED_CONTAINER_CLEANUP_FAILED');}}
      if(cleanupFailures.length)throw Error('OWNED_FIXTURE_CLEANUP_UNVERIFIED');record.cleanup='ALL_OWNED_RESOURCES_SETTLED';
    }catch(error){record.result='FAIL';record.cleanup='UNVERIFIED_REQUIRES_OWNED_FIXTURE_RECOVERY';record.cleanupFailures=cleanupFailures;throw error;}
    finally{const dir=fileURLToPath(new URL('../../artifacts/maintenance-candidate-database/',import.meta.url));fs.mkdirSync(dir,{recursive:true,mode:0o700});const out=path.join(dir,owner+'.json');fs.writeFileSync(out,JSON.stringify(record,null,2)+'\n',{mode:0o600,flag:'wx'});console.log('OWNED_CANDIDATE_DATABASE_RECEIPT='+out);}
  }
});
