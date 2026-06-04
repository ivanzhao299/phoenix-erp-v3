-- ════════════════════════════════════════════════════════════════════════════
-- G5.5-E · Master Data Operations Platform — 运营权限角色种子
-- ════════════════════════════════════════════════════════════════════════════
-- 新增 3 个主数据运营相关角色：
--   ROLE_MASTER_DATA_OPERATOR  日常运营（查看/维护/补资料/提交审批，不可审批/不可设规则）
--   ROLE_MASTER_DATA_APPROVER  审批岗（仅可审批 PENDING_APPROVAL 状态）
--   ROLE_MASTER_DATA_ADMIN     管理员（全权 + 配置 Workflow 规则 + 字典维护）
--
-- 配合现有 ROLE_ADMIN / ROLE_*_MGR 角色形成完整主数据角色体系。
--
-- 幂等：ON CONFLICT DO NOTHING。
-- ════════════════════════════════════════════════════════════════════════════

-- 注：sys_role 实际 schema 由项目早期建立，本文件仅做 INSERT 种子。
-- 如果 sys_role 表结构不同，下面的字段需调整。

DO $$
BEGIN
  -- 仅当 sys_role 表存在时执行
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='sys_role') THEN
    -- ROLE_MASTER_DATA_OPERATOR
    INSERT INTO sys_role (role_code, role_name_zh, role_name_en, description, approval_level, role_type, created_at)
    SELECT 'ROLE_MASTER_DATA_OPERATOR', '主数据运营专员', 'Master Data Operator',
           'G5.5-E: 主数据日常运营（查看/维护/补资料/提交审批）；不可审批；不可改规则',
           1, 'OPERATIONAL', now()
    WHERE NOT EXISTS (SELECT 1 FROM sys_role WHERE role_code = 'ROLE_MASTER_DATA_OPERATOR');

    -- ROLE_MASTER_DATA_APPROVER
    INSERT INTO sys_role (role_code, role_name_zh, role_name_en, description, approval_level, role_type, created_at)
    SELECT 'ROLE_MASTER_DATA_APPROVER', '主数据审批人', 'Master Data Approver',
           'G5.5-E: 主数据审批岗位（PENDING_APPROVAL 状态审批/驳回）；不可日常维护',
           3, 'APPROVAL', now()
    WHERE NOT EXISTS (SELECT 1 FROM sys_role WHERE role_code = 'ROLE_MASTER_DATA_APPROVER');

    -- ROLE_MASTER_DATA_ADMIN
    INSERT INTO sys_role (role_code, role_name_zh, role_name_en, description, approval_level, role_type, created_at)
    SELECT 'ROLE_MASTER_DATA_ADMIN', '主数据管理员', 'Master Data Admin',
           'G5.5-E: 主数据全权管理（运营+审批+规则配置+字典维护）',
           5, 'ADMIN', now()
    WHERE NOT EXISTS (SELECT 1 FROM sys_role WHERE role_code = 'ROLE_MASTER_DATA_ADMIN');
  END IF;
END $$;

COMMENT ON SCHEMA public IS
  'G5.5-E: 主数据中心运营平台 — 6 大中心实时统计 + 全局搜索 + 引用关系图 + 运营工作台 + 3 角色体系';
