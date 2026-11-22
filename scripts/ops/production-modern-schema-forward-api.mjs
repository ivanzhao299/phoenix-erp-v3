/** Recover the verified API of one stopped, post-DDL release. The old lease
 * and its step chain remain historical evidence throughout. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { CONTRACT, git, requireCleanMain } from './production-config-guard.mjs';
import { executionEnv } from './capture-production-runtime.mjs';
import { atomicState } from './production-atomic-state.mjs';
import { assertRegularFile, readPinnedFile } from './production-trusted-paths.mjs';
import { canonicalDigest, same } from './production-maintenance-receipts.mjs';
import { HOLD_KINDS, PUBLIC_DIRECTORY, atomicPublicManifest, assertSameBinding,
  readPublicManifest, validateBinding, validateManifest } from './background-control-manifest.mjs';
import { inspectApiParticipant, inventoryApiContainers, verifyCompletedDeployment,
  verifyParticipantStatus } from './background-control-coordinator.mjs';
import { ModernSchemaRegistry } from './production-modern-schema-registration.mjs';
import { verifyModernSchemaStage } from './production-modern-schema-stage.mjs';
import { readHeldModernSchemaApiBody } from './production-modern-schema-terminal.mjs';
import { ModernSchemaPrivateRuntime } from './production-modern-schema-private.mjs';
import { ModernSchemaIngress } from './production-modern-schema-ingress.mjs';
import { ingressIdentity } from './maintenance-ingress-policy.mjs';
import { ModernSchemaControlSession, pinOriginalModernSchemaSession, readLinuxProcessIdentity,
  verifyOriginalModernSchemaAdmission } from './production-modern-schema-session-lease.mjs';
import { ModernSchemaReadClient } from './production-modern-schema-read-client.mjs';
import { pinModernSchemaChild } from './production-modern-schema-processes.mjs';
import { closeModernSchemaOriginalSession, confirmModernSchemaPublicDurability,
  modernSchemaOriginalSessionExitSql } from './production-modern-schema-completion.mjs';
import { sameOperatorControlSession, verifyRecoveryHostProcesses } from './production-modern-schema-operator-recovery.mjs';
import { inspectModernSchemaContainer, MODERN_SCHEMA_EXECUTOR_SQL,
  classifyModernSchemaDatabaseExecutors } from './production-modern-schema-executors.mjs';
import { assertModernSchemaBusinessUnchanged, captureModernSchemaDefaultOff, captureModernSchemaFacts,
  defaultOffEvidenceFromFacts } from './production-modern-schema-facts.mjs';
import { captureModernSchemaLedger } from './production-modern-schema-schema-result.mjs';
import { captureModernSchemaCatalog } from './production-modern-schema-catalog.mjs';

const originalOwner = '44917766283-1';
const targetSha = 'eaeec067bbc5f0e9c70cefc50b665d988d55b153';
const ownerShape = /^[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$/;
const shaShape = /^[a-f0-9]{40}$/;
const pendingName = 'schema-release-pending.json';
const controlName = 'background-control.json';
const generationName = 'background-generation.json';
const orderedDigest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const demand = (value, code) => { if (!value) throw Error('FORWARD_API_RECOVERY_HOLD=' + code); };
const snapshot = file => {
  const result = fs.lstatSync(file);
  assertRegularFile(result);
  return [result.dev, result.ino, result.ctimeMs, result.mtimeMs, result.size];
};
const execute = (binary, args) => execFileSync(binary, args, {
  env: executionEnv(), encoding: 'utf8', timeout: 10000, maxBuffer: 65536, stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export function forwardApiRecoveryAllowed(owner, target, recoveryOwner, executionSha) {
  return owner === originalOwner && target === targetSha && ownerShape.test(recoveryOwner ?? '') &&
    recoveryOwner !== owner && shaShape.test(executionSha ?? '') && executionSha !== target;
}

function requireOriginalFencedRecord(typed, fenced, binding) {
  assertSameBinding(typed, binding);
  demand(typed.phase === 'FENCED' && fenced.phase === 'FENCED' && typed.owner === originalOwner &&
    fenced.owner === originalOwner && fenced.targetSha === targetSha && typed.generation === fenced.generation &&
    typed.manifestDigest === orderedDigest(fenced), 'ORIGINAL_BACKGROUND_FENCE_REQUIRED');
}

function openRecords(typed, fenced, participant, updatedAt) {
  const manifest = validateManifest({protocolVersion: 1, phase: 'OPEN', owner: originalOwner,
    generation: fenced.generation + 1, targetSha, participants: [participant]});
  const {purpose, schemaRelease, holdReason, ...binding} = typed;
  demand(!binding.cutover, 'ORDINARY_BINDING_REQUIRED');
  return {manifest, ordinary: {...validateBinding(binding), protocolVersion: 1, phase: 'OPEN',
    generation: manifest.generation, manifestDigest: orderedDigest(manifest), updatedAt}};
}

export function assertForwardApiPublicationState({current, projection, high, ordinary, manifest, typed, fenced, ingressCount}) {
  demand(high.generation === fenced.generation || high.generation === manifest.generation, 'GENERATION_CHANGED');
  if (same(projection, fenced)) {
    demand((same(current, typed) || same(current, ordinary)) && ingressCount === 2, 'UNPUBLISHED_DENIAL_CHANGED');
  } else {
    demand(same(projection, manifest) && same(current, ordinary) && high.generation === manifest.generation &&
      [0, 2].includes(ingressCount), 'COMMITTED_OPEN_CHANGED');
  }
}

export async function recoverModernSchemaForwardApi(env) {
  const owner = env.ORIGINAL_RELEASE_OWNER, recoveryOwner = env.OPERATOR_RECOVERY_OWNER, executionSha = env.MODERN_SCHEMA_EXECUTION_SHA;
  demand(forwardApiRecoveryAllowed(owner, env.TARGET_SHA, recoveryOwner, executionSha) && !env.OPERATOR_COMMITTED_OWNER,
    'EXACT_FORWARD_RECOVERY_REQUIRED');
  const root = CONTRACT.repository, store = new ModernSchemaRegistry(), runtime = new ModernSchemaPrivateRuntime();
  const source = verifyModernSchemaStage({owner: recoveryOwner, targetSha: executionSha});
  const key = kind => 'schema-release-forward-api-' + kind + '-' + owner + '.json';
  const deploymentName = 'deploy-' + owner + '.json';
  const prepared = store.read('schema-release-preparation-' + owner + '.json');
  const {context, preparationSha256} = prepared;
  demand(context.owner === owner && context.targetSha === targetSha && same(
    verifyModernSchemaStage({owner, targetSha}, {stageDirectory: path.join(store.directory, 'modern-schema-stage-' + owner)}),
    prepared.stagedSource), 'EXACT_HISTORICAL_SOURCE_REQUIRED');
  requireCleanMain(root, targetSha);
  const previous = store.exists(key('intent')) ? store.read(key('intent')) : null;
  const pendingExists = store.exists(pendingName);
  const pendingPin = pendingExists ? snapshot(store.file(pendingName)) : null;
  const pending = pendingExists ? store.read(pendingName) : previous?.pending;
  demand(pending && (pendingExists || store.exists(key('terminal'))) && context.pendingMigrations.length === 20, 'EXACT_PENDING_REQUIRED');
  const oldClosed = store.read('schema-release-session-closed-' + owner + '.json');
  const held = store.read('recovery-modern-schema-' + owner + '.json');
  const installed = store.read('schema-release-ingress-installed-' + owner + '.json');
  const firstHold = store.read('schema-release-supervisor-first-hold-' + owner + '.json');
  const evidence = readHeldModernSchemaApiBody({store, context, preparationSha256, prepared, pending});
  const {binding, before, bundle, bodyReceipt, backupReceipt, schemaReceiptSha256} = evidence;
  demand(firstHold.pendingPhase === 'API_BODY' && firstHold.failure?.source === 'SUPERVISOR' &&
    firstHold.failure.code === 'UNCLASSIFIED' && firstHold.failure.stage === 'DDL_AND_AFTER' &&
    held.phase === 'API_BODY' && held.disposition === 'FORWARD_API_VERIFICATION_REQUIRED' &&
    held.backgroundAdmissionCommitted === false && held.nativeLedger?.sha256 === bundle.afterLedgerSha256 &&
    held.nativeSchema?.status === 'OBSERVED' && oldClosed.outcome === 'ORIGINAL_SESSION_ABSENT' &&
    oldClosed.transportClosed === true && oldClosed.originalLeaseSha256 === canonicalDigest(pending.lease) &&
    installed.owner === owner && installed.contextDigest === canonicalDigest(context) &&
    installed.scopeSha256 === context.ingressScopeSha256, 'HELD_NATIVE_EVIDENCE_CHANGED');
  const deployment = store.read(deploymentName);
  const floor = store.read('floor.json');
  const active = store.read('active.json');
  demand(deployment.outcome === 'SUCCESS' && deployment.deployMode === 'api' && deployment.target === targetSha &&
    deployment.active?.api?.imageId === context.candidateImageId && same([...deployment.migrationPaths].sort(), context.changedMigrationPaths) &&
    same(active.active, deployment.active) && floor.floorSha === targetSha, 'EXACT_API_TRANSACTION_REQUIRED');

  const typed = previous?.typed ?? store.read(controlName);
  const fenced = previous?.fenced ?? readPublicManifest();
  requireOriginalFencedRecord(typed, fenced, binding);
  const supervisor = readLinuxProcessIdentity(process.pid);
  const deadline = Date.now() + 30 * 60 * 1000;
  const guard = () => {
    store.guard();
    demand(Date.now() < deadline && same(readLinuxProcessIdentity(process.pid), supervisor) &&
      !fs.lstatSync('/proc/' + pending.supervisor.pid, {throwIfNoEntry: false}) &&
      (pendingExists ? store.exists(pendingName) && same(snapshot(store.file(pendingName)), pendingPin) &&
        same(store.read(pendingName), pending) : !store.exists(pendingName)) &&
      ['transaction.json', 'policy-transition.json', 'cutover-pending.json', 'schema-release-revoked-' + owner + '.json',
        'schema-release-open-commit-intent-' + owner + '.json', 'schema-release-terminal-' + owner + '.json'].every(name => !store.exists(name)) &&
      same(store.read(deploymentName), deployment) && same(store.read('floor.json'), floor) &&
      same(store.read('active.json'), active), 'FORWARD_SOURCE_CHANGED');
  };
  guard();
  let closing = false;
  const session = new ModernSchemaControlSession({}, {isClosing: () => closing});
  const reader = new ModernSchemaReadClient();
  try {
    await session.start();
    demand(await session.tryLock(1) === true && await session.tryLock(2) === true, 'NEW_DUAL_LEASE_REQUIRED');
    const lease = await pinOriginalModernSchemaSession(session, context);
    demand(same(lease.database, pending.lease.database) && !same(lease, pending.lease), 'FRESH_NATIVE_LEASE_REQUIRED');
    const admit = () => verifyOriginalModernSchemaAdmission({session, lease, observeHost: guard});
    await reader.start();
    const observeAbsent = async oldLease => {
      const {rows: [observed]} = await reader.query(modernSchemaOriginalSessionExitSql(oldLease));
      demand(observed.primary === true && observed.databaseOid === oldLease.database.databaseOid &&
        observed.systemIdentifier === oldLease.database.systemIdentifier &&
        observed.postmasterStartMicros === oldLease.database.postmasterStartMicros &&
        observed.originalSessionPresent === false, 'HISTORICAL_SESSION_NOT_PROVED_ABSENT');
    };
    await observeAbsent(pending.lease);
    if (previous) await observeAbsent(previous.lease);
    const ingress = new ModernSchemaIngress({context, scope: prepared.ingressScope, privateRuntime: runtime, admit});
    demand(same(ingress.host, installed.host), 'ORIGINAL_INGRESS_HOST_CHANGED');
    const fence = () => {
      demand(ingress.names().length === 2 && canonicalDigest(ingressIdentity(ingress.tables())) === installed.identitySha256,
        'ORIGINAL_NATIVE_FENCE_CHANGED');
    };
    const ids = inventoryApiContainers(prepared.floor.project);
    demand(ids.length === 1, 'SINGLE_API_CANDIDATE_REQUIRED');
    const [id] = ids;
    const getBoot = "fetch('http://127.0.0.1:3100/api/internal/background/status',{signal:AbortSignal.timeout(3000)}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(x=>process.stdout.write(x.bootId)).catch(()=>process.exit(3))";
    const participant = {containerId: id, revision: targetSha,
      bootId: execute('/usr/bin/docker', ['exec', id, 'node', '-e', getBoot]), allowedKinds: [...HOLD_KINDS]};
    const {api: oldApi, web, db} = prepared.originalSnapshot.containers;
    demand(id !== oldApi.id && verifyCompletedDeployment(binding, [participant]) === true, 'FORMAL_CANDIDATE_REQUIRED');
    const observeApi = async (manifest, previousStatus = null) => {
      const actual = inspectApiParticipant(participant, prepared.floor.project);
      const status = verifyParticipantStatus(actual, participant, manifest);
      demand(actual.imageId === context.candidateImageId && status.inFlight === 0 && status.taskGraphs === 0 &&
        status.pendingChildren === 0 && (!previousStatus || sameOperatorControlSession(status.controlSession, previousStatus)) &&
        await session.verifyParticipants([{...status.controlSession, bootId: participant.bootId}]) === true &&
        same(inventoryApiContainers(prepared.floor.project), [id]), 'CANDIDATE_NOT_QUIESCENT');
      return actual;
    };
    const host = () => verifyRecoveryHostProcesses({...prepared,
      originalSnapshot: {containers: {api: {id}, web, db}}}, undefined,
    [pinModernSchemaChild(session.child), pinModernSchemaChild(reader.child)]);
    const executors = async actual => {
      const candidate = inspectModernSchemaContainer(id);
      const [network] = Object.values(candidate.networks);
      demand(Object.keys(candidate.networks).length === 1 && network.NetworkID === prepared.ingressScope.networkId &&
        candidate.imageId === actual.imageId && candidate.state.StartedAt === actual.startedAt && candidate.restarts === actual.restartCount,
      'CANDIDATE_NETWORK_IDENTITY_CHANGED');
      const control = actual.status.controlSession;
      const applicationName = 'phoenix-fence:' + participant.bootId;
      for (let attempt = 0; attempt < 3; attempt++) {
        const {rows: [{observation}]} = await reader.query(MODERN_SCHEMA_EXECUTOR_SQL);
        const native = JSON.parse(observation);
        const observed = classifyModernSchemaDatabaseExecutors(native, {runtimeAddress: network.IPAddress, originalLease: lease, oldRuntimeStopped: true,
          candidate: {address: network.IPAddress, containerId: id, imageId: candidate.imageId,
            nativePinSha256: canonicalDigest({id, image: candidate.imageId, startedAt: actual.startedAt}), phase: 'API_BODY'}});
        const controls = native.sessions.filter(row => row.applicationName === applicationName);
        const [apiControl] = controls;
        demand(control.applicationName === applicationName && controls.length === 1 && apiControl.pid === control.sessionPid &&
          apiControl.databaseOid === control.databaseOid && apiControl.clientAddress === network.IPAddress &&
          BigInt(apiControl.backendStartMicros) / 1000n === BigInt(Date.parse(control.backendStartedAt)) &&
          observed.runtimeSessionPids.includes(control.sessionPid), 'NATIVE_CANDIDATE_CONTROL_UNPROVED');
        const activeSessions = native.sessions.filter(row => row.openTransaction !== false);
        if (!activeSessions.length) return observed;
        demand(activeSessions.length === 1 && activeSessions[0] === apiControl && apiControl.openTransaction === true,
          'UNEXPECTED_NATIVE_OPEN_TRANSACTION');
        if (attempt < 2) await pause(40);
      }
      demand(false, 'NATIVE_CANDIDATE_SESSIONS_NOT_QUIESCENT');
    };

    const checkLedger = async () => {
      demand((await captureModernSchemaLedger(reader)).sha256 === bundle.afterLedgerSha256, 'POST_SCHEMA_LEDGER_CHANGED');
      const off = await captureModernSchemaDefaultOff(reader, targetSha);
      const expected = bundle.defaultOffEvidence.observedTables.map(row => row.table).sort();
      demand(off.targetSha === targetSha && off.readOnly === true && off.verified === true && off.featureRollout === 'OFF' &&
        off.chanjetPolicy === 'HOLD' && same(off.observedTables.map(row => row.table).sort(), expected) &&
        off.observedTables.every(row => row.rows === '0'), 'LIVE_DEFAULT_OFF_CHANGED');
      return off;
    };

    const captureCatalog = async () => {
      const historicalCatalog = store.read('schema-release-hold-observation-schema-' + owner + '.json');
      demand(held.nativeSchema.sha256 === canonicalDigest(historicalCatalog) && historicalCatalog.owner === owner &&
        historicalCatalog.readOnly === true && same(historicalCatalog.databasePin, db) &&
        same(await runtime.digest(historicalCatalog.raw.path), historicalCatalog.raw), 'HELD_CATALOG_CHANGED');
      const directory = runtime.createDirectory(recoveryOwner, 'recovery');
      const {receipt: catalog} = await captureModernSchemaCatalog({owner: recoveryOwner, stage: 'recovery-after',
        databasePin: db, privateRuntime: runtime, directory, admit});
      demand(catalog.schemaSha256 === historicalCatalog.schemaSha256, 'POST_SCHEMA_CATALOG_CHANGED');
      return {directory, catalog};
    };

    let intent = previous;
    const remove = {nftables: ['bridge', 'inet'].map(family => ({delete: {table: {family, name: ingress.compiled.table}}}))};
    const removeFile = store.file(key('remove-program'));
    await ingress.check('FORWARD_API_ADOPT');
    if (!intent) {
      demand(same(store.read(controlName), typed) && same(readPublicManifest(), fenced) &&
        store.read(generationName).generation === fenced.generation, 'INITIAL_DENIAL_CHANGED');
      fence();
      const actual = await observeApi(fenced);
      const hostBefore = host();
      await executors(actual);
      for (const artifact of [bodyReceipt.stdout, bodyReceipt.stderr, backupReceipt.backup]) {
        demand(same(await runtime.digest(artifact.path), artifact), 'PROTECTED_ARTIFACT_BYTES_CHANGED');
      }
      const {directory, catalog} = await captureCatalog();
      const facts = await captureModernSchemaFacts(reader, {projection: before});
      assertModernSchemaBusinessUnchanged(before, facts);
      demand(same(defaultOffEvidenceFromFacts(targetSha, facts, {floor}), bundle.defaultOffEvidence), 'DATABASE_FACTS_CHANGED');
      const off = await checkLedger();
      await admit();
      fence();
      demand(same(store.read(controlName), typed) && same(readPublicManifest(), fenced) &&
        verifyCompletedDeployment(binding, [participant]) === true && host() === hostBefore, 'FINAL_FENCED_PROOF_CHANGED');
      const fresh = await observeApi(fenced, actual.status.controlSession);
      demand(fresh.startedAt === actual.startedAt && fresh.restartCount === actual.restartCount, 'FENCED_BOOT_CHANGED');
      const native = await executors(fresh);
      runtime.publishJson(path.join(directory, 'pre-open-facts.json'), facts);
      runtime.publishJson(path.join(directory, 'pre-open-off.json'), off);
      if (!store.exists(key('remove-program'))) runtime.publishJson(removeFile, remove);
      ingress.assertProgram(removeFile, remove);
      const open = openRecords(typed, fenced, participant, new Date().toISOString());
      intent = {schema: 'phoenix.modern-forward-api-intent/v1', owner, targetSha, recoveryOwner, source, pending, typed, fenced, ...open,
        lease, participant, startedAt: fresh.startedAt, restartCount: fresh.restartCount, controlSession: fresh.status.controlSession,
        pendingSha256: canonicalDigest(pending), schemaReceiptSha256, formalDeploymentSha256: canonicalDigest(deployment),
        bodyReceiptSha256: canonicalDigest(bodyReceipt), afterLedgerSha256: bundle.afterLedgerSha256,
        factsSha256: canonicalDigest(facts), offSha256: canonicalDigest(off), catalogSha256: canonicalDigest(catalog),
        hostSha256: hostBefore, nativeSha256: native.observationSha256, nativeFenceSha256: installed.identitySha256,
        removeProgramSha256: canonicalDigest(remove), migrationAuthorized: false, defaultOff: true};
      store.immutable(key('intent'), intent);
    }

    const assertIntent = () => {
      demand(same(store.read(key('intent')), intent) && intent.schema === 'phoenix.modern-forward-api-intent/v1' &&
        intent.owner === owner && intent.targetSha === targetSha && intent.pendingSha256 === canonicalDigest(pending) &&
        same(intent.pending, pending) && same(intent.participant, participant) &&
        intent.schemaReceiptSha256 === schemaReceiptSha256 && intent.formalDeploymentSha256 === canonicalDigest(deployment) &&
        intent.bodyReceiptSha256 === canonicalDigest(bodyReceipt) && intent.afterLedgerSha256 === bundle.afterLedgerSha256 &&
        intent.nativeFenceSha256 === installed.identitySha256 && intent.removeProgramSha256 === canonicalDigest(remove) &&
        intent.migrationAuthorized === false && intent.defaultOff === true && same(intent.lease.database, lease.database) &&
        same(openRecords(typed, fenced, participant, intent.ordinary.updatedAt),
          {ordinary: intent.ordinary, manifest: intent.manifest}), 'FORWARD_INTENT_CHANGED');
      ingress.assertProgram(removeFile, remove);
    };
    assertIntent();
    const readArtifact = file => JSON.parse(readPinnedFile(file, {contract: CONTRACT}));
    const artifactDirectory = path.join(store.directory, 'schema-release-recovery-' + intent.recoveryOwner);
    const recordedFacts = readArtifact(path.join(artifactDirectory, 'pre-open-facts.json'));
    const recordedOff = readArtifact(path.join(artifactDirectory, 'pre-open-off.json'));
    const recordedCatalog = store.read('schema-release-recovery-after-schema-' + intent.recoveryOwner + '.json');
    demand(canonicalDigest(recordedFacts) === intent.factsSha256 && canonicalDigest(recordedOff) === intent.offSha256 &&
      canonicalDigest(recordedCatalog) === intent.catalogSha256 && recordedCatalog.readOnly === true &&
      recordedCatalog.owner === intent.recoveryOwner && same(recordedCatalog.databasePin, db), 'FORWARD_VERIFICATION_ARTIFACT_CHANGED');
    assertModernSchemaBusinessUnchanged(before, recordedFacts);
    demand(same(defaultOffEvidenceFromFacts(targetSha, recordedFacts, {floor}), bundle.defaultOffEvidence),
      'FORWARD_VERIFIED_DEFAULT_OFF_CHANGED');
    const {ordinary, manifest} = intent;
    const publicationState = () => assertForwardApiPublicationState({current: store.read(controlName), projection: readPublicManifest(),
      high: store.read(generationName), ordinary, manifest, typed, fenced, ingressCount: ingress.names().length});
    publicationState();
    if (same(readPublicManifest(), fenced)) {
      fence();
      if (previous) {
        await captureCatalog();
        const facts = await captureModernSchemaFacts(reader, {projection: before});
        assertModernSchemaBusinessUnchanged(before, facts);
        demand(same(defaultOffEvidenceFromFacts(targetSha, facts, {floor}), bundle.defaultOffEvidence), 'RETRY_DATABASE_FACTS_CHANGED');
      }
      const staged = await observeApi(fenced, intent.controlSession);
      demand(staged.startedAt === intent.startedAt && staged.restartCount === intent.restartCount && host() === intent.hostSha256 &&
        verifyCompletedDeployment(binding, [participant]) === true, 'PRE_OPEN_FATAL_RUNTIME_DRIFT');
      await executors(staged);
      await checkLedger();
      await admit();
      assertIntent();
      publicationState();
      fence();
      atomicState(store.file(generationName), {schema: 'phoenix.background-generation/1',
        generation: manifest.generation, updatedAt: new Date().toISOString()});
      if (!same(store.read(controlName), ordinary)) atomicState(store.file(controlName), ordinary);
      try { atomicPublicManifest(PUBLIC_DIRECTORY, manifest); } catch { /* Reobserve possible rename. */ }
    }
    const observedOpen = () => same(store.read(controlName), ordinary) && same(readPublicManifest(), manifest) &&
      store.read(generationName).generation === manifest.generation ? manifest : null;
    demand(confirmModernSchemaPublicDurability(observedOpen, guard)?.durabilityConfirmed === true, 'DURABLE_TARGET_OPEN_REQUIRED');
    let actual;
    const ready = Date.now() + 30000;
    do {
      await admit();
      const inspected = inspectApiParticipant(participant, prepared.floor.project);
      if (inspected.status.phase === 'OPEN' && inspected.status.generation === manifest.generation) {
        actual = await observeApi(manifest, intent.controlSession);
        break;
      }
      await pause(250);
    } while (Date.now() < ready);
    demand(actual && actual.startedAt === intent.startedAt && actual.restartCount === intent.restartCount &&
      verifyCompletedDeployment(binding, [participant]) === true && host() === intent.hostSha256, 'LIVE_TARGET_OPEN_REQUIRED');
    await executors(actual);
    await checkLedger();
    await ingress.check('FORWARD_API_RELEASE_NATIVE');
    assertIntent();
    publicationState();
    if (ingress.names().length) {
      fence();
      try { execute('/usr/sbin/nft', ['--json', '--file', removeFile]); } catch { /* Verify actual effect. */ }
    }
    demand(ingress.names().length === 0 && observedOpen(), 'NATIVE_INGRESS_RELEASE_UNRESOLVED');
    const exit = await closeModernSchemaOriginalSession({
      coordinator: {close: () => {closing = true; return session.close();}}, lease, client: reader, guard,
    });
    demand(exit.outcome === 'ORIGINAL_SESSION_ABSENT' && exit.transportClosed === true && observedOpen() &&
      ingress.names().length === 0, 'FORWARD_SESSION_EXIT_REQUIRED');
    const finalized = {schema: 'phoenix.modern-forward-api-terminal/v1', owner, targetSha,
      intentSha256: canonicalDigest(intent), recoveryOwner: intent.recoveryOwner, defaultOff: true, outcome: 'SUCCESS',
      schemaReceiptSha256, formalDeploymentSha256: canonicalDigest(deployment), afterLedgerSha256: bundle.afterLedgerSha256,
      ordinaryControlSha256: canonicalDigest(ordinary), publicManifestSha256: canonicalDigest(manifest)};
    const leaseKey = who => 'schema-release-forward-api-lease-closed-' + who + '.json';
    const leaseExit = {...exit, owner, targetSha, recoveryOwner, intentSha256: canonicalDigest(intent)};
    store.immutable(leaseKey(recoveryOwner), leaseExit);
    if (!store.exists(key('terminal'))) {
      store.immutable(key('terminal'), {...finalized, completionOwner: recoveryOwner, leaseExitSha256: canonicalDigest(leaseExit)});
    }
    const {completionOwner, leaseExitSha256, ...terminal} = store.read(key('terminal'));
    demand(ownerShape.test(completionOwner ?? '') && same(terminal, finalized), 'FORWARD_TERMINAL_CHANGED');
    const finalExit = store.read(leaseKey(completionOwner));
    demand(finalExit.owner === owner && finalExit.targetSha === targetSha && finalExit.recoveryOwner === completionOwner &&
      finalExit.intentSha256 === finalized.intentSha256 && finalExit.outcome === 'ORIGINAL_SESSION_ABSENT' &&
      finalExit.transportClosed === true && leaseExitSha256 === canonicalDigest(finalExit), 'FORWARD_TERMINAL_EXIT_CHANGED');
    guard();
    if (pendingExists) fs.unlinkSync(store.file(pendingName));
    runtime.syncDirectory(store.directory);
    demand(!store.exists(pendingName) && observedOpen() && ingress.names().length === 0, 'FORWARD_PENDING_CLEANUP_REQUIRED');
    return 'TARGET_OPEN';
  } finally {
    try { await reader.close(); } finally {closing = true; await session.close();}
  }
}
