import 'reflect-metadata';
import { spawn, ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';
import { BackgroundBusinessLockService } from './background-business-lock.service';
import { BackgroundTaskService } from './background-task.service';
import { BackgroundLockBackend } from './background-lock.backend';
import { BackgroundManifestReader } from './background-manifest.reader';
import { BackgroundManifest } from './background-control.types';
interface FixtureIdentity { pid: number; database_oid: number; application_name: string; started_us: string }
const url = process.env.BACKGROUND_TEST_PG_URL;
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
async function until(probe: () => Promise<boolean>) { const deadline = Date.now() + 4000; while (!await probe()) { if (Date.now() > deadline) throw new Error('OWNED_BUSINESS_FIXTURE_WAIT_TIMEOUT'); await new Promise(r => setTimeout(r, 20)); } }
(url ? describe : describe.skip)('business sessions on explicit owned PostgreSQL', () => {
  let db: DataSource, observer: QueryRunner;
  const owners: { tasks: BackgroundTaskService; control: BackgroundLockBackend }[] = [];
  const pending: (() => void)[] = [], children: ChildProcess[] = [];
  const identitySql = `SELECT pid, datid::int AS database_oid, application_name,
    to_char(backend_start AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS started_us
    FROM pg_stat_activity WHERE pid=pg_backend_pid()`;
  const absent = async (identity: FixtureIdentity) => (await observer.query(`SELECT count(*)::int AS n FROM pg_stat_activity
    WHERE pid=$1 AND datid=$2 AND to_char(backend_start AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')=$3`,
    [identity.pid, identity.database_oid, identity.started_us]))[0].n === 0;
  const create = async () => {
    const reader = new BackgroundManifestReader(), control = new BackgroundLockBackend(db), tasks = new BackgroundTaskService(reader, control);
    const manifest: BackgroundManifest = { protocolVersion: 1, owner: 'owned-business-pg-fixture', generation: 1, phase: 'OPEN', targetSha: 'a'.repeat(40),
      participants: [{ bootId: tasks.identity.bootId, containerId: 'f'.repeat(64), revision: 'a'.repeat(40), allowedKinds: ['LOCAL', 'NOTIFICATION'] }] };
    jest.spyOn(reader, 'read').mockImplementation(() => reader.validate(manifest));
    owners.push({ tasks, control }); await tasks.onModuleInit();
    const sessions: QueryRunner[] = [];
    const ds = { createQueryRunner: () => { const r = db.createQueryRunner('master'); sessions.push(r); return r; } };
    return { tasks, control, manifest, sessions, locks: new BackgroundBusinessLockService(ds as unknown as DataSource, tasks) };
  };
  const wait = () => { const d = deferred(); pending.push(d.resolve); return d; };
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/fence_test' || parsed.username !== 'fence_fixture'
      || !['56416', '56418'].includes(parsed.port)) throw new Error('EXPLICIT_OWNED_PG16_18_LOOPBACK_REQUIRED');
    db = await new DataSource({ type: 'postgres', url, synchronize: false, migrationsRun: false, installExtensions: false }).initialize();
    const [version] = await db.query('SHOW server_version_num');
    if (Math.floor(Number(version.server_version_num) / 10000) !== (parsed.port === '56416' ? 16 : 18)) throw new Error('OWNED_FIXTURE_VERSION_MISMATCH');
    observer = db.createQueryRunner('master'); await observer.connect();
  });
  afterEach(async () => {
    for (const release of pending.splice(0)) release(); await tick();
    for (const owner of owners.splice(0)) {
      await owner.tasks.shutdown(1000).catch(() => undefined);
      // Explicit owned fault-fixture teardown, never reported as a successful
      // participant drain: a resource-poisoned participant intentionally HOLDs.
      await owner.control.close();
    }
    for (const child of children.splice(0)) if (child.exitCode === null && child.signalCode === null) {
      const closed = new Promise<void>(resolve => child.once('close', () => resolve())); child.send('release'); await closed;
    }
    await observer.query('SELECT pg_advisory_unlock_all()');
  });
  afterAll(async () => { await observer?.release(); await db?.destroy(); });

  it('keeps the real control nonce unique while a distinct business session owns the legacy key', async () => {
    const f = await create(), body = wait(), entered = deferred(); let business!: FixtureIdentity;
    const operation = f.locks.run('credit_scheduler', async () => { [business] = await f.sessions[0].query(identitySql); entered.resolve(); await body.promise; return 73; });
    await entered.promise;
    const [count] = await observer.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name=$1', [`phoenix-fence:${f.tasks.identity.bootId}`]);
    expect(count.n).toBe(1); expect(business.pid).not.toBe(f.control.status().sessionPid); expect(business.application_name).not.toBe(f.control.status().applicationName);
    expect((await observer.query("SELECT pg_try_advisory_lock(hashtext('credit_scheduler')) AS acquired"))[0].acquired).toBe(false);
    f.manifest.phase = 'FENCED'; f.manifest.generation++; expect(f.tasks.status().inFlight).toBe(2);
    body.resolve(); await expect(operation).resolves.toEqual({ acquired: true, value: 73 }); await until(() => absent(business));
    expect((await observer.query("SELECT pg_try_advisory_lock(hashtext('credit_scheduler')) AS acquired"))[0].acquired).toBe(true);
    await f.tasks.shutdown(1000);
  });
  it('independent API instances exclude the same key while distinct keys may run', async () => {
    const a = await create(), b = await create(), body = wait(), entered = deferred(), forbidden = jest.fn();
    const active = a.locks.run('egg_inventory_scheduler', async () => { entered.resolve(); await body.promise; return 1; }); await entered.promise;
    await expect(b.locks.run('egg_inventory_scheduler', forbidden)).resolves.toEqual({ acquired: false }); expect(forbidden).not.toHaveBeenCalled();
    await expect(b.locks.run('credit_scheduler', async () => 2)).resolves.toEqual({ acquired: true, value: 2 });
    body.resolve(); await active;
    await expect(b.locks.run('egg_inventory_scheduler', async () => 3)).resolves.toEqual({ acquired: true, value: 3 });
  });
  it('a separate process holding the exact legacy key prevents admission until its owned server session is gone', async () => {
    const f = await create(), name = `owned-business-fixture:${randomUUID()}`;
    const script = `const{Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.BACKGROUND_TEST_PG_URL,application_name:process.env.OWNED_BUSINESS_FIXTURE_NAME});await c.connect();await c.query("SELECT pg_advisory_lock(hashtext('credit_scheduler'))");const r=await c.query(${JSON.stringify(identitySql)});process.send(r.rows[0]);process.once('message',async()=>{await c.end();process.disconnect()})})().catch(()=>process.exitCode=2);`;
    const child = spawn(process.execPath, ['-e', script], { cwd: process.cwd(), stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      env: { PATH: process.env.PATH, NODE_ENV: 'test', BACKGROUND_TEST_PG_URL: url, OWNED_BUSINESS_FIXTURE_NAME: name } }); children.push(child);
    const closed = new Promise<void>((resolve, reject) => child.once('close', code => code === 0 ? resolve() : reject(new Error('OWNED_BUSINESS_CHILD_FAILED'))));
    const identity = await new Promise<FixtureIdentity>((resolve, reject) => { child.once('message', message => resolve(message as FixtureIdentity)); child.once('error', reject); child.once('exit', () => reject(new Error('OWNED_BUSINESS_CHILD_EARLY_EXIT'))); });
    const work = jest.fn(async () => 1); await expect(f.locks.run('credit_scheduler', work)).resolves.toEqual({ acquired: false }); expect(work).not.toHaveBeenCalled();
    child.send('release'); await closed; await until(() => absent(identity));
    await expect(f.locks.run('credit_scheduler', work)).resolves.toEqual({ acquired: true, value: 1 }); expect(work).toHaveBeenCalledTimes(1);
  });
  it('loss of only the owned business session leaves real work counted and the global control gate in HOLD', async () => {
    const f = await create(), body = wait(), entered = deferred(); let business!: FixtureIdentity;
    const active = f.locks.run('credit_scheduler', async () => { [business] = await f.sessions[0].query(identitySql); entered.resolve(); await body.promise; });
    const rejected = expect(active).rejects.toThrow('HOLD'); await entered.promise;
    const rows = await observer.query(`SELECT pg_terminate_backend(pid) AS terminated FROM pg_stat_activity
      WHERE pid=$1 AND datid=$2 AND to_char(backend_start AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')=$3 AND application_name=$4`,
      [business.pid, business.database_oid, business.started_us, business.application_name]);
    expect(rows).toEqual([{ terminated: true }]); await until(async () => f.tasks.status().poisoned);
    expect(f.tasks.status().inFlight).toBe(2); expect(f.control.status().connected).toBe(true);
    expect((await observer.query('SELECT pg_try_advisory_lock(17455,2) AS acquired'))[0].acquired).toBe(false);
    await expect(f.tasks.run('new-work', 'LOCAL', async () => undefined)).rejects.toThrow('PARTICIPANT_HOLD');
    body.resolve(); await rejected; await until(() => absent(business));
    await expect(f.tasks.shutdown(100)).rejects.toThrow('DRAIN_TIMEOUT_OR_SESSION_LOST');
  });
});
