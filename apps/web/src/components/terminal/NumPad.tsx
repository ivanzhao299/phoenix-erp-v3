'use client';
import { useState, useEffect, useRef } from 'react';
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
}: NumPadProps) {
  const displayRef = useRef(initialValue);
  const [display, setDisplay] = useState(initialValue);

  useEffect(() => {
    displayRef.current = initialValue;
    setDisplay(initialValue);
  }, [initialValue]);

  const press = (key: string) => {
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
      if (max !== undefined && Number(candidate) > max) return;
      next = candidate;
    }
    displayRef.current = next;
    setDisplay(next);
    onChange?.(next);
  };

  const numVal = Number(display) || 0;
  const valid = display.length > 0 && numVal >= 0;

  return (
    <div style={{
      background: T.CARD, borderRadius: 20, padding: 16,
      border: `1px solid ${T.BOR}`,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {(label || sublabel) && (
        <div style={{ textAlign: 'center' }}>
          {label && <div style={{ fontSize: 13, color: T.MUT, fontWeight: 600, letterSpacing: 0.5 }}>{label}</div>}
          {sublabel && <div style={{ fontSize: 11, color: T.MUT, marginTop: 3, opacity: 0.7 }}>{sublabel}</div>}
        </div>
      )}

      {!hideDisplay && (
        <div style={{
          background: 'rgba(0,0,0,0.45)', borderRadius: 12, padding: '10px 18px',
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {KEYS.map(k => {
          const isClear = k === 'C';
          const isBksp  = k === '⌫';
          return (
            <button
              key={k}
              type="button"
              disabled={disabled}
              onPointerDown={e => { e.preventDefault(); press(k); }}
              style={{
                height: buttonHeight, borderRadius: 12, border: 'none',
                cursor: disabled ? 'not-allowed' : 'pointer',
                fontSize: isBksp ? 26 : 24, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                background: isClear
                  ? 'rgba(239,68,68,0.18)'
                  : isBksp
                  ? 'rgba(245,158,11,0.15)'
                  : 'rgba(255,255,255,0.09)',
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
            color: (valid && !disabled) ? '#0f172a' : T.MUT,
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
