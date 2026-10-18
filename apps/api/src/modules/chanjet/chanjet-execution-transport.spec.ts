import { chanjetBackgroundFixture } from './chanjet-background.test-fixture';
import { createServer, Server } from 'node:http';
import * as net from 'node:net';
import assert from 'node:assert/strict';
import * as fsns from 'node:fs';
import * as pathns from 'node:path';
import { randomUUID } from 'node:crypto';
import { AddressInfo } from 'node:net';
import path from 'node:path';
import { DataSource } from 'typeorm';
import { CreateChanjetExecutionAdmissions1791878400000 } from '../../database/migrations/1791878400000-CreateChanjetExecutionAdmissions';
import { ChanjetExecutionAdmissionStore, ExecutionContext } from './chanjet-execution-admission.store';
import { ChanjetExecutionHttpGateway, ChanjetBusinessFailureError, providerFetch } from './chanjet-execution-transport';
import { ChanjetExecutionAdmissionEntity } from './chanjet-execution-admission.entity';
import { createBoundedGuardExecutor, type BoundedGuardExecutor } from './chanjet-execution-guard-executor';
import { ExecutionManifest } from './chanjet-execution-manifest';
import { ChanjetAuthService } from './chanjet-auth.service';
import { withExecutionScope, beginExecutionPhase, requireExecutionScope, ExecutionScopeState } from './chanjet-execution-scope';

const fixtureUrl = process.env.CHANJET_ADMISSION_FIXTURE_URL;
if (process.env.CHANJET_EXECUTION_TRANSPORT_REQUIRED === 'true' && !fixtureUrl) {
  throw Error('REAL_EXECUTION_TRANSPORT_FIXTURE_URL_REQUIRED');
}
const database = fixtureUrl ? describe : describe.skip;

// Human-approved first-verification shape; synthetic identifiers only.
function manifest(cap = 10, httpTimeoutMs = 30_000, totalTimeoutMs = 360_000): ExecutionManifest {
  const expiresAt = `${new Date(Date.now() + 20 * 60_000).toISOString().slice(0, 23)}Z`;
  return {
    version: 1,
    executionId: `EXEC_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
    ownerId: 'ROOT_OPERATOR',
    requestCap: cap,
    totalTimeoutMs,
    httpTimeoutMs,
    approval: {
      version: 3,
      approvalId: `APPROVAL_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
      floorSha: 'f'.repeat(40),
      sourceClassification: 'PRODUCTION_DATA',
      remoteWrite: false,
      erpInbound: false,
      books: [
        { bookId: '3533914511118750', companyCode: 'COMP-LAO-AGRI' },
        { bookId: '3537748712226818', companyCode: 'COMP-LAO-XINGCHI' },
        { bookId: '3539743721526654', companyCode: 'COMP-LAO-FOOD' },
      ],
      scopes: ['RECEIVABLE_STATISTICS'],
      periodPolicy: 'REQUESTED_PERIOD_NO_BACKFILL',
      verification: { bookId: '3533914511118750', period: '202610', scope: ['RECEIVABLE_STATISTICS'], expiresAt },
    },
  };
}

type FixtureRoute = { status?: number; body?: unknown | ((nth: number) => unknown); delayMs?: number; location?: string; destroySocket?: boolean };
function httpFixture() {
  const hits: Array<{ method: string; path: string; aborted: boolean }> = [];
  let routes: Record<string, FixtureRoute> = {};
  let server: Server | undefined;
  let endpoint = '';
  return {
    hits,
    endpoint: () => endpoint,
    setRoutes(next: Record<string, FixtureRoute>) { routes = next; },
    async start() {
      server = createServer((req, res) => {
        const hit = { method: req.method || '', path: req.url || '', aborted: false };
        hits.push(hit);
        req.on('close', () => { hit.aborted = !res.writableEnded; });
        const route = routes[req.url || ''] || { status: 200, body: { code: '200' } };
        const nth = hits.filter((h) => h.path === (req.url || '')).length - 1;
        if (route.destroySocket) {
          // real transport failure: kill the socket without any response
          req.socket.destroy();
          return;
        }
        const body = typeof route.body === 'function' ? route.body(nth) : route.body;
        setTimeout(() => {
          if (!res.writableEnded) {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (route.location) headers.Location = route.location;
            res.writeHead(route.status ?? 200, headers);
            res.end(route.location ? undefined : JSON.stringify(body));
          }
        }, route.delayMs ?? 0);
      });
      await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
      endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    },
    async stop() { await new Promise<void>((resolve) => server?.close(() => resolve())); },
  };
}

function createService(fixtureBase: string, manager?: unknown) {
  const values: Record<string, string> = {
    CHANJET_APP_KEY: 'app-key',
    CHANJET_APP_SECRET: 'app-secret',
    CHANJET_ORG_ID: 'org-id',
    CHANJET_MSG_SECRET: '',
    CHANJET_CERT: 'env-cert',
  };
  const stateRepo = {
    findOneBy: jest.fn().mockResolvedValue({ key: 'singleton', appTicket: 'persisted-ticket', certificate: null, tokens: null }),
    save: jest.fn().mockResolvedValue(undefined),
  };
  process.env.CHANJET_PROVIDER_BASE_URL = fixtureBase;
  process.env.CHANJET_MIN_REQUEST_INTERVAL_MS = '100';
  const stateRepoWithManager = manager ? { ...stateRepo, manager } : stateRepo;
  const service = new ChanjetAuthService({ get: jest.fn((key: string, fallback = '') => values[key] ?? fallback) } as never, stateRepoWithManager as never, { ok: jest.fn(), fail: jest.fn() } as never, chanjetBackgroundFixture().service);
  // onModuleInit would schedule background bootstrapping; seed the fields the
  // request paths need directly instead (cert preset keeps the TOKEN exchange
  // self-contained so receipts map 1:1 to the exchanges under test).
  service['appKey'] = 'app-key';
  service['appSecret'] = 'app-secret';
  service['orgId'] = 'org-id';
  service['cert'] = 'env-cert';
  service['appTicket'] = 'persisted-ticket';
  return service;
}

database('execution transport wiring (real PG18 admission + local HTTP fixture, no provider)', () => {
  jest.setTimeout(120_000);
  let ds: DataSource;
  let store: ChanjetExecutionAdmissionStore;
  let applied = false;
  const fixture = httpFixture();

  beforeAll(async () => {
    const parsed = new URL(fixtureUrl!);
    if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) throw Error('LOOPBACK_FIXTURE_REQUIRED');
    if (!/^\/chanjet_(admission|transport)_fixture$/.test(parsed.pathname)) throw Error('DEDICATED_DISPOSABLE_FIXTURE_DB_REQUIRED');
    await fixture.start();
    process.env.CHANJET_PROVIDER_BASE_URL = fixture.endpoint();
    process.env.CHANJET_MIN_REQUEST_INTERVAL_MS = '100';
    ds = new DataSource({ type: 'postgres', url: fixtureUrl, entities: [ChanjetExecutionAdmissionEntity], logging: false });
    await ds.initialize();
    const runner = ds.createQueryRunner();
    await runner.query('DROP SCHEMA public CASCADE');
    await runner.query('CREATE SCHEMA public');
    await runner.release();
    const migration = new CreateChanjetExecutionAdmissions1791878400000();
    const upRunner = ds.createQueryRunner();
    await migration.up(upRunner);
    await upRunner.release();
    applied = true;
    store = new ChanjetExecutionAdmissionStore(ds.manager);
  });
  afterAll(async () => {
    if (ds?.isInitialized && applied) {
      const runner = ds.createQueryRunner();
      try { await new CreateChanjetExecutionAdmissions1791878400000().down(runner); } finally { await runner.release(); }
    }
    if (ds?.isInitialized) await ds.destroy();
    delete process.env.CHANJET_PROVIDER_BASE_URL;
    delete process.env.CHANJET_MIN_REQUEST_INTERVAL_MS;
    await fixture.stop();
  });

  async function registered(cap = 10, httpTimeoutMs = 30_000, totalTimeoutMs = 360_000) {
    const m = manifest(cap, httpTimeoutMs, totalTimeoutMs);
    await store.registerFromReviewedRootManifest(m);
    return m;
  }
  async function beginProbe(m: ExecutionManifest, leaseId = `PROBE_${randomUUID().slice(0, 8)}`) {
    await store.begin(m, 'PROBING', leaseId);
    return { manifest: m, leaseId, phase: 'PROBING' as const };
  }
  const gatewayFor = (m: ExecutionManifest) => new ChanjetExecutionHttpGateway(store, m);
  /** begin an execution through a SPECIFIC store (isolated-pool tests). */
  const beginProbeOn = async (m: ExecutionManifest, target: ChanjetExecutionAdmissionStore, leaseId = `PROBE_${randomUUID().slice(0, 8)}`) => {
    await target.begin(m, 'PROBING', leaseId);
    return { manifest: m, leaseId, phase: 'PROBING' as const };
  };
  const receiptsOn = async (executionId: string, target: DataSource) => target.query(
    'SELECT ordinal, phase, lease_id, kind, status, result FROM chanjet_execution_requests WHERE execution_id=$1 ORDER BY ordinal',
    [executionId],
  );
  // isolated FIFO sandbox: its own pool + store + gateway + receipts
  const fifoDs = new DataSource({ type: 'postgres', url: fixtureUrl, logging: false });
  const fifoStore = new ChanjetExecutionAdmissionStore(fifoDs.manager);
  const fifoGateway = (manifest: ExecutionManifest) => new ChanjetExecutionHttpGateway(fifoStore, manifest);
  const fifoReceipts = async (executionId: string) => fifoDs.query(
    'SELECT ordinal, phase, kind, status, result FROM chanjet_execution_requests WHERE execution_id=$1 ORDER BY ordinal',
    [executionId],
  );
  /** Disposable loopback fixture guard: evaluated BEFORE any connection or DDL. */
  const scopeDeadlineAt = () => new Date(Date.now() + 20 * 60_000);
  const transportOps = () => ({
    resend: async (signal: AbortSignal) => {
      const res = await fetch(`${fixture.endpoint()}/auth/appTicket/resend`, { signal, method: 'POST' });
      return await res.json() as Record<string, unknown>;
    },
  });
  const receipts = async (executionId: string) => ds.query(
    'SELECT ordinal, phase, lease_id, kind, status, result FROM chanjet_execution_requests WHERE execution_id=$1 ORDER BY ordinal',
    [executionId],
  );
  const hitsByUrl = (suffix: string) => fixture.hits.filter((h) => h.path.endsWith(suffix));
  const resetHits = () => { fixture.hits.length = 0; };
  const businessSend = (path: string) => async (signal: AbortSignal) => {
    const res = await fetch(`${fixture.endpoint()}${path}`, { signal, method: 'POST' });
    return res.json();
  };

  it('gateway counts exactly one reserve->send->acknowledge per provider HTTP attempt', async () => {
    resetHits();
    const m = await registered();
    fixture.setRoutes({ '/accounting/gl/statistics/receive/3533914511118750': { body: { code: '200', value: [] } } });
    const context = await beginProbe(m);
    const result = await gatewayFor(m).send(context, 'BUSINESS', businessSend('/accounting/gl/statistics/receive/3533914511118750'));
    expect(result.outcome).toBe('OK');
    expect(result.effectiveDeadlineMs).toBeLessThanOrEqual(30_000);
    expect(await receipts(m.executionId)).toEqual([
      { ordinal: 1, phase: 'PROBING', lease_id: context.leaseId, kind: 'BUSINESS', status: 'ACKNOWLEDGED', result: 'OK' },
    ]);
    expect(hitsByUrl('/accounting/gl/statistics/receive/3533914511118750')).toHaveLength(1);
  });

  it('gateway-deadline cancellation aborts the real HTTP and poisons further sends without touching the wire', async () => {
    resetHits();
    const m = await registered(10, 250);
    fixture.setRoutes({ '/slow': { body: { late: true }, delayMs: 5_000 } });
    const context = await beginProbe(m);
    const gateway = gatewayFor(m);
    const started = Date.now();
    const result = await gateway.send(context, 'BUSINESS', async (signal: AbortSignal) => (await fetch(`${fixture.endpoint()}/slow`, { signal })).json());
    expect(result.outcome).toBe('TRANSPORT_FAILURE');
    expect(result.cancelled).toBe(true);
    expect(String((result.error as Error)?.message ?? result.error)).toContain('CHANJET_EXECUTION_DEADLINE');
    expect(Date.now() - started).toBeLessThan(2_000);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(hitsByUrl('/slow')[0]?.aborted).toBe(true);
    await expect(gateway.send(context, 'BUSINESS', async () => ({}))).rejects.toThrow('CHANJET_EXECUTION_STOPPED');
    expect(hitsByUrl('/slow')).toHaveLength(1);
  });

  it('cap exhaustion rejects the extra send before any HTTP and holds the execution', async () => {
    resetHits();
    const m = await registered(2);
    fixture.setRoutes({ '/business': { body: { code: '200' } } });
    const context = await beginProbe(m);
    const gateway = gatewayFor(m);
    for (let i = 0; i < 2; i++) await gateway.send(context, 'BUSINESS', businessSend('/business'));
    await expect(gateway.send(context, 'BUSINESS', businessSend('/business'))).rejects.toThrow(/CHANJET_ADMISSION_HOLD|HOLD_UNCONFIRMED/);
    expect(hitsByUrl('/business')).toHaveLength(2);
    const row = await store.load(m);
    expect(row.phase).toBe('HOLD');
    expect(row.hold_reason).toBe('CAP');
    expect(row.request_count).toBe(2);
  });

  it('concurrent overshoot cannot push real sends past the cap', async () => {
    resetHits();
    const m = await registered(3);
    fixture.setRoutes({ '/business': { body: { code: '200' } } });
    const context = await beginProbe(m);
    const gateway = gatewayFor(m);
    const outcomes = await Promise.allSettled(Array.from({ length: 6 }, () =>
      gateway.send(context, 'BUSINESS', businessSend('/business'))));
    expect(hitsByUrl('/business').length).toBeLessThanOrEqual(3);
    expect(outcomes.filter((o) => o.status === 'fulfilled').length).toBeLessThanOrEqual(3);
    expect(outcomes.some((o) => o.status === 'rejected')).toBe(true);
    expect((await store.load(m)).request_count).toBe(3);
  });

  it('a second connection shares the durable count and cannot exceed the cap', async () => {
    resetHits();
    const m = await registered(3);
    fixture.setRoutes({ '/business': { body: { code: '200' } } });
    const context = await beginProbe(m);
    const first = gatewayFor(m);
    await first.send(context, 'BUSINESS', businessSend('/business'));
    await first.send(context, 'BUSINESS', businessSend('/business'));
    const secondDs = new DataSource({ type: 'postgres', url: fixtureUrl, logging: false });
    await secondDs.initialize();
    try {
      const secondGateway = new ChanjetExecutionHttpGateway(new ChanjetExecutionAdmissionStore(secondDs.manager), m);
      await secondGateway.send(context, 'BUSINESS', businessSend('/business'));
      await expect(secondGateway.send(context, 'BUSINESS', businessSend('/business'))).rejects.toThrow('CHANJET_ADMISSION_HOLD');
      expect(hitsByUrl('/business')).toHaveLength(3);
      expect((await store.load(m)).request_count).toBe(3);
    } finally { await secondDs.destroy(); }
  });

  it('an ambiguous reservation commit spends the count, sends nothing and blocks phase completion', async () => {
    resetHits();
    const m = await registered(3);
    fixture.setRoutes({ '/business': { body: { code: '200' } } });
    const context = await beginProbe(m);
    const ambiguous = new ChanjetExecutionAdmissionStore({
      transaction: async (callback: (tx: { query: (sql: string, params?: unknown[]) => Promise<unknown[]> }) => Promise<unknown>) => { await ds.manager.transaction(callback); throw Error('commit outcome unknown'); },
    } as never);
    // the reserve refusal is rethrown as-is; the ambiguous hold outcome is
    // reported through settled() as UNCONFIRMED (the commit result was never
    // confirmed) and the RESERVED receipt still blocks phase completion
    const ambiguousGateway = new ChanjetExecutionHttpGateway(ambiguous, m);
    await expect(ambiguousGateway.send(context, 'BUSINESS', businessSend('/business')))
      .rejects.toThrow('CHANJET_ADMISSION_HOLD');
    expect(hitsByUrl('/business')).toHaveLength(0);
    expect(await receipts(m.executionId)).toEqual([
      { ordinal: 1, phase: 'PROBING', lease_id: context.leaseId, kind: 'BUSINESS', status: 'RESERVED', result: 'UNSET' },
    ]);
    await expect(store.finish(context, 'PROBED')).rejects.toThrow();
    // the ambiguous hold outcome is reported through settled() on the SAME
    // gateway instance: the commit result was never confirmed
    expect(await ambiguousGateway.settled()).toBe('UNCONFIRMED');
  });

  it('unregistered identity and stale-manifest drift both fail closed with zero sends', async () => {
    resetHits();
    const unregistered = manifest();
    fixture.setRoutes({ '/business': { body: { code: '200' } } });
    await expect(gatewayFor(unregistered).send(
      { manifest: unregistered, leaseId: 'NO_LEASE', phase: 'PROBING' },
      'BUSINESS',
      businessSend('/business'),
    )).rejects.toThrow('CHANJET_ADMISSION_HOLD');
    expect(hitsByUrl('/business')).toHaveLength(0);

    const stale = await registered();
    await beginProbe(stale);
    const tampered: ExecutionManifest = { ...stale, requestCap: stale.requestCap + 1 };
    await expect(gatewayFor(tampered).send(
      { manifest: tampered, leaseId: 'ANY', phase: 'PROBING' },
      'BUSINESS',
      businessSend('/business'),
    )).rejects.toThrow('CHANJET_ADMISSION_HOLD');
    expect(hitsByUrl('/business')).toHaveLength(0);
  });

  it('auth service inside a scope counts TOKEN then BUSINESS per call and never reads the shared caches', async () => {
    resetHits();
    const m = await registered(10);
    resetHits();
    fixture.setRoutes({
      '/v1/common/auth/selfBuiltApp/generateToken': { body: { value: { accessToken: `tok-${randomUUID().slice(0, 6)}`, expiresIn: 7200 } } },
      '/accounting/gl/statistics/receive/3533914511118750': { body: { code: '200', value: [{ amount: 1 }] } },
    });
    const service = createService(fixture.endpoint());
    const context = await beginProbe(m);
    const scopeState: ExecutionScopeState = { manifest: m, store, gateway: gatewayFor(m), transport: transportOps(), current: context, deadlineAt: scopeDeadlineAt() };
    await withExecutionScope(scopeState, async () => {
      expect(await service.callApi('/accounting/gl/statistics/receive/3533914511118750', { method: 'POST', body: {} })).toMatchObject({ code: '200' });
      expect(await service.callApi('/accounting/gl/statistics/receive/3533914511118750', { method: 'POST', body: {} })).toMatchObject({ code: '200' });
    });
    expect((await receipts(m.executionId)).map((r: { kind: string }) => r.kind)).toEqual(['TOKEN', 'BUSINESS', 'TOKEN', 'BUSINESS']);
    expect(hitsByUrl('/v1/common/auth/selfBuiltApp/generateToken')).toHaveLength(2);
    expect(hitsByUrl('/accounting/gl/statistics/receive/3533914511118750')).toHaveLength(2);
  });

  it('legacy path outside a scope keeps cache merging and unchanged timeout semantics', async () => {
    resetHits();
    fixture.setRoutes({
      '/v1/common/auth/selfBuiltApp/generateToken': { body: { value: { accessToken: `tok-${randomUUID().slice(0, 6)}`, expiresIn: 7200 } } },
      '/legacy/path': { body: { code: '200', value: [] } },
    });
    const service = createService(fixture.endpoint());
    await service.callApi('/legacy/path', { method: 'POST', body: {} });
    await service.callApi('/legacy/path', { method: 'POST', body: {} });
    expect(hitsByUrl('/legacy/path')).toHaveLength(1);
  });

  it('50107 token-invalid retry is a new counted send within the same cap', async () => {
    resetHits();
    const m = await registered(10);
    resetHits();
    fixture.setRoutes({
      '/v1/common/auth/selfBuiltApp/generateToken': { body: { value: { accessToken: `tok-${randomUUID().slice(0, 6)}`, expiresIn: 7200 } } },
      '/retry/path': { body: (nth: number) => (nth === 0 ? { code: '50107' } : { code: '200', value: [] }) },
    });
    const service = createService(fixture.endpoint());
    const context = await beginProbe(m);
    const scopeState: ExecutionScopeState = { manifest: m, store, gateway: gatewayFor(m), transport: transportOps(), current: context, deadlineAt: scopeDeadlineAt() };
    await withExecutionScope(scopeState, () => service.callApi('/retry/path', { method: 'POST', body: {} }));
    const rows = await receipts(m.executionId);
    // scope semantics: each executeCallApi (initial + 50107 retry) performs its
    // own fresh counted TOKEN exchange before BUSINESS — 4 receipts total.
    expect(rows.map((r: { kind: string }) => r.kind)).toEqual(['TOKEN', 'BUSINESS', 'TOKEN', 'BUSINESS']);
    expect(rows.every((r: { status: string }) => r.status === 'ACKNOWLEDGED')).toBe(true);
  });

  it('4041 inside a scope never fires the background resend outside admission counting', async () => {
    resetHits();
    const m = await registered(10);
    resetHits();
    fixture.setRoutes({
      '/v1/common/auth/selfBuiltApp/generateToken': { body: { error: { code: '4041' } } },
      '/auth/appTicket/resend': { body: { success: true } },
    });
    const service = createService(fixture.endpoint());
    const context = await beginProbe(m);
    const scopeState: ExecutionScopeState = { manifest: m, store, gateway: gatewayFor(m), transport: transportOps(), current: context, deadlineAt: scopeDeadlineAt() };
    await withExecutionScope(scopeState, async () => {
      await expect(service.callApi('/any/path', { method: 'POST', body: {} })).rejects.toThrow('appTicket 已过期');
      // an explicit operator retry of triggerAppTicket under the scope IS
      // counted as a RESEND send through the scope-owned transport op
      await service.triggerAppTicket();
    });
    expect(hitsByUrl('/auth/appTicket/resend')).toHaveLength(1);
    expect((await receipts(m.executionId)).map((r: { kind: string }) => r.kind)).toEqual(['TOKEN', 'RESEND']);
    expect((await receipts(m.executionId)).every((r: { status: string }) => r.status === 'ACKNOWLEDGED')).toBe(true);
  });

  it('probe and first sync share one execution, phase leases and the cumulative cap', async () => {
    resetHits();
    const m = await registered(4);
    fixture.setRoutes({
      '/v1/common/auth/selfBuiltApp/generateToken': { body: { value: { accessToken: `tok-${randomUUID().slice(0, 6)}`, expiresIn: 7200 } } },
      '/probe': { body: { code: '200', value: [{ probe: true }] } },
      '/sync': { body: { code: '200', value: [{ synced: true }] } },
    });
    const service = createService(fixture.endpoint());
    const scopeState: ExecutionScopeState = { manifest: m, store, gateway: gatewayFor(m), transport: transportOps(), current: await beginProbe(m), deadlineAt: scopeDeadlineAt() };
    await withExecutionScope(scopeState, () => service.callApi('/probe', { method: 'POST', body: {} }));
    await store.finish(scopeState.current, 'PROBED');
    await beginExecutionPhase(scopeState, 'SYNCING', `SYNC_${randomUUID().slice(0, 8)}`);
    await withExecutionScope(scopeState, () => service.callApi('/sync', { method: 'POST', body: {} }));
    await store.finish(scopeState.current, 'VERIFIED');
    const rows = await receipts(m.executionId);
    expect(rows.map((r: { phase: string }) => r.phase)).toEqual(['PROBING', 'PROBING', 'SYNCING', 'SYNCING']);
    expect(rows.map((r: { kind: string }) => r.kind)).toEqual(['TOKEN', 'BUSINESS', 'TOKEN', 'BUSINESS']);
    const finalRow = await store.load(m);
    expect(finalRow.phase).toBe('VERIFIED');
    expect(finalRow.request_count).toBe(4);
    await withExecutionScope(scopeState, async () => {
      await expect(scopeState.gateway.send(scopeState.current, 'BUSINESS', businessSend('/sync'))).rejects.toThrow();
    });
  });

  // ── review-round hardening: redirects, OK-proof phase gates, persistent stops, queue deadline ──
  it('provider redirects are never followed: one counted HTTP, transport failure, persistent stop', async () => {
    resetHits();
    const m = await registered(1);
    fixture.setRoutes({ '/redirect': { status: 302, location: '/final' }, '/final': { body: { code: '200' } } });
    const context = await beginProbe(m);
    const gateway = gatewayFor(m);
    const result = await gateway.send(context, 'BUSINESS', async (signal: AbortSignal) => {
      const res = await providerFetch(`${fixture.endpoint()}/redirect`, { signal, method: 'POST' });
      return res.json();
    });
    expect(result.outcome).toBe('TRANSPORT_FAILURE');
    expect(hitsByUrl('/redirect')).toHaveLength(1);
    expect(hitsByUrl('/final')).toHaveLength(0);
    expect((await receipts(m.executionId))[0]).toMatchObject({ status: 'ACKNOWLEDGED', result: 'TRANSPORT_FAILURE' });
    const row = await store.load(m);
    expect(row.phase).toBe('HOLD');
    expect(row.hold_reason).toBe('TRANSPORT_FAILURE');
    const secondDs = new DataSource({ type: 'postgres', url: fixtureUrl, logging: false });
    await secondDs.initialize();
    try {
      const fresh = new ChanjetExecutionHttpGateway(new ChanjetExecutionAdmissionStore(secondDs.manager), m);
      await expect(fresh.send(context, 'BUSINESS', businessSend('/final'))).rejects.toThrow('CHANJET_ADMISSION_HOLD');
      expect(hitsByUrl('/final')).toHaveLength(0);
    } finally { await secondDs.destroy(); }
  });

  it('failed business receipts are recorded but can never complete PROBED or VERIFIED', async () => {
    resetHits();
    const m = await registered(6);
    fixture.setRoutes({ '/failure': { status: 503, body: { code: 'FIXTURE_FAILURE', msg: 'synthetic' } }, '/ok': { body: { code: '200', value: [] } } });
    const context = await beginProbe(m);
    const gateway = gatewayFor(m);
        const failed = await gateway.send(context, 'BUSINESS', async (signal: AbortSignal) => {
      const res = await providerFetch(`${fixture.endpoint()}/failure`, { signal, method: 'POST' });
      const payload = await res.json() as Record<string, unknown>;
      if (!res.ok) throw new ChanjetBusinessFailureError(payload, `fixture failure http=${res.status}`);
      return payload;
    });
    expect(failed.outcome).toBe('BUSINESS_FAILURE');
    expect((await receipts(m.executionId))[0]).toMatchObject({ status: 'ACKNOWLEDGED', result: 'BUSINESS_FAILURE' });
    // the transaction wrapper masks the trigger raise behind the admission hold
    await expect(store.finish(context, 'PROBED')).rejects.toThrow(/CHANJET_ADMISSION/);
    const ok = await gateway.send(context, 'BUSINESS', businessSend('/ok'));
    expect(ok.outcome).toBe('OK');
    await store.finish(context, 'PROBED');
    const syncState: ExecutionScopeState = { manifest: m, store, gateway, transport: transportOps(), current: context, deadlineAt: scopeDeadlineAt() };
    await beginExecutionPhase(syncState, 'SYNCING', `SYNC_${randomUUID().slice(0, 8)}`);
    const failedSync = await gateway.send(syncState.current, 'BUSINESS', async (signal: AbortSignal) => {
      const res = await providerFetch(`${fixture.endpoint()}/failure`, { signal, method: 'POST' });
      const payload = await res.json() as Record<string, unknown>;
      if (!res.ok) throw new ChanjetBusinessFailureError(payload, `fixture failure http=${res.status}`);
      return payload;
    });
    expect(failedSync.outcome).toBe('BUSINESS_FAILURE');
    await expect(store.finish(syncState.current, 'VERIFIED')).rejects.toThrow(/CHANJET_ADMISSION/);
    const okSync = await gateway.send(syncState.current, 'BUSINESS', businessSend('/ok'));
    expect(okSync.outcome).toBe('OK');
    await store.finish(syncState.current, 'VERIFIED');
    const results = (await receipts(m.executionId)).map((r: { result: string }) => r.result);
    expect(results).toEqual(['BUSINESS_FAILURE', 'OK', 'BUSINESS_FAILURE', 'OK']);
  });

  it('transport failure persists a stop across gateways and connections; queued sends are refused', async () => {
    resetHits();
    const m = await registered(5);
    fixture.setRoutes({ '/reset': { destroySocket: true }, '/final': { body: { code: '200' } } });
    const context = await beginProbe(m);
    const gateway = gatewayFor(m);
    // the fixture destroys the socket mid-exchange -> real transport failure
    // (gateway layer resolves with a typed result; executionSend throws)
    const result = await gateway.send(context, 'BUSINESS', async (signal: AbortSignal) => (await fetch(`${fixture.endpoint()}/reset`, { signal })).json());
    expect(result.outcome).toBe('TRANSPORT_FAILURE');
    const row = await store.load(m);
    expect(row.phase).toBe('HOLD');
    expect(['TRANSPORT_FAILURE', 'CANCELLED', 'ACK_UNVERIFIED']).toContain(row.hold_reason);
    // the stop is durable: a brand-new gateway on a brand-new connection is
    // refused pre-reserve with zero further HTTP
    const stopDs = new DataSource({ type: 'postgres', url: fixtureUrl, logging: false });
    await stopDs.initialize();
    try {
      const fresh = new ChanjetExecutionHttpGateway(new ChanjetExecutionAdmissionStore(stopDs.manager), m);
      await expect(fresh.send(context, 'BUSINESS', businessSend('/final'))).rejects.toThrow('CHANJET_ADMISSION_HOLD');
      expect(hitsByUrl('/final')).toHaveLength(0);
      expect(hitsByUrl('/reset')).toHaveLength(1);
    } finally { await stopDs.destroy(); }
  });

  it('queued beyond the API-owned total deadline ends timely with zero sends', async () => {
    resetHits();
    const m = await registered(5, 30_000, 150);
    fixture.setRoutes({
      '/v1/common/auth/selfBuiltApp/generateToken': { body: { value: { accessToken: 'tok', expiresIn: 7200 } }, delayMs: 0 },
      '/blocked': { body: { code: '200' } },
    });
    const service = createService(fixture.endpoint());
    process.env.CHANJET_MIN_REQUEST_INTERVAL_MS = '1000';
    try {
      const context = await beginProbe(m, `PROBE_${randomUUID().slice(0, 8)}`);
      const scopeState: ExecutionScopeState = { manifest: m, store, gateway: gatewayFor(m), transport: transportOps(), current: context, deadlineAt: new Date(Date.now() + 150) };
      const started = Date.now();
      await withExecutionScope(scopeState, async () => {
        await expect(service.callApi('/blocked', { method: 'POST', body: {} })).rejects.toThrow('CHANJET_EXECUTION_DEADLINE');
      });
      expect(Date.now() - started).toBeLessThan(1_000);
      expect(hitsByUrl('/blocked')).toHaveLength(0);
      expect(hitsByUrl('/v1/common/auth/selfBuiltApp/generateToken')).toHaveLength(0);
    } finally { delete process.env.CHANJET_MIN_REQUEST_INTERVAL_MS; }
  });

  it('50107 envelope shapes each reach the single controlled retry, counted per HTTP', async () => {
    resetHits();
    const m = await registered(12);
    fixture.setRoutes({
      '/v1/common/auth/selfBuiltApp/generateToken': { body: { value: { accessToken: `tok-${randomUUID().slice(0, 6)}`, expiresIn: 7200 } } },
      '/retry-bare': { body: (nth: number) => (nth === 0 ? { code: '50107' } : { code: '200', value: [] }) },
      '/retry-nested': { body: (nth: number) => (nth === 0 ? { error: { code: '50107', message: 'expired' } } : { code: '200', value: [] }) },
      '/retry-envelope': { body: (nth: number) => (nth === 0 ? { success: false, error: { code: '50107' }, msg: 'token expired', requestId: 'REQ-50107' } : { code: '200', value: [] }) },
      '/retry-plain-failure': { body: { success: false, code: 'pub.e9002', msg: '参数不合法', requestId: 'REQ-E9002' } },
    });
    const service = createService(fixture.endpoint());
    const businessResults = async (executionId: string) => (await receipts(executionId)).filter((r: { kind: string }) => r.kind === 'BUSINESS').map((r: { result: string }) => r.result);
    // each run gets its own execution so receipts never mix
    const run = async (path: string) => {
      const fresh = await registered(10);
      const context = await beginProbe(fresh, `PROBE_${randomUUID().slice(0, 8)}`);
      const scopeState: ExecutionScopeState = { manifest: fresh, store, gateway: gatewayFor(fresh), transport: transportOps(), current: context, deadlineAt: scopeDeadlineAt() };
      await withExecutionScope(scopeState, () => service.callApi(path, { method: 'POST', body: {} }));
      return businessResults(fresh.executionId);
    };
    expect(await run('/retry-bare')).toEqual(['BUSINESS_FAILURE', 'OK']);
    expect(await run('/retry-nested')).toEqual(['BUSINESS_FAILURE', 'OK']);
    expect(await run('/retry-envelope')).toEqual(['BUSINESS_FAILURE', 'OK']);
    // non-50107 business failure: no retry, one documented failure receipt
    const plain = await registered(10);
    const context = await beginProbe(plain, `PROBE_${randomUUID().slice(0, 8)}`);
    const scopeState: ExecutionScopeState = { manifest: plain, store, gateway: gatewayFor(plain), transport: transportOps(), current: context, deadlineAt: scopeDeadlineAt() };
    await withExecutionScope(scopeState, async () => {
      await expect(service.callApi('/retry-plain-failure', { method: 'POST', body: {} })).rejects.toThrow(/pube9002/);
    });
    expect(await businessResults(plain.executionId)).toEqual(['BUSINESS_FAILURE']);
  });

  it('every provider fetch in the auth service forbids redirect following', async () => {
    // the spec lives next to the service; __dirname is reliable under ts-jest CJS
    const source = fsns.readFileSync(pathns.join(__dirname, 'chanjet-auth.service.ts'), 'utf8');
    const fail = (message: string): never => { throw new Error(`CONTRACT:${message}`); };
    if (source.length < 1000) fail('auth service source readable');
    const fetchCalls = source.match(/await (?:providerFetch|fetch)\(/g) ?? [];
    if (fetchCalls.length < 5) fail(`provider fetch call sites expected, found ${fetchCalls.length}`);
    const providerFetchSites = (source.match(/await providerFetch\(/g) ?? []).length;
    if (providerFetchSites < 3) fail(`providerFetch required at execution send sites, found ${providerFetchSites}`);
    if (!/redirect: 'manual'/.test(source)) fail('legacy literal fetch must keep redirect manual');
    if (/redirect: 'follow'/.test(source)) fail('redirect following must never appear');
  });

  // ── review round 2: barrier revalidation, two-hop demo, scope hygiene ──
  it('reservation committed then held at a barrier yields zero HTTP and keeps the receipt', async () => {
    resetHits();
    const m = await registered(3);
    fixture.setRoutes({ '/business': { body: { code: '200' } } });
    const context = await beginProbe(m);
    let releaseBarrier!: () => void;
    const barrier = new Promise<void>((resolve) => { releaseBarrier = resolve; });
    const gateway = new ChanjetExecutionHttpGateway(store, m, {
      postReserveBarrier: async () => {
        // deterministic window: reservation committed, send not started;
        // a second connection persists a stop into exactly that window
        const stopDs = new DataSource({ type: 'postgres', url: fixtureUrl, logging: false });
        try {
          await stopDs.initialize();
          await new ChanjetExecutionAdmissionStore(stopDs.manager).holdExecution(context, 'CANCELLED');
        } finally { await stopDs.destroy(); }
        releaseBarrier();
        await barrier;
      },
    });
    await expect(gateway.send(context, 'BUSINESS', businessSend('/business'))).rejects.toThrow(/CHANJET_ADMISSION_HOLD|HOLD_UNCONFIRMED/);
    expect(hitsByUrl('/business')).toHaveLength(0);
    // committed reservation evidence preserved: counted, RESERVED, no refund/delete
    const rows = await receipts(m.executionId);
    expect(rows).toEqual([{ ordinal: 1, phase: 'PROBING', lease_id: context.leaseId, kind: 'BUSINESS', status: 'RESERVED', result: 'UNSET' }]);
    expect((await store.load(m)).request_count).toBe(1);
  });

  it('ordinary fixture demonstrably produces a second hop; controlled provider path does not', async () => {
    resetHits();
    const m = await registered(3);
    fixture.setRoutes({ '/redirect': { status: 302, location: '/final' }, '/final': { body: { code: '200' } } });
    // plain stock fetch (no scope, no manual): undici follows the real
    // Location header to /final — proves the fixture genuinely redirects
    const plain = await fetch(`${fixture.endpoint()}/redirect`, { method: 'POST' });
    expect(plain.status).toBe(200);
    expect(hitsByUrl('/redirect')).toHaveLength(1);
    expect(hitsByUrl('/final')).toHaveLength(1);
    // controlled provider path: manual + 3xx error -> one HTTP, one counted receipt
    resetHits();
    const context = await beginProbe(m);
    const gateway = gatewayFor(m);
    const result = await gateway.send(context, 'BUSINESS', async (signal: AbortSignal) => {
      const res = await providerFetch(`${fixture.endpoint()}/redirect`, { signal, method: 'POST' });
      return res.json();
    });
    expect(result.outcome).toBe('TRANSPORT_FAILURE');
    expect(hitsByUrl('/redirect')).toHaveLength(1);
    expect(hitsByUrl('/final')).toHaveLength(0);
    expect((await store.load(m)).request_count).toBe(1);
  });

  it('unrelated non-execution requests are untouched by execution transport', async () => {
    resetHits();
    fixture.setRoutes({ '/unrelated': { body: { code: '200' } } });
    // no scope: stock fetch keeps default behavior on unrelated endpoints
    const res = await fetch(`${fixture.endpoint()}/unrelated`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(hitsByUrl('/unrelated')).toHaveLength(1);
  });

  it('admission waits are bounded by real PostgreSQL timeouts and roll back cleanly', async () => {
    resetHits();
    const m = await registered(3);
    fixture.setRoutes({ '/ok': { body: { code: '200' } } });
    const context = await beginProbe(m);
    const reserved = await store.reserve(context, 'BUSINESS');
    // a second connection holds the admission row lock
    const blocker = new DataSource({ type: 'postgres', url: fixtureUrl, logging: false });
    await blocker.initialize();
    const qr = blocker.createQueryRunner();
    await qr.startTransaction();
    try {
      await qr.query('SELECT * FROM chanjet_execution_admissions WHERE execution_id=$1 FOR UPDATE', [m.executionId]);
      const started = Date.now();
      const bounded: ExecutionContext = { ...context, deadlineAt: new Date(Date.now() + 400) };
      await expect(store.acknowledge(bounded, reserved.ticket, 'OK')).rejects.toThrow(/CHANJET_ADMISSION/);
      expect(Date.now() - started).toBeLessThan(3_000);
      // the timed-out transaction rolled back: nothing acknowledged, nothing poisoned
      const rows = await receipts(m.executionId);
      expect(rows.every((r: { status: string }) => r.status === 'RESERVED')).toBe(true);
    } finally {
      await qr.rollbackTransaction();
      await qr.release();
      await blocker.destroy();
    }
    // after the lock holder goes away, the normal path works again
    await store.acknowledge(context, reserved.ticket, 'OK');
    expect((await store.load(m)).phase).toBe('PROBING');
  });

  it('several short SQL statements cannot cumulatively outlive the execution deadline', async () => {
    resetHits();
    const m = await registered(6);
    fixture.setRoutes({
      '/step1': { body: { code: '200' }, delayMs: 150 },
      '/step2': { body: { code: '200' }, delayMs: 150 },
      '/step3': { body: { code: '200' }, delayMs: 150 },
    });
    const context = await beginProbe(m);
    // single-statement budget (5s) exceeds each step; the ABSOLUTE execution
    // deadline (300ms) is what must stop the cumulative sequence
    const bounded: ExecutionContext = { ...context, deadlineAt: new Date(Date.now() + 300) };
    const gateway = gatewayFor(m);
    let outcomes = 0;
    await expect((async () => {
      for (const path of ['/step1', '/step2', '/step3']) {
        const result = await gateway.send(bounded, 'BUSINESS', async (signal: AbortSignal) => (await fetch(`${fixture.endpoint()}${path}`, { signal })).json());
        outcomes += 1;
        expect(result.outcome).toBe('OK');
      }
    })()).rejects.toThrow();
    // the hold was UNCONFIRMED and its guard write expired-aborted before ANY
    // statement: accurate terminal state is the live phase with the receipt
    // evidence preserved — a later interaction records the DEADLINE hold
    expect(await gateway.settled()).toBe('UNCONFIRMED');
    const row = await store.load(m);
    expect(row.phase).toBe('PROBING');
    expect(row.hold_reason).toBe('');
    const completed = hitsByUrl('/step1').length + hitsByUrl('/step2').length + hitsByUrl('/step3').length;
    expect(completed).toBeLessThan(3);
    expect(outcomes).toBeLessThan(3);
  });

  it('a saturated single-connection pool cannot delay the caller past the deadline or commit late', async () => {
    resetHits();
    const m = await registered(3);
    fixture.setRoutes({ '/ok': { body: { code: '200' } } });
    const storeDs = new DataSource({ type: 'postgres', url: fixtureUrl, poolSize: 1, logging: false });
    await storeDs.initialize();
    try {
      // THE saturated pool is the store's own pool: its single client is the
      // only DB access this execution's store can get.
      const localStore = new ChanjetExecutionAdmissionStore(storeDs.manager);
      const context = await beginProbeOn(m, localStore);
      // a real committed reservation, taken BEFORE the pool is saturated
      const reserved = await localStore.reserve(context, 'BUSINESS');
      const bounded: ExecutionContext = { ...context, deadlineAt: new Date(Date.now() + 150) };
      // occupy the only pool connection past the total deadline
      const occupier = storeDs.query('SELECT pg_sleep(0.9) AS slept');
      const started = Date.now();
      // the caller returns on time; the late-acquired background transaction
      // finds the deadline expired at its guard statement (the proxy aborts
      // before ANY statement), rolls back — no late execution, no late commit
      const ackResult = await Promise.race([
        localStore.acknowledge(bounded, reserved.ticket, 'OK').then(() => 'committed' as const).catch(() => 'rolled-back-or-held' as const),
        new Promise((resolve) => setTimeout(() => resolve('late' as const), 1_200)),
      ]);
      expect(Date.now() - started).toBeLessThan(800);
      expect(ackResult).not.toBe('committed');
      void occupier;
      await occupier;
      // give any raced background transaction a beat to die before teardown
      await new Promise((resolve) => setTimeout(resolve, 50));
      // after the pool frees: no late commit happened — the receipt is untouched
      const rows = await storeDs.query('SELECT status, result FROM chanjet_execution_requests WHERE execution_id=$1', [m.executionId]);
      expect(rows.every((r: { status: string; result: string }) => r.status === 'RESERVED' && r.result === 'UNSET')).toBe(true);
      // and a normal send still recovers on a fresh execution
      const recovered = await registered(3);
      const recoveredContext = await beginProbe(recovered);
      const recoveredResult = await gatewayFor(recovered).send(recoveredContext, 'BUSINESS', businessSend('/ok'));
      expect(recoveredResult.outcome).toBe('OK');
    } finally { await storeDs.destroy(); }
  });

  it('queue FIFO: cancelling a middle caller preserves intervals for the next caller', async () => {
    resetHits();
    const m = await registered(10);
    fixture.setRoutes({
      '/v1/common/auth/selfBuiltApp/generateToken': { body: { value: { accessToken: `tok-${randomUUID().slice(0, 6)}`, expiresIn: 7200 } } },
      '/a': { body: { code: '200', delayMs: 0 } },
      '/b': { body: { code: '200', delayMs: 0 } },
      '/c': { body: { code: '200', delayMs: 0 } },
    });
    const service = createService(fixture.endpoint());
    process.env.CHANJET_MIN_REQUEST_INTERVAL_MS = '200';
    if (!fifoDs.isInitialized) await fifoDs.initialize();
    try {
      const times: Record<string, number> = {};
      const timedCall = (scopeState: ExecutionScopeState, path: string) => withExecutionScope(scopeState, async () => {
        await service.callApi(path, { method: 'POST', body: {} });
        times[path] = Date.now();
      });
      // A: healthy scope; B: expires while queued; C: healthy scope.
      // Three independent executions share only the service traffic queue.
      const makeScope = async (prefix: string, deadlineInMs: number) => {
        const manifest = await registered(10);
        const current = await beginProbe(manifest, `${prefix}_${randomUUID().slice(0, 6)}`);
        return { manifest, current, state: { manifest, store, gateway: gatewayFor(manifest), transport: transportOps(), current, deadlineAt: new Date(Date.now() + deadlineInMs) } as ExecutionScopeState };
      };
      const scopeA = await makeScope('A', 5_000);
      const scopeB = await makeScope('B', 260);
      const scopeC = await makeScope('C', 5_000);
      const t0 = Date.now();
      const a = timedCall(scopeA.state, '/a');
      await new Promise((r) => setTimeout(r, 30));
      const b = timedCall(scopeB.state, '/b').catch((error) => { times.b = Date.now(); throw error; });
      await new Promise((r) => setTimeout(r, 30));
      const c = timedCall(scopeC.state, '/c');
      await expect(b).rejects.toThrow('CHANJET_EXECUTION_DEADLINE');
      await Promise.all([a, c]);
      const elapsedA = times['/a'] - t0;
      const elapsedC = times['/c'] - t0;
      // C must NOT jump ahead of A's remaining interval (the round-2 bug:
      // C released at ~260ms while A waited until ~400ms)
      expect(elapsedC - elapsedA).toBeGreaterThanOrEqual(180);
      // ...and the queue is not wedged: C completes promptly after A's slot
      expect(elapsedC).toBeLessThan(1_500);
      expect(hitsByUrl('/b')).toHaveLength(0);
      // B expired before its queue slot: zero sends for B; receipts preserved
      const fifoRows = await fifoReceipts((scopeB.manifest as ExecutionManifest).executionId);
      expect(fifoRows.every((r: { status: string }) => r.status === 'RESERVED' || r.status === 'ACKNOWLEDGED')).toBe(true);
      void a; void c;
    } finally {
      delete process.env.CHANJET_MIN_REQUEST_INTERVAL_MS;
    }
  });
  afterAll(async () => {
    await fifoDs.destroy().catch(() => undefined);
  });

  it('B expired before enqueue is rejected at the entry check without touching the queue', async () => {
    resetHits();
    const m = await registered(10);
    fixture.setRoutes({ '/early': { body: { code: '200' } } });
    const service = createService(fixture.endpoint());
    const context = await beginProbe(m, `E_${randomUUID().slice(0, 6)}`);
    const expired: ExecutionScopeState = { manifest: m, store, gateway: gatewayFor(m), transport: transportOps(), current: context, deadlineAt: new Date(Date.now() - 1) };
    await withExecutionScope(expired, async () => {
      await expect(service.callApi('/early', { method: 'POST', body: {} })).rejects.toThrow('CHANJET_EXECUTION_DEADLINE');
    });
    expect(hitsByUrl('/early')).toHaveLength(0);
  });

  // ── review round 3: max=1 pool occupation over the WHOLE public call ──
  async function saturateAndCleanup(storeDs: DataSource, body: (localStore: ChanjetExecutionAdmissionStore) => Promise<void>) {
    try {
      const localStore = new ChanjetExecutionAdmissionStore(storeDs.manager);
      await body(localStore);
    } finally {
      await new Promise((resolve) => setTimeout(resolve, 60));
      await storeDs.destroy();
    }
  }
  const deadlineIn = (ms: number) => new Date(Date.now() + ms);

  it('pool-saturated full gateway.send ends by the deadline with zero HTTP and preserves the receipt', async () => {
    resetHits();
    const m = await registered(3);
    fixture.setRoutes({ '/final': { body: { code: '200' } } });
    const storeDs = new DataSource({ type: 'postgres', url: fixtureUrl, poolSize: 1, logging: false });
    await storeDs.initialize();
    await saturateAndCleanup(storeDs, async (localStore) => {
      const context = { ...await beginProbeOn(m, localStore), deadlineAt: deadlineIn(150) };
      let httpAttempts = 0;
      const occupier = storeDs.query('SELECT pg_sleep(0.9) AS slept');
      const gateway = new ChanjetExecutionHttpGateway(localStore, m);
      const started = Date.now();
      let lastError: Error | undefined;
      await gateway.send(context, 'BUSINESS', async () => { httpAttempts += 1; return {}; }).catch((e) => { lastError = e; });
      const elapsed = Date.now() - started;
      // the public call ends at the ORIGINAL absolute deadline — no runtime
      // grace window, no pool-release-point acceptance
      expect(elapsed).toBeLessThan(400);
      expect(httpAttempts).toBe(0);
      // the reserve refusal surfaces as-is (the masked admission hold); the
      // ambiguous hold outcome goes through settled()
      expect(String(lastError?.message ?? lastError)).toMatch(/CHANJET_ADMISSION_HOLD|CHANJET_EXECUTION_(DEADLINE|HOLD_UNCONFIRMED|RESERVE_UNAVAILABLE)/);
      void occupier;
      await occupier;
      await new Promise((resolve) => setTimeout(resolve, 60));
      // no late insert after the pool freed: reservation never committed
      const rows = await storeDs.query('SELECT status, result FROM chanjet_execution_requests WHERE execution_id=$1', [m.executionId]);
      expect(rows).toEqual([]);
      // new execution recovers on the freed pool
      const recovered = await registered(3);
      const recoveredContext = { ...await beginProbeOn(recovered, localStore), deadlineAt: deadlineIn(5_000) };
      const recoveredGateway = new ChanjetExecutionHttpGateway(localStore, recovered);
      const ok = await recoveredGateway.send(recoveredContext, 'BUSINESS', async (signal: AbortSignal) => (await fetch(`${fixture.endpoint()}/final`, { signal })).json());
      expect(ok.outcome).toBe('OK');
    });
  });

  it('pool-saturated auth.callApi budget path ends by the deadline with zero HTTP and zero budget writes', async () => {
    resetHits();
    const m = await registered(3);
    fixture.setRoutes({
      '/v1/common/auth/selfBuiltApp/generateToken': { body: { value: { accessToken: `tok-${randomUUID().slice(0, 6)}`, expiresIn: 7200 } } },
      '/budget-final': { body: { code: '200', value: [] } },
    });
    const storeDs = new DataSource({ type: 'postgres', url: fixtureUrl, poolSize: 1, logging: false });
    await storeDs.initialize();
    // disposable test-local budget table (same shape the service expects)
    await storeDs.query(`CREATE TABLE IF NOT EXISTS sys_chanjet_api_budget (
      budget_key varchar(64) PRIMARY KEY,
      request_count integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT NOW())`);
    await storeDs.query('DELETE FROM sys_chanjet_api_budget');
    await saturateAndCleanup(storeDs, async (localStore) => {
      const service = createService(fixture.endpoint(), storeDs.manager);
      const context = { ...await beginProbeOn(m, localStore), deadlineAt: deadlineIn(150) };
      const scopeState: ExecutionScopeState = { manifest: m, store: localStore, gateway: new ChanjetExecutionHttpGateway(localStore, m), transport: transportOps(), current: context, deadlineAt: deadlineIn(150) };
      let httpAttempts = 0;
      const occupier = storeDs.query('SELECT pg_sleep(0.9) AS slept');
      const started = Date.now();
      await withExecutionScope(scopeState, async () => {
        await expect(service.callApi('/budget-final', { method: 'POST', body: {} })).rejects.toThrow(/CHANJET_EXECUTION_(DEADLINE|HOLD_UNCONFIRMED)/);
      });
      const elapsed = Date.now() - started;
      // the public call ends at the ORIGINAL absolute deadline — no runtime
      // grace window, no pool-release-point acceptance
      expect(elapsed).toBeLessThan(400);
      expect(httpAttempts).toBe(0);
      void occupier;
      await occupier;
      await new Promise((resolve) => setTimeout(resolve, 60));
      const budgetRows = await storeDs.query('SELECT count(*)::int AS n FROM sys_chanjet_api_budget');
      expect(budgetRows[0].n).toBe(0);
      // legacy (non-execution) path recovers once the pool frees
      const legacy = await service.callApi('/budget-final', { method: 'POST', body: {} });
      expect(legacy).toMatchObject({ code: '200' });
    });
  });

  it('deadline-first: caller gets HOLD_UNCONFIRMED at the deadline while the real write is pending; settled later reports CONFIRMED', async () => {
    resetHits();
    const m = await registered(3, 250);
    fixture.setRoutes({ '/slow': { body: { late: true }, delayMs: 1_200 }, '/final': { body: { code: '200' } } });
    const storeDs = new DataSource({ type: 'postgres', url: fixtureUrl, poolSize: 1, logging: false });
    const guardDs = new DataSource({ type: 'postgres', url: fixtureUrl, poolSize: 1, logging: false });
    await storeDs.initialize();
    await guardDs.initialize();
    try {
      const localStore = new ChanjetExecutionAdmissionStore(storeDs.manager);
      // the standalone guard write is registered on the STORE (the single
      // registration point) and deliberately slowed so settled() stays
      // pending past the deadline — proving no early return and no grace
      // window; it runs on its own pool, never the business pool
      localStore.setStandaloneExecutor({
        query: async (sql: string, params?: unknown[]) => {
          await guardDs.query('SELECT pg_sleep(0.4) AS guard_prep');
          return storeDs.query(sql, params);
        },
      });
      const context = { ...await beginProbe(m), deadlineAt: deadlineIn(150) };
      const gateway = new ChanjetExecutionHttpGateway(localStore, m);
      let httpAttempts = 0;
      const started = Date.now();
      // the gateway aborts the op at the min(httpTimeout 250ms, remaining)
      // deadline; the ack raced and lost -> the caller gets ACK_UNVERIFIED
      await expect(gateway.send(context, 'BUSINESS', async (signal: AbortSignal) => { httpAttempts += 1; return (await fetch(`${fixture.endpoint()}/slow`, { signal })).json(); }))
        .rejects.toThrow(/CHANJET_EXECUTION_(DEADLINE|HOLD_UNCONFIRMED|ACK_UNVERIFIED)/);
      const elapsed = Date.now() - started;
      // the public call ends at the ORIGINAL absolute deadline — no runtime
      // grace window, no pool-release-point acceptance
      expect(elapsed).toBeLessThan(400);
      expect(httpAttempts).toBe(1);
      // settled() is STILL PENDING right after the caller returned: the real
      // write has not finished yet — no early CONFIRMED
      const settledPromise = gateway.settled();
      const pendingCheck = await Promise.race([
        settledPromise.then(() => 'settled-early' as const),
        new Promise<'still-pending'>((resolve) => setTimeout(() => resolve('still-pending'), 50)),
      ]);
      expect(pendingCheck).toBe('still-pending');
      // the real write completes and reports through settled()
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(await settledPromise).toBe('CONFIRMED');
      expect(gateway.holdAttempts).toBe(1);
      // the stop is durably persisted
      const row = await store.load(m);
      expect(row.phase).toBe('HOLD');
      expect(row.hold_reason).toBe('DEADLINE');
    } finally {
      await storeDs.destroy().catch(() => undefined);
      await guardDs.destroy().catch(() => undefined);
    }
  });

  it('pool-saturated ack failure ends by the deadline with the accurate ACK_UNVERIFIED and stays stopped', async () => {
    resetHits();
    const m = await registered(3);
    fixture.setRoutes({ '/final': { body: { code: '200' } } });
    const storeDs = new DataSource({ type: 'postgres', url: fixtureUrl, poolSize: 1, logging: false });
    await storeDs.initialize();
    // the guard write runs on its own bounded executor over an INDEPENDENT
    // connection — the ack hold persists even while the business pool is
    // saturated
    const guard = createBoundedGuardExecutor(fixtureUrl!);
    try {
      const localStore = new ChanjetExecutionAdmissionStore(storeDs.manager);
      localStore.setStandaloneExecutor(guard);
      const context = { ...await beginProbeOn(m, localStore), deadlineAt: deadlineIn(150) };
      const reserved = await localStore.reserve(context, 'BUSINESS');
      const gateway = new ChanjetExecutionHttpGateway(localStore, m);
      let occupier: Promise<unknown> | undefined;
      let httpAttempts = 0;
      const started = Date.now();
      // the exchange completes (counted); the acknowledgement blocks on the
      // saturated pool and races the absolute deadline
      const sendPromise = gateway.send(context, 'BUSINESS', async (signal: AbortSignal) => {
        occupier = storeDs.query('SELECT pg_sleep(0.6) AS slept');
        httpAttempts += 1;
        return (await fetch(`${fixture.endpoint()}/final`, { signal })).json();
      });
      // the public call REJECTS with the accurate unverifiable-ack error: the
      // exchange was counted but the ack could not be confirmed by the
      // absolute deadline
      await expect(sendPromise).rejects.toThrow('CHANJET_EXECUTION_ACK_UNVERIFIED');
      // BOTH outcomes are fail-closed and this test accepts either, asserting
      // the invariants of each: the ack raced the deadline (ACK_UNVERIFIED)
      // or the reserve itself lost the deadline race on a loaded runner
      // (CHANJET_ADMISSION_HOLD — zero HTTP, no receipts)
      let rejection = '';
      try {
        await sendPromise;
        throw Error('send resolved');
      } catch (error) {
        rejection = String((error as Error).message);
      }
      const elapsed = Date.now() - started;
      expect(elapsed).toBeLessThan(2_000);
      if (rejection.includes('CHANJET_EXECUTION_ACK_UNVERIFIED')) {
        expect(httpAttempts).toBe(1);
        // the ack raced the deadline and rolled back: the receipts stay
        // RESERVED/UNSET — no late ack commit
        await occupier;
        await new Promise((resolve) => setTimeout(resolve, 60));
        const rows = await storeDs.query('SELECT status, result FROM chanjet_execution_requests WHERE execution_id=$1', [m.executionId]);
        // TWO receipts (the explicit setup reservation + the gateway's own
        // counted send), both never acknowledged — no late ack commit
        expect(rows).toEqual([
          { status: 'RESERVED', result: 'UNSET' },
          { status: 'RESERVED', result: 'UNSET' },
        ]);
      } else {
        // reserve-refusal path: the reserve lost the deadline race — zero
        // HTTP and no receipts
        expect(rejection).toContain('CHANJET_ADMISSION_HOLD');
        expect(httpAttempts).toBe(0);
        void occupier;
        const rows = await storeDs.query('SELECT count(*)::int AS n FROM chanjet_execution_requests WHERE execution_id=$1', [m.executionId]);
        expect(rows[0].n).toBe(0);
      }
      // the stop WAS persisted via the standalone guard connection
      const admissionRow = await storeDs.query('SELECT phase, hold_reason FROM chanjet_execution_admissions WHERE execution_id=$1', [m.executionId]);
      expect(admissionRow[0].phase).toBe('HOLD');
      expect(['DEADLINE', 'ACK_UNVERIFIED', 'RESERVE_UNVERIFIED']).toContain(admissionRow[0].hold_reason);
      // the shared hold job reports its real result
      expect(await gateway.settled()).toBe('CONFIRMED');
      // gateway stays stopped
      await expect(gateway.send(context, 'BUSINESS', async () => { httpAttempts += 1; return {}; })).rejects.toThrow('CHANJET_EXECUTION_STOPPED');
      // fresh execution recovers on the freed pool
      const recovered = await registered(3);
      const recoveredContext = { ...await beginProbeOn(recovered, localStore), deadlineAt: deadlineIn(5_000) };
      const recoveredGateway = new ChanjetExecutionHttpGateway(localStore, recovered);
      const recoveredResult = await recoveredGateway.send(recoveredContext, 'BUSINESS', async (signal: AbortSignal) => (await fetch(`${fixture.endpoint()}/final`, { signal })).json());
      expect(recoveredResult.outcome).toBe('OK');
    } finally {
      await guard.dispose();
      await storeDs.destroy().catch(() => undefined);
    }
  });

  /** Truly standalone guard sandbox: its own business pool plus the bounded
   *  guard executor on its own DEDICATED connection, registered on the store. */
  async function standaloneGuardSandbox(bounds?: Parameters<typeof createBoundedGuardExecutor>[1]) {
    const storeDs = new DataSource({ type: 'postgres', url: fixtureUrl, poolSize: 1, logging: false });
    await storeDs.initialize();
    const localStore = new ChanjetExecutionAdmissionStore(storeDs.manager);
    const guard = createBoundedGuardExecutor(fixtureUrl!, bounds);
    localStore.setStandaloneExecutor(guard);
    return { storeDs, localStore, guard };
  }

  it('standalone guard write persists HOLD for a fully-bound execution', async () => {
    resetHits();
    const m = await registered(3);
    const context = await beginProbe(m);
    const { storeDs, localStore, guard } = await standaloneGuardSandbox();
    try {
      const result = await localStore.holdExecution(context, 'DEADLINE');
      expect(result).toBe('CONFIRMED');
      const rows = await receipts(m.executionId);
      expect(rows).toHaveLength(0);
      const row = await store.load(m);
      expect(row.phase).toBe('HOLD');
      expect(row.hold_reason).toBe('DEADLINE');
    } finally {
      await guard.dispose();
      await storeDs.destroy().catch(() => undefined);
    }
  });

  it('standalone guard refuses wrong owner, approval, floor, canonical/digest and unregistered ids with zero state change', async () => {
    const m = await registered(3);
    const base = await beginProbe(m);
    const { storeDs, localStore, guard } = await standaloneGuardSandbox();
    try {
      const tampered = (field: string, value: string) => {
        const copy: ExecutionManifest = JSON.parse(JSON.stringify(m));
        if (field === 'owner') copy.ownerId = value;
        else if (field === 'approvalId') copy.approval.approvalId = value;
        else if (field === 'floorSha') copy.approval.floorSha = value;
        else if (field === 'scope') copy.approval.scopes = [value];
        return copy;
      };
      for (const [field, value] of [
        ['owner', 'ROGUE_OPERATOR'],
        ['approvalId', 'ROGUE_APPROVAL'],
        ['floorSha', 'b'.repeat(40)],
        ['scope', 'ROGUE_SCOPE'],
      ] as Array<[string, string]>) {
        const bad = tampered(field, value);
        const badContext = { ...base, manifest: bad };
        await expect(localStore.holdExecution(badContext, 'DEADLINE')).rejects.toThrow(/CHANJET_ADMISSION/);
        // zero state change on the VALID row
        const row = await store.load(m);
        expect(row.owner_id ?? row.hold_reason).toBeDefined();
        expect(row.phase).toBe('PROBING');
        expect(row.hold_reason).toBe('');
      }
      // unregistered id
      const unregistered = manifest();
      await expect(localStore.holdExecution({ manifest: unregistered, leaseId: 'NO', phase: 'PROBING' }, 'DEADLINE')).rejects.toThrow(/CHANJET_ADMISSION/);
      const row = await store.load(m);
      expect(row.phase).toBe('PROBING');
      expect(row.hold_reason).toBe('');
    } finally {
      await guard.dispose();
      await storeDs.destroy().catch(() => undefined);
    }
  });

  it('the guard write through a dedicated connection keeps real caps and does not queue behind the business pool', async () => {
    const m = await registered(3);
    const context = await beginProbe(m);
    const { storeDs, localStore, guard } = await standaloneGuardSandbox();
    try {
      // connection identity: the bounded executor demonstrably runs on its
      // own backend, not on the business pool
      const guardPid = (await guard.query('SELECT pg_backend_pid() AS pid') as Array<{ pid: number }>)[0].pid;
      const businessPid = (await storeDs.query('SELECT pg_backend_pid() AS pid') as Array<{ pid: number }>)[0].pid;
      expect(guardPid).not.toBe(businessPid);
      expect(guard.backendPid).toBe(guardPid);
      // saturate the BUSINESS pool; the guard write still lands promptly
      // through its own connection (a business-pool guard would queue for the
      // whole sleep and miss the bound)
      const occupier = storeDs.query('SELECT pg_sleep(0.7) AS slept');
      const guardStarted = Date.now();
      const result = await localStore.holdExecution(context, 'DEADLINE');
      const guardElapsed = Date.now() - guardStarted;
      expect(result).toBe('CONFIRMED');
      expect(guardElapsed).toBeLessThan(700);
      const row = await store.load(m);
      expect(row.phase).toBe('HOLD');
      expect(row.hold_reason).toBe('DEADLINE');
      // the hold is a pure guard write: no receipt was created (caps intact)
      expect(await receipts(m.executionId)).toHaveLength(0);
      void occupier;
      await occupier;
    } finally {
      await guard.dispose();
      await storeDs.destroy().catch(() => undefined);
    }
  });

  it('a row lock held beyond the guard bound ends the original job bounded with settled=UNCONFIRMED and no late HOLD after release', async () => {
    resetHits();
    const m = await registered(3);
    const { storeDs, localStore, guard } = await standaloneGuardSandbox({ statementMs: 300, releaseMs: 500 });
    const lockDs = new DataSource({ type: 'postgres', url: fixtureUrl, logging: false });
    await lockDs.initialize();
    try {
      const context = { ...await beginProbeOn(m, localStore), deadlineAt: deadlineIn(30_000) };
      const gateway = new ChanjetExecutionHttpGateway(localStore, m);
      // hold the admission row FOR UPDATE beyond the 300ms guard bound: the
      // reserve is refused (it validates the context under the same row lock)
      // and the single hold job then blocks on the row lock inside the guard
      // connection
      const lockRunner = lockDs.createQueryRunner();
      await lockRunner.connect();
      await lockRunner.query('BEGIN');
      await lockRunner.query('SELECT * FROM chanjet_execution_admissions WHERE execution_id=$1 FOR UPDATE', [m.executionId]);
      let httpAttempts = 0;
      const started = Date.now();
      // zero HTTP: the op can never run because the reserve is refused first
      await expect(gateway.send(context, 'BUSINESS', async () => { httpAttempts += 1; return {}; }))
        .rejects.toThrow('CHANJET_ADMISSION_HOLD');
      // the original job ended BOUNDED: the guard statement was aborted by
      // lock_timeout (300ms), far before the 30s execution deadline
      const elapsed = Date.now() - started;
      expect(elapsed).toBeLessThan(2_500);
      expect(httpAttempts).toBe(0);
      expect(await gateway.settled()).toBe('UNCONFIRMED');
      expect(gateway.holdAttempts).toBe(1);
      // nothing was held while the lock was held (plain read: store.load
      // takes FOR UPDATE, which this test's own lock holder must not block)
      const during = await storeDs.query('SELECT phase, hold_reason FROM chanjet_execution_admissions WHERE execution_id=$1', [m.executionId]);
      expect(during[0].phase).toBe('PROBING');
      expect(during[0].hold_reason).toBe('');
      // release the lock: the aborted statement must NOT commit late now
      await lockRunner.query('COMMIT');
      await lockRunner.release();
      await new Promise((resolve) => setTimeout(resolve, 400));
      const after = await storeDs.query('SELECT phase, hold_reason FROM chanjet_execution_admissions WHERE execution_id=$1', [m.executionId]);
      expect(after[0].phase).toBe('PROBING');
      expect(after[0].hold_reason).toBe('');
      // no receipt was ever created: zero business evidence lost or added
      expect(await receipts(m.executionId)).toHaveLength(0);
      // a fresh hold through the same guard still works (executor not poisoned)
      const retry = await localStore.holdExecution(context, 'DEADLINE');
      expect(retry).toBe('CONFIRMED');
    } finally {
      await guard.dispose();
      await storeDs.destroy().catch(() => undefined);
      await lockDs.destroy().catch(() => undefined);
    }
  });

  it('an occupied guard connection fails the acquisition bounded and releases the resources', async () => {
    resetHits();
    const m = await registered(3);
    const context = await beginProbe(m);
    // the guard has ONE connection; acquireMs bounds the wait to own it
    const { storeDs, localStore, guard } = await standaloneGuardSandbox({ acquireMs: 250, releaseMs: 500 });
    try {
      // occupy the guard connection itself (no DataSource to queue on — the
      // executor serializes on its dedicated client)
      const occupierOutcome = await Promise.all([
        guard.query('SELECT pg_sleep(10) AS slept').then(() => 'completed' as const, () => 'killed' as const),
        (async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          const started = Date.now();
          await expect(localStore.holdExecution(context, 'DEADLINE')).rejects.toThrow('CHANJET_GUARD_ACQUIRE_TIMEOUT');
          const elapsed = Date.now() - started;
          expect(elapsed).toBeLessThan(1_000);
          return 'bounded' as const;
        })(),
      ]);
      expect(occupierOutcome[1]).toBe('bounded');
      // the occupying job was TERMINATED by the bound (rejected, not completed):
      // the socket teardown truly killed it — the 10s sleep never returned
      expect(occupierOutcome[0]).toBe('killed');
      // resources released: the acquisition timeout tore the guard down
      expect(guard.isDisposed).toBe(true);
      // the admission row is untouched: no partial hold, no receipt
      const row = await store.load(m);
      expect(row.phase).toBe('PROBING');
      expect(row.hold_reason).toBe('');
      expect(await receipts(m.executionId)).toHaveLength(0);
    } finally {
      await storeDs.destroy().catch(() => undefined);
    }
  });

  /** Loopback PostgreSQL proxy for guard transport-fault injection. Frames
   *  are parsed from the wire protocol (type byte + int32 length; the first
   *  client packet is the untyped startup message). Modes:
   *  - hold-after-ready: hold ALL client frames from the first ReadyForQuery
   *    onward — deterministic, the client cannot have sent BEGIN before it;
   *  - commit-only: hold only COMMIT simple-query frames.
   *  Held frames are NEVER forwarded; when the client disappears the
   *  upstream is destroyed so the server terminates the backend and rolls
   *  its open transaction back. */
  async function startPgProxy(targetPort: number, mode: 'hold-after-ready' | 'commit-only') {
    let heldCount = 0;
    let forwardedCommit = false;
    let forwardedQuery = false;
    let armed = false;
    let startupDone = false;
    const server = net.createServer((clientSocket) => {
      const upstream = net.connect(targetPort, '127.0.0.1');
      let clientBuffer = Buffer.alloc(0);
      let upstreamBuffer = Buffer.alloc(0);
      clientSocket.on('data', (chunk) => {
        clientBuffer = Buffer.concat([clientBuffer, chunk]);
        // the first client packet is the untyped startup message
        if (!startupDone) {
          if (clientBuffer.length < 4) return;
          const total = clientBuffer.readUInt32BE(0);
          if (clientBuffer.length < total) return;
          upstream.write(clientBuffer.subarray(0, total));
          clientBuffer = clientBuffer.subarray(total);
          startupDone = true;
        }
        let offset = 0;
        while (offset + 5 <= clientBuffer.length) {
          const type = clientBuffer[offset];
          const length = clientBuffer.readUInt32BE(offset + 1);
          if (offset + 1 + length > clientBuffer.length) break; // partial frame
          const frame = clientBuffer.subarray(offset, offset + 1 + length);
          const isQuery = type === 0x51; // 'Q'
          const isCommit = isQuery && frame.toString('latin1', 5, 11) === 'COMMIT';
          const held = (mode === 'hold-after-ready' && armed) || (mode === 'commit-only' && isCommit);
          if (held) heldCount += 1;
          else {
            upstream.write(frame);
            if (isQuery) {
              forwardedQuery = true;
              if (isCommit) forwardedCommit = true;
            }
          }
          offset += 1 + length;
        }
        clientBuffer = clientBuffer.subarray(offset);
      });
      upstream.on('data', (chunk) => {
        if (!clientSocket.destroyed) clientSocket.write(chunk);
        if (mode === 'hold-after-ready' && !armed) {
          upstreamBuffer = Buffer.concat([upstreamBuffer, chunk]);
          let offset = 0;
          while (offset + 5 <= upstreamBuffer.length) {
            const type = upstreamBuffer[offset];
            const length = upstreamBuffer.readUInt32BE(offset + 1);
            if (type === 0x5a) { armed = true; break; } // 'Z' ReadyForQuery
            if (offset + 1 + length > upstreamBuffer.length) break; // partial frame
            offset += 1 + length;
          }
          if (!armed) upstreamBuffer = upstreamBuffer.subarray(offset);
          else upstreamBuffer = Buffer.alloc(0);
        }
      });
      clientSocket.on('close', () => upstream.destroy());
      upstream.on('close', () => { if (!clientSocket.destroyed) clientSocket.destroy(); });
      clientSocket.on('error', () => clientSocket.destroy());
      upstream.on('error', () => upstream.destroy());
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as net.AddressInfo).port;
    return {
      port,
      get heldCount() { return heldCount; },
      get forwardedCommit() { return forwardedCommit; },
      get forwardedQuery() { return forwardedQuery; },
      close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    };
  }

  it('paused BEGIN transport: the original job ends bounded, the connection is killed and nothing executes afterwards', async () => {
    resetHits();
    const m = await registered(3);
    const context = await beginProbe(m);
    const proxy = await startPgProxy(Number(new URL(fixtureUrl!).port), 'hold-after-ready');
    // the proxied URL inherits the fixture's credentials and database name
    const proxiedUrl = new URL(fixtureUrl!);
    proxiedUrl.hostname = '127.0.0.1';
    proxiedUrl.port = String(proxy.port);
    const storeDs = new DataSource({ type: 'postgres', url: fixtureUrl, poolSize: 1, logging: false });
    await storeDs.initialize();
    const localStore = new ChanjetExecutionAdmissionStore(storeDs.manager);
    const guard = createBoundedGuardExecutor(proxiedUrl.toString(), {
      statementMs: 300, clientWaitMs: 500, acquireMs: 2_000, releaseMs: 500,
    });
    localStore.setStandaloneExecutor(guard);
    let fresh: BoundedGuardExecutor | undefined;
    try {
      const started = Date.now();
      // BEGIN is held by the proxy: the server-side statement/lock timeouts
      // can never fire — only the client-wait bound terminates the job
      await expect(localStore.holdExecution(context, 'DEADLINE')).rejects.toThrow('CHANJET_GUARD_STATEMENT_TIMEOUT');
      const elapsed = Date.now() - started;
      expect(elapsed).toBeLessThan(2_000);
      // the bound destroyed the connection: the executor is unusable
      expect(guard.isDisposed).toBe(true);
      // the BEGIN was demonstrably held and never reached the server
      expect(proxy.heldCount).toBeGreaterThanOrEqual(1);
      expect(proxy.forwardedQuery).toBe(false);
      await proxy.close();
      await new Promise((resolve) => setTimeout(resolve, 200));
      // after resuming (proxy closed): no queued job continued — the row is
      // untouched and a FRESH guard on the healthy fixture persists the hold
      const row = await storeDs.query('SELECT phase, hold_reason FROM chanjet_execution_admissions WHERE execution_id=$1', [m.executionId]);
      expect(row[0].phase).toBe('PROBING');
      fresh = createBoundedGuardExecutor(fixtureUrl!, { statementMs: 300, clientWaitMs: 500, acquireMs: 2_000, releaseMs: 500 });
      localStore.setStandaloneExecutor(fresh);
      expect(await localStore.holdExecution(context, 'DEADLINE')).toBe('CONFIRMED');
    } finally {
      await guard.dispose();
      await fresh?.dispose();
      await storeDs.destroy().catch(() => undefined);
      await proxy.close().catch(() => undefined);
    }
  });

  it('paused COMMIT transport: the outcome is reported unknown, never claimed committed or rolled back, and nothing commits late', async () => {
    resetHits();
    const m = await registered(3);
    const context = await beginProbe(m);
    const proxy = await startPgProxy(Number(new URL(fixtureUrl!).port), 'commit-only');
    // the proxied URL inherits the fixture's credentials and database name
    const proxiedUrl = new URL(fixtureUrl!);
    proxiedUrl.hostname = '127.0.0.1';
    proxiedUrl.port = String(proxy.port);
    const storeDs = new DataSource({ type: 'postgres', url: fixtureUrl, poolSize: 1, logging: false });
    await storeDs.initialize();
    const localStore = new ChanjetExecutionAdmissionStore(storeDs.manager);
    const guard = createBoundedGuardExecutor(proxiedUrl.toString(), {
      statementMs: 300, clientWaitMs: 500, acquireMs: 2_000, releaseMs: 500,
    });
    localStore.setStandaloneExecutor(guard);
    let fresh: BoundedGuardExecutor | undefined;
    try {
      const started = Date.now();
      // BEGIN/SETs/UPDATE reach the server; COMMIT alone is held — its
      // outcome is genuinely unknown and must be reported that way
      await expect(localStore.holdExecution(context, 'DEADLINE')).rejects.toThrow('CHANJET_GUARD_COMMIT_UNKNOWN');
      const elapsed = Date.now() - started;
      expect(elapsed).toBeLessThan(2_500);
      expect(guard.isDisposed).toBe(true);
      expect(proxy.heldCount).toBeGreaterThanOrEqual(1);
      expect(proxy.forwardedCommit).toBe(false);
      expect(proxy.forwardedQuery).toBe(true);
      await proxy.close();
      // killing the client closed the upstream: the server terminated the
      // backend and rolled the open transaction back — no late commit
      await new Promise((resolve) => setTimeout(resolve, 400));
      const row = await storeDs.query('SELECT phase, hold_reason FROM chanjet_execution_admissions WHERE execution_id=$1', [m.executionId]);
      expect(row[0].phase).toBe('PROBING');
      expect(row[0].hold_reason).toBe('');
      // the healthy fixture takes a fresh hold normally
      fresh = createBoundedGuardExecutor(fixtureUrl!, { statementMs: 300, clientWaitMs: 500, acquireMs: 2_000, releaseMs: 500 });
      localStore.setStandaloneExecutor(fresh);
      expect(await localStore.holdExecution(context, 'DEADLINE')).toBe('CONFIRMED');
    } finally {
      await guard.dispose();
      await fresh?.dispose();
      await storeDs.destroy().catch(() => undefined);
      await proxy.close().catch(() => undefined);
    }
  });

  it('an idle backend loss is received controlled: executor unusable, resources released, process alive', async () => {
    const m = await registered(3);
    const context = await beginProbe(m);
    const { storeDs, localStore, guard } = await standaloneGuardSandbox();
    let fresh: BoundedGuardExecutor | undefined;
    try {
      await guard.query('SELECT 1 AS ok');
      const pid = guard.backendPid;
      expect(pid).toBeGreaterThan(0);
      // terminate the guard's own backend while the connection is IDLE —
      // pg surfaces this as an out-of-band 'error' event
      await ds.query('SELECT pg_terminate_backend($1)', [pid]);
      await new Promise((resolve) => setTimeout(resolve, 200));
      // controlled reception: unusable and released (this test process
      // surviving IS the no-unhandled-error assertion)
      expect(guard.isDisposed).toBe(true);
      await expect(guard.query('SELECT 1 AS ok')).rejects.toThrow('CHANJET_GUARD_EXECUTOR_DISPOSED');
      // the row was never touched
      const row = await ds.query('SELECT phase, hold_reason FROM chanjet_execution_admissions WHERE execution_id=$1', [m.executionId]);
      expect(row[0].phase).toBe('PROBING');
      // a fresh executor on the healthy store still works
      fresh = createBoundedGuardExecutor(fixtureUrl!);
      localStore.setStandaloneExecutor(fresh);
      expect(await localStore.holdExecution(context, 'DEADLINE')).toBe('CONFIRMED');
    } finally {
      await guard.dispose();
      await fresh?.dispose();
      await storeDs.destroy().catch(() => undefined);
    }
  });

  it('an in-flight backend loss ends the job bounded and refuses later calls', async () => {
    const m = await registered(3);
    const ctx = await beginProbe(m);
    const { storeDs, localStore, guard } = await standaloneGuardSandbox();
    let fresh: BoundedGuardExecutor | undefined;
    try {
      await guard.query('SELECT 1 AS ok');
      const pid = guard.backendPid;
      const started = Date.now();
      // a long-running guard statement is IN FLIGHT when the backend dies
      const slow = guard.query('SELECT pg_sleep(5) AS slept');
      await new Promise((resolve) => setTimeout(resolve, 150));
      await ds.query('SELECT pg_terminate_backend($1)', [pid]);
      await expect(slow).rejects.toThrow();
      // the job ended immediately with the backend, not after the 5s sleep
      expect(Date.now() - started).toBeLessThan(2_000);
      expect(guard.isDisposed).toBe(true);
      await expect(guard.query('SELECT 1 AS ok')).rejects.toThrow('CHANJET_GUARD_EXECUTOR_DISPOSED');
      // the admission row was never touched: the executor's death is not a
      // state change
      const row = await ds.query('SELECT phase, hold_reason FROM chanjet_execution_admissions WHERE execution_id=$1', [m.executionId]);
      expect(row[0].phase).toBe('PROBING');
      // a fresh executor still works
      fresh = createBoundedGuardExecutor(fixtureUrl!);
      localStore.setStandaloneExecutor(fresh);
      expect(await localStore.holdExecution(ctx, 'DEADLINE')).toBe('CONFIRMED');
    } finally {
      await guard.dispose();
      await fresh?.dispose();
      await storeDs.destroy().catch(() => undefined);
    }
  });

  it('parallel scopes keep distinct identities and nested throws clean up', async () => {
    const ma = await registered(3);
    const mb = await registered(3);
    const ca = await beginProbe(ma, `A_${randomUUID().slice(0, 6)}`);
    const cb = await beginProbe(mb, `B_${randomUUID().slice(0, 6)}`);
    const seen: string[] = [];
    await Promise.all([
      withExecutionScope({ manifest: ma, store, gateway: gatewayFor(ma), transport: transportOps(), current: ca, deadlineAt: scopeDeadlineAt() }, async () => {
        seen.push(`A:${(requireExecutionScope().current as { leaseId: string }).leaseId}`);
      }),
      withExecutionScope({ manifest: mb, store, gateway: gatewayFor(mb), transport: transportOps(), current: cb, deadlineAt: scopeDeadlineAt() }, async () => {
        seen.push(`B:${(requireExecutionScope().current as { leaseId: string }).leaseId}`);
      }),
    ]);
    expect(seen).toHaveLength(2);
    expect(seen[0].startsWith('A:')).toBe(true);
    expect(seen[1].startsWith('B:')).toBe(true);
    // scope exited: nothing visible outside
    let outside = false;
    try { requireExecutionScope(); outside = true; } catch { /* expected */ }
    expect(outside).toBe(false);
    // nested scope throw propagates and the outer scope still works
    await withExecutionScope({ manifest: ma, store, gateway: gatewayFor(ma), transport: transportOps(), current: ca, deadlineAt: scopeDeadlineAt() }, async () => {
      await expect(withExecutionScope({ manifest: mb, store, gateway: gatewayFor(mb), transport: transportOps(), current: cb, deadlineAt: scopeDeadlineAt() }, async () => {
        throw new Error('nested boom');
      })).rejects.toThrow('nested boom');
      expect((requireExecutionScope().current as { leaseId: string }).leaseId).toBe(ca.leaseId);
    });
  });
});
