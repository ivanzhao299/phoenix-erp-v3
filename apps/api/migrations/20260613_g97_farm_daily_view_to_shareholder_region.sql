-- ════════════════════════════════════════════════════════════════════════
-- G97 养殖每日数据查看授权 — 股东 + 区域督导可看场长每日死淘/产蛋/存栏（2026-06-13 今日开放）
-- ────────────────────────────────────────────────────────────────────────
-- 背景：养殖场长每日录入（死淘/产蛋/存栏日报）已可用（ROLE_FARM_MGR 持 MENU_FARM_DAILY:E）。
--   今日开放「查看每日数据」给：
--     · 股东 ROLE_SHAREHOLDER_VIEW —— 此前 farm 菜单权一个都没有 → 授 MENU_FARM_DATA:V + MENU_FARM_DAILY:V
--     · 区域督导 ROLE_REGION_MGR  —— 已有 MENU_FARM_DAILY:V，补 MENU_FARM_DATA:V（存栏日报/趋势）
--   （CEO 等高层已在各 read 列表内，无需补。）
-- 后端门：daily-hen-report / trend = MENU_FARM_DATA:V（farm.controller 类默认）；
--         daily-logs 读 / eggs-breakdown = MENU_FARM_DAILY:V。
-- 幂等：WHERE NOT EXISTS（已有该 role×menu 行则跳过，不覆盖既有 perm_codes）。
-- ⚠️ 数据范围：股东用户须在 sys_user_orgs 绑定其公司，方能看到该公司每日数据；
--    CEO / 全局角色不受 DataScope 限制。此迁移只开「能不能进门」，看到哪些数据由绑定决定。
-- ════════════════════════════════════════════════════════════════════════

INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, 'V'
FROM (VALUES
  ('ROLE_SHAREHOLDER_VIEW', 'MENU_FARM_DATA'),
  ('ROLE_SHAREHOLDER_VIEW', 'MENU_FARM_DAILY'),
  ('ROLE_REGION_MGR',       'MENU_FARM_DATA')
) AS v(role_code, menu_code)
JOIN sys_role r ON r.role_code = v.role_code
JOIN sys_menu m ON m.menu_code = v.menu_code
WHERE NOT EXISTS (
  SELECT 1 FROM sys_role_menu_permission p WHERE p.role_id = r.role_id AND p.menu_id = m.menu_id
);
