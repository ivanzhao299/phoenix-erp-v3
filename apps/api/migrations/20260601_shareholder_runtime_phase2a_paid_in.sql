-- ============================================================
-- Shareholder Runtime Phase 2A — 历史实缴出资口径
-- 原则：只记录【实际出资】，不建立 应缴/未缴/差额 口径。
--   · 新增 equity_status（CONFIRMED/PROVISIONAL）到项目与股权结构
--   · 东鹏=CONFIRMED；孟赛/万象=PROVISIONAL（最终股权可能按实际投资调整）
--   · 保留 unpaid_capital GENERATED 字段（不删），但前端/Dashboard 隐藏
-- 幂等：ADD COLUMN IF NOT EXISTS + UPDATE WHERE
-- ============================================================
BEGIN;

ALTER TABLE shr_projects        ADD COLUMN IF NOT EXISTS equity_status VARCHAR(32) NOT NULL DEFAULT 'PROVISIONAL';
ALTER TABLE shr_project_equity  ADD COLUMN IF NOT EXISTS equity_status VARCHAR(32) NOT NULL DEFAULT 'PROVISIONAL';

-- 项目股权状态：东鹏已确认，孟赛/万象暂定
UPDATE shr_projects SET equity_status = 'CONFIRMED'   WHERE project_code = 'SHR-DONGPENG-LAYER' AND equity_status <> 'CONFIRMED';
UPDATE shr_projects SET equity_status = 'PROVISIONAL' WHERE project_code IN ('SHR-MENGSAI-LAYER','SHR-VTE-FOOD') AND equity_status <> 'PROVISIONAL';

-- 股权结构 equity_status 与项目一致
UPDATE shr_project_equity e SET equity_status = p.equity_status
FROM shr_projects p
WHERE e.project_code = p.project_code AND e.equity_status <> p.equity_status;

COMMIT;
