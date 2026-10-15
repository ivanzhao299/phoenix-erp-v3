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
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChanjetSyncJobEntity } from './chanjet-sync-job.entity';
import { ChanjetMasterMappingEntity } from './chanjet-master-mapping.entity';
import { ChanjetReconciliationResultEntity } from './chanjet-reconciliation-result.entity';
import { ChanjetAccountBookEntity } from './chanjet-account-book.entity';
import { ChanjetApiFieldCatalogEntity } from './chanjet-api-field-catalog.entity';
import { ChanjetBookCompanyMapEntity } from './chanjet-book-company-map.entity';
import { ChanjetVoucherDraftEntity } from './chanjet-voucher-draft.entity';
import { ChanjetReadSnapshotEntity } from './chanjet-read-snapshot.entity';
import { ChanjetEntitySnapshotEntity } from './chanjet-entity-snapshot.entity';
import { ChanjetErpFieldMappingEntity } from './chanjet-erp-field-mapping.entity';
import { ChanjetWritebackOutboxEntity } from './chanjet-writeback-outbox.entity';
import { ChanjetReadonlySyncScheduler } from './chanjet-readonly-sync.scheduler';
import { ChanjetExecutionAdmissionStore } from './chanjet-execution-admission.store';
import { createBoundedGuardExecutor, resolveGuardClientConfig } from './chanjet-execution-guard-executor';
import { ChanjetExecutionHttpGateway } from './chanjet-execution-transport';
import { ChanjetAuthService } from './chanjet-auth.service';
import { ChanjetIntegrationService } from './chanjet-integration.service';
import { executionWriteGate, withExecutionScope } from './chanjet-execution-scope';
import * as scopeModule from './chanjet-execution-scope';
import { CreateChanjetExecutionAdmissions1791878400000 } from '../../database/migrations/1791878400000-CreateChanjetExecutionAdmissions';
import { installReadonlyApprovalFixture, readonlyApprovalFixture } from './chanjet-readonly-policy.test-fixture';
import { ChanjetReadonlyLockLease } from './chanjet-readonly-lock-lease';
import { startPgSuspendProxy } from './chanjet-pg-suspend-proxy';

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
  let schedulerSubject: ChanjetReadonlySyncScheduler;
  let auth: ChanjetAuthService;
  let provider: Server;
  let providerBase = '';
  let hits: string[] = [];
  let destroyNext = false;
  let slowMs = 20;
  let restorePolicy: (() => void) | undefined;
  let previousEnabled: string | undefined;
  let tmpDir = '';
  const workDir = (): string => {
    if (!tmpDir) { tmpDir = mkdtempSync(join(tmpdir(), 'worker-combined-')); writeFileSync(join(tmpDir, 'mutation.lock'), ''); }
    return tmpDir;
  };
  const lockFile = (): string => join(workDir(), 'mutation.lock');

  /** Policy-consistent synthetic manifest for the combined CLI+scheduler run:
   *  the approval identity matches the CURRENT approved policy and the
   *  verification matches its book/period/scope (synthetic expiry). */
  function syntheticWorkerManifest() {
    const id = randomUUID().replace(/-/g, '');
    return {
      version: 1,
      executionId: `EXEC_${id.slice(0, 24)}`,
      ownerId: OWNER,
      requestCap: 10,
      totalTimeoutMs: 360_000,
      httpTimeoutMs: 30_000,
      approval: {
        version: 3,
        approvalId: POLICY_APPROVAL,
        floorSha: POLICY_FLOOR,
        sourceClassification: 'PRODUCTION_DATA',
        remoteWrite: false,
        erpInbound: false,
        books: [{ bookId: VERIFY_BOOK, companyCode: 'COMP-LAO-AGRI' }],
        scopes: ['RECEIVABLE_STATISTICS'],
        periodPolicy: 'REQUESTED_PERIOD_NO_BACKFILL',
        verification: { bookId: VERIFY_BOOK, period: VERIFY_PERIOD, scope: ['RECEIVABLE_STATISTICS'], expiresAt: `${new Date(Date.now() + 20 * 60_000).toISOString().slice(0, 23)}Z` },
      },
    } as const;
  }

  const tokenSeq = { n: 0 };
  beforeAll(async () => {
    const url = new URL(fixtureUrl!);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !/^\/(root_admission_review|chanjet_admission_fixture)$/.test(url.pathname)) {
      throw Error('Only the isolated loopback fixture database is permitted');
    }
    ds = new DataSource({ type: 'postgres', url: fixtureUrl, entities: [ChanjetSyncJobEntity, ChanjetMasterMappingEntity, ChanjetReconciliationResultEntity], logging: false });
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
    await ds.query(`CREATE TABLE chanjet_master_mapping (
      id bigserial PRIMARY KEY, mapping_type varchar(40), book_id varchar(64) DEFAULT '',
      erp_code varchar(128) DEFAULT '', erp_name varchar(256) DEFAULT '', erp_entity_type varchar(32) DEFAULT '',
      chanjet_id varchar(128) DEFAULT '', chanjet_code varchar(128) DEFAULT '', chanjet_name varchar(256) DEFAULT '',
      match_status varchar(32) DEFAULT 'PENDING', confidence numeric(5,2) DEFAULT 0,
      review_status varchar(32) DEFAULT 'PENDING', reviewed_by varchar(128), reviewed_at timestamptz,
      raw_data jsonb, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())`);
    await ds.query(`CREATE TABLE chanjet_reconciliation_results (
      id bigserial PRIMARY KEY, reconciliation_type varchar(64), company_code varchar(64) DEFAULT '',
      book_id varchar(64) DEFAULT '', period varchar(16) DEFAULT '', status varchar(32) DEFAULT 'WARN',
      severity varchar(32) DEFAULT 'MEDIUM', subject_type varchar(64) DEFAULT '', subject_key varchar(128) DEFAULT '',
      subject_name varchar(256) DEFAULT '', erp_value jsonb, chanjet_value jsonb, diff_summary text DEFAULT '',
      action_required text DEFAULT '', resolved boolean DEFAULT false, resolved_by varchar(128), resolved_at timestamptz,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())`);
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
        // eslint-disable-next-line no-console
        console.log('STUB_ENTERED');
        await auth.callApi(`/accounting/gl/statistics/receive/${(manifest as { approval: { verification: { bookId: string } } }).approval.verification.bookId}`, { method: 'GET', query: { period: VERIFY_PERIOD }, kind: 'READ' });
        // eslint-disable-next-line no-console
        console.log('STUB_SENT');
        await cycleHooks.afterWorkerSend?.();
        // eslint-disable-next-line no-console
        console.log('STUB_HOOK_DONE');
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
        const outcome = await store.holdExecution({ manifest, leaseId: syncLease, phase: 'SYNCING', deadlineAt }, 'CANCELLED').then((r) => String(r), (e: Error) => `THREW:${e.message}`);
        try { writeFileSync('/tmp/hold-diag.txt', `hook outcome=${outcome}\n`); } catch { /* diag only */ }
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

  /** Sibling long-lived child: resolves with the port it prints and a kill
   *  handle (sibling-owned listeners are reachable from orchestrator
   *  children; parent-owned listeners are not). */
  function spawnSibling(execPath: string, args: string[], options: { env?: Record<string, string | undefined> }) {
    const child = spawn(execPath, args, { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, ...options.env } });
    return new Promise<{ child: import('node:child_process').ChildProcess; base: string; kill: () => Promise<void> }>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('SIBLING_HOST_START_TIMEOUT')), 15_000);
      child.stdout!.on('data', function onData(d: Buffer) {
        const port = String(d).match(/PORT (\d+)/)?.[1];
        if (!port) return;
        clearTimeout(timer);
        child.stdout!.off('data', onData);
        resolve({
          child,
          base: `http://127.0.0.1:${port}`,
          kill: () => { child.kill(); return new Promise<void>((done2) => { child.on('exit', () => done2()); }); },
        });
      });
      child.on('exit', (code: number | null) => { clearTimeout(timer); reject(Error(`SIBLING_HOST_EXITED:${code}`)); });
    });
  }

  it('mirror-write boundary gate: after a durable HOLD the real reconciliation/repo writes refuse and the run lands FAIL', async () => {
    const { manifest, syncLease, deadlineAt } = await registeredInSyncing({ cap: 10, verifyMode: true });
    const repo = ds.getRepository(ChanjetSyncJobEntity);
    // the hook holds the execution right after the worker's last ACK and
    // then attempts a REAL repository write through the boundary gate: the
    // gate refuses before the write reaches the table
    const { subject, done } = schedulerWithWorker(manifest, {
      afterWorkerSend: async () => {
        await store.holdExecution({ manifest, leaseId: syncLease, phase: 'SYNCING', deadlineAt }, 'CANCELLED');
        const current = { manifest, leaseId: syncLease, phase: 'SYNCING' as const, deadlineAt };
        await expect(scopeModule.withExecutionScope(
          { manifest, store, gateway: new ChanjetExecutionHttpGateway(store, manifest), transport: { resend: async () => { throw new Error('FORBIDDEN'); } }, deadlineAt, current },
          async () => {
            await executionWriteGate(); // mirror/reconciliation write boundary
            await repo.save(repo.create({ jobType: 'SNAPSHOT', bookId: VERIFY_BOOK, status: 'RUNNING' }));
          },
        )).rejects.toThrow('CHANJET_ADMISSION_HOLD');
        // zero writes landed past the gate
        expect((await jobRows()).length).toBe(0);
      },
    });
    const accepted = await subject.enqueueManualSync('root', {
      scope: ['RECEIVABLE_STATISTICS'], bookId: VERIFY_BOOK, period: VERIFY_PERIOD, maxAttempts: 1,
      execution: { executionId: manifest.executionId, leaseId: syncLease },
    }, { authPrincipal: OWNER });
    expect(accepted.accepted).toBe(true);
    await done;
    // the reconciliation phase hit the same gate on the held execution: the
    // cycle failed and the run can never report SUCCESS
    const [job] = await jobRows();
    expect(job.status).toBe('FAIL');
    expect(job.result_summary?.state).toBe('HOLD');
    const [admission] = await ds.query('SELECT phase, hold_reason FROM chanjet_execution_admissions WHERE execution_id=$1', [manifest.executionId]);
    expect(admission.phase).toBe('HOLD');
    expect(admission.hold_reason).toBe('CANCELLED');
    // the worker's own ACK receipt is preserved evidence; the mirror/reconcile
    // writes after the HOLD are zero
    const receipts = await ds.query('SELECT phase, kind, status, result FROM chanjet_execution_requests WHERE execution_id=$1', [manifest.executionId]);
    expect(receipts.some((r: { phase: string; kind: string; status: string; result: string }) => r.phase === 'SYNCING' && r.kind === 'BUSINESS' && r.status === 'ACKNOWLEDGED' && r.result === 'OK')).toBe(true);
    await subject.onModuleDestroy();
  });

  it('combined real CLI + real scheduler: full chain to VERIFIED through the protected-API contract', async () => {
    const manifest = syntheticWorkerManifest();
    const combinedHits = join(workDir(), `combined-hits-${randomUUID().slice(0, 8)}.jsonl`);
    const floorFile = join(workDir(), `floor-${randomUUID().slice(0, 8)}.json`);
    const manifestFile = join(workDir(), `manifest-${randomUUID().slice(0, 8)}.json`);
    writeFileSync(floorFile, JSON.stringify({
      version: 1, floorSha: manifest.approval.floorSha, deployedSha: manifest.approval.floorSha,
      chanjetPolicy: 'READONLY_VERIFY',
      readonlyApproval: { approvalId: manifest.approval.approvalId, books: manifest.approval.books, verification: manifest.approval.verification },
      operationalTuple: { CHANJET_READONLY_SYNC_ENABLED: 'false' },
    }));
    writeFileSync(manifestFile, JSON.stringify(manifest));
    // mapping/book tables the orchestration entry verifies
    await ds.query(`CREATE TABLE IF NOT EXISTS chanjet_book_company_map (
      bookid varchar(64) PRIMARY KEY, book_name varchar(256), company_code varchar(64) UNIQUE,
      company_name varchar(256), sync_enabled boolean DEFAULT true,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())`);
    await ds.query(`CREATE TABLE IF NOT EXISTS chanjet_account_books (
      book_id varchar(64) PRIMARY KEY, book_name varchar(256), company_code varchar(64),
      company_name varchar(256), enabled boolean DEFAULT false, raw_data jsonb, last_probe_at timestamptz,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())`);
    await ds.query(`INSERT INTO chanjet_book_company_map (bookid, book_name, company_code, company_name) VALUES ($1,'B',$2,'C') ON CONFLICT DO NOTHING`, [manifest.approval.books[0].bookId, manifest.approval.books[0].companyCode]);
    await ds.query(`INSERT INTO chanjet_account_books (book_id, book_name, company_code, company_name, enabled) VALUES ($1,'B',$2,'C',true) ON CONFLICT DO NOTHING`, [manifest.approval.books[0].bookId, manifest.approval.books[0].companyCode]);
    // the protected-API contract runs in a SIBLING process hosting the REAL
    // scheduler (own lease, own durable job rows, real execution-bound worker
    // scope) — matching the production topology where the controller process
    // and the scheduler are separate
    const approvalFile = join(workDir(), `approval-${randomUUID().slice(0, 8)}.json`);
    writeFileSync(approvalFile, JSON.stringify(readonlyApprovalFixture));
    // the provider fixture AND the scheduler host are SIBLING processes: a
    // listener owned by this jest process is not reachable from the CLI child
    const providerSibling = await spawnSibling(process.execPath, [
      join(process.cwd().replace(/\/apps\/api$/, ''), 'scripts/ci/chanjet-orchestration-provider-fixture.mjs'),
      '--hits-file', combinedHits,
    ], {});
    const providerBaseForCli = providerSibling.base;
    const adapter = await spawnSibling(process.execPath, [
      join(process.cwd().replace(/\/apps\/api$/, ''), 'scripts/ci/chanjet-orchestration-scheduler-host.mjs'),
      '--pg-url', fixtureUrl!,
      '--provider-base', providerSibling.base,
      '--auth-token', 'SYNTHETIC_OP_TOKEN',
      '--sync-policy', 'READONLY_VERIFY',
      '--readonly-approval', approvalFile,
    ], {
      env: { ...process.env, CHANJET_READONLY_SYNC_ENABLED: 'true', CHANJET_APP_KEY: 'SYNTHETIC_KEY', CHANJET_APP_SECRET: 'SYNTHETIC_SECRET', CHANJET_ORG_ID: 'SYNTHETIC_ORG', CHANJET_CERT: 'SYNTHETIC_CERT' },
    });
    const adapterBase = adapter.base;
    try {
      // the REAL orchestrator CLI: registers (fd9 held), probes, begins
      // SYNCING, enqueues through the adapter to the REAL scheduler, whose
      // worker HTTP shares the execution and whose SUCCESS gate commits
      // VERIFIED — the CLI only proves it
      const inner = [
        `'${process.execPath}'`, `'${process.cwd().replace(/\/apps\/api$/, '')}/scripts/ops/chanjet-execution-orchestrate.mjs'`,
        '--manifest', `'${manifestFile}'`, '--expected-floor-sha', `'${manifest.approval.floorSha}'`,
        '--floor-state', `'${floorFile}'`, '--pg-url', `'${fixtureUrl}'`,
        '--provider-base', `'${providerBaseForCli}'`, '--alignment-base', `'${adapterBase}'`,
        '--alignment-token-env', 'CHANJET_ORCH_TOKEN', '--phase', `'all'`,
        '--register', '--fd9-lock', `'${lockFile()}'`,
      ].join(' ');
      const result = spawnSync('bash', ['-c', `exec 9>>'${lockFile()}'; flock -n 9; ${inner}`], {
        encoding: 'utf8', timeout: 60_000,
        // the CLI resolves repo-root-relative compiled modules
        cwd: process.cwd().replace(/\/apps\/api$/, ''),
        env: { ...process.env, CHANJET_ORCH_TOKEN: 'SYNTHETIC_OP_TOKEN', CHANJET_APP_KEY: 'SYNTHETIC_KEY', CHANJET_APP_SECRET: 'SYNTHETIC_SECRET', CHANJET_ORG_ID: 'SYNTHETIC_ORG', CHANJET_CERT: 'SYNTHETIC_CERT' },
      });
      const mismatch2 = (condition: boolean, what: string): void => { if (!condition) throw Error(`${what}: status=${result.status} ${String(result.stdout).slice(0, 1800)} ${String(result.stderr).slice(0, 200)}`); };
      mismatch2(result.status === 0, 'cli exit');
      const line = String(result.stdout).split('\n').find((l) => l.startsWith('CHANJET_EXECUTION_ORCHESTRATE=PASS'));
      mismatch2(Boolean(line), 'PASS verdict');
      const summary = JSON.parse(String(line).split(';')[1]);
      expect(summary.verified).toBe(true);
      expect(summary.phase).toBe('VERIFIED');
      // the worker's OWN receipt evidence, persisted by the scheduler and
      // independently verified by the CLI against the receipts table
      expect(summary.firstSync.proof).toBe('FIRST_CONTROLLED_SYNC_PROOF');
      const [job] = await jobRows();
      expect(job.status).toBe('SUCCESS');
      expect(job.result_summary.executionSends).toBe(1);
      expect(job.result_summary.execution.executionId).toBe(manifest.executionId);
      const workerOrdinal = job.result_summary.executionReceiptOrdinals[0];
      const receipts = await ds.query('SELECT ordinal, phase, kind, status, result FROM chanjet_execution_requests WHERE execution_id=$1 ORDER BY ordinal', [manifest.executionId]);
      expect(receipts.some((r: { ordinal: number; phase: string; kind: string; status: string; result: string }) => r.ordinal === workerOrdinal && r.phase === 'SYNCING' && r.kind === 'BUSINESS' && r.status === 'ACKNOWLEDGED' && r.result === 'OK')).toBe(true);
      const [admission] = await ds.query('SELECT phase, lease_id FROM chanjet_execution_admissions WHERE execution_id=$1', [manifest.executionId]);
      expect(admission.phase).toBe('VERIFIED');
      expect(admission.lease_id).toBe('');
      // the worker's token + business exchanges hit the SIBLING provider
      // fixture (the probe's own HTTP went to it as well)
      const siblingHits = readFileSync(combinedHits, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).url);
      expect(siblingHits.length).toBeGreaterThanOrEqual(3);
    } finally {
      await adapter.kill();
      await providerSibling.kill();
    }
  }, 60_000);

  it('pool saturation: the terminal gate cleanup leaves no raw transaction and later borrowers see FAIL, never the hidden SUCCESS', async () => {
    process.env.CHANJET_SYNC_POLICY = 'READONLY_VERIFY';
    const { manifest, syncLease, deadlineAt } = await registeredInSyncing({ cap: 10, verifyMode: true });
    // a foreign transaction holds the admission row lock past the SUCCESS gate
    const { Client } = require('pg');
    const foreign = new Client({ connectionString: fixtureUrl });
    await foreign.connect();
    await foreign.query('BEGIN');
    await foreign.query('SELECT * FROM chanjet_execution_admissions WHERE execution_id=$1 FOR UPDATE', [manifest.executionId]);
    // saturate the fixture DataSource pool: every client but the lease session
    // is checked out while the gate runs (the gate cancellation must NOT
    // depend on borrowing from this exhausted pool)
    const holders: Array<{ release: () => Promise<void> }> = [];
    const { subject, done } = schedulerWithWorker(manifest);
    try {
      for (let i = 0; i < 8; i += 1) {
        const runner = ds.createQueryRunner();
        await runner.connect();
        holders.push({ release: () => runner.release() });
      }
      const accepted = await subject.enqueueManualSync('root', {
        scope: ['RECEIVABLE_STATISTICS'], bookId: VERIFY_BOOK, period: VERIFY_PERIOD, maxAttempts: 1,
        execution: { executionId: manifest.executionId, leaseId: syncLease },
      }, { authPrincipal: OWNER });
      expect(accepted.accepted).toBe(true);
      await done;
      // the gate aborted through its bounded lock budget: the run lands FAIL
      const [job] = await jobRows();
      expect(job.status).toBe('FAIL');
      // release everything, then a LATER borrower cannot commit the hidden
      // SUCCESS: the job stays FAIL and the execution stays HOLD/CANCELLED
      for (const holder of holders) await holder.release();
      await foreign.query('COMMIT').catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 200));
      // cleanup assertion AFTER release: NO session carries a raw BEGIN
      // transaction back to the pool
      const idle = await ds.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction'");
      expect(idle[0].n).toBe(0);
      const [jobAfter] = await jobRows();
      expect(jobAfter.status).toBe('FAIL');
      const [admissionAfter] = await ds.query('SELECT phase, hold_reason FROM chanjet_execution_admissions WHERE execution_id=$1', [manifest.executionId]);
      // the SUCCESS is blocked: the admission can never be VERIFIED (the hold
      // may land HOLD, or remain SYNCING while the foreign lock delays it)
      expect(['SYNCING', 'HOLD']).toContain(admissionAfter.phase);
      // a fresh borrower sees the FAIL — the hidden SUCCESS can never surface
      const borrowed = await ds.query('SELECT status FROM chanjet_sync_jobs');
      expect(borrowed.every((r: { status: string }) => r.status === 'FAIL')).toBe(true);
    } finally {
      await foreign.query('COMMIT').catch(() => undefined);
      await foreign.end().catch(() => undefined);
      await subject.onModuleDestroy();
    }
    // after the foreign lock released, the admission is NOT VERIFIED (the
    // concurrent hold attempt was unconfirmed — reported as such — and the
    // durable gate refusal already blocked the SUCCESS), and a fresh borrow
    // still sees the FAIL: the hidden SUCCESS can never surface
    const [admissionFinal] = await ds.query('SELECT phase, hold_reason FROM chanjet_execution_admissions WHERE execution_id=$1', [manifest.executionId]);
    expect(['SYNCING', 'HOLD']).toContain(admissionFinal.phase);
    const jobsFinal = await jobRows();
    expect(jobsFinal.every((r: { status: string }) => r.status === 'FAIL')).toBe(true);
  }, 30_000);

  it('same-transaction liveness: real runMappingReconciliation writes are zero after a HOLD', async () => {
    process.env.CHANJET_SYNC_POLICY = 'READONLY_VERIFY';
    const { manifest, syncLease, deadlineAt } = await registeredInSyncing({ cap: 10, verifyMode: true });
    // REAL integration service over REAL repositories (mirror tables created
    // for this test; the ERP-mirror internals ARE the repositories)
    const current = { manifest, leaseId: syncLease, phase: 'SYNCING' as const, deadlineAt };
    // seed a mapping issue the reconciliation would normally write a result for
    await ds.query(`INSERT INTO chanjet_master_mapping (mapping_type, book_id, review_status, match_status) VALUES ('CUSTOMER', $1, 'PENDING', 'PENDING')`, [manifest.approval.books[0].bookId]);
    const integration = new ChanjetIntegrationService(
      auth,
      ds,
      ds.getRepository(ChanjetAccountBookEntity),
      ds.getRepository(ChanjetApiFieldCatalogEntity),
      ds.getRepository(ChanjetMasterMappingEntity),
      ds.getRepository(ChanjetSyncJobEntity),
      ds.getRepository(ChanjetBookCompanyMapEntity),
      ds.getRepository(ChanjetVoucherDraftEntity),
      ds.getRepository(ChanjetReconciliationResultEntity),
      ds.getRepository(ChanjetReadSnapshotEntity),
      ds.getRepository(ChanjetEntitySnapshotEntity),
      ds.getRepository(ChanjetErpFieldMappingEntity),
      ds.getRepository(ChanjetWritebackOutboxEntity),
    );
    const state = { manifest, store, gateway: new ChanjetExecutionHttpGateway(store, manifest), transport: { resend: async () => { throw new Error('FORBIDDEN'); } }, deadlineAt, current };
    // positive control: live execution -> the reconciliation writes land
    await scopeModule.withExecutionScope(state, () => integration.runMappingReconciliation({ compact: true }));
    const [liveCount] = await ds.query('SELECT count(*)::int AS n FROM chanjet_reconciliation_results');
    expect(liveCount.n).toBeGreaterThanOrEqual(1);
    // now HOLD the execution and reset the written rows
    await store.holdExecution(current, 'CANCELLED');
    await ds.query('DELETE FROM chanjet_reconciliation_results');
    // after the HOLD: the same-transaction liveness gate refuses and ZERO
    // late writes land
    await expect(scopeModule.withExecutionScope(state, () => integration.runMappingReconciliation({ compact: true })))
      .rejects.toThrow('CHANJET_ADMISSION_HOLD');
    const [afterCount] = await ds.query('SELECT count(*)::int AS n FROM chanjet_reconciliation_results');
    expect(afterCount.n).toBe(0);
    const [admission] = await ds.query('SELECT phase, hold_reason FROM chanjet_execution_admissions WHERE execution_id=$1', [manifest.executionId]);
    expect(admission.phase).toBe('HOLD');
  }, 30_000);

  /** A dedicated scheduler wired to a REAL lease session that flows through
   *  the wire-level suspend proxy: persistTerminalState then runs against a
   *  REAL admission row, a REAL RUNNING job row and a REAL advisory-locked
   *  PostgreSQL session whose BEGIN/COMMIT frames can genuinely be withheld. */
  async function gateSubjectFor(proxy: import('./chanjet-pg-suspend-proxy').PgSuspendProxy, options: { executionCancellationConfig?: import('./chanjet-execution-guard-executor').GuardConnectionConfig } = {}) {
    const fixturePg = new URL(fixtureUrl!);
    const proxyUrl = `postgres://${encodeURIComponent(fixturePg.username)}:${encodeURIComponent(fixturePg.password)}@127.0.0.1:${proxy.port}/${fixturePg.pathname.slice(1)}`;
    const gateDs = new DataSource({ type: 'postgres', url: proxyUrl, entities: [ChanjetSyncJobEntity], logging: false });
    await gateDs.initialize();
    const subject = new ChanjetReadonlySyncScheduler(
      {} as never, { ok: async () => {}, fail: async () => {} } as never, gateDs, {} as never,
      options.executionCancellationConfig ? { executionCancellationConfig: options.executionCancellationConfig } : {},
    );
    return { subject, gateDs };
  }

  it('terminal gate: a suspended BEGIN aborts at the absolute deadline, the lease session is discarded and no terminal write lands', async () => {
    const { manifest, syncLease, deadlineAt: rowDeadlineAt } = await registeredInSyncing({ cap: 10, verifyMode: true });
    const fixturePg = new URL(fixtureUrl!);
    const proxy = await startPgSuspendProxy(fixturePg.hostname, Number(fixturePg.port) || 5432);
    let gateDs: DataSource | undefined;
    try {
      ({ subject: schedulerSubject, gateDs } = await gateSubjectFor(proxy));
      const runner = gateDs!.createQueryRunner();
      const lease = await ChanjetReadonlyLockLease.acquire(runner, 'chanjet-full-readonly-sync');
      expect(lease).toBeTruthy();
      const runId = `RUN_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
      await ds.query(`INSERT INTO chanjet_sync_jobs (job_type, status, request_scope) VALUES ('SNAPSHOT', 'RUNNING', jsonb_build_object('orchestrationRunId', $1::text))`, [runId]);
      // the VERIFIED transition requires acked BUSINESS receipt evidence:
      // counted reserve + acknowledge through the REAL store (the row guard
      // accepts no other order)
      const gateContext = { manifest, leaseId: syncLease, phase: 'SYNCING' as const, deadlineAt: rowDeadlineAt };
      const reserved = await store.reserve(gateContext, 'BUSINESS');
      await store.acknowledge(gateContext, reserved.ticket, 'OK');
      const binding = {
        executionId: manifest.executionId, leaseId: syncLease, phase: 'SYNCING' as const,
        approvalId: POLICY_APPROVAL, floorSha: POLICY_FLOOR,
        deadlineAt: new Date(Date.now() + 2_500).toISOString(),
      };
      // hold the REAL BEGIN protocol frame: the transaction genuinely never
      // reaches the server
      proxy.armHold('BEGIN');
      const started = Date.now();
      await expect((schedulerSubject as unknown as { persistTerminalState: (...a: unknown[]) => Promise<void> })
        .persistTerminalState(lease, runId, 'SUCCESS', 'COMPLETED', 'COMPLETED', 'ok', {}, binding))
        .rejects.toThrow('READONLY_HOLD_EXECUTION_GATE_UNKNOWN');
      expect(Date.now() - started).toBeLessThan(10_000); // timely termination, not a hang
      proxy.armHold(''); // disarm: the connection recovers
      expect(proxy.heldFrames().some((f) => f.trim().toUpperCase() === 'BEGIN')).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 500));
      // no late terminal write after the connection recovers
      const [jobRow] = await ds.query(`SELECT status FROM chanjet_sync_jobs WHERE request_scope->>'orchestrationRunId' = $1`, [runId]);
      expect(jobRow?.status).toBe('RUNNING');
      // the VERIFIED update lived inside the aborted transaction
      const [admission] = await ds.query('SELECT phase FROM chanjet_execution_admissions WHERE execution_id=$1', [manifest.executionId]);
      expect(admission.phase).toBe('SYNCING');
      // the suspended lease backend was terminated: the discard is confirmed
      const pid = proxy.heldPids().pop();
      expect(pid).toBeTruthy();
      const gone = await ds.query('SELECT 1 FROM pg_stat_activity WHERE pid=$1', [pid]);
      expect(gone.length).toBe(0);
    } finally {
      if (gateDs?.isInitialized) await gateDs.destroy().catch(() => undefined);
      await proxy.close();
    }
  }, 30_000);

  it('terminal gate: a withheld COMMIT reports UNKNOWN, terminates the backend and no terminal write lands late', async () => {
    const { manifest, syncLease, deadlineAt: rowDeadlineAt } = await registeredInSyncing({ cap: 10, verifyMode: true });
    const fixturePg = new URL(fixtureUrl!);
    const proxy = await startPgSuspendProxy(fixturePg.hostname, Number(fixturePg.port) || 5432);
    let gateDs: DataSource | undefined;
    try {
      ({ subject: schedulerSubject, gateDs } = await gateSubjectFor(proxy));
      const runner = gateDs!.createQueryRunner();
      const lease = await ChanjetReadonlyLockLease.acquire(runner, 'chanjet-full-readonly-sync');
      const runId = `RUN_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
      await ds.query(`INSERT INTO chanjet_sync_jobs (job_type, status, request_scope) VALUES ('SNAPSHOT', 'RUNNING', jsonb_build_object('orchestrationRunId', $1::text))`, [runId]);
      // the VERIFIED transition requires acked BUSINESS receipt evidence:
      // counted reserve + acknowledge through the REAL store (the row guard
      // accepts no other order)
      const gateContext = { manifest, leaseId: syncLease, phase: 'SYNCING' as const, deadlineAt: rowDeadlineAt };
      const reserved = await store.reserve(gateContext, 'BUSINESS');
      await store.acknowledge(gateContext, reserved.ticket, 'OK');
      const binding = {
        executionId: manifest.executionId, leaseId: syncLease, phase: 'SYNCING' as const,
        approvalId: POLICY_APPROVAL, floorSha: POLICY_FLOOR,
        deadlineAt: new Date(Date.now() + 2_500).toISOString(),
      };
      // the gate and terminal UPDATE run fully but the REAL COMMIT frame is
      // withheld: the commit genuinely never reaches the server
      proxy.armHold('COMMIT');
      const started = Date.now();
      await expect((schedulerSubject as unknown as { persistTerminalState: (...a: unknown[]) => Promise<void> })
        .persistTerminalState(lease, runId, 'SUCCESS', 'COMPLETED', 'COMPLETED', 'ok', {}, binding))
        .rejects.toThrow('READONLY_HOLD_EXECUTION_TERMINAL_UNKNOWN');
      expect(Date.now() - started).toBeLessThan(10_000);
      proxy.armHold('');
      expect(proxy.heldFrames().some((f) => f.trim().toUpperCase() === 'COMMIT')).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 500));
      // the outcome stays UNKNOWN and DURABLE: the job row is still RUNNING
      // (never a hidden SUCCESS), the admission never became VERIFIED
      const [jobRow] = await ds.query(`SELECT status, result_summary FROM chanjet_sync_jobs WHERE request_scope->>'orchestrationRunId' = $1`, [runId]);
      expect(jobRow?.status).toBe('RUNNING');
      expect(jobRow?.result_summary ?? null).toBeNull();
      const [admission] = await ds.query('SELECT phase, lease_id FROM chanjet_execution_admissions WHERE execution_id=$1', [manifest.executionId]);
      expect(admission.phase).toBe('SYNCING');
      expect(admission.lease_id).not.toBe('');
      // the backend was terminated before the commit could complete
      const pid = proxy.heldPids().pop();
      expect(pid).toBeTruthy();
      const gone = await ds.query('SELECT 1 FROM pg_stat_activity WHERE pid=$1', [pid]);
      expect(gone.length).toBe(0);
    } finally {
      if (gateDs?.isInitialized) await gateDs.destroy().catch(() => undefined);
      await proxy.close();
    }
  }, 30_000);

  it('terminal gate: cancellation auth failure escalates to the socket destroy and the discard is still confirmed', async () => {
    const { manifest, syncLease, deadlineAt: rowDeadlineAt } = await registeredInSyncing({ cap: 10, verifyMode: true });
    const fixturePg = new URL(fixtureUrl!);
    const dbName = fixturePg.pathname.slice(1);
    const LIMITED_ROLE = 'chanjet_limited_gate_cancel';
    await ds.query(`DO $do$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${LIMITED_ROLE}') THEN
        CREATE ROLE ${LIMITED_ROLE} LOGIN PASSWORD 'limited_pw_1';
      END IF; END $do$;`);
    await ds.query(`GRANT CONNECT ON DATABASE "${dbName}" TO ${LIMITED_ROLE}`);
    const proxy = await startPgSuspendProxy(fixturePg.hostname, Number(fixturePg.port) || 5432);
    let gateDs: DataSource | undefined;
    try {
      // the cancellation channel authenticates as the LIMITED role:
      // pg_terminate_backend on the lease backend is DENIED — the physical
      // socket discard (first) is the escalation that stops the backend
      ({ subject: schedulerSubject, gateDs } = await gateSubjectFor(proxy, {
        executionCancellationConfig: {
          host: fixturePg.hostname, port: Number(fixturePg.port) || 5432,
          user: LIMITED_ROLE, password: 'limited_pw_1', database: dbName,
        },
      }));
      const runner = gateDs!.createQueryRunner();
      const lease = await ChanjetReadonlyLockLease.acquire(runner, 'chanjet-full-readonly-sync');
      const runId = `RUN_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
      await ds.query(`INSERT INTO chanjet_sync_jobs (job_type, status, request_scope) VALUES ('SNAPSHOT', 'RUNNING', jsonb_build_object('orchestrationRunId', $1::text))`, [runId]);
      // the VERIFIED transition requires acked BUSINESS receipt evidence:
      // counted reserve + acknowledge through the REAL store (the row guard
      // accepts no other order)
      const gateContext = { manifest, leaseId: syncLease, phase: 'SYNCING' as const, deadlineAt: rowDeadlineAt };
      const reserved = await store.reserve(gateContext, 'BUSINESS');
      await store.acknowledge(gateContext, reserved.ticket, 'OK');
      const binding = {
        executionId: manifest.executionId, leaseId: syncLease, phase: 'SYNCING' as const,
        approvalId: POLICY_APPROVAL, floorSha: POLICY_FLOOR,
        deadlineAt: new Date(Date.now() + 2_500).toISOString(),
      };
      proxy.armHold('COMMIT');
      const started = Date.now();
      await expect((schedulerSubject as unknown as { persistTerminalState: (...a: unknown[]) => Promise<void> })
        .persistTerminalState(lease, runId, 'SUCCESS', 'COMPLETED', 'COMPLETED', 'ok', {}, binding))
        .rejects.toThrow('READONLY_HOLD_EXECUTION_TERMINAL_UNKNOWN');
      expect(Date.now() - started).toBeLessThan(12_000);
      proxy.armHold('');
      await new Promise((resolve) => setTimeout(resolve, 500));
      const [jobRow] = await ds.query(`SELECT status FROM chanjet_sync_jobs WHERE request_scope->>'orchestrationRunId' = $1`, [runId]);
      expect(jobRow?.status).toBe('RUNNING');
      // the discard is CONFIRMED by an authorized observer: the backend is
      // gone even though the terminate was denied
      const pid = proxy.heldPids().pop();
      expect(pid).toBeTruthy();
      const gone = await ds.query('SELECT 1 FROM pg_stat_activity WHERE pid=$1', [pid]);
      expect(gone.length).toBe(0);
      expect(proxy.closedSessions()).toBeGreaterThanOrEqual(1); // the lease socket was destroyed
    } finally {
      if (gateDs?.isInitialized) await gateDs.destroy().catch(() => undefined);
      await proxy.close();
    }
  }, 30_000);

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
