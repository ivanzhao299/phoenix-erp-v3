-- ════════════════════════════════════════════════════════════════════════════
-- G6 · Business Analytics Center — analytics_views（物化视图骨架）
-- ════════════════════════════════════════════════════════════════════════════
-- 原则（任务约束）：
--   - G6 不新增业务表、不新增业务流程
--   - 物化视图是 OPTIONAL 性能优化层，G6 service 默认走实时 SQL
--   - 后续 G7 / 数据量增长时可启用 REFRESH MATERIALIZED VIEW（每日 cron）
--
-- 本迁移建立 4 个核心物化视图：
--   mv_daily_sales      — 每日销售汇总（含公司/项目）
--   mv_daily_egg        — 每日产蛋汇总（含场站/鸡舍）
--   mv_ar_aging_summary — AR 账龄汇总
--   mv_inv_status_summary — 库存 5 态汇总（按仓库）
--
-- 幂等：使用 CREATE MATERIALIZED VIEW IF NOT EXISTS
-- ════════════════════════════════════════════════════════════════════════════

-- ── mv_daily_sales ──────────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_sales AS
SELECT
  DATE_TRUNC('day', so.created_at)::date AS day,
  so.company_code,
  so.project_code,
  so.channel_code,
  COUNT(*)::int                          AS order_count,
  COALESCE(SUM(so.total_amount), 0)::numeric(18,2) AS revenue
FROM sales_orders so
GROUP BY 1, 2, 3, 4
WITH NO DATA;

CREATE INDEX IF NOT EXISTS idx_mv_daily_sales_day ON mv_daily_sales(day);
CREATE INDEX IF NOT EXISTS idx_mv_daily_sales_company ON mv_daily_sales(company_code);

COMMENT ON MATERIALIZED VIEW mv_daily_sales IS
  'G6: 每日销售汇总；G6-A 集团 / G6-B 财务 / G6-C 销售 / G6-H 预测 共用';

-- ── mv_daily_egg ────────────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_egg AS
SELECT
  log_date AS day,
  farm_code,
  house_code,
  COALESCE(SUM(eggs), 0)::int        AS eggs,
  COALESCE(SUM(dirty_eggs), 0)::int  AS dirty_eggs,
  COALESCE(SUM(broken_eggs), 0)::int AS broken_eggs,
  COALESCE(SUM(deaths), 0)::int      AS deaths,
  COALESCE(SUM(elimination), 0)::int AS elimination
FROM brd_daily_logs
GROUP BY 1, 2, 3
WITH NO DATA;

CREATE INDEX IF NOT EXISTS idx_mv_daily_egg_day ON mv_daily_egg(day);
CREATE INDEX IF NOT EXISTS idx_mv_daily_egg_farm ON mv_daily_egg(farm_code);

COMMENT ON MATERIALIZED VIEW mv_daily_egg IS
  'G6: 每日产蛋汇总；G6-E 生产 / G6-H 预测共用';

-- ── mv_ar_aging_summary ─────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_ar_aging_summary AS
SELECT
  company_code,
  customer_code,
  aging_bucket,
  COUNT(*)::int                              AS invoice_count,
  COALESCE(SUM(balance_amount_original), 0)::numeric(18,2) AS balance
FROM fin_ar_invoices
WHERE COALESCE(payment_status, 'UNPAID') <> 'PAID'
GROUP BY 1, 2, 3
WITH NO DATA;

CREATE INDEX IF NOT EXISTS idx_mv_ar_aging_company ON mv_ar_aging_summary(company_code);

COMMENT ON MATERIALIZED VIEW mv_ar_aging_summary IS
  'G6: AR 账龄分布；G6-B 财务分析使用';

-- ── mv_inv_status_summary ───────────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_inv_status_summary AS
SELECT
  COALESCE(warehouse_code, '__UNKNOWN__') AS warehouse_code,
  COALESCE(status, 'UNKNOWN') AS status,
  COUNT(*)::int                                            AS batch_count,
  COALESCE(SUM(qty), 0)::numeric(18,2)                     AS qty,
  COALESCE(SUM(qty * COALESCE(unit_cost, 0)), 0)::numeric(18,2) AS value
FROM inv_batches
GROUP BY 1, 2
WITH NO DATA;

CREATE INDEX IF NOT EXISTS idx_mv_inv_status_warehouse ON mv_inv_status_summary(warehouse_code);

COMMENT ON MATERIALIZED VIEW mv_inv_status_summary IS
  'G6: 库存 5 态分布（按仓库）；G6-D 库存分析 / G5 库存健康共用';

-- ── 刷新函数：一键刷新所有 G6 物化视图 ────────────────────────────────────────
CREATE OR REPLACE FUNCTION refresh_g6_analytics_views() RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW mv_daily_sales;
  REFRESH MATERIALIZED VIEW mv_daily_egg;
  REFRESH MATERIALIZED VIEW mv_ar_aging_summary;
  REFRESH MATERIALIZED VIEW mv_inv_status_summary;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_g6_analytics_views() IS
  'G6: 一键刷新所有 G6 物化视图；建议每日 03:00 由 cron 触发';
