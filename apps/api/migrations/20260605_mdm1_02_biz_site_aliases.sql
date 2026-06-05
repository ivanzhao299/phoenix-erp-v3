-- ═════════════════════════════════════════════════════════════════════════════
-- MDM-1 §3: biz_site_aliases 站点别名映射表 + 初始 seed
-- ═════════════════════════════════════════════════════════════════════════════
-- 业务背景：
--   现有"孟赛蛋鸡场"在 sys_organizations 是 SITE-MENGSAI-LAYER，但 brd_farms
--   里有 LPH_MENGSAI / FARM001 / FARM-MS 3 条同实体记录；Excel 报表里叫
--   "孟赛蛋鸡场""孟赛蛋鸡养殖场""孟赛养鸡场"。本表将历史 alias 统一映射到
--   sys_organizations 中的 canonical site_code。
--
-- alias_type 枚举：
--   FARM_CODE         brd_farms.farm_code 映射
--   STORE_CODE        mst_stores.store_code 映射
--   OLD_SITE_CODE     sys_store.store_code（V2 老表）映射
--   EXCEL_NAME        外部 Excel 报表表头
--   LEGACY_NAME       客户/业务方口语化简称
--   COMPANY_OLD_CODE  历史公司编码（如 LPH）
--
-- 幂等：CREATE TABLE IF NOT EXISTS + (alias_type, alias_code) UNIQUE。
-- 本 migration **未在生产 DB 执行**。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS biz_site_aliases (
  id            BIGSERIAL PRIMARY KEY,
  site_code     VARCHAR(64) NOT NULL,
    -- 引用 sys_organizations.org_code (org_type='SITE')
  alias_type    VARCHAR(32) NOT NULL,
    -- FARM_CODE / STORE_CODE / OLD_SITE_CODE / EXCEL_NAME / LEGACY_NAME / COMPANY_OLD_CODE
  alias_code    VARCHAR(128) NOT NULL,
  alias_name    VARCHAR(200),
  source_table  VARCHAR(64),
    -- brd_farms / mst_stores / sys_store / external_excel 等
  status        VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  remark        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  CONSTRAINT uq_site_alias UNIQUE (alias_type, alias_code)
);

CREATE INDEX IF NOT EXISTS idx_site_alias_site ON biz_site_aliases (site_code);
CREATE INDEX IF NOT EXISTS idx_site_alias_code ON biz_site_aliases (alias_code);
CREATE INDEX IF NOT EXISTS idx_site_alias_type ON biz_site_aliases (alias_type);

COMMENT ON TABLE biz_site_aliases IS
  'MDM-1 站点别名映射表。canonical site_code = sys_organizations.org_code (SITE)。'
  '业务查询时凡拿到 alias_code 都应通过本表映射到 site_code。';

-- 触发器：插入/更新时校验 canonical site_code 必须在 sys_organizations 中存在
CREATE OR REPLACE FUNCTION fn_biz_site_alias_check_site() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM sys_organizations
     WHERE org_code = NEW.site_code AND org_type = 'SITE'
  ) THEN
    RAISE EXCEPTION 'biz_site_aliases.site_code=% 在 sys_organizations 中无对应 SITE', NEW.site_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_biz_site_alias_check_site ON biz_site_aliases;
CREATE TRIGGER trg_biz_site_alias_check_site
  BEFORE INSERT OR UPDATE ON biz_site_aliases
  FOR EACH ROW EXECUTE FUNCTION fn_biz_site_alias_check_site();

-- ── 初始 seed：孟赛蛋鸡场 alias ──────────────────────────────────────────────
INSERT INTO biz_site_aliases (site_code, alias_type, alias_code, alias_name, source_table, status, remark)
SELECT 'SITE-MENGSAI-LAYER', 'FARM_CODE', 'LPH_MENGSAI', '孟赛蛋鸡场', 'brd_farms', 'ACTIVE',
       'GLP-1A-2 阶段引入的 farm_code（LPH = Lao Phoenix 占位）'
WHERE NOT EXISTS (SELECT 1 FROM biz_site_aliases WHERE alias_type='FARM_CODE' AND alias_code='LPH_MENGSAI');

INSERT INTO biz_site_aliases (site_code, alias_type, alias_code, alias_name, source_table, status, remark)
SELECT 'SITE-MENGSAI-LAYER', 'FARM_CODE', 'FARM001', '孟赛养鸡场', 'brd_farms', 'ACTIVE',
       '历史 farm_code（早期种子）'
WHERE NOT EXISTS (SELECT 1 FROM biz_site_aliases WHERE alias_type='FARM_CODE' AND alias_code='FARM001');

INSERT INTO biz_site_aliases (site_code, alias_type, alias_code, alias_name, source_table, status, remark)
SELECT 'SITE-MENGSAI-LAYER', 'FARM_CODE', 'FARM-MS', '孟赛蛋鸡场', 'brd_farms', 'ACTIVE',
       '历史 farm_code（V2 时期编码）'
WHERE NOT EXISTS (SELECT 1 FROM biz_site_aliases WHERE alias_type='FARM_CODE' AND alias_code='FARM-MS');

INSERT INTO biz_site_aliases (site_code, alias_type, alias_code, alias_name, source_table, status, remark)
SELECT 'SITE-MENGSAI-LAYER', 'OLD_SITE_CODE', 'FARM-MS', '孟赛养鸡场', 'sys_store', 'ACTIVE',
       'sys_store V2 老表中的孟赛站点编码'
WHERE NOT EXISTS (SELECT 1 FROM biz_site_aliases WHERE alias_type='OLD_SITE_CODE' AND alias_code='FARM-MS');

INSERT INTO biz_site_aliases (site_code, alias_type, alias_code, alias_name, source_table, status, remark)
SELECT 'SITE-MENGSAI-LAYER', 'EXCEL_NAME', '孟赛蛋鸡场', '孟赛蛋鸡场', 'external_excel', 'ACTIVE',
       'Excel 报表表头常见称谓（孟赛生产报表 等）'
WHERE NOT EXISTS (SELECT 1 FROM biz_site_aliases WHERE alias_type='EXCEL_NAME' AND alias_code='孟赛蛋鸡场');

INSERT INTO biz_site_aliases (site_code, alias_type, alias_code, alias_name, source_table, status, remark)
SELECT 'SITE-MENGSAI-LAYER', 'LEGACY_NAME', '孟赛蛋鸡养殖场', '孟赛蛋鸡养殖场', 'external_excel', 'ACTIVE',
       'sys_organizations 中的全称'
WHERE NOT EXISTS (SELECT 1 FROM biz_site_aliases WHERE alias_type='LEGACY_NAME' AND alias_code='孟赛蛋鸡养殖场');

INSERT INTO biz_site_aliases (site_code, alias_type, alias_code, alias_name, source_table, status, remark)
SELECT 'SITE-MENGSAI-LAYER', 'LEGACY_NAME', '孟赛场', '孟赛场', 'external_excel', 'ACTIVE',
       '口语化简称'
WHERE NOT EXISTS (SELECT 1 FROM biz_site_aliases WHERE alias_type='LEGACY_NAME' AND alias_code='孟赛场');

-- ── 东鹏蛋鸡场 alias ────────────────────────────────────────────────────────
INSERT INTO biz_site_aliases (site_code, alias_type, alias_code, alias_name, source_table, status, remark)
SELECT 'SITE-DONGPENG-LAYER', 'FARM_CODE', 'FARM-DP', '东鹏蛋鸡场', 'brd_farms', 'ACTIVE',
       '历史 farm_code（V2 时期编码）'
WHERE NOT EXISTS (SELECT 1 FROM biz_site_aliases WHERE alias_type='FARM_CODE' AND alias_code='FARM-DP');

INSERT INTO biz_site_aliases (site_code, alias_type, alias_code, alias_name, source_table, status, remark)
SELECT 'SITE-DONGPENG-LAYER', 'OLD_SITE_CODE', 'FARM-DP', '东鹏养鸡场', 'sys_store', 'ACTIVE',
       'sys_store V2 老表'
WHERE NOT EXISTS (SELECT 1 FROM biz_site_aliases WHERE alias_type='OLD_SITE_CODE' AND alias_code='FARM-DP');

-- ── 备注：sys_store 中的公司旧编码（CO-FHA / CO-FHF）不进 site_aliases ──
-- 公司别名应另立 biz_company_aliases 表（如业务方需要），不混入站点别名

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- 验证：
--   SELECT count(*) FROM biz_site_aliases;  -- 期望 9（孟赛 7 + 东鹏 2）
--   SELECT alias_type, alias_code, alias_name FROM biz_site_aliases
--    WHERE site_code='SITE-MENGSAI-LAYER' ORDER BY alias_type, alias_code;
-- ═════════════════════════════════════════════════════════════════════════════
