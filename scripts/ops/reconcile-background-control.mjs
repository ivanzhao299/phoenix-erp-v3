/** Targeted, inspectable reconciliation of a stranded background-control hold.
 *
 * A background deployment session that died between FENCE and OPEN leaves
 * `background-control.json` (private) and the public FENCED manifest behind.
 * Every later deploy then fails with BACKGROUND_HOLD=UNFINISHED_BACKGROUND
 * _TRANSACTION while business background tasks stay denied.
 *
 * This tool has exactly two modes:
 *   inspect    read-only dump of the hold state (never mutates anything)
 *   reconcile  delete the stranded hold after every invariant below holds
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
    if (mode !== 'inspect' && mode !== 'reconcile') throw new Error('BACKGROUND_RECONCILIATION=HOLD_USAGE_INSPECT_OR_RECONCILE');
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
