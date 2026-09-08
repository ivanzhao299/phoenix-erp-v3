import { newlyIntroducedBlockingConflicts, PermissionsService } from './permissions.service';

describe('newlyIntroducedBlockingConflicts', () => {
  const rules = [{ menu_a: 'MENU_FIN_CLOSE', menu_b: 'MENU_FIN_AUDIT', severity: 'BLOCK' as const }];

  it('allows an unrelated permission change when the role already has the same legacy conflict', () => {
    expect(newlyIntroducedBlockingConflicts(
      ['MENU_FIN_CLOSE', 'MENU_FIN_AUDIT'],
      ['MENU_FIN_CLOSE', 'MENU_FIN_AUDIT', 'MENU_STORE_PAYMENT'],
      rules,
    )).toEqual([]);
  });

  it('blocks a newly introduced separation-of-duties conflict', () => {
    expect(newlyIntroducedBlockingConflicts(
      ['MENU_FIN_AUDIT'],
      ['MENU_FIN_CLOSE', 'MENU_FIN_AUDIT'],
      rules,
    )).toEqual(rules);
  });

  it('allows remediation that removes one side of an existing conflict', () => {
    expect(newlyIntroducedBlockingConflicts(
      ['MENU_FIN_CLOSE', 'MENU_FIN_AUDIT'],
      ['MENU_FIN_AUDIT'],
      rules,
    )).toEqual([]);
  });
});

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
    const conflictRepo = { find: jest.fn().mockResolvedValue([]) };
    const manager = {
      delete: jest.fn().mockResolvedValue(undefined),
      insert: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([{ user_id: 7 }, { user_id: 8 }]),
    };
    const dataSource = {
      query: jest.fn().mockResolvedValue([]),
      transaction: jest.fn(async (callback: (mgr: typeof manager) => unknown) => callback(manager)),
    };
    const service = new PermissionsService(
      roleRepo as never,
      menuRepo as never,
      {} as never,
      {} as never,
      conflictRepo as never,
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
