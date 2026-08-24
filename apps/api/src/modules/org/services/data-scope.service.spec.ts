import { DataScopeService } from './data-scope.service';

describe('DataScopeService permission-version cache isolation', () => {
  it('does not reuse a cached global scope after a range change bumps perms_version', async () => {
    let bindingLevel = 'GROUP';
    const manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM sys_user_orgs')) {
          return [{
            org_id: 21,
            is_primary: true,
            data_scope_level: bindingLevel,
            company_code: null,
            project_code: null,
            warehouse_code: null,
            parent_id: 16,
            org_type: 'SITE',
            site_code: 'SITE-DONGPENG-LAYER',
            org_code: 'SITE-DONGPENG-LAYER',
          }];
        }
        if (sql.includes('WITH RECURSIVE up')) return [{ company_code: 'COMP-LAO-XINGCHI' }];
        if (sql.includes('FROM wms_warehouses')) return [];
        return [];
      }),
    };
    const repo = (extra: Record<string, unknown> = {}) => ({
      find: jest.fn().mockResolvedValue([]),
      manager,
      ...extra,
    });
    const service = new DataScopeService(
      repo() as any,
      repo() as any,
      repo() as any,
      repo() as any,
      repo() as any,
      repo() as any,
      { get: jest.fn() } as any,
    );

    const before = await service.resolve('7', ['ROLE_FARM_MGR'], 'MENU_FARM_DATA', 444);
    expect(before.isGlobal).toBe(true);

    bindingLevel = 'COMPANY';
    const after = await service.resolve('7', ['ROLE_FARM_MGR'], 'MENU_FARM_DATA', 445);
    expect(after.isGlobal).toBe(false);
    expect(after.allowedSiteCodes).toEqual(['SITE-DONGPENG-LAYER']);
    expect(after.allowedCompanyCodes).toEqual(['COMP-LAO-XINGCHI']);
  });
});
