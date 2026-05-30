'use client';
/**
 * NavCard — 全局导航模块卡片 · Design System V2
 * ================================================
 * 用于所有仪表盘页面的功能模块导航（finance2、sales2、master-data 等）。
 * 统一替代各页面内联定义的 ModuleCard / CardDef，实现全局一致的卡片规格。
 *
 * 设计准则：
 *   · 内边距 p-6（24px），比数据卡大一档，突出模块入口感
 *   · 图标容器 w-12 h-12，视觉锚点适中
 *   · 标题 text-base font-bold，清晰可读
 *   · 描述 text-sm leading-relaxed，14px 正文，不再用 12px
 *   · 进入链接区：字号 text-sm，加 group-hover 动效
 *
 * 用法：
 *   <NavCard
 *     icon={Wallet}
 *     title="资金账户管理"
 *     description="多账户余额管理、流水账本、转账审批。"
 *     href="/finance2/cash-accounts"
 *     accent="blue"
 *   />
 */
import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type NavCardAccent =
  | 'blue' | 'green' | 'amber' | 'red'
  | 'violet' | 'teal' | 'indigo' | 'cyan' | 'slate';

const ACCENT_CLS: Record<NavCardAccent, { text: string; icon: string; border: string }> = {
  blue:   { text: 'text-info',       icon: 'bg-info/10',    border: 'border-info/20'    },
  green:  { text: 'text-success',    icon: 'bg-success/10', border: 'border-success/20' },
  amber:  { text: 'text-warning',    icon: 'bg-warning/10', border: 'border-warning/20' },
  red:    { text: 'text-danger',     icon: 'bg-danger/10',  border: 'border-danger/20'  },
  violet: { text: 'text-brand',      icon: 'bg-brand/10',   border: 'border-brand/20'   },
  indigo: { text: 'text-brand',      icon: 'bg-brand/10',   border: 'border-brand/20'   },
  cyan:   { text: 'text-info',       icon: 'bg-info/10',    border: 'border-info/20'    },
  teal:   { text: 'text-success',    icon: 'bg-success/10', border: 'border-success/20' },
  slate:  { text: 'text-text-muted', icon: 'bg-bg-muted',   border: 'border-border'     },
};

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
  const ac = ACCENT_CLS[accent];

  const badgeCls = {
    red:   'bg-danger/10  text-danger  border-danger/20',
    amber: 'bg-warning/10 text-warning border-warning/20',
    blue:  'bg-info/10    text-info    border-info/20',
  }[badgeColor];

  const inner = (
    <div className={cn(
      'group rounded-2xl border bg-bg-card p-6',
      'shadow-card hover:shadow-card-hover hover:-translate-y-0.5',
      'transition-all duration-150 h-full flex flex-col',
      ac.border,
      className,
    )}>
      {/* 顶部：图标 + 徽章 */}
      <div className="flex items-start justify-between mb-5">
        <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0', ac.icon)}>
          <Icon size={22} className={ac.text} />
        </div>
        {badge !== undefined && badge !== 0 && (
          <span className={cn(
            'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border',
            badgeCls,
          )}>
            {badge}
          </span>
        )}
      </div>

      {/* 标题 */}
      <div className="text-base font-bold text-text mb-2">
        {title}
      </div>

      {/* 描述：text-sm 可读正文，不用 text-xs */}
      <div className="text-sm text-text-muted leading-relaxed flex-1 mb-5">
        {description}
      </div>

      {/* 进入链接 */}
      <div className={cn(
        'flex items-center gap-1.5 text-sm font-semibold',
        ac.text,
      )}>
        <span>进入</span>
        <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
      </div>
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
