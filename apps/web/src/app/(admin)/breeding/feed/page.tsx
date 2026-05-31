'use client';
import { useState, useEffect, useCallback } from 'react';
import PageHeader from '@/components/PageHeader';
import { usePermission } from '@/hooks/usePermission';
import { useLanguage } from '@/contexts/LanguageContext';
import { ChevronLeft, ChevronRight, RefreshCw, Save } from 'lucide-react';
import s from '@/components/ui/admin-ui.module.css';

function tok() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}
async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch((process.env.NEXT_PUBLIC_API_BASE || '') + path, {
    headers: { Authorization: `Bearer ${tok()}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body.code && body.code !== 200) throw new Error(body.msg || '请求失败');
  return body.data ?? body;
}
async function apiPost<T>(path: string, data: unknown): Promise<T> {
  const res = await fetch((process.env.NEXT_PUBLIC_API_BASE || '') + path, {
    method: 'POST', body: JSON.stringify(data),
    headers: { Authorization: `Bearer ${tok()}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

interface FeedRow {
  id: number | null;
  ledger_date: string;
  material_name: string;
  unit: string;
  sort_order: number;
  prev_stock: number;
  inbound_qty: number;
  outbound_detail: Record<string, number>;
  outbound_total: number;
  current_stock: number;
  daily_usage: number;
  days_left: number | null;
  alert: 'CRITICAL' | 'WARN' | null;
  note: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
};

const ALERT_COLOR: Record<string, string> = { CRITICAL: '#ef4444', WARN: '#f59e0b' };

export default function FeedLedgerPage() {
  const { can } = usePermission();
  const { t }   = useLanguage();
  const canEdit  = can(['ROLE_ADMIN', 'ROLE_FARM_MGR', 'ROLE_VET']);

  const [date, setDate]     = useState(today());
  const [rows, setRows]     = useState<FeedRow[]>([]);
  const [houses, setHouses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState('');
  const isToday = date === today();

  const loadData = useCallback(async (d: string) => {
    setLoading(true);
    setError('');
    setSaved(false);
    try {
      const [ledger, hs] = await Promise.all([
        apiFetch<FeedRow[]>(`/api/farm/feed/ledger?date=${d}`),
        apiFetch<string[]>('/api/farm/feed/houses'),
      ]);
      setRows(Array.isArray(ledger) ? ledger : (ledger as any)?.data ?? []);
      setHouses(Array.isArray(hs) ? hs : (hs as any)?.data ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(date); }, [date, loadData]);

  const updateRow = (idx: number, patch: Partial<FeedRow>) => {
    setRows(prev => {
      const next = [...prev];
      const r = { ...next[idx], ...patch };
      const detail = r.outbound_detail ?? {};
      r.outbound_total = Object.values(detail).reduce((s, v) => s + (Number(v) || 0), 0);
      r.current_stock = Math.max(0, (r.prev_stock ?? 0) + (r.inbound_qty ?? 0) - r.outbound_total);
      r.days_left = r.daily_usage > 0 ? Math.floor(r.current_stock / r.daily_usage) : null;
      r.alert = r.days_left != null && r.days_left <= 7 ? (r.days_left <= 3 ? 'CRITICAL' : 'WARN') : null;
      next[idx] = r;
      return next;
    });
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await apiPost('/api/farm/feed/ledger', { date, rows });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const alertRows = rows.filter(r => r.alert);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('ui.饲料台账', '饲料台账')}
        subtitle={t('ui.管理每日饲料入库出库及库存', '管理每日饲料入库、出库及库存预警（API: /api/farm/feed）')}
        breadcrumb={[t('ui.养殖生产', '养殖生产'), t('ui.饲料台账', '饲料台账')]}
      />

      {/* 工具栏 */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <button className={s.btnSecondary} onClick={() => setDate(d => addDays(d, -1))}
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <ChevronLeft size={15} />{t('ui.前一天', '前一天')}
        </button>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 14, color: 'var(--text-primary)', background: 'var(--bg-card)' }} />
        <button className={s.btnSecondary} onClick={() => setDate(d => addDays(d, 1))} disabled={isToday}
          style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: isToday ? 0.4 : 1 }}>
          {t('ui.后一天', '后一天')}<ChevronRight size={15} />
        </button>
        <button className={s.btnSecondary} onClick={() => loadData(date)}
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <RefreshCw size={14} />{t('common.refresh', '刷新')}
        </button>
        <div style={{ flex: 1 }} />
        {canEdit && (
          <button
            className={saved ? s.btnSecondary : s.btnPrimary}
            onClick={handleSave} disabled={saving || loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Save size={14} />
            {saving ? t('ui.保存中', '保存中…') : saved ? t('ui.已保存', '✓ 已保存') : t('common.save', '保存')}
          </button>
        )}
      </div>

      {/* 库存预警 */}
      {alertRows.length > 0 && (
        <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 10,
          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>⚠ 库存预警</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {alertRows.map(r => (
              <span key={r.material_name} style={{
                padding: '3px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: r.alert === 'CRITICAL' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                color: ALERT_COLOR[r.alert!],
              }}>
                {r.material_name} · {r.days_left}天
              </span>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* 主表格 */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'auto' }}>
        <table className={s.table}>
          <thead>
            <tr>
              <th style={{ whiteSpace: 'nowrap' }}>物料名称</th>
              <th style={{ textAlign: 'center' }}>单位</th>
              <th style={{ textAlign: 'right' }}>昨日库存</th>
              <th style={{ textAlign: 'right' }}>今日入库</th>
              <th style={{ textAlign: 'right' }}>日用量</th>
              {houses.map(h => (
                <th key={h} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
              <th style={{ textAlign: 'right' }}>出库合计</th>
              <th style={{ textAlign: 'right' }}>当前库存</th>
              <th style={{ textAlign: 'center' }}>可用天</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10 + houses.length} style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>加载中…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={10 + houses.length} style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>暂无数据</td></tr>
            ) : rows.map((row, idx) => {
              const alertColor = row.alert ? ALERT_COLOR[row.alert] : undefined;
              const daysColor = row.days_left == null ? 'var(--text-secondary)'
                : row.days_left <= 3 ? '#ef4444'
                : row.days_left <= 7 ? '#f59e0b'
                : row.days_left <= 14 ? '#fbbf24'
                : '#10b981';
              return (
                <tr key={row.material_name}
                  style={{ background: alertColor ? `${alertColor}06` : undefined }}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {row.material_name}
                    {row.alert && (
                      <span style={{ marginLeft: 6, fontSize: 11, padding: '1px 6px', borderRadius: 4, fontWeight: 700,
                        background: `${alertColor}20`, color: alertColor }}>
                        {row.alert === 'CRITICAL' ? '⚠ 紧缺' : '关注'}
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>{row.unit}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{row.prev_stock.toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    {canEdit ? (
                      <input type="number" min="0" value={row.inbound_qty || ''}
                        onChange={e => updateRow(idx, { inbound_qty: Number(e.target.value) || 0 })}
                        placeholder="0"
                        style={{ width: 80, textAlign: 'right', padding: '4px 6px', borderRadius: 6,
                          border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: 13 }} />
                    ) : <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{row.inbound_qty}</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {canEdit ? (
                      <input type="number" min="0" value={row.daily_usage || ''}
                        onChange={e => updateRow(idx, { daily_usage: Number(e.target.value) || 0 })}
                        placeholder="0"
                        style={{ width: 80, textAlign: 'right', padding: '4px 6px', borderRadius: 6,
                          border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: 13 }} />
                    ) : <span style={{ color: 'var(--text-primary)' }}>{row.daily_usage}</span>}
                  </td>
                  {houses.map(h => (
                    <td key={h} style={{ textAlign: 'right' }}>
                      {canEdit ? (
                        <input type="number" min="0" value={row.outbound_detail[h] || ''}
                          onChange={e => updateRow(idx, { outbound_detail: { ...row.outbound_detail, [h]: Number(e.target.value) || 0 } })}
                          placeholder="0"
                          style={{ width: 68, textAlign: 'right', padding: '4px 6px', borderRadius: 6,
                            border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: 13 }} />
                      ) : <span>{row.outbound_detail[h] ?? 0}</span>}
                    </td>
                  ))}
                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#f59e0b' }}>{row.outbound_total.toLocaleString()}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{row.current_stock.toLocaleString()}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: daysColor }}>
                    {row.days_left != null ? `${row.days_left}天` : '—'}
                  </td>
                  <td>
                    {canEdit ? (
                      <input type="text" value={row.note}
                        onChange={e => updateRow(idx, { note: e.target.value })}
                        placeholder="备注…"
                        style={{ width: 140, padding: '4px 6px', borderRadius: 6,
                          border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: 12 }} />
                    ) : <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{row.note}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
