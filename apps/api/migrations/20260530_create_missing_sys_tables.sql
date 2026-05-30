-- ============================================================
-- Migration: 批量建立缺失的 sys_* 核心表
-- 说明：以下表均有对应 TypeORM Entity + Service + Controller，
--       但从未在 DDL 或迁移文件中创建，导致运行时报错：
--         relation "xxx" does not exist
-- 涉及错误页面：
--   · /notifications        → sys_notifications 缺失
--   · /settings/organizations → sys_organizations 缺失
--   · 数据范围 DataScopeGuard → sys_user_orgs / sys_user_project_scopes
--                               / sys_user_warehouse_scopes 缺失（非管理员用户）
--   · 所有写操作审计拦截器  → sys_operation_logs 缺失（每次 API 写操作都 INSERT）
-- 幂等：全部使用 IF NOT EXISTS，重复执行无副作用
-- ============================================================


-- ── 1. sys_notifications — 站内通知 ────────────────────────────────────────
--    Entity: src/modules/notification/entities/sys-notification.entity.ts
--    Service: NotificationService (list / markRead / unreadCount)
--    前端: /notifications 页面 + Sidebar 未读徽章

CREATE TABLE IF NOT EXISTS sys_notifications (
    id                BIGSERIAL       PRIMARY KEY,
    user_id           BIGINT          NOT NULL,
    notification_type VARCHAR(32)     NOT NULL DEFAULT 'WORKFLOW_TASK',
    title             VARCHAR(256)    NOT NULL,
    content           TEXT            NOT NULL,
    link_type         VARCHAR(32),
    link_id           VARCHAR(64),
    biz_type          VARCHAR(32),
    biz_id            VARCHAR(64),
    biz_no            VARCHAR(80),
    status            VARCHAR(16)     NOT NULL DEFAULT 'UNREAD'
                          CHECK (status IN ('UNREAD','READ','ARCHIVED')),
    read_at           TIMESTAMPTZ,
    created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  sys_notifications IS '站内通知：工作流任务提醒 / 信用预警 / 库存临期预警等';

CREATE INDEX IF NOT EXISTS idx_notifications_user_status  ON sys_notifications (user_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON sys_notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_biz          ON sys_notifications (biz_type, biz_id) WHERE biz_type IS NOT NULL;


-- ── 2. sys_organizations — 组织架构 ────────────────────────────────────────
--    Entity: src/modules/org/entities/sys-organization.entity.ts
--    Service: OrgService (listOrgs / getOrg / createOrg / updateOrg)
--    前端: /settings/organizations 页面
--    关联: DataScopeService 和 WorkflowAssignmentResolver 均 JOIN 此表

CREATE TABLE IF NOT EXISTS sys_organizations (
    id               BIGSERIAL       PRIMARY KEY,
    org_code         VARCHAR(64)     NOT NULL UNIQUE,
    org_name         VARCHAR(128)    NOT NULL,
    parent_id        BIGINT          REFERENCES sys_organizations(id),
    org_type         VARCHAR(32)     NOT NULL
                         CHECK (org_type IN ('GROUP','COMPANY','FACTORY','PROJECT',
                                             'WAREHOUSE','STORE','DEPARTMENT')),
    level            INTEGER         NOT NULL DEFAULT 1,
    path             TEXT,
    status           VARCHAR(16)     NOT NULL DEFAULT 'ACTIVE',
    company_code     VARCHAR(64),
    project_code     VARCHAR(64),
    warehouse_code   VARCHAR(64),
    remark           TEXT,
    manager_user_id  BIGINT,
    manager_name     VARCHAR(128),
    created_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  sys_organizations IS '组织架构：集团/公司/工厂/项目/仓库/门店/部门';

CREATE INDEX IF NOT EXISTS idx_orgs_parent   ON sys_organizations (parent_id);
CREATE INDEX IF NOT EXISTS idx_orgs_type     ON sys_organizations (org_type);
CREATE INDEX IF NOT EXISTS idx_orgs_status   ON sys_organizations (status);
CREATE INDEX IF NOT EXISTS idx_orgs_company  ON sys_organizations (company_code) WHERE company_code IS NOT NULL;


-- ── 3. sys_user_orgs — 用户-组织关联（RBAC 数据范围基础） ──────────────────
--    Entity: src/modules/org/entities/sys-user-org.entity.ts
--    Service: DataScopeService 查询用户所属组织范围

CREATE TABLE IF NOT EXISTS sys_user_orgs (
    id                BIGSERIAL       PRIMARY KEY,
    user_id           BIGINT          NOT NULL,
    org_id            BIGINT          NOT NULL REFERENCES sys_organizations(id) ON DELETE CASCADE,
    is_primary        BOOLEAN         NOT NULL DEFAULT FALSE,
    data_scope_level  VARCHAR(16)     NOT NULL DEFAULT 'COMPANY'
                          CHECK (data_scope_level IN ('SELF','PROJECT','COMPANY','REGION','GROUP')),
    position_title    VARCHAR(128),
    is_manager        BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_org UNIQUE (user_id, org_id)
);

COMMENT ON TABLE  sys_user_orgs IS '用户-组织关联：决定非管理员用户的数据可见范围';

CREATE INDEX IF NOT EXISTS idx_user_orgs_user   ON sys_user_orgs (user_id);
CREATE INDEX IF NOT EXISTS idx_user_orgs_org    ON sys_user_orgs (org_id);


-- ── 4. sys_user_project_scopes — 用户额外项目授权 ──────────────────────────
--    Entity: src/modules/org/entities/sys-user-project-scope.entity.ts
--    Service: DataScopeService 追加 project codes

CREATE TABLE IF NOT EXISTS sys_user_project_scopes (
    id           BIGSERIAL   PRIMARY KEY,
    user_id      BIGINT      NOT NULL,
    project_code VARCHAR(64) NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_project UNIQUE (user_id, project_code)
);

CREATE INDEX IF NOT EXISTS idx_user_proj_user ON sys_user_project_scopes (user_id);


-- ── 5. sys_user_warehouse_scopes — 用户额外仓库授权 ────────────────────────
--    Entity: src/modules/org/entities/sys-user-warehouse-scope.entity.ts
--    Service: DataScopeService 追加 warehouse codes

CREATE TABLE IF NOT EXISTS sys_user_warehouse_scopes (
    id             BIGSERIAL   PRIMARY KEY,
    user_id        BIGINT      NOT NULL,
    warehouse_code VARCHAR(64) NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_warehouse UNIQUE (user_id, warehouse_code)
);

CREATE INDEX IF NOT EXISTS idx_user_wh_user ON sys_user_warehouse_scopes (user_id);


-- ── 6. sys_operation_logs — 高敏感操作审计日志 ─────────────────────────────
--    Entity: src/common/entities/sys-operation-log.entity.ts
--    拦截器: OperationLogInterceptor (所有写操作 API 响应后异步 INSERT)
--    页面:   /settings/audit-log
--    注意:   此表缺失时，每次写 API 操作都会抛出数据库错误（虽然被 catch 吞掉，
--            但会导致日志系统完全失效，且产生大量 stderr 输出）

CREATE TABLE IF NOT EXISTS sys_operation_logs (
    id             BIGSERIAL       PRIMARY KEY,
    user_id        BIGINT,
    username       VARCHAR(64),
    role_code      VARCHAR(64),
    module_code    VARCHAR(64),
    action_code    VARCHAR(32),
    biz_type       VARCHAR(64),
    biz_id         BIGINT,
    biz_no         VARCHAR(80),
    request_method VARCHAR(8),
    request_path   VARCHAR(256),
    ip_address     VARCHAR(64),
    user_agent     TEXT,
    before_data    JSONB,
    after_data     JSONB,
    result_status  VARCHAR(16)     NOT NULL DEFAULT 'SUCCESS',
    created_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  sys_operation_logs IS '高敏感操作审计日志：支付/调拨/审批/权限变更等写操作追踪';

CREATE INDEX IF NOT EXISTS idx_oplogs_user       ON sys_operation_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oplogs_module     ON sys_operation_logs (module_code, action_code);
CREATE INDEX IF NOT EXISTS idx_oplogs_biz        ON sys_operation_logs (biz_type, biz_id) WHERE biz_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_oplogs_created    ON sys_operation_logs (created_at DESC);
