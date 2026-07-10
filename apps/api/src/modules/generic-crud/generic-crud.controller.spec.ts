import { ForbiddenException } from '@nestjs/common';
import { GenericCrudController } from './generic-crud.controller';
import { GenericCrudService } from './generic-crud.service';

describe('GenericCrudController WMS RBAC', () => {
  let controller: GenericCrudController;
  let svc: jest.Mocked<Pick<GenericCrudService, 'findAll' | 'findAllInventoryScoped' | 'create'>>;
  let dataScopeService: { resolve: jest.Mock };

  const req = (permissions: string[]) => ({
    user: {
      userId: '1',
      id: 1,
      username: 'wangweihua',
      role: 'ROLE_MENGSAI_DONGPENG_TREASURER',
      roles: ['ROLE_MENGSAI_DONGPENG_TREASURER'],
      permissions,
    },
  });

  beforeEach(() => {
    svc = {
      findAll: jest.fn().mockResolvedValue([]),
      findAllInventoryScoped: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ msg: 'ok' }),
    };
    dataScopeService = {
      resolve: jest.fn().mockResolvedValue({
        isGlobal: true,
        scopeLevel: 'GROUP',
        allowedCompanyCodes: [],
        allowedProjectCodes: [],
        allowedWarehouseCodes: [],
        allowedFarmCodes: [],
        allowedSiteCodes: [],
        userId: '1',
      }),
    };
    controller = new GenericCrudController(
      svc as unknown as GenericCrudService,
      dataScopeService as any,
    );
  });

  it('allows the captured warehouse overview WMS reads with MENU_WMS_VIEW', async () => {
    await expect(
      controller.findAll('wms_zones', { limit: '100', offset: '0' }, req(['MENU_WMS_VIEW:V'])),
    ).resolves.toEqual({ code: 200, data: [] });
    await expect(
      controller.findAll('wms_inbound', { limit: '200', offset: '0' }, req(['MENU_WMS_VIEW:V'])),
    ).resolves.toEqual({ code: 200, data: [] });
    await expect(
      controller.findAll('wms_outbound', { limit: '200', offset: '0' }, req(['MENU_WMS_VIEW:V'])),
    ).resolves.toEqual({ code: 200, data: [] });

    expect(svc.findAll).toHaveBeenCalledWith('wms_zones', { limit: '100', offset: '0' });
    expect(svc.findAll).toHaveBeenCalledWith('wms_inbound', { limit: '200', offset: '0' });
    expect(svc.findAll).toHaveBeenCalledWith('wms_outbound', { limit: '200', offset: '0' });
  });

  it('keeps legacy WMS inout permission valid for reads', async () => {
    await expect(
      controller.findAll('wms_zones', { limit: '100', offset: '0' }, req(['MENU_WMS_INOUT:V'])),
    ).resolves.toEqual({ code: 200, data: [] });
    expect(svc.findAll).toHaveBeenCalledWith('wms_zones', { limit: '100', offset: '0' });
  });

  it('scopes inventory batch reads by warehouse DataScope instead of store_code', async () => {
    dataScopeService.resolve.mockResolvedValueOnce({
      isGlobal: false,
      scopeLevel: 'WAREHOUSE',
      allowedCompanyCodes: [],
      allowedProjectCodes: [],
      allowedWarehouseCodes: ['LPH_MS_EGG_SALES'],
      allowedFarmCodes: [],
      allowedSiteCodes: ['SITE-MENGSAI-LAYER'],
      userId: '42',
    });

    await expect(
      controller.findAll(
        'inv_batches',
        { limit: '50', offset: '0' },
        {
          user: {
            userId: '42',
            id: 42,
            username: 'tangzhiwen',
            role: 'ROLE_WMS_OPERATOR',
            roles: ['ROLE_WMS_OPERATOR'],
            storeCode: 'SITE-MENGSAI-LAYER',
            permissions: ['MENU_WMS_VIEW:V'],
          },
        },
      ),
    ).resolves.toEqual({ code: 200, data: [] });

    expect(svc.findAllInventoryScoped).toHaveBeenCalledWith(
      'inv_batches',
      { limit: '50', offset: '0' },
      ['LPH_MS_EGG_SALES'],
    );
    expect(svc.findAll).not.toHaveBeenCalled();
  });

  it('returns no inventory rows when a non-global user has no warehouse scope', async () => {
    dataScopeService.resolve.mockResolvedValueOnce({
      isGlobal: false,
      scopeLevel: 'WAREHOUSE',
      allowedCompanyCodes: [],
      allowedProjectCodes: [],
      allowedWarehouseCodes: [],
      allowedFarmCodes: [],
      allowedSiteCodes: ['SITE-MENGSAI-LAYER'],
      userId: '43',
    });

    await expect(
      controller.findAll(
        'inv_ledger',
        { limit: '50', offset: '0' },
        {
          user: {
            userId: '43',
            id: 43,
            username: 'wms-no-scope',
            role: 'ROLE_WMS_OPERATOR',
            roles: ['ROLE_WMS_OPERATOR'],
            storeCode: 'SITE-MENGSAI-LAYER',
            permissions: ['MENU_WMS_VIEW:V'],
          },
        },
      ),
    ).resolves.toEqual({ code: 200, data: [] });

    expect(svc.findAllInventoryScoped).toHaveBeenCalledWith(
      'inv_ledger',
      { limit: '50', offset: '0' },
      [],
    );
    expect(svc.findAll).not.toHaveBeenCalled();
  });

  it('does not allow WMS writes with view-only permission', async () => {
    await expect(
      controller.create('wms_outbound', { outbound_no: 'WO-1' }, req(['MENU_WMS_VIEW:V'])),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(svc.create).not.toHaveBeenCalled();
  });

  it('still rejects WMS reads when the user has no WMS view or inout permission', async () => {
    await expect(
      controller.findAll('wms_outbound', { limit: '200', offset: '0' }, req(['MENU_FIN2_CASH_VIEW:V'])),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(svc.findAll).not.toHaveBeenCalled();
  });
});
