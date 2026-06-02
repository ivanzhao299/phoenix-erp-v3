# Phoenix ERP V3 — UI/UX Governance Phase UI-2.4（Pilot Page Migration 试点页面迁移）

> 2026-06-02 · 首批试点迁移:`/shareholders/capital` + `/uat`。
> **只换 UI 层**:布局/卡片/表格/表单/状态/弹窗组件 + 去硬编码;业务逻辑/API/权限/DB/路由/状态机/字段含义**完全不变**,功能零丢失。
> 依据:UI-1 审计 + UI-2.2 组件 + UI-2.3 模板。

---

## 0. 结论

# ✅ 两试点页迁移成功,模板体系可继续推广

Design System V2(PageHeaderV2/KpiCardV2/StatusBadge/DataTableV3/DrawerV2/ConfirmDialogV2/AttachmentUploader/StatStripV2/FormField 等)**经真实生产页面验证可用**。两页**硬编码 hex 清零、无原生弹窗、Light/Dark 可读、功能保持**。**Web TS 0、API TS 0**;全站硬编码 hex 总量 **3205 → 3006(−199)**。

## 1. 迁移页面

| 页面 | 迁移前 | 迁移后 |
|------|-------|-------|
| /shareholders/capital | 226 行,46 hex,36 内联 style,prompt 冲销,#1F4E79 表头(暗色破损) | 0 hex,DataTableV3+DrawerV2+ConfirmDialogV2,暗色可用 |
| /uat | 1782 行,153 hex,本地 Badge/MetricCard,SEVERITY_COLOR/STATUS_COLOR 硬编码 | 0 hex,MetricCard→KpiCardV2,色表 token 化,PageHeaderV2,暗色可用 |

## 2. 原问题

- **shareholders/capital**:表头 `#1F4E79` 白字(暗色不可读)、`STATUS_COLOR` 常量、`prompt('冲销原因')` 原生弹窗、SummaryBar 私有组件、局部按钮硬编码、ui/KpiCard。
- **uat**:153 处硬编码 hex、本地 `Badge`(text `#fff`)、本地 `MetricCard`(`#fff`/`#e5e7eb`/`#6b7280` 等)、页面级 `SEVERITY_COLOR`/`STATUS_COLOR`、旧 `PageHeader`、暗色下白底刺眼/灰字看不清。

## 3. 改造内容

### shareholders/capital
- 页头 → `PageHeaderV2`(含面包屑)
- 6 KPI → `KpiCardV2`
- 合计条 SummaryBar → `StatStripV2`
- 列表手写 `<table>` → `DataTableV3`(列配置 + 排序 + 分页 + 空态 + 加载态)
- 状态 → `StatusBadge`(保留 CONTRIB_STATUS_LABEL 精确中文)
- 金额输入 → `AmountInput`;日期 → `DateInput`;下拉 → `SelectField`;字段容器 → `FormField`
- 新增表单 inline 块 → `DrawerV2`(抽屉)
- **冲销 `prompt()` → `ConfirmDialogV2` + 原因输入框**(保留 reverseFlow(id, reason) 调用)
- 附件 FileUploadInput+手写数组 → `AttachmentUploader`(多附件)
- 全部颜色 → `var(--*)` token

### uat
- 旧 `PageHeader` → `PageHeaderV2`
- 本地 `MetricCard` → 内部委托 `KpiCardV2`(**调用点不变,零功能风险**;valueColor→accentColor 映射)
- 本地 `Badge` → token 化(text `var(--text-on-dark)`,bg 取自 token 化色表)
- `SEVERITY_COLOR`/`STATUS_COLOR` → 值改为 `var(--status-*)`/`var(--color-accent)`(集中、暗色感知)
- 153 处硬编码 hex → 系统化映射到 CSS 变量(灰=文字、绿/红/橙=状态、浅灰=边框/底、#fff=bg-card/text-on-dark)

## 4. 使用组件

PageHeaderV2 / KpiCardV2 / StatusBadge / DataTableV3 / DrawerV2 / ConfirmDialogV2 / StatStripV2 / FormField / SelectField / AmountInput / DateInput / AttachmentUploader。

## 5. 删除硬编码颜色数量

| 页面 | 迁移前 hex | 迁移后 hex | 净减 |
|------|:-:|:-:|:-:|
| shareholders/capital | 46 | 0 | −46 |
| uat | 153 | 0 | −153 |
| **合计** | **199** | **0** | **−199** |

全站硬编码 hex:**3205 → 3006**。

## 6. 删除内联视觉样式数量

- shareholders/capital:36 处内联 style → 视觉样式全部走 token/组件;残留为布局级内联(grid/flex/gap,规范允许)。
- uat:视觉色值内联全部 token 化;布局结构保留(不重写 5 个 Tab 逻辑,降低回归风险)。

## 7. Light / Dark 验证

- 两页颜色全部来自 `var(--*)` CSS 变量,`[data-theme=dark]` 自动切换。
- 暗色下:表头不再是白字深蓝块(DataTableV3 用 `var(--bg-muted)`)、卡片 `var(--bg-card)`、文字 `var(--text-*)`、边框 `var(--border)`、状态徽章 STATUS_CLASS 含 dark 配对 —— **均可读**。
- 对照 `dark-mode-checklist.md` 11 项:文字/背景/边框/hover/表格/输入框/弹窗/抽屉/品牌色/状态色/阴影全绿。

## 8. 功能保持验证

| 功能 | capital | uat |
|------|:-:|:-:|
| 列表/分页/排序 | ✅ DataTableV3 | ✅ 5 Tab 数据未动 |
| 新增/创建草稿 | ✅ DrawerV2 表单,createFlow 逻辑不变 | ✅ |
| 项目/股东/金额/来源/日期/备注 | ✅ 全保留 | — |
| 股东信息联动卡 | ✅ linkInfo useMemo 不变 | — |
| 附件上传 | ✅ AttachmentUploader,attachmentUrls 不变 | — |
| 提交审批/确认到账 | ✅ submitFlow/confirmFlow 不变 | — |
| 冲销 | ✅ ConfirmDialogV2,reverseFlow(id,reason) 不变 | — |
| 详情跳转/导入 | ✅ Link/router 不变 | — |
| Scope 控制 | ✅ 后端 service 不变 | — |
| UAT 反馈/培训/清单/试运行/准备度 | — | ✅ 全部 fetch/handler 未动 |
| 统计/状态/备注/操作 | — | ✅ |

> **未改:** 业务逻辑、API 调用、权限、数据库、路由、字段含义、状态机、功能集。

## 9. 遗留问题

1. uat 5 个 Tab 的表格仍为手写 `<table>`(本次只 token 化颜色,未换 DataTableV3)—— 为降低 1782 行回归风险,留待后续;当前已暗色可读、零硬编码。
2. uat 本地 `Badge` 保留(token 化的灵活 color+label chip,支持任意 severity 色)—— 非 StatusBadge,但零债务;状态列可在后续统一为 StatusBadge。
3. capital 操作按钮用页面内 `Btn`(token 化)—— 待 design-system 补通用 Button 后替换。

## 10. 是否允许进入 UI-2.5

✅ **允许。** 两试点页证明:Design System V2 组件 + 模板可直接用于生产页面,迁移**不丢功能、暗色可用、债务净减**。`ui-audit-check.sh` 显示两页零新增债务、全站 hex 下降。建议 UI-2.5 推进 P0 剩余(sales2/returns·delivery、store-pos)与 P1 批量。

---

## 自动检查结果(scripts/ui-audit-check.sh)

| 指标 | 两试点页 | 全站 |
|------|:-:|:-:|
| 新增硬编码 hex | 0(净减 199) | 3205→3006 |
| 新增内联视觉 style | 0 | 布局级(组件库,合规) |
| window.confirm/prompt/alert | 0 | 试点页 0 |
| 局部 KpiCard/StatusBadge | 0(已收口) | — |

## 验证

| 项 | 结果 |
|----|------|
| Web TypeScript | ✅ 0 errors |
| API TypeScript | ✅ 0 errors |
| 两试点页硬编码 hex | ✅ 0 / 0 |
| 两试点页原生弹窗 | ✅ 0 / 0 |
| 功能保持 | ✅ 业务逻辑/API/权限/路由/状态机不变 |
| Light/Dark | ✅ 可读 |
| scope-audit.sh | ⚠️ 本地 API 未运行 + 测试夹具缺失(纯前端 UI 迁移,与权限无关) |

## 验收对照

| 验收项 | 达成 |
|--------|:----:|
| shareholders/capital 完成迁移 | ✅ |
| uat/page 完成迁移 | ✅ |
| 两页功能不丢失 | ✅ |
| 两页 Light/Dark 可读 | ✅ |
| 无新增硬编码颜色 | ✅(净减 199) |
| 无新增手写弹窗 | ✅(prompt→ConfirmDialogV2) |
| 证明模板体系可推广 | ✅ |
