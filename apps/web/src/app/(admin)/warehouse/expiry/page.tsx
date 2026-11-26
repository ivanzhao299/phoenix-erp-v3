"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatMasterData } from '@/lib/business-display';
import request from '@/lib/api-client';
import { secondaryActionButton } from '@/components/design-system/cockpit-styles';

type ExpiryBatch = {
  batch_no: string; days_left: number; expire_date: string; qty: string; qty_available: string;
  unit: string; warehouse_code: string; location_code?: string; warehouse_name?: string; sku_name?: string; material_name?: string;
};
type Page = { rows: ExpiryBatch[]; total: number };

export default function ExpiryPage() {
  const { canCreate } = useAuth();
  const { t, lang } = useLanguage();
  const [period, setPeriod] = useState<'UPCOMING' | 'EXPIRED'>('UPCOMING');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setData(null);
    const params = new URLSearchParams({ expiry: period, page: String(page) });
    request<{ data: Page }>('/inventory/batches/query?' + params, { signal: controller.signal })
      .then(res => { if (!controller.signal.aborted) setData(res.data); })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, period]);

  return <main>
    <PageHeader title={t('ui.临期预警', '临期预警')} />
    <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
      <button type="button" aria-pressed={period === 'UPCOMING'} style={secondaryActionButton}
        onClick={() => { setPeriod('UPCOMING'); setPage(1); }}>{t('ui.未来14天', '未来 14 天')}</button>
      <button type="button" aria-pressed={period === 'EXPIRED'} style={secondaryActionButton}
        onClick={() => { setPeriod('EXPIRED'); setPage(1); }}>{t('ui.已到期', '已到期')}</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {loading && <p>{t('ui.加载中', '加载中')}</p>}
    {data?.total === 0 && <p>{t('ui.当前范围暂无批次', '当前范围暂无批次')}</p>}
    <div style={{ display: 'grid', gap: 10 }}>
      {data?.rows.map(row => {
        const display = row as unknown as Record<string, unknown>;
        const warehouseLabel = formatMasterData(display, 'warehouse_name', row.warehouse_code, lang);
        const locationLabel = formatMasterData(display, 'location_name', row.location_code, lang);
        return <article key={row.batch_no}
        style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
        <strong>{row.batch_no} · {row.sku_name ?? row.material_name ?? ''}</strong>
        <p>{warehouseLabel} / {locationLabel} · {row.expire_date.slice(0,10)} · {t('ui.实存', '实存')} {row.qty} {row.unit}</p>
        {period === 'UPCOMING' && Number(row.qty_available) > 0 && canCreate('MENU_WMS_INOUT') ? (
          <Link style={secondaryActionButton} href={'/warehouse/outbound?' + new URLSearchParams({
            expiryBatch: row.batch_no, warehouse: row.warehouse_code,
          })}>{t('ui.填写出库草稿', '填写出库草稿')}</Link>
        ) : <small>{t('ui.待核库存处置', '待核库存处置')}</small>}
      </article>; })}
    </div>
    {data && data.total > 30 && <div style={{ display: 'flex', justifyContent: 'end', gap: 10, marginTop: 12 }}>
      <button type="button" style={secondaryActionButton} disabled={page === 1} onClick={() => setPage(n => n - 1)}>
        {t('ui.上一页', '上一页')}</button>
      <span>{page} / {Math.ceil(data.total / 30)}</span>
      <button type="button" style={secondaryActionButton} disabled={page * 30 >= data.total} onClick={() => setPage(n => n + 1)}>
        {t('ui.下一页', '下一页')}</button>
    </div>}
  </main>;
}
