'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Sun, Moon, RefreshCw, Thermometer, Droplets, Wind, AlertTriangle, Activity, MonitorOff, Clipboard } from 'lucide-react';
import { useMobileTheme } from '@/contexts/MobileThemeContext';
import { useMobilePermission } from '@/hooks/useMobilePermission';
import { useLanguage } from '@/contexts/LanguageContext';
import { getMobileToken } from '@/lib/mobile-auth-token';

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
  diagnosticCode?: string;
  diagnosticReason?: string;
}
interface IotDiagnostic {
  code: string;
  reason: string;
  summary?: {
    totalHouses?: number;
    mappedActive?: number;
    housesWithData?: number;
    totalSnapshots?: number;
    lastCollectAt?: number | null;
  };
  vendor?: {
    ok?: boolean;
    base?: string;
    appId?: string;
    error?: string | null;
  };
  queryErrors?: string[];
}
interface EndpointStatus {
  status?: number;
  ok?: boolean;
  elapsedMs?: number;
  error?: string;
  checkedAt?: number;
}

const API = '/api/v3/iot/devices/all-summary';
const DIAG_API = '/api/v3/iot/devices/sync-health';
const REQUEST_TIMEOUT_MS = 10_000;

// 数据新鲜度 → 文案/颜色
type TFn = (key: string, fallback: string) => string;
const buildFresh = (tr: TFn): Record<string, { label: string; color: string }> => ({
  normal:  { label: tr('mob.sys.fresh_normal', '实时'), color: 'var(--status-success)' },
  delayed: { label: tr('mob.sys.fresh_delayed', '延迟'), color: 'var(--status-warning)' },
  stale:   { label: tr('mob.sys.fresh_stale', '陈旧'), color: 'var(--status-danger)' },
  no_data: { label: tr('mob.sys.fresh_no_data', '无数据'), color: 'var(--text-disabled)' },
});

function fmt(v: number | null | undefined, digits = 1): string {
  if (v == null || isNaN(Number(v))) return '—';
  return Number(v).toFixed(digits);
}
function ago(ts: string | number | undefined, tr: TFn): string {
  if (ts == null) return '';
  const ms = Number(ts) > 1e12 ? Number(ts) : new Date(ts).getTime();
  if (isNaN(ms)) return '';
  const diff = Date.now() - ms;
  if (diff < 60_000) return tr('mob.sys.just_now', '刚刚');
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} ${tr('mob.sys.minutes_ago', '分钟前')}`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ${tr('mob.sys.hours_ago', '小时前')}`;
  return `${Math.floor(diff / 86_400_000)} ${tr('mob.sys.days_ago', '天前')}`;
}

async function fetchTextWithTimeout(url: string, headers: HeadersInit, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    const raw = await res.text();
    return { res, raw, elapsedMs: Date.now() - startedAt };
  } finally {
    window.clearTimeout(timer);
  }
}

export default function DeviceMonitorMobilePage() {
  const router = useRouter();
  const { isDark, toggle, t } = useMobileTheme();
  const { t: tr } = useLanguage();
  const FRESH = buildFresh(tr);
  // 设备监控只读：场长/兽医/饲养员/养殖技术员/场区经理/管理层可看；无权限自动跳回首页
  const { allowed, loading: permLoading } = useMobilePermission('device');

  const [summary, setSummary] = useState<IotSummary>({});
  const [houses, setHouses] = useState<IotHouse[]>([]);
  const [alarms, setAlarms] = useState<IotAlarm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [diag, setDiag] = useState<IotDiagnostic | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [apiStatus, setApiStatus] = useState<EndpointStatus | null>(null);
  const [diagStatus, setDiagStatus] = useState<EndpointStatus | null>(null);
  const [copiedDiag, setCopiedDiag] = useState(false);

  // 自诊断：为什么没有数据（调后端 sync-health，定位链路断点）。
  // 始终给出确定结论：成功→中文原因；异常→带 HTTP 状态/错误，便于定位（不再出现"点了没反应"）。
  const runDiag = useCallback(async () => {
    setDiagLoading(true); setDiag(null); setCopiedDiag(false);
    const fail = (msg: string, status?: EndpointStatus) => {
      setDiagStatus(status ?? { ok: false, error: msg, checkedAt: Date.now() });
      setDiag({ code: 'ERR', reason: `${tr('mob.sys.diag_failed', '诊断失败')}：${msg}` });
    };
    try {
      const token = getMobileToken();
      if (!token) {
        fail(tr('mob.sys.diag_no_token', '登录态缺失或已过期，请重新登录后再查看设备数据。'));
        return;
      }
      const { res, raw, elapsedMs } = await fetchTextWithTimeout(DIAG_API, { Authorization: `Bearer ${token}` });
      setDiagStatus({ status: res.status, ok: res.ok, elapsedMs, checkedAt: Date.now() });
      let json: any = null;
      try { json = raw ? JSON.parse(raw) : null; } catch { /* 非 JSON */ }
      if (json?.ok && json?.data?.reason) {
        setDiag({
          code: String(json.data.code ?? ''),
          reason: String(json.data.reason),
          summary: json.data.summary,
          vendor: json.data.vendor,
          queryErrors: Array.isArray(json.data.queryErrors) ? json.data.queryErrors : undefined,
        });
      } else if (json?.error) {
        fail(`${String(json.error).slice(0, 140)}`, { status: res.status, ok: res.ok, elapsedMs, checkedAt: Date.now() });
      } else {
        fail(`HTTP ${res.status}${raw ? ' · ' + raw.slice(0, 100) : ''}`, { status: res.status, ok: res.ok, elapsedMs, checkedAt: Date.now() });
      }
    } catch (e: any) {
      const msg = e?.name === 'AbortError'
        ? tr('mob.sys.diag_timeout', '诊断接口超过 10 秒未返回，请检查服务或网关链路。')
        : (e?.message || 'network');
      fail(msg, { ok: false, error: msg, checkedAt: Date.now() });
    } finally { setDiagLoading(false); }
  }, [tr]);

  const noLiveData = !loading && allowed && !permLoading && (
    Boolean(error)
    || houses.length === 0
    || (summary.onlineSensorCnt ?? 0) === 0
    || (summary.totalSensorCnt ?? 0) === 0
    || (summary.diagnosticCode && summary.diagnosticCode !== 'OK')
  );

  // 无实时数据 / 错误态时自动跑一次诊断（用户无需手动点；可再点按钮重试）
  useEffect(() => {
    if (noLiveData && !diag && !diagLoading) {
      void runDiag();
    }
  }, [noLiveData, diag, diagLoading, runDiag]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setCopiedDiag(false);
    try {
      const token = getMobileToken();
      if (!token) {
        setApiStatus({ ok: false, error: 'NO_TOKEN', checkedAt: Date.now() });
        setError(tr('mob.sys.diag_no_token', '登录态缺失或已过期，请重新登录后再查看设备数据。'));
        return;
      }
      const { res, raw, elapsedMs } = await fetchTextWithTimeout(API, { Authorization: `Bearer ${token}` });
      setApiStatus({ status: res.status, ok: res.ok, elapsedMs, checkedAt: Date.now() });
      if (!res.ok) { setError(res.status === 403 ? tr('mob.sys.no_device_perm', '无设备监控权限') : `${tr('mob.sys.load_failed', '加载失败')}（${res.status}）`); return; }
      let json: any = null;
      try { json = raw ? JSON.parse(raw) : null; } catch { /* 非 JSON */ }
      if (!json?.ok || !json?.data) { setError(json?.error || tr('mob.sys.no_device_data', '暂无设备数据')); return; }
      setSummary(json.data.summary ?? {});
      setHouses(Array.isArray(json.data.houses) ? json.data.houses : []);
      setAlarms(Array.isArray(json.data.recentAlarms) ? json.data.recentAlarms : []);
      if (json.data._diagnostic?.reason) {
        setDiag({
          code: String(json.data._diagnostic.code ?? ''),
          reason: String(json.data._diagnostic.reason),
          summary: json.data._diagnostic.summary,
          queryErrors: Array.isArray(json.data._diagnostic.queryErrors) ? json.data._diagnostic.queryErrors : undefined,
        });
      }
    } catch (e: any) {
      const msg = e?.name === 'AbortError'
        ? tr('mob.sys.load_timeout', '设备数据接口超过 10 秒未返回，请稍后重试或联系管理员。')
        : tr('mob.sys.network_error', '网络错误，请重试');
      setApiStatus({ ok: false, error: e?.message || 'network', checkedAt: Date.now() });
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [tr]);
  useEffect(() => { if (allowed) void load(); }, [allowed, load]);

  const kpi = (label: string, value: string, tone?: string): React.ReactNode => (
    <div style={{ flex: 1, padding: '12px 10px', borderRadius: 12, background: t.sectionBg, border: `1px solid ${t.cardBorder}`, textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: tone ?? t.text, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4 }}>{label}</div>
    </div>
  );

  const statusLine = (label: string, status: EndpointStatus | null) => {
    const ok = status?.ok;
    const color = ok === true ? 'var(--status-success)' : ok === false ? 'var(--status-danger)' : t.textFaint;
    const text = status
      ? `${status.status ? `HTTP ${status.status}` : status.error ? status.error : '—'}${status.elapsedMs != null ? ` · ${status.elapsedMs}ms` : ''}`
      : tr('mob.sys.not_checked', '未检测');
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11, color: t.textMuted }}>
        <span>{label}</span>
        <span style={{ color, fontWeight: 700, textAlign: 'right' }}>{text}</span>
      </div>
    );
  };

  const diagnosticSnapshot = () => JSON.stringify({
    page: '/mobile/device',
    allSummary: apiStatus,
    syncHealth: diagStatus,
    summary,
    houses: houses.length,
    alarms: alarms.length,
    error,
    diagnostic: diag,
    checkedAt: new Date().toISOString(),
  }, null, 2);

  const diagnosticPanel = ({ title }: { title?: string }) => (
    <div style={{ padding: 12, borderRadius: 14, background: 'color-mix(in srgb, var(--status-warning) 8%, transparent)', border: `1px solid color-mix(in srgb, var(--status-warning) 30%, transparent)`, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--status-warning)' }}>
        ⚠️ {title ?? tr('mob.sys.no_live_data', '当前无实时数据')}
      </div>
      {diag ? (
        <>
          <div style={{ fontSize: 12, color: t.textSub, lineHeight: 1.5 }}>
            {diag.code ? `[${diag.code}] ` : ''}{diag.reason}
          </div>
          <div style={{ padding: 8, borderRadius: 10, background: t.cardBg, border: `1px solid ${t.cardBorder}`, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {statusLine('all-summary', apiStatus)}
            {statusLine('sync-health', diagStatus)}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11, color: t.textMuted }}>
              <span>{tr('mob.sys.sensor_count', '传感器')}</span>
              <span style={{ fontWeight: 700, color: t.textSub }}>{summary.onlineSensorCnt ?? 0}/{summary.totalSensorCnt ?? 0}</span>
            </div>
          </div>
          {diag.summary && (
            <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.6 }}>
              {tr('mob.sys.diag_summary', '诊断摘要')}：
              {tr('mob.sys.diag_houses', '鸡舍')} {diag.summary.totalHouses ?? 0}，
              {tr('mob.sys.diag_mapped', '已绑定')} {diag.summary.mappedActive ?? 0}，
              {tr('mob.sys.diag_snapshots', '快照')} {diag.summary.totalSnapshots ?? 0}
              {diag.summary.lastCollectAt ? `，${tr('mob.sys.last_collect', '最近采集')} ${ago(diag.summary.lastCollectAt, tr)}` : ''}
            </div>
          )}
          {diag.vendor && (
            <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.6 }}>
              {tr('mob.sys.diag_vendor', '网关')}：{diag.vendor.ok ? 'OK' : (diag.vendor.error || 'FAIL')}
            </div>
          )}
          {Array.isArray(diag.queryErrors) && diag.queryErrors.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--status-danger)', lineHeight: 1.6 }}>
              {tr('mob.sys.diag_query_error', '数据查询错误')}：{diag.queryErrors.slice(0, 2).join('；')}
            </div>
          )}
        </>
      ) : (
        <div style={{ fontSize: 12, color: t.textMuted }}>{tr('mob.sys.diag_hint', '数据来自现场 IoT 网关同步，点下方按钮可定位原因。')}</div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => void runDiag()} disabled={diagLoading} style={{ fontSize: 12, fontWeight: 600, color: 'var(--status-warning)', background: 'transparent', border: `1px solid color-mix(in srgb, var(--status-warning) 40%, transparent)`, borderRadius: 8, padding: '6px 12px', cursor: diagLoading ? 'default' : 'pointer' }}>
          {diagLoading ? tr('mob.sys.diagnosing', '诊断中…') : tr('mob.sys.diagnose_why', '诊断：为什么没有数据？')}
        </button>
        <button
          onClick={() => {
            void navigator.clipboard?.writeText(diagnosticSnapshot()).then(() => setCopiedDiag(true)).catch(() => setCopiedDiag(false));
          }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: t.textSub, background: 'transparent', border: `1px solid ${t.cardBorder}`, borderRadius: 8, padding: '6px 12px' }}
        >
          <Clipboard size={13} /> {copiedDiag ? tr('mob.sys.copied', '已复制') : tr('mob.sys.copy_diag', '复制诊断')}
        </button>
      </div>
    </div>
  );

  if (permLoading) {
    return <div style={{ minHeight: '100svh', background: t.pageBg }} />;
  }

  if (!allowed) {
    return (
      <div style={{ minHeight: '100svh', background: t.pageBg, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 420, padding: 18, borderRadius: 16, background: t.sectionBg, border: `1px solid ${t.cardBorder}`, color: t.text }}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>{tr('mob.sys.no_device_perm', '无设备监控权限')}</div>
          <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6 }}>{tr('mob.sys.no_device_perm_hint', '当前账号未获得设备监控菜单权限，请联系管理员开通 MENU_DEVICE_MONITOR 查看权限。')}</div>
          <button onClick={() => router.replace('/mobile/home')} style={{ marginTop: 14, border: `1px solid ${t.cardBorder}`, borderRadius: 10, padding: '8px 12px', background: t.cardBg, color: t.text, fontWeight: 700 }}>
            {tr('mob.sys.back_home', '返回首页')}
          </button>
        </div>
      </div>
    );
  }

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
        <span style={{ fontSize: 15, fontWeight: 700, color: t.text, flex: 1 }}>📡 {tr('mob.sys.device_monitor', '设备监控')}</span>
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
          {kpi(tr('mob.sys.online_houses', '在线鸡舍'), `${summary.activeHouses ?? 0}/${summary.totalHouses ?? 0}`)}
          {kpi(tr('mob.sys.unhandled_alarms', '未处理告警'), String(summary.totalAlarms ?? 0), (summary.totalAlarms ?? 0) > 0 ? 'var(--status-danger)' : undefined)}
          {kpi(tr('mob.sys.online_sensors', '在线传感器'), `${summary.onlineSensorCnt ?? 0}/${summary.totalSensorCnt ?? 0}`)}
        </div>

        {/* 无数据自诊断：实时传感器为 0 时给出"为什么没有数据"的明确原因 */}
        {noLiveData && diagnosticPanel({ title: error ? tr('mob.sys.device_data_unavailable', '设备数据不可用') : undefined })}

        {/* 最近告警 */}
        {alarms.length > 0 && (
          <div style={{ padding: 12, borderRadius: 14, background: 'color-mix(in srgb, var(--status-danger) 8%, transparent)', border: `1px solid color-mix(in srgb, var(--status-danger) 30%, transparent)`, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--status-danger)' }}>
              <AlertTriangle size={15} /> {tr('mob.sys.pending_alarms', '待处理告警')}（{alarms.length}）
            </div>
            {alarms.map((a, i) => (
              <div key={a.id ?? i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: t.textSub }}>{a.erp_house_code} · {a.name_zh ?? tr('mob.sys.alarm', '告警')}</span>
                <span style={{ color: t.text, fontWeight: 600 }}>
                  {fmt(a.current_val)}{a.unit ?? ''} <span style={{ color: t.textFaint, fontWeight: 400 }}>{ago(a.triggered_at, tr)}</span>
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 鸡舍列表 */}
        <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>{tr('mob.sys.house_realtime_env', '鸡舍实时环境')}（{houses.length}）</div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 32, fontSize: 13, color: t.textMuted }}>{tr('mob.sys.loading', '加载中…')}</div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: 40, fontSize: 13, color: 'var(--status-danger)' }}>
            <MonitorOff size={32} style={{ opacity: 0.5 }} /><div style={{ marginTop: 8 }}>{error}</div>
            <button onClick={() => void runDiag()} disabled={diagLoading} style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: 'var(--status-danger)', background: 'transparent', border: `1px solid color-mix(in srgb, var(--status-danger) 35%, transparent)`, borderRadius: 8, padding: '6px 12px' }}>
              {diagLoading ? tr('mob.sys.diagnosing', '诊断中…') : tr('mob.sys.diagnose_why', '诊断：为什么没有数据？')}
            </button>
          </div>
        ) : houses.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, fontSize: 13, color: t.textFaint }}>
            <MonitorOff size={32} style={{ opacity: 0.4 }} /><div style={{ marginTop: 8 }}>{tr('mob.sys.no_connected_houses', '暂无已接入设备的鸡舍')}</div>
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
                  {metric(Thermometer, tr('mob.sys.temp_label', '温度℃'), fmt(h.avgTemp), 'var(--status-warning)')}
                  {metric(Droplets, tr('mob.sys.humidity_label', '湿度%'), fmt(h.avgHumidity), 'var(--status-info)')}
                  {metric(Wind, 'CO₂', fmt(h.co2, 0), 'var(--text-secondary)')}
                  {metric(Wind, tr('mob.sys.ammonia_label', '氨气'), fmt(h.ammonia, 0), 'var(--status-success)')}
                  {metric(Activity, tr('mob.sys.online_label', '在线%'), h.onlineRate != null ? String(Math.round(h.onlineRate * 100)) : '—', 'var(--status-success)')}
                </div>
              </div>
            );
          })
        )}

        <div style={{ fontSize: 11, color: t.textFaint, textAlign: 'center', marginTop: 4 }}>
          {tr('mob.sys.device_readonly_note', '设备监控为只读视图 · 数据源自现场 IoT 网关')}
        </div>
      </div>
    </div>
  );
}
