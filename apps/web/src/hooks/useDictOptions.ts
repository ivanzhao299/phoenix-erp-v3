'use client';
import { useState, useEffect } from 'react';
import { useCrud } from './useCrud';
import { crudApi } from '@/lib/api-client';
import { cachedGet, TTL } from '@/lib/request-cache'; // 按字典类型去重+缓存
import { useLanguage } from '@/contexts/LanguageContext';

type DictPair = { value: string; label: string };
type DictEntry = Record<string, unknown>;
interface DictCacheEntry { options: string[]; codeMap: Record<string, string>; optionPairs: DictPair[] }
/** 模块级缓存，避免同页面多次请求 sys_dict */
const _cache: Record<string, DictCacheEntry | DictPair[]> = {};

/**
 * useDictOptions — 从 sys_dict 按 dict_type 动态加载字典选项
 * @param dictCode  单个或多个 dict_type 值
 * @returns { options: string[], loading: boolean }
 */
export const useDictOptions = (dictCode: string | string[]) => {
  const { lang } = useLanguage();
  const codes    = Array.isArray(dictCode) ? dictCode : [dictCode];
  // 排序后拼接，保证 ['A','B'] 和 ['B','A'] 命中同一缓存
  const cacheKey = `${codes.slice().sort().join(',')}:${lang}`;

  const cached = _cache[cacheKey] as DictCacheEntry | undefined;
  const [options,     setOptions]     = useState<string[]>(cached?.options     || []);
  const [codeMap,     setCodeMap]     = useState<Record<string, string>>(cached?.codeMap     || {});
  const [optionPairs, setOptionPairs] = useState<DictPair[]>(cached?.optionPairs || []);
  const [loading,     setLoading]     = useState(!cached);


  useEffect(() => {
    if (_cache[cacheKey]) {
      const c = _cache[cacheKey] as DictCacheEntry;
      setOptions(c.options); setCodeMap(c.codeMap); setOptionPairs(c.optionPairs);
      setLoading(false); return;
    }
    // Filter before the API's 1,000-row cap: an unrelated large dictionary
    // must not hide this type. Per-type requests still share the cache.
    let active = true;
    Promise.allSettled(codes.map(code => cachedGet<DictEntry[] | null>(
      `crud:sys_dict:type:${code}`, TTL.dict, async () => {
        // Shared requests must outlive one consumer's StrictMode cleanup and
        // must not cancel a parallel dictionary through useCrud's latest-only runner.
        const result = await crudApi.list<DictEntry>('sys_dict', { dict_type: code, status: 'ACTIVE', limit: 1000 });
        return Array.isArray(result) ? result : result.data;
      },
    ))).then(groups => {
        if (!active) return;
        const dicts = groups.flatMap(group => group.status === 'fulfilled' ? (group.value || []) : []);
        const merged: string[]             = [];
        const cm:     Record<string,string>= {};
        const pairs:  DictPair[]           = [];
        const labelSet = new Set<string>();
        const codeSet  = new Set<string>();
        codes.forEach(code => {
          const matches = (dicts || [])
            .filter(d => d.dict_type === code && d.status === 'ACTIVE')
            .sort((a, b) => (Number(a.sort_no) || 0) - (Number(b.sort_no) || 0));
          matches.forEach(entry => {
            const label = String(entry[`dict_label_${lang}`] || entry.dict_label_zh || entry.dict_label_en || entry.dict_label_lo || '');
            const dc    = entry.dict_code    as string | undefined;
            if (label && !labelSet.has(label)) {
              labelSet.add(label);
              merged.push(label);
            }
            if (dc && label) {
              cm[dc] = label;
              if (!codeSet.has(dc)) {
                codeSet.add(dc);
                pairs.push({ value: dc, label });
              }
            }
          });
        });
        if (merged.length > 0) {
          if (groups.every(group => group.status === 'fulfilled')) _cache[cacheKey] = { options: merged, codeMap: cm, optionPairs: pairs };
          setOptions(merged); setCodeMap(cm); setOptionPairs(pairs);
        }
      })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return { options, loading, codeMap, optionPairs };
};

/**
 * useTableOptions — 从任意表加载 value/label 选项列表
 */
export const useTableOptions = (table: string, valueKey: string, labelKey: string) => {
  const cacheKey = `table:${table}:${valueKey}:${labelKey}`;
  const [options, setOptions] = useState<DictPair[]>((_cache[cacheKey] as DictPair[]) || []);
  const { fetchRecords } = useCrud(table);

  useEffect(() => {
    if (_cache[cacheKey]) { setOptions(_cache[cacheKey] as DictPair[]); return; }
    fetchRecords({ limit: 1000 }).then((rows: DictEntry[] | null) => {
      const opts: DictPair[] = (rows || [])
        .map(r => ({ value: String(r[valueKey] || ''), label: String(r[labelKey] || r[valueKey] || '') }))
        .filter(o => o.value);
      if (opts.length > 0) { _cache[cacheKey] = opts; setOptions(opts); }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return options;
};
