'use client';
import React, { useState, useEffect } from 'react';
import { fieldInputStyle } from './FormField';

/**
 * AmountInput / CurrencyInput — 统一金额输入：千分位显示、货币前缀、聚焦可编辑原值。
 * value 为 number（元）；onChange 返回 number。
 */
export interface AmountInputProps {
  value: number | '';
  onChange: (v: number | '') => void;
  currency?: string;          // 'CNY' → ¥
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  min?: number;
}

const SYMBOL: Record<string, string> = { CNY: '¥', USD: '$', LAK: '₭', EUR: '€' };

export function AmountInput({ value, onChange, currency = 'CNY', placeholder = '0.00', disabled, readOnly, min }: AmountInputProps) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState(value === '' ? '' : String(value));
  useEffect(() => { if (!focused) setRaw(value === '' ? '' : String(value)); }, [value, focused]);

  const display = focused
    ? raw
    : value === '' ? '' : Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <span style={{ position: 'absolute', left: 11, color: 'var(--text-secondary)', fontSize: 13, pointerEvents: 'none' }}>
        {SYMBOL[currency] || currency}
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={display}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        onFocus={() => { setFocused(true); setRaw(value === '' ? '' : String(value)); }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.]/g, '');
          setRaw(t);
          if (t === '' || t === '.') { onChange(''); return; }
          let n = Number(t);
          if (!isNaN(n)) { if (min != null && n < min) n = min; onChange(n); }
        }}
        style={{ ...fieldInputStyle, paddingLeft: 26, textAlign: 'right', opacity: disabled ? 0.6 : 1, background: readOnly ? 'var(--bg-muted)' : 'var(--bg-card)' }}
      />
    </div>
  );
}

export const CurrencyInput = AmountInput;
