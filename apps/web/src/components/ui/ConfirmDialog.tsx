"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import styles from "./confirmDialog.module.css";

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open, title: _title, message,
  confirmLabel: _confirmLabel, danger = false, loading,
  onConfirm, onCancel
}: ConfirmDialogProps) {
  const { t } = useLanguage();
  const title = _title ?? t('ui.确认操作', '确认操作');
  const confirmLabel = _confirmLabel ?? t('common.confirm', '确认');

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!open || !mounted) return null;
  return createPortal(
    <div className={styles.mask} onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className={styles.dialog}>
        <div className={styles.icon}>
          <AlertTriangle size={24} color={danger ? "#ef4444" : "#f59e0b"} />
        </div>
        <h4 className={styles.title}>{title}</h4>
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.btnCancel} onClick={onCancel} disabled={loading}>{t('common.cancel', '取消')}</button>
          <button
type="button"             className={`${styles.btnConfirm} ${danger ? styles.danger : styles.warn}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? t('ui.处理中', '处理中...') : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
