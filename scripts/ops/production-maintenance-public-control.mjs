/** Legacy-only public bootstrap bridge. No CLI, OPEN transition or default verifier.
 * Empty FENCED is intentionally rejected by the ordinary modern publisher. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { CONTRACT, verifyContext } from './production-config-guard.mjs';
import { assertSameDirectory } from './production-trusted-paths.mjs';
import { PUBLIC_DIRECTORY, HOLD_KINDS, initializePublicProjection, inspectPublicDirectory, validateManifest, validateParticipants, atomicPublicManifest, readPublicManifest } from './background-control-manifest.mjs';
import { MaintenanceReceiptStore, bindingDigest, canonicalDigest, createMaintenanceEvidence, same, SHA, HASH, iso, hold } from './production-maintenance-receipts.mjs';
import { LegacyMaintenanceTransition } from './production-maintenance-transition.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const identity = s => [s.dev, s.ino, s.size, s.mtimeMs, s.ctimeMs];
const exists = (file, io = fs) => { try { io.lstatSync(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
export function validateLegacyFencedProjection(m) {
  if (!m || m.protocolVersion !== 1 || m.phase !== 'FENCED' || !/^\d+-\d+$/.test(m.owner || '')
    || m.generation !== 1 || !SHA.test(m.targetSha) || !Array.isArray(m.participants) || m.participants.length !== 0
    || !same(Object.keys(m).sort(), ['protocolVersion', 'phase', 'owner', 'generation', 'targetSha', 'participants'].sort())) hold('LEGACY_EMPTY_FENCE_REQUIRED');
  return m;
}
function regular(s, uid) {
  if (!s.isFile() || s.isSymbolicLink() || s.uid !== uid || (s.mode & 0o7777) !== 0o444 || s.nlink !== 1 || s.size > 65536) hold('PUBLIC_FILE_UNTRUSTED');
}
/** Same NOFOLLOW, inode-pinned, fsync+rename and directory reinspection rules as
 * atomicPublicManifest; specialization permits ONLY the legacy empty deny. */
function atomicLegacyFencedProjection(directory, manifest, dependencies = {}) {
  validateLegacyFencedProjection(manifest);
  const io = dependencies.fs || fs; const inspect = dependencies.inspect || inspectPublicDirectory;
  const uid = dependencies.expectedUid ?? 0; const failure = dependencies.failurePoint || (() => {});
  const before = inspect(directory); const destination = path.join(directory, 'manifest.json');
  if (exists(destination, io)) hold('PUBLIC_BOOTSTRAP_ALREADY_EXISTS');
  const temporary = path.join(directory, `.manifest-legacy-${randomUUID()}.tmp`); let fd;
  try {
    fd = io.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW, 0o444);
    io.fchmodSync(fd, 0o444); io.writeFileSync(fd, JSON.stringify(manifest) + '\n'); io.fsyncSync(fd);
    const written = io.fstatSync(fd); regular(written, uid); io.closeSync(fd); fd = undefined;
    failure('AFTER_TEMP_FSYNC'); assertSameDirectory(before, inspect(directory));
    if (exists(destination, io)) hold('PUBLIC_DESTINATION_CHANGED');
    const named = io.lstatSync(temporary); regular(named, uid);
    if (!same(identity(named), identity(written))) hold('PUBLIC_TEMPORARY_CHANGED');
    io.renameSync(temporary, destination); failure('AFTER_PUBLIC_RENAME');
    const directoryFd = io.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    try { io.fsyncSync(directoryFd); } finally { io.closeSync(directoryFd); }
    assertSameDirectory(before, inspect(directory));
  } finally { if (fd !== undefined) io.closeSync(fd); }
  // Failed temporaries are deliberately retained for root reconciliation.
}
function readLegacyProjection(directory, inspect, uid = 0) {
  const before = inspect(directory); const file = path.join(directory, 'manifest.json');
  const named = fs.lstatSync(file); regular(named, uid);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const opened = fs.fstatSync(fd); regular(opened, uid);
    if (!same(identity(named), identity(opened))) hold('PUBLIC_FILE_CHANGED');
    const manifest = validateLegacyFencedProjection(JSON.parse(fs.readFileSync(fd, 'utf8')));
    const after = fs.fstatSync(fd); const current = fs.lstatSync(file); regular(after, uid); regular(current, uid);
    if (!same(identity(opened), identity(after)) || !same(identity(after), identity(current))) hold('PUBLIC_FILE_CHANGED');
    assertSameDirectory(before, inspect(directory)); return manifest;
  } finally { fs.closeSync(fd); }
}

export class LegacyMaintenancePublicControl {
  constructor({ context }, dependencies = {}) {
    this.context = structuredClone(context); this.contextDigest = bindingDigest(context);
    this.store = dependencies.store || new MaintenanceReceiptStore(context);
    this.directory = dependencies.publicDirectory || PUBLIC_DIRECTORY;
    this.guard = dependencies.guard || (() => verifyContext(CONTRACT.repository, CONTRACT.stateDirectory));
    this.inspect = dependencies.inspect || inspectPublicDirectory;
    this.initialize = dependencies.initialize || initializePublicProjection;
    this.now = dependencies.now || Date.now;
    this.failure = dependencies.failurePoint || (() => {});
    this.protocol = new LegacyMaintenanceTransition({ context }, { store: this.store, now: this.now,
      verifyAuthority: dependencies.verifyAuthority, verifyEvidence: dependencies.verifyEvidence });
    this.verifyCandidateBinding = dependencies.verifyCandidateBinding || (async () => false);
    this.privateFile = path.join(this.store.directory, 'maintenance-public-control.json');
    this.modernPrivate = path.join(this.store.directory, 'background-control.json');
    this.writeModernPrivate = dependencies.writeModernPrivate || (record => this.store.immutable(this.modernPrivate, record));
    this.writeModernPublic = dependencies.writeModernPublic || (value => atomicPublicManifest(this.directory, value, this.inspect));
    this.readModernPublic = dependencies.readModernPublic || (() => readPublicManifest(this.directory, this.inspect));
    this.atomicDependencies = dependencies.atomicDependencies || {};
    this.expectedUid = dependencies.expectedUid ?? 0;
  }
  state(phase, operation, expectedDigest) {
    this.guard(); this.protocol.checkWindow(); this.store.assertCurrent();
    const state = this.store.readState();
    if (!state || state.contextDigest !== this.contextDigest || !same(state.context, this.context) || state.phase !== phase
      || state.status !== 'FENCED' || state.legacyDrainResult !== 'UNSUPPORTED' || (expectedDigest && state.stateDigest !== expectedDigest)) hold('PUBLIC_CONTROL_STATE_MISMATCH');
    this.store.assertOwnedIntent(operation, phase, state.stateDigest);
    return state;
  }
  absentModern() { if (exists(this.modernPrivate)) hold('EXISTING_MODERN_BACKGROUND_OWNER'); }
  async bootstrap() {
    const state = this.state('LEGACY_RECONCILED', 'PREPARE_PROMOTION');
    await this.protocol.authorityStillValid(state);
    await this.protocol.evidence(this.protocol.receipt(state, 'RECONCILIATION'), 'RECONCILIATION');
    this.state('LEGACY_RECONCILED', 'PREPARE_PROMOTION', state.stateDigest);
    this.absentModern(); if (exists(this.privateFile)) hold('LEGACY_PUBLIC_BOOTSTRAP_ALREADY_STARTED');
    if (exists(path.join(this.directory, 'manifest.json'))) hold('EXISTING_PUBLIC_BACKGROUND_OWNER');
    const manifest = validateLegacyFencedProjection({ protocolVersion: 1, phase: 'FENCED', owner: this.context.owner,
      generation: 1, targetSha: this.context.targetSha, participants: [] });
    const record = { schema: 'phoenix.legacy-public-control/v1', contextDigest: this.contextDigest, owner: this.context.owner,
      previousFloorSha: this.context.previousFloorSha, targetSha: this.context.targetSha, stateDigest: state.stateDigest,
      phase: 'PUBLISHING_LEGACY_FENCE', manifestDigest: digest(manifest), generation: 1, capturedAt: new Date(this.now()).toISOString() };
    this.store.immutable(this.privateFile, record); this.failure('AFTER_PRIVATE_BOOTSTRAP_INTENT');
    this.state('LEGACY_RECONCILED', 'PREPARE_PROMOTION', state.stateDigest); this.absentModern();
    this.initialize(); this.failure('AFTER_PUBLIC_DIRECTORY_INIT'); this.inspect(this.directory);
    atomicLegacyFencedProjection(this.directory, manifest, { ...this.atomicDependencies, inspect: this.inspect, expectedUid: this.expectedUid });
    this.failure('AFTER_PUBLIC_BOOTSTRAP');
    const actual = readLegacyProjection(this.directory, this.inspect, this.expectedUid);
    if (!same(actual, manifest) || !same(this.store.read(this.privateFile), record)) hold('BOOTSTRAP_PERSISTED_BINDING_CHANGED');
    return createMaintenanceEvidence('LEGACY_PUBLIC_FENCED', this.context, { owner: this.context.owner, phase: 'FENCED', participants: [],
      generation: 1, legacyDrainResult: 'UNSUPPORTED', privateRecordSha256: canonicalDigest(record), publicManifestSha256: digest(actual) }, { capturedAt: new Date(this.now()).toISOString() });
  }
  /** Read the already-published legacy deny. This never bootstraps a manifest,
   * mints a trusted envelope, installs producers or proves continuous fencing.
   * Callers must retain their bounded owned read lifecycle across verifiers. */
  async observeEmptyFence({ expectedStateDigest, bootstrapEvidence } = {}) {
    if (!HASH.test(expectedStateDigest || '')) hold('PUBLIC_OBSERVATION_STATE_DIGEST_REQUIRED');
    const state = this.state('PROMOTION_PREPARED', 'REPLACE_CANDIDATE', expectedStateDigest);
    if (!iso(state.updatedAt) || Date.parse(state.updatedAt) < Date.parse(this.context.window.start)
      || Date.parse(state.updatedAt) > this.now()) hold('PUBLIC_OBSERVATION_STATE_TIME');
    const bootstrap = structuredClone(bootstrapEvidence), bootstrapDigest = canonicalDigest(bootstrap);
    await this.protocol.authorityStillValid(state);
    const proof = await this.protocol.evidence(bootstrap, 'LEGACY_PUBLIC_FENCED');
    if (canonicalDigest(bootstrap) !== bootstrapDigest) hold('PUBLIC_OBSERVATION_BOOTSTRAP_CHANGED');
    this.state('PROMOTION_PREPARED', 'REPLACE_CANDIDATE', expectedStateDigest);
    if (!proof || proof.owner !== this.context.owner || proof.phase !== 'FENCED' || proof.generation !== 1
      || !Array.isArray(proof.participants) || proof.participants.length !== 0 || proof.legacyDrainResult !== 'UNSUPPORTED'
      || !HASH.test(proof.privateRecordSha256 || '') || !HASH.test(proof.publicManifestSha256 || '')) hold('PUBLIC_OBSERVATION_BOOTSTRAP_BINDING');
    this.absentModern();
    const record = this.store.read(this.privateFile);
    const manifest = readLegacyProjection(this.directory, this.inspect, this.expectedUid);
    if (!same(Object.keys(record).sort(), ['schema', 'contextDigest', 'owner', 'previousFloorSha', 'targetSha', 'stateDigest', 'phase', 'manifestDigest', 'generation', 'capturedAt'].sort())
      || record.schema !== 'phoenix.legacy-public-control/v1' || record.contextDigest !== this.contextDigest
      || record.owner !== this.context.owner || record.previousFloorSha !== this.context.previousFloorSha
      || record.targetSha !== this.context.targetSha || record.phase !== 'PUBLISHING_LEGACY_FENCE' || record.generation !== 1
      || !HASH.test(record.stateDigest || '') || !iso(record.capturedAt)
      || Date.parse(record.capturedAt) < Date.parse(this.context.window.start) || Date.parse(record.capturedAt) > Date.parse(state.updatedAt)
      || manifest.owner !== this.context.owner || manifest.targetSha !== this.context.targetSha
      || record.manifestDigest !== digest(manifest) || proof.privateRecordSha256 !== canonicalDigest(record)
      || proof.publicManifestSha256 !== digest(manifest)) hold('PUBLIC_OBSERVATION_PERSISTED_BINDING');
    this.state('PROMOTION_PREPARED', 'REPLACE_CANDIDATE', expectedStateDigest); this.absentModern();
    if (!same(this.store.read(this.privateFile), record) || !same(readLegacyProjection(this.directory, this.inspect, this.expectedUid), manifest)) hold('PUBLIC_OBSERVATION_CHANGED');
    this.state('PROMOTION_PREPARED', 'REPLACE_CANDIDATE', expectedStateDigest);
    return { schema: 'phoenix.legacy-empty-fence-observation/v1', result: 'OBSERVATION_ONLY',
      contextDigest: this.contextDigest, stateDigest: expectedStateDigest, owner: this.context.owner, targetSha: this.context.targetSha,
      phase: 'FENCED', generation: 1, participants: [], bootstrapEvidenceSha256: bootstrap.evidenceSha256,
      privateRecordSha256: canonicalDigest(record), publicManifestSha256: digest(manifest), capturedAt: new Date(this.now()).toISOString(),
      legacyDrainResult: 'UNSUPPORTED', continuousDrainProof: false, admissionOrApprovalGranted: false, registryInstalled: false };
  }
  /** Bridge only after startup DENIED and independently verified root Docker/PG
   * binding. This never grants OPEN or fabricates modern DRAINED evidence. */
  async adoptCandidate({ evidence, participants }) {
    validateParticipants(participants, { targetSha: this.context.targetSha });
    if (participants.length !== 1 || !same([...participants[0].allowedKinds].sort(), [...HOLD_KINDS].sort())) hold('EXACT_API_HOLD_PARTICIPANT_REQUIRED');
    const state = this.state('CANDIDATE_FENCED', 'VERIFY_CANDIDATE');
    await this.protocol.authorityStillValid(state);
    const candidate = await this.protocol.evidence(this.protocol.receipt(state, 'CANDIDATE_FENCED'), 'CANDIDATE_FENCED');
    const binding = await this.protocol.evidence(evidence, 'CANDIDATE_PUBLIC_ADOPTION');
    const p = participants[0];
    if (candidate.owner !== this.context.owner || candidate.admissionState !== 'DENIED' || candidate.inFlight !== 0 || candidate.pendingChildren !== 0 || candidate.taskGraphs !== 0 || candidate.poisoned !== false || candidate.stopping !== false
      || candidate.bootId !== p.bootId || candidate.api?.id !== p.containerId || candidate.api?.revision !== p.revision
      || candidate.api?.imageId !== this.context.candidate.imageId || candidate.chanjetPolicy !== 'HOLD' || candidate.readonlySync !== false || candidate.inboundSync !== false
      || !same(candidate.web, this.context.preSnapshot.web) || !same(candidate.db, this.context.preSnapshot.db)
      || !same(binding.controlSession, candidate.controlSession)
      || !same(binding.api, candidate.api) || binding.bootId !== p.bootId || binding.owner !== this.context.owner
      || binding.admissionState !== 'DENIED' || binding.inFlight !== 0 || binding.pendingChildren !== 0 || binding.taskGraphs !== 0
      || binding.poisoned !== false || binding.stopping !== false || binding.controlSession?.connected !== true || binding.controlSession?.broken !== false
      || !Number.isSafeInteger(binding.controlSession.sessionPid) || binding.controlSession.sessionPid < 1
      || !Number.isSafeInteger(binding.controlSession.databaseOid) || binding.controlSession.databaseOid < 1
      || !iso(binding.controlSession.backendStartedAt) || binding.controlSession.applicationName !== `phoenix-fence:${p.bootId}`
      || binding.rootLocks?.admissionExclusive !== true || binding.rootLocks?.executionExclusive !== true
      || await this.verifyCandidateBinding(evidence, { context: structuredClone(this.context), participants: structuredClone(participants), stateDigest: state.stateDigest }) !== true) hold('CANDIDATE_ROOT_DOCKER_PG_BINDING_REQUIRED');
    this.state('CANDIDATE_FENCED', 'VERIFY_CANDIDATE', state.stateDigest); this.absentModern();
    const bootstrap = this.store.read(this.privateFile);
    const previous = readLegacyProjection(this.directory, this.inspect, this.expectedUid);
    if (bootstrap.schema !== 'phoenix.legacy-public-control/v1' || bootstrap.contextDigest !== this.contextDigest || bootstrap.owner !== this.context.owner
      || bootstrap.targetSha !== this.context.targetSha || bootstrap.manifestDigest !== digest(previous) || previous.owner !== this.context.owner
      || previous.targetSha !== this.context.targetSha) hold('LEGACY_PUBLIC_BINDING_CHANGED');
    const manifest = validateManifest({ protocolVersion: 1, phase: 'FENCED', owner: this.context.owner, generation: previous.generation + 1,
      targetSha: this.context.targetSha, participants: structuredClone(participants) });
    const record = { protocolVersion: 1, owner: this.context.owner, previousFloorSha: this.context.previousFloorSha, targetSha: this.context.targetSha,
      generation: manifest.generation, phase: 'FENCED', manifestDigest: digest(manifest), maintenanceContextDigest: this.contextDigest,
      maintenanceStateDigest: state.stateDigest, adoptionEvidenceSha256: evidence.evidenceSha256, updatedAt: new Date(this.now()).toISOString() };
    this.store.immutable(path.join(this.store.directory, `maintenance-public-adoption-${this.context.owner}.json`), { record, publicManifestSha256: digest(manifest) });
    this.writeModernPrivate(record); this.failure('AFTER_MODERN_PRIVATE_AUTHORITY');
    this.state('CANDIDATE_FENCED', 'VERIFY_CANDIDATE', state.stateDigest);
    if (!same(this.store.read(this.modernPrivate), record)) hold('MODERN_PRIVATE_BINDING_CHANGED');
    // Production uses the existing strict >=1 atomic publisher, never the empty writer.
    await this.writeModernPublic(manifest); this.failure('AFTER_CANDIDATE_PUBLIC_PROJECTION');
    this.state('CANDIDATE_FENCED', 'VERIFY_CANDIDATE', state.stateDigest);
    if (!same(this.readModernPublic(), manifest) || !same(this.store.read(this.modernPrivate), record)) hold('CANDIDATE_PUBLIC_PRIVATE_BINDING_CHANGED');
    return createMaintenanceEvidence('CANDIDATE_PUBLIC_ADOPTED', this.context, { owner: this.context.owner, phase: 'FENCED', bootId: p.bootId,
      generation: manifest.generation, privateRecordSha256: canonicalDigest(record), publicManifestSha256: digest(manifest), legacyDrainResult: 'UNSUPPORTED' }, { capturedAt: new Date(this.now()).toISOString() });
  }
}
