-- ════════════════════════════════════════════════════════════════════════
-- G120 主数据角色按岗位赋权 2026-06-15  ⚠️ 本地先跑·待审·后部署
-- ────────────────────────────────────────────────────────────────────────
-- 把 6 个主数据细分角色（G56-B 建，per-entity 分权）按岗位叠加给现有用户，
-- 各自仍受数据范围 + G92 关键字段审批双重约束。
-- 1. 修线：ROLE_FARM_MASTER_MGR 误挂超级码「主数据中心」→ 改挂「养殖主档管理」
--      （场站=养殖场，新建养殖场属公司级，归公司负责人，不给店长）。
-- 2. 管理员可调整：ROLE_ADMIN 显式补主数据超级码 MENU_MASTER_DATA '*'。
-- 3. 赋权（叠加，is_primary=false）：
--      供应商→采购 / 客户→销售+店长 / 产品→销售经理 / 仓储→仓储 /
--      资金账户→财务 / 养殖主档→公司负责人(农业=朱兆存,星驰=伏强,食品=薛刚)。
-- 幂等：role_code/menu_code/username 解析；ON CONFLICT / NOT EXISTS。
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. 修线：场站主数据 → 养殖主档管理 ──────────────────────────────────
DELETE FROM sys_role_menu_permission
 WHERE role_id = (SELECT role_id FROM sys_role WHERE role_code='ROLE_FARM_MASTER_MGR')
   AND menu_id = (SELECT menu_id FROM sys_menu WHERE menu_code='MENU_MASTER_DATA');

INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, 'V,C,E'
FROM sys_role r, sys_menu m
WHERE r.role_code='ROLE_FARM_MASTER_MGR' AND m.menu_code='MENU_FARM_MASTER'
  AND NOT EXISTS (SELECT 1 FROM sys_role_menu_permission x WHERE x.role_id=r.role_id AND x.menu_id=m.menu_id);

-- ── 2. 管理员显式持主数据超级码（可直接改全部主数据 + 调整赋权）───────────
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, '*'
FROM sys_role r, sys_menu m
WHERE r.role_code='ROLE_ADMIN' AND m.menu_code='MENU_MASTER_DATA'
  AND NOT EXISTS (SELECT 1 FROM sys_role_menu_permission x WHERE x.role_id=r.role_id AND x.menu_id=m.menu_id);

-- ── 3. 按岗位赋予主数据角色（叠加，不动现有主角色）──────────────────────
INSERT INTO sys_user_role (user_id, role_id, is_primary, is_visible, granted_at)
SELECT u.user_id, r.role_id, false, true, NOW()
FROM (VALUES
  -- 供应商主数据 → 采购岗
  ('wanglejin','ROLE_SUPPLIER_MASTER_MGR'),
  ('fanzhenhao','ROLE_SUPPLIER_MASTER_MGR'),
  ('qiantao','ROLE_SUPPLIER_MASTER_MGR'),
  -- 客户主数据 → 销售岗 + 店长
  ('guodapeng','ROLE_CUSTOMER_MASTER_MGR'),
  ('songmingguang','ROLE_CUSTOMER_MASTER_MGR'),
  ('chenyifei','ROLE_CUSTOMER_MASTER_MGR'),
  ('langshipei','ROLE_CUSTOMER_MASTER_MGR'),
  ('chenling','ROLE_CUSTOMER_MASTER_MGR'),
  ('alue','ROLE_CUSTOMER_MASTER_MGR'),
  ('bouavanh','ROLE_CUSTOMER_MASTER_MGR'),
  ('amei','ROLE_CUSTOMER_MASTER_MGR'),
  ('xiaolan','ROLE_CUSTOMER_MASTER_MGR'),
  -- 产品主数据 → 销售经理
  ('guodapeng','ROLE_PRODUCT_MASTER_MGR'),
  -- 仓储主数据 → 仓储岗
  ('xuefeng','ROLE_WAREHOUSE_MASTER_MGR'),
  ('songshoujiang','ROLE_WAREHOUSE_MASTER_MGR'),
  ('liushanjun','ROLE_WAREHOUSE_MASTER_MGR'),
  ('tangzhiwen','ROLE_WAREHOUSE_MASTER_MGR'),
  -- 资金账户主数据 → 财务岗
  ('liujie','ROLE_FIN_ACCOUNT_MASTER_MGR'),
  ('liuhantao','ROLE_FIN_ACCOUNT_MASTER_MGR'),
  ('zhuzhaoan','ROLE_FIN_ACCOUNT_MASTER_MGR'),
  -- 养殖主档(场站)主数据 → 公司负责人
  ('zhuzhaocun','ROLE_FARM_MASTER_MGR'),
  ('fuqiang','ROLE_FARM_MASTER_MGR'),
  ('xuegang','ROLE_FARM_MASTER_MGR')
) AS a(username, role_code)
JOIN sys_user u ON u.username = a.username
JOIN sys_role r ON r.role_code = a.role_code
ON CONFLICT (user_id, role_id) DO NOTHING;

-- ── 4. 受影响用户 perms_version+1 ───────────────────────────────────────
UPDATE sys_user SET perms_version = COALESCE(perms_version,0)+1, updated_at = NOW()
 WHERE username IN (
   'wanglejin','fanzhenhao','qiantao','guodapeng','songmingguang','chenyifei','langshipei',
   'chenling','alue','bouavanh','amei','xiaolan','xuefeng','songshoujiang','liushanjun',
   'tangzhiwen','liujie','liuhantao','zhuzhaoan','zhuzhaocun','fuqiang','xuegang'
 );
