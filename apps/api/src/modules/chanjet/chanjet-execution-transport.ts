import { ChanjetExecutionAdmissionStore, ExecutionContext, RequestKind, RequestResult } from './chanjet-execution-admission.store';
import { validateExecutionManifest } from './chanjet-execution-manifest';

export type { RequestKind };

/**
 * Typed outcome of one counted provider HTTP attempt. An ACK records that the
 * committed reservation's attempt reached a terminal state (response received
 * or transport error) — it never asserts business success. BUSINESS_FAILURE is
 * a fully documented exchange the sync verifier judges later; TRANSPORT_FAILURE
 * (including gateway-deadline cancellation) poisons the gateway: no further
 * send may leave this process for the execution, and the caller must HOLD.
 */
export type ExecutionSendOutcome = 'OK' | 'BUSINESS_FAILURE' | 'TRANSPORT_FAILURE';

export interface ExecutionSendResult<T> {
  outcome: ExecutionSendOutcome;
  value?: T;
  error?: unknown;
  ticket: string;
  ordinal: number;
  /** min(manifest.httpTimeoutMs, admission deadline remaining at send time) */
  effectiveDeadlineMs: number;
  /** true when the gateway itself cancelled the in-flight HTTP (deadline/stop) */
  cancelled: boolean;
}

export type ExecutionSendOperation<T> = (signal: AbortSignal, deadlineMs: number) => Promise<T>;
/** Auth-service send operations additionally receive the provider base URL. */
export type ProviderSendOperation<T> = (signal: AbortSignal, deadlineMs: number, baseUrl: string) => Promise<T>;
/** Scope-owned transport operations: created by the orchestrator at scope
 *  construction (provider endpoint closed over there), never referenced from
 *  the service singleton's startup graph. */
export type ExecutionTransportOps = {
  resend: ExecutionSendOperation<Record<string, unknown>>;
};

/** Raised by send operations for documented business-level rejections (HTTP exchange completed). */
export class ChanjetBusinessFailureError extends Error {
  constructor(readonly payload: unknown, message = 'CHANJET_BUSINESS_FAILURE') {
    super(message);
  }
}

/** Raised for the provider token-invalid envelope (code 50107): a completed,
 *  documented exchange classified before generic business-failure handling so
 *  the single controlled retry is reachable for every envelope shape.
 *  Business-classified on purpose: the retry stays reachable, the failed
 *  receipt is durable evidence, and it can never prove phase completion. */
export class ChanjetTokenInvalidError extends ChanjetBusinessFailureError {
  constructor(readonly payload: Record<string, unknown>) {
    super(payload, 'CHANJET_TOKEN_INVALID_50107');
  }
}

/**
 * The ONLY sanctioned provider fetch for execution send operations:
 * redirects are never followed (each hop would be an uncounted provider HTTP
 * attempt to an unreviewed target) and any 3xx raises ChanjetRedirectError,
 * which poisons the execution. Callers classify non-2xx responses themselves
 * (ChanjetBusinessFailureError / ChanjetTokenInvalidError).
 */
export async function providerFetch(url: string, init: RequestInit & { signal: AbortSignal }): Promise<Response> {
  const res = await fetch(url, { ...init, redirect: 'manual' });
  if (res.status >= 300 && res.status < 400) throw new ChanjetRedirectError(res.status);
  return res;
}

/** Raised when a provider responds with a redirect: redirects are never
 *  followed — each hop would be a provider HTTP attempt outside the counted
 *  reservation, and the redirect target is unreviewed. Poisons the execution. */
export class ChanjetRedirectError extends Error {
  constructor(readonly status: number) {
    super(`CHANJET_REDIRECT_NOT_FOLLOWED:${status}`);
  }
}

export class ChanjetExecutionHttpGateway {
  private stopped = false;
  private stopReason = 'UNKNOWN';

  /**
   * postReserveBarrier is a deterministic test seam: it runs AFTER the
   * reservation is durably committed and BEFORE the revalidation/send, so a
   * concurrent stop can be injected into exactly that window.
   */
  constructor(
    private readonly store: ChanjetExecutionAdmissionStore,
    private readonly manifest: unknown,
    private readonly options: { postReserveBarrier?: (reservation: { ticket: string; ordinal: number }, context: ExecutionContext) => Promise<void> } = {},
  ) {}

  /** Effective single-request budget from the registered manifest. */
  httpTimeoutMs(): number {
    return validateExecutionManifest(this.manifest).manifest.httpTimeoutMs;
  }

  requireUsable(): void {
    if (this.stopped) throw new Error(`CHANJET_EXECUTION_STOPPED:${this.stopReason}`);
  }

  private stop(reason: string): void {
    this.stopped = true;
    this.stopReason = reason;
  }

  /**
   * One counted, deadline-bounded provider HTTP attempt:
   * reserve (persisted, ordinal) -> send under a real AbortController ->
   * acknowledge the receipt exactly once for any terminal outcome.
   * Reserve/acknowledge failures poison the gateway — an ambiguous commit
   * must never be followed by another send.
   */
  async send<T>(context: ExecutionContext, kind: RequestKind, op: ExecutionSendOperation<T>): Promise<ExecutionSendResult<T>> {
    this.requireUsable();
    let reservation;
    try {
      reservation = await this.store.reserve(context, kind);
    } catch (error) {
      // Any reserve failure poisons this gateway; when the commit outcome is
      // unknown the receipt may exist — persist the stop so no process can
      // build on an unverifiable state.
      this.stop('RESERVE_HOLD');
      await this.store.holdExecution(context, 'RESERVE_UNVERIFIED').catch(() => undefined);
      throw error;
    }
    if (!reservation || typeof reservation.ticket !== 'string' || !(reservation.deadlineAt instanceof Date)) {
      this.stop('RESERVE_UNAVAILABLE');
      throw new Error('CHANJET_EXECUTION_RESERVE_UNAVAILABLE');
    }
    // Revalidate AFTER the reservation is durably committed and BEFORE any
    // byte leaves: a concurrent persistent stop (from any connection) must
    // yield zero HTTP. The committed receipt stays RESERVED as evidence —
    // never refunded, never deleted.
    if (this.options.postReserveBarrier) await this.options.postReserveBarrier(reservation, context);
    await this.store.assertSendable(context);
    const remaining = reservation.deadlineAt.getTime() - Date.now();
    const effectiveDeadlineMs = Math.max(0, Math.min(this.httpTimeoutMs(), remaining));
    if (effectiveDeadlineMs <= 0) {
      // The reservation is committed but nothing was sent: the receipt stays
      // RESERVED as evidence and the store records the deadline HOLD on its
      // next interaction. Never send past the deadline to salvage the count.
      this.stop('DEADLINE_EXHAUSTED_AFTER_RESERVE');
      throw new Error('CHANJET_EXECUTION_DEADLINE');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('CHANJET_EXECUTION_DEADLINE')), effectiveDeadlineMs);
    let outcome: ExecutionSendOutcome = 'OK';
    let value: T | undefined;
    let error: unknown;
    let cancelled = false;
    try {
      value = await op(controller.signal, effectiveDeadlineMs);
    } catch (caught) {
      if (caught instanceof ChanjetRedirectError) {
        // A redirect would be another provider HTTP hop to an unreviewed
        // target — treated as a transport-level execution failure.
        cancelled = controller.signal.aborted;
        outcome = 'TRANSPORT_FAILURE';
      } else if (controller.signal.aborted) {
        cancelled = true;
        outcome = 'TRANSPORT_FAILURE';
      } else if (caught instanceof ChanjetBusinessFailureError) {
        outcome = 'BUSINESS_FAILURE';
      } else {
        outcome = 'TRANSPORT_FAILURE';
      }
      error = caught;
    } finally {
      clearTimeout(timer);
    }
    // The acknowledgement result is the durable evidence: OK marks a usable
    // exchange; BUSINESS_FAILURE/TRANSPORT_FAILURE are recorded attempts that
    // can never satisfy a phase-completion proof.
    const result: RequestResult = outcome === 'OK' ? 'OK' : outcome;
    try {
      await this.store.acknowledge(context, reservation.ticket, result);
    } catch (ackError) {
      this.stop('ACK_UNVERIFIED');
      await this.store.holdExecution(context, 'ACK_UNVERIFIED').catch(() => undefined);
      throw Object.assign(new Error('CHANJET_EXECUTION_ACK_UNVERIFIED'), { cause: ackError });
    }
    if (cancelled || outcome === 'TRANSPORT_FAILURE') {
      // Persist the stop beyond this process: every later send, in any
      // gateway, connection or process, fails closed against the DB.
      this.stop(cancelled ? 'TRANSPORT_CANCELLED' : 'TRANSPORT_FAILURE');
      await this.store.holdExecution(context, cancelled ? 'CANCELLED' : 'TRANSPORT_FAILURE').catch(() => undefined);
    }
    return { outcome, value, error, ticket: reservation.ticket, ordinal: reservation.ordinal, effectiveDeadlineMs, cancelled };
  }
}
