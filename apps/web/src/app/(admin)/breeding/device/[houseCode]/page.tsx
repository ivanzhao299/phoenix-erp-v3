'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import u from "@/styles/uix-utils.module.css";
import { useParams, useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import { ArrowLeft, RefreshCw, AlertTriangle, Wind, Activity, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RCTooltip, Legend, ReferenceLine, ResponsiveContainer } from 'recharts';
import s from '@/components/ui/admin-ui.module.css';
import { useLanguage } from '@/contexts/LanguageContext';

// ─── auth ────────────────────────────────────────────────────────
const tok = () => typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_token') || '' : '';
const hdr = () => ({
  Authorization: `Bearer ${tok()}`
});
const API = '/api/farm-device/cabins';

// ─── palette ─────────────────────────────────────────────────────
const SC: Record<string, string> = {
  normal: 'var(--status-success)',
  warning: 'var(--status-warning)',
  critical: 'var(--status-danger)',
  no_data: 'var(--text-disabled)',
  standby: 'var(--text-disabled)'
};
const TREND_CLR: Record<string, string> = {
  '2001': 'var(--status-danger)',
  '2083': 'var(--color-accent)',
  '2002': 'var(--status-special)',
  '2003': 'var(--status-warning)'
};
const ENV_ICON: Record<string, string> = {
  '2001': '🌡',
  '2083': '💧',
  '2002': '🌬',
  '2003': '⚠️'
};
const ENV_NAME: Record<string, string> = {
  '2001': '舍内温度',
  '2083': '相对湿度',
  '2002': 'CO₂浓度',
  '2003': '氨气浓度'
};
const ENV_CODES = ['2001', '2083', '2002', '2003'];

// ─── types ───────────────────────────────────────────────────────
interface IotKpi {
  code: string;
  title?: string;
  value?: number | null;
  unit?: string;
  status?: string;
}
interface IotHeader {
  houseName?: string;
  houseCode?: string;
  flockNo?: string;
  flockSize?: number;
}
interface IotOverview {
  header?: IotHeader;
  kpis?: IotKpi[];
  dataFreshness?: string;
}
interface IotAlarm {
  id?: string | number;
  alarmName?: string;
  propertyName?: string;
  severity?: string;
  [key: string]: unknown;
}
interface IotSystem {
  code?: string;
  systemCode?: string;
  name?: string;
  status?: string;
  onlineRate?: number | null;
  sensorCount?: number;
  alarmCount?: number;
  [key: string]: unknown;
}
interface ChartPoint {
  time?: string | number;
  [key: string]: unknown;
}
type TrendPoint = {
  value: number;
  collectTime: number;
};
type TrendApiPoint = {
  value?: number | null;
  collectTime: number | string;
};
type TrendApiSeries = {
  propertyCode: string;
  name?: string;
  unit?: string;
  thresholdHigh?: number | null;
  thresholdLow?: number | null;
  points?: TrendApiPoint[];
};
type RechartsPayload = {
  payload?: Record<string, unknown>;
};
type SeriesMeta = {
  code: string;
  name: string;
  unit: string;
  color: string;
  thresholdHigh: number | null;
  thresholdLow: number | null;
  points: TrendPoint[];
  min: number;
  max: number;
};

// ─── Sparkline (metric card inset) ───────────────────────────────
function Sparkline({
  pts,
  color
}: {
  pts: number[];
  color: string;
}) {
  if (pts.length < 2) return null;
  const mn = Math.min(...pts),
    mx = Math.max(...pts),
    r = mx - mn || 1;
  const W = 90,
    H = 34;
  const x = (i: number) => i / (pts.length - 1) * W;
  const y = (v: number) => H - (v - mn) / r * (H - 6) - 3;
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${d} L${x(pts.length - 1).toFixed(1)},${H} L0,${H} Z`;
  return <svg width={W} height={H} style={{
    display: 'block',
    overflow: 'visible',
    flexShrink: 0
  }}>
      <path d={area} fill={`${color}1a`} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1])} r={2.5} fill={color} />
    </svg>;
}

// ─── Custom Recharts tooltip ──────────────────────────────────────
function ChartTip({
  active,
  payload,
  series
}: {
  active?: boolean;
  payload?: RechartsPayload[];
  series: SeriesMeta[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return <div style={{
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '8px 14px',
    fontSize: 11,
    boxShadow: '0 4px 16px rgba(0,0,0,.14)',
    minWidth: 200
  }}>
      <div style={{
      fontWeight: 700,
      marginBottom: 8,
      fontSize: 12,
      color: 'var(--text-primary)'
    }}>
        {String(row?.time ?? '')}
      </div>
      {series.map(sm => {
      const raw = row?.[`_${sm.code}`];
      if (raw == null) return null;
      const amplitude = sm.max - sm.min;
      return <div key={sm.code} style={{
        marginBottom: 6
      }}>
            <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 14
        }}>
              <span style={{
            color: sm.color,
            display: 'flex',
            alignItems: 'center',
            gap: 4
          }}>
                <span style={{
              fontSize: 7
            }}>●</span>{sm.name}
              </span>
              <span style={{
            fontWeight: 700,
            color: sm.color
          }}>{Number(raw).toFixed(1)}{sm.unit}</span>
            </div>
            <div style={{
          fontSize: 10,
          color: 'var(--text-secondary)',
          marginLeft: 12,
          marginTop: 1
        }}>
              ↓{sm.min.toFixed(1)} ~ ↑{sm.max.toFixed(1)}{sm.unit}
              <span style={{
            marginLeft: 6,
            fontWeight: 600,
            color: amplitude > 5 ? 'var(--status-warning)' : 'var(--text-secondary)'
          }}>
                波幅 {amplitude.toFixed(1)}{sm.unit}
              </span>
            </div>
          </div>;
    })}
    </div>;
}

// ─── Main page ───────────────────────────────────────────────────
export default function HouseDetailPage() {
  const {
    houseCode
  } = useParams<{
    houseCode: string;
  }>();
  const router = useRouter();
  const {
    t
  } = useLanguage();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [overview, setOverview] = useState<IotOverview | null>(null);
  const [systems, setSystems] = useState<IotSystem[]>([]);
  const [alarms, setAlarms] = useState<IotAlarm[]>([]);
  const [series, setSeries] = useState<SeriesMeta[]>([]);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendRange, setTrendRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [sensorOpen, setSensorOpen] = useState(false);
  const [autoRef, setAutoRef] = useState(false);
  const [lastUpdate, setLastUpdate] = useState('');
  const kpis = useMemo(() => overview?.kpis || [], [overview]);
  const getKpi = (code: string) => kpis.find(k => k.code === code);
  const SL: Record<string, string> = {
    normal: t('status.normal', '正常'),
    warning: t('status.warning', '预警'),
    critical: t('status.critical', '告警'),
    no_data: t('status.no_data', '无数据'),
    standby: t('status.standby', '待机')
  };
  const SYS_CFG: Record<string, {
    name: string;
    icon: string;
  }> = {
    HVAC: {
      name: t('ui.环境调控', '环境调控'),
      icon: '🌡'
    },
    CONTROL: {
      name: t('ui.控制设备', '控制设备'),
      icon: '⚡'
    },
    FEED: {
      name: t('ui.饲喂系统', '饲喂系统'),
      icon: '🌾'
    },
    WATER: {
      name: t('ui.饮水系统', '饮水系统'),
      icon: '💧'
    },
    EXEC: {
      name: t('ui.执行设备', '执行设备'),
      icon: '⚙️'
    }
  };

  // Derived: overall health
  const overallStatus = useMemo(() => {
    if (!overview && !loading) return 'no_data';
    if (alarms.some(a => a.severity === 'critical')) return 'critical';
    if (alarms.length > 0) return 'warning';
    if (kpis.some(k => k.status === 'critical')) return 'critical';
    if (kpis.some(k => k.status === 'warning')) return 'warning';
    return overview ? 'normal' : 'no_data';
  }, [overview, alarms, kpis, loading]);
  const OVERALL_LABEL: Record<string, string> = {
    normal: t('ui.整体运行正常', '整体运行正常'),
    warning: t('ui.存在预警请关注', '存在预警，请关注'),
    critical: t('ui.存在告警需处理', '存在告警，需立即处理'),
    no_data: t('ui.设备数据待接入', '设备数据待接入')
  };

  // ── Load realtime ──────────────────────────────────────────────
  const loadRealtime = useCallback(async () => {
    if (!houseCode) return;
    setLoading(true);
    try {
      const [ovRes, sysRes, almRes] = await Promise.all([fetch(`${API}/${houseCode}/overview`, {
        headers: hdr()
      }), fetch(`${API}/${houseCode}/systems/summary`, {
        headers: hdr()
      }), fetch(`${API}/${houseCode}/alarms?status=open`, {
        headers: hdr()
      })]);
      const [ov, sys, alm] = await Promise.all([ovRes.ok ? ovRes.json() : null, sysRes.ok ? sysRes.json() : null, almRes.ok ? almRes.json() : null]);
      if (ov?.ok) setOverview(ov.data);
      if (sys?.ok) setSystems(sys.data?.systems || []);
      if (alm?.ok) setAlarms(alm.data?.items || []);
      setLastUpdate(new Date().toLocaleTimeString('zh-CN'));
    } catch {} finally {
      setLoading(false);
    }
  }, [houseCode]);

  // ── Load trends ────────────────────────────────────────────────
  const loadTrends = useCallback(async () => {
    if (!houseCode) return;
    setTrendLoading(true);
    try {
      const res = await fetch(`${API}/${houseCode}/trends?codes=${ENV_CODES.join(',')}&range=${trendRange}`, {
        headers: hdr()
      });
      const json = res.ok ? await res.json() : null;
      if (!json?.ok || !Array.isArray(json.data?.series) || json.data.series.length === 0) {
        setSeries([]);
        setChartData([]);
        return;
      }
      const isIntraDay = trendRange === '24h';
      const fmtKey = (ct: number) => {
        const d = new Date(ct);
        return isIntraDay ? d.toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit'
        }) : d.toLocaleDateString('zh-CN', {
          month: 'numeric',
          day: 'numeric'
        });
      };
      const metas: SeriesMeta[] = (json.data.series as TrendApiSeries[]).flatMap(s => {
        const pts: TrendPoint[] = (s.points || []).filter(p => p.value != null).map(p => ({
          value: Number(p.value),
          collectTime: Number(p.collectTime) > 1e11 ? Number(p.collectTime) : new Date(String(p.collectTime)).getTime()
        }));
        if (!pts.length) return [];
        const vals = pts.map(p => p.value);
        return [{
          code: s.propertyCode,
          name: s.name || s.propertyCode,
          unit: s.unit || '',
          color: TREND_CLR[s.propertyCode] || 'var(--text-disabled)',
          thresholdHigh: s.thresholdHigh ?? null,
          thresholdLow: s.thresholdLow ?? null,
          points: pts,
          min: Math.min(...vals),
          max: Math.max(...vals)
        }];
      });
      setSeries(metas);

      // Build Recharts rows: normalised 0-100 for shared Y axis, raw for tooltip
      const timeMap: Record<string, ChartPoint> = {};
      metas.forEach(sm => {
        const range = sm.max - sm.min || 1;
        sm.points.forEach(p => {
          const k = fmtKey(p.collectTime);
          if (!timeMap[k]) timeMap[k] = {
            time: k
          };
          timeMap[k][sm.code] = (p.value - sm.min) / range * 100;
          timeMap[k][`_${sm.code}`] = p.value;
        });
      });
      setChartData(Object.values(timeMap).sort((a, b) => String(a.time).localeCompare(String(b.time))));
    } catch {} finally {
      setTrendLoading(false);
    }
  }, [houseCode, trendRange]);
  useEffect(() => {
    loadRealtime();
  }, [loadRealtime]);
  useEffect(() => {
    loadTrends();
  }, [loadTrends]);
  useEffect(() => {
    if (autoRef) timerRef.current = setInterval(loadRealtime, 60_000);else if (timerRef.current) clearInterval(timerRef.current);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRef, loadRealtime]);

  // Threshold reference lines (normalised to 0-100 space)
  const refLines = useMemo(() => series.flatMap(sm => {
    const r = sm.max - sm.min || 1;
    const lines: {
      y: number;
      color: string;
      dash: string;
      label: string;
    }[] = [];
    if (sm.thresholdHigh != null) {
      const ny = (sm.thresholdHigh - sm.min) / r * 100;
      if (ny >= -5 && ny <= 105) lines.push({
        y: ny,
        color: sm.color,
        dash: '6 3',
        label: `${sm.name}↑${sm.thresholdHigh}${sm.unit}`
      });
    }
    if (sm.thresholdLow != null) {
      const ny = (sm.thresholdLow - sm.min) / r * 100;
      if (ny >= -5 && ny <= 105) lines.push({
        y: ny,
        color: sm.color,
        dash: '3 3',
        label: `${sm.name}↓${sm.thresholdLow}${sm.unit}`
      });
    }
    return lines;
  }), [series]);

  // ── Render ─────────────────────────────────────────────────────
  return <div className="animate-fade-in">

      {/* Header */}
      <PageHeader title={`${overview?.header?.houseName || houseCode} — ${t('ui.鸡舍实时监控', '鸡舍实时监控')}`} subtitle={loading ? t('common.loading', '正在加载...') : overview?.header?.flockNo ? `${t('ui.批次', '批次')} ${overview.header.flockNo} · ${t('ui.存栏', '存栏')} ${Number(overview.header.flockSize || 0).toLocaleString()} ${t('ui.只', '只')}` : t('ui.暂无绑定批次', '暂无绑定批次')} breadcrumb={[t('ui.养殖管理', '养殖管理'), t('ui.设备监控总览', '设备监控总览'), overview?.header?.houseName || houseCode]} actions={<div className={u.flexRow8}>
            <label style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        color: 'var(--text-secondary)',
        cursor: 'pointer'
      }}>
              <span className={s.toggle} style={{
          flexShrink: 0
        }}>
                <input type="checkbox" className={s.toggleInput} checked={autoRef} onChange={e => setAutoRef(e.target.checked)} />
                <span className={s.toggleTrack} />
              </span>
              {t('ui.自动刷新', '自动刷新')}
            </label>
            {lastUpdate && <span style={{
        fontSize: 11,
        color: 'var(--text-secondary)'
      }}>
                <Clock size={10} style={{
          marginRight: 2
        }} />{lastUpdate}
              </span>}
            <button type="button" className={s.btnSecondary} onClick={() => {
        loadRealtime();
        loadTrends();
      }} disabled={loading}>
              <RefreshCw size={13} style={{
          animation: loading ? 'spin 1s linear infinite' : 'none'
        }} />
              {t('common.refresh', '刷新')}
            </button>
            <button type="button" className={s.btnSecondary} onClick={() => router.back()}>
              <ArrowLeft size={13} /> {t('ui.返回总览', '返回总览')}
            </button>
          </div>} />

      {/* ── Status band ─────────────────────────────────────────── */}
      {!loading && <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 8,
      padding: '11px 18px',
      marginBottom: 16,
      borderRadius: 'var(--radius-lg)',
      background: `color-mix(in srgb,${SC[overallStatus]} 7%,var(--bg-card))`,
      border: `1.5px solid color-mix(in srgb,${SC[overallStatus]} 28%,transparent)`
    }}>
          <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10
      }}>
            <div style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: SC[overallStatus],
          boxShadow: `0 0 7px ${SC[overallStatus]}`
        }} />
            <span style={{
          fontWeight: 700,
          fontSize: 14,
          color: SC[overallStatus]
        }}>
              {OVERALL_LABEL[overallStatus]}
            </span>
            {overview?.header?.houseName && <span style={{
          fontSize: 13,
          color: 'var(--text-secondary)'
        }}>
                · {overview.header.houseName}
                {overview.header.flockNo && ` · ${t('ui.批次', '批次')}${overview.header.flockNo}`}
                {(overview.header.flockSize ?? 0) > 0 && ` · ${t('ui.存栏', '存栏')} ${Number(overview.header.flockSize).toLocaleString()} ${t('ui.只', '只')}`}
              </span>}
          </div>
          <div style={{
        display: 'flex',
        gap: 18,
        fontSize: 12,
        color: 'var(--text-secondary)',
        flexWrap: 'wrap'
      }}>
            <span>
              {t('ui.数据', '数据')}:&nbsp;
              <b style={{
            color: overview?.dataFreshness === 'normal' ? 'var(--status-success)' : 'var(--status-warning)'
          }}>
                {overview?.dataFreshness === 'normal' ? t('ui.实时', '实时') : overview?.dataFreshness === 'delayed' ? t('ui.延迟', '延迟') : t('ui.陈旧', '陈旧')}
              </b>
            </span>
            <span>
              {t('ui.活跃告警', '活跃告警')}:&nbsp;
              <b style={{
            color: alarms.length > 0 ? 'var(--status-danger)' : 'var(--status-success)'
          }}>{alarms.length}</b>
            </span>
            <span>{t('ui.采集时间', '采集时间')}: <b>{lastUpdate || '—'}</b></span>
          </div>
        </div>}

      {/* ── Alarm banner ────────────────────────────────────────── */}
      {alarms.length > 0 && <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      padding: '10px 16px',
      marginBottom: 16,
      background: 'color-mix(in srgb,var(--status-danger) 7%,transparent)',
      border: '1.5px solid color-mix(in srgb,var(--status-danger) 28%,transparent)',
      borderRadius: 'var(--radius-md)'
    }}>
          <AlertTriangle size={15} style={{
        color: 'var(--status-danger)',
        flexShrink: 0,
        marginTop: 1
      }} />
          <span style={{
        fontWeight: 700,
        color: 'var(--status-danger)',
        fontSize: 13
      }}>
            {alarms.length} {t('ui.个活跃告警', '个活跃告警')}
          </span>
          <span style={{
        color: 'var(--text-secondary)',
        fontSize: 12,
        marginLeft: 2
      }}>
            {alarms.map(a => a.alarmName || a.propertyName).slice(0, 4).join(' · ')}
            {alarms.length > 4 && ` +${alarms.length - 4}`}
          </span>
        </div>}

      {/* ── Env metric cards 2×2 ────────────────────────────────── */}
      <div style={{
      fontSize: 13,
      fontWeight: 700,
      color: 'var(--text-primary)',
      marginBottom: 10
    }}>
        📡 {t('ui.实时环境指标', '实时环境指标')}
      </div>
      {loading ? <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
      gap: 12,
      marginBottom: 24
    }}>
          {[1, 2, 3, 4].map(i => <div key={i} className={s.shimmer} style={{
        height: 110,
        borderRadius: 'var(--radius-lg)'
      }} />)}
        </div> : <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
      gap: 12,
      marginBottom: 24
    }}>
          {ENV_CODES.map(code => {
        const kpi = getKpi(code);
        const sm = series.find(x => x.code === code);
        const color = SC[kpi?.status || 'no_data'];
        const pts = sm?.points.map(p => p.value) || [];
        const delta = pts.length > 1 ? pts[pts.length - 1] - pts[0] : null;
        const trendLabel = delta == null ? null : delta > 0.05 ? `↑ ${delta.toFixed(1)}` : delta < -0.05 ? `↓ ${Math.abs(delta).toFixed(1)}` : '→ 平稳';
        const trendColor = delta == null ? 'var(--text-disabled)' : delta > 0.05 ? 'var(--status-danger)' : delta < -0.05 ? 'var(--status-success)' : 'var(--text-disabled)';
        return <div key={code} style={{
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg)',
          padding: '14px 16px',
          boxShadow: 'var(--shadow-sm)',
          border: `1px solid color-mix(in srgb,${color} 18%,var(--border))`,
          borderLeft: `var(--card-accent-width) solid ${color}`
        }}>
                <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start'
          }}>
                  <div>
                    <div style={{
                fontSize: 11,
                color: 'var(--text-secondary)',
                fontWeight: 600,
                marginBottom: 4
              }}>
                      {ENV_ICON[code]}&nbsp;{kpi?.title || ENV_NAME[code] || code}
                    </div>
                    <div style={{
                fontSize: 36,
                fontWeight: 800,
                color,
                lineHeight: 1,
                letterSpacing: -1
              }}>
                      {kpi?.value != null ? Number(kpi.value).toFixed(1) : '—'}
                      <span style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  marginLeft: 3
                }}>
                        {kpi?.unit || sm?.unit || ''}
                      </span>
                    </div>
                  </div>
                  <Sparkline pts={pts} color={color} />
                </div>
                <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 8
          }}>
                  <span style={{
              fontSize: 11,
              padding: '2px 9px',
              borderRadius: 10,
              fontWeight: 700,
              background: `color-mix(in srgb,${color} 13%,transparent)`,
              color
            }}>
                    {SL[kpi?.status || 'no_data']}
                  </span>
                  <div style={{
              display: 'flex',
              gap: 8,
              fontSize: 11,
              color: 'var(--text-secondary)'
            }}>
                    {pts.length > 1 && <>
                        <span>↓{Math.min(...pts).toFixed(1)}</span>
                        <span>↑{Math.max(...pts).toFixed(1)}</span>
                        {trendLabel && <span style={{
                  color: trendColor,
                  fontWeight: 700
                }}>{trendLabel}</span>}
                      </>}
                  </div>
                </div>
              </div>;
      })}
        </div>}

      {/* ── Trend chart ─────────────────────────────────────────── */}
      <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10
    }}>
        <div style={{
        fontSize: 13,
        fontWeight: 700,
        color: 'var(--text-primary)'
      }}>
          📈 {t('ui.历史趋势', '历史趋势')}
          {series.length > 0 && <span style={{
          fontSize: 11,
          fontWeight: 400,
          color: 'var(--text-secondary)',
          marginLeft: 8
        }}>
              · Y轴归一化，鼠标悬停查看实际值
            </span>}
        </div>
        <div style={{
        display: 'flex',
        gap: 4
      }}>
          {(['24h', '7d', '30d'] as const).map(r => <button key={r} type="button" onClick={() => setTrendRange(r)} style={{
          padding: '4px 10px',
          fontSize: 11,
          borderRadius: 6,
          cursor: 'pointer',
          fontWeight: 600,
          border: `1px solid ${trendRange === r ? 'var(--color-primary)' : 'var(--border)'}`,
          background: trendRange === r ? 'var(--color-primary)' : 'transparent',
          color: trendRange === r ? 'var(--bg-card)' : 'var(--text-secondary)',
          transition: 'all .15s'
        }}>
              {r === '24h' ? '近24h' : r === '7d' ? '近7天' : '近30天'}
            </button>)}
        </div>
      </div>

      <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '16px 20px',
      marginBottom: 24,
      minHeight: 260
    }}>
        {trendLoading ? <div className={s.shimmer} style={{
        height: 224,
        borderRadius: 8
      }} /> : chartData.length > 0 ? <ResponsiveContainer width="100%" height={224}>
            <LineChart data={chartData} margin={{
          top: 4,
          right: 16,
          left: -28,
          bottom: 0
        }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="time" tick={{
            fontSize: 10,
            fill: 'var(--text-secondary)'
          }} axisLine={false} tickLine={false} minTickGap={44} />
              <YAxis domain={[0, 100]} hide />
              <RCTooltip content={<ChartTip series={series} />} />
              <Legend wrapperStyle={{
            fontSize: 11,
            paddingTop: 10
          }} iconType="circle" iconSize={7} formatter={value => {
            const sm = series.find(x => x.code === value);
            const kpi = getKpi(value);
            const cur = kpi?.value != null ? ` (${Number(kpi.value).toFixed(1)}${sm?.unit || ''})` : '';
            return sm ? `${sm.name}${cur}` : value;
          }} />
              {/* Threshold reference lines */}
              {refLines.map((rl, i) => <ReferenceLine key={i} y={rl.y} stroke={rl.color} strokeDasharray={rl.dash} strokeWidth={1.2} label={{
            value: rl.label,
            fill: rl.color,
            fontSize: 9,
            position: 'insideTopRight'
          }} />)}
              {/* Series lines */}
              {series.map(sm => <Line key={sm.code} type="monotone" dataKey={sm.code} name={sm.code} stroke={sm.color} strokeWidth={2} dot={false} activeDot={{
            r: 4,
            strokeWidth: 0
          }} connectNulls />)}
            </LineChart>
          </ResponsiveContainer> : <div style={{
        height: 224,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-secondary)',
        fontSize: 13
      }}>
            <Activity size={28} style={{
          opacity: 0.3,
          marginBottom: 8
        }} />
            {t('ui.暂无采集记录', '暂无采集记录')}
            <div style={{
          fontSize: 11,
          marginTop: 4,
          opacity: 0.6
        }}>
              {t('ui.完成设备映射并运行采集任务后将显示趋势', '完成设备映射并运行采集任务后将自动显示趋势')}
            </div>
          </div>}
      </div>

      {/* ── System status strip ──────────────────────────────────── */}
      <div style={{
      fontSize: 13,
      fontWeight: 700,
      color: 'var(--text-primary)',
      marginBottom: 10
    }}>
        🛠 {t('ui.系统运行状态', '系统运行状态')}
      </div>
      <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit,minmax(156px,1fr))',
      gap: 10,
      marginBottom: 24
    }}>
        {loading ? [1, 2, 3, 4, 5].map(i => <div key={i} className={s.shimmer} style={{
        height: 88,
        borderRadius: 'var(--radius-md)'
      }} />) : systems.length > 0 ? systems.map(sys => {
        const cfg = SYS_CFG[sys.code ?? sys.systemCode ?? ''] || {
          name: sys.name || sys.code || '',
          icon: '⚙️'
        };
        const color = SC[sys.status || 'no_data'] || 'var(--text-disabled)';
        const rate = sys.onlineRate != null ? Math.round(sys.onlineRate * 100) : null;
        return <div key={sys.code ?? sys.systemCode ?? ''} style={{
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 14px',
          border: `1px solid color-mix(in srgb,${color} 22%,var(--border))`,
          borderLeft: `3px solid ${color}`
        }}>
              <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 6
          }}>
                <span style={{
              fontSize: 12,
              fontWeight: 700
            }}>{cfg.icon} {cfg.name}</span>
                <span style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: 8,
              background: `color-mix(in srgb,${color} 12%,transparent)`,
              color
            }}>
                  {SL[sys.status || 'no_data'] || sys.status}
                </span>
              </div>
              {rate != null && <div style={{
            height: 3,
            background: 'var(--bg-muted)',
            borderRadius: 2,
            marginBottom: 7
          }}>
                  <div style={{
              height: 3,
              width: `${rate}%`,
              background: color,
              borderRadius: 2,
              transition: 'width .4s'
            }} />
                </div>}
              <div style={{
            fontSize: 10,
            color: 'var(--text-secondary)',
            display: 'flex',
            justifyContent: 'space-between'
          }}>
                <span>{t('ui.传感器', '传感器')} {sys.sensorCount || 0}{t('ui.个', '个')}</span>
                {(sys.alarmCount ?? 0) > 0 && <span style={{
              color: 'var(--status-danger)',
              fontWeight: 700
            }}>⚠ {sys.alarmCount ?? 0}</span>}
              </div>
            </div>;
      }) : <div style={{
        gridColumn: '1/-1',
        padding: 24,
        textAlign: 'center',
        fontSize: 13,
        color: 'var(--text-secondary)',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)'
      }}>
            <Wind size={24} style={{
          opacity: 0.3,
          marginBottom: 6
        }} /><br />
            {t('common.noData', '暂无系统数据')}
          </div>}
      </div>

      {/* ── Sensor table (collapsible) ──────────────────────────── */}
      {kpis.length > 0 && <>
          <button type="button" onClick={() => setSensorOpen(p => !p)} style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        width: '100%',
        padding: '10px 16px',
        marginBottom: sensorOpen ? 0 : 16,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: sensorOpen ? 'var(--radius-lg) var(--radius-lg) 0 0' : 'var(--radius-lg)',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 700,
        color: 'var(--text-primary)',
        textAlign: 'left'
      }}>
            {sensorOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            📊 {t('ui.传感器读数一览', '传感器读数一览')}
            <span style={{
          fontWeight: 400,
          fontSize: 11,
          color: 'var(--text-secondary)',
          marginLeft: 4
        }}>
              {kpis.length} {t('ui.个', '个')}
            </span>
          </button>
          {sensorOpen && <div className={s.card} style={{
        marginBottom: 24,
        overflow: 'hidden',
        borderRadius: '0 0 var(--radius-lg) var(--radius-lg)'
      }}>
              <table className={s.table}>
                <thead>
                  <tr>{[t('ui.传感器名称', '传感器名称'), t('ui.当前值', '当前值'), t('ui.单位', '单位'), t('common.status', '状态'), t('ui.数据新鲜度', '数据新鲜度')].map(h => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {kpis.map(k => {
              const color = SC[k.status || 'no_data'] || 'var(--text-disabled)';
              return <tr key={k.code}>
                        <td className={u.fw600}>{k.title || k.code}</td>
                        <td style={{
                  fontWeight: 700,
                  fontSize: 15,
                  color
                }}>
                          {k.value != null ? Number(k.value).toFixed(1) : '—'}
                        </td>
                        <td className={u.muted}>{k.unit || '—'}</td>
                        <td>
                          <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 10,
                    background: `color-mix(in srgb,${color} 12%,transparent)`,
                    color
                  }}>
                            {SL[k.status || 'no_data'] || k.status}
                          </span>
                        </td>
                        <td style={{
                  fontSize: 11,
                  color: 'var(--text-secondary)'
                }}>
                          {overview?.dataFreshness === 'normal' ? `✅ ${t('ui.实时', '实时')}` : overview?.dataFreshness === 'delayed' ? `⚠️ ${t('ui.延迟', '延迟')}` : `❌ ${t('ui.陈旧', '陈旧')}`}
                        </td>
                      </tr>;
            })}
                </tbody>
              </table>
            </div>}
        </>}

      {/* ── Empty state ──────────────────────────────────────────── */}
      {!loading && !overview && <div style={{
      padding: 60,
      textAlign: 'center',
      color: 'var(--text-secondary)',
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)'
    }}>
          <Activity size={36} style={{
        marginBottom: 12,
        opacity: 0.3
      }} />
          <div style={{
        fontWeight: 700,
        marginBottom: 6
      }}>
            {t('ui.鸡舍', '鸡舍')} {houseCode} {t('common.noData', '暂无设备数据')}
          </div>
          <div className={u.fs13}>
            {t('ui.该鸡舍可能未完成设备映射请前往运维管理配置', '该鸡舍可能未完成设备映射，请前往「运维管理」配置')}
          </div>
        </div>}
    </div>;
}