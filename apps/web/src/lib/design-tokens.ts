/**
 * Phoenix ERP V3 — Design Tokens (TypeScript)
 * =============================================
 * 单一来源：与 globals.css :root 保持严格同步。
 * 规则：
 *   · 页面/组件不得硬编码颜色值
 *   · inline style 使用 css.* 对象中的 CSS 变量引用
 *   · Tailwind className 优先使用下方 ACCENT_MAP 语义类
 *   · 不再接受 #RRGGBB / rgba() 散落于业务代码
 *
 * 使用方式：
 *   import { TOKENS, ACCENT_MAP, STATUS_LABEL } from '@/lib/design-tokens';
 *   <div style={{ color: TOKENS.css.statusDanger }}>危险</div>
 *   <div className={ACCENT_MAP.blue.text}>蓝色文字</div>
 */

// ── CSS 变量引用（用于 inline style={{ color: ... }}）────────────────
export const TOKENS = {
  css: {
    colorPrimary:   'var(--color-primary)',
    colorAccent:    'var(--color-accent)',

    statusSuccess:  'var(--status-success)',
    statusWarning:  'var(--status-warning)',
    statusDanger:   'var(--status-danger)',
    statusInfo:     'var(--status-info)',
    statusNeutral:  'var(--status-neutral)',

    textPrimary:    'var(--text-primary)',
    textSecondary:  'var(--text-secondary)',
    textDisabled:   'var(--text-disabled)',

    bgCard:         'var(--bg-card)',
    bgPage:         'var(--bg-page)',
    bgMuted:        'var(--bg-muted)',

    border:         'var(--border)',
    shadowSm:       'var(--shadow-sm)',
    shadowMd:       'var(--shadow-md)',

    radiusMd:       'var(--radius-md)',
    radiusLg:       'var(--radius-lg)',
  },
} as const;

// ── 语义强调色映射（Tailwind 类名）──────────────────────────────────────
// 用法: ACCENT_MAP.blue.text  ACCENT_MAP.blue.bg  ACCENT_MAP.blue.border
export type AccentColor =
  | 'blue' | 'green' | 'amber' | 'red'
  | 'violet' | 'teal' | 'indigo' | 'cyan'
  | 'slate';

export const ACCENT_MAP: Record<AccentColor, {
  text:   string;   // icon / value 前景色
  bg:     string;   // 卡片背景 tint
  border: string;   // 卡片边框
  icon:   string;   // icon 容器背景
}> = {
  blue:   {
    text:   'text-blue-600   dark:text-blue-400',
    bg:     'bg-blue-50      dark:bg-blue-950/40',
    border: 'border-blue-200 dark:border-blue-800',
    icon:   'bg-blue-100     dark:bg-blue-900/50',
  },
  green:  {
    text:   'text-emerald-600   dark:text-emerald-400',
    bg:     'bg-emerald-50      dark:bg-emerald-950/40',
    border: 'border-emerald-200 dark:border-emerald-800',
    icon:   'bg-emerald-100     dark:bg-emerald-900/50',
  },
  amber:  {
    text:   'text-amber-600   dark:text-amber-400',
    bg:     'bg-amber-50      dark:bg-amber-950/40',
    border: 'border-amber-200 dark:border-amber-800',
    icon:   'bg-amber-100     dark:bg-amber-900/50',
  },
  red:    {
    text:   'text-red-600   dark:text-red-400',
    bg:     'bg-red-50      dark:bg-red-950/40',
    border: 'border-red-200 dark:border-red-800',
    icon:   'bg-red-100     dark:bg-red-900/50',
  },
  violet: {
    text:   'text-violet-600   dark:text-violet-400',
    bg:     'bg-violet-50      dark:bg-violet-950/40',
    border: 'border-violet-200 dark:border-violet-800',
    icon:   'bg-violet-100     dark:bg-violet-900/50',
  },
  teal:   {
    text:   'text-teal-600   dark:text-teal-400',
    bg:     'bg-teal-50      dark:bg-teal-950/40',
    border: 'border-teal-200 dark:border-teal-800',
    icon:   'bg-teal-100     dark:bg-teal-900/50',
  },
  indigo: {
    text:   'text-indigo-600   dark:text-indigo-400',
    bg:     'bg-indigo-50      dark:bg-indigo-950/40',
    border: 'border-indigo-200 dark:border-indigo-800',
    icon:   'bg-indigo-100     dark:bg-indigo-900/50',
  },
  cyan:   {
    text:   'text-cyan-600   dark:text-cyan-400',
    bg:     'bg-cyan-50      dark:bg-cyan-950/40',
    border: 'border-cyan-200 dark:border-cyan-800',
    icon:   'bg-cyan-100     dark:bg-cyan-900/50',
  },
  slate:  {
    text:   'text-text-muted',
    bg:     'bg-bg-muted',
    border: 'border-border',
    icon:   'bg-bg-muted',
  },
};

// ── 原始强调色（用于 inline style 的左强调条 / color-mix 图标盒 / 主色数字）──────
// 与「生产管理（养殖）」首页统一的卡片配色，是全系统 KpiCard / NavCard 的单一来源。
// 用法：borderLeft: `4px solid ${ACCENT_SOLID.blue}`
//      background: `color-mix(in srgb, ${ACCENT_SOLID.blue} 12%, transparent)`
export const ACCENT_SOLID: Record<AccentColor, string> = {
  blue:   'var(--color-primary)',
  green:  '#16a34a',
  amber:  '#f59e0b',
  red:    '#dc2626',
  violet: '#7c3aed',
  teal:   '#059669',
  indigo: 'var(--color-primary)',
  cyan:   '#0891b2',
  slate:  'var(--text-secondary)',
};

// ── 旧硬编码 hex 颜色 → 全局语义强调色（迁移本地卡片到全局 KpiCard 用）──────────
export function hexToAccent(hex?: string): AccentColor {
  const m: Record<string, AccentColor> = {
    '#2563eb': 'blue',  '#3b82f6': 'blue',
    '#16a34a': 'green', '#10b981': 'green', '#22c55e': 'green', '#059669': 'green',
    '#d97706': 'amber', '#f59e0b': 'amber', '#ea580c': 'amber',
    '#dc2626': 'red',   '#ef4444': 'red',   '#be123c': 'red',   '#e11d48': 'red',
    '#9333ea': 'violet','#8b5cf6': 'violet','#7c3aed': 'violet',
    '#0891b2': 'cyan',  '#06b6d4': 'cyan',
  };
  return (hex && m[hex.toLowerCase()]) || 'slate';
}

// ── 主卡片(KPI)网格标准 ───────────────────────────────────────────────────────
// 全系统主卡片行统一用此响应式网格：列宽按容器比例自适应(auto-fit 撑满)，
// 断点 220px 一致，避免各页布局不齐。inline 页面用 KPI_GRID，CSS 类页面用 .kpiGrid。
import type React from 'react';
export const KPI_GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  // 横向列间距 20，纵向行间距 12（换行成多行时行与行不至于隔太开）
  rowGap: 12,
  columnGap: 20,
};

// ── 状态系统 ──────────────────────────────────────────────────────────
export type StatusType =
  | 'SUCCESS' | 'WARNING' | 'DANGER' | 'INFO'
  | 'DISABLED' | 'NEUTRAL' | 'PENDING' | 'RUNNING'
  | 'ACTIVE' | 'FROZEN' | 'CANCELLED' | 'COMPLETED' | 'DISPATCHED';

/** 状态 → Tailwind 类名（前景 + 背景） */
export const STATUS_CLASS: Record<string, string> = {
  // 通用状态
  SUCCESS:   'text-emerald-700 bg-emerald-50  dark:text-emerald-300 dark:bg-emerald-950/40',
  WARNING:   'text-amber-700   bg-amber-50    dark:text-amber-300   dark:bg-amber-950/40',
  DANGER:    'text-red-700     bg-red-50      dark:text-red-300     dark:bg-red-950/40',
  INFO:      'text-blue-700    bg-blue-50     dark:text-blue-300    dark:bg-blue-950/40',
  DISABLED:  'text-text-dim bg-bg-muted',
  NEUTRAL:   'text-text-muted bg-bg-muted',
  PENDING:   'text-amber-700   bg-amber-50    dark:text-amber-300   dark:bg-amber-950/40',
  RUNNING:   'text-emerald-700 bg-emerald-50  dark:text-emerald-300 dark:bg-emerald-950/40',
  ACTIVE:    'text-emerald-700 bg-emerald-50  dark:text-emerald-300 dark:bg-emerald-950/40',
  FROZEN:    'text-blue-700    bg-blue-50     dark:text-blue-300    dark:bg-blue-950/40',
  CANCELLED: 'text-text-dim bg-bg-muted',
  COMPLETED: 'text-violet-700  bg-violet-50   dark:text-violet-300  dark:bg-violet-950/40',
  // 应收账款状态
  OPEN:               'text-orange-700 bg-orange-50  dark:text-orange-300 dark:bg-orange-950/40',
  PARTIALLY_RECEIVED: 'text-blue-700   bg-blue-50    dark:text-blue-300   dark:bg-blue-950/40',
  RECEIVED:           'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40',
  OVERDUE:            'text-red-700    bg-red-50     dark:text-red-300    dark:bg-red-950/40',
  DISPUTED:           'text-purple-700 bg-purple-50  dark:text-purple-300 dark:bg-purple-950/40',
  WRITTEN_OFF:        'text-yellow-700 bg-yellow-50  dark:text-yellow-300 dark:bg-yellow-950/40',
  // 应付账款状态
  PARTIALLY_PAID: 'text-blue-700   bg-blue-50   dark:text-blue-300   dark:bg-blue-950/40',
  PAID:           'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40',
  // 通用业务状态
  DRAFT:          'text-text-muted bg-bg-muted',
  APPROVED:       'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40',
  REJECTED:       'text-red-700    bg-red-50    dark:text-red-300    dark:bg-red-950/40',
  SUBMITTED:      'text-blue-700   bg-blue-50   dark:text-blue-300   dark:bg-blue-950/40',
  DISPATCHED:     'text-indigo-700 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-950/40',
  CONFIRMED:      'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40',
  EXECUTED:       'text-violet-700 bg-violet-50  dark:text-violet-300 dark:bg-violet-950/40',
  REIMBURSED:     'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40',
  SETTLED:        'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40',
  PENDING_APPROVAL:  'text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/40',
  PENDING_EXECUTION: 'text-blue-700  bg-blue-50  dark:text-blue-300  dark:bg-blue-950/40',
  NORMAL:         'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40',
  CLOSED:         'text-text-dim bg-bg-muted',
};

/** 状态 → 中文标签 */
export const STATUS_LABEL: Record<string, string> = {
  SUCCESS:   '成功',
  WARNING:   '警告',
  DANGER:    '危险',
  INFO:      '信息',
  DISABLED:  '禁用',
  NEUTRAL:   '正常',
  PENDING:   '待处理',
  RUNNING:   '运行中',
  ACTIVE:    '启用',
  FROZEN:    '冻结',
  CANCELLED: '已取消',
  DISPATCHED: '在途',
  COMPLETED: '已完成',
  // 通用业务扩展
  DRAFT:             '草稿',
  APPROVED:          '已审批',
  REJECTED:          '已拒绝',
  OPEN:              '未收款',
  CLOSED:            '已关闭',
  IN_PROGRESS:       '处理中',
  RESOLVED:          '已解决',
  // 应收/应付账款状态
  PARTIALLY_RECEIVED: '部分收款',
  RECEIVED:           '已收清',
  OVERDUE:            '已逾期',
  DISPUTED:           '争议中',
  WRITTEN_OFF:        '已核销',
  PARTIALLY_PAID:     '部分付款',
  PAID:               '已付清',
  // 资金账户状态
  NORMAL:             '正常',
  // 费用/报销状态
  SUBMITTED:          '已提交',
  REIMBURSED:         '已报销',
  CONFIRMED:          '已确认',
  EXECUTED:           '已执行',
  // 股东资金状态
  SETTLED:            '已结算',
  OFFSET:             '已抵扣',
  REFUNDED:           '已退回',
  // 转账状态
  PENDING_APPROVAL:   '待审批',
  PENDING_EXECUTION:  '待执行',
  // 收款方式
  BANK_TRANSFER:      '银行转账',
  CASH:               '现金',
  CHECK:              '支票',
};

// ── 图标尺寸规范 ──────────────────────────────────────────────────────
export const ICON_SIZE = {
  xs:   12,
  sm:   16,
  md:   20,
  lg:   24,
  xl:   32,
} as const;

// ── 间距规范（对应 Tailwind spacing）─────────────────────────────────
export const SPACING = {
  cardPadding:   'p-5',
  sectionGap:    'mb-6',
  gridGap:       'gap-4',
  gridGapSm:     'gap-3',
} as const;

// ════════════════════════════════════════════════════════════════════════
// Design Tokens V2（Phase UI-2.1）— 调色板单一来源
// ────────────────────────────────────────────────────────────────────────
// 目的：消灭页面内散落的 STATUS_COLOR / GRADE_COLORS / SEVERITY_COLOR / 图表硬编码色。
// 说明：图表/分级/风险/实体色无法用 CSS 变量（recharts/canvas 需要具体色值），
//   故此处为「具体色值的单一来源」；所选均为中间明度，浅色/暗色背景下均可读。
//   页面/图表今后只能引用这些常量，不得再写字面量 hex。
// ════════════════════════════════════════════════════════════════════════

/** 品牌主色单一来源说明：业务页面一律用 `var(--color-primary)`（或 TOKENS.css.colorPrimary）。
 *  历史硬编码 #1F4E79 / #1F3864 应在页面迁移阶段（UI-2.9）收敛到此处，禁止再新增字面量。 */
export const BRAND = {
  primaryVar: 'var(--color-primary)',   // 浅色 #1F3864 / 暗色 #4A78B5（由 globals.css 切换）
  accentVar:  'var(--color-accent)',
} as const;

/** 图表色板（按业务域 + 通用序列）。Chart 只能引用此处。 */
export const CHART_PALETTE = {
  // 业务域主色（同域图表保持一致色相）
  sales:       '#2563eb', // 销售—蓝
  procurement: '#7c3aed', // 采购—紫
  inventory:   '#0891b2', // 库存—青
  finance:     '#059669', // 财务—绿
  shareholder: '#d97706', // 股东—琥珀
  approval:    '#db2777', // 审批—品红
  dashboard:   '#1F3864', // 驾驶舱—品牌蓝
  // 多系列序列色（N 条数据系列按序取色，循环使用）
  series: ['#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#dc2626', '#64748b'],
} as const;

/** 分级色板（蛋品/质量分级 AA/A/B/C/D）。替换页面内 GRADE_COLORS。 */
export const GRADE_PALETTE: Record<string, string> = {
  AA: '#6366f1', A: '#10b981', B: '#f59e0b', C: '#ef4444', D: '#94a3b8',
};

/** 风险/告警严重度色板。替换页面内 SEVERITY_COLOR。 */
export const SEVERITY_PALETTE: Record<string, string> = {
  CRITICAL: '#dc2626', HIGH: '#f97316', MEDIUM: '#2563eb', LOW: '#64748b', INFO: '#0891b2',
};

/** 业务实体标识色（实体头像/标签/图例）。 */
export const ENTITY_PALETTE: Record<string, string> = {
  customer:    '#2563eb',
  supplier:    '#7c3aed',
  product:     '#059669',
  project:     '#d97706',
  shareholder: '#1F3864',
  warehouse:   '#0891b2',
  employee:    '#db2777',
};

/** 按索引取序列色（多系列图表用）：getSeriesColor(i) 循环取色。 */
export function getSeriesColor(i: number): string {
  const s = CHART_PALETTE.series;
  return s[((i % s.length) + s.length) % s.length];
}
