import { BadRequestException } from '@nestjs/common';
import { ProductionInboundService } from './production-inbound.service';

describe('ProductionInboundService master-data resolution', () => {
  const makeService = (query: jest.Mock, createProductionBatch = jest.fn(), dataScope?: any) => {
    const modeSvc = { resolveMode: jest.fn().mockResolvedValue('TEMP_PRODUCTION_INBOUND') };
    let resolvedCompany = 'COMP-A';
    return {
      service: new ProductionInboundService(
        { query } as never,
        { get: jest.fn((key: string) => key === 'dataScope' ? dataScope : undefined) } as never,
        { createProductionBatch } as never,
        modeSvc as never,
        {
          resolveHouse: jest.fn(async (houseCode: string) => {
            const rows = await query('', [houseCode]);
            if (!rows.length) throw new BadRequestException(`鸡舍 ${houseCode} 不存在或已停用`);
            const row = rows[0];
            resolvedCompany = row.farm_company_code ?? row.company_code;
            return {
              houseCode,
              farmCode: row.farm_code,
              companyCode: row.farm_company_code ?? row.company_code,
              siteCode: row.farm_site_code ?? row.site_code,
            };
          }),
          resolveWarehouse: jest.fn(async (warehouseCode: string) => ({
            warehouseCode,
            companyCode: resolvedCompany,
          })),
        } as never,
      ),
      createProductionBatch,
    };
  };

  it('resolves house -> farm -> company/site, unique ACTIVE warehouse/location and real SKU', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ house_company_code: null, house_site_code: null, farm_code: 'FARM-A', farm_company_code: 'COMP-A', farm_site_code: 'SITE-A' }])
      .mockResolvedValueOnce([{ '?column?': 1 }])
      .mockResolvedValueOnce([{ warehouse_code: 'WH-A' }])
      .mockResolvedValueOnce([{ location_code: 'LOC-IN-A' }])
      .mockResolvedValueOnce([{ sku_code: 'SKU-EGG-1', product_code: 'PROD-EGG', grade_code: 'GRADE_1', spec_code: 'LOOSE' }]);
    const createProductionBatch = jest.fn().mockResolvedValue({ batch_no: 'EGG-1' });
    const { service } = makeService(query, createProductionBatch);

    const result = await service.recordProductionInbound({
      houseCode: 'HOUSE-A', eggDate: '2026-08-25', items: [{ grade: 'GRADE_1', qty: 1 }],
    });

    expect(result).toMatchObject({ companyCode: 'COMP-A', siteCode: 'SITE-A', warehouseCode: 'WH-A', locationCode: 'LOC-IN-A' });
    expect(createProductionBatch).toHaveBeenCalledWith(expect.objectContaining({
      companyCode: 'COMP-A', warehouseCode: 'WH-A', locationCode: 'LOC-IN-A',
      skuCode: 'SKU-EGG-1', productCode: 'PROD-EGG', gradeCodeStd: 'GRADE_1', specCode: 'LOOSE',
    }));
  });

  it('uses house -> farm authority ahead of spoofed explicit company/site', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ house_company_code: 'COMP-H', house_site_code: 'SITE-H', farm_code: 'FARM-A', farm_company_code: 'COMP-F', farm_site_code: 'SITE-F' }])
      .mockResolvedValueOnce([{ '?column?': 1 }])
      .mockResolvedValueOnce([{ warehouse_code: 'WH-X' }])
      .mockResolvedValueOnce([{ location_code: 'LOC-X' }])
      .mockResolvedValueOnce([{ sku_code: 'SKU-1', product_code: 'PROD', grade_code: 'GRADE_1', spec_code: 'LOOSE' }]);
    const { service } = makeService(query, jest.fn().mockResolvedValue({ batch_no: 'EGG-X' }));
    await expect(service.recordProductionInbound({
      companyCode: 'COMP-X', siteCode: 'SITE-X', houseCode: 'HOUSE-A', warehouseCode: 'WH-X', locationCode: 'LOC-X',
      eggDate: '2026-08-25', items: [{ grade: 'GRADE_1', qty: 1 }],
    })).resolves.toMatchObject({ companyCode: 'COMP-F', siteCode: 'SITE-F' });
  });

  it('returns actionable 400 for an orphan house with no ownership at either level', async () => {
    const query = jest.fn().mockResolvedValueOnce([{
      house_company_code: null, house_site_code: null, farm_code: null,
      farm_company_code: null, farm_site_code: null,
    }]);
    const { service } = makeService(query);
    await expect(service.recordProductionInbound({
      houseCode: 'HOUSE-ORPHAN', eggDate: '2026-08-25', items: [{ grade: 'GRADE_1', qty: 1 }],
    })).rejects.toThrow('鸡舍 HOUSE-ORPHAN 缺少公司归属');
  });

  it('does not widen DataScope when ownership is resolved through the farm', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ farm_code: 'FARM-B', farm_company_code: 'COMP-B', farm_site_code: 'SITE-B' }])
      .mockResolvedValueOnce([{ '?column?': 1 }]);
    const { service } = makeService(query, jest.fn(), {
      isGlobal: false, allowedCompanyCodes: ['COMP-A'], allowedWarehouseCodes: [], allowedProjectCodes: [],
    });
    await expect(service.recordProductionInbound({
      houseCode: 'HOUSE-B', eggDate: '2026-08-25', items: [{ grade: 'GRADE_1', qty: 1 }],
    })).rejects.toThrow('无权向公司 COMP-B 入库');
  });

  it('requires an explicit warehouse when a company has multiple ACTIVE warehouses', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ farm_code: 'FARM-A', farm_company_code: 'COMP-A', farm_site_code: 'SITE-A' }])
      .mockResolvedValueOnce([{ '?column?': 1 }])
      .mockResolvedValueOnce([{ warehouse_code: 'WH-A' }, { warehouse_code: 'WH-B' }]);
    const { service } = makeService(query);
    await expect(service.recordProductionInbound({
      houseCode: 'HOUSE-A', eggDate: '2026-08-25', items: [{ grade: 'GRADE_1', qty: 1 }],
    })).rejects.toThrow('存在多个 ACTIVE 仓库');
  });

  it('reports all missing SKU grades before creating any batch', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ farm_code: 'FARM-A', farm_company_code: 'COMP-A', farm_site_code: 'SITE-A' }])
      .mockResolvedValueOnce([{ '?column?': 1 }])
      .mockResolvedValueOnce([{ warehouse_code: 'WH-A' }])
      .mockResolvedValueOnce([{ location_code: 'LOC-A' }])
      .mockResolvedValueOnce([{ sku_code: 'SKU-1', product_code: 'PROD', grade_code: 'GRADE_1', spec_code: 'LOOSE' }]);
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

  it.each([{ quantities: [3] }, { quantities: [11, 22] }])('returns each original batch once when retrying $quantities', async ({ quantities }) => {
    const query = jest.fn().mockImplementation(async (sql: string) => {
      if (!sql) return [{ farm_code: 'FARM-A', farm_company_code: 'COMP-A', farm_site_code: 'SITE-A' }];
      if (sql.includes('sys_organizations')) return [{ '?column?': 1 }];
      if (sql.includes('wms_warehouses')) return [{ warehouse_code: 'WH-A' }];
      if (sql.includes('wms_locations')) return [{ location_code: 'LOC-A' }];
      if (sql.includes('product_skus')) return [{ sku_code: 'SKU-1', product_code: 'PROD', grade_code: 'GRADE_1', spec_code: 'LOOSE' }];
      return [];
    });
    const existing: any[] = [];
    const managerQuery = jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('FROM inv_batches')) return existing;
      return [];
    });
    const transaction = jest.fn(async (operation: (manager: any) => Promise<unknown>) => operation({ query: managerQuery }));
    const createProductionBatch = jest.fn().mockImplementation(async () => ({ batch_no: `EGG-${createProductionBatch.mock.calls.length}` }));
    const modeSvc = { resolveMode: jest.fn().mockResolvedValue('TEMP_PRODUCTION_INBOUND') };
    const service = new ProductionInboundService(
      { query, transaction } as never,
      { get: jest.fn() } as never,
      { createProductionBatch } as never,
      modeSvc as never,
      { resolveHouse: jest.fn(async (houseCode: string) => { const [row] = await query('', [houseCode]); return { houseCode, farmCode: row.farm_code, companyCode: row.farm_company_code, siteCode: row.farm_site_code }; }), resolveWarehouse: jest.fn(async (warehouseCode: string) => ({ warehouseCode, companyCode: 'COMP-A' })) } as never,
    );
    const dto = { houseCode: 'HOUSE-A', eggDate: '2026-08-25', items: quantities.map(qty => ({ grade: 'GRADE_1', qty })) };
    const first = await service.recordProductionInbound(dto);
    const totalInbound = quantities.reduce((sum, qty) => sum + qty, 0);
    expect(first).toMatchObject({ totalInbound, idempotent: false });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(createProductionBatch).toHaveBeenCalledTimes(quantities.length);

    existing.push(...first.batches.map(batch => ({ batch_no: batch.batchNo, quality_grade: batch.grade, qty: batch.qty, product_code: batch.productCode, sku_code: 'SKU-1', spec_code: 'LOOSE', egg_date: dto.eggDate, collection_batch_ref: 'HOUSE-HOUSE-A', warehouse_code: 'WH-A', location_code: 'LOC-A' })));
    const second = await service.recordProductionInbound(dto);
    expect(second).toMatchObject({ totalInbound, idempotent: true });
    expect(second.batches).toEqual(first.batches);
    expect(new Set(second.batches.map(batch => batch.batchNo)).size).toBe(quantities.length);
    expect(createProductionBatch).toHaveBeenCalledTimes(quantities.length);
    expect(managerQuery).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'), expect.any(Array));
  });

  it('rejects a zero-quantity request before opening an inventory transaction', async () => {
    const { service } = makeService(jest.fn());
    await expect(service.recordProductionInbound({ eggDate: '2026-08-25', items: [{ grade: 'GRADE_1', qty: 0 }] }))
      .rejects.toThrow('至少需要一个数量大于 0');
  });
});
