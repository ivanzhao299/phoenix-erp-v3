'use client';
import React, { useId } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDialogFocus, useDialogPortalReady } from '../dialogs/useDialogFocus';
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
  closeDisabled?: boolean;
}

export function DrawerV2({ open, title, width = 560, onClose, children, footer, closeOnBackdrop = true, closeDisabled = false }: DrawerV2Props) {
  const { t } = useLanguage();
  const mounted = useDialogPortalReady();
  const titleId = useId();
  const { dialogRef, requestClose } = useDialogFocus(open && mounted, onClose, closeDisabled);
  if (!open || !mounted) return null;
  return createPortal(
    <div
      onClick={(e) => { if (closeOnBackdrop && e.target === e.currentTarget) requestClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'var(--overlay-mask)', zIndex: 1000,
        backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
        display: 'flex', justifyContent: 'flex-end', animation: 'phx-fade-in .15s ease',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : t('ui.请确认', '请确认')}
        aria-busy={closeDisabled || undefined}
        tabIndex={-1}
        style={{
          background: 'var(--bg-card)', color: 'var(--text-primary)', width, maxWidth: '95vw', height: '100%',
          display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)',
          animation: 'phx-slide-in-r .25s var(--ease-spring, ease)',
        }}
      >
        {title && (
          <div style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
            <div id={titleId} style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-primary)' }}>{title}</div>
            <button type="button" onClick={requestClose} disabled={closeDisabled} aria-label={t('ui.关闭', '关闭')} style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}>
              <X size={18} />
            </button>
          </div>
        )}
        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>{children}</div>
        {footer && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 20px', borderTop: '1px solid var(--border)' }}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
