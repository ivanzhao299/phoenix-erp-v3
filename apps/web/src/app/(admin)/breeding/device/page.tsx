'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import u from "@/styles/uix-utils.module.css";
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import { RefreshCw, WifiOff, AlertTriangle, ChevronRight, Clock, Activity, Home, Wifi } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import { useLanguage } from '@/contexts/LanguageContext';
import s from '@/components/ui/admin-ui.module.css';

interface IotSystem  { code: string; name: string; icon: string; status: string; alarmCount: number; }
interface IotHouse   { houseCode: string; houseName: string; flockNo?: string; status: string; alarmCount: number; dataFreshness: string; lastUpdated?: string; systems?: IotSystem[]; hasData?: boolean; avgTemp?: number | null; avgHumidity?: number | null; co2?: number | null; ammonia?: number | null; feedToday?: number | null; waterToday?: number | null; onlineRate?: number; }
interface IotAlarm   { id?: number | string; alarmName?: string; propertyName?: string; severity?: string; houseCode?: string; houseName?: string; createdAt?: string; erp_house_code?: string; name_zh?: string; current_val?: number | null; unit?: string; triggered_at?: string | number; }
interface IotSummary { summary: Record<string, number>; houses: IotHouse[]; recentAlarms: IotAlarm[]; }

const API = '/api/v3/iot/devices';
const tok = () => (typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_token') || '' : '');
const hdr = () => ({ Authorization: `Bearer ${tok()}` });

// ── 系统状态点配置 ──────────────────────────────────────────────────────
const STATUS_DOT: Record<string, { bg:string; border:string; dot:string }> = {
  normal:   { bg:'color-mix(in srgb, var(--status-success) 14%, transparent)', border:'var(--status-success)', dot:'var(--status-success)' },
  standby:  { bg:'var(--text-primary)', border:'var(--text-primary)', dot:'var(--text-disabled)' },
  warning:  { bg:'color-mix(in srgb, var(--status-warning) 16%, transparent)', border:'var(--status-warning)', dot:'var(--status-warning)' },
  critical: { bg:'color-mix(in srgb, var(--status-danger) 14%, transparent)', border:'var(--status-danger)', dot:'var(--status-danger)' },
  no_data:  { bg:'var(--text-primary)', border:'var(--text-primary)', dot:'var(--text-disabled)' },
};

// ── 数据新鲜度配置 ──────────────────────────────────────────────────────
const FRESH: Record<string, { color:string; bg:string }> = {
  normal:  { color:'var(--status-success)', bg:'color-mix(in srgb,var(--status-success) 15%,transparent)' },
  delayed: { color:'var(--status-warning)', bg:'color-mix(in srgb,var(--status-warning) 15%,transparent)' },
  stale:   { color:'var(--status-danger)',  bg:'color-mix(in srgb,var(--status-danger)  15%,transparent)' },
  no_data: { color:'var(--text-secondary)', bg:'color-mix(in srgb,var(--text-secondary) 10%,transparent)' },
};

// ── 系统状态点子组件（颜色由传感器状态决定，保留 inline）───────────────
function SystemDot({ sys, statusLabel }: { sys: IotSystem; statusLabel: string }) {
  const c = STATUS_DOT[sys.status] || STATUS_DOT.no_data;
  const tip = sys.alarmCount > 0 ? `${sys.name}：${sys.alarmCount} 项告警` : `${sys.name}：${statusLabel}`;
  return (
    <div title={tip} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
      <div style={{ width:10, height:10, borderRadius:'50%', backgroundColor:c.dot, boxShadow: sys.status==='critical'?`0 0 6px ${c.dot}`:'none' }} />
      <div style={{ fontSize:8, color:'var(--text-secondary)', whiteSpace:'nowrap' }}>{sys.icon}</div>
    </div>
  );
}

// ── 鸡舍卡片（颜色由告警/数据鲜度决定，保留 inline）────────────────────
function HouseCard({ house, onClick, freshLabel, noBatchLabel }: { house: IotHouse; onClick: () => void; freshLabel: string; noBatchLabel: string }) {
  const fr = FRESH[house.dataFreshness] || FRESH.no_data;
  const hasAlarm = house.alarmCount > 0;

  return (
    <div onClick={onClick}
      onMouseEnter={e => (e.currentTarget.style.transform='translateY(-2px)')}
      onMouseLeave={e => (e.currentTarget.style.transform='none')}
      style={{ backgroundColor:'var(--bg-card)', border:`1.5px solid ${hasAlarm?'color-mix(in srgb,var(--status-danger) 50%,transparent)':'var(--border)'}`, borderRadius:'var(--radius-md)', padding:'10px 12px', cursor:'pointer', transition:'all 0.15s', boxShadow: hasAlarm?'0 0 0 2px color-mix(in srgb,var(--status-danger) 15%,transparent)':'none' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
        <div>
          <div style={{ fontWeight:800, fontSize:14, lineHeight:1.2 }}>{house.houseName}</div>
          <div style={{ fontSize:10, color:'var(--text-secondary)', marginTop:1 }}>
            {house.houseCode} · {house.flockNo ? `批次 ${house.flockNo}` : noBatchLabel}
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
          <div style={{ display:'flex', alignItems:'center', gap:5 }}>
            <span style={{ fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:10, backgroundColor:fr.bg, color:fr.color }}>● {freshLabel}</span>
            {hasAlarm && <span style={{ fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:10, backgroundColor:'color-mix(in srgb,var(--status-danger) 15%,transparent)', color:'var(--status-danger)' }}>⚠ {house.alarmCount}</span>}
          </div>
          {house.hasData && (
            <div style={{ display:'flex', gap:8 }}>
              {(house.systems||[]).map((sys) => <SystemDot key={sys.code} sys={sys} statusLabel={sys.status} />)}
            </div>
          )}
        </div>
      </div>

      {house.hasData ? (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:4, marginBottom:6 }}>
            {[
              { label:'温度', value:house.avgTemp,     unit:'℃',  ok: house.avgTemp!=null && house.avgTemp>=16 && house.avgTemp<=32 },
              { label:'湿度', value:house.avgHumidity, unit:'%',  ok: house.avgHumidity!=null && house.avgHumidity>=40 && house.avgHumidity<=85 },
              { label:'CO₂', value:house.co2,          unit:'ppm',ok: house.co2==null||house.co2<3000 },
              { label:'氨气', value:house.ammonia,      unit:'ppm',ok: house.ammonia==null||house.ammonia<20 },
            ].map(m => (
              <div key={m.label} style={{ padding:'4px 6px', borderRadius:'var(--radius-sm)', backgroundColor: m.value!=null&&!m.ok?'color-mix(in srgb,var(--status-warning) 10%,var(--bg-card))':'var(--bg-page)', border:'1px solid var(--border)', textAlign:'center' }}>
                <div style={{ fontSize:9, color:'var(--text-secondary)', lineHeight:1.2 }}>{m.label}</div>
                <div style={{ fontSize:13, fontWeight:700, lineHeight:1.3, color: m.value!=null&&!m.ok?'var(--status-warning)':'var(--text-primary)' }}>
                  {m.value != null ? Number(m.value).toFixed(1) : '—'}
                  <span style={{ fontSize:8, fontWeight:400, marginLeft:1, color:'var(--text-secondary)' }}>{m.unit}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:10, color:'var(--text-secondary)', borderTop:'1px solid var(--border)', paddingTop:6 }}>
            <div style={{ display:'flex', gap:10 }}>
              <span>耗料 <strong style={{ color:'var(--text-primary)', fontSize:11 }}>{house.feedToday!=null?`${Number(house.feedToday).toFixed(0)}kg`:'—'}</strong></span>
              <span>饮水 <strong style={{ color:'var(--text-primary)', fontSize:11 }}>{house.waterToday!=null?`${Number(house.waterToday).toFixed(1)}T`:'—'}</strong></span>
              <span>在线 <strong style={{ fontSize:11, color: (house.onlineRate??0)>0.8?'var(--status-success)':(house.onlineRate??0)>0.5?'var(--status-warning)':'var(--status-danger)' }}>{Math.round((house.onlineRate??0)*100)}%</strong></span>
            </div>
            <span style={{ fontSize:11, fontWeight:600, color:'var(--color-primary)', display:'flex', alignItems:'center', gap:2 }}>进入总览 <ChevronRight size={11}/></span>
          </div>
        </>
      ) : (
        <div style={{ padding:14, textAlign:'center', color:'var(--text-secondary)', fontSize:11, backgroundColor:'var(--bg-page)', borderRadius:'var(--radius-sm)', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
          <WifiOff size={13}/> 暂无采集数据
        </div>
      )}
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────
export default function DeviceOverviewPage() {
  const router = useRouter();
  const toast = useToast();
  const { t } = useLanguage();
  const [data, setData] = useState<IotSummary | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [syncing,     setSyncing]     = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(() => typeof window!=='undefined' && localStorage.getItem('phx_device_autoRefresh')==='true');
  const [lastSync,    setLastSync]    = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval>|null>(null);

  const STATUS_LABEL: Record<string,string> = {
    normal:  t('status.normal', '正常'),
    standby: t('ui.待机', '待机'),
    warning: t('status.warning', '预警'),
    critical: t('ui.告警', '告警'),
    no_data: t('ui.无数据', '无数据'),
  };

  const FRESH_LABEL: Record<string, string> = {
    normal:  t('ui.实时', '实时'),
    delayed: t('ui.延迟', '延迟'),
    stale:   t('ui.陈旧', '陈旧'),
    no_data: t('ui.无数据', '无数据'),
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/all-summary`, { headers: hdr() });
      const json = await res.json();
      if (json.ok) setData(json.data);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (typeof window!=='undefined') localStorage.setItem('phx_device_autoRefresh', String(autoRefresh)); }, [autoRefresh]);
  useEffect(() => {
    if (autoRefresh) timerRef.current = setInterval(() => loadData(), 120_000);
    else if (timerRef.current) clearInterval(timerRef.current);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRefresh, loadData]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res  = await fetch(`${API}/sync/realtime`, { method:'POST', headers: hdr() });
      const json = await res.json();
      setLastSync(new Date().toLocaleTimeString('zh-CN'));
      await loadData();
      if (json.ok && (json.records ?? 0) > 0) {
        toast.success(`采集完成：${json.success} 栋成功，写入 ${json.records} 条实时数据`);
      } else if (json.ok) {
        toast.warning('采集完成，但未写入新数据，请检查第三方 API 连接状态');
      } else {
        toast.error(`采集失败：${json.error || '未知错误'}`);
      }
    } catch(e: any) { toast.error('采集请求失败: ' + e.message); }
    finally { setSyncing(false); }
  };

  const sum    = data?.summary || {};
  const houses = data?.houses  || [];
  const alarms = data?.recentAlarms || [];

  const hasAlarm = (sum.totalAlarms || 0) > 0;
  const kpiCards = [
    { label: t('ui.接入鸡舍',  '接入鸡舍'),  value:`${sum.activeHouses||0}`,    sub:`共 ${sum.totalHouses||0} 栋已接入`,       Icon: Home,          cardCls: s.statCardPrimary, valCls: "",             alarmBg: false },
    { label: t('ui.当前告警',  '当前告警'),  value:`${sum.totalAlarms||0}`,     sub:`${sum.alarmHouses||0} 栋鸡舍受影响`,      Icon: AlertTriangle,  cardCls: hasAlarm ? s.statCardDanger : s.statCardSuccess, valCls: hasAlarm ? s.textDanger : s.textSuccess, alarmBg: hasAlarm },
    { label: t('ui.在线传感器','在线传感器'), value:`${sum.onlineSensorCnt||0}`, sub:`共 ${sum.totalSensorCnt||0} 个监测点`,     Icon: Wifi,          cardCls: s.statCardPrimary, valCls: "",             alarmBg: false },
    { label: t('ui.运行中设备','运行中设备'), value:`${sum.onlineDeviceCnt||0}`, sub:`共 ${sum.totalDeviceCnt||0} 台（风机/加热）`, Icon: Activity,      cardCls: s.statCardSuccess, valCls: s.textSuccess,  alarmBg: false },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader title={t('ui.设备监控总览', '设备监控总览')} subtitle={`${sum.activeHouses||0} 栋已接入 · ${sum.totalAlarms||0} 个活跃告警`} breadcrumb={[t('ui.养殖生产中心', '养殖生产中心'), t('ui.设备监控总览', '设备监控总览')]}
        actions={
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {/* 自动刷新开关：label 只做布局，s.toggle 只包裹 input+track */}
            <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12,
              color:'var(--text-secondary)', cursor:'pointer', userSelect:'none',
              whiteSpace:'nowrap' }}>
              <span className={s.toggle} style={{ flexShrink:0 }}>
                <input type="checkbox" className={s.toggleInput} checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
                <span className={s.toggleTrack} />
              </span>
              {t('ui.自动刷新', '自动刷新')}
            </label>
            {lastSync && <span style={{ fontSize:11, color:'var(--text-secondary)' }}><Clock size={10} style={{ marginRight:2 }}/>{lastSync}</span>}
            <button type="button" className={s.btnPrimary} onClick={handleSync} disabled={syncing}
              style={{ opacity: syncing ? 0.7 : 1, cursor: syncing ? 'not-allowed' : 'pointer' }}>
              <RefreshCw size={14} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }}/>{syncing ? t('ui.采集中', '采集中...') : t('ui.手动采集', '手动采集')}
            </button>
          </div>
        } />

      {/* KPI 卡片 */}
      <div className={s.kpiGrid} style={{ marginBottom:16 }}>
        {kpiCards.map(c => (
          <div key={c.label} className={`${s.statCard} ${c.cardCls}`}
            style={c.alarmBg ? { background:'var(--status-danger-bg-faint)' } : {}}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
              <div className={`${s.statValue} ${c.valCls}`} style={{ fontSize:28, lineHeight:1, letterSpacing:'-0.5px' }}>
                {c.value}
              </div>
              <c.Icon size={15} style={{ color:'var(--text-secondary)', opacity:0.45, marginTop:3, flexShrink:0 }} />
            </div>
            <div className={s.statLabel} style={{ fontSize:12, marginBottom:3 }}>{c.label}</div>
            <div className={s.statSub} style={{ fontSize:11, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* 5大系统图例 */}
      <div style={{ display:'flex', gap:16, alignItems:'center', marginBottom:14, padding:'8px 12px', backgroundColor:'var(--bg-card)', borderRadius:'var(--radius-sm)', border:'1px solid var(--border)', flexWrap:'wrap' }}>
        <span style={{ fontSize:11, fontWeight:700, color:'var(--text-secondary)' }}>{t('ui.系统健康点', '系统健康点：')}</span>
        {[
          { label: t('status.normal', '正常'), dot:'var(--status-success)' },
          { label: t('status.warning', '预警'), dot:'var(--status-warning)' },
          { label: t('ui.告警', '告警'), dot:'var(--status-danger)' },
          { label: t('ui.无数据', '无数据'), dot:'var(--text-disabled)' },
        ].map(l => (
          <span key={l.label} style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'var(--text-secondary)' }}>
            <span style={{ width:8, height:8, borderRadius:'50%', backgroundColor:l.dot, display:'inline-block' }}/>{l.label}
          </span>
        ))}
        <span style={{ marginLeft:8, fontSize:11, color:'var(--text-secondary)' }}>🌡环境 · 🎛控制 · 🌾饲喂 · 💧饮水 · ⚙️执行</span>
      </div>

      {/* 鸡舍卡片网格 */}
      {loading ? (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:14 }}>
          {[1,2,3,4].map(i => <div key={i} className={s.shimmer} style={{ height:220, borderRadius:'var(--radius-md)' }}/>)}
        </div>
      ) : houses.length > 0 ? (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:14, marginBottom:24 }}>
          {houses.map((h) => (
            <HouseCard
              key={h.houseCode}
              house={h}
              onClick={() => router.push(`/breeding/device/${h.houseCode}`)}
              freshLabel={FRESH_LABEL[h.dataFreshness] || h.dataFreshness}
              noBatchLabel={t('ui.暂无批次', '暂无批次')}
            />
          ))}
        </div>
      ) : (
        <div style={{ padding:60, textAlign:'center', color:'var(--text-secondary)', backgroundColor:'var(--bg-card)', borderRadius:'var(--radius-md)', border:'1px solid var(--border)', marginBottom:24 }}>
          <Activity size={32} style={{ marginBottom:12, opacity:0.4 }}/><div style={{ fontWeight:700, marginBottom:6 }}>{t('ui.暂无已映射鸡舍', '暂无已映射鸡舍')}</div>
          <div className={u.fs13}>{t('ui.请先在运维管理页面完成鸡舍映射', '请先在「运维管理」页面完成鸡舍映射')}</div>
        </div>
      )}

      {/* 最近全场告警 */}
      {alarms.length > 0 && (
        <div style={{ backgroundColor:'color-mix(in srgb,var(--status-danger) 5%,var(--bg-card))', border:'1px solid color-mix(in srgb,var(--status-danger) 50%,transparent)', borderRadius:'var(--radius-md)', padding:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div style={{ fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:6, color:'var(--status-danger)' }}><AlertTriangle size={14}/> {t('ui.全场活跃告警', '全场活跃告警')}</div>
            <button type="button" className={s.btnGhost} style={{ fontSize:11, padding:'2px 8px' }}
              onClick={() => router.push('/breeding/device-alerts')}>
              {t('ui.全部告警', '全部告警')} <ChevronRight size={12}/>
            </button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {alarms.map((a) => (
              <div key={a.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 10px', backgroundColor:'color-mix(in srgb,var(--status-danger) 10%,var(--bg-card))', borderRadius:'var(--radius-sm)', border:'1px solid color-mix(in srgb,var(--status-danger) 30%,transparent)', fontSize:12 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontWeight:700, color:'var(--status-danger)' }}>{a.erp_house_code}</span>
                  <span style={{ color:'var(--text-primary)' }}>{a.name_zh}</span>
                  <span style={{ color:'var(--status-warning)' }}>= {a.current_val} {a.unit}</span>
                </div>
                <span style={{ fontSize:10, color:'var(--text-secondary)' }}>
                  {a.triggered_at ? new Date(Number(a.triggered_at)>1e12?Number(a.triggered_at):a.triggered_at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}) : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
