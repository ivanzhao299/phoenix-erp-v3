-- ════════════════════════════════════════════════════════════════════════
-- G117 角色生命周期（治理①）2026-06-14  ⚠️ 本地先跑·待审·后部署
-- ────────────────────────────────────────────────────────────────────────
-- 1. sys_role 加 status(ACTIVE/DEPRECATED) + deprecated_at —— 角色可软停用，
--      废弃/未配人角色从编辑页隐藏而非删除（数据保留、可恢复）。
-- 2. 退役 2 个角色：ROLE_QC_INSPECTOR（已废弃·被养殖场质检员/质检专员取代）、
--      ROLE_PILOT_MANAGER（UAT 试运行遗留）。
-- 3. 清理 ROLE_QC_INSPECTOR 名称里的 [已废弃] 前缀（标志位归 status 管，名称回归）。
-- 幂等：ADD COLUMN IF NOT EXISTS；UPDATE 可重复。
-- ════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regclass('public.sys_role') IS NULL THEN RETURN; END IF;

  ALTER TABLE sys_role ADD COLUMN IF NOT EXISTS status        VARCHAR(16) NOT NULL DEFAULT 'ACTIVE';
  ALTER TABLE sys_role ADD COLUMN IF NOT EXISTS deprecated_at TIMESTAMP NULL;

  -- 约束：仅 ACTIVE / DEPRECATED
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_sys_role_status') THEN
    ALTER TABLE sys_role ADD CONSTRAINT chk_sys_role_status
      CHECK (status IN ('ACTIVE','DEPRECATED'));
  END IF;

  -- 退役 2 个角色
  UPDATE sys_role
     SET status = 'DEPRECATED', deprecated_at = COALESCE(deprecated_at, NOW())
   WHERE role_code IN ('ROLE_QC_INSPECTOR','ROLE_PILOT_MANAGER')
     AND status <> 'DEPRECATED';

  -- 清理已废弃前缀（标志位已归 status）
  UPDATE sys_role SET role_name_zh = '质检员'
   WHERE role_code = 'ROLE_QC_INSPECTOR' AND role_name_zh LIKE '%已废弃%';
END $$;

CREATE INDEX IF NOT EXISTS idx_sys_role_status ON sys_role(status);
