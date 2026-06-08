-- ════════════════════════════════════════════════════════════════════════════
-- G46 · 应收已收 ↔ 现金收款 勾稽对账视图（按时间 · 只读）
-- ════════════════════════════════════════════════════════════════════════════
-- 用户决策（G44 第4项）：对账"可以实施，要根据时间，不要搞错"。
-- 账户已经 G45 去重统一(流水归到 FH-/DP- 主档)，前提就绪。
--
-- "不要搞错"的两条铁律落到视图里：
--   ① 按 (company_code, 业务日期) 严格对齐 —— DATE(txn_date) = period_date；
--   ② 不强行比口径：凤凰应收是 LAK 原币、现金收款是本币 CNY → 仅当应收币种=CNY(东鹏)
--      才算差额(diff_cny)；凤凰标记"需汇率换算"，不产出误导性差额。
-- FULL OUTER JOIN：哪天只有应收、哪天只有现金、哪天两者都有，一目了然。
-- 只读视图，无数据写入。
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW v_fin_ar_cash_reconcile AS
WITH ar AS (
  SELECT company_code, MAX(farm_name) AS farm_name, period_date AS biz_date,
         MAX(currency_code) AS ar_currency,
         SUM(period_received) AS ar_received_orig
  FROM fin_ar_ledger
  GROUP BY company_code, period_date
), cash AS (
  SELECT company_code, DATE(txn_date) AS biz_date,
         SUM(amount) FILTER (WHERE direction = 'IN')  AS cash_in_base,
         SUM(amount) FILTER (WHERE direction = 'OUT') AS cash_out_base
  FROM fin_cash_transactions
  GROUP BY company_code, DATE(txn_date)
)
SELECT
  COALESCE(ar.company_code, cash.company_code)      AS company_code,
  ar.farm_name,
  COALESCE(ar.biz_date, cash.biz_date)              AS biz_date,
  ar.ar_currency,
  ar.ar_received_orig,                               -- 应收·本期已收(原币)
  cash.cash_in_base,                                 -- 现金·收款(本币CNY)
  cash.cash_out_base,                                -- 现金·付款(本币CNY)
  CASE WHEN ar.ar_currency = 'CNY'
       THEN COALESCE(ar.ar_received_orig,0) - COALESCE(cash.cash_in_base,0)
       ELSE NULL END                                AS diff_cny,
  CASE
    WHEN ar.company_code IS NULL              THEN '仅现金流水，无应收记录'
    WHEN cash.company_code IS NULL            THEN '仅应收已收，无当日现金流水'
    WHEN ar.ar_currency = 'CNY'              THEN '可比(同CNY)'
    ELSE '需汇率换算(应收LAK vs 现金CNY)'
  END                                               AS reconcile_note
FROM ar
FULL OUTER JOIN cash
  ON ar.company_code = cash.company_code AND ar.biz_date = cash.biz_date
ORDER BY biz_date, company_code;

COMMENT ON VIEW v_fin_ar_cash_reconcile IS
  'G46 应收已收↔现金收款 按(公司,日期)对账；凤凰LAK需汇率换算不直接比，东鹏CNY出差额';
