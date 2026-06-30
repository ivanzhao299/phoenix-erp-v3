'use client';
import React from 'react';
import { Search } from 'lucide-react';
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * SearchInput — 全局搜索框（图标 + 输入）。
 * 各页搜索统一用它，禁止再自写 input + 图标定位（杜绝"字大框小/贴边/松紧不一"）。
 * 样式与组织架构页左面板搜索框一致（字 12、padding 8、bg-muted、圆角 8、图标 12）。
 */
export interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function SearchInput({ value, onChange, placeholder, autoFocus }: SearchInputProps) {
  const { t } = useLanguage();
  const placeholderResolved = placeholder ?? t('ui.搜索…', '搜索…');
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <Search
        size={12}
        style={{
          position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--text-secondary)', pointerEvents: 'none',
        }}
      />
      <input
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholderResolved}
        style={{
          width: '100%', padding: '8px 12px 8px 30px',
          fontSize: 12, borderRadius: 8,
          background: 'var(--bg-muted)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
          outline: 'none', boxSizing: 'border-box',
        }}
      />
    </div>
  );
}
