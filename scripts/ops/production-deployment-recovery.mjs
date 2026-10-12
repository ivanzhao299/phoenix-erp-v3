// One-time recovery for an expired, root-caused CODE_HOLD deployment
// transaction whose startup-evidence HOLD was classified Case A (all signals
// attributed to benign startup log lines; no actual database write evidence).
//
// Scope (2026-10-12 R2 PR, NOT yet executed anywhere):
//   * archive-first: a recovery record with copies+hashes is written BEFORE any
//     state mutation; no marker is ever deleted without a completed archive
//   * forward-finalize only: the running candidate becomes the pinned active
//     runtime; there is no image rollback (old pre-floor API is ineligible by
//     design via PRE_FLOOR_API_RECOVERY_HOLD)
//   * refuses to run unless RECOVERY_EXECUTE=true AND bound to the exact
//     original run id + approved target SHA
//   * no container operation, no database mutation, no .env change
//
// Why a dedicated tool: the original transaction (run 38031441639-1) expired
// (30-minute contract deadline), so `complete`/`rolled-back` are permanently
// blocked by CONFIG_HOLD=DEPLOY_TRANSACTION_EXPIRED, `complete` additionally
// requires a PASS startup result that must never be overwritten, and the
// unfinished markers block every audit/config path. Only a reviewed, exactly
// bound recovery may reconcile active.json + transaction.json +
// policy-transition.json together.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const RECOVERY_SCHEMA = 'phoenix.production-deployment-recovery/1';
export const CASE_A_STARTUP_RESULT = 'HOLD_SCHEMA_OR_WRITE_SIGNAL';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const hold = reason => ({ code: `RECOVERY_HOLD=${reason}` });

// Pure eligibility assessment over an already-collected state bundle. Every
// check must pass; failures are reported individually for operator review.
export function assessRecovery(bundle, context) {
  const reasons = [];
  const { transaction, deployRecord, marker, floor, active, runtime, readinessHttp, liveEnv, evidence } = bundle;
  const now = context.now ?? Date.now();
  const expired = record => record && Number.isFinite(Date.parse(record.expiresAt)) && Date.parse(record.expiresAt) <= now;
  if (!context.targetRunId || !/^\d+(?:-\d+)?$/.test(context.targetRunId)) reasons.push('BINDING_TARGET_RUN_ID');
  if (!context.approvedSha || !/^[a-f0-9]{40}$/.test(context.approvedSha)) reasons.push('BINDING_APPROVED_SHA');
  if (!transaction || transaction.version !== 3 || transaction.runId !== context.targetRunId || transaction.phase !== 'IN_PROGRESS' || transaction.target !== context.approvedSha || transaction.configSha !== context.approvedSha) reasons.push('TRANSACTION_BINDING');
  if (!deployRecord || deployRecord.version !== 3 || deployRecord.outcome !== 'SWITCHING' || deployRecord.switched?.api !== true || deployRecord.switched?.web !== false
    || deployRecord.candidates?.api?.revision !== context.approvedSha || !Array.isArray(deployRecord.migrationPaths) || deployRecord.migrationPaths.length
    || deployRecord.target !== context.approvedSha) reasons.push('DEPLOY_RECORD_SHAPE');
  if (deployRecord && !expired(deployRecord)) reasons.push('TRANSACTION_NOT_EXPIRED');
  if (!marker || marker.version !== 3 || marker.operation !== 'CODE_HOLD' || marker.phase !== 'IN_PROGRESS' || marker.runId !== context.targetRunId
    || marker.target !== context.approvedSha || !expired(marker)) reasons.push('POLICY_MARKER_SHAPE');
  if (marker && Number.isFinite(Date.parse(marker.startedAt)) && Number.isFinite(Date.parse(marker.expiresAt))
    && (Date.parse(marker.expiresAt) - Date.parse(marker.startedAt) > 30 * 60 * 1000)) reasons.push('POLICY_MARKER_WINDOW');
  if (!floor || floor.version !== 3 || floor.floorSha !== context.approvedSha || floor.chanjetPolicy !== 'HOLD' || floor.readonlyApproval !== null) reasons.push('FLOOR_SHAPE');
  if (!active || active.version !== 3 || active.outcome !== 'CONFIG_READY_HOLD' || active.floorSha !== context.approvedSha || active.configSha !== context.approvedSha
    || active.active?.api?.revision === context.approvedSha
    || JSON.stringify(active.active) !== JSON.stringify(deployRecord?.previous)) reasons.push('ACTIVE_STILL_PROMOTION_STATE');
  if (!runtime?.api?.revision || runtime.api.revision !== context.approvedSha) reasons.push('RUNTIME_API_NOT_CANDIDATE');
  if (!runtime?.web?.revision || !active?.active?.web?.revision || runtime.web.revision !== active.active.web.revision) reasons.push('RUNTIME_WEB_DRIFTED');
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
  }
  return { eligible: reasons.length === 0, reasons };
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

// CLI entry: only ever runs against the real trusted control plane, guarded by
// RECOVERY_EXECUTE plus explicit run/SHA binding. Local tests never reach it.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const write = (label, value) => { console.log(`${label}=${value}`); };
  try {
    const context = { targetRunId: process.env.RECOVERY_TARGET_RUN_ID, approvedSha: process.env.RECOVERY_APPROVED_SHA, recoveryRunId: process.env.RECOVERY_RUN_ID };
    if (process.env.RECOVERY_EXECUTE !== 'true' || !/^\d+(?:-\d+)?$/.test(context.targetRunId || '') || !/^[a-f0-9]{40}$/.test(context.approvedSha || '')) {
      write('DEPLOYMENT_RECOVERY', 'HOLD_EXECUTION_NOT_AUTHORIZED'); process.exitCode = 1;
    } else {
      const root = fs.realpathSync(process.cwd());
      const { CONTRACT, secureJson, verifyContext, rollbackEligibility } = await import('./production-config-guard.mjs');
      const { atomicState } = await import('./production-deployment-state.mjs');
      const { captureRuntime } = await import('./capture-production-runtime.mjs');
      verifyContext(root, CONTRACT.stateDirectory);
      const read = name => secureJson(path.join(CONTRACT.stateDirectory, name));
      const transaction = read('transaction.json');
      const deployRecord = read(`deploy-${context.targetRunId}.json`);
      const marker = read('policy-transition.json');
      const floor = read('floor.json');
      const active = read('active.json');
      const runtime = captureRuntime();
      const readinessHttp = await import('node:child_process').then(({ execFileSync }) => {
        try { return execFileSync('curl', ['-sS', '--max-time', '15', '-o', '/dev/null', '-w', '%{http_code}', 'http://127.0.0.1:3100/api/readiness'], { encoding: 'utf8' }).trim(); } catch { return '000'; }
      });
      const rawEnv = JSON.parse(await import('node:child_process').then(({ execFileSync }) => execFileSync('docker', ['inspect', 'phoenix-v3-api', '--format', '{{json .Config.Env}}'], { encoding: 'utf8' })));
      const liveEnv = Object.fromEntries(rawEnv.filter(line => /^(CHANJET_READONLY_SYNC_ENABLED|CHANJET_ERP_INBOUND_SYNC_ENABLED|CHANJET_SYNC_POLICY)=/.test(line)).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
      const evidence = {
        pre: JSON.parse(fs.readFileSync(deployRecord.evidence.pre, 'utf8')),
        post: JSON.parse(fs.readFileSync(deployRecord.evidence.post, 'utf8')),
        startup: JSON.parse(fs.readFileSync(deployRecord.evidence.log, 'utf8')),
      };
      const assessment = assessRecovery({ transaction, deployRecord, marker, floor, active, runtime, readinessHttp, liveEnv, evidence }, context);
      if (!assessment.eligible) { write('DEPLOYMENT_RECOVERY', `HOLD_${assessment.reasons.join(',')}`); process.exitCode = 1; }
      else if (!rollbackEligibility(root, floor, runtime.api).allowed) { write('DEPLOYMENT_RECOVERY', 'HOLD_RUNTIME_NOT_FLOOR_ELIGIBLE'); process.exitCode = 1; }
      else {
        // Archive-first: full copies + hashes of every file we are about to
        // touch. An existing archive means this run id was already recovered.
        const archiveFile = path.join(CONTRACT.stateDirectory, `recovery-${context.targetRunId}.json`);
        if (fs.existsSync(archiveFile)) { write('DEPLOYMENT_RECOVERY', 'HOLD_ALREADY_RECOVERED'); process.exitCode = 1; }
        else {
          const recoveredAt = new Date().toISOString();
          const snapshotOf = (name, value) => ({ name, sha256: sha256(JSON.stringify(value)), value });
          const plan = planRecoveredState(deployRecord, marker, { recoveryRunId: context.recoveryRunId, recoveredAt });
          atomicState(archiveFile, { schema: RECOVERY_SCHEMA, recoveryRunId: context.recoveryRunId, recoveredAt, targetRunId: context.targetRunId, approvedSha: context.approvedSha,
            assessment, archived: [snapshotOf('transaction.json', transaction), snapshotOf('policy-transition.json', marker), snapshotOf('floor.json', floor), snapshotOf('active.json', active), snapshotOf(`deploy-${context.targetRunId}.json`, deployRecord)] });
          atomicState(path.join(CONTRACT.stateDirectory, 'active.json'), plan.active);
          atomicState(path.join(CONTRACT.stateDirectory, `deploy-${context.targetRunId}.json`), plan.deployRecord);
          fs.unlinkSync(path.join(CONTRACT.stateDirectory, 'transaction.json'));
          fs.unlinkSync(path.join(CONTRACT.stateDirectory, 'policy-transition.json'));
          write('DEPLOYMENT_RECOVERY', 'COMPLETE');
        }
      }
    }
  } catch (error) {
    console.error(error?.code || `RECOVERY_HOLD=UNEXPECTED:${String(error?.message || error).slice(0, 200)}`);
    process.exitCode = 1;
  }
}
