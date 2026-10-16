// R4.2d bounded HOLD finalizer for the controlled first-sync chain: ANY
// chain failure after the execution reached SYNCING (prepare's own failure
// after registration included) lands the execution in a durable HOLD
// through the DELIVERED compiled store and the docker-exec stop channel —
// a leaked live execution is never left behind. Idempotent: an execution
// already stopped (HOLD/terminal) or not yet SYNCING reports and exits
// without touching anything. Never changes the caller's exit status
// semantics (the chain runs it under a trap with `|| true`).
//
// Inputs (env): R42D_MANIFEST_FILE (digest-verified approved manifest),
// CHANJET_EXECUTION_DIST_ROOT (the chain-delivered compiled modules),
// DB_CONTAINER, FIRST_SYNC_ROOT (the reviewed checkout), R42D_HOLD_CLASS.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

try {
  const root = fs.realpathSync(process.env.FIRST_SYNC_ROOT || process.cwd());
  const distRoot = process.env.CHANJET_EXECUTION_DIST_ROOT || '';
  const manifest = JSON.parse(fs.readFileSync(process.env.R42D_MANIFEST_FILE, 'utf8'));
  if (!distRoot || !manifest?.executionId) throw Error('FINALIZER_UNUSABLE');
  const auditMod = await import(pathToFileURL(path.join(root, 'scripts/ops/chanjet-readonly-production-audit.mjs')).href);
  const firstSyncMod = await import(pathToFileURL(path.join(root, 'scripts/ops/chanjet-readonly-first-sync.mjs')).href);
  const readEvidence = (sql, budget) => auditMod.readDatabaseEvidence(sql, { timeoutMs: budget?.remainingMs ?? 30_000 });
  // the trusted row decides: only a live SYNCING execution with a lease and
  // a deadline is held (the guard triggers re-verify the manifest identity)
  const row = await readEvidence(`SELECT json_build_object('phase', phase, 'hold_reason', hold_reason, 'lease_id', lease_id, 'deadline_at', deadline_at) AS e FROM chanjet_execution_admissions WHERE execution_id = '${manifest.executionId}';`);
  if (row?.phase !== 'SYNCING' || !row.lease_id || !row.deadline_at) {
    console.log('FIRST_SYNC_DURABLE_STOP=NO_SYNCING_TO_HOLD');
    process.exit(0);
  }
  const outcome = await firstSyncMod.makeDurableStop({
    distRoot,
    executor: firstSyncMod.makeProductionStopExecutor({ dbContainer: process.env.DB_CONTAINER || 'phoenix-v3-db' }),
    readEvidence,
    handover: { executionId: manifest.executionId, leaseId: row.lease_id, deadlineAt: new Date(row.deadline_at) },
  })(process.env.R42D_HOLD_CLASS || 'CANCELLED');
  console.log(`FIRST_SYNC_DURABLE_STOP=${outcome}`);
  process.exit(outcome === 'CONFIRMED' || outcome === 'ALREADY_STOPPED' || outcome === 'NO_HOLD_NEEDED' ? 0 : 1);
} catch (error) {
  console.log(`FIRST_SYNC_DURABLE_STOP=UNCONFIRMED:${String(error?.message || error).replace(/[^\x20-\x7e]/g, ' ').slice(0, 120)}`);
  process.exit(1);
}
