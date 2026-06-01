-- ============================================================
-- Shareholder Runtime Phase 2B-R3 — 万象食品厂实收资本导入
-- 数据源：《万象食品厂实收资本明细》。真实实缴口径，禁止按股比推导/应缴/未缴。
--   · 项目总实缴 5,454,049.69
--   · 股东实缴：赵永伟 3,511,508 / 朱兆存 1,397,151.69 / 薛刚 545,390
--   · capital_ratio 自动计算；equity_ratio 保留；项目维持 PROVISIONAL
-- ⚠ 薛峰(SHR-XUE-FENG, Phase 1) → 薛刚(SHR-XUE-GANG)：同一 40% 名额姓名订正，
--    将万象 40% 股权行改指向薛刚（待业务最终确认）。
-- 幂等：ON CONFLICT / UPDATE WHERE
-- ============================================================
BEGIN;

-- 1. 创建薛刚股东档案（如不存在）
INSERT INTO shr_shareholders (shareholder_code, shareholder_name, remark)
VALUES ('SHR-XUE-GANG', '薛刚', '万象食品厂股东；实收资本表来源；⚠与 Phase1「薛峰」疑同一人，待确认')
ON CONFLICT (shareholder_code) DO NOTHING;

-- 2. 万象 40% 股权行从薛峰改指向薛刚（保留 equity_ratio=40；幂等：已改则 WHERE 不命中）
-- 自愈幂等：若薛刚(GANG)行已存在(phase1 直接种 / 前次已重指向)，删除可能残留的薛峰(FENG)行，避免重复键
DELETE FROM shr_project_equity
WHERE project_code = 'SHR-VTE-FOOD' AND shareholder_code = 'SHR-XUE-FENG'
  AND EXISTS (SELECT 1 FROM shr_project_equity g WHERE g.project_code = 'SHR-VTE-FOOD' AND g.shareholder_code = 'SHR-XUE-GANG');
-- 首次重指向：仅当薛刚行尚不存在时，将薛峰行改指向薛刚
UPDATE shr_project_equity
SET shareholder_code = 'SHR-XUE-GANG', updated_at = now()
WHERE project_code = 'SHR-VTE-FOOD' AND shareholder_code = 'SHR-XUE-FENG'
  AND NOT EXISTS (SELECT 1 FROM shr_project_equity g WHERE g.project_code = 'SHR-VTE-FOOD' AND g.shareholder_code = 'SHR-XUE-GANG');

-- 标记薛峰档案（已被薛刚取代，待确认）
UPDATE shr_shareholders SET remark = '万象股权已归 SHR-XUE-GANG(薛刚)，疑同一人，待确认', updated_at = now()
WHERE shareholder_code = 'SHR-XUE-FENG';

-- 3. 项目总实缴资本
UPDATE shr_projects SET total_paid_in_capital = 5454049.69, updated_at = now()
WHERE project_code = 'SHR-VTE-FOOD';

-- 4. 股东实缴 + 实缴占比 + 来源（不覆盖 equity_ratio）
UPDATE shr_project_equity e SET
  paid_in_capital = v.paid,
  capital_ratio   = round(v.paid / 5454049.69 * 100, 2),
  paid_in_source  = 'CAPITAL_SUMMARY_IMPORT',
  updated_at      = now()
FROM (VALUES
  ('SHR-ZHAO-YONGWEI', 3511508.00),  -- 赵永伟 64.38%
  ('SHR-ZHU-ZHAOCUN',  1397151.69),  -- 朱兆存 25.62%
  ('SHR-XUE-GANG',      545390.00)   -- 薛刚 10.00%
) AS v(shr_code, paid)
WHERE e.project_code = 'SHR-VTE-FOOD' AND e.shareholder_code = v.shr_code;

COMMIT;

-- 预期占比：赵永伟 64.38% / 朱兆存 25.62% / 薛刚 10.00%（合计 100.00%；任务标 25.61%，±0.01% 容差内）
