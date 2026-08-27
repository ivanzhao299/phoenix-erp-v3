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
  });
});
