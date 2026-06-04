-- ════════════════════════════════════════════════════════════════════════════
-- G5.5-C · Master Data Center Completion — Schema & 编码前缀种子
-- ════════════════════════════════════════════════════════════════════════════
-- 目标：把主数据评分从 54.5 提升到 85+。
--
-- 本迁移：
--   1. 新建 product_master 表（产品档案）
--   2. 新建 fin_bank_accounts 表（银行账户中心）
--   3. 现有 7 张表（mst_stores / product_skus / wms_warehouses / product_grades /
--      packaging_specs / sal_drivers / sal_vehicles）补齐 lifecycle 5 态字段
--   4. mst_code_seq 编码注册表（如不存在） + 11 个前缀种子
--
-- 幂等：全部使用 IF NOT EXISTS / ON CONFLICT DO NOTHING。
-- ════════════════════════════════════════════════════════════════════════════

-- ── PART 1：mst_code_seq 编码注册表（如不存在） ───────────────────────────────
-- FIX UAT-P0-Phase1 2026-06-04: 列名对齐 code-generator.service.ts 实际使用的
-- current_no / pad_len / remark（早期此表已用此 schema 建立；G55C 草稿误用 next_seq/pad/description）
CREATE TABLE IF NOT EXISTS mst_code_seq (
  prefix      VARCHAR(16) PRIMARY KEY,
  current_no  BIGINT NOT NULL DEFAULT 0,
  pad_len     INTEGER NOT NULL DEFAULT 5,            -- 补零位数
  remark      TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE mst_code_seq IS '主数据编码序列注册表（G3-A 编码自动生成）';

-- 全部前缀种子（已有 CUS/SUP/PRJ，新增 G5.5-C 9 个 + 资金账户）
-- next() 内部做 current_no = current_no + 1，所以种子 current_no=0 表示下一个编码序号=1
INSERT INTO mst_code_seq (prefix, current_no, pad_len, remark) VALUES
  ('CUS',  0, 5, '客户编码 CUS-00001'),
  ('SUP',  0, 5, '供应商编码 SUP-00001'),
  ('PRJ',  0, 3, '项目编码 PRJ-001'),
  ('PRD',  0, 5, '产品编码 — G5.5-C 新增'),
  ('STR',  0, 5, '门店编码 — G5.5-C 新增'),
  ('BANK', 0, 5, '银行账户编码 — G5.5-C 新增'),
  ('SKU',  0, 6, 'SKU 编码 — G5.5-C 新增'),
  ('WH',   0, 4, '仓库编码 — G5.5-C 新增'),
  ('GRD',  0, 3, '产品等级编码 — G5.5-C 新增'),
  ('SPEC', 0, 4, '包装规格编码 — G5.5-C 新增'),
  ('DRV',  0, 4, '司机编码 — G5.5-C 新增'),
  ('VEH',  0, 4, '车辆编码 — G5.5-C 新增'),
  ('CASH', 0, 5, '资金账户编码（业务格式 CASH-CNY-001 兼容）')
ON CONFLICT (prefix) DO NOTHING;

-- ── PART 2：product_master 新表 ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_master (
  id              BIGSERIAL PRIMARY KEY,
  product_code    VARCHAR(64) NOT NULL UNIQUE,
  product_name    VARCHAR(256) NOT NULL,
  product_name_en VARCHAR(256),
  category        VARCHAR(64),
  uom             VARCHAR(32),                       -- 计量单位
  default_grade   VARCHAR(16),
  shelf_life_days INTEGER,
  status          VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
  effective_date  DATE,
  expire_date     DATE,
  remark          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_master_status ON product_master(status);
CREATE INDEX IF NOT EXISTS idx_product_master_category ON product_master(category);

COMMENT ON TABLE product_master IS 'G5.5-C: 产品主档（SKU 的父对象，含 SPU 信息）';

-- ── PART 3：fin_bank_accounts 新表 ────────────────────────────────────────────
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

COMMENT ON TABLE fin_bank_accounts IS 'G5.5-C: 银行账户中心（境外/跨境结算账户）— 与 fin_cash_accounts 通过 bank_acc_code 关联';

-- ── PART 4：现有 7 张表补 lifecycle 5 态字段 + effective_date/expire_date ─────
-- mst_stores
ALTER TABLE mst_stores
  ADD COLUMN IF NOT EXISTS company_code   VARCHAR(64),
  ADD COLUMN IF NOT EXISTS manager        VARCHAR(64),
  ADD COLUMN IF NOT EXISTS effective_date DATE,
  ADD COLUMN IF NOT EXISTS expire_date    DATE,
  ADD COLUMN IF NOT EXISTS remark         TEXT;

UPDATE mst_stores SET status = 'ACTIVE' WHERE status IS NULL;

-- product_skus 已有 status；补 effective_date/expire_date
ALTER TABLE product_skus
  ADD COLUMN IF NOT EXISTS effective_date DATE,
  ADD COLUMN IF NOT EXISTS expire_date    DATE;

-- wms_warehouses
ALTER TABLE wms_warehouses
  ADD COLUMN IF NOT EXISTS company_code   VARCHAR(64),
  ADD COLUMN IF NOT EXISTS manager        VARCHAR(64),
  ADD COLUMN IF NOT EXISTS effective_date DATE,
  ADD COLUMN IF NOT EXISTS expire_date    DATE,
  ADD COLUMN IF NOT EXISTS remark         TEXT;

UPDATE wms_warehouses SET status = 'ACTIVE' WHERE status IS NULL;

-- product_grades / packaging_specs / sal_drivers / sal_vehicles 都用同样模式
-- FIX UAT-P0-Phase1 2026-06-04: 改用顶层 ADD COLUMN IF NOT EXISTS（PG ≥ 9.6 支持），避免 DO 块整批失败回滚
ALTER TABLE product_grades
  ADD COLUMN IF NOT EXISTS status         VARCHAR(16) DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS effective_date DATE,
  ADD COLUMN IF NOT EXISTS expire_date    DATE,
  ADD COLUMN IF NOT EXISTS remark         TEXT;

ALTER TABLE packaging_specs
  ADD COLUMN IF NOT EXISTS status         VARCHAR(16) DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS effective_date DATE,
  ADD COLUMN IF NOT EXISTS expire_date    DATE,
  ADD COLUMN IF NOT EXISTS remark         TEXT;

ALTER TABLE sal_drivers
  ADD COLUMN IF NOT EXISTS status         VARCHAR(16) DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS effective_date DATE,
  ADD COLUMN IF NOT EXISTS expire_date    DATE;

ALTER TABLE sal_vehicles
  ADD COLUMN IF NOT EXISTS status         VARCHAR(16) DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS effective_date DATE,
  ADD COLUMN IF NOT EXISTS expire_date    DATE;

-- fin_cash_accounts 补 effective_date/expire_date（Runtime 委托所需）
ALTER TABLE fin_cash_accounts
  ADD COLUMN IF NOT EXISTS effective_date DATE,
  ADD COLUMN IF NOT EXISTS expire_date    DATE;

-- ── 摘要 ───────────────────────────────────────────────────────────────────────
COMMENT ON SCHEMA public IS 'G5.5-C: 主数据完成度从 54.5 提升至 85+';
