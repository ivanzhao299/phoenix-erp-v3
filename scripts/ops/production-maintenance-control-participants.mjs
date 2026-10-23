/** Ownership of fixed, long-lived read controllers only. Registration is not
 * authority to launch a process, approve a release, drain work or remove a fence.
 * Only a compiled factory supplies these functions; no plan/CLI selects them. */
import { ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { bindingDigest, canonicalDigest, same, validateMaintenanceContext, HASH } from './production-maintenance-receipts.mjs';

export const CONTROL_PARTICIPANT_ROLES = Object.freeze(['AUTHORITY_READER', 'EVIDENCE_RECORDER', 'INGRESS_OBSERVER']);
const fail = code => Error('MAINTENANCE_PARTICIPANT_HOLD=' + code);
const sha = value => createHash('sha256').update(value).digest('hex');
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && same(Object.keys(value).sort(), [...keys].sort());
const validBudget = value => Number.isSafeInteger(value) && value >= 1 && value <= 30000;

/** The same entry/close promise follows PENDING -> READY -> CLOSING -> CLOSED.
 * A step can retain healthy controllers; only final closure can say graphClosed.
 * Probe/stop protocols are compiled factory dependencies, not JSON assertions.
 * The factory must independently verify each protocol response's provenance. */
export class MaintenanceControlParticipants {
  #context; #definitions; #entries = new Map(); #pending = new Set(); #unregisteredStarts = new Set();
  #rejectedRegistrations = [];
  #failureListeners = new Set();
  #fatal = null; #started = false; #closing = false; #closeTask = null; #checkTask = null; #closeVerified = false; #closeWasVerified = false; #observationTask = null;
  constructor({ context, definitions }) {
    validateMaintenanceContext(context);
    if (!Array.isArray(definitions) || definitions.length !== CONTROL_PARTICIPANT_ROLES.length) throw fail('ALL_FIXED_ROLES_REQUIRED');
    this.#context = structuredClone(context);
    const seen = new Set();
    this.#definitions = definitions.map(definition => {
      if (!exact(definition, ['role', 'sourceSha256', 'start', 'probe', 'close'])
        || !CONTROL_PARTICIPANT_ROLES.includes(definition.role) || seen.has(definition.role)
        || !HASH.test(definition.sourceSha256 || '')
        || ['start', 'probe', 'close'].some(k => typeof definition[k] !== 'function')) throw fail('FIXED_DEFINITION_REQUIRED');
      seen.add(definition.role); return Object.freeze({ ...definition });
    }).sort((a, b) => CONTROL_PARTICIPANT_ROLES.indexOf(a.role) - CONTROL_PARTICIPANT_ROLES.indexOf(b.role));
  }
  #poison(error) {
    const first = this.#fatal === null;
    this.#fatal ||= /^MAINTENANCE_PARTICIPANT_HOLD=[A-Z_]+$/.test(error?.message || '') ? error : fail('PROTOCOL_UNVERIFIED');
    // Redacted diagnostic only: the wrapped cause's class and message.
    this.#fatal.participantUnderlying ??= { name: error?.name || null, message: String(error?.message ?? error).slice(0, 200) };
    for (const entry of this.#pending) if (!entry.cleanup) entry.controller.abort();
    if (first) for (const listener of this.#failureListeners) { try { listener(this.#fatal); } catch { /* Cannot rehabilitate failure. */ } }
    return this.#fatal;
  }
  subscribeFailure(listener) {
    if (typeof listener !== 'function') throw fail('FIXED_FAILURE_LISTENER_REQUIRED');
    this.#failureListeners.add(listener); if (this.#fatal) listener(this.#fatal);
    return () => this.#failureListeners.delete(listener);
  }
  #budget(timeoutMs, signal, cleanup = false) {
    if (!validBudget(timeoutMs) || (signal && !(signal instanceof AbortSignal))) throw fail('FIXED_BUDGET_REQUIRED');
    const start = performance.now(), wall = Date.now(); let last = start, lastWall = wall;
    const remaining = () => {
      const at = performance.now(), w = Date.now();
      if (![start, wall, at, w].every(Number.isFinite) || at < last || w < lastWall
        || at - start >= timeoutMs || w - wall >= timeoutMs || signal?.aborted
        || (!cleanup && (w < Date.parse(this.#context.window.start) || w >= Date.parse(this.#context.window.end)))) throw fail('DEADLINE_OR_ABORT');
      last = at; lastWall = w;
      return Math.max(1, Math.floor(Math.min(timeoutMs - (at - start), timeoutMs - (w - wall),
        cleanup ? Infinity : Date.parse(this.#context.window.end) - w)));
    };
    return remaining;
  }
  async #wait(action, remaining, signal, cleanup = false) {
    if (!cleanup && (this.#fatal || this.#closing)) throw this.#fatal || fail('CLOSING');
    if (!cleanup && [...this.#pending].filter(p => !p.cleanup).length >= 16) throw this.#poison(fail('CONTROL_QUEUE_LIMIT'));
    const controller = new AbortController(), entry = { controller, work: null, cleanup }; let timer;
    remaining();
    const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true });
    try {
      this.#pending.add(entry);
      let settled = false;
      entry.work = Promise.resolve().then(() => { remaining(); return action({ signal: controller.signal, timeoutMs: remaining() }); });
      entry.work.then(() => { settled = true; this.#pending.delete(entry); }, () => { settled = true; this.#pending.delete(entry); });
      const result = await Promise.race([entry.work, new Promise((_, reject) => {
        // Under event-loop starvation (synchronous promotion work on the
        // shared single-threaded session) a healthy worker reply can already
        // be queued behind this timer's deadline. Grant exactly one loop
        // turn before declaring the deadline so replies win their race.
        timer = setTimeout(() => {
          setImmediate(() => { if (!settled) { controller.abort(); reject(fail('DEADLINE_OR_ABORT')); } });
        }, remaining());
        controller.signal.addEventListener('abort', () => reject(fail('DEADLINE_OR_ABORT')), { once: true });
      })]); remaining(); return result;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); if (!entry.work) this.#pending.delete(entry); }
  }
  #register(definition, child) {
    if (!(child instanceof ChildProcess) || !Number.isSafeInteger(child.pid) || child.pid < 1 || child.killed
      || child.exitCode !== null || child.signalCode !== null || !child.connected || this.#closing || this.#fatal
      || this.#entries.has(definition.role) || [...this.#entries.values()].some(e => e.child === child || e.pid === child.pid)
      || !Array.isArray(child.spawnargs) || child.spawnargs.some(x => typeof x !== 'string')) {
      // Never erase a failed second spawn merely because this role's first
      // registered child later closes. This is permanent unknown-attempt debt;
      // the graph does not signal or adopt an unverified rejected child.
      const debt = { role: definition.role, pid: Number.isSafeInteger(child?.pid) ? child.pid : null, originalCloseObserved: false };
      this.#closeVerified = false;
      if (child instanceof ChildProcess) child.once('close', () => { debt.originalCloseObserved = true; });
      this.#rejectedRegistrations.push(debt);
      throw this.#poison(fail('ORIGINAL_CHILD_REGISTRATION_REQUIRED'));
    }
    const entry = { role: definition.role, sourceSha256: definition.sourceSha256, child, pid: child.pid,
      argvSha256: sha(JSON.stringify(child.spawnargs)), phase: 'PENDING', client: null, closed: false, close: null, lastProbe: null };
    entry.close = new Promise(resolve => child.once('close', (code, signal) => { entry.closed = true; entry.exit = { code, signal }; resolve(); }));
    const lost = () => { if (entry.phase !== 'CLOSING' && entry.phase !== 'CLOSED') this.#poison(fail('UNEXPECTED_PARTICIPANT_LOSS')); };
    child.once('exit', lost); child.once('error', lost); child.once('disconnect', lost);
    this.#entries.set(definition.role, entry); this.#unregisteredStarts.delete(definition.role);
    return { registered: true, role: entry.role, pid: entry.pid, originalCloseOwned: true };
  }
  #assertOriginal(entry, ready = true) {
    if (!entry || (ready && entry.phase !== 'READY') || entry.closed || entry.child.killed
      || entry.child.pid !== entry.pid || entry.child.exitCode !== null || entry.child.signalCode !== null || !entry.child.connected
      || sha(JSON.stringify(entry.child.spawnargs)) !== entry.argvSha256) throw this.#poison(fail('ORIGINAL_PARTICIPANT_LOST'));
  }
  async #probe(definition, entry, remaining, signal) {
    if (this.#fatal) throw this.#fatal;
    this.#assertOriginal(entry, false); const nonce = randomUUID();
    // The batch budget can exceed one worker RPC budget; clamp each probe to
    // the worker transport's own fixed cap instead of refusing it outright.
    const response = await this.#wait(options => definition.probe(entry.client, { ...options, timeoutMs: Math.min(options.timeoutMs, 30000), nonce }), remaining, signal);
    if (this.#fatal) throw this.#fatal;
    this.#assertOriginal(entry, false);
    if (!exact(response, ['schema', 'role', 'owner', 'contextDigest', 'sourceSha256', 'childPid', 'nonce', 'healthy', 'pending', 'protocolVersion'])
      || response.schema !== 'phoenix.maintenance-control-participant-health/v1' || response.role !== entry.role
      || response.owner !== this.#context.owner || response.contextDigest !== bindingDigest(this.#context)
      || response.sourceSha256 !== entry.sourceSha256 || response.childPid !== entry.pid || response.nonce !== nonce
      || response.healthy !== true || response.pending !== 0 || response.protocolVersion !== 1) throw this.#poison(fail('PARTICIPANT_HEALTH_UNVERIFIED'));
    entry.lastProbe = canonicalDigest(response); remaining();
  }
  async bootstrap({ timeoutMs = 10000, signal } = {}) {
    if (this.#started || this.#closing || this.#fatal) throw fail('BOOTSTRAP_ALREADY_USED');
    const remaining = this.#budget(timeoutMs, signal); this.#started = true;
    try {
      for (const definition of this.#definitions) {
        this.#unregisteredStarts.add(definition.role);
        const client = await this.#wait(async options => {
          const handle = await definition.start({ ...options, registerOwnedChild: child => this.#register(definition, child) });
          // Retain a late completed start handle for cleanup even when the
          // outer deadline already rejected it. It grants no further admission.
          const registered = this.#entries.get(definition.role); if (registered) registered.client = handle;
          return handle;
        }, remaining, signal);
        const entry = this.#entries.get(definition.role);
        if (!entry || !client || typeof client !== 'object') throw fail('REGISTER_BEFORE_HANDSHAKE_REQUIRED');
        if (this.#closing || this.#fatal) throw fail('BOOTSTRAP_INTERRUPTED');
        entry.client = client; await this.#probe(definition, entry, remaining, signal); entry.phase = 'READY';
      }
      this.assertLive(); return this.inventory();
    } catch (error) { throw this.#poison(error); }
  }
  assertLive() {
    if (this.#fatal) throw this.#fatal;
    if (!this.#started || this.#closing || this.#entries.size !== this.#definitions.length) throw fail('BOOTSTRAP_NOT_READY');
    for (const entry of this.#entries.values()) this.#assertOriginal(entry);
  }
  async check({ timeoutMs = 10000, signal } = {}) {
    this.assertLive(); const remaining = this.#budget(timeoutMs, signal);
    while(this.#observationTask) await this.#wait(()=>this.#observationTask,remaining,signal);
    remaining();this.assertLive();
    // Concurrent step/monitor waiters join only the current live probe batch;
    // neither a completed snapshot nor a reset deadline is reused. The batch
    // runs on its own self-contained budget with no caller signal: one
    // caller's abandonment (a session read timeout aborting its signal) must
    // not execute the shared probes for every other live waiter. Genuine
    // probe overshoot of the batch budget, or any protocol failure, still
    // poisons the graph permanently.
    if (!this.#checkTask) {
      this.#checkTask = (async () => {
        try {
          for (const d of this.#definitions) {
            // Each probe gets its own full fixed budget with no caller signal:
            // one caller's abandonment cannot execute the shared probes, and a
            // saturated exclusive-VM event loop slows the batch as a whole
            // without any single probe exceeding its own bound.
            await this.#probe(d, this.#entries.get(d.role), this.#budget(30000));
          }
          this.assertLive();
        } catch (error) { throw this.#poison(error); }
      })();
      const original = this.#checkTask;
      original.then(() => { if (this.#checkTask === original) this.#checkTask = null; }, () => { if (this.#checkTask === original) this.#checkTask = null; });
    }
    const batch = this.#checkTask;
    // A joining caller's own deadline or abort is transient for the graph:
    // rethrow it without poisoning so the next caller re-probes healthy
    // participants. The batch's own failure path above remains permanent.
    try { await this.#wait(() => batch, remaining, signal); this.assertLive(); return this.inventory(); }
    catch (error) {
      if (error?.message === 'MAINTENANCE_PARTICIPANT_HOLD=DEADLINE_OR_ABORT') throw error;
      throw this.#poison(error);
    }
  }
  /** Join real in-progress HEALTH work, then take one synchronous host
   * snapshot. Reservation precedes await so no queued monitor can start a new
   * helper during capture. This grants no task drain or release authority. */
  async observeQuiescent(observer,{timeoutMs=10000,signal}={}) {
    this.assertLive();const remaining=this.#budget(timeoutMs,signal);
    if(typeof observer!=='function')throw fail('SYNCHRONOUS_OBSERVER_REQUIRED');
    while(this.#observationTask)await this.#wait(()=>this.#observationTask,remaining,signal);
    let release;const reservation=new Promise(resolve=>{release=resolve;});this.#observationTask=reservation;
    try{
      while(this.#checkTask){const current=this.#checkTask;await this.#wait(()=>current,remaining,signal);}
      remaining();this.assertLive();
      const value=observer();
      if(value&&typeof value.then==='function')throw fail('SYNCHRONOUS_OBSERVER_REQUIRED');
      remaining();this.assertLive();return value;
    }catch(error){
      // The joining caller's own deadline/abort is transient for the graph,
      // exactly as in check(): the next caller re-observes healthy state.
      if(error?.message==='MAINTENANCE_PARTICIPANT_HOLD=DEADLINE_OR_ABORT')throw error;
      if(/^MAINTENANCE_PARTICIPANT_HOLD=/.test(error?.message||''))throw this.#poison(error);
      throw error;
    }finally{if(this.#observationTask===reservation)this.#observationTask=null;release();}
  }
  inventory() {
    return { schema: 'phoenix.maintenance-control-participant-inventory/v1', owner: this.#context.owner,
      contextDigest: bindingDigest(this.#context), graphClosed: this.#closeVerified, lifecycleOnly: true, admissionOrApprovalGranted: false,
      participants: [...this.#entries.values()].map(e => ({ role: e.role, pid: e.pid, sourceSha256: e.sourceSha256,
        argvSha256: e.argvSha256, phase: e.phase, originalCloseObserved: e.closed, exit: e.exit ? { ...e.exit } : null, lastProbeSha256: e.lastProbe })),
      pendingProtocols: this.#pending.size, unregisteredStartRoles: [...this.#unregisteredStarts],
      rejectedRegistrations: structuredClone(this.#rejectedRegistrations) };
  }
  close({ timeoutMs = 10000 } = {}) {
    if (this.#closeTask) return this.#closeWasVerified && !this.#closeVerified ? Promise.reject(fail('CLOSE_HISTORY_INVALIDATED')) : this.#closeTask;
    if (!validBudget(timeoutMs)) return Promise.reject(fail('FIXED_BUDGET_REQUIRED'));
    this.#closing = true;
    return this.#closeTask = (async () => {
      const remaining = this.#budget(timeoutMs, undefined, true);
      try {
        for (const p of this.#pending) if (!p.cleanup) p.controller.abort();
        const pending = [...this.#pending].map(p => p.work);
        await this.#wait(() => Promise.allSettled(pending), remaining, undefined, true);
        // Reverse dependency order: ingress observer, recorder, authority last.
        // This ends observation only. The durable fence is NEVER removed here.
        for (const definition of [...this.#definitions].reverse()) {
          const entry = this.#entries.get(definition.role); if (!entry) continue;
          entry.phase = 'CLOSING';
          if (entry.client) await this.#wait(options => definition.close(entry.client, options), remaining, undefined, true);
          // A failed bootstrap must still provide a typed cleanup handle through
          // its registered client; otherwise preserve actual child debt/HOLD.
          await this.#wait(() => entry.close, remaining, undefined, true);
          if (!entry.closed || entry.exit?.code !== 0 || entry.exit.signal !== null) throw fail('ORIGINAL_CLOSE_UNVERIFIED'); entry.phase = 'CLOSED';
        }
        if ([...this.#entries.values()].some(e => !e.closed) || this.#pending.size || this.#unregisteredStarts.size
          || this.#rejectedRegistrations.length) throw fail('GRAPH_NOT_CLOSED');
        this.#closeVerified = true; this.#closeWasVerified = true;
        return { ...this.inventory(), pendingProtocols: 0, outcome: 'ORIGINAL_CONTROLLERS_CLOSED', productionAuthority: false };
      } catch (error) {
        const poisoned = this.#poison(error);
        poisoned.closeUnderlying ??= String(error?.message ?? error).slice(0, 200);
        throw fail('CLOSE_UNVERIFIED_MANUAL_RECOVERY_REQUIRED');
      }
    })();
  }
}
