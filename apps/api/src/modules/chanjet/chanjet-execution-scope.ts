import { AsyncLocalStorage } from 'node:async_hooks';
import { ChanjetExecutionAdmissionStore, ExecutionContext, RequestPhase } from './chanjet-execution-admission.store';
import { ChanjetExecutionHttpGateway, ExecutionTransportOps } from './chanjet-execution-transport';

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
  /** Mutated on phase transitions; the DB re-validates phase on every call. */
  current: ExecutionContext;
};

const storage = new AsyncLocalStorage<ExecutionScopeState>();

export function withExecutionScope<T>(state: ExecutionScopeState, callback: () => Promise<T>): Promise<T> {
  return storage.run(state, callback);
}

export function activeExecutionScope(): ExecutionScopeState | undefined {
  return storage.getStore();
}

export function requireExecutionScope(): ExecutionScopeState {
  const state = storage.getStore();
  if (!state) throw new Error('CHANJET_EXECUTION_SCOPE_REQUIRED');
  return state;
}

/** Move the scoped execution to the next phase (PROBING→PROBED→SYNCING) after store.begin accepted it. */
export function beginExecutionPhase(state: ExecutionScopeState, phase: RequestPhase, leaseId: string): Promise<void> {
  return state.store.begin(state.manifest, phase, leaseId).then(row => {
    if (!row || typeof row.lease_id !== 'string') throw new Error('CHANJET_EXECUTION_SCOPE_PHASE');
    state.current = { manifest: state.manifest, leaseId, phase };
  });
}
