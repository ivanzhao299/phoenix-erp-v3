'use client';

/**
 * KpiCardV2 — Phoenix DS 金融驾驶舱 KPI 卡（UIX-PROD-2）
 *
 * 设计：
 *   · 深色渐变 header（按 tone 配色）
 *   · 大字数值 + suffix + delta（趋势）
 *   · 可选 progress bar / segments 比例条
 *   · 可选 footer hint（说明 / context）
 *
 * 用法：
 *   <KpiCardV2 tone="success" icon={<Activity size={14} />}
 *     label="运行中" value={30} suffix="条" delta="+2"
 *     progress={{ value: 100 }} hint="健康度 100%" />
 */

import { ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export type KpiTone = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

interface ProgressSpec {
  value: number;               // 0-100
  segments?: Array<{ value: number; tone: KpiTone }>;
}

export interface KpiCardV2Props {
  label: string;
  value: ReactNode;
  suffix?: string;
  icon?: ReactNode;
  tone?: KpiTone;
  delta?: string;              // "+2 / -3 / ↗"
  deltaDir?: 'up' | 'down' | 'flat';
  progress?: ProgressSpec;
  hint?: ReactNode;
  href?: string;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

const TONE: Record<KpiTone, { fg: string; bg: string; bgFaint: string; accent: string }> = {
  default: { fg: 'var(--text-primary)',     bg: 'var(--bg-muted)',               bgFaint: 'var(--bg-card)',              accent: 'var(--text-secondary)' },
  brand:   { fg: 'var(--color-primary)',    bg: 'var(--color-primary)',          bgFaint: 'var(--status-info-bg-faint)', accent: 'var(--color-primary)' },
  info:    { fg: 'var(--status-info)',      bg: 'var(--status-info-bg)',         bgFaint: 'var(--status-info-bg-faint)', accent: 'var(--status-info)' },
  success: { fg: 'var(--status-success)',   bg: 'var(--status-success-bg)',      bgFaint: 'var(--status-success-bg-faint)', accent: 'var(--status-success)' },
  warning: { fg: 'var(--status-warning)',   bg: 'var(--status-warning-bg)',      bgFaint: 'var(--status-warning-bg-faint)', accent: 'var(--status-warning)' },
  danger:  { fg: 'var(--status-danger)',    bg: 'var(--status-danger-bg)',       bgFaint: 'var(--status-danger-bg-faint)', accent: 'var(--status-danger)' },
};

const SIZE = {
  sm: { pad: 12, valSize: 20, labelSize: 11, gap: 4, minH: 72 },
  md: { pad: 14, valSize: 24, labelSize: 11, gap: 6, minH: 86 },
  lg: { pad: 18, valSize: 32, labelSize: 12, gap: 8, minH: 108 },
};

export function KpiCardV2(props: KpiCardV2Props) {
  const { label, value, suffix, icon, tone = 'default', delta, deltaDir, progress, hint, href, onClick, size = 'md' } = props;
  const t = TONE[tone];
  const sz = SIZE[size];
  const Tag: any = href ? 'a' : (onClick ? 'button' : 'div');
  const TrendIcon = deltaDir === 'up' ? TrendingUp : deltaDir === 'down' ? TrendingDown : Minus;
  const clickable = !!(href || onClick);

  return (
    <Tag
      href={href}
      onClick={onClick}
      style={{
        position: 'relative',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        padding: sz.pad,
        display: 'flex',
        flexDirection: 'column',
        gap: sz.gap,
        minHeight: sz.minH,
        textDecoration: 'none',
        color: 'inherit',
        cursor: clickable ? 'pointer' : 'default',
        overflow: 'hidden',
        transition: clickable ? 'transform 0.15s, box-shadow 0.15s' : 'none',
        textAlign: 'left',
        ...(clickable ? { background: 'var(--bg-card)' } : {}),
      }}
      onMouseEnter={clickable ? (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px var(--overlay-black-10)'; } : undefined}
      onMouseLeave={clickable ? (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; } : undefined}
    >
      {/* 左侧色条 */}
      <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: t.accent }} />

      {/* Row 1: icon + label + delta */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
        {icon && <span style={{ color: t.accent, display: 'inline-flex' }}>{icon}</span>}
        <span style={{ fontSize: sz.labelSize, fontWeight: 500, letterSpacing: 0.2 }}>{label}</span>
        {delta && (
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, fontWeight: 600, color: t.fg }}>
            <TrendIcon size={10} /> {delta}
          </span>
        )}
      </div>

      {/* Row 2: value */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <strong style={{ fontSize: sz.valSize, fontWeight: 700, color: t.fg, lineHeight: 1.1 }}>{value}</strong>
        {suffix && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{suffix}</span>}
      </div>

      {/* Row 3: progress */}
      {progress && (
        <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', background: 'var(--bg-muted)' }}>
          {progress.segments
            ? progress.segments.map((s, i) => (
                <span key={i} aria-hidden style={{ background: TONE[s.tone].accent, width: `${Math.max(s.value, 0)}%`, height: '100%' }} />
              ))
            : <span aria-hidden style={{ background: t.accent, width: `${Math.max(0, Math.min(100, progress.value))}%`, height: '100%' }} />}
        </div>
      )}

      {/* Row 4: hint */}
      {hint && <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{hint}</div>}
    </Tag>
  );
}

export default KpiCardV2;
