-- ============================================================
-- Shareholder Runtime Phase 2B-R2 — 凤凰农业(孟赛)全体股东实收资本导入
-- 数据源：《老挝凤凰农业实收资本明细》截止 2026-06-01
-- 真实实缴资本口径：禁止按股比反推、禁止应缴/未缴推导。
--   · 项目总实缴资本 total_paid_in_capital
--   · 股东 paid_in_capital（实际实缴）+ capital_ratio（实缴占比）+ paid_in_source（来源标记）
--   · 保留 equity_ratio（股权比例）不覆盖；equity_status 保持 PROVISIONAL
-- 幂等：ADD COLUMN IF NOT EXISTS + UPDATE
-- ============================================================
BEGIN;

ALTER TABLE shr_projects       ADD COLUMN IF NOT EXISTS total_paid_in_capital NUMERIC(18,2);
ALTER TABLE shr_project_equity ADD COLUMN IF NOT EXISTS capital_ratio  NUMERIC(10,4);  -- 实缴资本占比(%)
ALTER TABLE shr_project_equity ADD COLUMN IF NOT EXISTS paid_in_source VARCHAR(64);    -- LEDGER / CAPITAL_SUMMARY_IMPORT

-- 项目总实缴资本（孟赛，截止 2026-06-01）
UPDATE shr_projects SET total_paid_in_capital = 46736856.43, updated_at = now()
WHERE project_code = 'SHR-MENGSAI-LAYER';

-- 股东实缴资本 + 实缴占比 + 来源标记（不覆盖 equity_ratio）
UPDATE shr_project_equity e SET
  paid_in_capital = v.paid,
  capital_ratio   = round(v.paid / 46736856.43 * 100, 2),   -- 系统自动计算占比
  paid_in_source  = v.src,
  updated_at      = now()
FROM (VALUES
  ('SHR-ZHU-ZHAOCUN',  30477396.68, 'CAPITAL_SUMMARY_IMPORT'),  -- 朱兆存（资本汇总表）
  ('SHR-ZHAO-YONGWEI',  9589836.86, 'LEDGER'),                  -- 赵永伟（与历史出资台账一致）
  ('SHR-SONG-LEI',      6669622.89, 'CAPITAL_SUMMARY_IMPORT')   -- 宋雷（资本汇总表，暂无逐笔台账）
) AS v(shr_code, paid, src)
WHERE e.project_code = 'SHR-MENGSAI-LAYER' AND e.shareholder_code = v.shr_code;

COMMIT;

-- 预期：占比 朱兆存 65.21% / 赵永伟 20.52% / 宋雷 14.27%（合计 100.00%）
