'use client';
import React from 'react';
import { ModalV2 } from './ModalV2';
import { useLanguage } from "@/contexts/LanguageContext";

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
  open, title, message, confirmLabel, cancelLabel,
  danger, loading, onConfirm, onCancel,
}: ConfirmDialogV2Props) {
  const { t } = useLanguage();
  const titleResolved = title ?? t('ui.请确认', '请确认');
  const confirmLabelResolved = confirmLabel ?? t('ui.确认', '确认');
  const cancelLabelResolved = cancelLabel ?? t('ui.取消', '取消');
  const btn = (bg: string, fg: string, border?: string): React.CSSProperties => ({
    padding: '9px 22px', borderRadius: 10, border: border || 'none',
    background: bg, color: fg, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13.5,
    opacity: loading ? 0.6 : 1, transition: 'filter .15s',
  });
  return (
    <ModalV2
      open={open}
      title={titleResolved}
      width={420}
      onClose={onCancel}
      footer={
        <>
          <button onClick={onCancel} disabled={loading} style={btn('var(--bg-card)', 'var(--text-primary)', '1px solid var(--border)')}>{cancelLabelResolved}</button>
          <button onClick={onConfirm} disabled={loading} style={btn(danger ? 'var(--status-danger)' : 'var(--color-primary)', 'var(--text-on-dark)')}>
            {loading ? t('ui.处理中…', '处理中…') : confirmLabelResolved}
          </button>
        </>
      }
    >
      <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6 }}>{message}</div>
    </ModalV2>
  );
}
