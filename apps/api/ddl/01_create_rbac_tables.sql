-- ============== sys_user 用户表 ==============
CREATE TABLE IF NOT EXISTS sys_user (
    user_id         BIGSERIAL PRIMARY KEY,
    username        VARCHAR(64) UNIQUE NOT NULL,
    password_hash   VARCHAR(256) NOT NULL,
    real_name       VARCHAR(64) NOT NULL,
    phone           VARCHAR(32),
    email           VARCHAR(128),
    store_code      VARCHAR(64) NOT NULL DEFAULT 'ALL',
    locale          VARCHAR(8) NOT NULL DEFAULT 'zh-CN',  -- zh-CN | lo-LA
    status          SMALLINT NOT NULL DEFAULT 1,           -- 1=启用 0=禁用
    last_login_at   TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    note            TEXT
);
CREATE INDEX IF NOT EXISTS idx_user_store ON sys_user(store_code);

-- ============== sys_role 角色表 ==============
CREATE TABLE IF NOT EXISTS sys_role (
    role_id         BIGSERIAL PRIMARY KEY,
    role_code       VARCHAR(64) UNIQUE NOT NULL,
    role_name_zh    VARCHAR(128) NOT NULL,
    role_name_lo    VARCHAR(128),
    role_type       VARCHAR(32) NOT NULL,    -- SYSTEM/DECISION/FINANCE/MANAGEMENT/PRODUCTION/QUALITY/PACKAGING/WAREHOUSE/LOGISTICS/COMMON/PROCUREMENT/STORE/SALES/EXTERNAL
    approval_level  SMALLINT NOT NULL DEFAULT 0,
    description     TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============== sys_menu 菜单表 ==============
CREATE TABLE IF NOT EXISTS sys_menu (
    menu_id         BIGSERIAL PRIMARY KEY,
    menu_code       VARCHAR(64) UNIQUE NOT NULL,
    menu_name_zh    VARCHAR(128) NOT NULL,
    menu_name_lo    VARCHAR(128),
    domain          VARCHAR(32) NOT NULL,    -- COMMON/FINANCE/ORDER/STORE/FARM/QA/PKG/WMS/LOG/PRC/SALES
    parent_code     VARCHAR(64),
    sort_order      INT NOT NULL DEFAULT 0,
    icon            VARCHAR(64),
    route           VARCHAR(128),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============== sys_user_role 用户-角色关联 ==============
CREATE TABLE IF NOT EXISTS sys_user_role (
    user_id         BIGINT NOT NULL REFERENCES sys_user(user_id) ON DELETE CASCADE,
    role_id         BIGINT NOT NULL REFERENCES sys_role(role_id) ON DELETE CASCADE,
    is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
    granted_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    granted_by      BIGINT REFERENCES sys_user(user_id),
    PRIMARY KEY (user_id, role_id)
);

-- ============== sys_role_menu_permission 角色-菜单-CRUD 三元组 ==============
CREATE TABLE IF NOT EXISTS sys_role_menu_permission (
    perm_id         BIGSERIAL PRIMARY KEY,
    role_id         BIGINT NOT NULL REFERENCES sys_role(role_id) ON DELETE CASCADE,
    menu_id         BIGINT NOT NULL REFERENCES sys_menu(menu_id) ON DELETE CASCADE,
    perm_codes      VARCHAR(32) NOT NULL,    -- 逗号分隔 V,C,E,D,A,X 或 *
    UNIQUE (role_id, menu_id)
);

-- ============== sys_store 机构字典 ==============
CREATE TABLE IF NOT EXISTS sys_store (
    store_id        BIGSERIAL PRIMARY KEY,
    store_code      VARCHAR(64) UNIQUE NOT NULL,
    store_name_zh   VARCHAR(128) NOT NULL,
    store_name_lo   VARCHAR(128),
    store_type      VARCHAR(32) NOT NULL,    -- HQ/COMPANY/FARM/STORE/AREA/WAREHOUSE/PACKAGING
    parent_code     VARCHAR(64),
    address         VARCHAR(256),
    contact_person  VARCHAR(64),
    contact_phone   VARCHAR(32),
    status          SMALLINT NOT NULL DEFAULT 1,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============== sys_approval_rule 审批分级规则 ==============
CREATE TABLE IF NOT EXISTS sys_approval_rule (
    rule_id         BIGSERIAL PRIMARY KEY,
    doc_type        VARCHAR(64) NOT NULL,
    amount_min      DECIMAL(18, 2) NOT NULL DEFAULT 0,
    amount_max      DECIMAL(18, 2),
    currency_code   VARCHAR(8) NOT NULL DEFAULT 'CNY',
    approver_chain  JSONB NOT NULL,   -- [{"level":1,"role":"ROLE_FARM_MGR"}, ...]
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (doc_type, amount_min, currency_code)
);

-- ============== sys_doc_state_lock 状态机锁配置 ==============
CREATE TABLE IF NOT EXISTS sys_doc_state_lock (
    lock_id         BIGSERIAL PRIMARY KEY,
    doc_type        VARCHAR(64) NOT NULL,
    locked_state    VARCHAR(32) NOT NULL,
    locked_fields   JSONB NOT NULL,   -- ["product_id", "quantity", ...]
    unlock_role     VARCHAR(64),
    UNIQUE (doc_type, locked_state)
);

-- ============== sys_audit_log 审计日志 ==============
CREATE TABLE IF NOT EXISTS sys_audit_log (
    log_id          BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL,
    user_name       VARCHAR(64) NOT NULL,
    action          VARCHAR(32) NOT NULL,    -- CREATE/UPDATE/DELETE/APPROVE/REJECT/EXPORT/LOGIN
    entity_type     VARCHAR(64),
    entity_id       VARCHAR(128),
    before_value    JSONB,
    after_value     JSONB,
    ip_addr         VARCHAR(64),
    user_agent      TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON sys_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON sys_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_time ON sys_audit_log(created_at);

-- 业务表通用字段模板
-- store_code         数据隔离字段（必填）
-- created_store_code 创建机构（不可变，由 ORM 拦截器自动写入）
-- currency_code      币种字段（金额相关表必填，'CNY'|'LAK'）
-- status             单据状态（用于状态机锁）
-- created_by, created_at, updated_by, updated_at  审计字段
-- deleted_at         软删除时间戳（NULL 表示未删除）

-- 示例：销售订单表
CREATE TABLE IF NOT EXISTS biz_sales_order (
    order_id            BIGSERIAL PRIMARY KEY,
    order_no            VARCHAR(64) UNIQUE NOT NULL,
    customer_id         BIGINT NOT NULL,
    total_amount        DECIMAL(18, 2) NOT NULL,
    currency_code       VARCHAR(8) NOT NULL DEFAULT 'CNY',
    status              VARCHAR(32) NOT NULL DEFAULT 'DRAFT', -- DRAFT/CONFIRMED/SHIPPED/DELIVERED/CLOSED/CANCELLED
    store_code          VARCHAR(64) NOT NULL,
    created_store_code  VARCHAR(64) NOT NULL,
    created_by          BIGINT NOT NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by          BIGINT,
    updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMP,
    note                TEXT
);
CREATE INDEX IF NOT EXISTS idx_so_store ON biz_sales_order(store_code);
CREATE INDEX IF NOT EXISTS idx_so_customer ON biz_sales_order(customer_id);
CREATE INDEX IF NOT EXISTS idx_so_status ON biz_sales_order(status);
