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
    text:   'text-slate-600   dark:text-slate-400',
    bg:     'bg-slate-50      dark:bg-slate-900/40',
    border: 'border-slate-200 dark:border-slate-700',
    icon:   'bg-slate-100     dark:bg-slate-800/80',
  },
};

// ── 状态系统 ──────────────────────────────────────────────────────────
export type StatusType =
  | 'SUCCESS' | 'WARNING' | 'DANGER' | 'INFO'
  | 'DISABLED' | 'NEUTRAL' | 'PENDING' | 'RUNNING'
  | 'ACTIVE' | 'FROZEN' | 'CANCELLED' | 'COMPLETED';

/** 状态 → Tailwind 类名（前景 + 背景） */
export const STATUS_CLASS: Record<StatusType, string> = {
  SUCCESS:   'text-emerald-700 bg-emerald-50  dark:text-emerald-300 dark:bg-emerald-950/40',
  WARNING:   'text-amber-700   bg-amber-50    dark:text-amber-300   dark:bg-amber-950/40',
  DANGER:    'text-red-700     bg-red-50      dark:text-red-300     dark:bg-red-950/40',
  INFO:      'text-blue-700    bg-blue-50     dark:text-blue-300    dark:bg-blue-950/40',
  DISABLED:  'text-slate-500   bg-slate-100   dark:text-slate-400   dark:bg-slate-800',
  NEUTRAL:   'text-slate-600   bg-slate-100   dark:text-slate-400   dark:bg-slate-800',
  PENDING:   'text-amber-700   bg-amber-50    dark:text-amber-300   dark:bg-amber-950/40',
  RUNNING:   'text-emerald-700 bg-emerald-50  dark:text-emerald-300 dark:bg-emerald-950/40',
  ACTIVE:    'text-emerald-700 bg-emerald-50  dark:text-emerald-300 dark:bg-emerald-950/40',
  FROZEN:    'text-blue-700    bg-blue-50     dark:text-blue-300    dark:bg-blue-950/40',
  CANCELLED: 'text-slate-500   bg-slate-100   dark:text-slate-400   dark:bg-slate-800',
  COMPLETED: 'text-violet-700  bg-violet-50   dark:text-violet-300  dark:bg-violet-950/40',
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
  COMPLETED: '已完成',
  // 业务扩展
  DRAFT:             '草稿',
  APPROVED:          '已审批',
  REJECTED:          '已拒绝',
  OPEN:              '进行中',
  CLOSED:            '已关闭',
  IN_PROGRESS:       '处理中',
  RESOLVED:          '已解决',
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
