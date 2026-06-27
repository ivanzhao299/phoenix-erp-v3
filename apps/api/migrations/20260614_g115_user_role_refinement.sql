-- ════════════════════════════════════════════════════════════════════════
-- G115 用户角色细化（Stage 6）2026-06-14  ⚠️ 本地先跑·待审·后部署
-- ────────────────────────────────────────────────────────────────────────
-- 承接 G114 组织归属，按终审勾选表重配 32 在岗用户角色（见 docs/g115-*.md）。
-- 1. 角色重配 sys_user_role：每人「全删旧角色 + 按终审重插」，首个=主角色。
--      按 username / role_code 解析；本地缺账号 JOIN 自动跳过；幂等。
--      （trg_bump_perms_user_role 触发器会自动 bump perms_version，无需手动。）
-- 2. 归属同步调整 sys_user_orgs（修正 G114 三处）：
--      林宏 → 东鹏场(原误置孟赛)、伏强 → 东鹏场(原星驰公司级)、阿玉 → 万象直营店(原待定)。
-- 注：两件需代码、不在本迁移——① 股东只读权益视图(宋雷/陈逸飞/薛刚) ② 王乐金采购审批权。
-- ════════════════════════════════════════════════════════════════════════

-- ── 1a. 删除将被重配用户的旧角色（32 人）──────────────────────────────────
DELETE FROM sys_user_role
 WHERE user_id IN (SELECT user_id FROM sys_user WHERE username IN (
   'admin','zhaoyongwei','zhuzhaocun','gaoyang','liujie','liuhantao','wanglejin','fanzhenhao',
   'guodapeng','qiantao','xuefeng','tangzhiwen','songmingguang','songlei','wangweihua',
   'songshoujiang','xiejiling','chenling','alue','bouavanh','zhuzhaoan','chenyifei','fuqiang',
   'linhong','liushanjun','zhuhuiran','amei','langshipei','xiaolan','xuegang','ajian','cashier'
 ));

-- ── 1b. 按终审重插（VALUES: username, role_code, is_primary）首个=主角色 ──────
INSERT INTO sys_user_role (user_id, role_id, is_primary, is_visible, granted_at)
SELECT u.user_id, r.role_id, a.is_primary, true, NOW()
FROM (VALUES
  ('admin','ROLE_ADMIN',true),('admin','ROLE_MASTER_DATA_APPROVER',false),
  ('zhaoyongwei','ROLE_ADMIN',true),('zhaoyongwei','ROLE_CEO',false),('zhaoyongwei','ROLE_REGION_MGR',false),
  ('zhuzhaocun','ROLE_BU_AGRI_GM',true),('zhuzhaocun','ROLE_CEO',false),
  ('gaoyang','ROLE_FIN_ACCT',true),
  ('liujie','ROLE_FINANCE_REVIEW_MANAGER',true),('liujie','ROLE_FIN_CFO',false),('liujie','ROLE_HQ_FINANCE',false),('liujie','ROLE_FIN_ACCT',false),('liujie','ROLE_FINANCE_ANALYST',false),
  ('liuhantao','ROLE_HQ_FINANCE',true),('liuhantao','ROLE_FIN_COST',false),('liuhantao','ROLE_TREASURY_MANAGER',false),('liuhantao','ROLE_COST_ACCOUNTING_MANAGER',false),('liuhantao','ROLE_FINANCE_ANALYST',false),
  ('wanglejin','ROLE_PRC_BUYER',true),
  ('fanzhenhao','ROLE_PRC_BUYER',true),
  ('guodapeng','ROLE_SALES_MGR',true),
  ('qiantao','ROLE_PRC_BUYER',true),
  ('xuefeng','ROLE_WMS_MGR',true),('xuefeng','ROLE_LINE_SUPERVISOR',false),
  ('tangzhiwen','ROLE_FARM_CASHIER',true),('tangzhiwen','ROLE_FARM_QC_INSPECTOR',false),('tangzhiwen','ROLE_WMS_OP',false),
  ('songmingguang','ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR',true),('songmingguang','ROLE_SALES_REP',false),('songmingguang','ROLE_FIN_ACCT',false),
  ('songlei','ROLE_FACTORY_MGR',true),
  ('wangweihua','ROLE_MENGSAI_DONGPENG_TREASURER',true),
  ('songshoujiang','ROLE_WMS_MGR',true),
  ('xiejiling','ROLE_FARM_MGR',true),('xiejiling','ROLE_VET',false),
  ('chenling','ROLE_STORE_MGR',true),
  ('alue','ROLE_STORE_MGR',true),
  ('bouavanh','ROLE_STORE_MGR',true),
  ('zhuzhaoan','ROLE_FIN_ACCT',true),('zhuzhaoan','ROLE_TREASURY_MANAGER',false),('zhuzhaoan','ROLE_CASH',false),
  ('chenyifei','ROLE_SALES_REP',true),
  ('fuqiang','ROLE_FACTORY_MGR',true),
  ('linhong','ROLE_FARM_MGR',true),('linhong','ROLE_VET',false),
  ('liushanjun','ROLE_WMS_MGR',true),('liushanjun','ROLE_FARMER',false),
  ('zhuhuiran','ROLE_FARM_SHIPPER',true),
  ('amei','ROLE_STORE_MGR',true),('amei','ROLE_CASHIER',false),
  ('langshipei','ROLE_SALES_REP',true),
  ('xiaolan','ROLE_STORE_MGR',true),
  ('xuegang','ROLE_FACTORY_MGR',true),
  ('ajian','ROLE_DRIVER',true),
  ('cashier','ROLE_CASHIER',true)
) AS a(username, role_code, is_primary)
JOIN sys_user u ON u.username = a.username
JOIN sys_role r ON r.role_code = a.role_code;

-- ── 2. 归属同步调整（修正 G114 三处）──────────────────────────────────────
-- 删旧绑定
DELETE FROM sys_user_orgs
 WHERE user_id IN (SELECT user_id FROM sys_user WHERE username IN ('linhong','fuqiang','cashier'));
-- 重插：林宏/伏强→东鹏场(SITE)、阿玉→万象直营店(STORE)
INSERT INTO sys_user_orgs (user_id, org_id, org_code, is_primary, data_scope_level)
SELECT u.user_id, o.id, o.org_code, true, a.scope
FROM (VALUES
  ('linhong', 'SITE-DONGPENG-LAYER', 'SITE'),
  ('fuqiang', 'SITE-DONGPENG-LAYER', 'SITE'),
  ('cashier', 'STORE-VTE-001',       'STORE')
) AS a(username, org_code, scope)
JOIN sys_user u           ON u.username = a.username
JOIN sys_organizations o  ON o.org_code = a.org_code AND o.status = 'ACTIVE';
