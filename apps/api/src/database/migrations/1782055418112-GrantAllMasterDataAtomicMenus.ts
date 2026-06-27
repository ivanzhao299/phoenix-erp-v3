import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: 补齐主数据原子码授权(Option B 纯原子化),根治部署后主数据中心/各实体 403
 *
 * 背景(2026-06-27 命名/样式审计 Batch 1,用户选 Option B;经对抗 review 收敛):
 *   1782052 把粗码 MENU_MASTER 转原子时,转授映射只覆盖 PRODUCT/GRADE/PACKAGING/SKU/STORE,
 *   漏了 CUSTOMER/SUPPLIER/PROJECT/WAREHOUSE/DRIVER/VEHICLE/MATERIAL/ORG/COMPANY 及中心子页
 *   (CENTER/DICT_CENTER/QUALITY/AUDIT/PENDING)→ 这些实体 guard 要 MENU_MD_<TYPE>:E/C 而无人被授 → 403。
 *
 * 本迁移(显式白名单·一次性补齐 1782052 漏掉的那批):
 *   把"持 MENU_MASTER_DATA 的非 ADMIN 角色"的父码权限等级,授到下列【明确的、非财务敏感的】
 *   主数据实体/中心子页原子码上,合并已有授权。
 *   ⚠️ 刻意排除 MENU_MD_CASH_ACCOUNT / MENU_MD_BANK_ACCOUNT(财务敏感主数据)——这两个
 *      MENU_MASTER 历史从未覆盖,应单独按财务角色精授,不随主数据中心泛授(防 SYSOPS 等越权)。
 *   ⚠️ 不重复 1782052 已授的 PRODUCT/GRADE/PACKAGING/SKU/STORE(它们已生效),故 up/down 只针对新增集。
 *   ROLE_ADMIN 走 '*' 通配 + guard 直通,排除;source 含 '*'/'' 也排除(防合并塌缩)。
 *   合并保 '*':任一侧为 '*' 则结果 '*'(防把既有通配降级)。
 *   DataScope 由现有机制(GROUP 绑定/角色规则/sys_user_orgs 公司展开)兜住,不动 sys_data_scopes。
 *   附:再次清除非 ADMIN 的 6 粗父菜单残留授权(只读校验仍残 1 条)。
 */
const TARGET_CODES = [
  'MENU_MD_CUSTOMER', 'MENU_MD_SUPPLIER', 'MENU_MD_PROJECT', 'MENU_MD_WAREHOUSE',
  'MENU_MD_DRIVER', 'MENU_MD_VEHICLE', 'MENU_MD_MATERIAL', 'MENU_MD_ORG', 'MENU_MD_COMPANY',
  'MENU_MD_CENTER', 'MENU_MD_DICT_CENTER', 'MENU_MD_QUALITY', 'MENU_MD_AUDIT', 'MENU_MD_PENDING',
];

export class GrantAllMasterDataAtomicMenus1782055418112 implements MigrationInterface {
  name = 'GrantAllMasterDataAtomicMenus1782055418112';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const codesSql = TARGET_CODES.map((c) => `'${c}'`).join(',');
    // 1) 父码权限 → 显式白名单子菜单(合并已有;保 '*';去重保序)
    await queryRunner.query(`
      INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
      SELECT p.role_id, child.menu_id, p.perm_codes
      FROM sys_role_menu_permission p
      JOIN sys_menu parent ON parent.menu_id = p.menu_id AND parent.menu_code = 'MENU_MASTER_DATA'
      JOIN sys_role r ON r.role_id = p.role_id AND r.role_code <> 'ROLE_ADMIN'
      JOIN sys_menu child ON child.menu_code IN (${codesSql})
      WHERE p.perm_codes <> '*' AND p.perm_codes <> ''
      ON CONFLICT (role_id, menu_id) DO UPDATE SET perm_codes =
        CASE
          WHEN sys_role_menu_permission.perm_codes = '*' OR EXCLUDED.perm_codes = '*' THEN '*'
          ELSE (
            SELECT string_agg(c, ',' ORDER BY array_position(ARRAY['V','C','E','D','A','X']::text[], c))
            FROM (
              SELECT DISTINCT c
              FROM unnest(string_to_array(sys_role_menu_permission.perm_codes || ',' || EXCLUDED.perm_codes, ',')) AS c
              WHERE c IN ('V','C','E','D','A','X')
            ) u
          )
        END
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
    const codesSql = TARGET_CODES.map((c) => `'${c}'`).join(',');
    // 精确回退:仅删本迁移目标白名单码、且仅限"持 MENU_MASTER_DATA 的非 ADMIN 角色"。
    // 不触 1782052 已授的 PRODUCT/GRADE/PACKAGING/SKU/STORE。注:step2 粗码删除不可逆。
    await queryRunner.query(`
      DELETE FROM sys_role_menu_permission p
      USING sys_menu child
      WHERE p.menu_id = child.menu_id
        AND child.menu_code IN (${codesSql})
        AND p.role_id IN (
          SELECT p2.role_id
          FROM sys_role_menu_permission p2
          JOIN sys_menu parent ON parent.menu_id = p2.menu_id AND parent.menu_code = 'MENU_MASTER_DATA'
          JOIN sys_role r ON r.role_id = p2.role_id AND r.role_code <> 'ROLE_ADMIN'
        )
    `);
  }
}
