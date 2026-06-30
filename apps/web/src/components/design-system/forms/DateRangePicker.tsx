'use client';
import React from 'react';
import { useLanguage } from "@/contexts/LanguageContext";
import { fieldInputStyle } from './FormField';

/**
 * DateRangePicker — 统一日期区间选择（起止两端）。无第三方依赖，原生 date。
 * value: { from, to }（'YYYY-MM-DD'）；onChange 返回新区间。
 */
export interface DateRange { from: string; to: string; }
export interface DateRangePickerProps {
  value: DateRange;
  onChange: (v: DateRange) => void;
  disabled?: boolean;
}

export function DateRangePicker({ value, onChange, disabled }: DateRangePickerProps) {
  const { t } = useLanguage();
  const inp: React.CSSProperties = { ...fieldInputStyle, width: 'auto', flex: 1, opacity: disabled ? 0.6 : 1 };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input type="date" value={value.from} disabled={disabled} max={value.to || undefined}
        onChange={(e) => onChange({ ...value, from: e.target.value })} style={inp} />
      <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{t('ui.至','至')}</span>
      <input type="date" value={value.to} disabled={disabled} min={value.from || undefined}
        onChange={(e) => onChange({ ...value, to: e.target.value })} style={inp} />
    </div>
  );
}
