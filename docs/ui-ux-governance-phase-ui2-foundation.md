# Phoenix ERP V3 — UI/UX Governance Phase UI-2.0 + UI-2.1（设计系统治理:基础层）

> 2026-06-02 · 设计系统治理第一阶段:**止血**。建立规范 + 统一 token + 暗色基线 + 审计脚本。
> **未改任何页面/业务逻辑/API/权限/数据库**;仅新增规范文档、审计脚本,并对 design-tokens.ts / globals.css 做**纯增量**升级。
> 依据:`docs/ui-ux-governance-phase-ui1-audit.md`。

---

## 0. 结论

# ✅ Design System V2 基础层建立完成

止血动作到位:**设计规范成文、审计脚本可跑、Design Tokens V2 调色板就位、品牌/状态/图表色单一来源确立、暗色变量基线齐全**。存量页面零改动(按约束),为 UI-2.2 模板与组件收口铺好地基。**Web TS 0、API TS 0。**

## 1. 治理规则(UI-2.0)

**新增 `docs/frontend-design-rules.md`** —— 五条禁止 + 单一来源表 + 独立语言例外:
1. 禁止硬编码颜色(`#1F4E79`/`#fff`/`rgba()` → token)
2. 禁止内联视觉样式(布局可内联,`background/color/border/boxShadow/borderRadius/fontSize` 禁止)
3. 禁止重复定义统一组件(KpiCard/StatusBadge/SummaryBar/Modal/Drawer/DataTable)
4. 禁止原生弹窗(`window.confirm/prompt/alert` → ConfirmDialog/Drawer/toast)
5. 禁止页面级状态/分级/风险色映射(STATUS_COLOR/GRADE_COLORS/SEVERITY_COLOR → design-tokens.ts)

**新增 `scripts/ui-audit-check.sh`** —— 扫描违规并出风险文件,支持 `--strict`(CI 棘轮)/`--top N`。**当前债务基线快照**:

| 指标 | 全量(含独立语言) | 备注 |
|------|:-:|------|
| 硬编码 hex `#RRGGBB` | **3205** | 首要风险指标 |
| `rgba()` 字面量 | 754 | |
| 内联 `style={{` | 7271 | 含大量合规布局内联 |
| 页面级状态色映射 | 59(约 25 文件) | STATUS_COLOR/GRADE/SEVERITY |
| 原生 confirm/prompt/alert | 37(约 20 文件) | 待替换 ConfirmDialog |

> CI 棘轮:`--strict` 以现状为基线,后续 UI-2.x 迁移使其只降不升;新增 PR 若推高 hex 总量则红灯。

## 2. Design Tokens V2(UI-2.1)

**`design-tokens.ts` 纯增量**(新增 export,不改任何现有定义 → 零页面破坏):

| 新增 | 内容 | 替换页面内的 |
|------|------|------|
| `BRAND` | `primaryVar`/`accentVar`(品牌色单一来源说明) | `#1F4E79`/`#1F3864` 字面量 |
| `CHART_PALETTE` | 业务域色(sales/procurement/inventory/finance/shareholder/approval/dashboard)+ `series[8]` | 图表内散写 hex |
| `GRADE_PALETTE` | AA/A/B/C/D 分级色 | `GRADE_COLORS` |
| `SEVERITY_PALETTE` | CRITICAL/HIGH/MEDIUM/LOW/INFO | `SEVERITY_COLOR` |
| `ENTITY_PALETTE` | 客户/供应商/产品/项目/股东/仓库/员工 | 实体标识散写 |
| `getSeriesColor(i)` | 多系列图表循环取色 | 各图表自定义色数组 |

> 调色板取**中间明度**色值,浅色/暗色背景下均可读;图表/canvas 需具体色值故用 hex,但**集中到此单一来源**,页面只引用不再字面量。

## 3. 品牌色统一

- **唯一来源**:`var(--color-primary)`(globals.css:浅色 `#1F3864` / 暗色 `#4A78B5`)+ `BRAND.primaryVar`(TS 侧)。
- 审计发现品牌蓝在页面里有 `#1F4E79`(shareholders 全模块)与 `#1F3864` 两种字面量并存。**本阶段确立单一来源 + 规范禁止字面量**;页面收敛留到 UI-2.9(不在本阶段改页面)。
- 消除 `ACCENT_SOLID` 中 `indigo === blue`(均指向 `--color-primary`)的语义重复 → 已在规范中标注,token 值保持以免视觉回归。

## 4. 状态色统一

- **唯一来源**:`STATUS_CLASS`(36 个业务状态,全部含 `dark:` 配对)+ `STATUS_LABEL`(中文)+ `<StatusBadge>` 组件。
- 覆盖:SUCCESS/WARNING/INFO/DANGER/NEUTRAL + PENDING/APPROVED/REJECTED/CONFIRMED/CANCELLED/SUBMITTED + AR/AP/费用/报销/股东资金/转账全套。
- 规范禁止页面再写 `STATUS_COLOR` 常量(审计发现 uat/analytics-inventory/procurement2-init 等仍在用,列入 UI-2.9 迁移)。

## 5. 图表色统一

- **唯一来源**:`CHART_PALETTE` —— 销售/采购/库存/财务/股东/审批/驾驶舱 各域固定色相 + 8 色序列。
- 规则:今后 Chart(recharts)只能引用 `CHART_PALETTE.<域>` 或 `getSeriesColor(i)`,禁止图表内写 hex。
- 落地示例(供 UI-2.9 参考):shareholders/dashboard 趋势图 `fill="#1F4E79"` → `fill={CHART_PALETTE.shareholder}`;analytics BarChart `color` → `CHART_PALETTE.<域>`。

## 6. Dark Mode

- **新增 `docs/dark-mode-checklist.md`** —— 11 项页面迁移逐项清单(文字/背景/边框/hover/表格/输入框/弹窗/抽屉/品牌色/状态色/阴影)。
- **globals.css 审查结论**:颜色类 token 明/暗双版本**已齐全**;本阶段补齐唯一缺口 `--status-neutral` 暗色覆盖(`#757575 → #9E9E9E`)。
- **关键认知**:暗色机制(`:root`/`[data-theme=dark]` + `@custom-variant dark` + ThemeContext)本身健全;暗色破损**全部来自页面绕过 token 写死 hex**,修复 = 把 hex 换 token,非改机制。
- 高危待迁移:shareholders 全模块 / uat / store-pos / sales2(returns·delivery·orders·inventory)。

## 7. 组件治理(标记,不删除)

本阶段**只标记重复组件,不删除**(删除属 UI-2.2 收口动作):

| 重复组件 | 现状 | UI-2.2 处置 |
|---------|------|------------|
| `DataTableV2`(ui/) | 0 页面引用,废弃雏形 | 删除,统一 DataTable→DataTableV3 |
| PageHeader 内置 `StatusBadge` | 硬编码 #22c55e 等,与 design-tokens 版重复 | 删除内置,统一 ui/StatusBadge |
| 局部 `KpiCard`(finance2/ap·ar·reports) | 各自 `function KpiCard()`,传 `color` 硬编码 | 删除局部,统一 ui/KpiCard(accentColor) |
| `SummaryBar`(shareholders 私有) | 与 ui/StatStrip 功能重复,硬编码 #1F4E79 | 用 StatStrip 替换 |
| 手写 overlay 弹窗(sales2/returns) | 与 RightDrawer/Dialog 重复 | 统一 DetailDrawer/Modal |
| 手写 timeline(shareholders/capital/[id]) | 与 WorkflowTimeline 重复 | 统一 AuditTimeline |
| settings/page 手写导航卡 | 与 NavCard 重复 | 统一 NavCard |

> 不删除原因:删除/替换组件会改动引用页面,违反本阶段"不改页面"约束。标记清单交 UI-2.2 在建好替代件后统一收口。

## 8. UI-2.2 计划(页面模板与组件收口)

UI-2.0/2.1 建好"规范 + token + 暗色基线"地基后,UI-2.2 开始**建组件、收页面**:

| 步骤 | 交付 | 动作 |
|------|------|------|
| UI-2.2-a | `PageShell` + `PageHeader`(增强)+ `FilterBar` + `ActionBar` | 页面骨架统一槽位 |
| UI-2.2-b | `DataTableV3`(合并 DataTable,删 DataTableV2) | 替换手写 `<table>`,内置分页/空态/排序/导出 |
| UI-2.2-c | `FormField` + `AmountInput` + `DateRangePicker`(接 CrudForm) | 统一表单 |
| UI-2.2-d | `DetailDrawer` + `ConfirmDialog`(统一)+ `Modal` | 消灭手写 overlay 与原生 confirm/prompt |
| UI-2.2-e | `EmptyState` + `LoadingSkeleton`(桌面版)+ `AuditTimeline` + `AttachmentUploader`(多附件)+ `DetailPanel` | 补桌面空白件 |
| UI-2.2-f | 8 类 `PageTemplate` | 新页面统一起点 |
| (UI-2.9) | 高危页面迁移(shareholders/uat 试点) | 用最低分模块验证模板路线 |

**先做谁**:UI-2.2-a/b/d(布局+表格+弹窗,覆盖面最广),随后用 **shareholders + uat** 作首批迁移试点(综合分最低、暗色破损,验证"模板 + token"路线有效)。

---

## 验证

| 项 | 结果 |
|----|------|
| Web TypeScript | ✅ 0 errors（design-tokens.ts 纯增量,无破坏) |
| API TypeScript | ✅ 0 errors（未改后端) |
| design-tokens.ts 增量 | ✅ 新增 6 个 export,现有定义零改动 |
| globals.css 增量 | ✅ 仅补 `--status-neutral` 暗色,无破坏 |
| ui-audit-check.sh | ✅ 可运行,基线已采集(hex 3205) |
| 页面/业务/API/权限/DB | ✅ 零改动(符合约束) |
| scope-audit.sh | ⚠️ 本地 API 未运行 + 测试夹具缺失(非本阶段相关,纯前端基础层改动) |

---

## 验收对照

| 验收项 | 达成 |
|--------|:----:|
| 建立设计规范 | ✅ frontend-design-rules.md(5 禁止) |
| 建立 Design Tokens V2 | ✅ CHART/GRADE/SEVERITY/ENTITY_PALETTE + BRAND |
| 统一品牌色 | ✅ var(--color-primary) 单一来源 + 规范禁字面量 |
| 统一状态色 | ✅ STATUS_CLASS(36 状态,全 dark 配对) |
| 统一图表色 | ✅ CHART_PALETTE + getSeriesColor |
| 建立 Dark Mode 基线 | ✅ 变量齐全 + dark-mode-checklist.md(11 项) |
| 建立 UI 审计脚本 | ✅ scripts/ui-audit-check.sh |
| 不改业务功能 | ✅ 零页面/业务/API/权限/DB 改动 |
| 为 UI-2.2 做好准备 | ✅ 组件治理清单 + UI-2.2 路线 |
