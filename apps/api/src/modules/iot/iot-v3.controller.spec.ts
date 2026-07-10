import 'reflect-metadata';
import { REQUIRE_MENU_KEY } from '../../common/guards/menu.guard';
import type { MenuRequirement } from '../../common/guards/menu.guard';
import { IotV3Controller } from './iot-v3.controller';

describe('IotV3Controller RBAC metadata', () => {
  it('allows dashboard viewers to read the home IoT summary without device-monitor permission', () => {
    const requirement = Reflect.getMetadata(
      REQUIRE_MENU_KEY,
      IotV3Controller.prototype.getAllSummary,
    ) as MenuRequirement | undefined;

    expect(requirement).toEqual({
      menu: 'MENU_DEVICE_MONITOR',
      perm: 'V',
      altMenus: ['MENU_DASHBOARD'],
      denialMessage: undefined,
    });
  });

  it('keeps realtime sync restricted to device-monitor edit permission', () => {
    const requirement = Reflect.getMetadata(
      REQUIRE_MENU_KEY,
      IotV3Controller.prototype.syncRealtime,
    ) as MenuRequirement | undefined;

    expect(requirement).toEqual({
      menu: 'MENU_DEVICE_MONITOR',
      perm: 'E',
      altMenus: undefined,
      denialMessage: undefined,
    });
  });
});
