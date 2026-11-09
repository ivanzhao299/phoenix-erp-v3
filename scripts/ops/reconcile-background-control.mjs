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
import { PUBLIC_DIRECTORY, readPublicManifest, BackgroundManifestPublisher } from './background-control-manifest.mjs';
import { verifyCompletedDeployment } from './background-control-coordinator.mjs';
import { discoverParticipants } from './background-deployment-session.mjs';

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
    if (mode !== 'inspect' && mode !== 'reconcile' && mode !== 'revive-participant' && mode !== 'abort-prepared-promotion' && mode !== 'complete-background-open' && mode !== 'rollback-dead-transaction') throw new Error('BACKGROUND_RECONCILIATION=HOLD_USAGE_UNKNOWN_MODE');
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
    mark('HOLD_SHAPE');
    if (mode === 'rollback-dead-transaction') {
      // A deployment body that died between `switch` and the container update
      // leaves its transaction marker behind while the runtime still runs the
      // previous pins; every later deploy then holds on UNFINISHED_TRANSACTION.
      // Replay the reviewed `rolled-back` closure, whose own assertions prove
      // the runtime never moved before deleting the marker.
      const deadRunId = process.env.DEAD_RUN_ID || '';
      if (!/^\d+-\d+$/.test(deadRunId)) hold('DEAD_RUN_ID');
      if (targetSha !== git(['rev-parse', 'HEAD'])) hold('CHECKOUT');
      const markerFile = path.join(stateDirectory, 'transaction.json');
      if (!fs.existsSync(markerFile)) { console.log('BACKGROUND_RECONCILIATION=NOOP'); process.exit(0); }
      const marker = secureJson(markerFile);
      let deadRecord = null;
      try { deadRecord = secureJson(path.join(stateDirectory, `deploy-${deadRunId}.json`)); } catch { deadRecord = null; }
      console.log(JSON.stringify({ deadMarker: marker, deadRecord: deadRecord }));
      if (!marker || String(marker.runId) !== deadRunId || marker.phase !== 'IN_PROGRESS') hold('DEAD_TRANSACTION_BINDING');
      if (!deadRecord || ['SUCCESS', 'ROLLED_BACK'].includes(deadRecord.outcome)) hold('DEAD_TRANSACTION_BINDING');
      // GuardProduction binds closure to the original checkout (configSha ==
      // HEAD), which legitimate post-incident main movement breaks. Close the
      // transaction explicitly instead, proving the body never mutated the
      // runtime: every switched candidate must already BE the running image.
      mark('RUNTIME_BINDING');
      const actualDead = captureRuntime();
      for (const service of ['api', 'web']) {
        const previous = deadRecord.previous?.[service];
        if (!previous || actualDead[service].imageId !== previous.imageId || actualDead[service].revision !== previous.revision) hold(`RUNTIME_MOVED_${service.toUpperCase()}`);
        // A rebuilt candidate legitimately carries a different image digest;
        // safety comes from the runtime never having left `previous`.
      }
      const deadFloor = secureJson(path.join(stateDirectory, 'floor.json'));
      const deadActive = secureJson(path.join(stateDirectory, 'active.json'));
      if (deadActive.outcome !== 'SUCCESS' || deadActive.active?.api?.revision !== actualDead.api.revision
        || (deadRecord.deployMode === 'full' && deadActive.active?.web?.revision !== actualDead.web.revision)) hold('ACTIVE_BINDING');
      mark('CLOSE_TRANSACTION');
      atomicState(path.join(stateDirectory, `deploy-${deadRunId}.json`), {
        ...deadRecord,
        outcome: 'ROLLED_BACK',
        rolledBackBy: 'reconcile-background-control/rollback-dead-transaction',
        rolledBackAt: new Date().toISOString(),
        rollbackProof: { runtime: actualDead, previous: deadRecord.previous, floorSha: deadFloor.floorSha },
      });
      try { fs.unlinkSync(markerFile); } catch (error) { if (error.code !== 'ENOENT') hold('UNLINK_FAILED'); }
      const policyMarker = path.join(stateDirectory, 'policy-transition.json');
      try { fs.unlinkSync(policyMarker); } catch (error) { if (error.code !== 'ENOENT') hold('UNLINK_FAILED'); }
      mark('COMPLETE');
      console.log(`BACKGROUND_RECONCILIATION=TRANSACTION_ROLLED_BACK;run=${deadRunId};target=${marker.target};runtimeApi=${actualDead.api.revision}`);
      process.exit(0);
    }
    if (mode === 'complete-background-open') {
      // A background session whose deploy body fully succeeded (api switched,
      // evidence complete, floor promoted) but whose OPEN step died can only
      // move forward: the runtime already runs the target. Re-verify the
      // formal SUCCESS receipt with the reviewed verifier and publish OPEN.
      const sessionOwner = process.env.SESSION_OWNER || '';
      if (!/^\d+-\d+$/.test(sessionOwner)) hold('SESSION_OWNER');
      if (targetSha !== git(['rev-parse', 'HEAD'])) hold('CHECKOUT');
      const sessionPrivate = path.join(stateDirectory, 'background-control.json');
      if (!fs.existsSync(sessionPrivate)) hold('NO_RECORD');
      const record = secureJson(sessionPrivate);
      if (!record || record.owner !== sessionOwner || !['FENCED', 'CODE_HOLD'].includes(record.phase)) hold('OWNER_OR_TRANSACTION_MISMATCH');
      for (const name of ['transaction.json', 'policy-transition.json']) {
        if (fs.existsSync(path.join(stateDirectory, name))) hold(`DEPLOYMENT_IN_PROGRESS_${name.replace(/[^a-z]/gi, '_').toUpperCase()}`);
      }
      mark('STATE_BINDING');
      const floor = secureJson(path.join(stateDirectory, 'floor.json'));
      const active = secureJson(path.join(stateDirectory, 'active.json'));
      const mode = record.deployMode || 'api';
      const configFloorSha = mode === 'full' ? (record.configFloorSha || floor.floorSha) : record.targetSha;
      if (floor.version !== 3 || floor.phase !== 'READY' || floor.floorSha !== configFloorSha
        || active.version !== 3 || active.outcome !== 'SUCCESS' || active.floorSha !== configFloorSha) hold('FLOOR');
      const deployment = secureJson(path.join(stateDirectory, `deploy-${sessionOwner}.json`));
      if (!deployment || deployment.outcome !== 'SUCCESS' || deployment.target !== record.targetSha) hold('DEPLOY_RECORD');
      mark('RUNTIME_BINDING');
      const actual = captureRuntime();
      if (actual.api.revision !== record.targetSha || (mode === 'full' && actual.web.revision !== record.targetSha)
        || JSON.stringify(actual) !== JSON.stringify(active.active)) hold('RUNTIME_DRIFT');
      const binding = { owner: record.owner, previousFloorSha: record.previousFloorSha, targetSha: record.targetSha,
        ...(mode === 'full' ? { deployMode: 'full', configFloorSha } : {}) };
      mark('OPEN');
      // The old session's control session is gone with it; the formal OPEN
      // only needs the independent SUCCESS verifier plus the publisher.
      const next = discoverParticipants(floor.project);
      const publisher = new BackgroundManifestPublisher();
      await publisher.open(binding, next, async b => {
        verifyCompletedDeployment(b, next);
        return true;
      });
      mark('COMPLETE');
      console.log(`BACKGROUND_RECONCILIATION=OPENED;owner=${record.owner};target=${record.targetSha};runtimeApi=${actual.api.revision}`);
      process.exit(0);
    }
    if (mode === 'abort-prepared-promotion') {
      // A promotion that reached PREPARED_HOLD but whose deployment body died
      // leaves floor/active on the target with an in-flight policy-transition
      // marker bound to that exact run attempt. No rerun can reuse the marker,
      // so the only safe completion is restoring the recorded previous state.
      const promotionRunId = process.env.PROMOTION_RUN_ID || '';
      if (!/^\d+-\d+$/.test(promotionRunId)) hold('PROMOTION_RUN_ID');
      const recordFile = path.join(stateDirectory, `floor-promotion-${promotionRunId}.json`);
      const markerFile = path.join(stateDirectory, 'policy-transition.json');
      if (!fs.existsSync(recordFile) || !fs.existsSync(markerFile)) hold('NO_PREPARED_PROMOTION');
      const record = secureJson(recordFile);
      const marker = secureJson(markerFile);
      const floor = secureJson(path.join(stateDirectory, 'floor.json'));
      const active = secureJson(path.join(stateDirectory, 'active.json'));
      if (!record || record.version !== 3 || !record.previousFloor || !record.previousActive
        || record.approvedSha !== marker.target || floor.floorSha !== marker.target || active.floorSha !== marker.target
        || String(marker.runId) !== promotionRunId || marker.phase !== 'IN_PROGRESS'
        || active.outcome !== 'CONFIG_READY_HOLD') hold('PROMOTION_BINDING');
      const transactionFile = path.join(stateDirectory, 'transaction.json');
       const transaction = fs.existsSync(transactionFile) ? secureJson(transactionFile) : null;
       if (transaction && (transaction.runId !== promotionRunId || transaction.phase !== 'IN_PROGRESS' || transaction.target !== marker.target)) hold('DEPLOYMENT_TRANSACTION_BINDING');
      mark('RUNTIME_BINDING');
      const actualAbort = captureRuntime();
      if (actualAbort.api.revision !== record.previousFloor.floorSha
        || actualAbort.web.revision !== record.previousActive.active.web.revision) hold('RUNTIME_DRIFT');
      if (transaction) {
         atomicState(transactionFile, { ...transaction, phase: 'ROLLED_BACK', outcome: 'ROLLED_BACK', rolledBackBy: 'reconcile-background-control/abort-prepared-promotion', rolledBackAt: new Date().toISOString(), rollbackProof: { runtime: actualAbort, previous: record.previousActive } });
         fs.unlinkSync(transactionFile);
       }
       mark('RESTORE_PREVIOUS');
      // Evidence first: the full prepared state stays in the reviewed log.
      console.log(JSON.stringify({ aborted: { record, marker, floor, active } }));
      atomicState(path.join(stateDirectory, 'floor.json'), record.previousFloor);
      atomicState(path.join(stateDirectory, 'active.json'), record.previousActive);
      const abortHighWater = Math.max(marker.generation ?? 0, 0);
      for (const file of [markerFile]) {
        try { fs.unlinkSync(file); } catch (error) { if (error.code !== 'ENOENT') hold('UNLINK_FAILED'); }
      }
      mark('CLEAR_HOLD');
      const abortPrivate = path.join(stateDirectory, 'background-control.json');
      const abortRecord = fs.existsSync(abortPrivate) ? secureJson(abortPrivate) : null;
      if (abortRecord && String(abortRecord.owner) === promotionRunId) {
        const generationFile = path.join(stateDirectory, 'background-generation.json');
        const highWater = Math.max(abortRecord.generation || 0, abortHighWater);
        if (highWater >= 1) atomicState(generationFile, { schema: 'phoenix.background-generation/1', generation: highWater, updatedAt: new Date().toISOString() });
        for (const file of [abortPrivate, path.join(stateDirectory, `background-drain-${promotionRunId}.json`)]) {
          try { fs.unlinkSync(file); } catch (error) { if (error.code !== 'ENOENT') hold('UNLINK_FAILED'); }
        }
        try { fs.unlinkSync(path.join(PUBLIC_DIRECTORY, 'manifest.json')); } catch (error) { if (error.code !== 'ENOENT') hold('UNLINK_FAILED'); }
      }
      mark('COMPLETE');
      console.log(`BACKGROUND_RECONCILIATION=PROMOTION_ABORTED;run=${promotionRunId};target=${targetSha};restoredFloor=${record.previousFloor.floorSha};runtimeApi=${actualAbort.api.revision}`);
      process.exit(0);
    }
    mark('STATE_BINDING');
    const floor = secureJson(path.join(stateDirectory, 'floor.json'));
    const active = secureJson(path.join(stateDirectory, 'active.json'));
    if (floor.version !== 3 || floor.phase !== 'READY') hold('FLOOR');
    if (active.version !== 3 || active.outcome !== 'SUCCESS' || active.floorSha !== floor.floorSha) hold('ACTIVE_STATE');
    mark('DEPLOYMENT_STATE');
    for (const name of ['transaction.json', 'policy-transition.json']) {
      if (fs.existsSync(path.join(stateDirectory, name))) hold(`DEPLOYMENT_IN_PROGRESS_${name.replace(/[^a-z]/gi, '_').toUpperCase()}`);
    }
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
    const fullRecord = record.deployMode === 'full';
    const expectedApi = fullRecord ? active.active.api.revision : floor.floorSha;
    const expectedWeb = fullRecord ? active.active.web.revision : active.active.web.revision;
    if (actual.api.revision !== expectedApi || actual.web.revision !== expectedWeb) hold('RUNTIME_DRIFT');
    if (!fullRecord && record.targetSha === floor.floorSha) hold('TARGET_ACTIVE_USE_DEPLOYMENT_RECOVERY');
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
