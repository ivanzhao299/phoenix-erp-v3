import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: 治理卫生(W1/W2)——删除已确认 vestigial 的粗父/旧别名 RBAC 授权。
 *   只读生产实勘(2026-06-28)确认全部可安全删除:
 *   1) 非 admin 角色的 MENU_MASTER_DATA 粗父授权(5 角色:CEO/FARM_MGR/MASTER_DATA_ADMIN/
 *      MASTER_DATA_APPROVER/STORE_MGR,均已持 14~20 个 MENU_MD_* 原子子授权);侧边栏「主数据中心」
 *      由子菜单驱动显示(Sidebar.getVisibleMenu:有可见子项即显示父组,从不评估父 perm),后端无
 *      @RequireMenu('MENU_MASTER_DATA') → 删粗父零功能影响。
 *   2) 非 admin 角色的 MENU_SYS_ORG 粗父授权(仅 ROLE_CEO,已持 3 个 org 原子);无后端 guard 读它。
 *   3) 旧别名 MENU_ORG_VIEW / MENU_ORG_MANAGE 全部授权(前后端 0 引用,已被 MENU_MD_ORG/COMPANY
 *      取代,纯 dead 码)。
 *   不触碰 ROLE_ADMIN 的 MENU_MASTER_DATA/MENU_SYS_ORG 行(其走 * 通配)。
 */
export class CleanupVestigialMenuGrants1782639127220 implements MigrationInterface {
  name = 'CleanupVestigialMenuGrants1782639127220';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) + 2) 删非 admin 的粗父授权(MENU_MASTER_DATA / MENU_SYS_ORG)
    await queryRunner.query(`
      DELETE FROM sys_role_menu_permission p
      USING sys_role r, sys_menu m
      WHERE p.role_id = r.role_id AND p.menu_id = m.menu_id
        AND r.role_code <> 'ROLE_ADMIN'
        AND m.menu_code IN ('MENU_MASTER_DATA','MENU_SYS_ORG')
    `);
    // 3) 删旧别名 dead 码的全部授权
    await queryRunner.query(`
      DELETE FROM sys_role_menu_permission p
      USING sys_menu m
      WHERE p.menu_id = m.menu_id
        AND m.menu_code IN ('MENU_ORG_VIEW','MENU_ORG_MANAGE')
    `);
  }

  /**
   * 按实勘快照精确复原(忠实回滚)。粗父以原视图权 'V' 复原;旧别名按实勘 perm_codes 复原。
   * 角色/菜单不存在则该行插 0 条(幂等安全)。
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    const grant = async (roleCode: string, menuCode: string, perms: string) => {
      await queryRunner.query(
        `INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
         SELECT r.role_id, m.menu_id, $3 FROM sys_role r CROSS JOIN sys_menu m
         WHERE r.role_code = $1 AND m.menu_code = $2
         ON CONFLICT (role_id, menu_id) DO NOTHING`,
        [roleCode, menuCode, perms],
      );
    };
    // 1) MENU_MASTER_DATA(5 非 admin 角色,'V')
    for (const rc of ['ROLE_CEO','ROLE_FARM_MGR','ROLE_MASTER_DATA_ADMIN','ROLE_MASTER_DATA_APPROVER','ROLE_STORE_MGR']) {
      await grant(rc, 'MENU_MASTER_DATA', 'V');
    }
    // 2) MENU_SYS_ORG(ROLE_CEO,'V')
    await grant('ROLE_CEO', 'MENU_SYS_ORG', 'V');
    // 3) 旧别名按实勘 perm_codes 复原
    await grant('ROLE_ADMIN',      'MENU_ORG_MANAGE', 'V,C,E,D,A,X');
    await grant('ROLE_HR_MANAGER', 'MENU_ORG_MANAGE', 'V,C,E');
    await grant('ROLE_ADMIN',      'MENU_ORG_VIEW',   'V,C,E,D,A,X');
    await grant('ROLE_BU_AGRI_GM', 'MENU_ORG_VIEW',   'V');
    await grant('ROLE_BU_FOOD_GM', 'MENU_ORG_VIEW',   'V');
    await grant('ROLE_CEO',        'MENU_ORG_VIEW',   'V,X');
    await grant('ROLE_FARM_MGR',   'MENU_ORG_VIEW',   'V');
    await grant('ROLE_FIN_CFO',    'MENU_ORG_VIEW',   'V,X');
    await grant('ROLE_HR_MANAGER', 'MENU_ORG_VIEW',   'V,C,E,X');
    await grant('ROLE_REGION_MGR', 'MENU_ORG_VIEW',   'V');
    await grant('ROLE_STORE_MGR',  'MENU_ORG_VIEW',   'V');
  }
}
