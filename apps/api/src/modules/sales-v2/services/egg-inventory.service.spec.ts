import { EggInventoryService } from './egg-inventory.service';

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
});

describe('EggInventoryService createProductionBatch SQL contract', () => {
  it('keeps inv_batches target columns, value expressions and parameters aligned', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ grade_code: 'GRADE_1' }])
      .mockResolvedValueOnce([{ cnt: '0' }])
      .mockImplementationOnce(async (sql: string, params: unknown[]) => {
        const insert = sql.match(/INSERT INTO inv_batches\s*\(([^)]*)\)\s*VALUES\s*\(([\s\S]*?)\)\s*RETURNING/);
        expect(insert).not.toBeNull();
        const columns = insert![1].split(',').map(value => value.trim());
        const values = insert![2].split(',').map(value => value.trim());
        expect(values).toHaveLength(columns.length);
        const placeholders = [...sql.matchAll(/\$(\d+)/g)].map(match => Number(match[1]));
        expect(Math.max(...placeholders)).toBe(params.length);
        return [{ batch_no: 'EGG-20260825-00001' }];
      })
      .mockResolvedValueOnce([]);
    const cls = { get: jest.fn().mockReturnValue({ username: 'tester' }) };
    const service = new EggInventoryService({ query } as never, cls as never);

    await service.createProductionBatch({
      companyCode: 'COMP-A',
      eggDate: '2026-08-25',
      qualityGrade: 'GRADE_1',
      gradeCodeStd: 'GRADE_1',
      productCode: 'PRD-EGG-GRADE_1',
      qty: 1,
      sourceType: 'TEMP_PRODUCTION',
      ledgerChangeType: 'TEMP_PRODUCTION_INBOUND',
    });
  });
});
