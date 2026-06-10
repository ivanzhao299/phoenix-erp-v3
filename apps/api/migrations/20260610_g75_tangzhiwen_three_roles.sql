-- ════════════════════════════════════════════════════════════════════════
-- G75：唐治文(tangzhiwen) 三岗权限(出纳+发货员+质检员) + 绑定收紧到孟赛/凤凰农业
-- ════════════════════════════════════════════════════════════════════════
-- 背景：用户建了 tangzhiwen 但绑定过宽——store_code='ALL'(全局)+绑 ORG-GROUP(集团级)
--   +占位角色 ROLE_CASH，与"孟赛养殖场(凤凰农业 COMP-LAO-AGRI)"矛盾，会破坏 G71/G73 隔离。
-- 业务确认(用户)：唐治文 属 孟赛养殖场(SITE-MENGSAI-LAYER, id=18) / 凤凰农业(COMP-LAO-AGRI, id=15)。
-- 处理：① 绑定收紧到 AGRI+孟赛场(同宋明光) ② 建 3 原子功能角色+授权 ③ 绑给唐治文,去占位 ROLE_CASH。
-- 幂等：角色/授权 WHERE NOT EXISTS；用户相关 JOIN sys_user(用户不存在则 no-op,不报错)。
-- ════════════════════════════════════════════════════════════════════════

-- ① 绑定收紧：store_code ALL→孟赛场；org 改为 AGRI(公司)+孟赛场(SITE)
UPDATE sys_user SET store_code='SITE-MENGSAI-LAYER' WHERE username='tangzhiwen';

DELETE FROM sys_user_orgs WHERE user_id IN (SELECT user_id FROM sys_user WHERE username='tangzhiwen');

INSERT INTO sys_user_orgs (user_id, org_id, is_primary, data_scope_level, org_code)
SELECT u.user_id, v.oid, true, v.lvl, v.code
FROM sys_user u
JOIN (VALUES (15::bigint,'COMPANY','COMP-LAO-AGRI'),(18::bigint,'SITE','SITE-MENGSAI-LAYER')) AS v(oid,lvl,code) ON TRUE
WHERE u.username='tangzhiwen'
  AND NOT EXISTS (SELECT 1 FROM sys_user_orgs uo WHERE uo.user_id=u.user_id AND uo.org_id=v.oid);

-- ② 创建 3 原子功能角色
INSERT INTO sys_role (role_code, role_name_zh, role_type, description)
SELECT v.code, v.nm, v.tp, v.ds FROM (VALUES
  ('ROLE_FARM_CASHIER','养殖场出纳','FINANCE','公司现金收支'),
  ('ROLE_FARM_SHIPPER','养殖场发货员','LOGISTICS','根据订单备货装车'),
  ('ROLE_FARM_QC_INSPECTOR','养殖场质检员','QUALITY','鸡蛋重量质量包装控制')
) AS v(code,nm,tp,ds)
WHERE NOT EXISTS (SELECT 1 FROM sys_role r WHERE r.role_code=v.code);

-- ③ 授权菜单
-- 出纳：公司现金收支
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, v.pc FROM sys_role r
JOIN (VALUES ('MENU_DASHBOARD','V'),('MENU_FIN2','V'),('MENU_FIN2_CASH','V'),('MENU_FIN2_CASH_TXN','V,C,E'),
             ('MENU_FIN2_CASH_VIEW','V'),('MENU_MD_CASH_ACCOUNT','V'),('MENU_MD_BANK_ACCOUNT','V')) AS v(code,pc) ON TRUE
JOIN sys_menu m ON m.menu_code=v.code
WHERE r.role_code='ROLE_FARM_CASHIER'
  AND NOT EXISTS (SELECT 1 FROM sys_role_menu_permission p WHERE p.role_id=r.role_id AND p.menu_id=m.menu_id);

-- 发货员：备货装车配送
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, v.pc FROM sys_role r
JOIN (VALUES ('MENU_DASHBOARD','V'),('MENU_SALES2','V'),('MENU_SALES2_DELIVERY','V,E'),('MENU_MOBILE_DELIVERY','V'),
             ('MOBILE_DELIVERY','V'),('MENU_PACKAGING','V'),('MENU_PKG_OP','V,E'),('MENU_PKG_PACKAGING','V,E'),
             ('MENU_MD_PRODUCT','V'),('MENU_MD_GRADE','V'),('MENU_MD_SKU','V')) AS v(code,pc) ON TRUE
JOIN sys_menu m ON m.menu_code=v.code
WHERE r.role_code='ROLE_FARM_SHIPPER'
  AND NOT EXISTS (SELECT 1 FROM sys_role_menu_permission p WHERE p.role_id=r.role_id AND p.menu_id=m.menu_id);

-- 质检员：鸡蛋质检
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, v.pc FROM sys_role r
JOIN (VALUES ('MENU_DASHBOARD','V'),('MENU_PACKAGING','V'),('MENU_PKG_OP','V,E'),('MOBILE_QUALITY','V'),
             ('MENU_MD_QUALITY','V'),('MENU_MD_GRADE','V')) AS v(code,pc) ON TRUE
JOIN sys_menu m ON m.menu_code=v.code
WHERE r.role_code='ROLE_FARM_QC_INSPECTOR'
  AND NOT EXISTS (SELECT 1 FROM sys_role_menu_permission p WHERE p.role_id=r.role_id AND p.menu_id=m.menu_id);

-- ④ 绑 3 角色给唐治文 + 移除占位 ROLE_CASH
INSERT INTO sys_user_role (user_id, role_id, is_primary, granted_at, is_visible)
SELECT u.user_id, r.role_id, false, now(), true
FROM sys_user u
JOIN sys_role r ON r.role_code IN ('ROLE_FARM_CASHIER','ROLE_FARM_SHIPPER','ROLE_FARM_QC_INSPECTOR')
WHERE u.username='tangzhiwen'
  AND NOT EXISTS (SELECT 1 FROM sys_user_role ur WHERE ur.user_id=u.user_id AND ur.role_id=r.role_id);

DELETE FROM sys_user_role
WHERE user_id IN (SELECT user_id FROM sys_user WHERE username='tangzhiwen')
  AND role_id IN (SELECT role_id FROM sys_role WHERE role_code='ROLE_CASH');

-- ⑤ perms_version bump → 强制唐治文重登
UPDATE sys_user SET perms_version=COALESCE(perms_version,1)+1 WHERE username='tangzhiwen';
