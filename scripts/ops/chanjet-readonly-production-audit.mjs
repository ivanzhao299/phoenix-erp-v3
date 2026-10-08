import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const run = (file,args,options={}) => execFileSync(file,args,{ encoding:'utf8', stdio:['pipe','pipe','pipe'], ...options });
export function auditMappingScope(evidence, approval) {
  const enabled = evidence.mappings.filter(m => m.syncEnabled);
  if (!enabled.length || evidence.runningJobs || evidence.queuedJobs || evidence.recoveryCandidates || evidence.legacyRunningJobs
    || evidence.writebackPending || evidence.wmsWritebackPending) throw new Error('RESTORATION_HOLD=CURRENT_JOBS_OR_MAPPING');
  if (new Set(enabled.map(m=>m.bookId)).size !== enabled.length || new Set(enabled.map(m=>m.companyCode)).size !== enabled.length) throw new Error('RESTORATION_HOLD=CROSS_COMPANY');
  for (const m of enabled) {
    const b=evidence.books.find(b=>b.bookId===m.bookId);
    if (!m.companyActive || !b?.enabled || b.companyCode!==m.companyCode) throw new Error('RESTORATION_HOLD=BOOK_BINDING');
  }
  if (approval && (enabled.length!==approval.books.length || enabled.some(m=>!approval.books.some(a=>a.bookId===m.bookId && a.companyCode===m.companyCode)))) throw new Error('RESTORATION_HOLD=APPROVED_BOOK_SCOPE_CHANGED');
  return enabled.map(({bookId,companyCode})=>({bookId,companyCode}));
}
export function readDatabaseEvidence(sql) {
  // Actual production schema is authoritative; no fallback to historical zero counts.
  const output=run('docker',['exec','-i','-e','PGOPTIONS=-c default_transaction_read_only=on','phoenix-v3-db','sh','-c','exec psql -X -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "${POSTGRES_DB:-$POSTGRES_USER}"'],
    { input:`BEGIN READ ONLY;\nSET LOCAL statement_timeout='20s';\nSET LOCAL lock_timeout='3s';\n${sql}\nROLLBACK;\n` });
  const line=output.split('\n').find(line=>line.startsWith('{')); if(!line) throw new Error('RESTORATION_HOLD=DB_EVIDENCE');
  return JSON.parse(line);
}
export async function productionAudit(root, sql) {
  const installed=await import(pathToFileURL(path.join(root,'scripts/ops/production-config-guard.mjs')).href);
  const { captureRuntime, executionEnv }=await import(pathToFileURL(path.join(root,'scripts/ops/capture-production-runtime.mjs')).href);
  const actual=captureRuntime(); const floor=installed.guardProduction(root,installed.CONTRACT.stateDirectory,actual);
  const evidence=readDatabaseEvidence(sql);
  const raw=JSON.parse(run('docker',['inspect','phoenix-v3-api','--format','{{json .Config.Env}}'],{env:executionEnv()}));
  const flags=Object.fromEntries(raw.filter(x=>/^(CHANJET_READONLY_SYNC_ENABLED|CHANJET_ERP_INBOUND_SYNC_ENABLED|CHANJET_SYNC_POLICY)=/.test(x)).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
  const health=Object.fromEntries(['db','api','web'].map(service=>[service,run('docker',['inspect',`phoenix-v3-${service}`,'--format','{{.State.Health.Status}}'],{env:executionEnv()}).trim()]));
  const apiHttp=run('curl',['-sS','--max-time','15','-o','/dev/null','-w','%{http_code}','http://127.0.0.1:3100/api/readiness']).trim();
  return { schema:'phoenix.chanjet-restoration-audit/v1', checkoutSha:installed.git(root,['rev-parse','HEAD']), floorVersion:floor.version,floorSha:floor.floorSha,chanjetPolicy:floor.chanjetPolicy||'HOLD',runtime:actual,flags,health,apiHttp,
    storageGuard:'PASS',worktreeClean:true, ...evidence, remoteReadAuth:'NOT_CHECKED',providerRemainingQuota:'NOT_AVAILABLE_LOCAL_COUNTERS_ONLY' };
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await productionAudit(fs.realpathSync(process.cwd()),fs.readFileSync(process.argv[2],'utf8')))); }
  catch { console.error('CHANJET_PRODUCTION_AUDIT=HOLD');process.exitCode=1; }
}
