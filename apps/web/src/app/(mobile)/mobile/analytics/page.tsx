'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, RefreshCw, TrendingUp, TrendingDown, Minus, Sun, Moon } from 'lucide-react';
import { mobileApi, FarmTrend, TrendRow } from '@/lib/mobile-api';
import { useMobileTheme } from '@/contexts/MobileThemeContext';
import { useMobilePermission } from '@/hooks/useMobilePermission';

// ── SVG Bar Chart ─────────────────────────────────────────────────────────────

function BarChart({
  data, valueKey, color, height = 80,
}: {
  data: TrendRow[];
  valueKey: keyof TrendRow;
  color: string;
  height?: number;
}) {
  const { t } = useMobileTheme();
  if (!data.length) return null;
  const values = data.map(r => Number(r[valueKey]) || 0);
  const max = Math.max(...values, 1);
  const w = 100 / data.length;

  return (
    <svg width="100%" height={height} style={{ display: 'block' }}>
      {data.map((r, i) => {
        const v = Number(r[valueKey]) || 0;
        const barH = (v / max) * (height - 16);
        const x = i * w;
        return (
          <g key={r.date}>
            <rect
              x={`${x + w * 0.15}%`}
              y={height - barH - 16}
              width={`${w * 0.7}%`}
              height={barH}
              rx={2}
              fill={color}
              opacity={0.85}
            />
            {/* Date label for first, last, and midpoint */}
            {(i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2)) && (
              <text
                x={`${x + w / 2}%`}
                y={height - 2}
                textAnchor="middle"
                fontSize={9}
                fill={t.textFaint}
              >
                {r.date.slice(5)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── Trend Badge ───────────────────────────────────────────────────────────────

function TrendBadge({ current, prev }: { current: number; prev: number }) {
  if (prev === 0) return null;
  const pct = Math.round(((current - prev) / prev) * 100);
  if (pct === 0) return <Minus size={13} color="#9ca3af" />;
  const up = pct > 0;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      fontSize: 11, fontWeight: 600,
      color: up ? 'var(--status-success)' : 'var(--status-danger)',
    }}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {up ? '+' : ''}{pct}%
    </span>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, unit, prev, color, children,
}: {
  label: string; value: string | number; unit: string;
  prev?: number; color: string; children?: React.ReactNode;
}) {
  const { t } = useMobileTheme();
  return (
    <div style={{
      background: t.cardBg, border: `1px solid ${t.cardBorder}`,
      borderRadius: 14, padding: '14px 16px', marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: t.textMuted, fontWeight: 600 }}>{label}</span>
        {prev !== undefined && (
          <TrendBadge current={Number(value)} prev={prev} />
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 10 }}>
        <span style={{ fontSize: 28, fontWeight: 800, color }}>{value}</span>
        <span style={{ fontSize: 12, color: t.textMuted }}>{unit}</span>
        {prev !== undefined && prev > 0 && (
          <span style={{ fontSize: 11, color: t.textFaint, marginLeft: 4 }}>
            上期均 {prev}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Period chips ──────────────────────────────────────────────────────────────

const PERIODS = [
  { days: 7,  label: '7天' },
  { days: 14, label: '14天' },
  { days: 30, label: '30天' },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const router = useRouter();
  const { isDark, toggle, t } = useMobileTheme();
  const { allowed, loading: permLoading, readonly } = useMobilePermission('analytics');
  const [days, setDays]       = useState(7);
  const [data, setData]       = useState<FarmTrend | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const load = useCallback(async (d: number) => {
    setLoading(true);
    setError('');
    try {
      const res = await mobileApi.getFarmTrend(d);
      setData(res);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(days); }, [days, load]);

  if (permLoading || !allowed) return null;

  const s = data?.summary;
  const rows = data?.rows ?? [];

  const layRateNum  = parseFloat(s?.lay_rate ?? '0');
  const prevRateNum = parseFloat(s?.prev_lay_rate ?? '0');
  const rateColor   = layRateNum >= 85 ? 'var(--status-success)' : layRateNum >= 70 ? 'var(--status-warning)' : 'var(--status-danger)';

  return (
    <div style={{ minHeight: '100svh', background: t.pageBg, display: 'flex', flexDirection: 'column' }}>
      {/* AppBar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: 'calc(env(safe-area-inset-top) + 12px) 16px 12px',
        background: t.appBarBg, backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${t.barBorder}`,
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={() => router.back()} style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 4,
          color: t.textSub, display: 'flex', alignItems: 'center',
        }}>
          <ChevronLeft size={22} />
        </button>
        <div style={{ flex: 1, fontSize: 16, fontWeight: 700, color: t.text }}>生产趋势</div>
        <button onClick={() => load(days)} style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 6,
          color: t.textSub, display: 'flex', alignItems: 'center',
        }}>
          <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
        <button onClick={toggle} style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 6,
          color: t.textSub, display: 'flex', alignItems: 'center',
        }}>
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      {/* Period chips */}
      <div style={{
        display: 'flex', gap: 8, padding: '10px 16px',
        borderBottom: `1px solid ${t.barBorder}`,
      }}>
        {PERIODS.map(p => (
          <button key={p.days} onClick={() => setDays(p.days)} style={{
            padding: '6px 20px', borderRadius: 20, cursor: 'pointer',
            border: `1px solid ${days === p.days ? 'var(--status-warning)' : t.btnBorder}`,
            background: days === p.days ? 'rgba(245,158,11,0.15)' : t.btnBg,
            color: days === p.days ? 'var(--status-warning)' : t.textSub,
            fontSize: 13, fontWeight: 600,
          }}>
            {p.label}
          </button>
        ))}
        {s && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: t.textFaint, alignSelf: 'center' }}>
            存栏 {(s.total_qty || 0).toLocaleString()} 只
          </span>
        )}
      </div>

      {/* Content */}
      <div style={{
        flex: 1, padding: '12px 16px',
        paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
        overflowY: 'auto',
      }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: 48, color: t.textFaint, fontSize: 14 }}>加载中…</div>
        )}
        {!loading && error && (
          <div style={{
            padding: '12px 14px', borderRadius: 10, marginBottom: 10,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            color: 'var(--status-danger)', fontSize: 13, textAlign: 'center',
          }}>{error}</div>
        )}

        {!loading && s && (
          <>
            {/* 产蛋率 */}
            <StatCard
              label={`日均产蛋率（近 ${days} 天）`}
              value={s.lay_rate}
              unit="%"
              color={rateColor}
              prev={prevRateNum}
            >
              {rows.length > 0 && (
                <BarChart data={rows} valueKey="eggs" color={rateColor} height={72} />
              )}
            </StatCard>

            {/* 日均产蛋 */}
            <StatCard
              label="日均产蛋"
              value={s.avg_eggs.toLocaleString()}
              unit="枚"
              color="var(--status-warning)"
              prev={s.prev_avg_eggs}
            >
              {rows.length > 0 && (
                <BarChart data={rows} valueKey="eggs" color="var(--status-warning)" height={60} />
              )}
            </StatCard>

            {/* 死淘 */}
            <StatCard
              label="日均死淘"
              value={s.avg_mortality + s.avg_elimination}
              unit="只"
              color="var(--status-danger)"
            >
              {rows.length > 0 && (
                <BarChart data={rows} valueKey="mortality" color="var(--status-danger)" height={52} />
              )}
            </StatCard>

            {/* 饲料 */}
            <StatCard
              label="日均饲料消耗"
              value={s.avg_feed.toLocaleString()}
              unit="kg"
              color="var(--status-success)"
            >
              {rows.length > 0 && (
                <BarChart data={rows} valueKey="feed" color="var(--status-success)" height={52} />
              )}
            </StatCard>

            {/* 无数据提示 */}
            {rows.length === 0 && (
              <div style={{
                marginTop: 20, padding: '20px 16px', borderRadius: 12,
                background: t.sectionBg, border: `1px solid ${t.cardBorder}`,
                textAlign: 'center', color: t.textFaint, fontSize: 13,
              }}>
                近 {days} 天暂无日报数据
              </div>
            )}
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
