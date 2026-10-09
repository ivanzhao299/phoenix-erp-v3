import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { fork } from 'node:child_process';
import { DataSource, QueryRunner } from 'typeorm';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';
import { ChanjetSyncJobEntity } from './chanjet-sync-job.entity';
import { ChanjetReadonlySyncScheduler } from './chanjet-readonly-sync.scheduler';
import { ChanjetReadonlyLockLease } from './chanjet-readonly-lock-lease';
import { ChanjetIntegrationService } from './chanjet-integration.service';
import { requireReadonlyOrchestration } from './chanjet-readonly-execution';
import { installReadonlyApprovalFixture } from './chanjet-readonly-policy.test-fixture';

const url = process.env.CHANJET_READONLY_FIXTURE_URL;
const integration = url ? describe : describe.skip;
const key = 'chanjet-full-readonly-sync';
const result = { decision: 'GO', mirror: { results: [{ key: 'RECEIVABLE_STATISTICS' }], attempts: 1, unresolvedFailures: [] }, exactMappings: null, reconciliation: { created: 0, autoResolved: 0 }, readiness: null };
function barrier() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}
// Deadlines only detect hung tests. All competing SQL is ordered by explicit barriers.
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('fixture barrier deadline')), 8000); })]); }
  finally { clearTimeout(timer!); }
}
function baselineScheduler(): typeof ChanjetReadonlySyncScheduler {
  const dir = join(__dirname, '../../../test/fixtures');
  const source = readFileSync(join(dir, 'chanjet-readonly-sync.scheduler.a2f4edba.txt'), 'utf8');
  const pin = JSON.parse(readFileSync(join(dir, 'chanjet-readonly-sync.scheduler.a2f4edba.json'), 'utf8'));
  expect(pin.commit).toBe('a2f4edba43bc6cd16247382e0306885a4ae6486d');
  expect(createHash('sha256').update(source).digest('hex')).toBe(pin.sha256);
  const compiled = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true, emitDecoratorMetadata: true } }).outputText;
  const module = { exports: {} as { ChanjetReadonlySyncScheduler: typeof ChanjetReadonlySyncScheduler } };
  // Only this checked-in, digest-pinned historical source is executed, never external input.
  new Function('require', 'module', 'exports', compiled)(require, module, module.exports);
  return module.exports.ChanjetReadonlySyncScheduler;
}

integration('real PostgreSQL continuous readonly lock ownership', () => {
  let ds: DataSource;
  let restore: () => void;
  let server: Server;
  let endpoint: string;
  let reads: number;
  const priorFlag = process.env.CHANJET_READONLY_SYNC_ENABLED;
  const runners: QueryRunner[] = [];
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/chanjet_restore_fixture') throw Error('isolated loopback fixture required');
    ds = new DataSource({ type: 'postgres', url, entities: [ChanjetSyncJobEntity], synchronize: true, extra: { max: 24 } });
    await ds.initialize();
    server = createServer((req, res) => {
      if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
      reads++; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result));
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/readonly-fixture`;
  });
  beforeEach(async () => {
    restore = installReadonlyApprovalFixture(); process.env.CHANJET_READONLY_SYNC_ENABLED = 'true'; reads = 0;
    await ds.query('TRUNCATE chanjet_sync_jobs');
  });
  afterEach(async () => {
    await ds.query('ALTER TABLE chanjet_sync_jobs DROP CONSTRAINT IF EXISTS handoff_fixture_reject');
    for (const runner of runners.splice(0)) if (!runner.isReleased) await runner.release();
    expect(await ds.query("SELECT pid FROM pg_locks WHERE locktype='advisory' AND objid=(hashtext($1)::bigint & 4294967295)::oid", [key])).toEqual([]);
    restore();
    if (priorFlag === undefined) delete process.env.CHANJET_READONLY_SYNC_ENABLED; else process.env.CHANJET_READONLY_SYNC_ENABLED = priorFlag;
  });
  afterAll(async () => { await new Promise<void>(r => server.close(() => r())); if (ds?.isInitialized) await ds.destroy(); });
  async function runner() { const qr = ds.createQueryRunner(); runners.push(qr); await qr.connect(); return qr; }
  async function remote() { requireReadonlyOrchestration(); const response = await fetch(endpoint); requireReadonlyOrchestration(); return response.json(); }
  function subject(call: () => Promise<unknown> = remote, ctor = ChanjetReadonlySyncScheduler, source = ds) {
    const done = barrier();
    const service = new ctor({ runReadonlyAlignmentCycle: call } as never, { ok: jest.fn(), fail: jest.fn() } as never, source, {} as never);
    const internal = service as unknown as { executeSync: (...args: unknown[]) => Promise<void>; recoverInterruptedRun: () => Promise<void> };
    const execute = internal.executeSync.bind(service);
    internal.executeSync = async (...args) => { try { await execute(...args); } finally { done.resolve(); } };
    return { service, internal, done };
  }
  async function statuses() { return ds.query('SELECT status FROM chanjet_sync_jobs ORDER BY id'); }

  async function handoff(legacy: boolean) {
    const a = await runner(), b = await runner();
    const [ap] = await a.query('SELECT pg_backend_pid() AS pid'), [bp] = await b.query('SELECT pg_backend_pid() AS pid');
    expect(ap.pid).not.toBe(bp.pid);
    // Force the old execution onto a third backend instead of relying on pool reuse.
    const executionRunner = legacy ? await runner() : a;
    const [executionIdentity] = await executionRunner.query('SELECT pg_backend_pid() AS pid');
    if (legacy) expect([ap.pid, bp.pid]).not.toContain(executionIdentity.pid);
    const committed = barrier(), allowA = barrier(), bChecking = barrier(), allowB = barrier();
    const commit = a.commitTransaction.bind(a);
    a.commitTransaction = async () => { await commit(); committed.resolve(); await allowA.promise; };
    const bQuery = b.query.bind(b);
    b.query = async (...args: Parameters<QueryRunner['query']>) => {
      const answer = await bQuery(...args);
      if (legacy && String(args[0]).startsWith('SELECT id FROM chanjet_sync_jobs')) { bChecking.resolve(); await allowB.promise; }
      return answer;
    };
    const sourceA = Object.create(ds) as DataSource, sourceB = Object.create(ds) as DataSource;
    // The old scheduler also uses DataSource.query for job updates. Preserve its
    // independent short-lived runners instead of reusing the forced execution runner.
    sourceA.query = ds.query.bind(ds); sourceB.query = ds.query.bind(ds);
    sourceA.createQueryRunner = jest.fn().mockReturnValueOnce(a).mockReturnValue(executionRunner);
    sourceB.createQueryRunner = jest.fn().mockReturnValue(b);
    const ctor = legacy ? baselineScheduler() : ChanjetReadonlySyncScheduler;
    const x = subject(remote, ctor, sourceA), y = subject(remote, ctor, sourceB);
    const admitted = x.service.enqueueManualSync('fixture-A');
    let rejected: ReturnType<typeof y.service.enqueueManualSync> | undefined;
    try {
      await bounded(committed.promise);
      rejected = y.service.enqueueManualSync('fixture-B');
      if (legacy) await bounded(bChecking.promise);
      else expect((await bounded(rejected)).accepted).toBe(false);
      allowA.resolve();
      const response = await bounded(admitted);
      expect(response.accepted).toBe(true);
      expect(Object.keys(response)).not.toContain('lease');
      expect(() => JSON.stringify(response)).not.toThrow();
      await bounded(x.done.promise);
      expect(reads).toBe(legacy ? 0 : 1);
      expect(await statuses()).toEqual([{ status: legacy ? 'FAIL' : 'SUCCESS' }]);
      if (legacy) expect(sourceA.createQueryRunner).toHaveBeenCalledTimes(2);
      if (!legacy) {
        expect(sourceA.createQueryRunner).toHaveBeenCalledTimes(1);
        const [row] = await ds.query('SELECT request_scope FROM chanjet_sync_jobs');
        expect(row.request_scope.lockBackendPid).toBe(ap.pid);
      }
      console.info(`HANDOFF_${legacy ? 'BEFORE' : 'AFTER'} A_PID=${ap.pid} B_PID=${bp.pid} EXEC_PID=${executionIdentity.pid} READS=${reads} STATUS=${legacy ? 'FAIL' : 'SUCCESS'}`);
    } finally { allowA.resolve(); allowB.resolve(); await admitted; if (rejected) await rejected; }
  }
  it('reproduces the pinned old protocol deterministically: a competing transaction makes an admitted job FAIL with zero reads', () => handoff(true));
  it('passes the identical interleaving with continuous ownership on one backend', () => handoff(false));
  it('confirms the terminal row is committed and visible to another backend before unlock', async () => {
    const qr = await runner(), query = qr.query.bind(qr);
    const [identity] = await query('SELECT pg_backend_pid() AS pid');
    let observed = false;
    qr.query = async (...args: Parameters<QueryRunner['query']>) => {
      if (String(args[0]).includes('pg_advisory_unlock')) {
        expect(await statuses()).toEqual([{ status: 'SUCCESS' }]);
        expect(await ds.query("SELECT pid FROM pg_locks WHERE locktype='advisory' AND pid=$1 AND granted AND objid=(hashtext($2)::bigint & 4294967295)::oid", [identity.pid, key])).toEqual([{ pid: identity.pid }]);
        observed = true;
      }
      return query(...args);
    };
    const source = Object.create(ds) as DataSource; source.createQueryRunner = () => qr;
    const s = subject(remote, ChanjetReadonlySyncScheduler, source);
    await s.service.enqueueManualSync('terminal-order'); await bounded(s.done.promise);
    expect(observed).toBe(true); expect(qr.isReleased).toBe(true);
  });

  it('runs bounded concurrent rounds: one admission, one actual HTTP GET and one SUCCESS; completed schedule slot is deduplicated', async () => {
    for (let round = 0; round < 4; round++) {
      await ds.query('TRUNCATE chanjet_sync_jobs');
      const entered = barrier(), finish = barrier();
      const peers = Array.from({ length: 8 }, () => subject(async () => { entered.resolve(); await finish.promise; return remote(); }));
      const responses = await Promise.all(peers.map(x => x.service.enqueueManualSync('stress-fixture')));
      const index = responses.findIndex(x => x.accepted);
      expect(responses.filter(x => x.accepted)).toHaveLength(1);
      await bounded(entered.promise);
      // Different approval IDs still share the existing global exclusive lock.
      const approval = JSON.parse(process.env.CHANJET_READONLY_APPROVAL!);
      process.env.CHANJET_READONLY_APPROVAL = JSON.stringify({ ...approval, approvalId: 'OTHER_APPROVAL' });
      expect((await subject().service.enqueueManualSync('late-request')).accepted).toBe(false);
      process.env.CHANJET_READONLY_APPROVAL = JSON.stringify(approval);
      finish.resolve(); await bounded(peers[index].done.promise);
      expect(reads).toBe(round + 1); expect(await statuses()).toEqual([{ status: 'SUCCESS' }]);
    }
    await ds.query('TRUNCATE chanjet_sync_jobs');
    const one = subject(), two = subject(); await one.service.runScheduledSync(); await two.service.runScheduledSync();
    expect(reads).toBe(5); expect(await statuses()).toEqual([{ status: 'SUCCESS' }]);
  });
  it('rejects an independent session owner without creating FAIL rows or leaking query runners', async () => {
    const held = await runner(); await held.query('SELECT pg_advisory_lock(hashtext($1))', [key]);
    try { for (let n = 0; n < 12; n++) expect((await subject().service.enqueueManualSync('blocked')).accepted).toBe(false); }
    finally { await held.query('SELECT pg_advisory_unlock(hashtext($1))', [key]); }
    expect(reads).toBe(0); expect(await statuses()).toEqual([]);
    expect((ds.driver as unknown as { connectedQueryRunners: QueryRunner[] }).connectedQueryRunners).toEqual([held]);
  });
  it.each(['prepare', 'insert'])('%s SQL failure rolls back reservation and releases the session', async phase => {
    const qr = await runner(), query = qr.query.bind(qr);
    qr.query = async (...args: Parameters<QueryRunner['query']>) => {
      if ((phase === 'prepare' && String(args[0]).startsWith('SELECT id')) || (phase === 'insert' && String(args[0]).includes('INSERT INTO chanjet_sync_jobs'))) return query('SELECT * FROM missing_handoff_fixture_table');
      return query(...args);
    };
    const source = Object.create(ds) as DataSource; source.createQueryRunner = () => qr;
    await expect(subject(remote, ChanjetReadonlySyncScheduler, source).service.enqueueManualSync('sql-failure')).rejects.toThrow();
    expect(qr.isReleased).toBe(true); expect(reads).toBe(0); expect(await statuses()).toEqual([]);
  });
  it('an ambiguous acquire acknowledgement discards the actually locked session', async () => {
    const qr = await runner(), query = qr.query.bind(qr);
    const [identity] = await query('SELECT pg_backend_pid() AS pid');
    qr.query = async (...args: Parameters<QueryRunner['query']>) => {
      const answer = await query(...args);
      if (String(args[0]).includes('pg_try_advisory_lock')) throw Error('acquire acknowledgement lost');
      return answer;
    };
    await expect(ChanjetReadonlyLockLease.acquire(qr, key)).rejects.toThrow();
    expect(qr.isReleased).toBe(true);
    expect(await ds.query('SELECT pid FROM pg_stat_activity WHERE pid=$1', [identity.pid])).toEqual([]);
  });
  it('a lost reservation commit acknowledgement retains durable RUNNING and never dispatches', async () => {
    const qr = await runner(), commit = qr.commitTransaction.bind(qr);
    qr.commitTransaction = async () => { await commit(); throw Error('commit acknowledgement lost'); };
    const source = Object.create(ds) as DataSource; source.createQueryRunner = () => qr;
    const s = subject(remote, ChanjetReadonlySyncScheduler, source);
    await expect(s.service.enqueueManualSync('commit-ambiguous')).rejects.toThrow();
    expect(reads).toBe(0); expect(qr.isReleased).toBe(true); expect(await statuses()).toEqual([{ status: 'RUNNING' }]);
    expect((await subject().service.enqueueManualSync('restart')).accepted).toBe(false);
  });
  it('execution failure persists sanitized FAIL/HOLD before releasing ownership', async () => {
    const s = subject(async () => { throw Error('fixture-secret-must-not-be-audited'); });
    await s.service.enqueueManualSync('failure'); await bounded(s.done.promise);
    expect(await statuses()).toEqual([{ status: 'FAIL' }]);
    expect(await s.service.getRunState()).toMatchObject({ state: 'HOLD' });
    const rows = await ds.query('SELECT error_message, result_summary FROM chanjet_sync_jobs');
    expect(JSON.stringify(rows)).not.toContain('fixture-secret');
  });
  it.each(['SUCCESS', 'FAIL'])('terminal %s persistence failure retains RUNNING and manual review evidence', async status => {
    await ds.query(`ALTER TABLE chanjet_sync_jobs ADD CONSTRAINT handoff_fixture_reject CHECK (status <> '${status}')`);
    const s = subject(status === 'FAIL' ? async () => { throw Error('provider failed'); } : remote);
    await s.service.enqueueManualSync('terminal-failure'); await bounded(s.done.promise);
    expect(await statuses()).toEqual([{ status: 'RUNNING' }]);
    expect(await s.service.getRunState()).toMatchObject({ state: 'HOLD', message: 'READONLY_HOLD_TERMINAL_PERSISTENCE' });
    const restarted = subject(); await restarted.internal.recoverInterruptedRun();
    expect((await restarted.service.enqueueManualSync('restart')).accepted).toBe(false);
    expect(await restarted.service.getRunState()).toMatchObject({ state: 'HOLD' });
  });
  it.each(['zero-rows', 'ack-lost'])('does not report COMPLETED or issue a compensating FAIL after terminal %s', async failure => {
    const qr = await runner(), query = qr.query.bind(qr);
    const terminalStatuses: unknown[] = [];
    qr.query = async (...args: Parameters<QueryRunner['query']>) => {
      if (String(args[0]).includes('SET status = $2')) {
        terminalStatuses.push(args[1]?.[1]);
        if (failure === 'zero-rows') return query(String(args[0]).replace("WHERE request_scope->>'orchestrationRunId' = $1", "WHERE false AND request_scope->>'orchestrationRunId' = $1"), args[1], true);
        await query(...args); throw Error('terminal acknowledgement lost');
      }
      return query(...args);
    };
    const source = Object.create(ds) as DataSource; source.createQueryRunner = () => qr;
    const s = subject(remote, ChanjetReadonlySyncScheduler, source);
    await s.service.enqueueManualSync('terminal-ambiguous'); await bounded(s.done.promise);
    expect(terminalStatuses).toEqual(['SUCCESS']);
    expect(await s.service.getRunState()).toMatchObject({ state: 'HOLD', message: 'READONLY_HOLD_TERMINAL_PERSISTENCE' });
    expect(await statuses()).toEqual([{ status: failure === 'zero-rows' ? 'RUNNING' : 'SUCCESS' }]);
  });
  it.each(['false', 'error'])('a failed unlock (%s) physically discards the backend instead of pooling a held lock', async failure => {
    const qr = await runner(); const lease = await ChanjetReadonlyLockLease.acquire(qr, key); expect(lease).not.toBeNull();
    const query = qr.query.bind(qr);
    qr.query = (...args: Parameters<QueryRunner['query']>) => String(args[0]).includes('pg_advisory_unlock') ? query(failure === 'false' ? 'SELECT false AS released' : 'SELECT * FROM missing_handoff_fixture_table') : query(...args);
    await bounded(Promise.all([lease!.close(), lease!.close()]));
    expect(qr.isReleased).toBe(true);
    expect(await ds.query('SELECT pid FROM pg_stat_activity WHERE pid=$1', [lease!.backendPid])).toEqual([]);
    const next = await runner(); const [identity] = await next.query('SELECT pg_backend_pid() AS pid'); expect(identity.pid).not.toBe(lease!.backendPid);
  });
  it('database termination during execution stops new business calls and preserves RUNNING without replay', async () => {
    const entered = barrier(), finish = barrier();
    const qr = await runner(); const client = await qr.connect(); const disconnected = new Promise<void>(r => client.once('end', r));
    const source = Object.create(ds) as DataSource; source.createQueryRunner = () => qr;
    const s = subject(async () => { entered.resolve(); await finish.promise; return remote(); }, ChanjetReadonlySyncScheduler, source);
    await s.service.enqueueManualSync('disconnect'); await bounded(entered.promise);
    const [row] = await ds.query('SELECT request_scope FROM chanjet_sync_jobs');
    await ds.query('SELECT pg_terminate_backend($1)', [row.request_scope.lockBackendPid]); await bounded(disconnected);
    finish.resolve(); await bounded(s.done.promise);
    expect(reads).toBe(0); expect(await statuses()).toEqual([{ status: 'RUNNING' }]);
    const restarted = subject(); await restarted.internal.recoverInterruptedRun();
    expect((await restarted.service.enqueueManualSync('restart')).accepted).toBe(false);
  });
  it('a disconnect after the business response blocks the next mirror write and leaves the job for review', async () => {
    const qr = await runner(), client = await qr.connect();
    const ended = new Promise<void>(r => client.once('end', r));
    const repo = { create: jest.fn(x => x), upsert: jest.fn(), findOneBy: jest.fn() };
    const mirror = Object.assign(Object.create(ChanjetIntegrationService.prototype), { readSnapshotRepo: repo });
    const source = Object.create(ds) as DataSource; source.createQueryRunner = () => qr;
    const s = subject(async () => {
      await remote();
      const [row] = await ds.query('SELECT request_scope FROM chanjet_sync_jobs');
      await ds.query('SELECT pg_terminate_backend($1)', [row.request_scope.lockBackendPid]); await bounded(ended);
      await mirror.recordReadSnapshot({ key: 'RECEIVABLE_STATISTICS', apiDomain: 'fixture' }, 'BOOK-1', '/fixture', 'GET', '202610', { rows: [] });
      return result;
    }, ChanjetReadonlySyncScheduler, source);
    await s.service.enqueueManualSync('post-response-disconnect'); await bounded(s.done.promise);
    expect(reads).toBe(1); expect(repo.upsert).not.toHaveBeenCalled(); expect(await statuses()).toEqual([{ status: 'RUNNING' }]);
  });
  it('SIGKILL closes the owned session, retaining the committed job for manual HOLD without bootstrap replay', async () => {
    const child = fork(join(__dirname, '../../../test/fixtures/readonly-session-owner.cjs'), [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    const exited = new Promise<void>(r => child.once('exit', () => r()));
    try {
      const ready = await bounded(new Promise<{ ready: boolean; pid: number }>((resolve, reject) => {
        child.once('message', message => resolve(message as { ready: boolean; pid: number })); child.once('error', reject);
      }));
      expect(ready.ready).toBe(true);
      const observer = await runner();
      await observer.query('SET statement_timeout=8000');
      const released = observer.query('SELECT pg_advisory_lock(hashtext($1))', [key]);
      child.kill('SIGKILL'); await bounded(exited); await bounded(released);
      await observer.query('SELECT pg_advisory_unlock(hashtext($1))', [key]);
      expect(await ds.query('SELECT pid FROM pg_stat_activity WHERE pid=$1', [ready.pid])).toEqual([]);
      const restarted = subject(); await restarted.internal.recoverInterruptedRun();
      expect(await restarted.service.getRunState()).toMatchObject({ state: 'HOLD', message: 'READONLY_HOLD_INTERRUPTED_RUN_REVIEW_REQUIRED' });
      expect((await restarted.service.enqueueManualSync('restart')).accepted).toBe(false);
      expect(reads).toBe(0); expect(await statuses()).toEqual([{ status: 'RUNNING' }]);
    } finally { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await bounded(exited); }
  });
  it('HOLD false/false and READONLY_VERIFY do not dispatch cron or historical work', async () => {
    const s = subject(); process.env.CHANJET_SYNC_POLICY = 'READONLY_VERIFY';
    await s.service.runScheduledSync(); expect(await statuses()).toEqual([]);
    process.env.CHANJET_SYNC_POLICY = 'HOLD'; process.env.CHANJET_READONLY_SYNC_ENABLED = 'false';
    s.service.onApplicationBootstrap(); await s.service.runScheduledSync();
    expect((await s.service.enqueueManualSync('hold')).accepted).toBe(false);
    expect(process.env.CHANJET_ERP_INBOUND_SYNC_ENABLED).toBe('false'); expect(reads).toBe(0);
    expect(Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', ChanjetReadonlySyncScheduler.prototype.runScheduledSync)).toMatchObject({ cronTime: '0 15 */6 * * *', timeZone: 'Asia/Shanghai' });
  });
});
