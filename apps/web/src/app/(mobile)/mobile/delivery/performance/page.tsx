'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';

const C = {
  bg:      'var(--brand-deep-1)',
  bg2:     'var(--brand-deep-2)',
  card:    'var(--overlay-white-05)',
  border:  'var(--overlay-white-10)',
  text:    'var(--slate-200)',
  textSub: 'var(--slate-400)',
  orange:  'var(--status-warning)',
  blue:    'var(--status-info)',
  green:   'var(--status-success)',
  red:     'var(--status-danger)',
  gray:    'var(--slate-500)',
};

interface PerformanceData {
  todayCompleted?: number;
  weekCompleted?: number;
  onTimeRate?: number;
  exceptionRate?: number;
  returnRate?: number;
}

function getToken() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}

async function apiFetch(path: string) {
  const token = getToken();
  const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function rateColor(rate: number): string {
  if (rate >= 90) return C.green;
  if (rate < 70) return C.red;
  return C.orange;
}

function MetricCard({ label, value, unit, color }: { label: string; value: number | string; unit?: string; color: string }) {
  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: '16px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}{unit}</div>
      <div style={{ fontSize: 12, color: C.textSub, marginTop: 6 }}>{label}</div>
    </div>
  );
}

export default function PerformancePage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadPerformance = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/v2/mobile/delivery/performance');
      setData(res.data ?? res);
    } catch {
      setError(t('mob.dlv.load_failed_refresh', '加载失败，请点击刷新重试'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { loadPerformance(); }, [loadPerformance]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPerformance();
    setRefreshing(false);
  };

  const onTimeRate = data?.onTimeRate ?? 0;
  const exceptionRate = data?.exceptionRate ?? 0;
  const returnRate = data?.returnRate ?? 0;

  return (
    <div style={{
      minHeight: '100svh',
      background: C.bg,
      color: C.text,
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>

      {/* 顶部栏 */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: C.bg2,
        borderBottom: `1px solid ${C.border}`,
        padding: '0 16px',
        height: 56,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'transparent', border: 'none', color: C.orange, fontSize: 20, cursor: 'pointer', padding: '8px 4px', lineHeight: 1 }}
        >
          ←
        </button>
        <div style={{ flex: 1, fontSize: 17, fontWeight: 700 }}>{t('mob.dlv.view_my_performance', '我的配送表现')}</div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            background: 'transparent', border: 'none', color: C.orange,
            fontSize: 22, cursor: refreshing ? 'not-allowed' : 'pointer',
            padding: 8, lineHeight: 1,
            display: 'inline-block',
            animation: refreshing ? 'spin 1s linear infinite' : 'none',
          }}
        >
          ↺
        </button>
      </div>

      <div style={{ padding: '16px 16px 100px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: C.textSub, padding: 60, fontSize: 14 }}>
            {t('mob.dlv.loading', '加载中…')}
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', color: C.red, padding: 40, fontSize: 14 }}>
            ⚠ {error}
          </div>
        ) : !data ? (
          <div style={{ textAlign: 'center', color: C.textSub, padding: 60, fontSize: 14 }}>
            📊 {t('mob.dlv.no_performance_data', '暂无绩效数据')}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: C.textSub, marginBottom: 16 }}>{t('mob.dlv.delivery_count', '配送数量')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
              <MetricCard label={t('mob.dlv.today_completed', '今日完成')} value={data.todayCompleted ?? 0} unit={` ${t('mob.dlv.orders_unit', '单')}`} color={C.blue} />
              <MetricCard label={t('mob.dlv.week_completed', '本周完成')} value={data.weekCompleted ?? 0} unit={` ${t('mob.dlv.orders_unit', '单')}`} color={C.blue} />
            </div>

            <div style={{ fontSize: 13, color: C.textSub, marginBottom: 16 }}>{t('mob.dlv.performance_metrics', '绩效指标')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
              <MetricCard label={t('mob.dlv.on_time_rate', '准时率')} value={onTimeRate.toFixed(1)} unit="%" color={rateColor(onTimeRate)} />
              <MetricCard label={t('mob.dlv.exception_rate', '异常率')} value={exceptionRate.toFixed(1)} unit="%" color={exceptionRate < 5 ? C.green : exceptionRate > 15 ? C.red : C.orange} />
              <MetricCard label={t('mob.dlv.return_rate', '退货率')} value={returnRate.toFixed(1)} unit="%" color={returnRate < 3 ? C.green : returnRate > 10 ? C.red : C.orange} />
            </div>

            {/* 准时率图示 */}
            <div style={{
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: C.textSub }}>{t('mob.dlv.on_time_rate', '准时率')}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: rateColor(onTimeRate) }}>{onTimeRate.toFixed(1)}%</span>
              </div>
              <div style={{ height: 8, background: 'var(--overlay-white-10)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(onTimeRate, 100)}%`,
                  background: rateColor(onTimeRate),
                  borderRadius: 4,
                  transition: 'width 0.6s ease',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: C.gray }}>
                <span>0%</span>
                <span style={{ color: C.orange }}>70%</span>
                <span style={{ color: C.green }}>90%</span>
                <span>100%</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
