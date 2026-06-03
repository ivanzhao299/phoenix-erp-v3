-- ════════════════════════════════════════════════════════════════════════
-- Phoenix ERP V3 — Go-Live 测试数据重置（R6）⚠️ 一次性手动脚本
-- ────────────────────────────────────────────────────────────────────────
-- ⚠️⚠️⚠️ 严禁放入 apps/api/migrations/（CI 每次部署累积执行 → 上线后会清空真实数据）！
-- 本脚本仅在【正式上线前】由 DBA 手动执行一次，清空全部测试业务/交易数据，保留主数据。
--
-- 执行方式（生产，由用户在服务器执行）：
--   docker exec -i phoenix-v3-db psql -U postgres -d phoenix_erp < scripts/go-live-data-reset.sql
--   建议先 BEGIN; ...; 核对 RAISE NOTICE 删除量，确认无误再 COMMIT（或先整体跑一遍 ROLLBACK 预演）。
--
-- 保留（主数据，绝不删）：
--   sys_*（用户/角色/菜单/权限/字典）、org/组织、brd_farms/brd_houses/brd_flocks（场站/鸡舍/鸡群）、
--   product_grades/packaging_specs/product_skus（等级/规格/SKU）、sal_customers/sal_channels/价格本、
--   prc2_suppliers（供应商）、sys_store/门店、司机、inv_source_mode（模式配置）、fin_cash_accounts（账户，余额归零）。
-- 删除（测试交易数据）：库存批次/流水、包装全链、日产蛋、销售/配送/退货/POS、AR/收款/现金流水、标签、WMS 入库。
--
-- 幂等：DELETE 天然幂等；to_regclass 守卫缺表跳过；可重复执行。
-- ════════════════════════════════════════════════════════════════════════

DO $$
DECLARE n int;
  -- child→parent 顺序，避免 FK 冲突
  tbls text[] := ARRAY[
    -- 财务（明细→主）
    'fin_ar_receipt_allocations','fin_ar_receipts','fin_ar_invoices','fin_cash_transactions',
    -- 销售/配送/退货/POS（明细→主）
    'sal_return_items','sal_return_orders','sal_receipts','sal_delivery_orders',
    'sal_order_items','sal_sales_orders','sal_store_sale_items','sal_store_sales',
    -- 库存
    'inv_ledger','inv_batches','inv_source_mode_audit','lbl_records',
    -- WMS 入库
    'wms_inbound_items','wms_inbound',
    -- 包装全链
    'pkg_handover_records','pkg_packing_records','pkg_grading_records','pkg_source_batches',
    'pkg_qc_inspections','pkg_exceptions','pkg_tasks','pkg_shifts','pkg_work_shifts',
    -- 生产事实（日产蛋为测试，鸡群/鸡舍保留）
    'brd_daily_logs'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('DELETE FROM %I', t);
      GET DIAGNOSTICS n = ROW_COUNT;
      RAISE NOTICE '清空 % : % 行', t, n;
    END IF;
  END LOOP;

  -- 现金账户保留，余额归零（账户=主数据，余额=交易累积）
  IF to_regclass('public.fin_cash_accounts') IS NOT NULL THEN
    UPDATE fin_cash_accounts SET current_balance = 0 WHERE current_balance <> 0;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '现金账户余额归零 : % 个账户', n;
  END IF;

  RAISE NOTICE '✅ Go-Live 测试数据重置完成（主数据保留）。请核对后 COMMIT。';
END $$;
