'use client';
import { useLanguage } from '@/contexts/LanguageContext';
const STATUS: Record<string, { bg:string; border:string; val:string; badge:string; badgeBg:string }> = {
  normal:   { bg:'var(--bg-card)',  border:'var(--border)', val:'var(--text-primary)', badge:'var(--status-success)', badgeBg:'color-mix(in srgb,var(--status-success) 15%,transparent)' },
  warning:  { bg:'color-mix(in srgb,var(--status-warning) 10%,var(--bg-card))', border:'color-mix(in srgb,var(--status-warning) 50%,transparent)', val:'var(--status-warning)', badge:'var(--status-warning)', badgeBg:'color-mix(in srgb,var(--status-warning) 20%,transparent)' },
  critical: { bg:'color-mix(in srgb,var(--status-danger) 10%,var(--bg-card))', border:'color-mix(in srgb,var(--status-danger) 50%,transparent)', val:'var(--status-danger)', badge:'var(--status-danger)', badgeBg:'color-mix(in srgb,var(--status-danger) 20%,transparent)' },
  offline:  { bg:'var(--bg-card)', border:'var(--border)', val:'var(--text-secondary)', badge:'var(--text-secondary)', badgeBg:'color-mix(in srgb,var(--text-secondary) 15%,transparent)' },
};

interface Kpi { code: string; title: string; value: number | null; unit: string; status: string; compareTarget?: number; }
interface Props { kpi: Kpi; onClick?: () => void; selected?: boolean; }

export default function KpiMetricCard({ kpi, onClick, selected }: Props) {
  const { t } = useLanguage();
  const s = STATUS[kpi?.status] || STATUS.normal;
  const val = kpi?.value;
  const display = val != null && val !== 0 ? Number(val).toFixed(1) : '—';

  return (
    <div onClick={onClick} style={{ backgroundColor: selected ? 'var(--color-primary)' : s.bg, border:`1.5px solid ${selected ? 'var(--color-accent)' : s.border}`, borderRadius:'var(--radius-md)', padding:'14px 16px', cursor:'pointer', transition:'all 0.18s', position:'relative', overflow:'hidden', boxShadow: selected?'0 0 0 3px color-mix(in srgb,var(--color-primary) 25%,transparent),0 4px 12px color-mix(in srgb,var(--color-primary) 30%,transparent)':'none', transform: selected?'translateY(-2px)':'none' }}
      onMouseEnter={e => !selected && (e.currentTarget.style.transform='translateY(-2px)')}
      onMouseLeave={e => !selected && (e.currentTarget.style.transform='none')}>
      <div style={{ position:'absolute', left:0, top:0, bottom:0, width:3, backgroundColor: selected?'white':s.badge }} />
      <div style={{ paddingLeft:4 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
          <div style={{ fontSize:11, fontWeight:600, color: selected?'var(--overlay-white-70)':'var(--text-secondary)' }}>{kpi?.title}</div>
          {!selected && kpi?.status && kpi.status !== 'normal' && (
            <span style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:10, backgroundColor:s.badgeBg, color:s.badge }}>
              {kpi.status==='critical'?t('ui.告警','告警'):kpi.status==='warning'?t('ui.预警','预警'):t('ui.离线','离线')}
            </span>
          )}
        </div>
        <div style={{ display:'flex', alignItems:'baseline', gap:3 }}>
          <span style={{ fontSize:26, fontWeight:800, fontVariantNumeric:'tabular-nums', color: selected?'white':s.val }}>{display}</span>
          <span style={{ fontSize:11, color: selected?'rgba(255,255,255,0.6)':'var(--text-secondary)' }}>{kpi?.unit}</span>
        </div>
        {kpi?.compareTarget != null && val != null && (
          <div style={{ fontSize:10, marginTop:4, color: selected?'var(--overlay-white-50)':'var(--text-secondary)' }}>
            {t('ui.目标', '目标')} {kpi.compareTarget} · {t('ui.偏差', '偏差')} {(val - kpi.compareTarget).toFixed(1)}{kpi.unit}
          </div>
        )}
      </div>
    </div>
  );
}
