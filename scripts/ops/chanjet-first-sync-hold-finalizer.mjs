// R4.2d bounded HOLD finalizer for the controlled first-sync chain: ANY
// chain failure after registration lands the execution in a durable HOLD
// through the DELIVERED compiled store and the docker-exec stop channel —
// a leaked live execution is never left behind, and a foreign one is never
// touched.
//
// Semantics:
//   - LIVE PHASES: REGISTERED / PROBING / PROBED / SYNCING are all held
//     (the standalone holdExecution's atomic UPDATE carries the FULL
//     registration binding — owner, approval, floor, canonical manifest,
//     digest — and excludes terminal phases).
//   - IDENTITY GATE BEFORE ANY STOP: the trusted row must be THIS approved
//     execution — owner, approval id, floor sha and the FULL canonical
//     manifest must all match the digest-verified approved manifest. Any
//     mismatch means the live row belongs to a DIFFERENT registration:
//     zero modification, IDENTITY_MISMATCH, exit 1.
//   - Idempotent: terminal (VERIFIED/HOLD) or missing rows report and exit 0
//     without touching anything; the store classifies ALREADY_STOPPED.
//   - Never changes the caller's exit-status semantics (the chain runs it
//     under a trap with `|| true`).
//
// Inputs (env): R42D_MANIFEST_FILE (digest-verified approved manifest),
// CHANJET_EXECUTION_DIST_ROOT (the chain-delivered compiled modules),
// DB_CONTAINER, FIRST_SYNC_ROOT (the reviewed checkout), R42D_HOLD_CLASS.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const LIVE_PHASES = ['REGISTERED', 'PROBING', 'PROBED', 'SYNCING'];

try {
  const root = fs.realpathSync(process.env.FIRST_SYNC_ROOT || process.cwd());
  const distRoot = process.env.CHANJET_EXECUTION_DIST_ROOT || '';
  const manifest = JSON.parse(fs.readFileSync(process.env.R42D_MANIFEST_FILE, 'utf8'));
  if (!distRoot || !manifest?.executionId || !manifest?.ownerId || !manifest?.approval?.approvalId || !manifest?.approval?.floorSha) throw Error('FINALIZER_UNUSABLE');
  const auditMod = await import(pathToFileURL(path.join(root, 'scripts/ops/chanjet-readonly-production-audit.mjs')).href);
  const firstSyncMod = await import(pathToFileURL(path.join(root, 'scripts/ops/chanjet-readonly-first-sync.mjs')).href);
  const readEvidence = (sql, budget) => auditMod.readDatabaseEvidence(sql, { timeoutMs: budget?.remainingMs ?? 30_000 });
  // the trusted row decides everything: phase, lease, deadline AND identity
  const row = await readEvidence(`SELECT json_build_object(
    'phase', phase, 'hold_reason', hold_reason, 'lease_id', lease_id,
    'deadline_at', deadline_at, 'owner_id', owner_id,
    'approval_id', approval_id, 'floor_sha', floor_sha, 'manifest', manifest
  ) AS e FROM chanjet_execution_admissions WHERE execution_id = '${manifest.executionId}';`);
  if (!row?.phase || !LIVE_PHASES.includes(row.phase)) {
    console.log('FIRST_SYNC_DURABLE_STOP=NO_LIVE_EXECUTION');
    process.exit(0);
  }
  // FULL approved-binding identity gate — canonical manifest equality
  // implies identical canonical text and digest (both are functions of the
  // manifest content), so the store's own binding WHERE can only confirm
  // THIS registration.
  const identity = {
    owner: row.owner_id === manifest.ownerId,
    approval: row.approval_id === manifest.approval.approvalId,
    floor: row.floor_sha === manifest.approval.floorSha,
    canonicalManifest: firstSyncMod.canonicalJson(row.manifest ?? null) === firstSyncMod.canonicalJson(manifest),
  };
  if (!Object.values(identity).every(Boolean)) {
    console.log(`FIRST_SYNC_DURABLE_STOP=IDENTITY_MISMATCH;${JSON.stringify(identity)}`);
    process.exit(1); // zero modification: the live row is not ours to stop
  }
  const outcome = await firstSyncMod.makeDurableStop({
    distRoot,
    executor: firstSyncMod.makeProductionStopExecutor({ dbContainer: process.env.DB_CONTAINER || 'phoenix-v3-db' }),
    readEvidence,
    handover: { executionId: manifest.executionId, leaseId: row.lease_id || '', deadlineAt: new Date(row.deadline_at) },
  })(process.env.R42D_HOLD_CLASS || 'CANCELLED');
  console.log(`FIRST_SYNC_DURABLE_STOP=${outcome}`);
  process.exit(outcome === 'CONFIRMED' || outcome === 'ALREADY_STOPPED' || outcome === 'NO_HOLD_NEEDED' ? 0 : 1);
} catch (error) {
  console.log(`FIRST_SYNC_DURABLE_STOP=UNCONFIRMED:${String(error?.message || error).replace(/[^\x20-\x7e]/g, ' ').slice(0, 120)}`);
  process.exit(1);
}
