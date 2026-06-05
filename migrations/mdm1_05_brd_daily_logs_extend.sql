-- ═════════════════════════════════════════════════════════════════════════════
-- MDM-1 §5: brd_daily_logs 增加 company_code / project_code / site_code 三字段
-- ═════════════════════════════════════════════════════════════════════════════
-- 业务背景：
--   brd_daily_logs 当前只有 farm_code + store_code（双轨过滤）+ farm_name
--   （名称做关联依据）。缺 company_code / project_code / site_code，导致：
--   1. 跨公司汇总报表无法分公司
--   2. 项目成本归集无源
--   3. DataScope 按 company/site 过滤无字段可用
--
--   本 migration：
--   · 加 3 字段（保留 farm_code / store_code 不动）
--   · 回填规则：
--     - farm_code 通过 biz_site_aliases (FARM_CODE) 反查 site_code
--     - site_code='SITE-MENGSAI-LAYER' 的行 → company_code='COMP-LAO-AGRI' + project_code='PRJ_MENGSAI_LAYER'
--     - site_code='SITE-DONGPENG-LAYER' 的行 → company_code='COMP-LAO-AGRI' + project_code='PRJ_DONGPENG_LAYER'
--   · 未能映射的行写入审计 NOTICE
--
-- 幂等。**未在生产 DB 执行**。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE brd_daily_logs
  ADD COLUMN IF NOT EXISTS company_code  VARCHAR(64),
  ADD COLUMN IF NOT EXISTS project_code  VARCHAR(64),
  ADD COLUMN IF NOT EXISTS site_code     VARCHAR(64),
  ADD COLUMN IF NOT EXISTS business_date DATE;
  -- business_date 显式日期字段（之前用 log_date，本次新增统一字段）

COMMENT ON COLUMN brd_daily_logs.company_code IS '所属公司，引用 sys_organizations.org_code (COMPANY)';
COMMENT ON COLUMN brd_daily_logs.project_code IS '所属项目，引用 biz_projects.project_code';
COMMENT ON COLUMN brd_daily_logs.site_code    IS '所属站点，引用 sys_organizations.org_code (SITE)';
COMMENT ON COLUMN brd_daily_logs.business_date IS '业务发生日期（同 log_date，新统一字段）';

CREATE INDEX IF NOT EXISTS idx_brd_daily_company  ON brd_daily_logs (company_code);
CREATE INDEX IF NOT EXISTS idx_brd_daily_project  ON brd_daily_logs (project_code);
CREATE INDEX IF NOT EXISTS idx_brd_daily_site     ON brd_daily_logs (site_code);
CREATE INDEX IF NOT EXISTS idx_brd_daily_bizdate  ON brd_daily_logs (business_date);
CREATE INDEX IF NOT EXISTS idx_brd_daily_site_date ON brd_daily_logs (site_code, business_date);

-- ── 回填 site_code ──────────────────────────────────────────────────────────
-- 1) 通过 farm_code 反查 biz_site_aliases (FARM_CODE)
UPDATE brd_daily_logs d
   SET site_code = a.site_code
  FROM biz_site_aliases a
 WHERE a.alias_type = 'FARM_CODE'
   AND a.status = 'ACTIVE'
   AND a.alias_code = d.farm_code
   AND (d.site_code IS NULL OR d.site_code = '');

-- 2) 直接 brd_farms.mapped_site_code 兜底（万一 alias 表不全）
UPDATE brd_daily_logs d
   SET site_code = f.mapped_site_code
  FROM brd_farms f
 WHERE f.farm_code = d.farm_code
   AND f.mapped_site_code IS NOT NULL
   AND (d.site_code IS NULL OR d.site_code = '');

-- ── 回填 company_code / project_code ────────────────────────────────────────
-- 孟赛蛋鸡场
UPDATE brd_daily_logs
   SET company_code = 'COMP-LAO-AGRI',
       project_code = 'PRJ_MENGSAI_LAYER'
 WHERE site_code = 'SITE-MENGSAI-LAYER'
   AND (company_code IS NULL OR company_code = '' OR project_code IS NULL OR project_code = '');

-- 东鹏蛋鸡场
UPDATE brd_daily_logs
   SET company_code = 'COMP-LAO-AGRI',
       project_code = 'PRJ_DONGPENG_LAYER'
 WHERE site_code = 'SITE-DONGPENG-LAYER'
   AND (company_code IS NULL OR company_code = '' OR project_code IS NULL OR project_code = '');

-- ── 回填 business_date ──────────────────────────────────────────────────────
UPDATE brd_daily_logs SET business_date = log_date
 WHERE business_date IS NULL AND log_date IS NOT NULL;

-- ── 审计：仍未映射的行打印 NOTICE ────────────────────────────────────────────
DO $$
DECLARE
  total INT;
  no_site INT;
  no_company INT;
  no_project INT;
BEGIN
  SELECT count(*) INTO total FROM brd_daily_logs;
  SELECT count(*) INTO no_site FROM brd_daily_logs WHERE site_code IS NULL OR site_code='';
  SELECT count(*) INTO no_company FROM brd_daily_logs WHERE company_code IS NULL OR company_code='';
  SELECT count(*) INTO no_project FROM brd_daily_logs WHERE project_code IS NULL OR project_code='';
  RAISE NOTICE '[brd_daily_logs 回填审计] total=% / 缺 site_code=% / 缺 company_code=% / 缺 project_code=%',
               total, no_site, no_company, no_project;
END $$;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- 验证：
--   SELECT site_code, company_code, project_code, count(*) FROM brd_daily_logs
--    GROUP BY 1,2,3 ORDER BY 1,2,3;
--
--   SELECT count(*) AS still_unmapped FROM brd_daily_logs
--    WHERE (company_code IS NULL OR project_code IS NULL OR site_code IS NULL);
--    -- 期望：0；如有遗留必须输出审计
-- ═════════════════════════════════════════════════════════════════════════════
