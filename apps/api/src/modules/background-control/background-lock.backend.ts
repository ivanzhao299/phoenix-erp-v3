import { Injectable } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { EventEmitter } from 'node:events';
import { BACKGROUND_ADMISSION_KEY, BACKGROUND_EXECUTION_KEY, BACKGROUND_NAMESPACE } from './background-control.types';

export const BUSINESS_LOCK_NAMES = ['workflow_sla_scheduler', 'credit_scheduler', 'egg_inventory_scheduler'] as const;
export type BusinessLockName = typeof BUSINESS_LOCK_NAMES[number];
export const BACKGROUND_IO_TIMEOUT_MS = 5000;
export const BACKGROUND_CLOSE_TIMEOUT_MS = 1000;
interface OwnedSocket extends EventEmitter { destroy(): unknown; closed?: boolean }
interface OwnedPgClient extends EventEmitter {
  end(): Promise<void>;
  _ending: boolean;
  _ended: boolean;
  connection: { stream: OwnedSocket };
}
/** One master QueryRunner preserves the DataSource's effective TLS/pool budget.
 * A poisoned/closed instance never acquires again. All business calls are
 * serialized by the service; raw I/O remains observed even after its deadline. */
@Injectable()
export class BackgroundLockBackend {
  private runner?: QueryRunner;
  private broken = false;
  private closed = false;
  private lossNotified = false;
  private connection?: OwnedPgClient;
  private socket?: OwnedSocket;
  private acquisition?: Promise<OwnedPgClient>;
  private acquirePending = false;
  private readonly pendingQueries = new Set<Promise<unknown>>();
  private retirement?: Promise<void>;
  private releaseWork?: Promise<void>;
  private closing?: Promise<void>;
  private terminationConfirmed = false;
  private releaseConfirmed = false;
  private cleanupFailed = false;
  private sessionPid: number | null = null;
  private databaseOid: number | null = null;
  private backendStartedAt: string | null = null;
  private backendStartedAtUs: string | null = null;
  private applicationName = '';
  private onLoss: () => void = () => undefined;
  constructor(private readonly dataSource: DataSource) {}
  bindLoss(handler: () => void) { this.onLoss = handler; }
  bindIdentity(bootId: string) {
    if (this.runner || this.closed || this.broken || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(bootId)) throw new Error('BACKGROUND_INVALID_BOOT_IDENTITY');
    this.applicationName = `phoenix-fence:${bootId}`;
  }
  private lose = () => {
    this.broken = true;
    if (!this.lossNotified) { this.lossNotified = true; this.onLoss(); }
    this.startRetirement();
  };
  private ended = () => {
    this.terminationConfirmed = true;
    this.releaseIfRetired();
    if (!this.retirement && !this.closed) this.lose();
  };
  private socketClosed = () => {
    this.terminationConfirmed = true; this.releaseIfRetired();
    if (!this.retirement && !this.closed) this.lose();
  };
  private releaseIfRetired() {
    if (!this.releaseWork && this.runner && this.connection?._ending === true && this.terminationConfirmed) {
      this.releaseWork = Promise.resolve().then(() => this.runner!.release()).then(() => { this.releaseConfirmed = true; });
      void this.releaseWork.catch(() => { this.cleanupFailed = true; this.lose(); });
    }
    return this.releaseWork;
  }
  private observeQuery<T>(work: () => Promise<T>): Promise<T> {
    const promise = Promise.resolve().then(work);
    this.pendingQueries.add(promise);
    void promise.then(() => this.pendingQueries.delete(promise), () => this.pendingQueries.delete(promise));
    return promise;
  }
  private bounded<T>(promise: Promise<T>, milliseconds: number, code: string): Promise<T> {
    // Attaching both observers keeps late results/rejections owned; the timeout
    // does not claim to cancel a pool acquisition or a driver query.
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.lose(); reject(new Error(code)); }, Math.max(1, milliseconds));
      void promise.then(value => { clearTimeout(timer); resolve(value); }, () => { clearTimeout(timer); this.lose(); reject(new Error(code)); });
    });
  }
  private connect(): Promise<OwnedPgClient> {
    if (!this.acquisition) {
      if (!this.applicationName || this.broken || this.closed) throw new Error('BACKGROUND_SESSION_LOST');
      this.runner = this.dataSource.createQueryRunner('master');
      const runner = this.runner; this.acquirePending = true;
      this.acquisition = Promise.resolve().then(() => runner.connect()).then(value => {
        this.acquirePending = false;
        const client = value as OwnedPgClient;
        // Fixed pg 8.20 contract: .end sets _ending before any pool release;
        // this captured client/socket is the only resource we may terminate.
        this.connection = client; this.socket = client?.connection?.stream;
        if (!client || typeof client.end !== 'function' || typeof client.on !== 'function' || typeof client._ending !== 'boolean'
          || typeof client._ended !== 'boolean' || !this.socket || typeof this.socket.destroy !== 'function' || typeof this.socket.on !== 'function') {
          this.cleanupFailed = true; this.lose(); throw new Error('BACKGROUND_CLIENT_CONTRACT_REQUIRED');
        }
        client.on('error', this.lose); client.on('end', this.ended); this.socket.on('close', this.socketClosed);
        if (this.broken || this.closed) this.startRetirement();
        return client;
      }, () => { this.acquirePending = false; this.lose(); throw new Error('BACKGROUND_SESSION_LOST'); });
      void this.acquisition.catch(() => undefined);
    }
    return this.acquisition;
  }
  private startRetirement() {
    if (this.retirement || !this.connection || this.cleanupFailed) return;
    // Assign before invoking end(): error/end listeners can re-enter synchronously.
    this.retirement = Promise.resolve().then(async () => {
      const client = this.connection!, socket = this.socket!;
      const deadline = Date.now() + BACKGROUND_CLOSE_TIMEOUT_MS;
      try {
        // pg-pool removes _ending clients instead of returning them idle. Even
        // healthy shutdown must terminate before QueryRunner.release bookkeeping.
        const end = Promise.resolve().then(() => client.end());
        try { await this.bounded(end, Math.min(400, Math.max(1, deadline - Date.now())), 'BACKGROUND_CLIENT_END_UNVERIFIED'); }
        catch { /* Fall back only to this owned socket, never an unknown session. */ }
        if (!this.terminationConfirmed && !client._ended && socket.closed !== true) {
          const closed = new Promise<void>(resolve => socket.once('close', resolve));
          socket.destroy();
          if (!this.terminationConfirmed && !socket.closed) await this.bounded(closed, Math.min(400, Math.max(1, deadline - Date.now())), 'BACKGROUND_SOCKET_CLOSE_UNVERIFIED');
        }
        if (client._ending !== true || (!this.terminationConfirmed && client._ended !== true && socket.closed !== true)) throw new Error('BACKGROUND_TERMINATION_UNVERIFIED');
        this.terminationConfirmed = true;
        await this.bounded(this.releaseIfRetired()!, Math.max(1, deadline - Date.now()), 'BACKGROUND_RUNNER_RELEASE_UNVERIFIED');
      } catch {
        this.cleanupFailed = true; this.lose(); throw new Error('BACKGROUND_CLEANUP_UNVERIFIED');
      }
    });
    void this.retirement.catch(() => undefined);
  }
  private async query(sql: string, key: number) {
    if (this.broken || this.closed) throw new Error('BACKGROUND_SESSION_LOST');
    try {
      const first = !this.acquisition;
      await this.bounded(this.connect(), BACKGROUND_IO_TIMEOUT_MS, 'BACKGROUND_CONNECT_TIMEOUT');
      if (this.broken || this.closed) throw new Error('BACKGROUND_SESSION_LOST');
      if (first) await this.bounded(this.observeQuery(() => this.runner!.query("SELECT set_config('application_name', $1, false)", [this.applicationName])), BACKGROUND_IO_TIMEOUT_MS, 'BACKGROUND_IDENTITY_TIMEOUT');
      if (this.broken || this.closed) throw new Error('BACKGROUND_SESSION_LOST');
      return await this.bounded(this.observeQuery(() => this.runner!.query(sql, [BACKGROUND_NAMESPACE, key])), BACKGROUND_IO_TIMEOUT_MS, 'BACKGROUND_QUERY_TIMEOUT');
    } catch { this.lose(); throw new Error('BACKGROUND_SESSION_LOST'); }
  }
  async gateEnter(): Promise<boolean> {
    const result: { acquired: boolean }[] = await this.query('SELECT pg_try_advisory_lock_shared($1::int, $2::int) AS acquired', BACKGROUND_ADMISSION_KEY);
    return result[0]?.acquired === true;
  }
  private async unlock(key: number) {
    const result: { released: boolean }[] = await this.query('SELECT pg_advisory_unlock_shared($1::int, $2::int) AS released', key);
    if (result[0]?.released !== true) { this.lose(); throw new Error('BACKGROUND_LOCK_OWNERSHIP_LOST'); }
  }
  gateExit() { return this.unlock(BACKGROUND_ADMISSION_KEY); }
  async executionEnter(): Promise<boolean> {
    const result: { acquired: boolean }[] = await this.query('SELECT pg_try_advisory_lock_shared($1::int, $2::int) AS acquired', BACKGROUND_EXECUTION_KEY);
    return result[0]?.acquired === true;
  }
  executionExit() { return this.unlock(BACKGROUND_EXECUTION_KEY); }
  async businessEnter(name: BusinessLockName): Promise<boolean> {
    if (!BUSINESS_LOCK_NAMES.includes(name)) throw new Error('BACKGROUND_BUSINESS_LOCK_NAME_REQUIRED');
    if (!this.status().connected) throw new Error('BACKGROUND_SESSION_LOST');
    try {
      // Separate, fixed business SQL; the reviewed control forwarder remains unchanged.
      const rows: { acquired: boolean }[] = await this.bounded(this.observeQuery(() => this.runner!.query(
        'SELECT pg_try_advisory_lock(hashtext($1)) AS acquired', [name])), BACKGROUND_IO_TIMEOUT_MS, 'BACKGROUND_BUSINESS_LOCK_TIMEOUT');
      if (this.broken || this.closed || rows.length !== 1 || typeof rows[0]?.acquired !== 'boolean') throw new Error('BACKGROUND_BUSINESS_LOCK_RESULT_REQUIRED');
      return rows[0].acquired;
    } catch { this.lose(); throw new Error('BACKGROUND_BUSINESS_LOCK_HOLD'); }
  }
  async businessExit(name: BusinessLockName): Promise<void> {
    if (!BUSINESS_LOCK_NAMES.includes(name)) throw new Error('BACKGROUND_BUSINESS_LOCK_NAME_REQUIRED');
    if (!this.status().connected) throw new Error('BACKGROUND_SESSION_LOST');
    try {
      const rows: { released: boolean }[] = await this.bounded(this.observeQuery(() => this.runner!.query(
        'SELECT pg_advisory_unlock(hashtext($1)) AS released', [name])), BACKGROUND_IO_TIMEOUT_MS, 'BACKGROUND_BUSINESS_UNLOCK_TIMEOUT');
      if (this.broken || this.closed || rows.length !== 1 || rows[0]?.released !== true) throw new Error('BACKGROUND_BUSINESS_LOCK_OWNERSHIP_LOST');
    } catch { this.lose(); throw new Error('BACKGROUND_BUSINESS_UNLOCK_HOLD'); }
  }
  status() { return {
    connected: !!this.runner && !!this.connection && this.sessionPid !== null && this.databaseOid !== null && this.backendStartedAt !== null && this.backendStartedAtUs !== null && !this.broken && !this.closed,
    broken: this.broken, sessionPid: this.sessionPid, databaseOid: this.databaseOid, backendStartedAt: this.backendStartedAt,
    backendStartedAtUs: this.backendStartedAtUs,
    applicationName: this.applicationName || null,
    cleanup: { acquirePending: this.acquirePending, queriesPending: this.pendingQueries.size, retirementPending: !!this.retirement && !this.releaseConfirmed && !this.cleanupFailed,
      terminationConfirmed: this.terminationConfirmed, releaseConfirmed: this.releaseConfirmed,
      debt: this.acquirePending || this.pendingQueries.size > 0 || (!!this.runner && !this.releaseConfirmed) || this.cleanupFailed },
  }; }
  async probe() {
    const result: { pid: number; database_oid: number; backend_started_at: Date; backend_started_at_us: string; application_name: string }[] = await this.query(`SELECT pg_backend_pid() AS pid,
      (SELECT oid::int FROM pg_database WHERE datname=current_database()) AS database_oid,
      (SELECT backend_start FROM pg_stat_activity WHERE pid=pg_backend_pid()) AS backend_started_at,
      (SELECT to_char(backend_start AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') FROM pg_stat_activity WHERE pid=pg_backend_pid()) AS backend_started_at_us,
      current_setting('application_name') AS application_name,
      $1::int AS namespace, $2::int AS session_probe`, 0);
    const row = result[0];
    if (!row || !Number.isSafeInteger(row.pid) || row.pid <= 0 || !Number.isSafeInteger(row.database_oid) || row.database_oid <= 0
      || !row.backend_started_at || !Number.isFinite(new Date(row.backend_started_at).getTime())
      || typeof row.backend_started_at_us !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(row.backend_started_at_us)
      || row.application_name !== this.applicationName
      || (this.sessionPid !== null && this.sessionPid !== row.pid)) {
      this.lose(); throw new Error('BACKGROUND_SESSION_IDENTITY_LOST');
    }
    const startedAt = new Date(row.backend_started_at).toISOString();
    // The Date field is retained for existing consumers. It can corroborate,
    // but never replace, the raw server identity from this same connection.
    if (row.backend_started_at_us.slice(0,23) + 'Z' !== startedAt
      || (this.databaseOid !== null && this.databaseOid !== row.database_oid)
      || (this.backendStartedAt !== null && this.backendStartedAt !== startedAt)
      || (this.backendStartedAtUs !== null && this.backendStartedAtUs !== row.backend_started_at_us)) {
      this.lose(); throw new Error('BACKGROUND_SESSION_IDENTITY_LOST');
    }
    this.sessionPid = row.pid; this.databaseOid = row.database_oid; this.backendStartedAt = startedAt; this.backendStartedAtUs = row.backend_started_at_us;
  }
  close(): Promise<void> {
    if (!this.closing) {
      this.closed = true; this.startRetirement();
      this.closing = (async () => {
        // A SIGTERM can race the first control-session acquisition. Keep that
        // owned QueryRunner under the same bounded cleanup contract instead of
        // abandoning a late pg client with an unnamed backend session.
        if (this.acquirePending && this.acquisition) {
          try { await this.bounded(this.acquisition, BACKGROUND_CLOSE_TIMEOUT_MS, 'BACKGROUND_ACQUISITION_CLOSE_TIMEOUT'); }
          catch { /* the owned acquisition remains a tracked HOLD */ }
        }
        if (this.retirement) await this.bounded(this.retirement, BACKGROUND_CLOSE_TIMEOUT_MS, 'BACKGROUND_CLEANUP_UNVERIFIED');
        if (this.acquirePending) throw new Error('BACKGROUND_CLEANUP_PENDING_CONNECT');
        if (this.status().cleanup.debt) throw new Error('BACKGROUND_CLEANUP_PENDING_IO');
      })();
      void this.closing.catch(() => undefined);
    }
    return this.closing;
  }
}
