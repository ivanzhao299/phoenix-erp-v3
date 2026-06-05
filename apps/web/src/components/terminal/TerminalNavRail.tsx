'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useBrand } from '@/contexts/BrandContext';
import { useState, useEffect } from 'react';
import { useTerminalContext } from '@/hooks/useTerminalContext';
import {
  LayoutDashboard,
  Egg,
  BarChart2,
  Package2,
  Tag,
  Warehouse,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';

interface NavStep {
  id: string;
  path: string;
  icon: LucideIcon;
  labelKey: string;
  labelFb: string;
}

const STEPS: NavStep[] = [
  { id: 'dashboard',          path: '/terminal/packaging/dashboard',          icon: LayoutDashboard, labelKey: 'terminal.dashboard',          labelFb: '概览' },
  { id: 'source-receive',     path: '/terminal/packaging/source-receive',     icon: Egg,             labelKey: 'terminal.source_receive',     labelFb: '集蛋' },
  { id: 'grading',            path: '/terminal/packaging/grading',            icon: BarChart2,       labelKey: 'terminal.grading',            labelFb: '分级' },
  { id: 'packing',            path: '/terminal/packaging/packing',            icon: Package2,        labelKey: 'terminal.packing',            labelFb: '包装' },
  { id: 'label-print',        path: '/terminal/packaging/label-print',        icon: Tag,             labelKey: 'terminal.label_print',        labelFb: '标签' },
  { id: 'warehouse-handover', path: '/terminal/packaging/warehouse-handover', icon: Warehouse,       labelKey: 'terminal.warehouse_handover', labelFb: '入库' },
  { id: 'exceptions',         path: '/terminal/packaging/exceptions',         icon: AlertTriangle,   labelKey: 'terminal.exceptions',         labelFb: '异常' },
];

export default function TerminalNavRail() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const { brand } = useBrand();
  const { openExceptionCount } = useTerminalContext();
  const [showLogout, setShowLogout] = useState(false);
  const [pressTimer, setPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleAvatarPressStart = () => {
    const timer = setTimeout(() => setShowLogout(true), 2000);
    setPressTimer(timer);
  };
  const handleAvatarPressEnd = () => {
    if (pressTimer) clearTimeout(pressTimer);
  };

  useEffect(() => {
    return () => { if (pressTimer) clearTimeout(pressTimer); };
  }, [pressTimer]);

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + '/');

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

  return (
    <nav style={{
      width: 88,
      height: '100vh',
      background: 'var(--deep-blue-4)',
      borderRight: '1px solid var(--brand-deep-3)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: 28,
      paddingBottom: 10,
      flexShrink: 0,
      overflowY: 'auto',
      overflowX: 'hidden',
    }}>
      {/* Logo */}
      <div style={{
        width: 56, height: 56, borderRadius: 14,
        background: 'linear-gradient(135deg, var(--status-warning), var(--status-warning))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 0, flexShrink: 0, overflow: 'hidden',
      }}>
        {brand.logo_url
          ? <img src={brand.logo_url} alt={brand.company_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <Egg size={28} color="var(--slate-900)" strokeWidth={2.5} />
        }
      </div>
      <div style={{ width: 52, height: 1, background: 'var(--brand-deep-3)', margin: '20px 0 16px', flexShrink: 0 }} />

      {/* Nav items */}
      {STEPS.map(step => {
        const active = isActive(step.path);
        const isException = step.id === 'exceptions';
        return (
          <Link key={step.id} href={step.path}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              width: '100%', minHeight: 72, padding: '8px 4px',
              textDecoration: 'none', position: 'relative',
              background: active ? 'var(--slate-900)' : 'transparent',
              borderLeft: active ? '3px solid var(--status-warning)' : '3px solid transparent',
              borderRadius: active ? '12px 0 0 12px' : 0,
              marginRight: active ? -1 : 0,
              zIndex: active ? 1 : 0,
              transition: 'background 0.15s',
            }}
          >
            <step.icon
              size={28}
              strokeWidth={active ? 2.5 : 1.8}
              color={active ? 'var(--status-warning)' : 'var(--slate-600)'}
              style={{ marginBottom: 5, flexShrink: 0 }}
            />
            <span style={{
              fontSize: 13, lineHeight: 1.3, textAlign: 'center',
              color: active ? 'var(--status-warning)' : 'var(--slate-500)',
              fontWeight: active ? 700 : 400,
              letterSpacing: 0.2,
            }}>{t(step.labelKey, step.labelFb)}</span>

            {isException && openExceptionCount > 0 && (
              <span style={{
                position: 'absolute', top: 8, right: 8,
                background: 'var(--status-danger)', color: 'var(--bg-card)',
                borderRadius: 99, fontSize: 10, fontWeight: 700,
                minWidth: 18, height: 18, padding: '0 4px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{openExceptionCount}</span>
            )}

          </Link>
        );
      })}

      <div style={{ flex: 1 }} />

      {/* User avatar */}
      <div style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
        {showLogout && (
          <button type="button" onClick={handleLogout}
            style={{
              background: 'var(--status-danger)', color: 'var(--bg-card)', border: 'none',
              borderRadius: 7, fontSize: 11, padding: '5px 8px', cursor: 'pointer',
              whiteSpace: 'nowrap', fontWeight: 600,
            }}
          >{t('terminal.logout', '退出登录')}</button>
        )}
        <div
          onMouseDown={handleAvatarPressStart}
          onMouseUp={handleAvatarPressEnd}
          onTouchStart={handleAvatarPressStart}
          onTouchEnd={handleAvatarPressEnd}
          onClick={() => setShowLogout(v => !v)}
          style={{
            width: 42, height: 42, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--status-info), var(--color-accent))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, color: 'var(--bg-card)', fontWeight: 700, cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          {(user?.name || user?.username || '?').charAt(0).toUpperCase()}
        </div>
        <div style={{ fontSize: 11, color: 'var(--slate-600)', textAlign: 'center', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user?.name || user?.username}
        </div>
        <div style={{ fontSize: 10, color: 'var(--slate-700)', textAlign: 'center', lineHeight: 1.3, whiteSpace: 'pre-line', marginTop: 4 }}>
          {t('terminal.title', '包装\n作业台')}
        </div>
      </div>
    </nav>
  );
}
