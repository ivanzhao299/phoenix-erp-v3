'use client';
import React from 'react';
import ReactDOM from 'react-dom';
import { useLanguage } from '../contexts/LanguageContext';

// ── Per-type color config — no light/dark split needed (CSS vars handle it) ──
const TYPE_CFG: Record<string, { accent: string; iconBg: string; confirmBg: string; confirmShadow: string }> = {
  danger:  { accent:'#ef4444', iconBg:'rgba(239,68,68,0.12)',  confirmBg:'linear-gradient(135deg,#ef4444,#b91c1c)', confirmShadow:'rgba(239,68,68,0.28)'  },
  warning: { accent:'#f59e0b', iconBg:'rgba(245,158,11,0.12)', confirmBg:'linear-gradient(135deg,#f59e0b,#d97706)', confirmShadow:'rgba(245,158,11,0.28)' },
  success: { accent:'#22c55e', iconBg:'rgba(34,197,94,0.12)',  confirmBg:'linear-gradient(135deg,#22c55e,#16a34a)', confirmShadow:'rgba(34,197,94,0.28)'  },
  confirm: { accent:'#3b82f6', iconBg:'rgba(59,130,246,0.12)', confirmBg:'linear-gradient(135deg,#3b82f6,#2563eb)', confirmShadow:'rgba(59,130,246,0.28)' },
  alert:   { accent:'#3b82f6', iconBg:'rgba(59,130,246,0.12)', confirmBg:'linear-gradient(135deg,#3b82f6,#2563eb)', confirmShadow:'rgba(59,130,246,0.28)' },
};

interface PhoenixDialogProps {
  isOpen: boolean;
  type?: string;
  icon?: string;
  title?: string;
  subtitle?: string;
  message?: string;
  children?: React.ReactNode;
  cancelLabel?: string;
  confirmLabel?: string;
  onCancel?: () => void;
  onConfirm?: () => void;
  hideCancel?: boolean;
}

function PhoenixDialog({
  isOpen, type = 'confirm', icon, title, subtitle, message, children,
  cancelLabel: _cancelLabel, confirmLabel: _confirmLabel,
  onCancel, onConfirm, hideCancel = false,
}: PhoenixDialogProps) {
  const { t } = useLanguage();
  const cancelLabel  = _cancelLabel  ?? t('common.cancel',  '取消');
  const confirmLabel = _confirmLabel ?? t('common.confirm', '确认');

  if (!isOpen || typeof document === 'undefined') return null;

  const cfg = TYPE_CFG[type] || TYPE_CFG.confirm;

  const dialog = (
    <div
      onClick={e => { if (e.target === e.currentTarget && onCancel) onCancel(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 999999,
        background: 'rgba(0,0,0,0.48)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(6px)',
        padding: '16px',
        animation: 'phxFadeIn 0.14s ease',
      }}
    >
      <style>{`
        @keyframes phxFadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes phxScaleIn { from { transform:scale(0.9); opacity:0; } to { transform:scale(1); opacity:1; } }
      `}</style>

      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderTop: `3px solid ${cfg.accent}`,
        borderRadius: '14px',
        width: '400px',
        maxWidth: '94vw',
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)',
        animation: 'phxScaleIn 0.18s cubic-bezier(0.34,1.45,0.64,1)',
      }}>

        {/* Body */}
        <div style={{ padding: '28px 32px 20px', textAlign: 'center', flex: 1, overflowY: 'auto' }}>

          {/* Icon badge */}
          {icon && (
            <div style={{
              width: 52, height: 52, borderRadius: '50%',
              background: cfg.iconBg,
              border: `1px solid ${cfg.accent}28`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
              fontSize: 24, lineHeight: 1,
            }}>
              {icon}
            </div>
          )}

          {/* Title */}
          {title && (
            <div style={{
              fontSize: 17, fontWeight: 700, color: 'var(--text-primary)',
              lineHeight: 1.35, marginBottom: subtitle || message || children ? 6 : 0,
            }}>
              {title}
            </div>
          )}

          {/* Subtitle */}
          {subtitle && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, lineHeight: 1.5 }}>
              {subtitle}
            </div>
          )}

          {/* Message */}
          {message && (
            <p style={{
              fontSize: 13.5, color: 'var(--text-secondary)',
              lineHeight: 1.65, margin: '8px 0 0', whiteSpace: 'pre-line',
            }}>
              {message}
            </p>
          )}

          {/* Custom content */}
          {children && <div style={{ marginTop: 16 }}>{children}</div>}
        </div>

        {/* Actions */}
        <div style={{
          padding: '16px 32px 24px',
          display: 'flex', gap: 10, justifyContent: 'center',
          borderTop: '1px solid var(--border)',
        }}>
          {!hideCancel && (
            <button
type="button"               onClick={onCancel}
              style={{
                padding: '9px 24px', fontSize: 13.5, fontWeight: 500,
                border: '1px solid var(--border)', borderRadius: 8,
                background: 'transparent', color: 'var(--text-secondary)',
                cursor: 'pointer', transition: 'border-color 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--text-primary)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';       (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}
            >
              {cancelLabel}
            </button>
          )}
          <button
type="button"             onClick={onConfirm}
            style={{
              padding: '9px 28px', fontSize: 13.5, fontWeight: 600,
              border: 'none', borderRadius: 8,
              background: cfg.confirmBg, color: '#fff',
              cursor: 'pointer',
              boxShadow: `0 2px 10px ${cfg.confirmShadow}`,
              transition: 'opacity 0.15s, transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.88'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 16px ${cfg.confirmShadow}`; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1';    (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';   (e.currentTarget as HTMLElement).style.boxShadow = `0 2px 10px ${cfg.confirmShadow}`; }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(dialog, document.body);
}

export default PhoenixDialog;
