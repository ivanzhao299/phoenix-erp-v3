import { Client } from 'pg';
import type { StandaloneExecutor } from './chanjet-execution-admission.store';

/**
 * Bounds for the controlled guard executor. Defaults mirror the store's
 * conservative per-statement constant (2s) — the guard is exempt from the
 * execution deadline, so these are the ONLY bounds its statements have.
 */
export const GUARD_ACQUIRE_BOUND_MS = 2_000;
export const GUARD_STATEMENT_BOUND_MS = 2_000;
export const GUARD_RELEASE_BOUND_MS = 1_000;
/** Slack added to the statement bound for the CLIENT-side wait backstop.
 *  The server-side statement/lock timeout stays primary; the client wait
 *  bound only fires when the connection is silently stalled (no response
 *  can ever arrive), so it must be looser than the server bound. */
export const GUARD_CLIENT_WAIT_SLACK_MS = 1_000;

export interface GuardExecutorBounds {
  /** Max wait to OWN the guard connection (client free + connected). On
   *  expiry the socket is destroyed — the occupying or connecting job truly
   *  terminates, it is not raced away. */
  acquireMs?: number;
  /** Server-side statement_timeout AND lock_timeout applied inside the guard
   *  transaction: PostgreSQL aborts the statement/lock wait itself. */
  statementMs?: number;
  /** Client-side wait backstop for EVERY guard statement (BEGIN, the two
   *  SETs, the SQL, COMMIT): a silent/stalled connection is terminated by
   *  socket teardown at this bound. Keep >= statementMs. */
  clientWaitMs?: number;
  /** Max wait for rollback and final dispose bookkeeping; a hung step ends
   *  in socket teardown. */
  releaseMs?: number;
}

export interface BoundedGuardExecutor extends StandaloneExecutor {
  /** Permanent teardown: later queries fail fast. */
  dispose(): Promise<void>;
  /** True once any bound was exceeded, the connection failed, or dispose
   *  ran — the resource-release evidence for this executor. */
  readonly isDisposed: boolean;
  /** Backend PID of the dedicated guard connection (identity evidence; set
   *  after the first successful connection). */
  readonly backendPid: number | undefined;
}

interface ResolvedBounds { acquireMs: number; statementMs: number; clientWaitMs: number; releaseMs: number }

/**
 * Controlled guard executor over ONE dedicated connection (its own pg Client
 * — never the business pool). Every stage has an explicit, ENFORCING upper
 * bound:
 *   1. connection acquisition — the wait to own the client (queued behind a
 *      busy guard connection, or the initial TCP/auth connect) is bounded;
 *      expiry DESTROYS the socket, terminating the underlying job;
 *   2. SQL / lock waits — SET LOCAL statement_timeout + lock_timeout inside
 *      the guard transaction: PostgreSQL aborts the statement itself;
 *   3. every statement's CLIENT wait (BEGIN, the two SETs, the SQL, COMMIT)
 *      is bounded by clientWaitMs; expiry destroys the socket and ends the
 *      original job — the driver's internal queue is flushed with it, so no
 *      queued statement can execute late;
 *   4. an UNKNOWN COMMIT outcome is never claimed as rolled back or
 *      committed: the connection is torn down and the error is reported so
 *      the caller classifies UNCONFIRMED;
 *   5. failure — the transaction is rolled back (bounded) only while its
 *      state is known; a hung rollback ends in socket teardown;
 *   6. release — dispose is bounded; a hung end ends in socket teardown.
 * Out-of-band connection failures are received CONTROLLEDLY: the client's
 * 'error' event marks the executor unusable, releases the socket and lets
 * in-flight jobs reject naturally — it is never re-emitted unhandled (which
 * would crash the process) and never converts into a false CONFIRMED.
 * connectTimeoutMS alone is NOT sufficient: it only bounds the TCP/handshake
 * phase, not owner queuing or server-side waits. A caller-side Promise.race
 * is NEVER the termination mechanism: every abort is enforced by PostgreSQL
 * or by destroying the guard socket itself.
 */
export function createBoundedGuardExecutor(connection: string | { connectionString: string }, bounds: GuardExecutorBounds = {}): BoundedGuardExecutor {
  const resolved: ResolvedBounds = {
    acquireMs: bounds.acquireMs ?? GUARD_ACQUIRE_BOUND_MS,
    statementMs: bounds.statementMs ?? GUARD_STATEMENT_BOUND_MS,
    clientWaitMs: bounds.clientWaitMs ?? (bounds.statementMs ?? GUARD_STATEMENT_BOUND_MS) + GUARD_CLIENT_WAIT_SLACK_MS,
    releaseMs: bounds.releaseMs ?? GUARD_RELEASE_BOUND_MS,
  };
  const config = typeof connection === 'string' ? { connectionString: connection } : connection;
  let client: Client | undefined;
  let disposed = false;
  let tail: Promise<unknown> = Promise.resolve();
  /** True termination: destroy the socket so ANY pending connect/query on
   *  the guard connection errors immediately and the driver's internal
   *  query queue is flushed. */
  const kill = (): void => {
    const c = client as unknown as { connection?: { stream?: { destroy?: () => void } } } | undefined;
    try { c?.connection?.stream?.destroy?.(); } catch { /* already dead */ }
    try { void client?.end().catch(() => undefined); } catch { /* already ending */ }
  };
  const withBound = <T>(work: Promise<T>, ms: number, code: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([
      work,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(code)), ms); }),
    ]).finally(() => clearTimeout(timer));
  };
  /** Client-wait bound for ONE statement: on expiry the connection is
   *  destroyed (terminating the underlying job) before the caller's
   *  rejection — the race is only the classification, the kill is the
   *  termination. */
  const boundedStatement = async (work: Promise<{ rows?: unknown[] }>, code: string): Promise<unknown[]> => {
    try {
      const result = await withBound(work, resolved.clientWaitMs, code);
      return result?.rows ?? [];
    } catch (error) {
      if (error instanceof Error && error.message === code) {
        kill();
        disposed = true;
      }
      throw error;
    }
  };
  const ensureConnected = async (): Promise<Client> => {
    if (disposed) throw new Error('CHANJET_GUARD_ACQUIRE_TIMEOUT');
    if (client) return client;
    const c = new Client({ ...config, connectionTimeoutMillis: resolved.acquireMs });
    // Controlled reception of out-of-band connection failures: an idle or
    // terminating backend surfaces here. It must NEVER reach Node as an
    // unhandled 'error' event (that aborts the whole process); in-flight
    // query promises reject on their own through the dead socket — never a
    // false CONFIRMED.
    c.on('error', () => {
      disposed = true;
      kill();
    });
    client = c;
    try {
      await withBound(c.connect(), resolved.acquireMs, 'CHANJET_GUARD_ACQUIRE_TIMEOUT');
      return c;
    } catch (error) {
      // true termination of the underlying connect, not a race
      kill();
      disposed = true;
      throw error;
    }
  };
  const query = (sql: string, parameters?: unknown[]): Promise<unknown[]> => {
    if (disposed) return Promise.reject(new Error('CHANJET_GUARD_EXECUTOR_DISPOSED'));
    // the mutex wait IS part of connection acquisition: if the guard
    // connection is still busy when the bound expires, its socket is
    // destroyed — the occupying job truly dies and this call rejects
    const ownership = withBound(tail.then(() => undefined, () => undefined), resolved.acquireMs, 'CHANJET_GUARD_ACQUIRE_TIMEOUT');
    const run = async (): Promise<unknown[]> => {
      const c = await ensureConnected();
      let committed = false;
      let commitAmbiguous = false;
      try {
        await boundedStatement(c.query('BEGIN'), 'CHANJET_GUARD_STATEMENT_TIMEOUT');
        // server-side enforcement: the statement and its lock wait are
        // aborted by PostgreSQL — the job cannot outlive the bound and
        // nothing commits late, even after a competing lock is freed
        await boundedStatement(c.query(`SET LOCAL statement_timeout=${resolved.statementMs}`), 'CHANJET_GUARD_STATEMENT_TIMEOUT');
        await boundedStatement(c.query(`SET LOCAL lock_timeout=${resolved.statementMs}`), 'CHANJET_GUARD_STATEMENT_TIMEOUT');
        const rows = await boundedStatement(c.query(sql, parameters), 'CHANJET_GUARD_STATEMENT_TIMEOUT');
        try {
          await boundedStatement(c.query('COMMIT'), 'CHANJET_GUARD_COMMIT_TIMEOUT');
          committed = true;
        } catch (commitError) {
          if (commitError instanceof Error && commitError.message === 'CHANJET_GUARD_COMMIT_TIMEOUT') {
            // COMMIT outcome UNKNOWN: the request may or may not have reached
            // and been applied by the server. Never claim a definite rollback
            // or a definite success — the ambiguous connection is destroyed
            // and the unknown outcome propagates (classified UNCONFIRMED
            // upstream).
            commitAmbiguous = true;
            kill();
            disposed = true;
            throw new Error('CHANJET_GUARD_COMMIT_UNKNOWN');
          }
          // the server itself rejected the COMMIT — a definite failure; the
          // error propagates as-is
          throw commitError;
        }
        return rows;
      } finally {
        if (!committed && !commitAmbiguous) {
          try {
            await withBound(c.query('ROLLBACK'), resolved.releaseMs, 'CHANJET_GUARD_ROLLBACK_TIMEOUT');
          } catch {
            // hung or broken rollback: teardown — no half-open guard state
            kill();
            disposed = true;
          }
        }
      }
    };
    const result = ownership.then(run, (acquireError: Error) => {
      // TRUE termination, not a caller-side race: the guard socket is
      // destroyed so the occupying (or connecting) job dies with it and the
      // driver's internal query queue is flushed — no queued BEGIN can
      // surface as a late guard write once the acquisition bound expired.
      kill();
      disposed = true;
      throw acquireError;
    });
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
  return {
    get isDisposed() { return disposed; },
    get backendPid() { return (client as unknown as { processID?: number } | undefined)?.processID; },
    query,
    dispose: async () => {
      if (disposed) return;
      disposed = true;
      try {
        await withBound(client?.end() ?? Promise.resolve(), resolved.releaseMs, 'CHANJET_GUARD_RELEASE_TIMEOUT');
      } catch {
        kill();
      }
    },
  };
}
