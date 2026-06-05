'use client';
/**
 * NavCard — 全系统统一导航模块卡片
 * ================================================
 * 单一标准：与「生产管理（养殖）」首页卡片完全一致 —
 *   · 白底卡片 + 左侧 4px 主色强调条
 *   · 淡色图标盒（color-mix 12%）+ 标题 + 描述 + 进入箭头（横向）
 *   · 悬停：边框转主色 + 阴影加深
 * 用于所有仪表盘的功能模块导航（finance2 / sales2 / master-data ...）。
 *
 * 用法：
 *   <NavCard icon={Wallet} title="资金账户管理"
 *     description="多账户余额管理、流水账本、转账审批。"
 *     href="/finance2/cash-accounts" accent="blue" />
 */
import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ACCENT_SOLID, type AccentColor } from '@/lib/design-tokens';

export type NavCardAccent = AccentColor;

export interface NavCardProps {
  icon:        React.ElementType;
  title:       string;
  description: string;
  /** href 用 Link，onClick 用 div（两者互斥） */
  href?:       string;
  onClick?:    () => void;
  accent?:     NavCardAccent;
  /** 右上角徽章，如"3 笔待审批" */
  badge?:      string | number;
  badgeColor?: 'red' | 'amber' | 'blue';
  className?:  string;
}

export function NavCard({
  icon: Icon,
  title,
  description,
  href,
  onClick,
  accent = 'blue',
  badge,
  badgeColor = 'red',
  className,
}: NavCardProps) {
  const color = ACCENT_SOLID[accent];
  const badgeColorVal = { red: 'var(--status-danger)', amber: 'var(--status-warning)', blue: 'var(--color-primary)' }[badgeColor];

  const inner = (
    <div
      className={`${className ?? ''} group/navcard`}
      style={{
        // 导航类（非主卡片）：不使用左强调条——强调条是主卡片专属。
        // 身份只通过彩色图标盒体现，整体保持中性、轻盈，与顶层 KPI 主卡区分。
        // 排版比例提炼自「包装日报」kpiCard：紧凑横向 + 40px 圆角图标盒 + 利落字阶。
        background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', padding: '16px 20px',
        boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 14, height: '100%',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = `color-mix(in srgb, ${color} 40%, var(--border))`; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `color-mix(in srgb, ${color} 14%, transparent)`, color,
      }}>
        <Icon size={20} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', letterSpacing: '0.01em' }}>{title}</span>
          {badge !== undefined && badge !== 0 && (
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 10,
              color: badgeColorVal, background: `color-mix(in srgb, ${badgeColorVal} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${badgeColorVal} 30%, transparent)`,
            }}>
              {badge}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, letterSpacing: '0.01em' }}>{description}</div>
      </div>

      <ArrowRight size={17} className="transition-transform group-hover/navcard:translate-x-0.5" style={{ color: 'var(--text-disabled)', flexShrink: 0 }} />
    </div>
  );

  if (href) {
    return <Link href={href} className="block">{inner}</Link>;
  }
  return (
    <div onClick={onClick} className={onClick ? 'cursor-pointer' : ''}>
      {inner}
    </div>
  );
}

export default NavCard;
