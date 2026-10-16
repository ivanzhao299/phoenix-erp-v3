// R4.2d full-chain first-sync entry driver (TEST INFRASTRUCTURE): the REAL
// production entry flow — the handover read from the chain's delivery file,
// the binding verification against the trusted admission row, the REAL
// budget read adapter and the REAL durable stop through the reviewed
// compiled modules and the docker-exec stop executor (a real HOLD write on
// the fixture database). ONLY the host-trusted-path pieces are bound to the
// controlled production context: verifyContext/clean-main (the approved root
// workflow's context, asserted in its own control), the runtime pins, the
// floor state and the state-directory-confined atomicState (same
// write-then-rename atomicity). The entry's own catch tail
// (FIRST_CONTROLLED_SYNC=HOLD;EVIDENCE_RETAINED;... + exit 1) is mirrored
// verbatim from the module's firstSync().
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const cfg = JSON.parse(fs.readFileSync(process.env.R42D_SHIM_CONFIG, 'utf8'));

try {
  const firstSync = await import(pathToFileURL(path.join(cfg.repoRoot, 'scripts/ops/chanjet-readonly-first-sync.mjs')).href);
  const audit = await import(pathToFileURL(path.join(cfg.repoRoot, 'scripts/ops/chanjet-readonly-production-audit.mjs')).href);
  // the handover lives ONLY in the chain-delivered state file
  const handoverFile = path.join(cfg.stateDir, 'prepare-sync-handover.json');
  if (!fs.existsSync(handoverFile)) throw Error('FIRST_SYNC_HOLD=HANDOVER_MISSING');
  const handover = JSON.parse(fs.readFileSync(handoverFile, 'utf8'));
  if (handover?.target !== process.env.APPROVED_CONFIG_FLOOR_SHA) throw Error('FIRST_SYNC_HOLD=EXECUTION_BINDING');
  // evidence reads carry the LIVE remaining budget into the subprocess
  const readEvidence = (sql, budget) => audit.readDatabaseEvidence(sql, { timeoutMs: budget?.remainingMs ?? 30_000 });
  await firstSync.firstSyncCore({
    env: { ...process.env, FIRST_SYNC_ROOT: cfg.repoRoot },
    handover,
    durableStop: firstSync.makeDurableStop({
      distRoot: cfg.distRoot,
      executor: firstSync.makeProductionStopExecutor({ dbContainer: cfg.dbContainerName }),
      readEvidence,
      handover,
    }),
    readEvidence: firstSync.makeProductionReadEvidence({ dbContainer: cfg.dbContainerName }),
    captureRuntime: async () => ({
      api: { revision: cfg.targetSha, imageId: cfg.apiImageId },
      web: { revision: cfg.targetSha, imageId: cfg.webImageId },
    }),
    guardProduction: () => {
      const floor = JSON.parse(fs.readFileSync(path.join(cfg.stateDir, 'floor.json'), 'utf8'));
      if (floor.chanjetPolicy !== 'READONLY_VERIFY' || floor.floorSha !== (process.env.TARGET_SHA || '')) throw Error('CONFIG_HOLD=FLOOR_NOT_READY');
      return floor;
    },
    requireCleanMain: () => { /* the production clean-main guard runs only in
      the approved root control workflow; asserted there */ },
    stateDirectory: cfg.stateDir,
    fileExists: (file) => fs.existsSync(file),
    atomicState: (file, value) => {
      const tmp = `${file}.tmp-${randomUUID().slice(0, 8)}`;
      fs.writeFileSync(tmp, JSON.stringify(value));
      fs.renameSync(tmp, file);
    },
    endpoint: cfg.endpoint,
  });
} catch (error) {
  if (process.env.R42D_DEBUG) console.error(`FIRST_SYNC_DEBUG_STACK=${String(error?.stack || error).replace(/[^\x20-\x7e]/g, ' ').slice(0, 800)}`);
  const reason = String(error?.message || error).replace(/[^\x20-\x7e]/g, ' ').slice(0, 160);
  console.error(`FIRST_CONTROLLED_SYNC=HOLD;EVIDENCE_RETAINED;REASON=${reason};STOP=${error?.stopOutcome ?? 'NOT_NEEDED'}`);
  process.exitCode = 1;
}
