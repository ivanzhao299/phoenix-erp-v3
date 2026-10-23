/** Fixed, bounded candidate readiness/startup observations. No state writes,
 * SUCCESS, ingress release, candidate creation or installed producer factory. */
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { CONTRACT, verifyContext } from './production-config-guard.mjs';
import { executionEnv } from './capture-production-runtime.mjs';
import { MaintenanceReceiptStore, validateMaintenanceContext, bindingDigest, canonicalDigest, same, HASH, iso } from './production-maintenance-receipts.mjs';
import { collectCandidateServerBinding } from './production-maintenance-candidate-binding.mjs';
import { captureSnapshot, captureDockerLogStreams, summarizeStartupLogs, startupBundle, compareSnapshots, verifyLiveSnapshot, MODE_EVIDENCE_SCHEMA, MAX_LOG_BYTES } from './production-deployment-evidence.mjs';
const fail = code => { throw new Error(`CANDIDATE_HEALTH_HOLD=${code}`); };
const exactKeys = (value, keys) => value && same(Object.keys(value).sort(), [...keys].sort());
// Fixed localhost endpoints only. No URL/headers/script/approval from a plan.
// Return only approved booleans, status and hashes, never raw body or headers.
export const API_READINESS_PROGRAM = `const {createHash}=require('node:crypto');(async()=>{const r=await fetch('http://127.0.0.1:3100/api/readiness',{method:'GET',redirect:'manual',signal:AbortSignal.timeout(2000),headers:{'cache-control':'no-cache'}});let chunks=[],size=0;const reader=r.body?.getReader();if(!reader)throw 0;for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();throw 0}chunks.push(value)}const bytes=Buffer.concat(chunks);let b;try{b=JSON.parse(bytes)}catch{throw 0}const d=Object.hasOwn(b,'code')?b.data:b;const ready=r.status===200&&(!Object.hasOwn(b,'code')||b.code===0)&&d?.status==='READY'&&d?.db==='connected'&&typeof d?.timestamp==='string'&&Number.isFinite(Date.parse(d.timestamp));process.stdout.write(JSON.stringify({status:r.status,ready,dbConnected:ready,bodySha256:createHash('sha256').update(bytes).digest('hex'),bodyBytes:size}));})().catch(()=>process.exit(64))`;
export const WEB_HTTP_PROGRAM = `(async()=>{const base='http://127.0.0.1:3000/';const r=await fetch(base,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(2000),headers:{'cache-control':'no-cache'}});const redirection=[307,308].includes(r.status),location=r.headers.get('location');let locationSameOrigin=!redirection;if(redirection&&location){try{locationSameOrigin=new URL(location,base).origin===new URL(base).origin}catch{}}await r.body?.cancel();process.stdout.write(JSON.stringify({status:r.status,accepted:r.status===200||(redirection&&locationSameOrigin),locationSameOrigin,bodyDiscarded:true}));})().catch(()=>process.exit(64))`;
function productionRead(args, { timeoutMs, maxBuffer = 65536 }) {
  try { return execFileSync('/usr/bin/docker', args, { env: executionEnv(), timeout: timeoutMs, maxBuffer, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch { fail('BOUNDED_DOCKER_READ_FAILED'); }
}
function productionLogs(args, { timeoutMs }) {
  return spawnSync('/usr/bin/docker', args, { env: executionEnv(), timeout: timeoutMs, maxBuffer: MAX_LOG_BYTES, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function pinMatches(metadata, pin, revision = true) {
  return metadata?.id === pin.id && metadata.image === pin.imageId && metadata.startedAt === pin.startedAt && metadata.restartCount === pin.restartCount
    && metadata.running === true && metadata.health === 'healthy' && (!revision || metadata.ociRevision === pin.revision);
}
function stableBinding(value) {
  const root = r => ({ contextDigest: r.contextDigest, database: r.database, backends: r.observation.backends, locks: r.observation.locks });
  return { contextDigest: value.contextDigest, stateDigest: value.stateDigest, candidateReplacementSha256: value.candidateReplacementSha256,
    runtime: value.runtime, status: value.status, approvedRuntimeContractSha256: value.approvedRuntimeContractSha256,
    projection: value.projection, databaseBinding: value.database.binding, rootBefore: root(value.rootBefore), rootAfter: root(value.rootAfter) };
}
export async function observeCandidateHealthAndStartup(request, dependencies = {}) {
  try {
    if (!request || Object.keys(request).some(key => !['context', 'expectedStateDigest', 'replacementEvidence', 'rootLease', 'signal', 'timeoutMs'].includes(key))) fail('FIXED_REQUEST_REQUIRED');
    const { context, expectedStateDigest, replacementEvidence, rootLease, signal, timeoutMs = 30000 } = request;
    validateMaintenanceContext(context);
    if (!HASH.test(expectedStateDigest || '') || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000 || (signal && !(signal instanceof AbortSignal))) fail('FIXED_REQUEST_REQUIRED');
    const now = dependencies.now || Date.now, mono = dependencies.monotonicNow || (() => performance.now());
    const start = now(), initialMono = mono(), deadline = Math.min(start + timeoutMs, Date.parse(context.window.end)), monoDeadline = initialMono + deadline - start;
    let lastWall = start, lastMono = initialMono;
    const remaining = () => {
      const wall = now(), monotonic = mono();
      if (![start, initialMono, wall, monotonic].every(Number.isFinite) || wall < lastWall || monotonic < lastMono || wall < Date.parse(context.window.start)
        || wall >= deadline || monotonic >= monoDeadline || signal?.aborted) fail('DEADLINE_OR_ABORT');
      lastWall = wall; lastMono = monotonic; return Math.max(1, Math.floor(Math.min(deadline - wall, monoDeadline - monotonic)));
    };
    const guard = dependencies.guard || (() => verifyContext(CONTRACT.repository, CONTRACT.stateDirectory));
    const check = () => { remaining(); guard(); remaining(); };
    const store = dependencies.store || new MaintenanceReceiptStore(context);
    const collect = dependencies.collectBinding || collectCandidateServerBinding;
    const binding = async () => {
      check(); const value = await collect({ context, expectedStateDigest, replacementEvidence, rootLease, mode: 'ADOPTED', signal, timeoutMs: remaining() }, dependencies.bindingDependencies || {}); check();
      if (value?.schema !== 'phoenix.candidate-server-binding-observation/v1' || value.result !== 'OBSERVATION_ONLY' || value.mode !== 'ADOPTED'
        || value.contextDigest !== bindingDigest(context) || value.stateDigest !== expectedStateDigest || value.candidateReplacementSha256 !== replacementEvidence.evidenceSha256
        || value.status?.owner !== context.owner || value.status.phase !== 'FENCED' || value.status.generation !== 2
        || value.runtime?.api?.imageId !== context.candidate.imageId || value.runtime.api.revision !== context.targetSha) fail('STRICT_BINDING_REQUIRED');
      return value;
    };
    const read = args => { check(); const value = (dependencies.read || productionRead)(args, { timeoutMs: Math.min(5000, remaining()) }); check(); return value; };
    const before = await binding();
    const preFile = path.join(store.directory, `maintenance-formal-pre-${context.owner}.json`);
    check(); const pre = store.read(preFile); check();
    if (pre.schema !== MODE_EVIDENCE_SCHEMA || pre.deployMode !== 'api' || pre.phase !== 'PRE_SNAPSHOT' || pre.deployRunId !== context.owner
      || pre.deployRunAttempt !== Number(context.owner.split('-').at(-1)) || pre.targetSha !== context.targetSha || pre.configFloorSha !== context.targetSha
      || !iso(pre.capturedAt) || Date.parse(pre.capturedAt) < Date.parse(context.window.start) || Date.parse(pre.capturedAt) > now()) fail('FORMAL_PRE_BINDING');
    for (const service of ['api', 'web', 'db']) if (!pinMatches(pre.containers?.[service], context.preSnapshot[service], service !== 'db')) fail('FORMAL_PRE_RUNTIME');
    const probe = (id, program) => { let result; try { result = JSON.parse(read(['exec', id, '/usr/bin/env', '-i', 'PATH=/usr/local/bin:/usr/bin:/bin', '/usr/local/bin/node', '-e', program])); } catch { fail('HTTP_PROBE_UNVERIFIED'); } return result; };
    const api = probe(before.runtime.api.id, API_READINESS_PROGRAM), web = probe(context.preSnapshot.web.id, WEB_HTTP_PROGRAM);
    if (!exactKeys(api, ['status', 'ready', 'dbConnected', 'bodySha256', 'bodyBytes']) || api.status !== 200 || api.ready !== true || api.dbConnected !== true
      || !HASH.test(api.bodySha256 || '') || !Number.isSafeInteger(api.bodyBytes) || api.bodyBytes < 1 || api.bodyBytes > 4096) fail('API_READINESS_UNVERIFIED');
    if (!exactKeys(web, ['status', 'accepted', 'locationSameOrigin', 'bodyDiscarded']) || ![200, 307, 308].includes(web.status) || web.accepted !== true
      || web.locationSameOrigin !== true || web.bodyDiscarded !== true) fail('WEB_HTTP_UNVERIFIED');
    check(); const capturedAt = new Date(now()).toISOString();
    const post = captureSnapshot({ phase: 'POST_SNAPSHOT', runId: context.owner, runAttempt: context.owner.split('-').at(-1), targetSha: context.targetSha,
      floorSha: context.targetSha, deployMode: 'api', capturedAt }, read); check();
    if (!pinMatches(post.containers.api, before.runtime.api) || post.containers.api.id === context.preSnapshot.api.id) fail('POST_CANDIDATE_PIN');
    compareSnapshots(pre, post, 'api'); check();
    const streams = captureDockerLogStreams({ containerId: post.containers.api.id, startedAt: post.containers.api.startedAt, capturedAt }, args => {
      check(); const value = (dependencies.logs || productionLogs)(args, { timeoutMs: Math.min(5000, remaining()) }); check(); return value;
    });
    const summary = summarizeStartupLogs({ ...streams, containerId: post.containers.api.id, startedAt: post.containers.api.startedAt, capturedAt,
      runId: context.owner, runAttempt: context.owner.split('-').at(-1), targetSha: context.targetSha, floorSha: context.targetSha, deployMode: 'api', readinessVerified: true });
    if (summary.result !== 'PASS_REDACTED_SUMMARY' || summary.rawOutput !== false) fail('API_STARTUP_UNVERIFIED');
    check(); const after = await binding();
    const live = verifyLiveSnapshot(post, { runId: context.owner, runAttempt: context.owner.split('-').at(-1), targetSha: context.targetSha,
      configFloorSha: context.targetSha, deployMode: 'api', evidenceSchema: MODE_EVIDENCE_SCHEMA }, read); check();
    check(); if (!same(stableBinding(before), stableBinding(after)) || !same(pre, store.read(preFile))) fail('OBSERVATION_CHANGED'); check();
    return { schema: 'phoenix.candidate-health-observation/v1', result: 'OBSERVATION_ONLY', contextDigest: bindingDigest(context), stateDigest: expectedStateDigest,
      startedAt: new Date(start).toISOString(), finishedAt: new Date(now()).toISOString(), apiReadiness: api, webHttp: web, post,
      startup: startupBundle(post, { api: summary }), liveReinspectSha256: canonicalDigest(live), beforeBindingSha256: canonicalDigest(before), afterBindingSha256: canonicalDigest(after),
      rawOutput: false, registryInstalled: false, continuousIngressProof: false, productionMutation: false, admissionOrApprovalGranted: false,
      outerProcessSupervisionRequired: true };
  } catch (error) {
    if (/^CANDIDATE_HEALTH_HOLD=[A-Z_]+$/.test(error?.message || '')) throw error;
    const failure = Error('CANDIDATE_HEALTH_HOLD=OBSERVATION_UNVERIFIED');
    // Redacted diagnostic only: the wrapped health observation's class.
    failure.healthUnderlying ??= String(error?.message ?? error).slice(0, 200);
    if (error && typeof error === 'object') { failure.bindingUnderlying ??= error.bindingUnderlying ?? null;
      failure.rootUnderlying ??= error.rootUnderlying ?? null; }
    throw failure;
  }
}
