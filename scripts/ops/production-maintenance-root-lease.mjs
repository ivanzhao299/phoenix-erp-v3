/** Real root control transport; not a candidate lease, release authority or
 * installed production registry. All production admission remains fail-closed. */
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {CONTRACT,verifyContext} from './production-config-guard.mjs';
import {executionEnv} from './capture-production-runtime.mjs';
import {DockerPostgresControlSession} from './background-control-coordinator.mjs';
import {DATABASE_OBSERVATION_PSQL} from './production-maintenance-database-observer.mjs';
import {assertLegacyMaintenanceAdmission} from './production-maintenance-admission.mjs';
import {MaintenanceReceiptStore,validateMaintenanceContext,bindingDigest,canonicalDigest,same,iso,runtimeTimestamp} from './production-maintenance-receipts.mjs';

const fail=code=>{throw Error(`MAINTENANCE_HOLD=ROOT_CONTROL_${code}`);};
const manual=()=>{throw Error('MAINTENANCE_HOLD=SESSION_CHILDREN_UNVERIFIED_MANUAL_RECOVERY_REQUIRED');};
const keys=(v,n)=>v&&Object.getPrototypeOf(v)===Object.prototype&&same(Object.keys(v).sort(),[...n].sort());
const positive=v=>Number.isSafeInteger(v)&&v>0;
const rawTime=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(v)&&iso(v.slice(0,23)+'Z');
const INSPECT='{{json .Id}}\t{{json .Image}}\t{{json .State.StartedAt}}\t{{json .State.Running}}\t{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}}';
const safeReason=e=>/^MAINTENANCE_HOLD=([A-Z0-9_]+)$/.exec(e?.message||'')?.[1]||'ROOT_CONTROL_UNVERIFIED_FAILURE';
const sha=text=>createHash('sha256').update(text).digest('hex');
const frozen=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))frozen(child);Object.freeze(value);}return value;};
export function validateRootDatabaseBinding(database,context){
  validateMaintenanceContext(context);
  if(!/^\d{1,20}-\d{1,10}$/.test(context.owner)||!keys(database,['containerId','imageId','containerStartedAt','postmasterStartedAt','clusterSystemIdentifier','databaseOid'])
    ||database.containerId!==context.preSnapshot.db.id||database.imageId!==context.preSnapshot.db.imageId||database.containerStartedAt!==context.preSnapshot.db.startedAt
    ||!runtimeTimestamp(database.containerStartedAt)||!rawTime(database.postmasterStartedAt)||!/^[1-9][0-9]{0,19}$/.test(database.clusterSystemIdentifier||'')
    ||!positive(database.databaseOid)||database.databaseOid>4294967295)fail('EXACT_DATABASE_BINDING_REQUIRED');
}
export function rootPsqlProgram(owner){
  if(!/^\d{1,20}-\d{1,10}$/.test(owner||''))fail('OWNER_REQUIRED');
  return `case "\${POSTGRES_USER-}" in ''|[0-9]*|*[!A-Za-z0-9_]*) exit 64;; esac
case "\${POSTGRES_DB-}" in ''|[0-9]*|*[!A-Za-z0-9_]*) exit 64;; esac
[ "\${#POSTGRES_USER}" -le 63 ] && [ "\${#POSTGRES_DB}" -le 63 ] || exit 64
exec /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin PGCONNECT_TIMEOUT=3 PGAPPNAME=phoenix-maintenance-control:${owner} PGOPTIONS='-c default_transaction_read_only=on -c search_path=pg_catalog -c statement_timeout=3000 -c idle_in_transaction_session_timeout=5000' /usr/local/bin/psql --host=/var/run/postgresql --port=5432 --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --no-password -X -qAt --set=ON_ERROR_STOP=1`;
}
function observationSql(owner,identity){
  rootPsqlProgram(owner);
  if(identity&&(!keys(identity,['pid','databaseOid','backendStartedAt','applicationName'])||!positive(identity.pid)||identity.pid>2147483647
    ||!positive(identity.databaseOid)||!rawTime(identity.backendStartedAt)||identity.applicationName!==`phoenix-maintenance-control:${owner}`))fail('SERVER_IDENTITY_REQUIRED');
  const where=`application_name='phoenix-maintenance-control:${owner}'${identity?` OR pid=${identity.pid}`:''}`;
  return `BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
SET LOCAL statement_timeout='3s';
SET LOCAL lock_timeout='1s';
SELECT json_build_object(
'sampledAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
'databaseOid',(SELECT oid::bigint FROM pg_catalog.pg_database WHERE datname=current_database()),
'postmasterStartedAt',to_char(pg_catalog.pg_postmaster_start_time() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
'clusterSystemIdentifier',(SELECT system_identifier::text FROM pg_catalog.pg_control_system()),
'serverVersionNum',current_setting('server_version_num')::integer,
'statsVisible',((SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user) OR pg_catalog.pg_has_role(current_user,'pg_read_all_stats','USAGE')),
'backends',(SELECT coalesce(json_agg(json_build_object('pid',pid,'databaseOid',datid::bigint,'backendStartedAt',to_char(backend_start AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'applicationName',application_name,'backendType',backend_type) ORDER BY pid),'[]'::json) FROM pg_catalog.pg_stat_activity WHERE ${where}),
'locks',(SELECT coalesce(json_agg(json_build_object('pid',pid,'databaseOid',database::bigint,'namespace',classid::bigint,'key',objid::bigint,'keyForm',objsubid,'mode',mode,'granted',granted) ORDER BY pid,database,classid,objid,objsubid,mode),'[]'::json) FROM pg_catalog.pg_locks WHERE locktype='advisory' AND pid IN (SELECT pid FROM pg_catalog.pg_stat_activity WHERE ${where})${identity?` OR locktype='advisory' AND pid=${identity.pid}`:''})
);
ROLLBACK;
`;
}
const productionRun=(args,input,{timeoutMs=10000}={})=>{try{return execFileSync('/usr/bin/docker',args,{input,env:executionEnv(),encoding:'utf8',timeout:timeoutMs,maxBuffer:65536,stdio:['pipe','pipe','pipe']}).trim();}catch{fail('BOUNDED_OBSERVATION_FAILED');}};
function selfSql(identity){
  return `SELECT pg_catalog.pg_backend_pid()=${identity.pid} AND current_setting('application_name')='${identity.applicationName}' AND (SELECT oid::bigint FROM pg_catalog.pg_database WHERE datname=current_database())=${identity.databaseOid} AND (SELECT to_char(backend_start AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') FROM pg_catalog.pg_stat_activity WHERE pid=pg_catalog.pg_backend_pid())='${identity.backendStartedAt}';`;
}
async function bounded(work,ms,code='CLIENT_CLOSE_TIMEOUT'){let timer;try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(`MAINTENANCE_HOLD=ROOT_CONTROL_${code}`)),ms);})]);}finally{clearTimeout(timer);}}

export class RootControlLease {
  #identity=null; #child=null; #childClose=null; #childError=false; #spawnAttempted=false; #attemptPersisted=false; #closing=false; #closeTask=null;
  #status='NEW'; #allowed=new Set(['SELECT true;','SELECT pg_try_advisory_lock(17455,1);','SELECT pg_try_advisory_lock(17455,2);']); #attempted=new Set();
  constructor({context,approval,expectedStateDigest,database,signal,registerOwnedChild},dependencies={}){
    validateRootDatabaseBinding(database,context);
    if(!/^[a-f0-9]{64}$/.test(expectedStateDigest||'')||typeof registerOwnedChild!=='function'
      ||(signal&&(!(signal instanceof AbortSignal))))fail('OWNED_REQUEST_REQUIRED');
    Object.defineProperties(this,{context:{value:frozen(structuredClone(context))},database:{value:frozen(structuredClone(database))},contextDigest:{value:bindingDigest(context)},
      approval:{value:frozen(structuredClone(approval))},expectedStateDigest:{value:expectedStateDigest},signal:{value:signal}});
    this.store=dependencies.store||new MaintenanceReceiptStore(context);
    this.guard=dependencies.guard||(()=>verifyContext(CONTRACT.repository,CONTRACT.stateDirectory));
    this.admit=dependencies.admit||(options=>assertLegacyMaintenanceAdmission(options,{verifyAuthority:dependencies.verifyAuthority}));
    this.now=dependencies.now||Date.now;this.monotonicNow=dependencies.monotonicNow||(()=>performance.now());this.run=dependencies.run||productionRun;
    const launch=dependencies.spawn||spawn;
    this.startFile=path.join(this.store.directory,`maintenance-root-control-start-${context.owner}.json`);
    this.serverFile=path.join(this.store.directory,`maintenance-root-control-server-${context.owner}.json`);
    this.releaseFile=path.join(this.store.directory,`maintenance-root-control-released-${context.owner}.json`);
    this.incidentFile=path.join(this.store.directory,`maintenance-root-control-incident-${context.owner}.json`);
    this.session=new DockerPostgresControlSession({commandTimeoutMs:5000},{spawn:()=>{
      this.checkpoint(true);this.#spawnAttempted=true;
      const child=launch('/usr/bin/docker',['exec','-i',this.database.containerId,'/bin/sh','-c',rootPsqlProgram(this.context.owner)],{env:executionEnv(),stdio:['pipe','pipe','pipe']});
      // Save before registration can throw; the base class has not assigned its
      // .child yet. Keep the original process even across partial startup.
      this.#child=child;child.on('error',()=>{this.#childError=true;});
      this.#childClose=new Promise(resolve=>child.once('close',resolve));
      const result=registerOwnedChild(child);
      if(result?.registered!==true||result.pid!==child.pid)fail('CHILD_REGISTRATION_UNVERIFIED');
      this.checkpoint(true);return child;
    }});
    const query=this.session.query.bind(this.session);
    this.session.query=sql=>{
      if(!this.#allowed.has(sql))fail('FIXED_QUERY_REQUIRED');
      if(sql.startsWith('SELECT pg_try_advisory_lock')){if(this.#attempted.has(sql))fail('REENTRANT_LOCK_ATTEMPT');this.#attempted.add(sql);}
      return query(sql);
    };
  }
  checkpoint(start=false){
    if(this.#closing)fail('CLOSING');
    if(this.#status==='FAILED')fail('LEASE_POISONED');
    this.guard();if(this.signal?.aborted)fail('ABORTED');
    if(this.now()<Date.parse(this.context.window.start)||this.now()>=Date.parse(this.context.window.end))fail('WINDOW_EXPIRED');
    const state=this.store.readOwnedState();
    if(state?.contextDigest!==this.contextDigest)fail('OWNER_STATE_CHANGED');
    if(start){if(state.phase!=='CANDIDATE_REPLACED'||state.stateDigest!==this.expectedStateDigest)fail('START_STATE_CHANGED');
      this.store.assertOwnedIntent('START_CANDIDATE','CANDIDATE_REPLACED',state.stateDigest);}
  }
  assertOriginalClient(){
    if(!this.#child||this.session.child!==this.#child||this.#child.killed||this.#childError
      ||this.#child.exitCode!==null||this.#child.signalCode!==null||this.session.handshakeVerified!==true||!this.session.connected())fail('CLIENT_CHANGED_OR_LOST');
  }
  assertHeld(){
    if(this.#status!=='HELD'||this.#closing)fail('LEASE_NOT_HELD');this.checkpoint();this.assertOriginalClient();
  }
  budget({timeoutMs=30000,signal}={}){
    if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000||(signal&&!(signal instanceof AbortSignal)))fail('OPERATION_BUDGET_REQUIRED');
    const start=this.now(),monoStart=this.monotonicNow(),deadline=start+timeoutMs,monoDeadline=monoStart+timeoutMs;
    let lastWall=start,lastMono=monoStart;
    const check=()=>{
      if(signal?.aborted)fail('OPERATION_ABORTED');
      const wall=this.now(),mono=this.monotonicNow();
      if(![start,monoStart,wall,mono].every(Number.isFinite)||wall<lastWall||mono<lastMono||wall>=deadline||mono>=monoDeadline)fail('OPERATION_DEADLINE');
      lastWall=wall;lastMono=mono;
    };
    return {check,remaining:()=>{check();const left=Math.floor(Math.min(deadline-lastWall,monoDeadline-lastMono));if(left<1)fail('OPERATION_DEADLINE');return left;}};
  }
  observedRun(args,input,budget){
    budget.check();const timeoutMs=Math.min(10000,budget.remaining()),value=this.run(args,input,{timeoutMs});budget.check();return value;
  }
  async query(sql,budget){
    budget.check();this.session.commandTimeoutMs=Math.min(5000,budget.remaining());const value=await this.session.query(sql);budget.check();return value;
  }
  pin(budget){
    let values;try{values=this.observedRun(['inspect',this.database.containerId,'--format',INSPECT],undefined,budget).split('\t').map(JSON.parse);}catch(error){if(error?.message?.includes('OPERATION_'))throw error;fail('DATABASE_RUNTIME_READ_FAILED');}
    if(!same(values,[this.database.containerId,this.database.imageId,this.database.containerStartedAt,true,'healthy']))fail('DATABASE_RUNTIME_CHANGED');return values;
  }
  scan(mode,budget){
    if(!['DISCOVER','HELD','RELEASED'].includes(mode))fail('OBSERVATION_MODE');
    budget.check();this.guard();budget.check();const before=this.pin(budget),start=this.now(),sql=observationSql(this.context.owner,this.#identity);let value;
    try{const raw=this.observedRun(['exec','-i',this.database.containerId,'/bin/sh','-c',DATABASE_OBSERVATION_PSQL],sql,budget);if(Buffer.byteLength(raw)>32768)fail('OBSERVATION_SIZE');value=JSON.parse(raw);}catch(error){if(error?.message?.includes('OPERATION_'))throw error;fail('OBSERVATION_UNVERIFIED');}
    budget.check();this.guard();budget.check();if(!same(before,this.pin(budget)))fail('DATABASE_RUNTIME_CHANGED');
    const end=this.now();
    if(!keys(value,['sampledAt','databaseOid','postmasterStartedAt','clusterSystemIdentifier','serverVersionNum','statsVisible','backends','locks'])
      ||!iso(value.sampledAt)||end<start||end-start>30000||Date.parse(value.sampledAt)<start-3000||Date.parse(value.sampledAt)>end+3000
      ||value.databaseOid!==this.database.databaseOid||value.postmasterStartedAt!==this.database.postmasterStartedAt
      ||value.clusterSystemIdentifier!==this.database.clusterSystemIdentifier||!Number.isSafeInteger(value.serverVersionNum)||value.serverVersionNum<160000||value.serverVersionNum>=190000
      ||value.statsVisible!==true||!Array.isArray(value.backends)||!Array.isArray(value.locks))fail('DATABASE_IDENTITY_OR_VISIBILITY');
    if(mode==='RELEASED'){
      if(!this.#identity||value.backends.length||value.locks.length)fail('SERVER_BACKEND_OR_LOCKS_REMAIN');
    }else{
      const row=value.backends[0];
      if(value.backends.length!==1||!keys(row,['pid','databaseOid','backendStartedAt','applicationName','backendType'])||!positive(row.pid)||row.pid>2147483647
        ||row.databaseOid!==this.database.databaseOid||!rawTime(row.backendStartedAt)||row.backendType!=='client backend'
        ||row.applicationName!==`phoenix-maintenance-control:${this.context.owner}`)fail('SERVER_BACKEND_NOT_UNIQUE');
      const identity={pid:row.pid,databaseOid:row.databaseOid,backendStartedAt:row.backendStartedAt,applicationName:row.applicationName};
      if(this.#identity&&!same(this.#identity,identity))fail('SERVER_IDENTITY_CHANGED');
      if(mode==='DISCOVER'){if(value.locks.length)fail('PREEXISTING_ROOT_LOCKS');}
      else if(mode==='HELD'){
        const locks=[1,2].map(key=>({pid:identity.pid,databaseOid:identity.databaseOid,namespace:17455,key,keyForm:2,mode:'ExclusiveLock',granted:true}));
        if(!same(value.locks,locks))fail('EXACT_EXCLUSIVE_LOCKS_REQUIRED');
      }else fail('OBSERVATION_MODE');
    }
    return {schema:'phoenix.root-control-server-observation/v1',mode,contextDigest:this.contextDigest,database:structuredClone(this.database),
      observedAt:new Date(end).toISOString(),querySha256:sha(sql),observation:structuredClone(value),productionReleaseAuthorized:false,candidateProof:false,continuousLegacyDrainProof:false,registryInstalled:false};
  }
  async acquire(options={}){
    const budget=this.budget({signal:this.signal,...options});
    if(this.#status!=='NEW')fail('ATTEMPT_REUSE');this.#status='ADMITTING';this.checkpoint(true);budget.check();
    await bounded(this.admit({context:this.context,approval:this.approval,operation:'START_CANDIDATE',expectedPhase:'CANDIDATE_REPLACED',expectedStateDigest:this.expectedStateDigest,requiredBudgetMs:120000}),budget.remaining(),'OPERATION_DEADLINE');
    budget.check();this.checkpoint(true);
    const attempt={schema:'phoenix.root-control-launch-intent/v1',contextDigest:this.contextDigest,owner:this.context.owner,database:this.database,
      previousFloorSha:this.context.previousFloorSha,targetSha:this.context.targetSha,applicationName:`phoenix-maintenance-control:${this.context.owner}`,
      parentPid:process.pid,programSha256:sha(rootPsqlProgram(this.context.owner)),createdAt:new Date(this.now()).toISOString()};
    this.store.immutable(this.startFile,attempt);this.#attemptPersisted=true;this.#status='STARTING';
    try{
      this.session.commandTimeoutMs=Math.min(5000,budget.remaining());await this.session.start();budget.check();this.checkpoint(true);this.assertOriginalClient();
      const discovered=this.scan('DISCOVER',budget),row=discovered.observation.backends[0];
      this.assertOriginalClient();
      const identity={pid:row.pid,databaseOid:row.databaseOid,backendStartedAt:row.backendStartedAt,applicationName:row.applicationName};
      const self=selfSql(identity);this.#allowed.add(self);
      if(await this.query(self,budget)!==true)fail('HOLDING_CHANNEL_IDENTITY_MISMATCH');
      this.checkpoint(true);this.assertOriginalClient();this.#identity=identity;
      this.store.immutable(this.serverFile,{schema:'phoenix.root-control-identity/v1',contextDigest:this.contextDigest,identity,database:this.database,selfQuerySha256:sha(self)});
      for(const key of [1,2]){this.checkpoint(true);this.assertOriginalClient();if(await this.query(`SELECT pg_try_advisory_lock(17455,${key});`,budget)!==true)fail('LOCK_CONTENDED');this.checkpoint(true);this.assertOriginalClient();}
      const observed=this.scan('HELD',budget);this.checkpoint(true);this.assertOriginalClient();budget.check();this.#status='HELD';this.initialObservation=observed;return this;
    }catch(error){
      if(this.#spawnAttempted){
        if(this.#identity){try{await this.close();}catch{manual();}}
        else{try{await this.closeUnknown();}catch{}this.incident('STARTUP_IDENTITY_UNVERIFIED');manual();}
      }
      throw Error(`MAINTENANCE_HOLD=${safeReason(error)}`);
    }
  }
  async observe(options={}){
    const budget=this.budget({signal:this.signal,...options});
    try{
      this.assertHeld();
      const self=selfSql(this.#identity);if(await this.query(self,budget)!==true)fail('HOLDING_CHANNEL_IDENTITY_MISMATCH');
      this.assertHeld();const observed=this.scan('HELD',budget);this.assertHeld();budget.check();return observed;
    }catch(error){this.#status='FAILED';throw Error(`MAINTENANCE_HOLD=${safeReason(error)}`);}
  }
  incident(reason){
    if(!this.#attemptPersisted)return;
    try{this.store.immutable(this.incidentFile,{schema:'phoenix.root-control-incident/v1',contextDigest:this.contextDigest,owner:this.context.owner,
      reason,clientPid:this.#child?.pid||null,serverIdentity:this.#identity,localClientClose:'DOES_NOT_PROVE_REMOTE_PROCESS_OR_SERVER_RELEASE',
      outcome:'MANUAL_RECOVERY_REQUIRED',observedAt:new Date(this.now()).toISOString()});}catch{}
  }
  async closeUnknown(budget=this.budget()){
    this.#status='UNKNOWN';this.#closing=true;
    budget.check();this.guard();budget.check();
    if(this.#child){try{this.#child.stdin.end();}catch{}if(this.#childClose)await bounded(this.#childClose,Math.min(5000,budget.remaining()));budget.check();}
  }
  close(options={}){
    return this.#closeTask??=(async()=>{
      this.#closing=true;
      if(!this.#spawnAttempted){this.#status='CLOSED_NOT_STARTED';fail('NOT_STARTED');}
      try{
        const budget=this.budget(options);budget.check();
        this.guard();
        if(!this.#identity){await this.closeUnknown(budget);fail('SERVER_IDENTITY_UNVERIFIED');}
        // Pure cleanup deliberately does not require the old window, latest
        // main, START intent or still-present current-owner marker.
        let recordsValid=false;
        try{const attempt=this.store.read(this.startFile),server=this.store.read(this.serverFile);
          recordsValid=attempt.contextDigest===this.contextDigest&&server.contextDigest===this.contextDigest&&same(attempt.database,this.database)&&same(server.identity,this.#identity);
        }catch{}
        // Always attempt conservative cleanup of the saved original client.
        // A missing identity receipt must not prevent EOF; it still prevents
        // claiming verified release, even if a server-gone snapshot succeeds.
        const originalClient=this.session.child===this.#child;
        try{this.#child.stdin.end();}catch{}
        await bounded(this.#childClose,Math.min(5000,budget.remaining()));budget.check();
        const clientStillOriginal=this.session.child===this.#child;
        if(clientStillOriginal)await this.session.close();
        const observation=this.scan('RELEASED',budget);budget.check();
        if(!recordsValid||!originalClient||!clientStillOriginal||this.#childError)fail('ORIGINAL_RESOURCE_BINDING_CHANGED');
        const released={schema:'phoenix.root-control-release/v1',contextDigest:this.contextDigest,owner:this.context.owner,identity:this.#identity,
          localClientClosed:true,ownedBackendGone:true,serverObservationSha256:canonicalDigest(observation),observedAt:new Date(this.now()).toISOString(),
          candidateProof:false,productionReleaseAuthorized:false};
        this.store.immutable(this.releaseFile,released);this.#status='RELEASE_VERIFIED';return released;
      }catch{this.#status='UNKNOWN';this.incident('RELEASE_UNVERIFIED');manual();}
    })();
  }
}
export async function acquireRootControlLease(options,dependencies={}){return new RootControlLease(options,dependencies).acquire({timeoutMs:options.timeoutMs,signal:options.signal});}
