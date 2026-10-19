/** Fixed five-domain local observations for the ONE maintenance factory.
 * These observations never assert external delivery, ownership or drain. In
 * particular the old untracked Chanjet authentication lineage stays UNKNOWN.
 * No caller SQL, table, database, credential, command or approval is accepted. */
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {CONTRACT,verifyContext} from './production-config-guard.mjs';
import {executionEnv} from './capture-production-runtime.mjs';
import {DATABASE_OBSERVATION_PSQL} from './production-maintenance-database-observer.mjs';
import {HASH,SHA,IMAGE,runtimeTimestamp,same,iso,canonicalDigest} from './production-maintenance-receipts.mjs';

const fail=code=>{throw Error('MAINTENANCE_DOMAIN_HOLD='+code);};
const TABLES=Object.freeze({
 sys_notification_log:['channel','status'],
 mon_house_device_mapping:['status','vendor_house_id'],
 mon_device_realtime_snapshot:['erp_house_code','property_code','collect_time','is_alarm'],
 mon_device_property_history:['erp_house_code','property_code','collect_time','log_date'],
 mon_device_alert_event:['erp_house_code','property_code','status'],
 sys_chanjet_state:['key','app_ticket','certificate','tokens','updated_at'],
 sys_chanjet_api_budget:['budget_key','request_count','updated_at'],
 chanjet_sync_jobs:['status','request_scope'],
 chanjet_execution_admissions:['phase'],
 chanjet_execution_requests:['kind','status','result'],
});
const schemaValues=Object.entries(TABLES).flatMap(([table,columns])=>columns.map(column=>`('${table}','${column}')`)).join(',');
// Compile the schema checks into SQL. All identifiers below are literals and
// all data are aggregate/nonsecret. Missing tables/columns cause rollback and
// HOLD before any counter is interpreted; absence is never interpreted as zero.
export const DOMAIN_OBSERVATION_SQL=`BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
SET LOCAL statement_timeout='3s';
SET LOCAL lock_timeout='1s';
SET LOCAL idle_in_transaction_session_timeout='5s';
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM (VALUES ${schemaValues}) AS required(t,c)
 WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
 WHERE n.nspname='public' AND c.relname=required.t AND c.relkind IN ('r','p')
 AND a.attname=required.c AND a.attnum>0 AND NOT a.attisdropped))
 THEN RAISE EXCEPTION 'MAINTENANCE_DOMAIN_SCHEMA_MISSING'; END IF;
END $$;
SELECT json_build_object(
 'sampledAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 'databaseOid',(SELECT oid::bigint FROM pg_catalog.pg_database WHERE datname=current_database()),
 'clusterSystemIdentifier',(SELECT system_identifier::text FROM pg_catalog.pg_control_system()),
 'notifications',(SELECT coalesce(json_agg(row_to_json(g) ORDER BY g.channel,g.status),'[]'::json) FROM
  (SELECT channel::text,status::text,count(*)::integer AS count FROM public.sys_notification_log GROUP BY channel,status) g),
 'iot',json_build_object(
  'activeMappings',(SELECT count(*)::integer FROM public.mon_house_device_mapping WHERE status='ACTIVE' AND vendor_house_id IS NOT NULL),
  'snapshots',(SELECT count(*)::integer FROM public.mon_device_realtime_snapshot),
  'missingDateConsistentHistoryHour',(SELECT count(*)::integer FROM public.mon_device_realtime_snapshot s WHERE
   (SELECT true FROM public.mon_device_property_history h WHERE h.erp_house_code=s.erp_house_code AND h.property_code=s.property_code
    AND h.log_date=(to_timestamp(s.collect_time::double precision/1000.0) AT TIME ZONE 'UTC')::date
    AND h.collect_time/3600000=s.collect_time/3600000 LIMIT 1) IS DISTINCT FROM true),
  'alarmWithoutOpenEvent',(SELECT count(*)::integer FROM public.mon_device_realtime_snapshot s WHERE s.is_alarm::text IN ('true','1') AND NOT EXISTS
   (SELECT 1 FROM public.mon_device_alert_event a WHERE a.erp_house_code=s.erp_house_code AND a.property_code=s.property_code AND a.status='OPEN'))),
 'authState',(SELECT coalesce(json_agg(json_build_object('singleton',key='singleton','ticketPresent',app_ticket IS NOT NULL AND app_ticket<>'',
  'certificatePresent',certificate IS NOT NULL AND certificate<>'','tokenObjectCount',CASE WHEN jsonb_typeof(tokens)='object' THEN (SELECT count(*) FROM jsonb_object_keys(tokens)) ELSE 0 END,
  'updatedAt',to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) ORDER BY key),'[]'::json) FROM public.sys_chanjet_state),
 'budgets',(SELECT coalesce(json_agg(json_build_object('kind',split_part(budget_key,':',1),'count',request_count,
  'updatedAt',to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) ORDER BY budget_key),'[]'::json) FROM public.sys_chanjet_api_budget),
 'persistent',json_build_object(
  'runningJobs',(SELECT count(*)::integer FROM public.chanjet_sync_jobs WHERE status='RUNNING' AND coalesce(request_scope->>'lifecycleState','')<>'QUEUED'),
  'queuedJobs',(SELECT count(*)::integer FROM public.chanjet_sync_jobs WHERE status='RUNNING' AND request_scope->>'lifecycleState'='QUEUED'),
  'activeAdmissions',(SELECT count(*)::integer FROM public.chanjet_execution_admissions WHERE phase NOT IN ('VERIFIED','HOLD')),
  'reservedRequests',(SELECT count(*)::integer FROM public.chanjet_execution_requests WHERE status='RESERVED' OR result='UNSET')),
 'requests',(SELECT coalesce(json_agg(row_to_json(g) ORDER BY g.kind,g.status,g.result),'[]'::json) FROM
  (SELECT kind::text,status::text,result::text,count(*)::integer AS count FROM public.chanjet_execution_requests GROUP BY kind,status,result) g)
);
ROLLBACK;
`;
export const DOMAIN_OBSERVATION_SQL_SHA256=createHash('sha256').update(DOMAIN_OBSERVATION_SQL).digest('hex');
const inspect='{{json .Id}}\t{{json .Image}}\t{{json .State.StartedAt}}\t{{json .State.Running}}\t{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}}';
const count=value=>Number.isSafeInteger(value)&&value>=0;
const exact=(value,keys)=>value&&Object.getPrototypeOf(value)===Object.prototype&&same(Object.keys(value).sort(),[...keys].sort());
function validateBinding(value){
 if(!exact(value,['containerId','imageId','containerStartedAt','databaseOid','clusterSystemIdentifier','oldApiContainerId','previousFloorSha','targetSha'])
  ||!HASH.test(value.containerId)||!IMAGE.test(value.imageId)||!runtimeTimestamp(value.containerStartedAt)||!count(value.databaseOid)||value.databaseOid===0
  ||!/^[1-9][0-9]{0,19}$/.test(value.clusterSystemIdentifier)||!HASH.test(value.oldApiContainerId)||![value.previousFloorSha,value.targetSha].every(v=>SHA.test(v)))fail('EXACT_BINDING_REQUIRED');
}
export function validateDomainObservation(value,binding,startedAt,finishedAt){
 validateBinding(binding);
 if(!exact(value,['sampledAt','databaseOid','clusterSystemIdentifier','notifications','iot','authState','budgets','persistent','requests'])
  ||!iso(value.sampledAt)||!iso(startedAt)||!iso(finishedAt)||Date.parse(finishedAt)<Date.parse(startedAt)||Date.parse(finishedAt)-Date.parse(startedAt)>10000
  ||Date.parse(value.sampledAt)<Date.parse(startedAt)-30000||Date.parse(value.sampledAt)>Date.parse(finishedAt)+30000
  ||value.databaseOid!==binding.databaseOid||value.clusterSystemIdentifier!==binding.clusterSystemIdentifier)fail('IDENTITY_TIME_OR_FIELDS');
 for(const [key,fields] of [['notifications',['channel','status','count']],['requests',['kind','status','result','count']]]){
  if(!Array.isArray(value[key])||value[key].length>1024||value[key].some(v=>!exact(v,fields)||!count(v.count)||fields.filter(k=>k!=='count').some(k=>typeof v[k]!=='string'||v[k].length>64)))fail('COUNTER_ROWS');
 }
 for(const [key,fields] of [['iot',['activeMappings','snapshots','missingDateConsistentHistoryHour','alarmWithoutOpenEvent']],['persistent',['runningJobs','queuedJobs','activeAdmissions','reservedRequests']]]){
  if(!exact(value[key],fields)||fields.some(k=>!count(value[key][k])))fail('LOCAL_COUNTERS');
 }
 if(!Array.isArray(value.authState)||value.authState.length>1||value.authState.some(v=>!exact(v,['singleton','ticketPresent','certificatePresent','tokenObjectCount','updatedAt'])
  ||v.singleton!==true||typeof v.ticketPresent!=='boolean'||typeof v.certificatePresent!=='boolean'||!count(v.tokenObjectCount)||!iso(v.updatedAt)))fail('AUTH_STATE_SHAPE');
 if(!Array.isArray(value.budgets)||value.budgets.length>4096||value.budgets.some(v=>!exact(v,['kind','count','updatedAt'])||!['M','D','R','W'].includes(v.kind)||!count(v.count)||!iso(v.updatedAt)))fail('BUDGET_SHAPE');
 return {schema:'phoenix.maintenance-domain-observation/v1',binding:structuredClone(binding),querySha256:DOMAIN_OBSERVATION_SQL_SHA256,
  startedAt,finishedAt,observation:structuredClone(value),observationSha256:canonicalDigest(value),result:'OBSERVATION_ONLY',
  remoteAuthenticationOutcome:'UNKNOWN',untrackedAuthenticationObject:`api/${binding.oldApiContainerId}/chanjet-auth-lineage`,
  externalDeliveryReconciled:false,deviceSideReconciled:false,databaseOwnershipComplete:false,
  disposition:'UNVERIFIED',registryInstalled:false,productionMutation:false,admissionOrApprovalGranted:false};
}
function productionRun(args,input){try{return execFileSync('/usr/bin/docker',args,{input,env:executionEnv(),encoding:'utf8',timeout:10000,maxBuffer:262144,stdio:['pipe','pipe','pipe']}).trim();}catch{fail('BOUNDED_READ_FAILED');}}
export function collectMaintenanceDomainObservation(binding,dependencies={}){
 validateBinding(binding);const guard=dependencies.guard||(()=>verifyContext(CONTRACT.repository,CONTRACT.stateDirectory)),run=dependencies.run||productionRun,now=dependencies.now||(()=>new Date().toISOString());
 const expected=[binding.containerId,binding.imageId,binding.containerStartedAt,true,'healthy'];
 const pin=()=>{let value;try{value=run(['inspect',binding.containerId,'--format',inspect]).split('\t').map(JSON.parse);}catch{fail('RUNTIME_READ');}if(!same(value,expected))fail('DATABASE_RUNTIME_DRIFT');};
 guard();pin();const startedAt=now();let value;
 try{const raw=run(['exec','-i',binding.containerId,'/bin/sh','-c',DATABASE_OBSERVATION_PSQL],DOMAIN_OBSERVATION_SQL);if(Buffer.byteLength(raw)>131072)fail('OBSERVATION_SIZE');value=JSON.parse(raw);}catch{fail('READ_SCHEMA_OR_JSON_FAILED');}
 const finishedAt=now();guard();pin();return validateDomainObservation(value,binding,startedAt,finishedAt);
}
