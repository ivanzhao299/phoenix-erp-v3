/** Real owned PG16/18 sources. This is a query test, never full factory PASS. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {collectMaintenanceDomainObservation,DOMAIN_OBSERVATION_SQL} from './production-maintenance-domain-observer.mjs';
const enabled=process.env.MAINTENANCE_DATABASE_PG_FIXTURE==='1';
const env={PATH:'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',DOCKER_HOST:'unix:///var/run/docker.sock'};
const docker=(args,input)=>execFileSync('/usr/bin/docker',args,{env,input,encoding:'utf8',timeout:12000,maxBuffer:262144,stdio:['pipe','pipe','pipe']}).trim();
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const fixtureSql=`
CREATE TABLE sys_notification_log(channel text,status text);
CREATE TABLE mon_house_device_mapping(status text,vendor_house_id bigint);
CREATE TABLE mon_device_realtime_snapshot(erp_house_code text,property_code text,collect_time bigint,is_alarm boolean);
CREATE TABLE mon_device_property_history(erp_house_code text,property_code text,collect_time bigint,log_date date);
CREATE INDEX idx_mon_history_search ON mon_device_property_history(erp_house_code,property_code,log_date);
CREATE TABLE mon_device_alert_event(erp_house_code text,property_code text,status text);
CREATE TABLE sys_chanjet_state(key text,app_ticket text,certificate text,tokens jsonb,updated_at timestamptz);
CREATE TABLE sys_chanjet_api_budget(budget_key text,request_count integer,updated_at timestamptz);
CREATE TABLE chanjet_sync_jobs(status text,request_scope jsonb);
CREATE TABLE chanjet_execution_admissions(phase text);
CREATE TABLE chanjet_execution_requests(kind text,status text,result text);
`;
for(const image of ['postgres:16-alpine','postgres:18-alpine'])test(`five-domain fixed readonly observations on ${image}`,{skip:!enabled,timeout:90000},async t=>{
 const owner=randomUUID(),name='phoenix-maintenance-domains-'+owner;let id;
 const psql=sql=>docker(['exec','-i',id,'psql','--username=fixture_owner','--dbname=phoenix_erp','-X','-qAt','--set=ON_ERROR_STOP=1'],sql);
 try{
  id=docker(['run','--detach','--name',name,'--label','phoenix.fixture.owner='+owner,'--network','none','--tmpfs',(image.includes(':18')?'/var/lib/postgresql':'/var/lib/postgresql/data')+':rw,nosuid,noexec,size=256m','-e','POSTGRES_USER=fixture_owner','-e','POSTGRES_DB=phoenix_erp','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','PGDATA=/var/lib/postgresql/data','--health-cmd','pg_isready -U fixture_owner -d phoenix_erp','--health-interval','1s','--health-timeout','2s','--health-retries','60',image]);
  let ready=false;for(let n=0;n<300;n++){if(docker(['inspect',id,'--format','{{.State.Health.Status}}'])==='healthy'&&docker(['exec',id,'cat','/proc/1/comm'])==='postgres'){ready=true;break;}await wait(100);}assert.equal(ready,true);
  const [containerId,imageId,containerStartedAt]=docker(['inspect',id,'--format','{{json .Id}}\t{{json .Image}}\t{{json .State.StartedAt}}']).split('\t').map(JSON.parse);
  const identity=JSON.parse(psql("SELECT json_build_object('databaseOid',(SELECT oid::bigint FROM pg_database WHERE datname=current_database()),'clusterSystemIdentifier',(SELECT system_identifier::text FROM pg_control_system()));"));
  const binding={containerId,imageId,containerStartedAt,...identity,oldApiContainerId:'a'.repeat(64),previousFloorSha:'b'.repeat(40),targetSha:'c'.repeat(40)};
  const collect=()=>collectMaintenanceDomainObservation(binding,{guard:()=>{},run:docker});
  await t.test('absent schema is HOLD instead of zero work',()=>assert.throws(collect,/READ_SCHEMA_OR_JSON_FAILED/));
  psql(fixtureSql);
  await t.test('all local zeroes retain untracked auth UNKNOWN and no admission',()=>{
   const value=collect();assert.equal(value.result,'OBSERVATION_ONLY');assert.equal(value.remoteAuthenticationOutcome,'UNKNOWN');assert.equal(value.externalDeliveryReconciled,false);assert.equal(value.admissionOrApprovalGranted,false);assert.equal(value.observation.persistent.queuedJobs,0);
  });
  psql(`INSERT INTO sys_chanjet_state VALUES ('singleton','fixture-secret-ticket','fixture-secret-certificate','{"secret-org":{"openToken":"fixture-secret-token"}}',now());
INSERT INTO sys_chanjet_api_budget VALUES ('D:2026-10-19',7,now());
INSERT INTO mon_house_device_mapping VALUES ('ACTIVE',12);
INSERT INTO mon_device_realtime_snapshot VALUES ('house1','temperature',7200001,true);
INSERT INTO mon_device_property_history VALUES ('house1','temperature',7200009,'1970-01-01');
INSERT INTO chanjet_sync_jobs VALUES ('RUNNING','{"lifecycleState":"QUEUED","secret":"fixture-scope-secret"}');
INSERT INTO chanjet_execution_admissions VALUES ('SYNCING');
INSERT INTO chanjet_execution_requests VALUES ('TOKEN','RESERVED','UNSET');
INSERT INTO sys_notification_log VALUES ('PUSH','SENT');`);
  await t.test('pending jobs, reserved requests and incomplete alarm chain remain visible',()=>{
   const value=collect(),facts=value.observation;assert.equal(facts.persistent.queuedJobs,1);assert.equal(facts.persistent.activeAdmissions,1);assert.equal(facts.persistent.reservedRequests,1);assert.equal(facts.iot.activeMappings,1);assert.equal(facts.iot.missingDateConsistentHistoryHour,0);assert.equal(facts.iot.alarmWithoutOpenEvent,1);
   assert.deepEqual(facts.authState.map(s=>[s.ticketPresent,s.certificatePresent,s.tokenObjectCount]),[[true,true,1]]);
   assert.equal(/fixture-secret|fixture-scope-secret|secret-org/.test(JSON.stringify(value)),false);
  });
  await t.test('history matching uses the real hour bucket, not exact sample time',()=>{
   psql("INSERT INTO mon_device_alert_event VALUES ('house1','temperature','OPEN'); INSERT INTO mon_device_realtime_snapshot VALUES ('house2','temperature',10800001,false);");
   const facts=collect().observation;assert.equal(facts.iot.alarmWithoutOpenEvent,0);assert.equal(facts.iot.missingDateConsistentHistoryHour,1);
  });
  await t.test('collection did not mutate business or credential state',()=>{
   const before=psql('SELECT md5(row_to_json(s)::text) FROM sys_chanjet_state s;');collect();assert.equal(psql('SELECT md5(row_to_json(s)::text) FROM sys_chanjet_state s;'),before);
  });
  await t.test('registered and probed durable admissions remain pending',()=>{
   psql("INSERT INTO chanjet_execution_admissions VALUES ('REGISTERED'),('PROBED'),('HOLD'),('VERIFIED');");
   assert.equal(collect().observation.persistent.activeAdmissions,3);
  });
  await t.test('real history search uses the existing house/property/day index at scale',()=>{
   psql("INSERT INTO mon_device_property_history SELECT 'house1','temperature',1767225600000+g::bigint*60000,date '2026-01-01'+(g/1440)::int FROM generate_series(1,150000) g; ANALYZE mon_device_property_history; ANALYZE mon_device_realtime_snapshot;");
   const query=DOMAIN_OBSERVATION_SQL.slice(DOMAIN_OBSERVATION_SQL.indexOf('SELECT json_build_object('),DOMAIN_OBSERVATION_SQL.lastIndexOf('ROLLBACK;'));
   const plan=JSON.parse(psql('EXPLAIN (FORMAT JSON) '+query));
   assert.match(JSON.stringify(plan),/idx_mon_history_search/);
   const value=collect();assert.equal(value.observation.iot.missingDateConsistentHistoryHour,1);
  });
  await t.test('wrong cluster identity fails closed',()=>assert.throws(()=>collectMaintenanceDomainObservation({...binding,clusterSystemIdentifier:'1'},{guard:()=>{},run:docker}),/IDENTITY_TIME_OR_FIELDS/));
 }finally{
  if(id){assert.equal(docker(['inspect',id,'--format','{{index .Config.Labels "phoenix.fixture.owner"}}']),owner);docker(['stop','--time','10',id]);docker(['rm','-v',id]);}
 }
});
