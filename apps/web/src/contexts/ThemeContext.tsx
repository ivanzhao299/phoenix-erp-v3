'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext<any>(null);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [themeMode, setThemeMode] = useState<string>(() => {
    if (typeof window === 'undefined') return 'system';
    return localStorage.getItem('phoenix_theme') || 'system';
  });

  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = (mode: string) => {
      let resolved: string;
      if (mode === 'dark') resolved = 'dark';
      else if (mode === 'light') resolved = 'light';
      else resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.setAttribute('data-theme', resolved);
      document.body.setAttribute('data-theme', resolved);
    };
    applyTheme(themeMode);
    localStorage.setItem('phoenix_theme', themeMode);
    if (themeMode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => {
        const t = e.matches ? 'dark' : 'light';
        root.setAttribute('data-theme', t);
        document.body.setAttribute('data-theme', t);
      };
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [themeMode]);

  const toggleTheme = (newMode: string) => setThemeMode(newMode);

  return (
    <ThemeContext.Provider value={{ themeMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
