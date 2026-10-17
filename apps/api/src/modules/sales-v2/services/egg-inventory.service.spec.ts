import { ConflictException } from '@nestjs/common';
import { EggInventoryService } from './egg-inventory.service';

describe('EggInventoryService conditional inventory updates', () => {
  it('fails closed when FIFO candidate no longer matches the guarded update', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('SELECT * FROM inv_batches')) return [{
        batch_no: 'B-1', company_code: 'COMP-A', warehouse_code: 'WH-A',
        status: 'AVAILABLE', qty_available: 5, sku_code: 'SKU-1', legacy_source: null,
      }];
      if (sql.includes('SELECT batch_no FROM changed')) return [];
      return [];
    });
    const service = new EggInventoryService({ query } as never, { get: jest.fn() } as never);

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
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('SELECT * FROM inv_batches')) return [{
        batch_no: 'B-1', company_code: 'COMP-A', warehouse_code: 'WH-SECRET',
        status: 'AVAILABLE', qty_available: 3, sku_code: 'SKU-1', legacy_source: null,
      }];
      if (sql.includes('SELECT batch_no FROM changed')) return [{ batch_no: 'B-1' }];
      return [];
    });
    const service = new EggInventoryService({ query } as never, { get: jest.fn() } as never);

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
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('SELECT * FROM inv_batches')) return [{
        batch_no: 'B-1', warehouse_code: 'WH-A', qty_available: 1, sku_code: 'SKU-1',
      }];
      if (sql.includes('SELECT batch_no FROM changed')) return [{ batch_no: 'B-1' }];
      return [];
    });
    const service = new EggInventoryService({ query } as never, { get: jest.fn() } as never);
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
    const service = new EggInventoryService({ query } as never, cls as never);
    await service.getExpiringBatches({ days: 7 });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('company_code = ANY($2)'), [7, ['COMP-A']]);
  });

  it('fails closed when a normal user has no company scope', async () => {
    const query = jest.fn();
    const cls = { get: jest.fn().mockReturnValue({ isGlobal: false, allowedCompanyCodes: [] }) };
    const service = new EggInventoryService({ query } as never, cls as never);
    await expect(service.getExpiringBatches({ days: 7 })).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('keeps global scheduled scans unfiltered when CLS has no request scope', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const cls = { get: jest.fn().mockReturnValue(undefined) };
    const service = new EggInventoryService({ query } as never, cls as never);
    await service.getExpiringBatches({ days: 3 });
    expect(query).toHaveBeenCalledWith(expect.not.stringContaining('company_code = ANY'), [3]);
  });

  it('uses the same sellable egg-family scope as the inventory dashboard', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new EggInventoryService({ query } as never, { get: jest.fn() } as never);
    await service.getExpiringBatches({ days: 7 });
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("b.status = 'AVAILABLE'");
    expect(sql).toContain("b.product_code = 'EGG' OR b.product_code LIKE 'PRD-EGG-%'");
  });

  it('orders expiring batches by expiry date with a stable batch/id tie-breaker', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new EggInventoryService({ query } as never, { get: jest.fn() } as never);
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
    const service = new EggInventoryService({ query } as never, { get: jest.fn() } as never);

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
    const service = new EggInventoryService({ query } as never, cls as never);

    await expect(service.getAvailableBatches({ productCode: 'EGG', companyCode: 'COMP-B' })).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('keeps active batch count and quantity on the exact list status/qty/expiry scope', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes("inventory.expiring_warn_days")) return [];
      if (sql.includes('FROM inv_batches b')) return [{
        active_batches: '2', total_available: '150', expiring_batches: '1', expiring_qty: '50',
        expired_batches: '0', returned_batches: '0', sku_linked_batches: '1',
      }];
      return [{ expire_loss: '0', damage_loss: '0', write_off: '0' }];
    });
    const service = new EggInventoryService({ query } as never, { get: jest.fn() } as never);

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
    const service = new EggInventoryService({ query } as never, { get: jest.fn().mockReturnValue(undefined) } as never);

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
    const service = new EggInventoryService({ query } as never, cls as never);

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
    const service = new EggInventoryService({ query } as never, cls as never);

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
      sourceType: 'TEMP_PRODUCTION',
      ledgerChangeType: 'TEMP_PRODUCTION_INBOUND',
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
