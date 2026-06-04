-- ════════════════════════════════════════════════════════════════════════════
-- UAT-P0 Phase 1 · 上线阻断项零散补丁
-- ════════════════════════════════════════════════════════════════════════════
-- 1. prc2_projects 补 effective_date / expire_date / remark（Runtime writableCols 需要）
-- 2. 显式回填 status='ACTIVE'（针对 grade/spec/driver/vehicle 已存在的旧行）
-- 3. （备用占位）若 sal_customers.status 为空回填 'ACTIVE'

ALTER TABLE prc2_projects
  ADD COLUMN IF NOT EXISTS effective_date DATE,
  ADD COLUMN IF NOT EXISTS expire_date    DATE,
  ADD COLUMN IF NOT EXISTS remark         TEXT;

UPDATE product_grades   SET status = 'ACTIVE' WHERE status IS NULL;
UPDATE packaging_specs  SET status = 'ACTIVE' WHERE status IS NULL;
UPDATE sal_drivers      SET status = 'ACTIVE' WHERE status IS NULL;
UPDATE sal_vehicles     SET status = 'ACTIVE' WHERE status IS NULL;
UPDATE prc2_projects    SET status = 'ACTIVE' WHERE status IS NULL;
UPDATE sal_customers    SET status = 'ACTIVE' WHERE status IS NULL;
UPDATE prc2_suppliers   SET status = 'ACTIVE' WHERE status IS NULL;
UPDATE product_master   SET status = 'ACTIVE' WHERE status IS NULL;
UPDATE fin_bank_accounts SET status = 'ACTIVE' WHERE status IS NULL;
UPDATE product_skus     SET status = 'ACTIVE' WHERE status IS NULL;
UPDATE mst_stores       SET status = 'ACTIVE' WHERE status IS NULL;
UPDATE fin_cash_accounts SET status = 'ACTIVE' WHERE status IS NULL;
UPDATE wms_warehouses   SET status = 'ACTIVE' WHERE status IS NULL;
UPDATE sys_organizations SET status = 'ACTIVE' WHERE status IS NULL;
UPDATE sys_dict         SET status = 'ACTIVE' WHERE status IS NULL;
