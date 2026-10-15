// Real scheduler -> worker execution-binding integration: the reviewed
// ChanjetReadonlySyncScheduler drives an isolated PostgreSQL18 with a REAL
// auth service whose provider HTTP goes to a local loopback fixture INSIDE
// the ambient ExecutionScope — proving the durable gateway (cumulative cap,
// DB-owned deadline, counted receipts) actually binds the worker chain.
// The runReadonlyAlignmentCycle ERP-mirror internals are stubbed at the
// service boundary; everything execution-related (scope, gateway, receipts,
// durable stop, binding persistence) is real.
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { createServer, Server } from 'node:http';
import { ChanjetSyncJobEntity } from './chanjet-sync-job.entity';
import { ChanjetReadonlySyncScheduler } from './chanjet-readonly-sync.scheduler';
import { ChanjetExecutionAdmissionStore } from './chanjet-execution-admission.store';
import { createBoundedGuardExecutor } from './chanjet-execution-guard-executor';
import { ChanjetExecutionHttpGateway } from './chanjet-execution-transport';
import { ChanjetAuthService } from './chanjet-auth.service';
import { CreateChanjetExecutionAdmissions1791878400000 } from '../../database/migrations/1791878400000-CreateChanjetExecutionAdmissions';
import { installReadonlyApprovalFixture } from './chanjet-readonly-policy.test-fixture';

const fixtureUrl = process.env.CHANJET_ADMISSION_FIXTURE_URL;
const worker = fixtureUrl ? describe : describe.skip;
if (process.env.CHANJET_EXECUTION_WORKER_REQUIRED === 'true' && !fixtureUrl) {
  throw Error('REAL_EXECUTION_WORKER_FIXTURE_URL_REQUIRED');
}

const BOOK = '3533914511118750';
const PERIOD = '202610';

worker('execution-bound scheduler worker (real PostgreSQL18, real auth, local provider)', () => {
  let ds: DataSource;
  let store: ChanjetExecutionAdmissionStore;
  let guardExecutor: ReturnType<typeof createBoundedGuardExecutor>;
  let auth: ChanjetAuthService;
  let provider: Server;
  let providerBase = '';
  let hits: string[] = [];
  let destroyNext = false;
  let slowMs = 20;
  let restorePolicy: (() => void) | undefined;
  let previousEnabled: string | undefined;

  const tokenSeq = { n: 0 };
  beforeAll(async () => {
    const url = new URL(fixtureUrl!);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !/^\/(root_admission_review|chanjet_admission_fixture)$/.test(url.pathname)) {
      throw Error('Only the isolated loopback fixture database is permitted');
    }
    ds = new DataSource({ type: 'postgres', url: fixtureUrl, entities: [ChanjetSyncJobEntity], logging: false });
    await ds.initialize();
    await ds.query('DROP SCHEMA public CASCADE');
    await ds.query('CREATE SCHEMA public');
    const runner = ds.createQueryRunner();
    try { await new CreateChanjetExecutionAdmissions1791878400000().up(runner); } finally { await runner.release(); }
    await ds.query(`CREATE TABLE chanjet_sync_jobs (
      id serial PRIMARY KEY, job_type varchar(32), book_id varchar(64), company_code varchar(64),
      period varchar(8), status varchar(16), request_scope jsonb, result_summary jsonb,
      error_message text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())`);
    store = new ChanjetExecutionAdmissionStore(ds.manager);
    guardExecutor = createBoundedGuardExecutor(fixtureUrl!);
    store.setStandaloneExecutor(guardExecutor);
    provider = createServer((req, res) => {
      hits.push(req.url || '');
      if (destroyNext) { req.socket.destroy(); return; }
      res.setHeader('Content-Type', 'application/json');
      if ((req.url || '').includes('generateToken')) {
        res.end(JSON.stringify({ value: { accessToken: `SYNTHETIC_TOKEN_${++tokenSeq.n}`, expiresIn: 7200 } }));
        return;
      }
      setTimeout(() => { if (!res.writableEnded) res.end(JSON.stringify({ code: '200', value: [{ synthetic: true }] })); }, slowMs);
    });
    await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve));
    providerBase = `http://127.0.0.1:${(provider.address() as { port: number }).port}`;
    // hard requirement: the worker's provider traffic is bound to the LOCAL
    // fixture — the real provider endpoint must never be contacted
    process.env.CHANJET_PROVIDER_BASE_URL = providerBase;
    auth = new ChanjetAuthService(
      { get: (key: string, fallback?: string) => process.env[key] ?? fallback } as never,
      { findOneBy: async () => ({ key: 'singleton', appTicket: 'SYNTHETIC_TICKET', certificate: null, tokens: null }), save: async (e: unknown) => e } as never,
      { ok: async () => {}, fail: async () => {} } as never,
    );
    Object.assign(auth, { appKey: 'SYNTHETIC_KEY', appSecret: 'SYNTHETIC_SECRET', orgId: 'SYNTHETIC_ORG', cert: 'SYNTHETIC_CERT', appTicket: 'SYNTHETIC_TICKET' });
  });
  beforeEach(async () => {
    restorePolicy = installReadonlyApprovalFixture();
    previousEnabled = process.env.CHANJET_READONLY_SYNC_ENABLED;
    process.env.CHANJET_READONLY_SYNC_ENABLED = 'true';
    hits = [];
    destroyNext = false;
    slowMs = 20;
    await ds.query('TRUNCATE chanjet_sync_jobs');
  });
  afterEach(() => {
    restorePolicy?.();
    if (previousEnabled === undefined) delete process.env.CHANJET_READONLY_SYNC_ENABLED;
    else process.env.CHANJET_READONLY_SYNC_ENABLED = previousEnabled;
  });
  afterAll(async () => {
    delete process.env.CHANJET_PROVIDER_BASE_URL;
    // release the guard's dedicated connection: its lazily-connected client
    // would otherwise keep the jest process alive after the suite
    await guardExecutor?.dispose().catch(() => undefined);
    // the fixture's fetch-side agent keeps keep-alive sockets open; close()
    // alone would wait on them and keep the jest process alive
    provider?.closeAllConnections();
    provider?.close();
    if (ds?.isInitialized) await ds.destroy();
  });

  /** A registered execution driven to the SYNCING phase: the probe phase
   *  exchanges one counted TOKEN + one counted BUSINESS send through the
   *  same durable gateway the worker is about to share. */
  async function registeredInSyncing(cap = 10, totalTimeoutMs = 360_000) {
    const id = randomUUID().replace(/-/g, '');
    const manifest = {
      version: 1,
      executionId: `EXEC_${id.slice(0, 24)}`,
      ownerId: 'ROOT_OPERATOR',
      requestCap: cap,
      totalTimeoutMs,
      httpTimeoutMs: 30_000,
      approval: {
        version: 3,
        approvalId: `APPROVAL_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
        floorSha: 'f'.repeat(40),
        sourceClassification: 'PRODUCTION_DATA',
        remoteWrite: false,
        erpInbound: false,
        books: [{ bookId: BOOK, companyCode: 'COMP-LAO-AGRI' }],
        scopes: ['RECEIVABLE_STATISTICS'],
        periodPolicy: 'REQUESTED_PERIOD_NO_BACKFILL',
        verification: { bookId: BOOK, period: PERIOD, scope: ['RECEIVABLE_STATISTICS'], expiresAt: `${new Date(Date.now() + 20 * 60_000).toISOString().slice(0, 23)}Z` },
      },
    } as const;
    await store.registerFromReviewedRootManifest(manifest);
    const probeLease = `PROBE_${randomUUID().slice(0, 8)}`;
    await store.begin(manifest, 'PROBING', probeLease);
    const gateway = new ChanjetExecutionHttpGateway(store, manifest);
    const probeContext = { manifest, leaseId: probeLease, phase: 'PROBING' as const };
    await gateway.send(probeContext, 'BUSINESS', async (signal: AbortSignal) => (await fetch(`${providerBase}/accounting/gl/statistics/receive/${BOOK}?period=${PERIOD}`, { signal })).json());
    await store.finish(probeContext, 'PROBED');
    const syncLease = `SYNC_${randomUUID().slice(0, 8)}`;
    await store.begin(manifest, 'SYNCING', syncLease);
    return { manifest, syncLease, gateway };
  }

  /** The real scheduler with a REAL worker exchange: the alignment cycle's
   *  provider HTTP runs inside the ambient ExecutionScope through the auth
   *  service — exactly the path the integration service's worker uses. */
  function schedulerWithWorker(manifest: unknown) {
    const integration = {
      runReadonlyAlignmentCycle: async () => {
        await auth.callApi(`/accounting/gl/statistics/receive/${(manifest as { approval: { verification: { bookId: string } } }).approval.verification.bookId}`, { method: 'GET', query: { period: PERIOD }, kind: 'READ' });
        return {
          decision: 'GO',
          mirror: { results: [{ key: 'RECEIVABLE_STATISTICS' }], attempts: 1, unresolvedFailures: [] },
          exactMappings: null,
          reconciliation: { created: 0, autoResolved: 0 },
          readiness: null,
        };
      },
    };
    const subject = new ChanjetReadonlySyncScheduler(integration as never, { ok: async () => {}, fail: async () => {} } as never, ds, {} as never);
    let complete!: () => void;
    const done = new Promise<void>((resolve) => { complete = resolve; });
    const internal = subject as unknown as { executeSync: (...args: unknown[]) => Promise<void> };
    const execute = internal.executeSync.bind(subject);
    internal.executeSync = async (...args: unknown[]) => { try { await execute(...args); } finally { complete(); } };
    return { subject, done };
  }

  const jobRows = async () => ds.query('SELECT status, request_scope, result_summary, error_message FROM chanjet_sync_jobs ORDER BY id');

  it('worker provider HTTP shares the execution: cumulative cap across phases, binding persisted, worker receipts recorded', async () => {
    const { manifest, syncLease } = await registeredInSyncing(10);
    const before = hits.length;
    const { subject, done } = schedulerWithWorker(manifest);
    const accepted = await subject.enqueueManualSync('root', {
      scope: ['RECEIVABLE_STATISTICS'], bookId: BOOK, period: PERIOD, maxAttempts: 1,
      execution: { executionId: manifest.executionId, leaseId: syncLease },
    });
    expect(accepted.accepted).toBe(true);
    await done;
    const [job] = await jobRows();
    expect(job.status).toBe('SUCCESS');
    // the binding persisted into the durable job row is read back FROM the
    // admission row (approval/floor/deadline), never client-claimed
    expect(job.request_scope.execution).toMatchObject({
      executionId: manifest.executionId,
      leaseId: syncLease,
      phase: 'SYNCING',
      approvalId: manifest.approval.approvalId,
      floorSha: manifest.approval.floorSha,
    });
    expect(typeof job.request_scope.execution.deadlineAt).toBe('string');
    // worker send evidence: the REAL exchanges this worker made under the
    // SYNCING lease, cross-checkable against the counted receipts
    expect(job.result_summary.executionSends).toBe(1);
    expect(job.result_summary.erpInbound).toMatchObject({ enabled: false, applied: false });
    expect(job.result_summary.externalWriteEnabled).toBe(false);
    // cumulative counting across phases: the probe's counted BUSINESS send
    // (1) plus the worker's counted TOKEN + BUSINESS sends (2)
    const [admission] = await ds.query('SELECT phase, request_count FROM chanjet_execution_admissions WHERE execution_id=$1', [manifest.executionId]);
    expect(admission.request_count).toBe(3);
    expect(admission.phase).toBe('SYNCING');
    const receipts = await ds.query('SELECT phase, kind, status, result FROM chanjet_execution_requests WHERE execution_id=$1 ORDER BY ordinal', [manifest.executionId]);
    expect(receipts.map((r: { phase: string; kind: string; result: string }) => `${r.phase}/${r.kind}/${r.result}`)).toEqual([
      'PROBING/BUSINESS/OK', 'SYNCING/TOKEN/OK', 'SYNCING/BUSINESS/OK',
    ]);
    // worker: 1 token + 1 business through the shared auth service (the
    // snapshot was taken after the probe's own business HTTP)
    expect(hits.length - before).toBe(2);
  });

  it('cumulative cap refusal: the worker send is refused before any HTTP and the execution durably holds', async () => {
    const { manifest, syncLease } = await registeredInSyncing(1); // the probe already consumed 1/1
    const before = hits.length;
    const { subject, done } = schedulerWithWorker(manifest);
    const accepted = await subject.enqueueManualSync('root', {
      scope: ['RECEIVABLE_STATISTICS'], bookId: BOOK, period: PERIOD, maxAttempts: 1,
      execution: { executionId: manifest.executionId, leaseId: syncLease },
    });
    expect(accepted.accepted).toBe(true);
    await done;
    // the worker's reserve hit the CAP before any HTTP: zero new provider hits
    expect(hits.length - before).toBe(0);
    void syncLease;
    const [job] = await jobRows();
    expect(job.status).toBe('FAIL');
    expect(job.result_summary?.state).toBe('HOLD');
    const [admission] = await ds.query('SELECT phase, hold_reason, request_count FROM chanjet_execution_admissions WHERE execution_id=$1', [manifest.executionId]);
    expect(admission.phase).toBe('HOLD');
    expect(admission.hold_reason).toBe('CAP');
    expect(admission.request_count).toBe(1); // no overdue reservation
  });

  it('execution deadline: the worker send is cancelled, the stop is durable and no late success exists', async () => {
    const { manifest, syncLease } = await registeredInSyncing(10, 1_500); // 1.5s DB-owned deadline
    slowMs = 4_000; // the worker's business exchange outlives the deadline
    const { subject, done } = schedulerWithWorker(manifest);
    const started = Date.now();
    const accepted = await subject.enqueueManualSync('root', {
      scope: ['RECEIVABLE_STATISTICS'], bookId: BOOK, period: PERIOD, maxAttempts: 1,
      execution: { executionId: manifest.executionId, leaseId: syncLease },
    });
    expect(accepted.accepted).toBe(true);
    await done;
    expect(Date.now() - started).toBeLessThan(10_000);
    const [job] = await jobRows();
    expect(job.status).toBe('FAIL');
    expect(job.result_summary?.state).toBe('HOLD');
    const [admission] = await ds.query('SELECT phase, hold_reason FROM chanjet_execution_admissions WHERE execution_id=$1', [manifest.executionId]);
    expect(admission.phase).toBe('HOLD');
    expect(admission.hold_reason).toBe('DEADLINE');
    // the durable stop blocks a brand-new gateway on a brand-new connection
    // with zero further HTTP
    const before = hits.length;
    const fresh = new ChanjetExecutionHttpGateway(new ChanjetExecutionAdmissionStore(ds.manager), manifest);
    await expect(fresh.send({ manifest, leaseId: syncLease, phase: 'SYNCING' }, 'BUSINESS', async () => ({}) as Record<string, unknown>)).rejects.toThrow('CHANJET_ADMISSION_HOLD');
    expect(hits.length - before).toBe(0);
    // no late success: the aborted exchange never produced an OK receipt
    const okReceipts = await ds.query("SELECT count(*)::int AS n FROM chanjet_execution_requests WHERE execution_id=$1 AND phase='SYNCING' AND kind='BUSINESS' AND result='OK'", [manifest.executionId]);
    expect(okReceipts[0].n).toBe(0);
  });

  it('forged execution context is refused: wrong lease, unknown id, no job row, zero HTTP', async () => {
    const { manifest, syncLease } = await registeredInSyncing(10);
    const jobsBefore = (await jobRows()).length;
    const before = hits.length;
    for (const execution of [
      { executionId: manifest.executionId, leaseId: 'FORGED_LEASE_1' }, // right id, wrong lease
      { executionId: 'EXEC_DOES_NOT_EXIST', leaseId: syncLease }, // unknown id
    ]) {
      const before2 = hits.length;
      // a refused context never dispatches a worker run: no job row, no HTTP
      const { subject } = schedulerWithWorker(manifest);
      const accepted = await subject.enqueueManualSync('root', {
        scope: ['RECEIVABLE_STATISTICS'], bookId: BOOK, period: PERIOD, maxAttempts: 1, execution,
      });
      expect(accepted.accepted).toBe(false);
      expect(accepted.reason).toBe('SYNC_EXECUTION_CONTEXT');
      expect(hits.length - before2).toBe(0);
    }
    // the execution itself is untouched by the forged attempts: still live
    // SYNCING under its own lease, and its gateway still works
    const [forged] = await ds.query('SELECT phase, hold_reason, lease_id FROM chanjet_execution_admissions WHERE execution_id=$1', [manifest.executionId]);
    expect(forged.phase).toBe('SYNCING');
    expect(forged.lease_id).toBe(syncLease);
    expect(forged.hold_reason).toBe('');
    const gateway = new ChanjetExecutionHttpGateway(new ChanjetExecutionAdmissionStore(ds.manager), manifest);
    const ok = await gateway.send({ manifest, leaseId: syncLease, phase: 'SYNCING' }, 'BUSINESS', async (signal: AbortSignal) => (await fetch(`${providerBase}/accounting/gl/statistics/receive/${BOOK}`, { signal })).json());
    expect(ok.outcome).toBe('OK');
    expect((await jobRows()).length).toBe(jobsBefore);
    // the execution itself is untouched: still live SYNCING under its lease
    const [admission] = await ds.query('SELECT phase, hold_reason, lease_id FROM chanjet_execution_admissions WHERE execution_id=$1', [manifest.executionId]);
    expect(admission.phase).toBe('SYNCING');
    expect(admission.lease_id).toBe(syncLease);
    expect(admission.hold_reason).toBe('');
  });
});
