import test from 'node:test';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
import {maintenanceIotStateSql,validateMaintenanceIotState,compareMaintenanceIotState} from './production-maintenance-iot-state.mjs';
const enabled=process.env.MAINTENANCE_DATABASE_PG_FIXTURE==='1';
const docker=(args,input)=>execFileSync('/usr/bin/docker',args,{input,encoding:'utf8',timeout:12000,maxBuffer:1024*1024,stdio:['pipe','pipe','pipe']}).trim();
const wait=ms=>new Promise(r=>setTimeout(r,ms));
for(const image of ['postgres:16-alpine','postgres:18-alpine'])test(`actual legacy IoT readonly state on ${image}`,{skip:!enabled,timeout:90000},async t=>{
 const owner=randomUUID(),name='phoenix-iot-state-'+owner;let id;
 const sql=s=>docker(['exec','-i',id,'psql','-U','fixture_owner','-d','phoenix_erp','-X','-qAt','-v','ON_ERROR_STOP=1'],s);
 const collect=baseline=>validateMaintenanceIotState(JSON.parse(sql(maintenanceIotStateSql(baseline))),baseline);
 try{
  id=docker(['run','--detach','--name',name,'--label','phoenix.fixture.owner='+owner,'--network','none','--tmpfs',(image.includes(':18')?'/var/lib/postgresql':'/var/lib/postgresql/data')+':rw,nosuid,noexec,size=256m','-e','POSTGRES_USER=fixture_owner','-e','POSTGRES_DB=phoenix_erp','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','PGDATA=/var/lib/postgresql/data',image]);
  let ready=false;for(let i=0;i<200;i++){try{sql('SELECT 1;');ready=true;break;}catch{}await wait(100);}assert.equal(ready,true);
  sql(`CREATE TABLE mon_device_realtime_snapshot(id bigint,erp_house_code text,property_code text,value numeric,is_alarm boolean,collect_time bigint);
CREATE TABLE mon_device_property_dict(property_code text);
CREATE TABLE mon_device_property_history(id bigserial,erp_house_code text,property_code text,collect_time bigint,log_date date);
CREATE INDEX idx_mon_history_search ON mon_device_property_history(erp_house_code,property_code,log_date);
CREATE TABLE mon_device_alert_event(id bigint,erp_house_code text,property_code text,status text,property_name text,current_val numeric,created_at timestamptz);
CREATE TABLE sys_alerts(id bigint,alert_type text,title text,related_path text,resolved boolean,detail jsonb,created_at timestamptz);
INSERT INTO mon_device_property_dict VALUES ('temp');
INSERT INTO mon_device_realtime_snapshot VALUES (1,'H1','temp',22,false,7200001);
INSERT INTO mon_device_property_history(erp_house_code,property_code,collect_time,log_date) VALUES ('H1','temp',7200009,'1970-01-01');`);
  let pre;
  await t.test('actual SQL tolerates legacy missing alert_no and preserves hour semantics',()=>{pre=collect();assert.equal(pre.snapshots[0].historyHourExists,true);assert.equal(pre.deviceAlerts.length,0);assert.match(pre.lowerXid,/^\d+$/);});
  await t.test('new committed backfill from PRE xmin is observed and validated',()=>{sql("INSERT INTO mon_device_property_history(erp_house_code,property_code,collect_time,log_date) VALUES ('H2','temp',10800001,'1970-01-01');");const post=collect(pre);assert.equal(post.historyWrites.length,1);assert.equal(compareMaintenanceIotState(pre,post).status,'OBSERVED_CONSISTENT');});
  await t.test('source partial snapshot write without history causes HOLD',()=>{sql("INSERT INTO mon_device_realtime_snapshot VALUES (2,'H3','temp',23,false,14400001);");assert.equal(compareMaintenanceIotState(pre,collect(pre)).status,'HOLD');});
  await t.test('read did not repair incomplete state or add business rows',()=>{const before=sql('SELECT count(*) FROM mon_device_property_history;');collect(pre);assert.equal(sql('SELECT count(*) FROM mon_device_property_history;'),before);});
 }finally{if(id){assert.equal(docker(['inspect',id,'--format','{{index .Config.Labels "phoenix.fixture.owner"}}']),owner);docker(['stop','--time','10',id]);docker(['rm','-v',id]);}}
});
