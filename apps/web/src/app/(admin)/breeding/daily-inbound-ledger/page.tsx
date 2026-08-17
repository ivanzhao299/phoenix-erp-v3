'use client';

import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { usePermission } from '@/hooks/usePermission';
import { useLanguage } from '@/contexts/LanguageContext';
import u from '@/styles/uix-utils.module.css';

interface LedgerRow {
  id: number;
  log_date: string;
  change_type: string;
  grade: string;
  qty_change: number;
  house_code: string | null;
  operator: string;
  note: string | null;
  created_at: string;
}

function day(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

export default function DailyInboundLedgerPage() {
  const { t } = useLanguage();
  const { canView } = usePermission('MENU_PROD_INBOUND');
  const [start, setStart] = useState(day(-7));
  const [end, setEnd] = useState(day());
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('phoenix_token') || sessionStorage.getItem('phoenix_token') || '';
      const response = await fetch(`/api/farm/egg/ledger?start=${start}&end=${end}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: 'no-store',
      });
      const body = await response.json();
      if (!response.ok || body.code !== 200) throw new Error(body.message || '加载失败');
      setRows(body.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  useEffect(() => { if (canView) void load(); }, [canView, load]);

  if (!canView) return <div className={u.emptyPad40}>{t('breeding.noPermInbound', '无权限访问日产蛋入库台账')}</div>;

  return <div className="animate-fade-in" style={{ padding: '24px 32px' }}>
    <PageHeader
      title={t('breeding.inboundLedgerTitle', '日产蛋入库台账')}
      subtitle={t('breeding.inboundLedgerSubtitle', '统一查询作业台包装交接与日产蛋入库形成的鸡蛋库存流水')}
      breadcrumb={[t('breeding.prodMgmt', '生产管理'), t('breeding.inboundLedgerTitle', '日产蛋入库台账')]}
    />
    <div style={{ display: 'flex', gap: 12, alignItems: 'end', margin: '18px 0' }}>
      <label style={{ display: 'grid', gap: 5, fontSize: 12 }}>开始日期<input type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
      <label style={{ display: 'grid', gap: 5, fontSize: 12 }}>结束日期<input type="date" value={end} onChange={e => setEnd(e.target.value)} /></label>
      <button type="button" onClick={() => void load()} disabled={loading} style={{ padding: '7px 16px' }}>{loading ? t('ui.查询中', '查询中…') : '查询'}</button>
    </div>
    {error && <div style={{ color: 'var(--status-danger)', marginBottom: 12 }}>{error}</div>}
    <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr>{['日期', '入库类型', '等级', '数量（枚）', '鸡舍', '操作人', '时间', '备注'].map(h => <th key={h} style={{ padding: 10, textAlign: 'left', borderBottom: '1px solid var(--border)' }}>{h}</th>)}</tr></thead>
        <tbody>
          {!loading && rows.length === 0 && <tr><td colSpan={8} className={u.emptyCenter}>暂无入库记录</td></tr>}
          {rows.map(row => <tr key={row.id}>
            <td style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>{row.log_date}</td>
            <td style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>{row.change_type === 'PACKAGING_INBOUND' ? '包装入库' : row.change_type === 'TEMP_PRODUCTION_INBOUND' ? '日产蛋入库' : row.change_type}</td>
            <td style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>{row.grade || '—'}</td>
            <td style={{ padding: 10, borderBottom: '1px solid var(--border)', fontWeight: 700, color: row.qty_change >= 0 ? 'var(--status-success)' : 'var(--status-danger)' }}>{row.qty_change > 0 ? '+' : ''}{Number(row.qty_change).toLocaleString()}</td>
            <td style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>{row.house_code || '—'}</td>
            <td style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>{row.operator || '—'}</td>
            <td style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>{new Date(row.created_at).toLocaleString('zh-CN')}</td>
            <td style={{ padding: 10, borderBottom: '1px solid var(--border)', maxWidth: 360 }}>{row.note || '—'}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}
