-- ============================================================
-- Phase C-1.1 — 修复 sys_user_orgs 的 CHECK 约束（DataScope 落库前置）
--
-- 根因（联合审计验证二）：
--   sys_user_orgs.data_scope_level 的 CHECK 约束仅允许：
--     'SELF','PROJECT','COMPANY','REGION','GROUP'
--   但组织架构 5 层模型需要 'SITE' 和 'DEPARTMENT'，
--   Phase B 绑定写入 'SITE' 时触发 CHECK 违规 → 整个 DO 块回滚 →
--   13 个用户绑定全部失败，司机安全超权未修复。
--
-- 本迁移：
--   1. 扩展 data_scope_level CHECK 约束，增加 'SITE'/'DEPARTMENT'/'BU'
--   2. 关闭 perms_version 触发器（虽然本迁移不动权限表，防御性保留）
--
-- 幂等：DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT
-- ============================================================

-- 关闭批量迁移期间的 perms_version 触发器（防御性）
SET LOCAL phx.skip_perms_bump = 'on';

-- ── 扩展 data_scope_level CHECK 约束 ────────────────────────────────────────────
-- 先删除旧约束（可能有不同的自动生成名，逐一尝试）
ALTER TABLE sys_user_orgs DROP CONSTRAINT IF EXISTS sys_user_orgs_data_scope_level_check;
ALTER TABLE sys_user_orgs DROP CONSTRAINT IF EXISTS chk_user_org_scope_level;

-- 添加新约束：5层组织模型完整支持（GROUP > BU > COMPANY > SITE > DEPARTMENT + 兼容旧值）
ALTER TABLE sys_user_orgs
  ADD CONSTRAINT chk_user_org_scope_level CHECK (
    data_scope_level IN (
      'SELF','PROJECT','COMPANY','REGION','GROUP',  -- 原有值（向后兼容）
      'BU','SITE','DEPARTMENT'                       -- 新增：组织 5 层模型
    )
  );

-- ── 确认 org_code / role_scope 列存在（幂等，可能 phase1 已加）───────────────────
ALTER TABLE sys_user_orgs ADD COLUMN IF NOT EXISTS org_code   VARCHAR(64);
ALTER TABLE sys_user_orgs ADD COLUMN IF NOT EXISTS role_scope VARCHAR(32);

-- 同步 role_scope CHECK（删旧加新，确保与 5 层一致）
-- 修复（成本控制本地双遍验证）：原仅删自动生成名，漏删自定义名 chk_user_org_role_scope，
-- 存量库二次执行时 ADD 报"constraint already exists"。补 DROP IF EXISTS。
ALTER TABLE sys_user_orgs DROP CONSTRAINT IF EXISTS sys_user_orgs_role_scope_check;
ALTER TABLE sys_user_orgs DROP CONSTRAINT IF EXISTS chk_user_org_role_scope;
ALTER TABLE sys_user_orgs
  ADD CONSTRAINT chk_user_org_role_scope CHECK (
    role_scope IS NULL OR role_scope IN ('GROUP','BU','COMPANY','SITE','DEPARTMENT')
  );

-- ── 验证：输出当前约束 ──────────────────────────────────────────────────────────
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'sys_user_orgs'::regclass
  AND contype = 'c'
ORDER BY conname;
