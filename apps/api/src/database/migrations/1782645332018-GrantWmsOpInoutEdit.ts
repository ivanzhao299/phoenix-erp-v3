import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: 给 ROLE_WMS_OP(仓管理货员)的 MENU_WMS_INOUT 补 E(编辑)权限位。
 *   只读生产实勘(2026-06-28)确认其当前为 'V,C' → PDA 出库(advance:E)/盘点(pda-count:E) 会 403。
 *   补 E 后理货员可用 /terminal/wms/outbound + /terminal/wms/stocktake（PDA 终端为其设计的核心动作）。
 *   幂等：已含 E 则不变；仅改 MENU_WMS_INOUT 一行，不动其它角色/菜单。
 */
export class GrantWmsOpInoutEdit1782645332018 implements MigrationInterface {
  name = 'GrantWmsOpInoutEdit1782645332018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE sys_role_menu_permission p
      SET perm_codes = CASE WHEN position('E' in perm_codes) > 0 THEN perm_codes ELSE perm_codes || ',E' END
      FROM sys_role r, sys_menu m
      WHERE p.role_id = r.role_id AND p.menu_id = m.menu_id
        AND r.role_code = 'ROLE_WMS_OP' AND m.menu_code = 'MENU_WMS_INOUT'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 仅在恰为本迁移产出的 'V,C,E' 时回退到实勘前值 'V,C'，避免误改人工调整后的值
    await queryRunner.query(`
      UPDATE sys_role_menu_permission p
      SET perm_codes = 'V,C'
      FROM sys_role r, sys_menu m
      WHERE p.role_id = r.role_id AND p.menu_id = m.menu_id
        AND r.role_code = 'ROLE_WMS_OP' AND m.menu_code = 'MENU_WMS_INOUT'
        AND p.perm_codes = 'V,C,E'
    `);
  }
}
