-- ════════════════════════════════════════════════════════════════════════
-- Production Inventory Source Mode Phase P1A — A · 库存来源模式表 + 审计
-- ────────────────────────────────────────────────────────────────────────
-- 背景：生产链路收口 Phase 1 冻结了 Farm Egg 旁路，但包装模块尚未实际投运，
--   直接全冻结会导致现场无法入库。P1A 引入「库存来源模式」过渡开关：
--     · TEMP_PRODUCTION_INBOUND — 日产蛋直接形成销售库存（走 Sales V2 命名，非 EGG-STOCK-*）
--     · PACKAGING_INBOUND       — 包装完成生成库存（包装作业中心）
--   二选一，互斥，不得同时启用，统一进入 inv_batches/inv_ledger/Sales V2 FIFO。
-- 作用范围：GROUP / COMPANY / SITE（推荐 SITE 级），解析优先级 SITE→COMPANY→GROUP→默认。
-- 全部幂等：CREATE TABLE IF NOT EXISTS / ON CONFLICT DO NOTHING
-- ════════════════════════════════════════════════════════════════════════

-- 1. 库存来源模式配置
CREATE TABLE IF NOT EXISTS inv_source_mode (
  id           BIGSERIAL PRIMARY KEY,
  scope_level  VARCHAR(16)  NOT NULL,                                  -- GROUP / COMPANY / SITE
  scope_code   VARCHAR(64)  NOT NULL,                                  -- ALL / company_code / site_code
  mode         VARCHAR(32)  NOT NULL DEFAULT 'TEMP_PRODUCTION_INBOUND',-- TEMP_PRODUCTION_INBOUND / PACKAGING_INBOUND
  remark       TEXT,
  updated_by   VARCHAR(64),
  updated_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_inv_source_mode UNIQUE (scope_level, scope_code),
  CONSTRAINT chk_inv_source_mode_level CHECK (scope_level IN ('GROUP','COMPANY','SITE')),
  CONSTRAINT chk_inv_source_mode_mode  CHECK (mode IN ('TEMP_PRODUCTION_INBOUND','PACKAGING_INBOUND'))
);

-- 2. 模式切换审计日志
CREATE TABLE IF NOT EXISTS inv_source_mode_audit (
  id            BIGSERIAL PRIMARY KEY,
  scope_level   VARCHAR(16)  NOT NULL,
  scope_code    VARCHAR(64)  NOT NULL,
  old_mode      VARCHAR(32),
  new_mode      VARCHAR(32)  NOT NULL,
  operator      VARCHAR(64),
  remark        TEXT,
  risk_snapshot JSONB,                                                 -- 切换前风险快照（余额/最后入库/最后包装/未完成包装等）
  created_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_source_mode_scope       ON inv_source_mode (scope_level, scope_code);
CREATE INDEX IF NOT EXISTS idx_inv_source_mode_audit_scope ON inv_source_mode_audit (scope_level, scope_code, created_at DESC);

-- 3. 默认 GROUP 级模式：TEMP_PRODUCTION_INBOUND（包装模块成熟后再切 PACKAGING_INBOUND）
INSERT INTO inv_source_mode (scope_level, scope_code, mode, remark, updated_by)
VALUES ('GROUP', 'ALL', 'TEMP_PRODUCTION_INBOUND',
        '生产链路收口 P1A 默认：临时生产入库模式（过渡）。包装模块成熟后由 ADMIN/CEO/FACTORY_MGR 切换为 PACKAGING_INBOUND。',
        'system')
ON CONFLICT (scope_level, scope_code) DO NOTHING;
