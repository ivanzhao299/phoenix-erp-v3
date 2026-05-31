-- ============================================================
-- Sales V2 Phase 7 — Egg Inventory Runtime
-- 2026-05-27
-- ============================================================
-- 表增强：
--   inv_batches    — 新增鸡蛋时效字段
--   inv_ledger     — 新增鸡蛋变动字段
--   sal_order_items — 新增库存分配字段
-- RBAC：
--   MENU_SALES2_INVENTORY — 库存管理
-- ============================================================

-- ── 1. inv_batches 字段增强 ──────────────────────────────────
ALTER TABLE inv_batches
  ADD COLUMN IF NOT EXISTS company_code      VARCHAR(64)  DEFAULT 'ALL',
  ADD COLUMN IF NOT EXISTS egg_date          DATE         NULL,         -- 生产日期
  ADD COLUMN IF NOT EXISTS quality_grade     VARCHAR(16)  NULL,         -- AA/A/B/DIRTY/CRACKED/DAMAGED
  ADD COLUMN IF NOT EXISTS packaging_spec    VARCHAR(64)  NULL,         -- 包装规格
  ADD COLUMN IF NOT EXISTS source_type       VARCHAR(32)  NULL,         -- PRODUCTION/RETURN/ADJUSTMENT
  ADD COLUMN IF NOT EXISTS source_no         VARCHAR(64)  NULL;         -- 来源单号

-- 调整 status 列长度（原 VARCHAR(20)，扩展至 VARCHAR(32)）
ALTER TABLE inv_batches
  ALTER COLUMN status TYPE VARCHAR(32);

-- ── 2. inv_ledger 字段增强 ───────────────────────────────────
ALTER TABLE inv_ledger
  ADD COLUMN IF NOT EXISTS batch_expire_date DATE         NULL,         -- 批次到期日（记录历史）
  ADD COLUMN IF NOT EXISTS quality_grade     VARCHAR(16)  NULL,         -- 记录变动时的质量等级
  ADD COLUMN IF NOT EXISTS company_code      VARCHAR(64)  DEFAULT 'ALL';

-- ── 3. sal_order_items 字段增强 ──────────────────────────────
-- FIFO 分配结果记录
ALTER TABLE sal_order_items
  ADD COLUMN IF NOT EXISTS allocated_batch_no VARCHAR(128) NULL,  -- 分配的批次号（多批次逗号分隔）
  ADD COLUMN IF NOT EXISTS allocated_qty      NUMERIC(18,2) DEFAULT 0;

-- ── 4. 索引 ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_inv_batches_company    ON inv_batches(company_code);
CREATE INDEX IF NOT EXISTS idx_inv_batches_egg_date   ON inv_batches(egg_date);
CREATE INDEX IF NOT EXISTS idx_inv_batches_expire     ON inv_batches(expire_date);
CREATE INDEX IF NOT EXISTS idx_inv_batches_grade      ON inv_batches(quality_grade);
CREATE INDEX IF NOT EXISTS idx_inv_batches_status_exp ON inv_batches(status, expire_date);
CREATE INDEX IF NOT EXISTS idx_inv_ledger_company     ON inv_ledger(company_code);

-- ── 5. RBAC 种子 ─────────────────────────────────────────────
INSERT INTO sys_menu (menu_code, menu_name_zh, domain, parent_code, sort_order, route)
VALUES ('MENU_SALES2_INVENTORY', '库存管理', 'SALES', 'MENU_SALES2', 50, '/sales2/inventory')
ON CONFLICT (menu_code) DO NOTHING;

INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, p.perm_codes
FROM (VALUES
  ('ROLE_ADMIN', 'V,C,E,D,A,X'),
  ('ROLE_CEO', 'V,X'),
  ('ROLE_HQ_FINANCE', 'V,X'),
  ('ROLE_FIN_CFO', 'V,X'),
  ('ROLE_SALES_MGR', 'V,C,E,A,X'),
  ('ROLE_SALES_REP', 'V'),
  ('ROLE_REGION_MGR', 'V,X'),
  ('ROLE_AUDITOR', 'V,X'),
  ('ROLE_FARM_MGR', 'V,C,E')
) AS p(role_code, perm_codes)
JOIN sys_role r ON r.role_code = p.role_code
JOIN sys_menu m ON m.menu_code = 'MENU_SALES2_INVENTORY'
ON CONFLICT (role_id, menu_id) DO NOTHING;
