/** Targeted, inspectable reconciliation of a stranded background-control hold.
 *
 * A background deployment session that died between FENCE and OPEN leaves
 * `background-control.json` (private) and the public FENCED manifest behind.
 * Every later deploy then fails with BACKGROUND_HOLD=UNFINISHED_BACKGROUND
 * _TRANSACTION while business background tasks stay denied.
 *
 * This tool has exactly three modes:
 *   inspect            read-only dump of the hold state (never mutates anything)
 *   reconcile          delete the stranded hold after every invariant below holds
 *   revive-participant after a hold was cleared, the running API still holds an
 *                      in-memory manifest-generation watermark from the stranded
 *                      session; a fresh fence generation (1) is then rejected as
 *                      MANIFEST_GENERATION_REPLAY and every deploy dies at
 *                      PARTICIPANT_FENCE_NOT_OBSERVED. The watermark is not
 *                      observable through any file, so the only protocol-true
 *                      reset is restarting the stateless API participant (same
 *                      image, same revision, runtime pins unchanged). This mode
 *                      performs that restart only when no control record exists
 *                      and no deployment is in flight.
 *
 * Invariants enforced before any deletion (failure stops with a *_HOLD code):
 *   - the production context is the contract repository/state directory and
 *     the caller holds the FD9 mutation lock (production-control-bootstrap)
 *   - checkout is clean main at TARGET_SHA and origin/main agrees
 *   - floor.json v3 READY and active.json v3 SUCCESS agree on floorSha
 *   - no deployment transaction.json / policy-transition.json is in flight
 *   - the private record shape is a stranded FENCED/CODE_HOLD (or
 *     PUBLISHING_FENCE with no public manifest: the deny never published)
 *   - the public manifest, when present, binds to the private record
 *   - the running api/web revisions equal the pinned floor/active revisions
 *   - the held target is NOT already the live floor (that case belongs to the
 *     deployment recovery protocol, not to deletion)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { CONTRACT, secureJson, verifyContext } from './production-config-guard.mjs';
import { atomicState } from './production-atomic-state.mjs';
import { captureRuntime } from './capture-production-runtime.mjs';
import { PUBLIC_DIRECTORY, readPublicManifest } from './background-control-manifest.mjs';

const hold = reason => { throw new Error(`BACKGROUND_RECONCILIATION=HOLD_${reason}`); };
let stage = 'START';
const mark = name => { stage = name; console.error(`BACKGROUND_RECONCILIATION_STAGE=${name}`); };
const root = fs.realpathSync(process.cwd());
const stateDirectory = CONTRACT.stateDirectory;
const mode = process.argv[2] ?? '';
const targetSha = process.env.TARGET_SHA || '';
const git = args => execFileSync('git', ['-c', `safe.directory=${root}`, '-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, encoding: 'utf8' }).trim();

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (mode !== 'inspect' && mode !== 'reconcile' && mode !== 'revive-participant') throw new Error('BACKGROUND_RECONCILIATION=HOLD_USAGE_INSPECT_RECONCILE_OR_REVIVE');
    mark('VERIFY_CONTEXT');
    verifyContext(root, stateDirectory);
    mark('CHECKOUT');
    if (!/^[a-f0-9]{40}$/.test(targetSha)) hold('TARGET_SHA');
    if (git(['branch', '--show-current']) !== 'main' || git(['status', '--porcelain', '--untracked-files=all'])) hold('WORKTREE_NOT_CLEAN_MAIN');
    // Inspection is read-only and must work while the checkout is still behind;
    // only the mutating reconcile binds to an exactly checked-out target.
    if (mode === 'reconcile' && targetSha !== git(['rev-parse', 'HEAD'])) hold('CHECKOUT');
    mark('REMOTE_MAIN');
    if (targetSha !== git(['ls-remote', 'origin', 'refs/heads/main']).split(/\s/)[0]) hold('REMOTE_MAIN');
    mark('STATE_BINDING');
    const floor = secureJson(path.join(stateDirectory, 'floor.json'));
    const active = secureJson(path.join(stateDirectory, 'active.json'));
    if (floor.version !== 3 || floor.phase !== 'READY') hold('FLOOR');
    if (active.version !== 3 || active.outcome !== 'SUCCESS' || active.floorSha !== floor.floorSha) hold('ACTIVE_STATE');
    mark('DEPLOYMENT_STATE');
    for (const name of ['transaction.json', 'policy-transition.json']) {
      if (fs.existsSync(path.join(stateDirectory, name))) hold(`DEPLOYMENT_IN_PROGRESS_${name.replace(/[^a-z]/gi, '_').toUpperCase()}`);
    }
    mark('HOLD_SHAPE');
    const execFileSyncLocal = (file, args) => execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const participantStatus = () => {
      const probe = "fetch('http://127.0.0.1:3100/api/internal/background/status',{signal:AbortSignal.timeout(3000)}).then(async r=>{if(!r.ok)process.exit(2);process.stdout.write(await r.text())}).catch(()=>process.exit(3))";
      return JSON.parse(execFileSyncLocal('docker', ['exec', 'phoenix-v3-api', 'node', '-e', probe]));
    };
    if (mode === 'revive-participant') {
      if (fs.existsSync(path.join(stateDirectory, 'background-control.json'))) hold('REVIVE_WITH_RECORD_CLEAR_FIRST');
      const before = participantStatus();
      console.log(JSON.stringify({ participantBefore: { bootId: before.bootId, phase: before.phase, owner: before.owner, generation: before.generation } }));
      execFileSyncLocal('docker', ['restart', 'phoenix-v3-api']);
      mark('REVIVE_WAIT_HEALTH');
      let healthy = false;
      for (let attempt = 0; attempt < 40 && !healthy; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        try { healthy = execFileSyncLocal('docker', ['inspect', 'phoenix-v3-api', '--format', '{{.State.Health.Status}}']) === 'healthy'; } catch { /* retry */ }
      }
      if (!healthy) hold('REVIVE_UNHEALTHY');
      const after = participantStatus();
      if (after.poisoned || after.stopping || after.controlSession?.connected !== true) hold('REVIVE_PARTICIPANT_NOT_READY');
      console.log(JSON.stringify({ participantAfter: { bootId: after.bootId, phase: after.phase, generation: after.generation } }));
      mark('COMPLETE');
      console.log(`BACKGROUND_RECONCILIATION=REVIVED;bootId=${after.bootId};phase=${after.phase};generation=${after.generation}`);
      process.exit(0);
    }
    const privateFile = path.join(stateDirectory, 'background-control.json');
    if (!fs.existsSync(privateFile)) { console.log('BACKGROUND_RECONCILIATION=NOOP'); process.exit(0); }
    const record = secureJson(privateFile);
    const manifest = readPublicManifest(PUBLIC_DIRECTORY);
    if (!record || !/^\d+-\d+$/.test(record.owner || '') || !/^[a-f0-9]{40}$/.test(record.targetSha || '')
      || !Number.isSafeInteger(record.generation) || record.generation < 1) hold('STATE_SHAPE');
    if (mode === 'inspect') {
      console.log(JSON.stringify({
        privateRecord: {
          phase: record.phase, owner: record.owner, generation: record.generation,
          previousFloorSha: record.previousFloorSha ?? null, targetSha: record.targetSha,
          holdReason: record.holdReason ?? null, updatedAt: record.updatedAt ?? null,
        },
        publicManifest: manifest ? {
          phase: manifest.phase, owner: manifest.owner, generation: manifest.generation,
          targetSha: manifest.targetSha, participants: manifest.participants.length,
        } : null,
        floorSha: floor.floorSha,
        activeApiRevision: active.active?.api?.revision ?? null,
        activeWebRevision: active.active?.web?.revision ?? null,
      }));
      console.log('BACKGROUND_RECONCILIATION=INSPECTED');
      process.exit(0);
    }
    const publishCrash = record.phase === 'PUBLISHING_FENCE' && !manifest;
    if (!publishCrash) {
      if (!['FENCED', 'CODE_HOLD'].includes(record.phase) || !record.holdReason) hold('STATE_SHAPE');
      if (!manifest || manifest.owner !== record.owner || manifest.targetSha !== record.targetSha
        || manifest.generation !== record.generation || !['FENCED', 'CODE_HOLD'].includes(manifest.phase)) hold('PUBLIC_BINDING');
    }
    mark('RUNTIME_BINDING');
    const actual = captureRuntime();
    if (actual.api.revision !== floor.floorSha || actual.web.revision !== active.active.web.revision) hold('RUNTIME_DRIFT');
    if (record.targetSha === floor.floorSha) hold('TARGET_ACTIVE_USE_DEPLOYMENT_RECOVERY');
    mark('CLEAR_HOLD');
    // Evidence first: the full record stays in the reviewed workflow log.
    console.log(JSON.stringify({ cleared: { record, manifest } }));
    // Persist the generation high-water mark before deleting the records so
    // the next fence continues above every generation a live participant may
    // still watermark (see BackgroundManifestPublisher).
    const generationFile = path.join(stateDirectory, 'background-generation.json');
    const highWater = Math.max(record.generation, manifest?.generation ?? 0);
    if (highWater >= 1) atomicState(generationFile, { schema: 'phoenix.background-generation/1', generation: highWater, updatedAt: new Date().toISOString() });
    for (const file of [privateFile, path.join(stateDirectory, `background-drain-${record.owner}.json`)]) {
      try { fs.unlinkSync(file); } catch (error) { if (error.code !== 'ENOENT') hold('UNLINK_FAILED'); }
    }
    if (manifest) {
      try { fs.unlinkSync(path.join(PUBLIC_DIRECTORY, 'manifest.json')); } catch (error) { if (error.code !== 'ENOENT') hold('UNLINK_FAILED'); }
    }
    mark('COMPLETE');
    console.log(`BACKGROUND_RECONCILIATION=CLEARED;owner=${record.owner};target=${record.targetSha};reason=${record.holdReason ?? 'PUBLISHING_FENCE_CRASH'};runtimeApi=${actual.api.revision}`);
  } catch (error) {
    const message = String(error?.message || '').replace(/\s+/g, ' ').slice(0, 200);
    const reason = message.startsWith('BACKGROUND_RECONCILIATION=') ? message : `BACKGROUND_RECONCILIATION=HOLD_VALIDATION:${message || 'UNKNOWN'}`;
    console.error(`${reason}_AT_${stage}`);
    process.exitCode = 1;
  }
}
