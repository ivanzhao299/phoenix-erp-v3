'use client';
import { useState, useEffect } from 'react';
import { useCrud } from './useCrud';
import { cachedGet, TTL } from '@/lib/request-cache'; // G89-P1 全表拉取去重+缓存

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
  const codes    = Array.isArray(dictCode) ? dictCode : [dictCode];
  // 排序后拼接，保证 ['A','B'] 和 ['B','A'] 命中同一缓存
  const cacheKey = codes.slice().sort().join(',');

  const cached = _cache[cacheKey] as DictCacheEntry | undefined;
  const [options,     setOptions]     = useState<string[]>(cached?.options     || []);
  const [codeMap,     setCodeMap]     = useState<Record<string, string>>(cached?.codeMap     || {});
  const [optionPairs, setOptionPairs] = useState<DictPair[]>(cached?.optionPairs || []);
  const [loading,     setLoading]     = useState(!cached);

  const { fetchRecords } = useCrud('sys_dict');

  useEffect(() => {
    if (_cache[cacheKey]) {
      const c = _cache[cacheKey] as DictCacheEntry;
      setOptions(c.options); setCodeMap(c.codeMap); setOptionPairs(c.optionPairs);
      setLoading(false); return;
    }
    // G89-P1：所有 DictSelect 拉的都是同一张全表，常量 key 去重+缓存——
    //   一个含 6 个 DictSelect 的表单从 6 次全表下载降为 1 次。
    cachedGet<DictEntry[] | null>('crud:sys_dict:all1000', TTL.dict, () => fetchRecords({ limit: 1000 }))
      .then((dicts: DictEntry[] | null) => {
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
            const label = entry.dict_label_zh as string | undefined;
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
