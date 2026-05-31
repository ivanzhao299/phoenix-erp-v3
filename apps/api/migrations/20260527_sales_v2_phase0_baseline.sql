-- ═══════════════════════════════════════════════════════════════════════════
-- Phoenix ERP V3 — Sales V2 Phase 0 Clean Baseline
-- Migration: 20260527_sales_v2_phase0_baseline.sql
--
-- 目标：建立 Sales V2 Runtime 正式基线表（sal_* 前缀）
--       不删除旧 Sales 表（ord_*, b2b_*, log_dispatch 等保留供只读）
--       不迁移数据（系统尚未生产化）
--
-- 设计原则：
--   · 全面使用 company_code 做 DataScope，禁止 store_code 作为主隔离
--   · Workflow 2.0 (wf_instance_id) 为唯一审批引擎接口
--   · Finance V2 (ar_invoice_id FK fin_ar_invoices) 为唯一 AR Runtime
--   · 不再向 fin_transactions 写 AR 数据
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. sal_channels — 渠道主档
--    channel_type: DIRECT / DISTRIBUTOR / AGENT / RETAIL
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sal_channels (
  id            BIGSERIAL PRIMARY KEY,
  channel_code  VARCHAR(64)  NOT NULL UNIQUE,
  channel_name  VARCHAR(128) NOT NULL,
  channel_type  VARCHAR(32)  NOT NULL DEFAULT 'RETAIL',
                  -- DIRECT      直营
                  -- DISTRIBUTOR 经销商
                  -- AGENT       代理商
                  -- RETAIL      零售
  company_code  VARCHAR(64)  NOT NULL,
  company_name  VARCHAR(256),
  status        VARCHAR(32)  NOT NULL DEFAULT 'ACTIVE',
                  -- ACTIVE / INACTIVE
  remark        TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  sal_channels IS 'Sales V2 Phase 0 — 销售渠道主档';
COMMENT ON COLUMN sal_channels.channel_type IS 'DIRECT/DISTRIBUTOR/AGENT/RETAIL';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. sal_customers — 统一客户主档
--    取代 ord_customers + b2b_customers（两表均保留供只读）
--    customer_type: DIRECT_STORE / DISTRIBUTOR / AGENT / KEY_ACCOUNT / RETAIL
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sal_customers (
  id               BIGSERIAL PRIMARY KEY,
  customer_no      VARCHAR(64)      NOT NULL UNIQUE,
  customer_name    VARCHAR(128)     NOT NULL,

  -- 渠道分类
  customer_type    VARCHAR(32)      NOT NULL DEFAULT 'RETAIL',
                     -- DIRECT_STORE 直营店
                     -- DISTRIBUTOR  经销商
                     -- AGENT        代理商
                     -- KEY_ACCOUNT  大客户
                     -- RETAIL       散客零售
  channel_code     VARCHAR(64),             -- FK 逻辑 → sal_channels.channel_code

  -- DataScope（Finance V2 对齐，替代 store_code）
  company_code     VARCHAR(64)      NOT NULL,
  company_name     VARCHAR(256),

  -- 区域
  region_code      VARCHAR(64),

  -- 信用控制
  credit_limit     NUMERIC(18,2)    NOT NULL DEFAULT 0,
  credit_used      NUMERIC(18,2)    NOT NULL DEFAULT 0,
  payment_terms    INTEGER          NOT NULL DEFAULT 0,  -- 账期天数

  -- 风险分级
  risk_level       VARCHAR(32)      NOT NULL DEFAULT 'NORMAL',
                     -- NORMAL / WATCH / BLACKLIST

  -- 状态
  status           VARCHAR(32)      NOT NULL DEFAULT 'ACTIVE',
                     -- ACTIVE / FROZEN / BLACKLIST

  -- 归属销售员
  sales_rep_id     BIGINT,
  sales_rep_name   VARCHAR(128),

  -- 联系信息
  contact_name     VARCHAR(128),
  contact_phone    VARCHAR(64),
  delivery_address TEXT,

  remark           TEXT,
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  sal_customers IS 'Sales V2 Phase 0 — 统一客户主档（取代 ord_customers + b2b_customers）';
COMMENT ON COLUMN sal_customers.customer_type   IS 'DIRECT_STORE/DISTRIBUTOR/AGENT/KEY_ACCOUNT/RETAIL';
COMMENT ON COLUMN sal_customers.risk_level      IS 'NORMAL/WATCH/BLACKLIST';
COMMENT ON COLUMN sal_customers.status          IS 'ACTIVE/FROZEN/BLACKLIST';
COMMENT ON COLUMN sal_customers.credit_limit    IS '授信总额度';
COMMENT ON COLUMN sal_customers.credit_used     IS '已占用额度（由 Sales Order Runtime 维护）';
COMMENT ON COLUMN sal_customers.payment_terms   IS '账期天数（0=当天付款）';

-- ─────────────────────────────────────────────────────────────────────────
-- 3. sal_price_books — 价格册
--    取代 ord_prices + prc_price_items 的 Sales 部分
--    status: DRAFT / PENDING_APPROVAL / APPROVED / ACTIVE / EXPIRED / CANCELLED
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sal_price_books (
  id               BIGSERIAL PRIMARY KEY,
  price_book_no    VARCHAR(64)      NOT NULL UNIQUE,
  price_book_name  VARCHAR(256)     NOT NULL,

  -- 适用范围（二选一）
  channel_code     VARCHAR(64),     -- 渠道价格册
  customer_code    VARCHAR(64),     -- 客户专属价格册

  -- 有效期
  effective_from   DATE,
  effective_to     DATE,

  -- DataScope
  company_code     VARCHAR(64)      NOT NULL,

  -- 状态机
  status           VARCHAR(32)      NOT NULL DEFAULT 'DRAFT',
                     -- DRAFT / PENDING_APPROVAL / APPROVED / ACTIVE / EXPIRED / CANCELLED

  -- Workflow 2.0 审批关联（价格变更审批）
  wf_instance_id   BIGINT,

  created_by       VARCHAR(128),
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  sal_price_books IS 'Sales V2 Phase 0 — 价格册（取代 ord_prices / prc_price_items Sales 部分）';
COMMENT ON COLUMN sal_price_books.status IS 'DRAFT/PENDING_APPROVAL/APPROVED/ACTIVE/EXPIRED/CANCELLED';
COMMENT ON COLUMN sal_price_books.wf_instance_id IS 'Workflow 2.0 审批实例 ID（价格变更审批）';

-- ─────────────────────────────────────────────────────────────────────────
-- 4. sal_price_items — 价格明细
--    支持：按品级、规格、数量阶梯定价
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sal_price_items (
  id               BIGSERIAL PRIMARY KEY,
  price_book_id    BIGINT           NOT NULL REFERENCES sal_price_books(id) ON DELETE CASCADE,

  product_code     VARCHAR(64)      NOT NULL,

  -- 鸡蛋特有维度
  grade_code       VARCHAR(16),     -- 品级：0/1/2/3/4/5/DIRTY/BROKEN
  packaging_spec   VARCHAR(64),     -- 包装规格：LOOSE/30_PCS_TRAY/360_PCS_CASE

  -- 价格
  unit_price       NUMERIC(18,2)    NOT NULL,
  floor_price      NUMERIC(18,2),   -- 最低成交价（低于此须走低价审批）
  ceiling_price    NUMERIC(18,2),   -- 最高成交价（上限参考）

  -- 数量阶梯（NULL=不限制）
  min_qty          NUMERIC(18,2),
  max_qty          NUMERIC(18,2),

  currency_code    VARCHAR(8)       NOT NULL DEFAULT 'LAK',

  created_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  sal_price_items IS 'Sales V2 Phase 0 — 价格明细（支持按品级/规格/数量阶梯定价）';
COMMENT ON COLUMN sal_price_items.grade_code     IS '鸡蛋品级：0/1/2/3/4/5/DIRTY/BROKEN';
COMMENT ON COLUMN sal_price_items.packaging_spec IS '包装规格：LOOSE/30_PCS_TRAY/360_PCS_CASE';
COMMENT ON COLUMN sal_price_items.floor_price    IS '底价（低于此须走 Workflow 低价审批）';

-- ─────────────────────────────────────────────────────────────────────────
-- 5. sal_sales_orders — 销售订单（Phase 0 基线）
--    完整状态机：DRAFT → ... → RECONCILED
--    Phase 3 实装全部业务逻辑
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sal_sales_orders (
  id               BIGSERIAL PRIMARY KEY,
  order_no         VARCHAR(64)      NOT NULL UNIQUE,

  -- 客户关联
  customer_id      BIGINT,          -- FK 逻辑 → sal_customers.id
  customer_code    VARCHAR(64),
  customer_name    VARCHAR(256),

  -- DataScope（Finance V2 对齐）
  company_code     VARCHAR(64)      NOT NULL,
  company_name     VARCHAR(256),

  -- 渠道
  channel_code     VARCHAR(64),

  -- 货币
  currency_code    VARCHAR(8)       NOT NULL DEFAULT 'LAK',

  -- 金额
  subtotal         NUMERIC(18,2)    NOT NULL DEFAULT 0,
  discount         NUMERIC(18,2)    NOT NULL DEFAULT 0,
  total_amount     NUMERIC(18,2)    NOT NULL DEFAULT 0,

  -- 状态机
  status           VARCHAR(32)      NOT NULL DEFAULT 'DRAFT',
                     -- DRAFT → PENDING_APPROVAL → APPROVED
                     --       → ALLOCATED → PICKED → LOADED
                     --       → SHIPPED / PARTIAL_SHIPPED
                     --       → DELIVERED → RECEIVED → RECONCILED
                     --       → REJECTED / CANCELLED（终态）

  -- 审批标记（Phase 3 接入 Workflow 2.0 后生效）
  need_price_approval   BOOLEAN      NOT NULL DEFAULT FALSE,
  need_credit_approval  BOOLEAN      NOT NULL DEFAULT FALSE,

  -- Workflow 2.0 审批关联
  wf_instance_id   BIGINT,

  -- Finance V2 AR 关联（订单签收后填入 fin_ar_invoices.id）
  ar_invoice_id    BIGINT,

  -- 配送信息
  delivery_address TEXT,

  remark           TEXT,

  created_by       VARCHAR(128),
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  sal_sales_orders IS 'Sales V2 Phase 0 — 销售订单基线（Phase 3 实装完整业务逻辑）';
COMMENT ON COLUMN sal_sales_orders.status        IS 'DRAFT/PENDING_APPROVAL/APPROVED/ALLOCATED/PICKED/LOADED/SHIPPED/PARTIAL_SHIPPED/DELIVERED/RECEIVED/RECONCILED/REJECTED/CANCELLED';
COMMENT ON COLUMN sal_sales_orders.ar_invoice_id IS 'Finance V2 fin_ar_invoices.id（订单签收后由 Sales V2 Phase 3 填入）';
COMMENT ON COLUMN sal_sales_orders.wf_instance_id IS 'Workflow 2.0 审批实例（价格/信用审批由 Phase 3 接入）';

-- ─────────────────────────────────────────────────────────────────────────
-- 6. sal_order_items — 销售订单明细
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sal_order_items (
  id               BIGSERIAL PRIMARY KEY,
  sales_order_id   BIGINT           NOT NULL REFERENCES sal_sales_orders(id) ON DELETE CASCADE,

  product_code     VARCHAR(64)      NOT NULL,

  -- 鸡蛋特有维度
  grade_code       VARCHAR(16),     -- 品级
  packaging_spec   VARCHAR(64),     -- 包装规格

  qty              NUMERIC(18,2)    NOT NULL,
  unit_price       NUMERIC(18,2)    NOT NULL,
  amount           NUMERIC(18,2)    NOT NULL,

  created_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  sal_order_items IS 'Sales V2 Phase 0 — 销售订单明细';

-- ─────────────────────────────────────────────────────────────────────────
-- 索引
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sal_channels_company    ON sal_channels    (company_code);
CREATE INDEX IF NOT EXISTS idx_sal_customers_company   ON sal_customers   (company_code);
CREATE INDEX IF NOT EXISTS idx_sal_customers_type      ON sal_customers   (customer_type);
CREATE INDEX IF NOT EXISTS idx_sal_customers_status    ON sal_customers   (status);
CREATE INDEX IF NOT EXISTS idx_sal_price_books_company ON sal_price_books (company_code);
CREATE INDEX IF NOT EXISTS idx_sal_price_books_status  ON sal_price_books (status);
CREATE INDEX IF NOT EXISTS idx_sal_price_items_book    ON sal_price_items (price_book_id);
CREATE INDEX IF NOT EXISTS idx_sal_sales_orders_company ON sal_sales_orders (company_code);
CREATE INDEX IF NOT EXISTS idx_sal_sales_orders_customer ON sal_sales_orders (customer_code);
CREATE INDEX IF NOT EXISTS idx_sal_sales_orders_status ON sal_sales_orders (status);
CREATE INDEX IF NOT EXISTS idx_sal_order_items_order   ON sal_order_items (sales_order_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Legacy Freeze 标记（旧表注释，不删除）
-- 修复（Phase C）：COMMENT ON TABLE 对不存在的表会报错。这些 legacy 表
-- （ord_customers/b2b_customers）在全新数据库的 SQL 阶段尚不存在（由运行时建），
-- 因此用 IF EXISTS 条件保护，表存在才加注释。
-- ─────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='ord_customers') THEN
    COMMENT ON TABLE ord_customers IS '[LEGACY][READ_ONLY] 已冻结 — 迁移至 sal_customers（Sales V2 Phase 1）';
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='b2b_customers') THEN
    COMMENT ON TABLE b2b_customers IS '[LEGACY][READ_ONLY] 已冻结 — 迁移至 sal_customers（Sales V2 Phase 1）';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 完成标记
-- ─────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  RAISE NOTICE '✅ Sales V2 Phase 0 Baseline migration complete.';
  RAISE NOTICE '   Tables created: sal_channels, sal_customers, sal_price_books, sal_price_items, sal_sales_orders, sal_order_items';
  RAISE NOTICE '   Legacy frozen (READ ONLY): ord_customers, b2b_customers, ord_prices, log_dispatch';
  RAISE NOTICE '   fin_transactions: AR writes deprecated — use fin_ar_invoices (Finance V2 Phase 2)';
END $$;
