'use client';
import React, { createContext, useContext, useState, useCallback, useRef, useReducer, useMemo } from 'react';
import { resolveHydrationValue } from '@/lib/i18n-hydrator';

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
  translateLiteral: (text: string) => string;
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
    if (lang !== 'zh') ensureLocale('zh');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setAppLanguage = useCallback((newLang: string) => {
    setLang(newLang);
    if (typeof window !== 'undefined') localStorage.setItem('phoenix_lang', newLang);
    ensureLocale(newLang); // 切换时才按需加载目标语言
    if (newLang !== 'zh') ensureLocale('zh'); // 非中文 UI 需要 zh 作为硬编码文案反查源
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

  const literalTranslationMap = useMemo(() => {
    if (lang === 'zh') return new Map<string, string>();
    const zhDict = translationsRef.current.zh || {};
    const targetDict = translationsRef.current[lang] || {};
    const map = new Map<string, string>();
    const allowedPrefixes = [
      'common.', 'ui.', 'menu.', 'status.', 'workflow.', 'approval.', 'settings.',
      'md.', 'finance.', 'procurement.', 'sales.', 'warehouse.', 'breeding.',
      'quality.', 'dashboard.', 'system.', 'store.', 'mobile.', 'trace.', 'pos.',
      'auto.literal.',
    ];
    for (const key of Object.keys(zhDict)) {
      if (!allowedPrefixes.some((prefix) => key.startsWith(prefix))) continue;
      const source = String(zhDict[key] || '').replace(/\s+/g, ' ').trim();
      const target = String(targetDict[key] || '').replace(/\s+/g, ' ').trim();
      if (!source || !target || source === target || !/[\u4e00-\u9fff]/.test(source)) continue;
      if (!map.has(source)) map.set(source, target);
    }
    return map;
  }, [lang, translationsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const translateLiteral = useCallback((text: string): string => {
    if (!text || lang === 'zh') return text;
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized || !/[\u4e00-\u9fff]/.test(normalized)) return text;
    const translated = literalTranslationMap.get(normalized) || '';
    if (!translated || translated === normalized) return text;
    return text.replace(normalized, translated);
  }, [lang, literalTranslationMap]);

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

  // value 记忆化：仅在 lang / t / tField 等真变化时换引用，
  // 避免 Provider 任意重渲染就让 ~148 个 useLanguage 消费者全部重渲染。
  const value = useMemo(
    () => ({ lang, setAppLanguage, toggleLanguage, t, translateLiteral, tField }),
    [lang, setAppLanguage, toggleLanguage, t, translateLiteral, tField],
  );

  return (
    <LanguageContext.Provider value={value}>
      <HardcodedChineseHydrator />
      {children}
    </LanguageContext.Provider>
  );
};

const TEXT_NODE = 3;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'NOSCRIPT']);
const ATTRS = ['placeholder', 'title', 'aria-label'];

function HardcodedChineseHydrator() {
  const ctx = React.useContext(LanguageContext);
  const textOriginals = useRef<WeakMap<Text, string>>(new WeakMap());
  const attrOriginals = useRef<WeakMap<Element, Record<string, string>>>(new WeakMap());
  const textWrites = useRef<WeakMap<Text, string>>(new WeakMap());
  const attrWrites = useRef<WeakMap<Element, Record<string, string>>>(new WeakMap());

  React.useEffect(() => {
    if (!ctx || typeof document === 'undefined') return undefined;
    const translateNode = (node: Node, changedAttr?: string | null) => {
      if (node.nodeType === TEXT_NODE) {
        const textNode = node as Text;
        const parent = textNode.parentElement;
        if (!parent || SKIP_TAGS.has(parent.tagName) || parent.closest('[data-i18n-skip="true"]')) return;
        const current = textNode.nodeValue || '';
        const expectedWrite = textWrites.current.get(textNode);
        const isHydratorWrite = expectedWrite === current;
        if (expectedWrite !== undefined) textWrites.current.delete(textNode);
        const decision = resolveHydrationValue(
          current,
          textOriginals.current.get(textNode),
          ctx.lang,
          ctx.translateLiteral,
          isHydratorWrite,
        );
        if (decision.source !== undefined) textOriginals.current.set(textNode, decision.source);
        if (decision.output !== current) {
          textWrites.current.set(textNode, decision.output);
          textNode.nodeValue = decision.output;
        }
        return;
      }

      if (!(node instanceof Element)) return;
      if (SKIP_TAGS.has(node.tagName) || node.closest('[data-i18n-skip="true"]')) return;

      const originals = attrOriginals.current.get(node) || {};
      const pendingWrites = attrWrites.current.get(node) || {};
      let touched = false;
      for (const attr of ATTRS) {
        const current = node.getAttribute(attr);
        if (!current) continue;
        const isChangedAttr = changedAttr === attr;
        const isHydratorWrite = isChangedAttr && pendingWrites[attr] === current;
        if (isChangedAttr) delete pendingWrites[attr];
        const decision = resolveHydrationValue(
          current,
          originals[attr],
          ctx.lang,
          ctx.translateLiteral,
          isHydratorWrite,
        );
        if (decision.source !== undefined && decision.source !== originals[attr]) {
          originals[attr] = decision.source;
          touched = true;
        }
        if (decision.output !== current) {
          pendingWrites[attr] = decision.output;
          node.setAttribute(attr, decision.output);
        }
      }
      if (touched) attrOriginals.current.set(node, originals);
      if (Object.keys(pendingWrites).length) attrWrites.current.set(node, pendingWrites);
      else attrWrites.current.delete(node);
    };

    const walk = (root: Node) => {
      translateNode(root);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let current = walker.nextNode();
      while (current) {
        translateNode(current);
        current = walker.nextNode();
      }
    };

    walk(document.body);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) walk(node);
        if (mutation.type === 'characterData') translateNode(mutation.target);
        if (mutation.type === 'attributes') translateNode(mutation.target, mutation.attributeName);
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS,
    });
    return () => observer.disconnect();
  }, [ctx]);

  return null;
}

export const useLanguage = (): LanguageContextValue => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
};
