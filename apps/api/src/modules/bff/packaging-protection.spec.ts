import { DataSource } from 'typeorm';
import { PackagingTerminalBffController } from './bff.controller';
import { packagingTestMode, assertPackingCanEnterInventory } from './packaging-protection';
import { ProtectPackagingVoidAndTestIsolation1789099201000 } from '../../database/migrations/1789099201000-ProtectPackagingVoidAndTestIsolation';

const real = { user: { id: 1, roles: ['ROLE_ADMIN'] } };
const test = { ...real, headers: { 'x-packaging-mode': 'test' } };

describe('packaging explicit test permission', () => {
  it('defaults administrators and SMOKE-named users to real mode', () => {
    expect(packagingTestMode(real)).toBe(false);
    expect(packagingTestMode({ user: { username: 'SMOKE' }, body: { is_test: true } })).toBe(false);
  });
  it('requires explicit administrator RBAC, not a name/body/header alone', () => {
    expect(() => packagingTestMode({ headers: test.headers, user: { permissions: ['MENU_PKG_OP:E'] } })).toThrow();
    expect(packagingTestMode(test)).toBe(true);
    expect(() => packagingTestMode({ ...real, headers: { 'x-packaging-mode': 'unknown' } })).toThrow();
  });
  it.each([{ status: 'VOID', is_test: false }, { status: 'ACTIVE', is_test: true }, {}])('blocks unsafe inventory contexts before replay: %j', async row => {
    await expect(assertPackingCanEnterInventory({ query: jest.fn().mockResolvedValue([row]) }, 'PKG-1')).rejects.toThrow();
  });
});

// Real PostgreSQL test, additionally run by V3 Regression after the complete migration chain.
// Uses a fresh isolated schema; no production connection or cleanup DML is accepted.
const dbUrl = process.env.PACKAGING_TEST_DATABASE_URL;
(dbUrl ? describe : describe.skip)('packaging protection PostgreSQL concurrency and isolation', () => {
  let ds: DataSource;
  let controller: PackagingTerminalBffController;
  const schema = `packaging_protection_${Date.now()}`;
  let realShift: number;
  let testShift: number;
  let gradingCode: string;
  let fixture = 0;
  const migration = new ProtectPackagingVoidAndTestIsolation1789099201000();

  beforeAll(async () => {
    const url = new URL(dbUrl!);
    if (process.env.NODE_ENV !== 'test' || !['localhost','127.0.0.1'].includes(url.hostname)
      || !['/packaging_test','/phoenix_erp'].includes(url.pathname)) throw new Error('Dedicated local/CI test database required');
    ds = new DataSource({ type: 'postgres', url: dbUrl, extra: { options: `-c search_path=${schema},public` }, entities: [] });
    await ds.initialize();
    await ds.query(`CREATE SCHEMA ${schema}`);
    for (const table of ['pkg_work_shifts','pkg_source_batches','pkg_grading_records','pkg_grading_source_links',
      'pkg_packing_records','pkg_handover_records','pkg_audit_logs','pkg_exceptions','pkg_label_print_logs',
      'pkg_qc_inspections','inv_batches','inv_ledger','sal_order_item_batch_allocations','store_sale_allocations','sal_store_sale_items','sal_order_items','sys_dict','brd_houses','wms_inbound']) {
      await ds.query(`CREATE TABLE ${schema}.${table} (LIKE public.${table} INCLUDING ALL)`);
    }
    // A legacy row created before this migration keeps all business values.
    const [legacy] = await ds.query(`INSERT INTO pkg_packing_records(code,total_eggs,total_boxes) VALUES ('PKG-LEGACY',30,1) RETURNING id,code,total_eggs,total_boxes`);
    const q = ds.createQueryRunner();
    try { await migration.up(q); } finally { await q.release(); }
    const [after] = await ds.query(`SELECT id,code,total_eggs,total_boxes,status,is_test FROM pkg_packing_records WHERE id=$1`, [legacy.id]);
    expect(after).toEqual({ ...legacy, status: 'ACTIVE', is_test: false });
    controller = new PackagingTerminalBffController(ds.manager, {} as never, { assertActiveHouseOwnership: async () => undefined } as never);
  }, 30000);
  afterAll(async () => { if (ds?.isInitialized) await ds.destroy(); });

  async function source(shiftId: number, req: any, qty = 60) {
    return (await controller.receiveBatch({ shiftId, batchCode: `SRC-INTEGRATION-${++fixture}`, houseCode: 'HOUSE-INTEGRATION', totalQty: qty, receivedQty: qty }, req)).data;
  }
  function packing(code: string, shiftId: number, key: string, eggs = 30) {
    return { shiftId, gradingCodes: [code], batches: [{ grade: 'GRADE_1', boxes: 1, eggs }], idempotencyKey: key };
  }

  it('builds the terminal base tables before bootstrap and reverts only protection columns', async () => {
    const q = ds.createQueryRunner();
    const emptySchema = `${schema}_empty`;
    await q.connect();
    try {
      await q.query(`CREATE SCHEMA ${emptySchema}`);
      await q.query(`SET search_path=${emptySchema}`);
      for (const table of ['pkg_source_batches','pkg_grading_records']) {
        await q.query(`CREATE TABLE ${table} (LIKE public.${table} INCLUDING ALL)`);
      }
      await migration.up(q);
      expect((await q.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema=$1 AND table_name='pkg_packing_records' AND column_name='status'`, [emptySchema]))[0].n).toBe(1);
      await migration.down(q);
      expect((await q.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema=$1 AND table_name='pkg_packing_records' AND column_name='status'`, [emptySchema]))[0].n).toBe(0);
      await migration.up(q);
    } finally {
      await q.query(`SET search_path=${schema},public`);
      await q.release();
    }
  });
  it('opens test and real shifts on the same line while default context sees only the real shift', async () => {
    realShift = (await controller.openShift({ lineId: 'LINE-INTEGRATION', shiftType: 'DAY' }, real)).data.id;
    testShift = (await controller.openShift({ lineId: 'LINE-INTEGRATION', shiftType: 'DAY', reason: 'local integration' }, test)).data.id;
    expect((await controller.getContext(real)).data.currentShift.id).toBe(realShift);
    expect((await controller.getContext(test)).data.currentShift.id).toBe(testShift);
    expect((await controller.getTodayShifts(real)).data.every((s: any) => s.is_test === false)).toBe(true);
    expect((await controller.getTodayShifts(test)).data.every((s: any) => s.is_test === true)).toBe(true);
  });
  it('keeps repeated same-house collections distinct and enforces both directions of source isolation', async () => {
    const s1 = await source(realShift, real);
    const s2 = await source(realShift, real);
    const ts = await source(testShift, test);
    expect(s1.id).not.toBe(s2.id);
    await expect(controller.receiveBatch({ shiftId: realShift, houseCode: 'HOUSE-INTEGRATION', totalQty: 30, receivedQty: 30 }, test)).rejects.toThrow();
    await expect(controller.receiveBatch({ shiftId: testShift, houseCode: 'HOUSE-INTEGRATION', totalQty: 30, receivedQty: 30 }, real)).rejects.toThrow();
    await expect(controller.receiveBatch({ shiftId: testShift, sourceInboundNo: 'REAL-INBOUND', houseCode: 'HOUSE-INTEGRATION', totalQty: 30, receivedQty: 30 }, test)).rejects.toThrow();
    await expect(controller.getPendingGradingSourceBatches(String(testShift), real)).rejects.toThrow();
    await expect(controller.getActiveGrading(String(realShift), test)).rejects.toThrow();
    const result = await controller.submitGrading({ shiftId: realShift, sourceBatchIds: [s1.id], outputs: { GRADE_1: 60 }, idempotencyKey: 'real-grading-1' }, real);
    gradingCode = result.data.code;
    await expect(controller.submitGrading({ shiftId: testShift, sourceBatchIds: [s2.id], outputs: { GRADE_1: 30 }, idempotencyKey: 'cross-test' }, test)).rejects.toThrow();
    await expect(controller.submitGrading({ shiftId: realShift, sourceBatchIds: [ts.id], outputs: { GRADE_1: 30 }, idempotencyKey: 'cross-real' }, real)).rejects.toThrow();
    expect((await controller.getTodaySourceBatches(real)).data.every((s: any) => !s.is_test)).toBe(true);
    expect((await controller.getTodaySourceBatches(test)).data.every((s: any) => s.is_test)).toBe(true);
  });
  it('serializes concurrent packing replay and rejects a distinct-key overspend', async () => {
    const payload = packing(gradingCode, realShift, 'real-packing-1', 60);
    const results = await Promise.all([controller.submitPacking(payload, real), controller.submitPacking(payload, real)]);
    expect(results.map(r => r.data.idempotentReplay).sort()).toEqual([false,true]);
    expect(results[0].data.code).toBe(results[1].data.code);
    await expect(controller.submitPacking({ ...payload, idempotencyKey: 'overspend' }, real)).rejects.toThrow('剩余量');
    await expect(controller.submitPacking({ ...payload, batches: [{ grade: 'GRADE_1', eggs: 30, boxes: 1 }] }, real)).rejects.toThrow('不同包装载荷');
    expect((await controller.getActiveGrading(String(realShift), real)).data.remaining.GRADE_1).toBe(0);
  });
  it('allows only one of two simultaneous distinct-key spends against the same grading', async () => {
    const src = await source(realShift, real, 30);
    const g = await controller.submitGrading({ shiftId: realShift, sourceBatchIds: [src.id], outputs: { GRADE_1: 30 }, idempotencyKey: 'race-grading' }, real);
    const results = await Promise.allSettled([
      controller.submitPacking(packing(g.data.code, realShift, 'race-a'), real),
      controller.submitPacking(packing(g.data.code, realShift, 'race-b'), real),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    const success = results.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<any>;
    await controller.voidPacking(success.value.data.code, { reason: 'local race ended' }, real);
  });
  it('VOID is audited, releases effective quantity, refuses replay and cannot re-enter inventory', async () => {
    const [row] = await ds.query(`SELECT * FROM pkg_packing_records WHERE idempotency_key='real-packing-1'`);
    const results = await Promise.all([controller.voidPacking(row.code, { reason: 'integration' }, real), controller.voidPacking(row.code, { reason: 'integration' }, real)]);
    expect(results.map(r => r.data.idempotentReplay).sort()).toEqual([false,true]);
    expect((await controller.getActiveGrading(String(realShift), real)).data.remaining.GRADE_1).toBe(90);
    expect((await controller.getShiftSummary(undefined as any, String(realShift), real)).data.shiftPackedEggs).toBe(0);
    await expect(controller.submitPacking(packing(gradingCode, realShift, 'real-packing-1', 60), real)).rejects.toThrow('作废包装');
    await expect(assertPackingCanEnterInventory(ds.manager, row.code)).rejects.toThrow();
    const [audit] = await ds.query(`SELECT count(*)::int AS n FROM pkg_audit_logs WHERE entity_id=$1 AND action='VOID'`, [row.code]);
    expect(audit.n).toBe(1);
  });
  it('blocks VOID for direct handover, inventory, or ledger dependencies', async () => {
    for (const kind of ['handover','inventory','ledger']) {
      const s = await source(realShift, real, 30);
      const g = await controller.submitGrading({ shiftId: realShift, sourceBatchIds: [s.id], outputs: { GRADE_1: 30 }, idempotencyKey: `grading-${kind}` }, real);
      const p = await controller.submitPacking(packing(g.data.code, realShift, `packing-${kind}`), real);
      if (kind === 'handover') await ds.query(`INSERT INTO pkg_handover_records(code,packing_code) VALUES ($1,$2)`, [`WH-${kind}`,p.data.code]);
      // Minimal direct reference evidence; only fixture tables in the isolated schema.
      if (kind === 'inventory') await ds.query(`INSERT INTO inv_batches(batch_no,product_code,company_code,qty,qty_available,source_no) VALUES ($1,'P','C',30,30,$2)`, [`B-${kind}`,p.data.code]);
      if (kind === 'ledger') await ds.query(`INSERT INTO inv_ledger(batch_no,change_type,qty_change,ref_no) VALUES ('B-L','PACKAGING_INBOUND',30,$1)`, [p.data.code]);
      await expect(controller.voidPacking(p.data.code, { reason: 'blocked' }, real)).rejects.toThrow('逆向业务');
    }
  });
  it('test data never enters inventory and controlled closure is audited and prevents new submissions', async () => {
    const ts = await source(testShift, test);
    const g = await controller.submitGrading({ shiftId: testShift, sourceBatchIds: [ts.id], outputs: { GRADE_1: 60 }, idempotencyKey: 'test-grading-1' }, test);
    const p = await controller.submitPacking(packing(g.data.code, testShift, 'test-packing-1'), test);
    await expect(controller.submitPacking(packing(g.data.code, realShift, 'cross-mode-packing'), real)).rejects.toThrow();
    await expect(assertPackingCanEnterInventory(ds.manager, p.data.code)).rejects.toThrow();
    await expect(controller.confirmHandover({ packingCode: p.data.code }, test)).rejects.toThrow();
    expect((await controller.getPackingTrace(p.data.code, real)).data).toBeNull();
    expect((await controller.getPendingSourceBatches(test)).data).toEqual([]);
    await expect(controller.closeShift(String(testShift), {}, test)).rejects.toThrow('受控结束');
    await controller.endTestShift(String(testShift), { reason: 'complete integration' }, test);
    await expect(source(testShift, test)).rejects.toThrow('已关闭');
    await expect(controller.submitPacking(packing(g.data.code, testShift, 'after-close'), test)).rejects.toThrow('已关闭');
    expect((await controller.getContext(real)).data.currentShift.id).toBe(realShift);
    const [audit] = await ds.query(`SELECT count(*)::int AS n FROM pkg_audit_logs WHERE action='TEST_END'`);
    expect(audit.n).toBe(1);
    const q = ds.createQueryRunner();
    try { await expect(migration.down(q)).rejects.toThrow('rollback blocked'); } finally { await q.release(); }
  });
});
