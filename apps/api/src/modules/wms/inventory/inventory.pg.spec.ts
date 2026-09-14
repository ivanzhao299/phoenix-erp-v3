import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { resolve } from 'path';
import { DataSource } from 'typeorm';
import { InventoryService } from './inventory.service';
import { WmsStockBalanceEntity } from '../entities/wms-stock-balance.entity';
import { WmsStockLedgerEntity } from '../entities/wms-stock-ledger.entity';
import { WmsLocationEntity } from '../entities/wms-location.entity';

(process.env.PACKAGING_HISTORY_PG === '1' ? describe : describe.skip)('legacy inventory real PG18 contracts', () => {
  let ds: DataSource, svc: InventoryService;
  const prefix = 'TEST-WMS-' + randomUUID().slice(0, 6), store = prefix;
  const cls = { get: (k: string) => k === 'dataScope' ? { isGlobal: false, allowedWarehouseCodes: [prefix] } : k === 'user.storeCode' ? store : k === 'user.username' ? prefix : undefined };
  const dto = (batch: string, qty: number) => ({ warehouse_code: prefix, location_code: prefix, spec_code: prefix, batch_no: prefix + batch, qty, bill_no: prefix + batch, biz_type: 'TEST' });
  beforeAll(async () => {
    ds = new DataSource({ type: 'postgres', host: '127.0.0.1', port: 55432, username: 'postgres', database: 'packaging_history_test', entities: [resolve(__dirname, '../../../**/*.entity.ts')], synchronize: false, logging: false });
    await ds.initialize(); expect((await ds.query("SELECT current_database() db,current_setting('server_version_num') version"))[0]).toEqual({ db: 'packaging_history_test', version: '180006' });
    svc = new InventoryService(ds.manager, cls as any);
  });
  afterAll(async () => { if (ds?.isInitialized) await ds.destroy(); });
  const fixture = (batch: string, qty: number | null = 10, locked_qty: number | null = 0, store_code: string | null = store) => ds.getRepository(WmsStockBalanceEntity).save({ ...dto(batch, 1), qty, locked_qty, store_code });
  const state = async (batch: string) => {
    const [r] = await ds.query(`SELECT b.qty,b.locked_qty,b.version,
      (SELECT count(*)::int FROM wms_stock_ledger WHERE batch_no=b.batch_no) ledger_rows,
      (SELECT COALESCE(sum(in_qty-out_qty),0)::int FROM wms_stock_ledger WHERE batch_no=b.batch_no) delta
      FROM wms_stock_balance b WHERE batch_no=$1`, [prefix + batch]); return r;
  };
  it('NULL and normal values roundtrip in all ten nullable columns', async () => {
    const loc = ds.getRepository(WmsLocationEntity);
    await loc.save({ location_code: prefix, warehouse_code: prefix, capacity_qty: null, status: null, store_code: null });
    expect(await loc.findOneByOrFail({ location_code: prefix })).toMatchObject({ capacity_qty: null, status: null, store_code: null });
    await loc.update(prefix, { capacity_qty: 10, status: 'ACTIVE', store_code: store });
    const b = await fixture('-ROUND', null, null, null); expect(await ds.getRepository(WmsStockBalanceEntity).findOneByOrFail({ id: b.id })).toMatchObject({ qty: null, locked_qty: null, store_code: null });
    const ledger = ds.getRepository(WmsStockLedgerEntity), l = await ledger.save({ ...dto('-ROUND', 1), in_qty: null, out_qty: null, balance_qty: null, store_code: null, operator: prefix });
    expect(await ledger.findOneByOrFail({ id: l.id })).toMatchObject({ in_qty: null, out_qty: null, balance_qty: null, store_code: null });
    await ledger.update(l.id, { in_qty: 1, out_qty: 0, balance_qty: 1, store_code: store });
    expect(await ledger.findOneByOrFail({ id: l.id })).toMatchObject({ in_qty: 1, out_qty: 0, balance_qty: 1, store_code: store });
  });
  it('normal decrement/increment retains lock quantity and increments version', async () => {
    await fixture('-NORMAL', 10, 2); await svc.atomicDecrement(dto('-NORMAL', 3)); await svc.atomicIncrement(dto('-NORMAL', 5));
    expect(await state('-NORMAL')).toEqual({ qty: 12, locked_qty: 2, version: 3, ledger_rows: 2, delta: 2 });
  });
  it('concurrent 10 minus 1 and 2 equals 7 with exactly 3 outflow', async () => {
    await fixture('-RACE'); const r = await Promise.allSettled([svc.atomicDecrement(dto('-RACE', 1)), svc.atomicDecrement(dto('-RACE', 2))]);
    expect(r.every(x => x.status === 'fulfilled')).toBe(true); expect(await state('-RACE')).toEqual({ qty: 7, locked_qty: 0, version: 3, ledger_rows: 2, delta: -3 });
  });
  it('competing excessive withdrawals permit only one and never go negative', async () => {
    await fixture('-OVER'); const r = await Promise.allSettled([svc.atomicDecrement(dto('-OVER', 7)), svc.atomicDecrement(dto('-OVER', 7))]);
    expect(r.filter(x => x.status === 'fulfilled')).toHaveLength(1); expect(await state('-OVER')).toEqual({ qty: 3, locked_qty: 0, version: 2, ledger_rows: 1, delta: -7 });
  });
  it('new balance unique-key race serializes without duplicate rows or ledger loss', async () => {
    await Promise.all([svc.atomicIncrement(dto('-NEW', 1)), svc.atomicIncrement(dto('-NEW', 2))]);
    expect(await state('-NEW')).toEqual({ qty: 3, locked_qty: 0, version: 2, ledger_rows: 2, delta: 3 });
    expect((await ds.query('SELECT count(*)::int n FROM wms_stock_balance WHERE batch_no=$1', [prefix + '-NEW']))[0].n).toBe(1);
  });
  it.each([[null, 0], [10, null]])('NULL qty/locked (%s,%s) rejects both directions with no effects', async (qty, locked) => {
    const batch = '-NULL-' + (qty === null ? 'Q' : 'L'); await fixture(batch, qty, locked);
    await expect(svc.atomicIncrement(dto(batch, 1))).rejects.toThrow('库存数量未知'); await expect(svc.atomicDecrement(dto(batch, 1))).rejects.toThrow('库存数量未知');
    expect(await state(batch)).toEqual({ qty, locked_qty: locked, version: 1, ledger_rows: 0, delta: 0 });
  });
  it.each([null, 'TEST-FOREIGN'])('NULL/foreign store %s never becomes global and cannot be duplicated', async foreign => {
    const batch = foreign ? '-FOREIGN' : '-STORENULL'; await fixture(batch, 10, 0, foreign);
    await expect(svc.atomicIncrement(dto(batch, 1))).rejects.toThrow('机构归属'); await expect(svc.atomicDecrement(dto(batch, 1))).rejects.toThrow('机构归属');
    expect(await state(batch)).toMatchObject({ qty: 10, version: 1, ledger_rows: 0 });
  });
  it('empty warehouse scope and missing store fail before transaction or mutation', async () => {
    await fixture('-SCOPE');
    for (const overrides of [{ dataScope: { isGlobal: false, allowedWarehouseCodes: [] } }, { 'user.storeCode': null }]) {
      const denied = new InventoryService(ds.manager, { get: (k: string) => Object.prototype.hasOwnProperty.call(overrides, k) ? (overrides as Record<string, unknown>)[k] : cls.get(k) } as any);
      await expect(denied.atomicDecrement(dto('-SCOPE', 1))).rejects.toThrow();
    }
    expect(await state('-SCOPE')).toMatchObject({ qty: 10, version: 1, ledger_rows: 0 });
  });
  it('real ledger failure rolls back preceding balance/version update', async () => {
    await fixture('-LEDGER'); await expect(svc.atomicDecrement({ ...dto('-LEDGER', 1), bill_no: 'X'.repeat(65) })).rejects.toMatchObject({ driverError: { code: '22001' } });
    expect(await state('-LEDGER')).toMatchObject({ qty: 10, version: 1, ledger_rows: 0 });
  });
  it('caller-owned transaction rollback covers both provider actions and ledger', async () => {
    await fixture('-CALLER'); await expect(ds.transaction(async manager => {
      await svc.atomicDecrement(dto('-CALLER', 2), manager); await new InventoryService(manager, cls as any).atomicIncrement(dto('-CALLER', 1));
      throw Error('TEST caller rollback');
    })).rejects.toThrow('TEST caller rollback'); expect(await state('-CALLER')).toMatchObject({ qty: 10, version: 1, ledger_rows: 0 });
  });
  it('opposite cross-batch caller order does not deadlock or lose quantities', async () => {
    await fixture('-A'); await fixture('-B');
    await Promise.all([['-A','-B'],['-B','-A']].map(order => ds.transaction(async manager => {
      await manager.query("SET LOCAL lock_timeout='3s'"); for (const batch of order) await svc.atomicDecrement(dto(batch, 1), manager);
    })));
    for (const batch of ['-A','-B']) expect(await state(batch)).toMatchObject({ qty: 8, ledger_rows: 2, delta: -2 });
  });
});
