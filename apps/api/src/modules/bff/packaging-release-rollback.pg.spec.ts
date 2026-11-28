import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { resolve } from 'path';
import { PackagingHistoryService } from './packaging-history.service';
import { PackagingHandoverService } from './packaging-handover.service';
import { PackagingBoxService } from './packaging-box.service';
import { PackagingWorkflowPolicy } from './packaging-workflow-policy';
import { PackagingInventoryIntegrationService } from '../sales-v2/services/packaging-inventory-integration.service';
import { EggInventoryService } from '../sales-v2/services/egg-inventory.service';
import { packingHistoryFixture } from './packaging-history.fixture';
import { PackagingTerminalBffController } from './bff.controller';

/**
 * Release/rollback drill against the isolated PG18 history fixture. This exercises
 * the compatibility rule that a previously committed handover remains readable
 * and idempotently replayable after operational policy flags are closed.
 */
(process.env.PACKAGING_HISTORY_PG === '1' ? describe : describe.skip)('packaging release rollback PG18', () => {
  let ds: DataSource;
  let f: Awaited<ReturnType<typeof packingHistoryFixture>>;
  let history: PackagingHistoryService;
  let workflow: PackagingHandoverService;
  let baselineWorkflow: PackagingHandoverService;
  let BaselineHandover: typeof PackagingHandoverService;
  let BaselineInventory: typeof PackagingInventoryIntegrationService;
  let policy: PackagingWorkflowPolicy;

  beforeAll(async () => {
    const url = process.env.PACKAGING_HISTORY_TEST_DATABASE_URL;
    const parsed = url ? new URL(url) : null;
    if (process.env.NODE_ENV !== 'test' || !parsed || !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
        parsed.port !== '54329' || parsed.pathname !== '/packaging_history_test') {
      throw Error('EXPLICIT_LOCAL_PG18_HISTORY_TEST_URL_REQUIRED');
    }
    ds = new DataSource({ type: 'postgres', url, database: 'packaging_history_test', entities: [], logging: false });
    await ds.initialize();
    expect(Number((await ds.query('SHOW server_version_num'))[0].server_version_num)).toBeGreaterThanOrEqual(180000);
    const baselineRoot = process.env.PACKAGING_BASELINE_WORKTREE;
    if (!baselineRoot) throw Error('EXPLICIT_PACKAGING_BASELINE_WORKTREE_REQUIRED');
    const revision = execFileSync('git', ['-C',baselineRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
    expect(revision).toBe('562ac964b63db7fde176bd275a419ff6f6054754');
    const modules = resolve(baselineRoot,'apps/api/src/modules');
    BaselineHandover = require(resolve(modules,'bff/packaging-handover.service.ts')).PackagingHandoverService;
    BaselineInventory = require(resolve(modules,'sales-v2/services/packaging-inventory-integration.service.ts')).PackagingInventoryIntegrationService;
  });

  afterAll(async () => { await ds?.destroy(); });

  beforeEach(async () => {
    f = await packingHistoryFixture(ds);
    const scopes = { resolve: async () => f.scope };
    history = new PackagingHistoryService(ds.manager, scopes as any);
    policy = new PackagingWorkflowPolicy(ds.manager);
    const openPolicy = { version: 'DRILL-OPEN', R: true, B: true, P: true, V: true, H: true, Q: true,
      encodingVersion: 'TEST-NON-BUSINESS-v1', receiptMode: 'C' } as const;
    policy.get = () => openPolicy as any;
    const cls = { get: (key: string) => key === 'dataScope' ? f.scope : { username: 'TEST' } };
    const inventory = new PackagingInventoryIntegrationService(ds, cls as any,
      new EggInventoryService(ds, cls as any), { resolveMode: async () => 'PACKAGING_INBOUND' } as any);
    workflow = new PackagingHandoverService(history, new PackagingBoxService(), policy, inventory);
    const baselineInventory = new BaselineInventory(ds, cls as any,
      new EggInventoryService(ds, cls as any), { resolveMode: async () => 'PACKAGING_INBOUND' } as any);
    baselineWorkflow = new BaselineHandover(history, new PackagingBoxService(), policy, baselineInventory);
  });

  async function command(action: string, body: any, key = randomUUID()) {
    const detail = await workflow.detail(f.prefix, f.req);
    return workflow.command(action, f.prefix, key, { expectedRevision: detail.revision, ...body }, f.req);
  }

  async function prepareConfirmBody() {
    await command('REGISTER', { registrationKind: 'FIRST_LABEL_CONFIRMED', reason: 'rollback drill fixture',
      items: f.outputs.map((_, outputOrdinal) => ({ outputOrdinal, boxOrdinal: 1, declaration: 'TEST fixture' })) });
    let detail = await workflow.detail(f.prefix, f.req);
    const verificationIds: string[] = [];
    for (const purpose of ['LABEL_CHECK', 'HANDOVER']) {
      const session = await command('SESSION', { purpose });
      for (const box of detail.boxes) {
        const labelCode = box.labels.find((label: any) => label.kind === 'CANONICAL').code;
        if (purpose === 'LABEL_CHECK') await command('PRINT', { boxId: box.boxId, labelCode, printType: 'NORMAL', copies: 1, templateVersion: 'TEST' });
        const scan = await command('SCAN', { boxId: box.boxId, labelCode, purpose, method: 'MANUAL', sessionId: session.eventId });
        if (purpose === 'HANDOVER') verificationIds.push(scan.eventId);
      }
      detail = await workflow.detail(f.prefix, f.req);
    }
    return { expectedRevision: detail.revision, productionDate: detail.record.productionDate, shiftId: f.shiftId,
      boxIds: detail.boxes.map((box: any) => box.boxId).sort(), verificationIds: verificationIds.sort(),
      warehouseCode: f.warehouse, locationCode: f.location, receiverUserId: f.actor };
  }

  async function stockAndReceiptCounts() {
    const [counts] = await ds.query(`SELECT
      (SELECT count(*)::int FROM inv_batches WHERE packaging_batch_ref=$1) AS batches,
      (SELECT count(*)::int FROM inv_ledger WHERE ref_no=$1) AS ledger,
      (SELECT count(*)::int FROM pkg_handover_records WHERE packing_code=$1) AS receipts`, [f.prefix]);
    return counts;
  }

  it.each(['baseline','candidate'] as const)('%s posts; both versions preserve the receipt after policy closure', async version => {
    const body = await prepareConfirmBody();
    const idempotencyKey = randomUUID();
    const writer = version==='baseline' ? baselineWorkflow : workflow;
    const originalReceipt = await writer.command('CONFIRM', f.prefix, idempotencyKey, body, f.req);
    expect(originalReceipt.receiptState).toBe('RECORDED');
    const postedCounts = await stockAndReceiptCounts();
    expect(postedCounts).toEqual({ batches: 2, ledger: 2, receipts: 1 });
    const beforeClose = await workflow.detail(f.prefix, f.req);
    expect(beforeClose.handover.state).toBe('COMMITTED');
    // In the fixture no site policy is enabled in the database. At rollback,
    // restore the actual policy reader, which selects the persisted safe default.
    policy.get = PackagingWorkflowPolicy.prototype.get.bind(policy);
    expect(await policy.get(f.company,f.farm)).toMatchObject({H:false,B:false,P:false,V:false});
    for (const version of [workflow,baselineWorkflow]) {
      const replay = await version.command('CONFIRM', f.prefix, idempotencyKey, body, f.req);
      expect(replay).toEqual(originalReceipt);
      const afterClose = await version.detail(f.prefix, f.req);
      expect(afterClose.handover).toEqual(beforeClose.handover);
      expect(afterClose.receipt).toEqual(beforeClose.receipt);
      await expect(version.command('CONFIRM', f.prefix, randomUUID(), body, f.req)).rejects.toThrow('WORKFLOW_NOT_READY');
    }
    expect(await stockAndReceiptCounts()).toEqual(postedCounts);
  });

  it('serves the original shift from the old schema but defers a new close until the snapshot migration is ready', async () => {
    const runner = ds.createQueryRunner();
    await runner.startTransaction();
    try {
      // A connection-local shadow table reproduces the old row shape without changing the shared schema.
      await runner.query(`CREATE TEMP TABLE pkg_work_shifts (
        id integer PRIMARY KEY, site_id text, production_date date, status text, is_test boolean
      ) ON COMMIT DROP`);
      await runner.query(`INSERT INTO pkg_work_shifts(id,site_id,production_date,status,is_test)
        VALUES($1,$2,'2026-01-02','OPEN',false)`, [f.shiftId,f.farm]);
      const controller = new PackagingTerminalBffController(runner.manager, null!,
        { resolve: async () => f.scope } as any);
      await expect(controller.getExactShift(f.shiftId, '2026-01-02', f.req))
        .resolves.toMatchObject({ code:200, data:{ status:'OPEN' } });
      await expect(controller.closeShift(f.shiftId, {}, f.req)).rejects.toMatchObject({ status:503 });
      expect(await runner.query('SELECT status FROM pkg_work_shifts WHERE id=$1',[f.shiftId])).toEqual([{status:'OPEN'}]);
      expect(await stockAndReceiptCounts()).toEqual({ batches:0, ledger:0, receipts:0 });
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('applies and rolls back the real snapshot migration in an isolated schema', async () => {
    const url = process.env.PACKAGING_P1_ROLLBACK_DATABASE_URL;
    const parsed = url ? new URL(url) : null;
    if (!parsed || !['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.port !== '55432' ||
        parsed.pathname !== '/packaging_p1_rollback') throw Error('EXPLICIT_LOCAL_PG18_ROLLBACK_DATABASE_REQUIRED');
    const migrationDs = new DataSource({ type: 'postgres', url, database: 'packaging_p1_rollback', entities: [], logging: false });
    await migrationDs.initialize();
    const schema = `p1_rollback_${randomUUID().replace(/-/g, '')}`;
    const runner = migrationDs.createQueryRunner();
    const migrationModule = await import('../../database/migrations/1795800000000-PackagingShiftCloseSnapshot');
    const migration = new migrationModule.PackagingShiftCloseSnapshot1795800000000();
    try {
      await migrationDs.query(`CREATE SCHEMA ${schema}`);
      await runner.connect();
      await runner.query(`SET search_path TO ${schema}`);
      await runner.query(`CREATE TABLE pkg_work_shifts(id bigint PRIMARY KEY);
        CREATE TABLE pkg_exceptions(id bigserial PRIMARY KEY,status text,related_batch_id text);
        CREATE TABLE pkg_audit_logs(id bigserial PRIMARY KEY,action text,entity_type text,after_data text)`);
      await migration.up(runner);
      await runner.query(`INSERT INTO pkg_work_shifts(id) VALUES (71);
        INSERT INTO pkg_audit_logs(action,entity_type,after_data) VALUES ('CLOSE_SNAPSHOT','WORK_SHIFT','immutable');
        UPDATE pkg_work_shifts SET close_snapshot_id=1 WHERE id=71`);
      await expect(runner.query(`UPDATE pkg_audit_logs SET after_data='changed' WHERE id=1`)).rejects.toThrow('PACKAGING_SHIFT_CLOSE_SNAPSHOT_IMMUTABLE');
      await expect(runner.query(`DELETE FROM pkg_audit_logs WHERE id=1`)).rejects.toThrow('PACKAGING_SHIFT_CLOSE_SNAPSHOT_IMMUTABLE');
      await migration.down(runner);
      const [columns] = await runner.query(`SELECT count(*)::int n FROM information_schema.columns
        WHERE table_schema=$1 AND ((table_name='pkg_work_shifts' AND column_name='close_snapshot_id') OR
        (table_name='pkg_exceptions' AND column_name IN ('shift_id','related_kind','related_id')))` , [schema]);
      expect(columns.n).toBe(0);
      expect((await runner.query(`SELECT count(*)::int n FROM pkg_audit_logs`))[0].n).toBe(1);
    } finally {
      await runner.query(`SET search_path TO public`).catch(() => undefined);
      await runner.release();
      await migrationDs.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await migrationDs.destroy();
    }
  });
});
