'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import u from "@/styles/uix-utils.module.css";
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import { RefreshCw, WifiOff, AlertTriangle, ChevronRight, Clock, Activity, Home, Wifi, Clipboard } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import { useLanguage } from '@/contexts/LanguageContext';
import s from '@/components/ui/admin-ui.module.css';
import {
  primaryActionButton,
  kpiCardCompact, kpiCardCompactLabel, kpiCardCompactValue,
} from '@/components/design-system/cockpit-styles';

type Tone = "default" | "success" | "warning" | "danger" | "info" | "brand";
interface IotSystem {
  code: string;
  name: string;
  icon: string;
  status: string;
  alarmCount: number;
}
interface IotHouse {
  houseCode: string;
  houseName: string;
  flockNo?: string;
  status: string;
  alarmCount: number;
  dataFreshness: string;
  lastUpdated?: string;
  systems?: IotSystem[];
  hasData?: boolean;
  avgTemp?: number | null;
  avgHumidity?: number | null;
  co2?: number | null;
  ammonia?: number | null;
  feedToday?: number | null;
  waterToday?: number | null;
  onlineRate?: number;
}
interface IotAlarm {
  id?: number | string;
  alarmName?: string;
  propertyName?: string;
  severity?: string;
  houseCode?: string;
  houseName?: string;
  createdAt?: string;
  erp_house_code?: string;
  name_zh?: string;
  current_val?: number | null;
  unit?: string;
  triggered_at?: string | number;
}
interface IotSummary {
  summary: Record<string, number | string | null | undefined>;
  houses: IotHouse[];
  recentAlarms: IotAlarm[];
  _diagnostic?: IotDiagnostic;
}
interface IotDiagnostic {
  code?: string;
  reason?: string;
  summary?: {
    totalHouses?: number;
    mappedActive?: number;
    housesWithData?: number;
    totalSnapshots?: number;
    lastCollectAt?: number | string | null;
  };
  vendor?: { ok?: boolean; error?: string };
  queryErrors?: string[];
}
interface EndpointStatus {
  status?: number;
  ok: boolean;
  elapsedMs?: number;
  error?: string;
  checkedAt: number;
}
const API = '/api/v3/iot/devices';
const tok = () => typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_token') || '' : '';
const hdr = () => ({
  Authorization: `Bearer ${tok()}`
});
async function fetchTextWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const raw = await res.text();
    return { res, raw, elapsedMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}
function normalizeSummary(raw: any): IotSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const summary = raw.summary && typeof raw.summary === 'object' ? raw.summary : {};
  return {
    summary,
    houses: Array.isArray(raw.houses) ? raw.houses : [],
    recentAlarms: Array.isArray(raw.recentAlarms) ? raw.recentAlarms : [],
    _diagnostic: raw._diagnostic && typeof raw._diagnostic === 'object' ? raw._diagnostic : undefined,
  };
}
function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// ── 系统状态点配置 ──────────────────────────────────────────────────────
const STATUS_DOT: Record<string, {
  bg: string;
  border: string;
  dot: string;
}> = {
  normal: {
    bg: 'color-mix(in srgb, var(--status-success) 14%, transparent)',
    border: 'var(--status-success)',
    dot: 'var(--status-success)'
  },
  standby: {
    bg: 'var(--text-primary)',
    border: 'var(--text-primary)',
    dot: 'var(--text-disabled)'
  },
  warning: {
    bg: 'color-mix(in srgb, var(--status-warning) 16%, transparent)',
    border: 'var(--status-warning)',
    dot: 'var(--status-warning)'
  },
  critical: {
    bg: 'color-mix(in srgb, var(--status-danger) 14%, transparent)',
    border: 'var(--status-danger)',
    dot: 'var(--status-danger)'
  },
  no_data: {
    bg: 'var(--text-primary)',
    border: 'var(--text-primary)',
    dot: 'var(--text-disabled)'
  }
};

// ── 数据新鲜度配置 ──────────────────────────────────────────────────────
const FRESH: Record<string, {
  color: string;
  bg: string;
}> = {
  normal: {
    color: 'var(--status-success)',
    bg: 'color-mix(in srgb,var(--status-success) 15%,transparent)'
  },
  delayed: {
    color: 'var(--status-warning)',
    bg: 'color-mix(in srgb,var(--status-warning) 15%,transparent)'
  },
  stale: {
    color: 'var(--status-danger)',
    bg: 'color-mix(in srgb,var(--status-danger)  15%,transparent)'
  },
  no_data: {
    color: 'var(--text-secondary)',
    bg: 'color-mix(in srgb,var(--text-secondary) 10%,transparent)'
  }
};

// ── 系统状态点子组件（颜色由传感器状态决定，保留 inline）───────────────
function SystemDot({
  sys,
  statusLabel
}: {
  sys: IotSystem;
  statusLabel: string;
}) {
  const c = STATUS_DOT[sys.status] || STATUS_DOT.no_data;
  const tip = sys.alarmCount > 0 ? `${sys.name}：${sys.alarmCount} 项告警` : `${sys.name}：${statusLabel}`;
  return <div title={tip} style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3
  }}>
      <div style={{
      width: 10,
      height: 10,
      borderRadius: '50%',
      backgroundColor: c.dot,
      boxShadow: sys.status === 'critical' ? `0 0 6px ${c.dot}` : 'none'
    }} />
      <div style={{
      fontSize: 8,
      color: 'var(--text-secondary)',
      whiteSpace: 'nowrap'
    }}>{sys.icon}</div>
    </div>;
}

// ── 鸡舍卡片（颜色由告警/数据鲜度决定，保留 inline）────────────────────
function HouseCard({
  house,
  onClick,
  freshLabel,
  noBatchLabel
}: {
  house: IotHouse;
  onClick: () => void;
  freshLabel: string;
  noBatchLabel: string;
}) {
  const { t } = useLanguage();
  const fr = FRESH[house.dataFreshness] || FRESH.no_data;
  const hasAlarm = house.alarmCount > 0;
  return <div onClick={onClick} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'none'} style={{
    backgroundColor: 'var(--bg-card)',
    border: `1.5px solid ${hasAlarm ? 'color-mix(in srgb,var(--status-danger) 50%,transparent)' : 'var(--border)'}`,
    borderRadius: 'var(--radius-md)',
    padding: '10px 12px',
    cursor: 'pointer',
    transition: 'all 0.15s',
    boxShadow: hasAlarm ? '0 0 0 2px color-mix(in srgb,var(--status-danger) 15%,transparent)' : 'none'
  }}>
      <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6
    }}>
        <div>
          <div style={{
          fontWeight: 800,
          fontSize: 14,
          lineHeight: 1.2
        }}>{house.houseName}</div>
          <div style={{
          fontSize: 10,
          color: 'var(--text-secondary)',
          marginTop: 1
        }}>
            {house.houseCode} · {house.flockNo ? `批次 ${house.flockNo}` : noBatchLabel}
          </div>
        </div>
        <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 4
      }}>
          <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5
        }}>
            <span style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '1px 6px',
            borderRadius: 10,
            backgroundColor: fr.bg,
            color: fr.color
          }}>● {freshLabel}</span>
            {hasAlarm && <span style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '1px 6px',
            borderRadius: 10,
            backgroundColor: 'color-mix(in srgb,var(--status-danger) 15%,transparent)',
            color: 'var(--status-danger)'
          }}>⚠ {house.alarmCount}</span>}
          </div>
          {house.hasData && <div style={{
          display: 'flex',
          gap: 8
        }}>
              {(house.systems || []).map(sys => <SystemDot key={sys.code} sys={sys} statusLabel={sys.status} />)}
            </div>}
        </div>
      </div>

      {house.hasData ? <>
          <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4,1fr)',
        gap: 4,
        marginBottom: 6
      }}>
            {[{
          label: '温度',
          value: house.avgTemp,
          unit: '℃',
          ok: house.avgTemp != null && house.avgTemp >= 16 && house.avgTemp <= 32
        }, {
          label: '湿度',
          value: house.avgHumidity,
          unit: '%',
          ok: house.avgHumidity != null && house.avgHumidity >= 40 && house.avgHumidity <= 85
        }, {
          label: 'CO₂',
          value: house.co2,
          unit: 'ppm',
          ok: house.co2 == null || house.co2 < 3000
        }, {
          label: '氨气',
          value: house.ammonia,
          unit: 'ppm',
          ok: house.ammonia == null || house.ammonia < 20
        }].map(m => <div key={m.label} style={{
          padding: '4px 6px',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: m.value != null && !m.ok ? 'color-mix(in srgb,var(--status-warning) 10%,var(--bg-card))' : 'var(--bg-page)',
          border: '1px solid var(--border)',
          textAlign: 'center'
        }}>
                <div style={{
            fontSize: 9,
            color: 'var(--text-secondary)',
            lineHeight: 1.2
          }}>{m.label}</div>
                <div style={{
            fontSize: 13,
            fontWeight: 700,
            lineHeight: 1.3,
            color: m.value != null && !m.ok ? 'var(--status-warning)' : 'var(--text-primary)'
          }}>
                  {m.value != null ? Number(m.value).toFixed(1) : '—'}
                  <span style={{
              fontSize: 8,
              fontWeight: 400,
              marginLeft: 1,
              color: 'var(--text-secondary)'
            }}>{m.unit}</span>
                </div>
              </div>)}
          </div>
          <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 10,
        color: 'var(--text-secondary)',
        borderTop: '1px solid var(--border)',
        paddingTop: 6
      }}>
            <div style={{
          display: 'flex',
          gap: 10
        }}>
              <span>{t('ui.耗料','耗料')} <strong style={{
              color: 'var(--text-primary)',
              fontSize: 11
            }}>{house.feedToday != null ? `${Number(house.feedToday).toFixed(0)}kg` : '—'}</strong></span>
              <span>{t('ui.饮水','饮水')} <strong style={{
              color: 'var(--text-primary)',
              fontSize: 11
            }}>{house.waterToday != null ? `${Number(house.waterToday).toFixed(1)}T` : '—'}</strong></span>
              <span>{t('ui.在线','在线')} <strong style={{
              fontSize: 11,
              color: (house.onlineRate ?? 0) > 0.8 ? 'var(--status-success)' : (house.onlineRate ?? 0) > 0.5 ? 'var(--status-warning)' : 'var(--status-danger)'
            }}>{Math.round((house.onlineRate ?? 0) * 100)}%</strong></span>
            </div>
            <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--color-primary)',
          display: 'flex',
          alignItems: 'center',
          gap: 2
        }}>{t('ui.进入总览','进入总览')} <ChevronRight size={11} /></span>
          </div>
        </> : <div style={{
      padding: 14,
      textAlign: 'center',
      color: 'var(--text-secondary)',
      fontSize: 11,
      backgroundColor: 'var(--bg-page)',
      borderRadius: 'var(--radius-sm)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6
    }}>
          <WifiOff size={13} /> {t('ui.暂无采集数据','暂无采集数据')}
        </div>}
    </div>;
}

// ── 主页面 ────────────────────────────────────────────────────────────────
export default function DeviceOverviewPage() {
  const router = useRouter();
  const toast = useToast();
  const {
    t
  } = useLanguage();
  const [data, setData] = useState<IotSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [diag, setDiag] = useState<IotDiagnostic | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [apiStatus, setApiStatus] = useState<EndpointStatus | null>(null);
  const [diagStatus, setDiagStatus] = useState<EndpointStatus | null>(null);
  const [copiedDiag, setCopiedDiag] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(() => typeof window !== 'undefined' && localStorage.getItem('phx_device_autoRefresh') === 'true');
  const [lastSync, setLastSync] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const STATUS_LABEL: Record<string, string> = {
    normal: t('status.normal', '正常'),
    standby: t('ui.待机', '待机'),
    warning: t('status.warning', '预警'),
    critical: t('ui.告警', '告警'),
    no_data: t('ui.无数据', '无数据')
  };
  const FRESH_LABEL: Record<string, string> = {
    normal: t('ui.实时', '实时'),
    delayed: t('ui.延迟', '延迟'),
    stale: t('ui.陈旧', '陈旧'),
    no_data: t('ui.无数据', '无数据')
  };
  const runDiag = useCallback(async () => {
    setDiagLoading(true);
    setCopiedDiag(false);
    const fail = (msg: string, status?: EndpointStatus) => {
      setDiagStatus(status ?? { ok: false, error: msg, checkedAt: Date.now() });
      setDiag({ code: 'ERR', reason: `诊断失败：${msg}` });
    };
    try {
      const token = tok();
      if (!token) {
        fail('登录态缺失或已过期，请重新登录后再查看设备数据。');
        return;
      }
      const { res, raw, elapsedMs } = await fetchTextWithTimeout(`${API}/sync-health`, { headers: hdr() });
      setDiagStatus({ status: res.status, ok: res.ok, elapsedMs, checkedAt: Date.now() });
      let json: any = null;
      try { json = raw ? JSON.parse(raw) : null; } catch { /* ignore non-json */ }
      if (json?.ok && json?.data?.reason) {
        setDiag({
          code: String(json.data.code ?? ''),
          reason: String(json.data.reason),
          summary: json.data.summary,
          vendor: json.data.vendor,
          queryErrors: Array.isArray(json.data.queryErrors) ? json.data.queryErrors : undefined,
        });
      } else {
        fail(json?.error || `HTTP ${res.status}${raw ? ` · ${raw.slice(0, 100)}` : ''}`, { status: res.status, ok: res.ok, elapsedMs, checkedAt: Date.now() });
      }
    } catch (e: any) {
      const msg = e?.name === 'AbortError' ? '诊断接口超过 10 秒未返回，请检查服务或现场网关链路。' : (e?.message || 'network');
      fail(msg, { ok: false, error: msg, checkedAt: Date.now() });
    } finally {
      setDiagLoading(false);
    }
  }, []);
  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    setCopiedDiag(false);
    try {
      const { res, raw, elapsedMs } = await fetchTextWithTimeout(`${API}/all-summary`, { headers: hdr() });
      setApiStatus({ status: res.status, ok: res.ok, elapsedMs, checkedAt: Date.now() });
      let json: any = null;
      try { json = raw ? JSON.parse(raw) : null; } catch { /* ignore non-json */ }
      if (!res.ok) {
        setError(`设备汇总接口加载失败（HTTP ${res.status}）`);
        return;
      }
      const normalized = normalizeSummary(json?.data);
      if (json?.ok && normalized) {
        setData(normalized);
        if (json.data._diagnostic?.reason) {
          setDiag({
            code: String(json.data._diagnostic.code ?? ''),
            reason: String(json.data._diagnostic.reason),
            summary: json.data._diagnostic.summary,
            queryErrors: Array.isArray(json.data._diagnostic.queryErrors) ? json.data._diagnostic.queryErrors : undefined,
          });
        }
      } else {
        setError(json?.error || '设备汇总接口返回异常');
      }
    } catch (e: any) {
      const msg = e?.name === 'AbortError' ? '设备汇总接口超过 10 秒未返回，请稍后重试。' : (e?.message || '网络错误');
      setApiStatus({ ok: false, error: msg, checkedAt: Date.now() });
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    loadData();
  }, [loadData]);
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('phx_device_autoRefresh', String(autoRefresh));
  }, [autoRefresh]);
  useEffect(() => {
    if (autoRefresh) timerRef.current = setInterval(() => loadData(), 120_000);else if (timerRef.current) clearInterval(timerRef.current);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefresh, loadData]);
  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${API}/sync/realtime`, {
        method: 'POST',
        headers: hdr()
      });
      const json = await res.json();
      setLastSync(new Date().toLocaleTimeString('zh-CN'));
      await loadData();
      if (json.ok && (json.records ?? 0) > 0) {
        toast.success(`${t('ui.采集完成：', '采集完成：')}${json.success} ${t('ui.栋成功，写入', '栋成功，写入')} ${json.records} ${t('ui.条实时数据', '条实时数据')}`);
      } else if (json.ok) {
        toast.warning(t('ui.采集完成，但未写入新数据，请检查第三方 API 连接状态', '采集完成，但未写入新数据，请检查第三方 API 连接状态'));
      } else {
        toast.error(`${t('ui.采集失败：', '采集失败：')}${json.error || t('ui.未知错误', '未知错误')}`);
      }
    } catch (e: any) {
      toast.error(t('ui.采集请求失败: ', '采集请求失败: ') + e.message);
    } finally {
      setSyncing(false);
    }
  };
  const sum = data?.summary || {};
  const houses = data?.houses || [];
  const alarms = data?.recentAlarms || [];
  const hasAlarm = num(sum.totalAlarms) > 0;
  const noLiveData = !loading && (
    Boolean(error)
    || houses.length === 0
    || num(sum.onlineSensorCnt) === 0
    || num(sum.totalSensorCnt) === 0
    || Boolean(sum.diagnosticCode && String(sum.diagnosticCode) !== 'OK')
  );
  useEffect(() => {
    if (noLiveData && !diagStatus && !diagLoading) void runDiag();
  }, [noLiveData, diagStatus, diagLoading, runDiag]);
  const statusLine = (label: string, status: EndpointStatus | null) => {
    const color = status?.ok === true ? 'var(--status-success)' : status?.ok === false ? 'var(--status-danger)' : 'var(--text-secondary)';
    const text = status ? `${status.status ? `HTTP ${status.status}` : status.error || '—'}${status.elapsedMs != null ? ` · ${status.elapsedMs}ms` : ''}` : '未检测';
    return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
      <span>{label}</span><span style={{ color, fontWeight: 800, textAlign: 'right' }}>{text}</span>
    </div>;
  };
  const diagnosticSnapshot = () => JSON.stringify({
    page: '/breeding/device',
    allSummary: apiStatus,
    syncHealth: diagStatus,
    summary: sum,
    houses: houses.length,
    alarms: alarms.length,
    error,
    diagnostic: diag,
    checkedAt: new Date().toISOString(),
  }, null, 2);
  const diagnosticPanel = () => <div style={{
    marginBottom: 14,
    padding: 14,
    borderRadius: 'var(--radius-md)',
    border: '1px solid color-mix(in srgb,var(--status-warning) 35%,transparent)',
    background: 'color-mix(in srgb,var(--status-warning) 8%,var(--bg-card))',
    display: 'grid',
    gridTemplateColumns: 'minmax(0,1fr) auto',
    gap: 12,
    alignItems: 'start'
  }}>
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color: 'var(--status-warning)', marginBottom: 8 }}>
        <AlertTriangle size={15} /> 当前没有实时采集数据
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>
        {diag?.reason || error || '系统已接入鸡舍映射，但最近没有可用实时快照。'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10, marginTop: 10 }}>
        <div style={{ padding: 10, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          {statusLine('all-summary', apiStatus)}
          {statusLine('sync-health', diagStatus)}
        </div>
        <div style={{ padding: 10, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          鸡舍：{diag?.summary?.totalHouses ?? sum.totalHouses ?? 0}；
          已绑定：{diag?.summary?.mappedActive ?? '—'}；
          快照：{diag?.summary?.totalSnapshots ?? sum.totalSensorCnt ?? 0}
        </div>
      </div>
      {Array.isArray(diag?.queryErrors) && diag.queryErrors.length > 0 && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--status-danger)', lineHeight: 1.6 }}>
        查询错误：{diag.queryErrors.slice(0, 2).join('；')}
      </div>}
    </div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <button type="button" onClick={() => void runDiag()} disabled={diagLoading} className={s.btnGhost} style={{ fontSize: 12, opacity: diagLoading ? 0.6 : 1 }}>
        {diagLoading ? '诊断中…' : '重新诊断'}
      </button>
      <button type="button" onClick={() => void navigator.clipboard?.writeText(diagnosticSnapshot()).then(() => setCopiedDiag(true)).catch(() => setCopiedDiag(false))} className={s.btnGhost} style={{ fontSize: 12 }}>
        <Clipboard size={13} /> {copiedDiag ? '已复制' : '复制诊断'}
      </button>
    </div>
  </div>;
  const kpiCards: { label: string; value: string; sub: string; Icon: typeof Home; tone: Tone }[] = [
    { label: t('ui.在线鸡舍',   '在线鸡舍'),   value: `${num(sum.activeHouses)}/${num(sum.totalHouses)}`, sub: `已映射 ${num(sum.totalHouses)} 栋；在线按实时采集判定`,    Icon: Home,          tone: 'brand' },
    { label: t('ui.当前告警',   '当前告警'),   value: `${num(sum.totalAlarms)}`, sub: `${num(sum.alarmHouses)} 栋鸡舍受影响`, Icon: AlertTriangle, tone: hasAlarm ? 'danger' : 'success' },
    { label: t('ui.在线传感器', '在线传感器'), value: `${num(sum.onlineSensorCnt)}`, sub: `共 ${num(sum.totalSensorCnt)} 个监测点`,    Icon: Wifi,          tone: 'info'  },
    { label: t('ui.运行中设备', '运行中设备'), value: `${num(sum.onlineDeviceCnt)}`, sub: `共 ${num(sum.totalDeviceCnt)} 台（风机/加热）`, Icon: Activity,     tone: 'success' },
  ];
  return <div className="animate-fade-in">
      <PageHeader title={t('ui.设备监控总览', '设备监控总览')} subtitle={`${num(sum.activeHouses)}/${num(sum.totalHouses)} 栋在线 · ${num(sum.totalAlarms)} 个活跃告警`} breadcrumb={[t('ui.养殖生产中心', '养殖生产中心'), t('ui.设备监控总览', '设备监控总览')]} actions={<div className={u.flexRow8}>
            {/* 自动刷新开关：label 只做布局，s.toggle 只包裹 input+track */}
            <label style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap'
      }}>
              <span className={s.toggle} style={{
          flexShrink: 0
        }}>
                <input type="checkbox" className={s.toggleInput} checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
                <span className={s.toggleTrack} />
              </span>
              {t('ui.自动刷新', '自动刷新')}
            </label>
            {lastSync && <span style={{
        fontSize: 11,
        color: 'var(--text-secondary)'
      }}><Clock size={10} style={{
          marginRight: 2
        }} />{lastSync}</span>}
            <button type="button" onClick={handleSync} disabled={syncing} style={{ ...primaryActionButton, opacity: syncing ? 0.6 : 1, cursor: syncing ? 'not-allowed' : 'pointer' }}>
              <RefreshCw size={13} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />{syncing ? t('ui.采集中', '采集中...') : t('ui.手动采集', '手动采集')}
            </button>
          </div>} />

      {noLiveData && diagnosticPanel()}

      {/* g200f KPI 4 卡 — kpiCardCompact(tone) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginBottom: 16 }}>
        {kpiCards.map(c => {
          const Icon = c.Icon;
          return (
            <div key={c.label} style={kpiCardCompact(c.tone)}>
              <div style={kpiCardCompactLabel}><Icon size={13} /> {c.label}</div>
              <div style={kpiCardCompactValue(c.tone)}>{c.value}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.sub}</div>
            </div>
          );
        })}
      </div>

      {/* 5大系统图例 */}
      <div style={{
      display: 'flex',
      gap: 16,
      alignItems: 'center',
      marginBottom: 14,
      padding: '8px 12px',
      backgroundColor: 'var(--bg-card)',
      borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--border)',
      flexWrap: 'wrap'
    }}>
        <span style={{
        fontSize: 11,
        fontWeight: 700,
        color: 'var(--text-secondary)'
      }}>{t('ui.系统健康点', '系统健康点：')}</span>
        {[{
        label: t('status.normal', '正常'),
        dot: 'var(--status-success)'
      }, {
        label: t('status.warning', '预警'),
        dot: 'var(--status-warning)'
      }, {
        label: t('ui.告警', '告警'),
        dot: 'var(--status-danger)'
      }, {
        label: t('ui.无数据', '无数据'),
        dot: 'var(--text-disabled)'
      }].map(l => <span key={l.label} style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        color: 'var(--text-secondary)'
      }}>
            <span style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: l.dot,
          display: 'inline-block'
        }} />{l.label}
          </span>)}
        <span style={{
        marginLeft: 8,
        fontSize: 11,
        color: 'var(--text-secondary)'
      }}>{t('ui.🌡环境 · 🎛控制 · 🌾饲喂 · 💧饮水 · ⚙️执行', '🌡环境 · 🎛控制 · 🌾饲喂 · 💧饮水 · ⚙️执行')}</span>
      </div>

      {/* 鸡舍卡片网格 */}
      {loading ? <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))',
      gap: 14
    }}>
          {[1, 2, 3, 4].map(i => <div key={i} className={s.shimmer} style={{
        height: 220,
        borderRadius: 'var(--radius-md)'
      }} />)}
        </div> : houses.length > 0 ? <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))',
      gap: 14,
      marginBottom: 24
    }}>
          {houses.map(h => <HouseCard key={h.houseCode} house={h} onClick={() => router.push(`/breeding/device/${h.houseCode}`)} freshLabel={FRESH_LABEL[h.dataFreshness] || h.dataFreshness} noBatchLabel={t('ui.暂无批次', '暂无批次')} />)}
        </div> : <div style={{
      padding: 60,
      textAlign: 'center',
      color: 'var(--text-secondary)',
      backgroundColor: 'var(--bg-card)',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border)',
      marginBottom: 24
    }}>
          <Activity size={32} style={{
        marginBottom: 12,
        opacity: 0.4
      }} /><div style={{
        fontWeight: 700,
        marginBottom: 6
      }}>{t('ui.暂无已映射鸡舍', '暂无已映射鸡舍')}</div>
          <div className={u.fs13}>{t('ui.请先在运维管理页面完成鸡舍映射', '请先在「运维管理」页面完成鸡舍映射')}</div>
        </div>}

      {/* 最近全场告警 */}
      {alarms.length > 0 && <div style={{
      backgroundColor: 'color-mix(in srgb,var(--status-danger) 5%,var(--bg-card))',
      border: '1px solid color-mix(in srgb,var(--status-danger) 50%,transparent)',
      borderRadius: 'var(--radius-md)',
      padding: 16
    }}>
          <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12
      }}>
            <div style={{
          fontWeight: 700,
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: 'var(--status-danger)'
        }}><AlertTriangle size={14} /> {t('ui.全场活跃告警', '全场活跃告警')}</div>
            <button type="button" className={s.btnGhost} style={{
          fontSize: 11,
          padding: '2px 8px'
        }} onClick={() => router.push('/breeding/device-alerts')}>
              {t('ui.全部告警', '全部告警')} <ChevronRight size={12} />
            </button>
          </div>
          <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6
      }}>
            {alarms.map(a => <div key={a.id} style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 10px',
          backgroundColor: 'color-mix(in srgb,var(--status-danger) 10%,var(--bg-card))',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid color-mix(in srgb,var(--status-danger) 30%,transparent)',
          fontSize: 12
        }}>
                <div className={u.flexRow8}>
                  <span style={{
              fontWeight: 700,
              color: 'var(--status-danger)'
            }}>{a.erp_house_code}</span>
                  <span style={{
              color: 'var(--text-primary)'
            }}>{a.name_zh}</span>
                  <span style={{
              color: 'var(--status-warning)'
            }}>= {a.current_val} {a.unit}</span>
                </div>
                <span style={{
            fontSize: 10,
            color: 'var(--text-secondary)'
          }}>
                  {a.triggered_at ? new Date(Number(a.triggered_at) > 1e12 ? Number(a.triggered_at) : a.triggered_at).toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit'
            }) : ''}
                </span>
              </div>)}
          </div>
        </div>}
    </div>;
}
