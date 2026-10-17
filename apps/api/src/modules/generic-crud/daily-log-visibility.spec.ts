import { ForbiddenException } from '@nestjs/common';
import { GenericCrudController } from './generic-crud.controller';

const resolvedScope = {
  isGlobal: false, allowedFarmCodes: ['FARM-A'], allowedSiteCodes: ['SITE-A'],
  allowedCompanyCodes: ['COMP-A'], allowedWarehouseCodes: [], allowedProjectCodes: [],
  userId: '40101', scopeLevel: 'COMPANY',
};

describe('MANUAL-122 daily log scope routing', () => {
  const service = { findAll: jest.fn(), findAllBreedingScoped: jest.fn().mockResolvedValue([]) };
  const scopeService = { resolve: jest.fn().mockResolvedValue(resolvedScope) };
  const controller = new GenericCrudController(service as never, scopeService as never, {} as never, {} as never);
  const request = (storeCode?: string) => ({ user: {
    userId: '40101', username: 'isolated_reporter', role: 'ROLE_FARM_REPORTER', storeCode,
    permissions: ['MENU_FARM_DATA:V', 'MENU_FARM_DAILY:E'],
  } });

  beforeEach(() => jest.clearAllMocks());

  it.each([undefined, 'LPH_FARM_A', 'SITE-STALE'])('uses resolved scope rather than legacy storeCode=%s', async storeCode => {
    const query = { house_code: 'HOUSE-A', log_date: '2026-10-17' };
    await controller.findAll('brd_daily_logs', query, request(storeCode));
    expect(service.findAll).not.toHaveBeenCalled();
    expect(service.findAllBreedingScoped).toHaveBeenCalledWith('brd_daily_logs', query, {
      farmCodes: ['FARM-A'], siteCodes: ['SITE-A'], companyCodes: [],
    });
    expect(scopeService.resolve).toHaveBeenCalledWith('40101', ['ROLE_FARM_REPORTER'], 'MENU_FARM_DATA', undefined);
  });

  it('retains explicit company grants alongside a SITE binding', async () => {
    scopeService.resolve.mockResolvedValueOnce({...resolvedScope, allowedBreedingCompanyCodes:['COMP-B']});
    await controller.findAll('brd_daily_logs', {}, request('SITE-A'));
    expect(service.findAllBreedingScoped).toHaveBeenCalledWith('brd_daily_logs', {}, {farmCodes:['FARM-A'],siteCodes:['SITE-A'],companyCodes:['COMP-B']});
  });

  it('fails closed when resolved identity is missing despite a legacy global store', async () => {
    const req = { user: { username: 'fixture', storeCode: 'ALL', permissions: ['MENU_FARM_DATA:V'] } };
    await controller.findAll('brd_daily_logs', {}, req);
    expect(service.findAllBreedingScoped).toHaveBeenCalledWith('brd_daily_logs', {}, {farmCodes: [], siteCodes: [], companyCodes: []});
  });

  it('retains the original list menu requirement; daily edit alone does not grant a read', async () => {
    const req = request();
    req.user.permissions = ['MENU_FARM_DAILY:E'];
    await expect(controller.findAll('brd_daily_logs', {}, req)).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.findAllBreedingScoped).not.toHaveBeenCalled();
  });
});

import { GenericCrudService } from './generic-crud.service';

describe('MANUAL-122 scoped daily output compatibility', () => {
  it('keeps ISO business dates and dictionary reason labels on the scoped route', async () => {
    const query = jest.fn().mockResolvedValueOnce([{id: 1, log_date: new Date('2026-10-17T00:00:00Z'), business_date: '2026-10-17T00:00:00Z', culling_reason: 'AGE'}])
      .mockResolvedValueOnce([{dict_type:'BRD_CULLING_REASON',dict_code:'AGE',label:'老龄'}]);
    const service = new GenericCrudService({query} as never);
    const rows = await service.findAllBreedingScoped('brd_daily_logs', {}, {farmCodes:['FARM-A'],siteCodes:['SITE-A'],companyCodes:[]});
    expect(rows).toEqual([{id:1,log_date:'2026-10-17',business_date:'2026-10-17',culling_reason:'老龄',culling_reason_code:'AGE'}]);
    expect(query.mock.calls[0][1]).toEqual([['FARM-A'],['SITE-A'],100,0]);
  });
});
