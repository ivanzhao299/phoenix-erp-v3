import 'reflect-metadata';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DataSource } from 'typeorm';
import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner';
import { BackgroundLockBackend, BACKGROUND_CLOSE_TIMEOUT_MS, BACKGROUND_IO_TIMEOUT_MS } from './background-lock.backend';
const bootId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
class OwnedSocket extends EventEmitter {
  closed = false;
  destroy = jest.fn(() => { this.closed = true; this.emit('close'); });
}
class OwnedClient extends EventEmitter {
  _ending = false; _ended = false; _queryable = true;
  connection = { stream: new OwnedSocket() };
  end = jest.fn(async (_callback?: () => void) => { this._ending = true; this._ended = true; this.emit('end'); _callback?.(); });
}
function fixture() {
  const client = new OwnedClient();
  const runner = { connect: jest.fn(async () => client), query: jest.fn<Promise<unknown[]>, [string]>(async sql => {
    if (sql.includes('set_config')) return [];
    if (sql.includes('pg_backend_pid')) return [{ pid: 71, database_oid: 17, backend_started_at: new Date('2026-10-18T00:00:00.000Z'), application_name: `phoenix-fence:${bootId}` }];
    return [sql.includes('unlock') ? { released: true } : { acquired: true }];
  }), release: jest.fn(async () => { expect(client._ending).toBe(true); expect(client._ended || client.connection.stream.closed).toBe(true); }) };
  const dataSource = { createQueryRunner: jest.fn(() => runner) };
  const backend = new BackgroundLockBackend(dataSource as unknown as DataSource); const loss = jest.fn(); backend.bindLoss(loss); backend.bindIdentity(bootId);
  return { backend, runner, dataSource, client, loss };
}
afterEach(() => { jest.useRealTimers(); });
it('one master QueryRunner ends even a healthy owned pg client before ordinary release', async () => {
  const f = fixture(); await f.backend.probe(); expect(await f.backend.gateEnter()).toBe(true); await f.backend.gateExit();
  expect(f.dataSource.createQueryRunner).toHaveBeenCalledTimes(1); expect(f.dataSource.createQueryRunner).toHaveBeenCalledWith('master');
  expect(f.runner.query.mock.calls.filter(([sql]) => sql.includes('set_config'))).toHaveLength(1);
  const close = f.backend.close(); expect(f.backend.close()).toBe(close); await close;
  expect(f.client.end).toHaveBeenCalledTimes(1); expect(f.runner.release).toHaveBeenCalledTimes(1); expect(f.loss).not.toHaveBeenCalled();
  expect(f.backend.status()).toMatchObject({ connected: false, broken: false, cleanup: { acquirePending: false, queriesPending: 0, releaseConfirmed: true, terminationConfirmed: true, debt: false } });
  await expect(f.backend.probe()).rejects.toThrow('BACKGROUND_SESSION_LOST'); expect(f.dataSource.createQueryRunner).toHaveBeenCalledTimes(1);
});
it('never-returned pool acquisition times out and remains tracked debt without premature release', async () => {
  jest.useFakeTimers(); const f = fixture(), acquire = deferred<OwnedClient>(); f.runner.connect.mockImplementation(() => acquire.promise);
  const pending = expect(f.backend.probe()).rejects.toThrow('BACKGROUND_SESSION_LOST'); await flush(); await jest.advanceTimersByTimeAsync(BACKGROUND_IO_TIMEOUT_MS); await pending;
  expect(f.loss).toHaveBeenCalledTimes(1); expect(f.backend.status()).toMatchObject({ broken: true, cleanup: { acquirePending: true, debt: true } });
  await expect(f.backend.close()).rejects.toThrow('BACKGROUND_CLEANUP_PENDING_CONNECT'); expect(f.runner.release).not.toHaveBeenCalled(); expect(f.client.end).not.toHaveBeenCalled();
  await expect(f.backend.gateEnter()).rejects.toThrow('BACKGROUND_SESSION_LOST'); expect(f.runner.connect).toHaveBeenCalledTimes(1);
});
it('late acquisition is ended and retired, never used for SQL or returned alive to the pool', async () => {
  jest.useFakeTimers(); const f = fixture(), acquire = deferred<OwnedClient>(); f.runner.connect.mockImplementation(() => acquire.promise);
  const pending = expect(f.backend.probe()).rejects.toThrow('BACKGROUND_SESSION_LOST'); await flush(); await jest.advanceTimersByTimeAsync(BACKGROUND_IO_TIMEOUT_MS); await pending;
  const close = f.backend.close(); await expect(close).rejects.toThrow('BACKGROUND_CLEANUP_PENDING_CONNECT'); acquire.resolve(f.client); await flush();
  expect(f.runner.query).not.toHaveBeenCalled(); expect(f.client.end).toHaveBeenCalledTimes(1); expect(f.runner.release).toHaveBeenCalledTimes(1);
  expect(f.backend.status().cleanup).toMatchObject({ acquirePending: false, releaseConfirmed: true, terminationConfirmed: true, debt: false });
  expect(f.backend.close()).toBe(close); await expect(close).rejects.toThrow('BACKGROUND_CLEANUP_PENDING_CONNECT');
});
for (const stage of ['identity', 'query']) it(`${stage} SQL deadline poisons and retires while unresolved I/O stays debt`, async () => {
  jest.useFakeTimers(); const f = fixture(), query = deferred<unknown[]>(); if (stage === 'query') await f.backend.probe(); f.runner.query.mockImplementation(() => query.promise);
  const pending = expect(f.backend.probe()).rejects.toThrow('BACKGROUND_SESSION_LOST'); await flush(); await jest.advanceTimersByTimeAsync(BACKGROUND_IO_TIMEOUT_MS); await pending; await flush();
  expect(f.loss).toHaveBeenCalledTimes(1); expect(f.runner.release).toHaveBeenCalledTimes(1);
  expect(f.backend.status().cleanup).toMatchObject({ queriesPending: 1, terminationConfirmed: true, releaseConfirmed: true, debt: true });
  await expect(f.backend.close()).rejects.toThrow('BACKGROUND_CLEANUP_PENDING_IO'); query.reject(new Error('fixture late driver error')); await flush();
  expect(f.backend.status().cleanup.queriesPending).toBe(0); expect(f.loss).toHaveBeenCalledTimes(1);
});
it('late successful SQL cannot revive a poisoned backend', async () => {
  jest.useFakeTimers(); const f = fixture(); await f.backend.probe(); const query = deferred<unknown[]>(); f.runner.query.mockImplementation(() => query.promise);
  const pending = expect(f.backend.gateEnter()).rejects.toThrow('BACKGROUND_SESSION_LOST'); await flush(); await jest.advanceTimersByTimeAsync(BACKGROUND_IO_TIMEOUT_MS); await pending;
  query.resolve([{ acquired: true }]); await flush(); await expect(f.backend.executionEnter()).rejects.toThrow('BACKGROUND_SESSION_LOST');
  expect(f.backend.status().broken).toBe(true); expect(f.dataSource.createQueryRunner).toHaveBeenCalledTimes(1); expect(f.loss).toHaveBeenCalledTimes(1);
});
it('ordinary SQL error and false unlock poison and retire instead of returning a lock-bearing client', async () => {
  for (const mode of ['error', 'false-unlock']) {
    const f = fixture(); await f.backend.probe(); f.runner.query.mockImplementation(async () => { if (mode === 'error') throw new Error('private fixture SQL'); return [{ released: false }]; });
    await expect(f.backend.executionExit()).rejects.toThrow(mode === 'error' ? 'BACKGROUND_SESSION_LOST' : 'BACKGROUND_LOCK_OWNERSHIP_LOST'); await flush(); await f.backend.close();
    expect(f.loss).toHaveBeenCalledTimes(1); expect(f.runner.release).toHaveBeenCalledTimes(1);
  }
});
for (const mode of ['hang', 'error']) it(`end ${mode} uses only its owned socket before release within the close budget`, async () => {
  jest.useFakeTimers(); const f = fixture(); await f.backend.probe(); f.client.end.mockImplementation(() => { f.client._ending = true; return mode === 'hang' ? new Promise<void>(() => undefined) : Promise.reject(new Error('fixture end error')); });
  const close = f.backend.close(); await flush(); await jest.advanceTimersByTimeAsync(400); await close;
  expect(f.client.connection.stream.destroy).toHaveBeenCalledTimes(1); expect(f.runner.release).toHaveBeenCalledTimes(1); expect(f.loss).toHaveBeenCalledTimes(1);
  expect(f.backend.status().cleanup).toMatchObject({ terminationConfirmed: true, releaseConfirmed: true, debt: false });
});
it('unconfirmed termination cannot release or report success; late socket close still retires bookkeeping', async () => {
  jest.useFakeTimers(); const f = fixture(); await f.backend.probe(); f.client.end.mockImplementation(() => { f.client._ending = true; return new Promise<void>(() => undefined); });
  f.client.connection.stream.destroy.mockImplementation(() => undefined);
  const pending = expect(f.backend.close()).rejects.toThrow('BACKGROUND_CLEANUP_UNVERIFIED'); await flush(); await jest.advanceTimersByTimeAsync(BACKGROUND_CLOSE_TIMEOUT_MS); await pending;
  expect(f.runner.release).not.toHaveBeenCalled(); expect(f.backend.status().cleanup).toMatchObject({ terminationConfirmed: false, releaseConfirmed: false, debt: true });
  f.client.connection.stream.closed = true; f.client.connection.stream.emit('close'); await flush(); expect(f.runner.release).toHaveBeenCalledTimes(1); expect(f.backend.status().broken).toBe(true);
  await expect(f.backend.close()).rejects.toThrow('BACKGROUND_CLEANUP_UNVERIFIED');
});
it('error/end races and duplicate close are idempotent', async () => {
  const f = fixture(); await f.backend.probe(); f.client.emit('error', new Error('fixture loss')); f.client.emit('error', new Error('second loss')); await flush();
  const first = f.backend.close(), second = f.backend.close(); expect(first).toBe(second); await first; f.client.emit('end');
  expect(f.loss).toHaveBeenCalledTimes(1); expect(f.runner.release).toHaveBeenCalledTimes(1); expect(f.client.end).toHaveBeenCalledTimes(1);
});
it('runner release is bounded and retained without a duplicate release', async () => {
  jest.useFakeTimers(); const f = fixture(); await f.backend.probe(); const release = deferred<void>(); f.runner.release.mockImplementation(() => release.promise);
  const pending = expect(f.backend.close()).rejects.toThrow(/BACKGROUND_CLEANUP/); await flush(); await jest.advanceTimersByTimeAsync(BACKGROUND_CLOSE_TIMEOUT_MS); await pending;
  expect(f.backend.status().cleanup.debt).toBe(true); expect(f.runner.release).toHaveBeenCalledTimes(1); release.resolve(); await flush(); expect(f.runner.release).toHaveBeenCalledTimes(1); expect(f.backend.status().broken).toBe(true);
});
it('actual TypeORM0.3.29 and pg8.20 contracts evict ended master clients and tolerate error auto-release', async () => {
  const packageVersion = (entry: string) => {
    const base = path.dirname(require.resolve(entry));
    const file = [path.join(base, 'package.json'), path.join(base, '../package.json')].find(file => fs.existsSync(file));
    return JSON.parse(fs.readFileSync(file!, 'utf8')).version;
  };
  expect(packageVersion('typeorm')).toBe('0.3.29'); expect(packageVersion('pg')).toBe('8.20.0');
  for (const fail of [false, true]) {
    const client = new OwnedClient(); let callbackCount = 0;
    const driver = { connection: {}, connectedQueryRunners: [] as PostgresQueryRunner[], obtainMasterConnection: jest.fn(async () => [client, (error?: Error) => { callbackCount++; expect(Boolean(error) || client._ending).toBe(true); }]), isReplicated: false };
    const runner = new PostgresQueryRunner(driver as never, 'master');
    jest.spyOn(runner, 'query').mockImplementation(async (sql: string) => sql.includes('pg_backend_pid') ? [{ pid: 71, database_oid: 17, backend_started_at: new Date(), application_name: `phoenix-fence:${bootId}` }] : []);
    const backend = new BackgroundLockBackend({ createQueryRunner: () => runner } as unknown as DataSource); backend.bindIdentity(bootId); await backend.probe(); if (fail) client.emit('error', new Error('fixture driver error'));
    await backend.close(); expect(callbackCount).toBe(1); expect(runner.isReleased).toBe(true); expect(driver.connectedQueryRunners).toHaveLength(0);
  }
  // Actual pool removal branch, with no network connection or error flag.
  const { Pool } = require('pg') as { Pool: new (options: object) => { _clients: OwnedClient[]; _idle: unknown[]; _release: (client: OwnedClient, listener: () => void) => void } };
  const pool = new Pool({ idleTimeoutMillis: 0 }); const client = new OwnedClient(); client._ending = true; pool._clients.push(client); pool._release(client, () => undefined); await flush();
  expect(pool._clients).toHaveLength(0); expect(pool._idle).toHaveLength(0); expect(client.end).toHaveBeenCalled();
});
it('actual pg8.20 Client.end sets _ending synchronously and destroys an active query socket before completion', async () => {
  const { Client } = require('pg') as { Client: { prototype: { end(this: object): Promise<void> } } };
  const stream = { destroy: jest.fn() }, connection = Object.assign(new EventEmitter(), { _connecting: true, stream });
  // Call only the installed method. No Client constructor/config/environment,
  // connection string, TLS setup, network connection or pool acquisition occurs.
  const owned = { _ending: false, _ended: false, _queryable: true, _Promise: Promise, connection, _getActiveQuery: () => ({}) };
  const end = Client.prototype.end.call(owned);
  expect(owned._ending).toBe(true); expect(stream.destroy).toHaveBeenCalledTimes(1);
  connection.emit('end'); await end;
});
