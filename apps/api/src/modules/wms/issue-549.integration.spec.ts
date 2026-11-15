import { WmsService } from './wms.service';

function globalScope() {
  return { get: jest.fn(() => ({ isGlobal: true, allowedWarehouseCodes: [] })) };
}

describe('issue 549 inbound identity integration contracts', () => {
  it('persists canonical MATERIAL identity when a batch inbound is created', async () => {
    const lineInserts: Array<{ sql: string; params: unknown[] }> = [];
    const manager = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('SELECT task_no,status FROM wms_inbound')) return [];
        if (sql.includes('SELECT company_code FROM wms_warehouses')) return [{ company_code: 'COMP-LAO-AGRI' }];
        if (sql.includes('FROM mst_materials')) return [{ material_code: 'MAT-VET-NDV', material_name: '新城疫苗', material_type: 'VET_DRUG', unit: '瓶', status: 'ACTIVE' }];
        if (sql.includes('INSERT INTO wms_inbound_items')) {
          lineInserts.push({ sql, params: params ?? [] });
          return [];
        }
        return [];
      }),
    };
    const em = {
      query: jest.fn().mockResolvedValue([{ domain: 'OPERATIONAL' }]),
      transaction: jest.fn(async (callback: (m: typeof manager) => unknown) => callback(manager)),
    };
    const service = new WmsService(em as any, globalScope() as any);

    await service.createBatchInbound({
      documents: [{
        task_no: 'WI-549-MATERIAL-CREATE',
        type: 'PURCHASE',
        warehouse_code: 'LPH_DP_MEDICINE',
        items: [{
          item: 'MAT-VET-NDV',
          item_type: 'MATERIAL',
          material_code: 'MAT-VET-NDV',
          sku_code: '',
          qty: 10,
        }],
      }],
    }, { username: 'admin' });

    expect(lineInserts).toHaveLength(1);
    expect(lineInserts[0].sql).toMatch(/item_type|material_code/);
    expect(lineInserts[0].params).toEqual(expect.arrayContaining(['MAT-VET-NDV', 'MATERIAL']));
  });

  it('resolves a legacy material-only detail during confirmation', async () => {
    const writes: string[] = [];
    const manager = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('SELECT warehouse_code, operator, store_code, status, type, date FROM wms_inbound')) {
          return [{ warehouse_code: 'LPH_DP_MEDICINE', operator: 'admin', store_code: 'ALL', status: 'PENDING', type: 'PURCHASE', date: '2026-11-13' }];
        }
        if (sql.includes('SELECT type, domain FROM wms_warehouses')) return [{ type: 'MEDICINE', domain: 'OPERATIONAL' }];
        if (sql.includes('SELECT company_code FROM wms_warehouses')) return [{ company_code: 'COMP-LAO-AGRI' }];
        if (sql.includes("SELECT 'SKU' AS item_type FROM product_skus")) return [{ item_type: 'MATERIAL' }];
        if (sql.includes('FROM mst_materials') && sql.includes('status = \'ACTIVE\'')) {
          return [{ material_code: 'MAT-VET-NDV', material_name: '新城疫苗', material_type: 'VET_DRUG', unit: '瓶' }];
        }
        if (sql.includes('FROM wms_inbound_items')) {
          return [{ id: 549, batch_no: null, product_code: 'MAT-VET-NDV', qty: 10, expected_qty: 10, actual_qty: 0, broken_qty: 0, quantity_snapshot: null }];
        }
        if (sql.includes('INSERT INTO inv_batches')) { writes.push(sql); return [{ batch_no: 'posted' }]; }
        if (sql.includes('INSERT INTO inv_ledger')) writes.push(sql);
        if (sql.startsWith('UPDATE wms_inbound') || sql.startsWith('UPDATE wms_inbound_items')) writes.push(sql);
        if (sql.includes('SELECT * FROM inv_batches WHERE batch_no')) return [];
        return [];
      }),
    };
    const em = {
      query: jest.fn().mockResolvedValue([{ domain: 'OPERATIONAL' }]),
      transaction: jest.fn(async (callback: (m: typeof manager) => unknown) => callback(manager)),
    };
    const service = new WmsService(em as any, globalScope() as any);

    await expect(service.confirmBatchInbound({
      documents: [{ task_no: 'WI-549-MATERIAL-CREATE' }],
    }, { username: 'admin' })).resolves.toMatchObject({ code: 200 });

    expect(writes.some(sql => sql.includes('INSERT INTO inv_batches'))).toBe(true);
    expect(writes.some(sql => sql.includes('INSERT INTO inv_ledger'))).toBe(true);
  });

  it('rejects a confirmation item that cannot be matched to a persisted line', async () => {
    const writes: string[] = [];
    const manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT warehouse_code, operator, store_code, status, type, date FROM wms_inbound')) {
          return [{ warehouse_code: 'LPH_DP_MEDICINE', operator: 'admin', store_code: 'ALL', status: 'PENDING', type: 'PURCHASE', date: '2026-11-13' }];
        }
        if (sql.includes('SELECT type, domain FROM wms_warehouses')) return [{ type: 'MEDICINE', domain: 'OPERATIONAL' }];
        if (sql.includes('SELECT company_code FROM wms_warehouses')) return [{ company_code: 'COMP-LAO-AGRI' }];
        if (sql.includes('FROM wms_inbound_items')) return [];
        if (sql.includes("SELECT 'SKU' AS item_type FROM product_skus")) return [{ item_type: 'MATERIAL' }];
        if (sql.includes('FROM mst_materials') && sql.includes("status = 'ACTIVE'")) return [{ material_code: 'MAT-VET-NDV', material_name: '新城疫苗', material_type: 'VET_DRUG', unit: '瓶' }];
        if (sql.includes('INSERT INTO inv_batches') || sql.includes('INSERT INTO inv_ledger')) writes.push(sql);
        return [];
      }),
    };
    const em = {
      query: jest.fn().mockResolvedValue([{ domain: 'OPERATIONAL' }]),
      transaction: jest.fn(async (callback: (m: typeof manager) => unknown) => callback(manager)),
    };
    const service = new WmsService(em as any, globalScope() as any);

    await expect(service.confirmInbound({
      task_no: 'WI-549-NO-LINE',
      items: [{ material_code: 'MAT-VET-NDV', item_type: 'MATERIAL', actual_qty: 10 }],
    }, { username: 'admin' }, undefined, true)).rejects.toThrow();
    expect(writes).toHaveLength(0);
  });
});
