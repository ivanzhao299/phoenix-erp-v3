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
    expect(query.mock.calls[1][0]).toContain('WHERE driver_id = $1');
    expect(query.mock.calls[1][1]).toEqual(['42']);
    expect(report.totalReferences).toBe(1);
  });
});
