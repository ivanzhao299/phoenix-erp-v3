import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import {
  CONTRACT, assertFloor, assertStateVersion, git, guardProduction, migrationScope,
  requireCleanMain, secureJson, verifyContext,
} from './production-config-guard.mjs';
import { atomicState } from './production-atomic-state.mjs';
import { assertModernReleaseAdmission } from './production-maintenance-admission.mjs';
import {
  MODE_EVIDENCE_SCHEMA, captureDockerLogStreams, captureSnapshot, compareSnapshots,
  startupBundle, summarizeStartupLogs, verifyEvidenceFiles, verifyLiveSnapshot,
} from './production-deployment-evidence.mjs';
import { inspectCandidate, transactionFile } from './production-deployment-state.mjs';
import { runCompose } from './phoenix-production-compose.mjs';
import { readBackgroundPrivate, readPublicManifest } from './background-control-manifest.mjs';
import {
  inspectApiParticipant, inventoryApiContainers, verifyParticipantStatus,
} from './background-control-coordinator.mjs';
import { assertLatestMain, fullDeploymentBinding } from './background-deployment-session.mjs';

export const INCIDENT = Object.freeze({
  apiRevision: '2994b4cd8e9bdcb4179bf2afa8697edf1da0cd42',
  webRevision: 'c0c77025f68cd63525f8d929510fa7d7c51c7f40',
  reviewedRelease: '46594699a2d0aceaa991c2ac185fd4aefb33f851',
  floor: 'beff6954f08f1393457524476e3b62eba6a8bf4e',
  fullOwner: '45549520604-1',
  webOwner: '45559680114-1',
  openGeneration: 131,
});
const SHA = /^[a-f0-9]{40}$/;
const OWNER = /^[1-9]\d*-[1-9]\d*$/;
const JOURNAL = 'web-baseline-restoration-45559680114-1.json';
const WINDOW_MS = 20 * 60 * 1000;
const hold = code => { throw new Error('WEB_BASELINE_HOLD=' + code); };
const same = isDeepStrictEqual;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const pin = item => ({ imageId: item.image, revision: item.ociRevision });
const pins = snap => ({ api: pin(snap.containers.api), web: pin(snap.containers.web) });
const optional = file => {
  try { fs.lstatSync(file); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
};
const filesFor = (dir, owner, staged = false) => Object.fromEntries(
  [['pre', 'pre'], ['post', 'post'], ['log', 'startup']]
    .map(([key, suffix]) => [key, path.join(dir, `${staged ? 'web-baseline' : 'deploy'}-${owner}-${suffix}-evidence.json`)]),
);
const bindingFor = (owner, revision, mode) => ({
  runId: owner, runAttempt: Number(owner.split('-')[1]), targetSha: revision,
  configFloorSha: INCIDENT.floor, deployMode: mode, evidenceSchema: MODE_EVIDENCE_SCHEMA,
});

export function proveReleaseChain(full, hotfix) {
  const { apiRevision, webRevision } = INCIDENT;
  if (full.record.configSha !== apiRevision || hotfix.record.configSha !== webRevision
    || !same(full.record.active, pins(full.post)) || !same(hotfix.record.active, pins(hotfix.post))
    || full.record.active.api.revision !== apiRevision || full.record.active.web.revision !== apiRevision
    || hotfix.record.active.web.revision !== webRevision || !same(full.record.active, hotfix.record.previous)
    || !same(hotfix.record.previous, pins(hotfix.pre))
    || !same(full.post.containers, hotfix.pre.containers)
    || !same(full.record.active.api, hotfix.record.active.api)
    || !same(full.record.switched, { api: true, web: true })
    || !same(hotfix.record.switched, { api: false, web: true })
    || !same(hotfix.record.migrationPaths, []) || hotfix.record.migrationBaseline !== apiRevision) hold('RECEIPT_CHAIN');
}

export function classifyWebTransition(pre, current, destination) {
  if (['api', 'db'].some(service => !same(pre.containers[service], current.containers[service]))) hold('UNCHANGED_RUNTIME_DRIFT');
  if (same(pre.containers.web, current.containers.web)) return 'SOURCE';
  if (current.containers.web.id !== pre.containers.web.id && same(pin(current.containers.web), destination)) return 'DESTINATION';
  return hold('UNRECOGNIZED_WEB_RUNTIME');
}

export function buildWebTransaction({ owner, target, previous, destination, now, directory }) {
  const active = { api: previous.api, web: destination };
  return {
    deployMode: 'web', expiresAt: new Date(now + CONTRACT.maximumTransitionMs).toISOString(),
    version: CONTRACT.version, configSha: target, target: destination.revision, floorSha: INCIDENT.floor,
    previous, active, candidates: { web: destination }, switched: { api: false, web: true },
    outcome: 'SWITCHING', migrationBaseline: INCIDENT.apiRevision, migrationPaths: [],
    protectedImages: [...new Set([previous.api.imageId, previous.web.imageId, destination.imageId])],
    evidence: filesFor(directory, owner, true),
  };
}

function probeHttp() {
  for (const url of ['http://127.0.0.1:3100/api/readiness', 'http://127.0.0.1:3000/']) {
    try {
      execFileSync('/usr/bin/curl', ['-fsSL', '--retry', '2', '--max-time', '20', '-o', '/dev/null', url],
        { stdio: 'ignore', timeout: 65000 });
    } catch { hold('HTTP_READINESS'); }
  }
}

function operateStateOnHost(root, owner, revision, ...operation) {
  execFileSync(process.execPath, [path.join(root, 'scripts/ops/production-deployment-state.mjs'), ...operation], {
    cwd: root, env: { ...process.env, DEPLOY_RUN_ID: owner, DEPLOY_RUN_ATTEMPT: owner.split('-')[1],
      TARGET_SHA: revision, DEPLOY_MODE: 'web' },
    stdio: ['ignore', 'inherit', 'inherit', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 9],
  });
}

export function restoreWebBaseline({ phase, target, workflowOwner, resumeOwner }, overrides = {}) {
  const recovery = ['resume', 'abort'].includes(phase);
  const root = CONTRACT.repository;
  const directory = CONTRACT.stateDirectory;
  const {
    read = secureJson, write = atomicState, exists = optional, now = Date.now,
    context = verifyContext, activeGuard = guardProduction, floorGuard = assertFloor, admission = assertModernReleaseAdmission,
    cleanMain = requireCleanMain, latestMain = assertLatestMain, gitRead = git, scope = migrationScope,
    privateControl = readBackgroundPrivate, publicControl = readPublicManifest,
    inspectParticipant = inspectApiParticipant, inventory = inventoryApiContainers, candidate = inspectCandidate,
    evidenceFiles = verifyEvidenceFiles, liveSnapshot = verifyLiveSnapshot, snapshot = captureSnapshot,
    compose = runCompose, http = probeHttp, logs = captureDockerLogStreams, stateOperation = operateStateOnHost,
    unlink = fs.unlinkSync,
  } = overrides;
  if (!['preflight', 'restore', 'fallback', 'resume', 'abort'].includes(phase) || !SHA.test(target)
    || !OWNER.test(workflowOwner) || (recovery ? !OWNER.test(resumeOwner) : Boolean(resumeOwner))) hold('INPUT_BINDING');
  const owner = recovery ? resumeOwner : workflowOwner;
  if ((recovery && owner === workflowOwner) || Number(owner.split('-')[0]) <= Number(INCIDENT.webOwner.split('-')[0])) hold('OWNER_BINDING');
  const file = name => path.join(directory, name);
  const txFile = transactionFile(directory, owner);
  const markerFile = file('transaction.json');
  const current = () => assertStateVersion(read(file('active.json')));
  const boundAdmission = () => admission({ directory }, { guard: () => context(root, directory) });

  context(root, directory);
  cleanMain(root, phase === 'preflight' ? undefined : target);
  const requireLatest = () => { if (['preflight', 'restore'].includes(phase)) latestMain(target, { root }); };
  requireLatest();
  gitRead(root, ['merge-base', '--is-ancestor', INCIDENT.floor, INCIDENT.apiRevision]);
  gitRead(root, ['merge-base', '--is-ancestor', INCIDENT.apiRevision, INCIDENT.webRevision]);
  gitRead(root, ['merge-base', '--is-ancestor', INCIDENT.webRevision, INCIDENT.reviewedRelease]);
  gitRead(root, ['merge-base', '--is-ancestor', INCIDENT.reviewedRelease, target]);
  if (scope(root, INCIDENT.apiRevision, target).changed.length) hold('MIGRATION_SCOPE');
  if (exists(file('policy-transition.json'))) hold('POLICY_TRANSITION');
  const marker = exists(markerFile) ? assertStateVersion(read(markerFile)) : null;
  const journal = exists(file(JOURNAL)) ? read(file(JOURNAL)) : null;
  const direction = recovery ? journal?.pending?.direction : phase === 'preflight' ? 'restore' : phase;
  if (!['restore', 'fallback'].includes(direction) || (journal && (journal.schema !== 1 || journal.target !== target))
    || (recovery && journal?.pending?.owner !== owner) || (!recovery && journal?.pending) || journal?.heldRollback
    || (direction === 'restore' && journal?.restored) || (direction === 'fallback' && (!journal?.restored || journal?.fellBack))
    || (marker && (!recovery || marker.runId !== owner || marker.phase !== 'IN_PROGRESS'))) hold('JOURNAL_OR_TRANSACTION_BINDING');
  boundAdmission();
  const floor = read(file('floor.json'));
  if (floor.floorSha !== INCIDENT.floor || floor.chanjetPolicy !== 'HOLD' || floor.readonlyApproval !== null) hold('CONFIG_FLOOR');
  floorGuard(root, floor, target, { targetTree: true });

  function receipt(run, revision, mode, staged = false) {
    const record = assertStateVersion(read(transactionFile(directory, run)));
    const files = filesFor(directory, run, staged), binding = bindingFor(run, revision, mode);
    if (record.outcome !== 'SUCCESS' || record.target !== revision || record.floorSha !== INCIDENT.floor
      || record.deployMode !== mode || !same(record.evidence, files)) hold('RELEASE_RECEIPT');
    const pre = read(files.pre), post = read(files.post);
    read(files.log);
    evidenceFiles(files.pre, files.post, files.log, binding);
    if (!same(record.active, pins(post))) hold('RELEASE_RECEIPT_PINS');
    return { record, pre, post, binding };
  }

  const full = receipt(INCIDENT.fullOwner, INCIDENT.apiRevision, 'full');
  const hotfix = receipt(INCIDENT.webOwner, INCIDENT.webRevision, 'web');
  proveReleaseChain(full, hotfix);
  const origin = direction === 'restore' ? hotfix : receipt(journal.restored.owner, INCIDENT.apiRevision, 'web', true);
  const destination = (direction === 'restore' ? full : hotfix).record.active.web;
  if (direction === 'fallback' && (origin.record.configSha !== target
    || !same(origin.record.previous, hotfix.record.active) || !same(origin.record.active, full.record.active)
    || !same(origin.pre.containers, hotfix.post.containers) || !same(origin.record.switched, { api: false, web: true }))) hold('RESTORATION_RECEIPT_CHAIN');
  const originalActive = current();
  if ((originalActive.outcome !== 'SUCCESS' && !(phase === 'abort' && originalActive.outcome === 'ROLLED_BACK')) || originalActive.floorSha !== INCIDENT.floor
    || originalActive.migrationBaseline !== INCIDENT.apiRevision) hold('CANONICAL_ACTIVE');
  const proof = () => {
    const privateRecord = privateControl(directory), manifest = publicControl();
    const api = origin.post.containers.api;
    if ([privateRecord, manifest].some(control => control?.phase !== 'OPEN' || control.owner !== INCIDENT.fullOwner
      || control.generation !== INCIDENT.openGeneration || control.targetSha !== INCIDENT.apiRevision)
      || privateRecord.holdReason || privateRecord.manifestDigest !== digest(manifest) || manifest.participants.length !== 1
      || manifest.participants[0].containerId !== api.id || !same(inventory(floor.project), [api.id])) hold('OPEN_BINDING');
    const participant = manifest.participants[0], actual = inspectParticipant(participant, floor.project);
    const status = verifyParticipantStatus(actual, participant, manifest);
    const control = status.controlSession;
    return digest([privateRecord, manifest, actual.imageId, actual.startedAt, actual.restartCount,
      control.sessionPid, control.databaseOid, control.backendStartedAt]);
  };
  const backgroundProof = proof();
  if (journal?.backgroundProof && journal.backgroundProof !== backgroundProof) hold('OPEN_DRIFT');
  const proveImages = () => {
    for (const expected of [origin.record.active.web, destination]) {
      if (!same(candidate(expected.imageId, expected.revision), expected)) hold('IMMUTABLE_IMAGE');
    }
  };
  proveImages();
  const binding = bindingFor(owner, destination.revision, 'web');
  const take = evidencePhase => snapshot({ ...binding, phase: evidencePhase, floorSha: INCIDENT.floor });
  const preparedAt = recovery ? journal.pending.preparedAt : now();
  const state = buildWebTransaction({ owner, target, previous: origin.record.active, destination, now: preparedAt, directory });
  const evidence = state.evidence;
  const requireOriginal = () => {
    if (!same(originalActive.active, origin.record.active) || originalActive.configSha !== origin.record.configSha) hold('ACTIVE_ORIGIN_PINS');
    activeGuard(root, directory, origin.record.active);
    return liveSnapshot(origin.post, origin.binding);
  };
  const pre = recovery ? read(evidence.pre) : take('PRE_SNAPSHOT');
  if (!same(pre.containers, origin.post.containers)) hold('CURRENT_PRE_DRIFT');

  if (phase === 'preflight') {
    requireOriginal();
    http();
    fullDeploymentBinding({ DEPLOY_MODE: 'full', BUILD_API: 'true', BUILD_WEB: 'true', RUN_MIG: 'false',
      TARGET_SHA: target, DEPLOY_RUN_ID: workflowOwner }, floor, { ...originalActive, active: state.active });
    return { phase, api: state.active.api.revision, currentWeb: state.previous.web.revision,
      restoredWeb: state.active.web.revision, floor: floor.floorSha, target, generation: INCIDENT.openGeneration };
  }

  const pending = { owner, direction, preparedAt, preDigest: digest(pre) };
  const baseJournal = { schema: 1, target, backgroundProof, restored: journal?.restored ?? null, fellBack: null };
  const publicFiles = filesFor(directory, owner);
  const transaction = { version: CONTRACT.version, runId: owner, phase: 'IN_PROGRESS', target: state.target, configSha: target };
  function publishResult(post) {
    liveSnapshot(post, binding);
    if (proof() !== backgroundProof) hold('OPEN_DRIFT');
    const finalized = current();
    if (finalized.configSha !== target || finalized.outcome !== 'SUCCESS' || finalized.floorSha !== INCIDENT.floor
      || finalized.migrationBaseline !== INCIDENT.apiRevision || !same(finalized.active, state.active) || exists(markerFile)) hold('FINAL_STATE');
    const result = { owner, completedAt: new Date(now()).toISOString() };
    if (direction === 'restore') {
      fullDeploymentBinding({ DEPLOY_MODE: 'full', BUILD_API: 'true', BUILD_WEB: 'true', RUN_MIG: 'false',
        TARGET_SHA: target, DEPLOY_RUN_ID: owner }, floor, finalized);
      result.continueBy = new Date(Date.parse(post.containers.web.startedAt) + WINDOW_MS).toISOString();
    }
    // The generic audit discovers only complete deploy-* triplets. Publish
    // these after the existing state authority has committed SUCCESS.
    for (const key of ['pre', 'post', 'log']) {
      const value = read(evidence[key]);
      if (exists(publicFiles[key])) {
        if (!same(read(publicFiles[key]), value)) hold('PUBLIC_EVIDENCE_DRIFT');
      } else write(publicFiles[key], value);
    }
    write(file(JOURNAL), { ...baseJournal, [direction === 'restore' ? 'restored' : 'fellBack']: result, pending: null });
    return { phase: direction, owner, api: state.active.api.revision, web: destination.revision,
      floor: floor.floorSha, target, generation: INCIDENT.openGeneration, continueBy: result.continueBy };
  }

  if (recovery && (!same(pending, journal.pending) || (marker && !same(marker, transaction)))) hold('RESUME_JOURNAL');
  if (phase === 'abort') {
    const rollbackState = { ...state, active: state.previous, outcome: 'ROLLING_BACK' };
    const rolledBackState = { ...rollbackState, outcome: 'ROLLED_BACK' };
    const untouchedState = { ...state, active: state.previous, outcome: 'ABORTED_UNCHANGED' };
    const staged = exists(txFile) ? read(txFile) : null;
    const rollback = same(staged, rollbackState) || same(staged, rolledBackState);
    const observed = take('POST_SNAPSHOT');
    if (proof() !== backgroundProof) hold('OPEN_DRIFT');
    if (!rollback && classifyWebTransition(pre, observed, destination) === 'SOURCE') {
      if (staged && !same(staged, state) && !same(staged, untouchedState)) hold('ABORT_STATE_DRIFT');
      requireOriginal();
      http();
      if (staged && !same(staged, untouchedState)) write(txFile, untouchedState);
      if (marker) unlink(markerFile);
      write(file(JOURNAL), { ...baseJournal, pending: null, aborted: owner });
      return { phase: 'aborted', owner, web: state.previous.web.revision };
    }
    // After a replacement, an unhealthy candidate is not a valid Web PRE
    // receipt. Revert only our exact image, keep a separate rollback record,
    // and leave the normal release admission held by the canonical outcome.
    if (!same(staged, state) && !rollback) hold('ABORT_STATE_DRIFT');
    const samePeers = ['api', 'db'].every(service => same(pre.containers[service], observed.containers[service]));
    const onDestination = same(pin(observed.containers.web), destination);
    const onReturn = same(pin(observed.containers.web), state.previous.web) && observed.containers.web.id !== pre.containers.web.id;
    if (!samePeers || !(onDestination || (rollback && onReturn))) hold('ABORT_RUNTIME_DRIFT');
    if (marker) {
      if (now() >= Date.parse(state.expiresAt)) hold('RESTORATION_TRANSACTION_EXPIRED');
      if (!rollback) stateOperation(root, owner, state.target, 'rollback-pin', 'web');
      if (onDestination) compose(['up', '-d', '--no-deps', '--wait', 'web']);
    } else if (!same(staged, rolledBackState) || !onReturn) hold('ABORT_MARKER_REQUIRED');
    http();
    const returned = captureReturned();
    if (marker) stateOperation(root, owner, state.target, 'rolled-back');
    if (current().outcome !== 'ROLLED_BACK' || !same(current().active, state.previous) || exists(markerFile)) hold('ABORT_FINAL_STATE');
    if (!same(returned.containers, captureReturned().containers)) hold('ABORT_RUNTIME_DRIFT');
    write(file(JOURNAL), { ...baseJournal, pending: null, heldRollback: owner, returned });
    return { phase: 'rolled-back-hold', owner, web: state.previous.web.revision };

    function captureReturned() {
      const back = take('POST_SNAPSHOT');
      if (!same(pin(back.containers.web), state.previous.web) || back.containers.web.id === observed.containers.web.id && onDestination
        || back.containers.web.health !== 'healthy' || back.containers.web.running !== true
        || ['api', 'db'].some(service => !same(pre.containers[service], back.containers[service]))
        || proof() !== backgroundProof) hold('ABORT_RUNTIME_DRIFT');
      return back;
    }
  }
  if (phase === 'resume') {
    if (!marker && exists(txFile) && read(txFile).outcome === 'SUCCESS') return publishResult(receipt(owner, state.target, 'web', true).post);
    if (now() >= Date.parse(state.expiresAt)) hold('RESTORATION_TRANSACTION_EXPIRED');
  } else {
    requireOriginal();
    http();
    if ([txFile, ...Object.values(evidence), ...Object.values(publicFiles)].some(exists)) hold('OWNER_ALREADY_EXISTS');
    requireLatest();
    if (proof() !== backgroundProof) hold('OPEN_DRIFT');
    write(evidence.pre, pre);
    write(file(JOURNAL), { ...baseJournal, pending });
  }

  if (exists(txFile)) {
    const staged = read(txFile);
    if (!same(staged, state) && !(marker && same(staged, { ...state, outcome: 'SUCCESS' }))) hold('RESTORATION_STATE_DRIFT');
  } else {
    if (marker) hold('RESTORATION_STATE_MISSING');
    write(txFile, state);
  }
  if (!marker) {
    requireOriginal();
    requireLatest();
    write(markerFile, transaction);
  }
  const runtime = classifyWebTransition(pre, take('POST_SNAPSHOT'), destination);
  if (runtime === 'SOURCE') {
    if (exists(evidence.post) || exists(evidence.log)) hold('EXISTING_POST_PROOF');
    requireLatest();
    if (proof() !== backgroundProof) hold('OPEN_DRIFT');
    compose(['up', '-d', '--no-deps', '--wait', 'web']);
  }
  http();
  const post = exists(evidence.post) ? read(evidence.post) : take('POST_SNAPSHOT');
  if (classifyWebTransition(pre, post, destination) !== 'DESTINATION') hold('WEB_DID_NOT_SWITCH');
  compareSnapshots(pre, post, 'web');
  liveSnapshot(post, binding);
  if (proof() !== backgroundProof) hold('OPEN_DRIFT');
  const web = post.containers.web;
  if (!exists(evidence.log)) {
    const capturedAt = new Date(now()).toISOString();
    const summary = summarizeStartupLogs({ ...binding, ...logs({ containerId: web.id, startedAt: web.startedAt, capturedAt }),
      floorSha: INCIDENT.floor, service: 'web', containerId: web.id, startedAt: web.startedAt, capturedAt,
      readinessVerified: true, webHttpVerified: true });
    if (summary.result !== 'PASS_REDACTED_SUMMARY') hold('WEB_STARTUP_PROOF');
    if (!exists(evidence.post)) write(evidence.post, post);
    write(evidence.log, startupBundle(post, { web: summary }));
  }
  evidenceFiles(evidence.pre, evidence.post, evidence.log, binding);
  requireLatest();
  if (proof() !== backgroundProof) hold('OPEN_DRIFT');
  stateOperation(root, owner, state.target, 'complete');
  return publishResult(post);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [phase, target, workflowOwner, resumeOwner] = process.argv.slice(2);
  process.env.DEPLOY_RUN_ID = ['resume', 'abort'].includes(phase) ? resumeOwner : workflowOwner;
  try {
    const result = restoreWebBaseline({ phase, target, workflowOwner, resumeOwner });
    console.log('WEB_BASELINE_RESULT=' + JSON.stringify(result));
    if (result.phase === 'rolled-back-hold') process.exitCode = 1;
  } catch (error) {
    const code = String(error.message).match(/^(?:WEB_BASELINE|CONFIG|BACKGROUND|MAINTENANCE|DEPLOY_EVIDENCE|STATE)_HOLD=[A-Z0-9_]+/)?.[0];
    console.error(code || 'WEB_BASELINE_HOLD=EXECUTION_FAILED');
    process.exitCode = 1;
  }
}
