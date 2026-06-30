'use client';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * ModalV2 — 居中模态（表单/详情用）。统一标题/关闭/暗色/ESC/点遮罩关闭。
 * 取代页面手写 overlay（position:fixed;inset:0）。
 * G164：createPortal 到 document.body —— position:fixed 一旦有祖先含 transform/filter/
 *   will-change（页面入场动画、卡片动画等）就会以该祖先为包含块，弹窗跑偏到页面下方不居中。
 *   挂到 body 顶层即恒以视口为基准，居中稳定。
 */
export interface ModalV2Props {
  open: boolean;
  title?: string;
  width?: number;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeOnBackdrop?: boolean;
}

export function ModalV2({ open, title, width = 520, onClose, children, footer, closeOnBackdrop = true }: ModalV2Props) {
  const { t } = useLanguage();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open || !mounted) return null;
  return createPortal(
    <div
      onClick={(e) => { if (closeOnBackdrop && e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        animation: 'phx-fade-in .15s ease',
      }}
    >
      <div
        style={{
          background: 'var(--bg-card)', color: 'var(--text-primary)', borderRadius: 16,
          width, maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          border: '1px solid var(--border)', boxShadow: '0 24px 80px rgba(0,0,0,0.28), 0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden',
          animation: 'phx-zoom-in .18s var(--ease-spring, ease)',
        }}
      >
        {title && (
          <div style={{ display: 'flex', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
            <button onClick={onClose} title={t('ui.关闭', '关闭')} style={{ marginLeft: 'auto', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 8, background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', transition: 'background .15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-muted)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <X size={18} />
            </button>
          </div>
        )}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>{children}</div>
        {footer && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '16px 24px', borderTop: '1px solid var(--border)' }}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
