'use client';
import React from 'react';
import { Inbox } from 'lucide-react';

/**
 * EmptyState — 统一空状态（桌面端）。暗色经 CSS 变量自动适配。
 * 用法：<EmptyState title="暂无数据" description="..." action={<Button>新增</Button>} />
 */
export interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ElementType;
  action?: React.ReactNode;
  compact?: boolean;
}

export function EmptyState({ title = '暂无数据', description, icon: Icon = Inbox, action, compact }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', gap: 10, padding: compact ? '24px 16px' : '48px 24px',
        color: 'var(--text-secondary)',
      }}
    >
      <div
        style={{
          width: compact ? 40 : 56, height: compact ? 40 : 56, borderRadius: 'var(--radius-lg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--bg-muted)', color: 'var(--text-disabled)',
        }}
      >
        <Icon size={compact ? 20 : 28} />
      </div>
      <div style={{ fontSize: compact ? 14 : 15, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
      {description && <div style={{ fontSize: 13, maxWidth: 360 }}>{description}</div>}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  );
}
