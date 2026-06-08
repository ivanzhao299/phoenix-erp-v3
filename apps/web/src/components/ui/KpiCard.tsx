'use client';
/**
 * @deprecated G27-A — 旧版 KpiCard。
 *
 * 新业务页一律使用 design-system/KpiCardV2（tone-based 接口）：
 *   import { KpiCardV2 } from '@/components/design-system/KpiCardV2';
 *
 * 本文件保留是因为 7 个老业务页（finance2/sales2/*）大量使用 accentColor 接口，
 * props 不兼容 V2，强迁移工作量大且无业务价值。
 * 等业务方报视觉一致性问题时再单独迁移单页。
 *
 * KpiCard — 全系统统一 KPI 指标卡片（旧 API）
 * =====================================================
 * 单一标准：与「生产管理（养殖）」首页卡片完全一致 —
 *   · 白底卡片 + 左侧 4px 主色强调条（borderLeft）
 *   · 右上淡色图标盒（color-mix 12%）
 *   · 大号主色数字（28px，最大视觉权重）
 *   · 克制配色，不用大面积粉彩底
 */
import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { ACCENT_SOLID, type AccentColor } from '@/lib/design-tokens';
import { cn } from '@/lib/utils';

export interface KpiCardProps {
  label:        string;
  value:        string | number;
  subValue?:    string;
  trend?:       number;
  trendLabel?:  string;
  icon?:        React.ElementType;
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
  const color = ACCENT_SOLID[accentColor];

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    padding: '16px 20px',
    boxShadow: 'var(--shadow-sm)',
    border: '1px solid var(--border)',
    borderLeft: `var(--card-accent-width) solid ${color}`,
    // G36-2：原 112 不够装大额本币（老挝币上亿）→ 128 给 value 换行余量
    minHeight: 128,
    boxSizing: 'border-box',
  };

  /* ── 骨架屏 ─────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className={cn('animate-pulse', className)} style={cardStyle}>
        <div className="flex justify-between mb-3">
          <div className="h-3 w-16 bg-bg-muted rounded" />
          <div className="w-11 h-11 bg-bg-muted rounded-lg" />
        </div>
        <div className="h-7 w-24 bg-bg-muted rounded" />
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={className}
      style={{ ...cardStyle, cursor: onClick ? 'pointer' : undefined, transition: 'box-shadow 0.15s' }}
      onMouseEnter={onClick ? (e) => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; } : undefined}
      onMouseLeave={onClick ? (e) => { e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; } : undefined}
    >
      {/* 顶部：标签（左）+ 图标盒（右，可选）*/}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, minHeight: Icon ? 44 : undefined }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
        {Icon && (
          <div style={{
            width: 44, height: 44, borderRadius: 'var(--radius-md)', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `color-mix(in srgb, ${color} 12%, transparent)`, color,
          }}>
            <Icon size={22} />
          </div>
        )}
      </div>

      {/* 主值：大号主色数字
          G36-2 修：原 truncate + fontSize 28 → 老挝币 / 大额本币被截。
          改为允许 wrap + 字号 22 + hover 完整数 + 长串字号自适应。*/}
      <div
        title={typeof value === 'string' || typeof value === 'number' ? String(value) : undefined}
        style={{
          fontSize: typeof value === 'string' && value.length > 14 ? 18 : 22,
          fontWeight: 700,
          lineHeight: 1.15,
          color,
          wordBreak: 'break-all',
          whiteSpace: 'normal',
        }}
      >
        {value}
      </div>

      {/* 次级说明 */}
      {subValue && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.4 }}>
          {subValue}
        </div>
      )}

      {/* 趋势（可选）*/}
      {trend !== undefined && (
        <div className="flex items-center gap-1.5 mt-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
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
