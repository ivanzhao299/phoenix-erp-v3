'use client';
import React from 'react';

/**
 * DetailGrid — 纯键值对网格（无卡片外框，嵌入 DetailPanel 或自定义容器）。
 * 比 DetailPanel 更轻，仅排布键值。暗色经 CSS 变量适配。
 */
export interface DetailGridItem { label: string; value: React.ReactNode; full?: boolean; }
export function DetailGrid({ items, columns = 2 }: { items: DetailGridItem[]; columns?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '12px 24px' }}>
      {items.map((it, i) => (
        <div key={i} style={{ gridColumn: it.full ? '1 / -1' : undefined }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 3 }}>{it.label}</div>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-primary)' }}>{it.value ?? '—'}</div>
        </div>
      ))}
    </div>
  );
}
