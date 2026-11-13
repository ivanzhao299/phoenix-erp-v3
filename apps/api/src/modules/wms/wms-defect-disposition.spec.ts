import { WmsService } from './wms.service';

describe('WmsService defect inventory disposition', () => {
  function fixture() {
    const calls: Array<[string, unknown[]]> = [];
    const batch = {
      batch_no: 'B-DIRTY-1', product_code: 'EGG', sku_code: 'SKU-DIRTY', material_code: null,
      item_type: 'SKU', material_type: 'FINISHED_PRODUCT', unit: '枚', qty: 10, qty_available: 10,
      status: 'QUARANTINE', quality_grade: 'DIRTY', grade_code_std: 'DIRTY', warehouse_code: 'WH-A',
      location_code: 'L-1', store_code: 'ALL', company_code: 'COMP-A', expire_date: null, egg_date: null,
      packaging_spec: null, spec_code: null, source_type: 'PACKAGING', source_no: 'PKG-1', inbound_date: null,
    };
    const manager = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        calls.push([sql, params]);
        if (sql.includes('FROM wms_defect_dispositions') && sql.includes('FOR UPDATE')) return [];
        if (sql.includes('FROM inv_batches WHERE batch_no')) return [batch];
        if (sql.includes('FROM wms_warehouses') && sql.includes('company_code')) return [{ company_code: 'COMP-A' }];
        if (sql.includes('INSERT INTO wms_defect_dispositions')) return [{ id: 1 }];
        if (sql.includes('INSERT INTO inv_batches')) return [{ batch_no: 'B-DIRTY-1-D-DD-1' }];
        if (sql.includes('UPDATE wms_defect_dispositions')) return [{ disposition_no: 'DD-1', status: 'DONE' }];
        if (sql.includes('UPDATE inv_batches')) return [{ batch_no: batch.batch_no }];
        return [];
      }),
    };
    const em = {
      query: jest.fn(async (sql: string) => sql.includes('FROM wms_warehouses') ? [{ domain: 'OPERATIONAL' }] : []),
      transaction: jest.fn(async (fn: (m: any) => unknown) => fn(manager)),
    };
    const cls = { get: jest.fn((key: string) => key === 'dataScope' ? {
      isGlobal: true, allowedWarehouseCodes: [], allowedCompanyCodes: [], allowedProjectCodes: [],
    } : undefined) };
    return { service: new WmsService(em as any, cls as any), em, manager, calls };
  }

  it('mutates the defect batch and writes both ledger legs atomically for transfer', async () => {
    const f = fixture();
    const result = await f.service.disposeDefectInventory({
      disposition_no: 'DD-1', batch_no: 'B-DIRTY-1', qty: 2, action: 'TRANSFER',
      target_warehouse_code: 'WH-B', reason: '转入清洁复检',
    }, { username: 'qa-op', permissions: ['MENU_INV_BATCH:E'], roles: ['ROLE_WMS'] });

    expect(result).toMatchObject({ code: 200, idempotent: false });
    expect(f.em.transaction).toHaveBeenCalledTimes(1);
    expect(f.calls.filter(([sql]) => sql.includes('INSERT INTO inv_ledger'))).toHaveLength(2);
    expect(f.calls.some(([sql]) => sql.includes('UPDATE inv_batches'))).toBe(true);
  });

  it('returns a completed envelope without touching inventory on retry', async () => {
    const f = fixture();
    f.manager.query.mockImplementationOnce(async (sql: string) => {
      f.calls.push([sql, []]);
      return [{ disposition_no: 'DD-1', status: 'DONE', batch_no: 'B-DIRTY-1', qty: 2, action: 'WASTE' }];
    });
    const result = await f.service.disposeDefectInventory({
      disposition_no: 'DD-1', batch_no: 'B-DIRTY-1', qty: 2, action: 'WASTE', reason: '重复请求重放',
    }, { username: 'qa-op', permissions: ['MENU_INV_BATCH:E'], roles: ['ROLE_WMS'] });
    expect(result).toMatchObject({ code: 200, idempotent: true });
    expect(f.calls.some(([sql]) => sql.includes('UPDATE inv_batches'))).toBe(false);
    expect(f.calls.some(([sql]) => sql.includes('INSERT INTO inv_ledger'))).toBe(false);
  });
});
