'use client';
/**
 * KpiCard — 标准 KPI 指标卡片
 * ============================
 * 用于所有仪表盘页面的核心指标展示。
 *
 * 用法：
 *   <KpiCard label="现金余额" value="¥ 128,000" icon={Wallet} accentColor="blue" />
 */
import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { ACCENT_MAP, type AccentColor } from '@/lib/design-tokens';

export interface KpiCardProps {
  /** 指标标签 */
  label: string;
  /** 主值（字符串或数字） */
  value: string | number;
  /** 次级说明（如单位、来源） */
  subValue?: string;
  /** 趋势百分比，正为上涨，负为下跌 */
  trend?: number;
  /** 趋势说明文字，如"较昨日" */
  trendLabel?: string;
  /** Lucide 图标组件 */
  icon: React.ElementType;
  /** 语义强调色，决定图标背景和文字颜色 */
  accentColor?: AccentColor;
  /** 加载态 */
  loading?: boolean;
  /** 可点击跳转 */
  onClick?: () => void;
  /** 附加 className */
  className?: string;
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
  const isClickable = !!onClick;

  if (loading) {
    return (
      <div className={[
        'rounded-2xl border border-slate-100 dark:border-slate-700',
        'bg-white dark:bg-slate-800 p-5 shadow-sm',
        className,
      ].join(' ')}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 animate-pulse flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded animate-pulse w-20" />
            <div className="h-6 bg-slate-100 dark:bg-slate-700 rounded animate-pulse w-32" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={[
        'rounded-2xl border p-5 shadow-sm transition-all',
        'bg-white dark:bg-slate-800',
        ac.border,
        isClickable
          ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5'
          : '',
        className,
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        {/* 图标区 */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${ac.icon}`}>
          <Icon size={20} className={ac.text} />
        </div>

        {/* 数值区 */}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 truncate">{label}</div>
          <div className={`text-xl font-extrabold leading-tight ${ac.text} truncate`}>
            {value}
          </div>
          {subValue && (
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">{subValue}</div>
          )}
        </div>
      </div>

      {/* 趋势区（可选） */}
      {trend !== undefined && (
        <div className="flex items-center gap-1 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
          {trend > 0 ? (
            <TrendingUp size={12} className="text-emerald-500 flex-shrink-0" />
          ) : trend < 0 ? (
            <TrendingDown size={12} className="text-red-500 flex-shrink-0" />
          ) : (
            <Minus size={12} className="text-slate-400 flex-shrink-0" />
          )}
          <span className={`text-xs font-semibold ${
            trend > 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : trend < 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-slate-400'
          }`}>
            {trend > 0 ? '+' : ''}{trend}%
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500">{trendLabel}</span>
        </div>
      )}
    </div>
  );
}

export default KpiCard;
