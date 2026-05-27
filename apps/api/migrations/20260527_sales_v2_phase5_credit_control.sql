-- ============================================================
-- Migration: 20260527_sales_v2_phase5_credit_control.sql
-- Sales V2 Phase 5 — 客户信用控制 Runtime
--
-- 变更：
--   sal_customers   新增 credit_status / last_overdue_at / auto_frozen
--   sal_sales_orders 新增 credit_warning / credit_snapshot
--
-- 信用状态（credit_status）枚举：
--   NORMAL      — 正常
--   WARNING     — 预警（有逾期未收款，但未超信用额度）
--   OVER_LIMIT  — 超信用额度
--   OVERDUE     — 账期逾期
--   FROZEN      — 冻结（自动 or 手工）
--
-- 设计原则：
--   · 严禁写 fin_transactions（Finance V2 AR 唯一来源：fin_ar_invoices）
--   · credit_used 由 CustomerCreditScheduler 每日重算，禁止手工修改
--   · 自动冻结必须写日志（sys_notifications）
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. sal_customers — 新增信用控制字段
-- ─────────────────────────────────────────────────────────────

-- 信用状态（系统计算，不可手工修改 credit_used）
ALTER TABLE sal_customers
  ADD COLUMN IF NOT EXISTS credit_status    VARCHAR(32)  NOT NULL DEFAULT 'NORMAL';

-- 最近一次逾期时间（由 Scheduler 写入）
ALTER TABLE sal_customers
  ADD COLUMN IF NOT EXISTS last_overdue_at  TIMESTAMPTZ  NULL;

-- 是否被系统自动冻结（区分手工冻结与自动冻结）
ALTER TABLE sal_customers
  ADD COLUMN IF NOT EXISTS auto_frozen      BOOLEAN      NOT NULL DEFAULT FALSE;

-- 索引：快速查询逾期 / 高风险客户
CREATE INDEX IF NOT EXISTS idx_sal_cust_credit_status  ON sal_customers (credit_status);
CREATE INDEX IF NOT EXISTS idx_sal_cust_auto_frozen    ON sal_customers (auto_frozen);
CREATE INDEX IF NOT EXISTS idx_sal_cust_risk_level     ON sal_customers (risk_level);
CREATE INDEX IF NOT EXISTS idx_sal_cust_last_overdue   ON sal_customers (last_overdue_at);

-- 注释
COMMENT ON COLUMN sal_customers.credit_status   IS 'Sales V2 Phase 5 — NORMAL/WARNING/OVER_LIMIT/OVERDUE/FROZEN（系统计算，禁止手工改 credit_used）';
COMMENT ON COLUMN sal_customers.last_overdue_at IS 'Sales V2 Phase 5 — 最近一次逾期时间戳（由每日 Scheduler 写入）';
COMMENT ON COLUMN sal_customers.auto_frozen     IS 'Sales V2 Phase 5 — 系统自动冻结标志（true=Scheduler 冻结；false=手工冻结）';

-- ─────────────────────────────────────────────────────────────
-- 2. sal_sales_orders — 新增信用预警字段
-- ─────────────────────────────────────────────────────────────

-- 信用预警标志（WARNING 级：允许提交，但标记警告）
ALTER TABLE sal_sales_orders
  ADD COLUMN IF NOT EXISTS credit_warning   BOOLEAN      NOT NULL DEFAULT FALSE;

-- 提交时刻信用快照（JSONB：含 totalReceivable / overdueReceivable / overdueDays / creditLimit 等）
ALTER TABLE sal_sales_orders
  ADD COLUMN IF NOT EXISTS credit_snapshot  JSONB        NULL;

-- 索引
CREATE INDEX IF NOT EXISTS idx_sal_so_credit_warning  ON sal_sales_orders (credit_warning);

COMMENT ON COLUMN sal_sales_orders.credit_warning  IS 'Sales V2 Phase 5 — 提交时客户处于 WARNING 状态（有逾期但未超额）';
COMMENT ON COLUMN sal_sales_orders.credit_snapshot IS 'Sales V2 Phase 5 — 提交时刻信用快照 JSONB（totalReceivable/overdueReceivable/overdueDays/creditLimit/availableCredit/creditStatus）';

-- ─────────────────────────────────────────────────────────────
-- 3. RBAC — 注册 MENU_SALES2_CREDIT
-- ─────────────────────────────────────────────────────────────

INSERT INTO sys_menu (menu_code, menu_name_zh, domain, sort_order, route)
VALUES ('MENU_SALES2_CREDIT', 'Sales V2 信用控制', 'SALES', 76, '/sales2/customers')
ON CONFLICT (menu_code) DO NOTHING;

INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, x.perm_codes
FROM (VALUES
  ('ROLE_ADMIN',      'MENU_SALES2_CREDIT', 'V,C,E,D,A,X'),
  ('ROLE_CEO',        'MENU_SALES2_CREDIT', 'V,X'),
  ('ROLE_HQ_FINANCE', 'MENU_SALES2_CREDIT', 'V,X'),
  ('ROLE_FIN_CFO',    'MENU_SALES2_CREDIT', 'V,C,E,A,X'),
  ('ROLE_SALES_MGR',  'MENU_SALES2_CREDIT', 'V,C,E,D,A,X'),
  ('ROLE_SALES_REP',  'MENU_SALES2_CREDIT', 'V'),
  ('ROLE_REGION_MGR', 'MENU_SALES2_CREDIT', 'V,X'),
  ('ROLE_AUDITOR',    'MENU_SALES2_CREDIT', 'V,X')
) AS x(role_code, menu_code, perm_codes)
JOIN sys_role r ON r.role_code = x.role_code
JOIN sys_menu m  ON m.menu_code = x.menu_code
ON CONFLICT (role_id, menu_id) DO UPDATE SET perm_codes = EXCLUDED.perm_codes;

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- 4. 验证
-- ─────────────────────────────────────────────────────────────
SELECT
  column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'sal_customers'
  AND column_name IN ('credit_status','last_overdue_at','auto_frozen')
ORDER BY column_name;

SELECT
  column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'sal_sales_orders'
  AND column_name IN ('credit_warning','credit_snapshot')
ORDER BY column_name;
