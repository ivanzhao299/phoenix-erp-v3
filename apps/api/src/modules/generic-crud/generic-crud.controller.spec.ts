import { ForbiddenException } from '@nestjs/common';
import { GenericCrudController } from './generic-crud.controller';
import { GenericCrudService } from './generic-crud.service';

describe('GenericCrudController WMS RBAC', () => {
  let controller: GenericCrudController;
  let svc: jest.Mocked<Pick<GenericCrudService, 'findAll' | 'findAllInventoryScoped' | 'create' | 'findOneByColumn' | 'update'>>;
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
      findOneByColumn: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ msg: 'ok' }),
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

  it('allows inventory batch reads with MENU_INV_BATCH and resolves scope against that menu', async () => {
    dataScopeService.resolve.mockResolvedValueOnce({
      isGlobal: false,
      scopeLevel: 'COMPANY',
      allowedCompanyCodes: ['LPH'],
      allowedProjectCodes: [],
      allowedWarehouseCodes: ['LPH_MS_EGG_SALES'],
      allowedFarmCodes: [],
      allowedSiteCodes: [],
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
            role: 'ROLE_WMS_OP',
            roles: ['ROLE_WMS_OP'],
            storeCode: 'SITE-MENGSAI-LAYER',
            permissions: ['MENU_INV_BATCH:V'],
          },
        },
      ),
    ).resolves.toEqual({ code: 200, data: [] });

    expect(dataScopeService.resolve).toHaveBeenCalledWith('42', ['ROLE_WMS_OP'], 'MENU_INV_BATCH');
    expect(svc.findAllInventoryScoped).toHaveBeenCalledWith(
      'inv_batches',
      { limit: '50', offset: '0' },
      ['LPH_MS_EGG_SALES'],
    );
  });

  it('allows inventory ledger reads with MENU_INV_LEDGER and keeps warehouse scoped lookup', async () => {
    dataScopeService.resolve.mockResolvedValueOnce({
      isGlobal: false,
      scopeLevel: 'COMPANY',
      allowedCompanyCodes: ['LPH'],
      allowedProjectCodes: [],
      allowedWarehouseCodes: ['LPH_MS_EGG_SALES'],
      allowedFarmCodes: [],
      allowedSiteCodes: [],
      userId: '42',
    });

    await expect(
      controller.findAll(
        'inv_ledger',
        { limit: '50', offset: '0' },
        {
          user: {
            userId: '42',
            id: 42,
            username: 'tangzhiwen',
            role: 'ROLE_WMS_OP',
            roles: ['ROLE_WMS_OP'],
            storeCode: 'SITE-MENGSAI-LAYER',
            permissions: ['MENU_INV_LEDGER:V'],
          },
        },
      ),
    ).resolves.toEqual({ code: 200, data: [] });

    expect(dataScopeService.resolve).toHaveBeenCalledWith('42', ['ROLE_WMS_OP'], 'MENU_INV_LEDGER');
    expect(svc.findAllInventoryScoped).toHaveBeenCalledWith(
      'inv_ledger',
      { limit: '50', offset: '0' },
      ['LPH_MS_EGG_SALES'],
    );
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

  it('updates WMS locations through the short CRUD route by location_code', async () => {
    svc.findOneByColumn.mockResolvedValueOnce({
      location_code: 'LOC-A-01',
      warehouse_code: 'WH-A',
      zone_code: 'ZONE-A',
    });

    await expect(
      controller.update(
        'wms_locations',
        'LOC-A-01',
        { zone_code: 'ZONE-B' },
        req(['MENU_WMS_INOUT:E']),
      ),
    ).resolves.toEqual({ code: 200, msg: 'ok' });

    expect(svc.findOneByColumn).toHaveBeenCalledWith('wms_locations', 'location_code', 'LOC-A-01');
    expect(svc.update).toHaveBeenCalledWith('wms_locations', 'location_code', 'LOC-A-01', { zone_code: 'ZONE-B' });
  });

  it('still rejects WMS reads when the user has no WMS view or inout permission', async () => {
    await expect(
      controller.findAll('wms_outbound', { limit: '200', offset: '0' }, req(['MENU_FIN2_CASH_VIEW:V'])),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(svc.findAll).not.toHaveBeenCalled();
  });
});
