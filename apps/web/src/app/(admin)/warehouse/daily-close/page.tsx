"use client";

import { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import request from '@/lib/api-client';
import { inputField, primaryActionButton, secondaryActionButton } from '@/components/design-system/cockpit-styles';

type Ware = { warehouse_code: string; warehouse_name: string };
type Totals = {
  units: Array<{ unit: string; opening: string; inbound: string; outbound: string; adjustment: string;
    correction: string; reserved: string; released: string; closing: string }>;
  unresolved: number;
  late_events: number;
};
type CloseState = {
  company: string; today?: string; nextDay?: string; version?: string; eligible?: boolean; enabled?: boolean; historical?: boolean;
  totals?: Totals | null;
  closed?: { id: string; closed_at: string; closed_by: string; snapshot: Totals };
};

export default function WarehouseDailyClosePage() {
  const { t } = useLanguage();
  const { canApprove } = useAuth();
  const [warehouses, setWarehouses] = useState<Ware[]>([]);
  const [warehouse, setWarehouse] = useState('');
  const [date, setDate] = useState(() => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Singapore' })
    .format(new Date(Date.now() - 86_400_000)));
  const [data, setData] = useState<CloseState | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    request<{ data: Ware[] }>('/stocktake/daily-close/warehouses', { signal: controller.signal })
      .then(res => {
        if (!controller.signal.aborted) {
          setWarehouses(res.data);
          if (res.data.length === 1) setWarehouse(res.data[0].warehouse_code);
        }
      })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!warehouse || !date) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    request<{ data: CloseState }>('/stocktake/daily-close?' + new URLSearchParams({ warehouse_code: warehouse, date }),
      { signal: controller.signal })
      .then(res => { if (!controller.signal.aborted) setData(res.data); })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [warehouse, date, refresh]);
  const close = async () => {
    if (!data?.eligible || !data.version || loading || saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await request<{ data: CloseState }>('/stocktake/daily-close', {
        method: 'POST',
        body: JSON.stringify({ warehouse_code: warehouse, date, version: data.version, request_key: crypto.randomUUID() }),
      });
      setData(response.data);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : t('ui.日结失败', '日结失败'));
    } finally {
      setSaving(false);
    }
  };
  const totals = data?.closed?.snapshot ?? data?.totals;
  const columns: Array<[keyof Totals['units'][number], string]> = [
    ['unit', t('ui.单位', '单位')], ['opening', t('ui.期初', '期初')], ['inbound', t('ui.入库', '入库')],
    ['outbound', t('ui.出库', '出库')], ['adjustment', t('ui.调整', '调整')], ['correction', t('ui.冲销', '冲销')],
    ['reserved', t('ui.预留', '预留')], ['released', t('ui.释放', '释放')], ['closing', t('ui.期末', '期末')],
  ];
  return <div>
    <PageHeader title={t('ui.日结对账', '日结对账')} />
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
      <select aria-label={t('ui.仓库', '仓库')} style={inputField} value={warehouse} disabled={saving}
        onChange={e => { setData(null); setWarehouse(e.target.value); }}>
        <option value="">{t('ui.请选择仓库', '请选择仓库')}</option>
        {warehouses.map(item => <option key={item.warehouse_code} value={item.warehouse_code}>{item.warehouse_name || item.warehouse_code}</option>)}
      </select>
      <input aria-label={t('ui.业务日期', '业务日期')} type="date" style={inputField} value={date} disabled={saving}
        onChange={e => { setData(null); setDate(e.target.value); }} />
      <button type="button" style={secondaryActionButton} disabled={saving || !warehouse || !date}
        onClick={() => { setData(null); setRefresh(n => n + 1); }}>{t('ui.刷新', '刷新')}</button>
      {canApprove('MENU_WMS_INOUT') && !data?.closed && <button type="button" style={primaryActionButton}
        disabled={!data?.eligible || loading || saving || Boolean(error)} onClick={close}>{t('ui.确认日结', '确认日结')}</button>}
    </div>
    {error && <p role="alert">{error}</p>}
    {loading && <p>{t('ui.加载中', '加载中')}</p>}
    {data?.enabled === false && <p>{t('ui.当前仓仅开放日结核对', '当前仓仅开放日结核对')}</p>}
    {data?.historical && <p>{t('ui.该日早于仓级日结采集起点，历史库存待核', '该日早于仓级日结采集起点，历史库存待核')}</p>}
    {data?.closed && <p>{t('ui.已日结', '已日结')} · WDC-{date.replaceAll('-', '')}-{data.closed.id}</p>}
    {data?.nextDay && !data.closed && <p>{t('ui.下一待关业务日', '下一待关业务日')} · {data.nextDay}</p>}
    {totals && <div style={{ overflowX: 'auto' }}>
      {totals.unresolved > 0 && <p role="alert">{t('ui.待核对账差异', '待核对账差异')} · {totals.unresolved}</p>}
      {totals.late_events > 0 && <p>{t('ui.迟到事件', '迟到事件')} · {totals.late_events}</p>}
      <table style={{ width: '100%', textAlign: 'left' }}>
        <thead><tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead>
        <tbody>{totals.units.map(row => <tr key={row.unit ?? 'UNKNOWN'}>
          {columns.map(([key]) => <td key={key}>{row[key] ?? t('ui.待核', '待核')}</td>)}
        </tr>)}</tbody>
      </table>
    </div>}
  </div>;
}
