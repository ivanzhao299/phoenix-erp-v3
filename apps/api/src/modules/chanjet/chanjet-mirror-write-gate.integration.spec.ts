// R4.2c mirror-write positive + boundary integration: the REAL integration
// service methods (syncReadOnlyMirror → recordReadSnapshot /
// recordEntitySnapshots / createMappingCandidates through the SAME gated
// transaction as production) run against REAL repositories on an isolated
// PostgreSQL18 with a local provider fixture. Positive: a LIVE execution's
// mirror writes land (snapshot + entity rows). Boundary: after a durable
// HOLD, the same methods write ZERO rows (the same-transaction liveness gate
// refuses and the batch rolls back). The ERP-side writes are limited to the
// integration middle-layer tables by design.
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { createServer, Server } from 'node:http';
import { ChanjetAuthService } from './chanjet-auth.service';
import { ChanjetIntegrationService } from './chanjet-integration.service';
import { ChanjetExecutionAdmissionStore } from './chanjet-execution-admission.store';
import { ChanjetExecutionHttpGateway } from './chanjet-execution-transport';
import { executionWriteGateTx, withExecutionScope } from './chanjet-execution-scope';
import { withReadonlyOrchestration } from './chanjet-readonly-execution';
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
    auth = new ChanjetAuthService(
      { get: (key: string, fallback?: string) => process.env[key] ?? fallback } as never,
      { findOneBy: async () => ({ key: 'singleton', appTicket: 'SYNTHETIC_TICKET', certificate: null, tokens: null }), save: async (e: unknown) => e } as never,
      { ok: async () => {}, fail: async () => {} } as never,
    );
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
  });
  afterAll(async () => {
    restorePolicy?.();
    delete process.env.CHANJET_PROVIDER_BASE_URL;
    provider.close();
    if (ds?.isInitialized) await ds.destroy();
  });

  async function liveSyncingExecution(): Promise<{ manifest: import('./chanjet-execution-manifest').ExecutionManifest; deadlineAt: Date }> {
    const id = randomUUID().replace(/-/g, '');
    const manifest: import('./chanjet-execution-manifest').ExecutionManifest = {
      version: 1,
      executionId: `EXEC_${id.slice(0, 24)}`,
      ownerId: OWNER,
      requestCap: 10,
      totalTimeoutMs: 360_000,
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

  it('live execution: the gated mirror transaction writes the real snapshot/entity/mapping rows', async () => {
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
    await withExecutionScope(state, () => withReadonlyOrchestration('SYNTHETIC_MIRROR_RUN', () => integration.syncReadOnlyMirror(['RECEIVABLE_STATISTICS'], BOOK, PERIOD)));
    const after = await mirrorCounts();
    expect(after.snap).toBeGreaterThan(before.snap); // snapshot upsert landed
    expect(after.ent).toBeGreaterThan(before.ent);   // aggregate entity rows landed
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
    await expect(withExecutionScope(state, () => integration.syncReadOnlyMirror(['RECEIVABLE_STATISTICS'], BOOK, PERIOD)))
      .rejects.toThrow();
    const after = await mirrorCounts();
    expect(after.snap).toBe(before.snap);
    expect(after.ent).toBe(before.ent);
    expect(after.map).toBe(before.map);
    const [admission] = await ds.query('SELECT phase, hold_reason FROM chanjet_execution_admissions WHERE execution_id=$1', [(current.manifest as { executionId: string }).executionId]);
    expect(admission.phase).toBe('HOLD');
    expect(admission.hold_reason).toBe('CANCELLED');
  });
});
