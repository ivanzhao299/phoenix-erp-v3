'use client';
/**
 * usePermission — 细粒度权限检查 Hook (V2)
 *
 * 基于 JWT 中已合并的 permissions 数组（服务端 3 路源合并），
 * 提供组件级的按钮/功能开关控制。
 *
 * 权限码说明:
 *   V = View   (查看列表、详情页)
 *   C = Create (新增按钮、保存提交)
 *   E = Edit   (编辑按钮、内联编辑)
 *   D = Delete (删除按钮、批量删除)
 *   A = Approve(审批/驳回按钮)
 *   X = Export (导出 Excel/PDF)
 *
 * 用法 1 — 菜单级细粒度检查（推荐）:
 *   const { canEdit, canDelete, canApprove } = usePermission('MENU_PKG_MGR');
 *
 * 用法 2 — 角色检查（兼容旧用法）:
 *   const { can } = usePermission();
 *   if (can(['ROLE_FARM_MGR', 'ROLE_ADMIN'])) { ... }
 *
 * 用法 3 — 快速导出按钮:
 *   const { canExport } = usePermission('MENU_FIN_REPORT');
 */

import { useMemo } from 'react';
import { useAuth, hasMenuPerm } from '@/contexts/AuthContext';

export type PermResult = {
  /** 是否可查看（列表/详情页展示） */
  canView: boolean;
  /** 是否可新增 */
  canCreate: boolean;
  /** 是否可编辑 */
  canEdit: boolean;
  /** 是否可删除 */
  canDelete: boolean;
  /** 是否可审批 */
  canApprove: boolean;
  /** 是否可导出 */
  canExport: boolean;
  /** 是否拥有该菜单查看权限（即菜单/卡片/页面入口可见） */
  hasAccess: boolean;
  /** 是否超管 */
  isSuper: boolean;
  /** 通用检查：任意权限码组合 — check('V') / check('V,C') */
  check: (codes: string) => boolean;
  // ── 兼容旧用法 ──────────────────────────────────────────────────
  /** 角色匹配检查（兼容旧 can(['ROLE_X']) 用法） */
  can: (allowedRoles?: string[]) => boolean;
  /** 单键权限检查（兼容旧 hasPerm('key') 用法） */
  hasPerm: (key: string) => boolean;
  /** 当前用户对象 */
  user: Record<string, unknown>;
  /** 当前主角色 */
  role: string;
  /** 所有角色数组 */
  roles: string[];
};

/**
 * @param menuCode  菜单码，如 'MENU_PKG_MGR'（可省略，省略时只支持 can/hasPerm 旧用法）
 */
export function usePermission(menuCode?: string | null): PermResult {
  const { user } = useAuth();

  return useMemo(() => {
    const safeUser = user ?? {};
    const perms: string[] = Array.isArray(safeUser.permissions) ? safeUser.permissions : [];
    const userRoles: string[] = Array.isArray(safeUser.roles) ? safeUser.roles : (safeUser.role ? [safeUser.role] : []);
    const isAdmin = userRoles.includes('ROLE_ADMIN') || safeUser.role === 'ROLE_ADMIN' || perms.includes('*');

    // 兼容旧 can / hasPerm 函数
    const can = (allowedRoles: string[] = []): boolean => {
      if (isAdmin) return true;
      return allowedRoles.some(r => userRoles.includes(r));
    };
    const hasPerm = (key: string): boolean => {
      if (isAdmin) return true;
      return perms.includes(key);
    };

    // 无菜单码或超管时快速返回
    if (isAdmin) {
      return {
        canView: true, canCreate: true, canEdit: true,
        canDelete: true, canApprove: true, canExport: true,
        hasAccess: true, isSuper: true,
        check: () => true, can, hasPerm,
        user: safeUser, role: safeUser.role ?? '', roles: userRoles,
      };
    }

    if (!menuCode) {
      // 无菜单码 → 细粒度项全为 false，但 can/hasPerm 仍可用
      return {
        canView: false, canCreate: false, canEdit: false,
        canDelete: false, canApprove: false, canExport: false,
        hasAccess: false, isSuper: false,
        check: () => false, can, hasPerm,
        user: safeUser, role: safeUser.role ?? '', roles: userRoles,
      };
    }

    const check = (codes: string) => hasMenuPerm(perms, menuCode, codes);

    return {
      canView:    check('V'),
      canCreate:  check('C'),
      canEdit:    check('E'),
      canDelete:  check('D'),
      canApprove: check('A'),
      canExport:  check('X'),
      hasAccess:  check('V'),
      isSuper:    false,
      check, can, hasPerm,
      user: safeUser, role: safeUser.role ?? '', roles: userRoles,
    };
  }, [user, menuCode]);
}

export default usePermission;
