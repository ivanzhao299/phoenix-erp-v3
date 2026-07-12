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

  it('rejects inbound confirmation before completing the task when an effective line lacks product code', async () => {
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
        errors: expect.arrayContaining(['批次 (未指定): product_code 必填']),
      }),
    });
    expect(em.transaction).not.toHaveBeenCalled();
  });
});
