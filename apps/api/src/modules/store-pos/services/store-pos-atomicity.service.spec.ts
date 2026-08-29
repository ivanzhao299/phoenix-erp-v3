import { ConflictException } from '@nestjs/common';
import { StorePosService } from './store-pos.service';

function subject() {
  const service = Object.create(StorePosService.prototype) as any;
  service.cls = { get: (key: string) => key === 'user' ? { username: 'cashier' } : undefined };
  service.logger = { warn: jest.fn() };
  return service;
}

describe('StorePosService V1-2 atomic settlement', () => {
  const sale = {
    id: 7, sale_no: 'POS-7', store_code: 'STORE-A', company_code: 'COMP-A',
    warehouseCodes: ['WH-A'],
    items: [{ id: 71, product_code: 'EGG', sku_code: 'SKU-EGG', qty: 3 }],
  };

  it('rejects an insufficient FIFO allocation so the enclosing transaction can roll back', async () => {
    const mgr = { query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM inv_batches')) return [{ batch_no: 'B1', warehouse_code: 'WH-A', qty_available: 2 }];
      if (sql.includes('UPDATE inv_batches')) return [{ batch_no: 'B1' }];
      return [];
    }) };

    await expect((subject() as any).fifoDeductItems(sale, mgr)).rejects.toBeInstanceOf(ConflictException);
    expect(mgr.query.mock.calls.some(([sql]) => sql.includes('store_sale_allocations'))).toBe(true);
  });

  it('persists every batch allocation for a multi-batch FIFO deduction', async () => {
    const mgr = { query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM inv_batches')) return [
        { batch_no: 'B1', warehouse_code: 'WH-A', qty_available: 1 },
        { batch_no: 'B2', warehouse_code: 'WH-A', qty_available: 2 },
      ];
      if (sql.includes('UPDATE inv_batches')) return [{ batch_no: 'changed' }];
      return [];
    }) };

    const allocations = await (subject() as any).fifoDeductItems(sale, mgr);
    expect(allocations).toEqual([
      { itemId: 71, batchNo: 'B1', warehouseCode: 'WH-A', qty: 1 },
      { itemId: 71, batchNo: 'B2', warehouseCode: 'WH-A', qty: 2 },
    ]);
    expect(mgr.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO store_sale_allocations'))).toHaveLength(2);
  });

  it('normalizes the PostgreSQL UPDATE result through a SELECT CTE before checking one changed row', async () => {
    const mgr = { query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM inv_batches')) return [
        { batch_no: 'B1', warehouse_code: 'WH-A', qty_available: 3 },
      ];
      if (sql.includes('SELECT batch_no FROM changed')) return [{ batch_no: 'B1' }];
      if (sql.includes('UPDATE inv_batches')) return [[{ batch_no: 'B1' }], 1];
      return [];
    }) };

    await expect((subject() as any).fifoDeductItems(sale, mgr)).resolves.toEqual([
      { itemId: 71, batchNo: 'B1', warehouseCode: 'WH-A', qty: 3 },
    ]);
    expect(mgr.query.mock.calls.some(([sql]) => sql.includes('WITH changed AS ('))).toBe(true);
  });

  it('settles a pre-fix OPEN sale from current FIFO inventory instead of a stale item batch value', async () => {
    const oldOpenSale = {
      ...sale,
      items: [{ ...sale.items[0], batch_no: 'PRE-FIX-BATCH' }],
    };
    const mgr = { query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM inv_batches')) return [
        { batch_no: 'CURRENT-BATCH', warehouse_code: 'WH-A', qty_available: 3 },
      ];
      if (sql.includes('SELECT batch_no FROM changed')) return [{ batch_no: 'CURRENT-BATCH' }];
      return [];
    }) };

    await expect((subject() as any).fifoDeductItems(oldOpenSale, mgr)).resolves.toEqual([
      { itemId: 71, batchNo: 'CURRENT-BATCH', warehouseCode: 'WH-A', qty: 3 },
    ]);
  });

  it('returns the existing result for the same payment idempotency key', async () => {
    const mgr = { query: jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 7, status: 'COMPLETED', idempotency_key: 'pay-7' }]) };
    const result = await (subject() as any).lockSaleForPayment(mgr, 7, 'pay-7', ['WH-A']);
    expect(result).toMatchObject({ id: 7, idempotentReplay: true });
    expect(mgr.query).toHaveBeenCalledTimes(2);
  });

  it('reverses the exact remaining allocation into a quarantine location', async () => {
    const mgr = { query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM wms_locations')) return [{ warehouse_code: 'WH-R', location_code: 'RET-Q', zone_code: 'QUARANTINE' }];
      return [];
    }) };
    await (subject() as any).reverseInventory(mgr, sale, [{
      id: 99, allocated_qty: 3, returned_qty: 1, product_code: 'EGG', sku_code: 'SKU-EGG',
    }], ['WH-R']);
    const batchInsert = (mgr.query.mock.calls as any[]).find(([sql]) => sql.includes('INSERT INTO inv_batches'));
    expect(batchInsert?.[1]).toEqual(expect.arrayContaining([2, 'WH-R', 'RET-Q']));
    expect(mgr.query.mock.calls.some(([sql]) => sql.includes('returned_qty=allocated_qty'))).toBe(true);
    const locationLookup = String(mgr.query.mock.calls[0]?.[0]);
    expect(locationLookup).toContain("z.zone_type='QUARANTINE'");
    expect(locationLookup).toContain("z.status='ACTIVE'");
    expect(locationLookup).toContain('z.warehouse_code=l.warehouse_code');
    expect(locationLookup).not.toContain("LIKE '%QUARANTINE%'");
  });

  it('returns a completed sale once and rechecks status under the row lock', async () => {
    const service = subject();
    const completed = { ...sale, status: 'COMPLETED', paid_amount: 0, receivable_amount: 0 };
    service.storeScope = { assertSaleScoped: jest.fn(async () => ({ sale: completed, context: { warehouseCodes: ['WH-R'] } })) };
    service.getSale = jest.fn(async () => ({ ...completed, status: 'RETURNED' }));
    service.reverseInventory = jest.fn(async () => undefined);
    const mgr = { query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM sal_store_sales')) return [completed];
      if (sql.includes('FROM store_sale_allocations')) return [{ id: 9, allocated_qty: 3, returned_qty: 0 }];
      if (sql.includes('SELECT id FROM changed')) return [{ id: 7 }];
      return [];
    }) };
    service.ds = { transaction: jest.fn(async (run: any) => run(mgr)) };
    await expect(service.returnSale(7, 'customer return')).resolves.toMatchObject({ status: 'RETURNED' });
    expect(service.reverseInventory).toHaveBeenCalledWith(mgr, completed, expect.any(Array), ['WH-R']);
    expect(String(mgr.query.mock.calls[0][0])).toContain('FOR UPDATE');
  });

  it('rejects repeated and concurrent returns before producing a second side effect', async () => {
    const service = subject();
    service.storeScope = { assertSaleScoped: jest.fn(async () => ({ sale: { ...sale, status: 'RETURNED' }, context: { warehouseCodes: ['WH-R'] } })) };
    service.ds = { transaction: jest.fn() };
    await expect(service.returnSale(7, 'again')).rejects.toThrow('不可重复');
    expect(service.ds.transaction).not.toHaveBeenCalled();

    service.storeScope.assertSaleScoped.mockResolvedValueOnce({ sale: { ...sale, status: 'COMPLETED' }, context: { warehouseCodes: ['WH-R'] } });
    const mgr = { query: jest.fn(async () => [{ ...sale, status: 'RETURNED' }]) };
    service.ds.transaction.mockImplementationOnce(async (run: any) => run(mgr));
    await expect(service.returnSale(7, 'racing request')).rejects.toThrow('不可重复');
    expect(mgr.query).toHaveBeenCalledTimes(1);
  });

  it('propagates a reverse-inventory failure so the enclosing transaction rolls back', async () => {
    const service = subject();
    const completed = { ...sale, status: 'COMPLETED', paid_amount: 0, receivable_amount: 0 };
    service.storeScope = { assertSaleScoped: jest.fn(async () => ({ sale: completed, context: { warehouseCodes: ['WH-R'] } })) };
    service.reverseInventory = jest.fn(async () => { throw new ConflictException('inventory failed'); });
    const mgr = { query: jest.fn(async (sql: string) => sql.includes('store_sale_allocations') ? [{ id: 9 }] : [completed]) };
    service.ds = { transaction: jest.fn(async (run: any) => run(mgr)) };
    await expect(service.returnSale(7, 'rollback')).rejects.toThrow('inventory failed');
    expect(mgr.query.mock.calls.some(([sql]: [string]) => sql.includes("SET status = 'RETURNED'"))).toBe(false);
  });
});
