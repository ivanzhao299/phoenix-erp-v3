'use client';
import React from 'react';
import { STATUS_CLASS, STATUS_LABEL } from '@/lib/design-tokens';

/**
 * 轻量展示组件（Design System V2 · UI-2.5）。
 */

/** MoneyDisplay — 金额展示(千分位 + 货币符 + 正负色) */
export function MoneyDisplay({ value, currency = 'CNY', colorBySign, bold }: {
  value: number | string | null | undefined; currency?: string; colorBySign?: boolean; bold?: boolean;
}) {
  const sym: Record<string, string> = { CNY: '¥', USD: '$', LAK: '₭', EUR: '€' };
  if (value == null || value === '') return <span>—</span>;
  const n = Number(value);
  const color = colorBySign ? (n < 0 ? 'var(--status-danger)' : 'var(--text-primary)') : undefined;
  return (
    <span style={{ color, fontWeight: bold ? 700 : undefined, fontVariantNumeric: 'tabular-nums' }}>
      {sym[currency] || currency}{n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}

/** DateDisplay — 日期展示(统一 YYYY-MM-DD / 含时间) */
export function DateDisplay({ value, withTime }: { value?: string | null; withTime?: boolean }) {
  if (!value) return <span>—</span>;
  return <span>{withTime ? new Date(value).toLocaleString('zh-CN') : String(value).slice(0, 10)}</span>;
}

/** CompactStatusBadge — 紧凑状态点(列表密集场景,圆点 + 文字) */
export function CompactStatusBadge({ status, label }: { status: string; label?: string }) {
  const key = (status || '').toUpperCase();
  const text = label || STATUS_LABEL[key] || status || '—';
  const cls = STATUS_CLASS[key] || 'text-text-muted';
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${cls.split(' ').filter(c => c.startsWith('text-')).join(' ')}`}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
      {text}
    </span>
  );
}
