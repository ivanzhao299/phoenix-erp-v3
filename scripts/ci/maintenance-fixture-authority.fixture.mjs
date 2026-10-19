/** Isolated session fixture only. Independent owned child with an ephemeral
 * signing key and immutable simulated records. Never production authority, an
 * actual GitHub Review, or an observation recorder. Production must not import
 * this module. The parent fixture supervisor is trusted, not adversarial root. */
import { fork } from 'node:child_process';
import { generateKeyPairSync, sign, verify, createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { bindingDigest, canonicalDigest, same, validateMaintenanceContext, verifyGithubMaintenanceAuthority } from '../ops/production-maintenance-receipts.mjs';

const SOURCE = 'SIMULATED_GITHUB_PROTOCOL';
const SCHEMA = 'phoenix.fixture-authority-response/v1';
const MAX_MESSAGE = 65536, MAX_PENDING = 16;
const fail = () => { throw Error('FIXTURE_AUTHORITY_HOLD=UNVERIFIED'); };
const exact = (v, keys) => v && Object.getPrototypeOf(v) === Object.prototype && same(Object.keys(v).sort(), [...keys].sort());
const textHash = s => createHash('sha256').update(s).digest('hex');
const bytes = v => Buffer.from(canonicalDigest(v), 'ascii');
const plainClone = v => JSON.parse(JSON.stringify(v));

function validateInitial(value) {
  if (Buffer.byteLength(JSON.stringify(value) || '') > MAX_MESSAGE) fail();
  if (!exact(value, ['context', 'records']) || !Array.isArray(value.records) || !value.records.length || value.records.length > 32) fail();
  validateMaintenanceContext(value.context);
  const purposes = new Set();
  for (const r of value.records) {
    if (!exact(r, ['purpose', 'payload']) || !['MAINTENANCE', 'UNKNOWN_EFFECTS'].includes(r.purpose)
      || purposes.has(r.purpose) || !r.payload || Object.getPrototypeOf(r.payload) !== Object.prototype) fail();
    purposes.add(r.purpose); canonicalDigest(r.payload);
  }
  return plainClone(value);
}

/** Deterministic proposal for the isolated session's plan, before controllers
 * start. This unsigned simulated record grants NOTHING. Admission still needs
 * a fresh independently signed reply from the original issuer for this record.
 * The timestamp is the frozen window start, never a claimed human review time. */
export function prepareFixtureAuthorityApproval(value, purpose) {
  const initial = validateInitial(value), record = initial.records.find(r => r.purpose === purpose);
  if (!record) fail();
  const index = initial.records.indexOf(record), contextDigest = bindingDigest(initial.context), payloadSha256 = canonicalDigest(record.payload);
  const body = [SOURCE, contextDigest, payloadSha256, initial.context.targetSha, record.purpose].join('\n');
  const raw = { source: SOURCE, fixtureOnly: true, productionAuthorized: false, kind: 'GITHUB_REVIEW', id: index + 1,
    state: 'APPROVED', commitId: initial.context.targetSha, submittedAt: initial.context.window.start,
    reviewer: 'simulated-independent-reviewer', author: 'simulated-fixture-author', permission: 'ADMIN', body, bodySha256: textHash(body) };
  return { schema: 'phoenix.maintenance-authority/v1', source: SOURCE, fixtureOnly: true, productionAuthorized: false,
    bindingDigest: contextDigest, purpose, decision: 'APPROVED', payload: record.payload, payloadSha256,
    serverRecord: { ...raw, rawRecordSha256: canonicalDigest(raw) } };
}

function budget(timeoutMs = 10000, signal, context) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000 || (signal && !(signal instanceof AbortSignal))) fail();
  const start = Date.now(), monoStart = performance.now(); let wall = start, mono = monoStart;
  return () => {
    const w = Date.now(), m = performance.now();
    if (![start, monoStart, w, m].every(Number.isFinite) || w < wall || m < mono || w - start >= timeoutMs || m - monoStart >= timeoutMs
      || signal?.aborted || (context && (w < Date.parse(context.window.start) || w >= Date.parse(context.window.end)))) fail();
    wall = w; mono = m; return Math.max(1, Math.floor(Math.min(timeoutMs - (w - start), timeoutMs - (m - monoStart))));
  };
}

/** Verify the independent response AND its freshness request, before trusting
 * its simulated record. A valid signature alone never grants production rights. */
export function verifyFixtureAuthorityResponse(publicKey, response, expected) {
  try {
    if (!exact(response, ['schema', 'source', 'fixtureOnly', 'productionAuthorized', 'nonce', 'contextDigest', 'targetSha', 'owner', 'observedAt', 'version', 'revoked', 'approval', 'signature'])
      || response.schema !== SCHEMA || response.source !== SOURCE || response.fixtureOnly !== true || response.productionAuthorized !== false
      || response.nonce !== expected.nonce || response.contextDigest !== bindingDigest(expected.context)
      || response.targetSha !== expected.context.targetSha || response.owner !== expected.context.owner
      || response.approval?.purpose !== expected.purpose || response.version !== 1 || response.revoked !== false
      || typeof response.signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(response.signature)) return false;
    const { signature, ...body } = response;
    if (!verify(null, bytes(body), publicKey, Buffer.from(signature, 'base64'))) return false;
    const captured = Date.parse(response.observedAt), now = Date.now();
    if (!Number.isFinite(captured) || new Date(captured).toISOString() !== response.observedAt
      || captured < expected.requestedAt || captured > now || now - captured > 10000
      || captured < Date.parse(expected.context.window.start) || now >= Date.parse(expected.context.window.end)) return false;
    const a = response.approval, r = a.serverRecord;
    const { rawRecordSha256, ...raw } = r;
    return a.fixtureOnly === true && a.productionAuthorized === false && a.source === SOURCE
      && a.bindingDigest === response.contextDigest && a.payloadSha256 === canonicalDigest(a.payload)
      && r.source === SOURCE && r.fixtureOnly === true && r.productionAuthorized === false
      && rawRecordSha256 === canonicalDigest(raw) && Date.parse(r.submittedAt) <= captured;
  } catch { return false; }
}

async function childMain() {
  if (!process.send || process.argv[2] !== '--fixture-authority-child') fail();
  let initial, privateKey, publicKey, shutdownRequested = false; const records = new Map();
  process.on('message', request => {
    let response;
    try {
      if (shutdownRequested || !request || Buffer.byteLength(JSON.stringify(request)) > MAX_MESSAGE || typeof request.id !== 'string') fail();
      if (request.operation === 'INIT') {
        if (initial || !exact(request, ['id', 'operation', 'value'])) fail();
        initial = validateInitial(request.value);
        ({ privateKey, publicKey } = generateKeyPairSync('ed25519'));
        for (const record of initial.records) {
          const approval = prepareFixtureAuthorityApproval(initial, record.purpose);
          records.set(record.purpose, { approval, version: 1, revoked: false });
        }
        response = { publicKey: publicKey.export({ type: 'spki', format: 'pem' }), source: SOURCE, fixtureOnly: true, productionAuthorized: false };
      } else if (request.operation === 'READ') {
        if (!initial || !exact(request, ['id', 'operation', 'purpose', 'nonce']) || !/^[0-9a-f-]{36}$/.test(request.nonce)) fail();
        const record = records.get(request.purpose); if (!record) fail();
        const body = { schema: SCHEMA, source: SOURCE, fixtureOnly: true, productionAuthorized: false, nonce: request.nonce,
          contextDigest: bindingDigest(initial.context), targetSha: initial.context.targetSha, owner: initial.context.owner,
          observedAt: new Date().toISOString(), ...record };
        response = { ...body, signature: sign(null, bytes(body), privateKey).toString('base64') };
      } else if (request.operation === 'REVOKE') {
        if (!initial || !exact(request, ['id', 'operation', 'purpose'])) fail();
        const record = records.get(request.purpose); if (!record || record.revoked) fail();
        record.revoked = true; record.version++;
        response = { revoked: true, version: record.version };
      } else if (request.operation === 'CLOSE') {
        if (!initial || !exact(request, ['id', 'operation'])) fail();
        // Only the child closes IPC on normal completion. Node20 parent-side
        // disconnect does not deliver original ChildProcess close accounting.
        shutdownRequested = true;
        process.send({ id: request.id, ok: true, value: { closing: true } }, () => process.disconnect());
        return;
      } else fail();
      process.send({ id: request.id, ok: true, value: response });
    } catch { process.send({ id: request?.id, ok: false }); }
  });
  process.on('disconnect', () => { privateKey = null; });
}

/** Start only from a trusted fixture supervisor, before handing reader to the
 * runner. Reader has no issue/revoke/update/sign capability. Every verification
 * re-reads the original child; no response/approval cache authorizes operations. */
export async function openFixtureAuthority(value, { timeoutMs = 10000, registerOwnedChild = () => {} } = {}) {
  const initial = validateInitial(value), context = initial.context;
  const startupBudget = budget(timeoutMs); startupBudget();
  if (typeof registerOwnedChild !== 'function') fail();
  const child = fork(fileURLToPath(import.meta.url), ['--fixture-authority-child'], {
    execPath: process.execPath, execArgv: [], env: { PATH: process.env.PATH || '/usr/bin:/bin' }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  let closed = false, fatal = false, closing, cleanupFailed = false, requestedSignal = null; const pending = new Map();
  const joined = new Promise(resolve => child.once('close', (...args) => { closed = true; fatal = true; for (const p of pending.values()) p.reject(Error('FIXTURE_AUTHORITY_HOLD=CHILD_CLOSED')); pending.clear(); resolve(args); }));
  child.on('error', () => { fatal = true; for (const p of pending.values()) p.reject(Error('FIXTURE_AUTHORITY_HOLD=CHILD_ERROR')); pending.clear(); });
  const poison = () => { fatal = true; for (const p of pending.values()) p.reject(Error('FIXTURE_AUTHORITY_HOLD=UNVERIFIED')); pending.clear(); };
  child.on('message', response => {
    // Node IPC deserializes before this check. The original compiled child is
    // trusted; this is not a sandbox against malicious same-UID/root processes.
    if (!response || Buffer.byteLength(JSON.stringify(response)) > MAX_MESSAGE
      || !(exact(response, ['id','ok','value']) && response.ok === true || exact(response, ['id','ok']) && response.ok === false)) return poison();
    const entry = pending.get(response.id); if (!entry) return poison();
    pending.delete(response.id); response.ok === true ? entry.resolve(response.value) : entry.reject(Error('FIXTURE_AUTHORITY_HOLD=REQUEST_REFUSED'));
  });
  const rpc = async (operation, fields = {}, { timeoutMs = 10000, signal } = {}) => {
    if (fatal || closed || !child.connected) fail();
    if (pending.size >= MAX_PENDING) { poison(); fail(); }
    const remaining = budget(timeoutMs, signal), id = randomUUID(); let timer, abort;
    const request = { id, operation, ...fields };
    if (Buffer.byteLength(JSON.stringify(request)) > MAX_MESSAGE) { poison(); fail(); }
    try {
      const result = await new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        const cancel = () => { poison(); reject(Error('FIXTURE_AUTHORITY_HOLD=DEADLINE_OR_ABORT')); };
        timer = setTimeout(cancel, remaining()); abort = cancel; signal?.addEventListener('abort', abort, { once: true });
        const sent = child.send(request, error => { if (error) { poison(); reject(Error('FIXTURE_AUTHORITY_HOLD=SEND_FAILED')); } });
        if (!sent) { poison(); reject(Error('FIXTURE_AUTHORITY_HOLD=SEND_BACKPRESSURE')); }
      });
      try { remaining(); } catch { poison(); fail(); }
      return result;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  };
  const join = async remaining => {
    let timer;
    try {
      const result = closed ? await joined : await Promise.race([joined, new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error('FIXTURE_AUTHORITY_HOLD=CHILD_JOIN_UNVERIFIED')), remaining());
      })]);
      remaining(); if (!(result[0] === 0 && result[1] === null || result[0] === null && requestedSignal === 'SIGTERM' && result[1] === requestedSignal)) fail();
    } finally { clearTimeout(timer); }
  };
  const debtError = () => Object.assign(Error('FIXTURE_AUTHORITY_HOLD=ORIGINAL_CHILD_CLEANUP_UNVERIFIED'), {
    cleanupDebt: { childPid: child.pid, originalChildClosed: closed, manualRecoveryRequired: true, productionAuthorized: false } });
  let identity;
  const stopOwnedChild = () => {
    // This saved object is the exact locally forked fixture issuer, not a
    // discovered PID, Docker exec client, production service or remote process.
    if (!closed && child.exitCode === null && child.signalCode === null) { requestedSignal = 'SIGTERM'; child.kill(requestedSignal); }
  };
  try {
    // The supervisor registers the real child before handshake/admission.
    registerOwnedChild(child); startupBudget();
    identity = await rpc('INIT', { value: initial }, { timeoutMs: startupBudget() }); startupBudget();
    if (identity.source !== SOURCE || identity.fixtureOnly !== true || identity.productionAuthorized !== false) fail();
  } catch (error) {
    poison(); stopOwnedChild();
    try { await join(startupBudget); } catch { throw debtError(); }
    throw error;
  }
  const read = async (purpose, remaining, signal, nonce = randomUUID()) => {
    if (typeof nonce !== 'string' || !/^[0-9a-f-]{36}$/.test(nonce)) fail();
    remaining(); const requestedAt = Date.now(), response = await rpc('READ', { purpose, nonce }, { timeoutMs: remaining(), signal }); remaining();
    if (!verifyFixtureAuthorityResponse(identity.publicKey, response, { nonce, requestedAt, context, purpose })) fail();
    remaining();
    return response;
  };
  const reader = Object.freeze({ source: SOURCE, fixtureOnly: true, productionAuthorized: false,
    observeRecord: async (purpose, options = {}) => {
      try {
        if (!options || Object.getPrototypeOf(options) !== Object.prototype
          || Object.keys(options).some(k => !['nonce', 'timeoutMs', 'signal'].includes(k))) fail();
        const remaining = budget(options.timeoutMs ?? 10000, options.signal, context);
        const response = plainClone(await read(purpose, remaining, options.signal, options.nonce)); remaining(); return response;
      } catch (error) { poison(); throw error; }
    },
    readApproval: async purpose => {
      try { const remaining = budget(10000, undefined, context); const value = plainClone((await read(purpose, remaining)).approval); remaining(); return value; }
      catch (error) { poison(); throw error; }
    },
    verifyAuthority: async (approval, expected) => {
      try {
        const signal = expected?.signal, remaining = budget(expected?.timeoutMs ?? 10000, signal, context); remaining();
        const a = structuredClone(approval), { signal: ignored, ...input } = expected || {}, e = structuredClone(input); remaining();
        if (!e || !same(e.context, context) || e.bindingDigest !== bindingDigest(context) || e.targetSha !== context.targetSha) return false;
        const response = await read(e.purpose, remaining, signal);
        if (!same(response.approval, a)) return false;
        const verified = await verifyGithubMaintenanceAuthority(a, e, { verifyServerRecord: async r => same(r, response.approval.serverRecord) });
        remaining(); return verified;
      } catch { poison(); return false; }
    } });
  const controller = Object.freeze({ childPid: child.pid, publicKey: identity.publicKey,
    revoke: purpose => rpc('REVOKE', { purpose }),
    cleanupDebt: () => ({ childPid: child.pid, originalChildClosed: closed, pendingReads: pending.size, requestedSignal,
      manualRecoveryRequired: cleanupFailed || fatal && !closed, productionAuthorized: false }),
    close: ({ timeoutMs = 10000 } = {}) => {
      if (closing) return closing;
      let remaining;
      try { remaining = budget(timeoutMs); remaining(); } catch (error) { return Promise.reject(error); }
      return closing = (async () => {
      let requestFailed = false;
      try {
        try { if (!closed && child.connected && !fatal) await rpc('CLOSE', {}, { timeoutMs: remaining() }); else if (!closed) stopOwnedChild(); }
        catch { requestFailed = true; stopOwnedChild(); }
        await join(remaining);
        if (requestFailed) throw debtError();
        return { fixtureOnly: true, productionAuthorized: false, originalChildClosed: true, childPid: child.pid, requestedSignal };
      } catch { cleanupFailed = true; throw debtError(); }
    })(); } });
  return Object.freeze({ reader, controller });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await childMain();
