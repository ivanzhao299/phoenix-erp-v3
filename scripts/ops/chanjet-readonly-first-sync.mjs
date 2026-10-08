import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONTRACT,guardProduction,requireCleanMain } from './production-config-guard.mjs';
import { captureRuntime } from './capture-production-runtime.mjs';
import { atomicState } from './production-deployment-state.mjs';
import { auditMappingScope,readDatabaseEvidence } from './chanjet-readonly-production-audit.mjs';
const endpoint='http://127.0.0.1:3100/api/chanjet/integration/alignment/';
export function businessFingerprints(read = readDatabaseEvidence) {
  const tables = ['fin_ar_ledger','fin_ar_invoices','fin_ap_invoices','fin_cash_transactions','inv_batches','inv_ledger','sal_sales_orders'];
  const pairs = tables.map(table => `'${table}', (SELECT json_build_object('count', COUNT(*), 'digest', md5(COALESCE(string_agg(md5(row_to_json(t)::text), '' ORDER BY md5(row_to_json(t)::text)), ''))) FROM ${table} t)`);
  return read(`SELECT json_build_object(${pairs.join(',')});`);
}
export async function firstSync(root) {
  const target=process.env.TARGET_SHA,runId=process.env.DEPLOY_RUN_ID,token=process.env.CHANJET_SYNC_OPERATOR_TOKEN;
  if(!token||!/^\d+-\d+$/.test(runId||'')||process.env.APPROVED_CONFIG_FLOOR_SHA!==target)throw Error('FIRST_SYNC_HOLD=AUTHORITY');
  requireCleanMain(root,target);const actual=captureRuntime();const floor=guardProduction(root,CONTRACT.stateDirectory,actual);
  if(floor.chanjetPolicy!=='READONLY_VERIFY'||floor.floorSha!==target||actual.api.revision!==target)throw Error('FIRST_SYNC_HOLD=VERIFY_POLICY');
  const approval=floor.readonlyApproval,v=approval.verification;
  const sql=fs.readFileSync(path.join(root,'scripts/ops/readonly-audits/chanjet-restoration-preflight.sql'),'utf8');
  const before=readDatabaseEvidence(sql);auditMappingScope(before,approval);
  const protectedBefore=businessFingerprints();
  const file=path.join(CONTRACT.stateDirectory,`first-sync-${runId}.json`);
  if(fs.existsSync(file))throw Error('FIRST_SYNC_HOLD=RUN_REUSED');
  atomicState(file,{version:3,target,approvalId:approval.approvalId,scope:v,phase:'PREPARED',before,protectedBefore});
  const request=async(suffix,options={})=>{
    const response=await fetch(endpoint+suffix,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(20_000)});
    const body=await response.json();if(!response.ok||body.success!==true)throw Error('FIRST_SYNC_HOLD=PROTECTED_API');return body;
  };
  const accepted=await request('enqueue',{method:'POST',body:JSON.stringify({bookId:v.bookId,period:v.period,scope:v.scope,maxAttempts:1})});
  if(!accepted.accepted||!accepted.run?.runId)throw Error('FIRST_SYNC_HOLD=NOT_ACCEPTED');
  const orchestration=accepted.run.runId;let result;
  for(let i=0;i<90;i++) {
    const status=await request('status');if(status.run?.runId!==orchestration)throw Error('FIRST_SYNC_HOLD=RUN_DRIFT');
    if(['COMPLETED','HOLD','FAILED','SKIPPED'].includes(status.run.state)){result=status.run;break;}
    await new Promise(resolve=>setTimeout(resolve,4000));
  }
  if(result?.state!=='COMPLETED'||result.decision==='HOLD')throw Error('FIRST_SYNC_HOLD=FAILURE_OR_TIMEOUT');
  const after=readDatabaseEvidence(sql);
  for(const key of ['inboundRuns','financeLedgerRows','financeInvoiceRows','writebackPending','wmsWritebackPending','remoteWriteAttempts','wmsRemoteWriteAttempts'])if(after[key]!==before[key])throw Error('FIRST_SYNC_HOLD=FORBIDDEN_SIDE_EFFECT');
  const protectedAfter=businessFingerprints();
  if(JSON.stringify(protectedBefore)!==JSON.stringify(protectedAfter))throw Error('FIRST_SYNC_HOLD=BUSINESS_FACT_CHANGED');
  auditMappingScope(after,approval);guardProduction(root,CONTRACT.stateDirectory,actual);
  atomicState(file,{version:3,target,approvalId:approval.approvalId,orchestrationRunId:orchestration,scope:v,phase:'VERIFIED',before,after,protectedBefore,protectedAfter,remoteWrite:false,erpInbound:false});
  console.log(`FIRST_CONTROLLED_SYNC=PASS;RUN_ID=${orchestration};SCHEDULER=HOLD`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{await firstSync(fs.realpathSync(process.cwd()));}catch{console.error('FIRST_CONTROLLED_SYNC=HOLD;EVIDENCE_RETAINED');process.exitCode=1;}}
