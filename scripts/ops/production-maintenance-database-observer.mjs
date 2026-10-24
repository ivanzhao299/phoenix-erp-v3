/** Fixed read-only PostgreSQL observation. Not a drain or approval producer.
 * Aggregate counts never prove executor ownership or reconcile external effects. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { CONTRACT, verifyContext } from './production-config-guard.mjs';
import { executionEnv } from './capture-production-runtime.mjs';

const ID = /^[a-f0-9]{64}$/, SHA = /^[a-f0-9]{40}$/;
const hold = code => { throw new Error(`MAINTENANCE_DATABASE_HOLD=${code}`); };
const iso = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{1,9}Z$/.test(value) && Number.isFinite(Date.parse(value));
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const KEYS = ['sampledAt','postmasterStartedAt','clusterSystemIdentifier','databaseOid','serverVersionNum','statsVisibilityComplete','currentDatabaseClientSessions','otherDatabaseClientSessions','clientSessionsWithOpenTransaction','idleInTransactionSessions','currentDatabasePreparedTransactions','otherDatabasePreparedTransactions'];
const COUNTS = KEYS.filter(key => /Sessions|Transactions/.test(key));
const INSPECT = '{{json .Id}}\t{{json .Image}}\t{{json .State.StartedAt}}\t{{json .State.Running}}\t{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}}';
// Static program only: consumes container-local credentials without exporting or
// inspecting them. No caller SQL, username, database, shell or executable input.
export const DATABASE_OBSERVATION_PSQL = `case "\${POSTGRES_USER-}" in ''|[0-9]*|*[!A-Za-z0-9_]*) exit 64;; esac
case "\${POSTGRES_DB-}" in ''|[0-9]*|*[!A-Za-z0-9_]*) exit 64;; esac
[ "\${#POSTGRES_USER}" -le 63 ] && [ "\${#POSTGRES_DB}" -le 63 ] || exit 64
exec /usr/bin/timeout -s TERM -k 1 8 /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin PGCONNECT_TIMEOUT=3 PGAPPNAME=phoenix-maintenance-observer PGOPTIONS='-c default_transaction_read_only=on -c search_path=pg_catalog -c statement_timeout=3000 -c idle_in_transaction_session_timeout=5000' /usr/local/bin/psql --host=/var/run/postgresql --port=5432 --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --no-password -X -qAt --set=ON_ERROR_STOP=1`;

export const DATABASE_OBSERVATION_SQL = `BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
SET LOCAL statement_timeout='3s';
SET LOCAL lock_timeout='1s';
SET LOCAL idle_in_transaction_session_timeout='5s';
SELECT json_build_object(
 'sampledAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 'postmasterStartedAt',to_char(pg_catalog.pg_postmaster_start_time() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'clusterSystemIdentifier',(SELECT system_identifier::text FROM pg_catalog.pg_control_system()),
 'databaseOid',(SELECT oid::bigint FROM pg_catalog.pg_database WHERE datname=current_database()),
 'serverVersionNum',current_setting('server_version_num')::integer,
 'statsVisibilityComplete',((SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user) OR pg_catalog.pg_has_role(current_user,'pg_read_all_stats','USAGE')),
 'currentDatabaseClientSessions',(SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_catalog.pg_backend_pid() AND datid=(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database())),
 'otherDatabaseClientSessions',(SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_catalog.pg_backend_pid() AND datid IS DISTINCT FROM (SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database())),
 'clientSessionsWithOpenTransaction',(SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_catalog.pg_backend_pid() AND xact_start IS NOT NULL),
 'idleInTransactionSessions',(SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_catalog.pg_backend_pid() AND state IN ('idle in transaction','idle in transaction (aborted)')),
 'currentDatabasePreparedTransactions',(SELECT count(*) FROM pg_catalog.pg_prepared_xacts WHERE database=current_database()),
 'otherDatabasePreparedTransactions',(SELECT count(*) FROM pg_catalog.pg_prepared_xacts WHERE database<>current_database())
);
ROLLBACK;
`;
export const DATABASE_OBSERVATION_SQL_SHA256 = createHash('sha256').update(DATABASE_OBSERVATION_SQL).digest('hex');
export const DATABASE_IDENTITY_SQL = `BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
SET LOCAL statement_timeout='3s';
SET LOCAL lock_timeout='1s';
SELECT json_build_object(
 'postmasterStartedAt',to_char(pg_catalog.pg_postmaster_start_time() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'clusterSystemIdentifier',(SELECT system_identifier::text FROM pg_catalog.pg_control_system()),
 'databaseOid',(SELECT oid::bigint FROM pg_catalog.pg_database WHERE datname=current_database())
);
ROLLBACK;
`;
/** Discover the actual server identity used by the original root lease. Keep
 * PostgreSQL microseconds: rounding them breaks the later exact backend pin.
 * This read grants no ownership, quiescence, release or replay permission. */
export function discoverMaintenanceDatabaseIdentity(pin, dependencies = {}) {
  const fields=['containerId','imageId','containerStartedAt'];
  if (!pin || Object.getPrototypeOf(pin)!==Object.prototype || !same(Object.keys(pin).sort(),fields.sort())
    || !ID.test(pin.containerId) || !/^sha256:[a-f0-9]{64}$/.test(pin.imageId) || !iso(pin.containerStartedAt)) hold('EXACT_DATABASE_RUNTIME_PIN_REQUIRED');
  const guard=dependencies.guard||(()=>verifyContext(CONTRACT.repository,CONTRACT.stateDirectory));
  const run=dependencies.run||productionRun;
  const verify=()=>{
    let value;
    try { value=run(['inspect',pin.containerId,'--format',INSPECT]).split('\t').map(JSON.parse); }
    catch { hold('DATABASE_RUNTIME_READ_FAILED'); }
    if (!same(value,[pin.containerId,pin.imageId,pin.containerStartedAt,true,'healthy'])) hold('DATABASE_RUNTIME_DRIFT');
  };
  guard(); verify(); let identity;
  try { identity=JSON.parse(run(['exec','-i',pin.containerId,'/bin/sh','-c',DATABASE_OBSERVATION_PSQL],DATABASE_IDENTITY_SQL)); }
  catch { hold('DATABASE_IDENTITY_READ_FAILED'); }
  if (!identity || Object.getPrototypeOf(identity)!==Object.prototype
    || !same(Object.keys(identity).sort(),['postmasterStartedAt','clusterSystemIdentifier','databaseOid'].sort())
    || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$/.test(identity.postmasterStartedAt||'') || !iso(identity.postmasterStartedAt)
    || !/^[1-9][0-9]{0,19}$/.test(identity.clusterSystemIdentifier||'') || !Number.isSafeInteger(identity.databaseOid) || identity.databaseOid<1) hold('DATABASE_IDENTITY_FIELDS');
  guard(); verify(); return {...pin,...identity};
}
function productionRun(args, input) {
  try { return execFileSync('/usr/bin/docker',args,{input,env:executionEnv(),encoding:'utf8',timeout:10000,maxBuffer:65536,stdio:['pipe','pipe','pipe']}).trim(); }
  catch { hold('BOUNDED_READ_FAILED'); } // Never relay raw stderr or command/env.
}
export function validateDatabaseObservation(value, binding, { startedAt, finishedAt }) {
  validateBinding(binding);
  if (!value || Object.getPrototypeOf(value)!==Object.prototype || !same(Object.keys(value).sort(),[...KEYS].sort())) hold('OBSERVATION_FIELDS');
  if (!iso(value.sampledAt) || !iso(startedAt) || !iso(finishedAt) || Date.parse(finishedAt)<Date.parse(startedAt)
    || Date.parse(finishedAt)-Date.parse(startedAt)>30000 || Date.parse(value.sampledAt)<Date.parse(startedAt)-30000 || Date.parse(value.sampledAt)>Date.parse(finishedAt)+30000) hold('OBSERVATION_TIME');
  if (value.postmasterStartedAt!==binding.postmasterStartedAt || value.clusterSystemIdentifier!==binding.clusterSystemIdentifier || value.databaseOid!==binding.databaseOid || !Number.isSafeInteger(value.serverVersionNum) || value.serverVersionNum<160000 || value.serverVersionNum>=190000
    || typeof value.statsVisibilityComplete!=='boolean' || COUNTS.some(key=>!Number.isSafeInteger(value[key])||value[key]<0)) hold('OBSERVATION_IDENTITY_OR_COUNTS');
  if (value.idleInTransactionSessions>value.clientSessionsWithOpenTransaction
    || value.clientSessionsWithOpenTransaction>value.currentDatabaseClientSessions+value.otherDatabaseClientSessions) hold('OBSERVATION_INCONSISTENT');
  const reasons=['EXECUTOR_OWNERSHIP_UNVERIFIED','PERSISTENT_TASK_COVERAGE_UNVERIFIED','EXTERNAL_EFFECT_RECONCILIATION_UNVERIFIED','CONTINUOUS_INGRESS_UNVERIFIED'];
  if (!value.statsVisibilityComplete) reasons.push('STATS_VISIBILITY_INCOMPLETE');
  if (COUNTS.some(key=>value[key]>0)) reasons.push('DATABASE_WORK_OBSERVED');
  return { schema:'phoenix.maintenance-database-snapshot/v1',binding:structuredClone(binding),querySha256:DATABASE_OBSERVATION_SQL_SHA256,
    startedAt,finishedAt,observation:structuredClone(value),status:'SNAPSHOT_ONLY',result:'HOLD',reasons,
    ownershipComplete:false,persistentRunning:null,persistentQueued:null,continuousDrainProof:false,
    reconciliationApproved:false,productionMutation:false,admissionOrApprovalGranted:false };
}
function validateBinding(binding) {
  const fields=['containerId','imageId','containerStartedAt','postmasterStartedAt','clusterSystemIdentifier','databaseOid','previousFloorSha','targetSha'];
  if (!binding || Object.getPrototypeOf(binding)!==Object.prototype || !same(Object.keys(binding).sort(),fields.sort())
    || !ID.test(binding.containerId) || !/^sha256:[a-f0-9]{64}$/.test(binding.imageId) || !iso(binding.containerStartedAt)
    || !iso(binding.postmasterStartedAt) || !/^[1-9][0-9]{0,19}$/.test(binding.clusterSystemIdentifier || '')
    || !Number.isSafeInteger(binding.databaseOid) || binding.databaseOid<1 || !SHA.test(binding.previousFloorSha) || !SHA.test(binding.targetSha)) hold('EXACT_DATABASE_BINDING_REQUIRED');
}
/** The injected runner is for an explicitly owned isolated test. Production
 * always retains the real root/trusted-path/FD9 guard, fixed local Docker socket
 * and exact pre/post DB runtime pin. This function installs no release registry. */
export function collectMaintenanceDatabaseSnapshot(binding, dependencies={}) {
  validateBinding(binding);
  const guard=dependencies.guard||(()=>verifyContext(CONTRACT.repository,CONTRACT.stateDirectory));
  const run=dependencies.run||productionRun, now=dependencies.now||(()=>new Date().toISOString());
  guard();
  const pin=()=>{
    let row;try{row=run(['inspect',binding.containerId,'--format',INSPECT]).split('\t').map(JSON.parse);}catch{hold('DATABASE_RUNTIME_READ_FAILED');}
    if(!same(row,[binding.containerId,binding.imageId,binding.containerStartedAt,true,'healthy']))hold('DATABASE_RUNTIME_DRIFT');
    return row;
  };
  const before=pin(),startedAt=now();
  let value;
  try{const raw=run(['exec','-i',binding.containerId,'/bin/sh','-c',DATABASE_OBSERVATION_PSQL],DATABASE_OBSERVATION_SQL);if(Buffer.byteLength(raw)>16384)hold('OBSERVATION_SIZE');value=JSON.parse(raw);}catch{hold('DATABASE_READ_OR_JSON_FAILED');}
  const finishedAt=now();guard();if(!same(before,pin()))hold('DATABASE_RUNTIME_DRIFT');
  return validateDatabaseObservation(value,binding,{startedAt,finishedAt});
}
