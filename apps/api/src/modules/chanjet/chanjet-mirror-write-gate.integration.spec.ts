import { chanjetBackgroundFixture } from './chanjet-background.test-fixture';
// R4.2c mirror-write positive + boundary integration: the REAL integration
// service methods (syncReadOnlyMirror → recordReadSnapshot /
// recordEntitySnapshots / createMappingCandidates through the SAME gated
// transaction as production) run against REAL repositories on an isolated
// PostgreSQL18 with a local provider fixture. Positive: a LIVE execution's
// mirror writes land (snapshot + entity rows). Boundary: after a durable
// HOLD, the same methods write ZERO rows (the same-transaction liveness gate
// refuses and the batch rolls back). The ERP-side writes are limited to the
// integration middle-layer tables by design.
import { DataSource, QueryFailedError } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { createServer, Server } from 'node:http';
import { ChanjetAuthService } from './chanjet-auth.service';
import { ChanjetIntegrationService } from './chanjet-integration.service';
import { ChanjetExecutionAdmissionStore } from './chanjet-execution-admission.store';
import { ChanjetExecutionHttpGateway } from './chanjet-execution-transport';
import { executionWriteGateTx, isCommitVerdictUnknown, withExecutionScope } from './chanjet-execution-scope';
import { withReadonlyOrchestration } from './chanjet-readonly-execution';
import { startPgSuspendProxy } from './chanjet-pg-suspend-proxy';
import { installReadonlyApprovalFixture, readonlyApprovalFixture } from './chanjet-readonly-policy.test-fixture';
import { CreateChanjetExecutionAdmissions1791878400000 } from '../../database/migrations/1791878400000-CreateChanjetExecutionAdmissions';
import { CreateChanjetBookCompanyMapAndExtendArSnapshot1781793986478 } from '../../database/migrations/1781793986478-CreateChanjetBookCompanyMapAndExtendArSnapshot';
import { CreateChanjetIntegrationFoundation1782740000000 } from '../../database/migrations/1782740000000-CreateChanjetIntegrationFoundation';
import { CreateChanjetReadonlyMirror1782742000000 } from '../../database/migrations/1782742000000-CreateChanjetReadonlyMirror';
import { AddChanjetWmsMappingEntityType1785420000000 } from '../../database/migrations/1785420000000-AddChanjetWmsMappingEntityType';
import { ChanjetAccountBookEntity } from './chanjet-account-book.entity';
import { ChanjetApiFieldCatalogEntity } from './chanjet-api-field-catalog.entity';
import { ChanjetBookCompanyMapEntity } from './chanjet-book-company-map.entity';
import { ChanjetErpFieldMappingEntity } from './chanjet-erp-field-mapping.entity';
import { ChanjetEntitySnapshotEntity } from './chanjet-entity-snapshot.entity';
import { ChanjetMasterMappingEntity } from './chanjet-master-mapping.entity';
import { ChanjetReadSnapshotEntity } from './chanjet-read-snapshot.entity';
import { ChanjetReconciliationResultEntity } from './chanjet-reconciliation-result.entity';
import { ChanjetSyncJobEntity } from './chanjet-sync-job.entity';
import { ChanjetVoucherDraftEntity } from './chanjet-voucher-draft.entity';
import { ChanjetWritebackOutboxEntity } from './chanjet-writeback-outbox.entity';

const fixtureUrl = process.env.CHANJET_ADMISSION_FIXTURE_URL;
const mirror = fixtureUrl ? describe : describe.skip;
if (process.env.CHANJET_EXECUTION_WORKER_REQUIRED === 'true' && !fixtureUrl) {
  throw Error('REAL_EXECUTION_WORKER_FIXTURE_URL_REQUIRED');
}

const BOOK = readonlyApprovalFixture.verification.bookId;
const PERIOD = readonlyApprovalFixture.verification.period;
const OWNER = 'ROOT_OPERATOR';

// COMMIT verdict SOURCE identification (pure classification — these are
// driver-level fault objects, NOT wire evidence of any server outcome):
// client/network failures (EPIPE/ECONNRESET, errno-style five-letter codes)
// must stay UNKNOWN even though their code is five characters; only a
// confirmed PostgreSQL ErrorResponse (severity + SQLSTATE on the raw driver
// error) may be classified by SQLSTATE semantics.
describe('COMMIT verdict source identification', () => {
  const epipe = Object.assign(new Error('write EPIPE'), { code: 'EPIPE', errno: -32, syscall: 'write' });
  const econnreset = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET', errno: -104, syscall: 'read' });
  const serverError = (code: string): Record<string, unknown> => ({ severity: 'ERROR', code, routine: 'exec_simple_query', message: `server said ${code}` });

  it('a raw EPIPE (five-letter errno code) stays UNKNOWN', () => {
    expect(isCommitVerdictUnknown(epipe)).toBe(true);
  });
  it('a TypeORM QueryFailedError wrapping EPIPE stays UNKNOWN', () => {
    expect(isCommitVerdictUnknown(new QueryFailedError('COMMIT', [], epipe))).toBe(true);
  });
  it('ECONNRESET stays UNKNOWN', () => {
    expect(isCommitVerdictUnknown(econnreset)).toBe(true);
  });
  it('a SQLSTATE-shaped code WITHOUT the ErrorResponse severity stays UNKNOWN', () => {
    expect(isCommitVerdictUnknown({ code: '23505' })).toBe(true);
  });
  it('a confirmed server 23505 is an explicit rejection (fail-closed, not UNKNOWN)', () => {
    expect(isCommitVerdictUnknown(serverError('23505'))).toBe(false);
  });
  it('confirmed server 40003 and connection-class 08007 stay UNKNOWN', () => {
    expect(isCommitVerdictUnknown(serverError('40003'))).toBe(true);
    expect(isCommitVerdictUnknown(serverError('08007'))).toBe(true);
  });
});

mirror('mirror-write liveness inside the gated write transaction (real integration methods, real repositories)', () => {
  let ds: DataSource;
  let store: ChanjetExecutionAdmissionStore;
  let auth: ChanjetAuthService;
  let integration: ChanjetIntegrationService;
  let provider: Server;
  let providerBase = '';
  let restorePolicy: (() => void) | undefined;
  const tokenSeq = { n: 0 };
  let current: { manifest: unknown; leaseId: string; phase: 'SYNCING'; deadlineAt: Date };
  let pgHost = '127.0.0.1';
  let pgPort = 5432;
  let dbName = '';
  let proxy: import('./chanjet-pg-suspend-proxy').PgSuspendProxy | undefined;
  let proxyUrl = '';
  let proxyDs: DataSource;
  let proxyIntegration: ChanjetIntegrationService;
  let limitedIntegration: ChanjetIntegrationService;
  const LIMITED_ROLE = 'chanjet_limited_mirror_cancel';
  const limitedCancelConfig = { host: '127.0.0.1', user: LIMITED_ROLE, password: 'limited_pw_1', database: '' };
  const mirrorEntities = [
    ChanjetAccountBookEntity, ChanjetApiFieldCatalogEntity, ChanjetBookCompanyMapEntity,
    ChanjetErpFieldMappingEntity, ChanjetEntitySnapshotEntity, ChanjetMasterMappingEntity,
    ChanjetReadSnapshotEntity, ChanjetReconciliationResultEntity, ChanjetSyncJobEntity,
    ChanjetVoucherDraftEntity, ChanjetWritebackOutboxEntity,
  ];

  beforeAll(async () => {
    const url = new URL(fixtureUrl!);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !/^\/(root_admission_review|chanjet_admission_fixture)$/.test(url.pathname)) {
      throw Error('Only the isolated loopback fixture database is permitted');
    }
    // reset the schema BEFORE initialize so synchronize creates clean tables
    const reset = new DataSource({ type: 'postgres', url: fixtureUrl, logging: false });
    await reset.initialize();
    await reset.query('DROP SCHEMA public CASCADE');
    await reset.query('CREATE SCHEMA public');
    await reset.destroy();
    // synchronize the mirror/repositories tables from the REAL entity
    // metadata; the admission tables come from the reviewed migration (guard
    // semantics intact) and are created right after
    ds = new DataSource({
      type: 'postgres', url: fixtureUrl, logging: false, synchronize: true,
      entities: [
        ChanjetAccountBookEntity, ChanjetApiFieldCatalogEntity, ChanjetBookCompanyMapEntity,
        ChanjetErpFieldMappingEntity, ChanjetEntitySnapshotEntity, ChanjetMasterMappingEntity,
        ChanjetReadSnapshotEntity, ChanjetReconciliationResultEntity, ChanjetSyncJobEntity,
        ChanjetVoucherDraftEntity, ChanjetWritebackOutboxEntity,
      ],
    });
    await ds.initialize();
    const admissionRunner = ds.createQueryRunner();
    try { await new CreateChanjetExecutionAdmissions1791878400000().up(admissionRunner); } finally { await admissionRunner.release(); }
    // mirror-gate seeds: enabled book cache + ERP ACTIVE company master
    await ds.query(`INSERT INTO chanjet_account_books (book_id, book_name, company_code, company_name, enabled)
      VALUES ($1, 'BOOK', 'COMP-1', 'COMP-1', true)`, [BOOK]);
    await ds.query(`INSERT INTO chanjet_book_company_map (bookid, book_name, company_code, company_name)
      VALUES ($1, 'BOOK', 'COMP-1', 'COMP-1')`, [BOOK]);
    await ds.query(`CREATE TABLE IF NOT EXISTS sys_organizations (
      id bigserial PRIMARY KEY, org_code varchar(64) UNIQUE, org_name varchar(256),
      org_type varchar(32), status varchar(16), company_code varchar(64))`);
    await ds.query(`INSERT INTO sys_organizations (org_code, org_name, org_type, status, company_code)
      VALUES ('COMP-1', 'COMP-1', 'COMPANY', 'ACTIVE', 'COMP-1')`);
    store = new ChanjetExecutionAdmissionStore(ds.manager);
    provider = (await new Promise<import('node:http').Server>((resolve) => {
      const server = createServer((req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
        res.setHeader('Content-Type', 'application/json');
        if ((req.url || '').includes('generateToken')) {
          res.end(JSON.stringify({ value: { accessToken: `SYNTHETIC_TOKEN_${++tokenSeq.n}`, expiresIn: 7200 } }));
          return;
        }
        res.end(JSON.stringify({ code: '200', value: [
          { id: 'E1', code: 'C1', name: 'N1', fullName: 'F1' },
          { id: 'E2', code: 'C2', name: 'N2', fullName: 'F2' },
        ] }));
      });
      server.listen(0, '127.0.0.1', () => resolve(server));
    }));
    providerBase = `http://127.0.0.1:${(provider.address() as { port: number }).port}`;
    process.env.CHANJET_PROVIDER_BASE_URL = providerBase;
    restorePolicy = installReadonlyApprovalFixture();
    process.env.CHANJET_READONLY_SYNC_ENABLED = 'true';
    auth = new ChanjetAuthService({ get: (key: string, fallback?: string) => process.env[key] ?? fallback } as never, { findOneBy: async () => ({ key: 'singleton', appTicket: 'SYNTHETIC_TICKET', certificate: null, tokens: null }), save: async (e: unknown) => e } as never, { ok: async () => {}, fail: async () => {} } as never, chanjetBackgroundFixture().service);
    Object.assign(auth, { appKey: 'SYNTHETIC_KEY', appSecret: 'SYNTHETIC_SECRET', orgId: 'SYNTHETIC_ORG', cert: 'SYNTHETIC_CERT', appTicket: 'SYNTHETIC_TICKET' });
    integration = new ChanjetIntegrationService(
      auth, ds,
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
    // wire-level suspend proxy: the suspend tests flow the mirror tx's REAL
    // session through it and hold the actual BEGIN/COMMIT protocol frames
    pgHost = url.hostname;
    pgPort = Number(url.port) || 5432;
    dbName = url.pathname.slice(1);
    proxy = await startPgSuspendProxy(pgHost, pgPort);
    proxyUrl = `postgres://${encodeURIComponent(url.username)}:${encodeURIComponent(url.password)}@127.0.0.1:${proxy.port}/${dbName}`;
    // the suspend tests build the service on the proxy DataSource (same
    // tables; the direct `ds` remains the seeding/assertion control plane)
    proxyDs = new DataSource({ type: 'postgres', url: proxyUrl, logging: false, entities: mirrorEntities });
    await proxyDs.initialize();
    proxyIntegration = new ChanjetIntegrationService(
      auth, proxyDs,
      proxyDs.getRepository(ChanjetAccountBookEntity),
      proxyDs.getRepository(ChanjetApiFieldCatalogEntity),
      proxyDs.getRepository(ChanjetMasterMappingEntity),
      proxyDs.getRepository(ChanjetSyncJobEntity),
      proxyDs.getRepository(ChanjetBookCompanyMapEntity),
      proxyDs.getRepository(ChanjetVoucherDraftEntity),
      proxyDs.getRepository(ChanjetReconciliationResultEntity),
      proxyDs.getRepository(ChanjetReadSnapshotEntity),
      proxyDs.getRepository(ChanjetEntitySnapshotEntity),
      proxyDs.getRepository(ChanjetErpFieldMappingEntity),
      proxyDs.getRepository(ChanjetWritebackOutboxEntity),
    );
    // a role that may connect but can NEVER pg_terminate_backend another
    // role's backend: the cancellation channel must escalate to the socket
    // destroy and still confirm the discard
    await ds.query(`DO $do$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${LIMITED_ROLE}') THEN
        CREATE ROLE ${LIMITED_ROLE} LOGIN PASSWORD 'limited_pw_1';
      END IF; END $do$;`);
    await ds.query(`GRANT CONNECT ON DATABASE "${dbName}" TO ${LIMITED_ROLE}`);
    limitedCancelConfig.database = dbName;
    limitedIntegration = new ChanjetIntegrationService(
      auth, proxyDs,
      proxyDs.getRepository(ChanjetAccountBookEntity),
      proxyDs.getRepository(ChanjetApiFieldCatalogEntity),
      proxyDs.getRepository(ChanjetMasterMappingEntity),
      proxyDs.getRepository(ChanjetSyncJobEntity),
      proxyDs.getRepository(ChanjetBookCompanyMapEntity),
      proxyDs.getRepository(ChanjetVoucherDraftEntity),
      proxyDs.getRepository(ChanjetReconciliationResultEntity),
      proxyDs.getRepository(ChanjetReadSnapshotEntity),
      proxyDs.getRepository(ChanjetEntitySnapshotEntity),
      proxyDs.getRepository(ChanjetErpFieldMappingEntity),
      proxyDs.getRepository(ChanjetWritebackOutboxEntity),
      limitedCancelConfig,
    );
  });
  afterAll(async () => {
    restorePolicy?.();
    delete process.env.CHANJET_PROVIDER_BASE_URL;
    provider.close();
    if (proxyDs?.isInitialized) await proxyDs.destroy().catch(() => undefined);
    await proxy?.close();
    if (ds?.isInitialized) await ds.destroy();
  });

  async function liveSyncingExecution(totalTimeoutMs = 360_000): Promise<{ manifest: import('./chanjet-execution-manifest').ExecutionManifest; deadlineAt: Date }> {
    const id = randomUUID().replace(/-/g, '');
    const manifest: import('./chanjet-execution-manifest').ExecutionManifest = {
      version: 1,
      executionId: `EXEC_${id.slice(0, 24)}`,
      ownerId: OWNER,
      requestCap: 10,
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
    };
    await store.registerFromReviewedRootManifest(manifest);
    const probeLease = `PROBE_${randomUUID().slice(0, 8)}`;
    await store.begin(manifest, 'PROBING', probeLease);
    const probeContext = { manifest, leaseId: probeLease, phase: 'PROBING' as const };
    const gateway = new ChanjetExecutionHttpGateway(store, manifest);
    await gateway.send(probeContext, 'BUSINESS', async (signal: AbortSignal) => (await fetch(`${providerBase}/accounting/gl/statistics/receive/${BOOK}?period=${PERIOD}`, { signal })).json());
    await store.finish(probeContext, 'PROBED');
    const syncLease = `SYNC_${randomUUID().slice(0, 8)}`;
    await store.begin(manifest, 'SYNCING', syncLease);
    const [row] = await ds.query('SELECT deadline_at FROM chanjet_execution_admissions WHERE execution_id=$1', [manifest.executionId]);
    current = { manifest, leaseId: syncLease, phase: 'SYNCING', deadlineAt: new Date(row.deadline_at) };
    return { manifest, deadlineAt: current.deadlineAt };
  }

  const mirrorCounts = async () => {
    const [snap] = await ds.query('SELECT count(*)::int AS n FROM chanjet_read_snapshots');
    const [ent] = await ds.query('SELECT count(*)::int AS n FROM chanjet_entity_snapshots');
    const [map] = await ds.query('SELECT count(*)::int AS n FROM chanjet_master_mapping');
    return { snap: snap.n, ent: ent.n, map: map.n };
  };

  it('live execution: the gated mirror transaction returns SUCCESS, lands the SNAPSHOT job SUCCESS and the expected rows', async () => {
    process.env.CHANJET_READONLY_SYNC_ENABLED = 'true';
    process.env.CHANJET_SYNC_POLICY = 'READONLY_VERIFY';
    await liveSyncingExecution();
    const before = await mirrorCounts();
    const state = {
      manifest: current.manifest, store,
      gateway: new ChanjetExecutionHttpGateway(store, current.manifest),
      transport: { resend: async () => { throw new Error('FORBIDDEN'); } },
      deadlineAt: current.deadlineAt, current,
    };
    const outcome = await withExecutionScope(state, () => withReadonlyOrchestration('SYNTHETIC_MIRROR_RUN', () => integration.syncReadOnlyMirror(['RECEIVABLE_STATISTICS'], BOOK, PERIOD)));
    // the RETURN value itself reports SUCCESS — not merely row-count growth
    expect(outcome.results.length).toBe(1);
    expect(outcome.results[0]).toMatchObject({ key: 'RECEIVABLE_STATISTICS', bookId: BOOK, status: 'SUCCESS' });
    expect(outcome.results[0].rows).toBeGreaterThan(0);
    expect(outcome.results[0].rawSnapshotId).toBeTruthy();
    expect(outcome.results[0].entityRows).toBe(2);
    // the durable job evidence: the SNAPSHOT job row is SUCCESS
    const [jobRow] = await ds.query(
      `SELECT status, result_summary FROM chanjet_sync_jobs
         WHERE job_type='SNAPSHOT' AND book_id=$1 AND period=$2 ORDER BY id DESC LIMIT 1`, [BOOK, PERIOD]);
    expect(jobRow?.status).toBe('SUCCESS');
    expect(String((jobRow?.result_summary ?? {}).key)).toBe('RECEIVABLE_STATISTICS');
    // the EXPECTED rows landed: the exact read snapshot (book/endpoint/period)
    const [snapshotRow] = await ds.query(
      'SELECT id, book_id, endpoint_key, period, payload_hash FROM chanjet_read_snapshots WHERE book_id=$1 AND endpoint_key=$2 AND period=$3',
      [BOOK, 'RECEIVABLE_STATISTICS', PERIOD]);
    expect(String(snapshotRow?.id)).toBe(outcome.results[0].rawSnapshotId);
    expect(snapshotRow?.book_id).toBe(BOOK);
    // the aggregate entity rows for the fixture customers, same book/period
    const entityRows = await ds.query(
      'SELECT external_id, external_code FROM chanjet_entity_snapshots WHERE book_id=$1 AND endpoint_key=$2 AND period=$3 ORDER BY external_id',
      [BOOK, 'RECEIVABLE_STATISTICS', PERIOD]);
    expect(entityRows.map((r: { external_id: string }) => r.external_id).sort()).toEqual(['E1', 'E2']);
    expect(entityRows.every((r: { external_code: string }) => ['C1', 'C2'].includes(r.external_code))).toBe(true);
    // mapping candidates for the fixture customers
    const after = await mirrorCounts();
    expect(after.snap).toBe(before.snap + 1);
    expect(after.ent).toBe(before.ent + 2); // RECEIVABLE_STATISTICS writes no mapping candidates (no mappingType)
    expect(after.map).toBe(before.map);
    const [admission] = await ds.query('SELECT phase, request_count FROM chanjet_execution_admissions WHERE execution_id=$1', [(current.manifest as { executionId: string }).executionId]);
    expect(admission.phase).toBe('SYNCING');
    expect(Number(admission.request_count)).toBeGreaterThanOrEqual(2); // TOKEN + BUSINESS counted on the same execution
  });

  it('after a durable HOLD the same gated mirror transaction writes ZERO rows', async () => {
    process.env.CHANJET_READONLY_SYNC_ENABLED = 'true';
    process.env.CHANJET_SYNC_POLICY = 'READONLY_VERIFY';
    await liveSyncingExecution();
    const before = await mirrorCounts();
    // durable stop after the run began (the mirror boundary must refuse)
    await store.holdExecution(current, 'CANCELLED');
    const state = {
      manifest: current.manifest, store,
      gateway: new ChanjetExecutionHttpGateway(store, current.manifest),
      transport: { resend: async () => { throw new Error('FORBIDDEN'); } },
      deadlineAt: current.deadlineAt, current,
    };
    // both guards are required: the scope AND the durable orchestration —
    // without the wrapper the call would be refused at the door, never
    // reaching the write boundary this test exists to prove. The durable
    // write boundary refuses BEFORE any mirror write and the refusal is
    // a rejection carrying the admission HOLD code.
    await expect(withExecutionScope(state, () => withReadonlyOrchestration('SYNTHETIC_MIRROR_RUN', () => integration.syncReadOnlyMirror(['RECEIVABLE_STATISTICS'], BOOK, PERIOD))))
      .rejects.toThrow('CHANJET_ADMISSION_HOLD');
    const after = await mirrorCounts();
    expect(after.snap).toBe(before.snap);
    expect(after.ent).toBe(before.ent);
    expect(after.map).toBe(before.map);
    const [admission] = await ds.query('SELECT phase, hold_reason FROM chanjet_execution_admissions WHERE execution_id=$1', [(current.manifest as { executionId: string }).executionId]);
    expect(admission.phase).toBe('HOLD');
    expect(admission.hold_reason).toBe('CANCELLED');
  });

  it('suspended BEGIN: the mirror tx aborts at the absolute deadline, the session is discarded and nothing lands late', async () => {
    process.env.CHANJET_READONLY_SYNC_ENABLED = 'true';
    process.env.CHANJET_SYNC_POLICY = 'READONLY_VERIFY';
    await liveSyncingExecution(4_000);
    const before = await mirrorCounts();
    // hold the REAL BEGIN protocol frame: the transaction genuinely never
    // reaches the server
    // hold the REAL transaction-start frame: the transaction genuinely never
    // reaches the server (the shared tx opens through TypeORM's
    // startTransaction; the pid query on the same session is its marker)
    proxy!.armHold('START TRANSACTION');
    const state = {
      manifest: current.manifest, store,
      gateway: new ChanjetExecutionHttpGateway(store, current.manifest),
      transport: { resend: async () => { throw new Error('FORBIDDEN'); } },
      deadlineAt: current.deadlineAt, current,
    };
    const started = Date.now();
    // the endpoint failure surfaces as a RESOLVED FAIL result carrying the
    // verbatim UNKNOWN code (the endpoint loop never rejects)
    const outcome = await withExecutionScope(state, () => withReadonlyOrchestration('SYNTHETIC_MIRROR_RUN', () => proxyIntegration.syncReadOnlyMirror(['RECEIVABLE_STATISTICS'], BOOK, PERIOD)));
    expect(outcome.results[0]).toMatchObject({ key: 'RECEIVABLE_STATISTICS', bookId: BOOK, status: 'FAIL', error: 'CHANJET_EXECUTION_TERMINAL_UNKNOWN' });
    expect(Date.now() - started).toBeLessThan(10_000); // timely termination, not a hang
    proxy!.armHold(''); // disarm: the connection recovers
    expect(proxy!.heldFrames().some((f) => f.trim().toUpperCase() === 'START TRANSACTION')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    // no late commit after the connection recovers
    const after = await mirrorCounts();
    expect(after).toEqual(before);
    // the durable evidence: the job is FAIL with the UNKNOWN code, never SUCCESS
    const [jobRow] = await ds.query(
      `SELECT status, error_message FROM chanjet_sync_jobs
         WHERE job_type='SNAPSHOT' AND book_id=$1 AND period=$2 ORDER BY id DESC LIMIT 1`, [BOOK, PERIOD]);
    expect(jobRow?.status).toBe('FAIL');
    expect(String(jobRow?.error_message || '')).toContain('CHANJET_EXECUTION_TERMINAL_UNKNOWN');
    // the suspended backend was terminated: the newest proxy session pid is gone
    const pid = proxy!.heldPids().pop();
    expect(pid).toBeTruthy();
    const gone = await ds.query('SELECT 1 FROM pg_stat_activity WHERE pid=$1', [pid]);
    expect(gone.length).toBe(0);
    const [admission] = await ds.query('SELECT phase, hold_reason FROM chanjet_execution_admissions WHERE execution_id=$1', [(current.manifest as { executionId: string }).executionId]);
    expect(admission.phase).toBe('SYNCING'); // never VERIFIED by an aborted tx
  }, 30_000);

  it('withheld COMMIT: the outcome is reported UNKNOWN, the backend is terminated and no terminal write lands late', async () => {
    process.env.CHANJET_READONLY_SYNC_ENABLED = 'true';
    process.env.CHANJET_SYNC_POLICY = 'READONLY_VERIFY';
    await liveSyncingExecution(4_000);
    const before = await mirrorCounts();
    // the tx runs fully but the REAL COMMIT frame is withheld: the commit
    // genuinely never reaches the server while the code races the deadline
    proxy!.armHold('COMMIT');
    const state = {
      manifest: current.manifest, store,
      gateway: new ChanjetExecutionHttpGateway(store, current.manifest),
      transport: { resend: async () => { throw new Error('FORBIDDEN'); } },
      deadlineAt: current.deadlineAt, current,
    };
    const started = Date.now();
    const outcome = await withExecutionScope(state, () => withReadonlyOrchestration('SYNTHETIC_MIRROR_RUN', () => proxyIntegration.syncReadOnlyMirror(['RECEIVABLE_STATISTICS'], BOOK, PERIOD)));
    expect(outcome.results[0]).toMatchObject({ key: 'RECEIVABLE_STATISTICS', bookId: BOOK, status: 'FAIL', error: 'CHANJET_EXECUTION_TERMINAL_UNKNOWN' });
    expect(Date.now() - started).toBeLessThan(10_000);
    proxy!.armHold('');
    expect(proxy!.heldFrames().some((f) => f.trim().toUpperCase() === 'COMMIT')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    // the uncommitted writes NEVER land: the backend was terminated before
    // the commit could complete
    const after = await mirrorCounts();
    expect(after).toEqual(before);
    const [jobRow] = await ds.query(
      `SELECT status, error_message FROM chanjet_sync_jobs
         WHERE job_type='SNAPSHOT' AND book_id=$1 AND period=$2 ORDER BY id DESC LIMIT 1`, [BOOK, PERIOD]);
    expect(jobRow?.status).toBe('FAIL');
    expect(String(jobRow?.error_message || '')).toContain('CHANJET_EXECUTION_TERMINAL_UNKNOWN');
    const pid = proxy!.heldPids().pop();
    expect(pid).toBeTruthy();
    const gone = await ds.query('SELECT 1 FROM pg_stat_activity WHERE pid=$1', [pid]);
    expect(gone.length).toBe(0);
  }, 30_000);

  it('cancellation channel auth failure: terminate is denied, the socket destroy escalates and the discard is confirmed', async () => {
    process.env.CHANJET_READONLY_SYNC_ENABLED = 'true';
    process.env.CHANJET_SYNC_POLICY = 'READONLY_VERIFY';
    await liveSyncingExecution(4_000);
    const before = await mirrorCounts();
    proxy!.armHold('COMMIT');
    const state = {
      manifest: current.manifest, store,
      gateway: new ChanjetExecutionHttpGateway(store, current.manifest),
      transport: { resend: async () => { throw new Error('FORBIDDEN'); } },
      deadlineAt: current.deadlineAt, current,
    };
    // the cancellation channel authenticates as the LIMITED role:
    // pg_terminate_backend on the mirror backend is DENIED — the physical
    // socket discard (already first) is the escalation that stops the backend
    const started = Date.now();
    const outcome = await withExecutionScope(state, () => withReadonlyOrchestration('SYNTHETIC_MIRROR_RUN', () => limitedIntegration.syncReadOnlyMirror(['RECEIVABLE_STATISTICS'], BOOK, PERIOD)));
    expect(outcome.results[0]).toMatchObject({ key: 'RECEIVABLE_STATISTICS', bookId: BOOK, status: 'FAIL', error: 'CHANJET_EXECUTION_TERMINAL_UNKNOWN' });
    expect(Date.now() - started).toBeLessThan(12_000);
    proxy!.armHold('');
    await new Promise((resolve) => setTimeout(resolve, 500));
    const after = await mirrorCounts();
    expect(after).toEqual(before);
    // the discard is CONFIRMED by an authorized observer: the backend is gone
    const pid = proxy!.heldPids().pop();
    expect(pid).toBeTruthy();
    const gone = await ds.query('SELECT 1 FROM pg_stat_activity WHERE pid=$1', [pid]);
    expect(gone.length).toBe(0);
    expect(proxy!.closedSessions()).toBeGreaterThanOrEqual(1); // the mirror session socket was destroyed
  }, 30_000);

  it('suspended PID query: the mirror tx aborts before any business SQL, releases the session and nothing lands', async () => {
    process.env.CHANJET_READONLY_SYNC_ENABLED = 'true';
    process.env.CHANJET_SYNC_POLICY = 'READONLY_VERIFY';
    await liveSyncingExecution(4_000);
    const before = await mirrorCounts();
    // hold the REAL PID-query frame: the transaction identity never arrives
    proxy!.armHold('SELECT pg_backend_pid() AS pid');
    const state = {
      manifest: current.manifest, store,
      gateway: new ChanjetExecutionHttpGateway(store, current.manifest),
      transport: { resend: async () => { throw new Error('FORBIDDEN'); } },
      deadlineAt: current.deadlineAt, current,
    };
    const started = Date.now();
    const outcome = await withExecutionScope(state, () => withReadonlyOrchestration('SYNTHETIC_MIRROR_RUN', () => proxyIntegration.syncReadOnlyMirror(['RECEIVABLE_STATISTICS'], BOOK, PERIOD)));
    expect(outcome.results[0]).toMatchObject({ key: 'RECEIVABLE_STATISTICS', bookId: BOOK, status: 'FAIL' });
    expect(Date.now() - started).toBeLessThan(10_000); // late acquisition aborts — it never hangs
    proxy!.armHold('');
    expect(proxy!.heldFrames().some((f) => f.includes('pg_backend_pid'))).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    // NO business SQL ran after the late acquisition
    const after = await mirrorCounts();
    expect(after).toEqual(before);
    const [jobRow] = await ds.query(
      `SELECT status FROM chanjet_sync_jobs
         WHERE job_type='SNAPSHOT' AND book_id=$1 AND period=$2 ORDER BY id DESC LIMIT 1`, [BOOK, PERIOD]);
    expect(jobRow?.status).toBe('FAIL');
    // the suspended session was force-released: its backend is gone
    const pid = proxy!.heldPids().pop();
    expect(pid).toBeTruthy();
    const gone = await ds.query('SELECT 1 FROM pg_stat_activity WHERE pid=$1', [pid]);
    expect(gone.length).toBe(0);
  }, 30_000);

  it('exhausted pool: the late acquisition aborts before any business SQL, the late grant completes the full release lifecycle and the SAME DataSource recovers and destroys normally', async () => {
    process.env.CHANJET_READONLY_SYNC_ENABLED = 'true';
    process.env.CHANJET_SYNC_POLICY = 'READONLY_VERIFY';
    await liveSyncingExecution(4_000);
    const before = await mirrorCounts();
    // a DEDICATED single-slot pool whose ONLY client is pinned by an
    // in-flight query that completes GRACEFULLY: the helper's acquisition
    // genuinely waits on the pool and the late grant can be observed end to
    // end without killing any backend
    const poolDs = new DataSource({ type: 'postgres', url: proxyUrl, logging: false, poolSize: 1, entities: mirrorEntities });
    await poolDs.initialize();
    let businessSqlRan = false;
    let pin: import('typeorm').QueryRunner | undefined;
    try {
      pin = poolDs.createQueryRunner();
      await pin.connect();
      void pin.query('SELECT pg_sleep(5)').catch(() => undefined); // pins the only slot
      await new Promise((resolve) => setTimeout(resolve, 200)); // let the sleep take the client
      const poolIntegration = new ChanjetIntegrationService(
        auth, poolDs,
        poolDs.getRepository(ChanjetAccountBookEntity),
        poolDs.getRepository(ChanjetApiFieldCatalogEntity),
        poolDs.getRepository(ChanjetMasterMappingEntity),
        poolDs.getRepository(ChanjetSyncJobEntity),
        poolDs.getRepository(ChanjetBookCompanyMapEntity),
        poolDs.getRepository(ChanjetVoucherDraftEntity),
        poolDs.getRepository(ChanjetReconciliationResultEntity),
        poolDs.getRepository(ChanjetReadSnapshotEntity),
        poolDs.getRepository(ChanjetEntitySnapshotEntity),
        poolDs.getRepository(ChanjetErpFieldMappingEntity),
        poolDs.getRepository(ChanjetWritebackOutboxEntity),
      );
      const boundTx = poolIntegration as unknown as {
        runExecutionBoundWriteTx: <T>(scope: unknown, logTag: string, work: (runner: unknown) => Promise<T>) => Promise<T>;
      };
      const started = Date.now();
      await expect(boundTx.runExecutionBoundWriteTx(current, 'POOL_WAIT_SPEC', async () => {
        businessSqlRan = true;
        return {};
      })).rejects.toThrow('CHANJET_EXECUTION_DEADLINE');
      expect(Date.now() - started).toBeLessThan(10_000); // the pool wait aborts in time
      expect(businessSqlRan).toBe(false); // the late acquisition never reached the business write
      const after = await mirrorCounts();
      expect(after).toEqual(before);
      // the sleep completes GRACEFULLY at ~T0+5s: the LATE grant lands and
      // the helper completes the runner's FULL release lifecycle — TypeORM's
      // connectedQueryRunners tracking is cleaned (only the PIN's own runner
      // remains tracked) and the client returns to the pool through the
      // pool's own callback
      await new Promise((resolve) => setTimeout(resolve, 1_800));
      const tracking = (poolDs.driver as unknown as { connectedQueryRunners?: unknown[] }).connectedQueryRunners;
      expect(tracking?.length ?? 0).toBe(1); // ONLY the pin's own runner remains tracked
    } finally {
      await pin?.release().catch(() => undefined);
    }
    // the SAME DataSource recovered: queries work and the destroy settles
    // NORMALLY (no isInitialized mutation, no skipped close, no stubs)
    const [row] = await poolDs.query('SELECT 1 AS ok') as Array<{ ok: number }>;
    expect(row?.ok).toBe(1);
    expect(poolDs.isInitialized).toBe(true);
    // a queued late grant may land while the pin releases: its full release
    // lifecycle (tracking splice included) settles within this window
    await new Promise((resolve) => setTimeout(resolve, 300));
    const tracked = (poolDs.driver as unknown as { connectedQueryRunners?: unknown[] }).connectedQueryRunners ?? [];
    expect(tracked.length).toBe(0); // TypeORM's tracking is fully cleaned
    await poolDs.destroy();
    expect(poolDs.isInitialized).toBe(false);
  }, 45_000);

  it('COMMIT forwarded and durably landed with only the response lost: UNKNOWN, the committed rows are present', async () => {
    process.env.CHANJET_READONLY_SYNC_ENABLED = 'true';
    process.env.CHANJET_SYNC_POLICY = 'READONLY_VERIFY';
    await liveSyncingExecution(4_000);
    // the REAL COMMIT frame REACHES the server (it commits) but the verdict
    // never comes back — the genuinely unknown commit outcome
    proxy!.armResponseWithhold('COMMIT');
    const state = {
      manifest: current.manifest, store,
      gateway: new ChanjetExecutionHttpGateway(store, current.manifest),
      transport: { resend: async () => { throw new Error('FORBIDDEN'); } },
      deadlineAt: current.deadlineAt, current,
    };
    const started = Date.now();
    const outcome = await withExecutionScope(state, () => withReadonlyOrchestration('SYNTHETIC_MIRROR_RUN', () => proxyIntegration.syncReadOnlyMirror(['RECEIVABLE_STATISTICS'], BOOK, PERIOD)));
    expect(outcome.results[0]).toMatchObject({ key: 'RECEIVABLE_STATISTICS', bookId: BOOK, status: 'FAIL', error: 'CHANJET_EXECUTION_TERMINAL_UNKNOWN' });
    expect(Date.now() - started).toBeLessThan(10_000);
    proxy!.armResponseWithhold('');
    expect(proxy!.withheldResponseFrames()).toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve, 500));
    // THE COMMIT LANDED: the aggregate upsert refreshes last_seen_at on every
    // committed write — the fixture customers' rows carry a freshness from
    // THIS run although the code reported UNKNOWN (accurate uncertainty,
    // never a false rollback); the read snapshot is an idempotent upsert, so
    // ROW COUNTS do not move across executions
    const landed = await ds.query(
      `SELECT external_id, last_seen_at FROM chanjet_entity_snapshots
         WHERE book_id=$1 AND endpoint_key=$2 AND period=$3 ORDER BY external_id`,
      [BOOK, 'RECEIVABLE_STATISTICS', PERIOD]);
    expect(landed.map((r: { external_id: string }) => r.external_id).sort()).toEqual(['E1', 'E2']);
    for (const row of landed) {
      expect(new Date(row.last_seen_at).getTime()).toBeGreaterThan(started);
    }
    // the durable evidence keeps the UNKNOWN verdict for operator review
    const [jobRow] = await ds.query(
      `SELECT status, error_message FROM chanjet_sync_jobs
         WHERE job_type='SNAPSHOT' AND book_id=$1 AND period=$2 ORDER BY id DESC LIMIT 1`, [BOOK, PERIOD]);
    expect(jobRow?.status).toBe('FAIL');
    expect(String(jobRow?.error_message || '')).toBe('CHANJET_EXECUTION_TERMINAL_UNKNOWN');
    // the aborted session's backend is gone (terminate succeeded post-commit)
    const pid = proxy!.responseWithheldPids().pop();
    expect(pid).toBeTruthy();
    const gone = await ds.query('SELECT 1 FROM pg_stat_activity WHERE pid=$1', [pid]);
    expect(gone.length).toBe(0);
  }, 30_000);

  it('shared tx ownership: a save succeeding before an explicit throw leaves ZERO rows (no early commit)', async () => {
    process.env.CHANJET_READONLY_SYNC_ENABLED = 'true';
    process.env.CHANJET_SYNC_POLICY = 'READONLY_VERIFY';
    await liveSyncingExecution(4_000);
    const tag = randomUUID().replace(/-/g, '').slice(0, 8);
    const boundTx = proxyIntegration as unknown as {
      runExecutionBoundWriteTx: <T>(scope: unknown, logTag: string, work: (runner: unknown) => Promise<T>) => Promise<T>;
    };
    const state = {
      manifest: current.manifest, store,
      gateway: new ChanjetExecutionHttpGateway(store, current.manifest),
      transport: { resend: async () => { throw new Error('FORBIDDEN'); } },
      deadlineAt: current.deadlineAt, current,
    };
    // two repository saves share the shared tx's transaction: when the work
    // throws AFTER both saves succeeded, the batch must roll back to ZERO
    // rows. If save() managed its own transaction (isTransactionActive
    // inconsistent), the first save would have committed early and survived.
    await expect(boundTx.runExecutionBoundWriteTx(state, 'OWNERSHIP_SPEC', async (runner) => {
      const runnerTyped = runner as import('typeorm').QueryRunner;
      const repo = runnerTyped.manager.getRepository(ChanjetReconciliationResultEntity);
      for (const n of [1, 2]) {
        await repo.save(repo.create({
          reconciliationType: 'MASTER_MAPPING', companyCode: '', bookId: BOOK, period: '',
          status: 'WARN', severity: 'MEDIUM', subjectType: 'CUSTOMER',
          subjectKey: `${tag}-${n}`, subjectName: '', erpValue: {}, chanjetValue: {},
          diffSummary: 'ownership probe', actionRequired: 'none', resolved: false,
          resolvedBy: null, resolvedAt: null,
        } as never));
      }
      throw new Error('AFTER_SAVE');
    })).rejects.toThrow('AFTER_SAVE');
    const [after] = await ds.query('SELECT count(*)::int AS n FROM chanjet_reconciliation_results WHERE subject_key LIKE $1', [`${tag}-%`]);
    expect(after.n).toBe(0); // the whole batch rolled back — no early commit
  }, 30_000);

  it('shared tx ownership: a LATER save failing rolls the earlier save back', async () => {
    process.env.CHANJET_READONLY_SYNC_ENABLED = 'true';
    process.env.CHANJET_SYNC_POLICY = 'READONLY_VERIFY';
    await liveSyncingExecution(4_000);
    const tag = randomUUID().replace(/-/g, '').slice(0, 8);
    const boundTx = proxyIntegration as unknown as {
      runExecutionBoundWriteTx: <T>(scope: unknown, logTag: string, work: (runner: unknown) => Promise<T>) => Promise<T>;
    };
    const state = {
      manifest: current.manifest, store,
      gateway: new ChanjetExecutionHttpGateway(store, current.manifest),
      transport: { resend: async () => { throw new Error('FORBIDDEN'); } },
      deadlineAt: current.deadlineAt, current,
    };
    // the second save violates a column limit: the earlier save in the SAME
    // shared tx must roll back with it (one owner, one atomic batch)
    await expect(boundTx.runExecutionBoundWriteTx(state, 'OWNERSHIP_SPEC', async (runner) => {
      const runnerTyped = runner as import('typeorm').QueryRunner;
      const repo = runnerTyped.manager.getRepository(ChanjetReconciliationResultEntity);
      await repo.save(repo.create({
        reconciliationType: 'MASTER_MAPPING', companyCode: '', bookId: BOOK, period: '',
        status: 'WARN', severity: 'MEDIUM', subjectType: 'CUSTOMER',
        subjectKey: `${tag}-ok`, subjectName: '', erpValue: {}, chanjetValue: {},
        diffSummary: 'ownership probe', actionRequired: 'none', resolved: false,
        resolvedBy: null, resolvedAt: null,
      } as never));
      await repo.save(repo.create({
        reconciliationType: 'MASTER_MAPPING', companyCode: '', bookId: BOOK, period: '',
        status: 'WARN', severity: 'MEDIUM', subjectType: 'CUSTOMER',
        subjectKey: `${tag}-overflow`, subjectName: 'x'.repeat(400), erpValue: {}, chanjetValue: {},
        diffSummary: 'ownership probe', actionRequired: 'none', resolved: false,
        resolvedBy: null, resolvedAt: null,
      } as never));
      return {};
    })).rejects.toThrow();
    const [after] = await ds.query('SELECT count(*)::int AS n FROM chanjet_reconciliation_results WHERE subject_key LIKE $1', [`${tag}-%`]);
    expect(after.n).toBe(0); // the earlier save rolled back with the failing one
  }, 30_000);

  it('COMMIT verdict classification: an explicit server rejection (23505) is fail-closed and lands ZERO rows', async () => {
    process.env.CHANJET_READONLY_SYNC_ENABLED = 'true';
    process.env.CHANJET_SYNC_POLICY = 'READONLY_VERIFY';
    await liveSyncingExecution(4_000);
    const before = await mirrorCounts();
    // the COMMIT frame is withheld (nothing commits server-side) and the
    // client receives a REAL wire-format ErrorResponse with SQLSTATE 23505 —
    // a proven rollback: fail-closed, never UNKNOWN
    proxy!.armCommitVerdict('23505');
    const state = {
      manifest: current.manifest, store,
      gateway: new ChanjetExecutionHttpGateway(store, current.manifest),
      transport: { resend: async () => { throw new Error('FORBIDDEN'); } },
      deadlineAt: current.deadlineAt, current,
    };
    const started = Date.now();
    const outcome = await withExecutionScope(state, () => withReadonlyOrchestration('SYNTHETIC_MIRROR_RUN', () => proxyIntegration.syncReadOnlyMirror(['RECEIVABLE_STATISTICS'], BOOK, PERIOD)));
    expect(outcome.results[0]).toMatchObject({ key: 'RECEIVABLE_STATISTICS', bookId: BOOK, status: 'FAIL', error: 'CHANJET_EXECUTION_TX_COMMIT_FAILED' });
    expect(Date.now() - started).toBeLessThan(10_000);
    proxy!.armCommitVerdict('');
    const after = await mirrorCounts();
    expect(after).toEqual(before); // the frame never reached the server: zero rows
    const pid = proxy!.verdictInjectedPids().pop();
    expect(pid).toBeTruthy();
    const gone = await ds.query('SELECT 1 FROM pg_stat_activity WHERE pid=$1', [pid]);
    expect(gone.length).toBe(0); // the session was discarded
  }, 30_000);

  it('COMMIT verdict classification: connection-class 08007 and completion-unknown 40003 are UNKNOWN', async () => {
    process.env.CHANJET_READONLY_SYNC_ENABLED = 'true';
    process.env.CHANJET_SYNC_POLICY = 'READONLY_VERIFY';
    for (const sqlstate of ['08007', '40003']) {
      await liveSyncingExecution(4_000);
      const before = await mirrorCounts();
      proxy!.armCommitVerdict(sqlstate);
      const state = {
        manifest: current.manifest, store,
        gateway: new ChanjetExecutionHttpGateway(store, current.manifest),
        transport: { resend: async () => { throw new Error('FORBIDDEN'); } },
        deadlineAt: current.deadlineAt, current,
      };
      const started = Date.now();
      const outcome = await withExecutionScope(state, () => withReadonlyOrchestration('SYNTHETIC_MIRROR_RUN', () => proxyIntegration.syncReadOnlyMirror(['RECEIVABLE_STATISTICS'], BOOK, PERIOD)));
      expect(outcome.results[0]).toMatchObject({ key: 'RECEIVABLE_STATISTICS', bookId: BOOK, status: 'FAIL', error: 'CHANJET_EXECUTION_TERMINAL_UNKNOWN' });
      expect(Date.now() - started).toBeLessThan(10_000);
      proxy!.armCommitVerdict('');
      const after = await mirrorCounts();
      expect(after).toEqual(before); // the frame never reached the server
      const pid = proxy!.verdictInjectedPids().pop();
      expect(pid).toBeTruthy();
      const gone = await ds.query('SELECT 1 FROM pg_stat_activity WHERE pid=$1', [pid]);
      expect(gone.length).toBe(0);
    }
  }, 60_000);

  it('COMMIT wire fault (real connection break, no verdict content): outcome is UNKNOWN and zero rows land', async () => {
    process.env.CHANJET_READONLY_SYNC_ENABLED = 'true';
    process.env.CHANJET_SYNC_POLICY = 'READONLY_VERIFY';
    await liveSyncingExecution(4_000);
    const before = await mirrorCounts();
    // a REAL wire fault: the COMMIT frame is withheld and the session's
    // sockets are destroyed — the pending commit fails with a genuine
    // client/network error carrying NO server verdict at all
    proxy!.armCommitConnectionBreak();
    const state = {
      manifest: current.manifest, store,
      gateway: new ChanjetExecutionHttpGateway(store, current.manifest),
      transport: { resend: async () => { throw new Error('FORBIDDEN'); } },
      deadlineAt: current.deadlineAt, current,
    };
    const started = Date.now();
    const outcome = await withExecutionScope(state, () => withReadonlyOrchestration('SYNTHETIC_MIRROR_RUN', () => proxyIntegration.syncReadOnlyMirror(['RECEIVABLE_STATISTICS'], BOOK, PERIOD)));
    expect(outcome.results[0]).toMatchObject({ key: 'RECEIVABLE_STATISTICS', bookId: BOOK, status: 'FAIL', error: 'CHANJET_EXECUTION_TERMINAL_UNKNOWN' });
    expect(Date.now() - started).toBeLessThan(10_000);
    proxy!.armCommitConnectionBreak();
    expect(proxy!.brokenCommitPids().length).toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const after = await mirrorCounts();
    expect(after).toEqual(before); // the frame never reached the server: zero rows
    const pid = proxy!.brokenCommitPids().pop();
    expect(pid).toBeTruthy();
    const gone = await ds.query('SELECT 1 FROM pg_stat_activity WHERE pid=$1', [pid]);
    expect(gone.length).toBe(0); // the broken session was discarded and its backend terminated
  }, 30_000);

  it('reconciliation real lock wait past the budget: zero commits and a FAIL job', async () => {
    process.env.CHANJET_READONLY_SYNC_ENABLED = 'true';
    process.env.CHANJET_SYNC_POLICY = 'READONLY_VERIFY';
    await liveSyncingExecution(4_000);
    // a mapping with an issue so the reconciliation loop has a write to make
    await ds.getRepository(ChanjetMasterMappingEntity).save({
      bookId: BOOK, mappingType: 'CUSTOMER', erpCode: 'C1', erpName: 'N1',
      chanjetId: 'E1', chanjetCode: 'C1', chanjetName: 'N1', matchStatus: 'AUTO', reviewStatus: 'REJECTED',
    } as never);
    const [before] = await ds.query('SELECT count(*)::int AS n FROM chanjet_reconciliation_results');
    // an EXTERNAL uncommitted transaction holds the admission row lock: the
    // execution-bound write path blocks on a REAL lock wait
    const external = ds.createQueryRunner();
    await external.connect();
    await external.query('BEGIN');
    await external.query(`SELECT phase FROM chanjet_execution_admissions WHERE execution_id=$1 FOR UPDATE`, [(current.manifest as { executionId: string }).executionId]);
    try {
      const state = {
        manifest: current.manifest, store,
        gateway: new ChanjetExecutionHttpGateway(store, current.manifest),
        transport: { resend: async () => { throw new Error('FORBIDDEN'); } },
        deadlineAt: current.deadlineAt, current,
      };
      const started = Date.now();
      await expect(withExecutionScope(state, () => withReadonlyOrchestration('SYNTHETIC_MIRROR_RUN', () => proxyIntegration.runMappingReconciliation({ compact: true }))))
        .rejects.toThrow();
      expect(Date.now() - started).toBeLessThan(10_000); // the lock wait is terminated in time
      const [after] = await ds.query('SELECT count(*)::int AS n FROM chanjet_reconciliation_results');
      expect(after.n).toBe(before.n); // ZERO commits past the deadline
      // the lock was held at the entry gate — the refusal precedes the job
      // row (no job evidence exists for a refused entry)
      const [jobRow] = await ds.query(`SELECT status FROM chanjet_sync_jobs WHERE job_type='RECONCILE' ORDER BY id DESC LIMIT 1`);
      expect(jobRow ?? undefined).toBeUndefined();
    } finally {
      await external.query('ROLLBACK').catch(() => undefined);
      await external.release().catch(() => undefined);
    }
  }, 30_000);

  it('reconciliation save latency past the budget: the pending save is rolled back and zero commits land', async () => {
    process.env.CHANJET_READONLY_SYNC_ENABLED = 'true';
    process.env.CHANJET_SYNC_POLICY = 'READONLY_VERIFY';
    await liveSyncingExecution(4_000);
    await ds.getRepository(ChanjetMasterMappingEntity).save({
      bookId: BOOK, mappingType: 'CUSTOMER', erpCode: 'C2', erpName: 'N2',
      chanjetId: 'E2', chanjetCode: 'C2', chanjetName: 'N2', matchStatus: 'AUTO', reviewStatus: 'REJECTED',
    } as never);
    const [before] = await ds.query('SELECT count(*)::int AS n FROM chanjet_reconciliation_results');
    // the save's statement REACHES the server but its verdict is withheld:
    // a REAL save latency inside the bounded transaction
    proxy!.armResponseWithhold('INSERT INTO "chanjet_reconciliation_results"');
    const state = {
      manifest: current.manifest, store,
      gateway: new ChanjetExecutionHttpGateway(store, current.manifest),
      transport: { resend: async () => { throw new Error('FORBIDDEN'); } },
      deadlineAt: current.deadlineAt, current,
    };
    const started = Date.now();
    await expect(withExecutionScope(state, () => withReadonlyOrchestration('SYNTHETIC_MIRROR_RUN', () => proxyIntegration.runMappingReconciliation({ compact: true }))))
      .rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(10_000);
    proxy!.armResponseWithhold('');
    expect(proxy!.withheldResponseFrames()).toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve, 500));
    // the pending save never committed: the backend was terminated first
    const [after] = await ds.query('SELECT count(*)::int AS n FROM chanjet_reconciliation_results');
    expect(after.n).toBe(before.n);
    const [jobRow] = await ds.query(`SELECT status FROM chanjet_sync_jobs WHERE job_type='RECONCILE' ORDER BY id DESC LIMIT 1`);
    expect(jobRow?.status).toBe('FAIL');
    const pid = proxy!.responseWithheldPids().pop();
    expect(pid).toBeTruthy();
    const gone = await ds.query('SELECT 1 FROM pg_stat_activity WHERE pid=$1', [pid]);
    expect(gone.length).toBe(0);
  }, 30_000);
});

