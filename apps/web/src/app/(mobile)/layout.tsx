'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { MobileThemeProvider } from '@/contexts/MobileThemeContext';

/** 全局断网提示条 — 悬浮在底部，网络恢复后 2 秒自动消失 */
function NetworkBanner() {
  const [offline, setOffline] = useState(false);
  const [showRestore, setShowRestore] = useState(false);

  useEffect(() => {
    const handleOffline = () => { setOffline(true); setShowRestore(false); };
    const handleOnline  = () => {
      setOffline(false);
      setShowRestore(true);
      setTimeout(() => setShowRestore(false), 2500);
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online',  handleOnline);
    // 初始检测（页面加载时已经离线）
    if (!navigator.onLine) setOffline(true);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online',  handleOnline);
    };
  }, []);

  if (!offline && !showRestore) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 'env(safe-area-inset-bottom, 0px)',
      left: 0, right: 0, zIndex: 9999,
      padding: '10px 16px',
      background: offline ? '#ef4444' : '#10b981',
      color: '#fff', fontSize: 13, fontWeight: 600,
      textAlign: 'center',
      transition: 'background 0.3s',
    }}>
      {offline ? '⚠️ 当前无网络连接，数据可能无法提交' : '✅ 网络已恢复'}
    </div>
  );
}

/**
 * 首屏加载动画
 * 在 AuthContext 初始化完成（reading sessionStorage / JWT）之前显示，
 * 防止出现白屏闪烁或未授权页面短暂渲染。
 */
function MobileLoadingScreen() {
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: 'linear-gradient(160deg,#070b14 0%,#0f1929 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 32,
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{
          width: 72,
          height: 72,
          borderRadius: 22,
          background: 'linear-gradient(135deg,#f59e0b 0%,#d97706 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 38,
          boxShadow: '0 0 48px rgba(245,158,11,0.45), 0 12px 28px rgba(0,0,0,0.5)',
        }}>
          🐦
        </div>
        <span style={{
          color: '#f59e0b',
          fontWeight: 800,
          fontSize: 18,
          letterSpacing: 0.6,
        }}>
          Phoenix ERP
        </span>
      </div>

      {/* Spinner */}
      <div
        className="mobile-spin"
        style={{
          width: 32,
          height: 32,
          border: '2.5px solid rgba(255,255,255,0.07)',
          borderTopColor: '#f59e0b',
          borderRadius: '50%',
        }}
      />
    </div>
  );
}

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !isLoggedIn && pathname !== '/mobile/login') {
      router.replace(`/mobile/login?return=${encodeURIComponent(pathname)}`);
    }
  }, [loading, isLoggedIn, pathname, router]);

  /**
   * 禁止捏合缩放（iOS Safari 会忽略 viewport meta 的 user-scalable=no）
   * - 使用 passive:false 才能调用 preventDefault()
   * - 标记了 data-zoomable 的容器（如图片查看器）放行
   */
  useEffect(() => {
    const preventPinchZoom = (e: TouchEvent) => {
      if (e.touches.length < 2) return;
      const target = e.target as Element | null;
      if (target?.closest('[data-zoomable]')) return; // 图片/图表查看区放行
      e.preventDefault();
    };
    document.addEventListener('touchstart', preventPinchZoom, { passive: false });
    // gesturestart 是 iOS 私有事件，也需拦截
    const preventGesture = (e: Event) => {
      const target = (e as TouchEvent).target as Element | null;
      if (!target?.closest('[data-zoomable]')) e.preventDefault();
    };
    document.addEventListener('gesturestart', preventGesture, { passive: false } as AddEventListenerOptions);
    document.addEventListener('gesturechange', preventGesture, { passive: false } as AddEventListenerOptions);
    return () => {
      document.removeEventListener('touchstart', preventPinchZoom);
      document.removeEventListener('gesturestart', preventGesture);
      document.removeEventListener('gesturechange', preventGesture);
    };
  }, []);

  return (
    <MobileThemeProvider>
      {/*
       * 固定容器 — 这是整个移动端 App 的唯一滚动根：
       *   1. position: fixed + inset: 0  →  脱离文档流，body 永远不滚动
       *   2. overflow-y: auto            →  内容超出时在此容器内滚动
       *   3. overscroll-behavior: none   →  禁止容器边界处的橡皮筋回弹
       *   4. -webkit-overflow-scrolling  →  iOS 惯性滚动（丝滑感）
       *   5. touch-action: pan-x pan-y   →  CSS 层禁止捏合缩放，双重保险
       */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          overflowY: 'auto',
          overscrollBehavior: 'none',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-x pan-y',   // CSS 层禁止 pinch-zoom
        } as React.CSSProperties}
      >
        {loading && pathname !== '/mobile/login' ? (
          <MobileLoadingScreen />
        ) : (
          /* key=pathname：每次路由切换触发子树重挂，mobile-page-in 动画自动播放 */
          <>
            <div key={pathname} className="mobile-page-in" style={{ minHeight: '100%' }}>
              {children}
            </div>
            <NetworkBanner />
          </>
        )}
      </div>
    </MobileThemeProvider>
  );
}
