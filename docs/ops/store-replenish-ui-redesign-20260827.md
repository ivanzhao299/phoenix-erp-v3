# 门店补货编排页 UAT 严重 UI 问题分析与完整方案重设计

> 日期：2026-08-27（基于 2026-08-28 代码复核）
>
> 页面：`/store/replenish`
>
> UAT 截图：`/tmp/uat-replenish.png`（1920 × 945）
>
> 本报告仅分析与设计，不包含业务代码、样式、接口或数据库修改。

## 1. 结论摘要

截图中的三个问题均已在代码中复现并定位：

1. 页面不是 Tailwind 或 CSS Module “加载失败”，而是整页未使用项目设计系统，主要靠手写 inline style；其中卡片和按钮引用了不存在的 CSS 变量 `--surface-card`、`--border-default`，导致背景和边框声明失效。
2. “保存草稿”确实调用后端并写入 `store_replenishment_requests` / `store_replenishment_request_lines`，状态为 `DRAFT`；但按钮使用失效变量，成功/失败只显示一个无语义普通文本盒。更严重的是，POST 失败也会清空明细和备注，造成“没保存、内容却消失”。
3. 新建区所有选择器和数量输入均没有 `<label>`；placeholder/首个 option 被错误承担字段名职责，既难理解也不满足可访问性。

当前后端已支持的真实主链为：`DRAFT → SUBMITTED → APPROVED → DISPATCHED → RECEIVED → CLOSED`；无差异签收会从 `DISPATCHED` 直接进入 `CLOSED`。数据库虽然允许 `REJECTED/CANCELLED`，但没有对应 API；也没有草稿编辑、删除接口。完整 UI 必须分阶段落地，不能把这些缺口包装成可用操作。

## 2. 截图逐项确认与额外缺陷

### 2.1 用户反馈确认

| 用户反馈 | 截图中的具体表现 | 结论 |
|---|---|---|
| 页面样式缺失 | 主内容区几乎是白底裸排版；“新建补货申请”和“申请列表”没有可辨识卡片边界；表格无行高、表头底色和分隔语义；控件与按钮混用浏览器原生外观 | 确认 |
| 保存草稿按钮无样式、点击后看不到保存内容 | “保存草稿”呈普通文本按钮，缺少主按钮色、hover、loading、disabled；列表只有“暂无补货申请”，没有保存结果定位、草稿高亮或明确成功反馈 | 确认 |
| 下拉框没有字段名称 | 门店、源仓、紧急程度、SKU、数量均只有控件，没有字段标题；“同公司场站源仓（审批时可补）”是 option，不是 label | 确认 |

### 2.2 截图还能直接看到的问题

- 内容宽度没有容器约束，1920px 下表单被拉成超长控件，视觉扫描距离过大。
- 页面标题显示“补货申请”，正文标题显示“门店补货编排”，信息层级和命名不一致。
- “仓储调拨台 →”悬在右上，缺少按钮/链接层级与说明。
- SKU、数量和“添加 SKU”不是一个有标题的明细编辑区；用户无法判断数量单位。
- 空表格仍绘制七列表头，空态只是单行灰字，没有创建引导或重试入口。
- 状态、紧急程度没有颜色语义；操作区也没有主次/危险动作区分。
- 主要操作没有固定位置；表单、列表、调拨详情堆叠在同一页，流程上下文容易丢失。
- 1920px 已显松散，现有固定三列/固定宽度网格在手机上会挤压或溢出。

## 3. 代码根因

### 3.1 样式缺失

页面实现集中在 `apps/web/src/app/(admin)/store/replenish/page.tsx`：

- `StoreReplenishmentPage` 没有导入 CSS Module，也没有使用 `PageShell`、`Panel`、`DataTableV3`、`FormField`、`Button` 等现有组件（第 3–8、30–36 行）。
- `box` 和 `button` 使用 `var(--surface-card)`、`var(--border-default)`（第 30–31 行）；全局实际 token 是 `--bg-card`、`--border`（`apps/web/src/app/globals.css:305-326`），因此相关 CSS 声明无效。
- `store.module.css` 虽存在，但该页未导入；文件内容也只有门店首页 KPI、快捷卡片和骨架屏样式，不包含补货页类（`apps/web/src/app/(admin)/store/store.module.css:1-93`）。
- 全局只为原生 `input/textarea/select` 提供最低基础样式；更完整的 `.phx-*` 样式需要显式 class，该页没有使用（`globals.css:353-364,400-455`）。
- 表格仅设置 `width` 和 `borderCollapse`，按钮大多连 inline style 都没有，最终呈现浏览器默认样式。

根因归类：**页面是绕开设计系统的临时手写实现，同时引用了错误 token；不是 CSS 构建链或 Tailwind 故障。**

### 3.2 保存草稿无样式、无可靠反馈

真实调用链：

```text
点击“保存草稿”
  → create()
  → POST /api/v2/store-replenishments
  → StoreReplenishmentService.create()
  → store_replenishment_requests（默认 DRAFT）
  → store_replenishment_request_lines
  → 前端 load() 重新 GET 列表
```

证据：前端 `page.tsx:23-24`；Controller `store-replenishment.controller.ts:21-23`；Service `store-replenishment.service.ts:57-73`；建表迁移 `1788134400000-CreateStoreReplenishmentOrchestration.ts:11-44`。

问题不是“没有存储逻辑”，而是反馈链不可靠：

- 按钮样式引用错误 token，且没有 primary/loading/disabled 状态。
- 成功和失败共用 `message` 字符串，以可点击清除的普通 `<div>` 呈现；没有 toast、`role=alert`、成功/错误色彩或自动消失。
- `act()` 捕获异常但不返回成功标志/重新抛出；`create()` 在 `await act()` 后无条件 `setLines([]); setReason('')`。所以保存失败也清空用户内容。
- 保存期间未禁用按钮，可重复提交并产生重复草稿。
- POST 成功而后续 GET 失败时，界面只显示刷新错误，无法告诉用户“草稿已保存但列表刷新失败”。
- 列表没有 loading/error 独立状态，首次加载、真实空列表、加载失败都可能显示“暂无补货申请”。
- 成功后没有滚动/定位到新建记录，没有新行高亮，也未显示申请号，用户难以确认保存位置。

### 3.3 字段没有 label

`page.tsx:34` 直接并排渲染 `StoreMembershipSelector`、源仓 `<select>`、紧急程度 `<select>`、`SkuSelector`、number input 和 textarea，没有 `FormField` 或 `<label htmlFor>`。两个 Selector 内部只渲染选择控件，不负责业务字段标题（`MasterDataSelectors.tsx:55-92,358-376,557-575`）。

结果：placeholder 会在选中后消失；紧急程度甚至只显示“普通”，无法判断这是优先级、运输方式还是申请类型；读屏器也没有可关联名称。

### 3.4 全量 UI / 交互缺陷清单

#### 表单与数据安全

- 只校验“有门店、有明细”；源仓、SKU、数量、备注缺少逐字段错误提示。
- `addLine()` 对无 SKU 或数量不合法静默返回；`NaN` 可绕过 `qty <= 0` 判断后进入明细。
- 切换/清空门店时没有同步清空已选源仓；快速切门店时旧请求可覆盖新请求结果。
- 源仓加载无 loading、空态或错误提示。
- SKU 的 `onChange` 传空函数，仅依赖 `onPick`，受控组件语义不完整。
- 重复 SKU 会静默合并数量；没有“已合并”提示。
- 明细只有删除动作，无行编辑、单位、库存参考、备注或校验状态。
- 失败后清空表单；成功后也没有申请号/保存位置反馈。

#### 列表与详情

- 无状态、门店、源仓、日期筛选，无搜索、刷新、分页或排序。
- 无 loading skeleton；空态与错误态混淆。
- 表头、单元格无统一 padding/对齐；长明细全部内嵌单元格，会无限撑高行。
- 状态是中文纯文本，无徽章；未知状态直接显示后端枚举。
- `RequestRow.lines` 前端类型写 `qty`，后端实际返回 `requestedQty/approvedQty/receivedQty`，靠 `any` 和 fallback 掩盖合约差异。
- 调拨详情请求无 catch；接口失败会出现未处理 Promise rejection。
- 详情作为页面尾部 section，点击表格中部记录后用户未必看到，也没有自动滚动或关闭按钮。

#### 状态操作

- 提交、审批、发运、签收、关闭均无确认弹窗、处理中状态、防重复点击和完成后的状态说明。
- 审批缺源仓时使用 `prompt('源仓编码')`，绕开受 DataScope 过滤的选择器，易输错。
- 签收使用 `prompt`；输入没有非负数、上限或 NaN 校验。
- **非零破损时，同一个 damaged 数值被套到每一个调拨 item**，可能夸大破损并错误计算每批实收。
- 差异处理通过多次 `prompt` 收集类型和单号；类型可输入非法值，无法查看每条差异上下文，也无法安全中途取消。
- “建报损单”只是裸链接，没有将当前差异、批次、数量带给报损页；现有后端也不会自动创建报损单。

#### 响应式、可访问性与国际化

- 固定三列和 `2fr 120px 100px` 网格无断点，移动端会溢出。
- 控件无 label，反馈无 `role=alert`，按钮缺少明确状态文本，键盘/读屏体验不合格。
- 全页硬编码中文，未使用 `useLanguage/t`；切换英文、老挝文不会翻译。
- 未授权状态没有专用页面提示；权限仅零散控制创建区和行按钮。

## 4. 已上线后端能力边界

### 4.1 真实 API 矩阵

| 操作 | API | 权限 | 关键输入 | 真实结果 |
|---|---|---|---|---|
| 列表 | `GET /api/v2/store-replenishments?storeCode&status` | `MENU_STORE_REPLENISH:V` | 可选门店、状态 | 返回申请和聚合明细 |
| 可用源仓 | `GET /source-warehouses?storeCode=` | `V` | 门店编码 | 同公司、ACTIVE、OPERATIONAL、DataScope 内源仓 |
| 保存草稿 | `POST /api/v2/store-replenishments` | `C` | 门店、可选源仓/日期/紧急程度/原因、非空明细 | 创建 `DRAFT` |
| 提交 | `POST /:id/submit` | `C` | 无 | `DRAFT → SUBMITTED` |
| 审批 | `POST /:id/approve` | `A` | 可选源仓；最终必须有源仓 | 校验可用库存、创建 WMS 调拨，`SUBMITTED → APPROVED` |
| 发运 | `POST /:id/dispatch` | `E` | 无 | WMS 调拨发运，`APPROVED → DISPATCHED` |
| 签收 | `POST /:id/receive` | `E` | `receive_all` 或逐批 items | 无差异直达 `CLOSED`；有差异进入 `RECEIVED` |
| 差异关闭 | `POST /:id/close` | `E` | 每条未决差异的 `LOSS/ADJUSTMENT + resolution_ref` | 差异 resolved，`RECEIVED → CLOSED` |
| 调拨详情 | `GET /:id/transfer` | `V` | 申请 id | 调拨、逐批明细、差异 |

来源：`store-replenishment.controller.ts:6-47`、`store-replenishment.service.ts:20-148`、`wms.service.ts:1599-1752`。

### 4.2 明确不能虚构的能力

- 没有更新草稿/编辑明细 API；服务器草稿目前只能查看和提交，不能保存修改。
- 没有删除/丢弃草稿 API。
- 没有 reject/cancel API；即使数据库 CHECK 包含 `REJECTED/CANCELLED`，UI 也不能先放按钮。
- 没有“创建差异单”的独立 API；差异记录由签收自动生成。
- 报损审批 API 独立存在，但补货 close 只接受已有处理单号作为 `resolution_ref`，不会自动建报损单。
- 当前列表接口没有分页、金额字段；数据库申请/明细也没有单价或金额。因此首版列表的“金额”只能显示 `— / 暂不可用` 或暂不设该列，不能由前端猜价。
- 当前源仓接口仅返回编码和名称，没有地址、负责人、距离或可用库存汇总。“仓库详情提示”首版只能展示真实返回字段及“审批时校验库存”的规则说明。

## 5. 完整操作流程重设计

### 5.1 信息架构与每屏布局草图

```text
┌ 页面标题：门店补货编排 ───── [仓储调拨台] [新建补货申请] ┐
│ 说明：店长申请/签收；仓管审批/发运                       │
├ 统计条：草稿 | 待审批 | 待发运 | 在途 | 差异待确认        ┤
├ 筛选条：[状态] [门店] [源仓] [日期] [申请号搜索] [刷新]   ┤
├ 申请列表 DataTableV3                                     ┤
│ 申请号 | 门店 | 源仓→门店仓 | 状态 | SKU数 | 数量 | 时间 | 操作 │
└──────────────────────────────────────────────────────────┘

右侧 Drawer：新建申请 / 申请详情 / 状态操作
┌ ① 门店与源仓 ─ ② 商品明细 ─ ③ 确认提交 ┐
│ 当前步骤内容                               │
│                                           │
├ [取消]                    [上一步] [下一步] ┤
└───────────────────────────────────────────┘
```

桌面端列表是工作台，Drawer 保留筛选和列表上下文。手机端不使用窄 Drawer，改为全屏流程页/全屏 Sheet，底部固定主操作。

### 5.2 申请列表页

#### 列设计

| 列 | 内容 | 规则 |
|---|---|---|
| 申请号 | `request_no` | 可点击打开详情；复制按钮放详情内 |
| 门店 | `store_name` + 次级 `store_code` | 仓管视角优先展示；店长单店时可压缩 |
| 源仓 → 门店仓 | 源仓编码 → 目标仓编码 | 源仓为空显示“待审批指定” |
| 状态 | `StatusBadge` | 使用补货专用三语 label 与统一 token |
| SKU 数 | `lines.length` | 点击/展开显示前 3 项，更多项进详情 |
| 申请数量 | `Σ requestedQty` | 数量而非金额，避免虚构价格 |
| 金额 | 暂不展示 | 后端无价格/金额；待正式能力支持后增加 |
| 时间 | `created_at`，次级显示 `submitted_at/approved_at` | 列表默认创建时间倒序 |
| 操作 | 当前状态允许的唯一主动作 + “查看详情” | 最多一个主按钮，其余进 `…` |

筛选：状态多选、门店、源仓、创建日期、申请号搜索；“我的待处理”快捷筛选按角色映射。当前 API 只支持单个 `storeCode/status`，首版可对已加载结果做前端筛选；数据量增长前应补服务端分页/搜索设计，不能假定已有查询参数。

#### 状态颜色语义

| 状态 | 文案 | 颜色 | 语义 |
|---|---|---|---|
| DRAFT | 草稿 | neutral/灰 | 尚未进入流程 |
| SUBMITTED | 待审批 | warning/橙 | 等待仓管决策 |
| APPROVED | 待发运 | info/蓝 | 已占用流程资源，等待执行 |
| DISPATCHED | 在途 | brand/靛蓝 | 货物移动中 |
| RECEIVED | 差异待确认 | danger/红 | 有未闭环差异 |
| CLOSED | 已关闭 | success/绿 | 流程完成 |
| REJECTED | 已驳回 | danger/红 | 预留显示；没有 API 前不提供操作 |
| CANCELLED | 已取消 | neutral/灰 | 预留显示；没有 API 前不提供操作 |

现有 `StatusBadge` 缺 `DISPATCHED` token，实施时补入设计 token，不在页面局部硬编码。

#### 角色视角

- 店长/门店成员：默认筛选自己的门店；突出“新建申请”“在途签收”“差异待确认”；隐藏无权限仓管动作。
- 仓管/仓库经理：默认“待审批/待发运”；突出源仓、SKU 数、申请数量、库存不足错误；只显示 DataScope 内源仓所属申请。
- 全局管理员：可切全部授权门店/仓库，但仍按 `C/A/E` 权限决定按钮，不用角色名替代后端权限。

### 5.3 新建/编辑申请向导

“新建”可完全使用现有 API；“编辑已有服务器草稿”是目标态，在新增更新 API 前只显示详情与提交，不显示保存修改。用户在当前 Drawer 中尚未提交到服务器的内容可保留到组件状态；是否增加本地恢复要单独评审数据保留和跨账号风险。

#### 步骤 1：门店与源仓

| 字段 | 组件 | Label | Placeholder / 帮助 | 校验 |
|---|---|---|---|---|
| 目标门店 | `StoreMembershipSelector` + `FormField` | 目标门店 | “请选择需要补货的门店”；仅显示当前用户有效 membership | 必填；改变后清空源仓和商品参考数据 |
| 门店仓 | 只读信息 | 收货仓库 | 自动显示门店绑定仓编码 | 门店必须存在有效仓绑定（后端 resolve 校验） |
| 源仓 | `SelectField` | 调出仓库 | “可暂不选择，由仓管审批时指定”；显示编码 + 名称 | 新建可选；审批必填；加载/空/错误态独立 |
| 申请日期 | Date input | 申请日期 | 默认今天 | 可选，发送 `requestedDate` |
| 紧急程度 | `DictSelect` 或受控选项 | 紧急程度 | 普通 / 紧急；“紧急仅用于排序提示，不跳过审批” | 值仅 NORMAL/URGENT |
| 补货原因 | textarea | 补货原因/备注 | “如：周末促销备货，预计销量…” | 可选；显示字符计数 |

仓库详情提示首版只显示真实数据：仓库名称、编码，以及“审批时按 AVAILABLE 批次和到期日顺序校验库存”。地址、库存汇总、运输时效在无 API 时不展示。

#### 步骤 2：商品行编辑

```text
商品明细                                      [添加商品]
SKU/名称 | 申请数量 | 当前库存参考 | 行备注 | 操作
[选择器] | [数字框] | [暂无接口]     | [输入] | [删除]
```

| 字段 | 交互与校验 |
|---|---|
| SKU | `SkuSelector`，label“商品 SKU”，placeholder“搜索 SKU 编码或名称”；只选 ACTIVE；选中后展示编码、品名、规格/等级（raw 有值才展示） |
| 申请数量 | label“申请数量”，placeholder“请输入正数”；`min > 0`，拒绝空、NaN、0、负数；单位若后端未提供则不猜测 |
| 当前库存参考 | 目标态展示门店/源仓可用量；当前专用 API 不返回库存，首版明确显示“暂无库存参考，审批时校验源仓库存”，不可伪造数字 |
| 行备注 | 可选，传 `remark`；当前 UI 未提供，但后端已支持 |
| 增删 | 添加时重复 SKU 明确提示并让用户选择“合并数量/返回修改”；删除需可撤销 toast，不必逐行确认弹窗 |

明细底部显示 SKU 种数和申请总数量。至少一行才能下一步；错误定位到具体行，不能只发顶部消息。

#### 步骤 3：确认提交

按“门店与仓库”“商品汇总”“申请信息”分组只读预览。底部操作：

- `保存草稿`：调用现有 POST 创建 `DRAFT`；成功 toast 明确显示申请号，并回到列表、定位/高亮新记录。
- `保存草稿并提交`：现有后端需要先 POST，再 POST `/:id/submit`。必须把两步结果分别反馈；若创建成功而提交失败，明确提示“草稿 SR-… 已保存，提交失败，可在列表重试”，不得回滚式清空或误报全失败。
- `返回修改`：回到相应步骤，保留数据。

目标态“编辑已有草稿”需后端增加更新 API 后才启用，且要定义并发版本/更新时间校验；本轮不定义虚构 URL。

### 5.4 状态流转操作

```text
 DRAFT ──提交──> SUBMITTED ──审批并创建调拨──> APPROVED ──发运──> DISPATCHED
                                                                          │
                                                  无差异全收 ──────────────┤──> CLOSED
                                                                          │
                                                  短收/破损 ──> RECEIVED ──差异关联处理单──> CLOSED

 REJECTED / CANCELLED：数据库允许，但当前无操作 API，仅兼容历史状态显示。
```

| 操作 | 谁可见 | 位置 | 确认内容 | 成功反馈 |
|---|---|---|---|---|
| 提交 | `canCreate` 且 DRAFT | 详情 Drawer 底部主按钮；列表快捷动作 | 门店、SKU 数、总数量；提交后不可编辑 | “申请已提交，等待仓管审批” |
| 审批 | `canApprove` 且 SUBMITTED | 详情底部 | 用受控源仓选择器；展示库存校验说明 | “审批通过，已创建调拨单 XXX” |
| 发运 | `canEdit` 且 APPROVED | 详情底部 | 调出/调入仓、批次数、数量 | “已发运，门店可进行签收” |
| 签收 | `canEdit` 且 DISPATCHED，且门店范围可见 | 移动端/桌面签收页底部 | 全收或逐批实收/破损 | 无差异“签收完成并关闭”；有差异“已签收，N 条差异待处理” |
| 关闭差异 | `canEdit` 且 RECEIVED | 差异 Drawer 底部 | 每条差异必须有关联类型和单号 | “差异已确认，调拨关闭” |

每个确认弹窗使用 `ModalV2`；提交中按钮 disabled + spinner；成功 `toast.success`，业务校验 `toast.warning/error`；接口错误保留 Drawer 和输入，不改变本地状态。审批时不得再用自由文本输入源仓编码。

### 5.5 签收与差异处理

#### 签收屏

- 顶部：申请号、调拨单号、源仓 → 门店仓、发运时间。
- 模式切换：`全部按发运数量签收` / `逐批核对`。
- 逐批表：SKU、批次、应收、实收、破损、差异、备注。实时校验 `实收 + 破损 ≤ 应收`，数量不得为负或 NaN。
- 总结条：应收、实收、短收、破损；有差异时红色提示“提交后将生成待处理差异”。
- 提交前弹窗再次列出差异；调用现有 `receive_all` 或 `items[]` 合约。

#### 差异屏

- 差异卡片逐条显示类型（短收/破损）、SKU/批次、数量、创建时间和状态。
- 处理类型只允许 `LOSS` / `ADJUSTMENT`，使用受控 Select；关联处理单号必填。
- “前往建报损单”只能作为导航辅助。当前不能自动回填，返回后由用户录入真实单号；若未来要深链回填，需另行确认报损页参数和创建结果能力。
- 所有未决差异完成关联后才启用“确认差异并关闭”。

### 5.6 草稿管理

当前可立即设计/实施的行为：

- 保存成功 toast：`草稿已保存：{requestNo}`，列表切到“草稿”并高亮该行。
- 保存失败：保留所有字段和明细，错误区提供重试。
- 从列表打开草稿：在没有更新 API 前只读展示，可执行“提交”；明确提示“当前版本暂不支持修改已保存草稿”，避免假编辑。
- 关闭未保存 Drawer：若有改动，弹窗“继续编辑 / 放弃本次未保存内容”。这只丢弃浏览器内尚未 POST 的内容。

需要后端能力后才能实现：

- 恢复并编辑服务器草稿、再次保存。
- 丢弃/删除服务器草稿。
- 跨设备自动恢复未提交内容。

### 5.7 空态、加载态、错误态文案

| 场景 | 组件 | 三语源文案（中文） |
|---|---|---|
| 列表首次加载 | `LoadingSkeleton variant="table"` | “正在加载补货申请…” |
| 真空列表 | `EmptyState` | “暂无补货申请” / “创建第一张补货申请，仓管审批后将生成仓储调拨。” |
| 筛选无结果 | `EmptyState compact` | “没有符合筛选条件的申请” / “清除筛选后重试。” |
| 列表失败 | `ErrorState onRetry` | “补货申请加载失败” / “请检查网络后重试。” |
| 源仓加载 | Select skeleton/disabled | “正在加载可用源仓…” |
| 无源仓 | inline empty | “当前门店没有可选源仓，可保存草稿并由仓管审批时处理。” |
| 保存中 | Button loading | “正在保存草稿…” |
| 保存失败 | inline error + toast | “草稿未保存，已保留当前内容。” |
| 提交/审批/发运中 | Button loading | “正在提交…” / “正在校验库存并审批…” / “正在发运…” |
| 库存不足 | Modal inline error | 原样呈现后端 SKU 库存不足信息，并保留审批输入 |
| 详情为空 | `EmptyState compact` | “尚未生成调拨单。” |
| 详情失败 | `ErrorState onRetry` | “调拨详情加载失败。” |
| 无权限 | `ErrorState/permission state` | “你没有查看此页面的权限，请联系管理员。” |

### 5.8 移动端适配

- ≤ 768px：列表改申请卡片，首屏显示申请号、状态、门店、源仓、SKU 数、总数量和唯一主动作；明细进详情。
- 新建向导与签收使用全屏层，不保留三列网格；字段单列，最小触控高度 44px。
- 底部固定操作栏，兼容 safe-area；主操作置右/满宽，次操作放“更多”。
- 签收数字输入使用 decimal input mode；每批一张卡，实时显示剩余可录入数量。
- 状态与错误不能只靠颜色；同时保留图标和文字。
- 网络抖动时保留输入并提供重试；禁止重复提交。对于跨页面/刷新恢复，不在没有明确本地草稿安全方案时承诺。

## 6. 设计系统与三语规范对齐

### 6.1 组件映射

| 需求 | 现有组件 | 位置/备注 |
|---|---|---|
| 页面骨架 | `PageShell` + `Panel` | design-system 统一入口 |
| 主次按钮 | `Button` | `@/components/ui/button`，使用 primary/secondary/outline/danger |
| 字段 | `FormField` + `SelectField` + 主数据 Selector | label、required、hint、error 全量接入 |
| 列表 | `DataTableV3` | 内置 loading、排序、分页、空态、状态列 |
| 状态 | `StatusBadge` | 补 `DISPATCHED` token；业务 label 走 i18n |
| 新建/详情 | `DrawerV2` | 桌面右侧；移动端全屏适配 |
| 确认 | `ModalV2` | 状态变更、未保存退出 |
| 反馈 | `useToast` | success/error/warning/info |
| 加载/空/错 | `LoadingSkeleton` / `EmptyState` / `ErrorState` | 禁止继续复用一个 message div |
| 流程 | `WorkflowTimeline` | 详情中展示已发生节点，不伪造审批工作流数据 |

成熟结构参考 `procurement2/requests/RequestForm.tsx:430-539` 的明细表与 sticky 操作条，但补货字段和权限仍按专用 API 实现。

### 6.2 i18n 键规划

项目语言固定为 `zh/en/lo`（`LanguageContext.tsx:5-14`）。新增键使用稳定领域命名，不再新增 `ui.<中文长句>`：

```text
store.replenish.title
store.replenish.subtitle
store.replenish.action.new
store.replenish.action.save_draft
store.replenish.action.submit
store.replenish.action.approve
store.replenish.action.dispatch
store.replenish.action.receive
store.replenish.action.resolve_close
store.replenish.field.target_store
store.replenish.field.target_warehouse
store.replenish.field.source_warehouse
store.replenish.field.requested_date
store.replenish.field.urgency
store.replenish.field.reason
store.replenish.field.sku
store.replenish.field.requested_qty
store.replenish.field.line_remark
store.replenish.status.draft|submitted|approved|dispatched|received|closed|rejected|cancelled
store.replenish.empty.list|filtered|source_warehouse
store.replenish.loading.list|source_warehouse|save|submit|approve|dispatch
store.replenish.error.load|save|validation|transfer
store.replenish.toast.draft_saved|submitted|approved|dispatched|received|closed
store.replenish.confirm.submit|approve|dispatch|receive|close|discard_unsaved
store.replenish.discrepancy.shortage|damage|loss|adjustment
```

所有键必须同时提交 `zh.json`、`en.json`、`lo.json`，参数如 `{requestNo}`、`{count}` 保持三语同名。状态文案不得只依赖全局英文枚举 fallback。

## 7. 实施拆分与顺序

### Phase 0：先修数据安全与 UAT 阻断项

1. 换用正确设计系统骨架和 Button，恢复清晰页面层级。
2. 所有字段接 `FormField`，补 label、hint、placeholder、inline error。
3. 重构请求状态：保存失败不清空；增加 saving/loading/error、toast、防重复提交；成功显示申请号并定位新行。
4. 修复门店切换清源仓、请求竞态、数量 NaN/范围校验。
5. 移除签收/差异原生 `prompt`；在完成安全签收表单前，不应保留可能错误套用每批破损数的快捷实现。
6. 接入 zh/en/lo 键。

### Phase 1：列表与详情工作台

1. `PageShell + Panel + DataTableV3 + StatusBadge`。
2. 状态/门店/源仓/日期筛选，loading/empty/error/retry。
3. 详情 Drawer、真实状态时间轴、调拨与差异详情。
4. 按权限和状态只显示合法操作。

### Phase 2：三步新建向导与完整状态操作

1. 门店/源仓 → 商品行 → 确认提交。
2. 提交、审批、发运确认弹窗和分步结果反馈。
3. 桌面 Drawer、移动端全屏与 sticky action bar。

### Phase 3：签收与差异闭环

1. 全收/逐批签收、实时差异汇总和严格校验。
2. 差异处理类型、真实关联单号、全部解决后关闭。
3. 报损页导航只基于已核实参数能力；未核实时不自动带参。

### Phase 4：需后端先补能力的目标态

1. 草稿更新与并发控制。
2. 草稿丢弃/删除。
3. reject/cancel 状态操作。
4. 服务端分页/搜索、金额口径、库存参考/仓库详情接口。

这些能力需单独做 API/权限/DataScope/审计设计；前端不得预先放空按钮。

## 8. 测试计划

### 8.1 每阶段组件与契约测试

- Phase 0：静态契约测试确认不再出现裸 `<button>`/`prompt`/硬编码状态；保存失败保留表单；保存成功显示 requestNo；字段三语键齐全。
- Phase 1：列表 loading/empty/error/filtered-empty；状态徽章八态；各权限组合的动作可见性；详情加载失败可重试。
- Phase 2：向导每步校验、门店切换清源仓、重复 SKU、数量边界、创建成功提交失败的部分成功反馈；审批库存不足保留输入。
- Phase 3：全收、逐批短收、破损、`received + damaged > expected`、多批分别录入、未关联差异禁止关闭。
- i18n：`zh/en/lo` 键集合一致，变量插值一致；英文/老挝文页面无中文硬编码。
- 响应式：1920、1440、768、390px 截图回归；键盘 tab 顺序、label 关联、alert 语义。

现有 Vitest 是 Node 环境并只匹配 `src/**/*.test.ts`（`apps/web/vitest.config.ts:4-22`），不适合直接做 DOM 交互。实施时可继续使用源码契约/纯函数单测，并用 Playwright 覆盖真实交互；若引入 DOM 测试环境，应作为独立测试基础设施变更评审。

### 8.2 API 与端到端验证

当前补货 API 测试只是源码静态断言；旧 `pos-store-regression.sh` 仍请求已删除的 `/api/v3/pos`，且 404 时 SKIP 并 exit 0，不能当作新链路通过。

必须新增真实测试库链路：

```text
创建 DRAFT
→ 提交 SUBMITTED
→ 审批（含库存充足/不足、仓库 DataScope）
→ 发运 DISPATCHED
→ A: 全收直达 CLOSED
→ B: 短收/破损进入 RECEIVED
→ 关联 LOSS/ADJUSTMENT 单号后 CLOSED
→ 核对 WMS transfer、items、discrepancies、库存台账
```

Web Playwright 覆盖店长与仓管两种账号，验证按钮权限、重复点击保护、错误恢复、手机签收。现有 Playwright 默认 Chromium 且失败保留 trace/screenshot（`playwright.config.ts:3-12`），可直接沿用；CI 目前不自动运行 E2E，需把新 spec 接入门禁。

### 8.3 基础验证命令

```bash
cd apps/web && ./node_modules/.bin/tsc --noEmit
cd apps/api && ./node_modules/.bin/tsc --noEmit
cd apps/web && ./node_modules/.bin/vitest run
cd apps/api && ./node_modules/.bin/jest src/modules/store-pos/services/store-replenishment.contract.spec.ts
cd apps/web && npx playwright test e2e/store-replenishment.spec.ts
```

另跑新补货 API 回归、WMS 回归和真实 scope-audit；不能以旧 POS 脚本的 SKIP 代替。

## 9. 部署与 UAT 验证方案

1. 测试环境准备两个角色账号（店长 `C/E/V`、仓管 `A/E/V`）及 DataScope 内/外门店、仓库、可用库存批次。
2. 部署前执行 Web/API tsc、Vitest、补货 API 新回归、WMS 回归、Playwright；三语硬编码检查必须无新增。
3. 部署按现有 workflow 的 `git pull --ff-only`、SHA 校验、健康检查执行；本轮 UI 若无 DB/API 改动可走 web 模式。若后续含 API/迁移则走 api/full，并保留迁移前备份。
4. 部署后验证 `/api/health` 和 `scripts/smoke-test.sh`，再执行补货专项 smoke。当前部署只 smoke 首页，`browser-visual-smoke.mjs` 也未包含 `/store/replenish`，实施时需纳入。
5. UAT 截图尺寸至少覆盖 1920 × 945、1440 × 900、390 × 844；逐状态保留截图与请求结果。
6. UAT 必测：保存成功显示申请号、保存失败不丢内容、草稿提交、库存不足审批、正常发运、无差异全收、多批短收/破损、差异关联关闭、越权不可见/不可操作、三语切换、手机签收。
7. 当前 `uat-runner.sh` 没有新补货 API 用例；在它补齐前，专项脚本/Playwright 结果必须作为独立发布证据，不能宣称全量 UAT 已覆盖。

## 10. 审核决策点

进入修复轮前，主 agent 需确认：

1. Phase 0 是否作为独立紧急修复先上线，还是与 Phase 1/2 合并发布。
2. 首版列表移除“金额”列（推荐），还是显示明确的“暂不可用”；后端目前没有金额依据。
3. 无编辑 API 时，服务器草稿采用“只读详情 + 提交”的诚实降级是否接受。
4. 签收 `MENU_STORE_REPLENISH:E` 同时用于仓管发运和门店签收是否符合权限治理预期；UI 会遵守现状，但权限拆分属于后端治理议题。
5. `approve()` 当前未先经 `assertVisibleRequest()`，只检查所选源仓 DataScope；是否在 UI 重设计实施前作为后端授权缺陷单独修复。

主 agent 审核通过后，下一轮才进入代码实施。

## 11. 实施与交付记录

### 11.1 代码与评审

- 设计提交：`345f9811`、`66925594`；实施提交：`fdcc1122`。
- PR：[#127](https://github.com/ivanzhao299/phoenix-erp-v3/pull/127)，2026-08-28 合入；merge revision：`11ea8ba7ad36fde5b59cf65ae06de2d0e8c4c31c`。
- PR 最新一轮门禁全部通过：CI/CD Type-check & Regression、AI Delivery Build、V3 Regression、Web Vitest、Runtime Smoke、Static Security And Freeze Gates。冻结应用路径经 `reviewed-frozen-boundary` 显式复核；本地 `ALLOW_FREEZE_TOUCH=true` 的 W5 closeout 20/20 通过。

### 11.2 本地验证

- Web Vitest：87 files / 464 tests，通过；新增补货纯函数与源码契约共 8 项断言。
- API Jest：72 suites / 630 tests，通过。
- Web/API `tsc --noEmit`：均 0 error。
- i18n：三语各 14,195 键平齐，7,749 个代码引用全部命中；hardcoded-literals `uncovered=0`、`locale_quality=0`。
- nullable-in-unique、constraint drift、diff check 与页面主数据裸输入审计通过。
- Playwright 命令已真实执行，但当前仓库、本机环境及 Actions secrets 均未提供 `REPLENISH_E2E_FIXTURE`、店长/WMS 两组凭据，spec 在配置前置处 fail-fast；不将此项记为通过。替代门禁为已进入 CI 的 Vitest 契约/纯函数测试，加部署后的 amei 真实只读 acceptance。完整写链路 E2E 仍待受保护 fixture 基建落地。

### 11.3 部署与迁移

- `workflow_dispatch` full 部署 run：[`33134878236`](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/33134878236)，`approve_production=true`，成功。
- 部署 revision：`11ea8ba7ad36fde5b59cf65ae06de2d0e8c4c31c`。API/Web 镜像均以该 OCI revision 构建；部署后专项验收再次确认 checkout/API/Web 三方一致。
- full 部署在迁移前生成并校验备份 `phoenix_erp_pre_11ea8ba7ad36.dump`；裸 SQL 迁移完成；TypeORM 返回 `No migrations are pending`；Web smoke 通过。
- CI 测试库确认 `CreateStoreReplenishmentOrchestration1788134400000` 可成功执行；生产无待执行迁移，未重复写入历史迁移。

### 11.4 生产只读复验

- amei 基础专项 run：[`33135623725`](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/33135623725)；补充 HTML/三语 bundle 证据后的最终 run：[`33136079239`](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/33136079239)。两次均成功，`PRODUCTION_BUSINESS_WRITES=0`。
- selector 数据源：contexts 恰好 1 行 `STORE-HS-001`，`roles=CASHIER,STORE_MANAGER`，销售仓与 WarehouseScope 交集均为 true；amei WarehouseScope 8 仓。
- 补货 API：列表 GET 200、会晒门店源仓 GET 200、`MENU_STORE_REPLENISH:V,C,E`；无权限 cashier GET 403。
- 错误窗口：Store POS/补货相关 30 分钟窗口 0 条。
- 三语与页面骨架：源码契约确认页面所有引用键三语齐全、无翻译语言包中文回退；生产专项 smoke 校验 Web bundle 的 zh/en/lo 标题存在性。amei cookie 鉴权 `/store/replenish` 得到最终 URL 正确的 200 HTML（15,858 bytes），但原始 HTML 不含业务标题或 PageShell style；当前路由为客户端 hydration，且 `PageShell` 组件自身没有 className，因此“原始 HTML 含 PageShell 类名”无法成立。该项明确记为架构限制，不伪造通过；替代证据为生产 Web OCI revision、鉴权 HTML 200、三语 bundle 与源码 PageShell 契约四者组合。

### 11.5 审批人源仓 membership 误拦修复（2026-08-28）

- 决策点 5 已执行：`approve()` 先调用 `assertVisibleRequest()`。可见性定义沿用列表的 fail-closed 规则：已有源仓的申请必须命中审批人 WarehouseScope；尚未指定源仓的申请仅允许同公司且审批人至少有一个有效 WarehouseScope 的 `ROLE_WMS_OP/ROLE_WMS_MGR` 查看，审批提交时再校验所选源仓必须属于审批人 WarehouseScope。跨 scope 申请拒绝。
- 新增 `StoreScopePolicy.resolveStoreContext(storeCode, purpose)`：只解析 ACTIVE 门店身份、公司和有效 SALES/RETURNS 绑定仓，不要求门店 membership；非 global 用户仍必须命中门店公司 DataScope。`sourceWarehouses()` 使用该上下文排除目标店自有仓，再以审批人 WarehouseScope 与门店公司求交集。
- 店员链路不放宽：`create()`、`submit()`、`receive()`、`close()` 仍经 `resolve()` / `assertStoreRequest()` 要求有效 membership 与门店绑定仓权限交集。POS 销售、商品、班次等端点也保持原门禁。
- 同类端点排查：`dispatch()` 与 transfer detail 已走仓管可见性 + WarehouseScope，不受 membership 误拦；`receive()` / `close()` 是门店签收与差异确认路径，按设计保留 membership；未发现第二个需要改为审批人免 membership 的店相关读取端点。
- 审批弹窗新增独立 loading/error/empty 状态；后端 403 原文进入 `FormField` inline error 并保留 toast。zh/en/lo 三语键复用既有 `store.replenish.warehouse.loading|error|empty`，同时修正老挝语两项历史占位文案。
- 自动化回归覆盖：无 membership 的仓管可解析门店上下文；跨公司 DataScope 拒绝；审批源仓返回四个 scope 仓且排除会晒店自有仓；不可见申请审批拒绝；源码契约继续断言 `create/submit/receive/close` 的 membership 门禁。生产专项 smoke 增加 `liushanjun` 短期 JWT、会晒 membership=0、source-warehouses=200/四仓/排除会晒自有仓，以及无 V 权限账号 source-warehouses=403。
- 本地验证：API/Web `tsc --noEmit` 均通过；API Jest 73 suites / 640 tests，Web Vitest 88 files / 469 tests；i18n hardcoded `uncovered=0, locale_quality=0`，nullable-in-unique、constraint drift、真实主数据裸 input/onChange scope-audit 均通过。独立 `check-i18n-key-parity.mjs` 在仓库中不存在，三语键集合由 Web 补货契约测试实际校验，未伪报该命令通过。
- 交付：实现提交 `69f5aec3`，冻结边界复核触发提交 `d9958b6b`；PR [#134](https://github.com/ivanzhao299/phoenix-erp-v3/pull/134) 经 `reviewed-frozen-boundary` 显式复核后 7 项 CI 成功、0 失败，merge revision `677efea7daf405264a25b65504993a88c8576e6d`。
- full 部署：[run 33158844711](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/33158844711) 成功；checkout/API/Web 最终 revision 均为 `677efea7daf405264a25b65504993a88c8576e6d`。
- 生产只读复验：[run 33159798077](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/33159798077) 成功。amei contexts 与会晒 source-warehouses 继续 200；`liushanjun` 使用短期 JWT，在会晒有效 membership=0 的前提下 source-warehouses 返回 200，恰好四仓 `LPH_DP_EGG_FARM / LPH_DP_EGG_SALES / LPH_DP_FEED / LPH_DP_MEDICINE`，且排除 `ST_LAO_XINGCHI_HS_001_SALES`；无 V 权限账号 `cashier` 的列表和 source-warehouses 均为 403；30 分钟错误窗口 0。全程 `PRODUCTION_BUSINESS_WRITES=0`。

### 11.6 补货编排调拨目标仓语义修复（2026-08-28）

- 根因：补货审批复用了公开 `createTransfer()`，导致审批人除源仓外还必须拥有目标门店仓的个人 WarehouseScope。刘善军仅有东鹏四仓，合法目标 `ST_LAO_XINGCHI_HS_001_SALES` 因而被错误拒绝。
- 修复：公开 `/api/inventory/transfer` 继续调用 `createTransfer()` 并保留源、目标双边个人 scope；新增仅由服务端补货编排调用的 `createStoreReplenishmentTransfer()`。编排入口对源仓继续执行审批人 `assertWritableWarehouse()`，目标仓只能命中 `resolveStoreContext(request.store_code, 'SALES')` 返回的 ACTIVE、OPERATIONAL、有效期内 ACTIVE binding，否则 fail-closed。Controller 不接收也不透传编排上下文。
- 生命周期语义：`dispatchTransfer()` 只断言源仓；`receiveTransfer()` 只断言目标仓；`completeTransfer()` 补齐目标仓断言。库存数量、状态、批次归属和差异关联校验均保持不变。
- 前端错误：补货操作请求改用 `silent` 抑制全局 `api-error` toast，由页面 catch 只显示一次 toast；源仓加载失败只保留弹窗 inline error；未选择源仓时只保留 inline 校验，不再经 catch 生成第二条 toast。
- 红灯证据：定向 Jest 首跑因 `createStoreReplenishmentTransfer` 尚不存在及旧审批路径返回空 transfer 失败；实现后定向 34/34 通过。完整 API Jest 发现旧 contract 仍锁定 `createTransfer`，更新为编排入口及 SALES binding 契约后 73 suites / 648 tests 全绿。
- 本地验证：API/Web `tsc --noEmit` 均 0 error；Web Vitest 88 files / 470 tests；nullable-in-unique 0 违规（1 白名单）；constraint drift 0 new drift（1 白名单）；i18n hardcoded `uncovered=0, locale_quality=0`；`git diff --check` 通过。变更差异未新增任何主数据裸 `<input>` 或裸 `onChange(...e.target.value)` 写入路径。
- 回归覆盖：刘善军 scope 内源仓审批到会晒 SALES binding 目标成功；源仓越权拒绝；伪造非 binding 目标拒绝；公开 createTransfer 范围外目标拒绝；dispatch/receive/complete 单侧仓权限语义均有测试。
- 交付：实现提交 `968e1bde`，显式冻结/安全复核触发提交 `aeeab466`；PR [#136](https://github.com/ivanzhao299/phoenix-erp-v3/pull/136) 登记 `reviewed-frozen-boundary`、`reviewed-security-touch` 后 7 项 CI 成功、0 失败，merge revision `757fb31ef4680489a95e0a175d7a842050a70feb`。本地显式 `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true` 的 W5 closeout 20/20 通过；security scanner 对 `wms.service.ts` 的命中来自本次未修改的既有 `CURRENT_TIMESTAMP`/DDL 文本。
- full 部署：[run 33161970461](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/33161970461) 成功；测试迁移链、entity drift baseline、五组 regression、API/Web 镜像构建及生产 SSH deploy 全绿。checkout/API/Web 最终 revision 均为 `757fb31ef4680489a95e0a175d7a842050a70feb`。
- 生产只读复验：[run 33163091425](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/33163091425) 成功。`liushanjun` 使用短期 JWT，在会晒有效 membership=0 下仍只得到四个个人源仓 `LPH_DP_EGG_FARM / LPH_DP_EGG_SALES / LPH_DP_FEED / LPH_DP_MEDICINE`，目标店仓 `ST_LAO_XINGCHI_HS_001_SALES` 未混入源仓选项；生产 RBAC/有效 SALES binding 数据与部署代码共同构成审批语义只读等价断言。无权限 `cashier` 的列表和源仓接口均 403；角色 seed、WMS perms-version 断言通过；30 分钟 Store POS 错误窗口 0。全程 `PRODUCTION_BUSINESS_WRITES=0`。
