-- ════════════════════════════════════════════════════════════════════════════
-- G59：F5 主数据 Runtime schema 回填（顶级 g55c + uat_p0_phase1_fix 漏部署）
-- ════════════════════════════════════════════════════════════════════════════
-- 根因：fin_bank_accounts 建表 + 8 张主数据表 lifecycle 列，仅由【顶级 migrations/】
--   的 20260604_g55c_master_data_completion.sql + 20260604_uat_p0_phase1_fix.sql 创建，
--   而生产 Deploy 只跑 apps/api/migrations/（F5/G36 锁定）→ 生产缺这些 schema。
-- 现象：G56-B 主数据项级原子鉴权放行后，刘杰访问 /master-data/runtime/bank-account
--   触发 list()「SELECT * FROM fin_bank_accounts ORDER BY updated_at」→ 表不存在 → 500。
-- 修复：把两个顶级迁移的【幂等 schema DDL】回填到 apps/api/migrations 以部署到生产。
-- 安全：全部 CREATE/ADD COLUMN IF NOT EXISTS / INSERT ON CONFLICT / UPDATE WHERE NULL，
--   本地已存在故为 no-op；生产补齐。**排除原 uat fix 的 sys_dict UPDATE（记忆规则禁止）**。
-- ════════════════════════════════════════════════════════════════════════════

-- ── PART 1：mst_code_seq 编码注册表 + 前缀种子 ───────────────────────────────
CREATE TABLE IF NOT EXISTS mst_code_seq (
  prefix      VARCHAR(16) PRIMARY KEY,
  current_no  BIGINT NOT NULL DEFAULT 0,
  pad_len     INTEGER NOT NULL DEFAULT 5,
  remark      TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO mst_code_seq (prefix, current_no, pad_len, remark) VALUES
  ('CUS',  0, 5, '客户编码 CUS-00001'),
  ('SUP',  0, 5, '供应商编码 SUP-00001'),
  ('PRJ',  0, 3, '项目编码 PRJ-001'),
  ('PRD',  0, 5, '产品编码'),
  ('STR',  0, 5, '门店编码'),
  ('BANK', 0, 5, '银行账户编码'),
  ('SKU',  0, 6, 'SKU 编码'),
  ('WH',   0, 4, '仓库编码'),
  ('GRD',  0, 3, '产品等级编码'),
  ('SPEC', 0, 4, '包装规格编码'),
  ('DRV',  0, 4, '司机编码'),
  ('VEH',  0, 4, '车辆编码'),
  ('CASH', 0, 5, '资金账户编码')
ON CONFLICT (prefix) DO NOTHING;

-- ── PART 2：product_master 表 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_master (
  id              BIGSERIAL PRIMARY KEY,
  product_code    VARCHAR(64) NOT NULL UNIQUE,
  product_name    VARCHAR(256) NOT NULL,
  product_name_en VARCHAR(256),
  category        VARCHAR(64),
  uom             VARCHAR(32),
  default_grade   VARCHAR(16),
  shelf_life_days INTEGER,
  status          VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
  effective_date  DATE,
  expire_date     DATE,
  remark          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_master_status   ON product_master(status);
CREATE INDEX IF NOT EXISTS idx_product_master_category ON product_master(category);

-- ── PART 3：fin_bank_accounts 表（本次 500 直接根因）───────────────────────────
CREATE TABLE IF NOT EXISTS fin_bank_accounts (
  id                BIGSERIAL PRIMARY KEY,
  bank_account_code VARCHAR(64) NOT NULL UNIQUE,
  bank_name         VARCHAR(128) NOT NULL,
  bank_name_en      VARCHAR(128),
  branch_name       VARCHAR(128),
  account_no        VARCHAR(64) NOT NULL,
  account_holder    VARCHAR(128) NOT NULL,
  currency_code     VARCHAR(16) NOT NULL,
  country_code      VARCHAR(8) DEFAULT 'CN',
  swift_code        VARCHAR(16),
  iban              VARCHAR(64),
  company_code      VARCHAR(64),
  status            VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
  effective_date    DATE,
  expire_date       DATE,
  remark            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_bank_accounts_status   ON fin_bank_accounts(status);
CREATE INDEX IF NOT EXISTS idx_fin_bank_accounts_currency ON fin_bank_accounts(currency_code);
CREATE INDEX IF NOT EXISTS idx_fin_bank_accounts_company  ON fin_bank_accounts(company_code);

-- ── PART 4：8 张主数据 runtime 表补 lifecycle / effective_date / expire_date ──
ALTER TABLE mst_stores
  ADD COLUMN IF NOT EXISTS company_code VARCHAR(64), ADD COLUMN IF NOT EXISTS manager VARCHAR(64),
  ADD COLUMN IF NOT EXISTS effective_date DATE, ADD COLUMN IF NOT EXISTS expire_date DATE,
  ADD COLUMN IF NOT EXISTS remark TEXT;
ALTER TABLE product_skus
  ADD COLUMN IF NOT EXISTS effective_date DATE, ADD COLUMN IF NOT EXISTS expire_date DATE;
ALTER TABLE wms_warehouses
  ADD COLUMN IF NOT EXISTS company_code VARCHAR(64), ADD COLUMN IF NOT EXISTS manager VARCHAR(64),
  ADD COLUMN IF NOT EXISTS effective_date DATE, ADD COLUMN IF NOT EXISTS expire_date DATE,
  ADD COLUMN IF NOT EXISTS remark TEXT;
ALTER TABLE product_grades
  ADD COLUMN IF NOT EXISTS status VARCHAR(16) DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS effective_date DATE, ADD COLUMN IF NOT EXISTS expire_date DATE,
  ADD COLUMN IF NOT EXISTS remark TEXT;
ALTER TABLE packaging_specs
  ADD COLUMN IF NOT EXISTS status VARCHAR(16) DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS effective_date DATE, ADD COLUMN IF NOT EXISTS expire_date DATE,
  ADD COLUMN IF NOT EXISTS remark TEXT;
ALTER TABLE sal_drivers
  ADD COLUMN IF NOT EXISTS status VARCHAR(16) DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS effective_date DATE, ADD COLUMN IF NOT EXISTS expire_date DATE;
ALTER TABLE sal_vehicles
  ADD COLUMN IF NOT EXISTS status VARCHAR(16) DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS effective_date DATE, ADD COLUMN IF NOT EXISTS expire_date DATE;
ALTER TABLE fin_cash_accounts
  ADD COLUMN IF NOT EXISTS effective_date DATE, ADD COLUMN IF NOT EXISTS expire_date DATE;
ALTER TABLE prc2_projects
  ADD COLUMN IF NOT EXISTS effective_date DATE, ADD COLUMN IF NOT EXISTS expire_date DATE,
  ADD COLUMN IF NOT EXISTS remark TEXT;

-- ── PART 5：旧行 status 回填 ACTIVE（仅 NULL；runtime 相关表，排除 sys_dict）──
UPDATE mst_stores       SET status = 'ACTIVE' WHERE status IS NULL;
UPDATE wms_warehouses   SET status = 'ACTIVE' WHERE status IS NULL;
UPDATE product_grades   SET status = 'ACTIVE' WHERE status IS NULL;
UPDATE packaging_specs  SET status = 'ACTIVE' WHERE status IS NULL;
UPDATE sal_drivers      SET status = 'ACTIVE' WHERE status IS NULL;
UPDATE sal_vehicles     SET status = 'ACTIVE' WHERE status IS NULL;
UPDATE prc2_projects    SET status = 'ACTIVE' WHERE status IS NULL;
UPDATE sal_customers    SET status = 'ACTIVE' WHERE status IS NULL;
UPDATE prc2_suppliers   SET status = 'ACTIVE' WHERE status IS NULL;
UPDATE product_skus     SET status = 'ACTIVE' WHERE status IS NULL;
UPDATE fin_cash_accounts SET status = 'ACTIVE' WHERE status IS NULL;
UPDATE fin_bank_accounts SET status = 'ACTIVE' WHERE status IS NULL;
UPDATE product_master   SET status = 'ACTIVE' WHERE status IS NULL;
