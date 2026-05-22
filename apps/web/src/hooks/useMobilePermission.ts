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
 * 手机端页面权限守卫
 *
 * 用法：
 *   const { allowed, readonly, loading } = useMobilePermission('feed');
 *
 * - allowed=false 且 loading=false → 自动重定向到 /mobile/home（无权限）
 * - readonly=true → 提交/编辑按钮应禁用
 */
export function useMobilePermission(pageKey: string): MobilePermissionResult {
  const { user, loading } = useAuth();
  const router = useRouter();

  const level = loading ? 'none' : getAccessLevel(pageKey, user?.role);
  const allowed  = level !== 'none';
  const readonly = level === 'read';

  useEffect(() => {
    if (!loading && !allowed) {
      router.replace('/mobile/home');
    }
  }, [loading, allowed, router]);

  return { level, allowed, readonly, loading };
}
