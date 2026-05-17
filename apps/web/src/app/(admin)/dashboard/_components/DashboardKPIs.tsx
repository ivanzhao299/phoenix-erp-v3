'use client';
import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, AlertCircle, Egg, PackageSearch, BatteryWarning, ArrowUpRight, RefreshCw, Wifi, ShieldCheck } from 'lucide-react';
import styles from './dashboard.module.css';

const CARD_THEMES = [
  { accent: '#0ea5e9', bg: 'rgba(14,165,233,0.08)',  glow: 'rgba(14,165,233,0.18)' },
  { accent: '#10b981', bg: 'rgba(16,185,129,0.08)',  glow: 'rgba(16,185,129,0.18)' },
  { accent: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  glow: 'rgba(245,158,11,0.18)' },
  { accent: '#ef4444', bg: 'rgba(239,68,68,0.08)',   glow: 'rgba(239,68,68,0.18)'  },
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
          <span style={{ display: 'flex', alignItems: 'center', gap: 2, color: 'var(--status-success)', fontSize: 13, fontWeight: 700, background: 'rgba(16,185,129,0.08)', padding: '3px 8px', borderRadius: 20 }}>
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
    eggs:   { value: string; unit: string; trend?: string };
    stock:  { value: string; unit: string; trend?: string };
    sales:  { value: string; unit: string; trend?: string };
    alerts: { value: string; unit: string };
  };
  chartData?: { day: string; prod: number; sales: number }[];
  alertList?: { id: number; text: string; type: string }[];
  deviceStats?: { activeAlerts: number; offlineHouses: number; hottestTemp?: number };
  integrity?: { score: number; grade: string; dimensions: { name: string; score: number; maxScore: number; detail?: string }[] };
}

const FALLBACK: KpiData = {
  stats: {
    eggs:   { value: '142,500', unit: '枚',      trend: '5.2' },
    stock:  { value: '85,320',  unit: '版',      trend: '1.8' },
    sales:  { value: '32,450,000', unit: '老挝基普', trend: '12.4' },
    alerts: { value: '3', unit: '单待处理预警' },
  },
  chartData: [
    { day: '周一', prod: 110, sales: 90 }, { day: '周二', prod: 115, sales: 85 },
    { day: '周三', prod: 120, sales: 110 }, { day: '周四', prod: 105, sales: 95 },
    { day: '周五', prod: 140, sales: 125 }, { day: '周六', prod: 135, sales: 150 },
    { day: '周日', prod: 150, sales: 180 },
  ],
  alertList: [
    { id: 1, text: '万象1号店B批次普通鲜鸡蛋库存临期剩余2天', type: 'warning' },
    { id: 2, text: '总仓3号冷库温度异常波动超出安全阈值', type: 'danger' },
    { id: 3, text: '05号鸡舍产蛋率环比下降4%，需排查饲料', type: 'info' },
  ],
};

interface Props { initialData: KpiData; }

export default function DashboardKPIs({ initialData }: Props) {
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
  const [kpi, setKpi]         = useState<KpiData>(initialData);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [alerts, setAlerts]   = useState(initialData.alertList ?? FALLBACK.alertList ?? []);
  const [integrity, setIntegrity] = useState(initialData.integrity ?? null);

  const token = typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_token') : null;
  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const fetchKpi = useCallback(async () => {
    setLoading(true);
    try {
      const [kpiRes, integrityRes] = await Promise.all([
        fetch(`${API_BASE}/api/dashboard/kpi`, { headers: authHeader }).then(r => r.json()),
        fetch(`${API_BASE}/api/dashboard/integrity`, { headers: authHeader }).then(r => r.json()).catch(() => null),
      ]);
      if (kpiRes.code === 200) {
        setKpi(kpiRes.data);
        if (kpiRes.data.alertList) setAlerts(kpiRes.data.alertList);
        setLastUpdated(new Date().toLocaleTimeString('zh-CN'));
      }
      if (integrityRes?.code === 200) setIntegrity(integrityRes.data);
    } catch {
      setKpi(FALLBACK);
      setAlerts(FALLBACK.alertList!);
      setLastUpdated('离线缓存');
    } finally {
      setLoading(false);
    }
  }, []);

  // 挂载立即刷新，之后每 60s 轮询
  useEffect(() => {
    fetchKpi();
    const t = setInterval(fetchKpi, 60_000);
    return () => clearInterval(t);
  }, [fetchKpi]);

  const stats     = kpi.stats ?? FALLBACK.stats!;
  const chartData = kpi.chartData ?? FALLBACK.chartData!;
  const maxVal    = Math.max(...chartData.map(d => Math.max(d.prod, d.sales)), 1);

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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 20 }}>
        <StatCard loading={loading} themeIdx={0} title="当日产蛋量" value={stats.eggs.value} unit={stats.eggs.unit} icon={<Egg size={22} />} trend={stats.eggs.trend} />
        <StatCard loading={loading} themeIdx={1} title="库存总量"   value={stats.stock.value} unit={stats.stock.unit} icon={<PackageSearch size={22} />} trend={stats.stock.trend} />
        <StatCard loading={loading} themeIdx={2} title="本月销售额" value={stats.sales.value} unit={stats.sales.unit} icon={<TrendingUp size={22} />} trend={stats.sales.trend} />
        <StatCard loading={loading} themeIdx={3} title="待处理预警" value={stats.alerts.value} unit={stats.alerts.unit} icon={<AlertCircle size={22} />} alert />
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
              <span style={{ fontSize: 24, fontWeight: 800, color: integrity.score >= 90 ? '#16a34a' : integrity.score >= 75 ? '#d97706' : '#dc2626' }}>
                {integrity.score}
              </span>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 700,
                background: integrity.grade === 'A' ? '#dcfce7' : integrity.grade === 'B' ? '#fef3c7' : '#fee2e2',
                color: integrity.grade === 'A' ? '#16a34a' : integrity.grade === 'B' ? '#d97706' : '#dc2626' }}>
                {integrity.grade}级
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {integrity.dimensions.map(d => {
              const pct = Math.round((d.score / d.maxScore) * 100);
              const col = pct >= 80 ? '#16a34a' : pct >= 60 ? '#f59e0b' : '#dc2626';
              return (
                <div key={d.name} title={d.detail} style={{ flex: '1', minWidth: 120, padding: '8px 10px', background: 'var(--bg-page)', borderRadius: 'var(--radius-md)', border: `1px solid ${pct >= 80 ? '#bbf7d0' : pct >= 60 ? '#fde68a' : '#fecaca'}` }}>
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
            <div style={{ display: 'flex', gap: 10, fontSize: 12 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--color-primary)', display: 'inline-block' }} />产蛋(千枚)
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: '#f59e0b', display: 'inline-block' }} />销量(千枚)
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
                  <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: '100%', width: '100%', justifyContent: 'center' }}>
                    <div style={{ width: 14, background: 'var(--color-primary)', borderRadius: '4px 4px 0 0', height: `${(d.prod / maxVal) * 100}%`, transition: 'height 0.8s ease-out', boxShadow: '0 0 10px rgba(14,165,233,0.3)' }} />
                    <div style={{ width: 14, background: 'linear-gradient(180deg,#f59e0b,#fbbf24)', borderRadius: '4px 4px 0 0', height: `${(d.sales / maxVal) * 100}%`, transition: 'height 0.8s ease-out 0.2s' }} />
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
                style={{ borderLeft: `4px solid var(--status-${item.type === 'danger' ? 'danger' : item.type === 'warning' ? 'warning' : 'info'})` }}>
                <span>{item.text}</span>
                <button className={styles.dismissBtn} onClick={() => setAlerts(prev => prev.filter(a => a.id !== item.id))}>已处理</button>
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
