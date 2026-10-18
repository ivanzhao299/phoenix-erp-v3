/** Immutable, non-secret maintenance evidence. No approval is manufactured here.
 * Production callers must use the default root/FD9 context and independently
 * obtain authority/capture records through the protected workflow. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { CONTRACT, verifyContext } from './production-config-guard.mjs';
import { inspectTrustedDirectory, assertSameDirectory } from './production-trusted-paths.mjs';

export const MAINTENANCE_CONTEXT_SCHEMA = 'phoenix.legacy-maintenance-context/v1';
export const MAINTENANCE_EVIDENCE_SCHEMA = 'phoenix.maintenance-evidence/v1';
export const MAINTENANCE_AUTHORITY_SCHEMA = 'phoenix.maintenance-authority/v1';
export const SHA = /^[a-f0-9]{40}$/;
export const HASH = /^[a-f0-9]{64}$/;
export const IMAGE = /^sha256:[a-f0-9]{64}$/;
export const hold = code => { throw new Error(`MAINTENANCE_HOLD=${code}`); };
export const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
// Docker preserves nanoseconds in StartedAt. Validate without changing the
// original identity string; evidence/window timestamps remain canonical ms ISO.
export function runtimeTimestamp(value) {
  const match = typeof value === 'string' && /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{1,9})Z$/.exec(value);
  if (!match) return false;
  const millis = `${match[1]}.${match[2].padEnd(3, '0').slice(0, 3)}Z`;
  return iso(millis);
}
function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && Object.getPrototypeOf(value) === Object.prototype) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  hold('NON_CANONICAL_VALUE');
}
export const canonicalDigest = value => createHash('sha256').update(canonical(value)).digest('hex');
export const same = (a, b) => canonicalDigest(a) === canonicalDigest(b);
export function validateRuntimePin(pin, { revision = true, healthy = false } = {}) {
  if (!pin || !HASH.test(pin.id) || !IMAGE.test(pin.imageId) || !runtimeTimestamp(pin.startedAt)
    || !Number.isSafeInteger(pin.restartCount) || pin.restartCount < 0 || (revision && !SHA.test(pin.revision))
    || (healthy && (pin.running !== true || pin.health !== 'healthy'))) hold('RUNTIME_IDENTITY_REQUIRED');
  return pin;
}
export function validateMaintenanceContext(context) {
  if (!context || context.schema !== MAINTENANCE_CONTEXT_SCHEMA || context.protocolVersion !== 1 || !/^\d+-\d+$/.test(context.owner)
    || ![context.previousFloorSha, context.previousApiSha, context.previousWebSha, context.targetSha].every(x => SHA.test(x))
    || context.previousFloorSha !== context.previousApiSha || context.previousFloorSha === context.targetSha
    || !iso(context.window?.start) || !iso(context.window?.end) || Date.parse(context.window.start) >= Date.parse(context.window.end)
    || Date.parse(context.window.end) - Date.parse(context.window.start) > CONTRACT.maximumTransitionMs
    || context.candidate?.revision !== context.targetSha || !IMAGE.test(context.candidate?.imageId)
    || !HASH.test(context.sourceHelperSha256) || !HASH.test(context.schemaEvidenceSha256)
    || !Array.isArray(context.migrationPaths) || context.migrationPaths.length !== 0) hold('EXACT_CONTEXT_REQUIRED');
  for (const service of ['api', 'web', 'db']) validateRuntimePin(context.preSnapshot?.[service], { revision: service !== 'db', healthy: true });
  if (context.preSnapshot.api.revision !== context.previousApiSha || context.preSnapshot.web.revision !== context.previousWebSha
    || !HASH.test(context.preSnapshot.db.mountsSha256) || !Array.isArray(context.executors) || !context.executors.length || context.executors.length > 128) hold('PRE_IDENTITY_REQUIRED');
  const ids = new Set();
  for (const executor of context.executors) {
    validateRuntimePin(executor, { healthy: true });
    if (executor.revision !== context.previousApiSha || ids.has(executor.id)) hold('EXECUTOR_INVENTORY_REQUIRED');
    ids.add(executor.id);
  }
  if (!context.executors.some(p => same(p, context.preSnapshot.api))) hold('PRE_API_NOT_IN_EXECUTORS');
  return context;
}
export const bindingDigest = context => canonicalDigest(validateMaintenanceContext(context));
export function createMaintenanceEvidence(kind, context, body, { capturedAt = new Date().toISOString() } = {}) {
  if (!/^[A-Z_]{2,40}$/.test(kind) || !iso(capturedAt)) hold('EVIDENCE_KIND_OR_TIME');
  const content = { schema: MAINTENANCE_EVIDENCE_SCHEMA, kind, bindingDigest: bindingDigest(context), capturedAt, body };
  return { ...content, evidenceSha256: canonicalDigest(content) };
}
export function validateMaintenanceEvidence(envelope, kind, context, now = Date.now()) {
  const { evidenceSha256, ...content } = envelope || {};
  if (content.schema !== MAINTENANCE_EVIDENCE_SCHEMA || content.kind !== kind || content.bindingDigest !== bindingDigest(context)
    || !iso(content.capturedAt) || Date.parse(content.capturedAt) < Date.parse(context.window.start) || Date.parse(content.capturedAt) > now
    || Date.parse(content.capturedAt) >= Date.parse(context.window.end) || !HASH.test(evidenceSha256) || canonicalDigest(content) !== evidenceSha256) hold('EVIDENCE_BINDING');
  return content.body;
}

/** Structural checks are never sufficient. verifyServerRecord must independently
 * re-fetch the immutable GitHub review/environment record; names or booleans in
 * user-supplied JSON do not grant authority. No default producer is installed. */
export async function verifyGithubMaintenanceAuthority(approval, expected, { verifyServerRecord = async () => false } = {}) {
  const r = approval?.serverRecord;
  if (approval?.schema !== MAINTENANCE_AUTHORITY_SCHEMA || approval.decision !== 'APPROVED'
    || approval.bindingDigest !== expected.bindingDigest || approval.purpose !== expected.purpose
    || !HASH.test(approval.payloadSha256) || canonicalDigest(approval.payload) !== approval.payloadSha256
    || !r || !['GITHUB_REVIEW', 'GITHUB_ENVIRONMENT'].includes(r.kind) || !Number.isSafeInteger(r.id) || r.id < 1
    || r.state !== 'APPROVED' || r.commitId !== expected.targetSha || !iso(r.submittedAt)
    || typeof r.reviewer !== 'string' || !r.reviewer || typeof r.author !== 'string' || !r.author
    || r.reviewer.toLowerCase() === r.author.toLowerCase() || !['ADMIN', 'MAINTAIN'].includes(r.permission)
    || !HASH.test(r.rawRecordSha256) || !HASH.test(r.bodySha256) || typeof r.body !== 'string'
    || createHash('sha256').update(r.body).digest('hex') !== r.bodySha256
    || !r.body.includes(expected.bindingDigest) || !r.body.includes(approval.payloadSha256)
    || !r.body.includes(expected.targetSha) || !r.body.includes(expected.purpose)) return false;
  return await verifyServerRecord(r, approval, expected) === true;
}

const identity = s => [s.dev, s.ino, s.size, s.mtimeMs, s.ctimeMs];
export class MaintenanceReceiptStore {
  constructor(context, dependencies = {}) {
    validateMaintenanceContext(context); this.context = structuredClone(context); this.digest = bindingDigest(context);
    this.directory = dependencies.directory || CONTRACT.stateDirectory;
    this.guard = dependencies.guard || (() => verifyContext(CONTRACT.repository, this.directory));
    this.inspect = dependencies.inspectDirectory || (directory => inspectTrustedDirectory(directory, CONTRACT));
    this.uid = dependencies.expectedUid ?? 0;
    this.stateFile = path.join(this.directory, `maintenance-${context.owner}.json`);
    this.markerFile = path.join(this.directory, 'maintenance-transaction.json');
    this.currentFile = path.join(this.directory, 'maintenance-current.json');
  }
  checkFile(s) {
    if (!s.isFile() || s.isSymbolicLink() || s.uid !== this.uid || (s.mode & 0o7777) !== 0o600 || s.nlink !== 1 || s.size > 1024 * 1024) hold('UNTRUSTED_RECEIPT_FILE');
  }
  read(file) {
    this.guard(); const directory = this.inspect(this.directory); const named = fs.lstatSync(file); this.checkFile(named);
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const opened = fs.fstatSync(fd); this.checkFile(opened);
      if (!same(identity(named), identity(opened))) hold('RECEIPT_CHANGED');
      const content = JSON.parse(fs.readFileSync(fd, 'utf8')); const after = fs.fstatSync(fd); const current = fs.lstatSync(file);
      this.checkFile(after); this.checkFile(current);
      if (!same(identity(opened), identity(after)) || !same(identity(after), identity(current))) hold('RECEIPT_CHANGED');
      assertSameDirectory(directory, this.inspect(this.directory)); return content;
    } finally { fs.closeSync(fd); }
  }
  syncDirectory() { const fd = fs.openSync(this.directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
  immutable(file, value) {
    this.guard(); const directory = this.inspect(this.directory); const bytes = canonical(value) + '\n';
    if (Buffer.byteLength(bytes) > 1024 * 1024) hold('RECEIPT_TOO_LARGE');
    const fd = fs.openSync(file, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW, 0o600);
    try { fs.fchmodSync(fd, 0o600); fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); this.checkFile(fs.fstatSync(fd)); }
    finally { fs.closeSync(fd); }
    this.syncDirectory(); assertSameDirectory(directory, this.inspect(this.directory));
    if (!same(this.read(file), value)) hold('PERSISTED_RECEIPT_CHANGED');
  }
  #snapshotBudget(options = {}) {
    if (!options || Object.getPrototypeOf(options) !== Object.prototype || Object.keys(options).some(key => !['timeoutMs','signal'].includes(key))) hold('RECEIPT_SNAPSHOT_BUDGET');
    const { timeoutMs = 10000, signal } = options;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000 || (signal && !(signal instanceof AbortSignal))) hold('RECEIPT_SNAPSHOT_BUDGET');
    const start = performance.now(); let last = start;
    return () => { const current = performance.now();
      if (!Number.isFinite(current) || current < last || current - start >= timeoutMs || signal?.aborted) hold('RECEIPT_SNAPSHOT_DEADLINE');
      last = current;
    };
  }
  #validateReceipt(value, reference) {
    const { digest, ...content } = value;
    if (digest !== reference.digest || digest !== canonicalDigest(content) || value.sequence !== reference.sequence || value.contextDigest !== this.digest || value.owner !== this.context.owner) hold('RECEIPT_DIGEST');
    return value;
  }
  // One call-local read transaction under the existing continuously held lock.
  // No guard token/cache is exposed. Independent read()/readReceipt() stay fresh.
  #readStateSnapshot(options, owned = false) {
    const check = this.#snapshotBudget(options); check(); this.guard(); check();
    const directory = this.inspect(this.directory); check();
    if (path.resolve(this.directory) !== this.directory || fs.realpathSync(this.directory) !== this.directory) hold('RECEIPT_SNAPSHOT_DIRECTORY');
    const directoryFd = fs.openSync(this.directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    const pin = stat => ['dev','ino','uid','mode','nlink','size','mtimeNs','ctimeNs'].map(key => String(stat[key]));
    const directoryPin = stat => ['dev','ino','uid','mode','mtimeNs','ctimeNs'].map(key => String(stat[key]));
    const checkDirectory = stat => { if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== BigInt(this.uid) || (stat.mode & 0o7777n) !== 0o700n) hold('RECEIPT_SNAPSHOT_DIRECTORY'); };
    const checkFile = stat => { if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== BigInt(this.uid) || (stat.mode & 0o7777n) !== 0o600n || stat.nlink !== 1n || stat.size > 1048576n) hold('UNTRUSTED_RECEIPT_FILE'); };
    const entries = new Map();
    // Linux production uses the pinned directory FD, not re-resolved ancestors.
    // Non-Linux unit fixtures retain named-directory pre/post identity checks;
    // the real production FD9 guard already requires Linux /proc.
    const anchored = file => { if (path.dirname(file) !== this.directory) hold('RECEIPT_SNAPSHOT_PATH');
      return process.platform === 'linux' ? `/proc/self/fd/${directoryFd}/${path.basename(file)}` : file; };
    try {
      const openedDirectory = fs.fstatSync(directoryFd, { bigint: true }); checkDirectory(openedDirectory);
      const namedDirectory = fs.lstatSync(this.directory, { bigint: true }); checkDirectory(namedDirectory);
      if (!same(directoryPin(openedDirectory), directoryPin(namedDirectory))) hold('RECEIPT_SNAPSHOT_DIRECTORY_CHANGED');
      const initialDirectoryPin = directoryPin(openedDirectory);
      const readPinned = file => {
        check(); const name = anchored(file), named = fs.lstatSync(name, { bigint: true }); checkFile(named);
        // A regular file may be replaced by a FIFO after lstat. Never block
        // waiting for its writer; fstat below still rejects every non-file.
        const fd = fs.openSync(name, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
        try {
          const opened = fs.fstatSync(fd, { bigint: true }); checkFile(opened);
          if (!same(pin(named), pin(opened))) hold('RECEIPT_CHANGED');
          // Bounded even if a concurrent writer grows the file after lstat.
          const buffer = Buffer.alloc(Number(opened.size) + 1); let used = 0;
          while (used < buffer.length) { check(); const size = fs.readSync(fd, buffer, used, buffer.length - used, used); check();
            if (size === 0) break; used += size; if (used > Number(opened.size)) hold('RECEIPT_CHANGED'); }
          if (used !== Number(opened.size)) hold('RECEIPT_CHANGED');
          const after = fs.fstatSync(fd, { bigint: true }), current = fs.lstatSync(name, { bigint: true }); checkFile(after); checkFile(current);
          if (!same(pin(opened), pin(after)) || !same(pin(after), pin(current))) hold('RECEIPT_CHANGED');
          const value = JSON.parse(buffer.subarray(0, used).toString('utf8')); entries.set(file, pin(current)); check(); return value;
        } finally { fs.closeSync(fd); }
      };
      if (owned) {
        if (fs.lstatSync(anchored(this.currentFile), { bigint: true, throwIfNoEntry: false }) === undefined) hold('MAINTENANCE_OWNER_REQUIRED');
        const current = readPinned(this.currentFile);
        if (current.schema !== 'phoenix.maintenance-owner/v1' || current.owner !== this.context.owner || current.contextDigest !== this.digest) hold('ANOTHER_MAINTENANCE_OWNER_ACTIVE');
      }
      const absent = fs.lstatSync(anchored(this.stateFile), { bigint: true, throwIfNoEntry: false }) === undefined;
      let record = null; const receipts = new Map();
      if (!absent) {
        record = readPinned(this.stateFile); const { stateDigest, ...content } = record;
        if (record.contextDigest !== this.digest || !same(record.context, this.context) || stateDigest !== canonicalDigest(content)
          || !Array.isArray(record.receipts) || record.receipts.length > 100) hold('STATE_CONTEXT_CHANGED');
        let previousDigest = null;
        for (let i = 0; i < record.receipts.length; i++) { check(); const reference = record.receipts[i], file = this.receiptFile(reference);
          if (entries.has(file)) hold('RECEIPT_CHAIN_BROKEN');
          const receipt = this.#validateReceipt(readPinned(file), reference);
          if (receipt.sequence !== i + 1 || receipt.previousDigest !== previousDigest) hold('RECEIPT_CHAIN_BROKEN');
          previousDigest = receipt.digest; receipts.set(`${reference.sequence}:${reference.digest}`, receipt);
        }
      }
      const sweep = () => {
        check();
        for (const [file, expected] of entries) { const current = fs.lstatSync(anchored(file), { bigint: true }); checkFile(current);
          if (!same(pin(current), expected)) hold('RECEIPT_CHANGED'); check(); }
        if (absent && fs.lstatSync(anchored(this.stateFile), { bigint: true, throwIfNoEntry: false }) !== undefined) hold('STATE_CONTEXT_CHANGED');
        const currentFd = fs.fstatSync(directoryFd, { bigint: true }), currentName = fs.lstatSync(this.directory, { bigint: true });
        checkDirectory(currentFd); checkDirectory(currentName);
        if (!same(directoryPin(currentFd), initialDirectoryPin) || !same(directoryPin(currentName), initialDirectoryPin)) hold('RECEIPT_SNAPSHOT_DIRECTORY_CHANGED');
        check();
      };
      sweep(); check(); this.guard(); check(); assertSameDirectory(directory, this.inspect(this.directory)); check(); sweep();
      return { state: record, receipts };
    } finally { fs.closeSync(directoryFd); }
  }
  readState(options) { return this.#readStateSnapshot(options).state; }
  /** Fixed candidate receipt selection from one fresh, owned, fully verified
   * snapshot. No caller state, receipt rows or reusable guard token are trusted. */
  readCandidateBindingEvidence(request = {}) {
    if (!request || Object.getPrototypeOf(request) !== Object.prototype
      || Object.keys(request).some(key => !['expectedStateDigest','timeoutMs','signal'].includes(key))
      || !HASH.test(request.expectedStateDigest || '')) hold('CANDIDATE_BINDING_RECEIPT_REQUEST');
    const { expectedStateDigest, timeoutMs = 10000, signal } = request;
    const check = this.#snapshotBudget({ timeoutMs, signal }); check();
    const snapshot = this.#readStateSnapshot({ timeoutMs, signal }, true), state = snapshot.state; check();
    if (!state || state.schema !== 'phoenix.legacy-maintenance-state/v1' || state.legacyDrainResult !== 'UNSUPPORTED'
      || state.stateDigest !== expectedStateDigest || !['CANDIDATE_REPLACED','CANDIDATE_FENCED','VERIFIED_FENCED','COMPLETED_OPEN'].includes(state.phase)) hold('CANDIDATE_BINDING_RECEIPT_STATE');
    const select = kind => [...snapshot.receipts.values()].filter(receipt => receipt.kind === kind);
    const replacement = select('CANDIDATE_REPLACEMENT'), candidate = select('CANDIDATE_FENCED');
    if (replacement.length !== 1 || candidate.length !== (state.phase === 'CANDIDATE_REPLACED' ? 0 : 1)) hold('CANDIDATE_BINDING_RECEIPT_UNIQUE');
    const result = structuredClone({ stateDigest: state.stateDigest, replacement: replacement[0].payload, candidate: candidate[0]?.payload ?? null }); check(); return result;
  }
  writeState(content) {
    this.guard(); const before = this.inspect(this.directory);
    const previous = fs.existsSync(this.stateFile) ? fs.lstatSync(this.stateFile) : null; if (previous) this.checkFile(previous);
    const value = { ...content, stateDigest: canonicalDigest(content) }; const temporary = path.join(this.directory, `.maintenance-${this.context.owner}-${randomUUID()}.tmp`);
    this.immutable(temporary, value); const temporaryIdentity = fs.lstatSync(temporary); this.checkFile(temporaryIdentity);
    const current = fs.existsSync(this.stateFile) ? fs.lstatSync(this.stateFile) : null; if (current) this.checkFile(current);
    if (!same(current && identity(current), previous && identity(previous))) hold('STATE_DESTINATION_CHANGED');
    assertSameDirectory(before, this.inspect(this.directory)); const finalTemporary = fs.lstatSync(temporary); this.checkFile(finalTemporary);
    if (!same(identity(temporaryIdentity), identity(finalTemporary))) hold('STATE_TEMPORARY_CHANGED');
    fs.renameSync(temporary, this.stateFile); this.syncDirectory();
    assertSameDirectory(before, this.inspect(this.directory)); return this.readState();
  }
  receiptFile(reference) {
    if (!Number.isSafeInteger(reference?.sequence) || reference.sequence < 1 || reference.sequence > 100 || !HASH.test(reference.digest)) hold('RECEIPT_REFERENCE');
    return path.join(this.directory, `maintenance-receipt-${this.context.owner}-${reference.sequence}-${reference.digest}.json`);
  }
  appendReceipt(kind, payload, state, recordedAt) {
    const content = { schema: 'phoenix.maintenance-receipt/v1', contextDigest: this.digest, owner: this.context.owner, sequence: (state?.receipts.length || 0) + 1,
      previousDigest: state?.receipts.at(-1)?.digest || null, kind, payload, recordedAt };
    const value = { ...content, digest: canonicalDigest(content) }; const ref = { sequence: value.sequence, digest: value.digest };
    this.immutable(this.receiptFile(ref), value); return ref;
  }
  readReceipt(reference) {
    return this.#validateReceipt(this.read(this.receiptFile(reference)), reference);
  }
  assertCurrent({ allowAbsent = false } = {}) {
    this.guard();
    if (!fs.existsSync(this.currentFile)) { if (allowAbsent) return false; hold('MAINTENANCE_OWNER_REQUIRED'); }
    const current = this.read(this.currentFile);
    if (current.schema !== 'phoenix.maintenance-owner/v1' || current.owner !== this.context.owner || current.contextDigest !== this.digest) hold('ANOTHER_MAINTENANCE_OWNER_ACTIVE');
    return true;
  }
  claimCurrent(claimedAt) {
    this.assertNoPending(); if (this.assertCurrent({ allowAbsent: true })) hold('MAINTENANCE_OWNER_ALREADY_CLAIMED');
    this.immutable(this.currentFile, { schema: 'phoenix.maintenance-owner/v1', owner: this.context.owner, contextDigest: this.digest, claimedAt });
  }
  assertNoPending() {
    this.guard(); this.assertCurrent({ allowAbsent: true });
    if (fs.existsSync(this.markerFile)) hold('UNRESOLVED_MAINTENANCE_TRANSACTION');
  }
  beginMarker(intent) {
    this.assertNoPending(); this.immutable(this.markerFile, { ...intent, schema: 'phoenix.maintenance-intent/v1', owner: this.context.owner, contextDigest: this.digest });
  }
  assertOwnedIntent(operation, from, previousStateDigest) {
    this.assertCurrent(); const marker = this.read(this.markerFile);
    if (marker.schema !== 'phoenix.maintenance-intent/v1' || marker.owner !== this.context.owner || marker.contextDigest !== this.digest
      || marker.operation !== operation || marker.from !== from || marker.previousStateDigest !== previousStateDigest) hold('OPERATION_INTENT_NOT_OWNED');
    return marker;
  }
  assertOwnedEffectState(operation, currentState) {
    this.assertCurrent(); const actual = this.readState();
    if (!currentState || !actual || !same(actual, currentState)) hold('EFFECT_STATE_NOT_CURRENT');
    const marker = this.read(this.markerFile);
    if (marker.operation !== operation || marker.schema !== 'phoenix.maintenance-intent/v1' || marker.owner !== this.context.owner || marker.contextDigest !== this.digest) hold('OPERATION_INTENT_NOT_OWNED');
    if (marker.from === actual.phase && marker.previousStateDigest === actual.stateDigest) return this.assertOwnedIntent(operation, actual.phase, actual.stateDigest);
    // The ONLY intermediate private projection is final OPEN authority. Do not
    // waive phase/hash checks merely because an operation claims to be ongoing.
    const prior = marker.previousState; const { stateDigest: previousDigest, ...previousContent } = prior || {};
    if (operation !== 'OPEN_CANDIDATE' || marker.from !== 'VERIFIED_FENCED' || marker.to !== 'COMPLETED_OPEN'
      || actual.phase !== 'COMPLETED_OPEN' || actual.status !== 'OPEN_COMMIT_PENDING' || !prior || previousDigest !== marker.previousStateDigest
      || canonicalDigest(previousContent) !== previousDigest || prior.phase !== 'VERIFIED_FENCED' || prior.status !== 'FENCED'
      || prior.contextDigest !== this.digest || !same(prior.context, this.context) || !Array.isArray(prior.receipts)
      || actual.receipts.length !== prior.receipts.length + 1 || !iso(marker.startedAt)) hold('INVALID_OPEN_EFFECT_PROJECTION');
    const reference = actual.receipts.at(-1); const completion = this.readReceipt(reference);
    if (completion.kind !== 'COMPLETION' || completion.previousDigest !== (prior.receipts.at(-1)?.digest || null)
      || completion.recordedAt !== marker.startedAt) hold('OPEN_COMPLETION_RECEIPT_REQUIRED');
    const expected = { ...previousContent, phase: 'COMPLETED_OPEN', status: 'OPEN_COMMIT_PENDING', receipts: [...prior.receipts, reference], updatedAt: marker.startedAt };
    const { stateDigest: currentDigest, ...actualContent } = actual;
    if (!same(expected, actualContent) || currentDigest !== canonicalDigest(expected)) hold('INVALID_OPEN_EFFECT_PROJECTION');
    return marker;
  }
  #candidateCommittedIntent(stateDigest, { operation, from, to, previousStateDigest, receipt }) {
    if (!HASH.test(stateDigest || '') || !HASH.test(previousStateDigest || '')) hold('CANDIDATE_PHASE_ANCHOR_DIGEST');
    const marker = this.read(path.join(this.directory, `maintenance-intent-${this.context.owner}-${stateDigest}.json`));
    const fields = ['schema', 'owner', 'contextDigest', 'operation', 'from', 'to', 'previousStateDigest', 'startedAt'];
    if (!same(Object.keys(marker).sort(), fields.sort()) || marker.schema !== 'phoenix.maintenance-intent/v1'
      || marker.owner !== this.context.owner || marker.contextDigest !== this.digest || marker.operation !== operation
      || marker.from !== from || marker.to !== to || marker.previousStateDigest !== previousStateDigest
      || !iso(marker.startedAt) || !iso(receipt?.recordedAt)
      || Date.parse(marker.startedAt) < Date.parse(this.context.window.start)
      || Date.parse(marker.startedAt) >= Date.parse(this.context.window.end)
      || Date.parse(marker.startedAt) > Date.parse(receipt.recordedAt)) hold('CANDIDATE_COMMITTED_INTENT_BINDING');
    return canonicalDigest(marker);
  }
  /** Read actual trusted state/archives only. This is a phase anchor, not a
   * lease, approval, runtime observation or permission to admit background work.
   * Never rebuild historical state timestamps from receipt recordedAt values. */
  readCandidateLeasePhaseAnchor({ expectedStateDigest, replacementStateDigest } = {}) {
    this.assertCurrent();
    if (!HASH.test(expectedStateDigest || '') || !HASH.test(replacementStateDigest || '')) hold('CANDIDATE_PHASE_ANCHOR_DIGEST');
    const snapshot = this.#readStateSnapshot(), actual = snapshot.state;
    if (!actual || actual.stateDigest !== expectedStateDigest || actual.schema !== 'phoenix.legacy-maintenance-state/v1'
      || actual.legacyDrainResult !== 'UNSUPPORTED' || !iso(actual.updatedAt)) hold('CANDIDATE_PHASE_ANCHOR_STATE');
    const initialMarker = fs.existsSync(this.markerFile) ? this.read(this.markerFile) : null;
    let fenced = actual, openIntentDigest = null;
    if (actual.phase === 'COMPLETED_OPEN' && actual.status === 'OPEN_COMMIT_PENDING') {
      const marker = this.assertOwnedEffectState('OPEN_CANDIDATE', actual);
      fenced = marker.previousState; openIntentDigest = canonicalDigest(marker);
    } else if (!['CANDIDATE_FENCED', 'VERIFIED_FENCED'].includes(actual.phase) || actual.status !== 'FENCED') {
      hold('CANDIDATE_PHASE_ANCHOR_STATE');
    }
    const receipts = fenced.receipts.map(reference => {
      this.receiptFile(reference); const receipt = snapshot.receipts.get(`${reference.sequence}:${reference.digest}`);
      if (!receipt) hold('CANDIDATE_PHASE_ANCHOR_CHAIN_ORDER'); return receipt;
    });
    if (Date.parse(actual.updatedAt) < Date.parse(this.context.window.start) || Date.parse(actual.updatedAt) >= Date.parse(this.context.window.end)
      || receipts.some(r => r.schema !== 'phoenix.maintenance-receipt/v1' || !iso(r.recordedAt)
        || Date.parse(r.recordedAt) < Date.parse(this.context.window.start) || Date.parse(r.recordedAt) > Date.parse(actual.updatedAt))) hold('CANDIDATE_PHASE_ANCHOR_TIME');
    const unique = kind => {
      const found = receipts.filter(receipt => receipt.kind === kind);
      if (found.length !== 1) hold('CANDIDATE_PHASE_ANCHOR_UNIQUE_CHAIN');
      return found[0];
    };
    const replacement = unique('CANDIDATE_REPLACEMENT'), candidate = unique('CANDIDATE_FENCED');
    for (const receipt of [replacement, candidate]) validateMaintenanceEvidence(receipt.payload, receipt.kind, this.context, Date.parse(actual.updatedAt));
    if (candidate.sequence !== replacement.sequence + 1) hold('CANDIDATE_PHASE_ANCHOR_CHAIN_ORDER');
    let candidateStateDigest = fenced.stateDigest, verifiedReceiptDigest = null, verifyIntentDigest = null;
    if (fenced.phase === 'VERIFIED_FENCED') {
      const verified = unique('VERIFIED_FENCED');
      validateMaintenanceEvidence(verified.payload, verified.kind, this.context, Date.parse(actual.updatedAt));
      if (verified.sequence !== candidate.sequence + 1 || verified.digest !== receipts.at(-1)?.digest) hold('CANDIDATE_PHASE_ANCHOR_CHAIN_ORDER');
      const archived = this.read(path.join(this.directory, `maintenance-intent-${this.context.owner}-${fenced.stateDigest}.json`));
      candidateStateDigest = archived.previousStateDigest;
      verifyIntentDigest = this.#candidateCommittedIntent(fenced.stateDigest, { operation: 'VERIFY_CANDIDATE', from: 'CANDIDATE_FENCED',
        to: 'VERIFIED_FENCED', previousStateDigest: candidateStateDigest, receipt: verified });
      verifiedReceiptDigest = verified.digest;
      // VF must be a committed stable phase. OPEN pending is checked above
      // against its real private projection and original VF state.
      if (!openIntentDigest && fs.existsSync(this.markerFile)) hold('CANDIDATE_PHASE_ANCHOR_PENDING');
    } else {
      if (candidate.digest !== receipts.at(-1)?.digest || receipts.some(receipt => receipt.kind === 'VERIFIED_FENCED')) hold('CANDIDATE_PHASE_ANCHOR_CHAIN_ORDER');
      if (fs.existsSync(this.markerFile)) {
        const marker = this.assertOwnedIntent('VERIFY_CANDIDATE', 'CANDIDATE_FENCED', fenced.stateDigest);
        const fields = ['schema', 'owner', 'contextDigest', 'operation', 'from', 'to', 'previousStateDigest', 'startedAt'];
        if (marker.to !== 'VERIFIED_FENCED' || !same(Object.keys(marker).sort(), fields.sort()) || !iso(marker.startedAt)
          || Date.parse(marker.startedAt) < Date.parse(fenced.updatedAt) || Date.parse(marker.startedAt) >= Date.parse(this.context.window.end)) hold('CANDIDATE_PHASE_ANCHOR_PENDING');
      }
    }
    const startIntentDigest = this.#candidateCommittedIntent(candidateStateDigest, { operation: 'START_CANDIDATE', from: 'CANDIDATE_REPLACED',
      to: 'CANDIDATE_FENCED', previousStateDigest: replacementStateDigest, receipt: candidate });
    // A concurrent phase writer cannot splice this read across state/intent
    // generations. Composite runtime observers must repeat this anchor after
    // their own independent server probes as well.
    if (!same(this.readState(), actual) || !same(fs.existsSync(this.markerFile) ? this.read(this.markerFile) : null, initialMarker)) hold('CANDIDATE_PHASE_ANCHOR_CHANGED');
    const result = { schema: 'phoenix.candidate-lease-phase-anchor/v1', contextDigest: this.digest, owner: this.context.owner,
      currentStateDigest: actual.stateDigest, currentPhase: actual.phase, currentStatus: actual.status, candidateStateDigest,
      replacementStateDigest, replacementReceiptDigest: replacement.digest, candidateReceiptDigest: candidate.digest,
      verifiedReceiptDigest, startIntentDigest, verifyIntentDigest, openIntentDigest, pendingIntentDigest: initialMarker ? canonicalDigest(initialMarker) : null };
    this.assertCurrent(); return result;
  }
  finishMarker(committedState) {
    const initial = fs.lstatSync(this.markerFile); this.checkFile(initial); const marker = this.read(this.markerFile);
    if (marker.owner !== this.context.owner || marker.contextDigest !== this.digest) hold('MARKER_OWNER_CHANGED');
    const before = this.inspect(this.directory); const archive = path.join(this.directory, `maintenance-intent-${this.context.owner}-${committedState.stateDigest}.json`);
    if (fs.existsSync(archive)) hold('MARKER_ARCHIVE_EXISTS');
    const current = fs.lstatSync(this.markerFile); this.checkFile(current);
    if (!same(identity(initial), identity(current))) hold('MARKER_CHANGED');
    // Never delete a failed marker. Successful markers are retained immutably.
    fs.renameSync(this.markerFile, archive); this.syncDirectory(); assertSameDirectory(before, this.inspect(this.directory));
    if (!same(this.read(archive), marker)) hold('MARKER_ARCHIVE_CHANGED');
  }
  finishCurrent(committedState) {
    this.assertNoPending(); this.assertCurrent();
    if (committedState.phase !== 'COMPLETED_OPEN' || committedState.status !== 'SUCCESS' || this.readState().stateDigest !== committedState.stateDigest) hold('MAINTENANCE_NOT_COMPLETED');
    const current = this.read(this.currentFile); const initial = fs.lstatSync(this.currentFile); this.checkFile(initial);
    const before = this.inspect(this.directory); const archive = path.join(this.directory, `maintenance-owner-${this.context.owner}-${committedState.stateDigest}.json`);
    if (fs.existsSync(archive)) hold('OWNER_ARCHIVE_EXISTS');
    const final = fs.lstatSync(this.currentFile); this.checkFile(final); if (!same(identity(initial), identity(final))) hold('OWNER_MARKER_CHANGED');
    fs.renameSync(this.currentFile, archive); this.syncDirectory(); assertSameDirectory(before, this.inspect(this.directory));
    if (!same(this.read(archive), current)) hold('OWNER_ARCHIVE_CHANGED');
  }
}
