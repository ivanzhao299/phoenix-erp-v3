'use client';

/**
 * SearchBar — Phoenix DS（UIX-2 P1-A）
 * 统一搜索栏：输入 + 防抖 + 清除 + 提交。
 * 用法：
 *   <SearchBar value={kw} onChange={setKw} placeholder="搜索客户/SKU…" debounce={300} />
 */

import { useEffect, useState, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { useLanguage } from "@/contexts/LanguageContext";

export interface SearchBarProps {
  value: string;
  onChange: (next: string) => void;
  /** 提交时立即触发（默认按 Enter 触发）；不写则只走 debounce */
  onSubmit?: (next: string) => void;
  placeholder?: string;
  /** 默认 300ms；设 0 关闭防抖 */
  debounce?: number;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  /** 自定义宽度（默认 280） */
  width?: number | string;
}

const SIZES: Record<NonNullable<SearchBarProps['size']>, { h: number; px: number; fs: number; ic: number }> = {
  sm: { h: 28, px: 8,  fs: 12, ic: 14 },
  md: { h: 34, px: 12, fs: 13, ic: 16 },
  lg: { h: 40, px: 14, fs: 14, ic: 18 },
};

export function SearchBar({
  value, onChange, onSubmit, placeholder,
  debounce = 300, size = 'md', disabled, width = 280,
}: SearchBarProps) {
  const { t } = useLanguage();
  const ph = placeholder ?? t('ui.搜索…','搜索…');
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cfg = SIZES[size];

  useEffect(() => { setLocal(value); }, [value]);

  const emit = (next: string) => {
    if (debounce > 0) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => onChange(next), debounce);
    } else {
      onChange(next);
    }
  };

  return (
    <div
      style={{
        display: 'inline-flex', alignItems: 'center',
        height: cfg.h, paddingLeft: cfg.px, paddingRight: cfg.px,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-btn)',
        width, gap: 6,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Search size={cfg.ic} color="var(--text-secondary)" aria-hidden />
      <input
        type="search"
        disabled={disabled}
        placeholder={ph}
        value={local}
        onChange={(e) => { setLocal(e.target.value); emit(e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onSubmit) { e.preventDefault(); onSubmit(local); }
        }}
        style={{
          flex: 1, border: 'none', outline: 'none', background: 'transparent',
          color: 'var(--text-primary)', fontSize: cfg.fs,
        }}
        aria-label={ph}
      />
      {local ? (
        <button
          type="button"
          aria-label={t('ui.清除','清除')}
          onClick={() => { setLocal(''); onChange(''); onSubmit?.(''); }}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: cfg.ic + 4, height: cfg.ic + 4,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-secondary)', padding: 0,
          }}
        >
          <X size={cfg.ic - 2} />
        </button>
      ) : null}
    </div>
  );
}

export default SearchBar;
