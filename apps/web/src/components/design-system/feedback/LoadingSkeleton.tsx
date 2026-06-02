'use client';
import React from 'react';

/**
 * LoadingSkeleton — 统一加载骨架屏（桌面端）。
 * 变体：line（文本行）/ card（卡片）/ table（表格行）。暗色经 CSS 变量适配。
 */
export interface LoadingSkeletonProps {
  variant?: 'line' | 'card' | 'table';
  rows?: number;
  cols?: number;
  width?: number | string;
  height?: number;
}

const shimmer: React.CSSProperties = {
  background: 'linear-gradient(90deg, var(--bg-muted) 25%, var(--border) 37%, var(--bg-muted) 63%)',
  backgroundSize: '400% 100%',
  animation: 'phx-skeleton 1.4s ease infinite',
  borderRadius: 'var(--radius-sm)',
};

export function LoadingSkeleton({ variant = 'line', rows = 3, cols = 4, width = '100%', height = 14 }: LoadingSkeletonProps) {
  if (variant === 'card') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 16 }}>
            <div style={{ ...shimmer, height: 12, width: '50%', marginBottom: 12 }} />
            <div style={{ ...shimmer, height: 24, width: '70%' }} />
          </div>
        ))}
      </div>
    );
  }
  if (variant === 'table') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>
            {Array.from({ length: cols }).map((__, c) => (
              <div key={c} style={{ ...shimmer, height: 14 }} />
            ))}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ ...shimmer, height, width: i === rows - 1 ? '60%' : width }} />
      ))}
    </div>
  );
}
