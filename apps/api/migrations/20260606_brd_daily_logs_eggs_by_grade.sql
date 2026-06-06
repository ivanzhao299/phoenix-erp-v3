-- ═════════════════════════════════════════════════════════════════════════════
-- brd_daily_logs 增加 eggs_by_grade JSONB 列（产蛋按 9 档分解）
-- ═════════════════════════════════════════════════════════════════════════════
-- 背景：
--   原 brd_daily_logs 用 3 列 eggs_produced / dirty_eggs / broken_eggs 记录产蛋，
--   无法表达孟赛真实业务的"按尺寸分档"（XL/L/M/S/XS）+ 异常档（DIRTY/CRACKED/
--   BROKEN/DAMAGED）。这导致 daily-inbound 录入的 9 档批次与日报无法对齐 —
--   宋明光在日报录 5000，在入库分 XL=2000/L=1500/M=500 = 4000，少 1000 无人觉察。
--
-- 修法：
--   1) 加 eggs_by_grade JSONB 列，结构：{ XL:1000, L:2000, M:500, ..., BROKEN:20 }
--      keys 来自 product_grades.grade_code（与 inv_batches.grade_code_std 同源）。
--   2) 历史 eggs_produced 仍保留作为汇总值（前端展示用），
--      eggs_by_grade 是更细颗粒的权威字段；新写入两者同时填，老数据 eggs_by_grade=null。
--   3) 后端 daily-logs POST 接受 eggs_by_grade，自动反推 eggs_produced =
--      Σ(saleable grades) + dirty_eggs = DIRTY + broken_eggs = BROKEN（保兼容）。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='brd_daily_logs') THEN
    RAISE NOTICE '[brd_daily_logs_eggs_by_grade] brd_daily_logs 不存在（CI），跳过';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS eggs_by_grade JSONB';
  EXECUTE $$COMMENT ON COLUMN brd_daily_logs.eggs_by_grade IS
            '按 product_grades 9 档分解的产蛋数量，例 {"XL":1000,"L":2000,"M":500,"DIRTY":30,"BROKEN":20}；
             写入时与 eggs_produced/dirty_eggs/broken_eggs 保持一致（汇总值）'$$;

  -- 索引：业务查询常按日期+鸡舍范围查 eggs_by_grade，建 GIN 加速 JSONB 查询
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_brd_daily_logs_eggs_by_grade ON brd_daily_logs USING GIN (eggs_by_grade)';

  RAISE NOTICE '[brd_daily_logs_eggs_by_grade] eggs_by_grade JSONB + GIN 索引已就绪';
END $body$;

COMMIT;

-- ─── 回滚 ───────────────────────────────────────────
--   DROP INDEX IF EXISTS idx_brd_daily_logs_eggs_by_grade;
--   ALTER TABLE brd_daily_logs DROP COLUMN IF EXISTS eggs_by_grade;
