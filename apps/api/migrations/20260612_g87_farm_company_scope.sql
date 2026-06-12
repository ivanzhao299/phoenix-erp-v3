-- ════════════════════════════════════════════════════════════════════════
-- G87 养殖场挂靠公司 — 补数据范围真空点 #1（孤儿维度归位）
-- ────────────────────────────────────────────────────────────────────────
-- 背景：brd_farms 无公司归属列，养殖数据无法从公司维度推导（绑公司的用户
--      "理应看本公司的场"推不出来，只能逐人手工补 farm_scopes）。
-- 模型：树管从属继承（集团→事业部→公司），公司之下场站/养殖场/仓库/项目为
--      「公司拥有的资源维度」——本迁移让 farm 维度归位。
-- 回填【G87-B 勘误】：孟赛 → 老挝凤凰农业；东鹏 → 老挝金三角特区星驰养鸡场
--      （原版误把东鹏也回填 AGRI——错误依据是 biz_projects 种子同错；
--        用户确认 + G81 东鹏直营店挂星驰佐证。东鹏由 20260612_g87b 纠正。）
-- 守卫：brd_farms 仅存在于生产库（CI 测试库无此表，建表不在 ddl/v3_schema 清单
--      内——参照 R3 迁移同款 to_regclass 守卫），表不存在则整体跳过。
-- 幂等：ADD COLUMN IF NOT EXISTS；UPDATE 仅回填 NULL 行。
-- ════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regclass('public.brd_farms') IS NOT NULL THEN
    ALTER TABLE brd_farms ADD COLUMN IF NOT EXISTS company_code VARCHAR(64);

    UPDATE brd_farms SET company_code = 'COMP-LAO-AGRI'
    WHERE farm_code = 'FARM-MS' AND company_code IS NULL;
    UPDATE brd_farms SET company_code = 'COMP-LAO-XINGCHI'
    WHERE farm_code = 'FARM-DP' AND company_code IS NULL;

    CREATE INDEX IF NOT EXISTS idx_brd_farms_company ON brd_farms (company_code) WHERE company_code IS NOT NULL;
  END IF;
END $$;
