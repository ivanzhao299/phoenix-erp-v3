'use client';
import React from 'react';
import { ACCENT_SOLID, type AccentColor } from '@/lib/design-tokens';

/**
 * NavCardV2 — 功能导航卡（图标 + 标题 + 描述，可点击跳转）。
 * 取代 settings/page 等手写导航卡。href 走 onClick(由页面接 router)或原生 a。暗色经 CSS 变量。
 */
export interface NavCardV2Props {
  icon: React.ElementType;
  title: string;
  description?: string;
  accentColor?: AccentColor;
  badge?: string | number;
  onClick?: () => void;
  href?: string;
}

export function NavCardV2({ icon: Icon, title, description, accentColor = 'blue', badge, onClick, href }: NavCardV2Props) {
  const accent = ACCENT_SOLID[accentColor];
  const body = (
    <div
      onClick={onClick}
      style={{
        display: 'flex', gap: 12, background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: 16, cursor: (onClick || href) ? 'pointer' : 'default',
        transition: 'box-shadow .18s var(--ease), border-color .18s', boxShadow: 'var(--shadow-sm)', height: '100%',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.borderColor = accent; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
    >
      <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${accent} 12%, transparent)`, color: accent, flexShrink: 0 }}>
        <Icon size={20} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</span>
          {badge != null && <span style={{ fontSize: 11, fontWeight: 700, color: accent, background: `color-mix(in srgb, ${accent} 14%, transparent)`, padding: '1px 7px', borderRadius: 100 }}>{badge}</span>}
        </div>
        {description && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 3 }}>{description}</div>}
      </div>
    </div>
  );
  return href ? <a href={href} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>{body}</a> : body;
}
