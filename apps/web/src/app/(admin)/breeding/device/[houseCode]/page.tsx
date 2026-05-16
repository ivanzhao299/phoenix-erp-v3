'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import { ArrowLeft, RefreshCw, AlertTriangle, Thermometer, Droplets, Wind, Activity, Zap, Cpu, Clock } from 'lucide-react';
import s from '@/components/ui/admin-ui.module.css';
import { useLanguage } from "@/contexts/LanguageContext";

const tok = () => typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_token') || '' : '';
const hdr = () => ({ Authorization: `Bearer ${tok()}` });
const API = '/api/farm-device/cabins';

const STATUS_COLOR: Record<string, string> = {
  normal: '#22c55e', warning: '#f59e0b', critical: '#ef4444',
  no_data: '#94a3b8', standby: '#94a3b8',
};

// ── 迷你 SVG 折线图 ────────────────────────────────────────────
function MiniChart({ points, color }: { points: number[]; color: string }) {
  if (!points.length) return <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>—</div>;
  const min = Math.min(...points), max = Math.max(...points);
  const range = max - min || 1;
  const W = 200, H = 50;
  const xs = points.map((_, i) => (i / (points.length - 1 || 1)) * W);
  const ys = points.map(v => H - ((v - min) / range) * (H - 6) - 3);
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  return (
    <svg width={W} height={H} style={{ overflow: 'visible' }}>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={xs[xs.length-1]} cy={ys[ys.length-1]} r="3" fill={color}/>
    </svg>
  );
}

// ── 传感器指标大卡 ─────────────────────────────────────────────
function MetricCard({ title, value, unit, status, trend, statusLabel }: {
  title: string; value: number | null; unit: string; status: string; trend?: number[]; statusLabel: string;
}) {
  const color = STATUS_COLOR[status] || '#94a3b8';
  return (
    <div style={{ background: 'var(--bg-card)', border: `1.5px solid ${status === 'normal' ? 'var(--border)' : color}`,
      borderRadius: 'var(--radius-lg)', padding: '16px 20px', boxShadow: 'var(--shadow-sm)',
      borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 32, fontWeight: 800, color, lineHeight: 1 }}>
        {value != null ? Number(value).toFixed(1) : '—'}
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)', marginLeft: 4 }}>{unit}</span>
      </div>
      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, fontWeight: 700,
          background: `${color}20`, color }}>{statusLabel}</span>
        {trend && trend.length > 1 && <MiniChart points={trend} color={color}/>}
      </div>
    </div>
  );
}

export default function HouseDetailPage() {
  const { houseCode } = useParams<{ houseCode: string }>();
  const router = useRouter();
  const { t } = useLanguage();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── 5大系统配置 ────────────────────────────────────────────────
  const SYSTEMS: Record<string, { name: string; icon: React.ReactNode; color: string }> = {
    HVAC:    { name: t('ui.环境调控', '环境调控'), icon: <Thermometer size={16}/>, color: '#0ea5e9' },
    CONTROL: { name: t('ui.控制设备', '控制设备'), icon: <Zap size={16}/>,         color: '#8b5cf6' },
    FEED:    { name: t('ui.饲喂系统', '饲喂系统'), icon: <Activity size={16}/>,    color: '#f59e0b' },
    WATER:   { name: t('ui.饮水系统', '饮水系统'), icon: <Droplets size={16}/>,    color: '#22c55e' },
    EXEC:    { name: t('ui.执行设备', '执行设备'), icon: <Cpu size={16}/>,         color: '#ef4444' },
  };

  const STATUS_LABEL: Record<string, string> = {
    normal:  t('status.normal',  '正常'),
    warning: t('status.warning', '预警'),
    critical:t('status.critical','告警'),
    no_data: t('status.no_data', '无数据'),
    standby: t('status.standby', '待机'),
  };

  const [overview,  setOverview]  = useState<any>(null);
  const [systems,   setSystems]   = useState<any[]>([]);
  const [alarms,    setAlarms]    = useState<any[]>([]);
  const [trends,    setTrends]    = useState<Record<string, number[]>>({});
  const [loading,   setLoading]   = useState(true);
  const [lastUpdate,setLastUpdate]= useState('');
  const [autoRef,   setAutoRef]   = useState(false);

  const load = useCallback(async () => {
    if (!houseCode) return;
    setLoading(true);
    try {
      const [ovRes, sysRes, almRes, trdRes] = await Promise.all([
        fetch(`${API}/${houseCode}/overview`,        { headers: hdr() }),
        fetch(`${API}/${houseCode}/systems/summary`, { headers: hdr() }),
        fetch(`${API}/${houseCode}/alarms?status=open`, { headers: hdr() }),
        fetch(`${API}/${houseCode}/trends?codes=2001,2083,2002,2003&range=24h`, { headers: hdr() }),
      ]);
      const [ov, sys, alm, trd] = await Promise.all([
        ovRes.ok  ? ovRes.json()  : null,
        sysRes.ok ? sysRes.json() : null,
        almRes.ok ? almRes.json() : null,
        trdRes.ok ? trdRes.json() : null,
      ]);
      if (ov?.ok)  setOverview(ov.data);
      if (sys?.ok) setSystems(sys.data?.systems || []);
      if (alm?.ok) setAlarms(alm.data?.items || []);
      if (trd?.ok && trd.data?.series) {
        const map: Record<string, number[]> = {};
        (trd.data.series as any[]).forEach(s => {
          map[s.propertyCode] = s.points?.map((p: any) => Number(p.value)) || [];
        });
        setTrends(map);
      }
      setLastUpdate(new Date().toLocaleTimeString('zh-CN'));
    } catch {}
    finally { setLoading(false); }
  }, [houseCode]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (autoRef) timerRef.current = setInterval(load, 60_000);
    else if (timerRef.current) clearInterval(timerRef.current);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRef, load]);

  const kpis = overview?.kpis || [];
  const getKpi = (code: string) => kpis.find((k: any) => k.code === code);

  // 主要4个环境指标
  const envMetrics = [
    { code: '2001', title: t('ui.舍内温度', '舍内温度'), unit: '℃' },
    { code: '2083', title: t('ui.相对湿度', '相对湿度'), unit: '%'  },
    { code: '2002', title: t('ui.CO₂浓度', 'CO₂浓度'), unit: 'ppm'},
    { code: '2003', title: t('ui.氨气浓度', '氨气浓度'), unit: 'ppm'},
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={`${houseCode} — ${t('ui.鸡舍实时监控', '鸡舍实时监控')}`}
        subtitle={overview?.header?.houseName
          ? `${overview.header.houseName} · ${t('ui.批次', '批次')} ${overview.header.flockNo || t('common.none', '暂无')}`
          : t('common.loading', '正在加载...')}
        breadcrumb={[t('ui.养殖管理', '养殖管理'), t('ui.设备监控总览', '设备监控总览'), houseCode]}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <span className={s.toggle} style={{ flexShrink: 0 }}>
                <input type="checkbox" className={s.toggleInput} checked={autoRef} onChange={e => setAutoRef(e.target.checked)}/>
                <span className={s.toggleTrack}/>
              </span>
              {t('ui.自动刷新', '自动刷新')}
            </label>
            {lastUpdate && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}><Clock size={10} style={{ marginRight: 2 }}/>{lastUpdate}</span>}
            <button type="button" className={s.btnSecondary} onClick={load} disabled={loading}>
              <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}/> {t('common.refresh', '刷新')}
            </button>
            <button type="button" className={s.btnSecondary} onClick={() => router.back()}>
              <ArrowLeft size={13}/> {t('ui.返回总览', '返回总览')}
            </button>
          </div>
        }
      />

      {/* ── 告警横幅 ── */}
      {alarms.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', marginBottom: 16,
          background: 'color-mix(in srgb,var(--status-danger) 10%,transparent)',
          border: '1px solid color-mix(in srgb,var(--status-danger) 40%,transparent)',
          borderRadius: 'var(--radius-md)', color: 'var(--status-danger)', fontSize: 13, fontWeight: 600 }}>
          <AlertTriangle size={16}/>
          {t('ui.当前有', '当前有')} {alarms.length} {t('ui.个活跃告警请及时处理', '个活跃告警，请及时处理！')}
          <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>
            {alarms.map((a: any) => a.alarmName).slice(0, 3).join(' · ')}{alarms.length > 3 ? ' ...' : ''}
          </span>
        </div>
      )}

      {/* ── 实时环境指标（4大卡片）── */}
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-primary)', marginBottom: 12 }}>📡 {t('ui.实时环境', '实时环境')}</h3>
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14, marginBottom: 24 }}>
          {[1,2,3,4].map(i => <div key={i} className={s.shimmer} style={{ height: 110, borderRadius: 'var(--radius-lg)' }}/>)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14, marginBottom: 24 }}>
          {envMetrics.map(m => {
            const kpi = getKpi(m.code);
            return (
              <MetricCard key={m.code} title={m.title}
                value={kpi?.value ?? null} unit={m.unit}
                status={kpi?.status || 'no_data'}
                statusLabel={STATUS_LABEL[kpi?.status || 'no_data'] || kpi?.status || 'no_data'}
                trend={trends[m.code]}
              />
            );
          })}
        </div>
      )}

      {/* ── 耗料 & 饮水 ── */}
      {(getKpi('2488') || getKpi('2484')) && (
        <>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-primary)', marginBottom: 12 }}>⚙️ {t('ui.今日生产数据', '今日生产数据')}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 24 }}>
            {[
              { code: '2488', title: t('ui.今日耗料', '今日耗料'), unit: 'kg', color: '#f59e0b' },
              { code: '2484', title: t('ui.今日饮水', '今日饮水'), unit: 'T',  color: '#22c55e' },
            ].map(m => {
              const kpi = getKpi(m.code);
              if (!kpi) return null;
              return (
                <div key={m.code} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)', padding: '16px 20px', borderLeft: `4px solid ${m.color}` }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6 }}>{m.title}</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: m.color }}>
                    {kpi.value != null ? Number(kpi.value).toFixed(1) : '—'}
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', marginLeft: 4 }}>{m.unit}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── 5大系统状态 ── */}
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-primary)', marginBottom: 12 }}>🛠 {t('ui.系统运行状态', '系统运行状态')}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginBottom: 24 }}>
        {loading ? [1,2,3,4,5].map(i => (
          <div key={i} className={s.shimmer} style={{ height: 100, borderRadius: 'var(--radius-md)' }}/>
        )) : systems.length > 0 ? systems.map((sys: any) => {
          const cfg = SYSTEMS[sys.code] || SYSTEMS[sys.systemCode] || { name: sys.name || sys.code, icon: <Activity size={16}/>, color: '#94a3b8' };
          const color = STATUS_COLOR[sys.status] || '#94a3b8';
          return (
            <div key={sys.code || sys.systemCode}
              style={{ background: 'var(--bg-card)', border: `1px solid ${color}40`, borderRadius: 'var(--radius-md)',
                padding: '14px 16px', borderLeft: `4px solid ${color}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: cfg.color, fontWeight: 700, fontSize: 13 }}>
                  {cfg.icon}{cfg.name}
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                  background: `${color}20`, color }}>{STATUS_LABEL[sys.status] || sys.status}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {t('ui.传感器', '传感器')} {sys.sensorCount || 0} {t('ui.个', '个')} · {t('ui.告警', '告警')} {sys.alarmCount || 0} {t('ui.项', '项')}
              </div>
              {sys.onlineRate != null && (
                <div style={{ marginTop: 8, height: 4, background: 'var(--bg-muted)', borderRadius: 2 }}>
                  <div style={{ height: 4, width: `${Math.round(sys.onlineRate * 100)}%`,
                    background: color, borderRadius: 2, transition: 'width 0.4s' }}/>
                </div>
              )}
              {sys.summaryMetrics?.slice(0, 2).map((m: any, mi: number) => (
                <div key={m.code ?? m.name ?? mi} style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{m.title || m.name}</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                    {m.value != null ? `${Number(m.value).toFixed(1)} ${m.unit || ''}` : '—'}
                  </span>
                </div>
              ))}
            </div>
          );
        }) : (
          <div style={{ gridColumn: '1/-1', padding: 32, textAlign: 'center',
            color: 'var(--text-secondary)', background: 'var(--bg-card)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
            <Wind size={28} style={{ marginBottom: 8, opacity: 0.4 }}/><br/>{t('common.noData', '暂无系统数据')}
          </div>
        )}
      </div>

      {/* ── 活跃告警明细 ── */}
      {alarms.length > 0 && (
        <>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--status-danger)', marginBottom: 12 }}>
            <AlertTriangle size={14} style={{ marginRight: 6, verticalAlign: 'middle' }}/>{t('ui.活跃告警明细', '活跃告警明细')}
          </h3>
          <div className={s.card} style={{ marginBottom: 24, overflow: 'hidden' }}>
            <table className={s.table}>
              <thead>
                <tr>{[
                  t('ui.系统', '系统'),
                  t('ui.告警项目', '告警项目'),
                  t('ui.当前值', '当前值'),
                  t('ui.阈值', '阈值'),
                  t('ui.触发时间', '触发时间'),
                  t('common.status', '状态'),
                ].map(h => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {alarms.map((a: any) => (
                  <tr key={a.id}>
                    <td>{SYSTEMS[a.systemCode]?.name || a.systemName || a.systemCode || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{a.alarmName || a.propertyName}</td>
                    <td style={{ color: 'var(--status-danger)', fontWeight: 700 }}>
                      {a.currentVal != null ? `${Number(a.currentVal).toFixed(1)} ${a.unit || ''}` : '—'}
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                      {a.thresholdVal != null ? `${a.thresholdVal} ${a.unit || ''}` : '—'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {a.triggeredAt ? new Date(Number(a.triggeredAt) > 1e12 ? Number(a.triggeredAt) : a.triggeredAt)
                        .toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                        background: '#fef2f2', color: 'var(--status-danger)', border: '1px solid #fca5a5' }}>
                        {t('status.alarming', '告警中')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── 全部传感器读数 ── */}
      {kpis.length > 0 && (
        <>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-primary)', marginBottom: 12 }}>📊 {t('ui.传感器读数一览', '传感器读数一览')}</h3>
          <div className={s.card} style={{ marginBottom: 24, overflow: 'hidden' }}>
            <table className={s.table}>
              <thead>
                <tr>{[
                  t('ui.传感器名称', '传感器名称'),
                  t('ui.当前值', '当前值'),
                  t('ui.单位', '单位'),
                  t('common.status', '状态'),
                  t('ui.数据新鲜度', '数据新鲜度'),
                ].map(h => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {kpis.map((k: any) => {
                  const color = STATUS_COLOR[k.status] || '#94a3b8';
                  return (
                    <tr key={k.code}>
                      <td style={{ fontWeight: 600 }}>{k.title || k.code}</td>
                      <td style={{ fontWeight: 700, fontSize: 15, color }}>{k.value != null ? Number(k.value).toFixed(1) : '—'}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{k.unit || '—'}</td>
                      <td>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                          background: `${color}20`, color }}>{STATUS_LABEL[k.status] || k.status}</span>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {overview?.dataFreshness === 'normal'  ? `✅ ${t('ui.实时', '实时')}` :
                         overview?.dataFreshness === 'delayed' ? `⚠️ ${t('ui.延迟', '延迟')}` : `❌ ${t('ui.陈旧', '陈旧')}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── 历史趋势小图 ── */}
      {Object.keys(trends).length > 0 && (
        <>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-primary)', marginBottom: 12 }}>📈 {t('ui.过去24小时趋势', '过去24小时趋势')}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14, marginBottom: 24 }}>
            {envMetrics.filter(m => trends[m.code]?.length > 1).map(m => (
              <div key={m.code} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12 }}>
                  {m.title}（{t('ui.最近', '最近')} {trends[m.code].length} {t('ui.个采样点', '个采样点')}）
                </div>
                <MiniChart points={trends[m.code]} color={STATUS_COLOR[getKpi(m.code)?.status || 'no_data']}/>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
                  <span>{t('ui.最低', '最低')} {Math.min(...trends[m.code]).toFixed(1)} {m.unit}</span>
                  <span>{t('ui.最高', '最高')} {Math.max(...trends[m.code]).toFixed(1)} {m.unit}</span>
                  <span>{t('ui.均值', '均值')} {(trends[m.code].reduce((a,b)=>a+b,0)/trends[m.code].length).toFixed(1)} {m.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── 空状态 ── */}
      {!loading && !overview && (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)',
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
          <Activity size={36} style={{ marginBottom: 12, opacity: 0.35 }}/>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('ui.鸡舍', '鸡舍')} {houseCode} {t('common.noData', '暂无设备数据')}</div>
          <div style={{ fontSize: 13 }}>{t('ui.该鸡舍可能未完成设备映射请前往运维管理配置', '该鸡舍可能未完成设备映射，请前往「运维管理」配置')}</div>
        </div>
      )}
    </div>
  );
}
