import type { EntityManager } from 'typeorm';
import type { PermSource } from './permissions-resolver';

/** Shared three-source permission read. Does not load credentials, JWT code or application/background modules. */
export async function loadPermissionSources(manager:Pick<EntityManager,'query'>,userId:string|number,
  options:{activeRolesOnly?:boolean}={}):Promise<PermSource[]> {
  const activeRole=options.activeRolesOnly===true?"AND r.status='ACTIVE'":'';
  return manager.query(`
          -- ① 角色直绑权限
          SELECT
            m.menu_code,
            rmp.perm_codes, rmp.deny_codes, rmp.scope_type, rmp.scope_value,
            COALESCE(r.approval_level, 0) AS approval_level,
            'role'::text AS source
          FROM sys_user_role ur
          JOIN sys_role r                  ON r.role_id = ur.role_id
          JOIN sys_role_menu_permission rmp ON rmp.role_id = r.role_id
          JOIN sys_menu m                  ON m.menu_id = rmp.menu_id
          WHERE ur.user_id = $1
            AND COALESCE(ur.is_visible, true) = true
            ${activeRole}

          UNION ALL

          -- ② 角色 → 权限集 → 权限集 item
          SELECT
            m.menu_code,
            psi.perm_codes, psi.deny_codes, psi.scope_type, psi.scope_value,
            COALESCE(r.approval_level, 0) AS approval_level,
            'role_set'::text AS source
          FROM sys_user_role ur
          JOIN sys_role r                       ON r.role_id = ur.role_id
          JOIN sys_role_permission_set rps      ON rps.role_id = r.role_id
          JOIN sys_permission_set_item psi      ON psi.set_id = rps.set_id
          JOIN sys_menu m                       ON m.menu_id = psi.menu_id
          WHERE ur.user_id = $1
            AND COALESCE(ur.is_visible, true) = true
            ${activeRole}

          UNION ALL

          -- ③ 用户直绑权限集（绕开角色路径）
          SELECT
            m.menu_code,
            psi.perm_codes, psi.deny_codes, psi.scope_type, psi.scope_value,
            0 AS approval_level,  -- 直绑无角色优先级，默认最低；DENY 仍然生效
            'user_set'::text AS source
          FROM sys_user_permission_set ups
          JOIN sys_permission_set_item psi ON psi.set_id = ups.set_id
          JOIN sys_menu m                  ON m.menu_id = psi.menu_id
          WHERE ups.user_id = $1
          `,[userId]);
}
