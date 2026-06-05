/**
 * Phoenix Cockpit Style Tokens (UIX-PROD-2)
 *
 * 所有驾驶舱/主数据列表页共用样式常量。
 * 同样的视觉元素必须 import 这里，不要每页 inline 重写。
 *
 * 设计目标：
 *   · 卡片 padding 充足（不挤文字）
 *   · 字号 hierarchy 清晰
 *   · 长文字不截断（用 break-word 不用 ellipsis）
 *   · 间距宽松
 */

import type { CSSProperties } from 'react';

// ── 尺寸常量 ──────────────────────────────────────────
export const COCKPIT = {
  cardRadius:      14,
  cardPadding:     16,         // 卡片内边距（紧凑统一）
  cardHeaderPadX:  20,
  cardHeaderPadY:  14,
  cardGap:         12,         // 卡片之间间距
  sectionGap:      16,
  rowGap:          8,          // 卡片内 row 间距

  // 属性单元格（紧凑：行高 36）
  propPadX:        16,
  propPadY:        9,          // 14 → 9：行高更紧凑
  propLabelW:      60,
  propLabelGap:    10,

  // 字号（系统化 hierarchy）
  fsCardHead:      13,
  fsKpiHero:       32,          // 38 → 32：缩小避免占空间
  fsKpiNumber:     18,          // 22 → 18
  fsLabel:         11,
  fsValue:         13,
  fsValueStrong:   14,
  fsHint:          11,

  // 间距
  spaceXs:         4,
  spaceSm:         8,
  spaceMd:         12,
  spaceLg:         16,
  spaceXl:         20,
} as const;

// ── 容器样式 ──────────────────────────────────────────
export const cockpitCard: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: COCKPIT.cardRadius,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

export const cockpitCardBody: CSSProperties = {
  padding: COCKPIT.cardPadding,
  paddingTop: COCKPIT.spaceMd,    // header 占了上部分 padding，body 不再 padding-top
  flex: 1,
  minHeight: 0,
};

// ── 卡片头（与 body 共享 padding，但保留 16px bottom 让 header 跟下方 row 分离） ──
export const cockpitCardHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: `${COCKPIT.cardHeaderPadY}px ${COCKPIT.cardPadding}px ${COCKPIT.rowGap + 4}px`,
};

export const cockpitCardHeaderTitle: CSSProperties = {
  fontSize: COCKPIT.fsCardHead,
  fontWeight: 600,
  color: 'var(--text-primary)',
  letterSpacing: 0.3,
  textTransform: 'uppercase' as const,
};

export const cockpitCardHeaderHint: CSSProperties = {
  marginLeft: 'auto',
  fontSize: 11,
  color: 'var(--text-secondary)',
  fontWeight: 500,
};

// ── KPI Hero 数字 ─────────────────────────────────────
export const kpiHeroNumber: CSSProperties = {
  fontSize: COCKPIT.fsKpiHero,
  fontWeight: 800,
  color: 'var(--text-primary)',
  lineHeight: 1,
  letterSpacing: -1,
};

export const kpiHeroLabel: CSSProperties = {
  fontSize: COCKPIT.fsValue,
  color: 'var(--text-secondary)',
};

// ── 属性单元格 (label-value 一行) ────────────────────
export const propCell: CSSProperties = {
  padding: `${COCKPIT.propPadY}px ${COCKPIT.propPadX}px`,
  display: 'flex',
  alignItems: 'center',
  gap: COCKPIT.propLabelGap,
  minHeight: 36,                // 48 → 36：行高更紧凑
};

export const propLabel: CSSProperties = {
  fontSize: COCKPIT.fsLabel,
  color: 'var(--text-secondary)',
  minWidth: COCKPIT.propLabelW,
  flexShrink: 0,
  fontWeight: 500,
  letterSpacing: 0.2,
  paddingTop: 2,
};

export const propValue: CSSProperties = {
  fontSize: COCKPIT.fsValue,
  color: 'var(--text-primary)',
  fontWeight: 500,
  wordBreak: 'break-word' as const,
  flex: 1,
  minWidth: 0,
};

// ── 列表行 (右栏 status item) — 紧凑 ─────────────────
export const listRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  padding: '6px 10px',          // 8/12 → 6/10
  borderRadius: 6,
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: 13,
  color: 'var(--text-primary)',
  textAlign: 'left' as const,
};

// ── KPI mini number (3 列对照用) ──────────────────────
export const kpiMiniNumber = (tone: 'default' | 'success' | 'warning' | 'danger' = 'default'): CSSProperties => ({
  fontSize: COCKPIT.fsKpiNumber,
  fontWeight: 700,
  lineHeight: 1.1,
  color: tone === 'success' ? 'var(--status-success)'
       : tone === 'warning' ? 'var(--status-warning)'
       : tone === 'danger'  ? 'var(--status-danger)'
       : 'var(--text-primary)',
});

export const kpiMiniLabel: CSSProperties = {
  fontSize: COCKPIT.fsLabel,
  color: 'var(--text-secondary)',
  letterSpacing: 0.2,
};

// ── 风险评分徽章 ──────────────────────────────────────
export const scoreBadge = (passing: boolean): CSSProperties => ({
  marginLeft: 'auto',
  fontSize: 11,
  fontWeight: 700,
  padding: '3px 8px',
  borderRadius: 6,
  background: passing ? 'var(--status-success-bg-light)' : 'var(--status-warning-bg-light)',
  color: passing ? 'var(--status-success)' : 'var(--status-warning)',
});

// ── 风险检查项 — 紧凑 ────────────────────────────────
export const riskItem: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 12,
  padding: '2px 0',              // 4 → 2：紧凑
};

// ── 全局主操作按钮（"+ 新建/新增 XXX"） ──────────────
// 对齐 MasterDataRuntimePanel:130 现有样式
export const primaryActionButton: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 18px',
  borderRadius: 7,
  background: 'var(--color-primary)',
  color: 'var(--text-on-dark, white)',
  border: 'none',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

// ── 内联 badge（label/value 中表示"未指定"等状态） ───
export const inlineBadge = (tone: 'default' | 'success' | 'warning' | 'danger' = 'default'): CSSProperties => ({
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 600,
  background:
    tone === 'success' ? 'var(--status-success-bg-light)' :
    tone === 'warning' ? 'var(--status-warning-bg-light)' :
    tone === 'danger'  ? 'var(--status-danger-bg-light)'  :
    'var(--bg-muted)',
  color:
    tone === 'success' ? 'var(--status-success)' :
    tone === 'warning' ? 'var(--status-warning)' :
    tone === 'danger'  ? 'var(--status-danger)'  :
    'var(--text-secondary)',
});

// ── 全局 Pill Badge（"集团 / 启用 / 事业群"等业务徽章） ─
// 统一 padding / 字号 / 圆角 / border 厚度 —— 颜色由调用方加 className 控制
export const pillBadge: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 14px',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  border: '1px solid',
  lineHeight: 1.2,
  whiteSpace: 'nowrap',
};

// 颜色 tone 完整封装（建议优先用）
export const pillBadgeWithTone = (tone: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'brand'): CSSProperties => {
  const TONE: Record<string, { bg: string; fg: string; border: string }> = {
    default: { bg: 'var(--bg-muted)',                 fg: 'var(--text-secondary)', border: 'var(--border)' },
    brand:   { bg: 'var(--status-info-bg-faint)',     fg: 'var(--color-primary)',  border: 'var(--color-primary)' },
    info:    { bg: 'var(--status-info-bg-faint)',     fg: 'var(--status-info)',    border: 'var(--status-info)' },
    success: { bg: 'var(--status-success-bg-faint)',  fg: 'var(--status-success)', border: 'var(--status-success)' },
    warning: { bg: 'var(--status-warning-bg-faint)',  fg: 'var(--status-warning)', border: 'var(--status-warning)' },
    danger:  { bg: 'var(--status-danger-bg-faint)',   fg: 'var(--status-danger)',  border: 'var(--status-danger)' },
  };
  const t = TONE[tone];
  return { ...pillBadge, background: t.bg, color: t.fg, borderColor: t.border };
};
