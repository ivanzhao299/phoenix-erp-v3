import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: 注册审批中心原子菜单码，并从 legacy MENU_WORKFLOW 拆分过渡角色授权
 */
export class SeedWorkflowAtomicMenus1782045418112 implements MigrationInterface {
  name = 'SeedWorkflowAtomicMenus1782045418112';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO sys_menu (menu_code, menu_name_zh, menu_name_lo, domain, parent_code, sort_order, icon, route)
      VALUES
        ('MENU_WORKFLOW_TODO',    '审批待办',   NULL, 'WORKFLOW', 'MENU_WORKFLOW', 10, 'ClipboardList', '/workflow/todos'),
        ('MENU_WORKFLOW_HISTORY', '审批已办',   NULL, 'WORKFLOW', 'MENU_WORKFLOW', 20, 'History',       '/workflow/history'),
        ('MENU_WORKFLOW_NOTIFY',  '审批通知',   NULL, 'WORKFLOW', 'MENU_WORKFLOW', 30, 'Bell',          '/notifications'),
        ('MENU_WORKFLOW_CONFIG',  '流程配置',   NULL, 'WORKFLOW', 'MENU_WORKFLOW', 40, 'Network',       '/settings/approval-flows'),
        ('MENU_WORKFLOW_RULES',   '审批规则',   NULL, 'WORKFLOW', 'MENU_WORKFLOW', 50, 'Settings2',     '/settings/approval-rules'),
        ('MENU_WORKFLOW_FORM',    '表单管理',   NULL, 'WORKFLOW', 'MENU_WORKFLOW', 60, 'FileText',      '/workflow/forms/runtime'),
        ('MENU_WORKFLOW_METRICS', '审批看板',   NULL, 'WORKFLOW', 'MENU_WORKFLOW', 70, 'BarChart3',     '/workflow/metrics')
      ON CONFLICT (menu_code) DO UPDATE SET
        menu_name_zh = EXCLUDED.menu_name_zh,
        menu_name_lo = EXCLUDED.menu_name_lo,
        domain = EXCLUDED.domain,
        parent_code = EXCLUDED.parent_code,
        sort_order = EXCLUDED.sort_order,
        icon = EXCLUDED.icon,
        route = EXCLUDED.route
    `);

    await queryRunner.query(`
      WITH legacy AS (
        SELECT p.role_id, p.perm_codes
          FROM sys_role_menu_permission p
          JOIN sys_menu m ON m.menu_id = p.menu_id
         WHERE m.menu_code = 'MENU_WORKFLOW'
      ),
      targets(menu_code, allowed_codes, require_adminish) AS (
        VALUES
          ('MENU_WORKFLOW_TODO',    ARRAY['V','C','E','A']::text[], false),
          ('MENU_WORKFLOW_HISTORY', ARRAY['V']::text[],         false),
          ('MENU_WORKFLOW_NOTIFY',  ARRAY['V','E']::text[],     false),
          ('MENU_WORKFLOW_CONFIG',  ARRAY['V','C','E','D']::text[], true),
          ('MENU_WORKFLOW_RULES',   ARRAY['V','C','E','D']::text[], true),
          ('MENU_WORKFLOW_FORM',    ARRAY['V','C','E']::text[], true),
          ('MENU_WORKFLOW_METRICS', ARRAY['V','X']::text[],     true)
      ),
      expanded AS (
        SELECT
          legacy.role_id,
          targets.menu_code,
          targets.allowed_codes,
          targets.require_adminish,
          string_to_array(legacy.perm_codes, ',') AS source_codes
        FROM legacy
        CROSS JOIN targets
      ),
      filtered AS (
        SELECT
          role_id,
          menu_code,
          (
            SELECT string_agg(code, ',' ORDER BY array_position(ARRAY['V','C','E','D','A','X']::text[], code))
              FROM unnest(source_codes) AS code
             WHERE code = ANY(allowed_codes)
               AND (
                 require_adminish = false
                 OR source_codes && ARRAY['C','E','D','X']::text[]
               )
          ) AS perm_codes
        FROM expanded
      )
      INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
      SELECT filtered.role_id, menu.menu_id, filtered.perm_codes
        FROM filtered
        JOIN sys_menu menu ON menu.menu_code = filtered.menu_code
       WHERE filtered.perm_codes IS NOT NULL
         AND filtered.perm_codes <> ''
      ON CONFLICT (role_id, menu_id) DO UPDATE SET
        perm_codes = EXCLUDED.perm_codes
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM sys_role_menu_permission p
      USING sys_menu m
      WHERE p.menu_id = m.menu_id
        AND m.menu_code IN (
          'MENU_WORKFLOW_TODO',
          'MENU_WORKFLOW_HISTORY',
          'MENU_WORKFLOW_NOTIFY',
          'MENU_WORKFLOW_CONFIG',
          'MENU_WORKFLOW_RULES',
          'MENU_WORKFLOW_FORM',
          'MENU_WORKFLOW_METRICS'
        )
    `);

    await queryRunner.query(`
      DELETE FROM sys_menu
      WHERE menu_code IN (
        'MENU_WORKFLOW_TODO',
        'MENU_WORKFLOW_HISTORY',
        'MENU_WORKFLOW_NOTIFY',
        'MENU_WORKFLOW_CONFIG',
        'MENU_WORKFLOW_RULES',
        'MENU_WORKFLOW_FORM',
        'MENU_WORKFLOW_METRICS'
      )
    `);
  }
}
