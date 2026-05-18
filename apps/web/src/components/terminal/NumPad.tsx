'use client';
import { useState } from 'react';
import { T } from '@/styles/terminal-theme';

export interface NumPadProps {
  initialValue?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
  label?: string;
  sublabel?: string;
  accentColor?: string;
  max?: number;
  confirmLabel?: string;
  cancelLabel?: string;
}

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', 'C', '0', '⌫'] as const;

export default function NumPad({
  initialValue = '',
  onConfirm,
  onCancel,
  label,
  sublabel,
  accentColor = T.ACC,
  max,
  confirmLabel = '确认',
  cancelLabel = '取消',
}: NumPadProps) {
  const [display, setDisplay] = useState(initialValue || '');

  const press = (key: string) => {
    if (key === 'C') { setDisplay(''); return; }
    if (key === '⌫') { setDisplay(p => p.slice(0, -1)); return; }
    setDisplay(prev => {
      const next = prev + key;
      if (next.length > 7) return prev;
      if (max !== undefined && Number(next) > max) return prev;
      return next;
    });
  };

  const numVal = Number(display) || 0;
  const valid  = display.length > 0 && numVal >= 0;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onPointerDown={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{
        background: T.CARD, borderRadius: 24, padding: 28, width: 380,
        border: `1px solid ${T.BOR}`,
        display: 'flex', flexDirection: 'column', gap: 18,
        boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
      }}>
        {/* Label */}
        {label && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, color: T.MUT, fontWeight: 600 }}>{label}</div>
            {sublabel && (
              <div style={{ fontSize: 12, color: T.MUT, marginTop: 4, opacity: 0.7 }}>{sublabel}</div>
            )}
          </div>
        )}

        {/* Value display */}
        <div style={{
          background: 'rgba(0,0,0,0.45)', borderRadius: 14, padding: '18px 24px',
          border: `2px solid ${display ? accentColor + '80' : T.BOR}`,
          textAlign: 'right', minHeight: 88,
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          transition: 'border-color 0.15s',
        }}>
          <span style={{
            fontSize: 60, fontWeight: 900, lineHeight: 1,
            color: display ? accentColor : T.BOR,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-1px',
          }}>
            {display || '0'}
          </span>
        </div>

        {/* Numpad grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {KEYS.map(k => {
            const isClear = k === 'C';
            const isBksp  = k === '⌫';
            return (
              <button
                key={k}
                type="button"
                onPointerDown={e => { e.preventDefault(); press(k); }}
                style={{
                  height: 76, borderRadius: 14, border: 'none', cursor: 'pointer',
                  fontSize: isBksp ? 30 : 28, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  background: isClear
                    ? 'rgba(239,68,68,0.18)'
                    : isBksp
                    ? 'rgba(245,158,11,0.15)'
                    : 'rgba(255,255,255,0.09)',
                  color: isClear ? T.RED : isBksp ? T.ACC : T.TXT,
                  transition: 'background 0.1s',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {k}
              </button>
            );
          })}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            onPointerDown={e => { e.preventDefault(); onCancel(); }}
            style={{
              flex: 1, height: 60, borderRadius: 14,
              border: `1px solid ${T.BOR}`, background: 'transparent',
              color: T.MUT, fontSize: 16, cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onPointerDown={e => { e.preventDefault(); if (valid) onConfirm(display); }}
            style={{
              flex: 2, height: 60, borderRadius: 14, border: 'none',
              background: valid ? accentColor : T.BOR,
              color: valid ? '#0f172a' : T.MUT,
              fontSize: 18, fontWeight: 800,
              cursor: valid ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
