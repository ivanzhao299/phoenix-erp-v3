'use client';
/**
 * StatStrip — 全系统统一「次级指标带」
 * =====================================================
 * 内容分层原则：顶层主摘要用大卡 KpiCard；次级/概览类指标用本组件 —
 *   · 单个白底面板内承载多个迷你统计（label + value），分隔线区隔
 *   · 中性色为主，仅关键项可着重点色，视觉比 KpiCard 轻一档
 *   · 避免整页同款大卡造成的「凌乱重复」
 *
 * 用法：
 *   <StatStrip items={[
 *     { label: '今日配送', value: 6 },
 *     { label: '逾期应收', value: '¥0', accentColor: 'red' },
 *   ]} minWidth={150} />
 */
import React from 'react';
import { ACCENT_SOLID, type AccentColor } from '@/lib/design-tokens';

export interface StatStripItem {
  label:        string;
  value:        string | number;
  /** 仅需着重的关键项传色，其余保持中性 */
  accentColor?: AccentColor;
}

export interface StatStripProps {
  items:     StatStripItem[];
  /** 单个迷你统计最小宽度（自适应换行）*/
  minWidth?: number;
  className?: string;
}

export function StatStrip({ items, minWidth = 150, className }: StatStripProps) {
  return (
    <div
      className={className}
      style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)',
        display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`,
        overflow: 'hidden',
      }}
    >
      {items.map((it, i) => (
        <div
          key={`${it.label}-${i}`}
          style={{
            padding: '14px 20px',
            borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500, marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {it.label}
          </div>
          <div style={{
            fontSize: 22, fontWeight: 700, lineHeight: 1,
            color: it.accentColor ? ACCENT_SOLID[it.accentColor] : 'var(--text-primary)',
          }}>
            {it.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export default StatStrip;
