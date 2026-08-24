import { OrgService } from './org.service';

describe('OrgService user scope invalidation', () => {
  it('bumps perms_version even when the primary store code is unchanged', async () => {
    const manager = {
      query: jest.fn()
        .mockResolvedValueOnce([{ code: 'SITE-DONGPENG-LAYER' }])
        .mockResolvedValueOnce([]),
    };
    const service = new OrgService(
      {} as any,
      { manager } as any,
      {} as any,
      {} as any,
      {} as any,
      { invalidate: jest.fn() } as any,
      {} as any,
      {} as any,
    );

    await (service as any).syncPrimaryStoreCode(7);

    expect(manager.query).toHaveBeenCalledTimes(2);
    const updateSql = manager.query.mock.calls[1][0] as string;
    expect(updateSql).toContain('perms_version = COALESCE(perms_version, 0) + 1');
    expect(updateSql).not.toContain("COALESCE(store_code, '') <>");
    expect(manager.query.mock.calls[1][1]).toEqual(['SITE-DONGPENG-LAYER', 7]);
  });
});
