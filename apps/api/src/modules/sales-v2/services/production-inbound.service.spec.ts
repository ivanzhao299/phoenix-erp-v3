import { BadRequestException } from '@nestjs/common';
import { ProductionInboundService } from './production-inbound.service';

describe('ProductionInboundService master-data resolution', () => {
  const makeService = (query: jest.Mock, createProductionBatch = jest.fn()) => {
    const modeSvc = { resolveMode: jest.fn().mockResolvedValue('TEMP_PRODUCTION_INBOUND') };
    return {
      service: new ProductionInboundService(
        { query } as never,
        { get: jest.fn() } as never,
        { createProductionBatch } as never,
        modeSvc as never,
      ),
      createProductionBatch,
    };
  };

  it('resolves house -> farm -> company/site, unique ACTIVE warehouse/location and real SKU', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ company_code: 'COMP-A', site_code: 'SITE-A' }])
      .mockResolvedValueOnce([{ '?column?': 1 }])
      .mockResolvedValueOnce([{ warehouse_code: 'WH-A' }])
      .mockResolvedValueOnce([{ location_code: 'LOC-IN-A' }])
      .mockResolvedValueOnce([{ sku_code: 'SKU-EGG-1', product_code: 'PROD-EGG', grade_code: 'GRADE_1', spec_code: 'TRAY' }]);
    const createProductionBatch = jest.fn().mockResolvedValue({ batch_no: 'EGG-1' });
    const { service } = makeService(query, createProductionBatch);

    const result = await service.recordProductionInbound({
      houseCode: 'HOUSE-A', eggDate: '2026-08-25', items: [{ grade: 'GRADE_1', qty: 1 }],
    });

    expect(result).toMatchObject({ companyCode: 'COMP-A', siteCode: 'SITE-A', warehouseCode: 'WH-A', locationCode: 'LOC-IN-A' });
    expect(createProductionBatch).toHaveBeenCalledWith(expect.objectContaining({
      companyCode: 'COMP-A', warehouseCode: 'WH-A', locationCode: 'LOC-IN-A',
      skuCode: 'SKU-EGG-1', productCode: 'PROD-EGG', gradeCodeStd: 'GRADE_1', specCode: 'TRAY',
    }));
  });

  it('requires an explicit warehouse when a company has multiple ACTIVE warehouses', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ company_code: 'COMP-A', site_code: 'SITE-A' }])
      .mockResolvedValueOnce([{ '?column?': 1 }])
      .mockResolvedValueOnce([{ warehouse_code: 'WH-A' }, { warehouse_code: 'WH-B' }]);
    const { service } = makeService(query);
    await expect(service.recordProductionInbound({
      houseCode: 'HOUSE-A', eggDate: '2026-08-25', items: [{ grade: 'GRADE_1', qty: 1 }],
    })).rejects.toThrow('存在多个 ACTIVE 仓库');
  });

  it('reports all missing SKU grades before creating any batch', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ company_code: 'COMP-A', site_code: 'SITE-A' }])
      .mockResolvedValueOnce([{ '?column?': 1 }])
      .mockResolvedValueOnce([{ warehouse_code: 'WH-A' }])
      .mockResolvedValueOnce([{ location_code: 'LOC-A' }])
      .mockResolvedValueOnce([{ sku_code: 'SKU-1', product_code: 'PROD', grade_code: 'GRADE_1', spec_code: 'TRAY' }]);
    const createProductionBatch = jest.fn();
    const { service } = makeService(query, createProductionBatch);
    await expect(service.recordProductionInbound({
      houseCode: 'HOUSE-A', eggDate: '2026-08-25',
      items: [{ grade: 'GRADE_1', qty: 1 }, { grade: 'GRADE_2', qty: 1 }],
    })).rejects.toThrow('GRADE_2');
    expect(createProductionBatch).not.toHaveBeenCalled();
  });

  it('never falls back to ALL when company cannot be resolved', async () => {
    const { service } = makeService(jest.fn().mockResolvedValue([]));
    await expect(service.recordProductionInbound({
      eggDate: '2026-08-25', items: [{ grade: 'GRADE_1', qty: 1 }],
    })).rejects.toBeInstanceOf(BadRequestException);
  });
});
