/** Real independent application login and private Docker network. Only the
 * containers created in this test are touched. No host DB port is published. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import {realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {readRuntimeAccess} from './production-modern-schema-runtime-access.mjs';
import {bindModernSchemaReadSql} from './production-modern-schema-read-client.mjs';
const enabled=process.env.PHOENIX_SUCCESSOR_ACCESS_PG==='1';
const docker=(args,input)=>execFileSync('/usr/bin/docker',args,{input,encoding:'utf8',timeout:20000,stdio:['pipe','pipe','pipe']}).trim();
test('real PostgreSQL 18 role, API connection, required grants and unchanged prior control boundary',{
 skip:!enabled,timeout:90000},async t=>{
 const apiImage=process.env.PHOENIX_SUCCESSOR_TEST_API_IMAGE,revision=process.env.PHOENIX_SUCCESSOR_TEST_SOURCE;
 assert.match(apiImage,/^sha256:[a-f0-9]{64}$/);assert.match(revision,/^[a-f0-9]{40}$/);
 const root=realpathSync(fileURLToPath(new URL('../../',import.meta.url)));
 let db,api;
 t.after(()=>{
  for(const id of [api,db])if(id)docker(['stop','--timeout','3',id]);
 });
 db=docker(['run','-d','--rm','--pull=never','--network','none','--label','phoenix.test=successor-runtime-access',
  '-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:18-alpine']);
 assert.match(db,/^[a-f0-9]{64}$/);
 for(let i=0;;i++){try{docker(['exec',db,'psql','-h','127.0.0.1','-U','postgres','-qAtc','SELECT 1']);break;}catch(error){if(i===60)throw error;await pause(500);}}
 const sql=stmt=>docker(['exec','-i',db,'psql','-U','postgres','-X','-qAt','-v','ON_ERROR_STOP=1'],stmt);
 sql(`CREATE ROLE fixture_api LOGIN;
 CREATE TABLE production_cutover_control_environments(environment_id text,generation integer,api_roles name[],api_role_oids oid[],
 database_name name,database_oid oid,schema_oid oid,cluster_identifier text);
 CREATE TABLE production_cutover_apply_admissions(i int);CREATE TABLE production_cutover_apply_results(i int);`);
 for(const signature of ['consume_production_cutover_admission(uuid,text)','record_production_cutover_apply_result(uuid)','lock_production_cutover_authority(uuid)']){
  sql('CREATE FUNCTION '+signature+" RETURNS integer LANGUAGE sql AS 'SELECT 1';REVOKE ALL ON FUNCTION "+signature+' FROM PUBLIC;');
 }
 const observer={query:async(stmt,params)=>({rows:JSON.parse(sql("SELECT coalesce(json_agg(f),'[]') FROM ("+bindModernSchemaReadSql(stmt,params)+') f'))})};
 const script=`const c=new(require('pg').Client)({host:'127.0.0.1',user:'fixture_api',database:'postgres',application_name:'fixture-control'});
 c.connect().then(()=>c.query("SELECT pg_backend_pid() AS pid,date_trunc('milliseconds',backend_start) AS started FROM pg_stat_activity WHERE pid=pg_backend_pid()"))
 .then(r=>{console.log(JSON.stringify(r.rows[0]));setInterval(()=>{},10000);}).catch(()=>process.exit(2));`;
 api=docker(['run','-d','--rm','--pull=never','--network','container:'+db,'--read-only','--cap-drop=ALL','--label','phoenix.test=successor-runtime-access',
  '-e','DB_HOST=127.0.0.1','-e','DB_PORT=5432','-e','DB_USER=fixture_api','-e','DB_NAME=postgres','--entrypoint','node',apiImage,'-e',script]);
 let heartbeatRow;
 for(let i=0;i<30;i++){const raw=docker(['logs',api]);if(raw){heartbeatRow=JSON.parse(raw);break;}await pause(250);}
 assert.ok(heartbeatRow);
 const participant={containerId:api,status:{controlSession:{sessionPid:heartbeatRow.pid,backendStartedAt:heartbeatRow.started,applicationName:'fixture-control'}}};
 const before=await readRuntimeAccess(observer,participant,revision,null,{root});
 assert.equal(before.businessAccess,'EXPANSION_NOT_INSTALLED');assert.equal(before.pilotStatus,'PILOT_NOT_READY');assert.equal(before.pilotIsolation,'PROTECTED');
 const writes=['production_inbound_reissues','production_finance_review_files','production_cutover_state_receipts'];
 for(const name of writes)sql('CREATE TABLE '+name+'(id int);GRANT SELECT,INSERT ON '+name+' TO fixture_api;');
 sql('CREATE VIEW production_cutover_state_origins AS SELECT 1 AS id;GRANT SELECT ON production_cutover_state_origins TO fixture_api;');
 const current=()=>readRuntimeAccess(observer,participant,revision,before,{root});
 assert.equal((await current()).businessAccess,'AVAILABLE');
 sql('REVOKE INSERT ON production_finance_review_files FROM fixture_api;');
 await assert.rejects(current(),/REQUIRED_BUSINESS_ACCESS_MISSING/);
 sql('GRANT INSERT ON production_finance_review_files,production_cutover_apply_results TO fixture_api;');
 await assert.rejects(current(),/EXISTING_RUNTIME_AUTHORITY_CHANGED/);
});
