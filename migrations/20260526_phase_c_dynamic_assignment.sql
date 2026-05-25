-- Phase C: Dynamic Assignment & Organization Routing
-- 2026-05-26

ALTER TABLE wf_approval_instance_steps
  ADD COLUMN IF NOT EXISTS approver_type VARCHAR(32) DEFAULT 'ROLE';

ALTER TABLE sys_organizations
  ADD COLUMN IF NOT EXISTS manager_user_id BIGINT,
  ADD COLUMN IF NOT EXISTS manager_name    VARCHAR(128);

ALTER TABLE sys_user_orgs
  ADD COLUMN IF NOT EXISTS position_title VARCHAR(128),
  ADD COLUMN IF NOT EXISTS is_manager     BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE prc2_projects
  ADD COLUMN IF NOT EXISTS project_manager_user_id BIGINT,
  ADD COLUMN IF NOT EXISTS project_manager_name    VARCHAR(128);

ALTER TABLE sys_user
  ADD COLUMN IF NOT EXISTS manager_user_id BIGINT;
