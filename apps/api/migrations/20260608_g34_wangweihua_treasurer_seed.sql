-- ═════════════════════════════════════════════════════════════════════════════
-- G34 · 王玮华专属角色 + 组织收紧 + 账户主档 seed
-- ═════════════════════════════════════════════════════════════════════════════
-- 业务背景：
--   王玮华负责"老挝凤凰农业（COMP-LAO-AGRI）的孟赛蛋鸡场（SITE-MENGSAI-LAYER）"
--   + "老挝东鹏星驰养鸡场（COMP-LAO-XINGCHI）的东鹏蛋鸡场（SITE-DONGPENG-LAYER）"
--   2 个公司、2 个 SITE 的资金流水（出纳）。不负责万象食品厂（COMP-LAO-FOOD）。
--
-- 当前问题（DB 实测发现）：
--   现有 wangweihua 持 sys_user_orgs：
--     ORG-GROUP / DEPT-FIN-TREASURY / ORG-HQ 三行 data_scope_level='GROUP'
--     → DataScope service isGlobal=true → 看全集团（包括万象食品）
--   持 2 个旧角色：ROLE_FIN_ACCT + ROLE_TREASURY_MANAGER（财务全局角色）
--   store_code='ALL'（旧 admin 习惯）
--
-- 本 mig 收紧（参照 GLP-1A-2 宋明光收紧模式）：
--   A. 清除 GROUP 级 sys_user_orgs（3 行）
--   B. 解除旧 2 角色绑定
--   C. 新建 ROLE_MENGSAI_DONGPENG_TREASURER（孟赛+东鹏 蛋鸡场出纳）
--   D. 绑新角色 is_primary=true
--   E. 补 sys_user_orgs：COMP-LAO-XINGCHI(COMPANY) + SITE-DONGPENG-LAYER(SITE)
--      （已有 COMP-LAO-AGRI + SITE-MENGSAI-LAYER 保留）
--   F. 配 perm_codes（仿宋明光 fin_cash 精简版）：
--        MENU_DASHBOARD:V / MENU_FIN2:V / MENU_FIN2_CASH:V
--        MENU_FIN2_CASH_VIEW:V / MENU_FIN2_CASH_TXN:V,C
--        MENU_MASTER_DATA:V / MENU_WORKFLOW:V
--      明确不持 MENU_FIN2_CASH_MASTER（账户建档归管理员）
--   G. store_code='ALL' → 'SITE-MENGSAI-LAYER'（主 SITE）
--   H. perms_version += 1 触发 token 失效
--   I. seed 13 个 fin_cash_accounts 主档（凤凰 10 + 星驰 3）
--      其中"宋总个人"账户改名"宋雷"（账户编码不变以便业务方对照）
--      opening_balance 暂置 0，后续 ETL 流水时随首笔 balance_after 反推
--
-- 幂等性：所有 INSERT 都 NOT EXISTS 守卫；DELETE 用 WHERE NOT IN 收敛。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── A. 清除 GROUP 级 sys_user_orgs ─────────────────────────────────────────
DELETE FROM sys_user_orgs
 WHERE user_id = (SELECT user_id FROM sys_user WHERE username='wangweihua')
   AND data_scope_level = 'GROUP';

-- ─── B. 解除旧角色绑定 ROLE_FIN_ACCT + ROLE_TREASURY_MANAGER ────────────────
DELETE FROM sys_user_role
 WHERE user_id = (SELECT user_id FROM sys_user WHERE username='wangweihua')
   AND role_id IN (SELECT role_id FROM sys_role WHERE role_code IN ('ROLE_FIN_ACCT','ROLE_TREASURY_MANAGER'));

-- ─── C. 新建 ROLE_MENGSAI_DONGPENG_TREASURER ───────────────────────────────
INSERT INTO sys_role (role_code, role_name_zh, role_name_lo, role_type, approval_level, description)
SELECT 'ROLE_MENGSAI_DONGPENG_TREASURER',
       '孟赛/东鹏蛋鸡场 出纳',
       'Cashier — Mengsai/Dongpeng Layer Farms',
       'FINANCE', 10,
       '专属出纳：负责老挝凤凰农业(COMP-LAO-AGRI)的孟赛蛋鸡场 + 东鹏星驰(COMP-LAO-XINGCHI)的东鹏蛋鸡场的资金日记账登记。不持 fin_cash MASTER（账户建档）权限。'
 WHERE NOT EXISTS (SELECT 1 FROM sys_role WHERE role_code='ROLE_MENGSAI_DONGPENG_TREASURER');

-- ─── D. 绑定新角色 ─────────────────────────────────────────────────────────
INSERT INTO sys_user_role (user_id, role_id, is_primary, granted_at)
SELECT u.user_id, r.role_id, true, now()
  FROM sys_user u, sys_role r
 WHERE u.username='wangweihua' AND r.role_code='ROLE_MENGSAI_DONGPENG_TREASURER'
   AND NOT EXISTS (
     SELECT 1 FROM sys_user_role x
      WHERE x.user_id=u.user_id AND x.role_id=r.role_id
   );

-- ─── E. 补充 sys_user_orgs：东鹏星驰公司 + 东鹏 SITE ────────────────────────
INSERT INTO sys_user_orgs (user_id, org_id, org_code, is_primary, data_scope_level, role_scope, created_at)
SELECT u.user_id, o.id, 'COMP-LAO-XINGCHI', false, 'COMPANY', 'COMPANY', now()
  FROM sys_user u, sys_organizations o
 WHERE u.username='wangweihua' AND o.org_code='COMP-LAO-XINGCHI'
   AND NOT EXISTS (
     SELECT 1 FROM sys_user_orgs uo
      WHERE uo.user_id=u.user_id AND uo.org_code='COMP-LAO-XINGCHI'
   );

INSERT INTO sys_user_orgs (user_id, org_id, org_code, is_primary, data_scope_level, role_scope, created_at)
SELECT u.user_id, o.id, 'SITE-DONGPENG-LAYER', false, 'SITE', 'SITE', now()
  FROM sys_user u, sys_organizations o
 WHERE u.username='wangweihua' AND o.org_code='SITE-DONGPENG-LAYER'
   AND NOT EXISTS (
     SELECT 1 FROM sys_user_orgs uo
      WHERE uo.user_id=u.user_id AND uo.org_code='SITE-DONGPENG-LAYER'
   );

-- 把 COMP-LAO-AGRI 设为 primary（替代已被删的 ORG-GROUP primary）
UPDATE sys_user_orgs SET is_primary=true
 WHERE user_id=(SELECT user_id FROM sys_user WHERE username='wangweihua')
   AND org_code='COMP-LAO-AGRI'
   AND NOT EXISTS (
     SELECT 1 FROM sys_user_orgs x
      WHERE x.user_id=(SELECT user_id FROM sys_user WHERE username='wangweihua')
        AND x.is_primary=true
   );

-- ─── F. perm_codes 配置 ───────────────────────────────────────────────────
-- F.1) 大盘 + 财务 V2 主模块 + 资金账户主模块 → 查看权
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, 'V'
  FROM sys_role r, sys_menu m
 WHERE r.role_code='ROLE_MENGSAI_DONGPENG_TREASURER'
   AND m.menu_code IN ('MENU_DASHBOARD','MENU_FIN2','MENU_FIN2_CASH','MENU_FIN2_CASH_VIEW','MENU_MASTER_DATA','MENU_WORKFLOW')
   AND NOT EXISTS (
     SELECT 1 FROM sys_role_menu_permission x
      WHERE x.role_id=r.role_id AND x.menu_id=m.menu_id
   );

-- F.2) 现金收付记账 → V,C（仅查看 + 新建流水，不可编辑/删除）
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, 'V,C'
  FROM sys_role r, sys_menu m
 WHERE r.role_code='ROLE_MENGSAI_DONGPENG_TREASURER'
   AND m.menu_code='MENU_FIN2_CASH_TXN'
   AND NOT EXISTS (
     SELECT 1 FROM sys_role_menu_permission x
      WHERE x.role_id=r.role_id AND x.menu_id=m.menu_id
   );

-- ─── G. store_code 收紧 + locale 保留 ──────────────────────────────────────
UPDATE sys_user
   SET store_code='SITE-MENGSAI-LAYER',
       perms_version=perms_version+1,
       updated_at=now()
 WHERE username='wangweihua';

-- ─── I. fin_cash_accounts 主档 seed（13 个）─────────────────────────────────
-- 命名约定：WWH-<公司>-<行/卡>-<币种>（WWH=王玮华业务范围标记，便于业务方对照）
-- 凤凰公司（COMP-LAO-AGRI）10 个：
INSERT INTO fin_cash_accounts (account_code, account_name, currency_code, company_code, account_type, opening_balance, current_balance, status, remark, created_at, updated_at)
SELECT * FROM (VALUES
  ('WWH-FH-PAB-CNY',     '平安银行88888卡',     'CNY', 'COMP-LAO-AGRI', 'BANK',    0.00, 0.00, 'ACTIVE', '凤凰公司 国内备用金账户', now(), now()),
  ('WWH-FH-CASH-CNY',    '现金-人民币',         'CNY', 'COMP-LAO-AGRI', 'CASH',    0.00, 0.00, 'ACTIVE', '凤凰公司 现金（CNY）',     now(), now()),
  ('WWH-FH-CASH-LAK',    '现金-老挝币',         'LAK', 'COMP-LAO-AGRI', 'CASH',    0.00, 0.00, 'ACTIVE', '凤凰公司 现金（LAK）',     now(), now()),
  ('WWH-FH-SL-LDB-LAK',  '宋雷-LDB老挝币户',    'LAK', 'COMP-LAO-AGRI', 'PERSONAL_AGENT', 0.00, 0.00, 'ACTIVE', '代收代付：宋雷个人 LDB 老挝币户（原"宋总个人"）', now(), now()),
  ('WWH-FH-SL-BCEL-LAK', '宋雷-BCEL老挝币户',   'LAK', 'COMP-LAO-AGRI', 'PERSONAL_AGENT', 0.00, 0.00, 'ACTIVE', '代收代付：宋雷个人 BCEL 老挝币户',         now(), now()),
  ('WWH-FH-SL-BCEL-CNY', '宋雷-BCEL人民币户',   'CNY', 'COMP-LAO-AGRI', 'PERSONAL_AGENT', 0.00, 0.00, 'ACTIVE', '代收代付：宋雷个人 BCEL 人民币户',         now(), now()),
  ('WWH-FH-BCEL-LAK',    'BCEL老挝公户-老挝币', 'LAK', 'COMP-LAO-AGRI', 'BANK',    0.00, 0.00, 'ACTIVE', '凤凰 BCEL 公户（LAK）',  now(), now()),
  ('WWH-FH-BCEL-CNY',    'BCEL老挝公户-人民币', 'CNY', 'COMP-LAO-AGRI', 'BANK',    0.00, 0.00, 'ACTIVE', '凤凰 BCEL 公户（CNY）',  now(), now()),
  ('WWH-FH-BCEL-THB',    'BCEL老挝公户-泰铢',   'THB', 'COMP-LAO-AGRI', 'BANK',    0.00, 0.00, 'ACTIVE', '凤凰 BCEL 公户（THB）',  now(), now()),
  ('WWH-FH-BCEL-USD',    'BCEL老挝公户-美元',   'USD', 'COMP-LAO-AGRI', 'BANK',    0.00, 0.00, 'ACTIVE', '凤凰 BCEL 公户（USD）',  now(), now()),
  ('WWH-FH-LDB-LAK',     'LDB老挝公户-老挝币',  'LAK', 'COMP-LAO-AGRI', 'BANK',    0.00, 0.00, 'ACTIVE', '凤凰 LDB 公户（LAK）',   now(), now()),
  ('WWH-FH-LDB-CNY',     'LDB老挝公户-人民币',  'CNY', 'COMP-LAO-AGRI', 'BANK',    0.00, 0.00, 'ACTIVE', '凤凰 LDB 公户（CNY）',   now(), now()),
  ('WWH-FH-LDB-THB',     'LDB老挝公户-泰铢',    'THB', 'COMP-LAO-AGRI', 'BANK',    0.00, 0.00, 'ACTIVE', '凤凰 LDB 公户（THB）',   now(), now()),
  ('WWH-FH-LDB-USD',     'LDB老挝公户-美元',    'USD', 'COMP-LAO-AGRI', 'BANK',    0.00, 0.00, 'ACTIVE', '凤凰 LDB 公户（USD）',   now(), now()),
  -- 星驰公司（COMP-LAO-XINGCHI）3 个：
  ('WWH-XC-CASH-CNY',    '现金（人民币）',      'CNY', 'COMP-LAO-XINGCHI', 'CASH', 0.00, 0.00, 'ACTIVE', '星驰公司 现金（CNY）',  now(), now()),
  ('WWH-XC-LDB-LAK',     'LDB户-老挝币',        'LAK', 'COMP-LAO-XINGCHI', 'BANK', 0.00, 0.00, 'ACTIVE', '星驰公司 LDB 户（LAK）',now(), now()),
  ('WWH-XC-BCEL-LAK',    'BCEL户-老挝币',       'LAK', 'COMP-LAO-XINGCHI', 'BANK', 0.00, 0.00, 'ACTIVE', '星驰公司 BCEL 户（LAK）',now(), now())
) AS v(account_code, account_name, currency_code, company_code, account_type, opening_balance, current_balance, status, remark, created_at, updated_at)
WHERE NOT EXISTS (
  SELECT 1 FROM fin_cash_accounts a WHERE a.account_code=v.account_code
);

COMMIT;
