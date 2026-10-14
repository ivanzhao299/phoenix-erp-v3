import { ChanjetExecutionAdmissionStore, ExecutionContext, RequestKind } from './chanjet-execution-admission.store';
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

/** Raised by send operations for documented business-level rejections (HTTP exchange completed). */
export class ChanjetBusinessFailureError extends Error {
  constructor(readonly payload: unknown, message = 'CHANJET_BUSINESS_FAILURE') {
    super(message);
  }
}

export class ChanjetExecutionHttpGateway {
  private stopped = false;
  private stopReason = 'UNKNOWN';

  constructor(private readonly store: ChanjetExecutionAdmissionStore, private readonly manifest: unknown) {}

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
      // Any reserve hold (cap, deadline, identity, drift) poisons this gateway:
      // the DB has ruled and this process must not send again for the run.
      this.stop('RESERVE_HOLD');
      throw error;
    }
    if (!reservation || typeof reservation.ticket !== 'string' || !(reservation.deadlineAt instanceof Date)) {
      this.stop('RESERVE_UNAVAILABLE');
      throw new Error('CHANJET_EXECUTION_RESERVE_UNAVAILABLE');
    }
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
      if (controller.signal.aborted) {
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
    try {
      await this.store.acknowledge(context, reservation.ticket);
    } catch (ackError) {
      this.stop('ACK_UNVERIFIED');
      throw Object.assign(new Error('CHANJET_EXECUTION_ACK_UNVERIFIED'), { cause: ackError });
    }
    if (cancelled) this.stop('TRANSPORT_CANCELLED');
    else if (outcome === 'TRANSPORT_FAILURE') this.stop('TRANSPORT_FAILURE');
    return { outcome, value, error, ticket: reservation.ticket, ordinal: reservation.ordinal, effectiveDeadlineMs, cancelled };
  }
}
