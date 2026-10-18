// Reviewed stdin-only diagnostic. No file writes, configuration transaction,
// image switch, migration execution, provider request or raw state/env output.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

export function safeClass(error) {
  return String(error?.message || '').match(/^(?:CONFIG_HOLD|MIGRATION_SCOPE|DEPLOY_EVIDENCE_HOLD|RUNTIME_HOLD)=[A-Z0-9_]+/)?.[0] || 'UNVERIFIED_READ_FAILED';
}
export function safeFlag(value) {
  return ['true', 'false'].includes(value) ? value : 'INVALID_OR_UNSET';
}
export const safeSha = value => /^[a-f0-9]{40}$/.test(value || '') ? value : null;
export const safePin = value => ({ revision: safeSha(value?.revision),
  imageId: /^sha256:[a-f0-9]{64}$/.test(value?.imageId || '') ? value.imageId : null });
const safeWord = value => typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(value) ? value : 'INVALID_OR_UNSET';
export function ledgerSummary(inventory, actual) {
  const canonical = inventory.canonicalTypeorm;
  const known = new Map(canonical.map(x => [x.effective_name, Number(x.timestamp)]));
  const retired = new Map(inventory.retired.map(x => [x.name || x.effective_name, Number(x.timestamp)]));
  const rows = actual.typeorm;
  const names = new Set(rows.map(x => x.name));
  return {
    canonicalCount: canonical.length, appliedCount: rows.length,
    canonicalAppliedCount: canonical.filter(x => names.has(x.effective_name)).length,
    retiredAppliedCount: rows.filter(x => !known.has(x.name) && retired.get(x.name) === Number(x.timestamp)).length,
    pendingCount: canonical.filter(x => !names.has(x.effective_name)).length,
    duplicateCount: rows.length - names.size,
    unknownCount: rows.filter(x => !known.has(x.name) && !retired.has(x.name)).length,
    timestampMismatchCount: rows.filter(x => (known.get(x.name) ?? retired.get(x.name)) !== Number(x.timestamp)).length,
    legacyAppliedCount: actual.legacy.length, legacyCanonicalCount: inventory.legacy.length,
    legacyExactSet: JSON.stringify(actual.legacy.map(x => x.filename).sort()) === JSON.stringify([...inventory.legacy].sort()),
  };
}

export async function verifiedTopologyCollector(encoded, expectedHash) {
  if (typeof encoded !== 'string' || encoded.length > 131072 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
    || !/^[a-f0-9]{64}$/.test(expectedHash || '')) throw Error('CONFIG_HOLD=TOPOLOGY_PROGRAM_MISMATCH');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > 98304 || bytes.toString('base64') !== encoded
    || createHash('sha256').update(bytes).digest('hex') !== expectedHash) throw Error('CONFIG_HOLD=TOPOLOGY_PROGRAM_MISMATCH');
  const helper = await import('data:text/javascript;base64,' + encoded);
  if (helper.TOPOLOGY_SCHEMA !== 'phoenix.maintenance-host-topology/v1'
    || typeof helper.collectMaintenanceHostTopology !== 'function') throw Error('CONFIG_HOLD=TOPOLOGY_PROGRAM_INTERFACE');
  return helper;
}
export async function diagnose() {
  // Imported helper CLIs must remain library-only when this file is stdin.
  process.argv[1] = '/reviewed-batch2-diagnostic-stdin';
  const ROOT = '/data/phoenix-erp';
  const target = process.env.FORENSIC_TARGET_SHA;
  if (!/^[a-f0-9]{40}$/.test(target || '')) throw Error('CONFIG_HOLD=TARGET_MISMATCH');
  const load = file => import(pathToFileURL(path.join(ROOT, 'scripts/ops', file)).href);
  const guard = await load('production-config-guard.mjs');
  const runtimeHelper = await load('capture-production-runtime.mjs');
  const evidenceHelper = await load('production-deployment-evidence.mjs');
  const pathsHelper = await load('production-trusted-paths.mjs');
  const STATE = guard.CONTRACT.stateDirectory;
  // Fail before any protected state reads unless the genuine existing context
  // and parent FD9 lock satisfy the installed authority.
  guard.verifyContext(ROOT, STATE);
  guard.requireCleanMain(ROOT);
  const topologyHelper = await verifiedTopologyCollector(process.env.FORENSIC_TOPOLOGY_B64, process.env.FORENSIC_TOPOLOGY_SHA256);
  const decoded = name => JSON.parse(Buffer.from(process.env[name] || '', 'base64').toString());
  const approvedContract = decoded('PRODUCTION_CONTRACT_B64');
  const schemaContract = decoded('FORENSIC_SCHEMA_CONTRACT_B64');
  const inventory = decoded('FORENSIC_INVENTORY_B64');
  const env = runtimeHelper.executionEnv();
  const run = (file, args, options = {}) => execFileSync(file, args, {
    env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 25000,
    killSignal: 'SIGKILL', maxBuffer: 16 * 1024 * 1024, ...options,
  }).trim();
  const out = { schema: 'phoenix.batch2-config-forensics/v1', collectedAt: new Date().toISOString(), target,
    runnerSha: process.env.FORENSIC_RUNNER_SHA, classificationScope: 'CURRENT_COLLECTION_TIME_NOT_FAILED_RUN_REPLAY',
    context: { uid: process.getuid(), trustedPathsAndFd9: 'PASS' }, errors: [] };
  const attempt = (stage, fn) => {
    try { return fn(); } catch (error) { const classification = safeClass(error); out.errors.push({ stage, classification }); return null; }
  };
  const git = args => guard.git(ROOT, args);
  out.checkout = { sha: git(['rev-parse', 'HEAD']), branch: git(['branch', '--show-current']), clean: true,
    originMainSha: safeSha(git(['rev-parse', 'refs/remotes/origin/main'])) };
  const names = ['floor.json', 'active.json', 'transaction.json', 'policy-transition.json'];
  const captureRecord = name => {
    const file = path.join(STATE, name);
    if (!fs.existsSync(file)) return { content: null, fingerprint: { exists: false } };
    const bytes = pathsHelper.readPinnedFile(file, { contract: guard.CONTRACT });
    const st = fs.lstatSync(file);
    return { content: JSON.parse(bytes.toString()), fingerprint: { exists: true,
      bytesSha256: createHash('sha256').update(bytes).digest('hex'),
      identity: [st.dev, st.ino, st.uid, st.mode, st.nlink, st.size, st.mtimeMs, st.ctimeMs] } };
  };
  const initial = Object.fromEntries(names.map(name => [name, captureRecord(name)]));
  const read = name => captureRecord(name).content;
  const records = Object.fromEntries(names.map(name => [name, initial[name].content]));
  const floor = records['floor.json'], active = records['active.json'];
  out.floor = floor && { version: Number.isInteger(floor.version) ? floor.version : null, floorSha: safeSha(floor.floorSha), phase: safeWord(floor.phase),
    chanjetPolicy: ['HOLD', 'READONLY_VERIFY', 'READONLY_ACTIVE'].includes(floor.chanjetPolicy) ? floor.chanjetPolicy : 'INVALID_OR_UNSET',
    readonlyApprovalIsNull: floor.readonlyApproval === null,
    readonlyApprovalPresent: floor.readonlyApproval !== null && floor.readonlyApproval !== undefined };
  out.active = active && { version: Number.isInteger(active.version) ? active.version : null,
    floorSha: safeSha(active.floorSha), configSha: safeSha(active.configSha),
    outcome: safeWord(active.outcome), pins: { api: safePin(active.active?.api), web: safePin(active.active?.web) }, migrationBaseline: safeSha(active.migrationBaseline) };
  const marker = value => value ? { exists: true, version: Number.isInteger(value.version) ? value.version : null,
    runId: /^\d+(?:-\d+)?$/.test(value.runId || '') ? value.runId : null,
    phase: safeWord(value.phase), operation: safeWord(value.operation), target: safeSha(value.target),
    expiresAt: Number.isFinite(Date.parse(value.expiresAt)) ? new Date(value.expiresAt).toISOString() : null,
    expired: Number.isFinite(Date.parse(value.expiresAt)) ? Date.parse(value.expiresAt) <= Date.now() : null } : { exists: false };
  out.transaction = marker(records['transaction.json']);
  out.policyTransition = marker(records['policy-transition.json']);
  const actual = attempt('runtime', () => runtimeHelper.captureRuntime());
  out.runtime = actual;
  out.activePinsMatch = actual && active ? ['api', 'web'].every(s => active.active?.[s]?.imageId === actual[s]?.imageId && active.active?.[s]?.revision === actual[s]?.revision) : null;
  const containerRecords = Object.fromEntries(['api', 'web', 'db'].map(service => [service, attempt('container_' + service,
    () => evidenceHelper.metadataFor(service, args => run('docker', args)))]));
  out.containers = Object.fromEntries(Object.entries(containerRecords).map(([service, value]) => [service, value && {
    id: value.id, image: value.image, ociRevision: value.ociRevision, created: value.created,
    startedAt: value.startedAt, running: value.running, health: value.health, restartCount: value.restartCount,
    // DB mounts are explicitly requested operational metadata. Other services
    // expose destination/type only, never arbitrary host paths or file contents.
    mounts: value.mounts.map(m => ({ type: m.type, destination: m.destination, readOnly: m.readOnly,
      ...(service === 'db' ? { source: m.source } : {}) })),
  }]));
  attempt('flags', () => {
    const values = JSON.parse(run('docker', ['inspect', 'phoenix-v3-api', '--format', '{{json .Config.Env}}']));
    const select = key => values.find(x => x.startsWith(key + '='))?.slice(key.length + 1);
    const policy = select('CHANJET_SYNC_POLICY');
    out.flags = { CHANJET_READONLY_SYNC_ENABLED: safeFlag(select('CHANJET_READONLY_SYNC_ENABLED')),
      CHANJET_ERP_INBOUND_SYNC_ENABLED: safeFlag(select('CHANJET_ERP_INBOUND_SYNC_ENABLED')),
      CHANJET_SYNC_POLICY: ['HOLD', 'READONLY_VERIFY', 'READONLY_ACTIVE'].includes(policy) ? policy : 'INVALID_OR_UNSET',
      readonlyApprovalPresent: Boolean(select('CHANJET_READONLY_APPROVAL')) };
  });
  out.health = Object.fromEntries([['api', 'http://127.0.0.1:3100/api/readiness'], ['web', 'http://127.0.0.1:3000/']].map(([service, url]) => [service,
    attempt('http_' + service, () => run('curl', ['-sS', '--max-time', '15', '-o', '/dev/null', '-w', '%{http_code}', url]))]));
  out.installedGuard = attempt('installed_guard', () => { guard.guardProduction(ROOT, STATE, actual); return 'PASS'; });
  out.targetFloorCheck = floor && attempt('target_floor', () => { guard.assertFloor(ROOT, floor, target, { targetTree: true }); return 'PASS'; });
  out.criticalFiles = attempt('critical_files', () => {
    if (JSON.stringify(guard.CONTRACT.criticalFiles) !== JSON.stringify(approvedContract.criticalFiles)) throw Error('CONFIG_HOLD=CONTROL_CONTRACT');
    return approvedContract.criticalFiles.map(file => ({ file,
      oldBlob: git(['rev-parse', `${floor.floorSha}:${file}`]), targetBlob: git(['rev-parse', `${target}:${file}`]) }));
  });
  out.migrationScope = actual && attempt('migration_scope', () => guard.migrationScope(ROOT, actual.api.revision, target));
  const db = sql => {
    const text = run('docker', ['exec', '-i', '-e', 'PGOPTIONS=-c default_transaction_read_only=on', 'phoenix-v3-db', 'sh', '-c',
      'exec psql -X -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "${POSTGRES_DB:-$POSTGRES_USER}"'],
    { input: `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='3s'; ${sql}\nROLLBACK;` });
    const line = text.split('\n').find(x => x.startsWith('{'));
    if (!line) throw Error('CONFIG_HOLD=BOOTSTRAP_SCHEMA_EVIDENCE');
    return JSON.parse(line);
  };
  out.ledger = attempt('ledger', () => ledgerSummary(inventory, db(`SELECT json_build_object(
    'legacy',(SELECT COALESCE(json_agg(json_build_object('filename',filename)), '[]'::json) FROM schema_migrations),
    'typeorm',(SELECT COALESCE(json_agg(json_build_object('name',name,'timestamp',timestamp)), '[]'::json) FROM migrations));`)));
  const schemaHelper = await import('data:text/javascript;base64,' + process.env.FORENSIC_SCHEMA_HELPER_B64);
  out.schemaCompatibility = attempt('schema', () => schemaHelper.assertBootstrapSchemaEvidence(schemaContract, db(schemaHelper.bootstrapSchemaSql(schemaContract))));
  out.asyncJobs = attempt('jobs', () => {
    const result = db(`SELECT json_build_object(
      'runningJobs',(SELECT count(*) FROM chanjet_sync_jobs WHERE status='RUNNING'),
      'queuedJobs',(SELECT count(*) FROM chanjet_sync_jobs WHERE request_scope->>'lifecycleState'='QUEUED' AND status='RUNNING'),
      'recoveryCandidates',(SELECT count(*) FROM chanjet_sync_jobs WHERE status='RUNNING' AND request_scope ? 'orchestrationRunId'),
      'legacyRunningJobs',(SELECT count(*) FROM chanjet_sync_jobs WHERE status='RUNNING' AND NOT COALESCE(request_scope ? 'orchestrationRunId',false)),
      'writebackPending',(SELECT count(*) FROM chanjet_writeback_outbox WHERE state NOT IN ('ACKNOWLEDGED','CANCELLED','REVERSED')),
      'wmsWritebackPending',(SELECT count(*) FROM chanjet_wms_writeback_outbox WHERE state NOT IN ('ACKNOWLEDGED','CANCELLED','REVERSED')),
      'mappingConflicts',(SELECT count(*) FROM chanjet_master_mapping WHERE match_status='CONFLICT'));`);
    return { scope: 'CHANJET_JOBS_AND_WRITEBACK_ONLY', otherAsyncTaskFamilies: 'UNVERIFIED',
      ...Object.fromEntries(['runningJobs', 'queuedJobs', 'recoveryCandidates', 'legacyRunningJobs', 'writebackPending', 'wmsWritebackPending', 'mappingConflicts'].map(key => [key,
        Number.isSafeInteger(result[key]) && result[key] >= 0 ? result[key] : 'UNVERIFIED'])) };
  });
  const failedRun = '39046351442-1';
  out.boundFailedDeployEvidence = {
    runId: failedRun, scope: 'EXACT_FAILED_RUN_FILE_PRESENCE_ONLY',
    files: Object.fromEntries(['pre', 'post', 'startup'].map(kind => [kind, fs.existsSync(path.join(STATE, `deploy-${failedRun}-${kind}-evidence.json`))])),
    transactionRecordExists: fs.existsSync(path.join(STATE, `deploy-${failedRun}.json`)),
  };
  out.latestCompleteEvidenceTriplet = attempt('latest_complete_triplet_not_success_verdict', () => {
    const files = fs.readdirSync(STATE), groups = new Map();
    for (const file of files) { const m = file.match(/^deploy-(\d+(?:-\d+)?)-(pre|post|startup)-evidence\.json$/); if (m) { const group = groups.get(m[1]) || {}; group[m[2]] = file; groups.set(m[1], group); } }
    const selected = [...groups.entries()].sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true })).find(([, x]) => x.pre && x.post && x.startup);
    if (!selected) return { status: 'UNVERIFIED_NO_COMPLETE_TRIPLET' };
    const [runId, selectedFiles] = selected, pre = read(selectedFiles.pre), post = read(selectedFiles.post), startup = read(selectedFiles.startup);
    const snapshots = evidenceHelper.compareSnapshots(pre, post);
    return { scope: 'LATEST_COMPLETE_TRIPLET_NOT_LAST_SUCCESS_ASSERTION', runId, targetSha: post.targetSha, floorSha: post.configFloorSha, snapshots,
      runtimeMatchesPost: ['api', 'web', 'db'].every(s => post.containers[s].id === containerRecords[s]?.id && post.containers[s].image === containerRecords[s]?.image && post.containers[s].startedAt === containerRecords[s]?.startedAt),
      startup: { result: startup.result, stdoutLineCount: startup.stdoutLineCount, stderrLineCount: startup.stderrLineCount,
        errorSignalCount: startup.errorSignalCount, schemaWriteSignalCount: startup.schemaWriteSignalCount,
        sensitiveLineCount: startup.sensitiveLineCount, rawOutput: startup.rawOutput,
        bindingMatches: startup.containerId === post.containers.api.id && startup.startedAt === post.containers.api.startedAt && startup.targetSha === post.targetSha && startup.configFloorSha === post.configFloorSha && startup.deployRunId === post.deployRunId && startup.deployRunAttempt === post.deployRunAttempt } };
  });
  try {
    out.hostTopology = await topologyHelper.collectMaintenanceHostTopology({ guard: () => {
      guard.verifyContext(ROOT, STATE); guard.requireCleanMain(ROOT); return true;
    } });
  } catch {
    out.hostTopology = { result: 'UNVERIFIED', completeSafetyProof: false, continuousDrainProof: false, admissionOrApprovalGranted: false };
    out.errors.push({ stage: 'host_topology', classification: 'UNVERIFIED_READ_FAILED' });
  }
  const final = attempt('control_record_postcheck', () => Object.fromEntries(names.map(name => [name, captureRecord(name).fingerprint])));
  out.controlRecordsUnchanged = final ? names.every(name => JSON.stringify(final[name]) === JSON.stringify(initial[name].fingerprint)) : 'UNVERIFIED';
  out.controlRecordComparison = 'PINNED_RAW_BYTES_AND_FILE_IDENTITY';
  out.operationsAttemptedByThisDiagnostic = { checkoutUpdate: false, floorWrite: false, activeWrite: false,
    transactionWrite: false, containerSwitch: false, migration: false, databaseWrite: false, chanjetSync: false };
  return out;
}

if (process.argv[1] === '-' || (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)) {
  try { console.log('CONFIG_FORENSICS_JSON=' + JSON.stringify(await diagnose())); }
  catch (error) { console.error('CONFIG_FORENSICS_HOLD=' + safeClass(error)); process.exitCode = 1; }
}
