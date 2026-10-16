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
const admissionBindingEvidenceSql = (executionId) => `SELECT json_build_object(
  'phase', phase, 'hold_reason', hold_reason, 'lease_id', lease_id,
  'deadline_at', deadline_at, 'approval_id', approval_id, 'floor_sha', floor_sha
) AS e FROM chanjet_execution_admissions WHERE execution_id = '${executionId}'`;
export function firstSyncDeps(overrides = {}) {
  return {
    env: process.env,
    fetchImpl: fetch,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    readDatabaseEvidence, businessFingerprints, captureRuntime, guardProduction, requireCleanMain, auditMappingScope,
    atomicState: productionAtomicState,
    stateDirectory: CONTRACT.stateDirectory,
    fileExists: (file) => fs.existsSync(file),
    endpoint,
    ...overrides,
  };
}
export async function firstSyncCore(overrides = {}) {
  const { env, fetchImpl, sleep, readDatabaseEvidence: readEvidence, businessFingerprints: fingerprints, captureRuntime, guardProduction, requireCleanMain, auditMappingScope: mappingScope, atomicState, stateDirectory, fileExists, endpoint: alignmentEndpoint } = { ...firstSyncDeps(), ...overrides };
  const root=env.FIRST_SYNC_ROOT||process.cwd();
  const target=env.TARGET_SHA,runId=env.DEPLOY_RUN_ID,token=env.CHANJET_SYNC_OPERATOR_TOKEN;
  if(!token||!/^\d+-\d+$/.test(runId||'')||env.APPROVED_CONFIG_FLOOR_SHA!==target)throw Error('FIRST_SYNC_HOLD=AUTHORITY');
  requireCleanMain(root,target);const actual=await captureRuntime();const floor=guardProduction(root,stateDirectory,actual);
  if(floor.chanjetPolicy!=='READONLY_VERIFY'||floor.floorSha!==target||actual.api.revision!==target)throw Error('FIRST_SYNC_HOLD=VERIFY_POLICY');
  const approval=floor.readonlyApproval,v=approval.verification;
  const executionId=env.CHANJET_FIRST_SYNC_EXECUTION_ID||'';
  const leaseId=env.CHANJET_FIRST_SYNC_LEASE_ID||'';
  if(!EXECUTION_BINDING_RE.test(executionId)||!EXECUTION_BINDING_RE.test(leaseId))throw Error('FIRST_SYNC_HOLD=EXECUTION_BINDING');
  // trusted-row verification of the binding: SYNCING with no hold, the named
  // lease, a LIVE deadline, and the reviewed approval/floor identity
  const admission=(await readEvidence(admissionBindingEvidenceSql(executionId)))||{};
  if(admission.phase!=='SYNCING'||admission.hold_reason!==''||admission.lease_id!==leaseId
    ||!admission.deadline_at||new Date(admission.deadline_at).getTime()<=Date.now()
    ||admission.approval_id!==approval.approvalId||admission.floor_sha!==target)throw Error('FIRST_SYNC_HOLD=EXECUTION_BINDING');
  const sql=fs.readFileSync(path.join(root,'scripts/ops/readonly-audits/chanjet-restoration-preflight.sql'),'utf8');
  const before=await readEvidence(sql);mappingScope(before,approval);
  const protectedBefore=await fingerprints();
  const file=path.join(stateDirectory,`first-sync-${runId}.json`);
  if(fileExists(file))throw Error('FIRST_SYNC_HOLD=RUN_REUSED');
  atomicState(file,{version:3,target,approvalId:approval.approvalId,scope:v,phase:'PREPARED',before,protectedBefore,execution:{executionId,leaseId}});
  const request=async(suffix,options={})=>{
    const response=await fetchImpl(alignmentEndpoint+suffix,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(20_000)});
    const body=await response.json();if(!response.ok||body.success!==true)throw Error('FIRST_SYNC_HOLD=PROTECTED_API');return body;
  };
  const accepted=await request('enqueue',{method:'POST',body:JSON.stringify({bookId:v.bookId,period:v.period,scope:v.scope,maxAttempts:1,execution:{executionId,leaseId}})});
  if(!accepted.accepted||!accepted.run?.runId)throw Error('FIRST_SYNC_HOLD=NOT_ACCEPTED');
  const orchestration=accepted.run.runId;let result;
  for(let i=0;i<90;i++) {
    const status=await request('status');if(status.run?.runId!==orchestration)throw Error('FIRST_SYNC_HOLD=RUN_DRIFT');
    // owner-source verification: the run must be owned by the SERVER-derived
    // authenticated principal (user:*) — a client-passed name is a source
    // mismatch and refuses the entry
    if(typeof status.run.requestedBy!=='string'||!status.run.requestedBy.startsWith('user:'))throw Error('FIRST_SYNC_HOLD=OWNER_SOURCE');
    if(['COMPLETED','HOLD','FAILED','SKIPPED'].includes(status.run.state)){result=status.run;break;}
    await sleep(4000);
  }
  if(result?.state!=='COMPLETED'||result.decision==='HOLD')throw Error('FIRST_SYNC_HOLD=FAILURE_OR_TIMEOUT');
  const after=await readEvidence(sql);
  for(const key of ['inboundRuns','financeLedgerRows','financeInvoiceRows','writebackPending','wmsWritebackPending','remoteWriteAttempts','wmsRemoteWriteAttempts'])if(after[key]!==before[key])throw Error('FIRST_SYNC_HOLD=FORBIDDEN_SIDE_EFFECT');
  const protectedAfter=await fingerprints();
  if(JSON.stringify(protectedBefore)!==JSON.stringify(protectedAfter))throw Error('FIRST_SYNC_HOLD=BUSINESS_FACT_CHANGED');
  mappingScope(after,approval);guardProduction(root,stateDirectory,actual);
  atomicState(file,{version:3,target,approvalId:approval.approvalId,orchestrationRunId:orchestration,scope:v,phase:'VERIFIED',before,after,protectedBefore,protectedAfter,remoteWrite:false,erpInbound:false,execution:{executionId,leaseId}});
  console.log(`FIRST_CONTROLLED_SYNC=PASS;RUN_ID=${orchestration};ADMISSION=VERIFIED`);
  return { orchestrationRunId: orchestration, phase: 'VERIFIED' };
}
export async function firstSync(root) {
  try {
    await firstSyncCore({ env: { ...process.env, FIRST_SYNC_ROOT: root } });
  }catch{console.error('FIRST_CONTROLLED_SYNC=HOLD;EVIDENCE_RETAINED');process.exitCode=1;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){await firstSync(fs.realpathSync(process.cwd()));}
