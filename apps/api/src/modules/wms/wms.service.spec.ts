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
});
