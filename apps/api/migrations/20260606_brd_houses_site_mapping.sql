-- ═════════════════════════════════════════════════════════════════════════════
-- brd_houses + brd_flocks 加 company_code / project_code / site_code 三字段
-- ═════════════════════════════════════════════════════════════════════════════
-- 用户痛点（Q2）：养殖场 + 鸡舍未与公司/项目建立映射 → 业务表单无法引用。
--
-- 修法（与 MDM-1 mdm1_05 给 brd_daily_logs 加 3 字段一致）：
--   1) brd_houses  + company_code/project_code/site_code（+ 自动回填）
--   2) brd_flocks  + company_code/project_code/site_code（+ 自动回填）
--   3) 回填逻辑：通过 farm_code 反查 brd_farms.mapped_site_code → site_code
--      → 通过 site_code='SITE-MENGSAI-LAYER' 反查 → company=COMP-LAO-AGRI +
--      project=PRJ_MENGSAI_LAYER（同理东鹏）
--
-- 幂等。表不存在时跳过。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $body$
DECLARE
  total INT := 0;
  no_site INT := 0;
BEGIN
  -- brd_houses
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='brd_houses') THEN
    EXECUTE 'ALTER TABLE brd_houses ADD COLUMN IF NOT EXISTS company_code VARCHAR(64)';
    EXECUTE 'ALTER TABLE brd_houses ADD COLUMN IF NOT EXISTS project_code VARCHAR(64)';
    EXECUTE 'ALTER TABLE brd_houses ADD COLUMN IF NOT EXISTS site_code    VARCHAR(64)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_brd_houses_company ON brd_houses (company_code)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_brd_houses_project ON brd_houses (project_code)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_brd_houses_site    ON brd_houses (site_code)';

    -- 通过 farm_code → brd_farms.mapped_site_code 回填 site_code
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name='brd_farms' AND column_name='mapped_site_code') THEN
      EXECUTE $$UPDATE brd_houses h
                   SET site_code = f.mapped_site_code
                  FROM brd_farms f
                 WHERE f.farm_code = h.farm_code
                   AND f.mapped_site_code IS NOT NULL
                   AND (h.site_code IS NULL OR h.site_code = '')$$;
    END IF;
    -- 通过 biz_site_aliases 兜底
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_name='biz_site_aliases') THEN
      EXECUTE $$UPDATE brd_houses h
                   SET site_code = a.site_code
                  FROM biz_site_aliases a
                 WHERE a.alias_type='FARM_CODE' AND a.status='ACTIVE'
                   AND a.alias_code = h.farm_code
                   AND (h.site_code IS NULL OR h.site_code = '')$$;
    END IF;

    -- 按 site_code 回填 company + project
    EXECUTE $$UPDATE brd_houses
                 SET company_code='COMP-LAO-AGRI', project_code='PRJ_MENGSAI_LAYER'
               WHERE site_code='SITE-MENGSAI-LAYER'
                 AND (company_code IS NULL OR project_code IS NULL)$$;
    EXECUTE $$UPDATE brd_houses
                 SET company_code='COMP-LAO-AGRI', project_code='PRJ_DONGPENG_LAYER'
               WHERE site_code='SITE-DONGPENG-LAYER'
                 AND (company_code IS NULL OR project_code IS NULL)$$;

    EXECUTE 'SELECT count(*) FROM brd_houses' INTO total;
    EXECUTE 'SELECT count(*) FROM brd_houses WHERE site_code IS NULL OR site_code=''''' INTO no_site;
    RAISE NOTICE '[brd_houses 回填] total=% / 仍缺 site=%', total, no_site;
  END IF;

  -- brd_flocks
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='brd_flocks') THEN
    EXECUTE 'ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS company_code VARCHAR(64)';
    EXECUTE 'ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS project_code VARCHAR(64)';
    EXECUTE 'ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS site_code    VARCHAR(64)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_brd_flocks_company ON brd_flocks (company_code)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_brd_flocks_project ON brd_flocks (project_code)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_brd_flocks_site    ON brd_flocks (site_code)';

    -- 通过 farm_code → brd_farms.mapped_site_code
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name='brd_farms' AND column_name='mapped_site_code') THEN
      EXECUTE $$UPDATE brd_flocks fk
                   SET site_code = f.mapped_site_code
                  FROM brd_farms f
                 WHERE f.farm_code = fk.farm_code
                   AND f.mapped_site_code IS NOT NULL
                   AND (fk.site_code IS NULL OR fk.site_code = '')$$;
    END IF;

    EXECUTE $$UPDATE brd_flocks
                 SET company_code='COMP-LAO-AGRI', project_code='PRJ_MENGSAI_LAYER'
               WHERE site_code='SITE-MENGSAI-LAYER'
                 AND (company_code IS NULL OR project_code IS NULL)$$;
    EXECUTE $$UPDATE brd_flocks
                 SET company_code='COMP-LAO-AGRI', project_code='PRJ_DONGPENG_LAYER'
               WHERE site_code='SITE-DONGPENG-LAYER'
                 AND (company_code IS NULL OR project_code IS NULL)$$;

    EXECUTE 'SELECT count(*) FROM brd_flocks' INTO total;
    EXECUTE 'SELECT count(*) FROM brd_flocks WHERE site_code IS NULL OR site_code=''''' INTO no_site;
    RAISE NOTICE '[brd_flocks 回填] total=% / 仍缺 site=%', total, no_site;
  END IF;
END $body$;

COMMIT;
