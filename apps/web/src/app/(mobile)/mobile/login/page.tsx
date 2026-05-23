'use client';
import { useState, useEffect, FormEvent, useRef, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useMobileTheme } from '@/contexts/MobileThemeContext';
import { useBrand } from '@/contexts/BrandContext';
import { Shield, User, Lock, AlertTriangle, ChevronDown, ChevronUp, Info } from 'lucide-react';

const LAST_USER_KEY = 'phoenix_last_username';
const IS_DEV = process.env.NODE_ENV !== 'production';

const TEST_GROUPS = IS_DEV ? [
  {
    label: '管理层',
    color: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)', text: '#f59e0b' },
    accounts: [
      { u: 'admin',         p: 'admin123', label: '🔑 超管',   sub: 'ROLE_ADMIN' },
      { u: 'test_ceo',      p: '123456',   label: '👑 总裁',   sub: 'ROLE_CEO' },
      { u: 'test_farm',     p: '123456',   label: '🏡 场长',   sub: 'ROLE_FARM_MGR' },
      { u: 'test_pkg',      p: '123456',   label: '📦 车间',   sub: 'ROLE_PKG_MGR' },
    ],
  },
  {
    label: '现场作业台',
    color: { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)', text: '#60a5fa' },
    accounts: [
      { u: 'test_pkg_op', p: '123456', label: '📦 操作员', sub: 'ROLE_PKG_OP' },
      { u: 'test_sup',    p: '123456', label: '👷 班组长', sub: 'ROLE_LINE_SUPERVISOR' },
    ],
  },
] : [];

const MOBILE_ROLE_HOME: Record<string, string> = {
  ROLE_ADMIN:           '/mobile/home',
  ROLE_CEO:             '/mobile/home',
  ROLE_FARM_MGR:        '/mobile/home',
  ROLE_VET:             '/mobile/home',
  ROLE_BREEDER:         '/mobile/home',
  ROLE_QA_MGR:          '/mobile/home',
  ROLE_WMS_MGR:         '/mobile/home',
  ROLE_PKG_MGR:         '/mobile/home',
  ROLE_LOG_MGR:         '/mobile/home',
  ROLE_STORE_MGR:       '/mobile/home',
  ROLE_CASHIER:         '/mobile/home',
  ROLE_SALES_REP:       '/mobile/home',
  ROLE_FIN_CFO:         '/mobile/home',
  ROLE_FIN_ACCT:        '/mobile/home',
  ROLE_AUDITOR:         '/mobile/home',
  ROLE_SYSOPS:          '/mobile/home',
  ROLE_SALES_MGR:       '/mobile/home',
  ROLE_B2B_MGR:         '/mobile/home',
  ROLE_PRC_BUYER:       '/mobile/home',
  // 现场操作员直接进作业台
  ROLE_PKG_OP:          '/terminal/packaging/dashboard',
  ROLE_QC_INSPECTOR:    '/terminal/packaging/dashboard',
  ROLE_WH_CLERK:        '/terminal/packaging/dashboard',
  ROLE_LINE_SUPERVISOR: '/terminal/packaging/dashboard',
};

function MobileLoginInner() {
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
  const { login } = useAuth();
  const { t, lang, setAppLanguage } = useLanguage();
  const router = useRouter();
  const sp = useSearchParams();
  const { isDark: _isDark, t: th } = useMobileTheme();
  const { brand } = useBrand();

  const [username, setUsername]         = useState('');
  const [password, setPassword]         = useState('');
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [notice, setNotice]             = useState('');
  const [expandedGroup, setExpandedGroup] = useState<number | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const last = localStorage.getItem(LAST_USER_KEY) || '';
    if (last) {
      setUsername(last);
      setTimeout(() => passwordRef.current?.focus(), 60);
    }
    const reason = sp.get('reason');
    if (reason === 'expired')       setNotice(t('ui.登录已过期', '登录已过期，请重新登录'));
    else if (reason === 'idle')     setNotice(t('ui.长时间未操作已退出', '长时间未操作，已自动退出'));
    else if (reason === 'perms_changed') setNotice(t('ui.权限已更新', '权限已更新，请重新登录'));
    else if (reason === 'logout')   setNotice(t('ui.已安全退出', '您已安全退出'));
  }, [sp, t]);

  const doLogin = useCallback(async (u: string, p: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u.trim(), password: p.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.code !== 200) {
        setError(data.msg || data.message || t('ui.账户或密码错误', '账户或密码错误'));
        return;
      }
      const info = data.user_info;
      login(data.token, {
        ...info,
        role:        info?.role  || info?.roles?.[0] || '',
        roles:       info?.roles || (info?.role ? [info.role] : []),
        name:        info?.realNameZh || info?.username || u,
        permissions: Array.isArray(info?.permissions) ? info.permissions : [],
      });
      try { localStorage.setItem(LAST_USER_KEY, u.trim()); } catch { /* noop */ }
      const returnUrl     = sp.get('return');
      const effectiveRole = info?.role || info?.roles?.[0] || '';
      const roleDest      = MOBILE_ROLE_HOME[effectiveRole] || '/mobile/home';
      const isGenericDashboard = returnUrl === '/dashboard';
      const dest = (returnUrl && returnUrl.startsWith('/') && !isGenericDashboard)
        ? returnUrl
        : roleDest;
      router.replace(dest);
    } catch {
      setError(t('ui.网络连接失败', '网络连接失败，请重试'));
    } finally {
      setLoading(false);
    }
  }, [API_BASE, login, router, sp, t]);

  const handleSubmit = (e: FormEvent) => { e.preventDefault(); doLogin(username, password); };

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 52,
    padding: '0 14px 0 42px',
    background: th.inputBg,
    border: `1px solid ${th.inputBorder}`,
    borderRadius: 12, color: th.text,
    outline: 'none', fontSize: 15,
    boxSizing: 'border-box',
    WebkitAppearance: 'none',
  };

  return (
    <div style={{
      minHeight: '100svh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: th.pageBg,
      padding: '24px 20px',
      paddingBottom: 'calc(24px + env(safe-area-inset-bottom))',
    }}>
      {/* 语言切换 — 右上角固定 */}
      <div style={{ position: 'fixed', top: 'calc(16px + env(safe-area-inset-top))', right: 16, display: 'flex', gap: 4, zIndex: 10 }}>
        {(['zh', 'lo', 'en'] as const).map(l => (
          <button key={l} type="button" onClick={() => setAppLanguage(l)}
            style={{
              fontSize: 12, padding: '4px 10px', borderRadius: 8,
              border: `1px solid ${th.inputBorder}`,
              background: lang === l ? 'rgba(245,158,11,0.2)' : th.appBarBg,
              color: lang === l ? '#f59e0b' : th.textMuted,
              cursor: 'pointer', fontWeight: lang === l ? 700 : 400,
              backdropFilter: 'blur(8px)',
            }}>
            {l === 'zh' ? '中' : l === 'lo' ? 'ລາວ' : 'EN'}
          </button>
        ))}
      </div>

      {/* 品牌区 */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{
          width: 72, height: 72, borderRadius: 20,
          background: 'linear-gradient(135deg,#f59e0b,#d97706)',
          boxShadow: '0 16px 40px rgba(245,158,11,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 14px',
        }}>
          <Shield size={36} color="white" />
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, color: th.text, letterSpacing: '-0.5px' }}>
          {t('ui.金凤凰ERP', '金凤凰 ERP')}
        </div>
        <div style={{ fontSize: 12, color: th.textFaint, marginTop: 4 }}>
          Phoenix V3 · {t('ui.企业管理平台', '企业管理平台')}
        </div>
      </div>

      {/* 登录卡片 */}
      <div style={{
        width: '100%', maxWidth: 400,
        background: th.cardBg,
        border: `1px solid ${th.cardBorder}`,
        borderRadius: 20,
        padding: '28px 24px',
        backdropFilter: 'blur(20px)',
      }}>
        <h1 style={{ fontSize: 18, fontWeight: 800, color: th.text, marginBottom: 4 }}>
          {t('ui.欢迎回来', '欢迎回来')}
        </h1>
        <p style={{ fontSize: 13, color: th.textFaint, marginBottom: 24 }}>
          {t('ui.登录Phoenix平台', '登录 Phoenix 企业管理平台')}
        </p>

        {error && (
          <div style={{ marginBottom: 16, padding: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#f87171', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={15} /> {error}
          </div>
        )}
        {!error && notice && (
          <div style={{ marginBottom: 16, padding: 12, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 10, color: '#60a5fa', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Info size={15} /> {notice}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', marginBottom: 6, color: th.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              {t('ui.账户名', '账户名')}
            </label>
            <div style={{ position: 'relative' }}>
              <User size={16} color={th.textFaint} style={{ position: 'absolute', left: 14, top: 18 }} />
              <input
                value={username}
                onChange={e => { setUsername(e.target.value); setError(''); }}
                type="text"
                placeholder={t('ui.输入账户名', '输入账户名')}
                autoComplete="username"
                required
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', marginBottom: 6, color: th.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              {t('ui.密码', '密码')}
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} color={th.textFaint} style={{ position: 'absolute', left: 14, top: 18 }} />
              <input
                ref={passwordRef}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); setNotice(''); }}
                type="password"
                placeholder={t('ui.输入密码', '输入密码')}
                autoComplete="current-password"
                required
                style={inputStyle}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', height: 56,
              background: loading ? 'rgba(245,158,11,0.4)' : 'linear-gradient(135deg,#f59e0b,#d97706)',
              color: 'white', border: 'none', borderRadius: 14,
              fontSize: 16, fontWeight: 800,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : '0 8px 24px rgba(245,158,11,0.35)',
              letterSpacing: '0.5px',
            }}
          >
            {loading ? t('ui.登录中', '登录中...') : t('ui.登录', '登录')}
          </button>
        </form>
      </div>

      {/* 测试账号面板（仅开发环境） */}
      {IS_DEV && TEST_GROUPS.length > 0 && (
        <div style={{ width: '100%', maxWidth: 400, marginTop: 20 }}>
          <div style={{ fontSize: 10, color: th.textFaint, textAlign: 'center', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>
            开发测试账号
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {TEST_GROUPS.map((grp, gi) => (
              <div key={gi} style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${grp.color.border}`, background: grp.color.bg }}>
                <button type="button" onClick={() => setExpandedGroup(expandedGroup === gi ? null : gi)}
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer', color: grp.color.text, fontSize: 13, fontWeight: 700 }}>
                  <span>{grp.label}</span>
                  {expandedGroup === gi ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {expandedGroup === gi && (
                  <div style={{ padding: '4px 10px 12px', display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 6 }}>
                    {grp.accounts.map(acc => (
                      <button type="button" key={acc.u}
                        onClick={() => { setUsername(acc.u); setPassword(acc.p); doLogin(acc.u, acc.p); }}
                        style={{ padding: '10px 8px', background: th.sectionBg, border: `1px solid ${grp.color.border}`, borderRadius: 8, cursor: 'pointer', textAlign: 'left' }}>
                        <div style={{ fontSize: 13, color: grp.color.text, fontWeight: 600 }}>{acc.label}</div>
                        <div style={{ fontSize: 10, color: th.textFaint, fontFamily: 'monospace', marginTop: 2 }}>{acc.u}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, textAlign: 'center', fontSize: 10, color: th.textFaint }}>
            统一密码: <code style={{ color: th.textMuted }}>123456</code>
            {' · '}超管: <code style={{ color: th.textMuted }}>admin123</code>
          </div>
        </div>
      )}

      <div style={{ marginTop: 28, fontSize: 11, color: th.textFaint, textAlign: 'center' }}>
        Phoenix ERP V3 · {brand.company_name}
      </div>
    </div>
  );
}

function LoginFallback() {
  return (
    <div style={{
      minHeight: '100svh',
      background: 'linear-gradient(160deg,#070b14 0%,#0f1929 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 28,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 64, height: 64, borderRadius: 20,
          background: 'linear-gradient(135deg,#f59e0b,#d97706)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 34,
          boxShadow: '0 0 40px rgba(245,158,11,0.4)',
        }}>🐦</div>
        <span style={{ color: '#f59e0b', fontWeight: 800, fontSize: 16, letterSpacing: 0.5 }}>
          Phoenix ERP
        </span>
      </div>
      <div className="mobile-spin" style={{
        width: 28, height: 28,
        border: '2.5px solid rgba(255,255,255,0.07)',
        borderTopColor: '#f59e0b',
        borderRadius: '50%',
      }} />
    </div>
  );
}

export default function MobileLoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <MobileLoginInner />
    </Suspense>
  );
}
