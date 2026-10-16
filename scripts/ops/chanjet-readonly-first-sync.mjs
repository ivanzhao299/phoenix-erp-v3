import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONTRACT,guardProduction,requireCleanMain } from './production-config-guard.mjs';
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
const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};
const admissionManifestEvidenceSql = (executionId) => `SELECT manifest AS e FROM chanjet_execution_admissions WHERE execution_id = '${executionId}'`;
const jobProofEvidenceSql = (orchestrationRunId) => `SELECT json_build_object(
  'status', status, 'summary', result_summary, 'scope', request_scope
) AS e FROM chanjet_sync_jobs WHERE request_scope->>'orchestrationRunId' = '${orchestrationRunId}' ORDER BY id DESC LIMIT 1`;
const ordinalsProofEvidenceSql = (executionId, leaseId, ordinals) => `SELECT json_build_object('n', count(*)) AS e FROM chanjet_execution_requests
  WHERE execution_id = '${executionId}' AND phase = 'SYNCING' AND lease_id = '${leaseId}'
    AND kind = 'BUSINESS' AND status = 'ACKNOWLEDGED' AND result = 'OK'
    AND ordinal = ANY(ARRAY[${ordinals.map((o) => Number(o) | 0).join(',')}]::int[])`;
const admissionVerifiedEvidenceSql = (executionId) => `SELECT json_build_object(
  'phase', phase, 'hold_reason', hold_reason, 'lease_id', lease_id
) AS e FROM chanjet_execution_admissions WHERE execution_id = '${executionId}' AND phase = 'VERIFIED'`;
const admissionOwnerColumnSql = (executionId) => `SELECT json_build_object(
  'phase', phase, 'hold_reason', hold_reason, 'lease_id', lease_id,
  'deadline_at', deadline_at, 'approval_id', approval_id, 'floor_sha', floor_sha,
  'owner_id', owner_id
) AS e FROM chanjet_execution_admissions WHERE execution_id = '${executionId}'`;
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
  const target=env.TARGET_SHA,runId=env.DEPLOY_RUN_ID,token=env.CHANJET_SYNC_OPERATOR_TOKEN;
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
  const admission=(await readEvidence(admissionOwnerColumnSql(executionId)))||{};
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
    let timer;
    return Promise.race([
      readEvidence(boundedSql),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('FIRST_SYNC_HOLD=FAILURE_OR_TIMEOUT')),Math.max(1,remainingMs()));}),
    ]).finally(()=>clearTimeout(timer));
  };
  // durable stop through the EXISTING bounded guard mechanism; without a
  // stop channel the outcome is reported UNCONFIRMED — never silently
  // converted into a claimed stop
  const stopExecution=async(classification)=>{
    if(typeof durableStop!=='function')return 'UNCONFIRMED';
    try{return String(await durableStop(classification));}
    catch{return 'UNCONFIRMED';}
  };
  const sql=fs.readFileSync(path.join(root,'scripts/ops/readonly-audits/chanjet-restoration-preflight.sql'),'utf8');
  const before=await boundedRead(sql);mappingScope(before,approval);
  const protectedBefore=await fingerprints();
  const file=path.join(stateDirectory,`first-sync-${runId}.json`);
  if(fileExists(file))throw Error('FIRST_SYNC_HOLD=RUN_REUSED');
  atomicState(file,{version:3,target,approvalId:approval.approvalId,scope:v,phase:'PREPARED',before,protectedBefore,execution:{executionId,leaseId}});
  const request=async(suffix,options={})=>{
    if(remainingMs()<=1)throw Error('FIRST_SYNC_HOLD=FAILURE_OR_TIMEOUT');
    const response=await fetchImpl(alignmentEndpoint+suffix,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},signal:boundedSignal()});
    const body=await response.json();if(!response.ok||body.success!==true)throw Error('FIRST_SYNC_HOLD=PROTECTED_API');return body;
  };
  const accepted=await request('enqueue',{method:'POST',body:JSON.stringify({bookId:v.bookId,period:v.period,scope:v.scope,maxAttempts:1,execution:{executionId,leaseId}})});
  if(!accepted.accepted||!accepted.run?.runId)throw Error('FIRST_SYNC_HOLD=NOT_ACCEPTED');
  const orchestration=accepted.run.runId;let result;
  try {
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
  } catch (error) {
    // enqueue后的失败/漂移/超期：经既有有界守卫持久停止执行，并准确报告
    // CONFIRMED / ALREADY_STOPPED / NO_HOLD_NEEDED / UNCONFIRMED
    const classification=remainingMs()<=1&&/FAILURE_OR_TIMEOUT|DEADLINE/.test(String(error?.message))?'DEADLINE':'CANCELLED';
    const stopOutcome=await stopExecution(classification);
    throw Object.assign(error,{stopOutcome,classification});
  }
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
    // settled (typically VERIFIED by the scheduler's own gate) — the guard
    // answers NO_HOLD_NEEDED for it and the mismatch is never converted
    // into success
    const stopOutcome=await stopExecution('CANCELLED');
    throw Object.assign(Error('FIRST_SYNC_HOLD=FIRST_SYNC_PROOF'),{stopOutcome,orchestrationRunId:orchestration});
  }
  const after=await boundedRead(sql);
  for(const key of ['inboundRuns','financeLedgerRows','financeInvoiceRows','writebackPending','wmsWritebackPending','remoteWriteAttempts','wmsRemoteWriteAttempts'])if(after[key]!==before[key])throw Error('FIRST_SYNC_HOLD=FORBIDDEN_SIDE_EFFECT');
  const protectedAfter=await fingerprints();
  if(JSON.stringify(protectedBefore)!==JSON.stringify(protectedAfter))throw Error('FIRST_SYNC_HOLD=BUSINESS_FACT_CHANGED');
  mappingScope(after,approval);guardProduction(root,stateDirectory,actual);
  atomicState(file,{version:3,target,approvalId:approval.approvalId,orchestrationRunId:orchestration,scope:v,phase:'VERIFIED',before,after,protectedBefore,protectedAfter,remoteWrite:false,erpInbound:false,execution:{executionId,leaseId,deadlineAt:new Date(deadlineAt).toISOString()}});
  console.log(`FIRST_CONTROLLED_SYNC=PASS;RUN_ID=${orchestration};ADMISSION=VERIFIED`);
  return { orchestrationRunId: orchestration, phase: 'VERIFIED' };
}
export async function firstSync(root) {
  try {
    // the handover lives ONLY in the approved state directory, written by the
    // controlled root workflow's prepare-sync phase — the environment is
    // never a binding source
    const handoverFile=path.join(CONTRACT.stateDirectory,'prepare-sync-handover.json');
    if(!fs.existsSync(handoverFile))throw Error('FIRST_SYNC_HOLD=HANDOVER_MISSING');
    const handover=JSON.parse(fs.readFileSync(handoverFile,'utf8'));
    if(handover?.target!==process.env.APPROVED_CONFIG_FLOOR_SHA)throw Error('FIRST_SYNC_HOLD=EXECUTION_BINDING');
    let durableStop;
    if(process.env.CHANJET_EXECUTION_PG_URL){
      const { createRequire }=await import('node:module');
      const entryRequire=createRequire(import.meta.url);
      const repoRoot=fs.realpathSync(root);
      durableStop=async(classification)=>{
        const manifestRow=(await readDatabaseEvidence(admissionManifestEvidenceSql(handover.executionId)))||{};
        const manifest=manifestRow.manifest??manifestRow.e?.manifest??manifestRow;
        require(entryRequire.resolve('./production-config-guard.mjs'));
        const { ChanjetExecutionAdmissionStore }=await import(pathToFileURL(path.join(repoRoot,'apps/api/dist/modules/chanjet/chanjet-execution-admission.store.js')).href);
        const { createBoundedGuardExecutor }=await import(pathToFileURL(path.join(repoRoot,'apps/api/dist/modules/chanjet/chanjet-execution-guard-executor.js')).href);
        const { DataSource }=entryRequire(path.join(repoRoot,'apps/api/node_modules/typeorm/index.js'));
        const stopDs=new DataSource({ type:'postgres',url:process.env.CHANJET_EXECUTION_PG_URL,logging:false });
        await stopDs.initialize();
        const guardExecutor=createBoundedGuardExecutor(process.env.CHANJET_EXECUTION_PG_URL);
        try{
          const store=new ChanjetExecutionAdmissionStore(stopDs.manager);
          store.setStandaloneExecutor(guardExecutor);
          return store.holdExecution({ manifest, leaseId:handover.leaseId, phase:'SYNCING', deadlineAt:new Date(handover.deadlineAt) },classification);
        } finally { await guardExecutor.dispose().catch(()=>undefined); await stopDs.destroy().catch(()=>undefined); }
      };
    }
    await firstSyncCore({ env:{...process.env,FIRST_SYNC_ROOT:root}, handover, durableStop });
  }catch(error){
    const reason=String(error?.message||error).replace(/[^\x20-\x7e]/g,' ').slice(0,160);
    console.error(`FIRST_CONTROLLED_SYNC=HOLD;EVIDENCE_RETAINED;REASON=${reason};STOP=${error?.stopOutcome??'NOT_NEEDED'}`);
    process.exitCode=1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){await firstSync(fs.realpathSync(process.cwd()));}
