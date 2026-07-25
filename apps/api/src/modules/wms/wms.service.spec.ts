import { WmsService } from './wms.service';

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
        errors: expect.arrayContaining(['批次 (未指定): product_code 或 sku_code 必填']),
      }),
    });
    expect(em.transaction).not.toHaveBeenCalled();
  });

  it('accepts SKU-only inbound confirmation and persists SKU to batch and ledger', async () => {
    const manager = {
      query: jest.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes('SELECT warehouse_code, operator, store_code, status FROM wms_inbound')) {
          return [{ warehouse_code: 'LPH_MS_EGG_SALES', operator: 'old-op', store_code: 'ALL', status: 'PENDING' }];
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

    const insertBatchCall = manager.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO inv_batches') && String(sql).includes('sku_code'),
    );
    expect(insertBatchCall).toBeDefined();
    expect(insertBatchCall?.[1]).toEqual([
      'IBN-SKU-ONLY-B1',
      null,
      'SKU-EGG-A-30',
      8,
      'LPH_MS_EGG_SALES',
      'INBOUND-DOCK',
      'ALL',
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
      '入库确认 product=- sku=SKU-EGG-A-30 actual=8 warehouse=LPH_MS_EGG_SALES',
      'SKU-EGG-A-30',
    ]);
  });

  it('normalizes a SKU entered in the legacy product-code field so outbound can select the stock', async () => {
    const manager = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('SELECT warehouse_code, operator, store_code, status FROM wms_inbound')) {
          return [{ warehouse_code: 'LPH_MS_EGG_SALES', operator: 'old-op', store_code: 'ALL', status: 'PENDING' }];
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
      ['IBN-LEGACY-SKU-B1', 'PRD-EGG', 'SKU-EGG-A-30', 4, 'LPH_MS_EGG_SALES', 'INBOUND-DOCK', 'ALL'],
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO inv_ledger'),
      [
        'IBN-LEGACY-SKU-B1',
        4,
        'admin',
        'ALL',
        'WI-LEGACY-SKU',
        '入库确认 product=PRD-EGG sku=SKU-EGG-A-30 actual=4 warehouse=LPH_MS_EGG_SALES',
        'SKU-EGG-A-30',
      ],
    );
  });

  it('persists received quantity two on the inbound line before posting visible inventory', async () => {
    const manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT warehouse_code, operator, store_code, status FROM wms_inbound')) {
          return [{ warehouse_code: 'WH-A', operator: 'old-op', store_code: 'ALL', status: 'PENDING' }];
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
        product_code: 'PRD-EGG-1',
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
      [2, 0, 'WI-RECEIVED-2', 'IBN-RECEIVED-2', 'PRD-EGG-1'],
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO inv_batches'),
      ['IBN-RECEIVED-2', 'PRD-EGG-1', null, 2, 'WH-A', 'INBOUND-DOCK', 'ALL'],
    );
  });

  it('ships outbound inventory by SKU across available batches', async () => {
    const manager = {
      query: jest.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes('SELECT order_no, status, store_code FROM ord_orders')) {
          return [{ order_no: 'SO-SKU-1', status: 'ALLOCATED', store_code: 'ALL' }];
        }
        if (sql.includes('WHERE sku_code = $1')) {
          return [
            { batch_no: 'B-SKU-1', product_code: null, sku_code: 'SKU-EGG-A-30', qty: 5, qty_available: 5, warehouse_code: 'LPH_MS_EGG_SALES', store_code: 'ALL' },
            { batch_no: 'B-SKU-2', product_code: null, sku_code: 'SKU-EGG-A-30', qty: 10, qty_available: 10, warehouse_code: 'LPH_MS_EGG_SALES', store_code: 'ALL' },
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
    expect(updateCalls[0][1]).toEqual([5, 'B-SKU-1']);
    expect(updateCalls[1][1]).toEqual([7, 'B-SKU-2']);

    const ledgerCalls = manager.query.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO inv_ledger') && String(sql).includes('OUTBOUND'),
    );
    expect(ledgerCalls).toHaveLength(2);
    expect(ledgerCalls[0][1]).toEqual([
      'B-SKU-1',
      5,
      'admin',
      'ALL',
      'SO-SKU-1',
      '出库 status=SHIPPED batch=B-SKU-1 product=- sku=SKU-EGG-A-30 qty=5',
      'SKU-EGG-A-30',
    ]);
    expect(ledgerCalls[1][1]).toEqual([
      'B-SKU-2',
      7,
      'admin',
      'ALL',
      'SO-SKU-1',
      '出库 status=SHIPPED batch=B-SKU-2 product=- sku=SKU-EGG-A-30 qty=7',
      'SKU-EGG-A-30',
    ]);
  });

  it('confirms a standalone outbound only after deducting its batch and writing the ledger', async () => {
    const manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM wms_outbound')) {
          return [{
            id: '31',
            outbound_no: 'WO-20260725-001',
            status: 'PENDING',
            warehouse_code: 'LPH_MS_EGG_SALES',
            store_code: 'ALL',
            item: 'SKU-EGG-A-30',
            batch_no: 'B-EGG-A-1',
            qty: 12,
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
      service.confirmStandaloneOutbound('WO-20260725-001', { username: 'warehouse-admin' }),
    ).resolves.toMatchObject({
      code: 200,
      data: { outbound_no: 'WO-20260725-001', status: 'DONE', qty: 12 },
    });

    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE inv_batches'),
      [12, 'B-EGG-A-1'],
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO inv_ledger'),
      [
        'B-EGG-A-1',
        12,
        'warehouse-admin',
        'ALL',
        'WO-20260725-001',
        '出库 status=DONE batch=B-EGG-A-1 product=PRD-EGG sku=SKU-EGG-A-30 qty=12',
        'SKU-EGG-A-30',
      ],
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'DONE'"),
      ['31'],
    );
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
            item: 'SKU-EGG-A-30',
            batch_no: 'B-EGG-A-2',
            qty: 12,
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
      service.confirmStandaloneOutbound('WO-20260725-002', { username: 'warehouse-admin' }),
    ).rejects.toThrow('余量 5 不足 12');

    const doneUpdate = manager.query.mock.calls.find(([sql]) =>
      String(sql).includes("SET status = 'DONE'"),
    );
    expect(doneUpdate).toBeUndefined();
  });
});
