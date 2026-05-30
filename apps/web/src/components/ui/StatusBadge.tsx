'use client';
/**
 * StatusBadge — 统一状态徽章
 * ===========================
 * 消费 design-tokens.ts 中的 STATUS_CLASS / STATUS_LABEL，
 * 一致地渲染所有模块的状态标签（订单/审批/信用/配送…）。
 *
 * 用法：
 *   <StatusBadge status="ACTIVE" />
 *   <StatusBadge status="PENDING" label="待处理" size="sm" />
 */
import React from 'react';
import { STATUS_CLASS, STATUS_LABEL } from '@/lib/design-tokens';
import { cn } from '@/lib/utils';

export interface StatusBadgeProps {
  /** 状态 key（对应 STATUS_CLASS/STATUS_LABEL 的 key，不区分大小写） */
  status: string;
  /** 可覆盖自动映射的中文标签 */
  label?: string;
  /** sm = 更紧凑；md = 默认 */
  size?: 'sm' | 'md';
  /** 附加 className */
  className?: string;
}

export function StatusBadge({
  status,
  label,
  size = 'md',
  className = '',
}: StatusBadgeProps) {
  const key = status?.toUpperCase() ?? '';
  const cls = STATUS_CLASS[key as keyof typeof STATUS_CLASS]
    ?? 'text-slate-600 bg-slate-100 dark:text-slate-400 dark:bg-slate-800';
  const displayLabel = label ?? STATUS_LABEL[key] ?? key;

  return (
    <span
      className={cn(
        'inline-flex items-center font-semibold rounded-full',
        size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5',
        cls,
        className,
      )}
    >
      {displayLabel}
    </span>
  );
}

export default StatusBadge;
