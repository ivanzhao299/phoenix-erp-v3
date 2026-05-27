-- ============================================================
-- Migration: 20260527_sales_v2_phase4_delivery_runtime.sql
-- Sales V2 Phase 4 — Delivery Runtime
--
-- 新增表：
--   sal_drivers              司机档案
--   sal_vehicles             车辆档案
--   sal_delivery_orders      配送单（主表）
--   sal_delivery_order_items 配送单明细（关联销售订单）
--   sal_receipts             签收记录
--
-- 状态机：
--   sal_delivery_orders: PLANNED → LOADING → LOADED → DEPARTED
--                        → ARRIVED → PARTIALLY_SIGNED → COMPLETED
--                        → CANCELLED（终态）
--   sal_delivery_order_items: PENDING → LOADED → DELIVERED
--                             → SIGNED | EXCEPTION | RETURNED
--   sal_receipts: SIGNED | EXCEPTION | PARTIAL
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. 司机档案  sal_drivers
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sal_drivers (
  id           BIGSERIAL PRIMARY KEY,
  driver_code  VARCHAR(64)  UNIQUE NOT NULL,
  driver_name  VARCHAR(256) NOT NULL,
  phone        VARCHAR(32)  NULL,
  license_no   VARCHAR(64)  NULL,
  company_code VARCHAR(64)  NOT NULL,
  status       VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE | INACTIVE
  remark       TEXT         NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sal_drivers_company  ON sal_drivers (company_code);
CREATE INDEX IF NOT EXISTS idx_sal_drivers_status   ON sal_drivers (status);

COMMENT ON TABLE sal_drivers IS 'Sales V2 Phase 4 — 司机档案 Runtime（取代 log_drivers 遗留表）';

-- ─────────────────────────────────────────────────────────────
-- 2. 车辆档案  sal_vehicles
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sal_vehicles (
  id           BIGSERIAL PRIMARY KEY,
  vehicle_no   VARCHAR(64)  UNIQUE NOT NULL,
  plate_no     VARCHAR(32)  NULL,
  vehicle_type VARCHAR(64)  NULL,   -- 冷藏车 / 厢式货车 / 三轮车 等
  capacity     NUMERIC(18,2) NULL,  -- 载重量（公斤）
  company_code VARCHAR(64)  NOT NULL,
  status       VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE | MAINTENANCE | INACTIVE
  remark       TEXT         NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sal_vehicles_company ON sal_vehicles (company_code);
CREATE INDEX IF NOT EXISTS idx_sal_vehicles_status  ON sal_vehicles (status);

COMMENT ON TABLE sal_vehicles IS 'Sales V2 Phase 4 — 车辆档案 Runtime';

-- ─────────────────────────────────────────────────────────────
-- 3. 配送单  sal_delivery_orders
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sal_delivery_orders (
  id                   BIGSERIAL PRIMARY KEY,
  delivery_no          VARCHAR(64)   UNIQUE NOT NULL,

  company_code         VARCHAR(64)   NOT NULL,
  company_name         VARCHAR(256)  NULL,

  route_code           VARCHAR(64)   NULL,
  route_name           VARCHAR(256)  NULL,

  vehicle_id           BIGINT        NULL REFERENCES sal_vehicles(id) ON DELETE SET NULL,
  vehicle_no           VARCHAR(64)   NULL,

  driver_id            BIGINT        NULL REFERENCES sal_drivers(id) ON DELETE SET NULL,
  driver_name          VARCHAR(256)  NULL,

  wave_date            DATE          NULL,   -- 配送波次日期

  -- ── 状态机 ──
  status               VARCHAR(32)   NOT NULL DEFAULT 'PLANNED',
  -- PLANNED | LOADING | LOADED | DEPARTED | ARRIVED
  -- | PARTIALLY_SIGNED | COMPLETED | CANCELLED

  -- ── 时间戳体系 ──
  loading_start_at     TIMESTAMPTZ   NULL,   -- 开始装车
  loading_end_at       TIMESTAMPTZ   NULL,   -- 装车完成
  departure_at         TIMESTAMPTZ   NULL,   -- 发车时间
  expected_arrival_at  TIMESTAMPTZ   NULL,   -- 预计到达
  actual_arrival_at    TIMESTAMPTZ   NULL,   -- 实际到达
  completed_at         TIMESTAMPTZ   NULL,   -- 全部签收完成

  -- ── 汇总统计（冗余字段，避免实时聚合） ──
  total_orders         INTEGER       NOT NULL DEFAULT 0,
  total_qty            NUMERIC(18,2) NOT NULL DEFAULT 0,

  remark               TEXT          NULL,
  created_by           VARCHAR(128)  NULL,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sal_do_company      ON sal_delivery_orders (company_code);
CREATE INDEX IF NOT EXISTS idx_sal_do_status       ON sal_delivery_orders (status);
CREATE INDEX IF NOT EXISTS idx_sal_do_wave_date    ON sal_delivery_orders (wave_date);
CREATE INDEX IF NOT EXISTS idx_sal_do_driver       ON sal_delivery_orders (driver_id);
CREATE INDEX IF NOT EXISTS idx_sal_do_vehicle      ON sal_delivery_orders (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_sal_do_created_at   ON sal_delivery_orders (created_at);

COMMENT ON TABLE sal_delivery_orders IS 'Sales V2 Phase 4 — 配送单 Runtime（取代 log_dispatch Demo）';

-- ─────────────────────────────────────────────────────────────
-- 4. 配送单明细  sal_delivery_order_items
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sal_delivery_order_items (
  id                BIGSERIAL PRIMARY KEY,

  delivery_order_id BIGINT        NOT NULL REFERENCES sal_delivery_orders(id) ON DELETE CASCADE,

  sales_order_id    BIGINT        NOT NULL,   -- sal_sales_orders.id（无FK，避免循环）
  sales_order_no    VARCHAR(64)   NOT NULL,

  customer_code     VARCHAR(64)   NULL,
  customer_name     VARCHAR(256)  NULL,

  delivery_address  TEXT          NULL,

  planned_qty       NUMERIC(18,2) NOT NULL DEFAULT 0,
  loaded_qty        NUMERIC(18,2) NOT NULL DEFAULT 0,
  received_qty      NUMERIC(18,2) NOT NULL DEFAULT 0,

  -- ── 状态 ──
  status            VARCHAR(32)   NOT NULL DEFAULT 'PENDING',
  -- PENDING | LOADED | DELIVERED | SIGNED | EXCEPTION | RETURNED

  receipt_id        BIGINT        NULL,   -- 最终签收记录 ID（写回）

  remark            TEXT          NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sal_doi_delivery   ON sal_delivery_order_items (delivery_order_id);
CREATE INDEX IF NOT EXISTS idx_sal_doi_so         ON sal_delivery_order_items (sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sal_doi_status     ON sal_delivery_order_items (status);
CREATE INDEX IF NOT EXISTS idx_sal_doi_customer   ON sal_delivery_order_items (customer_code);

COMMENT ON TABLE sal_delivery_order_items IS 'Sales V2 Phase 4 — 配送单明细（每行对应一张销售订单）';

-- ─────────────────────────────────────────────────────────────
-- 5. 签收记录  sal_receipts
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sal_receipts (
  id                  BIGSERIAL PRIMARY KEY,
  receipt_no          VARCHAR(64)   UNIQUE NOT NULL,

  delivery_order_id   BIGINT        NOT NULL REFERENCES sal_delivery_orders(id),
  delivery_item_id    BIGINT        NOT NULL REFERENCES sal_delivery_order_items(id),

  sales_order_id      BIGINT        NOT NULL,   -- sal_sales_orders.id
  sales_order_no      VARCHAR(64)   NOT NULL,

  customer_code       VARCHAR(64)   NULL,
  customer_name       VARCHAR(256)  NULL,

  signed_by           VARCHAR(256)  NULL,   -- 签收人姓名
  signed_at           TIMESTAMPTZ   NULL,

  received_qty        NUMERIC(18,2) NOT NULL DEFAULT 0,   -- 实收数量
  exception_qty       NUMERIC(18,2) NOT NULL DEFAULT 0,   -- 异常数量

  -- ── 异常类型 ──
  exception_type      VARCHAR(32)   NULL,
  -- SHORTAGE（短少）| DAMAGED（破损）| REJECTED（拒收）
  -- | LATE（超时拒收）| OTHER

  photo_urls          JSONB         NULL,   -- 签收照片 URL 数组

  remark              TEXT          NULL,

  -- ── 状态 ──
  status              VARCHAR(16)   NOT NULL DEFAULT 'SIGNED',
  -- SIGNED | EXCEPTION | PARTIAL

  created_by          VARCHAR(128)  NULL,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sal_rc_delivery   ON sal_receipts (delivery_order_id);
CREATE INDEX IF NOT EXISTS idx_sal_rc_item       ON sal_receipts (delivery_item_id);
CREATE INDEX IF NOT EXISTS idx_sal_rc_so         ON sal_receipts (sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sal_rc_status     ON sal_receipts (status);
CREATE INDEX IF NOT EXISTS idx_sal_rc_signed_at  ON sal_receipts (signed_at);

COMMENT ON TABLE sal_receipts IS 'Sales V2 Phase 4 — 签收记录 Runtime（含异常签收）';

-- ─────────────────────────────────────────────────────────────
-- 6. Legacy Freeze 标注（旧配送表）
-- ─────────────────────────────────────────────────────────────
COMMENT ON TABLE log_dispatch IS
  'LEGACY READ_ONLY — Sales V2 Phase 4 已建立 sal_delivery_orders Runtime，禁止写入此表';

COMMENT ON TABLE log_routes IS
  'LEGACY READ_ONLY — Sales V2 Phase 4 Delivery Runtime 已上线，路线数据迁移至 sal_delivery_orders.route_code';

-- ─────────────────────────────────────────────────────────────
-- 7. RBAC — 注册 MENU_SALES2_DELIVERY 菜单 + 权限
-- ─────────────────────────────────────────────────────────────
INSERT INTO sys_menu (menu_code, menu_name_zh, domain, sort_order, route)
VALUES ('MENU_SALES2_DELIVERY', 'Sales V2 配送管理', 'SALES', 75, '/sales2/delivery')
ON CONFLICT (menu_code) DO NOTHING;

INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, x.perm_codes
FROM (VALUES
  ('ROLE_ADMIN',      'MENU_SALES2_DELIVERY', 'V,C,E,D,A,X'),
  ('ROLE_CEO',        'MENU_SALES2_DELIVERY', 'V,X'),
  ('ROLE_SALES_MGR',  'MENU_SALES2_DELIVERY', 'V,C,E,D,A,X'),
  ('ROLE_SALES_REP',  'MENU_SALES2_DELIVERY', 'V,C,E'),
  ('ROLE_LOG_MGR',    'MENU_SALES2_DELIVERY', 'V,C,E,D,X'),
  ('ROLE_DRIVER',     'MENU_SALES2_DELIVERY', 'V,E'),
  ('ROLE_REGION_MGR', 'MENU_SALES2_DELIVERY', 'V,X'),
  ('ROLE_AUDITOR',    'MENU_SALES2_DELIVERY', 'V,X'),
  ('ROLE_HQ_FINANCE', 'MENU_SALES2_DELIVERY', 'V,X'),
  ('ROLE_FIN_CFO',    'MENU_SALES2_DELIVERY', 'V,X')
) AS x(role_code, menu_code, perm_codes)
JOIN sys_role r ON r.role_code = x.role_code
JOIN sys_menu m  ON m.menu_code = x.menu_code
ON CONFLICT (role_id, menu_id) DO UPDATE SET perm_codes = EXCLUDED.perm_codes;

COMMIT;

-- 验证
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('sal_drivers','sal_vehicles','sal_delivery_orders',
                     'sal_delivery_order_items','sal_receipts')
ORDER BY table_name;
