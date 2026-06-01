'use client';
import React from 'react';

/** 明细表上方的合计/汇总条（一目了然） */
export function SummaryBar({ items }: { items: { label: string; value: string; accent?: boolean }[] }) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 0, background: '#fff', borderRadius: 10,
      boxShadow: '0 1px 3px rgba(0,0,0,.08)', padding: '4px 0', marginBottom: 14, overflow: 'hidden',
    }}>
      {items.map((it, i) => (
        <div key={i} style={{
          flex: '1 1 160px', padding: '10px 18px', borderLeft: i === 0 ? 'none' : '1px solid #eee',
        }}>
          <div style={{ fontSize: 12, color: '#888' }}>{it.label}</div>
          <div style={{ fontSize: it.accent ? 20 : 17, fontWeight: 700, color: it.accent ? '#1F4E79' : '#333', marginTop: 2 }}>{it.value}</div>
        </div>
      ))}
    </div>
  );
}

export const sum = (arr: any[], pick: (x: any) => number) => arr.reduce((a, x) => a + (pick(x) || 0), 0);
export const yuan = (v: number) => '¥' + v.toLocaleString('zh-CN', { minimumFractionDigits: 2 });
