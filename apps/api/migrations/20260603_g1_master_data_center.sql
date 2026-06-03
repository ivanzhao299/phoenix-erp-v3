-- ════════════════════════════════════════════════════════════════════════
-- G1 主数据中心 — 基础数据层
-- ────────────────────────────────────────────────────────────────────────
-- 依据：docs/master-data-governance-phase-g0-blueprint.md
-- 建立：① 统一编码序列 ② 主数据审计日志 ③ 主数据合并日志
--       ④ 银行账户三层模型 ⑤ 主数据治理角色 ⑥ 主数据中心新增菜单
-- 全部幂等：CREATE IF NOT EXISTS / ON CONFLICT / ADD COLUMN IF NOT EXISTS
-- 安全：仅新增表/列/角色/菜单，不修改既有业务表结构与数据
-- ════════════════════════════════════════════════════════════════════════

-- ① 统一编码序列表（Code Generator 依赖）─────────────────────────────────
CREATE TABLE IF NOT EXISTS mst_code_seq (
  prefix      VARCHAR(16) PRIMARY KEY,   -- 编码前缀：CUS/SUP/SHR/PRJ/FRM/SKU
  current_no  BIGINT      NOT NULL DEFAULT 0,
  pad_len     INTEGER     NOT NULL DEFAULT 5,   -- 序号补零位数
  remark      VARCHAR(120),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 初始化主数据编码前缀（按 G0 蓝图统一规则；编码终身不变、不含业务语义）
INSERT INTO mst_code_seq (prefix, current_no, pad_len, remark) VALUES
  ('CUS', 0, 5, '客户编码 CUS-00001'),
  ('SUP', 0, 5, '供应商编码 SUP-00001'),
  ('SHR', 0, 3, '股东编码 SHR-001'),
  ('PRJ', 0, 3, '项目编码 PRJ-001'),
  ('FRM', 0, 2, '场站编码 FRM-01'),
  ('SKU', 0, 4, 'SKU 编码 SKU-0001')
ON CONFLICT (prefix) DO NOTHING;

-- ② 主数据审计日志（Audit Trail）─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mst_audit_trail (
  id           BIGSERIAL PRIMARY KEY,
  object_type  VARCHAR(40)  NOT NULL,   -- CUSTOMER / SUPPLIER / CASH_ACCOUNT / SHAREHOLDER ...
  object_code  VARCHAR(64)  NOT NULL,   -- 主数据编码
  action       VARCHAR(24)  NOT NULL,   -- CREATE / UPDATE / FREEZE / ARCHIVE / RESTORE / MERGE
  before_json  JSONB,                   -- 修改前快照
  after_json   JSONB,                   -- 修改后快照
  operator     VARCHAR(64),
  reason       VARCHAR(255),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mst_audit_obj  ON mst_audit_trail (object_type, object_code);
CREATE INDEX IF NOT EXISTS idx_mst_audit_time ON mst_audit_trail (created_at);

-- ③ 主数据合并日志（Merge Log）───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mst_merge_log (
  id            BIGSERIAL PRIMARY KEY,
  object_type   VARCHAR(40) NOT NULL,   -- CUSTOMER / SUPPLIER / DEALER
  source_code   VARCHAR(64) NOT NULL,   -- 被合并（保留审计，不物理删除）
  target_code   VARCHAR(64) NOT NULL,   -- 合并到的目标
  migrated_refs JSONB,                  -- 已迁移的业务单据引用统计
  operator      VARCHAR(64),
  reason        VARCHAR(255),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mst_merge_obj ON mst_merge_log (object_type, source_code);

-- ④ 银行账户三层模型 ─────────────────────────────────────────────────────
--   第一层：账户主体（凤凰食品/凤凰农业/赵永伟/宋雷…）
CREATE TABLE IF NOT EXISTS mst_account_holders (
  id           BIGSERIAL PRIMARY KEY,
  holder_code  VARCHAR(40) UNIQUE NOT NULL,   -- HLD-001
  holder_name  VARCHAR(120) NOT NULL,
  holder_type  VARCHAR(24)  NOT NULL DEFAULT 'COMPANY',  -- COMPANY / SHAREHOLDER / INDIVIDUAL
  ref_code     VARCHAR(64),                   -- 关联公司/股东编码
  status       VARCHAR(24)  NOT NULL DEFAULT 'ACTIVE',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

--   第二层：银行账户（中信8888/平安6666/招行1234）
CREATE TABLE IF NOT EXISTS mst_bank_accounts (
  id            BIGSERIAL PRIMARY KEY,
  bank_acc_code VARCHAR(40) UNIQUE NOT NULL,   -- BNK-001
  holder_code   VARCHAR(40) NOT NULL,          -- → mst_account_holders.holder_code
  bank_name     VARCHAR(120) NOT NULL,         -- 中信银行
  account_no    VARCHAR(64),                   -- 银行卡号/账号
  currency_code VARCHAR(8)  NOT NULL DEFAULT 'CNY',
  status        VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mst_bank_holder ON mst_bank_accounts (holder_code);

--   第三层：ERP 资金账户（fin_cash_accounts，业务单据只能引用此层）
--   增加引用列，关联到第二层银行账户（可空，非破坏）
DO $$
BEGIN
  IF to_regclass('public.fin_cash_accounts') IS NOT NULL THEN
    ALTER TABLE fin_cash_accounts ADD COLUMN IF NOT EXISTS bank_acc_code VARCHAR(40);
    ALTER TABLE fin_cash_accounts ADD COLUMN IF NOT EXISTS holder_code   VARCHAR(40);
  END IF;
END $$;

-- ⑤ 主数据治理角色（role_code 技术标识保留英文；role_name_zh 中文显示）──────
INSERT INTO sys_role (role_code, role_name_zh, role_type, approval_level, description) VALUES
  ('ROLE_MASTER_DATA_ADMIN',      '主数据管理员',     'MASTER', 1, '统一维护集团级主数据，可新增/修改/提交审批'),
  ('ROLE_MASTER_DATA_APPROVER',   '主数据审批人',     'MASTER', 2, '审批供应商/客户/账户/股东类主数据'),
  ('ROLE_SUPPLIER_MASTER_MGR',    '供应商主数据管理', 'MASTER', 1, '维护供应商档案'),
  ('ROLE_CUSTOMER_MASTER_MGR',    '客户主数据管理',   'MASTER', 1, '维护客户/经销商档案'),
  ('ROLE_PRODUCT_MASTER_MGR',     '产品主数据管理',   'MASTER', 1, '维护产品/SKU/等级/包装规格'),
  ('ROLE_WAREHOUSE_MASTER_MGR',   '仓储主数据管理',   'MASTER', 1, '维护仓库/库区/货位'),
  ('ROLE_FARM_MASTER_MGR',        '场站主数据管理',   'MASTER', 1, '维护场站/鸡舍/鸡群'),
  ('ROLE_FIN_ACCOUNT_MASTER_MGR', '资金账户主数据管理','MASTER', 1, '维护银行账户/资金账户')
ON CONFLICT (role_code) DO NOTHING;

-- ⑥ 主数据中心新增菜单（中文名；既有 18 个子菜单导航已存在，补充缺失的）─────
INSERT INTO sys_menu (menu_code, menu_name_zh, domain, parent_code, sort_order, icon, route) VALUES
  ('MENU_MASTER_DATA',         '主数据中心',   'MASTER', NULL,               700, 'database', '/master-data'),
  ('MENU_MD_BANK_ACCOUNT',     '银行账户中心', 'MASTER', 'MENU_MASTER_DATA', 715, 'landmark', '/master-data/bank-accounts'),
  ('MENU_MD_DICT_CENTER',      '数据字典中心', 'MASTER', 'MENU_MASTER_DATA', 720, 'book',     '/master-data/dictionaries'),
  ('MENU_MD_QUALITY',          '数据质量中心', 'MASTER', 'MENU_MASTER_DATA', 730, 'shield',   '/master-data/quality'),
  ('MENU_MD_AUDIT',            '主数据审计',   'MASTER', 'MENU_MASTER_DATA', 735, 'history',  '/master-data/audit')
ON CONFLICT (menu_code) DO NOTHING;
