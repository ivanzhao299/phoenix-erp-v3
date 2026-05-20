'use client';
import { T } from '@/styles/terminal-theme';
import NumPad from './NumPad';

export interface TerminalNumPadPanelProps {
  label: string;
  value: string;
  accentColor: string;
  numpadKey?: string | number;
  numpadInitial?: string;
  onChange: (val: string) => void;
  disabled?: boolean;
  warning?: string;
  onOverlayTap?: () => void;
  max?: number;
  hideDisplay?: boolean;
}

export default function TerminalNumPadPanel({
  label,
  value,
  accentColor,
  numpadKey,
  numpadInitial = '',
  onChange,
  disabled = false,
  warning,
  onOverlayTap,
  max,
  hideDisplay = false,
}: TerminalNumPadPanelProps) {
  return (
    <div style={{
      width: 430, flexShrink: 0, borderLeft: `1px solid ${T.BOR}`,
      padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10,
      background: '#0a1628', position: 'relative',
    }}>
      {!hideDisplay && (
      <div style={{
        background: warning ? 'rgba(245,158,11,0.15)' : `${accentColor}12`,
        border: `1px solid ${warning ? 'rgba(245,158,11,0.6)' : `${accentColor}40`}`,
        borderRadius: 10, padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 8,
        transition: 'background 0.2s, border-color 0.2s',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: T.MUT, marginBottom: 3, whiteSpace: 'nowrap' }}>{label}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: warning ? T.ACC : accentColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '1.3', height: '1.3em' }}>
            {warning ?? value}
          </div>
        </div>
      </div>
      )}

      <NumPad
        key={numpadKey}
        initialValue={numpadInitial}
        accentColor={accentColor}
        onChange={onChange}
        hideDisplay
        buttonHeight={90}
        buttonFontSize={32}
        fillHeight
        disabled={disabled}
        max={max}
      />

      {disabled && onOverlayTap && (
        <div
          onPointerDown={onOverlayTap}
          style={{ position: 'absolute', inset: 0, zIndex: 10, cursor: 'pointer' }}
        />
      )}
    </div>
  );
}
