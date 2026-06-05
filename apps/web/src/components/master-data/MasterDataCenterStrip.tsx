'use client';

/**
 * MasterDataCenterStrip — UIX-PROD-1 主数据中心运营 KPI 条
 *
 * 在 11 类主数据列表页顶部展示"运营 KPI"卡片（总数 / 启用 / 待审批 / 风险），
 * 让用户第一眼看到的不是表格而是业务态势。
 *
 * 单独 fetch /master-data/operations/centers（与工作台同源），按 type pick KPI。
 * 失败静默，不阻塞列表渲染。
 */

import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, Clock, Snowflake } from 'lucide-react';
import request from '@/lib/api-client';

interface MemberStat {
  type: string;
  total: number;
  active: number;
  pending: number;
  frozen: number;
  archived: number;
}
interface CenterStat {
  key: string;
  label: string;
  members: MemberStat[];
}

type Tone = 'default' | 'success' | 'warning' | 'danger';

const TONE_COLOR: Record<Tone, string> = {
  default: 'var(--text-primary)',
  success: 'var(--status-success)',
  warning: 'var(--status-warning)',
  danger:  'var(--status-danger)',
};

export function MasterDataCenterStrip({ type, centerLabel }: { type: string; centerLabel?: string }) {
  const [stat, setStat] = useState<MemberStat | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    request<CenterStat[]>('/master-data/operations/centers')
      .then(centers => {
        if (cancelled) return;
        const found = centers.flatMap(c => c.members).find(m => m.type === type);
        setStat(found ?? null);
      })
      .catch(() => { /* 静默 */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [type]);

  if (loading) {
    return (
      <div style={wrapperStyle} aria-hidden>
        {[0,1,2,3].map(i => (
          <div key={i} style={{ ...cardStyle, opacity: 0.4, background: 'var(--bg-muted)' }} />
        ))}
      </div>
    );
  }
  if (!stat) return null;

  const live = Math.max(stat.total - stat.archived, 0);
  const health = live > 0 ? Math.round((stat.active / live) * 100) : 100;

  const items: Array<{ label: string; icon: any; value: number | string; suffix?: string; tone?: Tone; hint?: string }> = [
    { label: '在管总数',  icon: Activity,    value: stat.total,        suffix: '条' },
    { label: '运行中',    icon: CheckCircle2, value: stat.active,      suffix: '条', tone: 'success', hint: `健康度 ${health}%` },
    { label: '待审批',    icon: Clock,        value: stat.pending,     suffix: '单', tone: stat.pending > 0 ? 'warning' : 'default' },
    { label: '冻结/风险', icon: Snowflake,    value: stat.frozen,      suffix: '条', tone: stat.frozen > 0 ? 'danger' : 'default' },
  ];

  return (
    <div style={wrapperStyle}>
      {items.map((it, i) => (
        <div key={i} style={cardStyle}>
          <div style={cardHeaderStyle}>
            <it.icon size={14} />
            <span style={cardLabelStyle}>{it.label}</span>
          </div>
          <div style={{ ...cardValueStyle, color: TONE_COLOR[it.tone || 'default'] }}>
            {it.value}
            {it.suffix && <span style={cardSuffixStyle}> {it.suffix}</span>}
          </div>
          {it.hint && <div style={cardHintStyle}>{it.hint}</div>}
        </div>
      ))}
      {centerLabel && (
        <div style={centerLabelStyle}>
          <span>{centerLabel}</span>
        </div>
      )}
    </div>
  );
}

const wrapperStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: 12,
  marginBottom: 20,
};

const cardStyle: React.CSSProperties = {
  padding: '14px 16px',
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-card)',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minHeight: 76,
};

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  color: 'var(--text-secondary)',
};

const cardLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
};

const cardValueStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  lineHeight: 1.2,
};

const cardSuffixStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-secondary)',
  fontWeight: 500,
  marginLeft: 2,
};

const cardHintStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-secondary)',
};

const centerLabelStyle: React.CSSProperties = {
  position: 'absolute',
  display: 'none',
};

export default MasterDataCenterStrip;
