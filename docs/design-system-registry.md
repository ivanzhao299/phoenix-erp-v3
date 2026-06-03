# Phoenix ERP Design System Registry

> **版本**：F2（2026-06-03）· **Stabilization Freeze** 期内建立
> **原则**：每类 UI 构件只有一个 canonical 实现；旧版本标 `@deprecated`，F3 逐页迁移后删除。
> **导入基础路径**：`@/components/design-system`（barrel）或各 canonical 路径。

---

## 1. StatusBadge

| 项 | 内容 |
|----|------|
| **canonical** | `@/components/design-system` → `design-system/status/StatusBadge.tsx` |
| **废弃** | `@/components/StatusBadge`（4 处，已标 @deprecated）、`@/components/ui/StatusBadge`（5 处，已标 @deprecated） |
| **用途** | 订单状态、库存状态、审批状态 |
| **特性** | CSS 变量 Dark Mode、支持 custom color、可选 icon |
| **迁移进度** | 6/15（F3 目标 15/15） |

```tsx
import { StatusBadge } from '@/components/design-system';
<StatusBadge status="ACTIVE" />
```

---

## 2. PageHeader

| 项 | 内容 |
|----|------|
| **canonical** | `@/components/PageHeader`（140 处引用，事实标准） |
| **废弃** | `@/components/ui/PageHeader`（0 处，已标 @deprecated，F3 可直接删） |
| **用途** | 所有 admin 页面顶部：标题 + 副标题 + 面包屑 |
| **待增强**（F3）| 右侧按钮区标准化、状态 chip |

```tsx
import PageHeader from '@/components/PageHeader';
<PageHeader title="销售中心" subtitle="..." breadcrumb={["销售", "订单"]} />
```

---

## 3. DataTable

| 项 | 内容 |
|----|------|
| **canonical** | `@/components/data-table`（23 处引用） |
| **废弃** | `@/components/DataTable`（4 处，已标 @deprecated）、`@/components/ui/DataTableV2`（1 处，已标 @deprecated）、`@/components/design-system/tables/DataTableV3`（5 处，design-system 保留供未来迁移参考） |
| **特性** | 分页、搜索、排序、导出、空状态、Loading、Dark Mode |

```tsx
import { DataTable } from '@/components/data-table';
```

---

## 4. Modal / Drawer / ConfirmDialog

| 组件 | canonical | 废弃 | 引用（canonical/旧） |
|------|-----------|------|---------------------|
| **ModalV2** | design-system `ModalV2`（barrel 导出） | 无单独旧版 | 3 处 |
| **DrawerV2** | design-system `DrawerV2`（barrel 导出） | 无单独旧版 | 4 处 |
| **ConfirmDialogV2** | design-system `ConfirmDialogV2` | 无单独旧版 | 6 处 |
| **Drawer（通用）** | 任意现有实现（52 处 from Drawer） | — | — |

> Modal/Drawer/ConfirmDialog 当前版本已带 V2 后缀，**F2 保留现状**（它们是 design-system barrel 的唯一导出，无重复）。F3 可考虑去掉 V2 后缀、统一命名为 `Modal`/`Drawer`/`ConfirmDialog`。

---

## 5. KPI 卡片

| 组件 | canonical | 废弃 | 引用 |
|------|-----------|------|------|
| **KpiCard** | `@/components/design-system` → `KpiCardV2`（barrel as `KpiCardV2`） | 内部命名带 V2，待 F3 去后缀 | 19/5 |
| **MetricCard** | `design-system/cards/MetricCard` | — | 6 |
| **SummaryCard** | design-system barrel | — | 3 |
| **StatStripV2** | design-system barrel | — | 3 |

> 待 F3 将 `KpiCardV2` 重命名为 `KpiCard`（去 V2 后缀），统一 KPI 卡片家族命名。

```tsx
import { KpiCardV2 as KpiCard, MetricCard, SummaryCard } from '@/components/design-system';
```

---

## 6. EmptyState / LoadingSkeleton / ErrorState

| 组件 | 路径 | 状态 |
|------|------|------|
| **EmptyState** | `design-system/feedback/States.tsx` | ✅ canonical |
| **LoadingSkeleton** | `design-system/feedback/States.tsx` | ✅ canonical |
| **ErrorState** | `design-system/feedback/States.tsx` | ✅ canonical |

```tsx
import { EmptyState, LoadingSkeleton } from '@/components/design-system';
```

---

## 7. Button / Input / Select

| 组件 | 当前状态 | 说明 |
|------|---------|------|
| Button | 主要用内联样式/原生 | F3 统一 canonical Button |
| Input | 内联样式为主 | F3 统一 |
| Select | 内联样式为主 | F3 统一 |

> 大量页面仍使用内联 `style={{}}` + 原生 `<button>`/`<input>`——属 F3 UI Debt 治理范畴。

---

## 8. Design Token（CSS 变量）

来源：`apps/web/src/app/globals.css`（79 个 CSS 变量）+ `lib/design-tokens.ts`（JS 映射）

| 分类 | 变量前缀 | 说明 |
|------|---------|------|
| 主色 | `--color-primary` / `--color-accent` | 品牌主色 |
| 背景 | `--bg-card` / `--bg-muted` / `--bg-page` | 卡片/辅助/页面背景 |
| 文字 | `--text-primary` / `--text-secondary` / `--text-disabled` | 层级文字 |
| 边框 | `--border` | 统一边框 |
| 状态色 | `--status-success/warning/danger/info/neutral/special` | 6 种状态 |
| 阴影 | `--shadow-sm/md/lg` | 层级阴影 |
| 圆角 | `--radius-sm/md/lg/xl` | 层级圆角 |
| Dark Mode | `[data-theme=dark]` | 全量 CSS 变量覆盖 |

**禁止**在新代码中直接使用 hex/rgba 硬编码颜色；使用 `var(--color-*)` / `var(--status-*)` 替代。

---

## 9. 迁移状态（F2 时点）

| 组件 | F2 前引用分布 | F2 后 canonical 比例 | F3 目标 |
|------|-------------|---------------------|--------|
| StatusBadge | DS 6 / ui 5 / raw 4 | 6/15（40%） | 15/15（100%） |
| PageHeader | components 140 / ui 0 | 140/140（100% canonical） | 保持 |
| DataTable | data-table 23 / V3 5 / raw 4 / V2 1 | 23/33（70%） | 33/33（100%） |
| Modal/Drawer | DS-only | 100% | 去 V2 后缀 |
| KpiCard | KpiCardV2 5+19 / MetricCard 6 | 多版本 | 统一命名 |

---

## 10. F3 优先级迁移列表

按引用量优先（大优先，批量迁移效益高）：

1. **PageHeader** → 已是 canonical，无需迁移；确保 ui 版删除（0 引用）。
2. **DataTable** → 剩 4+1+5=10 处迁到 `data-table`；从 top-10 高频页开始。
3. **StatusBadge** → 剩 4+5=9 处；逐页替换 import 路径。
4. **KpiCardV2** → 去 V2 后缀重命名（需 barrel + 引用处同步改）。
5. **内联样式** → 按热点页分批（store-pos 179 / sales2-returns 175）引入 CSS Module。
