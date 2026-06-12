-- ════════════════════════════════════════════════════════════════════════
-- G87 养殖场挂靠公司 — 补数据范围真空点 #1（孤儿维度归位）
-- ────────────────────────────────────────────────────────────────────────
-- 背景：brd_farms 无公司归属列，养殖数据无法从公司维度推导（绑公司的用户
--      "理应看本公司的场"推不出来，只能逐人手工补 farm_scopes）。
-- 模型：树管从属继承（集团→事业部→公司），公司之下场站/养殖场/仓库/项目为
--      「公司拥有的资源维度」——本迁移让 farm 维度归位。
-- 回填依据：孟赛/东鹏蛋鸡场均属老挝凤凰农业（与 biz_projects 种子
--      PRJ_MENGSAI_LAYER / PRJ_DONGPENG_LAYER 的 company_code 一致）。
-- 幂等：ADD COLUMN IF NOT EXISTS；UPDATE 仅回填 NULL 行。
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE brd_farms ADD COLUMN IF NOT EXISTS company_code VARCHAR(64);

UPDATE brd_farms SET company_code = 'COMP-LAO-AGRI'
WHERE farm_code IN ('FARM-MS', 'FARM-DP') AND company_code IS NULL;

CREATE INDEX IF NOT EXISTS idx_brd_farms_company ON brd_farms (company_code) WHERE company_code IS NOT NULL;
