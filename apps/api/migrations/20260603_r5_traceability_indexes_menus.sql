-- ════════════════════════════════════════════════════════════════════════
-- R5 · 统一追溯 Runtime — 索引 + 菜单权限
-- ────────────────────────────────────────────────────────────────────────
-- 依据：docs/production-runtime-rebuild-phase-r5-traceability-runtime.md
-- 目标：① 追溯查询索引（单批次追溯 < 500ms）；② 新增 MENU_TRACEABILITY_VIEW/EXPORT。
-- 全部幂等：CREATE INDEX IF NOT EXISTS / to_regclass / ON CONFLICT DO NOTHING
-- ════════════════════════════════════════════════════════════════════════

-- ① 追溯索引（部分 Phase 1/H4 已建，这里补齐缺失项）
DO $$
BEGIN
  IF to_regclass('public.inv_batches') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_inv_batches_pkg_ref2 ON inv_batches (packaging_batch_ref) WHERE packaging_batch_ref IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_inv_batches_collection_ref2 ON inv_batches (collection_batch_ref) WHERE collection_batch_ref IS NOT NULL;
  END IF;
  IF to_regclass('public.inv_ledger') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_inv_ledger_batch_trace ON inv_ledger (batch_no);
  END IF;
  IF to_regclass('public.pkg_packing_records') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_pkg_packing_prod_date ON pkg_packing_records (production_date);
  END IF;
  IF to_regclass('public.pkg_grading_records') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_pkg_grading_prod_date ON pkg_grading_records (production_date);
  END IF;
  IF to_regclass('public.pkg_source_batches') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_pkg_source_prod_date ON pkg_source_batches (production_date);
    CREATE INDEX IF NOT EXISTS idx_pkg_source_house ON pkg_source_batches (house_code);
  END IF;
  IF to_regclass('public.pkg_work_shifts') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_pkg_work_shifts_site ON pkg_work_shifts (site_id);
  END IF;
  IF to_regclass('public.sal_order_items') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_sal_order_items_alloc ON sal_order_items (allocated_batch_no) WHERE allocated_batch_no IS NOT NULL;
  END IF;
  IF to_regclass('public.sal_store_sale_items') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_sal_store_items_batch ON sal_store_sale_items (batch_no) WHERE batch_no IS NOT NULL;
  END IF;
  IF to_regclass('public.lbl_records') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_lbl_records_batch ON lbl_records (batch_no);
    CREATE INDEX IF NOT EXISTS idx_lbl_records_label ON lbl_records (label_no);
  END IF;
  IF to_regclass('public.fin_ar_invoices') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_fin_ar_source_no ON fin_ar_invoices (source_no);
  END IF;
END $$;

-- ② 菜单（sys_menu）
DO $$
BEGIN
  IF to_regclass('public.sys_menu') IS NOT NULL THEN
    INSERT INTO sys_menu (menu_code, menu_name_zh, menu_name_lo, domain, sort_order, icon, route) VALUES
      ('MENU_TRACEABILITY_VIEW',   '全链追溯',   'ການຕິດຕາມຍ້ອນກັບ', 'COMMON', 40, 'trace',  '/traceability'),
      ('MENU_TRACEABILITY_EXPORT', '追溯导出',   'ສົ່ງອອກການຕິດຕາມ', 'COMMON', 41, 'export', '/traceability')
    ON CONFLICT (menu_code) DO NOTHING;
  END IF;
END $$;

-- ③ 角色-菜单授权（sys_role_menu_permission，幂等；运行时门控以 rbac.matrix.ts 为准）
DO $$
BEGIN
  IF to_regclass('public.sys_role_menu_permission') IS NOT NULL THEN
    INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
    SELECT r.role_id, m.menu_id, v.perm_codes
    FROM (VALUES
      ('ROLE_ADMIN',       'MENU_TRACEABILITY_VIEW',   'V,C,E,D,A,X'),
      ('ROLE_CEO',         'MENU_TRACEABILITY_VIEW',   'V,X'),
      ('ROLE_FACTORY_MGR', 'MENU_TRACEABILITY_VIEW',   'V,X'),
      ('ROLE_WMS_MGR',     'MENU_TRACEABILITY_VIEW',   'V,X'),
      ('ROLE_QA_MGR',      'MENU_TRACEABILITY_VIEW',   'V,X'),
      ('ROLE_SALES_MGR',   'MENU_TRACEABILITY_VIEW',   'V,X'),
      ('ROLE_HQ_FINANCE',  'MENU_TRACEABILITY_VIEW',   'V,X'),
      ('ROLE_AUDITOR',     'MENU_TRACEABILITY_VIEW',   'V,X'),
      ('ROLE_ADMIN',       'MENU_TRACEABILITY_EXPORT', 'V,C,E,D,A,X'),
      ('ROLE_CEO',         'MENU_TRACEABILITY_EXPORT', 'V,X'),
      ('ROLE_FACTORY_MGR', 'MENU_TRACEABILITY_EXPORT', 'V,X'),
      ('ROLE_WMS_MGR',     'MENU_TRACEABILITY_EXPORT', 'V,X'),
      ('ROLE_HQ_FINANCE',  'MENU_TRACEABILITY_EXPORT', 'V,X')
    ) AS v(role_code, menu_code, perm_codes)
    JOIN sys_role r ON r.role_code = v.role_code
    JOIN sys_menu m ON m.menu_code = v.menu_code
    ON CONFLICT (role_id, menu_id) DO NOTHING;
  END IF;
END $$;
