-- ═════════════════════════════════════════════════════════════════════════════
-- BRD_SHIFT 字典清理：撤销冗余 seed
-- ═════════════════════════════════════════════════════════════════════════════
-- 背景：20260606_brd_shift_dict_seed.sql 误以为 BRD_SHIFT 是新字典，加了
-- DAY/NIGHT 2 行。实际生产 DB 早已存在 BRD_SHIFT_MORNING / BRD_SHIFT_EVENING /
-- BRD_SHIFT_NIGHT / BRD_SHIFT_DAY 4 行（中文/英文齐，老挝语 lo 空）。
-- 6 行同字典会让前端 useDictOptions 渲染 6 个班次行 → 录入混乱。
--
-- 修法：
--   1) DELETE 我错加的 DAY/NIGHT 2 行（dict_label_lo 老挝语回退到既有 _MORNING 等）
--   2) UPDATE 给既有 4 行补 dict_label_lo（如果业务方需要）—— 本 mig 暂不补，
--      让业务方在主数据中心 UI 补 lo 翻译；后续可再加 UPDATE
--   3) 前端 daily 页面 fallback codes 改为 BRD_SHIFT_MORNING / BRD_SHIFT_EVENING
--      （与既有字典对齐）。改动在 apps/web/.../daily/page.tsx 同 commit。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $body$
DECLARE
  deleted_count INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='sys_dict') THEN
    RAISE NOTICE '[brd_shift_dict_cleanup] sys_dict 不存在（CI），跳过';
    RETURN;
  END IF;

  -- 仅删我刚 seed 的 DAY/NIGHT 两行，避免误删业务方未来手动新增的同名行
  EXECUTE $$DELETE FROM sys_dict
            WHERE dict_type='BRD_SHIFT'
              AND dict_code IN ('DAY','NIGHT')
              AND dict_label_en IN ('Day shift','Night shift')$$;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE '[brd_shift_dict_cleanup] 删除冗余 DAY/NIGHT % 行；保留既有 BRD_SHIFT_MORNING/EVENING/NIGHT/DAY 4 行', deleted_count;
END $body$;

COMMIT;

-- ─── 回滚（如需恢复）───────────────────────────────────────
--   INSERT INTO sys_dict (dict_code, dict_type, dict_label_zh, dict_label_lo, dict_label_en, sort_no, status)
--     VALUES ('DAY','BRD_SHIFT','早班','ກະເຊົ້າ','Day shift',10,'ACTIVE'),
--            ('NIGHT','BRD_SHIFT','晚班','ກະຄ່ຳ','Night shift',20,'ACTIVE');
