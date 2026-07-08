import { BadRequestException } from '@nestjs/common';
import { FarmMedicineService } from './farm-medicine.service';

describe('FarmMedicineService', () => {
  function buildSvc() {
    const manager = { query: jest.fn() };
    const ds = {
      query: jest.fn(),
      transaction: jest.fn(async (cb: (manager: { query: jest.Mock }) => Promise<void>) => cb(manager)),
    };
    const scopeHelper = {
      assertWritableWarehouse: jest.fn(),
    };

    return {
      svc: new FarmMedicineService(ds as any, scopeHelper as any),
      ds,
      manager,
      scopeHelper,
    };
  }

  it('getCatalog reads active medicines and aggregates stock without creating zero batches', async () => {
    const { ds, svc } = buildSvc();
    ds.query
      .mockResolvedValueOnce([
        { medication_code: 'MED001', medication_name: '药品A', dosage: '瓶' },
        { medication_code: 'MED002', medication_name: '药品B', dosage: '盒' },
      ])
      .mockResolvedValueOnce([
        { product_code: 'MED001', qty: '15' },
      ]);

    await expect(svc.getCatalog()).resolves.toEqual([
      { medication_code: 'MED001', medication_name: '药品A', dosage: '瓶', qty: 15, unit: '瓶' },
      { medication_code: 'MED002', medication_name: '药品B', dosage: '盒', qty: 0, unit: '盒' },
    ]);

    expect(ds.query).toHaveBeenCalledTimes(2);
    expect(ds.query.mock.calls[0][0]).toContain('FROM brd_medications');
    expect(ds.query.mock.calls[1][0]).toContain('SUM(COALESCE(qty_available, qty, 0))');
    expect(ds.query.mock.calls.some(call => String(call[0]).includes('INSERT INTO inv_batches'))).toBe(false);
  });

  it('inbound upserts medicine stock before writing ledger', async () => {
    const { manager, scopeHelper, svc } = buildSvc();
    manager.query
      .mockResolvedValueOnce([{ batch_no: 'MED-STOCK-MED001' }])
      .mockResolvedValueOnce([]);

    await svc.inbound('2026-07-07', [{ medication_code: 'MED001', qty: 12 }], 'admin');

    expect(scopeHelper.assertWritableWarehouse).toHaveBeenCalledWith('MEDICINE', '药品库存');
    expect(manager.query).toHaveBeenCalledTimes(2);
    expect(manager.query.mock.calls[0][0]).toContain('INSERT INTO inv_batches');
    expect(manager.query.mock.calls[0][0]).toContain('ON CONFLICT (batch_no) DO UPDATE');
    expect(manager.query.mock.calls[0][0]).toContain('qty = COALESCE(inv_batches.qty, 0) + EXCLUDED.qty');
    expect(manager.query.mock.calls[0][1]).toEqual(['MED-STOCK-MED001', 'MED001', 12, 'MEDICINE']);
    expect(manager.query.mock.calls[1][0]).toContain('MED_INBOUND');
    expect(manager.query.mock.calls[1][1]).toEqual(['MED-STOCK-MED001', 12, '2026-07-07', 'MEDICINE', 'admin', '采购入库']);
  });

  it('rejects inbound for inactive or missing medicine before ledger write', async () => {
    const { manager, svc } = buildSvc();
    manager.query.mockResolvedValueOnce([]);

    await expect(svc.inbound('2026-07-07', [{ medication_code: 'MISSING', qty: 1 }], 'admin'))
      .rejects.toThrow(BadRequestException);

    expect(manager.query).toHaveBeenCalledTimes(1);
    expect(manager.query.mock.calls[0][0]).toContain('WHERE EXISTS');
  });

  it('outbound deducts existing stock and writes ledger', async () => {
    const { manager, scopeHelper, svc } = buildSvc();
    manager.query
      .mockResolvedValueOnce([{ batch_no: 'MED-STOCK-MED001' }])
      .mockResolvedValueOnce([]);

    await svc.outbound('2026-07-07', [{ medication_code: 'MED001', qty: 2, house_code: 'A001' }], 'admin');

    expect(scopeHelper.assertWritableWarehouse).toHaveBeenCalledWith('MEDICINE', '药品库存');
    expect(manager.query).toHaveBeenCalledTimes(2);
    expect(manager.query.mock.calls[0][0]).toContain('UPDATE inv_batches');
    expect(manager.query.mock.calls[0][1]).toEqual([2, 'MED-STOCK-MED001']);
    expect(manager.query.mock.calls[1][0]).toContain('MED_OUTBOUND');
    expect(manager.query.mock.calls[1][1]).toEqual(['MED-STOCK-MED001', -2, '2026-07-07', 'MEDICINE', 'A001', 'admin', '用药出库']);
  });

  it('outbound rejects missing stock without writing ledger', async () => {
    const { manager, svc } = buildSvc();
    manager.query.mockResolvedValueOnce([]);

    await expect(svc.outbound('2026-07-07', [{ medication_code: 'MED001', qty: 2 }], 'admin'))
      .rejects.toThrow(BadRequestException);

    expect(manager.query).toHaveBeenCalledTimes(1);
    expect(manager.query.mock.calls[0][0]).toContain('RETURNING batch_no');
  });
});
