import { ChanjetReadonlySyncScheduler } from '../chanjet/chanjet-readonly-sync.scheduler';
import { backgroundAdmissionTransactionOwner } from './background-admission-transaction-owner';
import { BackgroundTaskService } from './background-task.service';
import { BackgroundManifestReader } from './background-manifest.reader';
import { BackgroundLockBackend } from './background-lock.backend';
import { BackgroundManifest } from './background-control.types';
import { AdmissionManager, AdmissionRow, ChanjetExecutionAdmissionStore } from '../chanjet/chanjet-execution-admission.store';

type Tx = { query(sql: string, parameters?: unknown[]): Promise<AdmissionRow[]> };
type StoreSeam = { transaction<T>(callback: (tx: Tx) => Promise<T>, deadlineAt?: Date): Promise<T> };
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(manager: AdmissionManager) {
  const sha = 'a'.repeat(40);
  const manifest: BackgroundManifest = { protocolVersion: 1, phase: 'OPEN', owner: 'admission-fixture', generation: 1, targetSha: sha,
    participants: [{ bootId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', containerId: 'f'.repeat(64), revision: sha, allowedKinds: ['CHANJET_SYNC'] }] };
  const reader = new BackgroundManifestReader();
  jest.spyOn(reader, 'read').mockImplementation(() => reader.validate(manifest));
  const backend = { bindLoss: jest.fn(), bindIdentity: jest.fn(), gateEnter: jest.fn(async () => true), gateExit: jest.fn(async () => undefined),
    executionEnter: jest.fn(async () => true), executionExit: jest.fn(async () => undefined),
    status: () => ({ connected: true, broken: false }), close: jest.fn(async () => undefined) };
  const tasks = new BackgroundTaskService(reader, backend as unknown as BackgroundLockBackend);
  tasks.identity.bootId = manifest.participants[0].bootId;
  const owner = backgroundAdmissionTransactionOwner(tasks);
  const ownerSpy = jest.spyOn(owner, 'run');
  const store = new ChanjetExecutionAdmissionStore(manager, owner);
  return { tasks, backend, manifest, ownerSpy, transact: (store as unknown as StoreSeam).transaction.bind(store) };
}

describe('admission transaction whole-resource task ownership', () => {
  afterEach(() => jest.useRealTimers());
  it('denies the lazy manager starter under FENCED before acquiring any resource', async () => {
    const manager = { transaction: jest.fn() };
    const f = fixture(manager); f.manifest.phase = 'FENCED'; const callback = jest.fn();
    await expect(f.transact(callback)).rejects.toThrow();
    expect(manager.transaction).not.toHaveBeenCalled(); expect(callback).not.toHaveBeenCalled();
    expect(f.tasks.status()).toMatchObject({ inFlight: 0, poisoned: false });
  });
  it('retains a late pool acquisition through actual rollback and release after deadline HOLD', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    const pool = deferred(), rollback = deferred(), release = deferred(), acquired = deferred(), rolled = deferred();
    const query = jest.fn(async () => []);
    const manager: AdmissionManager = { transaction: jest.fn(async callback => {
      await pool.promise;
      try { acquired.resolve(); return await callback({ query }); }
      catch (error) { await rollback.promise; rolled.resolve(); throw error; }
      finally { await release.promise; }
    }) };
    const f = fixture(manager);
    const result = f.tasks.run('outer', 'CHANJET_SYNC', () => f.transact(tx => tx.query('SELECT 1'), new Date(Date.now() + 25)));
    await tick(); jest.advanceTimersByTime(26);
    await expect(result).rejects.toThrow();
    f.manifest.phase = 'FENCED';
    expect(f.tasks.status()).toMatchObject({ inFlight: 1, taskGraphs: 1 });
    pool.resolve(); await acquired.promise; await tick();
    expect(query).not.toHaveBeenCalled(); expect(f.tasks.status().inFlight).toBe(1);
    rollback.resolve(); await rolled.promise; await tick();
    expect(f.tasks.status().inFlight).toBe(1); expect(f.backend.executionExit).not.toHaveBeenCalled();
    release.resolve(); await tick();
    expect(f.tasks.status()).toMatchObject({ inFlight: 0, poisoned: true, phase: 'HOLD' });
    expect(f.backend.executionExit).not.toHaveBeenCalled();
    await expect(f.tasks.shutdown(100)).rejects.toThrow('DRAIN_TIMEOUT_OR_SESSION_LOST');
    expect(f.ownerSpy).toHaveBeenCalledTimes(1); expect(manager.transaction).toHaveBeenCalledTimes(1);
  });
  it.each(['commit', 'rollback', 'release'] as const)('keeps %s settlement registered after the caller deadline', async stage => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    const blocked = deferred(), entered = deferred();
    const manager: AdmissionManager = { transaction: jest.fn(async callback => {
      try {
        const value = await callback({ query: async () => [] });
        if (stage === 'commit') { entered.resolve(); await blocked.promise; }
        return value;
      } catch (error) {
        if (stage === 'rollback') { entered.resolve(); await blocked.promise; }
        throw error;
      } finally {
        if (stage === 'release') { entered.resolve(); await blocked.promise; }
      }
    }) };
    const f = fixture(manager);
    const result = f.tasks.run('outer', 'CHANJET_SYNC', () => f.transact(async tx => {
      await tx.query('SELECT 1');
      if (stage === 'rollback') throw new Error('FIXTURE_BUSINESS_REJECTED');
      return 7;
    }, new Date(Date.now() + 25)));
    await entered.promise; jest.advanceTimersByTime(26); await expect(result).rejects.toThrow();
    f.manifest.phase = 'FENCED';
    expect(f.tasks.status()).toMatchObject({ inFlight: 1, taskGraphs: 1 });
    expect(f.backend.executionExit).not.toHaveBeenCalled();
    blocked.resolve(); await tick();
    expect(f.tasks.status().inFlight).toBe(0);
    if (stage === 'rollback') {
      expect(f.tasks.status().poisoned).toBe(true); expect(f.backend.executionExit).not.toHaveBeenCalled();
      await expect(f.tasks.shutdown(100)).rejects.toThrow('DRAIN_TIMEOUT_OR_SESSION_LOST');
    } else expect(f.backend.executionExit).toHaveBeenCalledTimes(1);
  });
  it.each(['callback', 'rollback', 'release'] as const)('permanently HOLDs ambiguous %s rejection before decrementing the child', async stage => {
    const manager: AdmissionManager = { transaction: jest.fn(async callback => {
      const outcome = await callback({ query: async () => [] }).then(value => ({ value }), error => ({ error }));
      if (stage === 'release') throw new Error('FIXTURE_RELEASE_FAILED');
      if ('error' in outcome) {
        if (stage === 'rollback') throw new Error('FIXTURE_ROLLBACK_FAILED');
        throw outcome.error;
      }
      return outcome.value;
    }) };
    const f = fixture(manager);
    await expect(f.transact(async () => { if (stage !== 'release') throw new Error('FIXTURE_CALLBACK_FAILED'); return 7; })).rejects.toThrow();
    expect(f.tasks.status()).toMatchObject({ inFlight: 0, poisoned: true, phase: 'HOLD' });
    expect(f.backend.executionExit).not.toHaveBeenCalled();
    f.manifest.phase = 'OPEN';
    await expect(f.tasks.run('new', 'CHANJET_SYNC', async () => 1)).rejects.toThrow('PARTICIPANT_HOLD');
    await expect(f.tasks.shutdown(100)).rejects.toThrow('DRAIN_TIMEOUT_OR_SESSION_LOST');
    expect(f.backend.close).not.toHaveBeenCalled();
  });
  it('without a deadline still waits for manager completion and invokes owner/starter exactly once', async () => {
    const release = deferred(), entered = deferred();
    const manager: AdmissionManager = { transaction: jest.fn(async callback => {
      const value = await callback({ query: async () => [] }); entered.resolve(); await release.promise; return value;
    }) };
    const f = fixture(manager);
    let settled = false;
    const result = f.transact(async tx => { await tx.query('SELECT 1'); return 7; }).finally(() => { settled = true; });
    await entered.promise; expect(settled).toBe(false); expect(f.tasks.status().inFlight).toBe(1);
    release.resolve(); await expect(result).resolves.toBe(7);
    expect(f.ownerSpy).toHaveBeenCalledTimes(1); expect(manager.transaction).toHaveBeenCalledTimes(1);
    expect(f.tasks.status().inFlight).toBe(0);
  });
  it('wires the real API scheduler singleton to whole-transaction ownership without starting the guard or a sync', async () => {
    const done = deferred(), entered = deferred();
    const manager: AdmissionManager = { transaction: jest.fn(async callback => {
      const value = await callback({ query: async () => [] }); entered.resolve(); await done.promise; return value;
    }) };
    const f = fixture(manager);
    const ds = { manager, options: { type: 'postgres', host: '127.0.0.1', port: 56416, username: 'fence_fixture', database: 'fence_test' } };
    const scheduler = new ChanjetReadonlySyncScheduler({} as never, {} as never, ds as never, {} as never, f.tasks);
    type SchedulerSeam = { executionSupport(): { store: ChanjetExecutionAdmissionStore } };
    const support = (scheduler as unknown as SchedulerSeam).executionSupport();
    expect((scheduler as unknown as SchedulerSeam).executionSupport()).toBe(support);
    const store = support.store as unknown as StoreSeam;
    const operation = store.transaction(async () => 7);
    await entered.promise; expect(f.tasks.status().inFlight).toBe(1);
    done.resolve(); await expect(operation).resolves.toBe(7); expect(f.tasks.status().inFlight).toBe(0);
    f.manifest.phase = 'FENCED';
    await expect(store.transaction(async () => 9)).rejects.toThrow();
    expect(manager.transaction).toHaveBeenCalledTimes(1);
    await scheduler.onModuleDestroy();
  });
  it('keeps standalone one-argument storage callers working without creating a task owner', async () => {
    const manager: AdmissionManager = { transaction: jest.fn(async callback => callback({ query: async () => [] })) };
    const store = new ChanjetExecutionAdmissionStore(manager);
    await expect((store as unknown as StoreSeam).transaction(async () => 7)).resolves.toBe(7);
    expect(manager.transaction).toHaveBeenCalledTimes(1);
    const missing = new ChanjetExecutionAdmissionStore(undefined);
    await expect((missing as unknown as StoreSeam).transaction(async () => 7)).rejects.toThrow();
  });
});
