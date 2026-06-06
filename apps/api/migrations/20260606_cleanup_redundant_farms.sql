-- ═════════════════════════════════════════════════════════════════════════════
-- 清理 brd_farms 重复孟赛记录
-- ═════════════════════════════════════════════════════════════════════════════
-- 业务方授权（2026-06-06）：FARM-MS / FARM001 与 LPH_MENGSAI 是孟赛蛋鸡场的
-- 同实体重复建档（sys_store 老编码 / Phase 10E 测试 seed 遗留）。
-- 已确认 0 业务引用（brd_houses/brd_flocks/brd_daily_logs 全部指向 LPH_MENGSAI）。
-- biz_site_aliases 保留 FARM-MS / FARM001 → SITE-MENGSAI-LAYER 的映射历史。
--
-- 最终 brd_farms 状态：
--   · FARM-DP     东鹏蛋鸡场 → SITE-DONGPENG-LAYER（占位，未来业务方做东鹏数据）
--   · LPH_MENGSAI 孟赛蛋鸡场 → SITE-MENGSAI-LAYER（真实生产）
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;
DELETE FROM brd_farms WHERE farm_code IN ('FARM-MS', 'FARM001');
COMMIT;
