-- ════════════════════════════════════════════════════════════════════════
-- G102 班次统一口径 — 早班/晚班（中文，含时间）；清理其余一切班次（2026-06-13）
-- ────────────────────────────────────────────────────────────────────────
-- 用户决策：所有（养殖）班次统一成一个口径，先用中文——早班 / 晚班，可定义时间；
--   其余班次（中班 / DAY / NIGHT / MORNING / EVENING / BRD_SHIFT_* 代码）全部清理。
-- 处置：
--   ① BRD_SHIFT 字典 → 删非「早班/晚班」行，立 早班(06:00-18:00)/晚班(18:00-06:00)。
--      dict_value=dict_code=中文，使 PC(useDictOptions) 与手机(egglog) 提交值一致。
--   ② 既有 brd_daily_logs.shift 数据迁移到 早班/晚班：
--        MORNING/BRD_SHIFT_MORNING/DAY/BRD_SHIFT_DAY/中班 → 早班
--        EVENING/BRD_SHIFT_EVENING/NIGHT/BRD_SHIFT_NIGHT  → 晚班
--      （'ALL' = 死淘日汇总标记、非用户班次，保留不动。）
-- ⚠️ 用户已授权本次班次数据/字典清理（sys_dict + brd_daily_logs DML）。to_regclass 守卫防 CI 无表。
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ① BRD_SHIFT 字典：清旧 + 立中文 早班/晚班（含时间 config_json）
DO $$
BEGIN
  IF to_regclass('public.sys_dict') IS NOT NULL THEN
    DELETE FROM sys_dict WHERE dict_type='BRD_SHIFT' AND dict_code NOT IN ('早班','晚班');

    -- 时间定义（早班 06-18 / 晚班 18-06）待部署健康后再以 config_json 单独补，避免列差异风险。
    INSERT INTO sys_dict (dict_type, dict_code, dict_label_zh, dict_label_en, dict_value, sort_no, status)
    SELECT v.dict_type, v.dict_code, v.dict_label_zh, v.dict_label_en, v.dict_value, v.sort_no, 'ACTIVE'
    FROM (VALUES
      ('BRD_SHIFT','早班','早班','Day Shift',  '早班',1),
      ('BRD_SHIFT','晚班','晚班','Night Shift','晚班',2)
    ) AS v(dict_type,dict_code,dict_label_zh,dict_label_en,dict_value,sort_no)
    WHERE NOT EXISTS (SELECT 1 FROM sys_dict d WHERE d.dict_type='BRD_SHIFT' AND d.dict_code=v.dict_code);
  END IF;
END $$;

-- ② 既有日报 shift 数据迁移到 早班/晚班（保留 ALL 日汇总）
DO $$
BEGIN
  IF to_regclass('public.brd_daily_logs') IS NOT NULL THEN
    UPDATE brd_daily_logs SET shift='早班'
      WHERE shift IN ('MORNING','BRD_SHIFT_MORNING','DAY','BRD_SHIFT_DAY','中班');
    UPDATE brd_daily_logs SET shift='晚班'
      WHERE shift IN ('EVENING','BRD_SHIFT_EVENING','NIGHT','BRD_SHIFT_NIGHT');
  END IF;
END $$;

COMMIT;
