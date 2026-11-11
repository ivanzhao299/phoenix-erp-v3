import { ConflictException } from '@nestjs/common';
import { EggInventoryService } from './egg-inventory.service';
import { SkuAvailabilityService } from '../../product-master/services/sku-availability.service';

describe('EggInventoryService conditional inventory updates', () => {
  it('fails closed when FIFO candidate no longer matches the guarded update', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM product_skus')) return [{ sku_code: 'SKU-1', product_code: 'P-1', grade_code: 'G', spec_code: 'S', status: 'ACTIVE' }];
      if (/SELECT \* FROM (mst_products|product_grades|packaging_specs)/.test(sql)) return [{ status: 'ACTIVE', is_saleable: true, is_storable: true }];
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('SELECT * FROM inv_batches')) return [{
        batch_no: 'B-1', company_code: 'COMP-A', warehouse_code: 'WH-A',
        status: 'AVAILABLE', qty_available: 5, sku_code: 'SKU-1', legacy_source: null,
      }];
      if (sql.includes('SELECT batch_no FROM changed')) return [];
      return [];
    });
    const service = new EggInventoryService({ query, transaction: async (run: (manager: any) => unknown) => run({ query }) } as never, { get: jest.fn() } as never);

    await expect(service.allocateByFIFO({
      productCode: 'P-1', skuCode: 'SKU-1', companyCode: 'COMP-A', qty: 2,
      refNo: 'SO-1', note: 'test',
    })).rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("AND warehouse_code=$4"),
      [2, 'B-1', 'COMP-A', 'WH-A'],
    );
  });

  it('reports company, SKU, requested qty and company-allocatable qty without warehouse details', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM product_skus')) return [{ sku_code: 'SKU-1', product_code: 'P-1', grade_code: 'G', spec_code: 'S', status: 'ACTIVE' }];
      if (/SELECT \* FROM (mst_products|product_grades|packaging_specs)/.test(sql)) return [{ status: 'ACTIVE', is_saleable: true, is_storable: true }];
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('SELECT * FROM inv_batches')) return [{
        batch_no: 'B-1', company_code: 'COMP-A', warehouse_code: 'WH-SECRET',
        status: 'AVAILABLE', qty_available: 3, sku_code: 'SKU-1', legacy_source: null,
      }];
      if (sql.includes('SELECT batch_no FROM changed')) return [{ batch_no: 'B-1' }];
      return [];
    });
    const service = new EggInventoryService({ query, transaction: async (run: (manager: any) => unknown) => run({ query }) } as never, { get: jest.fn() } as never);

    await expect(service.allocateByFIFO({
      productCode: 'P-1', skuCode: 'SKU-1', companyCode: 'COMP-A', qty: 5,
      refNo: 'SO-1', note: 'test',
    })).rejects.toThrow('库存不足：订单公司=COMP-A sku=SKU-1 需求量=5 该公司可分配量=3');

    try {
      await service.allocateByFIFO({
        productCode: 'P-1', skuCode: 'SKU-1', companyCode: 'COMP-A', qty: 5,
        refNo: 'SO-1', note: 'test',
      });
    } catch (error) {
      expect(String((error as Error).message)).not.toContain('WH-SECRET');
      expect(String((error as Error).message)).not.toContain('batch');
    }
  });

  it('keeps the complete FIFO company/status/expiry/legacy matrix and SKU path in SQL', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM product_skus')) return [{ sku_code: 'SKU-1', product_code: 'P-1', grade_code: 'G', spec_code: 'S', status: 'ACTIVE' }];
      if (/SELECT \* FROM (mst_products|product_grades|packaging_specs)/.test(sql)) return [{ status: 'ACTIVE', is_saleable: true, is_storable: true }];
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('SELECT * FROM inv_batches')) return [{
        batch_no: 'B-1', warehouse_code: 'WH-A', qty_available: 1, sku_code: 'SKU-1',
      }];
      if (sql.includes('SELECT batch_no FROM changed')) return [{ batch_no: 'B-1' }];
      return [];
    });
    const service = new EggInventoryService({ query, transaction: async (run: (manager: any) => unknown) => run({ query }) } as never, { get: jest.fn() } as never);
    await service.allocateByFIFO({
      productCode: 'P-1', skuCode: 'SKU-1', companyCode: 'COMP-A', qty: 1,
      refNo: 'SO-1', note: 'test',
    });
    const candidateSql = String(query.mock.calls.find(([sql]) => String(sql).includes('SELECT * FROM inv_batches'))?.[0]);
    expect(candidateSql).toContain('company_code = $1');
    expect(candidateSql).toContain("status = 'AVAILABLE'");
    expect(candidateSql).toContain('qty_available > 0');
    expect(candidateSql).toContain('expire_date >= CURRENT_DATE');
    expect(candidateSql).toContain('legacy_source IS NULL');
    expect(candidateSql).toContain('sku_code = $2');
    expect(candidateSql).toContain('ORDER BY expire_date ASC NULLS LAST, created_at ASC');
    expect(candidateSql).toContain('FOR UPDATE');
  });
});

describe('EggInventoryService getExpiringBatches DataScope', () => {
  it('filters a normal user to allowed companies', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const cls = { get: jest.fn().mockReturnValue({ isGlobal: false, allowedCompanyCodes: ['COMP-A'] }) };
    const service = new EggInventoryService({ query, transaction: async (run: (manager: any) => unknown) => run({ query }) } as never, cls as never);
    await service.getExpiringBatches({ days: 7 });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('company_code = ANY($2)'), [7, ['COMP-A']]);
  });

  it('fails closed when a normal user has no company scope', async () => {
    const query = jest.fn();
    const cls = { get: jest.fn().mockReturnValue({ isGlobal: false, allowedCompanyCodes: [] }) };
    const service = new EggInventoryService({ query, transaction: async (run: (manager: any) => unknown) => run({ query }) } as never, cls as never);
    await expect(service.getExpiringBatches({ days: 7 })).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('keeps global scheduled scans unfiltered when CLS has no request scope', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const cls = { get: jest.fn().mockReturnValue(undefined) };
    const service = new EggInventoryService({ query, transaction: async (run: (manager: any) => unknown) => run({ query }) } as never, cls as never);
    await service.getExpiringBatches({ days: 3 });
    expect(query).toHaveBeenCalledWith(expect.not.stringContaining('company_code = ANY'), [3]);
  });

  it('uses the same sellable egg-family scope as the inventory dashboard', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new EggInventoryService({ query, transaction: async (run: (manager: any) => unknown) => run({ query }) } as never, { get: jest.fn() } as never);
    await service.getExpiringBatches({ days: 7 });
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("b.status = 'AVAILABLE'");
    expect(sql).toContain("b.product_code = 'EGG' OR b.product_code LIKE 'PRD-EGG-%'");
  });

  it('orders expiring batches by expiry date with a stable batch/id tie-breaker', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new EggInventoryService({ query, transaction: async (run: (manager: any) => unknown) => run({ query }) } as never, { get: jest.fn() } as never);
    await service.getExpiringBatches({ days: 7 });
    expect(String(query.mock.calls[0][0])).toContain(
      'ORDER BY b.expire_date ASC, b.batch_no ASC, b.id ASC',
    );
  });
});

describe('EggInventoryService inventory list/dashboard parity', () => {
  it('treats EGG as the legacy-plus-PRD-EGG product family and preserves unmapped rows', async () => {
    const rows = [{
      batch_no: 'EGG-20260908-00001', product_code: 'PRD-EGG-1', sku_code: null,
      product_name: 'PRD-EGG-1', qty_available: 100, status: 'AVAILABLE',
    }];
    const query = jest.fn().mockResolvedValue(rows);
    const service = new EggInventoryService({ query, transaction: async (run: (manager: any) => unknown) => run({ query }) } as never, { get: jest.fn() } as never);

    await expect(service.getAvailableBatches({ productCode: 'EGG' })).resolves.toEqual(rows);

    const [sql, args] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("b.product_code = 'EGG' OR b.product_code LIKE 'PRD-EGG-%'");
    expect(sql).toContain("b.status = 'AVAILABLE'");
    expect(sql).toContain('b.qty_available > 0');
    expect(sql).toContain('b.expire_date IS NULL OR b.expire_date >= CURRENT_DATE');
    expect(sql).toContain('LEFT JOIN product_skus');
    expect(sql).toContain('LEFT JOIN mst_products');
    expect(sql).toContain('COALESCE(p.product_name_zh, sku.sku_name, b.product_code)');
    expect(sql).toContain('ORDER BY b.egg_date DESC NULLS LAST, b.batch_no DESC, b.id DESC');
    expect(args).toEqual([]);
  });

  it('keeps same-production-date pagination deterministic and non-overlapping', () => {
    const rows = [
      { id: 1, eggDate: '2026-09-08', batchNo: 'EGG-A' },
      { id: 2, eggDate: '2026-09-08', batchNo: 'EGG-B' },
      { id: 3, eggDate: '2026-09-08', batchNo: 'EGG-B' },
      { id: 4, eggDate: '2026-09-07', batchNo: 'EGG-Z' },
    ].sort((a, b) => b.eggDate.localeCompare(a.eggDate)
      || b.batchNo.localeCompare(a.batchNo)
      || b.id - a.id);
    const page1 = rows.slice(0, 2);
    const page2 = rows.slice(2, 4);
    expect(rows.map((row) => row.id)).toEqual([3, 2, 1, 4]);
    expect(new Set([...page1, ...page2].map((row) => row.id)).size).toBe(4);
  });

  it('applies DataScope to batches and fails closed outside the requested company', async () => {
    const query = jest.fn();
    const cls = { get: jest.fn().mockReturnValue({ isGlobal: false, allowedCompanyCodes: ['COMP-A'] }) };
    const service = new EggInventoryService({ query, transaction: async (run: (manager: any) => unknown) => run({ query }) } as never, cls as never);

    await expect(service.getAvailableBatches({ productCode: 'EGG', companyCode: 'COMP-B' })).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('keeps active batch count and quantity on the exact list status/qty/expiry scope', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM product_skus')) return [{ sku_code: 'SKU-1', product_code: 'P-1', grade_code: 'G', spec_code: 'S', status: 'ACTIVE' }];
      if (/SELECT \* FROM (mst_products|product_grades|packaging_specs)/.test(sql)) return [{ status: 'ACTIVE', is_saleable: true, is_storable: true }];
      if (sql.includes("inventory.expiring_warn_days")) return [];
      if (sql.includes('FROM inv_batches b')) return [{
        active_batches: '2', total_available: '150', expiring_batches: '1', expiring_qty: '50',
        expired_batches: '0', returned_batches: '0', sku_linked_batches: '1',
      }];
      return [{ expire_loss: '0', damage_loss: '0', write_off: '0' }];
    });
    const service = new EggInventoryService({ query, transaction: async (run: (manager: any) => unknown) => run({ query }) } as never, { get: jest.fn() } as never);

    await expect(service.getDashboardStats()).resolves.toMatchObject({ activeBatches: 2, totalAvailable: 150, expiringWarnDays: 7 });

    const statsSql = String(query.mock.calls.find(([sql]) => String(sql).includes('FROM inv_batches b'))?.[0]);
    expect(statsSql).toContain("b.product_code = 'EGG' OR b.product_code LIKE 'PRD-EGG-%'");
    expect(statsSql).toContain("b.status='AVAILABLE' AND b.qty_available > 0");
    expect(statsSql).toContain('b.expire_date IS NULL OR b.expire_date >= CURRENT_DATE');
  });
});

describe('EggInventoryService loss analysis contract', () => {
  it('returns transitional aliases and aggregates multiple ledger rows by batch', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{
        change_type: 'EXPIRE_WRITEOFF', record_count: '3', batch_count: '2', total_qty: '15',
      }])
      .mockResolvedValueOnce([{
        batch_no: 'EGG-1', product_code: 'PRD-EGG-1', sku_code: 'SKU-1',
        record_count: '2', total_loss: '12', last_event: '2026-09-08T08:00:00.000Z',
      }])
      .mockResolvedValueOnce([{
        expire_total: '15', damage_total: '2', write_off_total: '3', total_loss: '24', total_records: '5',
      }]);
    const service = new EggInventoryService({ query, transaction: async (run: (manager: any) => unknown) => run({ query }) } as never, { get: jest.fn().mockReturnValue(undefined) } as never);

    await expect(service.getLossAnalysis()).resolves.toEqual({
      byType: [{
        change_type: 'EXPIRE_WRITEOFF', record_count: 3, batch_count: 2,
        total_qty: 15, total_loss: 15,
      }],
      byBatch: [{
        batch_no: 'EGG-1', product_code: 'PRD-EGG-1', sku_code: 'SKU-1',
        record_count: 2, total_loss: 12, last_event: '2026-09-08T08:00:00.000Z',
      }],
      summary: {
        expire_total: 15, damage_total: 2, write_off_total: 3, total_records: 5,
        total_expire_loss: 15, total_damage_loss: 2, total_loss: 24,
      },
    });

    const batchSql = String(query.mock.calls[1][0]);
    expect(batchSql).toContain('FROM inv_ledger il');
    expect(batchSql).toContain('GROUP BY il.company_code, il.batch_no');
    expect(batchSql).toContain('SUM(ABS(il.qty_change))');
    expect(batchSql).toContain('MAX(il.created_at) AS last_event');
    expect(batchSql).not.toContain("b.status IN ('EXPIRED','WRITTEN_OFF')");
  });

  it('uses the same company DataScope behavior as the other inventory tabs', async () => {
    const query = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{}]);
    const cls = { get: jest.fn().mockReturnValue({ isGlobal: false, allowedCompanyCodes: ['COMP-A'] }) };
    const service = new EggInventoryService({ query, transaction: async (run: (manager: any) => unknown) => run({ query }) } as never, cls as never);

    await service.getLossAnalysis('COMP-A');
    expect(query).toHaveBeenCalledTimes(3);
    for (const [sql, args] of query.mock.calls) {
      expect(String(sql)).toContain('il.company_code = ANY($1)');
      expect(args).toEqual([['COMP-A']]);
    }
  });

  it('fails closed before querying when the requested company is outside DataScope', async () => {
    const query = jest.fn();
    const cls = { get: jest.fn().mockReturnValue({ isGlobal: false, allowedCompanyCodes: ['COMP-A'] }) };
    const service = new EggInventoryService({ query, transaction: async (run: (manager: any) => unknown) => run({ query }) } as never, cls as never);

    await expect(service.getLossAnalysis('COMP-B')).resolves.toMatchObject({
      byType: [], byBatch: [], summary: { total_expire_loss: 0, total_damage_loss: 0, total_loss: 0 },
    });
    expect(query).not.toHaveBeenCalled();
  });
});

describe('EggInventoryService createProductionBatch SQL contract', () => {
  it('rejects TEMP_PRODUCTION without a resolved warehouse and location', async () => {
    const service = new EggInventoryService({ query: jest.fn() } as never, { get: jest.fn() } as never);
    await expect(service.createProductionBatch({
      companyCode: 'COMP-A', eggDate: '2026-08-25', productCode: 'PROD-A', qty: 1,
      sourceType: 'TEMP_PRODUCTION',
    })).rejects.toThrow('禁止使用默认占位码');
  });

  it('keeps inv_batches target columns, value expressions and parameters aligned', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ grade_code: 'GRADE_1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ max_suffix: null }])
      .mockResolvedValueOnce([{ unit_zh: '枚', status: 'ACTIVE', variety_code: null }])
      .mockResolvedValueOnce([]) // No ACTIVE source profiles for this legacy company.
      .mockResolvedValueOnce([{ batch_no: 'EGG-20260825-00001' }])
      .mockResolvedValueOnce([]);
    const cls = { get: jest.fn().mockReturnValue({ username: 'tester' }) };
    const transaction = jest.fn(async (run: (manager: unknown) => Promise<unknown>) => run({ query }));
    const service = new EggInventoryService({ query, transaction } as never, cls as never);

    await service.createProductionBatch({
      companyCode: 'COMP-A',
      warehouseCode: 'WH-A',
      locationCode: 'LOC-A',
      eggDate: '2026-08-25',
      qualityGrade: 'GRADE_1',
      gradeCodeStd: 'GRADE_1',
      productCode: 'PRD-EGG-GRADE_1',
      qty: 1,
      // This column-alignment fixture is the explicitly variety-less legacy path.
      sourceType: 'PRODUCTION',
      ledgerChangeType: 'INBOUND',
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls.find(([statement]) => statement.includes('INSERT INTO inv_batches'))! as [string, unknown[]];
    const insert = sql.match(/INSERT INTO inv_batches\s*\(([^)]*)\)\s*VALUES\s*\(([\s\S]*?)\)\s*RETURNING/);
    expect(insert).not.toBeNull();
    const columns = insert![1].split(',').map(value => value.trim());
    const values = insert![2].split(',').map(value => value.trim());
    expect(values).toHaveLength(columns.length);
    const placeholders = [...sql.matchAll(/\$(\d+)/g)].map(match => Number(match[1]));
    expect(Math.max(...placeholders)).toBe(params.length);
  });
});

/** Exercise the real availability service; direct core calls cannot bypass scope/provenance. */
describe('EggInventoryService direct production variety authorization', () => {
  const request = {
    companyCode: 'COMP-A', eggDate: '2026-11-01', productCode: 'PRD-R', qty: 2,
    skuCode: 'SKU-R', varietyCode: 'EGG_RED', warehouseCode: 'WH-A', locationCode: 'LOC-A',
    sourceType: 'TEMP_PRODUCTION', sourceProfileCode: 'SRC-A', houseCode: 'HOUSE-A',
  };
  const setup = () => {
    const state = {
      sku: { sku_code: 'SKU-R', product_code: 'PRD-R', grade_code: 'GRADE_1', spec_code: 'LOOSE',
        variety_code: 'EGG_RED' as string | null | undefined, status: 'ACTIVE', effective_date: null, expire_date: null, today: '2026-11-11' },
      product: { product_code: 'PRD-R', status: 'ACTIVE', unit: '枚', unit_zh: '枚', variety_code: 'EGG_RED' as string | null | undefined },
      scopes: [{ scope_type: 'COMPANY', scope_code: 'COMP-A', sale_enabled: true, stock_enabled: true,
        status: 'ACTIVE', effective_date: null, expire_date: null, today: '2026-11-11' }],
      warehouses: [{warehouse_code:'WH-A',company_code:'COMP-A',status:'ACTIVE'}],
      locations: [{location_code:'LOC-A',warehouse_code:'WH-A',status:'ACTIVE'}],
      varieties: [{ variety_code: 'EGG_RED', status: 'ACTIVE', effective_date: null, expire_date: null }],
      profiles: [{ profile_code: 'SRC-A', company_code: 'COMP-A', farm_code: 'FARM-A', site_code: 'SITE-A', house_code: 'HOUSE-A', product_mode: 'VARIANT', variety_code: 'EGG_RED' as string | null, effective_date: '2026-01-01', expire_date: null as string | null, status: 'ACTIVE' }],
    };
    const query = jest.fn(async (sql: string, args: unknown[] = []) => {
      if (sql.includes('FROM wms_warehouses')) return state.warehouses;
      if (sql.includes('FROM wms_locations')) return state.locations;
      if (sql.includes('FROM sys_organizations')) return [{ org_code: args[0] }];
      if (sql.includes('FROM brd_houses')) return [{ house_code: args[0], farm_code: 'FARM-A', company_code: 'COMP-A', site_code: 'SITE-A' }];
      if (sql.includes('FROM md_egg_source_profiles')) return state.profiles.filter(profile => args.length === 1
        ? profile.company_code === args[0] : profile.house_code === args[1]);
      if (sql.includes('FROM md_product_varieties')) return state.varieties;
      if (sql.includes('FROM md_sku_org_scope')) return state.scopes;
      if (sql.includes('sp.base_unit')) return [{ ...state.sku, unit: '枚', unit_zh: '枚', base_unit: '枚', display_unit: '枚', qty_per_unit: 1 }];
      if (sql.includes('FROM product_skus s')) return [{ ...state.sku, product_variety_code: state.product.variety_code }];
      if (sql.includes('FROM product_skus')) return [state.sku];
      if (sql.includes('FROM mst_products')) return [state.product];
      if (sql.includes('SELECT grade_code FROM product_grades')) return [{ grade_code: 'GRADE_1' }];
      if (sql.includes('FROM product_grades')) return [{ status: 'ACTIVE', is_storable: true, is_saleable: true }];
      if (sql.includes('FROM packaging_specs')) return [{ status: 'ACTIVE', base_unit: '枚' }];
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('AS max_suffix')) return [{ max_suffix: null }];
      if (sql.includes('INSERT INTO inv_batches')) return [{ batch_no: args[0], variety_code: args[18], source_profile_code: args[19], source_profile_snapshot: args[20] ? JSON.parse(String(args[20])) : null }];
      if (sql.includes('INSERT INTO inv_ledger')) return [{ id: 1 }];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const mgr = { query };
    const ds = { query: jest.fn(() => { throw new Error('must use caller manager'); }),
      transaction: jest.fn(async (run: (tx: unknown) => unknown) => run(mgr)) };
    const availability = new SkuAvailabilityService(ds as never);
    const assertUsable = jest.spyOn(availability, 'assertUsable');
    const service = new EggInventoryService(ds as never, { get: jest.fn() } as never, availability);
    const expectNoWrites = () => expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO inv_'))).toBe(false);
    return { service, state, query, mgr, ds, assertUsable, expectNoWrites };
  };

  it('requires real company scope, uses caller transaction and snapshots the validated master variety', async () => {
    const { service, mgr, query, ds, assertUsable } = setup();
    await expect(service.createProductionBatch(request, mgr as never)).resolves.toMatchObject({ variety_code: 'EGG_RED' });
    expect(assertUsable).toHaveBeenCalledWith('SKU-R', {
      companyCode: 'COMP-A', eggDate: '2026-11-01', varietyCode: 'EGG_RED', usage: 'stock',
      sourceProfileCode: 'SRC-A', houseCode: 'HOUSE-A', farmCode: 'FARM-A', siteCode: 'SITE-A',
    }, mgr);
    expect(ds.query).not.toHaveBeenCalled();
    expect(ds.transaction).not.toHaveBeenCalled();
    const [sql, values] = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO inv_batches'))!;
    expect(sql).toContain('variety_code');
    expect(values).toBeDefined();
    expect(values![18]).toBe('EGG_RED');
    expect(query.mock.calls.find(([sql]) => sql.includes('SELECT unit,unit_zh,status,variety_code'))![0]).toContain('FOR SHARE');
  });

  it('rejects cross-company direct production even if SKU status is ACTIVE', async () => {
    const { service, expectNoWrites } = setup();
    await expect(service.createProductionBatch({ ...request, companyCode: 'COMP-B' })).rejects.toThrow('真实 ACTIVE 仓库');
    expectNoWrites();
  });

  it('rejects direct production when COMPANY stock use is disabled', async () => {
    const { service, state, expectNoWrites } = setup();
    state.scopes[0].stock_enabled = false;
    await expect(service.createProductionBatch(request)).rejects.toThrow('用途被禁用');
    expectNoWrites();
  });

  it.each([undefined, '', 'EGG_PINK'])('rejects missing/mismatched variety %p without defaulting from SKU', async varietyCode => {
    const { service, expectNoWrites } = setup();
    await expect(service.createProductionBatch({ ...request, sourceType: 'PRODUCTION', varietyCode })).rejects.toThrow('显式提供');
    expectNoWrites();
  });

  it('rejects a variant product without SKU even on the legacy direct route', async () => {
    const { service, expectNoWrites } = setup();
    await expect(service.createProductionBatch({ ...request, sourceType: 'PRODUCTION', skuCode: undefined, sourceProfileCode: undefined, houseCode: undefined, qualityGrade: 'GRADE_1' }))
      .rejects.toThrow('有品种的产品必须选择 SKU');
    expectNoWrites();
  });

  it.each([[null, 'EGG_RED'], ['EGG_RED', null], ['EGG_PINK', 'EGG_RED']])(
    'rejects inconsistent SKU/product variety %p/%p', async (skuVariety, productVariety) => {
      const { service, state, expectNoWrites } = setup();
      state.sku.variety_code = skuVariety;
      state.product.variety_code = productVariety;
      await expect(service.createProductionBatch(request)).rejects.toThrow(/^SKU SKU-R 与父产品商业品种不一致或主档不明确$/);
      expectNoWrites();
    },
  );

  it('rejects inactive or out-of-date variety in the real availability gate', async () => {
    const { service, state, expectNoWrites } = setup();
    state.varieties = [];
    await expect(service.createProductionBatch(request)).rejects.toThrow('品种 EGG_RED');
    expectNoWrites();
  });

  it.each(['product', 'sku'] as const)('does not treat an omitted %s variety column as explicit legacy NULL', async field => {
    const { service, state, expectNoWrites } = setup();
    state[field].variety_code = undefined;
    await expect(service.createProductionBatch(request)).rejects.toThrow(field === 'product'
      ? /^SKU SKU-R 与父产品商业品种不一致或主档不明确$/ : /^产品\/SKU 品种主档不明确，禁止创建库存$/);
    expectNoWrites();
  });

  it('preserves only explicitly variety-less legacy direct production without claiming scope isolation', async () => {
    const { service, state, assertUsable } = setup();
    state.profiles = [];
    state.product.variety_code = null;
    state.sku.variety_code = null;
    await expect(service.createProductionBatch({ ...request, sourceType: 'PRODUCTION',
      skuCode: undefined, varietyCode: undefined, sourceProfileCode: undefined, houseCode: undefined, qualityGrade: 'GRADE_1' })).resolves.toMatchObject({ variety_code: null });
    expect(assertUsable).not.toHaveBeenCalled();
  });

  it('rejects client-authored variety snapshots on explicitly variety-less legacy products', async () => {
    const { service, state, expectNoWrites } = setup();
    state.product.variety_code = null;
    state.sku.variety_code = null;
    await expect(service.createProductionBatch({ ...request, sourceType: 'PRODUCTION', sourceProfileCode: undefined, houseCode: undefined })).rejects.toThrow('不得写入品种快照');
    expectNoWrites();
  });

  it.each([{ skuCode: undefined }, { sourceProfileCode: undefined, houseCode: undefined }])('requires explicit provenance for TEMP_PRODUCTION %p', async missing => {
    const { service, ds, expectNoWrites } = setup();
    await expect(service.createProductionBatch({ ...request, ...missing })).rejects.toThrow('必须显式提供已由来源确认');
    expect(ds.transaction).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it('does not allow PACKAGING to reuse the variety-less legacy production exception', async () => {
    const { service, state, expectNoWrites } = setup();
    state.product.variety_code = null;
    state.sku.variety_code = null;
    await expect(service.createProductionBatch({ ...request, sourceType: 'PACKAGING', varietyCode: undefined, sourceProfileCode: undefined, houseCode: undefined }))
      .rejects.toThrow('必须显式提供已由来源确认');
    expectNoWrites();
  });

  it('snapshots STANDARD NULL variety and source identity from the database', async () => {
    const { service, state, query } = setup();
    state.profiles[0].product_mode = 'STANDARD';
    state.profiles[0].variety_code = null;
    state.product.variety_code = null;
    state.sku.variety_code = null;
    await expect(service.createProductionBatch({ ...request, varietyCode: null })).resolves.toMatchObject({
      variety_code: null, source_profile_code: 'SRC-A',
      source_profile_snapshot: [{ profileCode: 'SRC-A', houseCode: 'HOUSE-A', productMode: 'STANDARD', varietyCode: null, effectiveDate: '2026-01-01' }],
    });
    const [, values] = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO inv_batches'))!;
    expect(values![18]).toBeNull();
    expect(values![19]).toBe('SRC-A');
  });

  it.each(['TEMP_PRODUCTION', 'PACKAGING'])('cannot label a plain SKU as STANDARD without a source profile: %s', async sourceType => {
    const { service, state, expectNoWrites } = setup();
    state.product.variety_code = null;
    state.sku.variety_code = null;
    await expect(service.createProductionBatch({ ...request, sourceType, varietyCode: null,
      sourceProfileCode: undefined, houseCode: undefined })).rejects.toThrow('source profile');
    expectNoWrites();
  });

  it.each([
    { sourceProfileCode: 'OTHER' }, { houseCode: 'HOUSE-OTHER' },
    { eggDate: '2025-12-31' }, { eggDate: '2026-02-30' }, { eggDate: '2026-11-01T00:00:00Z' },
  ])('core validates profile code/house/business date rather than trusting caller %p', async change => {
    const { service, expectNoWrites } = setup();
    await expect(service.createProductionBatch({ ...request, ...change })).rejects.toThrow();
    expectNoWrites();
  });

  it('rejects expired or overlapping profile before inventory writes', async () => {
    const { service, state, expectNoWrites } = setup();
    state.profiles[0].expire_date = '2026-10-31';
    await expect(service.createProductionBatch(request)).rejects.toThrow('缺少有效来源档案');
    state.profiles[0].expire_date = null;
    state.profiles.push({ ...state.profiles[0], profile_code: 'SRC-B' });
    await expect(service.createProductionBatch(request)).rejects.toThrow('重叠');
    expectNoWrites();
  });

  it('validates every multi-house ref and stores a complete immutable snapshot, not a fake scalar', async () => {
    const { service, state, assertUsable } = setup();
    state.profiles.push({ ...state.profiles[0], profile_code: 'SRC-B', house_code: 'HOUSE-B' });
    const sourceProfileRefs = [{ profileCode: 'SRC-B', houseCode: 'HOUSE-B' }, { profileCode: 'SRC-A', houseCode: 'HOUSE-A' }];
    await expect(service.createProductionBatch({ ...request, sourceType: 'PACKAGING',
      sourceProfileCode: undefined, houseCode: undefined, sourceProfileRefs })).resolves.toMatchObject({
      source_profile_code: null,
      source_profile_snapshot: [
        { profileCode: 'SRC-A', houseCode: 'HOUSE-A', productMode: 'VARIANT', varietyCode: 'EGG_RED' },
        { profileCode: 'SRC-B', houseCode: 'HOUSE-B', productMode: 'VARIANT', varietyCode: 'EGG_RED' },
      ],
    });
    expect(assertUsable).toHaveBeenCalledTimes(2);
    state.profiles[1].variety_code = 'EGG_PINK';
    state.varieties.push({ variety_code: 'EGG_PINK', status: 'ACTIVE', effective_date: null, expire_date: null });
    await expect(service.createProductionBatch({ ...request, sourceProfileCode: undefined, houseCode: undefined, sourceProfileRefs }))
      .rejects.toThrow('多个来源档案');
  });

  it.each([
    { sourceProfileRefs: [] },
    { sourceProfileRefs: [{ profileCode: 'SRC-A', houseCode: 'HOUSE-A' }, { profileCode: 'SRC-A', houseCode: 'HOUSE-A' }] },
    { sourceProfileRefs: [{ profileCode: '', houseCode: 'HOUSE-A' }] },
  ])('rejects empty, duplicate or incomplete refs %p', async ({ sourceProfileRefs }) => {
    const { service, expectNoWrites } = setup();
    await expect(service.createProductionBatch({ ...request, sourceProfileCode: undefined, houseCode: undefined, sourceProfileRefs }))
      .rejects.toThrow('refs');
    expectNoWrites();
  });

  it.each([
    { warehouseCode: undefined }, { locationCode: undefined }, { warehouseCode: '' }, { locationCode: ' ' },
  ])('requires explicit destinations even for default PRODUCTION with a source: %p', async missing => {
    const { service, ds, expectNoWrites } = setup();
    await expect(service.createProductionBatch({ ...request, sourceType: undefined, ...missing })).rejects.toThrow('禁止使用默认占位码');
    expect(ds.transaction).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it.each([
    { warehouse: { company_code: 'COMP-B' } }, { warehouse: { status: 'INACTIVE' } },
    { location: { warehouse_code: 'WH-B' } }, { location: { status: 'INACTIVE' } },
  ])('rejects destination cross-company, cross-warehouse and inactive authority: %p', async change => {
    const { service, state, expectNoWrites } = setup();
    if (change.warehouse) Object.assign(state.warehouses[0], change.warehouse);
    if (change.location) Object.assign(state.locations[0], change.location);
    await expect(service.createProductionBatch({ ...request, sourceType: undefined })).rejects.toThrow('来源批次');
    expectNoWrites();
  });

  it('locks real destination rows in the caller transaction and accepts NORMAL locations', async () => {
    const { service, state, query, mgr, ds } = setup();
    state.locations[0].status = 'NORMAL';
    await expect(service.createProductionBatch(request, mgr as never)).resolves.toMatchObject({ source_profile_code: 'SRC-A' });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM wms_warehouses'), ['WH-A']);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM wms_locations'), ['LOC-A', 'WH-A']);
    for (const [sql] of query.mock.calls.filter(([sql]) => sql.includes('FROM wms_'))) expect(sql).toContain('FOR SHARE');
    expect(ds.query).not.toHaveBeenCalled();
  });

  it.each(['ACTIVE', 'INACTIVE'])('does not reopen bare legacy production for a configured company with %s profiles', async status => {
    const { service, state, query, expectNoWrites } = setup();
    state.product.variety_code = null;
    state.sku.variety_code = null;
    state.profiles[0].effective_date = '2099-01-01';
    state.profiles[0].status = status;
    await expect(service.createProductionBatch({ ...request, sourceType: undefined,
      sourceProfileCode: undefined, houseCode: undefined, skuCode: undefined, varietyCode: null, qualityGrade: 'GRADE_1' }))
      .rejects.toThrow('公司已启用来源档案');
    const policyRead = query.mock.calls.find(([sql]) => sql.includes('FROM md_egg_source_profiles'))!;
    expect(policyRead).toEqual([expect.stringContaining('company_code = $1 FOR SHARE'), ['COMP-A']]);
    expect(policyRead[0]).not.toContain("status = 'ACTIVE'");
    expectNoWrites();
  });

  it.each([
    false, 'global', {}, { isGlobal: 'true' }, { isGlobal: false },
    { isGlobal: false, allowedCompanyCodes: ['COMP-A'], allowedWarehouseCodes: [] },
    { isGlobal: false, allowedCompanyCodes: [], allowedWarehouseCodes: ['WH-A'] },
    { isGlobal: false, allowedCompanyCodes: ['COMP-A'], allowedWarehouseCodes: 'WH-A' },
  ])('rejects malformed or ungranted caller dataScope %p', async scope => {
    const { ds, expectNoWrites } = setup();
    const service = new EggInventoryService(ds as never, { get: (key: string) => key === 'dataScope' ? scope : undefined } as never);
    await expect(service.createProductionBatch(request)).rejects.toMatchObject({ status: 403 });
    expectNoWrites();
  });

  it('accepts only the caller exact company and warehouse grant, or explicit global scope', async () => {
    const { ds } = setup();
    for (const scope of [
      { isGlobal: false, allowedCompanyCodes: ['COMP-A'], allowedWarehouseCodes: ['WH-A'] }, { isGlobal: true },
    ]) {
      const service = new EggInventoryService(ds as never, { get: (key: string) => key === 'dataScope' ? scope : undefined } as never);
      await expect(service.createProductionBatch(request)).resolves.toMatchObject({ source_profile_code: 'SRC-A' });
    }
  });

  it('user A cannot write a fully valid company B source, warehouse and SKU', async () => {
    const { ds, state, query, expectNoWrites } = setup();
    Object.assign(state.warehouses[0], {warehouse_code:'WH-B',company_code:'COMP-B'});
    Object.assign(state.locations[0], {location_code:'LOC-B',warehouse_code:'WH-B'});
    Object.assign(state.profiles[0], {profile_code:'SRC-B',company_code:'COMP-B',farm_code:'FARM-B',site_code:'SITE-B',house_code:'HOUSE-B'});
    state.scopes[0].scope_code = 'COMP-B';
    const original = query.getMockImplementation()!;
    query.mockImplementation(async (sql, args) => sql.includes('FROM brd_houses')
      ? [{house_code:'HOUSE-B',farm_code:'FARM-B',site_code:'SITE-B',company_code:'COMP-B'}] : original(sql, args));
    const other = {...request,companyCode:'COMP-B',warehouseCode:'WH-B',locationCode:'LOC-B',sourceProfileCode:'SRC-B',houseCode:'HOUSE-B'};
    let scope: {isGlobal:boolean;allowedCompanyCodes?:string[];allowedWarehouseCodes?:string[]} = {
      isGlobal:false,allowedCompanyCodes:['COMP-A'],allowedWarehouseCodes:['WH-A'],
    };
    const service = new EggInventoryService(ds as never, {get:(key:string) => key === 'dataScope' ? scope : undefined} as never);
    await expect(service.createProductionBatch(other)).rejects.toMatchObject({ status:403 });
    expectNoWrites();
    scope = {isGlobal:true};
    await expect(service.createProductionBatch(other)).resolves.toMatchObject({source_profile_code:'SRC-B'});
  });

  it('cannot bypass availability by constructing the service with its legacy two arguments', async () => {
    const { ds, state, expectNoWrites } = setup();
    state.scopes = [];
    const service = new EggInventoryService(ds as never, { get: jest.fn() } as never);
    await expect(service.createProductionBatch(request)).rejects.toThrow('不适用于公司');
    expectNoWrites();
  });
});
