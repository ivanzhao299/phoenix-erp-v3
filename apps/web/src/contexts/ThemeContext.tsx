'use client';
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

/**
 * 唯一主题源(2026-06-27 统一):
 *   - themeMode 取值: '' / 'light'(默认浅色,移除 data-theme) | 'dark' | 'system'
 *     | 'brand-green' | 'brand-red' | 'brand-blue' | 'brand-gold'
 *   - 本 Provider 是写 <html data-theme> 的唯一地方;个人中心主题卡片走 toggleTheme()。
 *   - 统一 localStorage key = 'phoenix_theme';迁移旧 'phx_theme' 与个人中心曾用的 'phoenix-theme'。
 *   修复:原 Provider 只认 dark/light,会覆盖个人中心写的 brand 主题且启动不恢复,导致"切了不变/刷新即丢"。
 */
type ThemeContextValue = { themeMode: string; toggleTheme: (mode: string) => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'phoenix_theme';

function applyThemeToDom(mode: string) {
  const root = document.documentElement;
  const body = document.body;
  let resolved = mode;
  if (mode === 'system') {
    resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  // 'light' / '' = 默认浅色(globals.css 无 [data-theme=light],默认 token 即浅色)→ 移除属性
  if (!resolved || resolved === 'light') {
    root.removeAttribute('data-theme');
    body?.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', resolved);
    body?.setAttribute('data-theme', resolved);
  }
}

function readInitialTheme(): string {
  if (typeof window === 'undefined') return 'dark';
  let v = localStorage.getItem(STORAGE_KEY);
  if (v === null) {
    // 迁移旧 key(个人中心曾用连字符 'phoenix-theme';更早 'phx_theme')
    const brandLegacy = localStorage.getItem('phoenix-theme');
    const legacy = localStorage.getItem('phx_theme');
    if (brandLegacy !== null) v = brandLegacy;
    else if (legacy !== null) v = legacy;
  }
  localStorage.removeItem('phx_theme');
  localStorage.removeItem('phoenix-theme');
  if (v === null) v = 'dark'; // 沿用既有默认
  localStorage.setItem(STORAGE_KEY, v);
  return v;
}

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [themeMode, setThemeMode] = useState<string>(readInitialTheme);

  useEffect(() => {
    applyThemeToDom(themeMode);
    localStorage.setItem(STORAGE_KEY, themeMode);
    if (themeMode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyThemeToDom('system');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [themeMode]);

  const toggleTheme = useCallback((newMode: string) => setThemeMode(newMode), []);

  const value = useMemo(() => ({ themeMode, toggleTheme }), [themeMode, toggleTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
