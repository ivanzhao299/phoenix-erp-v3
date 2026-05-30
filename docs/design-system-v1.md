# Phoenix ERP V3 — Design System V1

> 版本：v1.0.0  
> 生效日期：2026-05-30  
> 适用范围：Finance / Sales / Master Data 三大模块（Phase 1）

---

## 一、设计原则

| 原则 | 说明 |
|------|------|
| **单一来源** | 颜色只来自 `globals.css :root` CSS 变量 或 `design-tokens.ts ACCENT_MAP`，禁止硬编码 `#RRGGBB` / `rgba()` |
| **语义化** | 颜色传达含义（蓝=信息/主要，绿=成功，红=危险，黄=警告），不凭视觉感受随意选色 |
| **暗黑兼容** | 所有组件同时在 Light / Dark 主题下有效，Tailwind `dark:` 变体必须与 light 同步编写 |
| **Lucide 图标** | 全局只用 Lucide React，尺寸规范 12 / 16 / 20 / 24 / 32 px |
| **间距规范** | 卡片 padding p-5，区块间距 mb-6，网格间距 gap-4 / gap-3 |

---

## 二、颜色系统

### 2.1 CSS 变量（`globals.css :root`）

| 变量 | 含义 | TypeScript 引用 |
|------|------|-----------------|
| `--color-primary` | 主品牌色 | `TOKENS.css.colorPrimary` |
| `--status-success` | 成功绿 | `TOKENS.css.statusSuccess` |
| `--status-warning` | 警告橙 | `TOKENS.css.statusWarning` |
| `--status-danger`  | 危险红 | `TOKENS.css.statusDanger` |
| `--text-primary`   | 主文字 | `TOKENS.css.textPrimary` |
| `--text-secondary` | 次文字 | `TOKENS.css.textSecondary` |
| `--bg-card`        | 卡片背景 | `TOKENS.css.bgCard` |
| `--border`         | 默认边框 | `TOKENS.css.border` |

用于 `style={{ color: TOKENS.css.statusDanger }}` 这种 inline style 场景。

### 2.2 语义强调色（`ACCENT_MAP`）

来自 `apps/web/src/lib/design-tokens.ts`，9 种强调色：

| AccentColor | 代表含义 | text | bg | border | icon |
|-------------|----------|------|----|--------|------|
| `blue`      | 信息/主要 | `text-blue-600 dark:text-blue-400` | `bg-blue-50 dark:bg-blue-950/40` | `border-blue-200 dark:border-blue-800` | `bg-blue-100 dark:bg-blue-900/50` |
| `green`     | 成功/收入 | `text-emerald-600 dark:text-emerald-400` | `bg-emerald-50 dark:bg-emerald-950/40` | `border-emerald-200 dark:border-emerald-800` | `bg-emerald-100 dark:bg-emerald-900/50` |
| `amber`     | 警告/待处理 | `text-amber-600 dark:text-amber-400` | `bg-amber-50 dark:bg-amber-950/40` | `border-amber-200 dark:border-amber-800` | `bg-amber-100 dark:bg-amber-900/50` |
| `red`       | 危险/逾期 | `text-red-600 dark:text-red-400` | `bg-red-50 dark:bg-red-950/40` | `border-red-200 dark:border-red-800` | `bg-red-100 dark:bg-red-900/50` |
| `violet`    | 特殊/完成 | `text-violet-600 dark:text-violet-400` | — | — | `bg-violet-100 dark:bg-violet-900/50` |
| `teal`      | 流程/配送 | `text-teal-600 dark:text-teal-400` | — | — | `bg-teal-100 dark:bg-teal-900/50` |
| `indigo`    | 系统/设置 | `text-indigo-600 dark:text-indigo-400` | — | — | `bg-indigo-100 dark:bg-indigo-900/50` |
| `cyan`      | 数据/转账 | `text-cyan-600 dark:text-cyan-400` | — | — | `bg-cyan-100 dark:bg-cyan-900/50` |
| `slate`     | 中性/禁用 | `text-slate-600 dark:text-slate-400` | — | — | `bg-slate-100 dark:bg-slate-800/80` |

**用法：**
```tsx
import { ACCENT_MAP } from '@/lib/design-tokens';
const ac = ACCENT_MAP['blue'];
// ac.text    → Tailwind 文字色类名
// ac.bg      → Tailwind 背景色类名
// ac.border  → Tailwind 边框色类名
// ac.icon    → Tailwind 图标容器背景类名
```

### 2.3 状态系统（`STATUS_CLASS` / `STATUS_LABEL`）

| StatusType | 中文标签 | 颜色 |
|------------|----------|------|
| SUCCESS    | 成功      | emerald |
| WARNING    | 警告      | amber |
| DANGER     | 危险      | red |
| INFO       | 信息      | blue |
| DISABLED   | 禁用      | slate |
| NEUTRAL    | 正常      | slate |
| PENDING    | 待处理    | amber |
| RUNNING    | 运行中    | emerald |
| ACTIVE     | 启用      | emerald |
| FROZEN     | 冻结      | blue |
| CANCELLED  | 已取消    | slate |
| COMPLETED  | 已完成    | violet |

**用法：**
```tsx
import { StatusBadge } from '@/components/ui/StatusBadge';
<StatusBadge status="ACTIVE" />
<StatusBadge status="PENDING" size="sm" />
```

---

## 三、组件规范

### 3.1 KpiCard — KPI 指标卡片

文件：`apps/web/src/components/ui/KpiCard.tsx`

```tsx
<KpiCard
  label="现金账户余额"
  value="¥ 128,000.00"
  subValue="3 个账户"
  trend={+5.2}
  trendLabel="较昨日"
  icon={Wallet}
  accentColor="blue"
  loading={loading}
  onClick={() => router.push('/finance2/cash-accounts')}
/>
```

**Props：**
| Prop | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| label | string | ✅ | — | 指标标签 |
| value | string\|number | ✅ | — | 主值 |
| subValue | string | — | — | 次级说明 |
| trend | number | — | — | 趋势百分比 |
| trendLabel | string | — | `'较昨日'` | 趋势说明 |
| icon | React.ElementType | ✅ | — | Lucide 图标 |
| accentColor | AccentColor | — | `'blue'` | 语义色 |
| loading | boolean | — | `false` | 骨架屏 |
| onClick | () => void | — | — | 点击跳转 |

### 3.2 StatusBadge — 状态徽章

文件：`apps/web/src/components/ui/StatusBadge.tsx`

```tsx
<StatusBadge status="ACTIVE" />               // 启用（emerald）
<StatusBadge status="PENDING" size="sm" />     // 待处理（amber，紧凑）
<StatusBadge status="CUSTOM" label="自定义" /> // 覆盖标签
```

### 3.3 DataTableV2 — 标准数据表格

文件：`apps/web/src/components/ui/DataTableV2.tsx`

```tsx
<DataTableV2
  title="订单列表"
  columns={[
    { key: 'order_no', title: '订单号', width: '140px' },
    { key: 'status',   title: '状态',   render: (v) => <StatusBadge status={String(v)} /> },
    { key: 'amount',   title: '金额',   align: 'right' },
  ]}
  data={rows}
  loading={loading}
  total={total}
  page={page}
  pageSize={20}
  onPageChange={setPage}
  onRefresh={load}
  stats={[
    { label: '今日订单', value: stats.today },
    { label: '逾期', value: stats.overdue, highlight: true },
  ]}
  actions={<button className="...">新建订单</button>}
/>
```

---

## 四、卡片系统

### 4.1 四种卡片类型

| 类型 | 组件 | 用途 |
|------|------|------|
| KPI 指标卡 | `KpiCard` | 仪表盘顶部核心指标，带图标+数值+趋势 |
| 功能导航卡 | 内联 `<Link>` 块 | 模块首页的功能入口，带图标+标题+描述+进入链接 |
| 状态统计卡 | `StatChip` | 订单看板的小型状态计数，图标+数字+标签 |
| 信息列表卡 | `DataTableV2` | 列表页数据展示，带工具栏+统计+表格+分页 |

### 4.2 卡片规范

```
圆角：rounded-2xl（16px）
边框：border + ac.border（语义色边框）
背景：bg-white dark:bg-slate-800
阴影：shadow-sm，hover:shadow-md
内边距：p-5（标准）/ p-4（紧凑）/ p-3.5（最紧凑）
悬停：hover:-translate-y-0.5 hover:shadow-md transition-all
```

---

## 五、仪表盘布局规范

```
┌─────────────────────────────────────────────┐
│  PageHeader（标题 + 副标题 + 操作按钮）      │
├─────────────────────────────────────────────┤
│  ─── 核心 KPI ──  （6 KpiCard，2/3/6 列）  │
├─────────────────────────────────────────────┤
│  ─── 警告/提示条 ── （有异常时显示）         │
├─────────────────────────────────────────────┤
│  ─── 状态看板 ──   （StatChip 网格）        │
├─────────────────────────────────────────────┤
│  ─── 功能入口 ──   （导航卡片网格）         │
└─────────────────────────────────────────────┘
```

---

## 六、图标规范

| 尺寸名 | px | 使用场景 |
|--------|----|----------|
| xs | 12 | 附属信息图标（趋势箭头、进入箭头） |
| sm | 16 | 统计卡、徽章内图标 |
| md | 20 | 卡片主图标（KpiCard、功能导航卡） |
| lg | 24 | 页头、侧边栏菜单 |
| xl | 32 | 空状态图标 |

引用：`import { ICON_SIZE } from '@/lib/design-tokens';`

---

## 七、禁止事项

```typescript
// ❌ 禁止硬编码颜色
style={{ color: '#3b82f6' }}
style={{ background: 'rgba(59,130,246,0.08)' }}

// ❌ 禁止非 Lucide 图标库
import { FaUsers } from 'react-icons/fa';

// ❌ 禁止在组件内部定义私有 color 常量替代 ACCENT_MAP

// ✅ 正确用法
const ac = ACCENT_MAP['blue'];
<div className={ac.icon}><Icon size={20} className={ac.text} /></div>

// ✅ inline style 只允许 CSS 变量引用
style={{ color: TOKENS.css.statusDanger }}
```

---

## 八、文件清单

| 文件 | 类型 | 说明 |
|------|------|------|
| `apps/web/src/lib/design-tokens.ts` | 令牌定义 | 单一来源，所有语义色/尺寸/间距 |
| `apps/web/src/components/ui/KpiCard.tsx` | 组件 | KPI 指标卡片 |
| `apps/web/src/components/ui/StatusBadge.tsx` | 组件 | 状态徽章 |
| `apps/web/src/components/ui/DataTableV2.tsx` | 组件 | 标准数据表格 |
| `apps/web/src/app/(admin)/finance2/page.tsx` | 页面 | 财务驾驶舱（6 KPI） |
| `apps/web/src/app/(admin)/sales2/page.tsx` | 页面 | 销售驾驶舱（设计系统规范） |
| `apps/web/src/app/(admin)/master-data/page.tsx` | 页面 | 主数据中心（ACCENT_MAP 规范） |
| `apps/web/src/app/globals.css` | 样式 | CSS 变量定义（:root + dark） |

---

## 九、Phase 2 计划（待定）

- 工作流模块页面规范化
- 系统设置页面规范化
- 移动端组件规范
- 报表图表颜色规范（ECharts 配色 token）
- 表单组件（CrudForm）整合设计系统
