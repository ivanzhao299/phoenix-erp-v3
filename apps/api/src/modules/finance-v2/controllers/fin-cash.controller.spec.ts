import 'reflect-metadata';
import { REQUIRE_MENU_KEY, type MenuRequirement } from '../../../common/guards/menu.guard';
import { FinCashController } from './fin-cash.controller';

describe('FinCashController RBAC metadata', () => {
  it('requires sensitive cash-account master-data create permission for account creation', () => {
    const requirement = Reflect.getMetadata(
      REQUIRE_MENU_KEY,
      FinCashController.prototype.createAccount,
    ) as MenuRequirement | undefined;

    expect(requirement).toEqual({
      menu: 'MENU_MD_CASH_ACCOUNT',
      perm: 'C',
      altMenus: undefined,
      denialMessage: '当前角色无权限新建账户',
    });
  });
});
