'use client';
import React from 'react';
import { ModalV2 } from './ModalV2';

/**
 * ConfirmDialogV2 — 统一确认框。取代 window.confirm / window.prompt。
 * 危险操作 danger=true 用红色确认按钮。
 */
export interface ConfirmDialogV2Props {
  open: boolean;
  title?: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialogV2({
  open, title = '请确认', message, confirmLabel = '确认', cancelLabel = '取消',
  danger, loading, onConfirm, onCancel,
}: ConfirmDialogV2Props) {
  const btn = (bg: string, fg: string, border?: string): React.CSSProperties => ({
    padding: '8px 18px', borderRadius: 'var(--radius-md)', border: border || 'none',
    background: bg, color: fg, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13,
    opacity: loading ? 0.6 : 1,
  });
  return (
    <ModalV2
      open={open}
      title={title}
      width={420}
      onClose={onCancel}
      footer={
        <>
          <button onClick={onCancel} disabled={loading} style={btn('var(--bg-card)', 'var(--text-primary)', '1px solid var(--border)')}>{cancelLabel}</button>
          <button onClick={onConfirm} disabled={loading} style={btn(danger ? 'var(--status-danger)' : 'var(--color-primary)', 'var(--text-on-dark)')}>
            {loading ? '处理中…' : confirmLabel}
          </button>
        </>
      }
    >
      <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6 }}>{message}</div>
    </ModalV2>
  );
}
