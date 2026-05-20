/**
 * Terminal 路由组布局
 * - 全屏深色背景，无 PC 端 Sidebar
 * - 左侧 72px 导航轨
 * - KioskGuard 强制全屏
 */
'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRouter } from 'next/navigation';
import TerminalNavRail from '@/components/terminal/TerminalNavRail';
import { useTerminalContext } from '@/hooks/useTerminalContext';

const LANG_LABELS: Record<string, string> = { zh: '中', en: 'EN', lo: 'ລາວ' };
const LANG_ORDER = ['zh', 'en', 'lo'];
const SHIFT_LABELS: Record<string, string> = { MORNING: '早班', AFTERNOON: '下午班', NIGHT: '夜班' };

export default function TerminalLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [now, setNow] = useState(new Date());
  const { lang, setAppLanguage } = useLanguage();
  const { ctx } = useTerminalContext();

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {}).finally(() => {
        logout();
        router.replace('/login?reason=logout');
      });
    } else {
      logout();
      router.replace('/login?reason=logout');
    }
  };

  // 未登录跳回登录页（附带 return URL，登录后可直接回来）
  useEffect(() => {
    if (!loading && !user) {
      const returnPath = typeof window !== 'undefined' ? window.location.pathname : '/terminal/packaging/dashboard';
      router.replace(`/login?return=${encodeURIComponent(returnPath)}`);
    }
  }, [user, loading, router]);

  // 全屏状态同步
  useEffect(() => {
    const update = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', update);
    update();
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  const enterFullscreen = () => {
    document.documentElement.requestFullscreen().catch(() => {});
  };

  if (loading || !user) return null;

  // 未全屏时显示拦截层，要求点击进入（开发环境跳过）
  if (!isFullscreen && process.env.NODE_ENV !== 'development') {
    return (
      <div
        onClick={enterFullscreen}
        style={{
          position: 'fixed', inset: 0,
          background: '#0a1120',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', gap: 28,
          fontFamily: '"Noto Sans SC", "Inter", sans-serif',
          userSelect: 'none',
        }}
      >
        <div style={{ fontSize: 72, lineHeight: 1 }}>⛶</div>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#f1f5f9', letterSpacing: 0.5 }}>
            {t('terminal.enter_fullscreen', '点击进入全屏模式')}
          </div>
          <div style={{ fontSize: 14, color: '#475569' }}>
            {t('terminal.fullscreen_hint', '包装作业台运行于全屏模式')}
          </div>
        </div>
        <div style={{
          marginTop: 8,
          padding: '14px 48px', borderRadius: 12,
          background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
          color: '#fff', fontSize: 17, fontWeight: 700,
          boxShadow: '0 4px 20px rgba(59,130,246,0.4)',
        }}>
          {t('terminal.tap_to_start', '点击屏幕继续')}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      background: '#0f172a',
      color: '#f1f5f9',
      fontFamily: '"Noto Sans SC", "Inter", sans-serif',
      touchAction: 'none',          // kiosk: block ALL browser touch gestures
      userSelect: 'none',
      WebkitUserSelect: 'none',
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
        {/* 全局顶栏：时钟 | 语言 | 用户 | 退出 */}
        <div style={{
          height: 46, flexShrink: 0,
          background: '#070f1c',
          borderBottom: '1px solid #1e3a5f',
          display: 'flex', alignItems: 'center',
          padding: '0 16px', gap: 12,
        }}>
          {/* 时钟 */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#f59e0b', fontVariantNumeric: 'tabular-nums', letterSpacing: 1 }}>
              {now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
            </span>
            <span style={{ fontSize: 11, color: '#475569' }}>
              {now.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' })}
            </span>
          </div>

          {/* 班次状态 */}
          {ctx.currentShift?.status === 'OPEN' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 12 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                background: 'rgba(16,185,129,0.18)', color: '#10b981',
                borderRadius: 4, padding: '2px 7px',
              }}>
                ● {SHIFT_LABELS[ctx.currentShift.shiftType ?? ''] ?? ctx.currentShift.shiftType ?? ctx.currentShift.code}
              </span>
              {ctx.currentShift.lineName && (
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{ctx.currentShift.lineName}</span>
              )}
              {ctx.currentShift.supervisorName && (
                <>
                  <span style={{ color: '#334155', fontSize: 10 }}>·</span>
                  <span style={{ fontSize: 11, color: '#64748b' }}>{ctx.currentShift.supervisorName}</span>
                </>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 10, color: '#475569', marginLeft: 12, letterSpacing: 0.3 }}>未开班</div>
          )}

          <div style={{ flex: 1 }} />

          {/* 语言切换 */}
          <div style={{ display: 'flex', borderRadius: 7, overflow: 'hidden', border: '1px solid #1e3a5f' }}>
            {LANG_ORDER.map(l => (
              <button key={l} type="button" onPointerDown={() => setAppLanguage(l)}
                style={{
                  padding: '4px 10px', fontSize: 11, fontWeight: 700,
                  background: lang === l ? '#f59e0b' : 'transparent',
                  color: lang === l ? '#0f172a' : '#475569',
                  border: 'none', cursor: 'pointer',
                  borderRight: l !== 'lo' ? '1px solid #1e3a5f' : 'none',
                  WebkitTapHighlightColor: 'transparent', minWidth: 30, textAlign: 'center',
                }}>
                {LANG_LABELS[l]}
              </button>
            ))}
          </div>

          {/* 分隔 */}
          <span style={{ width: 1, height: 16, background: '#1e3a5f', flexShrink: 0 }} />

          {/* 用户 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, color: '#fff', fontWeight: 700, flexShrink: 0,
            }}>
              {(user?.name || user?.username || '?').charAt(0).toUpperCase()}
            </div>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              {user?.name || user?.username}
            </span>
          </div>

          {/* 退出 */}
          <button type="button" onClick={handleLogout}
            style={{
              padding: '4px 12px', borderRadius: 6,
              border: '1px solid #1e3a5f',
              background: 'transparent', color: '#475569',
              fontSize: 11, fontWeight: 500, cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}>
            {t('terminal.logout', '退出')}
          </button>
        </div>

        {children}
      </main>
    </div>
  );
}
