import { AsyncLocalStorage } from 'node:async_hooks';
import { ChanjetExecutionAdmissionStore, ExecutionContext, RequestPhase } from './chanjet-execution-admission.store';
import { validateExecutionManifest } from './chanjet-execution-manifest';
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
  /** API-owned absolute deadline (from the registered admission row). */
  deadlineAt: Date;
  /** Mutated on phase transitions; the DB re-validates phase on every call. */
  current: ExecutionContext;
};

const storage = new AsyncLocalStorage<ExecutionScopeState>();

// NOTE (review hardening): there is deliberately NO globalThis.fetch
// replacement anywhere in the execution transport. Redirect prevention lives
// exclusively inside the controlled provider send interface (providerFetch:
// redirect:'manual' + 3xx -> ChanjetRedirectError) and therefore only affects
// provider calls — unrelated modules, ordinary loopback requests and the
// independent token cron keep stock fetch semantics.

export function withExecutionScope<T>(state: ExecutionScopeState, callback: () => Promise<T>): Promise<T> {
  return storage.run(state, callback);
}

export function activeExecutionScope(): ExecutionScopeState | undefined {
  return storage.getStore();
}

/** COMMIT verdict semantics by SQLSTATE. An explicit server rejection whose
 *  class proves a rolled-back transaction is fail-closed; connection-class
 *  results (SQLSTATE class 08, incl. 08007 transaction_resolution_unknown),
 *  statement_completion_unknown (40003) and lost responses (no SQLSTATE at
 *  all) can never prove a rollback — their verdict is genuinely UNKNOWN. */
export function isCommitVerdictUnknown(error: unknown): boolean {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  if (typeof code !== 'string' || !/^[0-9A-Z]{5}$/.test(code)) return true;
  if (code === '40003' || code.startsWith('08')) return true;
  return false;
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

/**
 * Mirror-write boundary gate for the ambient execution: legacy paths (no
 * active scope — token cron, scheduled runs) pass through untouched; inside a
 * scope the admission row is re-checked under lock (bounded by the DB-owned
 * deadline) and a held/expired execution refuses before any mirror write.
 */
export async function executionWriteGate(): Promise<void> {
  const state = storage.getStore();
  if (!state) return;
  await state.store.assertWritable(state.current);
}

/**
 * SAME-TRANSACTION mirror-write gate: runs the admission liveness check on
 * the GIVEN transaction connection so the check and the mirror writes it
 * guards share one transaction boundary. With forUpdate the admission row is
 * locked until that transaction commits (a concurrent HOLD waits behind the
 * gated writes); without it a plain bounded check is performed (usable per
 * row inside long write loops — a landed HOLD refuses and the whole
 * transaction rolls back to zero writes). Outside an active scope this is a
 * no-op (legacy paths unchanged).
 */
export async function executionWriteGateTx(
  tx: { query(sql: string, parameters?: unknown[]): Promise<unknown[]> },
  current: ExecutionContext,
  options: { forUpdate?: boolean } = {},
): Promise<void> {
  if (!storage.getStore()) return;
  const { manifest } = validateExecutionManifest(current.manifest);
  const deadlineAt = current.deadlineAt instanceof Date ? current.deadlineAt.getTime() : Number.NaN;
  const remaining = Number.isFinite(deadlineAt) ? deadlineAt - Date.now() : Number.NaN;
  if (!Number.isFinite(remaining) || remaining <= 1) throw new Error('CHANJET_EXECUTION_DEADLINE');
  await tx.query(`SET LOCAL statement_timeout=${Math.min(remaining, 15_000)}`);
  await tx.query(`SET LOCAL lock_timeout=${Math.min(remaining, 1_000)}`);
  const rows = await tx.query(
    `SELECT phase, hold_reason, lease_id FROM chanjet_execution_admissions
      WHERE execution_id=$1${options.forUpdate ? ' FOR UPDATE' : ''}`,
    [manifest.executionId],
  ) as Array<{ phase: string; hold_reason: string; lease_id: string }>;
  const row = rows[0];
  if (!row || row.phase !== 'SYNCING' || row.hold_reason !== '' || row.lease_id !== current.leaseId) {
    throw new Error('CHANJET_ADMISSION_HOLD');
  }
}

/** Move the scoped execution to the next phase (PROBING→PROBED→SYNCING) after store.begin accepted it. */
export function beginExecutionPhase(state: ExecutionScopeState, phase: RequestPhase, leaseId: string): Promise<void> {
  return state.store.begin(state.manifest, phase, leaseId).then(row => {
    if (!row || typeof row.lease_id !== 'string' || !(row.deadline_at instanceof Date)) throw new Error('CHANJET_EXECUTION_SCOPE_PHASE');
    state.current = { manifest: state.manifest, leaseId, phase };
    state.deadlineAt = row.deadline_at;
  });
}
