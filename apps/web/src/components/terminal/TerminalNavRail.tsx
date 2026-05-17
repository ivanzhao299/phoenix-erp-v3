'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useState, useEffect } from 'react';
import { STEP_ALLOWED_ROLES } from '@/types/packaging-terminal';
import { useTerminalContext } from '@/hooks/useTerminalContext';

interface NavStep {
  id: string;
  path: string;
  icon: string;
  labelKey: string;      // locale key
  labelFb: string;       // Chinese fallback
  dividerBefore?: boolean;
}

const STEPS: NavStep[] = [
  { id: 'dashboard',          path: '/terminal/packaging/dashboard',           icon: '🏠', labelKey: 'terminal.dashboard',          labelFb: '概览' },
  { id: 'shift-open',         path: '/terminal/packaging/shift-open',          icon: '🔓', labelKey: 'terminal.shift_open',         labelFb: '开班', dividerBefore: true },
  { id: 'source-receive',     path: '/terminal/packaging/source-receive',      icon: '📥', labelKey: 'terminal.source_receive',     labelFb: '接收' },
  { id: 'qc-inspection',      path: '/terminal/packaging/qc-inspection',       icon: '🔍', labelKey: 'terminal.qc_inspection',      labelFb: '首检' },
  { id: 'grading',            path: '/terminal/packaging/grading',             icon: '📊', labelKey: 'terminal.grading',            labelFb: '分级' },
  { id: 'packing',            path: '/terminal/packaging/packing',             icon: '📦', labelKey: 'terminal.packing',            labelFb: '包装' },
  { id: 'label-print',        path: '/terminal/packaging/label-print',         icon: '🏷️', labelKey: 'terminal.label_print',        labelFb: '标签' },
  { id: 'warehouse-handover', path: '/terminal/packaging/warehouse-handover',  icon: '🏭', labelKey: 'terminal.warehouse_handover', labelFb: '入库' },
  { id: 'exceptions',         path: '/terminal/packaging/exceptions',          icon: '⚠️', labelKey: 'terminal.exceptions',         labelFb: '异常', dividerBefore: true },
  { id: 'shift-close',        path: '/terminal/packaging/shift-close',         icon: '📋', labelKey: 'terminal.shift_close',        labelFb: '交班' },
];

export default function TerminalNavRail() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const { openExceptionCount } = useTerminalContext();
  const userRole = user?.role || '';
  const [showLogout, setShowLogout] = useState(false);
  const [pressTimer, setPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  // 长按头像 2s 弹出退出选项（触控友好的退出方式）
  const handleAvatarPressStart = () => {
    const t = setTimeout(() => setShowLogout(true), 2000);
    setPressTimer(t);
  };
  const handleAvatarPressEnd = () => {
    if (pressTimer) clearTimeout(pressTimer);
  };

  useEffect(() => {
    return () => { if (pressTimer) clearTimeout(pressTimer); };
  }, [pressTimer]);

  const isStepAllowed = (stepId: string): boolean => {
    if (stepId === 'dashboard') return true;
    const allowed = STEP_ALLOWED_ROLES[stepId];
    if (!allowed) return true;
    return allowed.includes(userRole);
  };

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + '/');

  const handleLogout = () => {
    // 退出全屏再登出
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

  return (
    <nav style={{
      width: 72,
      height: '100vh',
      background: '#0a1628',
      borderRight: '1px solid #1e3a5f',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: 8,
      paddingBottom: 8,
      flexShrink: 0,
      overflowY: 'auto',
      overflowX: 'hidden',
    }}>
      {/* 品牌 Logo 区 */}
      <div style={{
        width: 48, height: 48,
        borderRadius: 12,
        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, marginBottom: 4, flexShrink: 0,
      }}>🥚</div>
      <div style={{ fontSize: 9, color: '#64748b', marginBottom: 12, textAlign: 'center', lineHeight: 1.2, whiteSpace: 'pre-line' }}>
        {t('terminal.title', '包装\n作业台')}
      </div>


      {/* 步骤按钮 */}
      {STEPS.map(step => {
        const active = isActive(step.path);
        const allowed = isStepAllowed(step.id);
        const isException = step.id === 'exceptions';

        return (
          <div key={step.id} style={{ width: '100%' }}>
            {step.dividerBefore && (
              <div style={{ height: 1, background: '#1e3a5f', margin: '4px 8px' }} />
            )}
            <Link
              href={step.path}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                width: '100%', minHeight: 56, padding: '6px 2px',
                textDecoration: 'none', position: 'relative',
                background: active ? 'rgba(245,158,11,0.15)' : 'transparent',
                borderLeft: active ? '3px solid #f59e0b' : '3px solid transparent',
                opacity: allowed ? 1 : 0.35,
                pointerEvents: allowed ? 'auto' : 'none',
                cursor: allowed ? 'pointer' : 'not-allowed',
                transition: 'background 0.15s',
              }}
              aria-disabled={!allowed}
            >
              <span style={{ fontSize: 22, lineHeight: 1, marginBottom: 2 }}>{step.icon}</span>
              <span style={{
                fontSize: 10, lineHeight: 1.2, textAlign: 'center',
                color: active ? '#f59e0b' : '#94a3b8',
                fontWeight: active ? 600 : 400,
              }}>{t(step.labelKey, step.labelFb)}</span>

              {/* 异常角标 */}
              {isException && openExceptionCount > 0 && (
                <span style={{
                  position: 'absolute', top: 6, right: 6,
                  background: '#ef4444', color: '#fff',
                  borderRadius: 99, fontSize: 9, fontWeight: 700,
                  minWidth: 16, height: 16, padding: '0 3px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{openExceptionCount}</span>
              )}
            </Link>
          </div>
        );
      })}

      {/* 弹性空间 */}
      <div style={{ flex: 1 }} />

      {/* 用户头像（长按退出） */}
      <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        {showLogout && (
          <button
            onClick={handleLogout}
            style={{
              background: '#ef4444', color: '#fff', border: 'none',
              borderRadius: 6, fontSize: 9, padding: '4px 6px', cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >{t('terminal.logout','退出登录')}</button>
        )}
        <div
          onMouseDown={handleAvatarPressStart}
          onMouseUp={handleAvatarPressEnd}
          onTouchStart={handleAvatarPressStart}
          onTouchEnd={handleAvatarPressEnd}
          onClick={() => setShowLogout(v => !v)}
          style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, color: '#fff', fontWeight: 700, cursor: 'pointer',
            userSelect: 'none',
          }}
          title={`${user?.name || user?.username} — ${t('terminal.long_press_hint','点击切换退出选项')}`}
        >
          {(user?.name || user?.username || '?').charAt(0).toUpperCase()}
        </div>
        <div style={{ fontSize: 9, color: '#475569', textAlign: 'center', maxWidth: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user?.name || user?.username}
        </div>
      </div>
    </nav>
  );
}
