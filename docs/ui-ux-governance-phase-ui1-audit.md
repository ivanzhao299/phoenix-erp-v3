# Phoenix ERP V3 — UI/UX Governance Phase UI-1 审计报告

> 2026-06-02 · 前端视觉与交互体系审计。**只审计、不重构**;为 Design System V2 升级提供依据。
> 本阶段未改任何业务代码/API/权限/页面,仅新增本文档。

---

## 1. 审计范围

- 代码:`apps/web/src/app`(208 个 page.tsx)、`apps/web/src/components`、`apps/web/src/components/ui`(23 组件)、`apps/web/src/lib/design-tokens.ts`、`apps/web/src/app/globals.css`
- 覆盖业务域:dashboard / executive / finance2 / sales2 / procurement2 / shareholders / master-data / settings / workflow / store-pos / mobile / terminal / breeding / packaging / analytics / system / uat
- 方法:量化扫描(grep 计数内联样式/硬编码颜色/组件复用)+ 5 路并行定性勘察(逐页面组人工审阅)

## 2. 总体结论

Phoenix ERP **已经拥有一套半成熟的设计系统**:`design-tokens.ts`(TOKENS/ACCENT_MAP/STATUS_CLASS/KPI_GRID)+ `globals.css`(:root / [data-theme=dark] 双套 CSS 变量,`@custom-variant dark`)+ 23 个 UI 组件(KpiCard/StatusBadge/PageHeader/RightDrawer/ConfirmDialog/CrudForm/DataTable/NavCard 等)。**问题不在"没有体系",而在"体系采用率严重不均"。**

**根本原因(样式像不同人拼合的真因):**
1. **组件库推出时间线无序** —— PageHeader/KpiCard/NavCard/CrudForm/DataTable 在不同阶段陆续推出。早期页面(store-pos、sales2/returns、shareholders、uat)用"手写内联 + 硬编码 hex"完成,之后没有回迁;晚期页面(procurement2)一开始就用规范组件。**新旧页面视觉割裂的本质是开发时序割裂。**
2. **无强制规范/Lint 拦截** —— 没有规则禁止硬编码 `#RRGGBB` 与 `style={{}}`,纪律全靠自觉。procurement2 纪律性强(0 硬编码),sales2 纪律性弱(358 处硬编码)。
3. **表单/表格两大组件采用率近 0** —— CrudForm 仅个位数页面用,DataTable(真实表格组件)虽 32 页引用但 settings/master-data/workflow 仍大量手写 `<table>`;DataTableV2 0 引用(废弃)。
4. **弹窗方案四分五裂** —— 手写 overlay(sales2/returns)/ RightDrawer / Radix Dialog / ConfirmDialog / 原生 `window.confirm`/`prompt` 并存。

**一句话定级:体系存在但治理缺位 —— 标杆(procurement2 9/10)与重灾区(store-pos/shareholders 2~3/10)并存,需要 Design System V2 用"模板 + 强制规范"收口。**

## 3. 模块评分(0~10)

| 模块 | 视觉一致性 | 组件复用 | 表单一致性 | 表格一致性 | 暗色适配 | 可维护性 | **综合** | 定性 |
|------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|------|
| **procurement2** | 9 | 9 | 9 | 9 | 10 | 9 | **9.2** | 🏆 标杆 |
| **dashboard** | 8 | 9 | — | — | 8 | 8 | **8.3** | ✅ 示范 |
| **terminal** | 8 | 1 | 6 | 6 | N/A | 6 | **7.5** | 合理独立(令牌化) |
| **mobile** | 7 | 2 | 4 | 4 | 9 | 5 | **7.0** | 合理独立(暗色完整) |
| **finance2** | 7 | 5 | 6 | 8 | 8 | 6 | **6.8** | 混用 |
| **analytics** | 7 | 6 | 8 | 6 | 7 | 6 | **6.8** | 混用 |
| **workflow** | 5 | 6 | 4 | 5 | 9 | 6 | **6.1** | 混用 |
| **breeding** | 6 | 5 | 5 | 5 | 2 | 6 | **5.8** | 半规范 |
| **packaging** | 6 | 5 | 5 | 5 | 2 | 6 | **5.8** | 半规范 |
| **settings** | 6 | 5 | 4 | 3 | 7 | 5 | **5.0** | 混乱(PageHeader 唯一亮点) |
| **master-data** | 7 | 8 | 2 | 3 | 7 | 5 | **4.8** | 导航规范/内容混乱 |
| **shareholders** | 3 | 2 | 5 | 4 | 1 | 4 | **3.0** | ⚠️ 高危(全硬编码) |
| **system** | 5 | 2 | 0 | 3 | 5 | 3 | **2.8** | 样本少 |
| **uat** | 3 | 1 | 4 | 4 | 0 | 2 | **2.5** | ⚠️ 应收敛却失控 |
| **store-pos** | 2 | 0 | 5 | 5 | 0 | 1 | **2.0** | 合理独立但全硬编码 |

> **全系统加权平均 ≈ 6.0/10。** 后台管理域(admin)内部分化极大:procurement2(9)与 shareholders(3)相差 3 倍。

## 4. 页面分类与模板建议

| 类别 | 代表页面 | 当前状态 | 建议模板(UI-2) |
|------|---------|---------|----------------|
| **驾驶舱页面** | dashboard、workflow/page、finance2/page、shareholders/dashboard、procurement2/dashboard、analytics | dashboard 示范,shareholders 高危 | `DashboardTemplate` = PageHeader + KPI_GRID + KpiCard + Chart + 排名/趋势 |
| **业务单据页面** | sales2/orders·returns·delivery、procurement2/orders·payments、finance2/ap·ar | procurement2 规范,sales2 重灾 | `DocumentTemplate` = PageHeader + FilterBar + DataTableV3 + StatusBadge + DetailDrawer + ConfirmDialog |
| **台账页面** | shareholders/capital·contributions、finance2/cash-accounts | 硬编码表头,无统一导出 | `LedgerTemplate` = PageHeader + KPI 区 + DataTableV3 + AmountInput 格式 + 导出 |
| **主数据页面** | master-data/*、settings/products·organizations | 导航页 NavCard 好,内容页手写 | `MasterDataTemplate` = PageHeader + DataTableV3 + RightDrawer + CrudForm(FormField) |
| **审批页面** | workflow/todos·instances·definitions | WorkflowFormRenderer 特化 | `ApprovalTemplate` = PageHeader + DataTableV3 + AuditTimeline + ConfirmDialog |
| **配置页面** | settings/*、system/* | PageHeader 统一,表单手写 | `ConfigTemplate` = PageHeader + 分组 Section + FormField + RightDrawer |
| **详情页** | shareholders/capital/[id]、breeding/device/[houseCode] | 各写一套 | `DetailTemplate` = PageHeader + DetailDrawer/DetailPanel + AuditTimeline + AttachmentUploader |
| **移动端页面** | mobile/*(26 页) | 暗色完整,组件零复用 | `MobileTemplate` = MobileThemeContext + MobileSection + MobileStatCard(抽取共享) |
| **POS/作业台(独立语言)** | store-pos、terminal/packaging/* | 合理独立但硬编码/未抽组件 | `PosKit` / `TerminalKit`(令牌化 + 专用组件,不强求并入后台体系) |

## 5. Top 30 高风险文件(内联 `style={{}}` 计数)

| # | 文件 | 内联 style | 硬编码 hex |
|---|------|:-:|:-:|
| 1 | store-pos/page.tsx | 179 | 139 |
| 2 | sales2/returns/page.tsx | 175 | 174 |
| 3 | sales2/delivery/page.tsx | 143 | 97 |
| 4 | uat/page.tsx | 133 | 153 |
| 5 | mobile/dashboard/page.tsx | 113 | 45 |
| 6 | finance2/shareholder-funds/page.tsx | 113 | — |
| 7 | settings/users/page.tsx | 107 | 54 |
| 8 | sales2/orders/page.tsx | 106 | 47 |
| 9 | terminal/packaging/label-print/page.tsx | 104 | — |
| 10 | procurement2/payments/page.tsx | 99 | 0 |
| 11 | sales2/customers/page.tsx | 94 | 0 |
| 12 | procurement2/orders/page.tsx | 94 | 0 |
| 13 | procurement2/receipts/page.tsx | 92 | 0 |
| 14 | terminal/packaging/packing/page.tsx | 91 | — |
| 15 | sales2/pricing/page.tsx | 90 | 0 |
| 16 | terminal/packaging/source-receive/page.tsx | 89 | — |
| 17 | mobile/workflow/page.tsx | 88 | 72 |
| 18 | terminal/packaging/grading/page.tsx | 86 | — |
| 19 | procurement2/requests/page.tsx | 85 | 0 |
| 20 | finance2/ar/page.tsx | 85 | — |
| 21 | breeding/device-ops/page.tsx | 85 | 42 |
| 22 | settings/roles/page.tsx | 83 | 47 |
| 23 | finance2/reports/page.tsx | 83 | — |
| 24 | procurement2/suppliers/page.tsx | 80 | 0 |
| 25 | workflow/forms/runtime/page.tsx | 79 | 95 |
| 26 | procurement2/init/page.tsx | 78 | 0 |
| 27 | breeding/device/[houseCode]/page.tsx | 76 | — |
| 28 | settings/dict/page.tsx | 74 | — |
| 29 | sales2/inventory/page.tsx | 74 | 85 |
| 30 | workflow/todos/page.tsx | 70 | 36 |

> **关键洞察:内联 style 计数高 ≠ 一定坏。** procurement2 系列(payments 99、orders 94…)内联 style 多但**硬编码 hex = 0**(全用 `var(--*)` CSS 变量),属"内联但合规";真正的债是 store-pos/sales2-returns/uat —— **内联 + 硬编码 hex 双高**,才是暗色破损与不可维护的根源。**应以"硬编码 hex 计数"作为首要风险指标。**

## 6. 内联样式清单(模式归类)

| 模式 | 典型位置 | 问题 |
|------|---------|------|
| 手写 `const th/td/inp/btn: React.CSSProperties` 样式常量 | shareholders/capital、sales2/returns | 每页一套表格/表单/按钮样式,硬编码尺寸色值 |
| 模块级 `STATUS_COLOR`/`STATUS_MAP` 含 hex | sales2/delivery、uat、shareholders/capital | 状态色写死(`#27ae60`/`#e67e22`),不走 STATUS_CLASS token |
| 手写 overlay 弹窗 `position:fixed; inset:0; background:rgba(0,0,0,.4)` | sales2/returns | 不用 RightDrawer/Dialog,zIndex/透明度各页不同 |
| KpiCard 局部重定义 `function KpiCard(){...}` | finance2/ap、ar、reports | 与 `@/components/ui/KpiCard` 重复,传 `color="#6366f1"` 硬编码 |
| 内联 + 动态色 `style={{ background: \`${color}18\` }}` | procurement2/dashboard、analytics、mobile | 相对可接受(色来自参数/token),但缺组件封装 |

## 7. 硬编码颜色清单(Top + 集中色值)

**Top 文件(hex 出现次数)**:sales2/returns(174)、uat(153)、store-pos(139)、admin-ui.module.css(104,样式源文件可接受)、sales2/delivery(97)、workflow/forms/runtime(95)、sales2/inventory(85)、workflow/metrics(84)、sales2/reports(78)、mobile/workflow(72)、settings/users(54)、shareholders/dashboard(52)、shareholders/capital(46)。

**最常被硬编码的品牌/状态色(应迁移到 token)**:
- 品牌蓝 `#1F4E79`(shareholders 全模块)→ 应为 `var(--color-primary)`
- 成功绿 `#27ae60`/`#16a34a`/`#22c55e`、警告橙 `#e67e22`/`#f59e0b`、信息蓝 `#2980b9`/`#3b82f6`、危险红 `#c0392b`/`#ef4444` → 应为 `STATUS_CLASS`/`var(--status-*)`
- 白底 `#fff` + 灰文 `#666`/`#999`/`#94a3b8` → 暗色下消失/对比不足,应为 `var(--bg-card)`/`var(--text-secondary)`
- 图表分级色 `GRADE_COLORS`(analytics/inventory)、SEVERITY_COLOR(uat)→ 应集中到 design-tokens 的调色板

## 8. 重复组件清单

| 重复项 | 现状 | 建议 |
|--------|------|------|
| **表格** | DataTable(真实,32 页用,在 `components/data-table/`)vs DataTableV2(`components/ui/`,0 用) | 删 DataTableV2;UI-2 统一为 DataTableV3 |
| **KpiCard** | 标准 `ui/KpiCard` vs finance2/ap·ar·reports 各自 `function KpiCard()` | 删局部实现,统一导入标准件 |
| **StatusBadge** | `ui/StatusBadge`(design-tokens 驱动)vs PageHeader 内置 StatusBadge(硬编码 #22c55e 等) | 删 PageHeader 内置,统一用 design-tokens 版 |
| **弹窗/抽屉** | 手写 overlay(sales2/returns)/ RightDrawer / Radix Dialog / ConfirmDialog / 原生 confirm·prompt | 统一:DetailDrawer(详情/编辑)+ ConfirmDialog(确认)+ Modal(表单),禁用手写 overlay 与原生 confirm |
| **合计条** | SummaryBar(shareholders 私有)vs StatStrip(ui,带暗色) | 用 StatStrip 替换 SummaryBar |
| **导航卡** | settings/page 手写卡片 vs master-data/page 用 NavCard | 统一 NavCard |
| **空状态/骨架屏** | 仅 mobile 有 MobileEmptyState/MobilePageSkeleton;桌面端各页手写"暂无数据" | UI-2 新建桌面 EmptyState/LoadingSkeleton |
| **表单** | CrudForm(个位数页用)vs 各页手写 input/select 状态管理 | UI-2 FormField + 在模板中默认接 CrudForm |
| **审批时间轴** | WorkflowTimeline(workflow 私有)vs shareholders/capital/[id] 手写 timeline | 统一 AuditTimeline |

## 9. 表格问题清单(不一致页面)

| 问题 | 不一致页面 | 标杆 |
|------|-----------|------|
| 表头背景硬编码 `#1F4E79`(暗色不可读) | shareholders/capital、contributions | procurement2 用 `s.table`(var) |
| 用 div+flex 模拟表格,无 `<table>` | sales2/delivery(0 table) | procurement2 全 `<table className={s.table}>` |
| 状态用 `STATUS_COLOR` 常量色而非 StatusBadge | shareholders/capital、sales2/returns | finance2/ap、procurement2 用组件 |
| 金额格式不统一(有的 `toLocaleString` 无货币符) | analytics/inventory vs finance2(fmtMoney) | finance2 `fmtMoney(v,ccy)` |
| 无分页 | shareholders/capital | finance2/procurement2 统一分页 |
| 手写 `<table>` 未用 DataTable | settings/users·roles、master-data/* | DataTable(32 页) |

## 10. 表单问题清单(不一致页面)

| 问题 | 不一致页面 |
|------|-----------|
| 焦点边框色不一致(indigo vs emerald) | finance2/ap(`focus:border-indigo-400`)vs cash-accounts(`focus:border-emerald-400`) |
| 输入框自定义 `INP_CLASS`/`const inp` 各页一套 | finance2/ap·ar、shareholders/capital、sales2/returns |
| 手写表单状态管理,不用 CrudForm | settings/users·roles·dict、workflow/definitions、sales2/returns·delivery·orders |
| 必填标识/错误提示样式不统一 | sales2 系列(returns 无必填星)vs procurement2(统一 `s.lbl` + 必填) |
| 无 AmountInput,金额用裸 `type=number` | 全系统(无货币格式化/千分位输入) |
| 无 DateRangePicker,日期筛选各页自建 | finance2/reports、sales2/reports、analytics |

## 11. 卡片问题清单

| 检查项 | 结论 |
|--------|------|
| KPI 卡是否统一用 KpiCard | ❌ 部分:dashboard/shareholders-capital 用标准件;finance2/ap·ar·reports 各自重定义;procurement2/dashboard 自写 |
| 是否存在自定义临时卡片 | ✅ 大量:sales2/returns·reports 的统计 div、shareholders/SummaryBar、settings/page 导航卡、mobile StatCard(26 页重复) |
| 深色模式是否可读 | ❌ shareholders(深蓝白字硬编码)、store-pos/uat(白底/深底硬编码)不可切换;procurement2/dashboard/mobile/workflow ✅ 可读 |
| NavCard 复用 | 部分:master-data ✅ / settings ❌ 手写 |

## 12. 弹窗/抽屉问题清单(混乱页面)

| 方案 | 使用页面 | 评价 |
|------|---------|------|
| 手写 overlay(`position:fixed;inset:0`) | sales2/returns、finance2/ap·ar(Modal/Drawer 手写) | ❌ 应收敛 |
| RightDrawer(统一抽屉) | procurement2 全系列、sales2/customers·pricing·delivery、settings(8 页)、workflow(3 页) | ✅ 推荐基座 |
| Radix Dialog / Sheet | 少量深层页 | ✅ 可作 Modal 基座 |
| ConfirmDialog | 35 页引用(settings/finance2 等) | ✅ 推荐 |
| 原生 `window.confirm` / `prompt` | shareholders/capital(冲销原因 prompt)、sales2/returns(alert) | ❌ 必须替换为 ConfirmDialog |

## 13. 暗色模式问题清单(风险)

| 风险等级 | 页面/模块 | 问题 |
|:-:|------|------|
| 🔴 高 | **shareholders 全模块** | 深蓝 `#1F4E79` 表头/标题 + 白底硬编码,`data-theme=dark` 无效,暗色完全破损 |
| 🔴 高 | **store-pos** | 179 内联 + 139 hex 全硬编码,无暗色切换(虽自身是深色,但不随主题) |
| 🔴 高 | **uat** | 144 hex 浅色硬编码,暗色下白底刺眼/灰字看不清 |
| 🟠 中 | sales2/returns·delivery·orders·inventory | 211 处 hex 无 dark: 覆盖,`#fff` 暗色消失 |
| 🟠 中 | settings/users、breeding、packaging | 混合硬编码(L0-L4 等级色)+ CSS 变量 |
| 🟢 低/OK | procurement2、dashboard、workflow、mobile、finance2(主体) | 全 CSS 变量/Tailwind token,暗色自动生效 |

> globals.css 的暗色机制(`:root` / `[data-theme=dark]` + `@custom-variant dark`)**本身是健全的**;风险全部来自"绕过 token 直接写 hex"的页面。

## 14. Design System V2 建议

**治理三支柱:**
1. **强制规范(防新增债)**:ESLint 规则禁止 `style={{}}` 中出现 `#RRGGBB` 字面量与硬编码字号/圆角/阴影;PR 模板加"是否用了 token/组件"检查项。
2. **模板收口(统一结构)**:落地 8 类 `PageTemplate`(见第 4 节),新页面必须从模板起步;面包屑/标题/说明/主操作/筛选/KPI/表格/空状态/分页/详情成为模板内置槽位,杜绝"缺面包屑/缺空状态"。
3. **组件补全 + 去重(填空白)**:删 DataTableV2、PageHeader 内置 StatusBadge、各页局部 KpiCard;补桌面 EmptyState/LoadingSkeleton/FilterBar/AmountInput/DateRangePicker/AttachmentUploader(多附件)/AuditTimeline/DetailPanel。

**token 升级方向**:
- ACCENT_SOLID 中 `green/amber/red/violet/cyan` 等硬编码值迁到 CSS 变量;消除 `indigo===blue` 重复。
- 新增语义调色板:`CHART_PALETTE`(图表)、`GRADE_PALETTE`(分级 AA/A/B/C)、`SEVERITY_PALETTE`(告警),供 analytics/uat/inventory 引用,替换页面内 `GRADE_COLORS`/`SEVERITY_COLOR`。
- 品牌蓝统一:全系统 `#1F4E79`/`#1F3864` 收敛为 `--color-primary` 单一来源。

**独立语言保留**:POS / terminal / mobile 不强行并入后台体系,但各自令牌化 + 抽专用组件库(PosKit / TerminalKit / MobileKit),消除文件内重复。

## 15. 分阶段重构路线(Phase UI-2 Design System V2)

> 原则:先止血(规范+高危页)、再收口(模板+组件)、后优化(独立语言抽组件)。**每步独立可验收,不破坏现有功能。**

### Phase UI-2 组件/能力清单(按优先级)

| 阶段 | 交付物 | 说明 | 价值/工作量 |
|------|--------|------|:-:|
| **UI-2.0 规范** | ESLint 硬编码拦截规则 + 贡献规范文档 | 防止新增债,成本最低 | 🔴 高/低 |
| **UI-2.1 tokens 升级** | `design-tokens.ts` 调色板扩展(CHART/GRADE/SEVERITY)+ ACCENT_SOLID 去硬编码 | 单文件,收益广 | 🔴 高/低 |
| **UI-2.2 基础布局** | `PageShell` + `PageHeader`(增强)+ `FilterBar` + `ActionBar` | 页面骨架统一槽位 | 🔴 高/中 |
| **UI-2.3 表格** | `DataTableV3`(合并 DataTable,删 DataTableV2)+ 内置分页/空态/排序/导出 | 替换手写 `<table>` | 🔴 高/中 |
| **UI-2.4 表单** | `FormField` + `AmountInput` + `DateRangePicker`(接入 CrudForm) | 统一输入/必填/错误/只读/禁用 | 🟠 中/中 |
| **UI-2.5 弹窗** | `DetailDrawer`(基于 RightDrawer)+ `ConfirmDialog`(统一)+ Modal | 消灭手写 overlay 与原生 confirm/prompt | 🟠 中/中 |
| **UI-2.6 反馈态** | `EmptyState` + `LoadingSkeleton`(桌面版) | 补桌面空白 | 🟢 低/低 |
| **UI-2.7 详情/审计** | `DetailPanel` + `AuditTimeline` + `AttachmentUploader`(多附件) | 统一详情页/时间轴/附件 | 🟠 中/中 |
| **UI-2.8 模板** | 8 类 `PageTemplate`(Dashboard/Document/Ledger/MasterData/Approval/Config/Detail/Mobile) | 新页面统一起点 | 🔴 高/高 |
| **UI-2.9 高危迁移** | shareholders 全模块 + uat + store-pos 主题化 | 按风险序逐页迁移到 token/模板 | 🔴 高/高 |
| **UI-2.10 独立语言** | PosKit / TerminalKit / MobileKit 抽共享组件 | 消除 26 个 mobile 页 + POS/terminal 重复 | 🟢 低/高 |

### 推荐执行序(每阶段独立 PR + 验收)
1. **先 UI-2.0 + UI-2.1**(规范 + tokens,1 周,止血)
2. **再 UI-2.2~UI-2.5**(布局/表格/表单/弹窗核心组件,2~3 周)
3. **UI-2.8 模板 + UI-2.9 高危迁移**(shareholders/uat 先行,以"最低分模块"验证模板,2~3 周)
4. **UI-2.6/2.7/2.10**(反馈态/详情/独立语言抽组件,滚动推进)

**先做谁:** shareholders(综合 3.0,暗色破损,且是本会话刚增强的业务核心)+ uat(2.5,单文件易改、收益快)作为 UI-2 试点,用最低分模块验证"模板 + token"路线有效性。

---

## 验收对照

| 验收项 | 达成 |
|--------|:----:|
| 完成全前端 UI/UX 审计 | ✅ 208 页 + 23 组件 + tokens/globals 全覆盖 |
| 明确样式不统一根因 | ✅ 组件推出无序 + 无强制规范 + 表单/表格组件采用率近 0 |
| 明确高风险页面 | ✅ Top 30(store-pos/sales2-returns/uat/shareholders 等) |
| 明确重复组件 | ✅ 9 类重复(DataTableV2/KpiCard/StatusBadge/弹窗/SummaryBar 等) |
| 明确内联样式与硬编码问题 | ✅ 以"硬编码 hex"为首要风险指标,品牌蓝/状态色/白底清单 |
| 明确 Design System V2 路线 | ✅ 三支柱 + UI-2.0~2.10 十阶段 |
| 不改业务功能 | ✅ 仅新增本文档,未动任何代码/API/权限/页面 |
