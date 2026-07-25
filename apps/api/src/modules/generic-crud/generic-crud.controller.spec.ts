import { ForbiddenException } from '@nestjs/common';
import { GenericCrudController } from './generic-crud.controller';
import { GenericCrudService } from './generic-crud.service';

describe('GenericCrudController WMS RBAC', () => {
  let controller: GenericCrudController;
  let svc: jest.Mocked<Pick<GenericCrudService, 'findAll' | 'findAllInventoryScoped' | 'create' | 'findOneByColumn' | 'update'>>;
  let dataScopeService: { resolve: jest.Mock };
  let wmsService: { confirmInbound: jest.Mock; confirmStandaloneOutbound: jest.Mock };
  let cls: { set: jest.Mock };

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
    wmsService = {
      confirmInbound: jest.fn().mockResolvedValue({ code: 200, msg: '入库确认成功' }),
      confirmStandaloneOutbound: jest.fn().mockResolvedValue({ code: 200, msg: '出库确认成功' }),
    };
    cls = {
      set: jest.fn(),
    };
    controller = new GenericCrudController(
      svc as unknown as GenericCrudService,
      dataScopeService as any,
      wmsService as any,
      cls as any,
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

  it('allows /master/farms create through organization master-data create permission', async () => {
    await expect(
      controller.create(
        'brd_farms',
        { farm_code: 'FARM-A3-001', farm_name: 'A3 测试养殖场', status: 'ACTIVE' },
        req(['MENU_MD_ORG:C']),
      ),
    ).resolves.toEqual({ code: 200, msg: 'ok' });

    expect(dataScopeService.resolve).toHaveBeenCalledWith(
      '1',
      ['ROLE_MENGSAI_DONGPENG_TREASURER'],
      'MENU_MD_ORG',
    );
    expect(svc.create).toHaveBeenCalledWith('brd_farms', {
      farm_code: 'FARM-A3-001',
      farm_name: 'A3 测试养殖场',
      status: 'ACTIVE',
    });
  });

  it('keeps /master/farms delete restricted to farm master permission', async () => {
    await expect(
      controller.remove('brd_farms', 'FARM-A3-001', req(['MENU_MD_ORG:D'])),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(svc.findOneByColumn).not.toHaveBeenCalled();
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

  it('routes wms_inbound completion through WmsService so inventory batches are created', async () => {
    svc.findOneByColumn.mockResolvedValueOnce({
      id: 7,
      task_no: 'IN-20260708-001',
      status: 'PENDING',
      item: 'PRD-EGG-1',
      qty: 12,
      warehouse_code: 'LPH_MS_EGG_SALES',
      location_code: 'LOC-01',
      store_code: 'ALL',
    });

    await expect(
      controller.updateWithColumn(
        'wms_inbound',
        'id',
        '7',
        { status: 'COMPLETED' },
        req(['MENU_WMS_INOUT:E']),
      ),
    ).resolves.toEqual({ code: 200, msg: '入库确认成功' });

    expect(wmsService.confirmInbound).toHaveBeenCalledWith(
      {
        task_no: 'IN-20260708-001',
        items: [{
          product_code: 'PRD-EGG-1',
          sku_code: undefined,
          qty: 12,
          actual_qty: 12,
          expected_qty: undefined,
          broken_qty: undefined,
          warehouse_code: 'LPH_MS_EGG_SALES',
          location_code: 'LOC-01',
        }],
      },
      expect.objectContaining({ username: 'wangweihua' }),
    );
    expect(cls.set).toHaveBeenCalledWith(
      'dataScope',
      expect.objectContaining({ isGlobal: true }),
    );
    expect(svc.update).not.toHaveBeenCalled();
  });

  it('persists inbound detail edits before WMS confirmation without directly completing the row', async () => {
    svc.findOneByColumn.mockResolvedValueOnce({
      id: 8,
      task_no: 'WI-535598',
      status: 'PENDING',
      item: 'OLD-ITEM',
      qty: 1,
      warehouse_code: 'LPH_MS_RAW',
      location_code: 'OLD-LOC',
      store_code: 'ALL',
    });

    await expect(
      controller.updateWithColumn(
        'wms_inbound',
        'id',
        '8',
        {
          status: 'COMPLETED',
          item: '监控摄像头测试',
          actual_qty: 50,
          batch_no: 'WI-535598-B1',
          location_code: 'RAW-IN-01',
        },
        req(['MENU_WMS_INOUT:E']),
      ),
    ).resolves.toEqual({ code: 200, msg: '入库确认成功' });

    expect(svc.update).toHaveBeenCalledTimes(1);
    expect(svc.update).toHaveBeenCalledWith(
      'wms_inbound',
      'id',
      '8',
      {
        item: '监控摄像头测试',
        actual_qty: 50,
        batch_no: 'WI-535598-B1',
        location_code: 'RAW-IN-01',
      },
    );
    expect(wmsService.confirmInbound).toHaveBeenCalledWith(
      {
        task_no: 'WI-535598',
        items: [{
          product_code: '监控摄像头测试',
          sku_code: undefined,
          qty: 50,
          actual_qty: 50,
          expected_qty: undefined,
          broken_qty: undefined,
          warehouse_code: 'LPH_MS_RAW',
          location_code: 'RAW-IN-01',
          batch_no: 'WI-535598-B1',
        }],
      },
      expect.objectContaining({ username: 'wangweihua' }),
    );
  });

  it('keeps SKU separate from product code when completing a generic WMS inbound row', async () => {
    svc.findOneByColumn.mockResolvedValueOnce({
      id: 9,
      task_no: 'WI-SKU-001',
      status: 'PENDING',
      item: 'SKU display label',
      sku_code: 'SKU-EGG-A-30',
      qty: 6,
      warehouse_code: 'LPH_MS_EGG_SALES',
      location_code: 'LOC-01',
      store_code: 'ALL',
    });

    await expect(
      controller.updateWithColumn(
        'wms_inbound',
        'id',
        '9',
        { status: 'COMPLETED' },
        req(['MENU_WMS_INOUT:E']),
      ),
    ).resolves.toEqual({ code: 200, msg: '入库确认成功' });

    expect(wmsService.confirmInbound).toHaveBeenCalledWith(
      {
        task_no: 'WI-SKU-001',
        items: [{
          product_code: undefined,
          sku_code: 'SKU-EGG-A-30',
          qty: 6,
          actual_qty: 6,
          expected_qty: undefined,
          broken_qty: undefined,
          warehouse_code: 'LPH_MS_EGG_SALES',
          location_code: 'LOC-01',
        }],
      },
      expect.objectContaining({ username: 'wangweihua' }),
    );
  });

  it('routes a generic DONE update through the inventory-linked outbound confirmation', async () => {
    svc.findOneByColumn.mockResolvedValueOnce({
      id: 10,
      outbound_no: 'WO-20260725-001',
      status: 'PENDING',
      item: 'SKU-EGG-A-30',
      batch_no: 'B-EGG-A-1',
      qty: 20,
      warehouse_code: 'LPH_MS_EGG_SALES',
    });

    await expect(
      controller.updateWithColumn(
        'wms_outbound',
        'id',
        '10',
        { status: 'DONE' },
        req(['MENU_WMS_INOUT:E']),
      ),
    ).resolves.toEqual({ code: 200, msg: '出库确认成功' });

    expect(wmsService.confirmStandaloneOutbound).toHaveBeenCalledWith(
      'WO-20260725-001',
      expect.objectContaining({ username: 'wangweihua' }),
    );
    expect(svc.update).not.toHaveBeenCalled();
  });
});
