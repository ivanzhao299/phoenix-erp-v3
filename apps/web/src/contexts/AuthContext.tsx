'use client';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

type AuthUser = {
  id?: string | number;
  username?: string;
  name?: string;
  role?: string;
  roleNameZh?: string;   // 角色中文名（来自 JWT payload）
  roleNameLo?: string;   // 角色老挝语名
  roles?: string[];
  permissions?: string[];
  lang?: string;
  [key: string]: unknown;
};

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  isLoggedIn: boolean;
  loading: boolean;
  login: (tokenStr: string, userInfo: Record<string, unknown>) => void;
  logout: () => void;
  hasPermission: (menuCode?: string | null, permCode?: string) => boolean;
  hasRole: (...roleCodes: string[]) => boolean;
  canView: (m: string) => boolean;
  canCreate: (m: string) => boolean;
  canEdit: (m: string) => boolean;
  canDelete: (m: string) => boolean;
  canApprove: (m: string) => boolean;
  canExport: (m: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_VERSION = 'v6'; // v6: force-clear sessions stored by pre-fixed login page

const parseJwtPayload = (token: string) => {
  try {
    const base64url = token.split('.')[1];
    if (!base64url) return null;
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    const jsonPayload = decodeURIComponent(
      window.atob(padded).split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    );
    return JSON.parse(jsonPayload);
  } catch { return null; }
};

// ── 权限字符串解析器 ──────────────────────────────────────────────────────────
// JWT permissions 格式: ["MENU_CODE:V,C,E", ...]  或 ["*"]（超管）
//
// hasMenuPerm(permissions, "MENU_FOO")          → 是否持有该菜单（含任意权限码）
// hasMenuPerm(permissions, "MENU_FOO", "E")     → 是否持有编辑权限
// hasMenuPerm(permissions, "MENU_FOO", "V,C")   → 是否同时持有 V 和 C

export function hasMenuPerm(
  permissions: string[],
  menuCode: string,
  permCodes?: string,   // 逗号分隔的权限码，如 "V" / "V,C" / "A"
): boolean {
  if (!permissions || permissions.length === 0) return false;
  // 超管通配
  if (permissions.includes('*')) return true;

  // 找到该菜单对应的 entry，格式 "MENU_CODE:V,C,E"
  const entry = permissions.find(p => p.startsWith(menuCode + ':'));
  if (!entry) return false;

  // 没有指定权限码 → 只要有该菜单的任何权限即为 true
  if (!permCodes) return true;

  // 解析持有的权限集
  const granted = new Set(entry.split(':')[1]?.split(',').map(s => s.trim()) ?? []);

  // 检查所有要求的权限码
  const required = permCodes.split(',').map(s => s.trim()).filter(Boolean);
  return required.every(c => granted.has(c));
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [token, setToken]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedVersion = sessionStorage.getItem('phoenix_session_version');
    if (savedVersion !== SESSION_VERSION) {
      sessionStorage.removeItem('phoenix_token');
      sessionStorage.removeItem('phoenix_user');
      sessionStorage.setItem('phoenix_session_version', SESSION_VERSION);
      setLoading(false);
      return;
    }
    const storedToken = sessionStorage.getItem('phoenix_token');
    const storedUser  = sessionStorage.getItem('phoenix_user');
    if (storedToken && storedUser) {
      try {
        const payload = parseJwtPayload(storedToken);
        if (!payload) throw new Error('Invalid token');
        const CLOCK_SKEW_MS = 10 * 1000;
        if (payload.exp && payload.exp * 1000 + CLOCK_SKEW_MS < Date.now()) {
          sessionStorage.removeItem('phoenix_token');
          sessionStorage.removeItem('phoenix_user');
        } else {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
          // 恢复中间件 cookie（SPA 刷新后 sessionStorage 仍有效，同步给 cookie）
          try {
            const payload2 = parseJwtPayload(storedToken);
            if (payload2?.exp) {
              const maxAge = Math.max(0, payload2.exp - Math.floor(Date.now() / 1000));
              document.cookie = `phoenix_access_token=${storedToken}; path=/; max-age=${maxAge}; SameSite=Lax`;
            }
          } catch { /* ignore */ }
        }
      } catch { sessionStorage.removeItem('phoenix_token'); sessionStorage.removeItem('phoenix_user'); }
    }
    setLoading(false);
  }, []);

  // 30 分钟无操作自动登出
  useEffect(() => {
    if (!token) return;
    const IDLE_TIMEOUT = 30 * 60 * 1000;
    let idleTimer: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        sessionStorage.removeItem('phoenix_token');
        sessionStorage.removeItem('phoenix_user');
        const path = window.location.pathname;
        const isMobile = path.startsWith('/mobile');
        const base = isMobile ? '/mobile/login' : '/login';
        const returnParam = (!path.includes('/login') && path !== '/')
          ? `&return=${encodeURIComponent(path)}`
          : '';
        window.location.href = `${base}?reason=idle${returnParam}`;
      }, IDLE_TIMEOUT);
    };
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();
    return () => { clearTimeout(idleTimer); events.forEach(e => window.removeEventListener(e, resetTimer)); };
  }, [token]);

  /** 从 JWT payload 解析过期时间，写入中间件可读的 cookie */
  const _setCookieToken = (tokenStr: string) => {
    try {
      const payload = parseJwtPayload(tokenStr);
      const maxAge = payload?.exp
        ? Math.max(0, payload.exp - Math.floor(Date.now() / 1000))
        : 86400;
      // JS-side cookie: middleware reads it server-side via request.cookies
      // Note: HttpOnly must come from server Set-Cookie — ignored when set via document.cookie
      document.cookie = `phoenix_access_token=${tokenStr}; path=/; max-age=${maxAge}; SameSite=Lax`;
    } catch { /* ignore */ }
  };

  const login = useCallback((tokenStr: string, userInfo: Record<string, unknown>) => {
    sessionStorage.setItem('phoenix_token', tokenStr);
    sessionStorage.setItem('phoenix_user', JSON.stringify(userInfo));
    sessionStorage.setItem('phoenix_lang', String(userInfo.lang || 'zh'));
    sessionStorage.setItem('phoenix_session_version', SESSION_VERSION);
    _setCookieToken(tokenStr);
    setToken(tokenStr);
    setUser(userInfo);
  }, []);

  const logout = useCallback((reason?: 'expired' | 'perms_changed' | 'logout') => {
    sessionStorage.removeItem('phoenix_token');
    sessionStorage.removeItem('phoenix_user');
    // 清除中间件 cookie
    document.cookie = 'phoenix_access_token=; path=/; max-age=0; SameSite=Lax';
    setToken(null);
    setUser(null);
    const isMobile = window.location.pathname.startsWith('/mobile');
    const base = isMobile ? '/mobile/login' : '/login';
    window.location.href = reason ? `${base}?reason=${reason}` : base;
  }, []);

  // 监听 api-client 派发的 401 事件 — 按 subcode 统一友好跳转
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onExpired = (e: Event) => {
      const path = window.location.pathname;
      if (path.includes('/login')) return;
      const detail = (e as CustomEvent<{ reason?: 'expired' | 'perms_changed' }>).detail;
      const reason = detail?.reason || 'expired';
      sessionStorage.removeItem('phoenix_token');
      sessionStorage.removeItem('phoenix_user');
      document.cookie = 'phoenix_access_token=; path=/; max-age=0; SameSite=Lax';
      const isMobile = path.startsWith('/mobile');
      const base = isMobile ? '/mobile/login' : '/login';
      const returnParam = path !== '/' ? `&return=${encodeURIComponent(path)}` : '';
      window.location.href = `${base}?reason=${reason}${returnParam}`;
    };
    window.addEventListener('api:auth-expired', onExpired);
    return () => window.removeEventListener('api:auth-expired', onExpired);
  }, [logout]);

  const isLoggedIn = !!token && !!user;

  /**
   * hasPermission(menuCode?, permCode?)
   *
   * 统一权限检查，优先使用 JWT 中的 permissions 数组（服务端已按 3 路源合并）。
   * ROLE_ADMIN（或 permissions 含 '*'）直接返回 true。
   *
   * @param menuCode  菜单码，如 "MENU_FARM_DATA"；为 null/undefined 表示只要求登录
   * @param permCode  权限码，如 "V"/"C"/"E"/"D"/"A"/"X"；省略时只检查菜单可访问性
   */
  const hasPermission = useCallback((menuCode?: string | null, permCode?: string) => {
    if (!user) return false;

    // 超管硬件绕过
    const userRoles: string[] = Array.isArray(user.roles) ? user.roles : (user.role ? [user.role] : []);
    if (userRoles.includes('ROLE_ADMIN') || user.role === 'ROLE_ADMIN') return true;

    // 无需菜单权限（仅登录即可访问）
    if (!menuCode) return true;

    // ── 主路径：使用 JWT permissions 数组（服务端 3 路源合并结果）──
    const perms: string[] = Array.isArray(user.permissions) ? user.permissions : [];
    if (perms.includes('*')) return true;  // 理论上超管已在上方拦截，冗余保险

    return hasMenuPerm(perms, menuCode, permCode);
  }, [user]);

  /**
   * hasRole(...roleCodes)
   * 检查用户是否拥有指定角色之一（ROLE_ADMIN 无条件返回 true）
   */
  const hasRole = useCallback((...roleCodes: string[]) => {
    if (!user) return false;
    const userRoles = Array.isArray(user.roles) ? user.roles : (user.role ? [user.role] : []);
    if (userRoles.includes('ROLE_ADMIN')) return true;
    return roleCodes.some(r => userRoles.includes(r));
  }, [user]);

  /**
   * canView(menuCode)    — 快捷方法
   * canCreate(menuCode)  — 快捷方法
   * canEdit(menuCode)    — 快捷方法
   * canDelete(menuCode)  — 快捷方法
   * canApprove(menuCode) — 快捷方法
   * canExport(menuCode)  — 快捷方法
   */
  const canView    = useCallback((m: string) => hasPermission(m, 'V'), [hasPermission]);
  const canCreate  = useCallback((m: string) => hasPermission(m, 'C'), [hasPermission]);
  const canEdit    = useCallback((m: string) => hasPermission(m, 'E'), [hasPermission]);
  const canDelete  = useCallback((m: string) => hasPermission(m, 'D'), [hasPermission]);
  const canApprove = useCallback((m: string) => hasPermission(m, 'A'), [hasPermission]);
  const canExport  = useCallback((m: string) => hasPermission(m, 'X'), [hasPermission]);

  // Token 自动刷新（每 5 分钟）
  useEffect(() => {
    if (!token) return;
    const API = process.env.NEXT_PUBLIC_API_BASE || '';
    const REFRESH_CHECK = 5 * 60 * 1000;
    const REFRESH_THRESHOLD = 30 * 60;
    const checkAndRefresh = async () => {
      const currentToken = sessionStorage.getItem('phoenix_token');
      if (!currentToken) return;
      try {
        const payload = parseJwtPayload(currentToken);
        if (!payload) return;
        const remainSec = payload.exp - Math.floor(Date.now() / 1000);
        if (remainSec > 0 && remainSec < REFRESH_THRESHOLD) {
          const resp = await fetch(`${API}/api/auth/refresh`, { method: 'POST', headers: { Authorization: `Bearer ${currentToken}` } });
          const data = await resp.json();
          if (data.code === 200 && data.token) { sessionStorage.setItem('phoenix_token', data.token); setToken(data.token); }
        }
      } catch (err) {
        console.warn('[AuthContext] Token 刷新失败，将在下次操作时重新登录', err);
        // 派发事件让 api-client 的 401 处理流程接管（避免重复跳转逻辑）
        window.dispatchEvent(new CustomEvent('auth:refresh-failed'));
      }
    };
    checkAndRefresh();
    const interval = setInterval(checkAndRefresh, REFRESH_CHECK);
    return () => clearInterval(interval);
  }, [token]);

  return (
    <AuthContext.Provider value={{
      user, token, isLoggedIn, loading,
      login, logout,
      hasPermission, hasRole,
      canView, canCreate, canEdit, canDelete, canApprove, canExport,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export default AuthContext;
