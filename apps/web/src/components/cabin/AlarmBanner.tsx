'use client';
import { AlertTriangle, ChevronRight } from 'lucide-react';

interface Alarm { alarmName?: string; name?: string; currentValue?: number | string; unit?: string; }
interface Props { alarms: Alarm[]; onViewAll: () => void; }

export default function AlarmBanner({ alarms, onViewAll }: Props) {
  if (!alarms || alarms.length === 0) return null;
  return (
    <div style={{ backgroundColor:'#fff1f2', border:'1px solid color-mix(in srgb,var(--status-danger) 40%,transparent)', borderRadius:'var(--radius-md)', padding:'12px 16px', marginBottom:16, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <AlertTriangle size={18} color="#ef4444" />
        <div>
          <span style={{ fontWeight:700, color:'var(--status-danger)', fontSize:13 }}>当前 {alarms.length} 项告警</span>
          <span style={{ fontSize:12, color:'var(--status-danger)', marginLeft:10 }}>
            {alarms.slice(0,2).map(a => `${a.alarmName||a.name}（${a.currentValue}${a.unit}）`).join(' · ')}
            {alarms.length > 2 && ` 等 ${alarms.length-2} 项`}
          </span>
        </div>
      </div>
      <button onClick={onViewAll} style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, fontWeight:700, color:'var(--status-danger)', background:'none', border:'1px solid color-mix(in srgb,var(--status-danger) 40%,transparent)', cursor:'pointer', padding:'5px 10px', borderRadius:'var(--radius-sm)' }}>
        全部告警 <ChevronRight size={12} />
      </button>
    </div>
  );
}
