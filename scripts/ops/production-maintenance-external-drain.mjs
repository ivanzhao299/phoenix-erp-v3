/** Fixture-only external legacy-connection drain protocol. The historical
 * 22687886 legacy API has no coordinated pool shutdown: after its container
 * stops, PostgreSQL can retain the old idle client backend until the closed
 * socket is finally observed. Production root sources stay read-only; the
 * bounded terminate below executes ONLY inside the exclusive disposable
 * first-switch fixture (NATIVE_FIXTURE_FLOW gate, absent in production) and
 * only against sessions pinned to the exact stopped legacy container
 * identity, client address, database and database user recorded before the
 * stop. Any unknown session, identity drift, open transaction, termination
 * failure or reappearance is a HOLD, never a broad connection cleanup. */
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {CONTRACT,verifyContext,secureJson} from './production-config-guard.mjs';
import {executionEnv} from './capture-production-runtime.mjs';
import {bindingDigest,canonicalDigest,hold,iso} from './production-maintenance-receipts.mjs';
import {DATABASE_OBSERVATION_PSQL} from './production-maintenance-database-observer.mjs';

const ID=/^[a-f0-9]{64}$/;

export const EXTERNAL_DRAIN_SCHEMA='phoenix.external-legacy-connection-drain/v1';
export const LEGACY_EXTERNAL_IDENTITY_SCHEMA='phoenix.maintenance-legacy-external-identity/v1';
export const EXTERNAL_DRAIN_RECEIPT_NAME='external-legacy-connection-drain.json';
export const EXTERNAL_DRAIN_APPLICATION_NAME='phoenix-external-legacy-drain';
// The maintenance observer and this protocol's own psql connect through the
// database container's local unix socket (client_addr NULL). A pg_stat_activity
// row can briefly outlive its finished psql; those protocol-owned ghosts are
// never drain targets and never count as unknown foreign sessions.
const PROTOCOL_APPLICATION_NAMES=new Set(['phoenix-maintenance-observer',EXTERNAL_DRAIN_APPLICATION_NAME]);
const IPV4=/^(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])(\.(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])){3}$/;
const NAME=/^[a-z0-9_]{1,63}$/;
const STOPPED_PIN_KEYS=['id','imageId','revision','startedAt','restartCount'];
const STOPPED_PIN_KEYS_SORTED=[...STOPPED_PIN_KEYS].sort();
export const EXTERNAL_SESSION_LISTING_SQL=`BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
SET LOCAL statement_timeout='3s';
SET LOCAL lock_timeout='1s';
SELECT coalesce(json_agg(json_build_object(
 'pid',pid,'usename',usename,'datname',datname,'client_addr',client_addr::text,
 'application_name',coalesce(application_name,''),'state',coalesce(state,''),
 'backend_type',backend_type,'open_transaction',xact_start IS NOT NULL) ORDER BY pid),'[]'::json)
FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid();
ROLLBACK;
`;
// Mutation-capable twin of the fixed read-only observer wrapper. Same hygiene
// (validated container env, env -i, fixed binaries, bounded timeout), without
// default_transaction_read_only so the one reviewed terminate can run.
export const EXTERNAL_DRAIN_PSQL=`case "\${POSTGRES_USER-}" in ''|[0-9]*|*[!A-Za-z0-9_]*) exit 64;; esac
case "\${POSTGRES_DB-}" in ''|[0-9]*|*[!A-Za-z0-9_]*) exit 64;; esac
[ "\${#POSTGRES_USER}" -le 63 ] && [ "\${#POSTGRES_DB}" -le 63 ] || exit 64
exec /usr/bin/timeout -s TERM -k 1 8 /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin PGCONNECT_TIMEOUT=3 PGAPPNAME=${EXTERNAL_DRAIN_APPLICATION_NAME} PGOPTIONS='-c search_path=pg_catalog -c statement_timeout=3000' /usr/local/bin/psql --host=/var/run/postgresql --port=5432 --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --no-password -X -qAt --set=ON_ERROR_STOP=1`;
const INSPECT_STOPPED='{{json .Id}}\t{{json .Image}}\t{{json .RestartCount}}\t{{json .State.Running}}\t{{json .State.Status}}\t{{json .State.Restarting}}\t{{json .State.Pid}}\t{{json .State.StartedAt}}\t{{json .State.ExitCode}}';
const drainHold=(reason,details)=>{const error=Error(`MAINTENANCE_HOLD=EXTERNAL_LEGACY_DRAIN_${reason}`);Object.assign(error,details);throw error;};
const stripPrefix=address=>String(address||'').split('/')[0];
const ipInt=ip=>ip.split('.').reduce((value,octet)=>value*256+Number(octet),0);
export function cidrContains(subnet,ip){
  const match=/^(.+)\/(\d{1,2})$/.exec(subnet||'');
  if(!match||!IPV4.test(match[1])||!IPV4.test(ip))return false;
  const bits=Number(match[2]);
  if(bits<0||bits>32)return false;
  const mask=bits===0?0:(0xffffffff<<(32-bits))>>>0;
  return ((ipInt(match[1])^ipInt(ip))&mask)===0;
}
export function legacyExternalIdentityFile(stateDirectory,owner){
  if(!/^\d+-\d+$/.test(owner||''))hold('EXTERNAL_DRAIN_IDENTITY_PATH');
  return `${stateDirectory}/maintenance-legacy-external-identity-${owner}.json`;
}
/** Pure derivation of the immutable pre-stop identity record from actual
 * observations (network membership and PostgreSQL sessions). No caller input
 * selects the recorded database, user or client address. */
export function captureLegacyExternalIdentity({context,networkId,containers,sessions,capturedAt}){
  const api=context?.preSnapshot?.api;
  if(!ID.test(networkId||'')||!ID.test(api?.id)||!Array.isArray(containers)||!Array.isArray(sessions)||!iso(capturedAt))hold('EXTERNAL_DRAIN_IDENTITY_INPUT');
  const apiRow=containers.find(row=>row.id===api.id);
  if(!apiRow||!apiRow.ipv4Address)hold('EXTERNAL_DRAIN_LEGACY_ADDRESS_ABSENT');
  const clientIp=stripPrefix(apiRow.ipv4Address);
  if(!IPV4.test(clientIp))hold('EXTERNAL_DRAIN_LEGACY_ADDRESS_INVALID');
  if(containers.filter(row=>stripPrefix(row.ipv4Address)===clientIp).length!==1)hold('EXTERNAL_DRAIN_LEGACY_ADDRESS_NOT_EXCLUSIVE');
  const legacy=sessions.map(normalizeExternalSessionRow).filter(row=>row.clientAddr===clientIp);
  if(!legacy.length)hold('EXTERNAL_DRAIN_LEGACY_SESSIONS_ABSENT');
  if(new Set(legacy.map(row=>`${row.datname}\u0000${row.usename}`)).size!==1)hold('EXTERNAL_DRAIN_LEGACY_SESSION_OWNER_AMBIGUOUS');
  const observed=legacy[0];
  if(!NAME.test(observed.datname)||!NAME.test(observed.usename))hold('EXTERNAL_DRAIN_LEGACY_SESSION_OWNER_INVALID');
  return {schema:LEGACY_EXTERNAL_IDENTITY_SCHEMA,owner:context.owner,contextDigest:bindingDigest(context),
    apiContainer:STOPPED_PIN_KEYS.reduce((pin,key)=>({...pin,[key]:api[key]}),{}),
    networkId,clientIp,database:observed.datname,databaseUser:observed.usename,
    observedSessionCount:legacy.length,capturedAt,productionMutation:false};
}
export function validateLegacyExternalIdentity(record,context){
  const fields=['apiContainer','capturedAt','clientIp','contextDigest','database','databaseUser','networkId','observedSessionCount','owner','productionMutation','schema'];
  if(!record||Object.getPrototypeOf(record)!==Object.prototype||Object.keys(record).sort().join()!==fields.join()
    ||record.schema!==LEGACY_EXTERNAL_IDENTITY_SCHEMA||record.owner!==context.owner
    ||record.contextDigest!==bindingDigest(context)||!ID.test(record.networkId||'')||!IPV4.test(record.clientIp||'')
    ||!NAME.test(record.database||'')||!NAME.test(record.databaseUser||'')
    ||!Number.isSafeInteger(record.observedSessionCount)||record.observedSessionCount<1
    ||!iso(record.capturedAt)||record.productionMutation!==false
    ||Date.parse(record.capturedAt)>Date.parse(context.window.end))hold('EXTERNAL_DRAIN_IDENTITY_BINDING');
  const pin=record.apiContainer,api=context.preSnapshot.api;
  if(Object.getPrototypeOf(pin)!==Object.prototype||Object.keys(pin).sort().join()!==STOPPED_PIN_KEYS_SORTED.join()
    ||pin.id!==api.id||pin.imageId!==api.imageId||pin.revision!==api.revision
    ||pin.startedAt!==api.startedAt||pin.restartCount!==api.restartCount)hold('EXTERNAL_DRAIN_IDENTITY_BINDING');
  if(record.networkId!==context.networkIsolation?.networks?.[0]?.id
    ||!cidrContains(context.networkIsolation?.ingressScope?.subnet,record.clientIp))hold('EXTERNAL_DRAIN_IDENTITY_NETWORK');
  return record;
}
/** Validate one raw pg_stat_activity listing row into the canonical shape. */
export function normalizeExternalSessionRow(row){
  const fields=['application_name','backend_type','client_addr','datname','open_transaction','pid','state','usename'];
  if(!row||Object.getPrototypeOf(row)!==Object.prototype||Object.keys(row).sort().join()!==fields.join()
    ||!Number.isSafeInteger(row.pid)||row.pid<1||typeof row.usename!=='string'||typeof row.datname!=='string'
    ||typeof row.application_name!=='string'||typeof row.state!=='string'
    ||typeof row.open_transaction!=='boolean'||row.backend_type!=='client backend')hold('EXTERNAL_DRAIN_SESSION_LISTING');
  return {pid:row.pid,clientAddr:row.client_addr===null?null:stripPrefix(row.client_addr),
    usename:row.usename,datname:row.datname,applicationName:row.application_name,
    state:row.state,openTransaction:row.open_transaction};
}
/** Pure strict-match planner over normalized sessions. Only a session matching
 * the exact stopped legacy client address, database and database user AND
 * idle without an open transaction may be terminated. Every other row is
 * either an excluded protocol ghost or an unknown session that must HOLD. */
export function planExternalLegacySessionDrain({identity,sessions}){
  if(!Array.isArray(sessions))hold('EXTERNAL_DRAIN_SESSION_LISTING');
  const matched=[],unknown=[];
  for(const row of sessions){
    if(!row||Object.getPrototypeOf(row)!==Object.prototype
      ||Object.keys(row).sort().join()!==['applicationName','clientAddr','datname','openTransaction','pid','state','usename'].join()
      ||!Number.isSafeInteger(row.pid)||row.pid<1||typeof row.usename!=='string'||typeof row.datname!=='string'
      ||typeof row.applicationName!=='string'||typeof row.state!=='string'||typeof row.openTransaction!=='boolean'
      ||row.clientAddr!==null&&!IPV4.test(row.clientAddr))hold('EXTERNAL_DRAIN_SESSION_LISTING');
    const protocolOwned=row.clientAddr===null&&PROTOCOL_APPLICATION_NAMES.has(row.applicationName);
    const exact=row.clientAddr===identity.clientIp&&row.usename===identity.databaseUser&&row.datname===identity.database;
    if(exact)matched.push(row);
    else if(!protocolOwned)unknown.push({pid:row.pid,clientAddr:row.clientAddr,usename:row.usename,datname:row.datname,
      applicationName:row.applicationName,state:row.state});
  }
  if(new Set(matched.map(row=>row.pid)).size!==matched.length)hold('EXTERNAL_DRAIN_SESSION_PID_DUPLICATED');
  if(unknown.length)return {status:'HOLD',reason:'UNKNOWN_SESSION_PRESENT',matched,unknown};
  if(!matched.length)return {status:'EMPTY',matched,unknown};
  if(matched.some(row=>row.openTransaction))return {status:'HOLD',reason:'MATCHED_SESSION_OPEN_TRANSACTION',matched,unknown};
  if(matched.some(row=>row.state!=='idle'))return {status:'HOLD',reason:'MATCHED_SESSION_NOT_IDLE',matched,unknown};
  return {status:'READY',matched,unknown};
}
function productionRun(args,input){
  try{return execFileSync('/usr/bin/docker',args,{input,env:executionEnv(),encoding:'utf8',timeout:10000,maxBuffer:65536,stdio:['pipe','pipe','pipe']}).trim();}
  catch{hold('EXTERNAL_DRAIN_BOUNDED_READ_FAILED');}
}
function writeProtocolReceipt(outputDirectory,receipt){
  // Fixed fixture evidence path; never part of trusted production state.
  fs.writeFileSync(`${outputDirectory}/${EXTERNAL_DRAIN_RECEIPT_NAME}`,JSON.stringify(receipt)+'\n',{mode:0o600,flag:'wx'});
}
/** One bounded, auditable, fixture-only termination pass. Returns DISABLED
 * (production gate closed — no effect at all), EMPTY (nothing to drain) or
 * DRAINED with an afterCount of zero; every mismatch HOLDS. */
export async function drainExternalLegacySessions({context,databaseBinding,dependencies={},env=process.env}){
  if(env.NATIVE_FIXTURE_FLOW!=='legacy-first-switch'||env.NATIVE_FIXTURE_HOSTED!=='github-hosted-exclusive-vm')
    return {status:'DISABLED',fixtureOnly:false,attempted:false,reason:'FIXTURE_GATE_CLOSED'};
  const run=dependencies.run||productionRun,guard=dependencies.guard||(()=>verifyContext(CONTRACT.repository,CONTRACT.stateDirectory));
  const wait=dependencies.wait||(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
  const readIdentity=dependencies.readIdentity||(()=>secureJson(legacyExternalIdentityFile(CONTRACT.stateDirectory,context.owner)));
  const writeReceipt=dependencies.writeReceipt||null;
  const outputDirectory=dependencies.outputDirectory||env.NATIVE_FIXTURE_OUTPUT||null;
  const receipt={schema:EXTERNAL_DRAIN_SCHEMA,fixtureOnly:true,productionReceipt:false,productionMutation:false,
    operator:'OWNED_FIXTURE_MAINTENANCE_SESSION',runId:context.owner,
    fixtureGate:{flow:env.NATIVE_FIXTURE_FLOW,hosted:env.NATIVE_FIXTURE_HOSTED,outputBound:typeof outputDirectory==='string'&&outputDirectory.startsWith('/')},
    oldRuntimeIdentity:null,databaseBinding:null,matchedSessions:null,beforeCount:null,afterCount:null,
    termination:null,stoppedConfirmed:false,addressExclusive:false,failureReason:null,drainedAt:new Date().toISOString()};
  const fail=(reason,details={})=>{
    receipt.failureReason=reason;
    if(writeReceipt)writeReceipt(receipt);
    else if(outputDirectory&&outputDirectory.startsWith('/')){try{writeProtocolReceipt(outputDirectory,receipt);}catch{/* receipt path failure must not mask the HOLD */}}
    drainHold(reason,{externalDrainReceipt:receipt,...details});
  };
  if(!outputDirectory||!outputDirectory.startsWith('/'))fail('RECEIPT_OUTPUT_UNBOUND');
  guard();
  let identity;
  try{identity=readIdentity();}catch{fail('IDENTITY_RECORD_UNREADABLE');}
  try{validateLegacyExternalIdentity(identity,context);}catch(error){if(/^MAINTENANCE_HOLD=/.test(error?.message))fail('IDENTITY_RECORD_INVALID');throw error;}
  receipt.oldRuntimeIdentity={...identity.apiContainer,networkId:identity.networkId,clientIp:identity.clientIp,
    database:identity.database,databaseUser:identity.databaseUser};
  if(!databaseBinding||databaseBinding.containerId!==context.preSnapshot.db.id
    ||databaseBinding.imageId!==context.preSnapshot.db.imageId
    ||databaseBinding.containerStartedAt!==context.preSnapshot.db.startedAt)fail('DATABASE_BINDING_DRIFT');
  receipt.databaseBinding={containerId:databaseBinding.containerId,imageId:databaseBinding.imageId,
    containerStartedAt:databaseBinding.containerStartedAt};
  // Immutable stopped-identity re-verification: a restart or relaunch changes
  // StartedAt/RestartCount/Running; any drift forbids the drain entirely.
  let stopped;
  try{stopped=run(['inspect',identity.apiContainer.id,'--format',INSPECT_STOPPED]).split('\t').map(JSON.parse);}
  catch(error){if(/^MAINTENANCE_HOLD=/.test(error?.message))throw error;fail('STOPPED_INSPECT_FAILED');}
  const [actualId,imageId,restartCount,running,status,restarting,pid,startedAt]=stopped;
  if(actualId!==identity.apiContainer.id||imageId!==identity.apiContainer.imageId
    ||restartCount!==identity.apiContainer.restartCount||startedAt!==identity.apiContainer.startedAt
    ||running!==false||status!=='exited'||restarting!==false||pid!==0)fail('LEGACY_RUNTIME_IDENTITY_DRIFT');
  receipt.stoppedConfirmed=true;
  // The legacy container must remain disconnected and its old address must not
  // have been reassigned to any live peer (observer, candidate or otherwise).
  let members;
  try{const observed=run(['network','inspect',identity.networkId,'--format','{{json .Id}}\t{{json .Containers}}']).split('\t').map(JSON.parse);
    if(!Array.isArray(observed)||observed[0]!==identity.networkId||Object.getPrototypeOf(observed[1]||null)!==Object.prototype)fail('LEGACY_NETWORK_INSPECT_FAILED');
    members=Object.entries(observed[1]).map(([id,value])=>({id,ipv4Address:value?.IPv4Address}));}
  catch(error){if(/^MAINTENANCE_HOLD=/.test(error?.message))throw error;fail('LEGACY_NETWORK_INSPECT_FAILED');}
  if(members.some(member=>member.id===identity.apiContainer.id))fail('LEGACY_CONTAINER_REATTACHED');
  if(members.some(member=>stripPrefix(member.ipv4Address)===identity.clientIp))fail('LEGACY_ADDRESS_REASSIGNED');
  receipt.addressExclusive=true;
  const listSessions=()=>{
    const rows=JSON.parse(run(['exec','-i',databaseBinding.containerId,'/bin/sh','-c',DATABASE_OBSERVATION_PSQL],EXTERNAL_SESSION_LISTING_SQL));
    if(!Array.isArray(rows))fail('SESSION_LISTING_JSON');
    return rows.map(normalizeExternalSessionRow);
  };
  let before;
  try{before=listSessions();}catch(error){if(/^MAINTENANCE_HOLD=/.test(error?.message))throw error;fail('SESSION_LISTING_FAILED');}
  const plan=planExternalLegacySessionDrain({identity,sessions:before});
  receipt.matchedSessions=plan.matched;receipt.beforeCount=plan.matched.length;
  if(plan.status==='HOLD')fail(plan.reason,{unknownSessions:plan.unknown});
  if(plan.status==='EMPTY'){receipt.afterCount=0;receipt.termination=[];persist(receipt,writeReceipt,outputDirectory);
    return {status:'EMPTY',fixtureOnly:true,attempted:false,receipt};}
  const termination=[];
  for(const session of plan.matched){
    if(!/^[1-9][0-9]{0,9}$/.test(String(session.pid)))fail('TERMINATION_PID_INVALID',{pid:session.pid});
    const sql=`SELECT pg_terminate_backend(${session.pid}) AS terminated;`;
    let output;
    try{output=run(['exec','-i',databaseBinding.containerId,'/bin/sh','-c',EXTERNAL_DRAIN_PSQL],sql);}
    catch(error){if(/^MAINTENANCE_HOLD=/.test(error?.message))throw error;fail('TERMINATION_COMMAND_FAILED',{pid:session.pid});}
    if(output!=='t')fail('TERMINATION_RETURNED_FALSE',{pid:session.pid});
    termination.push({pid:session.pid,clientAddr:session.clientAddr,usename:session.usename,datname:session.datname,terminated:true});
  }
  receipt.termination=termination;
  await wait(1500);
  let after;
  try{after=listSessions();}catch(error){if(/^MAINTENANCE_HOLD=/.test(error?.message))throw error;fail('SESSION_LISTING_FAILED');}
  if(after.some(row=>plan.matched.some(matched=>matched.pid===row.pid)))fail('TERMINATION_INEFFECTIVE',{afterCount:after.length});
  const afterPlan=planExternalLegacySessionDrain({identity,sessions:after});
  if(afterPlan.status==='READY')fail('SESSION_REAPPEARED',{reappearedPids:afterPlan.matched.map(row=>row.pid)});
  if(afterPlan.status==='HOLD')fail(afterPlan.reason,{unknownSessions:afterPlan.unknown,afterCount:after.length});
  receipt.afterCount=0;
  persist(receipt,writeReceipt,outputDirectory);
  return {status:'DRAINED',fixtureOnly:true,attempted:true,receipt};
}
function persist(receipt,writeReceipt,outputDirectory){
  if(writeReceipt)writeReceipt(receipt);
  else writeProtocolReceipt(outputDirectory,receipt);
}
export function externalDrainReceiptDigest(receipt){return canonicalDigest(receipt);}
