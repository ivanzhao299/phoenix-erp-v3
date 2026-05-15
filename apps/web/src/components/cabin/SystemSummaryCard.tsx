'use client';
import { ChevronRight, AlertTriangle, CheckCircle, WifiOff, PauseCircle } from 'lucide-react';
import type { ReactNode } from 'react';

const SC: Record<string, { bg:string; border:string; label:string; color:string; icon:ReactNode }> = {
  normal:   { bg:'var(--bg-card)',  border:'var(--border)', label:'正常', color:'var(--status-success)', icon:<CheckCircle size={14}/> },
  standby:  { bg:'color-mix(in srgb,var(--text-secondary) 10%,var(--bg-card))', border:'var(--border)', label:'待机', color:'var(--text-secondary)', icon:<PauseCircle size={14}/> },
  warning:  { bg:'color-mix(in srgb,var(--status-warning) 10%,var(--bg-card))', border:'color-mix(in srgb,var(--status-warning) 50%,transparent)', label:'预警', color:'var(--status-warning)', icon:<AlertTriangle size={14}/> },
  critical: { bg:'color-mix(in srgb,var(--status-danger) 10%,var(--bg-card))', border:'color-mix(in srgb,var(--status-danger) 50%,transparent)', label:'告警', color:'var(--status-danger)', icon:<AlertTriangle size={14}/> },
  no_data:  { bg:'var(--bg-card)', border:'var(--border)', label:'无数据', color:'var(--text-secondary)', icon:<WifiOff size={14}/> },
};

interface Metric { label: string; value: number | null; unit?: string; status?: string; }
interface System { code: string; name: string; icon: string; status: string; summaryMetrics?: Metric[]; alarmCount?: number; sensorCount?: number; }
interface Props { system: System; onEnter: () => void; }

export default function SystemSummaryCard({ system, onEnter }: Props) {
  const sc = SC[system?.status] || SC.no_data;
  const metrics = system?.summaryMetrics || [];
  return (
    <div style={{ backgroundColor:sc.bg, border:`1.5px solid ${sc.border}`, borderRadius:'var(--radius-md)', padding:16, display:'flex', flexDirection:'column', gap:10, transition:'box-shadow 0.15s' }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow='var(--shadow-md)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow='none')}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:18 }}>{system?.icon}</span>
          <span style={{ fontSize:13, fontWeight:700 }}>{system?.name}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, fontWeight:700, color:sc.color }}>{sc.icon} {sc.label}</div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, flex:1 }}>
        {metrics.length > 0 ? metrics.slice(0,4).map(m => (
          <div key={m.label} style={{ padding:'6px 8px', backgroundColor:'var(--bg-page)', borderRadius:'var(--radius-sm)', border:'1px solid var(--border)' }}>
            <div style={{ fontSize:10, color:'var(--text-secondary)', marginBottom:2 }}>{m.label}</div>
            <div style={{ fontSize:15, fontWeight:700, color: m.status==='critical'?'var(--status-danger)':m.status==='warning'?'var(--status-warning)':'var(--text-primary)' }}>
              {m.value != null ? Number(m.value).toFixed(1) : '—'}<span style={{ fontSize:10, fontWeight:400, marginLeft:2, color:'var(--text-secondary)' }}>{m.unit}</span>
            </div>
          </div>
        )) : <div style={{ gridColumn:'1/-1', fontSize:12, color:'var(--text-secondary)', textAlign:'center', padding:'8px 0' }}>暂无数据</div>}
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid var(--border)', paddingTop:10 }}>
        <div style={{ fontSize:11, color:'var(--text-secondary)' }}>
          {system?.alarmCount && system.alarmCount > 0
            ? <span style={{ color:'var(--status-danger)', fontWeight:700 }}>⚠ {system.alarmCount} 项告警</span>
            : <span>传感器 {system?.sensorCount||0} 个</span>}
        </div>
        <button onClick={onEnter} style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, fontWeight:600, color:'var(--color-primary)', background:'none', border:'none', cursor:'pointer', padding:'4px 8px', borderRadius:'var(--radius-sm)' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor='var(--bg-page)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor='transparent')}>
          查看详情 <ChevronRight size={12}/>
        </button>
      </div>
    </div>
  );
}
