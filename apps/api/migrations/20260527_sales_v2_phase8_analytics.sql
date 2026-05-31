-- ============================================================
-- Sales V2 Phase 8 — Analytics Runtime
-- 2026-05-27
-- ============================================================
-- 无新业务表（全部基于 Phase 0-7 已有表的只读聚合）
-- RBAC：
--   MENU_SALES2_REPORT — 经营分析报表
-- ============================================================

-- ── RBAC 种子 ─────────────────────────────────────────────────
INSERT INTO sys_menu (menu_code, menu_name_zh, domain, parent_code, sort_order, route)
VALUES ('MENU_SALES2_REPORT', '经营分析', 'SALES', 'MENU_SALES2', 60, '/sales2/report')
ON CONFLICT (menu_code) DO NOTHING;

INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, p.perm_codes
FROM (VALUES
  ('ROLE_ADMIN', 'V,X'),
  ('ROLE_CEO', 'V,X'),
  ('ROLE_HQ_FINANCE', 'V,X'),
  ('ROLE_FIN_CFO', 'V,X'),
  ('ROLE_SALES_MGR', 'V,X'),
  ('ROLE_SALES_REP', 'V'),
  ('ROLE_REGION_MGR', 'V,X'),
  ('ROLE_AUDITOR', 'V,X'),
  ('ROLE_FARM_MGR', 'V')
) AS p(role_code, perm_codes)
JOIN sys_role r ON r.role_code = p.role_code
JOIN sys_menu m ON m.menu_code = 'MENU_SALES2_REPORT'
ON CONFLICT (role_id, menu_id) DO NOTHING;
