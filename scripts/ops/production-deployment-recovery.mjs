// One-time, staged, resumable recovery for an expired, root-caused CODE_HOLD
// deployment transaction whose startup-evidence HOLD was classified Case A
// (all signals attributed to benign startup log lines; no actual database
// write evidence).
//
// Stage protocol (archive record `recovery-<targetRunId>.json` carries the
// phase; every phase transition is written AFTER its action succeeds, so a
// crash mid-way always leaves a resumable, truthful state):
//
//   ARCHIVED         snapshots + plan recorded, nothing mutated yet
//   ACTIVE_WRITTEN   active.json forward-finalized to the switched candidate
//   DEPLOY_WRITTEN   deploy-<run>.json marked SUCCESS with recovery provenance
//   COMPLETE         transaction.json + policy-transition.json cleared
//
// Resume rules: an existing archive is NOT a permanent refusal — phases
// already applied are verified against the recorded plan and skipped; only a
// COMPLETE archive is terminal. Marker cleanup is idempotent and tolerates a
// partial deletion from an earlier attempt. A resume under a different
// RECOVERY_RUN_ID is allowed and recorded in resumedByRunIds; the original
// recoveryRunId stays bound to the record.
//
// Scope (R2 PR, NOT yet executed anywhere): archive-first, forward-finalize
// only (image rollback stays ineligible by design), no container operation,
// no database mutation, no .env change. The CLI refuses to run unless
// RECOVERY_EXECUTE=true with exact run/SHA binding.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import * as evidenceModule from './production-deployment-evidence.mjs';

export const RECOVERY_SCHEMA = 'phoenix.production-deployment-recovery/1';
export const CASE_A_STARTUP_RESULT = 'HOLD_SCHEMA_OR_WRITE_SIGNAL';
export const RECOVERY_PHASES = ['ARCHIVED', 'ACTIVE_WRITTEN', 'DEPLOY_WRITTEN', 'COMPLETE'];
// Case A benign-startup-ERROR extension: HOLD_STARTUP_ERROR is NOT globally
// recoverable. Exactly one transaction may close through this path — the R3.c
// re-anchor deploy whose single startup error line was the known RoutesResolver
// format gap, root-caused by an independent read-only evidence run and bound
// below by run id + SHA. Every other HOLD_STARTUP_ERROR stays a hard HOLD.
export const CASE_A_ERROR_RECEIPT_SCHEMA = 'phoenix.case-a-benign-startup-error-receipt/1';
export const BENIGN_STARTUP_ERROR_TRANSACTION = Object.freeze({ runId: '38208343072-1', targetSha: 'c9383d5043191213165e237bbdb7b984f7603345' });
export const BENIGN_STARTUP_ERROR_ATTRIBUTION = 'ROUTES_RESOLVER_REGISTRATION';
export const BENIGN_STARTUP_ERROR_WORD_SET = Object.freeze(['Nest', 'LOG', 'RoutesResolver', 'mSysErrorLogsController', 'api', 'system', 'error', 'logs']);
// Verified-abort recovery: run 38217361863-1 deployed, switched and PASSED
// both startup evidence and file verification, then the deploy script was
// killed AFTER verify by the disk-report SIGPIPE pipe bug (root-caused in the
// Actions log; fixed for future deploys in the same PR). PASS_REDACTED_SUMMARY
// is NOT globally recoverable — this frozen transaction is the only one that
// may close through this path, with the verify verdict recomputed from the
// on-disk evidence rather than trusted from the receipt.
export const VERIFIED_ABORT_RECEIPT_SCHEMA = 'phoenix.verified-abort-recovery-receipt/1';
export const VERIFIED_ABORT_TRANSACTION = Object.freeze({ runId: '38217361863-1', targetSha: 'f46f651dcebeb11210c8e577f3c0caed87f356c2' });
export const VERIFIED_ABORT_POINT = 'DISK_REPORT_SIGPIPE';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const wordSetOf = line => [...new Set(line.match(/[A-Za-z]{3,}/g) ?? [])].filter(word => !/^[a-fA-F0-9]{8,}$/.test(word));
const sqlShapePattern = /\b(insert\s+into|update\s+\S+\s+set|delete\s+from|alter\s+table|create\s+(?:table|index|unique|sequence)|drop\s+(?:table|index|constraint)|truncate\s+table?|grant\s+|revoke\s+)\b/i;

// Replays the bounded startup window of the bound deploy and returns only
// sanitized per-line identity (same word-set rules as the R0 collector; raw
// line content is never returned). The replay runs the CURRENT classifier:
// for the benign single-line transaction the flagged line is expected to be
// a full-format route registration under the fixed patterns, while the whole
// window must carry zero SQL statement shapes and an unchanged digest.
// dockerLogs is injectable for tests.
export async function replayStartupWindow(evidence, dockerLogs) {
  const api = evidence?.post?.containers?.api;
  const startup = evidence?.startup;
  if (!api || !startup || !dockerLogs) return { available: false };
  const streams = dockerLogs(['logs', '--timestamps', '--since', startup.startedAt, '--until', startup.capturedAt, api.id]);
  const stdout = streams.stdout ?? ''; const stderr = streams.stderr ?? '';
  let schemaWriteCount = 0; let sqlShapeCount = 0; let errorLineCount = 0;
  const linesByTs = {};
  for (const [stream, text] of [['stdout', stdout], ['stderr', stderr]]) {
    for (const line of text.split(/\r?\n/).filter(Boolean)) {
      const ts = line.match(/^(\d{4}-\d{2}-\d{2}T[^ ]+Z)\s/)?.[1] ?? null;
      const clean = line.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
      const shape = sqlShapePattern.exec(clean);
      const verdict = evidenceModule.classifyStartupLine(line);
      if (verdict.schemaWrite) schemaWriteCount++;
      if (verdict.error) errorLineCount++;
      if (shape) sqlShapeCount++;
      const identity = { stream, sensitive: verdict.sensitive, sqlStatementShape: shape ? shape[1].toLowerCase() : null, routesResolverLine: evidenceModule.isRouteRegistrationLine(line), wordSet: wordSetOf(line) };
      if (ts) linesByTs[ts] = identity;
    }
  }
  return {
    available: true,
    combinedDigest: createHash('sha256').update(Buffer.from(stdout)).update(Buffer.from([0])).update(Buffer.from(stderr)).digest('hex'),
    schemaWriteCount, sqlShapeCount, errorLineCount, linesByTs,
    schemaCompatibilityPass: /API_BOOTSTRAP_SCHEMA_COMPATIBILITY=PASS/i.test(`${stdout}\n${stderr}`),
  };
}

// The receipt's DB baseline is compared field-by-field with the live READ ONLY
// counters. Both sides must carry the complete field set as explicit integers:
// a missing field, a query error, or a non-numeric value is a HOLD, never an
// undefined===undefined pass.
const RECEIPT_DB_FIELDS = ['mirrorRows', 'entityRows', 'arSnapshotRows', 'runningJobs', 'queuedJobs', 'writebackPending', 'wmsWritebackPending', 'remoteWriteAttempts', 'wmsRemoteWriteAttempts', 'inboundRuns'];
function validateDbBaseline(receipt, dbEvidence, reasons) {
  if (!dbEvidence || typeof dbEvidence !== 'object' || dbEvidence.error !== undefined) { reasons.push('RECEIPT_DB_EVIDENCE_ERROR'); return; }
  const baseline = receipt?.dbBaseline;
  if (!baseline || typeof baseline !== 'object') { reasons.push('RECEIPT_DB_BASELINE_MISSING'); return; }
  for (const key of RECEIPT_DB_FIELDS) {
    const expected = baseline[key]; const actual = dbEvidence[key];
    if (!Number.isInteger(expected)) { reasons.push('RECEIPT_DB_BASELINE_INVALID'); return; }
    if (!Number.isInteger(actual)) { reasons.push('RECEIPT_DB_EVIDENCE_INVALID'); return; }
    if (expected !== actual) { reasons.push('RECEIPT_DB_BASELINE_MISMATCH'); return; }
  }
}
// Receipt-gated validation for the benign single-line startup-error path.
// Every claim is re-verified against the on-disk evidence, a fresh sanitized
// replay, live readiness and the DB read-only counters — the receipt binds
// identity, nothing is trusted on its own.
function validateBenignStartupError(bundle, context, reasons) {
  const { receipt, replay, evidence, dbEvidence } = bundle;
  if (!receipt) { reasons.push('RECEIPT_MISSING'); return; }
  if (receipt.schema !== CASE_A_ERROR_RECEIPT_SCHEMA) reasons.push('RECEIPT_SCHEMA');
  if (receipt.runId !== BENIGN_STARTUP_ERROR_TRANSACTION.runId || receipt.targetSha !== BENIGN_STARTUP_ERROR_TRANSACTION.targetSha
    || context.targetRunId !== BENIGN_STARTUP_ERROR_TRANSACTION.runId || context.approvedSha !== BENIGN_STARTUP_ERROR_TRANSACTION.targetSha) reasons.push('RECEIPT_TRANSACTION_NOT_ELIGIBLE');
  const startup = evidence?.startup;
  if (!receipt.startup || receipt.startup.result !== 'HOLD_STARTUP_ERROR') reasons.push('RECEIPT_STARTUP_RESULT');
  else {
    if (receipt.startup.combinedDigest !== startup?.combinedDigest) reasons.push('RECEIPT_DIGEST_MISMATCH');
    if (receipt.startup.schemaWriteSignalCount !== 0 || startup?.schemaWriteSignalCount !== 0) reasons.push('RECEIPT_SCHEMAWRITE_NONZERO');
    if (receipt.startup.errorSignalCount !== 1 || startup?.errorSignalCount !== 1) reasons.push('RECEIPT_COUNTS_MISMATCH');
    if (receipt.startup.schemaCompatibilityPass !== true || startup?.eventCounts?.SCHEMA_COMPATIBILITY_PASS !== 1) reasons.push('RECEIPT_COMPAT_MISMATCH');
  }
  if (!replay?.available) reasons.push('REPLAY_UNAVAILABLE');
  else {
    if (replay.combinedDigest !== startup?.combinedDigest) reasons.push('REPLAY_DIGEST_MISMATCH');
    if (replay.schemaWriteCount !== 0) reasons.push('REPLAY_SCHEMAWRITE_NONZERO');
    if (replay.sqlShapeCount !== 0) reasons.push('REPLAY_SQL_SHAPE_PRESENT');
    // Under the FIXED classifier the known-benign line is exempt, so any
    // error-classified line in the replay is a real additional error.
    if (replay.errorLineCount !== 0) reasons.push('REPLAY_ERROR_NONZERO');
    const claimed = receipt.errorLine;
    const line = claimed && replay.linesByTs?.[claimed.ts];
    if (!line) reasons.push('RECEIPT_LINE_NOT_IN_WINDOW');
    else {
      if (line.sensitive !== false) reasons.push('REPLAY_LINE_SENSITIVE');
      if (line.sqlStatementShape !== null) reasons.push('REPLAY_LINE_SQL_SHAPE');
      if (line.routesResolverLine !== true) reasons.push('REPLAY_LINE_ATTRIBUTION');
      if (claimed.stream !== line.stream || claimed.attribution !== BENIGN_STARTUP_ERROR_ATTRIBUTION
        || !deepEqual(claimed.wordSet, BENIGN_STARTUP_ERROR_WORD_SET) || !deepEqual(line.wordSet, BENIGN_STARTUP_ERROR_WORD_SET)) reasons.push('RECEIPT_LINE_IDENTITY_MISMATCH');
    }
  }
  if (receipt.readinessHttp !== 200) reasons.push('RECEIPT_READINESS_MISMATCH');
  validateDbBaseline(receipt, dbEvidence, reasons);
}

// Receipt-gated validation for the verified-abort transaction: the deploy
// passed startup evidence AND file verification before the script died in the
// disk report. The verify verdict is RECOMPUTED from the on-disk evidence
// files (deterministic function of pre/post/startup + binding); the receipt
// only binds identity, digest and the reviewed abort point.
function validateVerifiedAbortRecovery(bundle, context, reasons) {
  const { receipt, replay, evidence, evidenceFiles, dbEvidence } = bundle;
  if (!receipt) { reasons.push('RECEIPT_MISSING'); return; }
  if (receipt.schema !== VERIFIED_ABORT_RECEIPT_SCHEMA) reasons.push('RECEIPT_SCHEMA');
  if (receipt.runId !== VERIFIED_ABORT_TRANSACTION.runId || receipt.targetSha !== VERIFIED_ABORT_TRANSACTION.targetSha
    || context.targetRunId !== VERIFIED_ABORT_TRANSACTION.runId || context.approvedSha !== VERIFIED_ABORT_TRANSACTION.targetSha) reasons.push('RECEIPT_TRANSACTION_NOT_ELIGIBLE');
  const startup = evidence?.startup;
  if (!receipt.startup || receipt.startup.result !== 'PASS_REDACTED_SUMMARY') reasons.push('RECEIPT_STARTUP_RESULT');
  else if (receipt.startup.combinedDigest !== startup?.combinedDigest) reasons.push('RECEIPT_DIGEST_MISMATCH');
  if (receipt.abortPoint !== VERIFIED_ABORT_POINT) reasons.push('RECEIPT_ABORT_POINT_MISMATCH');
  if (!evidenceFiles?.pre || !evidenceFiles.post || !evidenceFiles.log) reasons.push('VERIFY_FILES_UNAVAILABLE');
  else {
    try {
      evidenceModule.verifyEvidenceFiles(evidenceFiles.pre, evidenceFiles.post, evidenceFiles.log,
        { runId: context.targetRunId, runAttempt: String(startup.deployRunAttempt ?? 1), targetSha: context.approvedSha, configFloorSha: bundle.floor?.floorSha });
    } catch (error) { reasons.push('VERIFY_RECOMPUTE_FAILED'); }
  }
  if (!replay?.available) reasons.push('REPLAY_UNAVAILABLE');
  else {
    if (replay.combinedDigest !== startup?.combinedDigest) reasons.push('REPLAY_DIGEST_MISMATCH');
    if (replay.schemaWriteCount !== 0) reasons.push('REPLAY_SCHEMAWRITE_NONZERO');
    if (replay.sqlShapeCount !== 0) reasons.push('REPLAY_SQL_SHAPE_PRESENT');
    if (replay.errorLineCount !== 0) reasons.push('REPLAY_ERROR_NONZERO');
  }
  if (receipt.readinessHttp !== 200) reasons.push('RECEIPT_READINESS_MISMATCH');
  validateDbBaseline(receipt, dbEvidence, reasons);
}

// Pure eligibility assessment over an already-collected state bundle. Every
// check must pass for the current phase; failures are reported individually.
export function assessRecovery(bundle, context) {
  const reasons = [];
  const { transaction, deployRecord, marker, floor, active, runtime, containers, readinessHttp, liveEnv, evidence, archive } = bundle;
  const now = context.now ?? Date.now();
  const expired = record => record && Number.isFinite(Date.parse(record.expiresAt)) && Date.parse(record.expiresAt) <= now;
  if (!context.targetRunId || !/^\d+(?:-\d+)?$/.test(context.targetRunId)) reasons.push('BINDING_TARGET_RUN_ID');
  if (!context.approvedSha || !/^[a-f0-9]{40}$/.test(context.approvedSha)) reasons.push('BINDING_APPROVED_SHA');
  if (!context.recoveryRunId || !/^\d+-\d+$/.test(context.recoveryRunId)) reasons.push('BINDING_RECOVERY_RUN_ID');
  const phase = archive?.phase ?? null;
  if (phase && !RECOVERY_PHASES.includes(phase)) reasons.push('ARCHIVE_PHASE_INVALID');
  if (phase === 'COMPLETE') reasons.push('ALREADY_COMPLETE');
  // Resume binding: an existing archive must belong to this exact recovery —
  // same schema, transaction run, approved SHA — and its recorded plan must
  // still target this context. Any mismatch is a HOLD, never a silent resume.
  if (archive) {
    if (archive.schema !== RECOVERY_SCHEMA) reasons.push('ARCHIVE_SCHEMA_MISMATCH');
    if (archive.targetRunId !== context.targetRunId || archive.approvedSha !== context.approvedSha) reasons.push('ARCHIVE_BINDING_MISMATCH');
    const plan = archive.plan;
    if (!plan?.active || !plan?.deployRecord) reasons.push('ARCHIVE_PLAN_MISSING');
    else if (plan.active.floorSha !== context.approvedSha || plan.active.configSha !== context.approvedSha
      || plan.active.active?.api?.revision !== context.approvedSha
      || plan.deployRecord.target !== context.approvedSha || plan.deployRecord.floorSha !== context.approvedSha
      || plan.deployRecord.candidates?.api?.revision !== context.approvedSha
      || plan.deployRecord.outcome !== 'SUCCESS' || plan.deployRecord.recovery?.schema !== RECOVERY_SCHEMA) reasons.push('ARCHIVE_PLAN_CONTEXT_MISMATCH');
  }
  if (bundle.checkout && (bundle.checkout.head !== context.approvedSha || bundle.checkout.clean !== true)) reasons.push('CHECKOUT_NOT_CLEAN_TARGET');
  if (!transaction || transaction.version !== 3 || transaction.runId !== context.targetRunId || transaction.phase !== 'IN_PROGRESS' || transaction.target !== context.approvedSha || transaction.configSha !== context.approvedSha) {
    // A missing transaction.json is only tolerable when the marker-clearing
    // stage already started (archive at DEPLOY_WRITTEN or later).
    if (!(phase === 'DEPLOY_WRITTEN' && transaction === null)) reasons.push('TRANSACTION_BINDING');
  }
  if (!deployRecord || deployRecord.version !== 3 || deployRecord.candidates?.api?.revision !== context.approvedSha
    || !Array.isArray(deployRecord.migrationPaths) || deployRecord.migrationPaths.length || deployRecord.target !== context.approvedSha) reasons.push('DEPLOY_RECORD_SHAPE');
  if (deployRecord) {
    const expectedOutcome = phase === 'DEPLOY_WRITTEN' ? 'SUCCESS' : 'SWITCHING';
    if (deployRecord.outcome !== expectedOutcome) reasons.push('DEPLOY_RECORD_OUTCOME_PHASE_MISMATCH');
    if (phase === 'DEPLOY_WRITTEN' && !deepEqual(deployRecord, archive?.plan?.deployRecord)) reasons.push('DEPLOY_RECORD_NOT_RECOVERED_PLAN');
  }
  if (deployRecord && !expired(deployRecord)) reasons.push('TRANSACTION_NOT_EXPIRED');
  // The policy marker may be partially cleared once the final stage started.
  const markerToleratedMissing = phase === 'DEPLOY_WRITTEN';
  if (marker === null && markerToleratedMissing) { /* partial cleanup tolerated */ }
  else if (!marker || marker.version !== 3 || marker.operation !== 'CODE_HOLD' || marker.phase !== 'IN_PROGRESS' || marker.runId !== context.targetRunId
    || marker.target !== context.approvedSha || !expired(marker)) reasons.push('POLICY_MARKER_SHAPE');
  if (marker && Number.isFinite(Date.parse(marker.startedAt)) && Number.isFinite(Date.parse(marker.expiresAt))
    && (Date.parse(marker.expiresAt) - Date.parse(marker.startedAt) > 30 * 60 * 1000)) reasons.push('POLICY_MARKER_WINDOW');
  if (!floor || floor.version !== 3 || floor.floorSha !== context.approvedSha || floor.chanjetPolicy !== 'HOLD' || floor.readonlyApproval !== null) reasons.push('FLOOR_SHAPE');
  if (active) {
    if (phase === 'ARCHIVED' || phase === null) {
      if (active.version !== 3 || active.outcome !== 'CONFIG_READY_HOLD' || active.floorSha !== context.approvedSha || active.configSha !== context.approvedSha
        || active.active?.api?.revision === context.approvedSha
        || !deepEqual(active.active, deployRecord?.previous)) reasons.push('ACTIVE_STILL_PROMOTION_STATE');
    } else if (!deepEqual(active, archive?.plan?.active)) reasons.push('ACTIVE_NOT_RECOVERED_PLAN');
  } else reasons.push('ACTIVE_MISSING');
  if (!runtime?.api?.revision || runtime.api.revision !== context.approvedSha) reasons.push('RUNTIME_API_NOT_CANDIDATE');
  if (!runtime?.web?.revision || !active?.active?.web?.revision || (phase === 'ARCHIVED' || phase === null ? runtime.web.revision !== active.active.web.revision : runtime.web.revision !== archive?.plan?.active?.active?.web?.revision)) reasons.push('RUNTIME_WEB_DRIFTED');
  if (readinessHttp !== 200 && readinessHttp !== '200') reasons.push('READINESS');
  if (!liveEnv || liveEnv.CHANJET_SYNC_POLICY !== 'HOLD' || liveEnv.CHANJET_READONLY_SYNC_ENABLED !== 'false' || liveEnv.CHANJET_ERP_INBOUND_SYNC_ENABLED !== 'false') reasons.push('LIVE_POLICY_FLAGS');
  if (!evidence?.startup || evidence.startup.deployRunId !== context.targetRunId || evidence.startup.targetSha !== context.approvedSha
    || !evidence.pre || evidence.pre.deployRunId !== context.targetRunId || !evidence.post || evidence.post.deployRunId !== context.targetRunId
    || evidence.post.containers?.api?.ociRevision !== context.approvedSha || evidence.startup.containerId !== evidence.post.containers?.api?.id) reasons.push('EVIDENCE_BINDING');
  else if (evidence.startup.result === CASE_A_STARTUP_RESULT) { /* original Case A class: unchanged */ }
  else if (evidence.startup.result === 'HOLD_STARTUP_ERROR') validateBenignStartupError(bundle, context, reasons);
  else if (evidence.startup.result === 'PASS_REDACTED_SUMMARY') validateVerifiedAbortRecovery(bundle, context, reasons);
  else reasons.push('EVIDENCE_BINDING');
  if (evidence?.pre && evidence?.post) {
    for (const service of ['db', 'web']) {
      const before = evidence.pre.containers?.[service]; const after = evidence.post.containers?.[service];
      if (!before || !after || before.id !== after.id || before.startedAt !== after.startedAt || before.image !== after.image) reasons.push(`EVIDENCE_${service.toUpperCase()}_CHANGED`);
    }
    // Current live container identity must still equal the POST snapshot for
    // all three services (container ID, image digest, startedAt; API/Web also
    // the OCI revision) — no restart, recreation or image change since.
    if (containers) {
      for (const service of ['db', 'api', 'web']) {
        const live = containers[service]; const post = evidence.post.containers?.[service];
        if (!live || live.error) { reasons.push(`LIVE_${service.toUpperCase()}_UNAVAILABLE`); continue; }
        if (!post) continue; // EVIDENCE_BINDING already flags the missing snapshot
        if (live.id !== post.id || live.image !== post.image || live.startedAt !== post.startedAt) reasons.push(`LIVE_${service.toUpperCase()}_DRIFTED_FROM_POST`);
        if (service !== 'db' && live.ociRevision !== post.ociRevision) reasons.push(`LIVE_${service.toUpperCase()}_REVISION_DRIFTED_FROM_POST`);
      }
    } else reasons.push('LIVE_CONTAINERS_MISSING');
  }
  return { eligible: reasons.length === 0, reasons, resumeFrom: phase };
}

// The forward-finalized state: the switched candidate becomes the pinned
// active API; the untouched web pin carries over; the deploy record marks the
// recovery outcome with full provenance instead of pretending `complete` ran.
export function planRecoveredState(deployRecord, marker, { recoveryRunId, recoveredAt, startupResult = CASE_A_STARTUP_RESULT, classification = 'CASE_A_BENIGN_STARTUP_LOG_SIGNALS', receiptSha256 = null }) {
  return {
    active: {
      version: 3, configSha: deployRecord.configSha, floorSha: deployRecord.floorSha,
      active: { api: deployRecord.candidates.api, web: deployRecord.previous.web },
      protectedImages: deployRecord.protectedImages, outcome: 'SUCCESS',
      migrationBaseline: deployRecord.candidates.api.revision,
    },
    deployRecord: {
      ...deployRecord, outcome: 'SUCCESS',
      recovery: {
        schema: RECOVERY_SCHEMA, recoveryRunId, recoveredAt,
        originalOutcome: 'SWITCHING', markerStartedAt: marker.startedAt, markerExpiresAt: marker.expiresAt,
        startupResult, classification, receiptSha256,
        forwardFinalized: true, imageRollback: 'INELIGIBLE_PRE_FLOOR_API',
      },
    },
  };
}

// Stage executor with injected IO so tests can fail any stage deterministically.
// io contract: { writeActive(value), writeDeployRecord(value), writeArchive(record),
//                exists(name), unlink(name), now() } — throws abort the run; the
// archive phase only advances after the corresponding action succeeded. Stages
// already applied (recorded in the archive phase) are skipped on resume.
export function executeRecoveryStages(archive, io, { resumedBy } = {}) {
  if (!archive || !RECOVERY_PHASES.includes(archive.phase) || archive.phase === 'COMPLETE') throw Object.assign(new Error('RECOVERY_HOLD=ARCHIVE_PHASE'), { code: 'RECOVERY_HOLD=ARCHIVE_PHASE' });
  const record = resumedBy && resumedBy !== archive.recoveryRunId
    ? { ...archive, resumedByRunIds: [...new Set([...(archive.resumedByRunIds ?? []), resumedBy])] }
    : { ...archive };
  const executed = [];
  const entry = archive.phase;
  if (entry === 'ARCHIVED') {
    io.writeActive(archive.plan.active);
    record.phase = 'ACTIVE_WRITTEN'; io.writeArchive(record); executed.push('ACTIVE_WRITTEN');
  }
  if (entry === 'ARCHIVED' || entry === 'ACTIVE_WRITTEN') {
    io.writeDeployRecord(archive.plan.deployRecord);
    record.phase = 'DEPLOY_WRITTEN'; io.writeArchive(record); executed.push('DEPLOY_WRITTEN');
  }
  if (io.exists('transaction.json')) io.unlink('transaction.json');
  if (io.exists('policy-transition.json')) io.unlink('policy-transition.json');
  record.completedAt = io.now();
  record.phase = 'COMPLETE'; io.writeArchive(record); executed.push('COMPLETE');
  return { executed, complete: true };
}

// CLI entry: only ever runs against the real trusted control plane, guarded by
// RECOVERY_EXECUTE plus explicit run/SHA binding. Local tests never reach it.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const write = (label, value) => { console.log(`${label}=${value}`); };
  try {
    const context = { targetRunId: process.env.RECOVERY_TARGET_RUN_ID, approvedSha: process.env.RECOVERY_APPROVED_SHA, recoveryRunId: process.env.RECOVERY_RUN_ID };
    if (process.env.RECOVERY_EXECUTE !== 'true' || !/^\d+(?:-\d+)?$/.test(context.targetRunId || '') || !/^[a-f0-9]{40}$/.test(context.approvedSha || '') || !/^\d+-\d+$/.test(context.recoveryRunId || '')) {
      write('DEPLOYMENT_RECOVERY', 'HOLD_EXECUTION_NOT_AUTHORIZED'); process.exitCode = 1;
    } else {
      const root = fs.realpathSync(process.cwd());
      const { CONTRACT, secureJson, verifyContext, rollbackEligibility, git } = await import('./production-config-guard.mjs');
      const { atomicState } = await import('./production-deployment-state.mjs');
      const { captureRuntime } = await import('./capture-production-runtime.mjs');
      const evidenceModule = await import('./production-deployment-evidence.mjs');
      verifyContext(root, CONTRACT.stateDirectory);
      const stateFile = name => path.join(CONTRACT.stateDirectory, name);
      const readOptional = name => (fs.existsSync(stateFile(name)) ? secureJson(stateFile(name)) : null);
      const transaction = readOptional('transaction.json');
      const deployRecord = readOptional(`deploy-${context.targetRunId}.json`);
      const marker = readOptional('policy-transition.json');
      const floor = readOptional('floor.json');
      const active = readOptional('active.json');
      const archive = readOptional(`recovery-${context.targetRunId}.json`);
      const runtime = captureRuntime();
      const checkout = { head: git(root, ['rev-parse', 'HEAD']), clean: git(root, ['status', '--porcelain', '--untracked-files=all']) === '' };
      const containers = {};
      for (const service of ['db', 'api', 'web']) {
        try { containers[service] = evidenceModule.metadataFor(service); }
        catch (error) { containers[service] = { error: String(error?.message || error).slice(0, 200) }; }
      }
      const { execFileSync, spawnSync } = await import('node:child_process');
      let readinessHttp = '000';
      try { readinessHttp = execFileSync('curl', ['-sS', '--max-time', '15', '-o', '/dev/null', '-w', '%{http_code}', 'http://127.0.0.1:3100/api/readiness'], { encoding: 'utf8' }).trim(); } catch { /* reported via READINESS */ }
      const rawEnv = JSON.parse(execFileSync('docker', ['inspect', 'phoenix-v3-api', '--format', '{{json .Config.Env}}'], { encoding: 'utf8' }));
      const liveEnv = Object.fromEntries(rawEnv.filter(line => /^(CHANJET_READONLY_SYNC_ENABLED|CHANJET_ERP_INBOUND_SYNC_ENABLED|CHANJET_SYNC_POLICY)=/.test(line)).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
      const evidence = deployRecord?.evidence ? {
        pre: JSON.parse(fs.readFileSync(deployRecord.evidence.pre, 'utf8')),
        post: JSON.parse(fs.readFileSync(deployRecord.evidence.post, 'utf8')),
        startup: JSON.parse(fs.readFileSync(deployRecord.evidence.log, 'utf8')),
      } : null;
      // Sanitized receipt (base64 payload; sha256 over the decoded bytes) gates
      // the single benign-startup-error transaction. Transport hash mismatch is
      // an immediate HOLD — the receipt is identity, never trusted content.
      let receipt = null;
      if (process.env.RECOVERY_STARTUP_RECEIPT_B64) {
        const bytes = Buffer.from(process.env.RECOVERY_STARTUP_RECEIPT_B64, 'base64');
        if (sha256(bytes) !== (process.env.RECOVERY_STARTUP_RECEIPT_SHA256 || '')) throw Object.assign(new Error('receipt transport hash'), { code: 'DEPLOYMENT_RECOVERY=HOLD_RECEIPT_TRANSPORT_HASH' });
        receipt = JSON.parse(bytes.toString('utf8'));
      }
      let dbEvidence = null;
      try {
        const { readDatabaseEvidence } = await import('./chanjet-readonly-production-audit.mjs');
        dbEvidence = readDatabaseEvidence(fs.readFileSync(path.join(root, 'scripts/ops/readonly-audits/chanjet-restoration-preflight.sql'), 'utf8'));
      } catch (error) { dbEvidence = { error: String(error?.message || error).slice(0, 200) }; }
      const replay = evidence ? await replayStartupWindow(evidence, args => {
        const result = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
        if (result.error || result.status !== 0) return null;
        return { stdout: result.stdout || '', stderr: result.stderr || '' };
      }) : { available: false };
      const evidenceFiles = deployRecord?.evidence ?? null;
      const assessment = assessRecovery({ transaction, deployRecord, marker, floor, active, runtime, containers, readinessHttp, liveEnv, evidence, evidenceFiles, archive, checkout, receipt, replay, dbEvidence }, context);
      if (!assessment.eligible) { write('DEPLOYMENT_RECOVERY', `HOLD_${assessment.reasons.join(',')}`); process.exitCode = 1; }
      else if (!rollbackEligibility(root, floor, runtime.api).allowed) { write('DEPLOYMENT_RECOVERY', 'HOLD_RUNTIME_NOT_FLOOR_ELIGIBLE'); process.exitCode = 1; }
      else if (evidence?.startup?.result === 'PASS_REDACTED_SUMMARY') {
        // Verified-abort path only: re-run the live TOCTOU snapshot check the
        // original deploy's `complete` would have performed.
        try {
          const evidenceModule = await import('./production-deployment-evidence.mjs');
          evidenceModule.verifyLiveSnapshot(evidence.post, { runId: context.targetRunId, runAttempt: String(evidence.startup.deployRunAttempt ?? 1), targetSha: context.approvedSha, configFloorSha: floor.floorSha });
        } catch (error) { throw Object.assign(new Error('verify live snapshot'), { code: 'DEPLOYMENT_RECOVERY=HOLD_VERIFY_LIVE_SNAPSHOT' }); }
      }
      else {
        let record = archive;
        if (!record) {
          const recoveredAt = new Date().toISOString();
          const benignError = evidence?.startup?.result === 'HOLD_STARTUP_ERROR';
          const verifiedAbort = evidence?.startup?.result === 'PASS_REDACTED_SUMMARY';
          const plan = planRecoveredState(deployRecord, marker, {
            recoveryRunId: context.recoveryRunId, recoveredAt,
            startupResult: verifiedAbort ? 'PASS_REDACTED_SUMMARY' : benignError ? 'HOLD_STARTUP_ERROR' : CASE_A_STARTUP_RESULT,
            classification: verifiedAbort ? 'EVIDENCE_VERIFIED_SCRIPT_ABORTED_AFTER_VERIFY' : benignError ? 'CASE_A_BENIGN_STARTUP_ERROR_SINGLE_ROUTES_RESOLVER_LINE' : 'CASE_A_BENIGN_STARTUP_LOG_SIGNALS',
            receiptSha256: (benignError || verifiedAbort) ? (process.env.RECOVERY_STARTUP_RECEIPT_SHA256 || null) : null,
          });
          const snapshotOf = (name, value) => ({ name, sha256: sha256(JSON.stringify(value)), value });
          record = { schema: RECOVERY_SCHEMA, phase: 'ARCHIVED', recoveryRunId: context.recoveryRunId, recoveredAt, targetRunId: context.targetRunId, approvedSha: context.approvedSha, assessment,
            archived: [snapshotOf('transaction.json', transaction), snapshotOf('policy-transition.json', marker), snapshotOf('floor.json', floor), snapshotOf('active.json', active), snapshotOf(`deploy-${context.targetRunId}.json`, deployRecord)], plan };
          atomicState(stateFile(`recovery-${context.targetRunId}.json`), record);
        }
        executeRecoveryStages(record, {
          writeActive: value => atomicState(stateFile('active.json'), value),
          writeDeployRecord: value => atomicState(stateFile(`deploy-${context.targetRunId}.json`), value),
          writeArchive: value => atomicState(stateFile(`recovery-${context.targetRunId}.json`), value),
          exists: name => fs.existsSync(stateFile(name)),
          unlink: name => fs.unlinkSync(stateFile(name)),
          now: () => new Date().toISOString(),
        }, { resumedBy: context.recoveryRunId });
        write('DEPLOYMENT_RECOVERY', 'COMPLETE');
      }
    }
  } catch (error) {
    console.error(error?.code || `RECOVERY_HOLD=UNEXPECTED:${String(error?.message || error).slice(0, 200)}`);
    process.exitCode = 1;
  }
}
