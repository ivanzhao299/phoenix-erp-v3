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
