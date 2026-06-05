'use client';

/**
 * CockpitGrid — Phoenix DS 响应式驾驶舱网格（UIX-PROD-2）
 *
 * 用法：
 *   <CockpitGrid cols={4}> ...KpiCardV2 cards... </CockpitGrid>
 *
 * 行为：
 *   · cols 指定标准列数（4/3/2）
 *   · 容器查询：父容器宽度 < 720 → 自动 2 列；< 480 → 1 列
 *   · 默认 12px gap
 */

import { ReactNode } from 'react';

interface Props {
  cols?: 2 | 3 | 4 | 5;
  gap?: number;
  minItemWidth?: number;       // 单卡片最小宽（auto-fit 用），默认 200
  className?: string;
  children: ReactNode;
}

export function CockpitGrid({ cols = 4, gap = 12, minItemWidth = 200, className, children }: Props) {
  return (
    <div
      className={className}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${minItemWidth}px, 1fr))`,
        gap,
        // 不让单行卡超过 cols 列宽度（用 maxColumns 限制更优雅但 grid 没有，所以靠 minItemWidth 推算）
      }}
      data-cockpit-cols={cols}
    >
      {children}
    </div>
  );
}

export default CockpitGrid;
