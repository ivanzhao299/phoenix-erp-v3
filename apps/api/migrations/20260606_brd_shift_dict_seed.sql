-- ═════════════════════════════════════════════════════════════════════════════
-- BRD_SHIFT 字典 seed — 养殖生产日报班次
-- ═════════════════════════════════════════════════════════════════════════════
-- 背景：apps/web/.../breeding/daily/page.tsx 长期硬编码 '早班' / '晚班' 两个
-- 中文字符串作为 brd_daily_logs.shift 字段值，无字典约束 → i18n 不可翻译、
-- 业务方加"中班/夜班"需改前端代码。
--
-- 收口：与孟赛实际生产排班对齐，启用 DAY / NIGHT 2 档；i18n 三语标签齐全。
-- 后续如需中班可在主数据中心直接新增 dict_code，前端 DictSelect 自动渲染。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='sys_dict') THEN
    RAISE NOTICE '[brd_shift_dict_seed] sys_dict 不存在（CI 测试环境），跳过';
    RETURN;
  END IF;

  EXECUTE $$INSERT INTO sys_dict (dict_code, dict_type, dict_label_zh, dict_label_lo, dict_label_en, sort_no, status)
            VALUES
              ('DAY',   'BRD_SHIFT', '早班', 'ກະເຊົ້າ', 'Day shift',   10, 'ACTIVE'),
              ('NIGHT', 'BRD_SHIFT', '晚班', 'ກະຄ່ຳ',  'Night shift', 20, 'ACTIVE')
            ON CONFLICT (dict_code, dict_type) DO UPDATE
              SET dict_label_zh = EXCLUDED.dict_label_zh,
                  dict_label_lo = EXCLUDED.dict_label_lo,
                  dict_label_en = EXCLUDED.dict_label_en,
                  sort_no       = EXCLUDED.sort_no,
                  status        = 'ACTIVE'$$;

  RAISE NOTICE '[brd_shift_dict_seed] BRD_SHIFT 2 档 DAY/NIGHT 已 seed';
END $body$;

COMMIT;

-- ─── 回滚 ───────────────────────────────────────────
--   DELETE FROM sys_dict WHERE dict_type='BRD_SHIFT';
