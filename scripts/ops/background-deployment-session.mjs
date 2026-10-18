/** Persistent owner of the database fence while the formal deploy body runs.
 * An unsupported old runtime is a HOLD, never a synthetic drain receipt.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { CONTRACT, secureJson, verifyContext, git } from './production-config-guard.mjs';
import { captureRuntime } from './capture-production-runtime.mjs';
import { atomicState } from './production-atomic-state.mjs';
import { metadataFor } from './production-deployment-evidence.mjs';
import { BackgroundFenceCoordinator, inventoryApiContainers, inspectApiParticipant, verifyParticipantStatus, verifyCompletedDeployment } from './background-control-coordinator.mjs';
import { HOLD_KINDS, validateBinding, validateParticipants, fail } from './background-control-manifest.mjs';

export function assertLatestMain(target, { root = CONTRACT.repository, probe = git } = {}) {
  if (!/^[a-f0-9]{40}$/.test(target || '')) fail('TARGET_MAIN_BINDING');
  let remote;
  try { remote = probe(root, ['ls-remote', '--exit-code', 'origin', 'refs/heads/main'], { timeoutMs: 10000 }); }
  catch { fail('LATEST_MAIN_UNVERIFIED'); }
  const lines = String(remote).trim().split('\n');
  if (lines.length !== 1 || lines[0] !== `${target}\trefs/heads/main`) fail('LATEST_MAIN_CHANGED');
  return true;
}

export function exactReanchorBinding(env, floor, active) {
  if (env.DEPLOY_MODE !== 'api' || env.BUILD_API !== 'true' || env.BUILD_WEB !== 'false' || env.RUN_MIG !== 'false') fail('API_ONLY_NO_MIGRATION_REQUIRED');
  // This release protocol implements exactly the reviewed old/new floor
  // transition. A future unchanged-floor code release needs its own previous
  // runtime/floor contract and must not reach mutation then fail at UNFENCE.
  if (!/^[a-f0-9]{40}$/.test(env.APPROVED_CONFIG_FLOOR_SHA || '') || env.APPROVED_CONFIG_FLOOR_SHA !== env.TARGET_SHA
    || !/^[a-f0-9]{40}$/.test(env.APPROVED_PREVIOUS_FLOOR_SHA || '')
    || env.APPROVED_PREVIOUS_FLOOR_SHA === env.APPROVED_CONFIG_FLOOR_SHA) fail('UNSUPPORTED_NORMAL_DEPLOY');
  if (floor.version !== 3 || active.version !== 3 || floor.phase !== 'READY' || floor.chanjetPolicy !== 'HOLD' || floor.readonlyApproval !== null
    || active.outcome !== 'SUCCESS' || active.floorSha !== floor.floorSha) fail('FLOOR_HOLD_PRECONDITION');
  const binding = { owner: env.DEPLOY_RUN_ID, previousFloorSha: env.APPROVED_PREVIOUS_FLOOR_SHA, targetSha: env.TARGET_SHA };
  validateBinding(binding);
  if (binding.previousFloorSha !== floor.floorSha || active.active?.api?.revision !== floor.floorSha) fail('OLD_FLOOR_RUNTIME_BINDING');
  return binding;
}

export function spawnDeploymentBody(body, dependencies = {}) {
  // FD9 must survive both layers: verifyContext checks the invoking parent's
  // inherited descriptor, not an environment assertion of lock ownership.
  const stdio = ['pipe', 'inherit', 'inherit', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 9];
  const child = (dependencies.spawn || spawn)('/bin/bash', ['-Eeuo', 'pipefail'], {
    env: { ...(dependencies.env || process.env), BACKGROUND_DEPLOYMENT_SUPERVISED: 'true' },
    cwd: dependencies.root || CONTRACT.repository, stdio, detached: true,
  });
  child.stdin.on?.('error', () => { child.backgroundInputFailed = true; try { child.kill('SIGTERM'); } catch { /* Fixed failure classification below. */ } });
  child.stdin.end(body); return child;
}

export function discoverParticipants(project, dependencies = {}) {
  const ids = (dependencies.inventory || inventoryApiContainers)(project);
  const api = (dependencies.metadata || metadataFor)('api');
  // Current formal API-only evidence protocol pins one named API executor.
  // An unexpected replica is a separate maintenance/inventory decision.
  if (ids.length !== 1 || ids[0] !== api.id) fail('EXECUTOR_INVENTORY');
  const candidate = { bootId: '00000000-0000-4000-8000-000000000000', containerId: api.id, revision: api.ociRevision, allowedKinds: [...HOLD_KINDS] };
  let actual;
  try { actual = (dependencies.inspect || inspectApiParticipant)(candidate, project); }
  catch { fail('HOLD_NO_FENCE_OR_DRAIN_PROOF'); }
  const participant = { ...candidate, bootId: actual.status?.bootId };
  try { validateParticipants([participant]); verifyParticipantStatus(actual, participant); }
  catch { fail('HOLD_NO_FENCE_OR_DRAIN_PROOF'); }
  return [participant];
}

export async function executeFencedDeployment({ binding, project, participants, script, timeoutMs = 120000, maximumMs = 1800000 }, dependencies = {}) {
  validateBinding(binding); validateParticipants(participants);
  if (typeof script !== 'string' || !script.trim() || Buffer.byteLength(script) > 1024 * 1024) fail('DEPLOY_BODY_REQUIRED');
  if (!Number.isSafeInteger(maximumMs) || maximumMs < 1 || maximumMs > 1800000) fail('SESSION_DEADLINE');
  const verifyMain = dependencies.verifyMain || (() => assertLatestMain(binding.targetSha));
  const coordinator = dependencies.coordinator || new BackgroundFenceCoordinator({ binding, project, participants, timeoutMs }, {
    verifySuccess: async b => { verifyCompletedDeployment(b, b.participants); await verifyMain(); return true; },
  });
  const spawnBody = dependencies.spawnBody || spawnDeploymentBody;
  let child; let failed = null; let monitor; let deadline; let killDeadline; let polling = false; let bodyExited = false; let pollPromise = Promise.resolve();
  const terminate = () => {
    if (!child || bodyExited || child.exitCode !== null) return;
    try { (dependencies.killBody || (signal => process.kill(-child.pid, signal)))('SIGTERM'); } catch { /* Already exited. */ }
    killDeadline ||= setTimeout(() => {
      if (bodyExited || child.exitCode !== null) return;
      try { (dependencies.killBody || (signal => process.kill(-child.pid, signal)))('SIGKILL'); } catch { /* Already exited. */ }
    }, dependencies.killGraceMs ?? 2000);
  };
  const lose = reason => { if (!failed) failed = new Error(`BACKGROUND_HOLD=${reason}`); terminate(); };
  const signal = () => lose('DEPLOY_SESSION_INTERRUPTED');
  process.once('SIGTERM', signal); process.once('SIGINT', signal);
  try {
    await verifyMain();
    const proof = await coordinator.fenceAndDrain();
    if (failed) throw failed;
    await (dependencies.persistProof || (value => {
      const file = path.join(CONTRACT.stateDirectory, `background-drain-${binding.owner}.json`);
      if (fs.existsSync(file)) fail('DRAIN_RECEIPT_REUSED');
      atomicState(file, value);
    }))(proof);
    // Verify immediately before allowing even PRE/floor/code mutation.
    await coordinator.verifyQuiescent();
    await verifyMain();
    if (failed) throw failed;
    child = spawnBody(script);
    let lastMainProbe = Date.now();
    monitor = setInterval(() => {
      if (polling || failed) return; polling = true;
      pollPromise = (async () => {
        try {
          await coordinator.verifyLease();
          if (Date.now() - lastMainProbe >= (dependencies.mainPollMs ?? 5000)) {
            try { await verifyMain(); } catch { lose('LATEST_MAIN_UNVERIFIED_OR_CHANGED'); }
            lastMainProbe = Date.now();
          }
        }
        catch { lose('CONTROL_SESSION_LOST'); }
        finally { polling = false; }
      })();
    }, dependencies.pollMs ?? 500);
    deadline = setTimeout(() => lose('DEPLOY_SESSION_TIMEOUT'), maximumMs);
    const result = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, sig) => { bodyExited = true; resolve({ code, signal: sig }); }); });
    clearInterval(monitor); clearTimeout(deadline); clearTimeout(killDeadline);
    await pollPromise;
    if (failed) throw failed;
    if (result.code !== 0 || result.signal || child.backgroundInputFailed) fail('DEPLOY_BODY_FAILED');
    if (!coordinator.session.connected() || await coordinator.session.ping() !== true) fail('CONTROL_SESSION_LOST');
    coordinator.publisher.assertOwned(binding);
    const next = await (dependencies.discoverNew || (() => discoverParticipants(project)))();
    await verifyMain();
    // This calls the independent protected formal SUCCESS/PRE/POST/startup/live
    // verifier, not the child exit code or readiness HTTP result alone.
    await coordinator.openAfterSuccess(next);
    return { outcome: 'SUCCESS', owner: binding.owner, targetSha: binding.targetSha, participants: next };
  } catch (error) {
    terminate();
    try { coordinator.publisher.hold(binding, 'DEPLOY_SESSION_FAILED'); } catch { /* Never clear or reopen state on failure. */ }
    throw error;
  } finally {
    clearInterval(monitor); clearTimeout(deadline); clearTimeout(killDeadline);
    process.removeListener('SIGTERM', signal); process.removeListener('SIGINT', signal);
    await coordinator.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    verifyContext(fs.realpathSync(process.cwd()), CONTRACT.stateDirectory);
    if (process.argv[2] === 'check-main') {
      assertLatestMain(process.env.TARGET_SHA);
      console.log('BACKGROUND_MAIN_BINDING=PASS');
    } else {
    if (process.argv[2] !== 'run') fail('OPERATION');
    const floor = secureJson(path.join(CONTRACT.stateDirectory, 'floor.json'));
    const active = secureJson(path.join(CONTRACT.stateDirectory, 'active.json'));
    const binding = exactReanchorBinding(process.env, floor, active);
    if (fs.existsSync(path.join(CONTRACT.stateDirectory, `background-drain-${binding.owner}.json`))) fail('DRAIN_RECEIPT_REUSED');
    if (fs.existsSync(path.join(CONTRACT.stateDirectory, 'transaction.json')) || fs.existsSync(path.join(CONTRACT.stateDirectory, 'policy-transition.json'))) fail('UNFINISHED_DEPLOY_TRANSACTION');
    // Existing floor authority validates its own complete contract, actual
    // runtime pins, storage and effective/live Chanjet policy before FENCE.
    const installed = await import(pathToFileURL(path.join(CONTRACT.repository, 'scripts/ops/production-config-guard.mjs')).href);
    for (const key of ['repository', 'controlRoot', 'stateDirectory', 'archiveDirectory', 'executionUid', 'controlMounts']) {
      if (JSON.stringify(installed.CONTRACT[key]) !== JSON.stringify(CONTRACT[key])) fail('CONTROL_CONTEXT_CHANGE');
    }
    installed.guardProduction(CONTRACT.repository, CONTRACT.stateDirectory, captureRuntime());
    const participants = discoverParticipants(floor.project);
    const script = fs.readFileSync(0, 'utf8');
    const result = await executeFencedDeployment({ binding, project: floor.project, participants, script });
    console.log(`BACKGROUND_DEPLOYMENT=${result.outcome}`);
    }
  } catch (error) {
    const code = /^(?:BACKGROUND|CONFIG|RUNTIME|STATE)_HOLD=[A-Z0-9_]+$/.test(error.message) ? error.message : 'BACKGROUND_HOLD=DEPLOY_SESSION_FAILED';
    console.error(code); process.exitCode = 1;
  }
}
