'use client';
import React from 'react';
import { AlertTriangle, Info, AlertCircle, CheckCircle2 } from 'lucide-react';

/**
 * WarningCard — 预警/提示卡（驾驶舱告警、风险提示用）。
 * level 决定色彩(全部来自 design-tokens 状态色)。暗色经 CSS 变量适配。
 */
export interface WarningCardProps {
  level?: 'danger' | 'warning' | 'info' | 'success';
  title: string;
  message?: React.ReactNode;
  action?: React.ReactNode;
}

const MAP = {
  danger:  { color: 'var(--status-danger)',  Icon: AlertCircle },
  warning: { color: 'var(--status-warning)', Icon: AlertTriangle },
  info:    { color: 'var(--status-info)',     Icon: Info },
  success: { color: 'var(--status-success)',  Icon: CheckCircle2 },
};

export function WarningCard({ level = 'warning', title, message, action }: WarningCardProps) {
  const { color, Icon } = MAP[level];
  return (
    <div style={{ display: 'flex', gap: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: `4px solid ${color}`, borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
      <div style={{ color, flexShrink: 0, marginTop: 1 }}><Icon size={18} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
        {message && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 3 }}>{message}</div>}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}
