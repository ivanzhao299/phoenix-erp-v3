'use client';
import React from 'react';
import { Search } from 'lucide-react';
import { fieldInputStyle } from './FormField';

/**
 * SearchInput — 全局搜索框（图标 + 输入，统一舒适尺寸）。
 * 各页搜索统一用它，禁止再自写 input + 图标定位（杜绝"字大框小/贴边"不一致）。
 * 样式取 design-system 标准 fieldInputStyle（padding 8/11、字 13.5、圆角 token）。
 */
export interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function SearchInput({ value, onChange, placeholder = '搜索…', autoFocus }: SearchInputProps) {
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <Search
        size={15}
        style={{
          position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--text-disabled)', pointerEvents: 'none',
        }}
      />
      <input
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          ...fieldInputStyle,
          paddingLeft: 34,    // 给左侧图标留位
          paddingTop: 9,
          paddingBottom: 9,   // 比 fieldInputStyle 略高，搜索框更舒展
        }}
      />
    </div>
  );
}
