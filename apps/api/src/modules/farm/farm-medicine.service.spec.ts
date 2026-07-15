import { BadRequestException } from '@nestjs/common';
import { FarmMedicineService } from './farm-medicine.service';

describe('FarmMedicineService', () => {
  const defaultLedgerColumns = [
    'id',
    'batch_no',
    'change_type',
    'qty_change',
    'log_date',
    'warehouse_code',
    'company_code',
    'store_code',
    'operator',
    'ref_no',
    'house_code',
    'note',
    'created_at',
  ].map(column_name => ({ column_name }));

  function buildSvc() {
    const manager = { query: jest.fn() };
    const ds = {
      query: jest.fn().mockResolvedValue(defaultLedgerColumns),
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
    expect(ds.query.mock.calls[1][0]).toContain('warehouse_code = ANY($1)');
    expect(ds.query.mock.calls[1][1]).toEqual([['LPH_MS_MEDICINE', 'MEDICINE']]);
    expect(ds.query.mock.calls.some(call => String(call[0]).includes('INSERT INTO inv_batches'))).toBe(false);
  });

  it('inbound upserts medicine stock with governed warehouse ownership before writing ledger', async () => {
    const { manager, scopeHelper, svc } = buildSvc();
    manager.query
      .mockResolvedValueOnce([{ batch_no: 'MED-STOCK-MED001' }])
      .mockResolvedValueOnce([]);

    await svc.inbound('2026-07-07', [{ medication_code: 'MED001', qty: 12 }], 'admin');

    expect(scopeHelper.assertWritableWarehouse).toHaveBeenCalledWith('LPH_MS_MEDICINE', '药品库存');
    expect(manager.query).toHaveBeenCalledTimes(2);
    expect(manager.query.mock.calls[0][0]).toContain('INSERT INTO inv_batches');
    expect(manager.query.mock.calls[0][0]).toContain('ON CONFLICT (batch_no) DO UPDATE');
    expect(manager.query.mock.calls[0][0]).toContain('qty = COALESCE(inv_batches.qty, 0) + EXCLUDED.qty');
    expect(manager.query.mock.calls[0][0]).toContain('company_code');
    expect(manager.query.mock.calls[0][0]).toContain('source_type');
    expect(manager.query.mock.calls[0][1]).toEqual([
      'MED-STOCK-MED001',
      'MED001',
      12,
      'LPH_MS_MEDICINE',
      'SITE-MENGSAI-LAYER',
      'COMP-LAO-AGRI',
      'FARM_MEDICINE',
      'MED_INBOUND',
    ]);
    expect(manager.query.mock.calls[1][0]).toContain('INSERT INTO inv_ledger');
    expect(manager.query.mock.calls[1][0]).toContain('log_date');
    expect(manager.query.mock.calls[1][0]).toContain('warehouse_code');
    expect(manager.query.mock.calls[1][0]).toContain('company_code');
    expect(manager.query.mock.calls[1][1]).toEqual([
      'MED-STOCK-MED001',
      'MED_INBOUND',
      12,
      '2026-07-07',
      'LPH_MS_MEDICINE',
      'COMP-LAO-AGRI',
      'SITE-MENGSAI-LAYER',
      'admin',
      'MED_INBOUND',
      null,
      '采购入库',
    ]);
  });

  it('inbound skips absent optional inv_ledger columns so stock upsert is not rolled back by schema drift', async () => {
    const { ds, manager, svc } = buildSvc();
    ds.query.mockResolvedValueOnce([
      { column_name: 'batch_no' },
      { column_name: 'change_type' },
      { column_name: 'qty_change' },
      { column_name: 'operator' },
      { column_name: 'store_code' },
      { column_name: 'ref_no' },
      { column_name: 'note' },
      { column_name: 'created_at' },
    ]);
    manager.query
      .mockResolvedValueOnce([{ batch_no: 'MED-STOCK-MED001' }])
      .mockResolvedValueOnce([]);

    await svc.inbound('2026-07-07', [{ medication_code: 'MED001', qty: 5 }], 'admin');

    expect(manager.query).toHaveBeenCalledTimes(2);
    expect(manager.query.mock.calls[1][0]).toBe(
      'INSERT INTO inv_ledger (batch_no, change_type, qty_change, store_code, operator, ref_no, note) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    );
    expect(manager.query.mock.calls[1][0]).not.toContain('log_date');
    expect(manager.query.mock.calls[1][0]).not.toContain('warehouse_code');
    expect(manager.query.mock.calls[1][0]).not.toContain('company_code');
    expect(manager.query.mock.calls[1][1]).toEqual([
      'MED-STOCK-MED001',
      'MED_INBOUND',
      5,
      'SITE-MENGSAI-LAYER',
      'admin',
      'MED_INBOUND',
      '采购入库',
    ]);
  });

  it('getLedger falls back to created_at date when inv_ledger.log_date is absent', async () => {
    const { ds, svc } = buildSvc();
    ds.query
      .mockResolvedValueOnce([
        { column_name: 'id' },
        { column_name: 'batch_no' },
        { column_name: 'change_type' },
        { column_name: 'qty_change' },
        { column_name: 'operator' },
        { column_name: 'note' },
        { column_name: 'created_at' },
      ])
      .mockResolvedValueOnce([]);

    await expect(svc.getLedger('2026-07-07', '2026-07-11')).resolves.toEqual([]);

    expect(ds.query.mock.calls[1][0]).toContain('l.created_at::date::text AS log_date');
    expect(ds.query.mock.calls[1][0]).toContain('l.created_at::date BETWEEN $2::date AND $3::date');
    expect(ds.query.mock.calls[1][1]).toEqual([['LPH_MS_MEDICINE', 'MEDICINE'], '2026-07-07', '2026-07-11']);
  });

  it('inbound accepts common payload aliases and defaults blank date to today', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-11T10:00:00+08:00'));
    const { manager, svc } = buildSvc();
    manager.query
      .mockResolvedValueOnce([{ batch_no: 'MED-STOCK-MED001' }])
      .mockResolvedValueOnce([]);

    await svc.inbound('', [{ medicationCode: 'MED001', quantity: '3.5' }], 'admin');

    expect(manager.query.mock.calls[0][1][1]).toBe('MED001');
    expect(manager.query.mock.calls[0][1][2]).toBe(3.5);
    expect(manager.query.mock.calls[1][1][3]).toBe('2026-07-11');
    jest.useRealTimers();
  });

  it('inbound rejects malformed items as a controlled 400 instead of throwing TypeError', async () => {
    const { manager, svc } = buildSvc();

    await expect(svc.inbound('2026-07-07', undefined, 'admin'))
      .rejects.toThrow(BadRequestException);

    expect(manager.query).not.toHaveBeenCalled();
  });

  it('inbound rejects invalid calendar dates before SQL execution', async () => {
    const { manager, svc } = buildSvc();

    await expect(svc.inbound('2026-99-99', [{ medication_code: 'MED001', qty: 1 }], 'admin'))
      .rejects.toThrow(BadRequestException);

    expect(manager.query).not.toHaveBeenCalled();
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

    expect(scopeHelper.assertWritableWarehouse).toHaveBeenCalledWith('LPH_MS_MEDICINE', '药品库存');
    expect(manager.query).toHaveBeenCalledTimes(2);
    expect(manager.query.mock.calls[0][0]).toContain('UPDATE inv_batches');
    expect(manager.query.mock.calls[0][1]).toEqual([2, 'MED-STOCK-MED001']);
    expect(manager.query.mock.calls[1][1][1]).toBe('MED_OUTBOUND');
    expect(manager.query.mock.calls[1][0]).toMatch(/\bhouse_code\b/);
    expect(manager.query.mock.calls[1][1]).toEqual([
      'MED-STOCK-MED001',
      'MED_OUTBOUND',
      -2,
      '2026-07-07',
      'LPH_MS_MEDICINE',
      'COMP-LAO-AGRI',
      'SITE-MENGSAI-LAYER',
      'admin',
      'MED_OUTBOUND',
      'A001',
      '用药出库 house=A001',
    ]);
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
