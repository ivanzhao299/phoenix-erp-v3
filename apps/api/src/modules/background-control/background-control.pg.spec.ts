import 'reflect-metadata';
import { spawn, ChildProcess } from 'node:child_process';
import { DataSource, QueryRunner } from 'typeorm';
import { BackgroundManifestReader } from './background-manifest.reader';
import { BackgroundLockBackend } from './background-lock.backend';
import { BackgroundTaskService } from './background-task.service';
import { BackgroundManifest } from './background-control.types';

const url = process.env.BACKGROUND_TEST_PG_URL;
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }

(url ? describe : describe.skip)('Background lock protocol on explicit isolated PostgreSQL fixture', () => {
  let db: DataSource;
  let coordinator: QueryRunner;
  const services: BackgroundTaskService[] = [];
  const children: ChildProcess[] = [];
  const pendingResolvers: (() => void)[] = [];
  const pendingWork = () => { const d = deferred(); pendingResolvers.push(d.resolve); return d; };
  const manifest: BackgroundManifest = { protocolVersion: 1, owner: 'pg-fixture-owner', generation: 1,
    phase: 'OPEN', targetSha: 'a'.repeat(40), participants: [] };
  const backend = () => new BackgroundLockBackend(db);
  const create = async () => {
    const requestedPhase = manifest.phase;
    manifest.phase = 'FENCED'; manifest.generation++;
    const reader = new BackgroundManifestReader();
    jest.spyOn(reader, 'read').mockImplementation(() => reader.validate(manifest));
    const locks = backend(); const service = new BackgroundTaskService(reader, locks);
    manifest.participants.push({ bootId: service.identity.bootId, containerId: 'f'.repeat(64), revision: manifest.targetSha,
      allowedKinds: ['LOCAL', 'NOTIFICATION'] });
    manifest.generation++;
    services.push(service); await service.onModuleInit();
    manifest.phase = requestedPhase; manifest.generation++;
    return { service, locks };
  };
  const exclusive = async (key: number) => (await coordinator.query('SELECT pg_try_advisory_lock($1::int,$2::int) AS acquired', [17455, key]))[0].acquired;
  const waitExclusive = async (key: number) => {
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) { if (await exclusive(key)) return true; await tick(); }
    return false;
  };
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/fence_test' || parsed.username !== 'fence_fixture'
      || !['56416', '56418'].includes(parsed.port)) throw new Error('Explicit owned loopback PG16/18 fixture required');
    db = await new DataSource({ type: 'postgres', url, synchronize: false, migrationsRun: false, installExtensions: false }).initialize();
    const versions = await db.query('SHOW server_version_num');
    const expectedMajor = parsed.port === '56416' ? 16 : 18;
    if (Math.floor(Number(versions[0].server_version_num) / 10000) !== expectedMajor) throw new Error('Fixture PostgreSQL major mismatch');
    coordinator = db.createQueryRunner(); await coordinator.connect();
  });
  afterEach(async () => {
    for (const resolve of pendingResolvers.splice(0)) resolve();
    for (const service of services.splice(0)) await service.shutdown(1000).catch(() => undefined);
    for (const child of children.splice(0)) if (child.exitCode === null) child.kill();
    await coordinator.query('SELECT pg_advisory_unlock_all()');
    manifest.phase = 'OPEN'; manifest.generation++; manifest.participants = [];
  });
  afterAll(async () => { await coordinator?.release(); await db?.destroy(); });

  it('initializes a live control-only session while default-fenced without entering work', async () => {
    manifest.phase = 'FENCED'; const f = await create();
    expect(f.service.status().controlSession.connected).toBe(true);
    expect(f.service.status().inFlight).toBe(0);
    expect(await waitExclusive(2)).toBe(true);
    await expect(f.service.run('denied', 'LOCAL', async () => undefined)).rejects.toThrow('FENCED_OR_UNAUTHORIZED');
  });
  it('waits for a real in-flight control heartbeat before observing without hiding active business work', async () => {
    const nativeCreate = db.createQueryRunner.bind(db), started = deferred(), work = pendingWork(), entered = deferred();
    let delayNext = false;
    const factory = jest.spyOn(db, 'createQueryRunner').mockImplementation(mode => {
      const runner = nativeCreate(mode), nativeQuery = runner.query.bind(runner);
      runner.query = async (sql: string, parameters?: unknown[], structured?: true) => {
        if (delayNext && typeof sql === 'string' && sql.includes('AS session_probe')) {
          delayNext = false; started.resolve();
          return structured === true ? nativeQuery(sql + ' FROM pg_sleep(0.5)', parameters, true) : nativeQuery(sql + ' FROM pg_sleep(0.5)', parameters);
        }
        return structured === true ? nativeQuery(sql, parameters, true) : nativeQuery(sql, parameters);
      };
      return runner;
    });
    let active: Promise<unknown> | undefined;
    try {
      const f = await create(), originalPid = f.locks.status().sessionPid;
      active = f.service.run('status-during-pg-heartbeat', 'LOCAL', async () => { entered.resolve(); await work.promise; });
      await entered.promise; delayNext = true; await started.promise;
      const deadline = Date.now() + 1000;
      while (true) {
        const rows = await coordinator.query('SELECT wait_event FROM pg_stat_activity WHERE pid=$1', [originalPid]);
        if (rows[0]?.wait_event === 'PgSleep') break;
        if (Date.now() >= deadline) throw new Error('OWNED_CONTROL_QUERY_NOT_OBSERVED');
        await tick();
      }
      expect(f.service.status()).toMatchObject({ inFlight: 1, controlSession: { cleanup: { queriesPending: 1 } } });
      let settled = false;
      const observing = f.service.observeStatus(); void observing.then(() => { settled = true; });
      await tick(); expect(settled).toBe(false);
      expect(await observing).toMatchObject({ inFlight: 1, taskGraphs: 1, poisoned: false,
        controlSession: { connected: true, sessionPid: originalPid, cleanup: { queriesPending: 0 } } });
    } finally {
      delayNext = false; factory.mockRestore(); work.resolve(); await active;
    }
  });
  it('holds one shared execution lock across two outer jobs and detached notification children', async () => {
    const f = await create(); const pending = pendingWork();
    await f.service.run('parent', 'LOCAL', async () => f.service.spawn('child', 'NOTIFICATION', () => pending.promise));
    expect(await exclusive(2)).toBe(false);
    await f.service.run('second', 'LOCAL', async () => undefined);
    expect(await exclusive(2)).toBe(false);
    pending.resolve(); await tick(); await tick();
    // Queue flush, not wall-clock assumption, establishes release completion.
    await f.service.run('flush', 'LOCAL', async () => undefined);
    expect(await exclusive(2)).toBe(true);
  });
  it('two independent API sessions both block coordinator until complete graph drain', async () => {
    const first = await create(); const second = await create(); const a = pendingWork(); const b = pendingWork();
    const aStarted = deferred(); const bStarted = deferred();
    first.service.spawn('a', 'LOCAL', async () => { aStarted.resolve(); await a.promise; });
    second.service.spawn('b', 'LOCAL', async () => { bStarted.resolve(); await b.promise; });
    // Actual work starts after gateExit, unlike an intermediate inFlight observation.
    await Promise.all([aStarted.promise, bStarted.promise]);
    manifest.phase = 'FENCED'; manifest.generation++;
    expect(await exclusive(1)).toBe(true);
    expect(await exclusive(2)).toBe(false);
    a.resolve(); await first.service.shutdown(1000); expect(await exclusive(2)).toBe(false);
    b.resolve(); await second.service.shutdown(1000); expect(await exclusive(2)).toBe(true);
  });
  it('coordinator gate races deny new jobs immediately while old graph can drain', async () => {
    const f = await create(); const pending = pendingWork(); let started!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    f.service.spawn('old', 'LOCAL', async () => { started(); await pending.promise; }); await entered;
    expect(await exclusive(1)).toBe(true);
    await expect(f.service.run('racing', 'LOCAL', async () => undefined)).rejects.toThrow('ADMISSION_GATE_FENCED');
    pending.resolve(); await f.service.shutdown(1000);
    expect(await exclusive(2)).toBe(true);
  });
  it('backend termination poisons the participant even when its PG lock vanishes', async () => {
    const f = await create(); const pending = pendingWork(); let started!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    f.service.spawn('long', 'LOCAL', async () => { started(); await pending.promise; }); await entered;
    const pid = f.locks.status().sessionPid;
    expect(pid).not.toBeNull(); await coordinator.query('SELECT pg_terminate_backend($1)', [pid]);
    const deadline = Date.now() + 2000;
    while (!f.service.status().poisoned && Date.now() < deadline) await tick();
    expect(f.service.status().poisoned).toBe(true);
    expect(await exclusive(2)).toBe(true);
    await expect(f.service.run('after-loss', 'LOCAL', async () => undefined)).rejects.toThrow('PARTICIPANT_HOLD');
    pending.resolve(); await tick();
  });
  it('publishes a unique live boot-bound session and poisons it if its name drifts', async () => {
    const f = await create(); const status = f.service.status().controlSession;
    expect(status.applicationName).toBe(`phoenix-fence:${f.service.identity.bootId}`);
    const rows = await coordinator.query('SELECT pid,datid,backend_start FROM pg_stat_activity WHERE application_name=$1', [status.applicationName]);
    expect(rows).toHaveLength(1); expect(rows[0].pid).toBe(status.sessionPid); expect(Number(rows[0].datid)).toBe(status.databaseOid);
    expect(new Date(rows[0].backend_start).toISOString()).toBe(status.backendStartedAt);
    // Fixture-only fault injection into the exact dedicated runner, not a production control endpoint.
    const runner = Reflect.get(f.locks, 'runner') as QueryRunner;
    await runner.query("SELECT set_config('application_name','wrong-fixture-identity',false)");
    await expect(f.locks.probe()).rejects.toThrow('BACKGROUND_SESSION_IDENTITY_LOST');
    expect(f.service.status().poisoned).toBe(true);
  });
  it('retired control PID/backend_start cannot return through a healthy TypeORM pool borrow', async () => {
    const locks = backend(); locks.bindIdentity('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    await locks.probe(); await locks.executionEnter(); const old = locks.status();
    await locks.close();
    expect(locks.status().cleanup).toMatchObject({ terminationConfirmed: true, releaseConfirmed: true, debt: false });
    const deadline = Date.now() + 2000; let remaining = 1;
    while (remaining && Date.now() < deadline) {
      const rows = await coordinator.query('SELECT count(*)::int AS remaining FROM pg_stat_activity WHERE pid=$1 AND floor(extract(epoch from backend_start)*1000)::bigint=$2',
        [old.sessionPid, Date.parse(old.backendStartedAt!)]);
      remaining = rows[0].remaining; if (remaining) await tick();
    }
    expect(remaining).toBe(0); expect(await waitExclusive(2)).toBe(true);
    for (let i = 0; i < 4; i++) {
      const next = db.createQueryRunner('master');
      try {
        await next.connect(); const rows = await next.query('SELECT pg_backend_pid() AS pid,backend_start FROM pg_stat_activity WHERE pid=pg_backend_pid()');
        expect(rows[0].pid === old.sessionPid && new Date(rows[0].backend_start).toISOString() === old.backendStartedAt).toBe(false);
      } finally { await next.release(); }
    }
    await expect(locks.probe()).rejects.toThrow('BACKGROUND_SESSION_LOST');
  });
  it('a timed-out actual control query releases its session but cannot drain still-running business work', async () => {
    const f = await create(), pending = pendingWork(), started = deferred();
    f.service.spawn('held-business-work', 'LOCAL', async () => { started.resolve(); await pending.promise; }); await started.promise;
    const old = f.locks.status();
    const runner = Reflect.get(f.locks, 'runner') as QueryRunner;
    const original = runner.query.bind(runner);
    jest.spyOn(runner, 'query').mockImplementation((sql: string, parameters?: unknown[]) =>
      sql.includes('pg_backend_pid()') ? original('SELECT pg_sleep(20)') : original(sql, parameters));
    await expect(f.locks.probe()).rejects.toThrow('BACKGROUND_SESSION_LOST');
    expect(f.service.status()).toMatchObject({ poisoned: true, phase: 'HOLD', inFlight: 1, taskGraphs: 1, controlSession: { broken: true } });
    // Local socket termination is not a server-session disappearance receipt.
    // Server work can outlive a TCP close; independently observe this exact
    // PID/backend_start before asserting that its advisory locks are gone.
    let remaining = 1; const deadline = Date.now() + 25000;
    while (remaining && Date.now() < deadline) {
      const rows = await coordinator.query('SELECT count(*)::int AS remaining FROM pg_stat_activity WHERE pid=$1 AND floor(extract(epoch from backend_start)*1000)::bigint=$2',
        [old.sessionPid, Date.parse(old.backendStartedAt!)]);
      remaining = rows[0].remaining; if (remaining) await new Promise(resolve => setTimeout(resolve, 100));
    }
    expect(remaining).toBe(0);
    expect(await waitExclusive(2)).toBe(true);
    await expect(f.service.shutdown(100)).rejects.toThrow('DRAIN_TIMEOUT_OR_SESSION_LOST');
    expect(f.service.status().inFlight).toBe(1);
    await expect(f.service.run('never-admitted-after-timeout', 'LOCAL', async () => undefined)).rejects.toThrow('PARTICIPANT_HOLD');
    pending.resolve(); await tick();
  }, 40000);
  it('a separate process death releases locks but provides no quiescent participant proof', async () => {
    const script = `const{Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.BACKGROUND_TEST_PG_URL});await c.connect();await c.query('SELECT pg_advisory_lock_shared(17455,2)');process.send({locked:true});setInterval(()=>{},1000)})().catch(()=>process.exit(2));`;
    const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      env: { NODE_ENV: 'test', PATH: process.env.PATH, BACKGROUND_TEST_PG_URL: url } });
    children.push(child);
    await new Promise<void>((resolve, reject) => { child.once('message', () => resolve()); child.once('exit', code => reject(new Error(`Fixture child exited ${code}`))); });
    expect(await exclusive(2)).toBe(false);
    child.kill(); await new Promise<void>(resolve => child.once('exit', () => resolve()));
    // Process exit and PostgreSQL observing socket closure are separate events.
    expect(await waitExclusive(2)).toBe(true);
    // Root coordinator must independently reject the missing boot/container; locks alone are insufficient.
  });

  it('two real BackgroundTaskService processes refuse fenced admissions and jointly drain execution', async () => {
    const servicePath = `${__dirname}/background-task.service.ts`;
    const readerPath = `${__dirname}/background-manifest.reader.ts`;
    const backendPath = `${__dirname}/background-lock.backend.ts`;
    const script = `
      const fs=require('fs'),ts=require(${JSON.stringify(require.resolve('typescript'))});
      require.extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,experimentalDecorators:true,emitDecoratorMetadata:true}}).outputText,file);
      require('reflect-metadata');
      const {DataSource}=require('typeorm');
      const {BackgroundTaskService}=require(${JSON.stringify(servicePath)});
      const {BackgroundManifestReader}=require(${JSON.stringify(readerPath)});
      const {BackgroundLockBackend}=require(${JSON.stringify(backendPath)});
      (async()=>{
        const db=await new DataSource({type:'postgres',url:process.env.BACKGROUND_TEST_PG_URL,synchronize:false,migrationsRun:false,installExtensions:false}).initialize();
        const reader=new BackgroundManifestReader();
        let manifest={protocolVersion:1,phase:'FENCED',owner:'child-fixture',generation:1,targetSha:'a'.repeat(40),participants:[]};
        reader.read=()=>reader.validate(manifest);
        const service=new BackgroundTaskService(reader,new BackgroundLockBackend(db));
        await service.onModuleInit();let settle;
        process.on('message',async m=>{try{
          if(m.op==='manifest'){manifest=m.manifest;process.send({id:m.id,ok:true});}
          if(m.op==='start'){service.spawn('child-process-job','LOCAL',async()=>{process.send({id:m.id,ok:true});await new Promise(r=>settle=r);});}
          if(m.op==='settle'){settle();while(service.status().inFlight!==0)await new Promise(r=>setImmediate(r));process.send({id:m.id,ok:true});}
          if(m.op==='attempt'){try{await service.run('fenced','LOCAL',async()=>{});process.send({id:m.id,admitted:true});}catch(e){process.send({id:m.id,admitted:false});}}
          if(m.op==='status')process.send({id:m.id,status:service.status()});
          if(m.op==='stop'){await service.shutdown(2000);await db.destroy();process.send({id:m.id,ok:true});process.disconnect();}
        }catch(e){process.send({id:m.id,error:'FIXTURE_OPERATION_FAILED'});}});
        process.send({event:'ready',bootId:service.identity.bootId});
      })().catch(()=>{if(process.send)process.send({event:'fatal'});process.exit(2)});`;
    const launch = async () => {
      const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        env: { NODE_ENV: 'test', PATH: process.env.PATH, BACKGROUND_TEST_PG_URL: url } });
      children.push(child);
      const bootId = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Service fixture boot timeout')), 5000);
        child.once('message', (message: { event: string; bootId: string }) => {
          clearTimeout(timeout); if (message.event === 'ready') resolve(message.bootId); else reject(new Error('Service fixture boot failed'));
        });
        child.once('exit', () => { clearTimeout(timeout); reject(new Error('Service fixture exited before ready')); });
      });
      let id = 0;
      const request = (op: string, fields: Record<string, unknown> = {}) => new Promise<Record<string, unknown>>((resolve, reject) => {
        const target = ++id;
        const timeout = setTimeout(() => { child.removeListener('message', listener); reject(new Error('Service fixture IPC timeout')); }, 4000);
        const listener = (message: Record<string, unknown>) => {
          if (message.id !== target) return;
          clearTimeout(timeout); child.removeListener('message', listener);
          if (message.error) reject(new Error('Service fixture operation failed')); else resolve(message);
        };
        child.on('message', listener); child.send({ ...fields, op, id: target });
      });
      return { bootId, request };
    };
    const first = await launch(); const second = await launch();
    const control: BackgroundManifest = { protocolVersion: 1, phase: 'OPEN', owner: 'multi-process-fixture', generation: 2,
      targetSha: 'a'.repeat(40), participants: [first, second].map((c, i) => ({ bootId: c.bootId,
        containerId: (i === 0 ? 'c' : 'd').repeat(64), revision: 'a'.repeat(40), allowedKinds: ['LOCAL'] })) };
    await Promise.all([first.request('manifest', { manifest: control }), second.request('manifest', { manifest: control })]);
    await Promise.all([first.request('start'), second.request('start')]);
    expect(await exclusive(2)).toBe(false);
    control.phase = 'FENCED'; control.generation++;
    await Promise.all([first.request('manifest', { manifest: control }), second.request('manifest', { manifest: control })]);
    expect(await exclusive(1)).toBe(true);
    expect((await first.request('attempt')).admitted).toBe(false);
    expect((await second.request('attempt')).admitted).toBe(false);
    await first.request('settle'); expect(await exclusive(2)).toBe(false);
    await second.request('settle');
    let acquired = false; const deadline = Date.now() + 1000;
    while (!acquired && Date.now() < deadline) { acquired = await exclusive(2); if (!acquired) await tick(); }
    expect(acquired).toBe(true);
    for (const child of [first, second]) {
      const status = (await child.request('status')).status;
      expect(status).toMatchObject({ inFlight: 0, taskGraphs: 0, poisoned: false, phase: 'FENCED', controlSession: { connected: true, broken: false } });
    }
    await Promise.all([first.request('stop'), second.request('stop')]);
  }, 15000);
});
