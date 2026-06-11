-- ════════════════════════════════════════════════════════════════════════
-- G83 价格管理菜单权限自愈 — 修复销售角色打开「价格管理」报 MENU_PERMISSION_DENIED
-- ────────────────────────────────────────────────────────────────────────
-- 现象：admin（'*'）正常，但持有 MENU_SALES2_ORDER 的销售角色未授 MENU_SALES2_PRICE，
--       打开价格管理页 list 接口被 MenuGuard 拒（403 MENU_PERMISSION_DENIED）。
-- 修法：数据驱动 —— 凡持有 MENU_SALES2_ORDER（任意操作位）但缺 MENU_SALES2_PRICE 的角色，
--       补授 'V,C,E'（查看/新增/编辑；不含 D 删/A 审/X 导出，保守授权）。
-- ⚠️ 幂等：NOT EXISTS 防重复；只 INSERT 缺失项，绝不 UPDATE/DELETE 既有授权。
--    sys_role_menu_permission 列：role_id / menu_id / perm_codes
-- ════════════════════════════════════════════════════════════════════════

INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT o.role_id, mp.menu_id, 'V,C,E'
FROM sys_role_menu_permission o
JOIN sys_menu mo ON mo.menu_id = o.menu_id AND mo.menu_code = 'MENU_SALES2_ORDER'
CROSS JOIN sys_menu mp
WHERE mp.menu_code = 'MENU_SALES2_PRICE'
  AND NOT EXISTS (
    SELECT 1 FROM sys_role_menu_permission p
    WHERE p.role_id = o.role_id AND p.menu_id = mp.menu_id
  );

-- 注：若库内存在 perms_version 触发器，本次 INSERT 会自动 bump 受影响角色的版本，
--     用户下次请求（≤30s 缓存过期或重登）即生效，无需额外操作。
