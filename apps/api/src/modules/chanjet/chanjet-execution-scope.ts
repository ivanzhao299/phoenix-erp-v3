import { AsyncLocalStorage } from 'node:async_hooks';
import { ChanjetExecutionAdmissionStore, ExecutionContext, RequestPhase } from './chanjet-execution-admission.store';
import { ChanjetExecutionHttpGateway, ChanjetRedirectError, ExecutionTransportOps } from './chanjet-execution-transport';

/**
 * Execution-scoped transport identity. Everything provider-HTTP inside one
 * admission execution resolves through the current scope: every send is
 * reservation-counted and cancellation-controlled by the execution gateway.
 * The scope is never populated by API request paths themselves — only an
 * orchestrator that has loaded a registered manifest may enter it, so an
 * ordinary bearer/HTTP caller can never attach admission identity.
 */
export type ExecutionScopeState = {
  manifest: unknown;
  store: ChanjetExecutionAdmissionStore;
  gateway: ChanjetExecutionHttpGateway;
  /** Scope-owned provider send operations (e.g. appTicket resend). */
  transport: ExecutionTransportOps;
  /** API-owned absolute deadline (from the registered admission row). */
  deadlineAt: Date;
  /** Mutated on phase transitions; the DB re-validates phase on every call. */
  current: ExecutionContext;
};

const storage = new AsyncLocalStorage<ExecutionScopeState>();

// While ANY execution scope is active, globalThis.fetch forbids redirect
// following: a followed redirect would be an extra provider HTTP hop to an
// unreviewed target, invisible to the reservation counter. The guard applies
// to every fetch during the window (fail-closed for non-execution traffic
// too) and is refcounted across nested/parallel scopes. Restored on exit.
let scopeDepth = 0;
let originalFetch: typeof globalThis.fetch | undefined;
function installFetchGuard(): void {
  scopeDepth += 1;
  if (scopeDepth > 1 || originalFetch) return;
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await originalFetch!(input, { ...(init ?? {}), redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) throw new ChanjetRedirectError(res.status);
    return res;
  }) as typeof globalThis.fetch;
}
function uninstallFetchGuard(): void {
  scopeDepth = Math.max(0, scopeDepth - 1);
  if (scopeDepth === 0 && originalFetch) {
    globalThis.fetch = originalFetch;
    originalFetch = undefined;
  }
}

export function withExecutionScope<T>(state: ExecutionScopeState, callback: () => Promise<T>): Promise<T> {
  installFetchGuard();
  return storage.run(state, callback).finally(uninstallFetchGuard);
}

export function activeExecutionScope(): ExecutionScopeState | undefined {
  return storage.getStore();
}

export function requireExecutionScope(): ExecutionScopeState {
  const state = storage.getStore();
  if (!state) throw new Error('CHANJET_EXECUTION_SCOPE_REQUIRED');
  return state;
}

/** API-owned absolute deadline; hydrated once from the admission row when the
 *  scope creator did not supply it. */
export async function resolveExecutionDeadline(state: ExecutionScopeState): Promise<Date | undefined> {
  if (state.deadlineAt instanceof Date) return state.deadlineAt;
  const row = await state.store.load(state.manifest).catch(() => null);
  if (row?.deadline_at instanceof Date) {
    state.deadlineAt = row.deadline_at;
    return state.deadlineAt;
  }
  return undefined;
}

/** Move the scoped execution to the next phase (PROBING→PROBED→SYNCING) after store.begin accepted it. */
export function beginExecutionPhase(state: ExecutionScopeState, phase: RequestPhase, leaseId: string): Promise<void> {
  return state.store.begin(state.manifest, phase, leaseId).then(row => {
    if (!row || typeof row.lease_id !== 'string' || !(row.deadline_at instanceof Date)) throw new Error('CHANJET_EXECUTION_SCOPE_PHASE');
    state.current = { manifest: state.manifest, leaseId, phase };
    state.deadlineAt = row.deadline_at;
  });
}
