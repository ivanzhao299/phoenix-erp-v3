import React from 'react';

/**
 * KpiCard — Server Component
 * 纯展示，无交互，无需 'use client'
 */

const ACCENT_MAP: Record<string, string> = {
  primary:    'var(--color-primary)',
  accent:     'var(--color-accent)',
  success:    'var(--status-success)',
  warning:    'var(--status-warning)',
  danger:     'var(--status-danger)',
  info:       'var(--status-info)',
  special:    'var(--status-special)',
  neutral:    'var(--text-secondary)',
};

const ICON_BG_MAP: Record<string, string> = {
  primary:    'color-mix(in srgb, var(--color-primary) 12%, transparent)',
  accent:     'color-mix(in srgb, var(--color-accent)  12%, transparent)',
  success:    'color-mix(in srgb, var(--status-success) 12%, transparent)',
  warning:    'color-mix(in srgb, var(--status-warning) 12%, transparent)',
  danger:     'color-mix(in srgb, var(--status-danger)  12%, transparent)',
  info:       'color-mix(in srgb, var(--status-info)    12%, transparent)',
  special:    'color-mix(in srgb, var(--status-special) 12%, transparent)',
  neutral:    'var(--bg-muted)',
};

interface KpiCardProps {
  title: string;
  value: string | number;
  unit?: string;
  /** positive = up, negative = down */
  trend?: number;
  trendLabel?: string;
  icon?: React.ReactNode;
  /** semantic key OR raw CSS color */
  iconTheme?: string;
  /** semantic key OR raw CSS color */
  accentTheme?: string;
}

export default function KpiCard({
  title, value, unit, trend, trendLabel,
  icon, iconTheme = 'neutral', accentTheme = 'accent',
}: KpiCardProps) {
  const accentColor = ACCENT_MAP[accentTheme]  ?? accentTheme;
  const iconBg      = ICON_BG_MAP[iconTheme]   ?? iconTheme;
  const iconColor   = ACCENT_MAP[iconTheme]    ?? iconTheme;

  const isUp   = (trend ?? 0) > 0;
  const isDown = (trend ?? 0) < 0;

  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: 'var(--radius-lg)',
      padding: '20px',
      boxShadow: 'var(--shadow-sm)',
      border: '1px solid var(--border)',
      borderLeft: `4px solid ${accentColor}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500, marginBottom: '8px' }}>
            {title}
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
              {value}
            </span>
            {unit && (
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>{unit}</span>
            )}
          </div>
          {trend !== undefined && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
              <span style={{
                fontSize: '12px', fontWeight: 600,
                color: isUp ? 'var(--status-success)' : isDown ? 'var(--status-danger)' : 'var(--text-secondary)',
              }}>
                {isUp ? '↑' : isDown ? '↓' : '—'} {Math.abs(trend)}%
              </span>
              {trendLabel && (
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{trendLabel}</span>
              )}
            </div>
          )}
        </div>
        {icon && (
          <div style={{
            width: 48, height: 48, borderRadius: 'var(--radius-md)',
            background: iconBg, color: iconColor,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
