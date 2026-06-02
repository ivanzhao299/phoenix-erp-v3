# Phoenix ERP V3 — UI/UX 全站迁移地图（Global Migration Map）

> 依据 `docs/ui-ux-governance-phase-ui1-audit.md` 评分 + UI-2.2 全局组件基座。
> 本表定义全站页面迁移到 Design System V2 的**优先级与组件映射**。
> 迁移在后续阶段执行;本阶段只建基座、定路线,**不改业务页面**。

---

## 迁移优先级（按 UI-1 审计风险分）

### P0 高风险（暗色破损 / 硬编码最重，最先迁移)
| 模块 | UI-1 综合分 | 主要问题 | 迁移到 |
|------|:-:|------|------|
| **shareholders** | 3.0 | 全硬编码 #1F4E79、暗色完全破损、SummaryBar、prompt 冲销 | StatStripV2 / KpiCardV2 / DataTableV3 / DetailPanel+AuditTimeline / ConfirmDialogV2 |
| **uat** | 2.5 | 153 hex、import PageHeader 却没用、手写 table | PageHeaderV2 / DataTableV3 / SEVERITY_PALETTE / StatusBadge |
| **store-pos** | 2.0 | 179 内联 + 139 hex、单文件 63KB、零暗色 | WorkbenchKit(WorkbenchShell/ActionButton/StatusCard) + 令牌化 |
| **sales2/returns** | 3.0 | 175 内联 + 174 hex、手写 overlay、自写 Badge | DrawerV2 / DataTableV3 / StatusBadge / FormField |
| **sales2/delivery** | 3.0 | 143 内联 + 97 hex、div-table 无 `<table>` | DataTableV3 / StatusBadge / DrawerV2 |

### P1 中风险（混用,有规范基础)
| 模块 | UI-1 分 | 问题 | 迁移到 |
|------|:-:|------|------|
| **settings** | 5.0 | 107 内联、CrudForm 几乎不用、手写 table | PageHeaderV2 / DataTableV3 / FormField / NavCardV2 |
| **master-data** | 4.8 | 导航 NavCard 好、内容页手写 | DataTableV3 / NavCardV2 / DetailPanel |
| **workflow** | 6.1 | 卡片内联散落、WorkflowFormRenderer 特化 | KpiCardV2 / WorkflowTimeline / DataTableV3 |
| **breeding** | 5.8 | 混合硬编码、device-ops 内联 | WorkbenchKit(device-ops) / DataTableV3 / KpiCardV2 |
| **packaging** | 5.8 | 半规范 | DataTableV3 / KpiCardV2 |

### P2 稳定优化（已较好,锦上添花)
| 模块 | UI-1 分 | 动作 |
|------|:-:|------|
| **finance2** | 6.8 | 局部 KpiCard → KpiCardV2;原生 confirm → ConfirmDialogV2;焦点色统一 |
| **analytics** | 6.8 | GRADE_COLORS → GRADE_PALETTE;图表 → CHART_PALETTE + ChartCard |
| **dashboard** | 8.3 | 微调,接 DashboardTemplate |
| **executive** | — | 接 DashboardTemplate |

### P3 保持标杆（参照物,基本不动)
| 模块 | UI-1 分 | 说明 |
|------|:-:|------|
| **procurement2** | 9.2 | 0 硬编码、100% PageHeader/RightDrawer/s.table —— 作为迁移参照标准,基本无需改 |

### 独立语言（单独 Kit,不并入后台)
| 模块 | 迁移到 |
|------|------|
| mobile/*（26 页） | MobileKit(MobilePageShell/MobileStatCard/MobileActionButton) + MobileThemeContext token 化 |
| terminal/*（作业台） | WorkbenchKit + terminal-theme.ts 令牌化 |
| store-pos / breeding device-ops | WorkbenchKit |

---

## 页面类型 → 模板/组件 映射

| 页面类型 | 代表 | 模板 | 核心组件 |
|---------|------|------|---------|
| 驾驶舱 | dashboard/executive/finance2/shareholders/analytics | `DashboardTemplate` | KpiCardV2 / SummaryCard / WarningCard / ChartCard |
| 主数据 | customer/supplier/product/organization | `ListPageTemplate` | DataTableV3 / DrawerV2 + FormField / NavCardV2 |
| 业务单据 | sales-order/po/expense/reimbursement/capital-flow | `ListPageTemplate` + Detail | DataTableV3 / StatusBadge / DrawerV2 / DetailPanel |
| 台账 | capital/cash/AP/AR/shipment | `ListPageTemplate` | DataTableV3(导出/金额/日期) / StatStripV2 |
| 审批 | workflow/todos·instances·rules | `ListPageTemplate` + Detail | DataTableV3 / WorkflowTimeline / ConfirmDialogV2 |
| 配置 | settings/roles/users/dict | `ListPageTemplate` | DataTableV3 / FormField / DrawerV2 |
| 详情页 | order/capital-flow/customer/workflow detail | `DetailPageTemplate` | DetailPanel / DetailGrid / AuditTimeline / WorkflowTimeline / AttachmentViewer |
| 移动端 | mobile/* | — | MobileKit |
| 作业台 | store-pos / terminal / packaging / device-ops | — | WorkbenchKit |

---

## 迁移执行原则

1. **逐页迁移,每页一个 PR**,迁移后过 `dark-mode-checklist.md` 11 项 + `ui-audit-check.sh`(目标该页 hex=0)。
2. **不改业务逻辑/API/数据**,只换 UI 组件与样式来源。
3. **棘轮**:`ui-audit-check.sh --strict` 全站 hex 总量(基线 3205)只许降不许升。
4. **顺序**:P0 → P1 → P2;独立语言(mobile/作业台)并行单独推进。
5. **去重收尾**(替代件全部就位后):删 DataTableV2、PageHeader 内置 StatusBadge、SummaryBar。
