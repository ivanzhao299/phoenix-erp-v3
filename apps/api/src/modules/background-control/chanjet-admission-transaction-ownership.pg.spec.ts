import 'reflect-metadata';
import { DataSource, QueryRunner } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { BackgroundTaskService } from './background-task.service';
import { BackgroundManifestReader } from './background-manifest.reader';
import { BackgroundLockBackend } from './background-lock.backend';
import { BackgroundManifest } from './background-control.types';
import { backgroundAdmissionTransactionOwner } from './background-admission-transaction-owner';
import { AdmissionRow, ChanjetExecutionAdmissionStore } from '../chanjet/chanjet-execution-admission.store';

type Tx = { query(sql: string, parameters?: unknown[]): Promise<AdmissionRow[]> };
type StoreSeam = { transaction<T>(callback: (tx: Tx) => Promise<T>, deadlineAt?: Date): Promise<T> };
const url = process.env.BACKGROUND_TEST_PG_URL;
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
async function until(probe: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 4000;
  while (!await probe()) { if (Date.now() > deadline) throw new Error('OWNED_ADMISSION_FIXTURE_TIMEOUT'); await new Promise(r => setTimeout(r, 10)); }
}
(url ? describe : describe.skip)('whole admission transaction ownership on isolated PG16/18', () => {
  let business: DataSource, controlDb: DataSource, observer: QueryRunner;
  const owners: { tasks: BackgroundTaskService; control: BackgroundLockBackend }[] = [];
  const pending: (() => void)[] = [];
  const wait = () => { const d = deferred(); pending.push(d.resolve); return d; };
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/fence_test' || parsed.username !== 'fence_fixture'
      || !['56416', '56418'].includes(parsed.port)) throw new Error('EXPLICIT_OWNED_PG16_18_LOOPBACK_REQUIRED');
    const common = { type: 'postgres' as const, url, synchronize: false, migrationsRun: false, installExtensions: false };
    business = await new DataSource({ ...common, extra: { max: 1, application_name: `owned-admission-fixture:${randomUUID()}` } }).initialize();
    controlDb = await new DataSource(common).initialize();
    observer = controlDb.createQueryRunner('master'); await observer.connect();
    const [version] = await observer.query('SHOW server_version_num');
    expect(Math.floor(Number(version.server_version_num) / 10000)).toBe(parsed.port === '56416' ? 16 : 18);
  });
  afterEach(async () => {
    for (const release of pending.splice(0)) release();
    jest.restoreAllMocks();
    for (const { tasks, control } of owners.splice(0)) {
      await until(() => tasks.status().inFlight === 0);
      await tasks.shutdown(1000).catch(() => undefined);
      // Exact fixture-owned teardown after asserting HOLD, not successful
      // participant drain. No business table or provider access.
      await control.close();
    }
    await observer.query('SELECT pg_advisory_unlock_all()');
  });
  afterAll(async () => { await observer?.release(); await business?.destroy(); await controlDb?.destroy(); });
  const create = async () => {
    const reader = new BackgroundManifestReader(), control = new BackgroundLockBackend(controlDb), tasks = new BackgroundTaskService(reader, control);
    const sha = 'a'.repeat(40);
    const manifest: BackgroundManifest = { protocolVersion: 1, owner: 'owned-admission-pg-fixture', generation: 1, phase: 'OPEN', targetSha: sha,
      participants: [{ bootId: tasks.identity.bootId, containerId: 'f'.repeat(64), revision: sha, allowedKinds: ['CHANJET_SYNC'] }] };
    jest.spyOn(reader, 'read').mockImplementation(() => reader.validate(manifest));
    owners.push({ tasks, control }); await tasks.onModuleInit();
    const store = new ChanjetExecutionAdmissionStore(business.manager, backgroundAdmissionTransactionOwner(tasks));
    return { tasks, manifest, transact: (store as unknown as StoreSeam).transaction.bind(store) };
  };
  const executionBlocked = async () => expect((await observer.query('SELECT pg_try_advisory_lock(17455,2) AS acquired'))[0].acquired).toBe(false);
  it('retains actual pool wait after caller HOLD and denies late SQL before rollback/release', async () => {
    const f = await create(), held = business.createQueryRunner('master'); await held.connect();
    const sql = jest.fn(async (tx: Tx) => tx.query('SELECT 1'));
    try {
      const operation = f.tasks.run('outer', 'CHANJET_SYNC', () => f.transact(sql, new Date(Date.now() + 30)));
      await expect(operation).rejects.toThrow(); f.manifest.phase = 'FENCED';
      expect(f.tasks.status()).toMatchObject({ inFlight: 1, poisoned: false }); await executionBlocked();
    } finally { await held.release(); }
    await until(() => f.tasks.status().inFlight === 0);
    expect(sql).toHaveBeenCalledTimes(1);
    expect(f.tasks.status()).toMatchObject({ poisoned: true, phase: 'HOLD' });
    await executionBlocked(); await expect(f.tasks.shutdown(100)).rejects.toThrow('DRAIN_TIMEOUT_OR_SESSION_LOST');
  });
  it.each(['commitTransaction', 'rollbackTransaction', 'release'] as const)('retains actual TypeORM %s tail after caller HOLD', async method => {
    const f = await create(), gate = wait(), entered = deferred(), runner = business.createQueryRunner('master');
    const original = runner[method].bind(runner);
    jest.spyOn(runner, method).mockImplementation(async () => { entered.resolve(); await gate.promise; return original(); });
    jest.spyOn(business, 'createQueryRunner').mockReturnValue(runner);
    const operation = f.tasks.run('outer', 'CHANJET_SYNC', () => f.transact(async tx => {
      await tx.query('SELECT 1');
      if (method === 'rollbackTransaction') throw new Error('OWNED_READONLY_FIXTURE_REJECTION');
      return 7;
    }, new Date(Date.now() + 200)));
    await entered.promise; await expect(operation).rejects.toThrow(); f.manifest.phase = 'FENCED';
    expect(f.tasks.status().inFlight).toBe(1); await executionBlocked();
    gate.resolve(); await until(() => f.tasks.status().inFlight === 0); expect(runner.isReleased).toBe(true);
    if (method === 'rollbackTransaction') {
      expect(f.tasks.status().poisoned).toBe(true); await executionBlocked();
      await expect(f.tasks.shutdown(100)).rejects.toThrow('DRAIN_TIMEOUT_OR_SESSION_LOST');
    } else { expect(f.tasks.status().poisoned).toBe(false); await f.tasks.shutdown(1000); }
  });
  it('refuses successful drain after manager release rejection', async () => {
    const f = await create(), runner = business.createQueryRunner('master'), release = runner.release.bind(runner);
    jest.spyOn(runner, 'release').mockImplementation(async () => { await release(); throw new Error('OWNED_RELEASE_ACK_UNKNOWN'); });
    jest.spyOn(business, 'createQueryRunner').mockReturnValue(runner);
    await expect(f.transact(async tx => { await tx.query('SELECT 1'); return 7; })).rejects.toThrow();
    expect(f.tasks.status()).toMatchObject({ inFlight: 0, poisoned: true, phase: 'HOLD' });
    await executionBlocked(); await expect(f.tasks.shutdown(100)).rejects.toThrow('DRAIN_TIMEOUT_OR_SESSION_LOST');
  });
});
