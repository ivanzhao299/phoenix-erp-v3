/** Typed server observations for a candidate control lease. No lock acquisition,
 * backend termination, CLI, producer registry or continuous drain claim. */
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {CONTRACT,verifyContext} from './production-config-guard.mjs';
import {executionEnv} from './capture-production-runtime.mjs';
import {DATABASE_OBSERVATION_PSQL} from './production-maintenance-database-observer.mjs';
import {canonicalDigest,runtimeTimestamp,iso,same} from './production-maintenance-receipts.mjs';

const hold=code=>{throw Error(`CANDIDATE_DATABASE_HOLD=${code}`);};
const ID=/^[a-f0-9]{64}$/,SHA=/^[a-f0-9]{40}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const INSPECT='{{json .Id}}\t{{json .Image}}\t{{json .State.StartedAt}}\t{{json .State.Running}}\t{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}}';
const keys=(value,fields)=>value&&Object.getPrototypeOf(value)===Object.prototype&&same(Object.keys(value).sort(),[...fields].sort());
const positive=value=>Number.isSafeInteger(value)&&value>0;
function validateSession(value,candidate=false){
  if(!keys(value,candidate?['sessionPid','backendStartedAt','bootId']:['sessionPid','backendStartedAt'])
    ||!positive(value.sessionPid)||value.sessionPid>2147483647||!iso(value.backendStartedAt)
    ||(candidate&&!UUID.test(value.bootId)))hold('EXACT_SESSION_BINDING_REQUIRED');
}
function validateBinding(b){
  if(!keys(b,['owner','previousFloorSha','targetSha','database','root','candidate'])||!/^\d{1,20}-\d{1,10}$/.test(b.owner||'')
    ||!SHA.test(b.previousFloorSha)||!SHA.test(b.targetSha)||b.previousFloorSha===b.targetSha)hold('EXACT_BINDING_REQUIRED');
  const d=b.database;
  if(!keys(d,['containerId','imageId','containerStartedAt','postmasterStartedAt','clusterSystemIdentifier','databaseOid'])
    ||!ID.test(d.containerId)||!/^sha256:[a-f0-9]{64}$/.test(d.imageId)||!runtimeTimestamp(d.containerStartedAt)
    ||!iso(d.postmasterStartedAt)||!/^[1-9][0-9]{0,19}$/.test(d.clusterSystemIdentifier||'')
    ||!positive(d.databaseOid)||d.databaseOid>4294967295)hold('EXACT_DATABASE_BINDING_REQUIRED');
  validateSession(b.root);validateSession(b.candidate,true);
  if(b.root.sessionPid===b.candidate.sessionPid)hold('DISTINCT_BACKENDS_REQUIRED');
}
const rootName=b=>`phoenix-maintenance-control:${b.owner}`;
const candidateName=b=>`phoenix-fence:${b.candidate.bootId}`;
/** Every interpolation is a validated positive integer or a closed identifier.
 * No caller SQL, credentials, server address or user/database name is accepted. */
export function candidateDatabaseSql(binding){
  validateBinding(binding);const b=structuredClone(binding);
  const rows=(pid,name)=>`(SELECT coalesce(json_agg(json_build_object('pid',pid,'databaseOid',datid::bigint,'backendStartedAt',to_char(backend_start AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'applicationName',application_name,'backendType',backend_type) ORDER BY pid),'[]'::json) FROM pg_catalog.pg_stat_activity WHERE pid=${pid} OR application_name='${name}')`;
  return `BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
SET LOCAL statement_timeout='3s';
SET LOCAL lock_timeout='1s';
SET LOCAL idle_in_transaction_session_timeout='5s';
SELECT json_build_object(
 'sampledAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 'postmasterStartedAt',to_char(pg_catalog.pg_postmaster_start_time() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 'clusterSystemIdentifier',(SELECT system_identifier::text FROM pg_catalog.pg_control_system()),
 'databaseOid',(SELECT oid::bigint FROM pg_catalog.pg_database WHERE datname=current_database()),
 'serverVersionNum',current_setting('server_version_num')::integer,
 'statsVisibilityComplete',((SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user) OR pg_catalog.pg_has_role(current_user,'pg_read_all_stats','USAGE')),
 'rootBackends',${rows(b.root.sessionPid,rootName(b))},
 'candidateBackends',${rows(b.candidate.sessionPid,candidateName(b))},
 'rootLocks',(SELECT coalesce(json_agg(json_build_object('databaseOid',database::bigint,'namespace',classid::bigint,'key',objid::bigint,'keyForm',objsubid,'mode',mode,'granted',granted) ORDER BY database,classid,objid,objsubid,mode),'[]'::json) FROM pg_catalog.pg_locks WHERE locktype='advisory' AND pid=${b.root.sessionPid})
);
ROLLBACK;
`;
}
function validateRow(row,expected,name,databaseOid){
  if(!keys(row,['pid','databaseOid','backendStartedAt','applicationName','backendType'])||row.pid!==expected.sessionPid
    ||row.databaseOid!==databaseOid||row.backendStartedAt!==expected.backendStartedAt||row.applicationName!==name
    ||row.backendType!=='client backend')hold('BACKEND_IDENTITY_CHANGED');
}
export function validateCandidateDatabaseSnapshot(value,binding,{startedAt,finishedAt,expectRoot='HELD'}={}){
  validateBinding(binding);const b=structuredClone(binding),d=b.database;
  if(!['HELD','RELEASED'].includes(expectRoot))hold('EXPECTED_ROOT_STATE_REQUIRED');
  if(!keys(value,['sampledAt','postmasterStartedAt','clusterSystemIdentifier','databaseOid','serverVersionNum','statsVisibilityComplete','rootBackends','candidateBackends','rootLocks']))hold('OBSERVATION_FIELDS');
  if(!iso(startedAt)||!iso(finishedAt)||!iso(value.sampledAt)||Date.parse(finishedAt)<Date.parse(startedAt)
    ||Date.parse(finishedAt)-Date.parse(startedAt)>30000||Date.parse(value.sampledAt)<Date.parse(startedAt)-3000
    ||Date.parse(value.sampledAt)>Date.parse(finishedAt)+3000)hold('OBSERVATION_TIME');
  if(value.postmasterStartedAt!==d.postmasterStartedAt||value.clusterSystemIdentifier!==d.clusterSystemIdentifier
    ||value.databaseOid!==d.databaseOid||!Number.isSafeInteger(value.serverVersionNum)||value.serverVersionNum<160000
    ||value.serverVersionNum>=190000||value.statsVisibilityComplete!==true)hold('DATABASE_IDENTITY_OR_VISIBILITY');
  if(!Array.isArray(value.rootBackends)||!Array.isArray(value.candidateBackends)||!Array.isArray(value.rootLocks)
    ||value.candidateBackends.length!==1)hold('BACKEND_NOT_UNIQUE');
  validateRow(value.candidateBackends[0],b.candidate,candidateName(b),d.databaseOid);
  if(expectRoot==='HELD'){
    if(value.rootBackends.length!==1)hold('ROOT_BACKEND_NOT_UNIQUE');
    validateRow(value.rootBackends[0],b.root,rootName(b),d.databaseOid);
    const expected=[1,2].map(key=>({databaseOid:d.databaseOid,namespace:17455,key,keyForm:2,mode:'ExclusiveLock',granted:true}));
    if(!same(value.rootLocks,expected))hold('EXCLUSIVE_ROOT_LOCKS_REQUIRED');
  }else if(value.rootBackends.length!==0||value.rootLocks.length!==0)hold('ROOT_BACKEND_OR_LOCKS_REMAIN');
  return {schema:'phoenix.candidate-database-observation/v1',result:expectRoot==='HELD'?'ROOT_HELD_SNAPSHOT':'ROOT_BACKEND_ABSENT_SNAPSHOT',
    bindingDigest:canonicalDigest(b),binding:b,querySha256:createHash('sha256').update(candidateDatabaseSql(b)).digest('hex'),
    startedAt,finishedAt,observation:structuredClone(value),continuousDrainProof:false,clientLifecycleSettlementProved:false,
    persistentOwnershipComplete:false,registryInstalled:false,admissionOrApprovalGranted:false,productionMutation:false};
}
function productionRun(args,input){
  try{return execFileSync('/usr/bin/docker',args,{input,env:executionEnv(),encoding:'utf8',timeout:10000,maxBuffer:65536,stdio:['pipe','pipe','pipe']}).trim();}
  catch{hold('BOUNDED_READ_FAILED');}
}
/** Observe an existing lease; never create one. Root/FD9 and full Docker pin are
 * checked before and after the bounded readonly query. Independent supervision
 * must still settle any failed Docker/psql observer process. */
export function collectCandidateDatabaseSnapshot(binding,options={},dependencies={}){
  validateBinding(binding);const b=structuredClone(binding);
  const guard=dependencies.guard||(()=>verifyContext(CONTRACT.repository,CONTRACT.stateDirectory));
  const run=dependencies.run||productionRun,now=dependencies.now||(()=>new Date().toISOString());
  const pin=()=>{
    let row;try{row=run(['inspect',b.database.containerId,'--format',INSPECT]).split('\t').map(JSON.parse);}catch{hold('RUNTIME_READ_FAILED');}
    if(!same(row,[b.database.containerId,b.database.imageId,b.database.containerStartedAt,true,'healthy']))hold('DATABASE_RUNTIME_CHANGED');return row;
  };
  if(!keys(options,[])&&!keys(options,['expectRoot']))hold('OPTIONS_REQUIRED');
  if(!['HELD','RELEASED'].includes(options.expectRoot??'HELD'))hold('EXPECTED_ROOT_STATE_REQUIRED');
  guard();const before=pin(),startedAt=now();let value;
  try{const raw=run(['exec','-i',b.database.containerId,'/bin/sh','-c',DATABASE_OBSERVATION_PSQL],candidateDatabaseSql(b));
    if(Buffer.byteLength(raw)>32768)hold('OBSERVATION_SIZE');value=JSON.parse(raw);
  }catch{hold('DATABASE_READ_OR_JSON_FAILED');}
  const finishedAt=now();guard();if(!same(before,pin()))hold('DATABASE_RUNTIME_CHANGED');
  return validateCandidateDatabaseSnapshot(value,b,{startedAt,finishedAt,expectRoot:options.expectRoot??'HELD'});
}
