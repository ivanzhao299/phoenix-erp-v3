'use client';
import { useState, useEffect, useCallback } from 'react';
import PageHeader from '@/components/PageHeader';
import { useLanguage } from '@/contexts/LanguageContext';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import s from '@/components/ui/admin-ui.module.css';

function tok() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}
async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch((process.env.NEXT_PUBLIC_API_BASE || '') + path, {
    headers: { Authorization: `Bearer ${tok()}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return body.data ?? body;
}

interface HenReportRow {
  house_code: string;
  flock_no: string;
  current_qty: number;
  initial_qty: number;
  age_days: number | null;
  eggs: number;
  lay_rate: string;
  mortality: number;
  elimination: number;
  total_loss: number;
  culling_reason: string | null;
  feed: number;
}
interface DailyHenReport {
  code: number;
  date: string;
  rows: HenReportRow[];
  totals: {
    current_qty: number; eggs: number; lay_rate: string;
    mortality: number; elimination: number; total_loss: number; feed: number;
  };
}

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
};

export default function HenReportPage() {
  const { t } = useLanguage();
  const [date, setDate]     = useState(today());
  const [report, setReport] = useState<DailyHenReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');
  const isToday = date === today();

  const loadData = useCallback(async (d: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<DailyHenReport>(`/api/v3/farm/daily-hen-report?date=${d}`);
      setReport(data);
    } catch (e: any) {
      setError(e.message);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(date); }, [date, loadData]);

  const rows = report?.rows ?? [];
  const totals = report?.totals;

  const rateColor = (rate: string) => {
    const n = parseFloat(rate);
    return n >= 85 ? '#10b981' : n >= 70 ? '#f59e0b' : '#ef4444';
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('ui.存栏日报', '存栏日报')}
        subtitle={t('ui.按栋舍汇总每日存栏产蛋死淘数据', '按栋舍汇总每日存栏、产蛋、死淘数据（API: /api/v3/farm/daily-hen-report）')}
        breadcrumb={[t('ui.养殖生产', '养殖生产'), t('ui.存栏日报', '存栏日报')]}
      />

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
      </div>

      {/* 汇总卡片 */}
      {totals && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          {[
            { label: '存栏合计', value: totals.current_qty.toLocaleString(), unit: '羽', color: 'var(--color-primary)' },
            { label: '产蛋合计', value: totals.eggs.toLocaleString(), unit: '枚', color: '#f59e0b' },
            { label: '综合产蛋率', value: totals.lay_rate, unit: '', color: rateColor(totals.lay_rate) },
            { label: '死亡', value: totals.mortality.toLocaleString(), unit: '羽', color: '#ef4444' },
            { label: '淘汰', value: totals.elimination.toLocaleString(), unit: '羽', color: '#f97316' },
            { label: '损耗合计', value: totals.total_loss.toLocaleString(), unit: '羽', color: '#dc2626' },
            { label: '饲料消耗', value: totals.feed.toLocaleString(), unit: 'kg', color: '#8b5cf6' },
          ].map(c => (
            <div key={c.label} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
              padding: '12px 18px', minWidth: 130,
            }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{c.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>
                {c.value}<span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginLeft: 3 }}>{c.unit}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-page)', borderBottom: '2px solid var(--border)' }}>
              {['栋舍', '批次号', '存栏数(羽)', '日龄(天)', '产蛋(枚)', '产蛋率', '死亡(羽)', '淘汰(羽)', '损耗合计', '饲料(kg)', '淘汰原因'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: h === '栋舍' || h === '批次号' || h === '淘汰原因' ? 'left' : 'right', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11} style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>加载中…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={11} style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>暂无数据</td></tr>
            ) : rows.map((row, i) => {
              const rate = parseFloat(row.lay_rate);
              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{row.house_code}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{row.flock_no}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{row.current_qty.toLocaleString()}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>{row.age_days ?? '—'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#f59e0b' }}>{row.eggs.toLocaleString()}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: rateColor(row.lay_rate) }}>{row.lay_rate}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: row.mortality > 0 ? '#ef4444' : 'var(--text-secondary)' }}>{row.mortality}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: row.elimination > 0 ? '#f97316' : 'var(--text-secondary)' }}>{row.elimination}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: row.total_loss > 0 ? '#dc2626' : 'var(--text-secondary)', fontWeight: row.total_loss > 0 ? 700 : 400 }}>{row.total_loss}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#8b5cf6' }}>{row.feed}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: 12 }}>{row.culling_reason ?? '—'}</td>
                </tr>
              );
            })}
            {/* 合计行 */}
            {totals && rows.length > 0 && (
              <tr style={{ background: 'var(--bg-page)', borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                <td colSpan={2} style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>合计</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--color-primary)' }}>{totals.current_qty.toLocaleString()}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>—</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f59e0b' }}>{totals.eggs.toLocaleString()}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: rateColor(totals.lay_rate) }}>{totals.lay_rate}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#ef4444' }}>{totals.mortality}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f97316' }}>{totals.elimination}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#dc2626' }}>{totals.total_loss}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#8b5cf6' }}>{totals.feed}</td>
                <td style={{ padding: '10px 12px' }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
