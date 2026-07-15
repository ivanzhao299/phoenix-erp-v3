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

  it('uses qty_available fallback when reading visible inventory batches', async () => {
    const { service, em } = buildService([{ batch_no: 'B1', qty: 0, qty_available: 12 }]);

    await expect(service.getInventoryBatches()).resolves.toEqual({
      code: 200,
      data: [{ batch_no: 'B1', qty: 0, qty_available: 12 }],
    });

    expect(em.query).toHaveBeenCalledWith(
      expect.stringContaining('COALESCE(qty_available, qty, 0) > 0'),
      [['LPH_MS_EGG_SALES']],
    );
    expect(em.query.mock.calls[0][0]).not.toContain('WHERE qty > 0');
  });

  it('uses the same available quantity predicate for inventory summary', async () => {
    const { service, em } = buildService([{ batch_no: 'B1', qty: 0, qty_available: 12, status: 'AVAILABLE' }]);

    await service.getInventoryBatchesSummary();

    expect(em.query).toHaveBeenCalledWith(
      expect.stringContaining('COALESCE(qty_available, qty, 0) > 0'),
      [['LPH_MS_EGG_SALES']],
    );
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
});
