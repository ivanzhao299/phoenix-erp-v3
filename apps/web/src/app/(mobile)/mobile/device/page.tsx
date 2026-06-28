'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Sun, Moon, RefreshCw, Thermometer, Droplets, Wind, AlertTriangle, Activity, MonitorOff } from 'lucide-react';
import { useMobileTheme } from '@/contexts/MobileThemeContext';
import { useMobilePermission } from '@/hooks/useMobilePermission';

// ── 设备监控总览数据结构（对齐 /api/v3/iot/devices/all-summary） ──────────────
interface IotHouse {
  houseCode: string;
  houseName: string;
  hasData?: boolean;
  dataFreshness?: string;      // normal | delayed | stale | no_data
  alarmCount?: number;
  onlineRate?: number;         // 0~1
  avgTemp?: number | null;
  avgHumidity?: number | null;
  co2?: number | null;
  ammonia?: number | null;
}
interface IotAlarm {
  id?: number | string;
  erp_house_code?: string;
  name_zh?: string;
  current_val?: number | null;
  unit?: string;
  triggered_at?: string | number;
}
interface IotSummary {
  totalHouses?: number;
  activeHouses?: number;
  totalAlarms?: number;
  alarmHouses?: number;
  onlineSensorCnt?: number;
  totalSensorCnt?: number;
}

const API = '/api/v3/iot/devices/all-summary';
// 与 mobile-api.ts 一致的取 token 链：sessionStorage → localStorage → auth_user.token
const tok = () => {
  if (typeof window === 'undefined') return '';
  try {
    return sessionStorage.getItem('phoenix_token')
      || localStorage.getItem('phoenix_token')
      || JSON.parse(localStorage.getItem('auth_user') || '{}').token
      || '';
  } catch { return ''; }
};

// 数据新鲜度 → 文案/颜色
const FRESH: Record<string, { label: string; color: string }> = {
  normal:  { label: '实时', color: 'var(--status-success)' },
  delayed: { label: '延迟', color: 'var(--status-warning)' },
  stale:   { label: '陈旧', color: 'var(--status-danger)' },
  no_data: { label: '无数据', color: 'var(--text-disabled)' },
};

function fmt(v: number | null | undefined, digits = 1): string {
  if (v == null || isNaN(Number(v))) return '—';
  return Number(v).toFixed(digits);
}
function ago(ts?: string | number): string {
  if (ts == null) return '';
  const ms = Number(ts) > 1e12 ? Number(ts) : new Date(ts).getTime();
  if (isNaN(ms)) return '';
  const diff = Date.now() - ms;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

export default function DeviceMonitorMobilePage() {
  const router = useRouter();
  const { isDark, toggle, t } = useMobileTheme();
  // 设备监控只读：场长/兽医/饲养员/养殖技术员/场区经理/管理层可看；无权限自动跳回首页
  const { allowed, loading: permLoading } = useMobilePermission('device');

  const [summary, setSummary] = useState<IotSummary>({});
  const [houses, setHouses] = useState<IotHouse[]>([]);
  const [alarms, setAlarms] = useState<IotAlarm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(API, { headers: { Authorization: `Bearer ${tok()}` } });
      if (!res.ok) { setError(res.status === 403 ? '无设备监控权限' : `加载失败（${res.status}）`); return; }
      const json = await res.json();
      if (!json?.ok || !json?.data) { setError(json?.error || '暂无设备数据'); return; }
      setSummary(json.data.summary ?? {});
      setHouses(Array.isArray(json.data.houses) ? json.data.houses : []);
      setAlarms(Array.isArray(json.data.recentAlarms) ? json.data.recentAlarms : []);
    } catch {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { if (allowed) void load(); }, [allowed, load]);

  if (permLoading || !allowed) {
    return <div style={{ minHeight: '100svh', background: t.pageBg }} />;
  }

  const kpi = (label: string, value: string, tone?: string): React.ReactNode => (
    <div style={{ flex: 1, padding: '12px 10px', borderRadius: 12, background: t.sectionBg, border: `1px solid ${t.cardBorder}`, textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: tone ?? t.text, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4 }}>{label}</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100svh', background: t.pageBg, display: 'flex', flexDirection: 'column' }}>
      {/* AppBar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: 'calc(env(safe-area-inset-top) + 12px) 16px 12px',
        background: t.appBarBg, backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${t.barBorder}`, position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: t.textSub, cursor: 'pointer', padding: 4 }}>
          <ChevronLeft size={22} />
        </button>
        <span style={{ fontSize: 15, fontWeight: 700, color: t.text, flex: 1 }}>📡 设备监控</span>
        <button onClick={() => void load()} disabled={loading} style={{ background: 'none', border: 'none', color: t.textMuted, cursor: loading ? 'default' : 'pointer', padding: 4 }}>
          <RefreshCw size={18} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
        <button onClick={toggle} style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', padding: 4 }}>
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      <div style={{ flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* 汇总 KPI */}
        <div style={{ display: 'flex', gap: 8 }}>
          {kpi('在线鸡舍', `${summary.activeHouses ?? 0}/${summary.totalHouses ?? 0}`)}
          {kpi('未处理告警', String(summary.totalAlarms ?? 0), (summary.totalAlarms ?? 0) > 0 ? 'var(--status-danger)' : undefined)}
          {kpi('在线传感器', `${summary.onlineSensorCnt ?? 0}/${summary.totalSensorCnt ?? 0}`)}
        </div>

        {/* 最近告警 */}
        {alarms.length > 0 && (
          <div style={{ padding: 12, borderRadius: 14, background: 'color-mix(in srgb, var(--status-danger) 8%, transparent)', border: `1px solid color-mix(in srgb, var(--status-danger) 30%, transparent)`, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--status-danger)' }}>
              <AlertTriangle size={15} /> 待处理告警（{alarms.length}）
            </div>
            {alarms.map((a, i) => (
              <div key={a.id ?? i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: t.textSub }}>{a.erp_house_code} · {a.name_zh ?? '告警'}</span>
                <span style={{ color: t.text, fontWeight: 600 }}>
                  {fmt(a.current_val)}{a.unit ?? ''} <span style={{ color: t.textFaint, fontWeight: 400 }}>{ago(a.triggered_at)}</span>
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 鸡舍列表 */}
        <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>鸡舍实时环境（{houses.length}）</div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 32, fontSize: 13, color: t.textMuted }}>加载中…</div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: 40, fontSize: 13, color: 'var(--status-danger)' }}>
            <MonitorOff size={32} style={{ opacity: 0.5 }} /><div style={{ marginTop: 8 }}>{error}</div>
          </div>
        ) : houses.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, fontSize: 13, color: t.textFaint }}>
            <MonitorOff size={32} style={{ opacity: 0.4 }} /><div style={{ marginTop: 8 }}>暂无已接入设备的鸡舍</div>
          </div>
        ) : (
          houses.map(h => {
            const fresh = FRESH[h.dataFreshness ?? 'no_data'] ?? FRESH.no_data;
            const metric = (Icon: React.ElementType, label: string, val: string, color: string) => (
              <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
                <Icon size={15} color={color} style={{ marginBottom: 2 }} />
                <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{val}</div>
                <div style={{ fontSize: 10, color: t.textFaint }}>{label}</div>
              </div>
            );
            return (
              <div key={h.houseCode} style={{ padding: 14, borderRadius: 14, background: t.sectionBg, border: `1px solid ${(h.alarmCount ?? 0) > 0 ? 'color-mix(in srgb, var(--status-danger) 40%, transparent)' : t.cardBorder}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{h.houseName || h.houseCode}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {(h.alarmCount ?? 0) > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--status-danger)', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <AlertTriangle size={12} /> {h.alarmCount}
                      </span>
                    )}
                    <span style={{ fontSize: 10, fontWeight: 600, color: fresh.color, padding: '2px 8px', borderRadius: 999, background: `color-mix(in srgb, ${fresh.color} 14%, transparent)` }}>{fresh.label}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {metric(Thermometer, '温度℃', fmt(h.avgTemp), 'var(--status-warning)')}
                  {metric(Droplets, '湿度%', fmt(h.avgHumidity), 'var(--status-info)')}
                  {metric(Wind, 'CO₂', fmt(h.co2, 0), 'var(--text-secondary)')}
                  {metric(Wind, '氨气', fmt(h.ammonia, 0), 'var(--status-success)')}
                  {metric(Activity, '在线%', h.onlineRate != null ? String(Math.round(h.onlineRate * 100)) : '—', 'var(--status-success)')}
                </div>
              </div>
            );
          })
        )}

        <div style={{ fontSize: 11, color: t.textFaint, textAlign: 'center', marginTop: 4 }}>
          设备监控为只读视图 · 数据源自现场 IoT 网关
        </div>
      </div>
    </div>
  );
}
