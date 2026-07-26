import { PermissionsService } from './permissions.service';

describe('PermissionsService role permission snapshots', () => {
  it('invalidates every active assigned user after replacing role permissions', async () => {
    const roleRepo = {
      findOne: jest.fn().mockResolvedValue({ role_id: 12, role_code: 'ROLE_FARM_MGR' }),
    };
    const menuRepo = {
      find: jest.fn().mockResolvedValue([
        { menu_id: 31, menu_code: 'MENU_FARM_MASTER' },
      ]),
    };
    const manager = {
      delete: jest.fn().mockResolvedValue(undefined),
      insert: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([{ user_id: 7 }, { user_id: 8 }]),
    };
    const dataSource = {
      transaction: jest.fn(async (callback: (mgr: typeof manager) => unknown) => callback(manager)),
    };
    const service = new PermissionsService(
      roleRepo as never,
      menuRepo as never,
      {} as never,
      {} as never,
      {} as never,
      dataSource as never,
    );

    await expect(service.setRolePermissions('ROLE_FARM_MGR', [
      { menu_code: 'MENU_FARM_MASTER', perm_codes: 'V,C' },
    ])).resolves.toEqual({
      role_code: 'ROLE_FARM_MGR',
      written: 1,
      invalidated_users: 2,
    });

    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('SET perms_version = COALESCE(u.perms_version, 0) + 1'),
      [12],
    );
  });
});
