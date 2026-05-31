-- ============================================================
-- Role Runtime Phase C — Organization Runtime Recovery
-- 组织权限与角色运行恢复（整合迁移）
--
-- 根因（联合审计验证）：
--   sys_user_orgs.data_scope_level CHECK 约束仅允许 5 个值，
--   缺 'SITE'/'DEPARTMENT'/'STORE'/'WAREHOUSE'。
--   Phase B 写入 'SITE' 触发 CHECK 违规 → 整个 DO 块回滚 →
--   13 个用户绑定全部失败，司机超权未修复。
--   叠加 deploy.yml 的 `|| true` 吞错 → "迁移失败但部署成功"假象。
--
-- 本迁移（幂等，可重复执行）：
--   § 1. 扩展 data_scope_level CHECK 约束（7 层组织模型）
--   § 2. 确认 org_code / role_scope 列存在
--   § 3. 关闭 perms_version 触发器（防踢出在线用户）
--
-- 注：组织树落库见 20260531_org_runtime_phase1.sql（文件名排序在前，先执行）
--     用户绑定见 20260531_user_org_bindings.sql（排序在后，约束修复后成功）
--     本迁移专注于"约束修复"这一前置依赖，文件名排序保证最先执行。
-- ============================================================

-- 关闭批量迁移期间的 perms_version 触发器
SET LOCAL phx.skip_perms_bump = 'on';

-- ──────────────────────────────────────────────────────────────────────────────
-- § 1. 扩展 sys_user_orgs.data_scope_level CHECK 约束
--   旧约束：CHECK (data_scope_level IN ('SELF','PROJECT','COMPANY','REGION','GROUP'))
--   新约束：增加组织 5 层模型 + STORE/WAREHOUSE（共 9 个允许值）
-- ──────────────────────────────────────────────────────────────────────────────

-- 安全删除所有可能的旧约束名（自动生成名 + 各历史命名）
ALTER TABLE sys_user_orgs DROP CONSTRAINT IF EXISTS sys_user_orgs_data_scope_level_check;
ALTER TABLE sys_user_orgs DROP CONSTRAINT IF EXISTS chk_user_org_scope_level;

-- 添加新约束（7 层组织模型 + 向后兼容旧值）
ALTER TABLE sys_user_orgs
  ADD CONSTRAINT chk_user_org_scope_level CHECK (
    data_scope_level IN (
      -- 组织层级（GROUP > BU > COMPANY > SITE > DEPARTMENT）
      'GROUP','BU','COMPANY','SITE','DEPARTMENT',
      -- 业务实体层级
      'STORE','WAREHOUSE',
      -- 向后兼容旧值（避免历史数据违反约束）
      'SELF','PROJECT','REGION'
    )
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- § 2. 确认 org_code / role_scope 列存在（幂等）
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE sys_user_orgs ADD COLUMN IF NOT EXISTS org_code   VARCHAR(64);
ALTER TABLE sys_user_orgs ADD COLUMN IF NOT EXISTS role_scope VARCHAR(32);

-- role_scope CHECK（同步扩展）
ALTER TABLE sys_user_orgs DROP CONSTRAINT IF EXISTS sys_user_orgs_role_scope_check;
ALTER TABLE sys_user_orgs DROP CONSTRAINT IF EXISTS chk_user_org_role_scope;
ALTER TABLE sys_user_orgs
  ADD CONSTRAINT chk_user_org_role_scope CHECK (
    role_scope IS NULL OR role_scope IN (
      'GROUP','BU','COMPANY','SITE','DEPARTMENT','STORE','WAREHOUSE'
    )
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- § 3. 验证：输出当前约束定义（部署日志可见）
-- ──────────────────────────────────────────────────────────────────────────────
SELECT conname AS constraint_name, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'sys_user_orgs'::regclass AND contype = 'c'
ORDER BY conname;
