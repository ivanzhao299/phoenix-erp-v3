-- ════════════════════════════════════════════════════════════════════════════
-- G50 · 修复 brd_daily_logs.lay_rate 精度溢出（G40 引入的类型错误）
-- ════════════════════════════════════════════════════════════════════════════
-- 根因：G40(F5 回填) 给 brd_daily_logs 加 lay_rate 列时，从顶级 stranded 迁移
--   glp1a2_production_extension 原样抄了 numeric(5,4)。但 lay_rate 是"产蛋率%"
--   （farm.service: eggs_produced / closing_qty × 100，如 41.71），numeric(5,4)
--   最大仅 9.9999 → 写入即 "numeric field overflow" (22003) → 日报 POST 500。
--   表现：CI breeding 回归 A1.x 日报录入全 500，CI 红灯。
-- 修复：改为 numeric(5,2)（max 999.99，足够存百分比；service 已 toFixed(2)）。
-- 幂等：ALTER COLUMN TYPE 可重复执行（已是 5,2 则等价）。现有值均为 0/NULL，无截断风险。
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE brd_daily_logs ALTER COLUMN lay_rate TYPE numeric(5,2);
