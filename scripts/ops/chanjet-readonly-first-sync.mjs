import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { CONTRACT,guardProduction,requireCleanMain,verifyContext } from './production-config-guard.mjs';
import { captureRuntime } from './capture-production-runtime.mjs';
import { atomicState as productionAtomicState } from './production-deployment-state.mjs';
import { auditMappingScope,readDatabaseEvidence } from './chanjet-readonly-production-audit.mjs';
const endpoint='http://127.0.0.1:3100/api/chanjet/integration/alignment/';
export function businessFingerprints(read = readDatabaseEvidence) {
  const tables = ['fin_ar_ledger','fin_ar_invoices','fin_ap_invoices','fin_cash_transactions','inv_batches','inv_ledger','sal_sales_orders'];
  const pairs = tables.map(table => `'${table}', (SELECT json_build_object('count', COUNT(*), 'digest', md5(COALESCE(string_agg(md5(row_to_json(t)::text), '' ORDER BY md5(row_to_json(t)::text)), ''))) FROM ${table} t)`);
  return read(`SELECT json_build_object(${pairs.join(',')});`);
}
// R4.2d wiring: the durable execution binding handed over by the controlled
// root workflow — registration and the probe share THIS execution; the first
// sync joins the same cumulative budget and DB-owned deadline. The binding is
// required and re-verified against the trusted admission row BEFORE the
// protected enqueue (and therefore before any provider HTTP the worker could
// make); every bound attribute except the name is read from the row.
const EXECUTION_BINDING_RE = /^[A-Za-z0-9_-]{1,128}$/;
// Server-side cancel points derived EXACTLY from the caller's budget — no
// fixed floor expansion: the server always cancels before the client kill.
export const stopChannelStatementBounds = (timeoutMs) => {
  const statementMs = Math.max(1, Math.min(timeoutMs - 250, 20_000));
  return { statementMs, lockMs: Math.max(1, Math.min(statementMs, 3_000)) };
};
// canonical JSON — exported for consumers that must compare approved vs
// stored bindings byte-for-byte (the chain's bounded HOLD finalizer)
export const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};
// Every statement is semicolon-terminated: the production read adapters wrap
// the SQL in a BEGIN READ ONLY … ROLLBACK template — an unterminated
// statement would swallow the ROLLBACK and fail the read.
const admissionManifestEvidenceSql = (executionId) => `SELECT manifest AS e FROM chanjet_execution_admissions WHERE execution_id = '${executionId}';`;
const jobProofEvidenceSql = (orchestrationRunId) => `SELECT json_build_object(
  'status', status, 'summary', result_summary, 'scope', request_scope
) AS e FROM chanjet_sync_jobs WHERE request_scope->>'orchestrationRunId' = '${orchestrationRunId}' ORDER BY id DESC LIMIT 1;`;
const ordinalsProofEvidenceSql = (executionId, leaseId, ordinals) => `SELECT json_build_object('n', count(*)) AS e FROM chanjet_execution_requests
  WHERE execution_id = '${executionId}' AND phase = 'SYNCING' AND lease_id = '${leaseId}'
    AND kind = 'BUSINESS' AND status = 'ACKNOWLEDGED' AND result = 'OK'
    AND ordinal = ANY(ARRAY[${ordinals.map((o) => Number(o) | 0).join(',')}]::int[]);`;
const admissionVerifiedEvidenceSql = (executionId) => `SELECT json_build_object(
  'phase', phase, 'hold_reason', hold_reason, 'lease_id', lease_id
) AS e FROM chanjet_execution_admissions WHERE execution_id = '${executionId}' AND phase = 'VERIFIED';`;
const admissionOwnerColumnSql = (executionId) => `SELECT json_build_object(
  'phase', phase, 'hold_reason', hold_reason, 'lease_id', lease_id,
  'deadline_at', deadline_at, 'approval_id', approval_id, 'floor_sha', floor_sha,
  'owner_id', owner_id
) AS e FROM chanjet_execution_admissions WHERE execution_id = '${executionId}';`;
// The REAL bounded-guard stop implementation — the production wrapper AND
// every test execute THIS same function. Trusted delivery locations: the
// compiled reviewed modules come from repoRoot/apps/api/dist (the reviewed
// checkout), the runtime dependencies from repoRoot's api workspace, and the
// stop channel is the deployment's standard PostgreSQL access environment
// (PGHOST/PGUSER/PGPASSWORD/PGPORT/PGDATABASE). Initialization and connection
// acquisition are bounded by a hard ceiling; holdExecution is awaited to
// completion BEFORE the executor and connection are disposed.
export function makeDurableStop({ distRoot, pgUrl, executor, readEvidence, handover, ceilingMs = 10_000 } = {}) {
  return async (classification) => {
    if (!executor && !pgUrl) return 'UNCONFIRMED'; // no stop channel configured: accurately unconfirmed
    // the compiled reviewed modules are delivered from distRoot (the
    // deployment delivers them from the DEPLOYED API IMAGE; the wrapper
    // delivers them from the reviewed checkout) — runtime dependencies
    // resolve by walking up to the sibling node_modules
    let entryRequire;
    let store;
    let guardExecutor;
    let settled = false;
    let timer;
    try {
      // bare specifiers resolve by walking up from distRoot to the sibling
      // node_modules (production: /app/dist + /app/node_modules siblings)
      entryRequire = createRequire(pathToFileURL(path.join(distRoot, 'modules/chanjet/chanjet-execution-admission.store.js')));
      entryRequire('reflect-metadata');
      const { ChanjetExecutionAdmissionStore } = await import(pathToFileURL(path.join(distRoot, 'modules/chanjet/chanjet-execution-admission.store.js')).href);
      store = new ChanjetExecutionAdmissionStore(null);
      if (executor) {
        store.setStandaloneExecutor(executor);
      } else {
        // the reviewed bounded guard executor IS the stop channel: its own
        // acquire/statement/client-wait/release bounds TERMINATE the
        // connection and any pending work on expiry — initialization and
        // connection acquisition can never run unbounded
        const { createBoundedGuardExecutor } = await import(pathToFileURL(path.join(distRoot, 'modules/chanjet/chanjet-execution-guard-executor.js')).href);
        guardExecutor = createBoundedGuardExecutor(pgUrl, { acquireMs: ceilingMs, statementMs: ceilingMs, clientWaitMs: ceilingMs + 1_000, releaseMs: ceilingMs });
        store.setStandaloneExecutor(guardExecutor);
      }
      const manifestRowLocal = await Promise.race([
        Promise.resolve(readEvidence(admissionManifestEvidenceSql(handover.executionId))),
        new Promise((_, reject) => { timer = setTimeout(() => reject(Error('CHANJET_EXECUTION_STOP_CHANNEL_TIMEOUT:manifest')), ceilingMs); }),
      ]);
      const manifest = manifestRowLocal?.manifest ?? manifestRowLocal?.e?.manifest ?? manifestRowLocal;
      if (!manifest || typeof manifest !== 'object' || !manifest.executionId) throw Error('CHANJET_EXECUTION_STOP_CHANNEL_TIMEOUT:manifest');
      settled = true;
      // holdExecution is awaited to COMPLETION before the executor is
      // disposed in the finally below
      return String(await store.holdExecution({ manifest, leaseId: handover.leaseId, phase: 'SYNCING', deadlineAt: new Date(handover.deadlineAt) }, classification));
    } finally {
      settled = true;
      if (timer) clearTimeout(timer);
      if (guardExecutor) await guardExecutor.dispose().catch(() => undefined);
      if (executor) { try { await executor.dispose?.(); } catch { /* bounded by its own timeout */ } }
    }
  };
}
// The production budget read adapter: the LIVE remaining budget travels into
// the actual subprocess (execFileSync kill timeout AND the server-side
// statement/lock timeouts are derived from it — never expanded by a fixed
// floor). The wrapper passes THIS adapter into the core under the
// `readDatabaseEvidence` dep key — the key the core actually destructures.
export const makeProductionReadEvidence = ({ dbContainer = 'phoenix-v3-db', runSubprocess = execFileSync } = {}) => {
  const run = (file, args, options) => runSubprocess(file, args, options);
  const adapter = async (sql, budget = {}) => {
    const timeoutMs = Math.max(1, budget.remainingMs ?? 30_000);
    const { statementMs, lockMs } = stopChannelStatementBounds(timeoutMs);
    const input = `BEGIN READ ONLY;\nSET LOCAL statement_timeout='${statementMs}ms';\nSET LOCAL lock_timeout='${lockMs}ms';\n${sql}\nROLLBACK;\n`;
    const output = run('docker',
      ['exec', '-i', '-e', 'PGOPTIONS=-c default_transaction_read_only=on', dbContainer, 'sh', '-c', 'exec psql -X -At -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-$POSTGRES_USER}"'],
      { input, timeout: timeoutMs, killSignal: 'SIGKILL', encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    const line = String(output).split('\n').find((l) => l.startsWith('{'));
    return line ? JSON.parse(line) : {};
  };
  adapter.marker = 'R42D_BUDGET_READ_ADAPTER';
  return adapter;
};
// the EXACT adapter instance the production wrapper hands to the core —
// exported so acceptance can assert the identity and the budget propagation
// (the wrapper's dep key MUST be `readDatabaseEvidence`)
export const productionCoreReadEvidence = (env = process.env) =>
  makeProductionReadEvidence({ dbContainer: env.CHANJET_DB_CONTAINER || 'phoenix-v3-db' });
export function firstSyncDeps(overrides = {}) {
  return {
    env: process.env,
    fetchImpl: fetch,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    readDatabaseEvidence, businessFingerprints, captureRuntime, guardProduction, requireCleanMain, auditMappingScope,
    handover: undefined, durableStop: undefined,
    atomicState: productionAtomicState,
    stateDirectory: CONTRACT.stateDirectory,
    fileExists: (file) => fs.existsSync(file),
    endpoint,
    ...overrides,
  };
}
export async function firstSyncCore(overrides = {}) {
  const { env, fetchImpl, sleep, readDatabaseEvidence: readEvidence, businessFingerprints: fingerprints, captureRuntime, guardProduction, requireCleanMain, auditMappingScope: mappingScope, atomicState, stateDirectory, fileExists, endpoint: alignmentEndpoint, handover, durableStop } = { ...firstSyncDeps(), ...overrides };
  const root=env.FIRST_SYNC_ROOT||process.cwd();
  // 首同步证据 run id 与部署事务 run id 分开绑定
  const runId=env.FIRST_SYNC_RUN_ID||env.DEPLOY_RUN_ID;
  const target=env.TARGET_SHA,token=env.CHANJET_SYNC_OPERATOR_TOKEN;
  if(!token||!/^\d+-\d+$/.test(runId||'')||env.APPROVED_CONFIG_FLOOR_SHA!==target)throw Error('FIRST_SYNC_HOLD=AUTHORITY');
  // the durable execution binding comes ONLY from the controlled root
  // workflow's handover — never from env or the request
  if(!handover||!EXECUTION_BINDING_RE.test(handover.executionId||'')||!EXECUTION_BINDING_RE.test(handover.leaseId||''))throw Error('FIRST_SYNC_HOLD=EXECUTION_BINDING');
  const executionId=handover.executionId,leaseId=handover.leaseId;
  requireCleanMain(root,target);const actual=await captureRuntime();const floor=guardProduction(root,stateDirectory,actual);
  if(floor.chanjetPolicy!=='READONLY_VERIFY'||floor.floorSha!==target||actual.api.revision!==target)throw Error('FIRST_SYNC_HOLD=VERIFY_POLICY');
  const approval=floor.readonlyApproval,v=approval.verification;
  // trusted-row verification of the binding: SYNCING with no hold, the named
  // lease, a LIVE deadline, the reviewed approval/floor identity, and the
  // registered owner whose SERVER-DERIVED principal is the only acceptable
  // run owner (exact binding — a prefix is not enough)
  // the binding read is bounded by the HANDOVER's declared deadline — the
  // same DB-owned absolute deadline, never expanded by a fixed floor
  const admission=(await readEvidence(admissionOwnerColumnSql(executionId),{remainingMs:new Date(handover.deadlineAt).getTime()-Date.now()}))||{};
  const expectedOwner=`user:${admission.owner_id}`;
  if(admission.phase!=='SYNCING'||admission.hold_reason!==''||admission.lease_id!==leaseId
    ||!admission.deadline_at||new Date(admission.deadline_at).getTime()<=Date.now()
    ||admission.approval_id!==approval.approvalId||admission.floor_sha!==target
    ||!admission.owner_id)throw Error('FIRST_SYNC_HOLD=EXECUTION_BINDING');
  // DB-OWNED ABSOLUTE DEADLINE: every request, read and wait from here to
  // the verdict is raced against the remaining budget of THIS deadline
  const deadlineAt=new Date(admission.deadline_at).getTime();
  const remainingMs=()=>deadlineAt-Date.now();
  const boundedSignal=()=>AbortSignal.timeout(Math.max(1,Math.min(20_000,remainingMs())));
  const boundedRead=async(boundedSql)=>{
    if(remainingMs()<=1)throw Error('FIRST_SYNC_HOLD=FAILURE_OR_TIMEOUT');
    // the LIVE remaining budget travels WITH the read: the production
    // subprocess read passes it to the actual child process (execFileSync
    // timeout AND the server-side statement/lock timeouts) — Promise.race
    // alone could never bound a synchronous subprocess read
    let timer;
    return Promise.race([
      Promise.resolve(readEvidence(boundedSql,{remainingMs:remainingMs()})),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('FIRST_SYNC_HOLD=FAILURE_OR_TIMEOUT')),Math.max(1,remainingMs()));}),
    ]).finally(()=>clearTimeout(timer));
  };
  // durable stop through the EXISTING bounded guard mechanism; without a
  // stop channel the outcome is reported UNCONFIRMED — never silently
  // converted into a claimed stop
  let stopAttempted=false;let lastStopOutcome='NOT_ATTEMPTED';
  const stopExecution=async(classification)=>{
    if(stopAttempted)return lastStopOutcome; // 幂等：同一次运行只停止一次
    stopAttempted=true;
    if(typeof durableStop!=='function'){lastStopOutcome='UNCONFIRMED';return lastStopOutcome;}
    try{lastStopOutcome=String(await durableStop(classification));}
    catch{lastStopOutcome='UNCONFIRMED';}
    return lastStopOutcome;
  };
  const sql=fs.readFileSync(path.join(root,'scripts/ops/readonly-audits/chanjet-restoration-preflight.sql'),'utf8');
  const before=await boundedRead(sql);mappingScope(before,approval);
  const boundedFingerprints=async()=>{
    if(remainingMs()<=1)throw Error('FIRST_SYNC_HOLD=FAILURE_OR_TIMEOUT');
    let timer;
    return Promise.race([
      Promise.resolve(fingerprints(boundedRead)),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('FIRST_SYNC_HOLD=FAILURE_OR_TIMEOUT')),Math.max(1,remainingMs()));}),
    ]).finally(()=>clearTimeout(timer));
  };
  const protectedBefore=await boundedFingerprints();
  const file=path.join(stateDirectory,`first-sync-${runId}.json`);
  if(fileExists(file))throw Error('FIRST_SYNC_HOLD=RUN_REUSED');
  atomicState(file,{version:3,target,approvalId:approval.approvalId,scope:v,phase:'PREPARED',before,protectedBefore,execution:{executionId,leaseId,deadlineAt:new Date(deadlineAt).toISOString()}});
  const request=async(suffix,options={})=>{
    if(remainingMs()<=1)throw Error('FIRST_SYNC_HOLD=FAILURE_OR_TIMEOUT');
    const response=await fetchImpl(alignmentEndpoint+suffix,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},signal:boundedSignal()});
    const body=await response.json();if(!response.ok||body.success!==true)throw Error('FIRST_SYNC_HOLD=PROTECTED_API');return body;
  };
  let result;let orchestration='';
  try {
    // UNIFIED exception tail from the FIRST possible commit (the enqueue) —
    // an ambiguous response, poll failure, drift, expiry, proof-read failure,
    // fingerprint mismatch or final-verification failure all funnel through
    // the SAME bounded durable stop with its REAL outcome reported
    const accepted=await request('enqueue',{method:'POST',body:JSON.stringify({bookId:v.bookId,period:v.period,scope:v.scope,maxAttempts:1,execution:{executionId,leaseId}})});
    if(!accepted.accepted||!accepted.run?.runId)throw Error('FIRST_SYNC_HOLD=NOT_ACCEPTED');
    orchestration=accepted.run.runId;
    for(let i=0;i<90&&remainingMs()>1;i++) {
      const status=await request('status');if(status.run?.runId!==orchestration)throw Error('FIRST_SYNC_HOLD=RUN_DRIFT');
      // owner EXACTLY bound to the SERVER-derived authenticated principal of
      // the registered owner — a prefix or a different principal is a source
      // mismatch and refuses the entry
      if(status.run.requestedBy!==expectedOwner)throw Error('FIRST_SYNC_HOLD=OWNER_SOURCE');
      if(['COMPLETED','HOLD','FAILED','SKIPPED'].includes(status.run.state)){result=status.run;break;}
      await sleep(Math.min(4000,Math.max(1,remainingMs())));
    }
    if(!result||result.state!=='COMPLETED'||result.decision==='HOLD')throw Error('FIRST_SYNC_HOLD=FAILURE_OR_TIMEOUT');

    // STRICT DURABLE PROOF (the reviewed first-sync semantics): the final
    // admission is VERIFIED and the SUCCESS job carries the FULL approval/
    // execution/lease/floor/scope binding, the worker receipt ordinals
    // (independently re-counted against the receipts table) and the explicit
    // forbidden-write fields — a COMPLETED run alone proves nothing.
    const job=(await boundedRead(jobProofEvidenceSql(orchestration)))||{};
    const summary=job.summary||{};const jobScope=job.scope||{};
    const inbound=summary.erpInbound;
    const sends=summary.executionSends;const ordinals=summary.executionReceiptOrdinals;
    let ordinalsVerified=false;
    if(Array.isArray(ordinals)&&ordinals.length>=1&&ordinals.every((o)=>Number.isInteger(o)&&o>0)&&ordinals.length===sends){
      const counted=await boundedRead(ordinalsProofEvidenceSql(executionId,leaseId,ordinals));
      ordinalsVerified=Number(counted?.n||0)===ordinals.length;
    }
    const verifiedRow=await boundedRead(admissionVerifiedEvidenceSql(executionId));
    const bindingMatches=canonicalJson(jobScope.execution||null)===canonicalJson({
      executionId,leaseId,phase:'SYNCING',approvalId:approval.approvalId,floorSha:target,
      deadlineAt:new Date(deadlineAt).toISOString(),
    });
    const scopeBindingMatches=jobScope.approvalId===approval.approvalId&&jobScope.floorSha===target
      &&jobScope.bookId===v.bookId&&jobScope.period===v.period
      &&canonicalJson(jobScope.scope||null)===canonicalJson(v.scope);
    const proofHolds=job.status==='SUCCESS'
      &&summary.state==='COMPLETED'
      &&typeof summary.decision==='string'&&summary.decision!=='HOLD'
      &&summary.externalWriteEnabled===false
      &&!!inbound&&typeof inbound==='object'&&!Array.isArray(inbound)&&inbound.applied===false
      &&typeof sends==='number'&&Number.isInteger(sends)&&sends>=1
      &&ordinalsVerified
      &&bindingMatches&&scopeBindingMatches
      &&verifiedRow?.phase==='VERIFIED'&&verifiedRow?.hold_reason===''&&verifiedRow?.lease_id==='';
    if(!proofHolds){
      // a COMPLETED run without the strict proof: the execution is already
      // settled (typically VERIFIED by the scheduler's own gate) — the
      // unified catch's single stop answers NO_HOLD_NEEDED for it and the
      // mismatch is never converted into success
      throw Object.assign(Error('FIRST_SYNC_HOLD=FIRST_SYNC_PROOF'),{orchestrationRunId:orchestration});
    }
    // post-checks: side-effect counters, business fingerprints, mapping and
    // floor state — every read raced against the same absolute deadline
    const after=await boundedRead(sql);
    for(const key of ['inboundRuns','financeLedgerRows','financeInvoiceRows','writebackPending','wmsWritebackPending','remoteWriteAttempts','wmsRemoteWriteAttempts'])if(after[key]!==before[key])throw Error('FIRST_SYNC_HOLD=FORBIDDEN_SIDE_EFFECT');
    const protectedAfter=await boundedFingerprints();
    if(JSON.stringify(protectedBefore)!==JSON.stringify(protectedAfter))throw Error('FIRST_SYNC_HOLD=BUSINESS_FACT_CHANGED');
    mappingScope(after,approval);guardProduction(root,stateDirectory,actual);
    // FINAL deadline gate: after ALL post-checks and immediately before the
    // VERIFIED write — the deadline can never be crossed by the write
    // FINAL deadline gate: after ALL post-checks and immediately before the
    // VERIFIED write — the deadline can never be crossed by the write
    if(remainingMs()<=1){
      // the deadline arrived during verification: the unified catch stops
      // once — the VERIFIED evidence is never written past the deadline
      throw Object.assign(Error('FIRST_SYNC_HOLD=FAILURE_OR_TIMEOUT'),{classification:'DEADLINE'});
    }
    atomicState(file,{version:3,target,approvalId:approval.approvalId,orchestrationRunId:orchestration,scope:v,phase:'VERIFIED',before,after,protectedBefore,protectedAfter,remoteWrite:false,erpInbound:false,execution:{executionId,leaseId,deadlineAt:new Date(deadlineAt).toISOString()}});
    console.log(`FIRST_CONTROLLED_SYNC=PASS;RUN_ID=${orchestration};ADMISSION=VERIFIED`);
    return { orchestrationRunId: orchestration, phase: 'VERIFIED' };
  } catch (error) {
    // enqueue后的失败/漂移/超期/证明/指纹/最终核验失败：经既有有界守卫持久
    // 停止执行一次（幂等——同一次运行绝不重复停止），并准确报告
    // CONFIRMED / ALREADY_STOPPED / NO_HOLD_NEEDED / UNCONFIRMED
    const classification=remainingMs()<=1&&/FAILURE_OR_TIMEOUT|DEADLINE/.test(String(error?.message))?'DEADLINE':'CANCELLED';
    const stopOutcome=await stopExecution(classification);
    throw Object.assign(error,{stopOutcome,classification});
  }
}
export function buildProductionWrapperEnv(root) {
  // TRUSTED DELIVERY LOCATIONS for the production controlled entry:
  //   reviewed checkout + compiled modules + runtime dependencies:
  //     CONTRACT.repository (verified by the REAL verifyContext below — the
  //     state directory must be the contract's approved directory and the
  //     inherited FD9 the workflow's mutation lock). The compiled execution
  //     modules for the durable stop are delivered by the root workflow from
  //     the DEPLOYED API IMAGE (CHANJET_EXECUTION_DIST_ROOT) — never
  //     hand-placed.
  //   evidence / handover files:
  //     CONTRACT.stateDirectory (the same approved directory)
  //   stop channel:
  //     the EXISTING DB container access (docker exec phoenix-v3-db psql) —
  //     the deployment's own database configuration, no new secrets
  const stateDirectory=CONTRACT.stateDirectory;
  verifyContext(fs.realpathSync(root),stateDirectory);
  const distRoot=process.env.CHANJET_EXECUTION_DIST_ROOT||path.join(root,'apps/api/dist');
  return { stateDirectory, distRoot };
}
// The production stop executor: the EXISTING DB container access (docker exec
// phoenix-v3-db psql, READ WRITE) with a hard subprocess timeout. Parameters
// are dollar-quoted literals from the store itself (execution ids, canonical
// manifest, digest, reason) — no free-text SQL composition.
// The production stop channel executor: the EXISTING DB container access
// (docker exec phoenix-v3-db psql, READ WRITE). Safe and COMPLETE positional
// parameter binding (any order, repeats, multi-line canonical manifest) via
// bindPositionalParameters; the bound statement runs inside a CTE whose JSON
// row aggregate is parsed back as the store's rows array.
export function bindPositionalParameters(sql, parameters, { tag = `$r42d_${Math.floor(Math.random() * 0xffffffff).toString(16)}$` } = {}) {
  return String(sql).replace(/\$(\d+)/g, (match, n) => {
    const value = parameters[Number(n) - 1];
    if (value === undefined) return match;
    return `${tag}${String(value)}${tag}`;
  });
}
export const buildStopChannelInput = (boundSql, timeoutMs) => {
  const { statementMs, lockMs } = stopChannelStatementBounds(timeoutMs);
  return `BEGIN;\nSET LOCAL statement_timeout='${statementMs}ms';\nSET LOCAL lock_timeout='${lockMs}ms';\nWITH r42d_q AS (\n${boundSql}\n) SELECT COALESCE(json_agg(row_to_json(r42d_q)),'[]'::json)::text FROM r42d_q;\nCOMMIT;\n`;
};
export const parseStopChannelRows = (output) => {
  const line = String(output).split('\n').find((l) => l.startsWith('[') || l === '[]');
  return line ? JSON.parse(line) : [];
};
export function makeProductionStopExecutor({ dbContainer = 'phoenix-v3-db', timeoutMs = 30_000, runSubprocess = execFileSync } = {}) {
  return {
    dispose: async () => undefined,
    query: async (sql, parameters = []) => {
      const bound = bindPositionalParameters(sql, parameters);
      const input = buildStopChannelInput(bound, timeoutMs);
      const output = runSubprocess('docker',
        ['exec', '-i', dbContainer, 'sh', '-c', 'exec psql -X -At -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-$POSTGRES_USER}"'],
        { input, timeout: timeoutMs, killSignal: 'SIGKILL', encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
      return parseStopChannelRows(output);
    },
  };
}
export async function firstSync(root) {
  try {
    const wrapperEnv=buildProductionWrapperEnv(root);
    // the handover lives ONLY in the approved state directory, written by the
    // controlled root workflow's prepare-sync phase — the environment is
    // never a binding source
    const handoverFile=path.join(wrapperEnv.stateDirectory,'prepare-sync-handover.json');
    if(!fs.existsSync(handoverFile))throw Error('FIRST_SYNC_HOLD=HANDOVER_MISSING');
    const handover=JSON.parse(fs.readFileSync(handoverFile,'utf8'));
    if(handover?.target!==process.env.APPROVED_CONFIG_FLOOR_SHA)throw Error('FIRST_SYNC_HOLD=EXECUTION_BINDING');
    // evidence reads carry the LIVE remaining budget into the subprocess
    const readEvidence=(sql,budget)=>readDatabaseEvidence(sql,{timeoutMs:budget?.remainingMs??30_000});
    const durableStop=makeDurableStop({
      distRoot:wrapperEnv.distRoot,
      executor:makeProductionStopExecutor({ dbContainer:process.env.CHANJET_DB_CONTAINER||'phoenix-v3-db' }),
      readEvidence,
      handover,
    });
    await firstSyncCore({
      env:{...process.env,FIRST_SYNC_ROOT:root},
      handover,
      durableStop,
      // the budget read adapter is PASSED INTO the core under the dep key the
      // core destructures (`readDatabaseEvidence`): every evidence read
      // carries its live remaining budget into the actual subprocess
      readDatabaseEvidence: productionCoreReadEvidence(process.env),
    });
  }catch(error){
    const reason=String(error?.message||error).replace(/[^\x20-\x7e]/g,' ').slice(0,160);
    console.error(`FIRST_CONTROLLED_SYNC=HOLD;EVIDENCE_RETAINED;REASON=${reason};STOP=${error?.stopOutcome??'NOT_NEEDED'}`);
    process.exitCode=1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){await firstSync(fs.realpathSync(process.cwd()));}
