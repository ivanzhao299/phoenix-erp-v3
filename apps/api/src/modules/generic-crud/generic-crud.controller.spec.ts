import { ForbiddenException } from '@nestjs/common';
import { GenericCrudController } from './generic-crud.controller';
import { GenericCrudService } from './generic-crud.service';

describe('GenericCrudController WMS RBAC', () => {
  let controller: GenericCrudController;
  let svc: jest.Mocked<Pick<GenericCrudService, 'findAll' | 'create'>>;

  const req = (permissions: string[]) => ({
    user: {
      username: 'wangweihua',
      role: 'ROLE_MENGSAI_DONGPENG_TREASURER',
      roles: ['ROLE_MENGSAI_DONGPENG_TREASURER'],
      permissions,
    },
  });

  beforeEach(() => {
    svc = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ msg: 'ok' }),
    };
    controller = new GenericCrudController(svc as unknown as GenericCrudService);
  });

  it('allows WMS overview reads with MENU_WMS_VIEW', async () => {
    await expect(
      controller.findAll('wms_inbound', { limit: '200', offset: '0' }, req(['MENU_WMS_VIEW:V'])),
    ).resolves.toEqual({ code: 200, data: [] });
    expect(svc.findAll).toHaveBeenCalledWith('wms_inbound', { limit: '200', offset: '0' });
  });

  it('keeps legacy WMS inout permission valid for reads', async () => {
    await expect(
      controller.findAll('wms_zones', { limit: '100', offset: '0' }, req(['MENU_WMS_INOUT:V'])),
    ).resolves.toEqual({ code: 200, data: [] });
    expect(svc.findAll).toHaveBeenCalledWith('wms_zones', { limit: '100', offset: '0' });
  });

  it('does not allow WMS writes with view-only permission', async () => {
    await expect(
      controller.create('wms_outbound', { outbound_no: 'WO-1' }, req(['MENU_WMS_VIEW:V'])),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(svc.create).not.toHaveBeenCalled();
  });
});
