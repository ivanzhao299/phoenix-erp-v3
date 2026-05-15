'use client';
/**
 * usePermission — 按钮级权限 Hook
 * 用法: const { can, isSuper, canDelete } = usePermission();
 *       {can(['ROLE_FARM_MGR','ROLE_ADMIN']) && <button>新增</button>}
 */
export const usePermission = () => {
  let user: any = {};
  try {
    if (typeof window !== 'undefined') {
      user = JSON.parse(sessionStorage.getItem('phoenix_user') || '{}');
    }
  } catch { /* ignore */ }

  const role    = user.role || '';
  const roles: string[] = Array.isArray(user.roles) ? user.roles : (role ? [role] : []);
  const perms: string[] = Array.isArray(user.permissions) ? user.permissions : [];
  const isSuper = perms.includes('*') || roles.includes('ROLE_ADMIN');

  const can = (allowedRoles: string[] = []): boolean => {
    if (isSuper) return true;
    return allowedRoles.some(r => roles.includes(r));
  };

  const hasPerm = (permKey: string): boolean => {
    if (isSuper) return true;
    return perms.includes(permKey);
  };

  return { role, roles, isSuper, can, hasPerm, user, canDelete: isSuper };
};
