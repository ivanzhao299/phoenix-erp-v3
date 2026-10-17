import { Injectable } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { EventEmitter } from 'node:events';
import { BACKGROUND_ADMISSION_KEY, BACKGROUND_EXECUTION_KEY, BACKGROUND_NAMESPACE } from './background-control.types';

/** A dedicated session, never a pooled application transaction. All calls serialized by service. */
@Injectable()
export class BackgroundLockBackend {
  private runner?: QueryRunner;
  private broken = false;
  private connection?: EventEmitter;
  private sessionPid: number | null = null;
  private databaseOid: number | null = null;
  private backendStartedAt: string | null = null;
  private applicationName = '';
  private onLoss: () => void = () => undefined;
  constructor(private readonly dataSource: DataSource) {}
  bindLoss(handler: () => void) { this.onLoss = handler; }
  bindIdentity(bootId: string) {
    if (this.runner || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(bootId)) throw new Error('BACKGROUND_INVALID_BOOT_IDENTITY');
    this.applicationName = `phoenix-fence:${bootId}`;
  }
  private lose = () => { this.broken = true; this.onLoss(); };
  private async query(sql: string, key: number) {
    if (this.broken) throw new Error('BACKGROUND_SESSION_LOST');
    try {
      if (!this.runner) {
        if (!this.applicationName) throw new Error('BACKGROUND_BOOT_IDENTITY_REQUIRED');
        this.runner = this.dataSource.createQueryRunner();
        const connection = await this.runner.connect();
        this.connection = connection;
        connection.on('error', this.lose);
        connection.on('end', this.lose);
        // Session-local identity only: no persistent settings, schema or authorization writes.
        await this.runner.query("SELECT set_config('application_name', $1, false)", [this.applicationName]);
      }
      return await this.runner.query(sql, [BACKGROUND_NAMESPACE, key]);
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
  status() { return {
    connected: !!this.runner && !!this.connection && this.sessionPid !== null && this.databaseOid !== null && this.backendStartedAt !== null && !this.broken,
    broken: this.broken, sessionPid: this.sessionPid, databaseOid: this.databaseOid, backendStartedAt: this.backendStartedAt,
    applicationName: this.applicationName || null,
  }; }
  async probe() {
    const result: { pid: number; database_oid: number; backend_started_at: Date; application_name: string }[] = await this.query(`SELECT pg_backend_pid() AS pid,
      (SELECT oid::int FROM pg_database WHERE datname=current_database()) AS database_oid,
      (SELECT backend_start FROM pg_stat_activity WHERE pid=pg_backend_pid()) AS backend_started_at,
      current_setting('application_name') AS application_name,
      $1::int AS namespace, $2::int AS session_probe`, 0);
    const row = result[0];
    if (!row || !Number.isSafeInteger(row.pid) || row.pid <= 0 || !Number.isSafeInteger(row.database_oid) || row.database_oid <= 0
      || !row.backend_started_at || !Number.isFinite(new Date(row.backend_started_at).getTime())
      || row.application_name !== this.applicationName
      || (this.sessionPid !== null && this.sessionPid !== row.pid)) {
      this.lose(); throw new Error('BACKGROUND_SESSION_IDENTITY_LOST');
    }
    const startedAt = new Date(row.backend_started_at).toISOString();
    if ((this.databaseOid !== null && this.databaseOid !== row.database_oid)
      || (this.backendStartedAt !== null && this.backendStartedAt !== startedAt)) {
      this.lose(); throw new Error('BACKGROUND_SESSION_IDENTITY_LOST');
    }
    this.sessionPid = row.pid; this.databaseOid = row.database_oid; this.backendStartedAt = startedAt;
  }
  async close() {
    this.connection?.removeListener('error', this.lose);
    this.connection?.removeListener('end', this.lose);
    if (this.runner) await this.runner.release();
    this.runner = undefined;
  }
}
