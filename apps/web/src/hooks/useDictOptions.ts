'use client';
import { useState, useEffect } from 'react';
import { useCrud } from './useCrud';

type DictPair = { value: string; label: string };
interface DictCacheEntry { options: string[]; codeMap: Record<string, string>; optionPairs: DictPair[] }
/** 模块级缓存，避免同页面多次请求 sys_dict */
const _cache: Record<string, DictCacheEntry> = {};

/**
 * useDictOptions — 从 sys_dict 按 dict_type 动态加载字典选项
 * @param dictCode  单个或多个 dict_type 值
 * @returns { options: string[], loading: boolean }
 */
export const useDictOptions = (dictCode: string | string[]) => {
  const codes    = Array.isArray(dictCode) ? dictCode : [dictCode];
  // 排序后拼接，保证 ['A','B'] 和 ['B','A'] 命中同一缓存
  const cacheKey = codes.slice().sort().join(',');

  const cached = _cache[cacheKey];
  const [options,     setOptions]     = useState<string[]>(cached?.options     || []);
  const [codeMap,     setCodeMap]     = useState<Record<string, string>>(cached?.codeMap     || {});
  const [optionPairs, setOptionPairs] = useState<DictPair[]>(cached?.optionPairs || []);
  const [loading,     setLoading]     = useState(!cached);

  const { fetchRecords } = useCrud('sys_dict');

  useEffect(() => {
    if (_cache[cacheKey]) {
      const c = _cache[cacheKey];
      setOptions(c.options); setCodeMap(c.codeMap); setOptionPairs(c.optionPairs);
      setLoading(false); return;
    }
    fetchRecords({ limit: 1000 } as any)
      .then((dicts: any) => {
        const merged: string[]             = [];
        const cm:     Record<string,string>= {};
        const pairs:  DictPair[]           = [];
        const labelSet = new Set<string>(); // 去重 merged labels
        const codeSet  = new Set<string>(); // 去重 pairs codes
        codes.forEach(code => {
          const matches = (dicts || [])
            .filter((d: any) => d.dict_type === code && d.status === 'ACTIVE')
            .sort((a: any, b: any) => (a.sort_no || 0) - (b.sort_no || 0));
          matches.forEach((entry: any) => {
            if (entry.dict_label_zh && !labelSet.has(entry.dict_label_zh)) {
              labelSet.add(entry.dict_label_zh);
              merged.push(entry.dict_label_zh);
            }
            if (entry.dict_code && entry.dict_label_zh) {
              cm[entry.dict_code] = entry.dict_label_zh;
              if (!codeSet.has(entry.dict_code)) {
                codeSet.add(entry.dict_code);
                pairs.push({ value: entry.dict_code, label: entry.dict_label_zh });
              }
            }
          });
        });
        if (merged.length > 0) {
          _cache[cacheKey] = { options: merged, codeMap: cm, optionPairs: pairs };
          setOptions(merged); setCodeMap(cm); setOptionPairs(pairs);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return { options, loading, codeMap, optionPairs };
};

/**
 * useTableOptions — 从任意表加载 value/label 选项列表
 */
export const useTableOptions = (table: string, valueKey: string, labelKey: string) => {
  const cacheKey = `table:${table}:${valueKey}:${labelKey}`;
  const [options, setOptions] = useState<{ value: string; label: string }[]>(_cache[cacheKey] as any || []);
  const { fetchRecords } = useCrud(table);

  useEffect(() => {
    if (_cache[cacheKey]) { setOptions(_cache[cacheKey] as any); return; }
    fetchRecords({ limit: 1000 } as any).then((rows: any) => {
      const opts = (rows || [])
        .map((r: any) => ({ value: r[valueKey] || '', label: r[labelKey] || r[valueKey] || '' }))
        .filter((o: any) => o.value);
      if (opts.length > 0) { (_cache as any)[cacheKey] = opts; setOptions(opts); }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return options;
};
