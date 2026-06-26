'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getMobileAccessLevel, AccessLevel } from '@/lib/mobile-roles';

interface MobilePermissionResult {
  level:    AccessLevel;
  allowed:  boolean;
  readonly: boolean;
  loading:  boolean;
}

/**
 * 手机端页面权限守卫
 *
 * 与首页卡片门控共用 getMobileAccessLevel（单一权威入口）：
 *   1. JWT permissions（DB 动态权限 MENU_* / MOBILE_*，admin 在用户管理修改后重登即生效）
 *   2. mobile-roles.ts 硬编码矩阵（仅在无权限快照时作为兼容兜底）
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

  const level: AccessLevel = loading ? 'none' : getMobileAccessLevel(pageKey, {
    role: user?.role,
    roles: user?.roles,
    permissions: user?.permissions,
  });

  const allowed  = level !== 'none';
  const readonly = level === 'read';

  useEffect(() => {
    if (!loading && !allowed) {
      router.replace('/mobile/home');
    }
  }, [loading, allowed, router]);

  return { level, allowed, readonly, loading };
}
