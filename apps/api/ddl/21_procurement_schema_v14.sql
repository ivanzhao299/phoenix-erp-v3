-- ═══════════════════════════════════════════════════════════════
-- Phoenix ERP V3 — DDL 21: 采购申请表字段补全 (v14)
-- 幂等：所有 ALTER 使用 IF NOT EXISTS；表不存在时跳过
-- ═══════════════════════════════════════════════════════════════

-- 1. 序列（合同编号）
CREATE SEQUENCE IF NOT EXISTS prc_contract_no_seq START 1;

-- 2. prc_purchase_requests — 补全业务字段（表存在时才执行）
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'prc_purchase_requests'
  ) THEN
    ALTER TABLE prc_purchase_requests
      ADD COLUMN IF NOT EXISTS item          VARCHAR(256),
      ADD COLUMN IF NOT EXISTS qty           VARCHAR(64),
      ADD COLUMN IF NOT EXISTS urgency       VARCHAR(20)  DEFAULT 'NORMAL',
      ADD COLUMN IF NOT EXISTS budget_amount DECIMAL(18,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS currency_code VARCHAR(10)  DEFAULT 'LAK',
      ADD COLUMN IF NOT EXISTS expected_date DATE,
      ADD COLUMN IF NOT EXISTS reason        TEXT,
      ADD COLUMN IF NOT EXISTS category      VARCHAR(50)  DEFAULT 'OTHER',
      ADD COLUMN IF NOT EXISTS applicant     VARCHAR(100),
      ADD COLUMN IF NOT EXISTS po_no         VARCHAR(64),
      ADD COLUMN IF NOT EXISTS reject_note   TEXT,
      ADD COLUMN IF NOT EXISTS approved_by   VARCHAR(100),
      ADD COLUMN IF NOT EXISTS approved_at   TIMESTAMP,
      ADD COLUMN IF NOT EXISTS store_code    VARCHAR(50),
      ADD COLUMN IF NOT EXISTS requester_id  INT,
      ADD COLUMN IF NOT EXISTS reviewer_name VARCHAR(100);
  END IF;
END$$;

-- 3. prc_purchase_orders — 补全合同/审批人字段（表存在时才执行）
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'prc_purchase_orders'
  ) THEN
    ALTER TABLE prc_purchase_orders
      ADD COLUMN IF NOT EXISTS contract_no   VARCHAR(128),
      ADD COLUMN IF NOT EXISTS contract_note TEXT,
      ADD COLUMN IF NOT EXISTS pay_deadline  DATE,
      ADD COLUMN IF NOT EXISTS contract_url  TEXT,
      ADD COLUMN IF NOT EXISTS approver_id   INTEGER,
      ADD COLUMN IF NOT EXISTS approver_name VARCHAR(64);
  END IF;
END$$;

-- 4. 索引（幂等，表存在时才建）
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='prc_purchase_requests') THEN
    CREATE INDEX IF NOT EXISTS idx_prc_req_store_code ON prc_purchase_requests (store_code) WHERE store_code IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_prc_req_status      ON prc_purchase_requests (status);
    CREATE INDEX IF NOT EXISTS idx_prc_req_po_no       ON prc_purchase_requests (po_no) WHERE po_no IS NOT NULL;
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='prc_purchase_orders') THEN
    CREATE INDEX IF NOT EXISTS idx_prc_po_store_code ON prc_purchase_orders (store_code) WHERE store_code IS NOT NULL;
  END IF;
END$$;
