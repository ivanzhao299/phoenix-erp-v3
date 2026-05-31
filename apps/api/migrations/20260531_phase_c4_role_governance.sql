-- ============================================================
-- Phase C-4 — 角色治理（事业群改派 + 近义角色去重 + 规划角色落地）
--
-- 非 Pilot 阻断项，治理优化。
-- 依据联合审计第3章 G 类（无效/冗余角色）+ 第4章组织错配。
--
-- 安全原则：
--   · 不 DROP 任何角色（保留以兼容历史 Token 和外键）
--   · 去重 = 将废弃角色的用户绑定 + 权限迁移到 canonical 角色，
--     然后把废弃角色标记为 INACTIVE
--   · 关闭 perms_version 触发器，避免批量操作踢出在线用户
-- ============================================================

SET LOCAL phx.skip_perms_bump = 'on';

-- ──────────────────────────────────────────────────────────────────────────────
-- § C-4.2 事业群总经理改派
--   审计发现：zhuhuiran/yue 实为事业群负责人，却被赋 ROLE_REGION_MGR，
--   而专属的 ROLE_BU_AGRI_GM / ROLE_BU_FOOD_GM 反而无人使用。
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_uid BIGINT;
  v_rid BIGINT;
BEGIN
  -- zhuhuiran（朱会然，AREA-ZHU）→ 农业事业群总经理
  SELECT user_id INTO v_uid FROM sys_user WHERE username = 'zhuhuiran';
  SELECT role_id INTO v_rid FROM sys_role WHERE role_code = 'ROLE_BU_AGRI_GM';
  IF v_uid IS NOT NULL AND v_rid IS NOT NULL THEN
    -- 将原主角色降为非主，新增 BU 总经理为主角色
    UPDATE sys_user_role SET is_primary = FALSE WHERE user_id = v_uid;
    INSERT INTO sys_user_role (user_id, role_id, is_primary)
    VALUES (v_uid, v_rid, TRUE)
    ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = TRUE;
  END IF;

  -- yue（岳，AREA-YUE）→ 食品事业群总经理
  SELECT user_id INTO v_uid FROM sys_user WHERE username = 'yue';
  SELECT role_id INTO v_rid FROM sys_role WHERE role_code = 'ROLE_BU_FOOD_GM';
  IF v_uid IS NOT NULL AND v_rid IS NOT NULL THEN
    UPDATE sys_user_role SET is_primary = FALSE WHERE user_id = v_uid;
    INSERT INTO sys_user_role (user_id, role_id, is_primary)
    VALUES (v_uid, v_rid, TRUE)
    ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = TRUE;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- § C-4.3 近义角色去重（合并 → 标记废弃，不删除）
--   去重方向（保留 rbac.matrix.ts 高频使用的 canonical 角色）：
--     ROLE_GROUP_FINANCE     → ROLE_HQ_FINANCE
--     ROLE_PKG_OPERATOR      → ROLE_PKG_OP
--     ROLE_QC_INSPECTOR      → ROLE_QA_STAFF
--     ROLE_FACTORY_ACCOUNTANT→ ROLE_FACTORY_ACCT
--   注：ROLE_HR_ADMIN 与 ROLE_HR_MANAGER 职责不同（前者系统权限，
--       后者组织人事），不合并，均保留。
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  pair RECORD;
  v_dup_id  BIGINT;
  v_keep_id BIGINT;
BEGIN
  FOR pair IN
    SELECT * FROM (VALUES
      ('ROLE_GROUP_FINANCE',      'ROLE_HQ_FINANCE'),
      ('ROLE_PKG_OPERATOR',       'ROLE_PKG_OP'),
      ('ROLE_QC_INSPECTOR',       'ROLE_QA_STAFF'),
      ('ROLE_FACTORY_ACCOUNTANT', 'ROLE_FACTORY_ACCT')
    ) AS t(dup_code, keep_code)
  LOOP
    SELECT role_id INTO v_dup_id  FROM sys_role WHERE role_code = pair.dup_code;
    SELECT role_id INTO v_keep_id FROM sys_role WHERE role_code = pair.keep_code;

    IF v_dup_id IS NOT NULL AND v_keep_id IS NOT NULL THEN
      -- 1) 迁移用户绑定：把持有废弃角色的用户改绑到 canonical 角色
      INSERT INTO sys_user_role (user_id, role_id, is_primary)
      SELECT user_id, v_keep_id, FALSE
      FROM sys_user_role WHERE role_id = v_dup_id
      ON CONFLICT (user_id, role_id) DO NOTHING;
      -- 删除废弃角色的用户绑定
      DELETE FROM sys_user_role WHERE role_id = v_dup_id;

      -- 2) 迁移菜单权限：把废弃角色的权限并入 canonical（取并集，已存在则跳过）
      INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
      SELECT v_keep_id, menu_id, perm_codes
      FROM sys_role_menu_permission WHERE role_id = v_dup_id
      ON CONFLICT (role_id, menu_id) DO NOTHING;
      -- 删除废弃角色的权限记录
      DELETE FROM sys_role_menu_permission WHERE role_id = v_dup_id;

      -- 3) 标记废弃角色（role_name 加 [已废弃] 前缀，不删除以保兼容）
      UPDATE sys_role
      SET role_name_zh = '[已废弃] ' || role_name_zh,
          description  = COALESCE(description, '') || ' | C-4.3 已合并入 ' || pair.keep_code
      WHERE role_id = v_dup_id
        AND role_name_zh NOT LIKE '[已废弃]%';
    END IF;
  END LOOP;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- § C-4.4 规划角色补充组织绑定（事业群总经理落地到组织节点）
--   zhuhuiran → BU-AGRI（已在 user_org_bindings 绑定，此处确认 role_scope）
--   yue → BU-FOOD
-- ──────────────────────────────────────────────────────────────────────────────
UPDATE sys_user_orgs uo
SET role_scope = 'BU'
FROM sys_user u, sys_organizations o
WHERE uo.user_id = u.user_id
  AND uo.org_id  = o.id
  AND u.username IN ('zhuhuiran','yue')
  AND o.org_type = 'BU'
  AND (uo.role_scope IS NULL OR uo.role_scope <> 'BU');

-- ── 验证 ────────────────────────────────────────────────────────────────────────
SELECT u.username, u.real_name, r.role_code, r.role_name_zh, ur.is_primary
FROM sys_user u
JOIN sys_user_role ur ON ur.user_id = u.user_id
JOIN sys_role r ON r.role_id = ur.role_id
WHERE u.username IN ('zhuhuiran','yue')
ORDER BY u.username, ur.is_primary DESC;

SELECT role_code, role_name_zh,
       CASE WHEN role_name_zh LIKE '[已废弃]%' THEN '⚠️已废弃' ELSE '✅有效' END AS status
FROM sys_role
WHERE role_code IN (
  'ROLE_HQ_FINANCE','ROLE_GROUP_FINANCE','ROLE_PKG_OP','ROLE_PKG_OPERATOR',
  'ROLE_QA_STAFF','ROLE_QC_INSPECTOR','ROLE_FACTORY_ACCT','ROLE_FACTORY_ACCOUNTANT',
  'ROLE_BU_AGRI_GM','ROLE_BU_FOOD_GM'
)
ORDER BY role_code;
