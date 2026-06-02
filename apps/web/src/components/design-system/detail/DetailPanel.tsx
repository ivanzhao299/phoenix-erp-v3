'use client';
import React from 'react';

/**
 * DetailPanel — 统一详情面板：标题 + 键值对网格 + 自定义区块。
 * 取代各页手写 key-value 详情（股东/客户/订单/审批/资本流详情）。暗色经 CSS 变量适配。
 *
 * 用法：
 *   <DetailPanel title="资本流详情" items={[
 *     { label:'编号', value: f.no },
 *     { label:'金额', value: `¥${money(f.amount)}`, emphasis:true },
 *   ]}>
 *     <AuditTimeline ... />
 *   </DetailPanel>
 */
export interface DetailItem {
  label: string;
  value: React.ReactNode;
  /** 跨整行显示 */
  full?: boolean;
  /** 主色强调（金额等） */
  emphasis?: boolean;
}
export interface DetailPanelProps {
  title?: string;
  items: DetailItem[];
  columns?: number;
  children?: React.ReactNode;
}

export function DetailPanel({ title, items, columns = 2, children }: DetailPanelProps) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
      {title && <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-primary)', marginBottom: 14 }}>{title}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '12px 24px' }}>
        {items.map((it, i) => (
          <div key={i} style={{ gridColumn: it.full ? '1 / -1' : undefined }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 3 }}>{it.label}</div>
            <div style={{ fontSize: it.emphasis ? 16 : 13.5, fontWeight: it.emphasis ? 700 : 500, color: it.emphasis ? 'var(--color-primary)' : 'var(--text-primary)' }}>
              {it.value ?? '—'}
            </div>
          </div>
        ))}
      </div>
      {children && <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 16 }}>{children}</div>}
    </div>
  );
}
