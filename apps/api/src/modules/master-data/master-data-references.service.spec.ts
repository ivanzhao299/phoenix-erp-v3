import { MasterDataReferencesService } from './master-data-references.service';

describe('MasterDataReferencesService driver primary key', () => {
  it('resolves driver_code to driver_id before counting delivery references', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ id: '42' }])
      .mockResolvedValueOnce([{ c: '1' }])
      .mockResolvedValueOnce([{ no: 'DEL-001' }]);
    const service = new MasterDataReferencesService({ query } as any);
    const report = await service.compute('DRIVER', 'DRV-001');
    expect(query.mock.calls[0]).toEqual(['SELECT id::text AS id FROM sal_drivers WHERE driver_code = $1 LIMIT 1', ['DRV-001']]);
    expect(query.mock.calls[1][0]).toContain('WHERE (driver_id = $1)');
    expect(query.mock.calls[1][1]).toEqual(['42']);
    expect(report.totalReferences).toBe(1);
  });
});

describe('Product/material archival reference boundaries', () => {
  it('counts material procurement references without requiring a same-name product merge', async () => {
    const query = jest.fn(async (sql: string) => sql.includes('COUNT(*)') ? [{ c: sql.includes('prc2_order_items') ? '1' : '0' }] : [{no:'99'}]);
    const report=await new MasterDataReferencesService({query} as never).compute('MATERIAL','M');
    expect(report.canArchive).toBe(false);
    expect(report.references[0].refTable).toBe('prc2_order_items');
  });
  it.each(['MATERIAL','PRODUCT'])('fails closed on %s reference query errors', async type => {
    const query=jest.fn().mockRejectedValue(new Error('reference lookup unavailable'));
    await expect(new MasterDataReferencesService({query} as never).compute(type,'C')).rejects.toThrow('reference lookup unavailable');
  });
});
