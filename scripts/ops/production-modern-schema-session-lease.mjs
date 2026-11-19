/** Exact original modern PostgreSQL session and supervisor identity. A new
 * process holding FD9 or newly acquired advisory locks cannot impersonate it. */
import fs from 'node:fs';import {execFileSync} from 'node:child_process';
import {executionEnv} from './capture-production-runtime.mjs';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {DockerPostgresControlSession} from './background-control-coordinator.mjs';
const fail=code=>{throw Error('MODERN_SCHEMA_LEASE_HOLD='+code);};
const integer=value=>Number.isSafeInteger(value)&&value>1;
const decimal=value=>typeof value==='string'&&/^[1-9][0-9]{0,19}$/.test(value);
export const MODERN_SCHEMA_LEASE_SQL=`SELECT jsonb_build_object(
 'name',current_database(),'schema','public','primary',NOT pg_is_in_recovery(),'systemIdentifier',(SELECT system_identifier::text FROM pg_control_system()),
 'databaseOid',(SELECT oid::bigint FROM pg_database WHERE datname=current_database()),
 'postmasterStartMicros',trunc(extract(epoch FROM pg_postmaster_start_time())*1000000)::text,
 'holders',COALESCE((SELECT jsonb_agg(jsonb_build_object('sessionPid',a.pid,'databaseOid',a.datid::bigint,
   'backendStartMicros',trunc(extract(epoch FROM a.backend_start)*1000000)::text) ORDER BY a.pid)
 FROM pg_stat_activity a JOIN (SELECT pid FROM pg_locks WHERE locktype='advisory' AND granted
   AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND classid=17455 AND objid IN(1,2) AND objsubid=2
   GROUP BY pid HAVING count(*)=2 AND bool_and(mode='ExclusiveLock') AND count(DISTINCT objid)=2) l USING(pid)),'[]'::jsonb))::text;`;
function productionRead(sql){
 try{
  const raw=execFileSync('/usr/bin/docker',['exec','-i','phoenix-v3-db','sh','-c','exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
   {env:executionEnv(),input:"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='3s'; SET LOCAL lock_timeout='1s'; SET LOCAL search_path=pg_catalog; "+sql+' ROLLBACK;',encoding:'utf8',timeout:5000,maxBuffer:65536,stdio:['pipe','pipe','pipe']}).trim();
  return JSON.parse(raw);
 }catch{fail('PRIMARY_OBSERVATION_UNAVAILABLE');}
}
export function parseModernSchemaLease(value){
 const holder=value?.holders?.[0];
 if(!value||value.primary!==true||!Array.isArray(value.holders)||value.holders.length!==1||!integer(value.databaseOid)||!decimal(value.systemIdentifier)||!decimal(value.postmasterStartMicros)
  ||typeof value.name!=='string'||!value.name||value.schema!=='public'||!integer(holder?.sessionPid)||holder.databaseOid!==value.databaseOid||!decimal(holder.backendStartMicros))fail('UNIQUE_ORIGINAL_DUAL_LOCK_SESSION_REQUIRED');
 return {database:{name:value.name,schema:'public',systemIdentifier:value.systemIdentifier,databaseOid:value.databaseOid,postmasterStartMicros:value.postmasterStartMicros},
  sessionPid:holder.sessionPid,backendStartMicros:holder.backendStartMicros};
}
export function originalModernSchemaSessionPredicate(input){
 if(!input||!integer(input.sessionPid)||!integer(input.database?.databaseOid)||!decimal(input.backendStartMicros)||!decimal(input.database.postmasterStartMicros)||!decimal(input.database.systemIdentifier))fail('EXACT_SESSION_IDENTITY_REQUIRED');
 return `SELECT NOT pg_is_in_recovery() AND pg_backend_pid()=${input.sessionPid} AND (SELECT oid FROM pg_database WHERE datname=current_database())=${input.database.databaseOid}
  AND (SELECT system_identifier::text FROM pg_control_system())='${input.database.systemIdentifier}'
  AND trunc(extract(epoch FROM pg_postmaster_start_time())*1000000)::text='${input.database.postmasterStartMicros}'
  AND (SELECT trunc(extract(epoch FROM backend_start)*1000000)::text FROM pg_stat_activity WHERE pid=pg_backend_pid())='${input.backendStartMicros}'
  AND (SELECT count(*)=2 AND count(DISTINCT objid)=2 AND coalesce(bool_and(mode='ExclusiveLock' AND granted),false)
    FROM pg_locks WHERE locktype='advisory' AND pid=pg_backend_pid() AND database=${input.database.databaseOid} AND classid=17455 AND objid IN(1,2) AND objsubid=2);`;
}
export function observeModernSchemaLease(dependencies={}){return parseModernSchemaLease((dependencies.read??productionRead)(MODERN_SCHEMA_LEASE_SQL));}
export async function pinOriginalModernSchemaSession(session,context,dependencies={}){
 const lease=observeModernSchemaLease(dependencies),identity={name:lease.database.name,schema:lease.database.schema,systemIdentifier:lease.database.systemIdentifier};
 if(canonicalDigest(identity)!==context.databaseIdentitySha256||!session?.connected()||typeof session.sealForModernSchema!=='function'
  ||await session.query(originalModernSchemaSessionPredicate(lease))!==true)fail('ORIGINAL_CHANNEL_NOT_OBSERVED_HOLDER');
 assertModernSchemaLeaseStillOriginal(lease,dependencies);session.sealForModernSchema();
 return lease;
}
/** Modern-only lock owner. Once pinned, reviewed code cannot unlock/reacquire
 * on the same backend; release is confined to coordinator.close(). Legacy
 * control sessions keep their existing interface and behavior. */
export class ModernSchemaControlSession extends DockerPostgresControlSession {
 #sealed=false;#keys=new Set();#isClosing;
 constructor(options={},dependencies={}){super(options,dependencies);this.#isClosing=dependencies.isClosing??(()=>false);}
 sealForModernSchema(){if(this.#sealed||!this.connected()||this.#keys.size!==2||![1,2].every(key=>this.#keys.has(key)))fail('ORIGINAL_DUAL_OWNER_REQUIRED');this.#sealed=true;}
 async tryLock(key){if(this.#sealed)fail('SEALED_LEASE_REACQUIRE_FORBIDDEN');const held=await super.tryLock(key);if(held)this.#keys.add(key);return held;}
 async unlock(key){if(this.#sealed&&!this.#isClosing())fail('SEALED_LEASE_EARLY_UNLOCK_FORBIDDEN');const released=await super.unlock(key);if(released)this.#keys.delete(key);return released;}
 async query(sql){
  if(this.#sealed&&/pg_(?:(?:try_)?advisory_(?:lock|unlock)(?:_all)?)/i.test(sql)&&!this.#isClosing())fail('SEALED_LEASE_MUTATION_FORBIDDEN');
  if(!/^\s*SELECT\b/i.test(sql)||/;\s*\S/.test(sql))fail('FIXED_CONTROL_READ_REQUIRED');
  if(this.#sealed&&!this.#isClosing()&&!/^\s*SELECT\s+(?:true\s*;|count\(\*\)=1\b|NOT pg_is_in_recovery\(\))/i.test(sql))fail('FIXED_SEALED_CONTROL_READ_REQUIRED');
  return super.query(sql);
 }
}
export function readLinuxProcessIdentity(pid,dependencies={}){
 if(!integer(pid))fail('PROCESS_IDENTITY_REQUIRED');const io=dependencies.fs??fs;
 try{
  const raw=io.readFileSync(`/proc/${pid}/stat`,'utf8'),end=raw.lastIndexOf(')'),fields=raw.slice(end+2).trim().split(/\s+/);
  const actual=Number(raw.slice(0,raw.indexOf(' '))),parentPid=Number(fields[1]),startTicks=fields[19];
  if(end<1||actual!==pid||!Number.isSafeInteger(parentPid)||parentPid<0||!decimal(startTicks)||['Z','X','x'].includes(fields[0]))fail('PROCESS_DEAD_OR_REUSED');
  const bootId=io.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();if(!/^[a-f0-9-]{36}$/.test(bootId))fail('HOST_BOOT_ID_REQUIRED');
  return {pid,parentPid,startTicks,bootId};
 }catch{fail('PROCESS_IDENTITY_UNAVAILABLE');}
}
export function assertOriginalModernSchemaProcess(supervisor,dependencies={}){
 const read=dependencies.readProcess??readLinuxProcessIdentity,actual=read(supervisor?.pid);
 if(!same(actual,supervisor))fail('SUPERVISOR_DEAD_OR_REUSED');
 let pid=dependencies.pid??process.pid;const seen=new Set();
 for(let depth=0;depth<64;depth++){
  if(pid===supervisor.pid)return true;if(pid<=1||seen.has(pid))break;seen.add(pid);pid=read(pid).parentPid;
 }
 fail('ORIGINAL_SUPERVISOR_DESCENDANT_REQUIRED');
}
export function assertModernSchemaLeaseStillOriginal(expected,dependencies={}){
 const actual=observeModernSchemaLease(dependencies);if(!same(expected,actual))fail('ORIGINAL_SESSION_LOST_OR_REPLACED');return true;
}
