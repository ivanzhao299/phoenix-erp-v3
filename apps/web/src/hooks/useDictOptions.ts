'use client';
import { useState, useEffect } from 'react';
import { useCrud } from './useCrud';

/** 模块级缓存，避免同页面多次请求 sys_dict */
const _cache: Record<string, string[]> = {};

/**
 * useDictOptions — 从 sys_dict 按 dict_type 动态加载字典选项
 * @param dictCode  单个或多个 dict_type 值
 * @returns { options: string[], loading: boolean }
 */
export const useDictOptions = (dictCode: string | string[]) => {
  const codes    = Array.isArray(dictCode) ? dictCode : [dictCode];
  const cacheKey = codes.join(',');

  const [options, setOptions] = useState<string[]>(_cache[cacheKey] || []);
  const [loading, setLoading] = useState(!_cache[cacheKey]);

  const { fetchRecords } = useCrud('sys_dict');

  useEffect(() => {
    if (_cache[cacheKey]) { setOptions(_cache[cacheKey]); setLoading(false); return; }
    fetchRecords({ limit: 1000 } as any)
      .then((dicts: any) => {
        const merged: string[] = [];
        codes.forEach(code => {
          const matches = (dicts || [])
            .filter((d: any) => d.dict_type === code && d.status === 'ACTIVE')
            .sort((a: any, b: any) => (a.sort_no || 0) - (b.sort_no || 0));
          matches.forEach((entry: any) => {
            if (entry.dict_label_zh && !merged.includes(entry.dict_label_zh))
              merged.push(entry.dict_label_zh);
          });
        });
        if (merged.length > 0) { _cache[cacheKey] = merged; setOptions(merged); }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return { options, loading };
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
