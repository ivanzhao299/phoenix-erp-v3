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
   * 性能修复 — 按需加载语言包（On-demand locale loading）
   *
   * 旧方案：Promise.all([zh, en, lo]) 并行加载全部 → 首屏下载 796KB JSON
   *   zh.json: 208KB + en.json: 232KB + lo.json: 356KB = 796KB
   *   99% 的用户只需要 zh，却额外下载 588KB 无用数据 + 解析耗时
   *
   * 新方案：
   *   - 首屏只加载当前语言（通常 zh ≈ 208KB gzip 后约 40KB）
   *   - 切换语言时才加载目标语言，且缓存在 translationsRef 里不重复加载
   *   - translationsRef 存翻译数据（不经过 React state，无重渲染开销）
   *   - translationsVersion 是纯数字，作为 t() 的依赖触发更新
   */
  const translationsRef = useRef<Record<string, Record<string, string>>>({});
  const loadedLangsRef  = useRef<Set<string>>(new Set());
  const [translationsVersion, bumpTranslations] = useReducer((x: number) => x + 1, 0);

  /** 加载指定语言（已加载过则跳过） */
  const ensureLocale = useCallback((targetLang: string): Promise<void> => {
    if (loadedLangsRef.current.has(targetLang)) return Promise.resolve();
    return loadLocale(targetLang).then(dict => {
      translationsRef.current = { ...translationsRef.current, [targetLang]: dict };
      loadedLangsRef.current.add(targetLang);
      bumpTranslations();
    });
  }, []);

  // 首屏只加载当前语言（不再 Promise.all 全部语言）
  React.useEffect(() => {
    ensureLocale(lang);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setAppLanguage = useCallback((newLang: string) => {
    setLang(newLang);
    if (typeof window !== 'undefined') localStorage.setItem('phoenix_lang', newLang);
    ensureLocale(newLang); // 切换时才按需加载目标语言
  }, [ensureLocale]);

  /**
   * t() 依赖 [lang, translationsVersion]（两个原始值）而非大 object
   * - 翻译加载完成：translationsVersion +1 → t() 新引用 → 消费者重渲染一次
   * - 切换语言：lang 变化 → t() 新引用 → 消费者重渲染一次
   * - 其他变化：t() 引用不变，消费者不重渲染
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

  const toggleLanguage = useCallback(() => {
    const sequence: Record<string, string> = { zh: 'lo', lo: 'en', en: 'zh' };
    setAppLanguage(sequence[lang] || 'zh');
  }, [lang, setAppLanguage]);

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
