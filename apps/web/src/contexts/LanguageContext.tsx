'use client';
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

const SUPPORTED_LANGS = ['zh', 'en', 'lo'];

const loadLocale = async (lang: string): Promise<Record<string, string>> => {
  try {
    const mod = await import(`../locales/${lang}.json`);
    return mod.default || mod;
  } catch {
    return {};
  }
};

type LanguageContextValue = {
  lang: string;
  setAppLanguage: (lang: string) => void;
  toggleLanguage: () => void;
  t: (key: string, fallback?: string) => string;
  tField: (obj: Record<string, unknown>, fieldBase: string) => string;
};
const LanguageContext = createContext<LanguageContextValue | null>(null);

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const [lang, setLang] = useState<string>(() => {
    if (typeof window === 'undefined') return 'zh';
    return localStorage.getItem('phoenix_lang') || 'zh';
  });

  // Pre-load all languages on mount so switching is instant (no async gap → no jitter)
  const [allTranslations, setAllTranslations] = useState<Record<string, Record<string, string>>>({});
  const loaded = useRef(false);

  React.useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    Promise.all(
      SUPPORTED_LANGS.map(l => loadLocale(l).then(dict => [l, dict] as const))
    ).then(pairs => {
      const map: Record<string, Record<string, string>> = {};
      pairs.forEach(([l, dict]) => { map[l] = dict; });
      setAllTranslations(map);
    });
  }, []);

  const setAppLanguage = (newLang: string) => {
    setLang(newLang);
    if (typeof window !== 'undefined') localStorage.setItem('phoenix_lang', newLang);
  };

  // t() reads from pre-loaded map — switching lang changes the result in the same render cycle
  const t = useCallback((key: string, fallback?: string): string => {
    const dict = allTranslations[lang] || {};
    return dict[key] || fallback || key;
  }, [allTranslations, lang]);

  const tField = useCallback((obj: Record<string, unknown>, fieldBase: string): string => {
    if (!obj) return '';
    const valCurrent = obj[fieldBase + '_' + lang];
    if (valCurrent) return String(valCurrent);
    return String(obj[fieldBase + '_zh'] || obj[fieldBase + '_en'] || obj[fieldBase + '_lo'] || obj[fieldBase] || '');
  }, [lang]);

  const toggleLanguage = () => {
    const sequence: Record<string, string> = { zh: 'lo', lo: 'en', en: 'zh' };
    setAppLanguage(sequence[lang] || 'zh');
  };

  return (
    <LanguageContext.Provider value={{ lang, setAppLanguage, toggleLanguage, t, tField }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextValue => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
};
