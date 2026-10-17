import { DataScopeService } from '../org/services/data-scope.service';

describe('daily report company-scope provenance', () => {
  const build = (scopeType: string) => {
    const manager = { query: jest.fn(async (sql: string) => sql.includes('FROM sys_user_orgs') ? [{
      org_id: 40101, org_type: 'COMPANY', org_code: 'COMP-A', company_code: 'COMP-A',
      parent_id: 40100, data_scope_level: 'COMPANY', site_code: null,
    }] : []) };
    const repo = () => ({ find: jest.fn().mockResolvedValue([]), manager });
    const rules = repo();
    rules.find.mockResolvedValue([{enabled:true,moduleCode:'MENU_FARM_DATA',roleCode:'ROLE_REGION_REPORTER',scopeType}]);
    const organizations = repo();
    organizations.find.mockResolvedValue([{companyCode:'COMP-A'},{companyCode:'COMP-B'}]);
    const args = [rules,repo(),repo(),repo(),repo(),organizations,{get:jest.fn()},{}] as unknown as ConstructorParameters<typeof DataScopeService>;
    return { service: new DataScopeService(...args), manager, organizations };
  };

  it('retains REGION sibling companies as explicit breeding grants', async () => {
    const {service,organizations} = build('REGION');
    const scope = await service.resolve('region-401', ['ROLE_REGION_REPORTER'], 'MENU_FARM_DATA', 401);
    expect(scope.isGlobal).toBe(false);
    expect(scope.allowedCompanyCodes).toEqual(['COMP-A','COMP-B']);
    expect(scope.allowedBreedingCompanyCodes).toEqual(['COMP-A','COMP-B']);
    expect(organizations.find).toHaveBeenCalledWith({where:{parentId:40100,status:'ACTIVE'}});
  });

  it('preserves a GROUP rule as a resolved global scope before organization projection', async () => {
    const {service,manager} = build('GROUP');
    const scope = await service.resolve('group-401', ['ROLE_REGION_REPORTER'], 'MENU_FARM_DATA', 401);
    expect(scope.isGlobal).toBe(true);
    expect(scope.scopeLevel).toBe('GROUP');
    expect(manager.query).not.toHaveBeenCalled();
  });
});
