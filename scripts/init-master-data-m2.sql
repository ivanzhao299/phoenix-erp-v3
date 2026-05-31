-- ============================================================
-- Phoenix ERP V3 — Master Data Initialization Phase M2
-- 正式用户角色矩阵 V3 + 主数据初始化（幂等导入）
--
-- 原则：
--   · 全程幂等，可重复执行；ON CONFLICT DO NOTHING / WHERE NOT EXISTS
--   · 不覆盖已有正式数据（既有用户/客户/司机不被改写）
--   · 新用户密码用 pgcrypto 随机生成（管理员后续在「用户管理」重置）
--   · 数据源：docs/user-role-matrix-v3.md + data/master-data-m2/*.csv
-- 用法：psql -d <db> -f scripts/init-master-data-m2.sql
-- ============================================================

BEGIN;

-- 批量初始化期间关闭 perms_version 触发器，避免踢出在线用户
SET LOCAL phx.skip_perms_bump = 'on';

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── § 1. 补建缺失角色：ROLE_CASH（出纳）────────────────────────────────────────
INSERT INTO sys_role (role_code, role_name_zh, role_name_lo, role_type, approval_level)
VALUES ('ROLE_CASH', '出纳', 'ພະນັກງານເງິນສົດ', 'FINANCE', 1)
ON CONFLICT (role_code) DO NOTHING;

-- ── § 2. 新建用户（仅新增；已存在用户名跳过，不改密码/姓名）────────────────────
--   随机 bcrypt 密码，管理员后续重置。store_code 取其所属场区/集团。
INSERT INTO sys_user (username, password_hash, real_name, store_code, locale, status)
VALUES
  ('songlei',   crypt(gen_random_uuid()::text, gen_salt('bf', 10)), '宋雷',   'SITE-MENGSAI-LAYER',  'zh-CN', 1),
  ('xiejiling', crypt(gen_random_uuid()::text, gen_salt('bf', 10)), '谢继领', 'SITE-MENGSAI-LAYER',  'zh-CN', 1),
  ('liujie',    crypt(gen_random_uuid()::text, gen_salt('bf', 10)), '刘杰',   'ALL',                 'zh-CN', 1)
ON CONFLICT (username) DO NOTHING;

-- ── § 3. 用户-角色绑定（主角色 is_primary=TRUE，附加角色 FALSE；幂等）──────────
INSERT INTO sys_user_role (user_id, role_id, is_primary)
SELECT u.user_id, r.role_id, b.is_primary
FROM (VALUES
  -- (username, role_code, is_primary)
  ('zhaoyongwei', 'ROLE_ADMIN',        TRUE),
  ('zhaoyongwei', 'ROLE_CEO',          FALSE),
  ('zhuzhaocun',  'ROLE_CEO',          TRUE),
  ('zhuzhaocun',  'ROLE_BU_AGRI_GM',   FALSE),
  ('songlei',     'ROLE_PRC_BUYER',    TRUE),
  ('songlei',     'ROLE_FIN_AR',       FALSE),
  ('fuqiang',     'ROLE_FACTORY_MGR',  TRUE),
  ('fuqiang',     'ROLE_SALES_MGR',    FALSE),
  ('xiejiling',   'ROLE_FARM_MGR',     TRUE),
  ('xiejiling',   'ROLE_VET',          FALSE),
  ('liujie',      'ROLE_HQ_FINANCE',   TRUE),
  ('liujie',      'ROLE_FIN_ACCT',     FALSE),
  ('wangweihua',  'ROLE_FIN_ACCT',     TRUE),
  ('zhuzhao_an',  'ROLE_CASH',         TRUE),
  ('liushanjun',  'ROLE_WMS_MGR',      TRUE),
  ('ajian',       'ROLE_DRIVER',       TRUE)
) AS b(username, role_code, is_primary)
JOIN sys_user u ON u.username = b.username
JOIN sys_role r ON r.role_code = b.role_code
WHERE NOT EXISTS (
  SELECT 1 FROM sys_user_role ur WHERE ur.user_id = u.user_id AND ur.role_id = r.role_id
);

-- ── § 3b. 主角色唯一化（V3 矩阵为权威）：将矩阵用户主角色置为唯一 is_primary ───────
--   既有数据可能已有不同的主角色，V3 以本矩阵为准收敛（幂等）。
UPDATE sys_user_role ur
SET is_primary = (r.role_code = m.primary_role)
FROM sys_user u, sys_role r,
  (VALUES
    ('zhaoyongwei','ROLE_ADMIN'),      ('zhuzhaocun','ROLE_CEO'),
    ('songlei','ROLE_PRC_BUYER'),      ('fuqiang','ROLE_FACTORY_MGR'),
    ('xiejiling','ROLE_FARM_MGR'),     ('liujie','ROLE_HQ_FINANCE'),
    ('wangweihua','ROLE_FIN_ACCT'),    ('zhuzhao_an','ROLE_CASH'),
    ('liushanjun','ROLE_WMS_MGR'),     ('ajian','ROLE_DRIVER')
  ) AS m(username, primary_role)
WHERE ur.user_id = u.user_id AND ur.role_id = r.role_id AND u.username = m.username;

-- ── § 4. 用户-组织绑定 sys_user_orgs（DataScope；幂等）──────────────────────────
INSERT INTO sys_user_orgs (user_id, org_id, org_code, data_scope_level, is_primary)
SELECT u.user_id, o.id, o.org_code, b.scope, TRUE
FROM (VALUES
  ('zhaoyongwei', 'ORG-GROUP',           'GROUP'),
  ('zhuzhaocun',  'BU-AGRI',             'BU'),
  ('songlei',     'SITE-MENGSAI-LAYER',  'SITE'),
  ('fuqiang',     'SITE-DONGPENG-LAYER', 'SITE'),
  ('xiejiling',   'SITE-MENGSAI-LAYER',  'SITE'),
  ('liujie',      'ORG-GROUP',           'GROUP'),
  ('wangweihua',  'ORG-GROUP',           'GROUP'),
  ('zhuzhao_an',  'ORG-GROUP',           'GROUP'),
  ('liushanjun',  'ORG-GROUP',           'GROUP'),
  ('ajian',       'SITE-VTE-SLAUGHTER',  'SITE')
) AS b(username, org_code, scope)
JOIN sys_user u          ON u.username  = b.username
JOIN sys_organizations o ON o.org_code  = b.org_code
WHERE NOT EXISTS (
  SELECT 1 FROM sys_user_orgs uo WHERE uo.user_id = u.user_id AND uo.org_id = o.id
);

-- ── § 5. 司机档案 sal_drivers（暂不开账号；site 写入 remark，因表无 site_code）──
INSERT INTO sal_drivers (driver_code, driver_name, company_code, status, remark)
VALUES
  ('DRV-VTE-001', '阿坚', 'COMP-LAO-FOOD', 'ACTIVE', 'SITE-VTE-SLAUGHTER 配送发出地'),
  ('DRV-VTE-002', '阿喷', 'COMP-LAO-FOOD', 'ACTIVE', 'SITE-VTE-SLAUGHTER 配送发出地'),
  ('DRV-VTE-003', '阿哨', 'COMP-LAO-FOOD', 'ACTIVE', 'SITE-VTE-SLAUGHTER 配送发出地'),
  ('DRV-VTE-004', '阿通', 'COMP-LAO-FOOD', 'ACTIVE', 'SITE-VTE-SLAUGHTER 配送发出地'),
  ('DRV-VTE-005', '阿给', 'COMP-LAO-FOOD', 'ACTIVE', 'SITE-VTE-SLAUGHTER 配送发出地')
ON CONFLICT (driver_code) DO NOTHING;

-- ── § 6. 门店档案 mst_stores（表无 company_code，公司归属见矩阵；region 存地区）─
INSERT INTO mst_stores (store_code, store_name, region, status)
VALUES
  ('STORE-XC-001',  '特区直营店',     '金三角特区 / COMP-LAO-XINGCHI',   'ACTIVE'),
  ('STORE-DP-001',  '东鹏直营店',     '东鹏 / COMP-LAO-XINGCHI',         'ACTIVE'),
  ('STORE-HS-001',  '会晒直营店',     '会晒(博胶省) / COMP-LAO-XINGCHI', 'ACTIVE'),
  ('STORE-XB-001',  '沙耶武里直营店', '沙耶武里省 / COMP-LAO-AGRI',      'ACTIVE'),
  ('STORE-MX-001',  '孟赛直营店',     '孟赛(乌多姆赛省) / COMP-LAO-AGRI','ACTIVE'),
  ('STORE-VTE-001', '万象直营店',     '万象市 / COMP-LAO-FOOD',          'ACTIVE'),
  ('STORE-BKX-001', '波利坎赛直营店', '波利坎赛省 / COMP-LAO-FOOD',      'ACTIVE'),
  ('STORE-LPB-001', '拉邦直营店',     '琅勃拉邦省 / COMP-LAO-AGRI',      'ACTIVE')
ON CONFLICT (store_code) DO NOTHING;

-- ── § 7. 供应商档案 prc_suppliers（表无 supplier_type，类型见 CSV/报告）────────
INSERT INTO prc_suppliers (supplier_code, supplier_name, status)
VALUES
  ('SUP-HBAGD-001', '湖北艾格多', 'ACTIVE'),
  ('SUP-HDYK-001',  '华都峪口',   'ACTIVE'),
  ('SUP-HBYK-001',  '河北峪口',   'ACTIVE'),
  ('SUP-COFCO-001', '中粮',       'ACTIVE'),
  ('SUP-HNATM-001', '河南艾特米', 'ACTIVE'),
  ('SUP-LYZB-001',  '临沂众邦',   'ACTIVE')
ON CONFLICT (supplier_code) DO NOTHING;

-- ── § 8. 客户档案 sal_customers ────────────────────────────────────────────────
-- V2 名单未提供正式客户清单（见 customers-init.csv 模板 + 报告缺失清单）。
-- 既有 30 条真实客户保持不变；本期不写入占位客户，待业务补充真实数据后单独导入。

COMMIT;
