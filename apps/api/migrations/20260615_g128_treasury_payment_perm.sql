-- ════════════════════════════════════════════════════════════════════════
-- G128 资金经理(ROLE_TREASURY_MANAGER)授采购付款权 2026-06-15
--
-- 背景：用真实业务(万象总部装修款，股东代付)压测采购模块时发现——指定付款人刘汉涛
--   (ROLE_TREASURY_MANAGER 资金经理)**完全没有采购付款权限**，无法创建/执行付款单。
-- 语义：资金经理执行付款本就是其本职，授权对齐角色定义。成员=刘汉涛 + 朱召安(均资金/出纳岗)。
--   · MENU_PRC2:V          看采购供应中心
--   · MENU_PRC2_ORDER:V    看采购订单(选要付款的订单)
--   · MENU_PRC2_PAYMENT:V,C,E  看/建/执行付款单（V查看 C创建 E编辑+执行付款；不授 A，保持「建付款者≠批付款者」SoD）
-- 幂等：ON CONFLICT 重跑安全；角色/菜单缺失时空跑。
-- ════════════════════════════════════════════════════════════════════════
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, v.perms
FROM sys_role r
CROSS JOIN (VALUES
  ('MENU_PRC2',         'V'),
  ('MENU_PRC2_ORDER',   'V'),
  ('MENU_PRC2_PAYMENT', 'V,C,E')
) AS v(menu_code, perms)
JOIN sys_menu m ON m.menu_code = v.menu_code
WHERE r.role_code = 'ROLE_TREASURY_MANAGER'
ON CONFLICT (role_id, menu_id) DO UPDATE SET perm_codes = EXCLUDED.perm_codes;

-- 触发权限版本递增，使新付款权 30s 内在其会话生效
UPDATE sys_user SET perms_version = COALESCE(perms_version, 0) + 1
WHERE user_id IN (
  SELECT ur.user_id FROM sys_user_role ur
  JOIN sys_role r ON r.role_id = ur.role_id
  WHERE r.role_code = 'ROLE_TREASURY_MANAGER'
);
