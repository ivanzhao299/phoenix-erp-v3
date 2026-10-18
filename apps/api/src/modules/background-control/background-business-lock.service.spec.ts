import { EventEmitter } from 'node:events';
import { DataSource } from 'typeorm';
import { BackgroundBusinessLockService } from './background-business-lock.service';
import { BackgroundLockBackend, BACKGROUND_IO_TIMEOUT_MS } from './background-lock.backend';
import { BackgroundTaskService } from './background-task.service';
import { BackgroundManifestReader } from './background-manifest.reader';
import { BackgroundManifest } from './background-control.types';
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
function deferred<T = void>() { let resolve!: (v: T) => void; let reject!: (e: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
class OwnedClient extends EventEmitter {
  _ending = false; _ended = false;
  connection = { stream: Object.assign(new EventEmitter(), { closed: false, destroy: jest.fn() }) };
  end = jest.fn(async () => { this._ending = true; this._ended = true; this.emit('end'); });
}
function fixture() {
  const manifest: BackgroundManifest = { protocolVersion: 1, owner: 'owned-business-lock-fixture', generation: 1, phase: 'OPEN', targetSha: 'a'.repeat(40),
    participants: [{ bootId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', containerId: 'f'.repeat(64), revision: 'a'.repeat(40), allowedKinds: ['LOCAL', 'NOTIFICATION'] }] };
  const reader = new BackgroundManifestReader(); jest.spyOn(reader, 'read').mockImplementation(() => reader.validate(manifest));
  const control = { bindLoss: jest.fn(), bindIdentity: jest.fn(), gateEnter: jest.fn(async () => true), gateExit: jest.fn(async () => undefined),
    executionEnter: jest.fn(async () => true), executionExit: jest.fn(async () => undefined), close: jest.fn(async () => undefined), status: () => ({ connected: true, broken: false }) };
  const tasks = new BackgroundTaskService(reader, control as unknown as BackgroundLockBackend); tasks.identity.bootId = manifest.participants[0].bootId;
  const client = new OwnedClient(); let applicationName = '', held = false;
  const runner = { connect: jest.fn(async () => client), release: jest.fn(async () => { expect(client._ending).toBe(true); expect(client._ended).toBe(true); }),
    query: jest.fn(async (sql: string, args?: unknown[]): Promise<unknown[]> => {
      if (sql.includes('set_config')) { applicationName = String(args![0]); return []; }
      if (sql.includes('pg_backend_pid')) return [{ pid: 81, database_oid: 17, backend_started_at: new Date('2026-10-18T00:00:00.000Z'), backend_started_at_us: '2026-10-18T00:00:00.000123Z', application_name: applicationName }];
      if (sql.includes('pg_try_advisory_lock')) { held = true; return [{ acquired: true }]; }
      if (sql.includes('pg_advisory_unlock')) { held = false; return [{ released: true }]; }
      throw new Error('UNEXPECTED_OWNED_FIXTURE_SQL');
    }) };
  const ds = { createQueryRunner: jest.fn(() => runner) };
  return { tasks, manifest, control, runner, client, ds, service: new BackgroundBusinessLockService(ds as unknown as DataSource, tasks), held: () => held };
}
describe('owned business lock session and deployment task graph', () => {
  it('uses one dedicated connection, legacy key, distinct nonce and end-before-release', async () => {
    const f = fixture(); const work = jest.fn(async () => { expect(f.held()).toBe(true); expect(f.tasks.status().inFlight).toBe(2); return 73; });
    await expect(f.service.run('credit_scheduler', work)).resolves.toEqual({ acquired: true, value: 73 }); await tick();
    expect(f.ds.createQueryRunner).toHaveBeenCalledTimes(1); expect(f.ds.createQueryRunner).toHaveBeenCalledWith('master');
    expect(f.runner.query.mock.calls.filter(([sql]) => sql.includes('hashtext'))).toEqual([
      ['SELECT pg_try_advisory_lock(hashtext($1)) AS acquired', ['credit_scheduler']], ['SELECT pg_advisory_unlock(hashtext($1)) AS released', ['credit_scheduler']]]);
    const nonce = f.runner.query.mock.calls.find(([sql]) => sql.includes('set_config'))![1]![0];
    expect(nonce).not.toBe(`phoenix-fence:${f.tasks.identity.bootId}`); expect(nonce).toMatch(/^phoenix-fence:[a-f0-9-]{36}$/);
    expect(f.client.end).toHaveBeenCalledTimes(1); expect(f.runner.release).toHaveBeenCalledTimes(1); expect(f.held()).toBe(false);
    expect(f.tasks.status()).toMatchObject({ inFlight: 0, poisoned: false }); await f.tasks.shutdown(1000);
  });
  it('busy never executes work or unlocks another owner, but retires its own connection', async () => {
    const f = fixture(), original = f.runner.query.getMockImplementation()!;
    f.runner.query.mockImplementation((sql, args) => sql.includes('pg_try_advisory_lock') ? Promise.resolve([{ acquired: false }]) : original(sql, args));
    const work = jest.fn(); await expect(f.service.run('egg_inventory_scheduler', work)).resolves.toEqual({ acquired: false });
    expect(work).not.toHaveBeenCalled(); expect(f.runner.query.mock.calls.some(([sql]) => sql.includes('pg_advisory_unlock'))).toBe(false);
    expect(f.runner.release).toHaveBeenCalledTimes(1); await f.tasks.shutdown(1000);
  });
  it('unlocks after a business error without poisoning healthy cleanup', async () => {
    const f = fixture(); await expect(f.service.run('credit_scheduler', async () => { throw new Error('OWNED_BUSINESS_FAILURE'); })).rejects.toThrow('OWNED_BUSINESS_FAILURE');
    expect(f.held()).toBe(false); expect(f.runner.release).toHaveBeenCalledTimes(1); expect(f.tasks.status().poisoned).toBe(false); await f.tasks.shutdown(1000);
  });
  it('preserves an undefined business rejection after known healthy cleanup', async () => {
    const f = fixture(); await expect(f.service.run('credit_scheduler', async () => { throw undefined; })).rejects.toBeUndefined();
    await tick(); expect(f.tasks.status()).toMatchObject({ inFlight: 0, poisoned: false }); await f.tasks.shutdown(1000);
  });
  it('does not acquire a resource when cleanup-child registration loses a poison race', async () => {
    const f = fixture(), original = f.tasks.run.bind(f.tasks);
    jest.spyOn(f.tasks, 'run').mockImplementation((name, kind, work) => name === 'business-lock.resource-settlement'
      ? Promise.reject(new Error('BACKGROUND_HOLD=CHILD_UNAUTHORIZED')) : original(name, kind, work));
    await expect(f.service.run('credit_scheduler', async () => 1)).rejects.toThrow('CHILD_UNAUTHORIZED');
    expect(f.ds.createQueryRunner).not.toHaveBeenCalled(); expect(f.tasks.status().poisoned).toBe(true);
  });
  it('FENCED, poison and invalid names perform no acquisition or work', async () => {
    const f = fixture(), work = jest.fn(); f.manifest.phase = 'FENCED';
    await expect(f.service.run('credit_scheduler', work)).rejects.toThrow('FENCED_OR_UNAUTHORIZED');
    await expect(f.service.run('unapproved' as never, work)).rejects.toThrow('BACKGROUND_BUSINESS_LOCK_NAME_REQUIRED');
    f.tasks.resourceHold(); await expect(f.service.run('credit_scheduler', work)).rejects.toThrow('PARTICIPANT_HOLD');
    expect(f.ds.createQueryRunner).not.toHaveBeenCalled(); expect(work).not.toHaveBeenCalled();
  });
  it('retains business and cleanup children across a fence until work and release settle', async () => {
    const f = fixture(), pending = deferred(), started = deferred();
    const operation = f.service.run('credit_scheduler', async () => { started.resolve(); await pending.promise; return 1; }); await started.promise;
    f.manifest.phase = 'FENCED'; f.manifest.generation++;
    expect(f.tasks.status().inFlight).toBe(2); expect(f.control.executionExit).not.toHaveBeenCalled();
    pending.resolve(); await operation; await tick(); expect(f.tasks.status().inFlight).toBe(0); await f.tasks.shutdown(1000);
  });
  it('does not begin business after a known loss between probe completion and work', async () => {
    const f = fixture(), original = f.runner.query.getMockImplementation()!; let probes = 0;
    f.runner.query.mockImplementation(async (sql, args) => { const rows = await original(sql, args);
      if (sql.includes('pg_backend_pid') && ++probes === 2) f.client.emit('error', new Error('OWNED_SESSION_LOSS')); return rows; });
    const work = jest.fn(); await expect(f.service.run('credit_scheduler', work)).rejects.toThrow('HOLD'); await tick();
    expect(work).not.toHaveBeenCalled(); expect(f.tasks.status().poisoned).toBe(true); expect(f.runner.release).toHaveBeenCalledTimes(1);
  });
  it('loss during work poisons admission but does not pretend to cancel running business', async () => {
    const f = fixture(), pending = deferred(), started = deferred(), workFinished = jest.fn();
    const operation = f.service.run('credit_scheduler', async () => { started.resolve(); await pending.promise; workFinished(); });
    const rejected = expect(operation).rejects.toThrow('HOLD'); await started.promise; f.client.emit('error', new Error('OWNED_LOSS')); await tick();
    expect(f.tasks.status()).toMatchObject({ poisoned: true, inFlight: 2 }); expect(workFinished).not.toHaveBeenCalled();
    expect(f.control.executionExit).not.toHaveBeenCalled(); pending.resolve(); await rejected; await tick();
    expect(workFinished).toHaveBeenCalledTimes(1); expect(f.tasks.status().poisoned).toBe(true); await expect(f.tasks.shutdown(100)).rejects.toThrow('DRAIN_TIMEOUT_OR_SESSION_LOST');
  });
  it('late pool acquisition stays counted after timeout and retires without lock/work or clearing HOLD', async () => {
    jest.useFakeTimers(); const f = fixture(), acquisition = deferred<OwnedClient>(); f.runner.connect.mockImplementation(() => acquisition.promise);
    const work = jest.fn(), result = expect(f.service.run('credit_scheduler', work)).rejects.toThrow('HOLD');
    await flush(); await jest.advanceTimersByTimeAsync(BACKGROUND_IO_TIMEOUT_MS); await result;
    expect(f.tasks.status()).toMatchObject({ poisoned: true, inFlight: 1 }); expect(f.runner.release).not.toHaveBeenCalled();
    acquisition.resolve(f.client); await flush(); await jest.advanceTimersByTimeAsync(50); await flush();
    expect(f.runner.query).not.toHaveBeenCalled(); expect(work).not.toHaveBeenCalled(); expect(f.runner.release).toHaveBeenCalledTimes(1);
    expect(f.tasks.status()).toMatchObject({ inFlight: 0, poisoned: true }); jest.useRealTimers();
  });
  it('unsettled unlock SQL stays counted after caller timeout and socket retirement', async () => {
    jest.useFakeTimers(); const f = fixture(), unlock = deferred<unknown[]>(), original = f.runner.query.getMockImplementation()!;
    f.runner.query.mockImplementation((sql, args) => sql.includes('pg_advisory_unlock') ? unlock.promise : original(sql, args));
    const result = expect(f.service.run('credit_scheduler', async () => 1)).rejects.toThrow('HOLD'); await flush();
    await jest.advanceTimersByTimeAsync(BACKGROUND_IO_TIMEOUT_MS); await result;
    expect(f.tasks.status()).toMatchObject({ poisoned: true, inFlight: 1 }); expect(f.runner.release).toHaveBeenCalledTimes(1);
    unlock.reject(new Error('OWNED_LATE_DRIVER_SETTLEMENT')); await flush(); await jest.advanceTimersByTimeAsync(50); await flush();
    expect(f.tasks.status()).toMatchObject({ poisoned: true, inFlight: 0 }); jest.useRealTimers();
  });
  it('preserves fixed primary and cleanup categories when business and unlock both fail', async () => {
    const f = fixture(), original = f.runner.query.getMockImplementation()!;
    f.runner.query.mockImplementation((sql, args) => sql.includes('pg_advisory_unlock') ? Promise.resolve([{ released: false }]) : original(sql, args));
    await expect(f.service.run('credit_scheduler', async () => { throw new Error('DO_NOT_SERIALIZE_BUSINESS_INPUT'); })).rejects.toMatchObject({
      message: 'BACKGROUND_BUSINESS_LOCK_HOLD', primaryFailure: 'BUSINESS', cleanupFailure: 'UNLOCK',
    });
    await tick(); expect(f.tasks.status().poisoned).toBe(true); expect(f.runner.release).toHaveBeenCalledTimes(1);
  });
  it('false unlock is HOLD and never produces successful result or healthy pool return', async () => {
    const f = fixture(), original = f.runner.query.getMockImplementation()!;
    f.runner.query.mockImplementation((sql, args) => sql.includes('pg_advisory_unlock') ? Promise.resolve([{ released: false }]) : original(sql, args));
    await expect(f.service.run('credit_scheduler', async () => 1)).rejects.toThrow('HOLD'); await tick();
    expect(f.tasks.status().poisoned).toBe(true); expect(f.client.end).toHaveBeenCalledTimes(1); expect(f.runner.release).toHaveBeenCalledTimes(1);
  });
});
