-- ============================================================
-- Sales V2 Phase 8 — Analytics Runtime
-- 2026-05-27
-- ============================================================
-- 无新业务表（全部基于 Phase 0-7 已有表的只读聚合）
-- RBAC：
--   MENU_SALES2_REPORT — 经营分析报表
-- ============================================================

-- ── RBAC 种子 ─────────────────────────────────────────────────
INSERT INTO sys_menu (code, name, parent_code, sort_order, is_active, created_at, updated_at)
VALUES ('MENU_SALES2_REPORT', '经营分析', 'MENU_SALES2', 60, true, now(), now())
ON CONFLICT (code) DO NOTHING;

INSERT INTO sys_role_menu_permission (role_code, menu_code, perm_codes, created_at, updated_at)
VALUES
  ('ROLE_ADMIN',      'MENU_SALES2_REPORT', ARRAY['V','X'],     now(), now()),
  ('ROLE_CEO',        'MENU_SALES2_REPORT', ARRAY['V','X'],     now(), now()),
  ('ROLE_HQ_FINANCE', 'MENU_SALES2_REPORT', ARRAY['V','X'],     now(), now()),
  ('ROLE_FIN_CFO',    'MENU_SALES2_REPORT', ARRAY['V','X'],     now(), now()),
  ('ROLE_SALES_MGR',  'MENU_SALES2_REPORT', ARRAY['V','X'],     now(), now()),
  ('ROLE_SALES_REP',  'MENU_SALES2_REPORT', ARRAY['V'],         now(), now()),
  ('ROLE_REGION_MGR', 'MENU_SALES2_REPORT', ARRAY['V','X'],     now(), now()),
  ('ROLE_AUDITOR',    'MENU_SALES2_REPORT', ARRAY['V','X'],     now(), now()),
  ('ROLE_FARM_MGR',   'MENU_SALES2_REPORT', ARRAY['V'],         now(), now())
ON CONFLICT (role_code, menu_code) DO NOTHING;
