-- ============================================================
-- Golden Phoenix · 生产初始化数据包  01 组织（Organizations）
-- 写入 GROUP / BU / COMPANY / SITE / DEPARTMENT 五级组织树
-- 目标表：sys_organizations（不写旧表）
-- 幂等：ON CONFLICT (org_code) DO NOTHING；不覆盖人工已修改数据
-- 可单独执行，亦可按 00→90 顺序执行
-- 用法：psql -d <db> -f 01-organizations.sql
-- ============================================================
BEGIN;
SET LOCAL phx.skip_perms_bump = 'on';  -- 批量初始化期间不触发踢人

-- ── L1 集团 ────────────────────────────────────────────────
INSERT INTO sys_organizations (org_code, org_name, org_name_cn, org_type, level, parent_code, path, status, sort_order)
VALUES ('ORG-GROUP','金凤凰控股集团','金凤凰控股集团','GROUP',1,NULL,'/ORG-GROUP/','ACTIVE',1)
ON CONFLICT (org_code) DO NOTHING;

-- ── L2 总部 + 事业群（BU）────────────────────────────────────
--   parent_id / path 由父节点 ORG-GROUP 解析（父已在本脚本前序插入）
INSERT INTO sys_organizations (org_code, org_name, org_name_cn, org_type, level, parent_id, parent_code, site_code, path, status, sort_order)
SELECT v.org_code, v.org_name, v.org_name, v.org_type, 2, p.id, p.org_code, v.site_code,
       p.path || v.org_code || '/', v.status, v.sort_order
FROM (VALUES
  ('ORG-HQ',      '金凤凰控股集团总部','DEPARTMENT','HQ','ACTIVE',  2),
  ('BU-AGRI',     '凤凰农业事业群',   'BU',        NULL,'ACTIVE', 10),
  ('BU-FOOD',     '凤凰食品事业群',   'BU',        NULL,'ACTIVE', 20),
  ('BU-TRADING',  '凤凰商贸事业群',   'BU',        NULL,'PLANNED',30),
  ('BU-SCM',      '凤凰供应链事业群', 'BU',        NULL,'PLANNED',40)
) AS v(org_code, org_name, org_type, site_code, status, sort_order)
JOIN sys_organizations p ON p.org_code = 'ORG-GROUP'
ON CONFLICT (org_code) DO NOTHING;

-- ── L3 公司（COMPANY，使用规范全称）────────────────────────────
INSERT INTO sys_organizations (org_code, org_name, org_name_cn, org_type, level, parent_id, parent_code, company_code, path, status, sort_order)
SELECT v.org_code, v.org_name, v.org_name, 'COMPANY', 3, p.id, p.org_code, v.org_code,
       p.path || v.org_code || '/', 'ACTIVE', 10
FROM (VALUES
  ('COMP-LAO-AGRI',    '老挝凤凰农业发展有限公司',   'BU-AGRI'),
  ('COMP-LAO-XINGCHI', '老挝金三角特区星驰养鸡场',   'BU-AGRI'),
  ('COMP-LAO-FOOD',    '老挝凤凰食品集团有限公司',   'BU-FOOD')
) AS v(org_code, org_name, parent_code)
JOIN sys_organizations p ON p.org_code = v.parent_code
ON CONFLICT (org_code) DO NOTHING;

-- ── L4 场区/工厂（SITE）─────────────────────────────────────────
--   规则：万象肉鸡养殖场 与 万象屠宰加工厂 = 同一公司 COMP-LAO-FOOD 下两个独立 SITE
--         孟赛有机肥生产厂 挂在 老挝凤凰农业发展有限公司 COMP-LAO-AGRI 下
INSERT INTO sys_organizations (org_code, org_name, org_name_cn, org_type, level, parent_id, parent_code, site_code, site_business_type, path, status, sort_order)
SELECT v.org_code, v.org_name, v.org_name, 'SITE', 4, p.id, p.org_code, v.org_code, v.biz_type,
       p.path || v.org_code || '/', v.status, 10
FROM (VALUES
  ('SITE-MENGSAI-LAYER',    '孟赛蛋鸡养殖场',   'COMP-LAO-AGRI',   'LAYER_FARM',          'ACTIVE'),
  ('SITE-MENGSAI-HATCHERY', '孟赛孵化场',       'COMP-LAO-AGRI',   'HATCHERY',            'PLANNED'),
  ('SITE-MENGSAI-ORGANIC',  '孟赛有机肥生产厂', 'COMP-LAO-AGRI',   'ORGANIC_FERTILIZER',  'PLANNED'),
  ('SITE-DONGPENG-LAYER',   '东鹏蛋鸡养殖场',   'COMP-LAO-XINGCHI','LAYER_FARM',          'ACTIVE'),
  ('SITE-VTE-BROILER',      '万象肉鸡养殖场',   'COMP-LAO-FOOD',   'BROILER_FARM',        'ACTIVE'),
  ('SITE-VTE-SLAUGHTER',    '万象屠宰加工厂',   'COMP-LAO-FOOD',   'SLAUGHTER',           'ACTIVE'),
  ('SITE-VTE-FEED',         '万象饲料厂',       'COMP-LAO-FOOD',   'FEED_MILL',           'PLANNED')
) AS v(org_code, org_name, parent_code, biz_type, status)
JOIN sys_organizations p ON p.org_code = v.parent_code
ON CONFLICT (org_code) DO NOTHING;

-- ── L5 部门（DEPARTMENT）：每个 SITE 自动生成 7 个标准部门 ─────────────
--   生产部/仓储部/销售部/财务部/质量部/设备部/行政部；部门状态继承 SITE 状态
INSERT INTO sys_organizations (org_code, org_name, org_name_cn, org_type, level, parent_id, parent_code, path, status, sort_order)
SELECT 'DEPT-'||s.org_code||'-'||d.suffix,
       s.org_name||'-'||d.dept_name, s.org_name||'-'||d.dept_name,
       'DEPARTMENT', 5, s.id, s.org_code,
       s.path||'DEPT-'||s.org_code||'-'||d.suffix||'/', s.status, d.ord
FROM sys_organizations s
CROSS JOIN (VALUES
  ('PROD','生产部',1), ('WAREHOUSE','仓储部',2), ('SALES','销售部',3),
  ('FINANCE','财务部',4), ('QUALITY','质量部',5), ('EQUIPMENT','设备部',6),
  ('ADMIN','行政部',7)
) AS d(suffix, dept_name, ord)
WHERE s.org_type = 'SITE'
  AND s.org_code IN ('SITE-MENGSAI-LAYER','SITE-MENGSAI-HATCHERY','SITE-MENGSAI-ORGANIC',
                     'SITE-DONGPENG-LAYER','SITE-VTE-BROILER','SITE-VTE-SLAUGHTER','SITE-VTE-FEED')
ON CONFLICT (org_code) DO NOTHING;

COMMIT;

-- 预期：GROUP×1 + BU×4 + COMPANY×3 + SITE×7 + DEPARTMENT×49(7场×7部) + ORG-HQ = 64 业务节点
-- 校验见 90-check-init-data.sql
