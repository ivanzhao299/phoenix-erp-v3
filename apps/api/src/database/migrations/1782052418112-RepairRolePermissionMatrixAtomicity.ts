import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: 将非管理员角色的粗粒度父菜单授权转换为原子菜单授权，并移除父授权以避免跨权限展示
 */
export class RepairRolePermissionMatrixAtomicity1782052418112 implements MigrationInterface {
  name = 'RepairRolePermissionMatrixAtomicity1782052418112';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO sys_menu (menu_code, menu_name_zh, menu_name_lo, domain, parent_code, sort_order, icon, route)
      VALUES
        ('MENU_FIN2_DASHBOARD', '财务总览', NULL, 'FIN2', 'MENU_FIN2', 10, 'LayoutDashboard', '/finance2'),
        ('MENU_FIN2_CASH_VIEW', '资金账户查看', NULL, 'FIN2', 'MENU_FIN2_CASH', 30, 'Wallet', '/finance2/cash-accounts'),
        ('MENU_FIN2_CASH_TRANSFER', '资金调拨', NULL, 'FIN2', 'MENU_FIN2_CASH', 40, 'ArrowLeftRight', '/finance2/fund-transfers'),
        ('MENU_FIN2_AR_LEDGER', '应收总账', NULL, 'FIN2', 'MENU_FIN2_AR', 55, 'BookOpen', '/finance2/ar-ledger'),
        ('MENU_PRC2_DASHBOARD', '采购看板', NULL, 'PRC', 'MENU_PRC2_MASTER', 58, 'LayoutDashboard', '/procurement2/dashboard'),
        ('MENU_PRC2_SUPPLIER', '供应商档案', NULL, 'PRC', 'MENU_PRC2_MASTER', 60, 'Globe', '/procurement2/suppliers'),
        ('MENU_PRC2_PROJECT', '采购项目', NULL, 'PRC', 'MENU_PRC2_MASTER', 61, 'FolderKanban', '/procurement2/projects'),
        ('MENU_PRC2_REQUEST', '采购申请', NULL, 'PRC', 'MENU_PRC2_MASTER', 62, 'FilePlus', '/procurement2/requests'),
        ('MENU_PRC2_ORDER', '采购订单', NULL, 'PRC', 'MENU_PRC2_MASTER', 63, 'ShoppingBag', '/procurement2/orders'),
        ('MENU_PRC2_PAYMENT', '付款管理', NULL, 'PRC', 'MENU_PRC2_MASTER', 64, 'Banknote', '/procurement2/payments'),
        ('MENU_PRC2_RECEIPT', '收货管理', NULL, 'PRC', 'MENU_PRC2_MASTER', 65, 'PackageCheck', '/procurement2/receipts'),
        ('MENU_PRC2_SHIPMENT', '物流管理', NULL, 'PRC', 'MENU_PRC2_MASTER', 66, 'Truck', '/procurement2/shipments'),
        ('MENU_PRC2_FUND', '股东资金', NULL, 'PRC', 'MENU_PRC2_MASTER', 67, 'DollarSign', '/procurement2/shareholder-funds'),
        ('MENU_PRC2_INIT', '历史初始化', NULL, 'PRC', 'MENU_PRC2_MASTER', 68, 'UploadCloud', '/procurement2/init'),
        ('MENU_MASTER_DATA', '主数据中心', NULL, 'MASTER', NULL, 700, 'Database', '/master-data'),
        ('MENU_MD_CUSTOMER', '客户档案', NULL, 'MASTER', 'MENU_MASTER_DATA', 701, 'Users', '/master-data/customers'),
        ('MENU_MD_SUPPLIER', '供应商档案', NULL, 'MASTER', 'MENU_MASTER_DATA', 702, 'Globe', '/master-data/suppliers'),
        ('MENU_MD_PROJECT', '项目档案', NULL, 'MASTER', 'MENU_MASTER_DATA', 703, 'FolderKanban', '/master-data/projects'),
        ('MENU_MD_PRODUCT', '产品档案', NULL, 'MASTER', 'MENU_MASTER_DATA', 704, 'Egg', '/master-data/products'),
        ('MENU_MD_GRADE', '等级档案', NULL, 'MASTER', 'MENU_MASTER_DATA', 705, 'Tag', '/master-data/product-grades'),
        ('MENU_MD_PACKAGING', '包装规格', NULL, 'MASTER', 'MENU_MASTER_DATA', 706, 'Package', '/master-data/packaging-specs'),
        ('MENU_MD_SKU', 'SKU档案', NULL, 'MASTER', 'MENU_MASTER_DATA', 707, 'Layers', '/master-data/product-skus'),
        ('MENU_MD_WAREHOUSE', '仓库档案', NULL, 'MASTER', 'MENU_MASTER_DATA', 708, 'Warehouse', '/master-data/warehouses'),
        ('MENU_MD_STORE', '门店档案', NULL, 'MASTER', 'MENU_MASTER_DATA', 709, 'Store', '/master-data/stores'),
        ('MENU_MD_DRIVER', '司机档案', NULL, 'MASTER', 'MENU_MASTER_DATA', 710, 'UserCheck', '/master-data/drivers'),
        ('MENU_MD_VEHICLE', '车辆档案', NULL, 'MASTER', 'MENU_MASTER_DATA', 711, 'Car', '/master-data/vehicles'),
        ('MENU_MD_CASH_ACCOUNT', '资金账户档案', NULL, 'MASTER', 'MENU_MASTER_DATA', 712, 'Wallet', '/master-data/cash-accounts'),
        ('MENU_MD_MATERIAL', '物料档案', NULL, 'MASTER', 'MENU_MASTER_DATA', 713, 'Package', '/master-data/materials'),
        ('MENU_MD_BANK_ACCOUNT', '银行账户中心', NULL, 'MASTER', 'MENU_MASTER_DATA', 715, 'Landmark', '/master-data/bank-accounts'),
        ('MENU_MD_DICT_CENTER', '数据字典中心', NULL, 'MASTER', 'MENU_MASTER_DATA', 720, 'BookOpen', '/master-data/dictionaries'),
        ('MENU_MD_QUALITY', '数据质量中心', NULL, 'MASTER', 'MENU_MASTER_DATA', 730, 'ShieldCheck', '/master-data/quality'),
        ('MENU_MD_AUDIT', '主数据审计', NULL, 'MASTER', 'MENU_MASTER_DATA', 735, 'ScrollText', '/master-data/audit'),
        ('MENU_MD_PENDING', '主数据待审批', NULL, 'MASTER', 'MENU_MASTER_DATA', 740, 'ClipboardCheck', '/master-data/pending')
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
      WITH source_grants AS (
        SELECT r.role_code, src.menu_code AS source_menu, COALESCE(p.perm_codes, '') AS source_perms
        FROM sys_role_menu_permission p
        JOIN sys_role r ON r.role_id = p.role_id
        JOIN sys_menu src ON src.menu_id = p.menu_id
        WHERE r.role_code <> 'ROLE_ADMIN'
          AND src.menu_code IN (
            'MENU_FIN2',
            'MENU_PRC2',
            'MENU_PRC2_MASTER',
            'MENU_WORKFLOW',
            'MENU_MASTER',
            'MENU_SETTINGS_IT'
          )
      ),
      mapping(source_menu, target_menu, allowed_codes) AS (
        VALUES
          ('MENU_FIN2', 'MENU_FIN2_DASHBOARD', ARRAY['V']::text[]),
          ('MENU_FIN2', 'MENU_FIN2_CASH_VIEW', ARRAY['V','X']::text[]),
          ('MENU_FIN2', 'MENU_FIN2_CASH_TRANSFER', ARRAY['V','C','E','A']::text[]),
          ('MENU_FIN2', 'MENU_FIN2_AR', ARRAY['V','C','E','A','X']::text[]),
          ('MENU_FIN2', 'MENU_FIN2_AR_LEDGER', ARRAY['V','E','X']::text[]),
          ('MENU_FIN2', 'MENU_FIN2_AP', ARRAY['V','C','E','A','X']::text[]),
          ('MENU_FIN2', 'MENU_FIN2_EXPENSE', ARRAY['V','C','E','A','X']::text[]),
          ('MENU_FIN2', 'MENU_FIN2_REIMBURSE', ARRAY['V','C','E','A','X']::text[]),
          ('MENU_FIN2', 'MENU_FIN2_SHAREHOLDER', ARRAY['V','C','E','A','X']::text[]),
          ('MENU_FIN2', 'MENU_FIN2_REPORT', ARRAY['V','X']::text[]),
          ('MENU_PRC2', 'MENU_PRC2_DASHBOARD', ARRAY['V','X']::text[]),
          ('MENU_PRC2', 'MENU_PRC2_SUPPLIER', ARRAY['V','C','E','X']::text[]),
          ('MENU_PRC2', 'MENU_PRC2_PROJECT', ARRAY['V','C','E','X']::text[]),
          ('MENU_PRC2', 'MENU_PRC2_REQUEST', ARRAY['V','C','E','D','A','X']::text[]),
          ('MENU_PRC2', 'MENU_PRC2_ORDER', ARRAY['V','C','E','D','A','X']::text[]),
          ('MENU_PRC2', 'MENU_PRC2_PAYMENT', ARRAY['V','C','E','A','X']::text[]),
          ('MENU_PRC2', 'MENU_PRC2_RECEIPT', ARRAY['V','C','E','A','X']::text[]),
          ('MENU_PRC2', 'MENU_PRC2_SHIPMENT', ARRAY['V','C','E','A','X']::text[]),
          ('MENU_PRC2', 'MENU_PRC2_FUND', ARRAY['V','C','E','A','X']::text[]),
          ('MENU_PRC2_MASTER', 'MENU_PRC2_SUPPLIER', ARRAY['V','C','E','X']::text[]),
          ('MENU_PRC2_MASTER', 'MENU_PRC2_PROJECT', ARRAY['V','C','E','X']::text[]),
          ('MENU_PRC2_MASTER', 'MENU_MD_MATERIAL', ARRAY['V','C','E','X']::text[]),
          ('MENU_WORKFLOW', 'MENU_WORKFLOW_TODO', ARRAY['V','C','E','A']::text[]),
          ('MENU_WORKFLOW', 'MENU_WORKFLOW_HISTORY', ARRAY['V']::text[]),
          ('MENU_WORKFLOW', 'MENU_WORKFLOW_NOTIFY', ARRAY['V','E']::text[]),
          ('MENU_WORKFLOW', 'MENU_WORKFLOW_CONFIG', ARRAY['V','C','E','D']::text[]),
          ('MENU_WORKFLOW', 'MENU_WORKFLOW_RULES', ARRAY['V','C','E','D']::text[]),
          ('MENU_WORKFLOW', 'MENU_WORKFLOW_FORM', ARRAY['V','C','E']::text[]),
          ('MENU_WORKFLOW', 'MENU_WORKFLOW_METRICS', ARRAY['V','X']::text[]),
          ('MENU_MASTER', 'MENU_MASTER_DATA', ARRAY['V','C','E','X']::text[]),
          ('MENU_MASTER', 'MENU_MD_PRODUCT', ARRAY['V','C','E','X']::text[]),
          ('MENU_MASTER', 'MENU_MD_GRADE', ARRAY['V','C','E','X']::text[]),
          ('MENU_MASTER', 'MENU_MD_PACKAGING', ARRAY['V','C','E','X']::text[]),
          ('MENU_MASTER', 'MENU_MD_SKU', ARRAY['V','C','E','X']::text[]),
          ('MENU_MASTER', 'MENU_MD_STORE', ARRAY['V','C','E','X']::text[]),
          ('MENU_SETTINGS_IT', 'MENU_SETTINGS_USER', ARRAY['V','C','E','D']::text[]),
          ('MENU_SETTINGS_IT', 'MENU_SETTINGS_ROLE', ARRAY['V','C','E','D']::text[]),
          ('MENU_SETTINGS_IT', 'MENU_SETTINGS_PERMISSION_SET', ARRAY['V','C','E','D']::text[]),
          ('MENU_SETTINGS_IT', 'MENU_SETTINGS_SECURITY', ARRAY['V','C','E','D']::text[]),
          ('MENU_SETTINGS_IT', 'MENU_SETTINGS_AUDIT', ARRAY['V','X']::text[]),
          ('MENU_SETTINGS_IT', 'MENU_SETTINGS_BRAND', ARRAY['V','E']::text[]),
          ('MENU_SETTINGS_IT', 'MENU_SETTINGS_TERMINAL', ARRAY['V','C','E','D']::text[]),
          ('MENU_SETTINGS_IT', 'MENU_SETTINGS_POS', ARRAY['V','C','E','D']::text[]),
          ('MENU_SETTINGS_IT', 'MENU_SETTINGS_STOCK', ARRAY['V','C','E','D']::text[]),
          ('MENU_SETTINGS_IT', 'MENU_SETTINGS_NOTIFY', ARRAY['V','C','E','D']::text[])
      ),
      desired AS (
        SELECT
          source_grants.role_code,
          mapping.target_menu,
          string_agg(code, ',' ORDER BY array_position(ARRAY['V','C','E','D','A','X']::text[], code)) AS perm_codes
        FROM source_grants
        JOIN mapping ON mapping.source_menu = source_grants.source_menu
        CROSS JOIN LATERAL unnest(string_to_array(source_grants.source_perms, ',')) AS source_code(code)
        WHERE code = ANY(mapping.allowed_codes)
        GROUP BY source_grants.role_code, mapping.target_menu
      ),
      existing AS (
        SELECT r.role_code, m.menu_code, COALESCE(p.perm_codes, '') AS perm_codes
        FROM sys_role_menu_permission p
        JOIN sys_role r ON r.role_id = p.role_id
        JOIN sys_menu m ON m.menu_id = p.menu_id
      ),
      merged AS (
        SELECT
          desired.role_code,
          desired.target_menu,
          string_agg(code, ',' ORDER BY array_position(ARRAY['V','C','E','D','A','X']::text[], code)) AS perm_codes
        FROM desired
        LEFT JOIN existing ON existing.role_code = desired.role_code AND existing.menu_code = desired.target_menu
        CROSS JOIN LATERAL (
          SELECT DISTINCT code
          FROM unnest(string_to_array(CONCAT_WS(',', desired.perm_codes, existing.perm_codes), ',')) AS merged_code(code)
          WHERE code IN ('V','C','E','D','A','X')
        ) u
        GROUP BY desired.role_code, desired.target_menu
      )
      INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
      SELECT r.role_id, m.menu_id, merged.perm_codes
      FROM merged
      JOIN sys_role r ON r.role_code = merged.role_code
      JOIN sys_menu m ON m.menu_code = merged.target_menu
      WHERE merged.perm_codes IS NOT NULL AND merged.perm_codes <> ''
      ON CONFLICT (role_id, menu_id) DO UPDATE SET
        perm_codes = EXCLUDED.perm_codes
    `);

    await queryRunner.query(`
      DELETE FROM sys_role_menu_permission p
      USING sys_role r, sys_menu m
      WHERE p.role_id = r.role_id
        AND p.menu_id = m.menu_id
        AND r.role_code <> 'ROLE_ADMIN'
        AND m.menu_code IN (
          'MENU_FIN2',
          'MENU_PRC2',
          'MENU_PRC2_MASTER',
          'MENU_WORKFLOW',
          'MENU_MASTER',
          'MENU_SETTINGS_IT'
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH mapping(source_menu, target_menu, allowed_codes) AS (
        VALUES
          ('MENU_FIN2', 'MENU_FIN2_DASHBOARD', ARRAY['V']::text[]),
          ('MENU_FIN2', 'MENU_FIN2_CASH_VIEW', ARRAY['V','X']::text[]),
          ('MENU_FIN2', 'MENU_FIN2_CASH_TRANSFER', ARRAY['V','C','E','A']::text[]),
          ('MENU_FIN2', 'MENU_FIN2_AR', ARRAY['V','C','E','A','X']::text[]),
          ('MENU_FIN2', 'MENU_FIN2_AR_LEDGER', ARRAY['V','E','X']::text[]),
          ('MENU_FIN2', 'MENU_FIN2_AP', ARRAY['V','C','E','A','X']::text[]),
          ('MENU_FIN2', 'MENU_FIN2_EXPENSE', ARRAY['V','C','E','A','X']::text[]),
          ('MENU_FIN2', 'MENU_FIN2_REIMBURSE', ARRAY['V','C','E','A','X']::text[]),
          ('MENU_FIN2', 'MENU_FIN2_SHAREHOLDER', ARRAY['V','C','E','A','X']::text[]),
          ('MENU_FIN2', 'MENU_FIN2_REPORT', ARRAY['V','X']::text[]),
          ('MENU_PRC2', 'MENU_PRC2_DASHBOARD', ARRAY['V','X']::text[]),
          ('MENU_PRC2', 'MENU_PRC2_SUPPLIER', ARRAY['V','C','E','X']::text[]),
          ('MENU_PRC2', 'MENU_PRC2_PROJECT', ARRAY['V','C','E','X']::text[]),
          ('MENU_PRC2', 'MENU_PRC2_REQUEST', ARRAY['V','C','E','D','A','X']::text[]),
          ('MENU_PRC2', 'MENU_PRC2_ORDER', ARRAY['V','C','E','D','A','X']::text[]),
          ('MENU_PRC2', 'MENU_PRC2_PAYMENT', ARRAY['V','C','E','A','X']::text[]),
          ('MENU_PRC2', 'MENU_PRC2_RECEIPT', ARRAY['V','C','E','A','X']::text[]),
          ('MENU_PRC2', 'MENU_PRC2_SHIPMENT', ARRAY['V','C','E','A','X']::text[]),
          ('MENU_PRC2', 'MENU_PRC2_FUND', ARRAY['V','C','E','A','X']::text[]),
          ('MENU_PRC2_MASTER', 'MENU_PRC2_SUPPLIER', ARRAY['V','C','E','X']::text[]),
          ('MENU_PRC2_MASTER', 'MENU_PRC2_PROJECT', ARRAY['V','C','E','X']::text[]),
          ('MENU_PRC2_MASTER', 'MENU_MD_MATERIAL', ARRAY['V','C','E','X']::text[]),
          ('MENU_WORKFLOW', 'MENU_WORKFLOW_TODO', ARRAY['V','C','E','A']::text[]),
          ('MENU_WORKFLOW', 'MENU_WORKFLOW_HISTORY', ARRAY['V']::text[]),
          ('MENU_WORKFLOW', 'MENU_WORKFLOW_NOTIFY', ARRAY['V','E']::text[]),
          ('MENU_WORKFLOW', 'MENU_WORKFLOW_CONFIG', ARRAY['V','C','E','D']::text[]),
          ('MENU_WORKFLOW', 'MENU_WORKFLOW_RULES', ARRAY['V','C','E','D']::text[]),
          ('MENU_WORKFLOW', 'MENU_WORKFLOW_FORM', ARRAY['V','C','E']::text[]),
          ('MENU_WORKFLOW', 'MENU_WORKFLOW_METRICS', ARRAY['V','X']::text[]),
          ('MENU_MASTER', 'MENU_MASTER_DATA', ARRAY['V','C','E','X']::text[]),
          ('MENU_MASTER', 'MENU_MD_PRODUCT', ARRAY['V','C','E','X']::text[]),
          ('MENU_MASTER', 'MENU_MD_GRADE', ARRAY['V','C','E','X']::text[]),
          ('MENU_MASTER', 'MENU_MD_PACKAGING', ARRAY['V','C','E','X']::text[]),
          ('MENU_MASTER', 'MENU_MD_SKU', ARRAY['V','C','E','X']::text[]),
          ('MENU_MASTER', 'MENU_MD_STORE', ARRAY['V','C','E','X']::text[]),
          ('MENU_SETTINGS_IT', 'MENU_SETTINGS_USER', ARRAY['V','C','E','D']::text[]),
          ('MENU_SETTINGS_IT', 'MENU_SETTINGS_ROLE', ARRAY['V','C','E','D']::text[]),
          ('MENU_SETTINGS_IT', 'MENU_SETTINGS_PERMISSION_SET', ARRAY['V','C','E','D']::text[]),
          ('MENU_SETTINGS_IT', 'MENU_SETTINGS_SECURITY', ARRAY['V','C','E','D']::text[]),
          ('MENU_SETTINGS_IT', 'MENU_SETTINGS_AUDIT', ARRAY['V','X']::text[]),
          ('MENU_SETTINGS_IT', 'MENU_SETTINGS_BRAND', ARRAY['V','E']::text[]),
          ('MENU_SETTINGS_IT', 'MENU_SETTINGS_TERMINAL', ARRAY['V','C','E','D']::text[]),
          ('MENU_SETTINGS_IT', 'MENU_SETTINGS_POS', ARRAY['V','C','E','D']::text[]),
          ('MENU_SETTINGS_IT', 'MENU_SETTINGS_STOCK', ARRAY['V','C','E','D']::text[]),
          ('MENU_SETTINGS_IT', 'MENU_SETTINGS_NOTIFY', ARRAY['V','C','E','D']::text[])
      ),
      target_grants AS (
        SELECT r.role_code, mapping.source_menu, p.perm_codes, mapping.allowed_codes
        FROM sys_role_menu_permission p
        JOIN sys_role r ON r.role_id = p.role_id
        JOIN sys_menu m ON m.menu_id = p.menu_id
        JOIN mapping ON mapping.target_menu = m.menu_code
        WHERE r.role_code <> 'ROLE_ADMIN'
      ),
      desired AS (
        SELECT
          role_code,
          source_menu,
          string_agg(code, ',' ORDER BY array_position(ARRAY['V','C','E','D','A','X']::text[], code)) AS perm_codes
        FROM target_grants
        CROSS JOIN LATERAL unnest(string_to_array(target_grants.perm_codes, ',')) AS target_code(code)
        WHERE code = ANY(target_grants.allowed_codes)
        GROUP BY role_code, source_menu
      )
      INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
      SELECT r.role_id, m.menu_id, desired.perm_codes
      FROM desired
      JOIN sys_role r ON r.role_code = desired.role_code
      JOIN sys_menu m ON m.menu_code = desired.source_menu
      WHERE desired.perm_codes IS NOT NULL AND desired.perm_codes <> ''
      ON CONFLICT (role_id, menu_id) DO UPDATE SET
        perm_codes = EXCLUDED.perm_codes
    `);
  }
}
