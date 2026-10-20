/** Local committed-write reconciliation for the legacy read-only IoT importer.
 * It does not attest scheduler completion, vendor read coverage or delivery.
 * xmin bounds include transactions already active at PRE; no wall-clock-only
 * filter can silently omit their later commits. XID epoch wrap refuses release. */
import {execFileSync} from 'node:child_process';
import {CONTRACT,verifyContext} from './production-config-guard.mjs';
import {executionEnv} from './capture-production-runtime.mjs';
import {DATABASE_OBSERVATION_PSQL} from './production-maintenance-database-observer.mjs';
import {canonicalDigest,same,hold,iso} from './production-maintenance-receipts.mjs';

const maxXid=4294967295n,limit=4096;
const xid=value=>typeof value==='string'&&/^[1-9][0-9]{0,19}$/.test(value)&&BigInt(value)<=maxXid;
const literal=value=>"'"+value.replaceAll("'","''")+"'";
export function maintenanceIotStateSql(baseline=null){
  if(baseline&&(!xid(baseline.lowerXid)||!iso(baseline.sampledAt)))hold('IOT_PRE_BASELINE_BINDING');
  const lower=baseline?baseline.lowerXid:'(SELECT lower_xid FROM boundary)',cutoff=baseline?literal(baseline.sampledAt)+'::timestamptz':"CURRENT_TIMESTAMP";
  return `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path=pg_catalog;
SET LOCAL statement_timeout='3s'; SET LOCAL lock_timeout='1s';
WITH boundary AS MATERIALIZED (SELECT pg_catalog.pg_snapshot_xmin(pg_catalog.pg_current_snapshot())::text::bigint AS lower_xid,
 pg_catalog.pg_snapshot_xmax(pg_catalog.pg_current_snapshot())::text::bigint AS upper_xid),
 snapshots AS MATERIALIZED (SELECT * FROM public.mon_device_realtime_snapshot ORDER BY erp_house_code,property_code LIMIT ${limit+1}),
 alerts AS MATERIALIZED (SELECT * FROM public.mon_device_alert_event ORDER BY id LIMIT ${limit+1}),
 dict AS MATERIALIZED (SELECT * FROM public.mon_device_property_dict ORDER BY property_code LIMIT ${limit+1}),
 history_writes AS MATERIALIZED (SELECT id::text AS id,erp_house_code AS house,property_code AS property,collect_time::text AS collect_ms,log_date::text AS log_date
 FROM public.mon_device_property_history WHERE xmin::text::bigint>=${lower} ORDER BY id LIMIT ${limit+1}),
 system_alerts AS MATERIALIZED (SELECT * FROM public.sys_alerts WHERE alert_type='IOT_DEVICE_ALERT'
 AND (created_at>=${cutoff}-INTERVAL '10 minutes' OR xmin::text::bigint>=${lower}) ORDER BY id LIMIT ${limit+1})
SELECT json_build_object(
 'sampledAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 'lowerXid',${lower}::text,'upperXid',(SELECT upper_xid::text FROM boundary),
 'snapshots',(SELECT coalesce(json_agg(json_build_object('id',s.id::text,'house',s.erp_house_code,'property',s.property_code,
  'value',s.value::text,'alarm',s.is_alarm::text IN ('1','true'),'collectMs',s.collect_time::text,
  'rowSha',md5(to_jsonb(s)::text),'dictionaryExists',EXISTS(SELECT 1 FROM public.mon_device_property_dict d WHERE d.property_code=s.property_code),
  'historyHourExists',EXISTS(SELECT 1 FROM public.mon_device_property_history h WHERE h.erp_house_code=s.erp_house_code AND h.property_code=s.property_code
   AND s.collect_time>=0 AND h.log_date=(to_timestamp(s.collect_time::double precision/1000.0) AT TIME ZONE 'UTC')::date
   AND h.collect_time>=(s.collect_time/3600000)*3600000 AND h.collect_time<((s.collect_time/3600000)+1)*3600000)
 ) ORDER BY s.erp_house_code,s.property_code),'[]'::json) FROM snapshots s),
 'deviceAlerts',(SELECT coalesce(json_agg(json_build_object('id',a.id::text,'house',a.erp_house_code,'property',a.property_code,
  'status',a.status,'propertyName',a.property_name,'currentValue',a.current_val::text,'alertNo',to_jsonb(a)->>'alert_no',
  'createdAt',to_char(a.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'rowSha',md5(to_jsonb(a)::text)) ORDER BY a.id),'[]'::json) FROM alerts a),
 'dictionary',(SELECT coalesce(json_agg(json_build_object('property',d.property_code,'rowSha',md5(to_jsonb(d)::text)) ORDER BY d.property_code),'[]'::json) FROM dict d),
 'historyWrites',(SELECT coalesce(json_agg(row_to_json(h) ORDER BY h.id),'[]'::json) FROM history_writes h),
 'systemAlerts',(SELECT coalesce(json_agg(json_build_object('id',a.id::text,'type',a.alert_type,'title',a.title,'path',a.related_path,
  'resolved',a.resolved,'alertNo',a.detail->>'alertNo','house',a.detail->>'houseCode','property',a.detail->>'propertyCode',
  'createdAt',to_char(a.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'rowSha',md5(to_jsonb(a)::text)) ORDER BY a.id),'[]'::json) FROM system_alerts a)
);
ROLLBACK;
`;
}
export function validateMaintenanceIotState(value,baseline=null){
  if(!value||!iso(value.sampledAt)||!xid(value.lowerXid)||!xid(value.upperXid)||BigInt(value.upperXid)<BigInt(value.lowerXid)
    ||baseline&&value.lowerXid!==baseline.lowerXid)hold('IOT_OBSERVATION_XID_OR_TIME');
  for(const key of ['snapshots','deviceAlerts','dictionary','historyWrites','systemAlerts']){
    if(!Array.isArray(value[key])||value[key].length>limit)hold('IOT_LOCAL_WRITE_COVERAGE_TRUNCATED');
    const identity=key==='dictionary'?'property':'id';
    if(value[key].some(row=>!row||typeof row[identity]!=='string'||!row[identity])||new Set(value[key].map(row=>row[identity])).size!==value[key].length)hold('IOT_OBSERVATION_DUPLICATE_OR_MISSING_KEY');
  }
  if(value.snapshots.some(row=>typeof row.house!=='string'||typeof row.property!=='string'||typeof row.alarm!=='boolean'
    ||typeof row.dictionaryExists!=='boolean'||typeof row.historyHourExists!=='boolean'||!/^\d{1,16}$/.test(row.collectMs||'')))hold('IOT_SNAPSHOT_FIELDS');
  if(value.deviceAlerts.some(row=>!['OPEN','CLOSED','CONFIRMED'].includes(row.status)||!iso(row.createdAt)))hold('IOT_ALERT_FIELDS');
  if(value.systemAlerts.some(row=>typeof row.resolved!=='boolean'||!iso(row.createdAt)))hold('IOT_SYSTEM_ALERT_FIELDS');
  return value;
}
const key=row=>JSON.stringify([row.house,row.property]);
export function compareMaintenanceIotState(pre,post){
  validateMaintenanceIotState(pre);validateMaintenanceIotState(post,pre);
  const before=new Map(pre.snapshots.map(row=>[key(row),row])),after=new Map(post.snapshots.map(row=>[key(row),row]));
  const changed=new Set([...before.keys(),...after.keys()].filter(k=>!same(before.get(k)||null,after.get(k)||null)));
  const alertBefore=new Map(pre.deviceAlerts.map(row=>[row.id,row]));
  for(const row of post.deviceAlerts)if(!same(alertBefore.get(row.id)||null,row))changed.add(key(row));
  for(const row of pre.deviceAlerts)if(!post.deviceAlerts.some(item=>item.id===row.id))changed.add(key(row));
  const findings=state=>{
    const result=[];
    for(const row of state.snapshots){
      const k=key(row),open=state.deviceAlerts.filter(a=>key(a)===k&&a.status==='OPEN');
      if(!row.dictionaryExists)result.push({key:k,code:'DICTIONARY_MISSING'});
      if(!row.historyHourExists)result.push({key:k,code:'HISTORY_HOUR_UNPROVEN'});
      if(row.alarm&&open.length!==1)result.push({key:k,code:'ALARM_OPEN_EVENT_COUNT',count:open.length});
      if(!row.alarm&&open.length)result.push({key:k,code:'NORMAL_VALUE_HAS_OPEN_EVENT',count:open.length});
      if(open.length===1&&row.alarm&&Number(open[0].currentValue)!==Number(row.value))result.push({key:k,code:'ALARM_CURRENT_VALUE_MISMATCH'});
    }
    return result;
  };
  const baselineFindings=findings(pre),postFindings=findings(post);
  const windowFindings=postFindings.filter(row=>changed.has(row.key)||!baselineFindings.some(old=>same(old,row)));
  for(const k of before.keys())if(!after.has(k))windowFindings.push({key:k,code:'SNAPSHOT_DELETED'});
  for(const row of post.deviceAlerts.filter(row=>!alertBefore.has(row.id))){
    const title=`设备预警：${row.house} ${row.propertyName||row.property}`,related=`/breeding/device-alerts?house=${encodeURIComponent(row.house)}`;
    const exact=post.systemAlerts.find(item=>row.alertNo&&item.alertNo===row.alertNo&&item.type==='IOT_DEVICE_ALERT'
      &&item.house===row.house&&item.property===row.property&&item.title===title&&item.path===related);
    const equivalent=post.systemAlerts.find(item=>item.type==='IOT_DEVICE_ALERT'&&item.title===title&&item.path===related&&!item.resolved
      &&Date.parse(item.createdAt)<=Date.parse(row.createdAt)&&Date.parse(row.createdAt)-Date.parse(item.createdAt)<600000);
    if(!exact&&!equivalent)windowFindings.push({key:key(row),code:'SYSTEM_ALERT_STATE_UNPROVEN',deviceAlertId:row.id});
  }
  // Deletions/updates in append-only histories or source-created system alerts
  // are not treated as success. The source collector's complete bounded sets
  // include every row whose transaction could commit after PRE.
  for(const row of pre.deviceAlerts)if(!post.deviceAlerts.some(item=>item.id===row.id))windowFindings.push({key:key(row),code:'DEVICE_ALERT_DELETED'});
  for(const table of ['historyWrites','dictionary']){
    const id=table==='dictionary'?'property':'id',next=new Map(post[table].map(row=>[row[id],row]));
    for(const row of pre[table]){
      if(!next.has(row[id]))windowFindings.push({key:row[id],code:table+'_ROW_DISAPPEARED'});
      else if(!same(row,next.get(row[id])))windowFindings.push({key:row[id],code:table+'_UNSUPPORTED_UPDATE'});
    }
  }
  const dict=new Set(post.dictionary.map(row=>row.property));
  for(const row of post.historyWrites){
    const date=new Date(Number(row.collect_ms));
    if(typeof row.house!=='string'||!row.house||typeof row.property!=='string'||!dict.has(row.property)
      ||!/^\d{1,16}$/.test(row.collect_ms||'')||!Number.isSafeInteger(Number(row.collect_ms))
      ||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==row.log_date)windowFindings.push({key:row.id,code:'HISTORY_LOCAL_INVARIANT'});
  }
  return {schema:'phoenix.maintenance-iot-local-write-comparison/v1',scope:'STOPPED_LOCAL_WRITE_STATE',
    status:windowFindings.length?'HOLD':'OBSERVED_CONSISTENT',localWriteCoverage:'BOUNDED_APPEND_UPSERT_IMPORTER_STATE',arbitraryHistoricalDeletes:'NOT_PROVEN_REQUIRES_EXCLUSIVE_WRITER' ,
    beforeSha256:canonicalDigest(pre),afterSha256:canonicalDigest(post),changedKeys:[...changed].sort(),baselineFindings,windowFindings,
    schedulerCompletion:'UNVERIFIED',vendorReadCoverage:'UNVERIFIED',nextHouseProgress:'UNVERIFIED',originalAlertInvocation:'UNVERIFIED',
    replayExecuted:false,repairExecuted:false};
}
export function collectMaintenanceIotState(context,baseline=null,dependencies={}){
  const guard=dependencies.guard||(()=>verifyContext(CONTRACT.repository,CONTRACT.stateDirectory));
  const run=dependencies.run||((args,input)=>{
    try{return execFileSync('/usr/bin/docker',args,{input,env:executionEnv(),encoding:'utf8',timeout:10000,maxBuffer:1024*1024,stdio:['pipe','pipe','pipe']}).trim();}
    catch{hold('IOT_BOUNDED_LOCAL_STATE_READ_FAILED');}
  });
  const db=context.preSnapshot.db,format='{{json .Id}}\t{{json .Image}}\t{{json .State.StartedAt}}\t{{json .State.Running}}\t{{if .State.Health}}{{json .State.Health.Status}}{{end}}';
  const verify=()=>{const actual=run(['inspect',db.id,'--format',format]).split('\t').map(JSON.parse);
    if(!same(actual,[db.id,db.imageId,db.startedAt,true,'healthy']))hold('IOT_DATABASE_INCARNATION_CHANGED');};
  guard();verify();let value;
  try{value=JSON.parse(run(['exec','-i',db.id,'/bin/sh','-c',DATABASE_OBSERVATION_PSQL],maintenanceIotStateSql(baseline)));}
  catch{hold('IOT_LOCAL_WRITE_STATE_UNVERIFIED');}
  guard();verify();return validateMaintenanceIotState(value,baseline);
}
