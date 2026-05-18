'use client';
import React, { createContext, useContext, useState, useCallback } from 'react';

// Dynamic imports to avoid SSR JSON issues
const loadLocale = async (lang: string) => {
  try {
    const mod = await import(`../locales/${lang}.json`);
    return mod.default || mod;
  } catch {
    return {};
  }
};

const LanguageContext = createContext<any>(null);

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const [lang, setLang] = useState<string>(() => {
    if (typeof window === 'undefined') return 'zh';
    // ✅ 统一用 localStorage + phoenix_lang（sessionStorage 关闭浏览器会清除）
    return localStorage.getItem('phoenix_lang') || 'zh';
  });

  const [translations, setTranslations] = useState<Record<string, any>>({});

  React.useEffect(() => {
    loadLocale(lang).then(setTranslations);
  }, [lang]);

  const setAppLanguage = (newLang: string) => {
    setLang(newLang);
    // ✅ localStorage 持久化，刷新/重启浏览器后保留
    if (typeof window !== 'undefined') localStorage.setItem('phoenix_lang', newLang);
  };

  const t = useCallback((key: string, fallback?: string) => {
    return translations[key] || fallback || key;
  }, [translations]);

  const tField = useCallback((obj: Record<string, unknown>, fieldBase: string): string => {
    if (!obj) return '';
    const valCurrent = obj[fieldBase + '_' + lang];
    if (valCurrent) return String(valCurrent);
    return String(obj[fieldBase + '_zh'] || obj[fieldBase + '_en'] || obj[fieldBase + '_lo'] || obj[fieldBase] || '');
  }, [lang, translations]);

  const toggleLanguage = () => {
    const sequence: Record<string, string> = { zh:'lo', lo:'en', en:'zh' };
    setAppLanguage(sequence[lang] || 'zh');
  };

  return (
    <LanguageContext.Provider value={{ lang, setAppLanguage, toggleLanguage, t, tField }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
