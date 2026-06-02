'use client';
import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * DrawerV2 — 侧滑抽屉（详情/编辑表单用）。统一标题/关闭/暗色/ESC/点遮罩关闭。
 * 取代页面手写侧滑 overlay。右侧滑出。
 */
export interface DrawerV2Props {
  open: boolean;
  title?: string;
  width?: number;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeOnBackdrop?: boolean;
}

export function DrawerV2({ open, title, width = 560, onClose, children, footer, closeOnBackdrop = true }: DrawerV2Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      onClick={(e) => { if (closeOnBackdrop && e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 950,
        display: 'flex', justifyContent: 'flex-end', animation: 'phx-fade-in .15s ease',
      }}
    >
      <div
        style={{
          background: 'var(--bg-card)', color: 'var(--text-primary)', width, maxWidth: '95vw', height: '100%',
          display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)',
          animation: 'phx-slide-in-r .25s var(--ease-spring, ease)',
        }}
      >
        {title && (
          <div style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-primary)' }}>{title}</div>
            <button onClick={onClose} style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}>
              <X size={18} />
            </button>
          </div>
        )}
        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>{children}</div>
        {footer && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 20px', borderTop: '1px solid var(--border)' }}>{footer}</div>}
      </div>
    </div>
  );
}
