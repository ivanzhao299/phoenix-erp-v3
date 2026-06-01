-- ════════════════════════════════════════════════════════════════════════
-- Shareholder Runtime Phase 4 — 历史实缴回填出资台账
-- ────────────────────────────────────────────────────────────────────────
-- 目的：让「出资台账」页能逐行看到各项目股东的历史实缴（初始数据作为单笔台账）。
-- 背景：历史实缴按「汇总口径」写在 shr_project_equity.paid_in_capital（股权结构页），
--       但出资台账(shr_capital_contributions)只有赵永伟的真实逐笔（孟赛/东鹏）。
--       其余股东(万象全部、孟赛/东鹏其他股东)在台账无任何记录 → 本页显示为空。
--
-- 策略：仅为「在出资台账中尚无任何 CONFIRMED 记录」的(项目,股东)各补 1 条
--       CONFIRMED 汇总单，金额 = equity 实缴。已有逐笔的股东(如赵永伟)自动跳过，
--       绝不重复计数。
--
-- 安全保证：
--   1) 幂等：contribution_no 确定性('CAP-HIST-项目-股东') + NOT EXISTS + ON CONFLICT DO NOTHING；
--      可重复执行，第二次起插入 0 行。
--   2) 不触发聚合：本迁移只 INSERT 台账，绝不修改 shr_project_equity.paid_in_capital
--      或 shr_projects.total_paid_in_capital，历史实缴口径不变。
--   3) 东鹏赵永伟 equity.paid_in_capital=0(实缴漏登，待核实)，WHERE paid_in_capital>0
--      自动排除，本次不补、不改（用户决策：暂不修正）。
--
-- 本地实测：补 10 条 → 孟赛/万象 台账合计 == equity 实缴合计（完全对齐）。
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO shr_capital_contributions
  (contribution_no, project_code, shareholder_code, amount, currency,
   contribution_date, source_type, status, confirmed_at, finance_bridge_status,
   remark, created_at, updated_at)
SELECT
  'CAP-HIST-' || e.project_code || '-' || e.shareholder_code,
  e.project_code,
  e.shareholder_code,
  e.paid_in_capital,
  'CNY',
  DATE '2026-06-01',
  'CAPITAL_SUMMARY_IMPORT',
  'CONFIRMED',
  now(),
  'READ_ONLY',
  '历史实缴汇总导入（初始数据·单笔台账；明细以股权结构实缴口径为准）',
  now(),
  now()
FROM shr_project_equity e
WHERE COALESCE(e.paid_in_capital, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM shr_capital_contributions c
    WHERE c.project_code = e.project_code
      AND c.shareholder_code = e.shareholder_code
      AND c.status = 'CONFIRMED'
  )
ON CONFLICT (contribution_no) DO NOTHING;

COMMIT;

-- 预期(生产)：为台账中无 CONFIRMED 记录的(项目,股东)各补 1 条；
--   赵永伟孟赛(55笔)/东鹏(9笔)逐笔已存在 → 跳过；东鹏赵永伟 equity=0 → 排除。
