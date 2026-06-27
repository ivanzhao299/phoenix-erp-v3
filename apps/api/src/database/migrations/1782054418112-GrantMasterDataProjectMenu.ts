import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: 补 MENU_MD_PROJECT 授权(1782052 转授映射漏了项目分支),修复部署后项目激活/新建 403
 *
 * 背景(2026-06-27 部署后回归):
 *   项目管理 guard 切到原子码 MENU_MD_PROJECT、删父码兜底(36af066),但 1782052 的
 *   MENU_MASTER→原子 转授映射只覆盖 PRODUCT/GRADE/PACKAGING/SKU/STORE,漏了 PROJECT;
 *   g120 赋权矩阵也从未给任何角色授 MENU_MD_PROJECT。结果:原本靠父码 MENU_MASTER_DATA
 *   维护项目的角色(公司负责人/财务/CEO 等)激活项目(需 :E)、新建项目(需 :C)一律 403。
 *   修法与 MENU_MD_CENTER(1782053)一致:给持有 MENU_MASTER_DATA 的角色补 MENU_MD_PROJECT:V,C,E。
 */
export class GrantMasterDataProjectMenu1782054418112 implements MigrationInterface {
  name = 'GrantMasterDataProjectMenu1782054418112';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
      SELECT DISTINCT p.role_id, mp.menu_id, 'V,C,E'
      FROM sys_role_menu_permission p
      JOIN sys_menu md ON md.menu_id = p.menu_id AND md.menu_code = 'MENU_MASTER_DATA'
      JOIN sys_menu mp ON mp.menu_code = 'MENU_MD_PROJECT'
      ON CONFLICT (role_id, menu_id) DO UPDATE SET perm_codes = (
        SELECT string_agg(c, ',' ORDER BY array_position(ARRAY['V','C','E','D','A','X']::text[], c))
        FROM (
          SELECT DISTINCT c
          FROM unnest(string_to_array(sys_role_menu_permission.perm_codes || ',V,C,E', ',')) AS c
          WHERE c IN ('V','C','E','D','A','X')
        ) u
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 最佳努力回滚:移除持有 MENU_MASTER_DATA 的角色上的 MENU_MD_PROJECT 授权
    await queryRunner.query(`
      DELETE FROM sys_role_menu_permission p
      USING sys_menu mp
      WHERE p.menu_id = mp.menu_id
        AND mp.menu_code = 'MENU_MD_PROJECT'
        AND p.role_id IN (
          SELECT p2.role_id
          FROM sys_role_menu_permission p2
          JOIN sys_menu md ON md.menu_id = p2.menu_id AND md.menu_code = 'MENU_MASTER_DATA'
        )
    `);
  }
}
