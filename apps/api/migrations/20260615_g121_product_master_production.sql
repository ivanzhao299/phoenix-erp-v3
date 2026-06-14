-- ════════════════════════════════════════════════════════════════════════
-- G121 产品主数据补生产侧 2026-06-15  ⚠️ 本地先跑·待审·后部署
-- ────────────────────────────────────────────────────────────────────────
-- 承接 G120，产品主数据除销售经理郭大鹏外，补生产/研发侧：
--   伏强（副总·生产/销售/新品研发）、薛刚（生产技术厂长）。
-- 叠加授权(is_primary=false)，受数据范围 + G92 审批约束。幂等。
-- ════════════════════════════════════════════════════════════════════════

INSERT INTO sys_user_role (user_id, role_id, is_primary, is_visible, granted_at)
SELECT u.user_id, r.role_id, false, true, NOW()
FROM (VALUES
  ('fuqiang','ROLE_PRODUCT_MASTER_MGR'),
  ('xuegang','ROLE_PRODUCT_MASTER_MGR')
) AS a(username, role_code)
JOIN sys_user u ON u.username = a.username
JOIN sys_role r ON r.role_code = a.role_code
ON CONFLICT (user_id, role_id) DO NOTHING;

UPDATE sys_user SET perms_version = COALESCE(perms_version,0)+1, updated_at = NOW()
 WHERE username IN ('fuqiang','xuegang');
