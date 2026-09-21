'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { T } from '@/styles/terminal-theme';

export interface NumPadProps {
  initialValue?: string;
  onChange?: (value: string) => void;
  onConfirm?: (value: string) => void;
  label?: string;
  sublabel?: string;
  accentColor?: string;
  max?: number;
  confirmLabel?: string;
  disabled?: boolean;
  hideDisplay?: boolean;
  buttonHeight?: number;
  buttonFontSize?: number;
  fillHeight?: boolean;
}

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', 'C', '0', '⌫'] as const;

export default function NumPad({
  initialValue = '',
  onChange,
  onConfirm,
  label,
  sublabel,
  accentColor = T.ACC,
  max,
  confirmLabel = '确认',
  disabled = false,
  hideDisplay = false,
  buttonHeight = 64,
  buttonFontSize,
  fillHeight = false,
}: NumPadProps) {
  const sanitize = (v: string) =>
    v === '' ? '' : String(parseInt(v, 10) || 0);

  const displayRef = useRef(sanitize(initialValue));
  const [display, setDisplay] = useState(() => sanitize(initialValue));

  useEffect(() => {
    const s = sanitize(initialValue);
    displayRef.current = s;
    setDisplay(s);
  }, [initialValue]);

  const press = useCallback((key: string) => {
    if (disabled) return;
    const prev = displayRef.current;
    let next: string;
    if (key === 'C') {
      next = '';
    } else if (key === '⌫') {
      next = prev.slice(0, -1);
    } else {
      const candidate = prev + key;
      if (candidate.length > 7) return;
      const stripped = String(parseInt(candidate, 10)); // 去除前导零
      if (max !== undefined && Number(stripped) > max) return;
      next = stripped;
    }
    displayRef.current = next;
    setDisplay(next);
    onChange?.(next);
  }, [disabled, max, onChange]);

  // Keep stable refs so the keyboard handler never goes stale
  const pressRef     = useRef<typeof press>(press);
  const onConfirmRef = useRef(onConfirm);
  useEffect(() => {
    pressRef.current = press;
    onConfirmRef.current = onConfirm;
  }, [onConfirm, press]);

  // Physical keyboard support — skip when any text input has focus
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault(); pressRef.current(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault(); pressRef.current('⌫');
      } else if (e.key === 'Delete' || e.key === 'Escape') {
        e.preventDefault(); pressRef.current('C');
      } else if (e.key === 'Enter') {
        const v = displayRef.current;
        if (v.length > 0 && onConfirmRef.current) { e.preventDefault(); onConfirmRef.current(v); }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const numVal = Number(display) || 0;
  const valid = display.length > 0 && numVal >= 0;

  return (
    <div style={{
      background: T.CARD, borderRadius: 20, padding: 16,
      border: `1px solid ${T.BOR}`,
      display: 'flex', flexDirection: 'column', gap: 10,
      ...(fillHeight ? { flex: 1, minHeight: 0 } : {}),
    }}>
      {(label || sublabel) && (
        <div style={{ textAlign: 'center' }}>
          {label && <div style={{ fontSize: 13, color: T.MUT, fontWeight: 600, letterSpacing: 0.5 }}>{label}</div>}
          {sublabel && <div style={{ fontSize: 11, color: T.MUT, marginTop: 3, opacity: 0.7 }}>{sublabel}</div>}
        </div>
      )}

      {!hideDisplay && (
        <div style={{
          background: 'var(--overlay-black-45)', borderRadius: 12, padding: '10px 18px',
          border: `2px solid ${display ? accentColor + '80' : T.BOR}`,
          textAlign: 'right', minHeight: 64,
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          transition: 'border-color 0.15s',
        }}>
          <span style={{
            fontSize: 48, fontWeight: 900, lineHeight: 1,
            color: display ? accentColor : T.BOR,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-1px',
          }}>
            {display || '0'}
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, ...(fillHeight ? { flex: 1, gridAutoRows: '1fr' } : {}) }}>
        {KEYS.map(k => {
          const isClear = k === 'C';
          const isBksp  = k === '⌫';
          const fs = buttonFontSize ?? (isBksp ? 26 : 24);
          return (
            <button
              key={k}
              type="button"
              disabled={disabled}
              onPointerDown={e => { e.preventDefault(); press(k); }}
              style={{
                height: fillHeight ? 'auto' : buttonHeight,
                minHeight: fillHeight ? buttonHeight : undefined,
                borderRadius: 12, border: 'none',
                cursor: disabled ? 'not-allowed' : 'pointer',
                fontSize: fs, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                background: isClear
                  ? 'var(--status-danger-bg-deep)'
                  : isBksp
                  ? 'var(--status-warning-bg-medium)'
                  : 'var(--overlay-white-08)',
                color: isClear ? T.RED : isBksp ? T.ACC : T.TXT,
                opacity: disabled ? 0.4 : 1,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {k}
            </button>
          );
        })}
      </div>

      {onConfirm && (
        <button
          type="button"
          disabled={!valid || disabled}
          onPointerDown={e => { e.preventDefault(); if (valid && !disabled) onConfirm(display); }}
          style={{
            height: 58, borderRadius: 12, border: 'none',
            background: (valid && !disabled) ? accentColor : T.BOR,
            color: (valid && !disabled) ? 'var(--slate-900)' : T.MUT,
            fontSize: 18, fontWeight: 800,
            cursor: (valid && !disabled) ? 'pointer' : 'not-allowed',
            transition: 'background 0.15s',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {confirmLabel}
        </button>
      )}
    </div>
  );
}
