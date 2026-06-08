-- ═════════════════════════════════════════════════════════════════════════════
-- G34-3 — 王玮华 MENU_FIN2_CASH:V,C 临时补权
-- ═════════════════════════════════════════════════════════════════════════════
-- UAT 发现 POST /api/v2/finance/cash/transactions/manual 返回 403
-- 根因：前后端权限粒度不一致（G20-2 A1 治理欠账延伸）
--   - 前端 page.tsx: usePermission('MENU_FIN2_CASH_TXN') → 子菜单
--   - 后端 fin-cash.controller.ts: const MENU='MENU_FIN2_CASH' → 父菜单
--   王玮华持 MENU_FIN2_CASH:V + MENU_FIN2_CASH_TXN:V,C，POST 走 MENU_FIN2_CASH:C 检查被拒
--
-- 应急修：给王玮华角色追加 MENU_FIN2_CASH:V,C 让 POST manual 通过
-- 长期治理（G35 欠账）：改 controller 按操作类型分子菜单
--   - 账户主档 ops → MENU_FIN2_CASH_MASTER
--   - 流水建/查/审 ops → MENU_FIN2_CASH_TXN / VIEW
-- 治理后回收本 mig 的父菜单 C 权限
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE sys_role_menu_permission
   SET perm_codes = 'V,C'
 WHERE role_id = (SELECT role_id FROM sys_role WHERE role_code='ROLE_MENGSAI_DONGPENG_TREASURER')
   AND menu_id = (SELECT menu_id FROM sys_menu WHERE menu_code='MENU_FIN2_CASH');

UPDATE sys_user
   SET perms_version = perms_version + 1, updated_at = now()
 WHERE username = 'wangweihua';

COMMIT;
