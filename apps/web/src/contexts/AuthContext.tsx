'use client';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext<any>(null);

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

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser]       = useState<any>(null);
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
        const isMobile = window.location.pathname.startsWith('/mobile');
        window.location.href = isMobile ? '/mobile/login?reason=idle' : '/login?reason=idle';
      }, IDLE_TIMEOUT);
    };
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();
    return () => { clearTimeout(idleTimer); events.forEach(e => window.removeEventListener(e, resetTimer)); };
  }, [token]);

  const login = useCallback((tokenStr: string, userInfo: any) => {
    sessionStorage.setItem('phoenix_token', tokenStr);
    sessionStorage.setItem('phoenix_user', JSON.stringify(userInfo));
    sessionStorage.setItem('phoenix_lang', userInfo.lang || 'zh');
    sessionStorage.setItem('phoenix_session_version', SESSION_VERSION);
    setToken(tokenStr);
    setUser(userInfo);
  }, []);

  const logout = useCallback((reason?: 'expired' | 'perms_changed' | 'logout') => {
    sessionStorage.removeItem('phoenix_token');
    sessionStorage.removeItem('phoenix_user');
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
      // 避免登录页/已登出场景重复触发
      if (window.location.pathname.includes('/login')) return;
      const detail = (e as CustomEvent<{ reason?: 'expired' | 'perms_changed' }>).detail;
      logout(detail?.reason || 'expired');
    };
    window.addEventListener('api:auth-expired', onExpired);
    return () => window.removeEventListener('api:auth-expired', onExpired);
  }, [logout]);

  const isLoggedIn = !!token && !!user;

  const ROLE_MENU_MATRIX: Record<string, string[]> = {
    MENU_FINANCE:    ['ROLE_ADMIN','ROLE_FIN_CFO','ROLE_FIN_ACCT','ROLE_FIN_AR','ROLE_CEO','ROLE_REGION_MGR','ROLE_AUDITOR'],
    MENU_FIN_CLOSE:  ['ROLE_ADMIN','ROLE_FIN_CFO','ROLE_FIN_ACCT','ROLE_STORE_MGR','ROLE_CASHIER','ROLE_REGION_MGR'],
    MENU_PROCUREMENT:['ROLE_ADMIN','ROLE_PRC_BUYER','ROLE_FARM_MGR','ROLE_FIN_ACCT','ROLE_FIN_CFO','ROLE_CEO'],
    MENU_SYSTEM:     ['ROLE_ADMIN','ROLE_SYSOPS','ROLE_HR_ADMIN'],
    MENU_USERS:      ['ROLE_ADMIN','ROLE_SYSOPS','ROLE_HR_ADMIN'],
    MENU_ANALYTICS:  ['ROLE_ADMIN','ROLE_CEO','ROLE_FIN_CFO','ROLE_REGION_MGR','ROLE_FARM_MGR','ROLE_AUDITOR'],
    MENU_BREEDING:   ['ROLE_ADMIN','ROLE_FARM_MGR','ROLE_BREEDER','ROLE_VET','ROLE_CEO','ROLE_REGION_MGR'],
    MENU_IOT:        ['ROLE_ADMIN','ROLE_FARM_MGR','ROLE_BREEDER','ROLE_CEO','ROLE_REGION_MGR','ROLE_SYSOPS'],
    MENU_INVENTORY:  ['ROLE_ADMIN','ROLE_WMS_MGR','ROLE_FARM_MGR','ROLE_FIN_ACCT','ROLE_CEO','ROLE_REGION_MGR'],
    MENU_WMS:        ['ROLE_ADMIN','ROLE_WMS_MGR','ROLE_FARM_MGR','ROLE_REGION_MGR'],
    MENU_STORE:      ['ROLE_ADMIN','ROLE_STORE_MGR','ROLE_CASHIER','ROLE_REGION_MGR','ROLE_FIN_ACCT'],
    MENU_POS:        ['ROLE_ADMIN','ROLE_STORE_MGR','ROLE_CASHIER','ROLE_REGION_MGR'],
    MENU_PACKAGING:  ['ROLE_ADMIN','ROLE_FARM_MGR','ROLE_BREEDER','ROLE_WMS_MGR'],
    MENU_APPROVAL:   ['ROLE_ADMIN','ROLE_CEO','ROLE_REGION_MGR','ROLE_FARM_MGR','ROLE_FIN_CFO','ROLE_AUDITOR'],
    MENU_LOGISTICS:  ['ROLE_ADMIN','ROLE_LOGISTICS_MGR','ROLE_DRIVER','ROLE_REGION_MGR'],
    MENU_CRM:        ['ROLE_ADMIN','ROLE_STORE_MGR','ROLE_CASHIER','ROLE_REGION_MGR'],
    MENU_QA:         ['ROLE_ADMIN','ROLE_FARM_MGR','ROLE_VET','ROLE_REGION_MGR','ROLE_CEO','ROLE_AUDITOR'],
    MENU_ORDERS:     ['ROLE_ADMIN','ROLE_STORE_MGR','ROLE_CASHIER','ROLE_SALES_REP','ROLE_REGION_MGR','ROLE_FIN_ACCT'],
  };

  const hasPermission = useCallback((permId?: string) => {
    if (!user) return false;
    const perms = Array.isArray(user.permissions) ? user.permissions : [];
    if (perms.includes('*') || user.role === 'ROLE_ADMIN') return true;
    if (!permId) return true;
    const userRoles = Array.isArray(user.roles) ? user.roles : (user.role ? [user.role] : []);
    if (userRoles.includes('ROLE_ADMIN')) return true;
    const allowedRoles = ROLE_MENU_MATRIX[permId];
    if (!allowedRoles) return true;
    return userRoles.some((r: string) => allowedRoles.includes(r));
  }, [user]);

  const hasRole = useCallback((...roleCodes: string[]) => {
    if (!user) return false;
    const userRoles = Array.isArray(user.roles) ? user.roles : (user.role ? [user.role] : []);
    if (userRoles.includes('ROLE_ADMIN')) return true;
    return roleCodes.some(r => userRoles.includes(r));
  }, [user]);

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
      } catch { /* 静默失败 */ }
    };
    checkAndRefresh();
    const interval = setInterval(checkAndRefresh, REFRESH_CHECK);
    return () => clearInterval(interval);
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, isLoggedIn, loading, login, logout, hasPermission, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export default AuthContext;
