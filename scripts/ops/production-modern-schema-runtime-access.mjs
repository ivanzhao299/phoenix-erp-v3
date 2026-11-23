/** Run the reviewed ACL SELECT using the actual API's application login. The
 * database observer independently pins database, session and control enrollment.
 * Only role OIDs, privileges and booleans leave the running API container. */
import {execFileSync} from 'node:child_process';
import {CONTRACT,git} from './production-config-guard.mjs';
import {executionEnv} from './capture-production-runtime.mjs';
import {same} from './production-maintenance-receipts.mjs';
const fail=reason=>{throw Error('MODERN_SCHEMA_SUCCESSOR_HOLD='+reason);};
const business=['production_inbound_reissues','production_finance_review_files','production_cutover_state_receipts','production_cutover_state_origins'];
const protectedTables=['production_cutover_control_environments','production_cutover_apply_admissions','production_cutover_apply_results'];
const protectedFunctions=['consume_production_cutover_admission(uuid,text)','record_production_cutover_apply_result(uuid)','lock_production_cutover_authority(uuid)'];
const textMap=(value,keys,allowed)=>value&&same(Object.keys(value).sort(),[...keys].sort())&&Object.values(value).every(item=>allowed.includes(item));
export function classifyRuntimeAccess({identity,acl,enrollment},previous=null){
 if(!identity||!/^\d+$/.test(identity.roleOid??'')||!/^\d+$/.test(identity.databaseOid??'')||!/^\d+$/.test(identity.postmasterStartMicros??'')||
    identity.sameNativeLogin!==true||acl?.currentIsSessionUser!==true||typeof acl.elevated!=='boolean'||
    !Number.isSafeInteger(enrollment?.environments)||enrollment.environments<0||typeof enrollment.enrolled!=='boolean'||
    !textMap(acl.controlTables,protectedTables,['PROTECTED','WRITABLE'])||
    !textMap(acl.executorFunctions,protectedFunctions,['PROTECTED','EXECUTABLE'])||
    !textMap(acl.business,business,['ABSENT','AVAILABLE','MISSING_INSERT','MISSING_SELECT']))fail('RUNTIME_AUTHORITY_UNVERIFIED');
 const boundary={identity,enrollment,elevated:acl.elevated,controlTables:acl.controlTables,executorFunctions:acl.executorFunctions};
 if(previous&&!same(boundary,previous.boundary))fail('EXISTING_RUNTIME_AUTHORITY_CHANGED');
 const elevated=acl.elevated||Object.values(acl.controlTables).includes('WRITABLE')||Object.values(acl.executorFunctions).includes('EXECUTABLE');
 if(enrollment.environments>0&&(!enrollment.enrolled||elevated))fail('ENROLLED_API_AUTHORITY_OVERREACH');
 const expected=previous?'AVAILABLE':'ABSENT';
 if(Object.values(acl.business).some(value=>value!==expected))fail(previous?'REQUIRED_BUSINESS_ACCESS_MISSING':'UNEXPECTED_PREEXISTING_EXPANSION');
 if(acl.businessAccess!==(previous?'AVAILABLE':'EXPANSION_NOT_INSTALLED')||acl.pilotIsolation!==(elevated?'HOLD':'PROTECTED'))fail('RUNTIME_ACL_FACTS_DISAGREE');
 return {boundary,business:acl.business,businessAccess:acl.businessAccess,pilotIsolation:acl.pilotIsolation,rawConclusion:acl.result,pilotStatus:enrollment.enrolled&&!elevated?'ROLE_BOUNDARY_VERIFIED':'PILOT_NOT_READY'};
}
export const runtimeAccessProgram=`const fs=require('node:fs'),{Client}=require('pg');
(async()=>{const input=JSON.parse(fs.readFileSync(0,'utf8')),e=process.env;
if(!e.DB_HOST||!e.DB_USER||!e.DB_NAME)throw Error();
const c=new Client({host:e.DB_HOST,port:Number(e.DB_PORT||5432),user:e.DB_USER,password:e.DB_PASSWORD,database:e.DB_NAME,application_name:'phoenix-1123-verify-api-access',
connectionTimeoutMillis:3500,options:'-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=1500'});
try{await c.connect();await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await c.query('SET LOCAL search_path = pg_catalog,public');
const identity=(await c.query("SELECT r.oid::text AS \\"roleOid\\", d.oid::text AS \\"databaseOid\\",trunc(extract(epoch FROM pg_postmaster_start_time())*1000000)::text AS \\"postmasterStartMicros\\", EXISTS(SELECT 1 FROM pg_stat_activity a WHERE a.datid=d.oid AND a.usesysid=r.oid AND a.pid=$1 AND a.application_name=$2 AND date_trunc('milliseconds',a.backend_start)=$3::timestamptz) AS \\"sameNativeLogin\\" FROM pg_roles r,pg_database d WHERE r.rolname=session_user AND d.datname=current_database()",[input.pid,input.app,input.started])).rows[0];
const result=await c.query(input.sql);await c.query('ROLLBACK');
if(result.rows.length!==1||!identity)throw Error();
process.stdout.write(JSON.stringify({identity,acl:result.rows[0].jsonb_build_object}));
}finally{await c.end();}})().catch(()=>process.exit(64));`;
export async function readRuntimeAccess(client,participant,targetSha,previous=null){
 const control=participant?.status?.controlSession;
 if(!/^[a-f0-9]{64}$/.test(participant?.containerId??'')||!/^[a-f0-9]{40}$/.test(targetSha??'')||
    !Number.isSafeInteger(control?.sessionPid)||!control.applicationName||!control.backendStartedAt)fail('ACTUAL_API_CONTROL_SESSION_REQUIRED');
 const sql=git(CONTRACT.repository,['show',targetSha+':scripts/ops/readonly-audits/production-remediation-runtime-acl.sql']);
 let response;
 try{
  const bytes=execFileSync('/usr/bin/docker',['exec','-i',participant.containerId,'/usr/local/bin/node','-e',runtimeAccessProgram],{
   env:executionEnv(),input:JSON.stringify({sql,pid:control.sessionPid,app:control.applicationName,started:control.backendStartedAt}),
   timeout:10000,maxBuffer:32768,encoding:'utf8',stdio:['pipe','pipe','pipe']});
  response=JSON.parse(bytes);
 }catch{fail('ACTUAL_API_LOGIN_PROBE_FAILED');}
 const {rows:[native]}=await client.query(`WITH latest AS (SELECT DISTINCT ON(environment_id) * FROM public.production_cutover_control_environments ORDER BY environment_id,generation DESC)
 SELECT d.oid::text AS "databaseOid",trunc(extract(epoch FROM pg_postmaster_start_time())*1000000)::text AS "postmasterStartMicros",
  (SELECT count(*)::integer FROM latest) AS environments,EXISTS(SELECT 1 FROM latest e,unnest(e.api_roles,e.api_role_oids) r(name,oid)
    JOIN pg_roles p ON p.rolname=r.name AND p.oid=r.oid WHERE p.oid=$1::oid AND e.database_oid=d.oid AND e.database_name=d.datname
    AND e.schema_oid='public'::regnamespace AND e.cluster_identifier=(SELECT system_identifier::text FROM pg_control_system())) AS enrolled
 FROM pg_database d WHERE d.datname=current_database()`,[response.identity.roleOid]);
 if(native?.databaseOid!==response.identity.databaseOid||native.postmasterStartMicros!==response.identity.postmasterStartMicros)fail('RUNTIME_DATABASE_IDENTITY_CHANGED');
 return classifyRuntimeAccess({...response,enrollment:{environments:native.environments,enrolled:native.enrolled}},previous);
}
