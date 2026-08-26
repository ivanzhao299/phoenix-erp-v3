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
      {
        resolveHouse: jest.fn(),
        resolveFarmCodesBySiteCodes: jest.fn().mockResolvedValue(['FARM-DP']),
      } as any,
    );

    const before = await service.resolve('7', ['ROLE_FARM_MGR'], 'MENU_FARM_DATA', 444);
    expect(before.isGlobal).toBe(true);

    bindingLevel = 'COMPANY';
    const after = await service.resolve('7', ['ROLE_FARM_MGR'], 'MENU_FARM_DATA', 445);
    expect(after.isGlobal).toBe(false);
    expect(after.allowedSiteCodes).toEqual(['SITE-DONGPENG-LAYER']);
    expect(after.allowedFarmCodes).toEqual(['FARM-DP']);
    expect(after.allowedCompanyCodes).toEqual(['COMP-LAO-XINGCHI']);
    expect(after.allowedWarehouseCodes).toEqual([]);
    expect(manager.query).not.toHaveBeenCalledWith(
      expect.stringContaining('FROM wms_warehouses'),
      [['COMP-LAO-XINGCHI']],
    );
  });

  it('keeps an unbound non-global user fail-closed without projecting farms', async () => {
    const manager = { query: jest.fn().mockResolvedValue([]) };
    const repo = () => ({ find: jest.fn().mockResolvedValue([]), manager });
    const ownership = { resolveHouse: jest.fn(), resolveFarmCodesBySiteCodes: jest.fn() };
    const service = new DataScopeService(
      repo() as any, repo() as any, repo() as any, repo() as any,
      repo() as any, repo() as any, { get: jest.fn() } as any, ownership as any,
    );
    const scope = await service.resolve('991', ['ROLE_FARM_MGR'], 'MENU_FARM_DATA', 1);
    expect(scope.isGlobal).toBe(false);
    expect(scope.allowedCompanyCodes).toEqual([]);
    expect(scope.allowedSiteCodes).toEqual([]);
    expect(scope.allowedFarmCodes).toEqual([]);
    expect(ownership.resolveFarmCodesBySiteCodes).not.toHaveBeenCalled();
  });

  it('does not query SITE projection for ROLE_ADMIN', async () => {
    const repo = () => ({ find: jest.fn(), manager: { query: jest.fn() } });
    const ownership = { resolveHouse: jest.fn(), resolveFarmCodesBySiteCodes: jest.fn() };
    const service = new DataScopeService(
      repo() as any, repo() as any, repo() as any, repo() as any,
      repo() as any, repo() as any, { get: jest.fn() } as any, ownership as any,
    );
    const scope = await service.resolve('1', ['ROLE_ADMIN'], 'MENU_FARM_DATA', 1);
    expect(scope.isGlobal).toBe(true);
    expect(ownership.resolveFarmCodesBySiteCodes).not.toHaveBeenCalled();
  });

  it('keeps only ACTIVE farms from explicit farm grants', async () => {
    const manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM brd_farms')) return [{ farm_code: 'FARM-ACTIVE' }];
        return [];
      }),
    };
    const repo = (rows: any[] = []) => ({ find: jest.fn().mockResolvedValue(rows), manager });
    const service = new DataScopeService(
      repo() as any,
      repo() as any,
      repo() as any,
      repo() as any,
      repo([{ farmCode: 'FARM-ACTIVE' }, { farmCode: 'FARM-INACTIVE' }]) as any,
      repo() as any,
      { get: jest.fn() } as any,
      { resolveHouse: jest.fn(), resolveFarmCodesBySiteCodes: jest.fn() } as any,
    );

    const scope = await service.resolve('992', ['ROLE_FARM_MGR'], 'MENU_FARM_DATA', 1);
    expect(scope.allowedFarmCodes).toEqual(['FARM-ACTIVE']);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'ACTIVE'"),
      [['FARM-ACTIVE', 'FARM-INACTIVE']],
    );
  });

  it('intersects SITE grants with OPERATIONAL warehouses at that SITE', async () => {
    const manager = { query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM sys_user_orgs')) return [{ org_id: 21, is_primary: true, data_scope_level: 'COMPANY', company_code: null, project_code: null, warehouse_code: null, parent_id: 16, org_type: 'SITE', site_code: 'SITE-DONGPENG-LAYER', org_code: 'SITE-DONGPENG-LAYER' }];
      if (sql.includes('WITH RECURSIVE up')) return [{ company_code: 'COMP-LAO-XINGCHI' }];
      if (sql.includes('FROM wms_warehouses')) return [{ warehouse_code: 'LPH_DP_EGG_FARM' }];
      return [];
    }) };
    const repo = (rows: any[] = []) => ({ find: jest.fn().mockResolvedValue(rows), manager });
    const service = new DataScopeService(
      repo() as any, repo() as any, repo() as any,
      repo([{ warehouseCode: 'LPH_DP_EGG_FARM' }, { warehouseCode: 'LPH_MS_FEED' }]) as any,
      repo() as any, repo() as any, { get: jest.fn() } as any,
      { resolveHouse: jest.fn(), resolveFarmCodesBySiteCodes: jest.fn().mockResolvedValue(['FARM-DP']) } as any,
    );
    const scope = await service.resolve('7', ['ROLE_FARM_MGR'], 'MENU_WMS_VIEW', 77);
    expect(scope.allowedWarehouseCodes).toEqual(['LPH_DP_EGG_FARM']);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('AND site_code = ANY($2)'),
      [['LPH_DP_EGG_FARM', 'LPH_MS_FEED'], ['SITE-DONGPENG-LAYER']],
    );
  });

  it('keeps COMPANY operation warehouses and unions a cross-company explicit grant', async () => {
    const manager = { query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM sys_user_orgs')) return [{ org_id: 10, is_primary: true, data_scope_level: 'COMPANY', company_code: 'COMP-A', project_code: null, warehouse_code: null, parent_id: 1, org_type: 'COMPANY', site_code: null, org_code: 'COMP-A' }];
      if (sql.includes('company_code = ANY')) return [{ warehouse_code: 'WH-A' }];
      if (sql.includes('warehouse_code = ANY')) return [{ warehouse_code: 'WH-B' }];
      return [];
    }) };
    const repo = (rows: any[] = []) => ({ find: jest.fn().mockResolvedValue(rows), manager });
    const service = new DataScopeService(
      repo() as any, repo() as any, repo() as any,
      repo([{ warehouseCode: 'WH-B' }]) as any, repo() as any, repo() as any,
      { get: jest.fn() } as any,
      { resolveHouse: jest.fn(), resolveFarmCodesBySiteCodes: jest.fn() } as any,
    );
    const scope = await service.resolve('8', ['ROLE_WMS_MGR'], 'MENU_WMS_VIEW', 78);
    expect(scope.allowedWarehouseCodes).toEqual(['WH-A', 'WH-B']);
  });
});
