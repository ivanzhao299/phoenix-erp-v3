import { BadRequestException } from '@nestjs/common';
import { FarmMedicineService } from './farm-medicine.service';

describe('FarmMedicineService', () => {
  const ledgerColumns = [
    'id', 'batch_no', 'change_type', 'qty_change', 'log_date', 'warehouse_code',
    'company_code', 'store_code', 'operator', 'ref_no', 'house_code', 'note', 'created_at',
  ].map(column_name => ({ column_name }));
  const globalScope = {
    isGlobal: true,
    allowedCompanyCodes: [],
    allowedSiteCodes: [],
    allowedWarehouseCodes: [],
  };

  function buildSvc(scope: any = globalScope) {
    const manager = { query: jest.fn() };
    const ds = {
      query: jest.fn().mockResolvedValue(ledgerColumns),
      transaction: jest.fn(async (cb: (manager: { query: jest.Mock }) => Promise<void>) => cb(manager)),
    };
    const scopeHelper = { assertWritableWarehouse: jest.fn() };
    const cls = { get: jest.fn().mockReturnValue(scope) };
    return {
      svc: new FarmMedicineService(ds as any, scopeHelper as any, cls as any),
      ds,
      manager,
      scopeHelper,
    };
  }

  it('catalog only aggregates active, available, unexpired medicine batches from active medicine warehouses', async () => {
    const { ds, svc } = buildSvc();
    ds.query
      .mockResolvedValueOnce([
        { medication_code: 'MED001', medication_name: '药品A', dosage: '瓶' },
        { medication_code: 'MED002', medication_name: '药品B', dosage: '盒' },
      ])
      .mockResolvedValueOnce([{ product_code: 'MED001', qty: '15' }]);

    await expect(svc.getCatalog()).resolves.toEqual([
      { medication_code: 'MED001', medication_name: '药品A', dosage: '瓶', qty: 15, unit: '瓶' },
      { medication_code: 'MED002', medication_name: '药品B', dosage: '盒', qty: 0, unit: '盒' },
    ]);
    expect(ds.query.mock.calls[1][0]).toContain("w.type = 'MEDICINE'");
    expect(ds.query.mock.calls[1][0]).toContain("b.expire_date >= CURRENT_DATE");
    expect(ds.query.mock.calls[1][0]).not.toContain('LPH_MS_MEDICINE');
    expect(ds.query.mock.calls[1][1]).toEqual([]);
  });

  it('applies company, site, and warehouse scope to catalog queries', async () => {
    const { ds, svc } = buildSvc({
      isGlobal: false,
      allowedCompanyCodes: ['COMP-A'],
      allowedSiteCodes: ['SITE-A'],
      allowedWarehouseCodes: ['WH-MED-A'],
    });
    ds.query.mockResolvedValueOnce([{ medication_code: 'MED001', medication_name: '药品A', dosage: '瓶' }])
      .mockResolvedValueOnce([]);

    await svc.getCatalog();
    expect(ds.query.mock.calls[0][0]).toContain('store_code = ANY($1)');
    expect(ds.query.mock.calls[0][1]).toEqual([['SITE-A']]);
    expect(ds.query.mock.calls[1][0]).toContain('b.company_code = ANY($1)');
    expect(ds.query.mock.calls[1][0]).toContain('b.store_code = ANY($2)');
    expect(ds.query.mock.calls[1][0]).toContain('b.warehouse_code = ANY($3)');
    expect(ds.query.mock.calls[1][1]).toEqual([['COMP-A'], ['SITE-A'], ['WH-MED-A']]);
  });

  it('ledger uses active medicine warehouse scope without fixed warehouse codes', async () => {
    const { ds, svc } = buildSvc();
    ds.query.mockResolvedValueOnce(ledgerColumns).mockResolvedValueOnce([]);

    await expect(svc.getLedger('2026-07-07', '2026-07-11')).resolves.toEqual([]);
    expect(ds.query.mock.calls[1][0]).toContain('l.log_date BETWEEN $1 AND $2');
    expect(ds.query.mock.calls[1][0]).toContain("m.status = 'ACTIVE'");
    expect(ds.query.mock.calls[1][0]).not.toContain("warehouse_code = ANY($1)");
    expect(ds.query.mock.calls[1][1]).toEqual(['2026-07-07', '2026-07-11']);
  });

  it('inbound accepts an explicit governed identity and creates a unique batch plus ledger', async () => {
    const { manager, scopeHelper, svc } = buildSvc();
    manager.query.mockResolvedValueOnce([{ batch_no: 'MED-NEW-1' }]).mockResolvedValueOnce([]);

    await svc.inbound('2026-07-07', [{
      medication_code: 'MED001', qty: 12, batch_no: 'MED-NEW-1', expire_date: '2026-12-31',
      warehouse_code: 'WH-MED-A', company_code: 'COMP-A', site_code: 'SITE-A',
    }], 'admin');

    expect(scopeHelper.assertWritableWarehouse).toHaveBeenCalledWith('WH-MED-A', '药品库存');
    expect(manager.query.mock.calls[0][1]).toEqual([
      'MED-NEW-1', 'MED001', 12, 'WH-MED-A', 'SITE-A', 'COMP-A', 'FARM_MEDICINE', 'MED_INBOUND', '2026-07-07', '2026-12-31',
    ]);
    expect(manager.query.mock.calls[1][1]).toEqual([
      'MED-NEW-1', 'MED_INBOUND', 12, '2026-07-07', 'WH-MED-A', 'COMP-A', 'SITE-A', 'admin', 'MED_INBOUND', null, '采购入库',
    ]);
  });

  it('inbound derives a unique medicine warehouse when scope and payload identify exactly one', async () => {
    const { manager, scopeHelper, svc } = buildSvc({
      isGlobal: false,
      allowedCompanyCodes: ['COMP-A'],
      allowedSiteCodes: ['SITE-A'],
      allowedWarehouseCodes: ['WH-MED-A'],
    });
    manager.query
      .mockResolvedValueOnce([{ batch_no: 'MED-GENERATED' }])
      .mockResolvedValueOnce([]);

    await svc.inbound('2026-07-07', [{ medication_code: 'MED001', qty: 3 }], 'admin');
    expect(scopeHelper.assertWritableWarehouse).toHaveBeenCalledWith('WH-MED-A', '药品库存');
    expect(manager.query.mock.calls[0][0]).toContain('INSERT INTO inv_batches');
    expect(manager.query.mock.calls[0][1][3]).toBe('WH-MED-A');
  });

  it('does not allow the legacy outbound endpoint to bypass medication records', async () => {
    const { manager, svc } = buildSvc();

    await expect(svc.outbound('2026-07-07', [{ medication_code: 'MED001', qty: 2, house_code: 'A001' }], 'admin'))
      .rejects.toThrow(BadRequestException);
    expect(manager.query).not.toHaveBeenCalled();
  });

  it('rejects malformed inbound items before opening a transaction', async () => {
    const { manager, svc } = buildSvc();

    await expect(svc.inbound('2026-07-07', undefined, 'admin')).rejects.toThrow(BadRequestException);
    expect(manager.query).not.toHaveBeenCalled();
  });
});
