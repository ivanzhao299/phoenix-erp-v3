import React from 'react';

/**
 * StatusBadge — Server Component
 */
const colorMap: Record<string, { bg: string; color: string }> = {
  success: { bg: 'color-mix(in srgb, var(--status-success) 16%, var(--bg-card))', color: 'var(--status-success)' },
  danger:  { bg: 'color-mix(in srgb, var(--status-danger)  16%, var(--bg-card))', color: 'var(--status-danger)'  },
  warning: { bg: 'color-mix(in srgb, var(--status-warning) 16%, var(--bg-card))', color: 'var(--status-warning)' },
  info:    { bg: 'color-mix(in srgb, var(--status-info)    16%, var(--bg-card))', color: 'var(--status-info)'    },
  special: { bg: 'color-mix(in srgb, var(--status-special) 16%, var(--bg-card))', color: 'var(--status-special)' },
  default: { bg: 'var(--bg-muted)', color: 'var(--text-secondary)' },
};

interface StatusBadgeProps {
  status?: keyof typeof colorMap;
  label: string;
  dot?: boolean;
}

export default function StatusBadge({ status = 'default', label, dot = true }: StatusBadgeProps) {
  const c = colorMap[status] ?? colorMap.default;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 999,
      fontSize: 12, fontWeight: 600,
      background: c.bg, color: c.color,
      whiteSpace: 'nowrap',
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.color, flexShrink: 0 }} />}
      {label}
    </span>
  );
}
