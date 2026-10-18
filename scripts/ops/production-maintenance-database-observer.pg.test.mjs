/** Opt-in owned PG fixtures only. No host ports, production mounts or secrets. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {once} from 'node:events';
import {collectMaintenanceDatabaseSnapshot,DATABASE_OBSERVATION_SQL_SHA256} from './production-maintenance-database-observer.mjs';
const enabled=process.env.MAINTENANCE_DATABASE_PG_FIXTURE==='1';
const env={PATH:'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',DOCKER_HOST:'unix:///var/run/docker.sock'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function bounded(promise,ms){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('OWNED_HOLDER_CLOSE_TIMEOUT')),ms);})]);}finally{clearTimeout(timer);}}
function docker(args,input){try{return execFileSync('/usr/bin/docker',args,{env,input,encoding:'utf8',timeout:12000,maxBuffer:65536,stdio:['pipe','pipe','pipe']}).trim();}catch{throw Error('OWNED_DATABASE_FIXTURE_COMMAND_FAILED');}}
const fixturePsql=['psql','-X','-qAt','--set=ON_ERROR_STOP=1','--username=fixture_owner'];
for(const image of ['postgres:16.14-alpine','postgres:18-alpine'])test(`owned ${image} readonly database observations`,{skip:!enabled,timeout:120000},async t=>{
  const owner=randomUUID(),name=`phoenix-db-observer-${owner}`,results=[];let id;
  const record={schema:'phoenix.maintenance-database-observer-fixture/v1',owner,image,productionConnectionExecuted:false,productionMutation:false,querySha256:DATABASE_OBSERVATION_SQL_SHA256,results};
  const psql=(sql,db='phoenix_erp')=>docker(['exec','-i',id,...fixturePsql,'--dbname='+db],sql);
  try{
    const mount=image.includes(':18')?'/var/lib/postgresql':'/var/lib/postgresql/data';
    id=docker(['run','--detach','--name',name,'--label',`phoenix.fixture.owner=${owner}`,'--network','none','--tmpfs',`${mount}:rw,nosuid,noexec,size=256m`,
      '-e','POSTGRES_USER=fixture_owner','-e','POSTGRES_DB=phoenix_erp','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','PGDATA=/var/lib/postgresql/data',
      '--health-cmd','pg_isready -U fixture_owner -d phoenix_erp','--health-interval','1s','--health-timeout','2s','--health-retries','60',image,'postgres','-c','max_prepared_transactions=10']);
    assert.match(id,/^[a-f0-9]{64}$/);record.containerId=id;
    let healthy=false;for(let n=0;n<300;n++){if(docker(['inspect',id,'--format','{{if .State.Health}}{{.State.Health.Status}}{{end}}'])==='healthy'){healthy=true;break;}await sleep(100);}assert.equal(healthy,true);
    const [actualId,imageId,containerStartedAt,ownerSeen,network]=docker(['inspect',id,'--format','{{json .Id}}\t{{json .Image}}\t{{json .State.StartedAt}}\t{{json (index .Config.Labels "phoenix.fixture.owner")}}\t{{json .HostConfig.NetworkMode}}']).split('\t').map(JSON.parse);
    assert.equal(actualId,id);assert.equal(ownerSeen,owner);assert.equal(network,'none');
    const facts=JSON.parse(psql(`SELECT json_build_object('databaseOid',(SELECT oid::bigint FROM pg_database WHERE datname=current_database()),'postmasterStartedAt',to_char(pg_postmaster_start_time() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'clusterSystemIdentifier',(SELECT system_identifier::text FROM pg_control_system()));`));
    const binding={containerId:id,imageId,containerStartedAt,...facts,previousFloorSha:'c'.repeat(40),targetSha:'d'.repeat(40)};
    record.binding=binding;
    const collect=(changed={},run=docker)=>collectMaintenanceDatabaseSnapshot({...binding,...changed},{guard:()=>{},run});
    await t.test('zero counts remain SNAPSHOT_ONLY and HOLD',()=>{const s=collect();assert.equal(s.observation.currentDatabaseClientSessions,0);assert.equal(s.ownershipComplete,false);assert.equal(s.result,'HOLD');results.push({case:'ZERO_IS_NOT_DRAIN',result:'PASS'});});
    const holder=spawn('/usr/bin/docker',['exec','-i',id,...fixturePsql,'--dbname=phoenix_erp'],{env,stdio:['pipe','pipe','pipe']});
    const lines=createInterface({input:holder.stdout});const waitLine=expected=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{lines.off('line',read);reject(Error('OWNED_HOLDER_TIMEOUT'));},5000);function read(line){if(line===expected){clearTimeout(timer);lines.off('line',read);resolve();}}lines.on('line',read);});
    holder.stderr.on('data',()=>{});const exited=once(holder,'exit');
    try{
      let ready=waitLine('IDLE_READY');holder.stdin.write("SET idle_in_transaction_session_timeout='10s'; SELECT 'IDLE_READY';\n");await ready;
      await t.test('a real idle backend blocks any quiescence inference',()=>{const s=collect();assert.equal(s.observation.currentDatabaseClientSessions,1);assert.ok(s.reasons.includes('DATABASE_WORK_OBSERVED'));results.push({case:'IDLE_BACKEND_PRESENT',result:'PASS'});});
      ready=waitLine('TX_READY');holder.stdin.write("BEGIN; SELECT 'TX_READY';\n");await ready;
      await t.test('real idle-in-transaction is independently counted',()=>{const s=collect();assert.equal(s.observation.clientSessionsWithOpenTransaction,1);assert.equal(s.observation.idleInTransactionSessions,1);results.push({case:'OPEN_TRANSACTION_PRESENT',result:'PASS'});});
    }finally{holder.stdin.end('ROLLBACK;\n\\q\n');try{await bounded(exited,3000);}catch(error){holder.kill('SIGTERM');try{await bounded(exited,1000);}catch{holder.kill('SIGKILL');}throw error;}finally{lines.close();}}
    await t.test('a real prepared transaction survives client exit',()=>{
      psql("BEGIN; SELECT 1; PREPARE TRANSACTION 'owned_observer_prepared';");
      try{const s=collect();assert.equal(s.observation.currentDatabaseClientSessions,0);assert.equal(s.observation.currentDatabasePreparedTransactions,1);assert.ok(s.reasons.includes('DATABASE_WORK_OBSERVED'));}
      finally{psql("ROLLBACK PREPARED 'owned_observer_prepared';");}results.push({case:'PREPARED_WITHOUT_CLIENT',result:'PASS'});
    });
    await t.test('prepared work in another database is not hidden',()=>{
      psql("BEGIN; SELECT 1; PREPARE TRANSACTION 'owned_observer_other';",'postgres');
      try{const s=collect();assert.equal(s.observation.currentDatabasePreparedTransactions,0);assert.equal(s.observation.otherDatabasePreparedTransactions,1);}
      finally{psql("ROLLBACK PREPARED 'owned_observer_other';",'postgres');}results.push({case:'OTHER_DATABASE_PREPARED',result:'PASS'});
    });
    await t.test('actual restricted statistics cannot be promoted to complete visibility',()=>{
      psql('CREATE ROLE observer_limited; GRANT EXECUTE ON FUNCTION pg_control_system() TO observer_limited;');
      const s=collect({},(args,input)=>docker(args,input?('SET ROLE observer_limited;\n'+input):input));
      assert.equal(s.observation.statsVisibilityComplete,false);assert.ok(s.reasons.includes('STATS_VISIBILITY_INCOMPLETE'));results.push({case:'RESTRICTED_STATS_ROLE',result:'PASS'});
    });
    await t.test('wrong database OID and postmaster binding fail closed',()=>{
      assert.throws(()=>collect({databaseOid:binding.databaseOid+1}),/OBSERVATION_IDENTITY_OR_COUNTS/);
      assert.throws(()=>collect({postmasterStartedAt:'2020-01-01T00:00:00.000Z'}),/OBSERVATION_IDENTITY_OR_COUNTS/);results.push({case:'DATABASE_BINDING_DRIFT',result:'PASS'});
    });
    await t.test('inherited libpq routing and parser settings cannot redirect the fixed local connection',()=>{
      const poisoned=(args,input)=>docker(args[0]==='exec'?[...args.slice(0,2),'-e','PGHOST=unapproved.invalid','-e','PGSERVICE=unapproved_service','-e','PGPORT=1','-e','PGOPTIONS=-c search_path=unapproved_schema',...args.slice(2)]:args,input);
      const s=collect({},poisoned);assert.equal(s.observation.databaseOid,binding.databaseOid);assert.equal(s.observation.clusterSystemIdentifier,binding.clusterSystemIdentifier);results.push({case:'LIBPQ_ENV_REDIRECTION_REJECTED',result:'PASS'});
    });
    await t.test('conninfo and URI database input refuse before querying any database',()=>{
      for(const value of ['host=unapproved.invalid dbname=foo','postgresql://unapproved.invalid/foo']){
        const poisoned=(args,input)=>docker(args[0]==='exec'?[...args.slice(0,2),'-e','POSTGRES_DB='+value,...args.slice(2)]:args,input);
        assert.throws(()=>collect({},poisoned),/DATABASE_READ_OR_JSON_FAILED/);
      }results.push({case:'CONNINFO_INPUT_REJECTED',result:'PASS'});
    });
    const final=collect();assert.equal(final.observation.currentDatabaseClientSessions,0);assert.equal(final.observation.currentDatabasePreparedTransactions,0);assert.equal(final.observation.otherDatabasePreparedTransactions,0);
    record.finalDatabaseCounters=final.observation;assert.equal(results.length,9);record.result='PASS';
  }catch(error){record.result='FAIL';record.failure='OWNED_DATABASE_TEST_FAILED';throw error;
  }finally{
    try{
      if(id){const seen=docker(['inspect',id,'--format','{{ index .Config.Labels "phoenix.fixture.owner" }}']);assert.equal(seen,owner);docker(['stop','--time','10',id]);assert.equal(docker(['inspect',id,'--format','{{.State.Running}}']),'false');docker(['rm','-v',id]);assert.equal(docker(['ps','-aq','--no-trunc','--filter',`label=phoenix.fixture.owner=${owner}`]),'');record.cleanup='OWNED_CONTAINER_STOPPED_REMOVED_CONFIRMED';}
    }catch(error){record.result='FAIL';record.cleanup='UNVERIFIED_REQUIRES_OWNED_FIXTURE_RECOVERY';throw error;
    }finally{
    record.sourceSha256=createHash('sha256').update(fs.readFileSync(new URL('./production-maintenance-database-observer.mjs',import.meta.url))).digest('hex');
    const out=path.join(os.tmpdir(),`phoenix-maintenance-db-observer-${owner}.json`);fs.writeFileSync(out,JSON.stringify(record,null,2)+'\n',{mode:0o600,flag:'wx'});console.log('OWNED_DATABASE_OBSERVER_RECEIPT='+out);
    }
  }
});
