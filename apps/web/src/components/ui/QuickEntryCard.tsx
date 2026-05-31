'use client';
/**
 * QuickEntryCard — 全系统统一「快捷入口卡」
 * =====================================================
 * 内容类别：模块内的功能快捷入口/快捷操作（区别于顶层 KpiCard 主卡、NavCard 模块导航）。
 * 提炼自仓库看板快捷入口 + 系统卡片语言：
 *   · 紧凑竖向：淡色图标盒在上 + 标签居中
 *   · 身份用「彩色图标盒」体现（color-mix 12%），不使用左强调条（强调条专属主卡）
 *   · 悬停：边框微染主色 + 轻微上浮
 *   · 支持 href(Link) 或 onClick
 *
 * 用法：
 *   <QuickEntryCard icon={PackagePlus} label="入库管理" href="/warehouse/inbound" accent="green" />
 */
import React from 'react';
import Link from 'next/link';
import { ACCENT_SOLID, type AccentColor } from '@/lib/design-tokens';

export interface QuickEntryCardProps {
  icon:     React.ElementType;
  label:    string;
  href?:    string;
  onClick?: () => void;
  accent?:  AccentColor;
}

export function QuickEntryCard({ icon: Icon, label, href, onClick, accent = 'blue' }: QuickEntryCardProps) {
  const color = ACCENT_SOLID[accent];

  const inner = (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
        padding: '16px 10px', height: '100%',
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)', textAlign: 'center', cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = `color-mix(in srgb, ${color} 45%, var(--border))`; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; e.currentTarget.style.transform = 'none'; }}
    >
      <div style={{
        width: 42, height: 42, borderRadius: 10, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `color-mix(in srgb, ${color} 12%, transparent)`, color,
      }}>
        <Icon size={22} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>{label}</span>
    </div>
  );

  if (href) {
    return <Link href={href} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>{inner}</Link>;
  }
  return <button type="button" onClick={onClick} style={{ all: 'unset', display: 'block', height: '100%', cursor: 'pointer' }}>{inner}</button>;
}

export default QuickEntryCard;
