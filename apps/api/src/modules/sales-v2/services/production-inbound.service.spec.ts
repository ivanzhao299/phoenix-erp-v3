import { BadRequestException } from '@nestjs/common';
import {
  ProductionInboundService,
  findDailyInboundOverages,
  normalizeGradeQuantityMap,
  sumGradeQuantityMaps,
} from './production-inbound.service';
import { SkuAvailabilityService } from '../../product-master/services/sku-availability.service';

/** Orchestration unit seam; the real policy is covered by its own tests and production-inbound.pg.spec.ts. */
const makeSkuAvailability = (_skuRows: any[]) => ({
  resolveSourceProfile: jest.fn(async (input: { companyCode: string; houseCode: string; eggDate: string; farmCode?: string; siteCode?: string }) => {
    expect(input.houseCode).toBeTruthy();
    expect(input.eggDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const varietyCode = _skuRows[0]?.variety_code ?? null;
    return { ...input, profileCode: `PROFILE-${input.houseCode}`, productMode: varietyCode === null ? 'STANDARD' : 'VARIANT', varietyCode,
      farmCode: input.farmCode || 'FARM-A', siteCode: input.siteCode || 'SITE-A' };
  }),
  resolve: jest.fn(async (input: { companyCode: string; eggDate: string; gradeCode: string; specCode?: string; usage: string }, manager: { query: (sql: string, params: unknown[]) => Promise<any[]> }) => {
    expect(input.companyCode).toBeTruthy();
    expect(input.eggDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(input.usage).toBe('stock');
    const rows = (await manager.query('SELECT * FROM product_skus', [input.gradeCode, input.specCode || 'LOOSE']))
      .filter(row => row.grade_code === input.gradeCode && row.spec_code === (input.specCode || 'LOOSE'));
    if (rows.length !== 1) throw new BadRequestException(`档位 ${input.gradeCode} 必须有唯一可用 SKU`);
    const row = rows[0];
    return { skuCode: row.sku_code, productCode: row.product_code, gradeCode: row.grade_code, specCode: row.spec_code,
      varietyCode: row.variety_code ?? null, scopeType: 'COMPANY', scopeCode: input.companyCode,
      saleEnabled: true, stockEnabled: true };
  }),
} as unknown as SkuAvailabilityService);

describe('daily report inventory consistency helpers', () => {
  it('normalizes JSONB grade quantities and ignores malformed values', () => {
    expect(normalizeGradeQuantityMap('{"GRADE_1":"100","GRADE_2":-1,"":5}')).toEqual({ GRADE_1: 100 });
    expect(sumGradeQuantityMaps([
      { eggs_by_grade: { GRADE_1: 100, GRADE_2: 20 } },
      { eggs_by_grade: '{"GRADE_1":50}' },
    ])).toEqual({ GRADE_1: 150, GRADE_2: 20 });
  });

  it('finds only the grade quantities that exceed the remaining daily report allowance', () => {
    expect(findDailyInboundOverages(
      { GRADE_1: 100, GRADE_2: 50 },
      { GRADE_1: 80 },
      [{ grade: 'GRADE_1', qty: 20 }, { grade: 'GRADE_2', qty: 51 }],
    )).toEqual([{ grade: 'GRADE_2', requested: 51, remaining: 50 }]);
  });
});

describe('ProductionInboundService master-data resolution', () => {
  const defaultSku = { sku_code: 'SKU-1', product_code: 'PROD', variety_code: null, grade_code: 'GRADE_1', spec_code: 'LOOSE' };
  const makeService = (query: jest.Mock, createProductionBatch = jest.fn(), dataScope?: any, skuRows: any[] = [defaultSku]) => {
    const modeSvc = { resolveMode: jest.fn().mockResolvedValue('TEMP_PRODUCTION_INBOUND') };
    let resolvedCompany = 'COMP-A';
    return {
      service: new ProductionInboundService(
        { query, transaction: async (run: (manager: any) => unknown) => {
          let selected: any[] = [];
          const manager = { query: async (sql: string, values: unknown[]) => {
            if (sql.includes('WHERE sku_code=$1 FOR SHARE')) return selected.map(row => ({ ...row, variety_code: row.variety_code ?? null, status: 'ACTIVE',today:'2026-11-11',effective_date:null,expire_date:null }));
            if (sql.includes('SELECT * FROM mst_products')) return [{status:'ACTIVE',variety_code:selected[0]?.variety_code ?? null}];
            if (/SELECT \* FROM (product_grades|packaging_specs)/.test(sql)) return [{ status: 'ACTIVE', variety_code: null, is_storable: true }];
            if (sql.includes('FROM sys_organizations')) return [{ org_code: values[0] }];
            if (sql.includes('md_sku_org_scope')) return [{ scope_type: 'COMPANY', scope_code: values[1], status: 'ACTIVE', today: '2026-11-11', effective_date: null, expire_date: null, sale_enabled: false, stock_enabled: true }];
            if (sql.includes('md_variety_breeds')) return [{ variety_code: 'EGG_RED' }];
            if (sql.includes('FROM md_product_varieties')) return [{variety_code:values[0],status:'ACTIVE',effective_date:'2026-01-01',expire_date:null}];
            if (sql.includes('FROM brd_flocks')) return [{ breed_code: 'HY_LINE_BROWN' }];
            if (sql.includes('FROM product_skus')) {
              // 参数感知：$1=gradeCode，只有档位匹配的 SKU 才是候选（模拟真实 SQL 过滤）
              const grade = values?.[0] as string;
              const rows = skuRows.filter(r => r.grade_code === grade);
              selected = rows;
              return rows;
            }
            if (sql.includes('pg_advisory_xact_lock') || sql.includes('FROM inv_batches') || sql.includes('to_regclass')) return [];
            return await query(sql, values);
          } };
          return run(manager);
        } } as never,
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
        makeSkuAvailability(skuRows),
      ),
      createProductionBatch,
    };
  };

  it('resolves house -> farm -> company/site, unique ACTIVE warehouse/location and real SKU', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ house_company_code: null, house_site_code: null, farm_code: 'FARM-A', farm_company_code: 'COMP-A', farm_site_code: 'SITE-A' }])
      .mockResolvedValueOnce([{ '?column?': 1 }])
      .mockResolvedValueOnce([{ warehouse_code: 'WH-A' }])
      .mockResolvedValueOnce([{ location_code: 'LOC-IN-A' }]);
    const createProductionBatch = jest.fn().mockResolvedValue({ batch_no: 'EGG-1' });
    // Fixture explicitly configures an EGG_RED commercial source; it is not inferred from biological breed.
    const { service } = makeService(query, createProductionBatch, undefined, [
      { sku_code: 'SKU-EGG-1', product_code: 'PROD-EGG', variety_code: 'EGG_RED', grade_code: 'GRADE_1', spec_code: 'LOOSE' },
    ]);

    const result = await service.recordProductionInbound({
      houseCode: 'HOUSE-A', eggDate: '2026-08-25', items: [{ grade: 'GRADE_1', qty: 1 }],
    });

    expect(result).toMatchObject({ companyCode: 'COMP-A', siteCode: 'SITE-A', warehouseCode: 'WH-A', locationCode: 'LOC-IN-A' });
    expect(createProductionBatch).toHaveBeenCalledWith(expect.objectContaining({
      companyCode: 'COMP-A', warehouseCode: 'WH-A', locationCode: 'LOC-IN-A',
      skuCode: 'SKU-EGG-1', productCode: 'PROD-EGG', gradeCodeStd: 'GRADE_1', specCode: 'LOOSE', varietyCode: 'EGG_RED',
    }), expect.objectContaining({ query: expect.any(Function) }));
  });

  it('uses house -> farm authority ahead of spoofed explicit company/site', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ house_company_code: 'COMP-H', house_site_code: 'SITE-H', farm_code: 'FARM-A', farm_company_code: 'COMP-F', farm_site_code: 'SITE-F' }])
      .mockResolvedValueOnce([{ '?column?': 1 }])
      .mockResolvedValueOnce([{ warehouse_code: 'WH-X' }])
      .mockResolvedValueOnce([{ location_code: 'LOC-X' }]);
    const { service } = makeService(query, jest.fn().mockResolvedValue({ batch_no: 'EGG-X' }), undefined, [
      { sku_code: 'SKU-1', product_code: 'PROD', variety_code: 'EGG_RED', grade_code: 'GRADE_1', spec_code: 'LOOSE' },
    ]);
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
      .mockResolvedValueOnce([{ location_code: 'LOC-A' }]);
    const createProductionBatch = jest.fn();
    // 只提供 GRADE_1 的红壳 SKU；GRADE_2 无 SKU → 整单拒绝
    const { service } = makeService(query, createProductionBatch, undefined, [
      { sku_code: 'SKU-R-1-LOOSE', product_code: 'PRD-EGG-RED-1', variety_code: 'EGG_RED', grade_code: 'GRADE_1', spec_code: 'LOOSE' },
    ]);
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
      if (sql.includes('product_skus')) return [{ sku_code: 'SKU-1', product_code: 'PROD', variety_code: null, grade_code: 'GRADE_1', spec_code: 'LOOSE' }];
      return [];
    });
    const existing: any[] = [];
    const managerQuery = jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('FROM product_skus')) return [{ sku_code: 'SKU-1', product_code: 'PROD', variety_code: null, grade_code: 'GRADE_1', spec_code: 'LOOSE', status: 'ACTIVE' }];
      if (sql.includes('md_sku_org_scope')) return [{ scope_type: 'ALL', scope_code: '', sale_enabled: true, stock_enabled: true }];
      if (/SELECT \* FROM (mst_products|product_grades|packaging_specs)/.test(sql)) return [{ status: 'ACTIVE', variety_code: null, is_storable: true }];
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
      makeSkuAvailability([{ sku_code: 'SKU-1', product_code: 'PROD', variety_code: null, grade_code: 'GRADE_1', spec_code: 'LOOSE' }]),
    );
    const dto = { houseCode: 'HOUSE-A', eggDate: '2026-08-25', items: quantities.map(qty => ({ grade: 'GRADE_1', qty })) };
    const first = await service.recordProductionInbound(dto);
    const totalInbound = quantities.reduce((sum, qty) => sum + qty, 0);
    expect(first).toMatchObject({ totalInbound, idempotent: false });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(createProductionBatch).toHaveBeenCalledTimes(1);

    existing.push(...first.batches.map(batch => ({ batch_no: batch.batchNo, quality_grade: batch.grade, qty: batch.qty, product_code: batch.productCode, variety_code: batch.varietyCode, sku_code: 'SKU-1', spec_code: 'LOOSE', egg_date: dto.eggDate, collection_batch_ref: 'HOUSE-HOUSE-A', warehouse_code: 'WH-A', location_code: 'LOC-A' })));
    const second = await service.recordProductionInbound(dto);
    expect(second).toMatchObject({ totalInbound, idempotent: true });
    expect(second.batches).toEqual(first.batches);
    expect(new Set(second.batches.map(batch => batch.batchNo)).size).toBe(1);
    expect(createProductionBatch).toHaveBeenCalledTimes(1);
    expect(managerQuery).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'), expect.any(Array));
  });

  it('rejects a zero-quantity request before opening an inventory transaction', async () => {
    const { service } = makeService(jest.fn());
    await expect(service.recordProductionInbound({ eggDate: '2026-08-25', items: [{ grade: 'GRADE_1', qty: 0 }] }))
      .rejects.toThrow('至少需要一个数量大于 0');
  });

  it('rejects an idempotency key bound to a different egg date', async () => {
    const { service } = makeService(jest.fn());
    await expect(service.recordProductionInbound({
      houseCode: 'HOUSE-A', eggDate: '2026-08-25', idempotencyKey: 'DAILY-2026-08-26-HOUSE-A-abc',
      items: [{ grade: 'GRADE_1', qty: 1 }],
    })).rejects.toThrow('idempotencyKey 必须形如 DAILY-<蛋日期>-');
  });

  function buildRetryService() {
    const query = jest.fn().mockImplementation(async (sql: string) => {
      if (!sql) return [{ farm_code: 'FARM-A', farm_company_code: 'COMP-A', farm_site_code: 'SITE-A' }];
      if (sql.includes('sys_organizations')) return [{ '?column?': 1 }];
      if (sql.includes('wms_warehouses')) return [{ warehouse_code: 'WH-A' }];
      if (sql.includes('wms_locations')) return [{ location_code: 'LOC-A' }];
      if (sql.includes('product_skus')) return [{ sku_code: 'SKU-1', product_code: 'PROD', variety_code: null, grade_code: 'GRADE_1', spec_code: 'LOOSE' }];
      return [];
    });
    const existing: any[] = [];
    const managerQuery = jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('FROM product_skus')) return [{ sku_code: 'SKU-1', product_code: 'PROD', variety_code: null, grade_code: 'GRADE_1', spec_code: 'LOOSE', status: 'ACTIVE' }];
      if (sql.includes('md_sku_org_scope')) return [{ scope_type: 'ALL', scope_code: '', sale_enabled: true, stock_enabled: true }];
      if (/SELECT \* FROM (mst_products|product_grades|packaging_specs)/.test(sql)) return [{ status: 'ACTIVE', variety_code: null, is_storable: true }];
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('FOR UPDATE')) return existing;
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
      makeSkuAvailability([{ sku_code: 'SKU-1', product_code: 'PROD', variety_code: null, grade_code: 'GRADE_1', spec_code: 'LOOSE' }]),
    );
    return { service, managerQuery, createProductionBatch, existing };
  }

  it('replays one daily report regardless of which caller key created it', async () => {
    const { service, managerQuery, createProductionBatch, existing } = buildRetryService();
    const dto = { houseCode: 'HOUSE-A', eggDate: '2026-08-25', items: [{ grade: 'GRADE_1', qty: 5 }] };
    const first = await service.recordProductionInbound({ ...dto, idempotencyKey: 'DAILY-2026-08-25-HOUSE-A-aaaa' });
    expect(first).toMatchObject({ totalInbound: 5, idempotent: false });

    existing.push(...first.batches.map(batch => ({ batch_no: batch.batchNo, quality_grade: batch.grade, qty: batch.qty, product_code: batch.productCode, variety_code: batch.varietyCode, sku_code: 'SKU-1', spec_code: 'LOOSE', egg_date: dto.eggDate, collection_batch_ref: 'HOUSE-HOUSE-A', warehouse_code: 'WH-A', location_code: 'LOC-A' })));
    const second = await service.recordProductionInbound({ ...dto, idempotencyKey: 'DAILY-2026-08-25-HOUSE-A-bbbb' });
    expect(second).toMatchObject({ totalInbound: 5, idempotent: true });
    expect(second.batches).toEqual(first.batches);
    expect(createProductionBatch).toHaveBeenCalledTimes(1);
    // The serialization lock covers the daily report dimension, not the key.
    const lock = managerQuery.mock.calls.find(([sql]) => String(sql).includes('pg_advisory_xact_lock'));
    expect(lock![1][0]).toContain('TEMP_PRODUCTION_DAILY');
    expect(lock![1][0]).toContain('2026-08-25');
  });

  it('replays an omitted-spec daily request from stored identities after master availability changes', async () => {
    const { service, managerQuery, createProductionBatch, existing } = buildRetryService();
    existing.push({ batch_no: 'OLD-BATCH', quality_grade: 'GRADE_1', qty: 5, product_code: 'OLD-PRODUCT', sku_code: 'FROZEN-SKU', spec_code: 'LOOSE', egg_date: '2026-08-25', collection_batch_ref: 'HOUSE-HOUSE-A', warehouse_code: 'WH-A', location_code: 'LOC-A' });
    await expect(service.recordProductionInbound({ houseCode: 'HOUSE-A', eggDate: '2026-08-25', items: [{ grade: 'GRADE_1', qty: 5 }] })).resolves.toMatchObject({ idempotent: true, batches: [{ batchNo: 'OLD-BATCH', productCode: 'OLD-PRODUCT' }] });
    expect(managerQuery.mock.calls.some(([sql]) => sql.includes('product_skus'))).toBe(false);
    expect(createProductionBatch).not.toHaveBeenCalled();
  });

  it('counts already-posted batches against the allowance whatever source key created them', async () => {
    const query = jest.fn().mockImplementation(async (sql: string) => {
      if (!sql) return [{ farm_code: 'FARM-A', farm_company_code: 'COMP-A', farm_site_code: 'SITE-A' }];
      if (sql.includes('sys_organizations')) return [{ '?column?': 1 }];
      if (sql.includes('wms_warehouses')) return [{ warehouse_code: 'WH-A' }];
      if (sql.includes('wms_locations')) return [{ location_code: 'LOC-A' }];
      if (sql.includes('product_skus')) return [{ sku_code: 'SKU-1', product_code: 'PROD', variety_code: null, grade_code: 'GRADE_1', spec_code: 'LOOSE' }];
      return [];
    });
    const managerQuery = jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('FROM product_skus')) return [{ sku_code: 'SKU-1', product_code: 'PROD', variety_code: null, grade_code: 'GRADE_1', spec_code: 'LOOSE', status: 'ACTIVE' }];
      if (sql.includes('md_sku_org_scope')) return [{ scope_type: 'ALL', scope_code: '', sale_enabled: true, stock_enabled: true }];
      if (/SELECT \* FROM (mst_products|product_grades|packaging_specs)/.test(sql)) return [{ status: 'ACTIVE', variety_code: null, is_storable: true }];
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('FOR UPDATE')) return [];
      if (sql.includes('to_regclass')) return [{ table_name: 'brd_daily_logs' }];
      if (sql.includes('FROM brd_daily_logs')) return [{ eggs_by_grade: { GRADE_1: 100 } }];
      if (sql.includes('GROUP BY')) return [{ grade: 'GRADE_1', qty: 80 }];
      return [];
    });
    const transaction = jest.fn(async (operation: (manager: any) => Promise<unknown>) => operation({ query: managerQuery }));
    const modeSvc = { resolveMode: jest.fn().mockResolvedValue('TEMP_PRODUCTION_INBOUND') };
    const service = new ProductionInboundService(
      { query, transaction } as never,
      { get: jest.fn() } as never,
      { createProductionBatch: jest.fn() } as never,
      modeSvc as never,
      { resolveHouse: jest.fn(async (houseCode: string) => { const [row] = await query('', [houseCode]); return { houseCode, farmCode: row.farm_code, companyCode: row.farm_company_code, siteCode: row.farm_site_code }; }), resolveWarehouse: jest.fn(async (warehouseCode: string) => ({ warehouseCode, companyCode: 'COMP-A' })) } as never,
      makeSkuAvailability([{ sku_code: 'SKU-1', product_code: 'PROD', variety_code: null, grade_code: 'GRADE_1', spec_code: 'LOOSE' }]),
    );
    await expect(service.recordProductionInbound({
      houseCode: 'HOUSE-A', eggDate: '2026-08-25', idempotencyKey: 'DAILY-2026-08-25-HOUSE-A-cccc',
      items: [{ grade: 'GRADE_1', qty: 30 }],
    })).rejects.toThrow('剩余额度');
  });
});
