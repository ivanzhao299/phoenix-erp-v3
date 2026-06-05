'use client';
import { useState, useCallback } from 'react';
import { TrendingUp, AlertCircle, Egg, PackageSearch, BatteryWarning, ArrowUpRight, RefreshCw, ShieldCheck, CreditCard, Tractor } from 'lucide-react';
import styles from './dashboard.module.css';
import { usePolling } from '@/hooks/usePolling';

const CARD_THEMES = [
  { accent: '#0ea5e9', bg: 'rgba(14,165,233,0.08)',  glow: 'rgba(14,165,233,0.18)' },  // 蓝：产蛋
  { accent: 'var(--status-success)', bg: 'var(--status-success-bg-medium)',  glow: 'rgba(16,185,129,0.18)' },  // 绿：库存
  { accent: 'var(--status-warning)', bg: 'var(--status-warning-bg-faint)',  glow: 'rgba(245,158,11,0.18)' },  // 琥珀：POS
  { accent: 'var(--status-danger)', bg: 'var(--status-danger-bg-faint)',   glow: 'rgba(239,68,68,0.18)'  },  // 红：预警
  { accent: 'var(--color-purple-500)', bg: 'rgba(139,92,246,0.08)',  glow: 'rgba(139,92,246,0.18)' },  // 紫：农场直销
];

function StatCard({ title, value, unit, icon, trend, alert: isAlert, loading, themeIdx = 0 }: {
  title: string; value?: string; unit?: string; icon: React.ReactNode;
  trend?: string; alert?: boolean; loading?: boolean; themeIdx?: number;
}) {
  const theme = isAlert ? CARD_THEMES[3] : CARD_THEMES[themeIdx % CARD_THEMES.length];
  return (
    <div className={styles.statCard} style={{ borderTop: `3px solid ${theme.accent}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ padding: 10, borderRadius: 12, background: theme.bg, color: theme.accent, display: 'flex', alignItems: 'center' }}>
          {icon}
        </div>
        {trend && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 2, color: 'var(--status-success)', fontSize: 13, fontWeight: 700, background: 'var(--status-success-bg-medium)', padding: '3px 8px', borderRadius: 20 }}>
            <ArrowUpRight size={13} />+{trend}%
          </span>
        )}
      </div>
      <div>
        <h3 style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{title}</h3>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          {loading ? (
            <div className={styles.skeleton} style={{ height: 36, width: 110 }} />
          ) : (
            <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-1px', background: `linear-gradient(135deg,${theme.accent},${theme.accent}cc)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {value ?? '–'}
            </span>
          )}
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>{unit}</span>
        </div>
      </div>
      {/* decorative glow orb */}
      <div style={{ position: 'absolute', right: -24, bottom: -24, width: 110, height: 110, borderRadius: '50%', background: `radial-gradient(circle,${theme.glow} 0%,transparent 70%)`, pointerEvents: 'none' }} />
    </div>
  );
}

interface KpiData {
  stats?: {
    eggs:       { value: string; unit: string; trend?: string };
    stock:      { value: string; unit: string; trend?: string };
    /** 新字段：按渠道分开 */
    salesPos?:  { value: string; unit: string; trend?: string };
    salesFarm?: { value: string; unit: string; trend?: string };
    /** 旧字段兼容（老后端未部署时的降级） */
    sales?:     { value: string; unit: string; trend?: string };
    alerts:     { value: string; unit: string };
  };
  chartData?: { day: string; prod: number; sales: number; farmSales?: number }[];
  alertList?: { id: number; text: string; type: string }[];
  deviceStats?: { activeAlerts: number; offlineHouses: number; hottestTemp?: number };
  integrity?: { score: number; grade: string; dimensions: { name: string; score: number; maxScore: number; detail?: string }[] };
}

const EMPTY_STATS: NonNullable<KpiData['stats']> = {
  eggs:      { value: '—', unit: '枚' },
  stock:     { value: '—', unit: '' },
  salesPos:  { value: '—', unit: 'POS 收银' },
  salesFarm: { value: '—', unit: '农场直销' },
  alerts:    { value: '—', unit: '' },
};

interface Props { initialData: KpiData; }

export default function DashboardKPIs({ initialData }: Props) {
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
  const [kpi, setKpi]         = useState<KpiData>(initialData);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [alerts, setAlerts]   = useState(initialData.alertList ?? []);
  const [integrity, setIntegrity] = useState(initialData.integrity ?? null);

  const fetchKpi = useCallback(async () => {
    setLoading(true);
    try {
      const tok = sessionStorage.getItem('phoenix_token') ?? '';
      const hdrs: Record<string, string> = tok ? { Authorization: `Bearer ${tok}` } : {};
      const [kpiRes, integrityRes] = await Promise.all([
        fetch(`${API_BASE}/api/dashboard/kpi`, { headers: hdrs }).then(r => r.json()),
        fetch(`${API_BASE}/api/dashboard/integrity`, { headers: hdrs }).then(r => r.json()).catch(() => null),
      ]);
      if (kpiRes.code === 200) {
        setKpi(kpiRes.data);
        if (kpiRes.data.alertList) setAlerts(kpiRes.data.alertList);
        setLastUpdated(new Date().toLocaleTimeString('zh-CN'));
      }
      if (integrityRes?.code === 200) setIntegrity(integrityRes.data);
    } catch {
      setLastUpdated('加载失败');
    } finally {
      setLoading(false);
    }
  }, [API_BASE]);

  // 挂载立即刷新，之后每 60s 轮询（后台标签时跳过，切回来时补跑）
  usePolling(fetchKpi, 60_000);

  const stats     = kpi.stats ?? EMPTY_STATS;
  const chartData = kpi.chartData ?? [];
  const maxVal    = chartData.length
    ? Math.max(...chartData.map(d => Math.max(d.prod, d.sales, d.farmSales ?? 0)), 1)
    : 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>集团总部经营驾驶舱</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            实时数据{lastUpdated && <span> · 最近更新：{lastUpdated}</span>}
          </p>
        </div>
        <button type="button" onClick={fetchKpi} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          <RefreshCw size={15} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />刷新数据
        </button>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 20 }}>
        <StatCard loading={loading} themeIdx={0} title="当日产蛋量"
          value={stats.eggs.value} unit={stats.eggs.unit} icon={<Egg size={22} />} trend={stats.eggs.trend} />
        <StatCard loading={loading} themeIdx={1} title="库存总量"
          value={stats.stock.value} unit={stats.stock.unit} icon={<PackageSearch size={22} />} trend={stats.stock.trend} />
        <StatCard loading={loading} themeIdx={2} title="今日POS收银"
          value={(stats.salesPos ?? stats.sales)?.value} unit={(stats.salesPos ?? stats.sales)?.unit}
          icon={<CreditCard size={22} />} trend={(stats.salesPos ?? stats.sales)?.trend} />
        <StatCard loading={loading} themeIdx={4} title="今日农场直销"
          value={stats.salesFarm?.value} unit={stats.salesFarm?.unit}
          icon={<Tractor size={22} />} trend={stats.salesFarm?.trend} />
        <StatCard loading={loading} themeIdx={3} title="待处理预警"
          value={stats.alerts.value} unit={stats.alerts.unit} icon={<AlertCircle size={22} />} alert />
      </div>

      {/* Integrity score */}
      {integrity && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14 }}>
              <ShieldCheck size={16} style={{ color: 'var(--color-primary)' }} />全链路数据完整性
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>总分</span>
              <span style={{ fontSize: 24, fontWeight: 800, color: integrity.score >= 90 ? 'var(--status-success)' : integrity.score >= 75 ? 'var(--status-warning)' : 'var(--status-danger)' }}>
                {integrity.score}
              </span>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 700,
                background: integrity.grade === 'A' ? '#dcfce7' : integrity.grade === 'B' ? 'var(--status-warning-bg-faint)' : 'var(--status-danger-bg-faint)',
                color: integrity.grade === 'A' ? 'var(--status-success)' : integrity.grade === 'B' ? 'var(--status-warning)' : 'var(--status-danger)' }}>
                {integrity.grade}级
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {integrity.dimensions.map(d => {
              const pct = Math.round((d.score / d.maxScore) * 100);
              const col = pct >= 80 ? 'var(--status-success)' : pct >= 60 ? 'var(--status-warning)' : 'var(--status-danger)';
              return (
                <div key={d.name} title={d.detail} style={{ flex: '1', minWidth: 120, padding: '8px 10px', background: 'var(--bg-page)', borderRadius: 'var(--radius-md)', border: `1px solid ${pct >= 80 ? '#bbf7d0' : pct >= 60 ? 'var(--status-warning-bg-faint)' : '#fecaca'}` }}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600 }}>{d.name}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ height: 4, flex: 1, background: 'var(--border)', borderRadius: 4, marginRight: 6, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, borderRadius: 4, background: col }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: col }}>{d.score}/{d.maxScore}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Chart + Alerts */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>

        {/* 7-day bar chart */}
        <div className={styles.glassCard} style={{ minHeight: 380, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-primary)' }}>近7日经营走势</h3>
            <div style={{ display: 'flex', gap: 12, fontSize: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--color-primary)', display: 'inline-block' }} />产蛋(千枚)
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--status-warning)', display: 'inline-block' }} />POS收银(LAK)
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--color-purple-500)', display: 'inline-block' }} />农场直销(LAK)
              </span>
            </div>
          </div>
          <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingTop: 20, paddingLeft: 40 }}>
            <div style={{ position: 'absolute', top: 0, left: 40, right: 0, bottom: 24, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', zIndex: 0 }}>
              {[100, 75, 50, 25, 0].map((pct, i) => (
                <div key={i} style={{ borderBottom: '1px dashed var(--border)', height: 0, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: -35, top: -8, fontSize: 11, color: 'var(--text-secondary)' }}>{Math.round(maxVal * pct / 100)}k</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: 240, paddingRight: 10, position: 'relative', zIndex: 1 }}>
              {chartData.map((d, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1, height: '100%', justifyContent: 'flex-end' }}>
                  <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: '100%', width: '100%', justifyContent: 'center' }}>
                    <div title={`产蛋 ${d.prod}k`}
                      style={{ width: 11, background: 'var(--color-primary)', borderRadius: '4px 4px 0 0', height: `${(d.prod / maxVal) * 100}%`, transition: 'height 0.8s ease-out', boxShadow: '0 0 8px rgba(14,165,233,0.3)' }} />
                    <div title={`POS收银 ${d.sales.toLocaleString()} LAK`}
                      style={{ width: 11, background: 'linear-gradient(180deg,#f59e0b,#fbbf24)', borderRadius: '4px 4px 0 0', height: `${(d.sales / maxVal) * 100}%`, transition: 'height 0.8s ease-out 0.15s' }} />
                    <div title={`农场直销 ${(d.farmSales ?? 0).toLocaleString()} LAK`}
                      style={{ width: 11, background: 'linear-gradient(180deg,#8b5cf6,#a78bfa)', borderRadius: '4px 4px 0 0', height: `${((d.farmSales ?? 0) / maxVal) * 100}%`, transition: 'height 0.8s ease-out 0.3s' }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{d.day}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Alert list */}
        <div className={styles.glassCard} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <BatteryWarning size={20} color="var(--status-warning)" />业务实时预警
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {alerts.map(item => (
              <div key={item.id} className={styles.alertItem}
                style={{ borderLeft: `var(--card-accent-width) solid var(--status-${item.type === 'danger' ? 'danger' : item.type === 'warning' ? 'warning' : 'info'})` }}>
                <span>{item.text}</span>
                <button type="button" className={styles.dismissBtn} onClick={() => setAlerts(prev => prev.filter(a => a.id !== item.id))}>已处理</button>
              </div>
            ))}
            {alerts.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                <div>今日无待处理预警</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
