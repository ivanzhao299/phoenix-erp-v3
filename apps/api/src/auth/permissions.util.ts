/**
 * Phoenix ERP V3 — RBAC 权限解析工具（G6 收紧 · 2026-06-06）
 * ════════════════════════════════════════════════════════════════════════
 * 唯一权威：JWT.permissions 数组（来自 sys_role_menu_permission DB 表，
 * auth.service 登录时由 permissions-resolver 合并产出）。
 *
 * 格式：
 *   - 'MENU_XXX:V,C,E'    — 该菜单的可用操作位
 *   - 'MENU_XXX:V,C,E,D,A,X' — 全权
 *   - '*'                  — 超管通配（admin）
 *
 * 合法 perm codes：V/C/E/D/A/X（查看/新增/编辑/删除/审批/导出）
 */

export type PermCode = 'V' | 'C' | 'E' | 'D' | 'A' | 'X';
export const ALL_PERM_CODES: readonly PermCode[] = ['V', 'C', 'E', 'D', 'A', 'X'];

/**
 * 检查 user.permissions 数组是否对指定 menu 持有指定 perm。
 *
 * 用法：
 *   if (hasPerm(user.permissions, 'MENU_FARM_DATA', 'V')) { ... }
 *
 * 复杂度：O(n)，n = permissions 长度（典型 < 50）。
 */
export function hasPerm(
  permissions: readonly string[] | null | undefined,
  menuCode: string,
  requiredPerm: PermCode,
): boolean {
  if (!permissions || permissions.length === 0) return false;
  if (permissions.includes('*')) return true;
  const entry = permissions.find(p => p.startsWith(menuCode + ':'));
  if (!entry) return false;
  const granted = (entry.split(':')[1] || '')
    .split(',')
    .map(s => s.trim() as PermCode);
  return granted.includes(requiredPerm);
}

/**
 * 返回 user.permissions 对指定 menu 的全部 perm codes Set。
 * 用于需要批量判断或调试。
 */
export function getMenuPerms(
  permissions: readonly string[] | null | undefined,
  menuCode: string,
): Set<PermCode> {
  if (!permissions || permissions.length === 0) return new Set();
  if (permissions.includes('*')) return new Set(ALL_PERM_CODES);
  const entry = permissions.find(p => p.startsWith(menuCode + ':'));
  if (!entry) return new Set();
  const granted = (entry.split(':')[1] || '')
    .split(',')
    .map(s => s.trim() as PermCode)
    .filter(c => (ALL_PERM_CODES as readonly string[]).includes(c));
  return new Set(granted);
}
