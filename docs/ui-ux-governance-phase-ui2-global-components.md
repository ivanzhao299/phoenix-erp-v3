# Phoenix ERP V3 — Global UI/UX Governance Phase UI-2.2（全站组件体系收口）

> 2026-06-02 · 全站统一设计系统治理 —— **建立全局组件基座,不局限财务/股东**。
> **只建组件、定路线,不改任何业务页面**(shareholders/sales2/finance2/procurement2/store-pos/workflow 零改动)。
> 依据:UI-1 审计 + UI-2.0 规范 + UI-2.1 Tokens V2。新增目录:`apps/web/src/components/design-system/`。

---

## 0. 结论

# ✅ Design System V2 全站组件基座建立完成

`components/design-system/` 现有 **31 个组件**,覆盖全站 9 类页面所需:Layout / 卡片 / 表格 / 表单 / 弹窗 / 详情 / 状态 / 反馈 / 图表 / 模板 + **MobileKit** + **WorkbenchKit**。
**全部零硬编码 hex**(以身作则,仅遮罩用中性 rgba),暗色经 CSS 变量自动适配,**Web TS 0、API TS 0**。统一入口:`@/components/design-system`。

## 1. 全站治理范围

覆盖 `apps/web/src/app` 全部页面域:dashboard / executive / finance2 / sales2 / procurement2 / shareholders / master-data / settings / workflow / store-pos / mobile / terminal / breeding / packaging / analytics / system / uat;以及 `components/ui`、`components/data-table`、`lib/design-tokens.ts`、`globals.css`。本阶段**只建全局组件基座**,页面迁移见 `ui-ux-global-migration-map.md`。

## 2. 页面类型分类(9 类)

驾驶舱 / 主数据 / 业务单据 / 台账 / 审批 / 配置 / 详情页 / 移动端 / 作业台。各类的模板与组件映射见迁移地图。**不要求所有页面长得一样,但必须用统一 token、统一组件、统一交互规则。**

## 3. Design System V2 目录

```
components/design-system/  (31 组件)
├── index.ts              统一 barrel
├── layouts/   PageShell · PageHeaderV2 · PageBreadcrumb · PageSection · PageToolbar · PageActions
├── cards/     KpiCardV2 · MetricCard · NavCardV2 · WarningCard · StatStripV2 · SummaryCard
├── tables/    DataTableV3
├── forms/     FormField · TextInput · SelectInput · AmountInput · CurrencyInput · DateInput
│              DateRangePicker · CompanySelector · ProjectSelector · UserSelector · StatusSelector · AttachmentField · AttachmentUploader
├── dialogs/   ModalV2 · ConfirmDialogV2
├── drawers/   DrawerV2
├── detail/    DetailPanel · DetailGrid · AttachmentViewer
├── timeline/  AuditTimeline(detail/) · WorkflowTimeline
├── feedback/  EmptyState · LoadingSkeleton · ErrorState · PermissionDeniedState · NoDataState
├── status/    StatusBadge(=StatusBadgeV2)
├── charts/    ChartCard
├── templates/ ListPageTemplate · DashboardTemplate · DetailPageTemplate
├── mobile/    MobilePageShell · MobileStatCard · MobileActionButton
└── workbench/ WorkbenchShell · WorkbenchActionButton · WorkbenchStatusCard
```

## 4. 全局 Layout 基座

`PageShell`(标题+说明+操作+内容)、`PageHeaderV2`(面包屑+标题+说明+操作)、`PageBreadcrumb`、`PageSection`(分区卡)、`PageToolbar`(筛选/操作左右分布)、`PageActions`(按钮组)。后台页面统一采用。

## 5. 全局卡片体系

`KpiCardV2`(KPI,delta/trend/status)、`MetricCard`(紧凑指标)、`NavCardV2`(功能导航,取代手写导航卡)、`WarningCard`(预警,4 级状态色)、`StatStripV2`(合计条,取代 SummaryBar)、`SummaryCard`(单卡汇总)。

## 6. 全局表格体系

`DataTableV3<T>` —— 配置式列:**分页 / 排序 / 筛选 / 导出(CSV) / 空状态 / 加载状态 / 状态列 / 金额列 / 日期列 / 操作列 / 暗色**。整合 DataTable,废弃 DataTableV2。新页面禁止再写 `<table>`/手工分页。

## 7. 全局表单体系

`FormField`(标签/必填/错误/只读容器)+ `TextInput`/`SelectInput`/`AmountInput`(`CurrencyInput`)/`DateInput`/`DateRangePicker` + 选择器族(`CompanySelector`/`ProjectSelector`/`UserSelector`/`StatusSelector`,options 由页面传,不耦合 API)+ `AttachmentField`/`AttachmentUploader`。后续全站增删改表单逐步迁移。

## 8. 全局弹窗体系

`ModalV2`(居中模态)/`DrawerV2`(右侧抽屉)/`ConfirmDialogV2`(确认,危险红)。统一标题/按钮/关闭/ESC/遮罩/暗色。**禁止新页面用 window.confirm/prompt/alert/手写 overlay。**

## 9. 全局详情页体系

`DetailPanel`(标题+键值网格+区块)、`DetailGrid`(轻量键值网格)、`AuditTimeline`(状态时间轴)、`WorkflowTimeline`(审批步骤+审批人+意见)、`AttachmentViewer`(只读附件)、`AttachmentUploader`(上传)。适用订单/客户/资本流/审批/财务单据详情。

## 10. 全局状态体系

`StatusBadge`(= `StatusBadgeV2` 别名)—— 颜色全部来自 design-tokens `STATUS_CLASS`(36 状态,含 dark)。支持业务/审批/财务/库存/销售/股权/风险状态。**禁止页面级 STATUS_COLOR。**

## 11. 全局反馈体系

`EmptyState` / `LoadingSkeleton`(line/card/table)/ `ErrorState`(带重试)/ `PermissionDeniedState`(无权限)/ `NoDataState`(无结果)。全站统一空/加载/错误/无权限态。

## 12. MobileKit

`MobilePageShell`(AppBar+安全区+滚动区)、`MobileStatCard`(大数字统计)、`MobileActionButton`(≥46px 触摸按钮)。移动端不强制套后台样式,但**统一走 token、消除硬编码、支持明暗**;26 个 mobile 页迁移后抽取重复的 Section/StatCard。

## 13. WorkbenchKit

`WorkbenchShell`(作业台骨架)、`WorkbenchActionButton`(≥64px 工业大按钮)、`WorkbenchStatusCard`(班次/进度大字)。用于 store-pos/terminal/packaging/breeding device-ops;深色工业风,token 化(暗色天然贴合),消除页面硬编码。

## 14. 组件去重清单(标记,不删除)

| 重复项 | 替代件 | 处置(迁移后) |
|--------|--------|------|
| 局部 KpiCard(finance2/ap·ar·reports) | KpiCardV2 | 删 |
| 局部 StatusBadge(PageHeader 内置) | StatusBadge | 删 |
| SummaryBar(shareholders) | StatStripV2 | 删 |
| DataTableV2(0 引用) | DataTableV3 | 删 |
| 手写 overlay(sales2/returns) | ModalV2/DrawerV2 | 删 |
| 原生 confirm/prompt/alert(37 处) | ConfirmDialogV2 | 替 |
| 页面级 STATUS_COLOR(59 处) | STATUS_CLASS/StatusBadge | 替 |
| 页面级 GRADE_COLORS | GRADE_PALETTE | 替 |
| 页面级 SEVERITY_COLOR | SEVERITY_PALETTE | 替 |

> 本阶段**只标记不删除**(删除会动业务页面,违反约束);替代件就位后由迁移阶段统一收口。

## 15. 全站迁移路线

详见 `docs/ui-ux-global-migration-map.md`。优先级:**P0**(shareholders/uat/store-pos/sales2-returns·delivery)→ **P1**(settings/master-data/workflow/breeding/packaging)→ **P2**(finance2/analytics/dashboard/executive)→ **P3**(procurement2 标杆保持);mobile/作业台并行单独 Kit 化。每页迁移过暗色清单 + `ui-audit-check.sh`(hex=0)。

---

## 验证

| 项 | 结果 |
|----|------|
| Web TypeScript | ✅ 0 errors（31 组件全量类型检查通过） |
| API TypeScript | ✅ 0 errors（未改后端） |
| 设计系统零硬编码 | ✅ 仅遮罩中性 rgba,无 #hex |
| 暗色适配 | ✅ 全 CSS 变量,[data-theme=dark] 自动切换 |
| 业务页面改动 | ✅ 零(全站业务页面未动) |
| scope-audit.sh | ⚠️ 本地 API 未运行 + 测试夹具缺失(纯前端组件层,与权限无关) |

---

## 验收对照

| 验收项 | 达成 |
|--------|:----:|
| 覆盖全站,不局限财务/股东 | ✅ 9 类页面 + Mobile + Workbench |
| 建立 Design System V2 全局组件基座 | ✅ 31 组件 14 目录 |
| 建立 MobileKit | ✅ MobilePageShell/StatCard/ActionButton |
| 建立 WorkbenchKit | ✅ WorkbenchShell/ActionButton/StatusCard |
| 明确全站迁移路线 | ✅ ui-ux-global-migration-map.md(P0~P3) |
| 不改业务功能 | ✅ 零页面/业务/API/权限/DB 改动 |
| 为后续全站统一改造提供基础 | ✅ 组件 + 模板 + 迁移地图齐备 |
