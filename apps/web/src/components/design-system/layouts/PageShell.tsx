'use client';
import React from 'react';

/**
 * PageShell — 统一页面骨架：标题 / 说明 / 主操作区 + 内容区。
 * 提供 UI-2.3 页面模板的基础容器；标题样式统一,暗色经 CSS 变量适配。
 */
export interface PageShellProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: number;
}

export function PageShell({ title, subtitle, actions, children, maxWidth }: PageShellProps) {
  return (
    <div style={{ padding: 24, maxWidth, margin: maxWidth ? '0 auto' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-primary)' }}>{title}</h1>
          {subtitle && <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{subtitle}</p>}
        </div>
        {actions && <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
      </div>
      {children}
    </div>
  );
}
