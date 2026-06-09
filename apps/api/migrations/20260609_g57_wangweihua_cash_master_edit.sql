-- ════════════════════════════════════════════════════════════════════════
-- G57 — 授权王玮华自助修正资金账户初始数据
--
-- 背景：王玮华(出纳)反映导入的初始数据有错(期初余额错、流水挂错账户)却改不了。
-- 已新增 期初余额编辑 / 余额重算 / 流水改挂账户 能力，统一 MENU_FIN2_CASH_MASTER:E 门控。
-- 本迁移给他授该编辑权，使其能自助修正。
--
-- 安全性：ROLE_MENGSAI_DONGPENG_TREASURER 为王玮华独享角色(仅 wangweihua 绑定)，
--         授权不会外溢给其他用户。仅授 E(编辑/冻结/重算/改挂)，不授 C(不能新建账户)。
--
-- 幂等：INSERT ... NOT EXISTS；若已有行但缺 E 则合并补 E。
-- 生效：bump perms_version 触发旧 token 失效，下次登录即生效，无需 reload。
-- ════════════════════════════════════════════════════════════════════════
BEGIN;

-- A. 该 (role,menu) 尚无行 → 插入 'E'
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, 'E'
  FROM sys_role r, sys_menu m
 WHERE r.role_code = 'ROLE_MENGSAI_DONGPENG_TREASURER'
   AND m.menu_code = 'MENU_FIN2_CASH_MASTER'
   AND NOT EXISTS (
     SELECT 1 FROM sys_role_menu_permission x
      WHERE x.role_id = r.role_id AND x.menu_id = m.menu_id
   );

-- B. 已有行但缺 E → 合并补 E（防止覆盖既有权限码；按 V,C,E,D,A,X 去重排序）
UPDATE sys_role_menu_permission p
   SET perm_codes = (
     SELECT string_agg(c, ',' ORDER BY array_position(ARRAY['V','C','E','D','A','X'], c))
       FROM (
         SELECT DISTINCT c
           FROM unnest(string_to_array(p.perm_codes, ',') || ARRAY['E']) AS t(c)
          WHERE c <> ''
       ) s
   )
 WHERE p.role_id = (SELECT role_id FROM sys_role WHERE role_code = 'ROLE_MENGSAI_DONGPENG_TREASURER')
   AND p.menu_id = (SELECT menu_id FROM sys_menu WHERE menu_code = 'MENU_FIN2_CASH_MASTER')
   AND p.perm_codes <> '*'
   AND position('E' in p.perm_codes) = 0;

-- C. 触发 token 失效，下次登录即生效
UPDATE sys_user
   SET perms_version = perms_version + 1,
       updated_at = now()
 WHERE username = 'wangweihua';

COMMIT;
