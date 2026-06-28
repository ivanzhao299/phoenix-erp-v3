import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: 给 ROLE_FACTORY_MGR(场区经理/生产厂长)授予 MENU_DEVICE_MONITOR:V(设备监控只读)。
 *   养殖场长(FARM_MGR)/驻场兽医(VET)/饲养员(FARMER)/养殖技术员(BREEDER)/总裁(CEO)在 10_rbac_complete_matrix
 *   已有此权;唯独场区经理缺(宋雷 2026-06-28 多个 403 的根因之一)。仅补只读 V,不放写权,符合岗位职责。
 */
export class GrantDeviceMonitorFactoryMgr1782633382333 implements MigrationInterface {
  name = 'GrantDeviceMonitorFactoryMgr1782633382333';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 幂等:角色或菜单不存在则插 0 行;已存在该(role,menu)授权则不覆盖
    await queryRunner.query(`
      INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
      SELECT r.role_id, m.menu_id, 'V'
      FROM sys_role r
      CROSS JOIN sys_menu m
      WHERE r.role_code = 'ROLE_FACTORY_MGR'
        AND m.menu_code = 'MENU_DEVICE_MONITOR'
      ON CONFLICT (role_id, menu_id) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 仅回滚本迁移新增的 ROLE_FACTORY_MGR × MENU_DEVICE_MONITOR 授权
    await queryRunner.query(`
      DELETE FROM sys_role_menu_permission p
      USING sys_role r, sys_menu m
      WHERE p.role_id = r.role_id
        AND p.menu_id = m.menu_id
        AND r.role_code = 'ROLE_FACTORY_MGR'
        AND m.menu_code = 'MENU_DEVICE_MONITOR'
    `);
  }
}
