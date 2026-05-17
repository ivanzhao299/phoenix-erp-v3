/**
 * Terminal 路由组布局
 * - 全屏深色背景，无 PC 端 Sidebar
 * - 左侧 72px 导航轨
 * - KioskGuard 强制全屏
 */
'use client';
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import TerminalNavRail from '@/components/terminal/TerminalNavRail';

export default function TerminalLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  // 未登录跳回登录页（附带 return URL，登录后可直接回来）
  useEffect(() => {
    if (!loading && !user) {
      const returnPath = typeof window !== 'undefined' ? window.location.pathname : '/terminal/packaging/dashboard';
      router.replace(`/login?return=${encodeURIComponent(returnPath)}`);
    }
  }, [user, loading, router]);

  // 强制全屏
  useEffect(() => {
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    }
    // 退出全屏时重新锁定
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        setTimeout(() => {
          el.requestFullscreen().catch(() => {});
        }, 200);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  if (loading || !user) return null;

  return (
    <div style={{
      display: 'flex',
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      background: '#0f172a',
      color: '#f1f5f9',
      fontFamily: '"Noto Sans SC", "Inter", sans-serif',
    }}>
      {/* 左侧导航轨 */}
      <TerminalNavRail />

      {/* 主内容区 */}
      <main style={{
        flex: 1,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {children}
      </main>
    </div>
  );
}
