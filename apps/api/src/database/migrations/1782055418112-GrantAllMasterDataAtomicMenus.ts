import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: 一次性补齐主数据全族原子码授权(Option B 纯原子化),根治部署后主数据中心/各实体 403
 *
 * 背景(2026-06-27 命名/样式审计 Batch 1,用户选 Option B):
 *   1782052 把粗码 MENU_MASTER 转原子时,转授映射只覆盖 PRODUCT/GRADE/PACKAGING/SKU/STORE,
 *   漏了 CUSTOMER/SUPPLIER/PROJECT/WAREHOUSE/DRIVER/VEHICLE/CASH_ACCOUNT/BANK_ACCOUNT/MATERIAL/
 *   ORG/COMPANY/QUALITY/AUDIT/PENDING/DICT_CENTER/CENTER 等约 16+ 个原子分支 → 这些实体 guard
 *   要 MENU_MD_<TYPE>:E/C 而无人被授 → 整片 403。1782053/1782054 逐个补(CENTER/PROJECT)是打地鼠。
 *
 * 本迁移(数据驱动·全族一次性):
 *   把"持有 MENU_MASTER_DATA 的非 ADMIN 角色"的父码权限等级,复制到 MENU_MASTER_DATA 的
 *   全部子菜单(parent_code='MENU_MASTER_DATA' 的所有 MENU_MD_*,含未来新增),合并已有授权。
 *   忠实还原"粗码 MENU_MASTER 等价访问面",但落到原子码上(父码已删,符合原子化方向)。
 *   ROLE_ADMIN 走 '*' 通配 + guard 直通,无需授权,故排除。
 *   DataScope 由现有机制兜住(GROUP 绑定/角色规则/sys_user_orgs 公司展开),本迁移不动 sys_data_scopes。
 *   附:再次清除非 ADMIN 的 6 粗父菜单残留授权(只读校验发现仍残 1 条)。
 */
export class GrantAllMasterDataAtomicMenus1782055418112 implements MigrationInterface {
  name = 'GrantAllMasterDataAtomicMenus1782055418112';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) 父码权限 → 全部 MENU_MASTER_DATA 子菜单(合并已有,去重保序)
    await queryRunner.query(`
      INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
      SELECT p.role_id, child.menu_id, p.perm_codes
      FROM sys_role_menu_permission p
      JOIN sys_menu parent ON parent.menu_id = p.menu_id AND parent.menu_code = 'MENU_MASTER_DATA'
      JOIN sys_menu child ON child.parent_code = 'MENU_MASTER_DATA'
      JOIN sys_role r ON r.role_id = p.role_id AND r.role_code <> 'ROLE_ADMIN'
      WHERE p.perm_codes <> '*' AND p.perm_codes <> ''
      ON CONFLICT (role_id, menu_id) DO UPDATE SET perm_codes = (
        SELECT string_agg(c, ',' ORDER BY array_position(ARRAY['V','C','E','D','A','X']::text[], c))
        FROM (
          SELECT DISTINCT c
          FROM unnest(string_to_array(sys_role_menu_permission.perm_codes || ',' || EXCLUDED.perm_codes, ',')) AS c
          WHERE c IN ('V','C','E','D','A','X')
        ) u
      )
    `);

    // 2) 清残余:移除非 ADMIN 的 6 粗父菜单授权(幂等,与 1782052 同口径)
    await queryRunner.query(`
      DELETE FROM sys_role_menu_permission p
      USING sys_role r, sys_menu m
      WHERE p.role_id = r.role_id AND p.menu_id = m.menu_id
        AND r.role_code <> 'ROLE_ADMIN'
        AND m.menu_code IN ('MENU_FIN2','MENU_PRC2','MENU_PRC2_MASTER','MENU_WORKFLOW','MENU_MASTER','MENU_SETTINGS_IT')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 最佳努力回滚:移除"持 MENU_MASTER_DATA 的非 ADMIN 角色"在 MENU_MASTER_DATA 子菜单上的授权。
    // 注:up() 用合并(无法区分本迁移新增 vs 历史授权),且 step2 的粗码删除不可逆;此 down 为近似回退。
    await queryRunner.query(`
      DELETE FROM sys_role_menu_permission p
      USING sys_menu child
      WHERE p.menu_id = child.menu_id
        AND child.parent_code = 'MENU_MASTER_DATA'
        AND p.role_id IN (
          SELECT p2.role_id
          FROM sys_role_menu_permission p2
          JOIN sys_menu parent ON parent.menu_id = p2.menu_id AND parent.menu_code = 'MENU_MASTER_DATA'
          JOIN sys_role r ON r.role_id = p2.role_id AND r.role_code <> 'ROLE_ADMIN'
        )
    `);
  }
}
