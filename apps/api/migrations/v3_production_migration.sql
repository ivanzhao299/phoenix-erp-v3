-- ═══════════════════════════════════════════════════════════════
--  Phoenix ERP V3 — 生产前 DB Schema 迁移脚本 v2
--  node -e 执行时无需 BEGIN/COMMIT，pg 驱动自动处理每条语句
--  若需事务：将每条 ALTER/INSERT 单独执行或去掉 BEGIN/COMMIT
-- ═══════════════════════════════════════════════════════════════

-- ── 1. prc_purchase_orders 补全所有必要字段（已有字段安全跳过）─────────────────
ALTER TABLE prc_purchase_orders
  ADD COLUMN IF NOT EXISTS supplier_code   VARCHAR(128),
  ADD COLUMN IF NOT EXISTS supplier_name   VARCHAR(256),
  ADD COLUMN IF NOT EXISTS subject         VARCHAR(256),
  ADD COLUMN IF NOT EXISTS total_amount    DECIMAL(18,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency_code   VARCHAR(8)    DEFAULT 'LAK',
  ADD COLUMN IF NOT EXISTS status          VARCHAR(32)   DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS plan_qty        INT           DEFAULT 0,
  ADD COLUMN IF NOT EXISTS received_qty    INT           DEFAULT 0,
  ADD COLUMN IF NOT EXISTS store_code      VARCHAR(32)   DEFAULT 'ALL',
  ADD COLUMN IF NOT EXISTS expected_date   DATE,
  ADD COLUMN IF NOT EXISTS remark          TEXT,
  ADD COLUMN IF NOT EXISTS created_by      BIGINT,
  ADD COLUMN IF NOT EXISTS approved_by     BIGINT,
  ADD COLUMN IF NOT EXISTS created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP;

-- ── 2. 迁移 biz_purchase_order 历史数据到 prc_purchase_orders ─────────────────
INSERT INTO prc_purchase_orders
  (po_no, supplier_code, total_amount, currency_code, status,
   plan_qty, received_qty, store_code, created_by, created_at, updated_at)
SELECT
  po_no, supplier_code, total_amount, currency_code, status,
  plan_qty, received_qty, store_code, created_by, created_at, updated_at
FROM biz_purchase_order
WHERE po_no NOT IN (SELECT po_no FROM prc_purchase_orders WHERE po_no IS NOT NULL)
ON CONFLICT DO NOTHING;

-- ── 3. fin_transactions 补全字段 ─────────────────────────────────────────────
ALTER TABLE fin_transactions
  ADD COLUMN IF NOT EXISTS due_date      DATE,
  ADD COLUMN IF NOT EXISTS account_code  VARCHAR(128),
  ADD COLUMN IF NOT EXISTS description   TEXT;

-- 对已有 AR/AP 记录默认设 due_date = created_at + 30天
UPDATE fin_transactions
SET due_date = (created_at::date + INTERVAL '30 days')::date
WHERE due_date IS NULL AND type IN ('AR', 'AP');

-- ── 4. brd_houses 补全 max_capacity ─────────────────────────────────────────
ALTER TABLE brd_houses
  ADD COLUMN IF NOT EXISTS max_capacity INT DEFAULT 50000;

-- ── 5. wms_inbound 补全三单比对字段 ─────────────────────────────────────────
ALTER TABLE wms_inbound
  ADD COLUMN IF NOT EXISTS source_po_no  VARCHAR(64),
  ADD COLUMN IF NOT EXISTS total_amount  DECIMAL(18,2) DEFAULT 0;

-- ── 6. inv_batches 补全 expire_date ─────────────────────────────────────────
ALTER TABLE inv_batches
  ADD COLUMN IF NOT EXISTS expire_date DATE;

-- ── 7. sys_user 密码字段 ─────────────────────────────────────────────────────
ALTER TABLE sys_user
  ADD COLUMN IF NOT EXISTS password_hash VARCHAR(256);

-- ── 8. 索引优化（幂等）────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fin_txn_type_status   ON fin_transactions(type, status);
CREATE INDEX IF NOT EXISTS idx_fin_txn_due_date      ON fin_transactions(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prc_po_supplier       ON prc_purchase_orders(supplier_code) WHERE supplier_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prc_po_status         ON prc_purchase_orders(status) WHERE status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_batches_expire    ON inv_batches(expire_date) WHERE expire_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wms_inbound_po        ON wms_inbound(source_po_no) WHERE source_po_no IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
--  验证查询（执行后手动运行确认）:
--  SELECT column_name FROM information_schema.columns
--  WHERE table_name IN ('prc_purchase_orders','fin_transactions','brd_houses')
--  ORDER BY table_name, ordinal_position;
-- ═══════════════════════════════════════════════════════════════
