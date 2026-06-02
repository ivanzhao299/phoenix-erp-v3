'use client';
import React from 'react';

/**
 * ChartCard — 图表容器卡片（标题 + 内容槽）。
 * 配合 design-tokens 的 CHART_PALETTE / getSeriesColor 使用；图表色禁止硬编码。
 * 用法：<ChartCard title="资本流趋势"><ResponsiveContainer>...<Bar fill={CHART_PALETTE.shareholder}/></ResponsiveContainer></ChartCard>
 */
export interface ChartCardProps {
  title?: string;
  extra?: React.ReactNode;
  height?: number;
  children: React.ReactNode;
}

export function ChartCard({ title, extra, height, children }: ChartCardProps) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 16, boxShadow: 'var(--shadow-sm)' }}>
      {(title || extra) && (
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
          {title && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary)' }}>{title}</div>}
          {extra && <div style={{ marginLeft: 'auto' }}>{extra}</div>}
        </div>
      )}
      <div style={{ height }}>{children}</div>
    </div>
  );
}
