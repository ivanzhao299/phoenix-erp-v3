-- ═════════════════════════════════════════════════════════════════════════════
-- G19-A · brd_daily_logs 加 mortality_reason 列
-- ═════════════════════════════════════════════════════════════════════════════
-- 业务方反馈"死淘登记和产蛋录入放在一个页面"，G19-A 将 daily 字段重构为
-- 三组分块（产蛋/死淘/环境）。死淘组需 deaths + reason，但 brd_daily_logs
-- 已有 culling_reason（淘汰原因），缺 mortality_reason（死亡原因）。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $body$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='brd_daily_logs') THEN
    EXECUTE 'ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS mortality_reason VARCHAR(64)';
    RAISE NOTICE '[g19-a] brd_daily_logs.mortality_reason 加列完成';
  END IF;
END $body$;

COMMIT;
