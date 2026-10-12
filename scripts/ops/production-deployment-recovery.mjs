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

export const RECOVERY_SCHEMA = 'phoenix.production-deployment-recovery/1';
export const CASE_A_STARTUP_RESULT = 'HOLD_SCHEMA_OR_WRITE_SIGNAL';
export const RECOVERY_PHASES = ['ARCHIVED', 'ACTIVE_WRITTEN', 'DEPLOY_WRITTEN', 'COMPLETE'];

const sha256 = value => createHash('sha256').update(value).digest('hex');
const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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
  const resumed = phase !== null && phase !== 'ARCHIVED';
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
  if (!evidence?.startup || evidence.startup.result !== CASE_A_STARTUP_RESULT || evidence.startup.deployRunId !== context.targetRunId || evidence.startup.targetSha !== context.approvedSha
    || !evidence.pre || evidence.pre.deployRunId !== context.targetRunId || !evidence.post || evidence.post.deployRunId !== context.targetRunId
    || evidence.post.containers?.api?.ociRevision !== context.approvedSha || evidence.startup.containerId !== evidence.post.containers?.api?.id) reasons.push('EVIDENCE_BINDING');
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
export function planRecoveredState(deployRecord, marker, { recoveryRunId, recoveredAt }) {
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
        startupResult: CASE_A_STARTUP_RESULT, classification: 'CASE_A_BENIGN_STARTUP_LOG_SIGNALS',
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
      const { execFileSync } = await import('node:child_process');
      let readinessHttp = '000';
      try { readinessHttp = execFileSync('curl', ['-sS', '--max-time', '15', '-o', '/dev/null', '-w', '%{http_code}', 'http://127.0.0.1:3100/api/readiness'], { encoding: 'utf8' }).trim(); } catch { /* reported via READINESS */ }
      const rawEnv = JSON.parse(execFileSync('docker', ['inspect', 'phoenix-v3-api', '--format', '{{json .Config.Env}}'], { encoding: 'utf8' }));
      const liveEnv = Object.fromEntries(rawEnv.filter(line => /^(CHANJET_READONLY_SYNC_ENABLED|CHANJET_ERP_INBOUND_SYNC_ENABLED|CHANJET_SYNC_POLICY)=/.test(line)).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
      const evidence = deployRecord?.evidence ? {
        pre: JSON.parse(fs.readFileSync(deployRecord.evidence.pre, 'utf8')),
        post: JSON.parse(fs.readFileSync(deployRecord.evidence.post, 'utf8')),
        startup: JSON.parse(fs.readFileSync(deployRecord.evidence.log, 'utf8')),
      } : null;
      const assessment = assessRecovery({ transaction, deployRecord, marker, floor, active, runtime, containers, readinessHttp, liveEnv, evidence, archive, checkout }, context);
      if (!assessment.eligible) { write('DEPLOYMENT_RECOVERY', `HOLD_${assessment.reasons.join(',')}`); process.exitCode = 1; }
      else if (!rollbackEligibility(root, floor, runtime.api).allowed) { write('DEPLOYMENT_RECOVERY', 'HOLD_RUNTIME_NOT_FLOOR_ELIGIBLE'); process.exitCode = 1; }
      else {
        let record = archive;
        if (!record) {
          const recoveredAt = new Date().toISOString();
          const plan = planRecoveredState(deployRecord, marker, { recoveryRunId: context.recoveryRunId, recoveredAt });
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
