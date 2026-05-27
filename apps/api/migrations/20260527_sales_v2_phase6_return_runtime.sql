-- ============================================================
-- Sales V2 Phase 6 — Sales Return Runtime
-- 2026-05-27
-- ============================================================
-- 表：
--   sal_return_orders  — 退货单主表
--   sal_return_items   — 退货明细
-- RBAC：
--   MENU_SALES2_RETURN — 销售退货管理
-- ============================================================

-- ── 1. sal_return_orders ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS sal_return_orders (
  id                BIGSERIAL    PRIMARY KEY,
  return_no         VARCHAR(64)  UNIQUE NOT NULL,
  -- 来源关联
  sales_order_id    BIGINT       NULL,
  sales_order_no    VARCHAR(64)  NULL,
  delivery_order_id BIGINT       NULL,
  -- 客户 / 公司
  customer_code     VARCHAR(64)  NULL,
  customer_name     VARCHAR(256) NULL,
  company_code      VARCHAR(64)  NOT NULL,
  company_name      VARCHAR(256) NULL,
  -- 退货类型：CUSTOMER_RETURN / DELIVERY_REJECT / QUALITY_RETURN / DAMAGE_RETURN
  return_type       VARCHAR(32)  NOT NULL,
  reason_code       VARCHAR(64)  NULL,
  -- 金额
  currency_code     VARCHAR(8)   DEFAULT 'LAK',
  subtotal          NUMERIC(18,2) DEFAULT 0,
  -- 状态机
  -- DRAFT → SUBMITTED → PENDING_APPROVAL → INSPECTING → RESTOCKING → COMPLETED
  --                   ↘ REJECTED / CANCELLED
  status            VARCHAR(32)  DEFAULT 'DRAFT',
  need_approval     BOOLEAN      DEFAULT FALSE,
  wf_instance_id    BIGINT       NULL,
  -- Finance V2 AR Credit Note
  credit_note_id    BIGINT       NULL,
  -- 时间戳
  requested_at      TIMESTAMPTZ  NULL,
  inspected_at      TIMESTAMPTZ  NULL,
  restocked_at      TIMESTAMPTZ  NULL,
  completed_at      TIMESTAMPTZ  NULL,
  remark            TEXT         NULL,
  created_by        VARCHAR(128) NULL,
  created_at        TIMESTAMPTZ  DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  DEFAULT NOW()
);

-- ── 2. sal_return_items ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS sal_return_items (
  id                   BIGSERIAL    PRIMARY KEY,
  return_order_id      BIGINT       NOT NULL REFERENCES sal_return_orders(id),
  sales_order_item_id  BIGINT       NULL,
  -- 产品信息
  product_code         VARCHAR(64)  NOT NULL,
  product_name         VARCHAR(256) NULL,
  grade_code           VARCHAR(32)  NULL,
  packaging_spec       VARCHAR(128) NULL,
  -- 数量
  returned_qty         NUMERIC(18,2) DEFAULT 0,   -- 客户申请退货数量
  accepted_qty         NUMERIC(18,2) DEFAULT 0,   -- 质检通过可回库数量
  damaged_qty          NUMERIC(18,2) DEFAULT 0,   -- 破损/报废数量（写损耗，不回库）
  -- 价格
  unit_price           NUMERIC(18,2) DEFAULT 0,
  amount               NUMERIC(18,2) DEFAULT 0,   -- accepted_qty * unit_price
  -- 质检结果：PENDING / ACCEPTED / PARTIAL / REJECTED / DAMAGED
  inspection_result    VARCHAR(32)  DEFAULT 'PENDING',
  -- 回库状态：PENDING / RESTOCKED / WRITTEN_OFF
  restock_status       VARCHAR(32)  DEFAULT 'PENDING',
  remark               TEXT         NULL,
  created_at           TIMESTAMPTZ  DEFAULT NOW()
);

-- ── 3. 索引 ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sal_return_orders_company    ON sal_return_orders(company_code);
CREATE INDEX IF NOT EXISTS idx_sal_return_orders_status     ON sal_return_orders(status);
CREATE INDEX IF NOT EXISTS idx_sal_return_orders_customer   ON sal_return_orders(customer_code);
CREATE INDEX IF NOT EXISTS idx_sal_return_orders_sales_ord  ON sal_return_orders(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sal_return_orders_created    ON sal_return_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sal_return_items_return_ord  ON sal_return_items(return_order_id);
CREATE INDEX IF NOT EXISTS idx_sal_return_items_product     ON sal_return_items(product_code);

-- ── 4. RBAC 种子 ─────────────────────────────────────────────
INSERT INTO sys_menu (code, name, parent_code, sort_order, is_active, created_at, updated_at)
VALUES ('MENU_SALES2_RETURN', '销售退货管理', 'MENU_SALES2', 60, true, now(), now())
ON CONFLICT (code) DO NOTHING;

-- 各角色权限
INSERT INTO sys_role_menu_permission (role_code, menu_code, perm_codes, created_at, updated_at)
VALUES
  ('ROLE_ADMIN',      'MENU_SALES2_RETURN', ARRAY['V','C','E','D','A','X'], now(), now()),
  ('ROLE_CEO',        'MENU_SALES2_RETURN', ARRAY['V','X'],                 now(), now()),
  ('ROLE_HQ_FINANCE', 'MENU_SALES2_RETURN', ARRAY['V','X'],                 now(), now()),
  ('ROLE_FIN_CFO',    'MENU_SALES2_RETURN', ARRAY['V','C','E','A','X'],     now(), now()),
  ('ROLE_SALES_MGR',  'MENU_SALES2_RETURN', ARRAY['V','C','E','D','A','X'], now(), now()),
  ('ROLE_SALES_REP',  'MENU_SALES2_RETURN', ARRAY['V','C'],                 now(), now()),
  ('ROLE_REGION_MGR', 'MENU_SALES2_RETURN', ARRAY['V','A','X'],             now(), now()),
  ('ROLE_AUDITOR',    'MENU_SALES2_RETURN', ARRAY['V'],                     now(), now())
ON CONFLICT (role_code, menu_code) DO NOTHING;
