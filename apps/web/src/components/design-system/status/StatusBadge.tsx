'use client';
import React from 'react';
import { STATUS_CLASS, STATUS_LABEL } from '@/lib/design-tokens';

/**
 * StatusBadge（Design System V2）— 状态徽章单一来源。
 * 颜色/暗色全部来自 design-tokens.ts 的 STATUS_CLASS（含 dark: 配对）。
 * 禁止页面再写 STATUS_COLOR 常量或 PageHeader 内置 StatusBadge。
 *
 * 支持状态（含但不限于）：
 *   SUCCESS/WARNING/INFO/DANGER/NEUTRAL/PENDING/APPROVED/REJECTED/CONFIRMED/CANCELLED/PROVISIONAL ...
 */
export interface StatusBadgeProps {
  status: string;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

// PROVISIONAL（暂定）等 design-tokens 未含的补充映射 → 复用既有语义类
const EXTRA_CLASS: Record<string, string> = {
  PROVISIONAL: 'text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/40',
  REVERSED:    'text-red-700   bg-red-50   dark:text-red-300   dark:bg-red-950/40',
};
const EXTRA_LABEL: Record<string, string> = {
  PROVISIONAL: '暂定', REVERSED: '已冲销',
};

export function StatusBadge({ status, label, size = 'sm', className = '' }: StatusBadgeProps) {
  const key = (status || '').toUpperCase();
  const cls = STATUS_CLASS[key] || EXTRA_CLASS[key] || 'text-text-muted bg-bg-muted';
  const text = label || STATUS_LABEL[key] || EXTRA_LABEL[key] || status || '—';
  const pad = size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[11px]';
  return (
    <span className={`inline-flex items-center rounded-full font-semibold whitespace-nowrap ${pad} ${cls} ${className}`}>
      {text}
    </span>
  );
}
