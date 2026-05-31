-- ═══════════════════════════════════════════════════════════════════════════════
--  Phoenix ERP V3 — 完整 Schema 补齐 DDL (v3_schema_complete.sql)
--
--  目标：让任何空库或 V2 残库一次性补齐至 V3 完整 schema，覆盖所有 UAT 用例。
--  原则：完全幂等 — 所有 CREATE TABLE IF NOT EXISTS、ALTER TABLE ADD COLUMN IF
--        NOT EXISTS、CREATE INDEX IF NOT EXISTS、DO $$ 包裹的逻辑分支。
--  执行：psql phoenix_erp -f apps/api/migrations/v3_schema_complete.sql
--  顺序：本文件优先于 run_full_v3.js 与 API onModuleInit 自动补丁。
-- ═══════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────────
-- A. 主数据 (mst_*)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mst_products (
  id              SERIAL PRIMARY KEY,
  product_code    VARCHAR(64) UNIQUE NOT NULL,
  product_name_zh VARCHAR(128),
  product_name_lo VARCHAR(128),
  category        VARCHAR(64),
  unit            VARCHAR(16) DEFAULT '个',
  price           DECIMAL(18,4) DEFAULT 0,
  status          VARCHAR(16) DEFAULT 'ACTIVE',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mst_stores (
  id              SERIAL PRIMARY KEY,
  store_code      VARCHAR(64) UNIQUE NOT NULL,
  store_name      VARCHAR(128),
  region          VARCHAR(64),
  manager         VARCHAR(64),
  status          VARCHAR(16) DEFAULT 'ACTIVE',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ───────────────────────────────────────────────────────────────────────────────
-- B. 库存核心 (inv_*)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inv_batches (
  id              SERIAL PRIMARY KEY,
  batch_no        VARCHAR(64) UNIQUE NOT NULL,
  product_code    VARCHAR(64),
  qty             INTEGER DEFAULT 0,
  qty_available   INTEGER DEFAULT 0,
  status          VARCHAR(20) DEFAULT 'AVAILABLE',
  warehouse_code  VARCHAR(64),
  location_code   VARCHAR(64),
  store_code      VARCHAR(64) DEFAULT 'ALL',
  expire_date     DATE,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE inv_batches ADD COLUMN IF NOT EXISTS qty_available INTEGER;
ALTER TABLE inv_batches ADD COLUMN IF NOT EXISTS status        VARCHAR(20) DEFAULT 'AVAILABLE';
ALTER TABLE inv_batches ADD COLUMN IF NOT EXISTS warehouse_code VARCHAR(64);
ALTER TABLE inv_batches ADD COLUMN IF NOT EXISTS location_code  VARCHAR(64);
ALTER TABLE inv_batches ADD COLUMN IF NOT EXISTS store_code     VARCHAR(64) DEFAULT 'ALL';
ALTER TABLE inv_batches ADD COLUMN IF NOT EXISTS expire_date    DATE;
ALTER TABLE inv_batches ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_inv_batches_product  ON inv_batches(product_code);
CREATE INDEX IF NOT EXISTS idx_inv_batches_status   ON inv_batches(status);
CREATE INDEX IF NOT EXISTS idx_inv_batches_wh       ON inv_batches(warehouse_code);

CREATE TABLE IF NOT EXISTS inv_ledger (
  id              SERIAL PRIMARY KEY,
  batch_no        VARCHAR(64),
  change_type     VARCHAR(32) NOT NULL,
  qty_change      INTEGER DEFAULT 0,
  operator        VARCHAR(64),
  store_code      VARCHAR(64) DEFAULT 'ALL',
  ref_no          VARCHAR(64),
  note            TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_inv_ledger_batch   ON inv_ledger(batch_no);
CREATE INDEX IF NOT EXISTS idx_inv_ledger_ref     ON inv_ledger(ref_no);
CREATE INDEX IF NOT EXISTS idx_inv_ledger_change  ON inv_ledger(change_type);

-- ───────────────────────────────────────────────────────────────────────────────
-- C. POS 销售 (pos_*)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pos_sales (
  id              SERIAL PRIMARY KEY,
  sale_no         VARCHAR(64) UNIQUE NOT NULL,
  store_code      VARCHAR(64),
  cashier         VARCHAR(64),
  member_phone    VARCHAR(32),
  member_id       VARCHAR(64),
  total_amount    DECIMAL(18,2) DEFAULT 0,
  discount_amount DECIMAL(18,2) DEFAULT 0,
  net_amount      DECIMAL(18,2) DEFAULT 0,
  paid_amount     DECIMAL(18,2) DEFAULT 0,
  payment_method  VARCHAR(32) DEFAULT 'CASH',
  pay_method      VARCHAR(32) DEFAULT 'CASH',
  status          VARCHAR(20) DEFAULT 'COMPLETED',
  session_no      VARCHAR(64),
  sale_type       VARCHAR(32) DEFAULT 'NORMAL',
  currency_code   VARCHAR(8)  DEFAULT 'LAK',
  note            TEXT,
  remark          TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS cashier        VARCHAR(64);
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS member_phone   VARCHAR(32);
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS net_amount     DECIMAL(18,2) DEFAULT 0;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS pay_method     VARCHAR(32) DEFAULT 'CASH';
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS session_no     VARCHAR(64);
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS sale_type      VARCHAR(32) DEFAULT 'NORMAL';
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS note           TEXT;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_pos_sales_store   ON pos_sales(store_code);
CREATE INDEX IF NOT EXISTS idx_pos_sales_session ON pos_sales(session_no);
CREATE INDEX IF NOT EXISTS idx_pos_sales_created ON pos_sales(created_at);

CREATE TABLE IF NOT EXISTS pos_sale_items (
  id              SERIAL PRIMARY KEY,
  sale_no         VARCHAR(64) NOT NULL,
  product_code    VARCHAR(64),
  product_name_zh VARCHAR(128),
  product_name_lo VARCHAR(128),
  batch_no        VARCHAR(64),
  qty             INTEGER DEFAULT 0,
  unit_price      DECIMAL(18,4) DEFAULT 0,
  subtotal        DECIMAL(18,2) DEFAULT 0,
  store_code      VARCHAR(64),
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pos_sale_items_sale ON pos_sale_items(sale_no);

CREATE TABLE IF NOT EXISTS pos_refunds (
  id              SERIAL PRIMARY KEY,
  refund_no       VARCHAR(64) UNIQUE NOT NULL,
  original_sale_no VARCHAR(64),
  store_code      VARCHAR(64),
  cashier         VARCHAR(64),
  refund_amount   DECIMAL(18,2) DEFAULT 0,
  refund_method   VARCHAR(32) DEFAULT 'CASH',
  reason          TEXT,
  status          VARCHAR(20) DEFAULT 'COMPLETED',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ───────────────────────────────────────────────────────────────────────────────
-- D. 门店日结 (daily_close + acc_ledger)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_close (
  id                   SERIAL PRIMARY KEY,
  close_no             VARCHAR(64) UNIQUE NOT NULL,
  store_code           VARCHAR(64) NOT NULL,
  close_date           DATE NOT NULL,
  operator             VARCHAR(64),
  total_sales          DECIMAL(18,2) DEFAULT 0,
  total_transactions   INTEGER DEFAULT 0,
  cash_sales           DECIMAL(18,2) DEFAULT 0,
  qr_sales             DECIMAL(18,2) DEFAULT 0,
  card_sales           DECIMAL(18,2) DEFAULT 0,
  discount_total       DECIMAL(18,2) DEFAULT 0,
  cash_actual          DECIMAL(18,2) DEFAULT 0,
  cash_diff            DECIMAL(18,2) DEFAULT 0,
  status               VARCHAR(20) DEFAULT 'DRAFT',
  note                 TEXT,
  submitted_at         TEXT,
  created_at           TEXT
);
ALTER TABLE daily_close ADD COLUMN IF NOT EXISTS total_transactions INTEGER DEFAULT 0;
ALTER TABLE daily_close ADD COLUMN IF NOT EXISTS qr_sales           DECIMAL(18,2) DEFAULT 0;
ALTER TABLE daily_close ADD COLUMN IF NOT EXISTS card_sales         DECIMAL(18,2) DEFAULT 0;
ALTER TABLE daily_close ADD COLUMN IF NOT EXISTS discount_total     DECIMAL(18,2) DEFAULT 0;
ALTER TABLE daily_close ADD COLUMN IF NOT EXISTS cash_actual        DECIMAL(18,2) DEFAULT 0;
ALTER TABLE daily_close ADD COLUMN IF NOT EXISTS cash_diff          DECIMAL(18,2) DEFAULT 0;
ALTER TABLE daily_close ADD COLUMN IF NOT EXISTS submitted_at       TEXT;
CREATE INDEX IF NOT EXISTS idx_daily_close_store_date ON daily_close(store_code, close_date);
CREATE INDEX IF NOT EXISTS idx_daily_close_close_no   ON daily_close(close_no);

CREATE TABLE IF NOT EXISTS acc_ledger (
  id              SERIAL PRIMARY KEY,
  store_code      VARCHAR(64),
  ref_no          VARCHAR(64),
  ledger_type     VARCHAR(32),
  amount          DECIMAL(18,2) DEFAULT 0,
  balance_after   DECIMAL(18,2) DEFAULT 0,
  note            TEXT,
  created_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_acc_ledger_ref   ON acc_ledger(ref_no);
CREATE INDEX IF NOT EXISTS idx_acc_ledger_type  ON acc_ledger(ledger_type);
CREATE INDEX IF NOT EXISTS idx_acc_ledger_store ON acc_ledger(store_code);

-- ───────────────────────────────────────────────────────────────────────────────
-- E. 财务 (fin_*)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fin_transactions (
  id              SERIAL PRIMARY KEY,
  txn_no          VARCHAR(64),
  transaction_no  VARCHAR(64),
  type            VARCHAR(16),
  account_code    VARCHAR(64),
  amount          DECIMAL(18,2) DEFAULT 0,
  currency_code   VARCHAR(8) DEFAULT 'LAK',
  status          VARCHAR(20) DEFAULT 'PENDING',
  ref_no          VARCHAR(64),
  store_code      VARCHAR(64),
  operator        VARCHAR(64),
  description     TEXT,
  note            TEXT,
  due_date        DATE,
  created_by      INTEGER,
  approved_by_mgr VARCHAR(64),
  approved_by_gm  VARCHAR(64),
  approved_by_ceo VARCHAR(64),
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS txn_no          VARCHAR(64);
ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS account_code    VARCHAR(64);
ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS ref_no          VARCHAR(64);
ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS store_code      VARCHAR(64);
ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS operator        VARCHAR(64);
ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS description     TEXT;
ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS note            TEXT;
ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS due_date        DATE;
ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS created_by      INTEGER;
ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS approved_by_mgr VARCHAR(64);
ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS approved_by_gm  VARCHAR(64);
ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS approved_by_ceo VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_fin_txn_ref     ON fin_transactions(ref_no);
CREATE INDEX IF NOT EXISTS idx_fin_txn_type    ON fin_transactions(type);
CREATE INDEX IF NOT EXISTS idx_fin_txn_status  ON fin_transactions(status);
CREATE INDEX IF NOT EXISTS idx_fin_txn_account ON fin_transactions(account_code);

CREATE TABLE IF NOT EXISTS fin_accounts (
  id              SERIAL PRIMARY KEY,
  account_code    VARCHAR(64) UNIQUE NOT NULL,
  account_name    VARCHAR(128),
  account_type    VARCHAR(32),
  currency_code   VARCHAR(8) DEFAULT 'LAK',
  balance         DECIMAL(18,2) DEFAULT 0,
  status          VARCHAR(16) DEFAULT 'ACTIVE',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fin_invoices (
  id              SERIAL PRIMARY KEY,
  invoice_no      VARCHAR(64) UNIQUE NOT NULL,
  direction       VARCHAR(8),      -- AP / AR
  po_no           VARCHAR(64),
  order_no        VARCHAR(64),
  supplier        VARCHAR(128),
  customer        VARCHAR(128),
  amount          DECIMAL(18,2) DEFAULT 0,
  paid_amount     DECIMAL(18,2) DEFAULT 0,
  due_date        DATE,
  status          VARCHAR(20) DEFAULT 'UNPAID',
  note            TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TEXT
);

CREATE TABLE IF NOT EXISTS fin_payments (
  id              SERIAL PRIMARY KEY,
  payment_no      VARCHAR(64) UNIQUE NOT NULL,
  invoice_no      VARCHAR(64),
  amount          DECIMAL(18,2) DEFAULT 0,
  method          VARCHAR(32),
  status          VARCHAR(20) DEFAULT 'COMPLETED',
  note            TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fin_approvals (
  id              SERIAL PRIMARY KEY,
  expense_no      VARCHAR(64),
  level           INTEGER,
  approver_id     INTEGER,
  status          VARCHAR(20),
  remark          TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ───────────────────────────────────────────────────────────────────────────────
-- F. 养殖日报 (brd_daily_logs)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brd_daily_logs (
  id              SERIAL PRIMARY KEY,
  log_no          VARCHAR(64),
  log_date        DATE NOT NULL,
  house_code      VARCHAR(64),
  flock_no        VARCHAR(64),
  shift           VARCHAR(20) DEFAULT '',
  eggs_produced   INTEGER DEFAULT 0,
  good_eggs       INTEGER DEFAULT 0,
  broken_eggs     INTEGER DEFAULT 0,
  mortality_qty   INTEGER DEFAULT 0,
  feed_qty        DECIMAL(18,2) DEFAULT 0,
  water_qty       DECIMAL(18,2) DEFAULT 0,
  temperature     DECIMAL(5,2),
  humidity        DECIMAL(5,2),
  operator        VARCHAR(64),
  note            TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS shift VARCHAR(20) DEFAULT '';
-- 修复（Phase C）：v3_schema 版本缺 farm_code（breeding 回归测试依赖），
-- 该表先于 generic-crud 建，导致 generic-crud 的完整版被 IF NOT EXISTS 跳过。
ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS farm_code  VARCHAR(64);
ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS farm_name  VARCHAR(256);
ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS store_code VARCHAR(64) DEFAULT 'ALL';
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'brd_daily_logs'::regclass
      AND conname = 'brd_daily_logs_date_house_shift_key'
  ) THEN
    BEGIN
      ALTER TABLE brd_daily_logs
        ADD CONSTRAINT brd_daily_logs_date_house_shift_key
        UNIQUE(log_date, house_code, shift);
    EXCEPTION WHEN duplicate_table OR unique_violation THEN NULL;
    END;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_brd_daily_logs_date  ON brd_daily_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_brd_daily_logs_house ON brd_daily_logs(house_code);

CREATE TABLE IF NOT EXISTS brd_medications (
  id              SERIAL PRIMARY KEY,
  med_no          VARCHAR(64),
  flock_no        VARCHAR(64),
  med_name        VARCHAR(128),
  dosage          VARCHAR(64),
  start_date      DATE,
  end_date        DATE,
  withdrawal_days INTEGER DEFAULT 0,
  operator        VARCHAR(64),
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- 修复（Phase C）：v3_schema 版本缺 medication_code/medication_name（breeding 回归依赖），
-- 该表先于 generic-crud 建，导致 generic-crud 完整版被 IF NOT EXISTS 跳过。
ALTER TABLE brd_medications ADD COLUMN IF NOT EXISTS medication_code VARCHAR(64);
ALTER TABLE brd_medications ADD COLUMN IF NOT EXISTS medication_name VARCHAR(256);
ALTER TABLE brd_medications ADD COLUMN IF NOT EXISTS status          VARCHAR(32) DEFAULT 'ACTIVE';
ALTER TABLE brd_medications ADD COLUMN IF NOT EXISTS store_code      VARCHAR(64) DEFAULT 'ALL';
ALTER TABLE brd_medications ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- ───────────────────────────────────────────────────────────────────────────────
-- G. 采购 (prc_*)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prc_purchase_orders (
  id               SERIAL PRIMARY KEY,
  po_no            VARCHAR(64) UNIQUE NOT NULL,
  supplier_code    VARCHAR(128),
  supplier_name    VARCHAR(256),
  subject          VARCHAR(256),
  total_amount     DECIMAL(18,2) DEFAULT 0,
  currency_code    VARCHAR(8) DEFAULT 'LAK',
  status           VARCHAR(32) DEFAULT 'DRAFT',
  plan_qty         INT DEFAULT 0,
  received_qty     INT DEFAULT 0,
  store_code       VARCHAR(64) DEFAULT 'ALL',
  expected_date    DATE,
  remark           TEXT,
  created_by       BIGINT,
  approved_by      BIGINT,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prc_purchase_items (
  id               SERIAL PRIMARY KEY,
  po_no            VARCHAR(64),
  product_code     VARCHAR(64),
  product_name     VARCHAR(128),
  qty              DECIMAL(18,3) DEFAULT 0,
  unit_price       DECIMAL(18,4) DEFAULT 0,
  line_amount      DECIMAL(18,2) DEFAULT 0,
  received_qty     DECIMAL(18,3) DEFAULT 0,
  status           VARCHAR(20) DEFAULT 'PENDING',
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prc_purchase_requests (
  id               SERIAL PRIMARY KEY,
  req_no           VARCHAR(64) UNIQUE NOT NULL,
  requester        VARCHAR(64),
  department       VARCHAR(64),
  subject          VARCHAR(256),
  status           VARCHAR(20) DEFAULT 'PENDING',
  total_amount     DECIMAL(18,2) DEFAULT 0,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prc_purchase_payments (
  id               SERIAL PRIMARY KEY,
  payment_no       VARCHAR(64) UNIQUE NOT NULL,
  po_no            VARCHAR(64),
  amount           DECIMAL(18,2) DEFAULT 0,
  method           VARCHAR(32),
  status           VARCHAR(20) DEFAULT 'COMPLETED',
  paid_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prc_returns (
  id               SERIAL PRIMARY KEY,
  return_no        VARCHAR(64) UNIQUE NOT NULL,
  po_no            VARCHAR(64),
  supplier_code    VARCHAR(64),
  amount           DECIMAL(18,2) DEFAULT 0,
  reason           TEXT,
  status           VARCHAR(20) DEFAULT 'PENDING',
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prc_price_items (
  id               SERIAL PRIMARY KEY,
  item_id          VARCHAR(64) UNIQUE NOT NULL,
  product_code     VARCHAR(64),
  customer_type    VARCHAR(32) DEFAULT 'RETAIL',
  retail_lower     DECIMAL(18,4) DEFAULT 0,
  retail_upper     DECIMAL(18,4) DEFAULT 0,
  base_price       DECIMAL(18,4) DEFAULT 0,
  effective_from   DATE,
  effective_to     DATE,
  status           VARCHAR(16) DEFAULT 'ACTIVE',
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ───────────────────────────────────────────────────────────────────────────────
-- H. 仓储 (wms_*) — 补缺
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wms_warehouses (
  id              SERIAL PRIMARY KEY,
  warehouse_code  VARCHAR(64) UNIQUE NOT NULL,
  warehouse_name  VARCHAR(128),
  store_code      VARCHAR(64) DEFAULT 'ALL',
  status          VARCHAR(16) DEFAULT 'ACTIVE',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wms_outbound_items (
  id              SERIAL PRIMARY KEY,
  task_no         VARCHAR(64),
  product_code    VARCHAR(64),
  batch_no        VARCHAR(64),
  qty             INTEGER DEFAULT 0,
  picked_qty      INTEGER DEFAULT 0,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wms_stocktake (
  id              SERIAL PRIMARY KEY,
  stocktake_no    VARCHAR(64) UNIQUE NOT NULL,
  warehouse_code  VARCHAR(64),
  status          VARCHAR(20) DEFAULT 'PENDING',
  operator        VARCHAR(64),
  diff_qty        INTEGER DEFAULT 0,
  diff_amount     DECIMAL(18,2) DEFAULT 0,
  approved_by     VARCHAR(64),
  approved_at     TIMESTAMP,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 缺：wms_outbound (run_full_v3.js 已有同步表，这里补字段)
-- 修复（Phase C）：全新数据库该表由运行时建，SQL 阶段尚不存在 → 先建最小骨架，
-- 字段由后续 ALTER ADD COLUMN IF NOT EXISTS 补全（幂等）。
CREATE TABLE IF NOT EXISTS wms_outbound (
  id           BIGSERIAL PRIMARY KEY,
  outbound_no  VARCHAR(64),
  status       VARCHAR(32) DEFAULT 'PENDING',
  created_at   TIMESTAMP DEFAULT now()
);
ALTER TABLE wms_outbound ADD COLUMN IF NOT EXISTS order_no VARCHAR(64);
ALTER TABLE wms_outbound ADD COLUMN IF NOT EXISTS operator VARCHAR(64);

-- ───────────────────────────────────────────────────────────────────────────────
-- I. 包装 (pkg_*)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pkg_shifts (
  id              SERIAL PRIMARY KEY,
  shift_no        VARCHAR(64) UNIQUE NOT NULL,
  house_code      VARCHAR(64),
  shift_type      VARCHAR(20) DEFAULT 'AM',
  shift_date      DATE,
  operator        VARCHAR(64),
  status          VARCHAR(20) DEFAULT 'PENDING',
  created_by      INTEGER,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pkg_tasks (
  id              SERIAL PRIMARY KEY,
  task_no         VARCHAR(64) UNIQUE NOT NULL,
  batch_no        VARCHAR(64),
  source_item     VARCHAR(255),
  plan_qty        INTEGER DEFAULT 0,
  packed_qty      INTEGER DEFAULT 0,
  good_qty        INTEGER DEFAULT 0,
  defective_qty   INTEGER DEFAULT 0,
  status          VARCHAR(20) DEFAULT 'PENDING',
  task_type       VARCHAR(32) DEFAULT 'GRADING',
  shift_id        INTEGER,
  house_code      VARCHAR(64),
  start_time      TIMESTAMP,
  end_time        TIMESTAMP,
  created_by      INTEGER,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pkg_tasks_batch ON pkg_tasks(batch_no);
CREATE INDEX IF NOT EXISTS idx_pkg_tasks_status ON pkg_tasks(status);

-- ───────────────────────────────────────────────────────────────────────────────
-- J. PDA 终端 (pda_*)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pda_terminals (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(128),
  brand           VARCHAR(64),
  model           VARCHAR(64),
  serial          VARCHAR(128),
  scan_protocol   VARCHAR(32),
  scan_prefix     VARCHAR(16),
  scan_suffix     VARCHAR(16),
  location        VARCHAR(128),
  enabled_modules TEXT,
  printer_ip      VARCHAR(64),
  notes           TEXT,
  app_version     VARCHAR(32),
  status          VARCHAR(16) DEFAULT 'pending',
  last_seen       TIMESTAMP,
  created_at      TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS pda_terminals_serial_uq ON pda_terminals(serial) WHERE serial IS NOT NULL AND serial <> '';

CREATE TABLE IF NOT EXISTS pda_sync_log (
  id              SERIAL PRIMARY KEY,
  op_id           VARCHAR(64),
  pda_id          INTEGER,
  task_no         VARCHAR(64),
  payload         TEXT,
  status          VARCHAR(20) DEFAULT 'PROCESSED',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pda_system_config (
  id              SERIAL PRIMARY KEY,
  config_key      VARCHAR(64) UNIQUE NOT NULL,
  config_value    TEXT,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pda_app_info (
  id              SERIAL PRIMARY KEY,
  version         VARCHAR(32),
  apk_url         VARCHAR(255),
  changelog       TEXT,
  force_upgrade   BOOLEAN DEFAULT false,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ───────────────────────────────────────────────────────────────────────────────
-- K. 标签 / 业务杂项
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lbl_records (
  id              SERIAL PRIMARY KEY,
  label_no        VARCHAR(64) UNIQUE NOT NULL,
  batch_no        VARCHAR(64),
  product_code    VARCHAR(64),
  qty             INTEGER DEFAULT 0,
  status          VARCHAR(20) DEFAULT 'PRINTED',
  printed_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cst_credit_warnings (
  id              SERIAL PRIMARY KEY,
  customer_code   VARCHAR(64),
  warning_type    VARCHAR(32),
  threshold       DECIMAL(18,2),
  current_value   DECIMAL(18,2),
  status          VARCHAR(20) DEFAULT 'OPEN',
  note            TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ───────────────────────────────────────────────────────────────────────────────
-- L. 订单 V3 列补齐 — ord_orders 已存在但缺 V3 字段
-- 修复（Phase C）：全新数据库这些 legacy 表由运行时建，SQL 阶段尚不存在 →
-- 先建最小骨架，字段由后续 ALTER 补全（幂等，生产环境表已存在则跳过）。
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ord_orders (
  id          BIGSERIAL PRIMARY KEY,
  order_no    VARCHAR(64),
  status      VARCHAR(32) DEFAULT 'DRAFT',
  created_at  TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ord_customers (
  id            BIGSERIAL PRIMARY KEY,
  customer_name VARCHAR(128),
  created_at    TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS b2b_customers (
  id            BIGSERIAL PRIMARY KEY,
  customer_name VARCHAR(128),
  created_at    TIMESTAMP DEFAULT now()
);
ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS store_code        VARCHAR(64) DEFAULT 'ALL';
ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS customer_id       BIGINT;
ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS order_type        VARCHAR(32) DEFAULT 'SALE';
ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS paid_amount       DECIMAL(18,2) DEFAULT 0;
ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS received_date     DATE;
ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS sales_rep_id      BIGINT;
ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS delivery_date     DATE;
ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS remark            TEXT;
ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS currency_code     VARCHAR(8) DEFAULT 'LAK';
ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS price_book_id     VARCHAR(64);
ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS need_price_approval BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_ord_orders_store      ON ord_orders(store_code);
CREATE INDEX IF NOT EXISTS idx_ord_orders_customer   ON ord_orders(customer_id);

ALTER TABLE ord_customers ADD COLUMN IF NOT EXISTS customer_code  VARCHAR(64);
ALTER TABLE ord_customers ADD COLUMN IF NOT EXISTS credit_limit   DECIMAL(18,2) DEFAULT 0;
ALTER TABLE ord_customers ADD COLUMN IF NOT EXISTS credit_used    DECIMAL(18,2) DEFAULT 0;
ALTER TABLE ord_customers ADD COLUMN IF NOT EXISTS blacklist      BOOLEAN DEFAULT false;
ALTER TABLE ord_customers ADD COLUMN IF NOT EXISTS customer_type  VARCHAR(32) DEFAULT 'RETAIL';
ALTER TABLE ord_customers ADD COLUMN IF NOT EXISTS phone          VARCHAR(32);
ALTER TABLE ord_customers ADD COLUMN IF NOT EXISTS address        TEXT;
ALTER TABLE ord_customers ADD COLUMN IF NOT EXISTS store_code     VARCHAR(64) DEFAULT 'ALL';

ALTER TABLE b2b_customers ADD COLUMN IF NOT EXISTS area_code  VARCHAR(32);
ALTER TABLE b2b_customers ADD COLUMN IF NOT EXISTS contact_name VARCHAR(64);
ALTER TABLE b2b_customers ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(32);
ALTER TABLE b2b_customers ADD COLUMN IF NOT EXISTS tax_no VARCHAR(64);
ALTER TABLE b2b_customers ADD COLUMN IF NOT EXISTS credit_days INT DEFAULT 30;
ALTER TABLE b2b_customers ADD COLUMN IF NOT EXISTS store_code VARCHAR(64) DEFAULT 'ALL';

-- ───────────────────────────────────────────────────────────────────────────────
-- M. 完整结束
-- ───────────────────────────────────────────────────────────────────────────────
-- 检查并报告
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name IN (
     'inv_batches','inv_ledger','pos_sales','pos_sale_items','pos_sessions','pos_refunds',
     'daily_close','acc_ledger',
     'fin_transactions','fin_accounts','fin_invoices','fin_payments','fin_approvals',
     'brd_daily_logs','brd_medications',
     'prc_purchase_orders','prc_purchase_items','prc_purchase_requests','prc_purchase_payments','prc_returns','prc_price_items',
     'wms_warehouses','wms_outbound_items','wms_stocktake',
     'pkg_shifts','pkg_tasks',
     'pda_terminals','pda_sync_log','pda_system_config','pda_app_info',
     'mst_products','mst_stores',
     'lbl_records','cst_credit_warnings'
   );
  RAISE NOTICE '✅ V3 schema_complete: % critical tables present', v_count;
END $$;
