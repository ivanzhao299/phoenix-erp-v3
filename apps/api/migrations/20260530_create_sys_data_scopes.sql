-- ============================================================
-- Migration: 创建 sys_data_scopes 表
-- 说明：DataScopeService / OrgController /data-scopes 端点
--       均依赖此表，但历史 DDL 中从未建表，导致
--       "relation sys_data_scopes does not exist" 错误，
--       前端页面「数据范围配置」始终显示「加载数据范围规则失败」。
-- 幂等：IF NOT EXISTS 保证重复执行无副作用
-- ============================================================

CREATE TABLE IF NOT EXISTS sys_data_scopes (
    id          BIGSERIAL       PRIMARY KEY,
    role_code   VARCHAR(64)     NOT NULL,
    module_code VARCHAR(64)     NOT NULL,
    scope_type  VARCHAR(16)     NOT NULL DEFAULT 'COMPANY'
                    CHECK (scope_type IN ('SELF','PROJECT','COMPANY','REGION','GROUP')),
    enabled     BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_data_scope_role_module UNIQUE (role_code, module_code)
);

COMMENT ON TABLE  sys_data_scopes              IS 'RBAC 数据范围规则：角色 × 模块 → 可见范围等级';
COMMENT ON COLUMN sys_data_scopes.role_code    IS '角色编码，如 ROLE_REGION_MGR';
COMMENT ON COLUMN sys_data_scopes.module_code  IS '菜单/模块编码，如 MENU_PRC2_ORDER';
COMMENT ON COLUMN sys_data_scopes.scope_type   IS '范围等级：SELF<PROJECT<COMPANY<REGION<GROUP';
COMMENT ON COLUMN sys_data_scopes.enabled      IS '是否启用，false 时该规则不生效';

CREATE INDEX IF NOT EXISTS idx_data_scopes_role    ON sys_data_scopes (role_code);
CREATE INDEX IF NOT EXISTS idx_data_scopes_module  ON sys_data_scopes (module_code);
CREATE INDEX IF NOT EXISTS idx_data_scopes_enabled ON sys_data_scopes (enabled) WHERE enabled = TRUE;
