import { DataScopeGuard } from './data-scope.guard';
import { REQUIRE_MENU_KEY } from '../../../common/guards/menu.guard';

describe('DataScopeGuard', () => {
  const context = () => ({
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({}),
    }),
  });

  it('resolves DataScope with the alt menu that actually granted access', async () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === REQUIRE_MENU_KEY) {
          return {
            menu: 'MENU_WMS_VIEW',
            perm: 'V',
            altMenus: ['MENU_INV_BATCH', 'MENU_WMS_INOUT'],
          };
        }
        return undefined;
      }),
    };
    const dataScopeService = {
      resolve: jest.fn().mockResolvedValue({
        isGlobal: false,
        allowedWarehouseCodes: ['LPH_MS_EGG_SALES'],
      }),
    };
    const clsValues = new Map<string, unknown>([
      ['user', {
        userId: '42',
        perms_version: 7,
        roles: ['ROLE_WMS_OP'],
        permissions: ['MENU_INV_BATCH:V'],
      }],
    ]);
    const cls = {
      get: jest.fn((key: string) => clsValues.get(key)),
      set: jest.fn((key: string, value: unknown) => clsValues.set(key, value)),
    };

    const guard = new DataScopeGuard(reflector as any, dataScopeService as any, cls as any);

    await expect(guard.canActivate(context() as any)).resolves.toBe(true);

    expect(dataScopeService.resolve).toHaveBeenCalledWith('42', ['ROLE_WMS_OP'], 'MENU_INV_BATCH', 7);
    expect(cls.set).toHaveBeenCalledWith('dataScope', {
      isGlobal: false,
      allowedWarehouseCodes: ['LPH_MS_EGG_SALES'],
    });
  });

  it('denies requests when DataScope resolution fails', async () => {
    const reflector = { getAllAndOverride: jest.fn(() => ({ menu: 'MENU_WMS_VIEW', perm: 'V' })) };
    const dataScopeService = { resolve: jest.fn().mockRejectedValue(new Error('database unavailable')) };
    const cls = { get: jest.fn((key: string) => key === 'user' ? { userId: '42', roles: ['ROLE_WMS_OP'] } : undefined), set: jest.fn() };
    const guard = new DataScopeGuard(reflector as any, dataScopeService as any, cls as any);

    await expect(guard.canActivate(context() as any)).rejects.toMatchObject({
      response: { code: 'DATA_SCOPE_UNRESOLVED' },
    });
  });
});
