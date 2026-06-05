'use client';

/**
 * Toolbar — Phoenix DS（UIX-2 P1-C）
 * 列表/详情页通用工具栏：左侧主操作，右侧次操作 / 搜索 / 筛选。
 *   <Toolbar left={<>...</>} right={<><SearchBar/><FilterBar/></>} />
 */

import React from 'react';

export interface ToolbarProps {
  left?: React.ReactNode;
  right?: React.ReactNode;
  /** 紧凑模式 — 适合抽屉/Modal 内 */
  dense?: boolean;
  /** 是否显示下边框分隔（默认 true） */
  divider?: boolean;
}

export function Toolbar({ left, right, dense = false, divider = true }: ToolbarProps) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap',
        padding: dense ? '8px 12px' : '12px 16px',
        background: 'var(--bg-card)',
        borderBottom: divider ? '1px solid var(--border)' : 'none',
        borderRadius: divider ? 0 : 'var(--radius-card)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{left}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>{right}</div>
    </div>
  );
}

export default Toolbar;
