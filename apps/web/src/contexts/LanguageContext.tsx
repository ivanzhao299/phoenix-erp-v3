'use client';
import React, { createContext, useContext, useState, useCallback, useRef, useReducer } from 'react';

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

  /**
   * 性能修复：翻译数据存入 useRef 而非 useState
   * - 旧方案：setAllTranslations(map) → allTranslations 进入 React state →
   *   148 个 useLanguage 消费者同时重渲染（每次加载页面都触发一次级联）
   * - 新方案：translationsRef.current 赋值不触发任何重渲染；
   *   改为用 translationsVersion（一个数字）作为 t() 的依赖项，
   *   翻译加载完成后仅 bump 一次版本号，React 收到的 state diff 是 number，
   *   组件仍会重渲染一次（拿到翻译文案），但避免了 React 对大 object 的深度 diff
   */
  const translationsRef = useRef<Record<string, Record<string, string>>>({});
  const [translationsVersion, bumpTranslations] = useReducer((x: number) => x + 1, 0);
  const loaded = useRef(false);

  React.useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    Promise.all(
      SUPPORTED_LANGS.map(l => loadLocale(l).then(dict => [l, dict] as const))
    ).then(pairs => {
      const map: Record<string, Record<string, string>> = {};
      pairs.forEach(([l, dict]) => { map[l] = dict; });
      translationsRef.current = map;    // 直接赋值，不经过 React state
      bumpTranslations();               // 仅触发一次数字 diff，而非大 object diff
    });
  }, []);

  const setAppLanguage = (newLang: string) => {
    setLang(newLang);
    if (typeof window !== 'undefined') localStorage.setItem('phoenix_lang', newLang);
  };

  /**
   * t() 依赖 [lang, translationsVersion]（两个原始值），而非 [allTranslations, lang]（大对象）
   * - 翻译加载完成时：translationsVersion 0→1，t() 获得新引用，所有消费者重渲染一次（正确）
   * - 切换语言时：lang 变化，t() 获得新引用，所有消费者重渲染一次（正确）
   * - 其他 state 变化时：t() 引用不变，消费者不因 t 而重渲染（优化）
   */
  const t = useCallback((key: string, fallback?: string): string => {
    const dict = translationsRef.current[lang] || {};
    return dict[key] || fallback || key;
  }, [lang, translationsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

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
