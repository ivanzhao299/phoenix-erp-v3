'use client';
import React from 'react';
import { ACCENT_SOLID, type AccentColor } from '@/lib/design-tokens';

/**
 * MetricCard — 紧凑指标卡（图标 + 标签 + 数值，单行排布）。
 * 比 KpiCardV2 更轻，适合密集指标条。暗色经 CSS 变量适配。
 */
export interface MetricCardProps {
  label: string;
  value: string | number;
  icon?: React.ElementType;
  accentColor?: AccentColor;
  hint?: string;
}

export function MetricCard({ label, value, icon: Icon, accentColor = 'blue', hint }: MetricCardProps) {
  const accent = ACCENT_SOLID[accentColor];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px', boxShadow: 'var(--shadow-sm)' }}>
      {Icon && (
        <div style={{ width: 38, height: 38, borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${accent} 14%, transparent)`, color: accent, flexShrink: 0 }}>
          <Icon size={18} />
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginTop: 1 }}>{value}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--text-disabled)' }}>{hint}</div>}
      </div>
    </div>
  );
}
