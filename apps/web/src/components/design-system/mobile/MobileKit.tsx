'use client';
import React from 'react';
import { ACCENT_SOLID, type AccentColor } from '@/lib/design-tokens';

/**
 * MobileKit（Design System V2）— 移动端基座。
 * 移动端不强制套后台样式，但必须用统一 token、消除硬编码、支持暗色。
 * 这些组件全部走 CSS 变量（明暗自动切换），并提供移动端友好的触摸尺寸/安全区。
 */

/** MobilePageShell — 移动端页面骨架（顶部 AppBar + 安全区 + 内容滚动区） */
export interface MobilePageShellProps {
  title: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
}
export function MobilePageShell({ title, left, right, children }: MobilePageShellProps) {
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-page)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 10,
          padding: 'max(env(safe-area-inset-top), 10px) 14px 10px', background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border)', backdropFilter: 'blur(12px)',
        }}
      >
        {left}
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        {right}
      </header>
      <main style={{ flex: 1, padding: 14, paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>{children}</main>
    </div>
  );
}

/** MobileStatCard — 移动端统计卡（大数字，渐变图标盒） */
export function MobileStatCard({ label, value, icon: Icon, accentColor = 'blue', onClick }: {
  label: string; value: string | number; icon?: React.ElementType; accentColor?: AccentColor; onClick?: () => void;
}) {
  const accent = ACCENT_SOLID[accentColor];
  return (
    <div onClick={onClick} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, cursor: onClick ? 'pointer' : 'default' }}>
      {Icon && (
        <div style={{ width: 36, height: 36, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent }}>
          <Icon size={18} />
        </div>
      )}
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{value}</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{label}</div>
    </div>
  );
}

/** MobileActionButton — 移动端大号操作按钮（触摸友好 ≥44px 高） */
export function MobileActionButton({ label, icon: Icon, onClick, variant = 'primary', disabled }: {
  label: string; icon?: React.ElementType; onClick?: () => void; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean;
}) {
  const styleMap = {
    primary:   { bg: 'var(--color-primary)', fg: 'var(--text-on-dark)', bd: 'transparent' },
    secondary: { bg: 'var(--bg-card)',       fg: 'var(--text-primary)', bd: 'var(--border)' },
    danger:    { bg: 'var(--status-danger)', fg: 'var(--text-on-dark)', bd: 'transparent' },
  }[variant];
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 46, width: '100%', padding: '0 18px', borderRadius: 12, border: `1px solid ${styleMap.bd}`, background: styleMap.bg, color: styleMap.fg, fontSize: 15, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1 }}>
      {Icon && <Icon size={18} />}{label}
    </button>
  );
}
