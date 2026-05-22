'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getAccessLevel, AccessLevel } from '@/lib/mobile-roles';

interface MobilePermissionResult {
  level:    AccessLevel;
  allowed:  boolean;
  readonly: boolean;
  loading:  boolean;
}

/**
 * 从 JWT permissions 数组推导移动端访问级别。
 * 菜单码约定：MOBILE_<PAGEKEY_UPPERCASE>
 * perm_codes 含 C 或 E → write；仅含 V → read；无条目 → none
 */
function getMobileAccessFromJWT(
  permissions: string[] | undefined,
  pageKey: string,
): AccessLevel {
  if (!permissions || permissions.length === 0) return 'none';
  if (permissions.includes('*')) return 'write';   // 超管通配
  const menuCode = `MOBILE_${pageKey.toUpperCase()}`;
  const entry = permissions.find(p => p.startsWith(menuCode + ':'));
  if (!entry) return 'none';
  const codes = entry.split(':')[1] ?? '';
  return (codes.includes('C') || codes.includes('E')) ? 'write' : 'read';
}

/**
 * 手机端页面权限守卫
 *
 * 优先级：
 *   1. JWT permissions（DB 动态权限，admin 在 settings/roles 修改后重登即生效）
 *   2. mobile-roles.ts 硬编码矩阵（兜底：新角色尚未在 DB 中配置时保底）
 *
 * 用法：
 *   const { allowed, readonly, loading } = useMobilePermission('feed');
 *
 * - allowed=false 且 loading=false → 自动重定向到 /mobile/home
 * - readonly=true → 提交/编辑按钮应禁用
 */
export function useMobilePermission(pageKey: string): MobilePermissionResult {
  const { user, loading } = useAuth();
  const router = useRouter();

  const level: AccessLevel = loading ? 'none' : (() => {
    // 优先：JWT 动态权限（DB 配置）
    const jwtLevel = getMobileAccessFromJWT(user?.permissions, pageKey);
    if (jwtLevel !== 'none') return jwtLevel;
    // 兜底：硬编码矩阵（兼容未配置 MOBILE_* 的角色）
    return getAccessLevel(pageKey, user?.role);
  })();

  const allowed  = level !== 'none';
  const readonly = level === 'read';

  useEffect(() => {
    if (!loading && !allowed) {
      router.replace('/mobile/home');
    }
  }, [loading, allowed, router]);

  return { level, allowed, readonly, loading };
}
