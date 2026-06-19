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
export const primaryActionButton: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 18px',
  borderRadius: 8,
  background: 'var(--color-primary)',
  color: 'var(--text-on-dark, white)',
  border: 'none',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

// ── 次级按钮（"取消" / 灰底） ──────────────────────────
export const secondaryActionButton: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 18px',
  borderRadius: 8,
  background: 'var(--bg-muted)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};

// ── 输入框（input / textarea / select 共用） ──────────
// G94：并入唯一真相源 —— 与 forms/FormField.fieldInputStyle 完全一致（8/11·圆角md·13.5），
//   使「页面直接用 inputField 的 input」与「设计系统 TextInput/SelectField」在同一行不再错位。
//   历史值（8/12·圆角8·14）是错位根因，已废弃。
export const inputField: CSSProperties = {
  width: '100%',
  padding: '8px 11px',
  borderRadius: 'var(--radius-md)',
  fontSize: 13.5,
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.12s',
};

// ── 表格行内编辑输入框（紧凑型，单一真相源；取代各页自定义 cellInp）──────────
// G94：消灭 procurement2/orders·payments、sales2/pricing 等各自复制的 cellInp（3/6·圆角4）。
export const tableInputCell: CSSProperties = {
  width: '100%',
  padding: '5px 8px',
  borderRadius: 6,
  fontSize: 12.5,
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
  outline: 'none',
  boxSizing: 'border-box',
};

// ── 输入框 className 版（抽屉/表单内与 DictSelect/Selector 视觉对齐）──────────
// G37 建立、G39 对齐：token 与 ScopedSelect/DictSelect 完全一致
// （padding 8/12、圆角 7、字号 13、bg-card），消除同行 input 与 select 错位。
export const inputFieldClass =
  'w-full px-3 py-2 rounded-[7px] text-[13px] border border-border bg-bg-card text-text placeholder:text-text-dim outline-none focus:border-emerald-400 box-border';

// ── 表单 label ────────────────────────────────────────
export const formLabel: CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: 'var(--text-secondary)',
  marginBottom: 6,
  fontWeight: 500,
};

// ── Drawer / Modal mask（毛玻璃覆盖层；zIndex > sidebar 10001） ──
export const drawerMask: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'var(--overlay-mask)',
  backdropFilter: 'blur(3px)',          // 毛玻璃（全局抽屉统一）
  WebkitBackdropFilter: 'blur(3px)',
  zIndex: 10010,
  display: 'flex',
  justifyContent: 'flex-end',
  animation: 'phx-fade-in .15s ease',
};

// ── Drawer 右侧滑出面板 ─────────────────────────────────
export const drawerPanel = (width: number = 460): CSSProperties => ({
  width,
  maxWidth: '95vw',
  background: 'var(--bg-card)',
  height: '100%',
  overflowY: 'auto',
  padding: 24,
  boxShadow: '0 0 40px var(--overlay-black-25)',
});

// ── Drawer 顶部 header（title + 关闭按钮） ─────────────
export const drawerHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 20,
  paddingBottom: 14,
  borderBottom: '1px solid var(--border)',
};

export const drawerHeaderTitle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 700,
  color: 'var(--text-primary)',
};

export const drawerCloseButton: CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-secondary)',
  padding: 4,
  borderRadius: 6,
  display: 'inline-flex',
};

// ── Drawer footer（取消 / 确认 按钮组） ─────────────────
export const drawerFooter: CSSProperties = {
  display: 'flex',
  gap: 10,
  marginTop: 24,
  paddingTop: 16,
  borderTop: '1px solid var(--border)',
};

// ── 中央 Modal mask（dialog 风格，居中显示） ────────────
export const modalMask: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'var(--overlay-black-45)',
  zIndex: 10010,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

// ── 中央 Modal panel（cardbox 风格） ───────────────────
export const modalPanel = (width: number = 480): CSSProperties => ({
  width,
  maxWidth: '95vw',
  maxHeight: '90vh',
  overflowY: 'auto',
  background: 'var(--bg-card)',
  borderRadius: 14,
  padding: 28,
  boxShadow: '0 20px 60px var(--overlay-black-25)',
});

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

// ── 行内可点徽章按钮（表格内"设为主 / 移除 / 切换"等紧凑操作） ──
// 复用 inlineBadge 配色，加描边 + 按钮交互；表格单元格统一用它，禁止页面自写 rounded/bg/text 类。
export const badgeButton = (tone: 'default' | 'success' | 'warning' | 'danger' = 'default'): CSSProperties => {
  const b = inlineBadge(tone);
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1.4,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    background: b.background,
    color: b.color,
    border: `1px solid ${
      tone === 'success' ? 'var(--status-success)' :
      tone === 'warning' ? 'var(--status-warning)' :
      tone === 'danger'  ? 'var(--status-danger)'  :
      'var(--border)'
    }`,
  };
};

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

// ── 搜索 / 筛选工具栏（卡片样式，统一搜索区） ────────
export const searchToolbar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
  padding: '14px 16px',
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  marginBottom: 16,
};

// ── 工具栏内筛选 pill（active / inactive） ───────────
export const toolbarFilterPill = (active: boolean): CSSProperties => ({
  padding: '6px 14px',
  borderRadius: 100,
  fontSize: 12,
  fontWeight: active ? 700 : 500,
  cursor: 'pointer',
  border: '1px solid',
  borderColor: active ? 'var(--color-primary)' : 'var(--border)',
  background: active ? 'var(--color-primary)' : 'var(--bg-card)',
  color: active ? 'var(--text-on-dark, white)' : 'var(--text-secondary)',
  transition: 'all 0.12s',
  lineHeight: 1.4,
});

// ── 工具栏内搜索输入框（高度对齐按钮） ───────────
export const toolbarSearchInput: CSSProperties = {
  ...inputField,
  width: 240,
  padding: '8px 14px',
  fontSize: 13,
};

// ── 表格容器（与工具栏统一边框 / 间距） ───────────
export const tableContainer: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  overflow: 'hidden',
};

// ── 表格表头单元格 ───────────────────────────────
export const tableHeaderCell: CSSProperties = {
  padding: '12px 14px',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--text-secondary)',
  background: 'var(--bg-muted)',
  borderBottom: '1px solid var(--border)',
  textTransform: 'uppercase',
  letterSpacing: 0.3,
  whiteSpace: 'nowrap',
};

// ── 表格数据单元格 ───────────────────────────────
export const tableBodyCell: CSSProperties = {
  padding: '12px 14px',
  fontSize: 13,
  color: 'var(--text-primary)',
  borderBottom: '1px solid var(--border)',
  verticalAlign: 'middle',
};

// ── 标签页 Tab 容器 + Tab 项 ──────────────────────
export const tabBar: CSSProperties = {
  display: 'flex',
  gap: 0,
  borderBottom: '1px solid var(--border)',
  marginBottom: 16,
};

export const tabItem = (active: boolean): CSSProperties => ({
  padding: '12px 22px',
  fontSize: 13,
  fontWeight: active ? 700 : 500,
  color: active ? 'var(--color-primary)' : 'var(--text-secondary)',
  background: 'transparent',
  border: 'none',
  borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
  marginBottom: -1,
  cursor: 'pointer',
  transition: 'color 0.12s',
});

// ── Hero Banner（渐变标题卡，主页/报表/模块入口共用） ──
export const heroBanner: CSSProperties = {
  background: 'linear-gradient(135deg, var(--brand-deep-3) 0%, var(--status-info) 100%)',
  borderRadius: 16,
  padding: '22px 26px',
  marginBottom: 20,
  color: 'var(--text-on-dark, #fff)',
  display: 'flex',
  alignItems: 'flex-start',
  gap: 16,
  boxShadow: '0 4px 16px var(--overlay-black-08)',
};

export const heroBannerTitle: CSSProperties = {
  fontWeight: 700,
  fontSize: 16,
  marginBottom: 4,
  letterSpacing: 0.2,
};

export const heroBannerSubtitle: CSSProperties = {
  fontSize: 12.5,
  opacity: 0.88,
  lineHeight: 1.7,
};

export const heroBannerKpi = (heroBig: number = 32): CSSProperties => ({
  fontSize: heroBig,
  fontWeight: 900,
  letterSpacing: -0.5,
  lineHeight: 1.1,
});

// 渐变 hero 内部的 tag chips
export const heroTagChip: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: '3px 10px',
  borderRadius: 100,
  background: 'rgba(255,255,255,0.18)',
  color: 'var(--text-on-dark, #fff)',
  letterSpacing: 0.2,
};

// ── 子 Tab 导航（含图标，与 tabBar 并列共用） ──────
export const subTabBar: CSSProperties = {
  display: 'flex',
  gap: 4,
  marginBottom: 20,
  borderBottom: '1px solid var(--border)',
  overflowX: 'auto',
};

export const subTabItem = (active: boolean): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '10px 16px',
  fontSize: 13,
  fontWeight: active ? 700 : 500,
  color: active ? 'var(--color-primary)' : 'var(--text-secondary)',
  background: 'transparent',
  border: 'none',
  borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
  marginBottom: -1,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  borderRadius: '8px 8px 0 0',
  transition: 'color 0.12s',
});

// ── 小标题（卡片区段 / TableWrapper 头部） ──────────
export const sectionTitle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  margin: '20px 0 10px',
  letterSpacing: 0.3,
};

// ── 列表式数据卡片（Reports/SHF 的统计 mini-card） ──
export const statTile: CSSProperties = {
  background: 'var(--bg-muted)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '12px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 120,
};

export const statTileLabel: CSSProperties = {
  fontSize: 11,
  color: 'var(--text-secondary)',
  fontWeight: 500,
};

export const statTileValue: CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
  color: 'var(--text-primary)',
};

// ── 业务列表行卡片（SHF 出资 / 转账 / 报销） ────────
export const businessListCard = (tone: 'default' | 'success' | 'warning' | 'danger' | 'info' = 'default'): CSSProperties => {
  const TONE: Record<string, string> = {
    default: 'var(--border)',
    success: 'var(--status-success)',
    warning: 'var(--status-warning)',
    danger:  'var(--status-danger)',
    info:    'var(--status-info)',
  };
  return {
    background: 'var(--bg-card)',
    borderRadius: 14,
    border: `1px solid ${TONE[tone]}`,
    padding: '16px 20px',
    cursor: 'pointer',
    transition: 'box-shadow 0.12s',
  };
};

// ── 表格分页栏（与表头表体对齐 padding） ──────────
export const tablePagination: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '16px 20px',
  fontSize: 13,
  color: 'var(--text-secondary)',
  borderTop: '1px solid var(--border)',
  background: 'var(--bg-card)',
};

// ── KPI 卡片（统一 padding 充足、不挤） ──────────
export const kpiCard: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '16px 18px',
  boxShadow: '0 1px 4px var(--overlay-black-04)',
  minHeight: 96,
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

// ════════════════════════════════════════════════════════════════════
// g200a 模板 token（2026-06-19，刘杰 UAT 后从参考页 ar-reconciliation +
// cash-accounts 抽出，全 finance2 + 推广模块共用）
// ════════════════════════════════════════════════════════════════════

// ── 等宽字体栈（数字列对齐，全平台一致） ──────────
// 移植自 g199c ar-reconciliation 参考页。各页面 monospace 字符串 → 用此常量。
export const MONO_FONT =
  "'SF Mono', 'Menlo', 'Consolas', 'Courier New', monospace" as const;

// ── 紧凑 KPI 卡片（4-6 个并排时用，与 KpiCardV2 size=md 对齐） ──────────
// 顶部 label 12px + 大数字 20px + 左侧 3px 色条。
// 替代 cash-accounts 当前自写的 Tailwind 浅色背景 4 卡（视觉过重）。
export const kpiCardCompact = (tone: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'brand' = 'default'): CSSProperties => {
  const ACCENT: Record<string, string> = {
    default: 'var(--text-secondary)',
    brand:   'var(--color-primary)',
    info:    'var(--status-info)',
    success: 'var(--status-success)',
    warning: 'var(--status-warning)',
    danger:  'var(--status-danger)',
  };
  return {
    position: 'relative',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderLeft: `3px solid ${ACCENT[tone]}`,
    borderRadius: 12,
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minHeight: 84,
    boxSizing: 'border-box',
  };
};
export const kpiCardCompactLabel: CSSProperties = {
  fontSize: 12,
  color: 'var(--text-secondary)',
  fontWeight: 500,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};
export const kpiCardCompactValue = (tone: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'brand' = 'default'): CSSProperties => {
  const FG: Record<string, string> = {
    default: 'var(--text-primary)',
    brand:   'var(--color-primary)',
    info:    'var(--status-info)',
    success: 'var(--status-success)',
    warning: 'var(--status-warning)',
    danger:  'var(--status-danger)',
  };
  return {
    fontSize: 20,
    fontWeight: 700,
    color: FG[tone],
    fontFamily: MONO_FONT,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.15,
    wordBreak: 'break-word',
  };
};

// ── 行内操作按钮 actionPill（6 态：default / success / warning / danger / info / brand） ──
// 用于列表卡片 / 流水行的「编辑·冻结·解冻·删除·改挂」等动作。
// 替代 cash-accounts 当前 6 种 Tailwind 长 className（颜色散乱）。
export const actionPill = (tone: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'brand' = 'default', disabled = false): CSSProperties => {
  const TONE: Record<string, { fg: string; bg: string; border: string }> = {
    default: { fg: 'var(--text-secondary)', bg: 'var(--bg-card)',                                         border: 'var(--border)' },
    brand:   { fg: 'var(--color-primary)',  bg: 'color-mix(in srgb, var(--color-primary) 8%, transparent)',  border: 'color-mix(in srgb, var(--color-primary) 30%, transparent)' },
    info:    { fg: 'var(--status-info)',    bg: 'color-mix(in srgb, var(--status-info) 8%, transparent)',    border: 'color-mix(in srgb, var(--status-info) 30%, transparent)' },
    success: { fg: 'var(--status-success)', bg: 'color-mix(in srgb, var(--status-success) 8%, transparent)', border: 'color-mix(in srgb, var(--status-success) 30%, transparent)' },
    warning: { fg: 'var(--status-warning)', bg: 'color-mix(in srgb, var(--status-warning) 10%, transparent)', border: 'color-mix(in srgb, var(--status-warning) 35%, transparent)' },
    danger:  { fg: 'var(--status-danger)',  bg: 'color-mix(in srgb, var(--status-danger) 8%, transparent)',  border: 'color-mix(in srgb, var(--status-danger) 30%, transparent)' },
  };
  const t = TONE[tone];
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.4,
    whiteSpace: 'nowrap',
    cursor: disabled ? 'not-allowed' : 'pointer',
    background: t.bg,
    color: t.fg,
    border: `1px solid ${t.border}`,
    opacity: disabled ? 0.5 : 1,
    transition: 'background-color 0.12s',
  };
};

// ── 金额 cell（MONO + tabular-nums，3 档字号 sm/md/lg） ──────────
// 替代各页面散落的 monospace + fontVariantNumeric 三件套写法。
export const moneyCell = (
  tone: 'default' | 'success' | 'warning' | 'danger' = 'default',
  size: 'sm' | 'md' | 'lg' = 'md',
): CSSProperties => {
  const TONE: Record<string, string> = {
    default: 'var(--text-primary)',
    success: 'var(--status-success)',
    warning: 'var(--status-warning)',
    danger:  'var(--status-danger)',
  };
  const SZ = { sm: 12, md: 14, lg: 18 };
  return {
    fontFamily: MONO_FONT,
    fontVariantNumeric: 'tabular-nums',
    fontSize: SZ[size],
    fontWeight: size === 'lg' ? 700 : 600,
    color: TONE[tone],
    whiteSpace: 'nowrap',
  };
};

// ── 流水行容器（左侧色条标 IN/OUT，主体白底 + var(--border)） ──────────
// 替代 cash-accounts 抽屉里 Tailwind 浅绿/浅橙双色背景方案（暗模式漏覆盖、视觉吵）。
export const txnRow = (direction: 'IN' | 'OUT'): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '10px 12px',
  borderRadius: 8,
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderLeft: `3px solid ${direction === 'IN' ? 'var(--status-success)' : 'var(--status-warning)'}`,
});

// ── Drawer 内部 hero 余额块（克制白底 + 主色数字，替代 cash 抽屉的渐变蓝） ──
// 渐变蓝在暗色下与全局色系冲突，且过度强调；改为白底 + 主色数字 + 灰底标签。
export const drawerHeroBox: CSSProperties = {
  background: 'var(--bg-muted)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '14px 16px',
  marginBottom: 18,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  gap: 12,
};

// ── 单据详情信息块(基本字段网格容器,灰底克制) ──
// 用于:抽屉里"基本信息"卡 / 详情头部摘要。
// 替代各页面自写的 `background: var(--bg-muted), border, borderRadius, padding` 三件套。
export const detailInfoBox: CSSProperties = {
  background: 'var(--bg-muted)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: 14,
};

// ── 横向记录行(左色条 + flex-between 左侧元数据 + 右侧金额/操作) ──
// 用于:收款核销记录 / 付款明细 / 关联单据 / 历史动作行。
// 替代 ar/ap 等页里自写"Tailwind 浅色背景 + flex-between"的散乱写法。
export const recordRow = (tone: 'default' | 'success' | 'warning' | 'danger' | 'info' = 'default'): CSSProperties => {
  const COLOR: Record<string, string> = {
    default: 'var(--border)',
    success: 'var(--status-success)',
    warning: 'var(--status-warning)',
    danger:  'var(--status-danger)',
    info:    'var(--status-info)',
  };
  return {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderLeft: `3px solid ${COLOR[tone]}`,
    borderRadius: 8,
    padding: '10px 12px',
    marginBottom: 6,
    fontSize: 12,
  };
};

// ── 行内告警条(账龄/超期/异常 4 态:success/warning/danger/info) ──
// 替代各页面自写 `bg-{tone}/10 border border-{tone}/20 ... text-{tone}` 套路。
export const inlineAlert = (tone: 'success' | 'warning' | 'danger' | 'info' = 'danger'): CSSProperties => {
  const COLOR: Record<string, string> = {
    success: 'var(--status-success)',
    warning: 'var(--status-warning)',
    danger:  'var(--status-danger)',
    info:    'var(--status-info)',
  };
  const c = COLOR[tone];
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 12px',
    borderRadius: 8,
    fontSize: 12,
    background: `color-mix(in srgb, ${c} 8%, transparent)`,
    border: `1px solid color-mix(in srgb, ${c} 30%, transparent)`,
    color: c,
  };
};

// ── 操作区灰底外框(危险操作包装 / 内嵌编辑表单包装) ──
// 用于:取消单据区 / 改挂账户区 / 流水编辑区等"展开后的操作面板"。
// 替代各页自写 `border border-orange-200 rounded-xl p-3.5 bg-orange-50` 等彩色嵌套。
export const actionGroupBox: CSSProperties = {
  background: 'var(--bg-muted)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: 12,
};
