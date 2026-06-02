'use client';
import React from 'react';

/**
 * WorkbenchKit（Design System V2）— 作业台/工业现场基座。
 * store-pos / terminal / packaging / breeding device-ops 等大按钮高对比场景。
 * 工业现场以深色为主，这里用 CSS 变量（暗色下天然贴合），并提供超大触摸目标/高对比文字。
 * 不强制套后台样式，但禁止页面内硬编码颜色——统一从 token 取。
 */

/** WorkbenchShell — 作业台骨架（顶栏 + 内容；适配大屏触摸） */
export function WorkbenchShell({ title, status, children }: { title: string; status?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-page)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', background: 'var(--bg-card)', borderBottom: '2px solid var(--border)' }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-primary)' }}>{title}</div>
        {status && <div style={{ marginLeft: 'auto' }}>{status}</div>}
      </header>
      <main style={{ flex: 1, padding: 20 }}>{children}</main>
    </div>
  );
}

/** WorkbenchActionButton — 作业台超大按钮（≥64px 高，工业触摸） */
export function WorkbenchActionButton({ label, icon: Icon, onClick, variant = 'primary', disabled }: {
  label: string; icon?: React.ElementType; onClick?: () => void; variant?: 'primary' | 'success' | 'danger' | 'neutral'; disabled?: boolean;
}) {
  const bg = {
    primary: 'var(--color-primary)', success: 'var(--status-success)', danger: 'var(--status-danger)', neutral: 'var(--bg-muted)',
  }[variant];
  const fg = variant === 'neutral' ? 'var(--text-primary)' : 'var(--text-on-dark)';
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 72, minWidth: 120, padding: '12px 22px', borderRadius: 14, border: 'none', background: bg, color: fg, fontSize: 18, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      {Icon && <Icon size={26} />}{label}
    </button>
  );
}

/** WorkbenchStatusCard — 作业台状态卡（班次/进度/数量大字展示） */
export function WorkbenchStatusCard({ label, value, accent = 'var(--color-primary)', sub }: { label: string; value: string | number; accent?: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: `1px solid var(--border)`, borderLeft: `5px solid ${accent}`, borderRadius: 14, padding: '16px 20px' }}>
      <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, color: 'var(--text-disabled)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
