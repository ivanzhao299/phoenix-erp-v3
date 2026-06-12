-- ═════════════════════════════════════════════════════════════════════════════
-- MDM-1 §2: biz_projects 统一项目主表 + 初始 seed
-- ═════════════════════════════════════════════════════════════════════════════
-- 业务背景：
--   现有 prc2_projects 表为空（0 行），shr_projects 仅 3 个股东项目，无统一项
--   目主数据源。本表建立"公司 × 项目"统一主数据。
--
--   公司必须引用 sys_organizations.org_type='COMPANY'。
--   项目废止用 status='INACTIVE' 或 deleted_at；不删除不重用 project_code。
--
-- 幂等：CREATE TABLE IF NOT EXISTS + NOT EXISTS seed 守卫。
-- 【勘误 2026-06-12 G85-C】本 migration 已于 2026-06-05 在生产执行（commit 737580a），
--   生产 /api/biz/projects/active 有真实 ACTIVE 数据。原"未在生产执行"注释过时，
--   曾误导 G85 审计产生 F6 误报，特此修正。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) 主表 ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS biz_projects (
  id                  BIGSERIAL PRIMARY KEY,
  project_code        VARCHAR(64)  NOT NULL,
  project_name        VARCHAR(200) NOT NULL,
  project_short_name  VARCHAR(64),
  project_type        VARCHAR(32)  NOT NULL DEFAULT 'OPERATION',
    -- INVESTMENT / OPERATION / COST_CENTER / PROFIT_CENTER
  company_code        VARCHAR(64)  NOT NULL,
    -- 必须引用 sys_organizations.org_code (org_type='COMPANY')
  accounting_subject  VARCHAR(64),
  budget_amount       NUMERIC(18,2) DEFAULT 0,
  budget_currency     VARCHAR(8)  DEFAULT 'LAK',
  start_date          DATE,
  end_date            DATE,
  status              VARCHAR(32)  NOT NULL DEFAULT 'ACTIVE',
    -- ACTIVE / INACTIVE / DRAFT / FROZEN / CLOSED / ARCHIVED
  manager_user_id     BIGINT,
  manager_name        VARCHAR(128),
  sort_order          INT          NOT NULL DEFAULT 0,
  remark              TEXT,
  created_by          VARCHAR(80),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

-- 唯一约束（active rows 即未软删的行）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname='public' AND indexname='uq_biz_projects_code'
  ) THEN
    CREATE UNIQUE INDEX uq_biz_projects_code ON biz_projects (project_code)
      WHERE deleted_at IS NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_biz_projects_company ON biz_projects (company_code);
CREATE INDEX IF NOT EXISTS idx_biz_projects_status  ON biz_projects (status);

COMMENT ON TABLE biz_projects IS
  'MDM-1 统一项目主表。公司归属强制引用 sys_organizations (org_type=COMPANY)。'
  'project_code 一旦发布即不可变；废止用 status=INACTIVE 或软删除。';

-- ── 2) 与 sys_organizations 的引用完整性（CHECK，不用 FK 避免 cross-deployment 风险）──
-- 不强制 FK：只在业务层校验，避免迁移历史遗留数据时 FK 报错
-- 但加 trigger 校验：
CREATE OR REPLACE FUNCTION fn_biz_projects_check_company() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.company_code IS NULL THEN
    RAISE EXCEPTION 'biz_projects.company_code 不能为空';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM sys_organizations
     WHERE org_code = NEW.company_code AND org_type = 'COMPANY' AND status='ACTIVE'
  ) THEN
    RAISE EXCEPTION 'biz_projects.company_code=% 在 sys_organizations 中无对应 COMPANY (ACTIVE)', NEW.company_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_biz_projects_check_company ON biz_projects;
CREATE TRIGGER trg_biz_projects_check_company
  BEFORE INSERT OR UPDATE ON biz_projects
  FOR EACH ROW EXECUTE FUNCTION fn_biz_projects_check_company();

-- ── 3) 初始 seed ────────────────────────────────────────────────────────────
-- 3.1 PRJ_MENGSAI_LAYER 孟赛蛋鸡项目
INSERT INTO biz_projects (project_code, project_name, project_short_name, project_type, company_code, status, sort_order, remark)
SELECT 'PRJ_MENGSAI_LAYER', '孟赛蛋鸡场经营项目', '孟赛蛋鸡', 'OPERATION', 'COMP-LAO-AGRI', 'ACTIVE', 10,
       '孟赛蛋鸡养殖场（SITE-MENGSAI-LAYER）经营项目'
WHERE NOT EXISTS (SELECT 1 FROM biz_projects WHERE project_code='PRJ_MENGSAI_LAYER');

-- 3.2 PRJ_DONGPENG_LAYER 东鹏蛋鸡项目
--   【G87-B 勘误 2026-06-12】东鹏属 老挝金三角星驰农业（COMP-LAO-XINGCHI），原种子错写 AGRI；
--   生产存量行由 20260612_g87b_dongpeng_company_fix.sql 纠正。
INSERT INTO biz_projects (project_code, project_name, project_short_name, project_type, company_code, status, sort_order, remark)
SELECT 'PRJ_DONGPENG_LAYER', '东鹏蛋鸡场经营项目', '东鹏蛋鸡', 'OPERATION', 'COMP-LAO-XINGCHI', 'ACTIVE', 20,
       '东鹏蛋鸡养殖场（SITE-DONGPENG-LAYER）经营项目'
WHERE NOT EXISTS (SELECT 1 FROM biz_projects WHERE project_code='PRJ_DONGPENG_LAYER');

-- 3.3 PRJ_VIENTIANE_FOOD 万象食品项目
INSERT INTO biz_projects (project_code, project_name, project_short_name, project_type, company_code, status, sort_order, remark)
SELECT 'PRJ_VIENTIANE_FOOD', '万象食品综合项目', '万象食品', 'OPERATION', 'COMP-LAO-FOOD', 'ACTIVE', 30,
       '万象饲料厂/屠宰加工厂/肉鸡养殖场综合经营项目（含 SITE-VTE-FEED/SLAUGHTER/BROILER）'
WHERE NOT EXISTS (SELECT 1 FROM biz_projects WHERE project_code='PRJ_VIENTIANE_FOOD');

-- 3.4 PRJ_MENGSAI_HATCHERY 孟赛孵化场项目（业务方可裁剪）
INSERT INTO biz_projects (project_code, project_name, project_short_name, project_type, company_code, status, sort_order, remark)
SELECT 'PRJ_MENGSAI_HATCHERY', '孟赛孵化场经营项目', '孟赛孵化', 'OPERATION', 'COMP-LAO-AGRI', 'DRAFT', 40,
       '孟赛孵化场（SITE-MENGSAI-HATCHERY，当前 PLANNED 状态）'
WHERE NOT EXISTS (SELECT 1 FROM biz_projects WHERE project_code='PRJ_MENGSAI_HATCHERY');

-- 3.6 PRJ_MENGSAI_ORGANIC 孟赛有机肥项目
INSERT INTO biz_projects (project_code, project_name, project_short_name, project_type, company_code, status, sort_order, remark)
SELECT 'PRJ_MENGSAI_ORGANIC', '孟赛有机肥生产项目', '孟赛有机肥', 'OPERATION', 'COMP-LAO-AGRI', 'DRAFT', 50,
       '孟赛有机肥生产厂（SITE-MENGSAI-ORGANIC，当前 PLANNED 状态）'
WHERE NOT EXISTS (SELECT 1 FROM biz_projects WHERE project_code='PRJ_MENGSAI_ORGANIC');

-- 3.7 PRJ_XINGCHI_LAYER 星驰养鸡项目
INSERT INTO biz_projects (project_code, project_name, project_short_name, project_type, company_code, status, sort_order, remark)
SELECT 'PRJ_XINGCHI_LAYER', '金三角特区星驰养鸡项目', '星驰', 'OPERATION', 'COMP-LAO-XINGCHI', 'DRAFT', 60,
       '星驰养鸡场（金三角特区）经营项目 · 公司：老挝东鹏星驰农业发展有限公司'
WHERE NOT EXISTS (SELECT 1 FROM biz_projects WHERE project_code='PRJ_XINGCHI_LAYER');

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- 验证：
--   SELECT count(*) FROM biz_projects WHERE deleted_at IS NULL;  -- 期望 6
--   SELECT project_code, project_name, company_code, status FROM biz_projects
--     ORDER BY sort_order;
-- ═════════════════════════════════════════════════════════════════════════════
