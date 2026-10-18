/** Root-only public projection. Never exposes private floor/config/credentials. */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { CONTRACT, verifyContext, secureJson } from './production-config-guard.mjs';
import { atomicState } from './production-atomic-state.mjs';
import { ancestors, inspectTrustedDirectory, assertSameDirectory, readACLs, parseMountInfo } from './production-trusted-paths.mjs';

export const PUBLIC_DIRECTORY = '/var/lib/phoenix-background-control';
export const KINDS = ['LOCAL', 'EXTERNAL_READ', 'NOTIFICATION', 'CHANJET_AUTH', 'CHANJET_SYNC'];
export const HOLD_KINDS = ['LOCAL', 'EXTERNAL_READ', 'NOTIFICATION'];
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const token = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,160}$/.test(value);
const projectionDigest = manifest => createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
export const fail = reason => { throw new Error(`BACKGROUND_HOLD=${reason}`); };
export function validateBinding(binding) {
  if (!binding || !/^\d+-\d+$/.test(binding.owner) || !sha(binding.previousFloorSha) || !sha(binding.targetSha)) fail('EXACT_RUN_AND_DOUBLE_SHA_REQUIRED');
  return binding;
}
export function validateParticipants(participants, { targetSha, allowChanjet = false } = {}) {
  if (!Array.isArray(participants) || participants.length < 1 || participants.length > 128) fail('PARTICIPANT_INVENTORY_REQUIRED');
  const boots = new Set(); const containers = new Set();
  for (const p of participants) {
    if (!p || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(p.bootId) || !/^[a-f0-9]{64}$/.test(p.containerId) || !sha(p.revision)
      || (targetSha && p.revision !== targetSha) || !Array.isArray(p.allowedKinds) || new Set(p.allowedKinds).size !== p.allowedKinds.length
      || p.allowedKinds.some(k => !(allowChanjet ? KINDS : HOLD_KINDS).includes(k)) || boots.has(p.bootId) || containers.has(p.containerId)) fail('PARTICIPANT_BINDING');
    boots.add(p.bootId); containers.add(p.containerId);
  }
  return participants;
}
export function validateManifest(m) {
  if (!m || m.protocolVersion !== 1 || !['OPEN', 'FENCED', 'CODE_HOLD'].includes(m.phase) || !token(m.owner)
    || !Number.isSafeInteger(m.generation) || m.generation < 1 || !sha(m.targetSha)) fail('MANIFEST_INVALID');
  validateParticipants(m.participants, { targetSha: m.phase === 'OPEN' ? m.targetSha : undefined });
  return m;
}
export function inspectPublicDirectory(directory = PUBLIC_DIRECTORY) {
  if (directory !== PUBLIC_DIRECTORY) fail('PUBLIC_PATH_NOT_APPROVED');
  const names = ancestors(directory); const acls = readACLs(names);
  const snapshots = names.map((name, i) => {
    const s = fs.lstatSync(name);
    if (!s.isDirectory() || s.isSymbolicLink() || fs.realpathSync(name) !== name || s.uid !== 0 || (s.mode & 0o022)
      || !Array.isArray(acls[i]) || acls[i].some(value => value !== false)) fail('PUBLIC_DIRECTORY_UNTRUSTED');
    if (name === directory && (s.mode & 0o7777) !== 0o555) fail('PUBLIC_DIRECTORY_MODE');
    return { path: name, dev: s.dev, ino: s.ino, mode: s.mode, uid: s.uid };
  });
  // Public mount is separate from private 0700 controlRoot. The host source must
  // be on the same approved root filesystem, never an attacker-controlled bind.
  inspectTrustedDirectory('/var/lib', CONTRACT);
  const relevant = parseMountInfo(fs.readFileSync('/proc/self/mountinfo', 'utf8')).filter(m => names.includes(m.target));
  if (new Set(relevant.map(m => m.target)).size !== relevant.length || relevant.some(m => !CONTRACT.controlMounts.some(a => a.target === m.target && a.root === m.root && a.filesystem === m.filesystem))) fail('PUBLIC_DIRECTORY_UNAPPROVED_MOUNT');
  const rootStat = fs.statSync('/var/lib');
  if (fs.statSync(directory).dev !== rootStat.dev) fail('PUBLIC_DIRECTORY_FILESYSTEM');
  return { snapshots, mounts: relevant };
}
/** Explicit root/FD9 installation of the non-secret projection directory only.
 * Does not initialize OPEN, alter private state, or imply a legacy drain. */
export function initializePublicProjection() {
  verifyContext(CONTRACT.repository, CONTRACT.stateDirectory);
  inspectTrustedDirectory('/var/lib', CONTRACT);
  if (!fs.existsSync(PUBLIC_DIRECTORY)) {
    fs.mkdirSync(PUBLIC_DIRECTORY, { mode: 0o555 });
    const parent = fs.openSync('/var/lib', fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
  }
  return inspectPublicDirectory(PUBLIC_DIRECTORY);
}
function manifestFileIdentity(s) { return [s.dev, s.ino, s.size, s.mtimeMs, s.ctimeMs]; }
function publicRegular(s) {
  if (!s.isFile() || s.isSymbolicLink() || s.uid !== 0 || (s.mode & 0o7777) !== 0o444 || s.nlink !== 1 || s.size > 65536) fail('PUBLIC_FILE_UNTRUSTED');
}
export function readPublicManifest(directory = PUBLIC_DIRECTORY, inspect = inspectPublicDirectory) {
  const before = inspect(directory); const file = path.join(directory, 'manifest.json');
  if (!fs.existsSync(file)) return null;
  let fd;
  try {
    const initial = fs.lstatSync(file); publicRegular(initial);
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const opened = fs.fstatSync(fd); publicRegular(opened);
    if (JSON.stringify(manifestFileIdentity(initial)) !== JSON.stringify(manifestFileIdentity(opened))) fail('PUBLIC_FILE_CHANGED');
    const value = JSON.parse(fs.readFileSync(fd, 'utf8'));
    const after = fs.fstatSync(fd); const named = fs.lstatSync(file); publicRegular(after); publicRegular(named);
    if (JSON.stringify(manifestFileIdentity(opened)) !== JSON.stringify(manifestFileIdentity(after))
      || JSON.stringify(manifestFileIdentity(after)) !== JSON.stringify(manifestFileIdentity(named))) fail('PUBLIC_FILE_CHANGED');
    assertSameDirectory(before, inspect(directory));
    return validateManifest(value);
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}
export function atomicPublicManifest(directory, manifest, inspect = inspectPublicDirectory) {
  validateManifest(manifest); const before = inspect(directory); const file = path.join(directory, 'manifest.json');
  const original = fs.existsSync(file) ? fs.lstatSync(file) : undefined; if (original) publicRegular(original);
  const temporary = path.join(directory, `.manifest-${randomUUID()}.tmp`); let fd;
  try {
    fd = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW, 0o444);
    fs.fchmodSync(fd, 0o444); fs.writeFileSync(fd, JSON.stringify(manifest) + '\n'); fs.fsyncSync(fd);
    const written = fs.fstatSync(fd); publicRegular(written); fs.closeSync(fd); fd = undefined;
    assertSameDirectory(before, inspect(directory));
    const current = fs.existsSync(file) ? fs.lstatSync(file) : undefined; if (current) publicRegular(current);
    if (JSON.stringify(current && manifestFileIdentity(current)) !== JSON.stringify(original && manifestFileIdentity(original))) fail('PUBLIC_DESTINATION_CHANGED');
    const named = fs.lstatSync(temporary); publicRegular(named);
    if (named.ino !== written.ino || named.dev !== written.dev || named.size !== written.size) fail('PUBLIC_TEMPORARY_CHANGED');
    fs.renameSync(temporary, file);
    const dirFd = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
    assertSameDirectory(before, inspect(directory));
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    // Deliberately retain a failed temp for root reconciliation; never remove a
    // file that may have been replaced by another actor after a failure.
  }
}
export class BackgroundManifestPublisher {
  constructor(options = {}, dependencies = {}) {
    this.directory = options.publicDirectory || PUBLIC_DIRECTORY;
    this.stateDirectory = options.stateDirectory || CONTRACT.stateDirectory;
    this.privateFile = path.join(this.stateDirectory, 'background-control.json');
    this.guard = dependencies.guard || (() => verifyContext(CONTRACT.repository, this.stateDirectory));
    this.inspect = dependencies.inspect || inspectPublicDirectory;
    this.readPrivate = dependencies.readPrivate || (() => fs.existsSync(this.privateFile) ? secureJson(this.privateFile) : null);
    this.writePrivate = dependencies.writePrivate || (value => atomicState(this.privateFile, value));
    this.writePublic = dependencies.writePublic || (value => atomicPublicManifest(this.directory, value, this.inspect));
    this.readPublic = dependencies.readPublic || (() => readPublicManifest(this.directory, this.inspect));
    this.now = dependencies.now || (() => new Date().toISOString());
  }
  assertOwned(binding) {
    validateBinding(binding); this.guard();
    const record = this.readPrivate();
    if (!record || record.owner !== binding.owner || record.previousFloorSha !== binding.previousFloorSha || record.targetSha !== binding.targetSha
      || !['FENCED', 'CODE_HOLD'].includes(record.phase)) fail('OWNER_OR_TRANSACTION_MISMATCH');
    const manifest = this.readPublic();
    if (!manifest || manifest.owner !== binding.owner || manifest.targetSha !== binding.targetSha || manifest.generation !== record.generation
      || !['FENCED', 'CODE_HOLD'].includes(manifest.phase) || record.manifestDigest !== projectionDigest(manifest)) fail('PUBLIC_PRIVATE_BINDING_MISMATCH');
    return { record, manifest };
  }
  fence(binding, participants) {
    validateBinding(binding); validateParticipants(participants, { targetSha: binding.previousFloorSha }); this.guard(); this.inspect(this.directory);
    const previous = this.readPrivate(); const publicPrevious = this.readPublic();
    if (previous && previous.phase !== 'OPEN') fail('UNFINISHED_BACKGROUND_TRANSACTION');
    if (publicPrevious && (publicPrevious.phase !== 'OPEN' || !previous || previous.generation !== publicPrevious.generation
      || previous.owner !== publicPrevious.owner || previous.targetSha !== publicPrevious.targetSha
      || publicPrevious.targetSha !== binding.previousFloorSha || previous.manifestDigest !== projectionDigest(publicPrevious))) fail('UNRECONCILED_PUBLIC_STATE');
    const generation = Math.max(previous?.generation || 0, publicPrevious?.generation || 0) + 1;
    if (!Number.isSafeInteger(generation)) fail('GENERATION_EXHAUSTED');
    const manifest = { protocolVersion: 1, phase: 'FENCED', owner: binding.owner, generation, targetSha: binding.targetSha, participants };
    const record = { protocolVersion: 1, ...binding, generation, phase: 'PUBLISHING_FENCE', manifestDigest: projectionDigest(manifest), updatedAt: this.now() };
    this.writePrivate(record); // Crash before public fence cannot authorize any deploy.
    this.writePublic(manifest); // Durable deny occurs before any lock wait/deploy.
    this.writePrivate({ ...record, phase: 'FENCED' });
    return manifest;
  }
  hold(binding, reason) {
    const { record } = this.assertOwned(binding);
    // No secret/raw failure text is persisted; callers use fixed reason codes.
    if (!/^[A-Z0-9_]{1,100}$/.test(reason)) fail('INVALID_REASON');
    this.writePrivate({ ...record, holdReason: reason, updatedAt: this.now() });
  }
  async open(binding, participants, verifySuccess) {
    const { record } = this.assertOwned(binding);
    validateParticipants(participants, { targetSha: binding.targetSha });
    if (typeof verifySuccess !== 'function' || await verifySuccess({ ...binding, participants }) !== true) fail('SUCCESS_RECEIPT_REQUIRED');
    this.assertOwned(binding); // Verification may take time; recheck exact owner/generation.
    const generation = record.generation + 1;
    if (!Number.isSafeInteger(generation)) fail('GENERATION_EXHAUSTED');
    const manifest = { protocolVersion: 1, phase: 'OPEN', owner: binding.owner, generation, targetSha: binding.targetSha, participants };
    const next = { ...record, generation, phase: 'OPEN', manifestDigest: projectionDigest(manifest), updatedAt: this.now() };
    // Formal immutable deployment SUCCESS was verified above. Commit the exact
    // next public projection digest to the private authority BEFORE publishing
    // OPEN. A crash may leave private OPEN/public FENCED (manual reconciliation),
    // never public OPEN ahead of its committed authority record.
    this.writePrivate(next); this.writePublic(manifest);
    return manifest;
  }
}
