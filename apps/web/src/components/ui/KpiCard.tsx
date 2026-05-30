'use client';
/**
 * KpiCard — 全局标准 KPI 指标卡片 · Design System V2
 * =====================================================
 * 设计准则：
 *   · 图标独立成行（不与文字并列），视觉锚点清晰
 *   · 标签 text-xs text-text-dim（辅助，弱化）
 *   · 主值 text-2xl font-bold（核心数字，最大权重）
 *   · 次级说明 text-sm text-text-muted（可读，不抢镜）
 *   · 元素间距 mb-1.5 / mb-2 / mt-4，保证足够呼吸感
 */
import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { ACCENT_MAP, type AccentColor } from '@/lib/design-tokens';
import { cn } from '@/lib/utils';

export interface KpiCardProps {
  label:        string;
  value:        string | number;
  subValue?:    string;
  trend?:       number;
  trendLabel?:  string;
  icon:         React.ElementType;
  accentColor?: AccentColor;
  loading?:     boolean;
  onClick?:     () => void;
  className?:   string;
}

export function KpiCard({
  label,
  value,
  subValue,
  trend,
  trendLabel = '较昨日',
  icon: Icon,
  accentColor = 'blue',
  loading = false,
  onClick,
  className = '',
}: KpiCardProps) {
  const ac = ACCENT_MAP[accentColor];

  /* ── 骨架屏 ─────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className={cn('rounded-2xl border border-border bg-bg-card p-5', className)}>
        <div className="w-11 h-11 rounded-xl bg-bg-muted animate-pulse mb-4" />
        <div className="space-y-2.5">
          <div className="h-3   bg-bg-muted rounded animate-pulse w-3/4" />
          <div className="h-7   bg-bg-muted rounded animate-pulse w-full" />
          <div className="h-3.5 bg-bg-muted rounded animate-pulse w-1/2" />
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-2xl border p-5 transition-all bg-bg-card shadow-card',
        ac.border,
        onClick ? 'cursor-pointer hover:shadow-card-hover hover:-translate-y-0.5' : '',
        className,
      )}
    >
      {/* 图标 — 独立成行，不与文字并列 */}
      <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center mb-4', ac.icon)}>
        <Icon size={20} className={ac.text} />
      </div>

      {/* 标签：辅助信息，字号小、颜色淡 */}
      <div className="text-xs text-text-dim font-medium tracking-wide mb-1.5">
        {label}
      </div>

      {/* 主值：最大视觉权重 */}
      <div className={cn('text-2xl font-bold leading-none mb-2 truncate', ac.text)}>
        {value}
      </div>

      {/* 次级说明：text-sm 可读，不用 text-xs */}
      {subValue && (
        <div className="text-sm text-text-muted leading-snug">
          {subValue}
        </div>
      )}

      {/* 趋势（可选）*/}
      {trend !== undefined && (
        <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-border">
          {trend > 0
            ? <TrendingUp   size={13} className="text-success flex-shrink-0" />
            : trend < 0
              ? <TrendingDown size={13} className="text-danger  flex-shrink-0" />
              : <Minus        size={13} className="text-text-dim flex-shrink-0" />
          }
          <span className={cn(
            'text-sm font-semibold',
            trend > 0 ? 'text-success' : trend < 0 ? 'text-danger' : 'text-text-dim',
          )}>
            {trend > 0 ? '+' : ''}{trend}%
          </span>
          <span className="text-xs text-text-dim">{trendLabel}</span>
        </div>
      )}
    </div>
  );
}

export default KpiCard;
