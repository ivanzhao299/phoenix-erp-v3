'use client';
import React from 'react';

/**
 * StatStripV2 — 合计/汇总条（明细表上方一目了然的合计数字）。
 * 取代 shareholders/SummaryBar。首项可 accent 强调。暗色经 CSS 变量适配。
 */
export interface StatStripItem { label: string; value: string; accent?: boolean; }
export interface StatStripV2Props { items: StatStripItem[]; minWidth?: number; }

export function StatStripV2({ items, minWidth = 160 }: StatStripV2Props) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden', marginBottom: 14 }}>
      {items.map((it, i) => (
        <div key={i} style={{ flex: `1 1 ${minWidth}px`, padding: '12px 18px', borderLeft: i === 0 ? 'none' : '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{it.label}</div>
          <div style={{ fontSize: it.accent ? 20 : 17, fontWeight: 700, color: it.accent ? 'var(--color-primary)' : 'var(--text-primary)', marginTop: 2 }}>{it.value}</div>
        </div>
      ))}
    </div>
  );
}

/** SummaryCard — 单卡汇总（标题 + 大数字 + 说明），驾驶舱用。 */
export interface SummaryCardProps { title: string; value: string; sub?: string; }
export function SummaryCard({ title, value, sub }: SummaryCardProps) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 18, boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--color-primary)', marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--text-disabled)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
