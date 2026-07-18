import { REQUIRE_MENU_KEY, MenuRequirement } from '../../common/guards/menu.guard';
import { PackagingController } from './packaging.controller';

describe('PackagingController RBAC', () => {
  it('allows collection completion with create permission on the packaging workbench', () => {
    const requirement = Reflect.getMetadata(
      REQUIRE_MENU_KEY,
      PackagingController.prototype.completeShift,
    ) as MenuRequirement;

    expect(requirement).toEqual({
      menu: 'MENU_PKG_MGR',
      perm: 'C',
      altMenus: ['MENU_PACKAGING'],
      denialMessage: undefined,
    });
  });
});
