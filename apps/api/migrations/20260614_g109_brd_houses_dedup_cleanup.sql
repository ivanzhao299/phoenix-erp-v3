-- ════════════════════════════════════════════════════════════════════════
-- G109 鸡舍主数据去重 + demo 清理（硬删除，2026-06-14）
-- ────────────────────────────────────────────────────────────────────────
-- 背景（brd_houses 三套打架，孟赛实际 6 间舍却存了 15 行）：
--   · LPH_MS_H1..H6  —— 权威·在用（LPH_MS_F02..F06 鸡群引用，孟赛全绑）→ 保留
--   · HOUSE_MS_01..06 —— 废弃重复集（零鸡群引用）→ 删
--   · H-01..03 + FL-2024-001..003 —— demo/seed 残留（鸡舍无 farm/site/company 映射）→ 删
-- 用户决策：硬删除；保留 LPH_MS_H*。
-- ⚠️ 防御性：① 鸡群只按 demo flock_no(FL-2024-00x) 精确删，绝不按 house_code 误删真实鸡群；
--            ② 鸡舍仅在"无任何鸡群且无任何日报引用"时才删——生产若意外有真实数据则自动跳过(安全)。
--    brd_* 表走 generic-crud 无硬 FK；to_regclass 守卫防 CI 无表。用户已授权 brd_* DML。
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ① 删 demo 鸡群（仅按精确 flock_no，不波及真实鸡群）
DO $$
BEGIN
  IF to_regclass('public.brd_flocks') IS NOT NULL THEN
    DELETE FROM brd_flocks
     WHERE flock_no IN ('FL-2024-001','FL-2024-002','FL-2024-003');
  END IF;
END $$;

-- ② 删 demo 鸡群残留的日报（按 demo house_code；正常孟赛日报挂 LPH_MS_H*，不受影响）
DO $$
BEGIN
  IF to_regclass('public.brd_daily_logs') IS NOT NULL THEN
    DELETE FROM brd_daily_logs
     WHERE house_code IN ('H-01','H-02','H-03',
                          'HOUSE_MS_01','HOUSE_MS_02','HOUSE_MS_03',
                          'HOUSE_MS_04','HOUSE_MS_05','HOUSE_MS_06');
  END IF;
END $$;

-- ③ 删废弃/demo 鸡舍——仅当无任何鸡群、无任何日报引用时（防生产误删）
DO $$
BEGIN
  IF to_regclass('public.brd_houses') IS NOT NULL THEN
    DELETE FROM brd_houses h
     WHERE h.house_code IN ('HOUSE_MS_01','HOUSE_MS_02','HOUSE_MS_03',
                            'HOUSE_MS_04','HOUSE_MS_05','HOUSE_MS_06',
                            'H-01','H-02','H-03')
       AND NOT EXISTS (SELECT 1 FROM brd_flocks f      WHERE f.house_code = h.house_code)
       AND (to_regclass('public.brd_daily_logs') IS NULL
            OR NOT EXISTS (SELECT 1 FROM brd_daily_logs l WHERE l.house_code = h.house_code));
  END IF;
END $$;

COMMIT;
