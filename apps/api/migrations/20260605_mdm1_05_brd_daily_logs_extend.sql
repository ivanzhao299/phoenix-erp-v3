-- ═════════════════════════════════════════════════════════════════════════════
-- MDM-1 §5: brd_daily_logs 增加 company_code / project_code / site_code / business_date
-- 表不存在时（CI 测试环境）优雅跳过；生产 DB 正常执行。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $body$
DECLARE
  total INT := 0;
  no_site INT := 0;
  no_company INT := 0;
  no_project INT := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='brd_daily_logs') THEN
    RAISE NOTICE '[mdm1_05] brd_daily_logs 不存在（CI 测试环境），跳过';
    RETURN;
  END IF;

  -- 加字段
  EXECUTE 'ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS company_code  VARCHAR(64)';
  EXECUTE 'ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS project_code  VARCHAR(64)';
  EXECUTE 'ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS site_code     VARCHAR(64)';
  EXECUTE 'ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS business_date DATE';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_brd_daily_company  ON brd_daily_logs (company_code)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_brd_daily_project  ON brd_daily_logs (project_code)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_brd_daily_site     ON brd_daily_logs (site_code)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_brd_daily_bizdate  ON brd_daily_logs (business_date)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_brd_daily_site_date ON brd_daily_logs (site_code, business_date)';

  -- 回填 site_code 通过 biz_site_aliases
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='biz_site_aliases') THEN
    EXECUTE $$UPDATE brd_daily_logs d
                 SET site_code = a.site_code
                FROM biz_site_aliases a
               WHERE a.alias_type = 'FARM_CODE'
                 AND a.status = 'ACTIVE'
                 AND a.alias_code = d.farm_code
                 AND (d.site_code IS NULL OR d.site_code = '')$$;
  END IF;

  -- 回填 site_code 通过 brd_farms.mapped_site_code（如该列已加）
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name='brd_farms' AND column_name='mapped_site_code') THEN
    EXECUTE $$UPDATE brd_daily_logs d
                 SET site_code = f.mapped_site_code
                FROM brd_farms f
               WHERE f.farm_code = d.farm_code
                 AND f.mapped_site_code IS NOT NULL
                 AND (d.site_code IS NULL OR d.site_code = '')$$;
  END IF;

  -- 回填 company_code + project_code 按 site_code 映射
  EXECUTE $$UPDATE brd_daily_logs
               SET company_code = 'COMP-LAO-AGRI', project_code = 'PRJ_MENGSAI_LAYER'
             WHERE site_code = 'SITE-MENGSAI-LAYER'
               AND (company_code IS NULL OR company_code = '' OR project_code IS NULL OR project_code = '')$$;
  EXECUTE $$UPDATE brd_daily_logs
               SET company_code = 'COMP-LAO-AGRI', project_code = 'PRJ_DONGPENG_LAYER'
             WHERE site_code = 'SITE-DONGPENG-LAYER'
               AND (company_code IS NULL OR company_code = '' OR project_code IS NULL OR project_code = '')$$;

  -- 回填 business_date
  EXECUTE 'UPDATE brd_daily_logs SET business_date = log_date WHERE business_date IS NULL AND log_date IS NOT NULL';

  -- 审计
  EXECUTE 'SELECT count(*) FROM brd_daily_logs' INTO total;
  EXECUTE 'SELECT count(*) FROM brd_daily_logs WHERE site_code IS NULL OR site_code=''''' INTO no_site;
  EXECUTE 'SELECT count(*) FROM brd_daily_logs WHERE company_code IS NULL OR company_code=''''' INTO no_company;
  EXECUTE 'SELECT count(*) FROM brd_daily_logs WHERE project_code IS NULL OR project_code=''''' INTO no_project;
  RAISE NOTICE '[brd_daily_logs 回填] total=% 缺 site=% 缺 company=% 缺 project=%',
               total, no_site, no_company, no_project;
END $body$;

COMMIT;
