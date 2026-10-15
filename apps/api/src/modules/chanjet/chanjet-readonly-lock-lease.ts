import { QueryRunner } from 'typeorm';
import { Socket } from 'node:net';

type PostgresClient = {
  on(event: string, listener: () => void): unknown;
  removeListener(event: string, listener: () => void): unknown;
  end(): Promise<void>;
  connection: { stream: Socket };
};

/** One checked-out PostgreSQL session; ownership is never transferred through the pool. */
export class ChanjetReadonlyLockLease {
  private lost = false;
  private locked = false;
  private closing?: Promise<void>;
  private closed = false;
  private readonly markLost = () => { this.lost = true; };
  private readonly socket: Socket;
  private readonly endClient: () => Promise<void>;
  readonly backendPid: number;

  private constructor(
    readonly runner: QueryRunner,
    private readonly client: PostgresClient,
    private readonly key: string,
    pid: number,
  ) {
    this.backendPid = pid;
    this.socket = client.connection.stream;
    this.endClient = client.end.bind(client);
    client.on('error', this.markLost);
    client.on('end', this.markLost);
  }

  static async acquire(runner: QueryRunner, key: string): Promise<ChanjetReadonlyLockLease | null> {
    let lease: ChanjetReadonlyLockLease | undefined;
    try {
      const client = await runner.connect() as PostgresClient;
      if (!client.connection?.stream || typeof client.end !== 'function') throw new Error('READONLY_HOLD_POSTGRES_SESSION_REQUIRED');
      const [identity] = await runner.query('SELECT pg_backend_pid() AS pid');
      lease = new ChanjetReadonlyLockLease(runner, client, key, Number(identity.pid));
      const [lock] = await runner.query('SELECT pg_try_advisory_lock(hashtext($1)) AS acquired', [key]);
      lease.locked = lock?.acquired === true;
      if (!lease.locked) { await lease.close(); return null; }
      return lease;
    } catch (error) {
      // Acquisition errors may have an ambiguous server outcome. Discard, never return
      // a possibly locked session to the pool (including a lost acquire acknowledgement).
      if (lease) { lease.locked = true; lease.lost = true; await lease.close(); }
      else if (!runner.isReleased) await runner.release();
      throw error;
    }
  }

  assertAlive(): void {
    if (this.lost || this.closed || this.runner.isReleased) throw new Error('READONLY_HOLD_SESSION_LOST');
  }

  async assertOwnership(): Promise<void> {
    this.assertAlive();
    const [row] = await this.runner.query(
      `SELECT pg_backend_pid() AS pid, EXISTS(
         SELECT 1 FROM pg_catalog.pg_locks
          WHERE locktype='advisory' AND pid=pg_backend_pid() AND granted
            AND classid=((hashtext($1)::bigint >> 32) & 4294967295)::oid
            AND objid=(hashtext($1)::bigint & 4294967295)::oid AND objsubid=1
       ) AS owned`, [this.key],
    );
    this.assertAlive();
    if (Number(row?.pid) !== this.backendPid || row?.owned !== true) {
      this.lost = true;
      throw new Error('READONLY_HOLD_SESSION_LOST');
    }
  }

  close(): Promise<void> {
    return this.closing ||= this.cleanup();
  }

  /**
   * FORCE destruction of this session: the socket is destroyed and the
   * underlying client ended regardless of session state. Used when a
   * transaction's outcome is unknown or its cleanup could not be confirmed —
   * a dead session cannot be borrowed from the pool and its transaction can
   * never commit. Resolves after the socket has been observed closed and the
   * runner released.
   */
  async discard(): Promise<void> {
    this.closed = true;
    this.lost = true;
    const socket = this.socket;
    const disconnected = socket.closed ? Promise.resolve() : new Promise<void>((resolve) => { socket.once('close', () => resolve()); });
    let ending: Promise<void>;
    try { ending = this.endClient(); }
    catch { ending = Promise.reject(new Error('READONLY_HOLD_LOCK_DISCARD')); }
    socket.destroy(new Error('READONLY_HOLD_LOCK_SESSION_DISCARDED'));
    // the close acknowledgement and the end() are each raced — a hung end()
    // must never delay the discard teardown; the destroy above is the
    // enforced release and the runner is released best-effort regardless
    const withCeiling = (work: Promise<void>): Promise<void> => new Promise<void>((resolve) => {
      const ceiling = setTimeout(resolve, 500);
      ceiling.unref?.();
      work.then(() => { clearTimeout(ceiling); resolve(); }, () => { clearTimeout(ceiling); resolve(); });
    });
    await withCeiling(disconnected.catch(() => undefined));
    await withCeiling(ending);
    if (!this.runner.isReleased) {
      try { await this.runner.release(); } catch { /* destroyed */ }
    }
  }

  private async cleanup(): Promise<void> {
    this.closed = true;
    let discard = this.lost || this.runner.isReleased;
    try {
      if (this.runner.isTransactionActive && !this.runner.isReleased) {
        try { await this.runner.rollbackTransaction(); } catch { discard = true; }
      }
      if (this.locked && !discard) {
        try {
          const [row] = await this.runner.query('SELECT pg_advisory_unlock(hashtext($1)) AS released', [this.key]);
          if (row?.released !== true) discard = true;
        } catch { discard = true; }
      }
      if (discard) {
        // Public node-postgres Client.end() physically closes this checked-out session.
        // pg-pool removes ended/ending clients on release; no private TypeORM release
        // callback is invoked and a held advisory lock cannot escape into the pool.
        const socket = this.socket;
        // A failed unlock does not justify graceful idle pooling. Destroy the
        // exclusively owned socket, and observe its close before pool release.
        const disconnected = socket.closed ? Promise.resolve() : new Promise<void>(resolve => {
          socket.once('close', resolve);
        });
        let ending: Promise<void>;
        try { ending = this.endClient(); }
        catch { ending = Promise.reject(new Error('READONLY_HOLD_LOCK_CLEANUP')); }
        const settled = ending.catch(() => undefined);
        socket.destroy(new Error('READONLY_HOLD_LOCK_SESSION_DISCARDED'));
        await disconnected;
        await settled;
      }
    } finally {
      this.client.removeListener('error', this.markLost);
      this.client.removeListener('end', this.markLost);
      if (!this.runner.isReleased) {
        await this.runner.release();
      }
    }
  }
}
