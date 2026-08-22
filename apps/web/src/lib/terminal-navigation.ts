import type { PermissionChecker } from '@/components/layout/Sidebar';

export const ADMIN_HOME_PATH = '/dashboard';

/** 只有能实际查看集团驾驶舱的用户才显示“返回管理后台”，避免普通终端账号被重定向。 */
export function canReturnToAdmin(hasPermission: PermissionChecker): boolean {
  return hasPermission('MENU_DASHBOARD', 'V');
}
