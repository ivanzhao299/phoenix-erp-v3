'use client';
import { RefreshCw } from 'lucide-react';

const freshnessLabel: Record<string,string> = { normal:'数据正常', delayed:'数据延迟', stale:'数据陈旧', no_data:'暂无数据' };
const freshnessColor: Record<string,string> = { normal:'#22c55e', delayed:'#f59e0b', stale:'#ef4444', no_data:'#94a3b8' };

interface Header {
  dataFreshness?: string; lastUpdateTime?: string;
  sensorCount?: number; onlineSensorCnt?: number; totalSensors?: number; onlineSensors?: number;
  deviceCount?: number; onlineDeviceCnt?: number; alarmCount?: number;
}
interface Props { header?: Header; houseCode: string; onRefresh: () => void; }

export default function CabinHeaderCard({ header, houseCode, onRefresh }: Props) {
  const f = header?.dataFreshness || 'no_data';
  const sensorTotal  = header?.sensorCount    ?? header?.totalSensors  ?? 0;
  const sensorOnline = header?.onlineSensorCnt ?? header?.onlineSensors ?? 0;
  const deviceTotal  = header?.deviceCount    ?? 0;
  const deviceOnline = header?.onlineDeviceCnt ?? 0;
  const rate = sensorTotal > 0 ? Math.round(sensorOnline / sensorTotal * 100) : 0;

  return (
    <div style={{ background:'linear-gradient(135deg,#0f172a 0%,#1e293b 100%)', borderRadius:'var(--radius-lg)', padding:'18px 24px', marginBottom:20, display:'flex', alignItems:'center', justifyContent:'space-between', border:'1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:20 }}>
        <div style={{ width:48, height:48, borderRadius:12, backgroundColor:'rgba(99,102,241,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>🏚</div>
        <div>
          <div style={{ fontSize:20, fontWeight:800, color:'white' }}>{houseCode} 鸡舍</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginTop:2 }}>最后更新：{header?.lastUpdateTime || '—'}</div>
        </div>
        <div style={{ padding:'4px 12px', borderRadius:20, backgroundColor:`${freshnessColor[f]}20`, border:`1px solid ${freshnessColor[f]}40`, fontSize:11, fontWeight:700, color:freshnessColor[f] }}>
          ● {freshnessLabel[f]}
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:24 }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:22, fontWeight:800, color: rate>80?'#22c55e':'#f59e0b' }}>{rate}%</div>
          <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)' }}>传感器在线 ({sensorOnline}/{sensorTotal})</div>
        </div>
        {deviceTotal > 0 && (
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:22, fontWeight:800, color:'var(--status-success)' }}>{deviceOnline}</div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)' }}>设备运行 /{deviceTotal}</div>
          </div>
        )}
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:22, fontWeight:800, color:(header?.alarmCount||0)>0?'#ef4444':'#22c55e' }}>{header?.alarmCount||0}</div>
          <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)' }}>当前告警</div>
        </div>
        <button onClick={onRefresh} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', backgroundColor:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:'var(--radius-md)', color:'rgba(255,255,255,0.7)', cursor:'pointer', fontSize:12 }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor='rgba(255,255,255,0.15)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor='rgba(255,255,255,0.08)')}>
          <RefreshCw size={13} /> 刷新
        </button>
      </div>
    </div>
  );
}
