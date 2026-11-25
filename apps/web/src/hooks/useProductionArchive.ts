'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import request from '@/lib/api-client';

type ArchiveResult = {
  items: Record<string, unknown>[];
  total: number;
  birds: number;
  unknown: number;
  normal: number;
};

export function useProductionArchive(kind: 'houses' | 'flocks', filter = '', farmCode = '') {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ArchiveResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const id = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), search, status: filter, farmCode });
      const data = await request<ArchiveResult>('/v3/farm/archive/' + kind + '?' + params);
      if (id !== generation.current) return false;
      if (!Array.isArray(data?.items) || !Number.isSafeInteger(data.total)) throw new Error('档案响应格式无效');
      setResult(data);
      return true;
    } catch (error) {
      if (id !== generation.current) return false;
      setError(error instanceof Error ? error.message : '档案读取失败');
      setResult(null);
      return false;
    } finally {
      if (id === generation.current) setLoading(false);
    }
  }, [kind, page, search, filter, farmCode]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void reload(); }, 180);
    return () => { generation.current++; window.clearTimeout(timer); };
  }, [reload]);

  return { search, setSearch: (value: string) => { setPage(1); setSearch(value); }, page, setPage, result, error, loading, reload };
}
