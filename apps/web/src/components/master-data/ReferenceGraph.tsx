"use client";
import { Link2, ExternalLink } from "lucide-react";

/**
 * G5.5-E — ReferenceGraph
 *
 * 简化引用关系图：中心主数据节点 → 业务单据节点（卡片+连线，零额外依赖）
 * 替代方案：未来可换 react-flow / vis-network；当前 CSS+SVG 已可读
 */

export interface ReferenceGraphProps {
  centerLabel: string;
  centerType: string;
  references: Array<{
    refTable: string;
    refDocType: string;
    refCount: number;
    example: string[];
    linkPattern: string;
  }>;
}

export function ReferenceGraph({ centerLabel, centerType, references }: ReferenceGraphProps) {
  if (references.length === 0) {
    return <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>暂无引用</div>;
  }

  return (
    <div style={{ position: 'relative', minHeight: Math.max(280, references.length * 60), padding: '20px 0' }}>
      {/* 中心节点 */}
      <div style={{
        position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)',
        width: 200, padding: '14px 18px', borderRadius: 12,
        background: 'var(--color-primary)', color: 'var(--text-on-dark, white)',
        boxShadow: '0 4px 14px var(--overlay-black-15)',
        textAlign: 'center', zIndex: 2,
      }}>
        <div style={{ fontSize: 11, opacity: 0.8 }}>{centerType}</div>
        <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', marginTop: 4 }}>{centerLabel}</div>
        <div style={{ fontSize: 11, marginTop: 6, opacity: 0.85 }}>
          被 <strong>{references.reduce((s, r) => s + r.refCount, 0)}</strong> 处引用
        </div>
      </div>

      {/* SVG 连线 */}
      <svg style={{ position: 'absolute', left: 220, top: 0, width: 'calc(100% - 220px)', height: '100%', pointerEvents: 'none', zIndex: 1 }}>
        {references.map((_, i) => {
          const centerY = 50; // 百分比
          const targetY = ((i + 0.5) / references.length) * 100;
          return (
            <line key={i} x1="0" y1={`${centerY}%`} x2="40" y2={`${targetY}%`}
              stroke="var(--text-disabled)" strokeWidth="1.5" strokeDasharray="3 3" />
          );
        })}
      </svg>

      {/* 引用节点列表 */}
      <div style={{ marginLeft: 260, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {references.map((r, i) => (
          <a key={i} href={r.linkPattern} style={{
            display: 'block', padding: '10px 14px', borderRadius: 10,
            background: 'var(--bg-muted)', border: '1px solid var(--border)',
            color: 'var(--text-primary)', textDecoration: 'none',
            transition: 'all 0.2s', cursor: 'pointer',
          }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.transform = 'translateX(2px)';
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-accent)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.transform = '';
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: 'var(--color-accent)1a', color: 'var(--color-accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Link2 size={16} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {r.refDocType}
                  <span style={{ marginLeft: 8, padding: '1px 8px', borderRadius: 4,
                                 background: 'var(--status-warning-bg, var(--status-warning-bg-light))',
                                 color: 'var(--status-warning, var(--status-warning))', fontSize: 11 }}>
                    × {r.refCount}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3, fontFamily: 'monospace' }}>
                  {r.refTable}
                  {r.example.length > 0 && (
                    <span style={{ marginLeft: 8, color: 'var(--text-disabled)' }}>
                      · 例：{r.example.slice(0, 3).join(' / ')}
                      {r.example.length > 3 && ` 等 ${r.example.length} 条`}
                    </span>
                  )}
                </div>
              </div>
              <ExternalLink size={13} style={{ color: 'var(--text-disabled)' }} />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

export default ReferenceGraph;
