-- ═════════════════════════════════════════════════════════════════════════════
-- 清理 Phase 10E onboarding 鬼影数据
-- ═════════════════════════════════════════════════════════════════════════════
-- 业务方授权（2026-06-06）：FARM-01 凤羽一号基地确认是模拟测试数据，无业务用途。
-- 同时连带的 7 个鸡舍（A001-A006, B001）+ 7 个鸡群（FLK-A*-2026）也是 Phase 10E
-- onboarding 测试数据，名字与孟赛真实"1-6 号鸡舍"重复，造成业务方混乱。
--
-- 配套：generic-crud.service.ts onModuleInit() 中的 Phase 10E seed 已禁用，
-- 删除后不会因 API 重启复活。
--
-- 不删 FARM001 / FARM-MS：这两个虽与 LPH_MENGSAI 同实体重复建档，但已通过
-- MDM-1 alias 映射到 SITE-MENGSAI-LAYER，业务方可在主数据中心手动归并。
--
-- 幂等：DELETE 不存在的行不报错。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) 删 brd_flocks（鸡群必须先删，避免 FK 残留）
DELETE FROM brd_flocks WHERE farm_code = 'FARM-01';

-- 2) 删 brd_houses（Phase 10E 测试鸡舍 A001-A006 + B001）
DELETE FROM brd_houses
 WHERE house_code IN ('A001','A002','A003','A004','A005','A006','B001');

-- 3) 删 brd_farms FARM-01 凤羽一号基地
DELETE FROM brd_farms WHERE farm_code = 'FARM-01';

COMMIT;
