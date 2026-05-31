-- ============================================================
-- Golden Phoenix · 生产初始化数据包  07 客户（Customers）
-- 目标表：sal_customers（禁止写 ord_customers / b2b_customers）
-- 原则：
--   · 客户不建系统账号
--   · customer_no 唯一；幂等 ON CONFLICT (customer_no) DO NOTHING
--   · 电话缺失不阻断，remark 标注 DATA_INCOMPLETE
--   · customer_type ∈ DISTRIBUTOR / RETAIL / CORPORATE / INDIVIDUAL / LOGISTICS / OTHER
--
-- ⚠ 数据现状：名单.xlsx 未提供正式客户清单，本批次「不写入任何占位客户」，
--   既有真实客户保持不变。待业务交付真实客户名录后，按下方模板单独批次导入。
-- ============================================================
BEGIN;

-- ── 正式客户导入模板（取消注释并填入真实数据后执行）──────────────────────
-- INSERT INTO sal_customers
--   (customer_no, customer_name, customer_type, contact_name, contact_phone,
--    region_code, company_code, status, risk_level, remark)
-- VALUES
--   ('CUS-DIST-0001','<经销商名>','DISTRIBUTOR','<联系人>','<电话>','<地区>','<公司编码>','ACTIVE','LOW',
--      NULL),  -- 电话缺失时 remark 写 'DATA_INCOMPLETE: phone'
--   ('CUS-CORP-0001','<企业客户名>','CORPORATE',NULL,NULL,'<地区>','<公司编码>','ACTIVE','LOW',
--      'DATA_INCOMPLETE: contact,phone'),
--   ('CUS-RTL-0001','<零售客户名>','RETAIL',NULL,NULL,'<地区>','<公司编码>','ACTIVE','LOW',NULL),
--   ('CUS-LOG-0001','<物流客户名>','LOGISTICS',NULL,NULL,'<地区>','<公司编码>','ACTIVE','LOW',NULL)
-- ON CONFLICT (customer_no) DO NOTHING;
-- ──────────────────────────────────────────────────────────────────────────

COMMIT;

-- ── 重复客户名称诊断（导入真实数据后应复核）──────────────────────────────
\echo '── 重复客户名称（应为 0 行）──'
SELECT customer_name, count(*) AS 重复数
FROM sal_customers GROUP BY customer_name HAVING count(*) > 1;
-- 校验见 90-check-init-data.sql
