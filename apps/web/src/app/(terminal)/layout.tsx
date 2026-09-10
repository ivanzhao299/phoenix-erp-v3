/**
 * Terminal 路由组布局
 * - 全屏深色背景，无 PC 端 Sidebar
 * - 左侧 72px 导航轨
 * - KioskGuard 强制全屏
 */
'use client';
import { useEffect, useState } from 'react';
import u from "@/styles/uix-utils.module.css";
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRouter } from 'next/navigation';
import TerminalNavRail from '@/components/terminal/TerminalNavRail';
import { TerminalContextProvider, useTerminalContext } from '@/hooks/useTerminalContext';
import { ADMIN_HOME_PATH, canReturnToAdmin } from '@/lib/terminal-navigation';
import styles from './terminal-layout.module.css';

/**
 * 时钟单独抽成组件：setNow 每秒触发重渲染只影响此组件，
 * 不会冒泡到整个 TerminalLayout 树（避免每秒触发所有子组件 re-render）
 */
function TerminalClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--status-warning)', fontVariantNumeric: 'tabular-nums', letterSpacing: 1 }}>
        {now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
      </span>
      <span style={{ fontSize: 11, color: 'var(--slate-600)' }}>
        {now.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' })}
      </span>
    </div>
  );
}

const LANG_LABELS: Record<string, string> = { zh: '中', en: 'EN', lo: 'ລາວ' };
const LANG_ORDER = ['zh', 'en', 'lo'];
const SHIFT_LABELS: Record<string, string> = { MORNING: '早班', AFTERNOON: '下午班', NIGHT: '夜班' };

export default function TerminalLayout({ children }: { children: React.ReactNode }) {
  return <TerminalContextProvider><TerminalLayoutContent>{children}</TerminalLayoutContent></TerminalContextProvider>;
}
function TerminalLayoutContent({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, hasPermission } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [isFullscreen, setIsFullscreen] = useState(false);
  // [优化] now 状态已移入独立的 TerminalClock 组件，消除每秒全局 re-render
  const { lang, setAppLanguage } = useLanguage();
  const { ctx, hydrated, contextError, identityKey } = useTerminalContext();
  const showAdminReturn = canReturnToAdmin(hasPermission);

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
          background: 'var(--deep-blue-3)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', gap: 28,
          fontFamily: '"Noto Sans SC", "Inter", sans-serif',
          userSelect: 'none',
        }}
      >
        <div style={{ fontSize: 72, lineHeight: 1 }}>⛶</div>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--slate-100)', letterSpacing: 0.5 }}>
            {t('terminal.enter_fullscreen', '点击进入全屏模式')}
          </div>
          <div style={{ fontSize: 14, color: 'var(--slate-600)' }}>
            {t('terminal.fullscreen_hint', '包装作业台运行于全屏模式')}
          </div>
        </div>
        <div style={{
          marginTop: 8,
          padding: '14px 48px', borderRadius: 12,
          background: 'linear-gradient(135deg, var(--status-info), var(--color-accent))',
          color: 'var(--bg-card)', fontSize: 17, fontWeight: 700,
          boxShadow: '0 4px 20px var(--status-info)',
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
      background: 'var(--slate-900)',
      color: 'var(--slate-100)',
      fontFamily: '"Noto Sans SC", "Inter", sans-serif',
      touchAction: 'pan-y',         // content may scroll vertically on touch devices
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
        <div className={styles.topbar}>
          {/* 时钟：独立组件隔离重渲染，每秒 setState 只影响自身 */}
          <TerminalClock />

          {/* 班次状态 */}
          {ctx.currentShift?.status === 'OPEN' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 12 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                background: 'var(--status-success-bg-deep)', color: 'var(--status-success)',
                borderRadius: 4, padding: '2px 7px',
              }}>
                ● {SHIFT_LABELS[ctx.currentShift.shiftType ?? ''] ?? ctx.currentShift.shiftType ?? ctx.currentShift.code}
              </span>
              {ctx.currentShift.lineName && (
                <span style={{ fontSize: 11, color: 'var(--slate-400)' }}>{ctx.currentShift.lineName}</span>
              )}
              {ctx.currentShift.supervisorName && (
                <>
                  <span style={{ color: 'var(--slate-700)', fontSize: 10 }}>·</span>
                  <span style={{ fontSize: 11, color: 'var(--slate-500)' }}>{ctx.currentShift.supervisorName}</span>
                </>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 10, color: 'var(--slate-600)', marginLeft: 12, letterSpacing: 0.3 }}>{t('ui.未开班', '未开班')}</div>
          )}

          <div className={u.flex1} />

          {showAdminReturn && (
            <button
              type="button"
              className={styles.topbarAction}
              onClick={() => router.push(ADMIN_HOME_PATH)}
              title={t('terminal.return_admin', '返回管理后台')}
            >
              {t('terminal.return_admin', '返回管理后台')}
            </button>
          )}

          {/* 语言切换 */}
          <div style={{ display: 'flex', borderRadius: 7, overflow: 'hidden', border: '1px solid var(--brand-deep-3)' }}>
            {LANG_ORDER.map(l => (
              <button key={l} type="button" onPointerDown={() => setAppLanguage(l)}
                style={{
                  padding: '4px 10px', fontSize: 11, fontWeight: 700,
                  background: lang === l ? 'var(--status-warning)' : 'transparent',
                  color: lang === l ? 'var(--slate-900)' : 'var(--slate-600)',
                  border: 'none', cursor: 'pointer',
                  borderRight: l !== 'lo' ? '1px solid var(--brand-deep-3)' : 'none',
                  WebkitTapHighlightColor: 'transparent', minWidth: 30, textAlign: 'center',
                }}>
                {LANG_LABELS[l]}
              </button>
            ))}
          </div>

          {/* 分隔 */}
          <span style={{ width: 1, height: 16, background: 'var(--brand-deep-3)', flexShrink: 0 }} />

          {/* 用户 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--status-info), var(--color-accent))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, color: 'var(--bg-card)', fontWeight: 700, flexShrink: 0,
            }}>
              {(user?.name || user?.username || '?').charAt(0).toUpperCase()}
            </div>
            <span className={styles.userName}>
              {user?.name || user?.username}
            </span>
          </div>

          {/* 退出 */}
          <button type="button" onClick={handleLogout} className={styles.topbarAction}>
            {t('terminal.logout', '退出')}
          </button>
        </div>

        {contextError && <div role="alert">{contextError}</div>}
        {hydrated ? <div key={`${identityKey}:${ctx.currentShift?.id || 'none'}`} style={{ display: 'contents' }}>{children}</div>
          : <div role="status">{t('ui.核验班次', '正在核验班次…')}</div>}
      </main>
    </div>
  );
}
