'use client';
import React from 'react';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { ACCENT_SOLID, type AccentColor } from '@/lib/design-tokens';
import { StatusBadge } from '../status/StatusBadge';

/**
 * KpiCardV2 — KPI 卡片单一来源（Design System V2）。
 * 暗色全部走 CSS 变量；强调色来自 design-tokens ACCENT_SOLID。
 * 禁止页面内再 `function KpiCard()`。
 *
 * props：title / value / delta(%) / trend / icon / status / accentColor / loading / onClick
 */
export interface KpiCardV2Props {
  title: string;
  value: string | number;
  subValue?: string;
  /** 变化百分比（正负），用于自动趋势箭头与颜色 */
  delta?: number;
  /** 显式趋势；不传则由 delta 推断 */
  trend?: 'up' | 'down' | 'flat';
  trendLabel?: string;
  icon?: React.ElementType;
  /** 状态徽章（右上角），传状态码即可，如 'CONFIRMED' */
  status?: string;
  accentColor?: AccentColor;
  loading?: boolean;
  onClick?: () => void;
}

export function KpiCardV2({
  title, value, subValue, delta, trend, trendLabel = '环比', icon: Icon,
  status, accentColor = 'blue', loading, onClick,
}: KpiCardV2Props) {
  const accent = ACCENT_SOLID[accentColor];
  const dir: 'up' | 'down' | 'flat' = trend ?? (delta == null ? 'flat' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat');
  const trendColor = dir === 'up' ? 'var(--status-success)' : dir === 'down' ? 'var(--status-danger)' : 'var(--text-secondary)';
  const TrendIcon = dir === 'up' ? ArrowUp : dir === 'down' ? ArrowDown : Minus;

  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative', background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderLeft: `var(--card-accent-width, 4px) solid ${accent}`, borderRadius: 'var(--radius-lg)',
        padding: '16px 18px', minHeight: 104, boxShadow: 'var(--shadow-sm)',
        cursor: onClick ? 'pointer' : 'default', transition: 'box-shadow .18s var(--ease)',
      }}
      onMouseEnter={(e) => { if (onClick) (e.currentTarget.style.boxShadow = 'var(--shadow-md)'); }}
      onMouseLeave={(e) => { if (onClick) (e.currentTarget.style.boxShadow = 'var(--shadow-sm)'); }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {Icon && (
            <div style={{
              width: 30, height: 30, borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `color-mix(in srgb, ${accent} 14%, transparent)`, color: accent, flexShrink: 0,
            }}>
              <Icon size={16} />
            </div>
          )}
          <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{title}</span>
        </div>
        {status && <StatusBadge status={status} />}
      </div>

      <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', marginTop: 10, lineHeight: 1.1 }}>
        {loading ? <span style={{ color: 'var(--text-disabled)' }}>…</span> : value}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
        {subValue && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{subValue}</span>}
        {delta != null && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12, fontWeight: 600, color: trendColor }}>
            <TrendIcon size={12} />{Math.abs(delta).toFixed(1)}% <span style={{ color: 'var(--text-disabled)', fontWeight: 400 }}>{trendLabel}</span>
          </span>
        )}
      </div>
    </div>
  );
}
