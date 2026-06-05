'use client';
import { RefreshCw } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const freshnessColor: Record<string,string> = { normal:'var(--status-success)', delayed:'var(--status-warning)', stale:'var(--status-danger)', no_data:'var(--slate-400)' };

interface Header {
  dataFreshness?: string; lastUpdateTime?: string;
  sensorCount?: number; onlineSensorCnt?: number; totalSensors?: number; onlineSensors?: number;
  deviceCount?: number; onlineDeviceCnt?: number; alarmCount?: number;
}
interface Props { header?: Header; houseCode: string; onRefresh: () => void; }

export default function CabinHeaderCard({ header, houseCode, onRefresh }: Props) {
  const { t } = useLanguage();
  const freshnessLabel: Record<string,string> = {
    normal:  t('ui.数据正常', '数据正常'),
    delayed: t('ui.数据延迟', '数据延迟'),
    stale:   t('ui.数据陈旧', '数据陈旧'),
    no_data: t('common.no_data', '暂无数据'),
  };
  const f = header?.dataFreshness || 'no_data';
  const sensorTotal  = header?.sensorCount    ?? header?.totalSensors  ?? 0;
  const sensorOnline = header?.onlineSensorCnt ?? header?.onlineSensors ?? 0;
  const deviceTotal  = header?.deviceCount    ?? 0;
  const deviceOnline = header?.onlineDeviceCnt ?? 0;
  const rate = sensorTotal > 0 ? Math.round(sensorOnline / sensorTotal * 100) : 0;

  return (
    <div style={{ background:'linear-gradient(135deg,var(--slate-900) 0%,var(--slate-800) 100%)', borderRadius:'var(--radius-lg)', padding:'18px 24px', marginBottom:20, display:'flex', alignItems:'center', justifyContent:'space-between', border:'1px solid var(--overlay-white-08)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:20 }}>
        <div style={{ width:48, height:48, borderRadius:12, backgroundColor:'var(--status-special-bg-medium)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>🏚</div>
        <div>
          <div style={{ fontSize:20, fontWeight:800, color:'white' }}>{houseCode} {t('ui.鸡舍', '鸡舍')}</div>
          <div style={{ fontSize:12, color:'var(--overlay-white-50)', marginTop:2 }}>{t('ui.最后更新', '最后更新')}：{header?.lastUpdateTime || '—'}</div>
        </div>
        <div style={{ padding:'4px 12px', borderRadius:20, backgroundColor:`${freshnessColor[f]}20`, border:`1px solid ${freshnessColor[f]}40`, fontSize:11, fontWeight:700, color:freshnessColor[f] }}>
          ● {freshnessLabel[f]}
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:24 }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:22, fontWeight:800, color: rate>80?'var(--status-success)':'var(--status-warning)' }}>{rate}%</div>
          <div style={{ fontSize:10, color:'var(--overlay-white-10)' }}>{t('ui.传感器在线', '传感器在线')} ({sensorOnline}/{sensorTotal})</div>
        </div>
        {deviceTotal > 0 && (
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:22, fontWeight:800, color:'var(--status-success)' }}>{deviceOnline}</div>
            <div style={{ fontSize:10, color:'var(--overlay-white-10)' }}>{t('ui.设备运行', '设备运行')} /{deviceTotal}</div>
          </div>
        )}
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:22, fontWeight:800, color:(header?.alarmCount||0)>0?'var(--status-danger)':'var(--status-success)' }}>{header?.alarmCount||0}</div>
          <div style={{ fontSize:10, color:'var(--overlay-white-10)' }}>{t('ui.当前告警', '当前告警')}</div>
        </div>
        <button type="button" onClick={onRefresh} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', backgroundColor:'var(--overlay-white-08)', border:'1px solid var(--overlay-white-10)', borderRadius:'var(--radius-md)', color:'var(--overlay-white-70)', cursor:'pointer', fontSize:12 }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor='var(--overlay-white-15)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor='var(--overlay-white-08)')}>
          <RefreshCw size={13} /> {t('common.refresh', '刷新')}
        </button>
      </div>
    </div>
  );
}
