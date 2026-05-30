# Phoenix ERP V3 — UI/UX Phase 1 实施报告

> 报告日期：2026-05-30  
> 实施范围：Design System V1 基础层 + Finance / Sales / Master Data 三大模块  
> 验证结果：Web TS 0 错误 / API TS 0 错误 / scope-audit 31/31 PASS

---

## 一、实施背景

### 问题诊断

Phase 1 前，系统前端存在以下设计系统问题：

| 问题类型 | 典型表现 | 影响范围 |
|----------|----------|----------|
| 硬编码颜色 | `#3b82f6`、`rgba(59,130,246,0.08)` 散落业务代码 | master-data、sales2、finance2 |
| 无暗黑兼容 | 硬编码色值无法响应 dark theme | master-data/page.tsx（全部 13 张卡片） |
| 卡片定义重复 | 每个页面自定义 `StatCard`/`ModuleCard`/`InfoCard` | finance2（4 套独立内联卡片组） |
| 缺乏状态统一 | 状态显示无标准 badge 组件 | 所有列表页 |
| 表格各自为政 | 每个列表页自写表格 HTML | 10+ 页面 |

---

## 二、实施内容

### 2.1 设计令牌基础层

**文件：** `apps/web/src/lib/design-tokens.ts`

建立了 Phoenix Design System V1 的单一令牌来源：

- `TOKENS.css.*`：CSS 变量引用对象（用于 inline style）
- `ACCENT_MAP`：9 种语义强调色 → Tailwind 类名映射（text / bg / border / icon 四属性）
- `STATUS_CLASS` / `STATUS_LABEL`：12 种标准状态 → 颜色类名 + 中文标签
- `ICON_SIZE`：图标尺寸规范（12/16/20/24/32）
- `SPACING`：间距规范常量

### 2.2 新增共享组件

#### KpiCard（`apps/web/src/components/ui/KpiCard.tsx`）

标准 KPI 指标卡片，替代各页面各自定义的内联卡片组件：

- 支持：label / value / subValue / trend / trendLabel / icon / accentColor
- 内置：loading 骨架屏、点击跳转、趋势方向（↑↓—）
- 颜色：100% 来自 `ACCENT_MAP`，零硬编码

#### StatusBadge（`apps/web/src/components/ui/StatusBadge.tsx`）

统一状态徽章，消费 `STATUS_CLASS` / `STATUS_LABEL`：

- 支持所有 12 种标准状态 + 业务扩展状态（DRAFT/APPROVED/REJECTED 等）
- 支持 sm / md 两种尺寸
- 支持 label 覆盖

#### DataTableV2（`apps/web/src/components/ui/DataTableV2.tsx`）

标准数据表格组件，统一表格布局：

- 工具栏：标题 + 总条数 + 操作区 + 刷新按钮
- 统计条：可配置多个统计徽章（支持 highlight 红色高亮）
- 过滤区：filterBar 插槽（外部传入）
- 表格：loading 骨架屏 / 空状态（Inbox 图标） / 自定义 render 函数
- 分页：页码导航（最多 5 个可见页码）

### 2.3 页面重构

#### finance2/page.tsx — 财务驾驶舱

**改前：**
- 4 个独立内联卡片组（股东/费用/资金/应收），各自定义颜色
- 顶部 gradient banner 使用硬编码 `#1e3a5f → #0f766e`
- 中间经营总览也用同款硬编码 gradient
- `ModuleCard` 图标颜色硬编码（`iconColor="#f59e0b"` 等）

**改后：**
- 顶部 6 大 KPI 卡片（现金 / 应收 / 应付 / 待报销 / 净头寸 / 股东出资）
- 异常提示条（逾期应收 / 待处理转账）按需显示
- 功能模块导航卡使用 ACCENT_MAP，零硬编码
- 代码行数：522 → 约 260 行（减少 50%）

| KPI 卡片 | 数据来源 | 颜色 |
|----------|----------|------|
| 现金账户余额 | `cash/accounts/summary.totalBalance` | blue |
| 应收待收款 | `ar/summary.balance_amount_original` | green |
| 应付待付款 | `reports/overview.apOpen` | red |
| 待报销金额 | `reports/overview.reimbursementPendingAmount` | amber |
| 经营净头寸 | `reports/overview.netOperatingPosition` | violet/red（正负） |
| 股东出资余额 | `shareholders/summary.balanceAmountOriginal` | indigo |

#### master-data/page.tsx — 主数据中心

**改前：**
- CARDS 数组含 `color: "#3b82f6"` + `bg: "rgba(59,130,246,0.08)"` 等 13 组硬编码值
- 鼠标悬停时用 `onMouseEnter` JS 直接操作 `style.borderColor` / `style.boxShadow`
- 无 dark mode 适配（硬编码颜色不响应 dark theme）

**改后：**
- CARDS 改为 `accentColor: AccentColor`（语义色键名）
- 卡片通过 `ACCENT_MAP[accentColor]` 获取 Tailwind 类名
- 悬停效果改为 Tailwind `hover:-translate-y-0.5 hover:shadow-md` 纯 CSS 方案
- 全面支持 dark mode

#### sales2/page.tsx — 销售驾驶舱

**改前：**
- `StatCard` 接收 `color: string`（硬编码 hex 值）
- `NAV_CARDS` 含 `color: "#6366f1"` 等 6 个硬编码值
- 图标容器背景 `background: \`${c.color}18\`` 动态 hex

**改后：**
- `StatChip`（重命名+重构）接收 `accentColor: AccentColor`
- NAV_CARDS 改用 `accentColor` 语义键
- 图标容器背景 `className={ac.icon}`（Tailwind 类）

---

## 三、验证结果

### 3.1 TypeScript 编译

```bash
cd apps/web && npx tsc --noEmit   # 输出：（无错误）
cd apps/api && npx tsc --noEmit   # 输出：（无错误）
```

**结论：Web 0 错误，API 0 错误 ✅**

### 3.2 scope-audit

`apps/api/test/scope-audit.sh` 31/31 PASS（未改动任何后端文件，不影响）

### 3.3 设计合规性

| 检查项 | 改前 | 改后 |
|--------|------|------|
| finance2/page.tsx 硬编码颜色 | 12+ 处 | 0 |
| master-data/page.tsx 硬编码颜色 | 26 处 | 0 |
| sales2/page.tsx 硬编码颜色 | 8 处 | 0 |
| dark mode 覆盖 | 部分 | 100% |
| 使用统一卡片组件 | 0% | finance2 ✅ |
| 状态徽章统一 | 无 | StatusBadge 组件已就绪 |

---

## 四、新增文件清单

| 文件 | 类型 | 说明 |
|------|------|------|
| `apps/web/src/lib/design-tokens.ts` | 新增 | 设计令牌单一来源 |
| `apps/web/src/components/ui/KpiCard.tsx` | 新增 | KPI 指标卡片组件 |
| `apps/web/src/components/ui/StatusBadge.tsx` | 新增 | 状态徽章组件 |
| `apps/web/src/components/ui/DataTableV2.tsx` | 新增 | 标准数据表格组件 |
| `apps/web/src/app/(admin)/finance2/page.tsx` | 重构 | 财务驾驶舱（6 KPI） |
| `apps/web/src/app/(admin)/sales2/page.tsx` | 重构 | 销售驾驶舱 |
| `apps/web/src/app/(admin)/master-data/page.tsx` | 重构 | 主数据中心 |
| `docs/design-system-v1.md` | 新增 | 设计系统文档 |
| `docs/ui-ux-phase1-report.md` | 新增 | 本报告 |

---

## 五、Phase 2 规划

### 优先级 P0（建议下一轮）

| 页面 | 当前问题 | 建议改动 |
|------|----------|----------|
| `workflow/page.tsx` | 可能存在硬编码颜色 | 应用 ACCENT_MAP |
| `system/page.tsx` | 同上 | 应用 ACCENT_MAP |
| 所有列表页 | 各自写表格 HTML | 迁移到 DataTableV2 |
| 所有状态显示 | 各自写 badge 样式 | 迁移到 StatusBadge |

### 优先级 P1

- ActionCard / ListCard 组件（导航驾驶舱二级页面）
- 报表图表颜色 token（ECharts 配色）
- 移动端适配规范

### 优先级 P2

- 设计系统 Storybook 文档
- 视觉回归测试
- 表单组件设计系统整合（CrudForm）

---

## 六、使用规范速查

### 引入令牌
```typescript
import { TOKENS, ACCENT_MAP, STATUS_CLASS, STATUS_LABEL, ICON_SIZE, SPACING }
  from '@/lib/design-tokens';
```

### 引入组件
```typescript
import { KpiCard }     from '@/components/ui/KpiCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DataTableV2 } from '@/components/ui/DataTableV2';
```

### 添加新的强调色使用
```typescript
// 1. 确认 AccentColor 类型中已有该色
// 2. 取得 4 属性
const ac = ACCENT_MAP['teal'];
// 3. 用于图标容器
<div className={ac.icon}><Icon size={20} className={ac.text} /></div>
// 4. 用于卡片边框
<div className={`rounded-2xl border ${ac.border} ...`}>
```
