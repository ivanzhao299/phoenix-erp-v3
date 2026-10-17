import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const run = (file,args,options={}) => execFileSync(file,args,{ encoding:'utf8', stdio:['pipe','pipe','pipe'], ...options });
export function auditMappingScope(evidence, approval) {
  const enabled = evidence.mappings.filter(m => m.syncEnabled);
  if (!enabled.length || evidence.runningJobs || evidence.queuedJobs || evidence.recoveryCandidates || evidence.legacyRunningJobs
    || evidence.writebackPending || evidence.wmsWritebackPending || evidence.mappingConflicts) throw new Error('RESTORATION_HOLD=CURRENT_JOBS_OR_MAPPING');
  if (new Set(enabled.map(m=>m.bookId)).size !== enabled.length || new Set(enabled.map(m=>m.companyCode)).size !== enabled.length) throw new Error('RESTORATION_HOLD=CROSS_COMPANY');
  for (const m of enabled) {
    const b=evidence.books.find(b=>b.bookId===m.bookId);
    if (!m.companyActive || !b?.enabled || b.companyCode!==m.companyCode) throw new Error('RESTORATION_HOLD=BOOK_BINDING');
  }
  if (approval && (enabled.length!==approval.books.length || enabled.some(m=>!approval.books.some(a=>a.bookId===m.bookId && a.companyCode===m.companyCode)))) throw new Error('RESTORATION_HOLD=APPROVED_BOOK_SCOPE_CHANGED');
  return enabled.map(({bookId,companyCode})=>({bookId,companyCode}));
}
export function readDatabaseEvidence(sql,{timeoutMs=30000}={}) {
  // Actual production schema is authoritative; no fallback to historical zero counts.
  // The subprocess itself carries a hard timeout+SIGKILL: a synchronous
  // execFileSync cannot be bounded by Promise.race — the bound must live in
  // the child process. The SERVER-side statement/lock timeouts are derived
  // from the SAME caller budget so a server-side cancel always precedes the
  // client-side kill.
  // 无固定下限扩大：服务端取消点严格早于客户端 kill（250ms 余量）
  const statementMs=Math.max(1,Math.min(timeoutMs-250,20000));
  const lockMs=Math.max(1,Math.min(statementMs,3000));
  const output=run('docker',['exec','-i','-e','PGOPTIONS=-c default_transaction_read_only=on','phoenix-v3-db','sh','-c','exec psql -X -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "${POSTGRES_DB:-$POSTGRES_USER}"'],
    { input:`BEGIN READ ONLY;\nSET LOCAL statement_timeout='${statementMs}ms';\nSET LOCAL lock_timeout='${lockMs}ms';\n${sql}\nROLLBACK;\n`, timeout:timeoutMs, killSignal:'SIGKILL' });
  const line=output.split('\n').find(line=>line.startsWith('{')); if(!line) throw new Error('RESTORATION_HOLD=DB_EVIDENCE');
  return JSON.parse(line);
}
export function readFormalDeploymentEvidence(stateDirectory, actual, floorSha) {
  try {
    const names = fs.readdirSync(stateDirectory).filter(name => /^deploy-\d+(?:-\d+)?-(?:pre|post|startup)-evidence\.json$/.test(name));
    const groups = new Map();
    for (const name of names) { const match = name.match(/^(deploy-\d+(?:-\d+)?)-(pre|post|startup)-evidence\.json$/); const group = groups.get(match[1]) || {}; group[match[2]] = path.join(stateDirectory, name); groups.set(match[1], group); }
    const candidate = [...groups.entries()].sort(([left], [right]) => right.localeCompare(left, undefined, { numeric: true })).map(([, group]) => group).find(group => group.pre && group.post && group.startup);
    if (!candidate) return { status: 'UNAVAILABLE' };
    const pre = JSON.parse(fs.readFileSync(candidate.pre, 'utf8')); const post = JSON.parse(fs.readFileSync(candidate.post, 'utf8')); const startup = JSON.parse(fs.readFileSync(candidate.startup, 'utf8'));
    if (pre.schema !== 'phoenix.production-deployment-evidence/v2' || post.schema !== pre.schema || startup.schema !== pre.schema
      || pre.phase !== 'PRE_SNAPSHOT' || post.phase !== 'POST_SNAPSHOT' || startup.phase !== 'API_STARTUP_LOG' || pre.deployRunId !== post.deployRunId
      || pre.deployRunAttempt !== post.deployRunAttempt || pre.targetSha !== post.targetSha || startup.targetSha !== post.targetSha
      || post.configFloorSha !== floorSha || startup.deployRunAttempt !== post.deployRunAttempt || startup.configFloorSha !== post.configFloorSha
      || post.containers.api.ociRevision !== actual.api.revision
      || post.containers.api.id !== startup.containerId || post.containers.api.startedAt !== startup.startedAt || startup.rawOutput !== false
      || !Number.isInteger(startup.stdoutLineCount) || !Number.isInteger(startup.stderrLineCount) || !Number.isInteger(startup.errorSignalCount)
      || !Number.isInteger(startup.schemaWriteSignalCount) || !Number.isInteger(startup.sensitiveLineCount) || !/^[a-f0-9]{64}$/.test(startup.combinedDigest || '')) return { status: 'HOLD', reason: 'BINDING_OR_IDENTITY' };
    const unchanged = ['db', 'web'].every(service => pre.containers[service].id === post.containers[service].id && pre.containers[service].startedAt === post.containers[service].startedAt && pre.containers[service].image === post.containers[service].image);
    return { status: unchanged && startup.result === 'PASS_REDACTED_SUMMARY' ? 'PASS' : 'HOLD', runId: post.deployRunId, runAttempt: post.deployRunAttempt, configFloorSha: post.configFloorSha, targetSha: post.targetSha, web: 'ID_STARTED_IMAGE_UNCHANGED', db: 'ID_STARTED_IMAGE_UNCHANGED', startup: startup.result, rawOutput: false };
  } catch { return { status: 'HOLD', reason: 'EVIDENCE_UNREADABLE' }; }
}
// hostContext (optional) binds ONLY the host-identity pieces to a controlled
// production context (the isolated full-chain acceptance): captureRuntime
// (deployed pins), guardProduction (approved floor state), the state
// directory for the formal deployment-evidence read and the probe
// environment for the container env/health inspection surface. Without it —
// the production CLI path — every binding is exactly the real production one.
export async function productionAudit(root, sql, { expectedProductionSha = process.env.EXPECTED_PRODUCTION_SHA || '', candidateSha = process.env.CANDIDATE_MAIN_SHA || '', hostContext = null } = {}) {
  const installed=await import(pathToFileURL(path.join(root,'scripts/ops/production-config-guard.mjs')).href);
  const { captureRuntime, executionEnv }=await import(pathToFileURL(path.join(root,'scripts/ops/capture-production-runtime.mjs')).href);
  const actual=hostContext?.captureRuntime ? hostContext.captureRuntime() : captureRuntime();
  if (!/^[a-f0-9]{40}$/.test(expectedProductionSha) || actual.api?.revision !== expectedProductionSha) throw new Error('AUDIT_HOLD=PRODUCTION_SHA_MISMATCH');
  console.error('AUDIT_STAGE=CHECKOUT_IDENTITY');
  const floor=hostContext
    ? hostContext.guardProduction({ root, actual, candidateSha })
    : installed.guardProduction(root,installed.CONTRACT.stateDirectory,actual);
  console.error('AUDIT_STAGE=FLOOR_GUARD');
  const evidence=readDatabaseEvidence(sql);
  console.error('AUDIT_STAGE=DB_READONLY');
  // fail-closed mapping/job BLOCK semantics over the fresh evidence — a
  // running/queued/recovery job, a cross-company or unbound mapping pair or
  // an approved-book scope change blocks the audit itself (the VERIFY floor's
  // approved books are the binding reference; a HOLD floor still enforces the
  // approval-independent job blockers)
  auditMappingScope(evidence, floor.readonlyApproval || null);
  console.error('AUDIT_STAGE=MAPPING_SCOPE');
  const probeEnv=hostContext?.probeEnvironment || executionEnv();
  const raw=JSON.parse(run('docker',['inspect','phoenix-v3-api','--format','{{json .Config.Env}}'],{env:probeEnv}));
  const flags=Object.fromEntries(raw.filter(x=>/^(CHANJET_READONLY_SYNC_ENABLED|CHANJET_ERP_INBOUND_SYNC_ENABLED|CHANJET_SYNC_POLICY)=/.test(x)).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
  const health=Object.fromEntries(['db','api','web'].map(service=>[service,run('docker',['inspect',`phoenix-v3-${service}`,'--format','{{.State.Health.Status}}'],{env:probeEnv}).trim()]));
  const apiHttp=run('curl',['-sS','--max-time','15','-o','/dev/null','-w','%{http_code}','http://127.0.0.1:3100/api/readiness']).trim();
  const deploymentEvidence=readFormalDeploymentEvidence(hostContext?.stateDirectory || installed.CONTRACT.stateDirectory, actual, floor.floorSha);
  // the audit REFUSES instead of reporting: a live runtime whose flags drift
  // from the floor's expected policy tuple, an unhealthy runtime or a formal
  // deployment evidence that is not PASS each block the audit itself
  // (fail-closed, before any consumer can act on a collected-but-unrejected
  // verdict)
  const policy = floor.chanjetPolicy || 'HOLD';
  const expectedTuple = { CHANJET_SYNC_POLICY: policy, CHANJET_READONLY_SYNC_ENABLED: policy === 'HOLD' ? 'false' : 'true', CHANJET_ERP_INBOUND_SYNC_ENABLED: 'false' };
  if (Object.entries(expectedTuple).some(([key, value]) => flags[key] !== value)) throw new Error('AUDIT_HOLD=LIVE_POLICY_TUPLE');
  if (Object.values(health).some(status => status !== 'healthy') || apiHttp !== '200') throw new Error('AUDIT_HOLD=RUNTIME_HEALTH');
  if (deploymentEvidence.status !== 'PASS') throw new Error(`AUDIT_HOLD=DEPLOYMENT_EVIDENCE_${deploymentEvidence.status}${deploymentEvidence.reason ? `_${deploymentEvidence.reason}` : ''}`);
  return { schema:'phoenix.chanjet-restoration-audit/v1', checkoutSha:installed.git(root,['rev-parse','HEAD']), deployedSha:actual.api.revision, expectedProductionSha, candidateSha, floorVersion:floor.version,floorSha:floor.floorSha,chanjetPolicy:floor.chanjetPolicy||'HOLD',runtime:actual,flags,health,apiHttp, deploymentEvidence,
    storageGuard:'PASS',worktreeClean:true, ...evidence, remoteReadAuth:'NOT_CHECKED',providerRemainingQuota:'NOT_AVAILABLE_LOCAL_COUNTERS_ONLY' };
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await productionAudit(fs.realpathSync(process.cwd()),fs.readFileSync(process.argv[2],'utf8')))); }
  catch (error) { const code=String(error?.message || '').match(/^(?:AUDIT_HOLD|CONFIG_HOLD|RESTORATION_HOLD|MIGRATION_SCOPE)=[A-Z0-9_]+/)?.[0] || 'AUDIT_HOLD=COMMAND_FAILED'; console.error(`CHANJET_PRODUCTION_AUDIT=HOLD class=${code}`);process.exitCode=1; }
}
