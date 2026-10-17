import { DataScopeService } from '../org/services/data-scope.service';

describe('daily report company-scope provenance', () => {
  const build = (scopeType: string) => {
    const manager = { query: jest.fn(async (sql: string) => sql.includes('FROM sys_role') ? [{ role_code: 'ROLE_REGION_REPORTER' }] : sql.includes('FROM sys_user_orgs') ? [{
      org_id: 40101, org_status: 'ACTIVE', org_type: 'COMPANY', org_code: 'COMP-A', company_code: 'COMP-A',
      parent_id: 40100, data_scope_level: 'COMPANY', site_code: null,
    }] : []) };
    const repo = () => ({ find: jest.fn().mockResolvedValue([]), manager });
    const rules = repo();
    rules.find.mockResolvedValue([{enabled:true,moduleCode:'MENU_FARM_DATA',roleCode:'ROLE_REGION_REPORTER',scopeType}]);
    const organizations = repo();
    organizations.find.mockResolvedValue([{companyCode:'COMP-A',orgType:'COMPANY'},{companyCode:'COMP-B',orgType:'COMPANY'}]);
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

  it('preserves an ACTIVE GROUP rule as a resolved global scope before organization projection', async () => {
    const {service,manager} = build('GROUP');
    const scope = await service.resolve('group-401', ['ROLE_REGION_REPORTER'], 'MENU_FARM_DATA', 401);
    expect(scope.isGlobal).toBe(true);
    expect(scope.scopeLevel).toBe('GROUP');
    expect(manager.query).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('FROM sys_role'), [['ROLE_REGION_REPORTER']]);
  });
  it.each(['child', 'grandchild'])('retains an explicit BU %s company projection', async depth => {
    const manager = { query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM sys_user_orgs')) return [{ org_id:41101,org_status:'ACTIVE',org_type:'BU',org_code:'BU-A',company_code:null,parent_id:null,site_code:null,data_scope_level:'SELF' }];
      if (sql.includes("WHERE parent_id = $1 AND org_type = 'COMPANY'")) return depth === 'child' ? [{company_code:'COMP-A'}] : [];
      if (sql.includes('JOIN sys_organizations o2')) return [{company_code:'COMP-A'}];
      return [];
    }) };
    const repo = () => ({find:jest.fn().mockResolvedValue([]),manager});
    const args = [repo(),repo(),repo(),repo(),repo(),repo(),{get:jest.fn()},{}] as unknown as ConstructorParameters<typeof DataScopeService>;
    const scope = await new DataScopeService(...args).resolve(`411-bu-${depth}`,[],'MENU_FARM_DATA');
    expect(scope.allowedCompanyCodes).toEqual(['COMP-A']);
    expect(scope.allowedBreedingCompanyCodes).toEqual(['COMP-A']);
  });

  it.each([null, 'COMP-A', 'SITE-A'])('keeps legacy department projections separate from report grants (%s)', async snapshot => {
    const manager = {query:jest.fn(async (sql:string) => {
      if (sql.includes('FROM sys_user_orgs')) return [{org_id:41102,org_status:'ACTIVE',org_type:'DEPARTMENT',org_code:'DEPT-A',company_code:snapshot === 'COMP-A' ? snapshot : null,parent_id:41103,site_code:snapshot === 'SITE-A' ? snapshot : null,data_scope_level:'SELF'}];
      if (sql.includes('WITH RECURSIVE')) return [{company_code:'COMP-A'}];
      return [];
    })};
    const repo = () => ({find:jest.fn().mockResolvedValue([]),manager});
    const args = [repo(),repo(),repo(),repo(),repo(),repo(),{get:jest.fn()},{resolveFarmCodesBySiteCodes:jest.fn().mockResolvedValue(['FARM-A'])}] as unknown as ConstructorParameters<typeof DataScopeService>;
    const scope = await new DataScopeService(...args).resolve(`411-dept-${snapshot}`,[],'MENU_FARM_DATA');
    expect(scope.allowedCompanyCodes).toEqual(['COMP-A']);
    expect(scope.allowedSiteCodes).toEqual(snapshot === 'SITE-A' ? ['SITE-A'] : []);
    expect(scope.allowedFarmCodes).toEqual(snapshot === 'SITE-A' ? ['FARM-A'] : []);
    expect(scope.allowedBreedingCompanyCodes).toEqual([]);
    expect(scope.allowedBreedingSiteCodes).toEqual([]);
    expect(scope.allowedBreedingFarmCodes).toEqual([]);
  });

});
