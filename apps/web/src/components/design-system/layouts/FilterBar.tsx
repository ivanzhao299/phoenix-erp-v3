'use client';

/**
 * FilterBar — Phoenix DS（UIX-2 P1-B）
 * 状态/条件过滤胶囊按钮组 + 计数。
 *   items: { label, value, count? }
 *   <FilterBar items={STATUS} value={cur} onChange={setCur} />
 */

import React from 'react';

export interface FilterItem {
  label: string;
  value: string;
  /** 可选条数（如：草稿 3 / 已生效 28）*/
  count?: number;
}

export interface FilterBarProps {
  items: FilterItem[];
  value: string;
  onChange: (next: string) => void;
  size?: 'sm' | 'md';
  /** 把过滤按钮放在右侧（常用于卡片头部）— 默认 false 占满宽 */
  inline?: boolean;
}

export function FilterBar({ items, value, onChange, size = 'md', inline = false }: FilterBarProps) {
  const padding = size === 'sm' ? '4px 10px' : '6px 14px';
  const fontSize = size === 'sm' ? 12 : 13;

  return (
    <div
      role="tablist"
      aria-label="筛选"
      style={{
        display: inline ? 'inline-flex' : 'flex',
        gap: 8, flexWrap: 'wrap',
      }}
    >
      {items.map(item => {
        const active = item.value === value;
        return (
          <button
            key={item.value || 'ALL'}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            style={{
              padding, fontSize,
              borderRadius: 'var(--radius-badge)',
              border: '1px solid ' + (active ? 'var(--color-primary)' : 'var(--border)'),
              background: active ? 'var(--color-primary)' : 'var(--bg-card)',
              color: active ? 'var(--text-on-dark)' : 'var(--text-primary)',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
              fontWeight: active ? 600 : 400,
              transition: 'all var(--duration-fast) var(--ease-smooth)',
            }}
          >
            <span>{item.label}</span>
            {typeof item.count === 'number' ? (
              <span style={{
                fontSize: fontSize - 1, opacity: 0.85,
                padding: '0 6px', borderRadius: 100,
                background: active ? 'var(--overlay-white-15)' : 'var(--bg-muted)',
              }}>{item.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export default FilterBar;
