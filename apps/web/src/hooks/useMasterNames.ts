'use client';

import { useEffect, useState } from 'react';
import request from '@/lib/api-client';
import { masterNameMap, type MasterNames } from '@/lib/master-display';

/** One scoped, bulk read per mounted page; locale changes use retained facts. */
export function useMasterNames(domain: 'house' | 'farm' | 'warehouse' | 'company' | 'project' | 'customer' | 'store' | 'sku' | 'zone' | 'supplier') {
  const [names, setNames] = useState<MasterNames>(() => new Map());
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      if (domain === 'zone') {
        const rows: Record<string, unknown>[] = [];
        for (let offset = 0; ; offset += 1000) {
          const result = await request<{ data?: Record<string, unknown>[] }>(`/crud/wms_zones?limit=1000&offset=${offset}`, { signal: controller.signal, silent: true });
          const batch = Array.isArray(result) ? result : result.data ?? [];
          rows.push(...batch);
          if (batch.length < 1000) return rows;
        }
      }
      const path = domain === 'sku' ? '/lookup/inventory-items'
        : `/lookup/${domain === 'company' ? 'companies' : `${domain}s`}`;
      const result = await request<Record<string, unknown>[] | { data?: Record<string, unknown>[] }>(path, { signal: controller.signal, silent: true });
      const rows = Array.isArray(result) ? result : result.data ?? [];
      return domain === 'sku' ? rows.filter(row => row.itemType === 'SKU' || row.sku_code || row.skuCode) : rows;
    };
    load().then(rows => {
      if (!controller.signal.aborted) setNames(masterNameMap(rows, domain));
    }).catch(() => { /* Keep the business response's own name/code fallback. */ });
    return () => controller.abort();
  }, [domain]);
  return names;
}
