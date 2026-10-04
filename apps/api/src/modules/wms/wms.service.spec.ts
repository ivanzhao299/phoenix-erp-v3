import { WmsService } from './wms.service';
import { BadRequestException } from '@nestjs/common';

describe('WmsService inventory read queries', () => {
  const buildService = (rows: any[] = []) => {
    const em = {
      query: jest.fn().mockResolvedValue(rows),
    };
    const cls = {
      get: jest.fn((key: string) => {
        if (key === 'dataScope') {
          return {
            isGlobal: false,
            allowedWarehouseCodes: ['LPH_MS_EGG_SALES'],
          };
        }
        return undefined;
      }),
    };
    return { service: new WmsService(em as any, cls as any), em };
  };

  it.each([
    ['HOUSE', 'H-1', 'brd_houses'], ['CUSTOMER', 'C-1', 'sal_customers'],
    ['WAREHOUSE', 'WH-1', 'wms_warehouses'], ['STORE', 'S-1', 'mst_stores'],
    ['DEPARTMENT', 'D-1', 'sys_organizations'], ['PROJECT', 'P-1', 'biz_projects'],
    ['EMPLOYEE', 'u1', 'sys_user u'], ['SUPPLIER', 'SUP-1', 'prc2_suppliers'],
  ])('validates %s destinations against its explicit ACTIVE/scope lookup', async (type, code, table) => {
    const em = { query: jest.fn().mockResolvedValue([{ ok: 1 }]) };
    const cls = { get: jest.fn(() => ({ isGlobal: false, allowedCompanyCodes: ['COMP-1'], allowedWarehouseCodes: ['WH-1'], allowedProjectCodes: ['P-1'], allowedFarmCodes: ['F-1'], allowedSiteCodes: ['SITE-1'] })) };
    const service = new WmsService(em as any, cls as any);
    await expect((service as any).assertActiveScopedDestination({ destination_type: type, destination_code: code })).resolves.toBeUndefined();
    expect(em.query.mock.calls[0][0]).toContain(`FROM ${table}`);
    expect(em.query.mock.calls[0][0]).toMatch(/ACTIVE|status=1/);
  });

  it('preserves OTHER verbatim without a fabricated master-data lookup', async () => {
    const em = { query: jest.fn() };
    const service = new WmsService(em as any, { get: jest.fn() } as any);
    await expect((service as any).assertActiveScopedDestination({ destination_type: 'OTHER', destination_code: '临时工地 A' })).resolves.toBeUndefined();
    expect(em.query).not.toHaveBeenCalled();
  });

  it('accepts only the company-qualified canonical code for a store-owned warehouse', async () => {
    const em = { query: jest.fn().mockResolvedValue([{
      id: 10, store_code: 'STORE-VTE-001', company_code: 'COMP-LAO-AGRI', status: 'ACTIVE',
    }]) };
    const service = new WmsService(em as any, { get: jest.fn() } as any);
    await expect(service.assertWarehouseOwnership({
      owner_store_id: 10, company_code: 'COMP-LAO-AGRI', warehouse_code: 'ST_LAO_AGRI_VTE_001_SALES',
    })).resolves.toBeUndefined();
    await expect(service.assertWarehouseOwnership({
      owner_store_id: 10, company_code: 'COMP-LAO-AGRI', warehouse_code: 'ST_VTE_001_SALES',
    })).rejects.toThrow('ST_LAO_AGRI_VTE_001_SALES');
  });

  it('rejects a store-owned warehouse in another company', async () => {
    const em = { query: jest.fn().mockResolvedValue([{
      id: 10, store_code: 'STORE-VTE-001', company_code: 'COMP-LAO-AGRI', status: 'ACTIVE',
    }]) };
    const service = new WmsService(em as any, { get: jest.fn() } as any);
    await expect(service.assertWarehouseOwnership({
      owner_store_id: 10, company_code: 'COMP-LAO-XINGCHI', warehouse_code: 'ST_LAO_XINGCHI_VTE_001_SALES',
    })).rejects.toThrow('必须属于同一公司');
  });

  it('rejects PURCHASE receipt inbound to an EGG_FARM warehouse before inventory writes', async () => {
    const manager = {
      query: jest.fn(async (sql: string) => sql.includes('SELECT type')
        ? [{ type: 'EGG_FARM', domain: 'OPERATIONAL' }]
        : []),
    };
    const em = {
      query: jest.fn().mockResolvedValue([{ domain: 'OPERATIONAL' }]),
    };
    const cls = { get: jest.fn(() => ({ isGlobal: true, allowedWarehouseCodes: [] })) };
    const service = new WmsService(em as any, cls as any);

    await expect(service.inboundFromReceipt(manager as any, {
      refNo: 'RCV-EGG-1', warehouseCode: 'LPH_MS_EGG_FARM', items: [],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.query).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO inv_batches'), expect.anything());
  });

  it('allows PURCHASE receipt inbound to a FEED warehouse', async () => {
    const manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT type')) return [{ type: 'FEED', domain: 'OPERATIONAL' }];
        if (sql.includes('FROM mst_materials')) return [{
          material_code: 'MAT-FEED-1', material_name: '饲料', material_type: 'FEED_RAW', unit: 'kg',
        }];
        return [];
      }),
    };
    const em = {
      query: jest.fn().mockResolvedValue([{ domain: 'OPERATIONAL' }]),
    };
    const cls = { get: jest.fn(() => ({ isGlobal: true, allowedWarehouseCodes: [] })) };
    const service = new WmsService(em as any, cls as any);

    await expect(service.inboundFromReceipt(manager as any, {
      refNo: 'RCV-FEED-1', warehouseCode: 'LPH_MS_FEED',
      items: [{ itemCode: 'MAT-FEED-1', itemType: 'MATERIAL', qty: 2 }],
    })).resolves.toEqual({ batchNos: ['RCV-FEED-1-001'], skipped: 0 });
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO inv_batches'), expect.any(Array));
  });

  it('uses qty_available fallback and projects warehouse display name when reading visible inventory batches', async () => {
    const { service, em } = buildService([{ batch_no: 'B1', qty: 0, qty_available: 12, warehouse_name: '孟赛鸡蛋销售成品仓' }]);

    await expect(service.getInventoryBatches()).resolves.toEqual({
      code: 200,
      data: [{ batch_no: 'B1', qty: 0, qty_available: 12, warehouse_name: '孟赛鸡蛋销售成品仓' }],
    });

    expect(em.query).toHaveBeenCalledWith(
      expect.stringContaining('COALESCE(b.qty_available, b.qty, 0) > 0'),
      [['LPH_MS_EGG_SALES']],
    );
    expect(em.query.mock.calls[0][0]).toContain('LEFT JOIN wms_warehouses w ON w.warehouse_code = b.warehouse_code');
    expect(em.query.mock.calls[0][0]).toContain('COALESCE(w.warehouse_name_zh, w.warehouse_name, b.warehouse_code) AS warehouse_name');
    expect(em.query.mock.calls[0][0]).toContain('(b.warehouse_code = ANY($1) OR b.warehouse_code IS NULL)');
    expect(em.query.mock.calls[0][0]).toContain('b.inbound_date');
    expect(em.query.mock.calls[0][0]).toContain('ORDER BY b.inbound_date DESC NULLS LAST, b.batch_no DESC, b.id DESC LIMIT 200');
    expect(em.query.mock.calls[0][0]).not.toContain('WHERE qty > 0');
  });

  it('uses the same available quantity predicate for inventory summary', async () => {
    const { service, em } = buildService([{ batch_no: 'B1', qty: 0, qty_available: 12, status: 'AVAILABLE' }]);

    await service.getInventoryBatchesSummary();

    expect(em.query).toHaveBeenCalledWith(
      expect.stringContaining('COALESCE(b.qty_available, b.qty, 0) > 0'),
      [['LPH_MS_EGG_SALES']],
    );
    expect(em.query.mock.calls[0][0]).toContain('LEFT JOIN wms_warehouses w ON w.warehouse_code = b.warehouse_code');
  });

  it('rejects inbound confirmation before completing the task when no stock line can be posted', async () => {
    const em = {
      transaction: jest.fn(),
    };
    const cls = {
      get: jest.fn(() => ({ isGlobal: true, allowedWarehouseCodes: [] })),
    };
    const service = new WmsService(em as any, cls as any);

    await expect(
      service.confirmInbound(
        {
          task_no: 'WI-NO-STOCK',
          items: [{ product_code: 'PRD-EGG-1', actual_qty: 0, broken_qty: 0 }],
        },
        { username: 'admin' },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        msg: '入库数据校验失败',
        errors: expect.arrayContaining(['入库确认至少需要一条实收或破损数量大于 0 的明细']),
      }),
    });
    expect(em.transaction).not.toHaveBeenCalled();
  });

  it('rejects inbound confirmation before completing the task when an effective line lacks product and SKU code', async () => {
    const em = {
      transaction: jest.fn(),
    };
    const cls = {
      get: jest.fn(() => ({ isGlobal: true, allowedWarehouseCodes: [] })),
    };
    const service = new WmsService(em as any, cls as any);

    await expect(
      service.confirmInbound(
        {
          task_no: 'WI-NO-PRODUCT',
          items: [{ actual_qty: 5, broken_qty: 0 }],
        },
        { username: 'admin' },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        msg: '入库数据校验失败',
        errors: expect.arrayContaining(['批次 (未指定): material_code / product_code / sku_code 至少一项必填']),
      }),
    });
    expect(em.transaction).not.toHaveBeenCalled();
  });

  it('accepts SKU-only inbound confirmation and persists SKU to batch and ledger', async () => {
    const manager = {
      query: jest.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes('SELECT type, domain FROM wms_warehouses')) {
          return [{ type: 'PURCHASE_RECV', domain: 'OPERATIONAL' }];
        }
        if (sql.includes('SELECT company_code FROM wms_warehouses')) {
          return [{ company_code: 'COMP-LAO-XINGCHI' }];
        }
        if (sql.includes('SELECT warehouse_code, operator, store_code, status, type, date FROM wms_inbound')) {
          return [{ warehouse_code: 'LPH_MS_EGG_SALES', operator: 'old-op', store_code: 'ALL', status: 'PENDING', type: 'PURCHASE', date: '2026-09-09' }];
        }
        if (sql.includes('FROM product_skus')) {
          return [{ sku_code: 'SKU-EGG-A-30', product_code: 'PRD-EGG', sku_name: '鸡蛋SKU' }];
        }
        if (sql.includes('SELECT batch_no, status FROM inv_batches')) {
          return [];
        }
        return [];
      }),
    };
    const em = {
      transaction: jest.fn(async (cb: (m: typeof manager) => unknown) => cb(manager)),
    };
    const cls = {
      get: jest.fn(() => ({ isGlobal: true, allowedWarehouseCodes: [] })),
    };
    const service = new WmsService(em as any, cls as any);

    await expect(
      service.confirmInbound(
        {
          task_no: 'WI-SKU-ONLY',
          items: [{
            sku_code: 'SKU-EGG-A-30',
            actual_qty: 8,
            batch_no: 'IBN-SKU-ONLY-B1',
            warehouse_code: 'LPH_MS_EGG_SALES',
            location_code: 'INBOUND-DOCK',
          }],
        },
        { username: 'admin' },
      ),
    ).resolves.toEqual({
      code: 200,
      msg: '入库确认成功',
      data: { task_no: 'WI-SKU-ONLY', status: 'COMPLETED' },
    });

    const skuLookup = manager.query.mock.calls.find(([sql]) => String(sql).includes('FROM product_skus'));
    expect(skuLookup?.[0]).toContain('effective_date IS NULL OR ps.effective_date <= CURRENT_DATE');
    expect(skuLookup?.[0]).toContain('expire_date IS NULL OR ps.expire_date >= CURRENT_DATE');

    const insertBatchCall = manager.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO inv_batches') && String(sql).includes('sku_code'),
    );
    expect(insertBatchCall).toBeDefined();
    expect(insertBatchCall?.[1]).toEqual([
      'IBN-SKU-ONLY-B1',
      'PRD-EGG',
      'SKU-EGG-A-30',
      null,
      'SKU',
      'FINISHED_PRODUCT',
      '枚',
      8,
      'LPH_MS_EGG_SALES',
      'INBOUND-DOCK',
      'ALL',
      'COMP-LAO-XINGCHI',
      '2026-09-09',
    ]);

    const insertLedgerCall = manager.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO inv_ledger') && String(sql).includes('sku_code'),
    );
    expect(insertLedgerCall).toBeDefined();
    expect(insertLedgerCall?.[1]).toEqual([
      'IBN-SKU-ONLY-B1',
      8,
      'admin',
      'ALL',
      'WI-SKU-ONLY',
      '入库确认 product=PRD-EGG sku=SKU-EGG-A-30 material=- actual=8 warehouse=LPH_MS_EGG_SALES',
      'SKU-EGG-A-30',
      null,
      'LPH_MS_EGG_SALES',
      '枚',
      'PURCHASE_INBOUND',
      'PURCHASE',
      'COMP-LAO-XINGCHI',
    ]);
  });

  it('normalizes a SKU entered in the legacy product-code field so outbound can select the stock', async () => {
    const manager = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('SELECT type, domain FROM wms_warehouses')) {
          return [{ type: 'PURCHASE_RECV', domain: 'OPERATIONAL' }];
        }
        if (sql.includes('SELECT company_code FROM wms_warehouses')) {
          return [{ company_code: 'COMP-LAO-XINGCHI' }];
        }
        if (sql.includes('SELECT warehouse_code, operator, store_code, status, type, date FROM wms_inbound')) {
          return [{ warehouse_code: 'LPH_MS_EGG_SALES', operator: 'old-op', store_code: 'ALL', status: 'PENDING', type: 'PURCHASE', date: '2026-09-09' }];
        }
        if (sql.includes('FROM product_skus')) {
          expect(params).toEqual(['SKU-EGG-A-30']);
          return [{ sku_code: 'SKU-EGG-A-30', product_code: 'PRD-EGG' }];
        }
        if (sql.includes('SELECT batch_no, status FROM inv_batches')) return [];
        return [];
      }),
    };
    const em = {
      transaction: jest.fn(async (cb: (m: typeof manager) => unknown) => cb(manager)),
    };
    const cls = {
      get: jest.fn(() => ({ isGlobal: true, allowedWarehouseCodes: [] })),
    };
    const service = new WmsService(em as any, cls as any);

    await expect(service.confirmInbound({
      task_no: 'WI-LEGACY-SKU',
      items: [{
        batch_no: 'IBN-LEGACY-SKU-B1',
        product_code: 'SKU-EGG-A-30',
        actual_qty: 4,
        warehouse_code: 'LPH_MS_EGG_SALES',
      }],
    }, { username: 'admin' })).resolves.toMatchObject({
      code: 200,
      data: { task_no: 'WI-LEGACY-SKU', status: 'COMPLETED' },
    });

    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO inv_batches'),
      [
        'IBN-LEGACY-SKU-B1',
        'PRD-EGG',
        'SKU-EGG-A-30',
        null,
        'SKU',
        'FINISHED_PRODUCT',
        '枚',
        4,
        'LPH_MS_EGG_SALES',
        'INBOUND-DOCK',
        'ALL',
        'COMP-LAO-XINGCHI',
        '2026-09-09',
      ],
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO inv_ledger'),
      [
        'IBN-LEGACY-SKU-B1',
        4,
        'admin',
        'ALL',
        'WI-LEGACY-SKU',
        '入库确认 product=PRD-EGG sku=SKU-EGG-A-30 material=- actual=4 warehouse=LPH_MS_EGG_SALES',
        'SKU-EGG-A-30',
        null,
        'LPH_MS_EGG_SALES',
        '枚',
        'PURCHASE_INBOUND',
        'PURCHASE',
        'COMP-LAO-XINGCHI',
      ],
    );
  });

  it('persists received quantity two on the inbound line before posting visible inventory', async () => {
    const manager = {
      query: jest.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes('SELECT type, domain FROM wms_warehouses')) {
          return [{ type: 'FEED', domain: 'OPERATIONAL' }];
        }
        if (sql.includes('SELECT company_code FROM wms_warehouses')) {
          return [{ company_code: 'COMP-LAO-XINGCHI' }];
        }
        if (sql.includes('SELECT warehouse_code, operator, store_code, status, type, date FROM wms_inbound')) {
          return [{ warehouse_code: 'WH-A', operator: 'old-op', store_code: 'ALL', status: 'PENDING', type: 'PURCHASE', date: '2026-09-09' }];
        }
        if (sql.includes('FROM mst_materials')) {
          return [{
            material_code: 'MAT-FEED-1',
            material_name: '饲料原料',
            material_type: 'FEED_RAW',
            unit: 'kg',
          }];
        }
        if (sql.includes('SELECT batch_no, status FROM inv_batches')) return [];
        return [];
      }),
    };
    const em = {
      transaction: jest.fn(async (cb: (m: typeof manager) => unknown) => cb(manager)),
    };
    const cls = {
      get: jest.fn(() => ({ isGlobal: true, allowedWarehouseCodes: [] })),
    };
    const service = new WmsService(em as any, cls as any);

    await expect(service.confirmInbound({
      task_no: 'WI-RECEIVED-2',
      items: [{
        batch_no: 'IBN-RECEIVED-2',
        material_code: 'MAT-FEED-1',
        item_type: 'MATERIAL',
        actual_qty: 2,
        broken_qty: 0,
        warehouse_code: 'WH-A',
      }],
    }, { username: 'admin' })).resolves.toMatchObject({
      code: 200,
      data: { task_no: 'WI-RECEIVED-2', status: 'COMPLETED' },
    });

    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE wms_inbound_items'),
      [2, 0, 'WI-RECEIVED-2', 'IBN-RECEIVED-2', null],
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO inv_batches'),
      ['IBN-RECEIVED-2', null, null, 'MAT-FEED-1', 'MATERIAL', 'FEED_RAW', 'kg', 2, 'WH-A', 'INBOUND-DOCK', 'ALL', 'COMP-LAO-XINGCHI', '2026-09-09'],
    );
  });

  it('ships outbound inventory by SKU across available batches', async () => {
    const manager = {
      query: jest.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes('SELECT batch_no FROM changed')) return [{ batch_no: 'changed' }];
        if (sql.includes('SELECT order_no, status, store_code FROM ord_orders')) {
          return [{ order_no: 'SO-SKU-1', status: 'ALLOCATED', store_code: 'ALL' }];
        }
        if (sql.includes('WHERE sku_code = $1')) {
          return [
            { batch_no: 'B-SKU-1', product_code: null, sku_code: 'SKU-EGG-A-30', qty: 5, qty_available: 5, warehouse_code: 'LPH_MS_EGG_SALES', store_code: 'ALL', company_code: null },
            { batch_no: 'B-SKU-2', product_code: null, sku_code: 'SKU-EGG-A-30', qty: 10, qty_available: 10, warehouse_code: 'LPH_MS_EGG_SALES', store_code: 'ALL', company_code: null },
          ];
        }
        return [];
      }),
    };
    const em = {
      transaction: jest.fn(async (cb: (m: typeof manager) => unknown) => cb(manager)),
    };
    const cls = {
      get: jest.fn(() => ({ isGlobal: true, allowedWarehouseCodes: [] })),
    };
    const service = new WmsService(em as any, cls as any);

    await expect(
      service.advanceOutboundOrder(
        'SO-SKU-1',
        { next_status: 'SHIPPED', items: [{ sku_code: 'SKU-EGG-A-30', qty: 12 }] },
        { username: 'admin' },
      ),
    ).resolves.toEqual({ code: 200, msg: '状态推进至 SHIPPED' });

    const updateCalls = manager.query.mock.calls.filter(([sql]) => String(sql).includes('UPDATE inv_batches'));
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[0][1]).toEqual([5, 'B-SKU-1', 'LPH_MS_EGG_SALES', null]);
    expect(updateCalls[1][1]).toEqual([7, 'B-SKU-2', 'LPH_MS_EGG_SALES', null]);

    const ledgerCalls = manager.query.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO inv_ledger'),
    );
    expect(ledgerCalls).toHaveLength(2);
    expect(ledgerCalls[0][1]).toEqual([
      'B-SKU-1',
      5,
      'admin',
      'ALL',
      'SO-SKU-1',
      '出库 type=SALE status=SHIPPED batch=B-SKU-1 product=- sku=SKU-EGG-A-30 material=- qty=5',
      'SKU-EGG-A-30',
      'SALE_OUTBOUND',
      null,
      'LPH_MS_EGG_SALES',
      null,
      'SALE',
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(ledgerCalls[1][1]).toEqual([
      'B-SKU-2',
      7,
      'admin',
      'ALL',
      'SO-SKU-1',
      '出库 type=SALE status=SHIPPED batch=B-SKU-2 product=- sku=SKU-EGG-A-30 material=- qty=7',
      'SKU-EGG-A-30',
      'SALE_OUTBOUND',
      null,
      'LPH_MS_EGG_SALES',
      null,
      'SALE',
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('confirms a standalone outbound only after deducting its batch and writing the ledger', async () => {
    const manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT batch_no FROM changed')) return [{ batch_no: 'B-EGG-A-1' }];
        if (sql.includes('FROM wms_outbound')) {
          return [{
            id: '31',
            outbound_no: 'WO-20260725-001',
            status: 'PENDING',
            warehouse_code: 'LPH_MS_EGG_SALES',
            store_code: 'ALL',
            company_code: 'COMP-LAO-AGRI',
            type: 'SALE',
            item: 'SKU-EGG-A-30',
            item_type: 'SKU',
            material_type: 'FINISHED_PRODUCT',
            sku_code: 'SKU-EGG-A-30',
            unit: '枚',
            batch_no: 'B-EGG-A-1',
            qty: 12,
            destination_type: 'CUSTOMER',
            destination_code: 'CUS-1',
            destination_customer_code: 'CUS-1',
          }];
        }
        if (sql.includes('FROM inv_batches') && sql.includes('batch_no = $1')) {
          return [{
            batch_no: 'B-EGG-A-1',
            product_code: 'PRD-EGG',
            sku_code: 'SKU-EGG-A-30',
            qty: 20,
            qty_available: 20,
            warehouse_code: 'LPH_MS_EGG_SALES',
            store_code: 'ALL',
            company_code: 'COMP-LAO-AGRI',
          }];
        }
        return [];
      }),
    };
    const em = {
      transaction: jest.fn(async (cb: (m: typeof manager) => unknown) => cb(manager)),
    };
    const cls = {
      get: jest.fn(() => ({ isGlobal: true, allowedWarehouseCodes: [] })),
    };
    const service = new WmsService(em as any, cls as any);

    await expect(
      service.confirmStandaloneOutbound('WO-20260725-001', { username: 'warehouse-admin', roles: ['ROLE_ADMIN'] }),
    ).resolves.toMatchObject({
      code: 200,
      data: { outbound_no: 'WO-20260725-001', status: 'DONE', qty: 12 },
    });

    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE inv_batches'),
      [12, 'B-EGG-A-1', 'LPH_MS_EGG_SALES', 'COMP-LAO-AGRI'],
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO inv_ledger'),
      [
        'B-EGG-A-1',
        12,
        'warehouse-admin',
        'ALL',
        'WO-20260725-001',
        '出库 type=SALE status=DONE batch=B-EGG-A-1 product=PRD-EGG sku=SKU-EGG-A-30 material=- qty=12',
        'SKU-EGG-A-30',
        'SALE_OUTBOUND',
        null,
        'LPH_MS_EGG_SALES',
        'COMP-LAO-AGRI',
        'SALE',
        'CUSTOMER',
        'CUS-1',
        null,
        null,
        '枚',
      ],
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'DONE'"),
      ['31'],
    );
  });

  it('confirms a legacy ALL-owned batch and normalizes ownership to its warehouse company', async () => {
    const manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT batch_no FROM changed')) return [{ batch_no: 'IBN-LEGACY-1' }];
        if (sql.includes('FROM wms_outbound')) {
          return [{
            id: '32', outbound_no: 'WO-LEGACY-1', status: 'PENDING', type: 'SALE',
            warehouse_code: 'WH-A', company_code: 'COMP-A', store_code: 'ALL',
            item: 'SKU-EGG-A-30', item_type: 'SKU', material_type: 'FINISHED_PRODUCT',
            unit: '枚', batch_no: 'IBN-LEGACY-1', qty: 100,
            destination_type: 'CUSTOMER', destination_customer_code: 'CUS-1',
          }];
        }
        if (sql.includes('FROM inv_batches') && sql.includes('batch_no = $1')) {
          return [{
            batch_no: 'IBN-LEGACY-1', product_code: 'PRD-EGG', sku_code: 'SKU-EGG-A-30',
            qty: 1000, qty_available: 1000, warehouse_code: 'WH-A', company_code: 'ALL',
            store_code: 'ALL', unit: '枚',
          }];
        }
        return [];
      }),
    };
    const em = {
      transaction: jest.fn(async (cb: (m: typeof manager) => unknown) => cb(manager)),
    };
    const cls = { get: jest.fn(() => ({ isGlobal: true, allowedWarehouseCodes: [] })) };
    const service = new WmsService(em as any, cls as any);

    await expect(service.confirmStandaloneOutbound('WO-LEGACY-1', {
      username: 'admin', roles: ['ROLE_ADMIN'],
    })).resolves.toMatchObject({ code: 200, data: { status: 'DONE', qty: 100 } });

    const update = manager.query.mock.calls.find(([sql]) => String(sql).includes('UPDATE inv_batches'));
    expect(String(update?.[0])).toContain("company_code = CASE");
    expect(String(update?.[0])).toContain("company_code = 'ALL'");
    expect((update as any)?.[1]).toEqual([100, 'IBN-LEGACY-1', 'WH-A', 'COMP-A']);
  });

  it('rejects a batch whose company ownership does not match the outbound', async () => {
    const manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM wms_outbound')) return [{
          id: '33', outbound_no: 'WO-OWNER-MISMATCH', status: 'PENDING', type: 'SALE',
          warehouse_code: 'WH-A', company_code: 'COMP-A', store_code: 'ALL',
          item: 'SKU-EGG-A-30', item_type: 'SKU', batch_no: 'B-OWNER-MISMATCH', qty: 100,
          destination_type: 'CUSTOMER', destination_customer_code: 'CUS-1',
        }];
        if (sql.includes('FROM inv_batches') && sql.includes('batch_no = $1')) return [{
          batch_no: 'B-OWNER-MISMATCH', sku_code: 'SKU-EGG-A-30', qty: 1000,
          qty_available: 1000, warehouse_code: 'WH-A', company_code: 'COMP-B',
        }];
        return [];
      }),
    };
    const em = { transaction: jest.fn(async (cb: (m: typeof manager) => unknown) => cb(manager)) };
    const cls = { get: jest.fn(() => ({ isGlobal: true, allowedWarehouseCodes: [] })) };
    const service = new WmsService(em as any, cls as any);

    await expect(service.confirmStandaloneOutbound('WO-OWNER-MISMATCH', {
      username: 'admin', roles: ['ROLE_ADMIN'],
    })).rejects.toThrow('出库批次 B-OWNER-MISMATCH 状态、归属或数量已变化');
  });

  it('creates a minimal valid sale outbound and keeps it pending', async () => {
    const manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM product_skus')) {
          return [{ sku_code: 'SKU-EGG-A-30', product_code: 'PRD-EGG', sku_name: '鸡蛋SKU', unit: '枚' }];
        }
        if (sql.includes('INSERT INTO wms_outbound')) {
          return [{ outbound_no: 'WO-SALE-MIN', status: 'PENDING' }];
        }
        return [];
      }),
    };
    const em = {
      query: jest.fn().mockResolvedValue([{ domain: 'OPERATIONAL' }]),
      transaction: jest.fn(async (cb: (m: typeof manager) => unknown) => cb(manager)),
    };
    const cls = { get: jest.fn(() => ({ isGlobal: true, allowedWarehouseCodes: [] })) };
    const service = new WmsService(em as any, cls as any);

    await expect(service.createStandaloneOutbound({
      outbound_no: 'WO-SALE-MIN', type: 'SALE', warehouse_code: 'LPH_MS_EGG_SALES',
      item: 'SKU-EGG-A-30', qty: 1, destination_type: 'CUSTOMER',
      destination_customer_code: 'CUS-1',
    }, { username: 'admin', roles: ['ROLE_ADMIN'] })).resolves.toMatchObject({
      code: 200,
      data: { outbound_no: 'WO-SALE-MIN', status: 'PENDING' },
    });
  });

  it('rejects an invalid issue with the complete structured error list before a write', async () => {
    const em = { query: jest.fn(), transaction: jest.fn() };
    const cls = { get: jest.fn(() => ({ isGlobal: true, allowedWarehouseCodes: [] })) };
    const service = new WmsService(em as any, cls as any);

    await expect(service.createStandaloneOutbound({
      type: 'PRODUCTION_USE', warehouse_code: 'LPH_MS_EGG_FARM', item: 'MAT-1', qty: 0,
      destination_type: 'CUSTOMER', destination_customer_code: 'CUS-1',
    }, { username: 'admin', roles: ['ROLE_ADMIN'] })).rejects.toMatchObject({
      response: {
        code: 400,
        msg: '出库业务校验失败',
        errors: expect.arrayContaining([
          '出库数量必须大于 0，且最多保留 3 位小数',
          'PRODUCTION_USE 的去向类型必须是 HOUSE / DEPARTMENT / PROJECT',
        ]),
      },
    });
    expect(em.query).not.toHaveBeenCalled();
    expect(em.transaction).not.toHaveBeenCalled();
  });

  it('keeps a standalone outbound pending when inventory is insufficient', async () => {
    const manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM wms_outbound')) {
          return [{
            id: '32',
            outbound_no: 'WO-20260725-002',
            status: 'PENDING',
            warehouse_code: 'LPH_MS_EGG_SALES',
            store_code: 'ALL',
            company_code: 'COMP-LAO-AGRI',
            type: 'SALE',
            item: 'SKU-EGG-A-30',
            item_type: 'SKU',
            material_type: 'FINISHED_PRODUCT',
            sku_code: 'SKU-EGG-A-30',
            unit: '枚',
            batch_no: 'B-EGG-A-2',
            qty: 12,
            destination_type: 'CUSTOMER',
            destination_code: 'CUS-1',
            destination_customer_code: 'CUS-1',
          }];
        }
        if (sql.includes('FROM inv_batches') && sql.includes('batch_no = $1')) {
          return [{
            batch_no: 'B-EGG-A-2',
            product_code: 'PRD-EGG',
            sku_code: 'SKU-EGG-A-30',
            qty: 5,
            qty_available: 5,
            warehouse_code: 'LPH_MS_EGG_SALES',
            store_code: 'ALL',
          }];
        }
        return [];
      }),
    };
    const em = {
      transaction: jest.fn(async (cb: (m: typeof manager) => unknown) => cb(manager)),
    };
    const cls = {
      get: jest.fn(() => ({ isGlobal: true, allowedWarehouseCodes: [] })),
    };
    const service = new WmsService(em as any, cls as any);

    await expect(
      service.confirmStandaloneOutbound('WO-20260725-002', { username: 'warehouse-admin', roles: ['ROLE_ADMIN'] }),
    ).rejects.toThrow('余量 5 不足 12');

    const doneUpdate = manager.query.mock.calls.find(([sql]) =>
      String(sql).includes("SET status = 'DONE'"),
    );
    expect(doneUpdate).toBeUndefined();
  });

  it('blocks transfer receiving from the generic inbound confirmation workflow', async () => {
    const manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM wms_inbound')) {
          return [{
            warehouse_code: 'WH-B',
            operator: 'admin',
            store_code: 'ALL',
            status: 'PENDING',
            type: 'TRANSFER_RECEIVE',
          }];
        }
        return [];
      }),
    };
    const em = {
      transaction: jest.fn(async (cb: (m: typeof manager) => unknown) => cb(manager)),
    };
    const cls = {
      get: jest.fn(() => ({ isGlobal: true, allowedWarehouseCodes: [] })),
    };
    const service = new WmsService(em as any, cls as any);

    await expect(service.confirmInbound({
      task_no: 'WI-TRANSFER-BYPASS',
      items: [{ sku_code: 'SKU-EGG-A', actual_qty: 1 }],
    }, { username: 'admin' })).rejects.toMatchObject({
      response: expect.objectContaining({
        msg: '入库业务类型必须通过指定工作流执行',
        errors: expect.arrayContaining([
          '库存调拨必须通过调拨管理的原子双边事务，不得以独立入库单执行',
        ]),
      }),
    });
    expect(manager.query).not.toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'COMPLETED'"),
      expect.anything(),
    );
  });

  it('rejects malformed transfer lines before opening a transaction', async () => {
    const em = { transaction: jest.fn() };
    const cls = {
      get: jest.fn(() => ({ isGlobal: true, allowedWarehouseCodes: [] })),
    };
    const service = new WmsService(em as any, cls as any);

    await expect(service.confirmTransfer({
      from_warehouse: 'WH-A',
      to_warehouse: 'WH-B',
      items: [{ batch_no: '', qty: 1.1234 }],
    }, { username: 'admin' })).rejects.toMatchObject({
      response: expect.objectContaining({
        msg: '调拨业务校验失败',
        errors: expect.arrayContaining([
          '第 1 行批次号必填',
          '第 1 行调拨数量必须大于 0，且最多保留 3 位小数',
        ]),
      }),
    });
    expect(em.transaction).not.toHaveBeenCalled();
  });

  it('keeps transfer identity and available quantity in one atomic transaction', async () => {
    const manager = {
      query: jest.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes('SELECT batch_no FROM changed')) return [{ batch_no: 'B-MAT-1' }];
        if (sql.includes('FROM wms_warehouses w')) return [{ company_code: 'COMP-B', store_code: 'STORE-B', store_status: 'ACTIVE' }];
        if (sql.includes('FROM inv_batches WHERE batch_no = $1 FOR UPDATE')) {
          return [{
            batch_no: 'B-MAT-1',
            product_code: null,
            sku_code: null,
            material_code: 'MAT-SPARE-1',
            item_type: 'MATERIAL',
            material_type: 'EQUIPMENT',
            unit: '件',
            qty: 10,
            qty_available: 8,
            status: 'AVAILABLE',
            expire_date: null,
            store_code: 'ALL',
            warehouse_code: 'WH-A',
            company_code: null,
          }];
        }
        return [];
      }),
    };
    const em = {
      transaction: jest.fn(async (cb: (m: typeof manager) => unknown) => cb(manager)),
    };
    const cls = {
      get: jest.fn(() => ({ isGlobal: true, allowedWarehouseCodes: [] })),
    };
    const service = new WmsService(em as any, cls as any);

    await expect(service.confirmTransfer({
      transfer_no: 'TR-ATOMIC-1',
      from_warehouse: 'WH-A',
      to_warehouse: 'WH-B',
      items: [{ batch_no: 'B-MAT-1', qty: 2.5 }],
    }, { username: 'admin', userId: 'U-1' })).resolves.toEqual({
      code: 200,
      msg: '调拨完成',
      transfer_no: 'TR-ATOMIC-1',
    });

    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('qty_available = CASE'),
      [2.5, 'B-MAT-1', 'WH-A'],
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO inv_batches'),
      expect.arrayContaining([
        null,
        null,
        'MAT-SPARE-1',
        'MATERIAL',
        'EQUIPMENT',
        '件',
        2.5,
        'WH-B',
        'TRANSFER-IN',
      ]),
    );
    const ledgerCalls = manager.query.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO inv_ledger'),
    );
    expect(ledgerCalls).toHaveLength(2);
    expect(ledgerCalls[0][1]).toEqual(expect.arrayContaining([
      'B-MAT-1',
      2.5,
      'TRANSFER_OUT',
      'MAT-SPARE-1',
      'WH-A',
      'TRANSFER',
      '件',
    ]));
    expect(ledgerCalls[1][1]).toEqual(expect.arrayContaining([
      2.5,
      'TRANSFER_IN',
      'MAT-SPARE-1',
      'WH-B',
      'TRANSFER',
      '件',
    ]));
  });

  it('does not mutate inventory when the transfer master record cannot be written', async () => {
    const manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('INSERT INTO wms_transfer')) throw new Error('transfer master unavailable');
        return [];
      }),
    };
    const em = {
      transaction: jest.fn(async (cb: (m: typeof manager) => unknown) => cb(manager)),
    };
    const cls = {
      get: jest.fn(() => ({ isGlobal: true, allowedWarehouseCodes: [] })),
    };
    const service = new WmsService(em as any, cls as any);

    await expect(service.confirmTransfer({
      transfer_no: 'TR-FAIL-CLOSED',
      from_warehouse: 'WH-A',
      to_warehouse: 'WH-B',
      items: [{ batch_no: 'B-1', qty: 1 }],
    }, { username: 'admin' })).rejects.toThrow('transfer master unavailable');
    expect(manager.query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE inv_batches'),
      expect.anything(),
    );
  });

  it('creates a PENDING transfer without mutating inventory', async () => {
    const manager = { query: jest.fn().mockResolvedValue([]) };
    const em = { transaction: jest.fn(async (cb: any) => cb(manager)) };
    const cls = { get: jest.fn(() => ({ isGlobal: true, allowedWarehouseCodes: [] })) };
    const service = new WmsService(em as any, cls as any);

    await expect(service.createTransfer({
      transfer_no: 'TR-LIFECYCLE-1', from_warehouse: 'WH-A', to_warehouse: 'WH-B',
      items: [{ batch_no: 'B-1', qty: 3 }],
    }, { username: 'keeper' })).resolves.toMatchObject({ status: 'PENDING' });
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining(`'PENDING'`), expect.any(Array));
    expect(manager.query).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE inv_batches'), expect.anything());
  });

  it('keeps direct createTransfer fail-closed for an out-of-scope target warehouse', async () => {
    const em = { transaction: jest.fn() };
    const cls = { get: jest.fn(() => ({ isGlobal: false, allowedWarehouseCodes: ['WH-A'] })) };
    const service = new WmsService(em as any, cls as any);
    await expect(service.createTransfer({
      from_warehouse: 'WH-A', to_warehouse: 'WH-B', items: [{ batch_no: 'B-1', qty: 1 }],
    }, { username: 'keeper' })).rejects.toThrow('库存调拨目标仓库（仓库范围不匹配）');
    expect(em.transaction).not.toHaveBeenCalled();
  });

  it('allows an orchestrated replenishment target only when it is in the resolved SALES bindings', async () => {
    const manager = { query: jest.fn().mockResolvedValue([]) };
    const em = { transaction: jest.fn(async (cb: any) => cb(manager)) };
    const cls = { get: jest.fn(() => ({ isGlobal: false, allowedWarehouseCodes: ['WH-A'] })) };
    const service = new WmsService(em as any, cls as any);
    await expect(service.createStoreReplenishmentTransfer({
      transfer_no: 'TR-STORE-1', from_warehouse: 'WH-A', to_warehouse: 'WH-STORE',
      items: [{ batch_no: 'B-1', qty: 1 }],
    }, { username: 'keeper' }, { storeCode: 'STORE-1', warehouseCodes: ['WH-STORE'] }))
      .resolves.toMatchObject({ status: 'PENDING' });
    await expect(service.createStoreReplenishmentTransfer({
      transfer_no: 'TR-FORGED', from_warehouse: 'WH-A', to_warehouse: 'WH-FORGED',
      items: [{ batch_no: 'B-1', qty: 1 }],
    }, { username: 'keeper' }, { storeCode: 'STORE-1', warehouseCodes: ['WH-STORE'] }))
      .rejects.toThrow('目标仓不是该门店有效 SALES 绑定仓');
  });

  it('dispatches PENDING stock into auditable in-transit ownership', async () => {
    const manager = { query: jest.fn(async (sql: string) => {
      if (sql.includes('SELECT batch_no FROM changed')) return [{ batch_no: 'B-1' }];
      if (sql.includes('FROM wms_transfer WHERE')) return [{ transfer_no: 'TR-2', status: 'PENDING', from_warehouse: 'WH-A', to_warehouse: 'WH-B' }];
      if (sql.includes('FROM wms_transfer_items')) return [{ id: 1, source_batch_no: 'B-1', expected_qty: 3 }];
      if (sql.includes('FROM inv_batches WHERE')) return [{ batch_no: 'B-1', qty: 4, qty_available: 4, status: 'AVAILABLE', warehouse_code: 'WH-A', store_code: 'ALL', company_code: null }];
      return [];
    }) };
    const em = { transaction: jest.fn(async (cb: any) => cb(manager)) };
    const service = new WmsService(em as any, { get: jest.fn(() => ({ isGlobal: true, allowedWarehouseCodes: [] })) } as any);

    await expect(service.dispatchTransfer('TR-2', { username: 'keeper' })).resolves.toMatchObject({ status: 'IN_TRANSIT', in_transit_qty: 3 });
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining("status='IN_TRANSIT'"), ['TR-2', 3, 'keeper']);
    expect(manager.query).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO inv_batches'), expect.anything());
  });

  it('dispatch requires only source warehouse scope', async () => {
    const manager = { query: jest.fn(async (sql: string) => {
      if (sql.includes('SELECT batch_no FROM changed')) return [{ batch_no: 'B-1' }];
      if (sql.includes('FROM wms_transfer WHERE')) return [{ transfer_no: 'TR-SOURCE', status: 'PENDING', from_warehouse: 'WH-A', to_warehouse: 'WH-B' }];
      if (sql.includes('FROM wms_transfer_items')) return [{ id: 1, source_batch_no: 'B-1', expected_qty: 1 }];
      if (sql.includes('FROM inv_batches WHERE')) return [{ batch_no: 'B-1', qty: 1, qty_available: 1, status: 'AVAILABLE', warehouse_code: 'WH-A' }];
      return [];
    }) };
    const em = { transaction: jest.fn(async (cb: any) => cb(manager)) };
    const service = new WmsService(em as any, { get: jest.fn(() => ({ isGlobal: false, allowedWarehouseCodes: ['WH-A'] })) } as any);
    await expect(service.dispatchTransfer('TR-SOURCE', { username: 'keeper' })).resolves.toMatchObject({ status: 'IN_TRANSIT' });
  });

  it('receive requires target warehouse scope, not source warehouse scope', async () => {
    const manager = { query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM wms_transfer WHERE')) return [{ transfer_no: 'TR-TARGET', status: 'IN_TRANSIT', from_warehouse: 'WH-A', to_warehouse: 'WH-B' }];
      if (sql.includes('FROM wms_transfer_items')) return [];
      return [];
    }) };
    const em = { transaction: jest.fn(async (cb: any) => cb(manager)) };
    const targetService = new WmsService(em as any, { get: jest.fn(() => ({ isGlobal: false, allowedWarehouseCodes: ['WH-B'] })) } as any);
    await expect(targetService.receiveTransfer('TR-TARGET', { receive_all: true }, { username: 'manager' }))
      .resolves.toMatchObject({ status: 'COMPLETED' });
    const sourceService = new WmsService(em as any, { get: jest.fn(() => ({ isGlobal: false, allowedWarehouseCodes: ['WH-A'] })) } as any);
    await expect(sourceService.receiveTransfer('TR-TARGET', { receive_all: true }, { username: 'keeper' }))
      .rejects.toThrow('库存调拨目标仓库（仓库范围不匹配）');
  });

  it('records signing shortage/damage and keeps the transfer RECEIVED until linked resolution', async () => {
    const manager = { query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM wms_transfer WHERE')) return [{ transfer_no: 'TR-3', status: 'IN_TRANSIT', from_warehouse: 'WH-A', to_warehouse: 'WH-B' }];
      if (sql.includes('FROM wms_transfer_items')) return [{ id: 11, source_batch_no: 'B-1', expected_qty: 5, source_snapshot: {} }];
      if (sql.includes('FROM wms_warehouses w')) return [{ company_code: 'COMP-A', store_code: 'STORE-B', store_status: 'ACTIVE' }];
      return [];
    }) };
    const em = { transaction: jest.fn(async (cb: any) => cb(manager)) };
    const service = new WmsService(em as any, { get: jest.fn(() => ({ isGlobal: true, allowedWarehouseCodes: [] })) } as any);

    await expect(service.receiveTransfer('TR-3', {
      items: [{ batch_no: 'B-1', received_qty: 3, damaged_qty: 1, note: '箱损' }],
    }, { username: 'manager' })).resolves.toMatchObject({ status: 'RECEIVED', received_qty: 3, difference_qty: 2 });
    const discrepancyCalls = manager.query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO wms_transfer_discrepancies'));
    expect(discrepancyCalls).toHaveLength(2);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('expire_date,store_code,company_code'),
      expect.arrayContaining(['WH-B', 'STORE-B', 'COMP-A']),
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('business_type,unit,company_code'),
      expect.arrayContaining(['STORE-B', 'WH-B', 'COMP-A']),
    );
    expect(manager.query).not.toHaveBeenCalledWith(expect.stringContaining("SET status='COMPLETED'"), expect.anything());
  });

  it('requires every received discrepancy to link a loss or adjustment document', async () => {
    const manager = { query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM wms_transfer WHERE')) return [{ transfer_no: 'TR-4', status: 'RECEIVED', to_warehouse: 'WH-B' }];
      if (sql.includes('FROM wms_transfer_discrepancies')) return [{ id: 21 }];
      return [];
    }) };
    const em = { transaction: jest.fn(async (cb: any) => cb(manager)) };
    const service = new WmsService(em as any, { get: jest.fn(() => ({ isGlobal: true, allowedWarehouseCodes: [] })) } as any);
    await expect(service.completeTransfer('TR-4', { resolutions: [] }, { username: 'manager' }))
      .rejects.toThrow('必须关联报损或调整单号');
  });

  it('complete requires target warehouse scope', async () => {
    const manager = { query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM wms_transfer WHERE')) return [{ transfer_no: 'TR-4', status: 'RECEIVED', from_warehouse: 'WH-A', to_warehouse: 'WH-B' }];
      if (sql.includes('FROM wms_transfer_discrepancies')) return [];
      return [];
    }) };
    const em = { transaction: jest.fn(async (cb: any) => cb(manager)) };
    const service = new WmsService(em as any, { get: jest.fn(() => ({ isGlobal: false, allowedWarehouseCodes: ['WH-A'] })) } as any);
    await expect(service.completeTransfer('TR-4', { resolutions: [] }, { username: 'keeper' }))
      .rejects.toThrow('库存调拨目标仓库（仓库范围不匹配）');
  });

  it('rejects duplicate stocktake approval before any inventory adjustment', async () => {
    const manager = {
      query: jest.fn(async (sql: string) => sql.includes('FROM wms_stocktake')
        ? [{ warehouse_code: 'WH-A', status: 'APPROVED' }]
        : []),
    };
    const em = {
      query: jest.fn().mockResolvedValue([{ domain: 'OPERATIONAL' }]),
      transaction: jest.fn(async (cb: any) => cb(manager)),
    };
    const service = new WmsService(em as any, { get: jest.fn(() => ({ isGlobal: true, allowedWarehouseCodes: [] })) } as any);

    await expect(service.approveStocktake({ stocktake_no: 'ST-1', diff_qty: 0 }, { username: 'auditor' }))
      .rejects.toThrow('已审核，不能重复审批');
    expect(manager.query).toHaveBeenCalledTimes(1);
    expect(manager.query).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO inv_ledger'), expect.anything());
  });

  it('rejects loss approval from a non-DONE state', async () => {
    const manager = {
      query: jest.fn(async (sql: string) => sql.includes('FROM wms_stocktake')
        ? [{ warehouse_code: 'WH-A', status: 'DRAFT' }]
        : []),
    };
    const em = {
      query: jest.fn().mockResolvedValue([{ domain: 'OPERATIONAL' }]),
      transaction: jest.fn(async (cb: any) => cb(manager)),
    };
    const service = new WmsService(em as any, { get: jest.fn(() => ({ isGlobal: true, allowedWarehouseCodes: [] })) } as any);

    await expect(service.approveLoss({ loss_no: 'LR-1', batch_no: 'B-1', loss_qty: 1 }, { username: 'auditor' }))
      .rejects.toThrow('状态 DRAFT 不允许审批');
    expect(manager.query).toHaveBeenCalledTimes(1);
    expect(manager.query).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO inv_ledger'), expect.anything());
  });
});
