// Real scheduler -> worker execution-binding integration: the reviewed
// ChanjetReadonlySyncScheduler drives an isolated PostgreSQL18 with a REAL
// auth service whose provider HTTP goes to a local loopback fixture INSIDE
// the ambient ExecutionScope — proving the durable gateway (cumulative cap,
// DB-owned deadline, counted receipts) actually binds the worker chain.
// The runReadonlyAlignmentCycle ERP-mirror internals are stubbed at the
// service boundary; everything execution-related (scope, gateway, receipts,
// durable stop, binding persistence, terminal SUCCESS gate) is real.
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { createServer, Server } from 'node:http';
import { ChanjetSyncJobEntity } from './chanjet-sync-job.entity';
import { ChanjetReadonlySyncScheduler } from './chanjet-readonly-sync.scheduler';
import { ChanjetExecutionAdmissionStore } from './chanjet-execution-admission.store';
import { createBoundedGuardExecutor, resolveGuardClientConfig } from './chanjet-execution-guard-executor';
import { ChanjetExecutionHttpGateway } from './chanjet-execution-transport';
import { ChanjetAuthService } from './chanjet-auth.service';
import { CreateChanjetExecutionAdmissions1791878400000 } from '../../database/migrations/1791878400000-CreateChanjetExecutionAdmissions';
import { installReadonlyApprovalFixture, readonlyApprovalFixture } from './chanjet-readonly-policy.test-fixture';

const fixtureUrl = process.env.CHANJET_ADMISSION_FIXTURE_URL;
const worker = fixtureUrl ? describe : describe.skip;
if (process.env.CHANJET_EXECUTION_WORKER_REQUIRED === 'true' && !fixtureUrl) {
  throw Error('REAL_EXECUTION_WORKER_FIXTURE_URL_REQUIRED');
}

// first-sync verification scope under review: the manifest's approval must
// carry the CURRENT approved policy identity (approvalId/floorSha) and the
// policy's verification book/period/scope
const POLICY = readonlyApprovalFixture;
const VERIFY_BOOK = POLICY.verification.bookId;
const VERIFY_PERIOD = POLICY.verification.period;
const POLICY_FLOOR = POLICY.floorSha;
const POLICY_APPROVAL = POLICY.approvalId;
const OWNER = 'ROOT_OPERATOR';

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
  // disposable fixture: rebuild the schema from scratch — the admission
  // tables are trigger-guarded against TRUNCATE/DELETE, so per-test (or
  // per-iteration) isolation is a schema reset; it also gives each test an
  // empty execution space under UNIQUE(approval_id)
  async function resetSchema() {
    await ds.query('DROP SCHEMA public CASCADE');
    await ds.query('CREATE SCHEMA public');
    const runner = ds.createQueryRunner();
    try { await new CreateChanjetExecutionAdmissions1791878400000().up(runner); } finally { await runner.release(); }
    await ds.query(`CREATE TABLE chanjet_sync_jobs (
      id serial PRIMARY KEY, job_type varchar(32), book_id varchar(64), company_code varchar(64),
      period varchar(8), status varchar(16), request_scope jsonb, result_summary jsonb,
      error_message text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())`);
    // the auth service's state adapter is stubbed in this spec — the
    // sys_chanjet_state table is not needed here
  }
  beforeEach(async () => {
    restorePolicy = installReadonlyApprovalFixture();
    previousEnabled = process.env.CHANJET_READONLY_SYNC_ENABLED;
    process.env.CHANJET_READONLY_SYNC_ENABLED = 'true';
    hits = [];
    destroyNext = false;
    slowMs = 20;
    await resetSchema();
  });
  afterEach(async () => {
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
   *  exchanges one counted BUSINESS send through the durable gateway. The
   *  approval identity matches the CURRENT approved policy unless a test
   *  deliberately mismatches it; verifyMode shapes the verification block
   *  to the policy's verification (READONLY_VERIFY consistency). */
  async function registeredInSyncing(options: { cap?: number; totalTimeoutMs?: number; approvalId?: string; floorSha?: string; verifyMode?: boolean; ownerId?: string } = {}) {
    const id = randomUUID().replace(/-/g, '');
    const approvalId = options.approvalId ?? POLICY_APPROVAL;
    const floorSha = options.floorSha ?? POLICY_FLOOR;
    const bookId = VERIFY_BOOK;
    const manifest = {
      version: 1,
      executionId: `EXEC_${id.slice(0, 24)}`,
      ownerId: options.ownerId ?? OWNER,
      requestCap: options.cap ?? 10,
      totalTimeoutMs: options.totalTimeoutMs ?? 360_000,
      httpTimeoutMs: 30_000,
      approval: {
        version: 3,
        approvalId,
        floorSha,
        sourceClassification: 'PRODUCTION_DATA',
        remoteWrite: false,
        erpInbound: false,
        books: [{ bookId, companyCode: 'COMP-LAO-AGRI' }],
        scopes: ['RECEIVABLE_STATISTICS'],
        periodPolicy: 'REQUESTED_PERIOD_NO_BACKFILL',
        verification: { bookId, period: VERIFY_PERIOD, scope: ['RECEIVABLE_STATISTICS'], expiresAt: `${new Date(Date.now() + 20 * 60_000).toISOString().slice(0, 23)}Z` },
      },
    } as const;
    await store.registerFromReviewedRootManifest(manifest);
    const probeLease = `PROBE_${randomUUID().slice(0, 8)}`;
    await store.begin(manifest, 'PROBING', probeLease);
    const gateway = new ChanjetExecutionHttpGateway(store, manifest);
    const probeContext = { manifest, leaseId: probeLease, phase: 'PROBING' as const };
    await gateway.send(probeContext, 'BUSINESS', async (signal: AbortSignal) => (await fetch(`${providerBase}/accounting/gl/statistics/receive/${bookId}?period=${VERIFY_PERIOD}`, { signal })).json());
    await store.finish(probeContext, 'PROBED');
    const syncLease = `SYNC_${randomUUID().slice(0, 8)}`;
    await store.begin(manifest, 'SYNCING', syncLease);
    const admission = (await ds.query('SELECT deadline_at FROM chanjet_execution_admissions WHERE execution_id=$1', [manifest.executionId]))[0];
    return { manifest, syncLease, deadlineAt: new Date(admission.deadline_at) };
  }

  /** The real scheduler with a REAL worker exchange: the alignment cycle's
   *  provider HTTP runs inside the ambient ExecutionScope through the auth
   *  service — exactly the path the integration service's worker uses. */
  function schedulerWithWorker(manifest: unknown, cycleHooks: { afterWorkerSend?: () => Promise<void> } = {}) {
    const integration = {
      runReadonlyAlignmentCycle: async () => {
        await auth.callApi(`/accounting/gl/statistics/receive/${(manifest as { approval: { verification: { bookId: string } } }).approval.verification.bookId}`, { method: 'GET', query: { period: VERIFY_PERIOD }, kind: 'READ' });
        await cycleHooks.afterWorkerSend?.();
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
    const internal = subject as unknown as { executeSync: (...args: unknown[]) => Promise<void>; onModuleDestroy: () => Promise<void> };
    const execute = internal.executeSync.bind(subject);
    internal.executeSync = async (...args: unknown[]) => { try { await execute(...args); } finally { complete(); } };
    return { subject, done, release: () => internal.onModuleDestroy() };
  }

  const jobRows = async () => ds.query('SELECT status, request_scope, result_summary, error_message FROM chanjet_sync_jobs ORDER BY id');

  it('guard connection config: URL, host-based (TLS passthrough) and fail-closed null', () => {
    expect(resolveGuardClientConfig('postgres://u:p@127.0.0.1:5432/db')).toEqual({ connectionString: 'postgres://u:p@127.0.0.1:5432/db' });
    expect(resolveGuardClientConfig({ host: '10.0.0.8', port: 5433, username: 'phoenix', password: 'pw', database: 'phoenix', ssl: { rejectUnauthorized: true } })).toEqual({
      host: '10.0.0.8', port: 5433, user: 'phoenix', password: 'pw', database: 'phoenix', ssl: { rejectUnauthorized: true },
    });
    expect(resolveGuardClientConfig({})).toBeNull();
    expect(() => createBoundedGuardExecutor({})).toThrow('CHANJET_GUARD_CONNECTION_CONFIG_REQUIRED');
  });

  it('READONLY_VERIFY first sync: policy-consistent execution, worker shares the execution, VERIFIED with worker receipt evidence', async () => {
    process.env.CHANJET_SYNC_POLICY = 'READONLY_VERIFY';
    const { manifest, syncLease } = await registeredInSyncing({ verifyMode: true, cap: 10 });
    // the CLI's rehearsal ACK under the SYNCING lease is NOT worker evidence
    const rehearsal = new ChanjetExecutionHttpGateway(store, manifest);
    await rehearsal.send({ manifest, leaseId: syncLease, phase: 'SYNCING' }, 'BUSINESS', async (signal: AbortSignal) => (await fetch(`${providerBase}/accounting/gl/statistics/receive/${VERIFY_BOOK}`, { signal })).json());
    const before = hits.length;
    const { subject, done } = schedulerWithWorker(manifest);
    try {
      const accepted = await subject.enqueueManualSync('root', {
        scope: ['RECEIVABLE_STATISTICS'], bookId: VERIFY_BOOK, period: VERIFY_PERIOD, maxAttempts: 1,
        execution: { executionId: manifest.executionId, leaseId: syncLease },
      }, { authPrincipal: OWNER });
      expect(accepted.accepted).toBe(true);
      await done;
      const [job] = await jobRows();
      expect(job.status).toBe('SUCCESS');
      expect(job.request_scope.execution).toMatchObject({
        executionId: manifest.executionId, leaseId: syncLease, phase: 'SYNCING',
        approvalId: POLICY_APPROVAL, floorSha: POLICY_FLOOR,
      });
      // ONLY this run's worker exchange counts: the rehearsal ACK is excluded
      expect(job.result_summary.executionSends).toBe(1);
      expect(job.result_summary.erpInbound).toMatchObject({ enabled: false, applied: false });
      expect(job.result_summary.externalWriteEnabled).toBe(false);
      // cumulative counting across phases: probe (1) + rehearsal (1) + worker (2)
      const [admission] = await ds.query('SELECT phase, request_count FROM chanjet_execution_admissions WHERE execution_id=$1', [manifest.executionId]);
      expect(admission.request_count).toBe(4);
      // the SUCCESS commit VERIFIED the admission inside the gate transaction
      expect(admission.phase).toBe('VERIFIED');
      expect(hits.length - before).toBe(2); // worker token + worker business
    } finally { await subject.onModuleDestroy(); }
  });

  it('READONLY_VERIFY without an execution refuses with zero HTTP and no job row', async () => {
    process.env.CHANJET_SYNC_POLICY = 'READONLY_VERIFY';
    const { subject } = schedulerWithWorker({});
    const accepted = await subject.enqueueManualSync('root', {
      scope: ['RECEIVABLE_STATISTICS'], bookId: VERIFY_BOOK, period: VERIFY_PERIOD, maxAttempts: 1,
    }, { authPrincipal: OWNER });
    expect(accepted.accepted).toBe(false);
    expect(accepted.reason).toBe('SYNC_EXECUTION_REQUIRED');
    expect((await jobRows()).length).toBe(0);
    expect(hits.length).toBe(0);
    await subject.onModuleDestroy();
  });

  it('READONLY_VERIFY binding mismatches refuse: cross-approval, cross-floor, wrong owner', async () => {
    process.env.CHANJET_SYNC_POLICY = 'READONLY_VERIFY';
    for (const [label, registration, authPrincipal] of [
      ['cross-approval', { approvalId: 'APPROVAL_OTHER_POLICY' }, OWNER],
      ['cross-floor', { floorSha: 'b'.repeat(40) }, OWNER],
      ['wrong owner', {}, 'SOMEONE_ELSE'],
    ] as Array<[string, { approvalId?: string; floorSha?: string }, string]>) {
      await resetSchema(); // UNIQUE(approval_id): each iteration needs its own execution space
      const { manifest, syncLease } = await registeredInSyncing({ verifyMode: true, ...registration });
      const before = hits.length;
      const { subject } = schedulerWithWorker(manifest);
      try {
        const accepted = await subject.enqueueManualSync('root', {
          scope: ['RECEIVABLE_STATISTICS'], bookId: VERIFY_BOOK, period: VERIFY_PERIOD, maxAttempts: 1,
          execution: { executionId: manifest.executionId, leaseId: syncLease },
        }, { authPrincipal });
        const mismatch = (condition: boolean, what: string): void => { if (!condition) throw Error(`${label}: ${what}`); };
        mismatch(accepted.accepted === false, 'accepted');
        mismatch(accepted.reason === 'SYNC_EXECUTION_CONTEXT', 'reason');
        mismatch((await jobRows()).length === 0, 'job row');
        mismatch(hits.length - before === 0, 'http');
      } finally { await subject.onModuleDestroy(); }
    }
  });

  it('cumulative cap refusal: the worker send is refused before any HTTP and the execution durably holds', async () => {
    const { manifest, syncLease } = await registeredInSyncing({ cap: 1 }); // the probe already consumed 1/1
    const before = hits.length;
    const { subject, done } = schedulerWithWorker(manifest);
    const accepted = await subject.enqueueManualSync('root', {
      scope: ['RECEIVABLE_STATISTICS'], bookId: VERIFY_BOOK, period: VERIFY_PERIOD, maxAttempts: 1,
      execution: { executionId: manifest.executionId, leaseId: syncLease },
    }, { authPrincipal: OWNER });
    expect(accepted.accepted).toBe(true);
    await done;
    // the worker's reserve hit the CAP before any HTTP: zero new provider hits
    expect(hits.length - before).toBe(0);
    const [job] = await jobRows();
    expect(job.status).toBe('FAIL');
    expect(job.result_summary?.state).toBe('HOLD');
    const [admission] = await ds.query('SELECT phase, hold_reason, request_count FROM chanjet_execution_admissions WHERE execution_id=$1', [manifest.executionId]);
    expect(admission.phase).toBe('HOLD');
    expect(admission.hold_reason).toBe('CAP');
    expect(admission.request_count).toBe(1); // no overdue reservation
    await subject.onModuleDestroy();
  });

  it('execution deadline: the worker send is cancelled, the stop is durable and no late success exists', async () => {
    const { manifest, syncLease } = await registeredInSyncing({ cap: 10, totalTimeoutMs: 1_500 }); // 1.5s DB-owned deadline
    slowMs = 4_000; // the worker's business exchange outlives the deadline
    const { subject, done } = schedulerWithWorker(manifest);
    const started = Date.now();
    const accepted = await subject.enqueueManualSync('root', {
      scope: ['RECEIVABLE_STATISTICS'], bookId: VERIFY_BOOK, period: VERIFY_PERIOD, maxAttempts: 1,
      execution: { executionId: manifest.executionId, leaseId: syncLease },
    }, { authPrincipal: OWNER });
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
    await subject.onModuleDestroy();
  });

  it('a HOLD after the last ACK blocks the SUCCESS commit', async () => {
    const { manifest, syncLease, deadlineAt } = await registeredInSyncing({ cap: 10, verifyMode: true });
    const { subject, done } = schedulerWithWorker(manifest, {
      afterWorkerSend: async () => {
        // the execution is durably stopped AFTER the worker's last ACK but
        // BEFORE the cycle returns and SUCCESS is committed
        await store.holdExecution({ manifest, leaseId: syncLease, phase: 'SYNCING', deadlineAt }, 'CANCELLED');
      },
    });
    const accepted = await subject.enqueueManualSync('root', {
      scope: ['RECEIVABLE_STATISTICS'], bookId: VERIFY_BOOK, period: VERIFY_PERIOD, maxAttempts: 1,
      execution: { executionId: manifest.executionId, leaseId: syncLease },
    }, { authPrincipal: OWNER });
    expect(accepted.accepted).toBe(true);
    await done;
    // the SUCCESS terminal write was refused by the transactional gate: the
    // mirror writes happened but the run can never report SUCCESS
    const [job] = await jobRows();
    expect(job.status).toBe('FAIL');
    expect(job.result_summary?.state).toBe('HOLD');
    expect(job.result_summary?.decision).toBe('HOLD');
    const [admission] = await ds.query('SELECT phase, hold_reason FROM chanjet_execution_admissions WHERE execution_id=$1', [manifest.executionId]);
    expect(admission.phase).toBe('HOLD');
    expect(admission.hold_reason).toBe('CANCELLED');
    await subject.onModuleDestroy();
  });

  it('forged execution context is refused: wrong lease, unknown id, no job row, zero HTTP', async () => {
    const { manifest, syncLease, deadlineAt } = await registeredInSyncing({ cap: 10, verifyMode: true });
    const jobsBefore = (await jobRows()).length;
    for (const execution of [
      { executionId: manifest.executionId, leaseId: 'FORGED_LEASE_1' }, // right id, wrong lease
      { executionId: 'EXEC_DOES_NOT_EXIST', leaseId: syncLease }, // unknown id
    ]) {
      const before2 = hits.length;
      // a refused context never dispatches a worker run: no job row, no HTTP
      const { subject } = schedulerWithWorker(manifest);
      const accepted = await subject.enqueueManualSync('root', {
        scope: ['RECEIVABLE_STATISTICS'], bookId: VERIFY_BOOK, period: VERIFY_PERIOD, maxAttempts: 1, execution,
      }, { authPrincipal: OWNER });
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
    const ok = await gateway.send({ manifest, leaseId: syncLease, phase: 'SYNCING', deadlineAt }, 'BUSINESS', async (signal: AbortSignal) => (await fetch(`${providerBase}/accounting/gl/statistics/receive/${VERIFY_BOOK}`, { signal })).json());
    expect(ok.outcome).toBe('OK');
  });

  it('guard executor release: teardown disposes support idempotently', async () => {
    const { manifest, syncLease } = await registeredInSyncing({ cap: 10, verifyMode: true });
    const { subject, done } = schedulerWithWorker(manifest);
    const accepted = await subject.enqueueManualSync('root', {
      scope: ['RECEIVABLE_STATISTICS'], bookId: VERIFY_BOOK, period: VERIFY_PERIOD, maxAttempts: 1,
      execution: { executionId: manifest.executionId, leaseId: syncLease },
    }, { authPrincipal: OWNER });
    expect(accepted.accepted).toBe(true);
    await done;
    // the scheduler's guard client connected during the run (the durable stop
    // capability was live); onModuleDestroy must tear the support down
    const internal = subject as unknown as { executionSupportSingleton: unknown };
    expect(internal.executionSupportSingleton).not.toBeNull();
    await subject.onModuleDestroy();
    expect(internal.executionSupportSingleton ?? null).toBeNull();
    await subject.onModuleDestroy(); // idempotent teardown
    // the SUCCESS gate committed VERIFIED inside its transaction (the
    // reviewed finish transition: phase VERIFIED, lease cleared)
    const [admission] = await ds.query('SELECT phase, lease_id FROM chanjet_execution_admissions WHERE execution_id=$1', [manifest.executionId]);
    expect(admission.phase).toBe('VERIFIED');
    expect(admission.lease_id).toBe('');
  });
});
