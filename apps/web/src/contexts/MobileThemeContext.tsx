'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export const DARK = {
  pageBg:      'linear-gradient(160deg,#070b14 0%,#0f1929 100%)',
  appBarBg:    'rgba(0,0,0,0.3)',
  barBorder:   'rgba(255,255,255,0.06)',
  cardBg:      'rgba(255,255,255,0.04)',
  cardBorder:  'rgba(255,255,255,0.08)',
  sectionBg:   'rgba(255,255,255,0.03)',
  bottomBarBg: 'rgba(7,11,20,0.95)',
  inputBg:     'rgba(255,255,255,0.06)',
  inputBorder: 'rgba(255,255,255,0.14)',
  btnBg:       'rgba(255,255,255,0.06)',
  btnBorder:   'rgba(255,255,255,0.1)',
  text:        '#ffffff',
  textSub:     'rgba(255,255,255,0.6)',
  textMuted:   'rgba(255,255,255,0.4)',
  textFaint:   'rgba(255,255,255,0.3)',
  divider:     'rgba(255,255,255,0.06)',
};

export const LIGHT = {
  pageBg:      'linear-gradient(160deg,#f8fafc 0%,#eef2f9 100%)',
  appBarBg:    'rgba(255,255,255,0.92)',
  barBorder:   'rgba(0,0,0,0.07)',
  cardBg:      'rgba(255,255,255,0.85)',
  cardBorder:  'rgba(0,0,0,0.08)',
  sectionBg:   'rgba(0,0,0,0.025)',
  bottomBarBg: 'rgba(248,250,252,0.97)',
  inputBg:     'rgba(0,0,0,0.04)',
  inputBorder: 'rgba(0,0,0,0.14)',
  btnBg:       'rgba(0,0,0,0.05)',
  btnBorder:   'rgba(0,0,0,0.1)',
  text:        '#111827',
  textSub:     'rgba(17,24,39,0.6)',
  textMuted:   'rgba(17,24,39,0.45)',
  textFaint:   'rgba(17,24,39,0.35)',
  divider:     'rgba(0,0,0,0.06)',
};

export type ThemeColors = typeof DARK;

interface MobileThemeCtx {
  isDark: boolean;
  toggle: () => void;
  t: ThemeColors;
}

const Ctx = createContext<MobileThemeCtx>({ isDark: true, toggle: () => {}, t: DARK });

export function MobileThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('phoenix_mobile_theme');
      if (saved === 'light') setIsDark(false);
    } catch {}
  }, []);

  const toggle = () =>
    setIsDark(prev => {
      const next = !prev;
      try { localStorage.setItem('phoenix_mobile_theme', next ? 'dark' : 'light'); } catch {}
      return next;
    });

  return <Ctx.Provider value={{ isDark, toggle, t: isDark ? DARK : LIGHT }}>{children}</Ctx.Provider>;
}

export function useMobileTheme() {
  return useContext(Ctx);
}
