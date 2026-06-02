# Phoenix ERP V3 — UI/UX Governance Phase UI-2.2（Component Consolidation 组件收口）

> 2026-06-02 · 统一组件层。**只建组件,不改任何业务页面**(shareholders/sales2/finance2/procurement2/workflow 零改动)。
> 依据:UI-2.0 规范 + UI-2.1 Design Tokens V2。新增目录:`apps/web/src/components/design-system/`。

---

## 0. 结论

# ✅ Design System V2 组件层建立完成

21 个统一组件落地于 `components/design-system/`,八大体系(cards/tables/forms/feedback/dialogs/drawers/detail/layouts+charts)齐备。
**全部零硬编码 hex**(颜色走 CSS 变量 + design-tokens),暗色自动适配,**Web TS 0、API TS 0**。统一入口 barrel:`@/components/design-system`。

## 1. 目录结构

```
components/design-system/
├── index.ts                  # 统一 barrel 入口
├── cards/      KpiCardV2.tsx
├── status/     StatusBadge.tsx
├── tables/     DataTableV3.tsx
├── forms/      FormField / AmountInput(CurrencyInput) / DateRangePicker
│               SelectField(+CompanySelector/ProjectSelector/StatusSelector) / AttachmentUploader
├── dialogs/    ModalV2.tsx / ConfirmDialogV2.tsx
├── drawers/    DrawerV2.tsx
├── detail/     DetailPanel.tsx / AuditTimeline.tsx / AttachmentViewer.tsx
├── feedback/   EmptyState.tsx / LoadingSkeleton.tsx / ErrorState.tsx
├── layouts/    PageShell.tsx
└── charts/     ChartCard.tsx
```

## 2. KpiCard 收口

- **`KpiCardV2`**:props `title/value/subValue/delta/trend/trendLabel/icon/status/accentColor/loading/onClick`。delta 自动推趋势箭头与颜色,可挂 `<StatusBadge>`。强调色来自 `ACCENT_SOLID`,暗色 CSS 变量。
- 收口对象(迁移期替换):`ui/KpiCard`、finance2/ap·ar·reports 内 `function KpiCard()`、analytics 自定义 KPI、shareholders `SummaryBar`。
- 规则:禁止页面内 `function KpiCard()`。

## 3. StatusBadge 收口

- **`StatusBadge`**(design-system):颜色/暗色全部来自 design-tokens `STATUS_CLASS`+`STATUS_LABEL`,补充 PROVISIONAL/REVERSED。
- 收口对象:`PageHeader` 内置 StatusBadge(硬编码)、页面内 `STATUS_COLOR` 常量(shareholders/capital、sales2/returns 等)。
- 支持:SUCCESS/WARNING/INFO/DANGER/APPROVED/REJECTED/PENDING/CONFIRMED/CANCELLED/PROVISIONAL 等。

## 4. DataTableV3

- **`DataTableV3<T>`**:columns 配置式;内置**排序 / 客户端分页 / 空状态(EmptyState) / 加载态(LoadingSkeleton) / 金额·日期·状态列格式化 / CSV 导出**。
- 列类型 `type: text|money|date|status|number`,`render` 自定义列,`sortable`/`align`/`width`。
- 收口对象:手写 `<table>/<thead>/<tbody>`(settings/master-data/workflow)、div-table(sales2/delivery)、DataTableV2(删除)、各页手工分页。
- 规则:新页面禁止再写 table/thead/tbody/手工分页。

## 5. FormField 体系

| 组件 | 用途 |
|------|------|
| `FormField` | 标签/必填星/说明/错误/只读容器 + `fieldInputStyle` 统一输入样式 |
| `AmountInput`/`CurrencyInput` | 金额输入:千分位、货币前缀、聚焦编辑原值 |
| `DateRangePicker` | 起止日期区间(原生,无依赖) |
| `SelectField` | 下拉基座 |
| `CompanySelector`/`ProjectSelector` | 公司/项目下拉(options 由页面传,不耦合 API) |
| `StatusSelector` | 状态下拉(传状态码,自动中文标签) |
| `AttachmentUploader` | 多附件上传(复用 `/api/upload/contract`),审批后只读 |

- 后续费用/资本流/采购/销售表单统一走这套。

## 6. Modal V2 / Drawer V2 / ConfirmDialog V2

- **`ModalV2`**:居中模态,统一标题/关闭/ESC/点遮罩关闭/暗色,取代手写 overlay。
- **`DrawerV2`**:右侧滑抽屉,同上,取代手写侧滑。
- **`ConfirmDialogV2`**:基于 ModalV2,危险操作红色按钮,取代 `window.confirm`/`window.prompt`/`alert`。
- 遮罩用中性 `rgba(0,0,0,.35~.45)`(规范允许);卡体/边框/文字全 CSS 变量。

## 7. 详情页体系

- **`DetailPanel`**:标题 + 键值对网格(支持 full 跨行 / emphasis 主色强调)+ 自定义区块(children)。
- **`AuditTimeline`**:统一状态/审计时间轴,取代股东资本流/审批详情各页手写 timeline。
- **`AttachmentViewer`**:只读附件查看(缩略图+下载),与 AttachmentUploader 配对。
- 收口对象:股东/客户/订单/审批/资本流详情。

## 8. EmptyState / LoadingSkeleton / ErrorState

- **`EmptyState`**:统一空状态(图标+标题+说明+操作),桌面端首次有标准件。
- **`LoadingSkeleton`**:line/card/table 三变体微光骨架(globals.css `phx-skeleton` 动画)。
- **`ErrorState`**:错误态 + 重试按钮。
- 全局复用,取代各页"暂无数据"散写。

## 9. 迁移路线(UI-2.3+)

> 本阶段**只建组件,不改页面**。迁移在后续阶段按"最高风险优先"分批进行,每页迁移过 `dark-mode-checklist.md` + `ui-audit-check.sh`(目标 hex=0)。

| 步骤 | 内容 | 试点 |
|------|------|------|
| UI-2.3 | 8 类 PageTemplate(基于 PageShell + DataTableV3 + DrawerV2 + DetailPanel) | — |
| UI-2.9-a | shareholders 全模块迁移(SummaryBar→StatStrip/KpiCardV2,表头→DataTableV3,prompt→ConfirmDialogV2,#1F4E79→token) | **首批试点(综合分最低3.0)** |
| UI-2.9-b | uat 收敛到 token + DataTableV3 | 单文件,收益快 |
| UI-2.9-c | sales2/returns·delivery·orders 去手写 overlay/STATUS_COLOR | 重灾区 |
| UI-2.9-d | finance2 局部 KpiCard → KpiCardV2;原生 confirm → ConfirmDialogV2 | |
| UI-2.10 | 删除 DataTableV2、PageHeader 内置 StatusBadge、SummaryBar(替代件就绪后) | 收尾去重 |

**迁移后 CI**:`ui-audit-check.sh --strict` 棘轮持续下压硬编码总量(当前基线 hex 3205,目标逐阶段降低)。

---

## 验证

| 项 | 结果 |
|----|------|
| Web TypeScript | ✅ 0 errors（21 组件全量类型检查通过） |
| API TypeScript | ✅ 0 errors（未改后端） |
| 设计系统零硬编码 | ✅ 组件内仅遮罩 rgba(中性),无 #hex(以身作则) |
| 暗色适配 | ✅ 全 CSS 变量,[data-theme=dark] 自动切换 |
| 业务页面改动 | ✅ 零(shareholders/sales2/finance2/procurement2/workflow 未动) |
| scope-audit.sh | ⚠️ 本地 API 未运行 + 测试夹具缺失(纯前端组件层,与权限无关) |

---

## 验收对照

| 验收项 | 达成 |
|--------|:----:|
| 建立 Design System V2 | ✅ design-system/ 八体系 21 组件 |
| 统一 KPI | ✅ KpiCardV2 |
| 统一 Badge | ✅ StatusBadge(design-tokens 驱动) |
| 统一 Table | ✅ DataTableV3(分页/排序/导出/空/加载/格式化) |
| 统一 Form | ✅ FormField + AmountInput + DateRangePicker + 选择器族 + AttachmentUploader |
| 统一 Modal | ✅ ModalV2 |
| 统一 Drawer | ✅ DrawerV2 |
| 统一 Detail | ✅ DetailPanel + AuditTimeline + AttachmentViewer |
| 统一 EmptyState | ✅ EmptyState + LoadingSkeleton + ErrorState |
| 为 UI-2.3 页面模板做好准备 | ✅ PageShell + ChartCard + barrel,组件齐备 |
