-- ═════════════════════════════════════════════════════════════════════════════
-- MDM-1 §4-1: brd_farms 增加 mapped_site_code + 回填
-- ═════════════════════════════════════════════════════════════════════════════
-- 业务背景：brd_farms 是养殖业务历史表，与 sys_organizations.SITE 重复建档。
-- 本 migration 不删 farm_code、不改主键，仅添加 mapped_site_code 字段反向引用
-- sys_organizations.org_code (SITE)，业务后续以 site_code 为准。
--
-- 幂等 + 未在生产 DB 执行。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE brd_farms
  ADD COLUMN IF NOT EXISTS mapped_site_code VARCHAR(64);

COMMENT ON COLUMN brd_farms.mapped_site_code IS
  '映射到 sys_organizations.org_code (org_type=SITE) 的 canonical 站点编码。'
  '业务查询应以 mapped_site_code 为准；farm_code 仅保留为历史兼容键。';

CREATE INDEX IF NOT EXISTS idx_brd_farms_mapped_site ON brd_farms (mapped_site_code);

-- ── 回填（基于 MDM-0 审计）─────────────────────────────────────────────────
-- 孟赛场 3 行（LPH_MENGSAI / FARM001 / FARM-MS）→ SITE-MENGSAI-LAYER
UPDATE brd_farms SET mapped_site_code='SITE-MENGSAI-LAYER'
 WHERE farm_code IN ('LPH_MENGSAI','FARM001','FARM-MS')
   AND (mapped_site_code IS NULL OR mapped_site_code = '');

-- 东鹏场 → SITE-DONGPENG-LAYER
UPDATE brd_farms SET mapped_site_code='SITE-DONGPENG-LAYER'
 WHERE farm_code = 'FARM-DP'
   AND (mapped_site_code IS NULL OR mapped_site_code = '');

-- FARM-01 「凤羽一号基地」── 待业务方确认对应 SITE，本次不回填

-- 校验：所有未回填的 brd_farms 行打印警告
DO $$
DECLARE
  unmapped INT;
BEGIN
  SELECT count(*) INTO unmapped FROM brd_farms
   WHERE mapped_site_code IS NULL OR mapped_site_code = '';
  IF unmapped > 0 THEN
    RAISE NOTICE 'brd_farms 仍有 % 行未映射 site_code（需业务方确认），见：', unmapped;
    PERFORM (SELECT format('  farm_code=% farm_name=%', farm_code, farm_name)
               FROM brd_farms WHERE mapped_site_code IS NULL OR mapped_site_code='');
  END IF;
END $$;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- 验证：
--   SELECT farm_code, farm_name, mapped_site_code FROM brd_farms ORDER BY farm_code;
--   -- 期望：LPH_MENGSAI/FARM001/FARM-MS → SITE-MENGSAI-LAYER
--   --       FARM-DP → SITE-DONGPENG-LAYER
--   --       FARM-01 → NULL（待业务确认）
-- ═════════════════════════════════════════════════════════════════════════════
