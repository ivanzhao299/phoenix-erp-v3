# 采购模块（procurement2）样板化审计报告

> 目的：把采购模块打造成全平台可复制的 UI/UX/性能样板。本报告 = 全量只读审计 + 页面/元素归类统计 + 样板定义 + 分阶段路线图。
> 方法：4 路并行子代理审计（样式一致性 / 死代码 / 前端性能 / 后端 API），本文为汇总。HEAD=bf2f1f8 起，叠加本会话 G149–G155。
> 原则：**样式先行**（用户指定），功能/业务逻辑问题登记但另立阶段；但**安全越权 + 数据错算**两类即使属"功能"也单列预警。

---

## 一、页面归类统计（11 个文件，9 个实质页面）

| 页面 | 层级 | 行数 | 新建/编辑形态 | 页头 | 筛选栏 | 卡片容器 | 表格 | 弹窗 | 统计卡 | 操作列 | 规范度 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| dashboard | 一级 | 419 | — | PageHeader | — | **Panel✅** | 裸 s.table×6 | — | **KpiCardV2✅** | — | ★★★★ 样板 |
| payments（列表） | 一级 | 419 | **整页✅** | PageHeader | inline 常量 | 裸 div | 裸 s.table | ModalV2✅ | — | 图标 | ★★★★ 样板 |
| payments/PaymentForm | 二级（整页） | 468 | 整页 | （宿主页头） | — | s.formSection | 裸 s.table | 自写 portal 浮层 | — | — | ★★★ |
| orders | 一级 | 1426 | RightDrawer（重） | PageHeader | inline 常量 | 裸 div | 裸 s.table | ModalV2✅ | — | **文字✅(G154)** | ★★★ |
| requests | 一级 | 1252 | RightDrawer（重） | PageHeader | inline 常量 | 裸 div | 裸 s.table | ModalV2✅ | — | 图标 | ★★ |
| suppliers | 一级 | 968 | RightDrawer | PageHeader | 逐个内联 | 裸 div | 裸 s.table | — | 自写统计条 | 图标 | ★★ |
| receipts | 一级 | 970 | RightDrawer（重） | **无** | 逐个内联 | 自写 formBlock | 裸 s.table | **自写 overlay×2** | — | 图标 | ★ |
| shipments | 一级 | 706 | RightDrawer | **无** | 逐个内联 | 裸 div | 裸 s.table | **自写 overlay** | — | 图标 | ★ |
| shareholder-funds | 一级 | 762 | RightDrawer | **无** | 逐个内联 | 裸 div | 裸 s.table | — | 自写 SummaryCards | **本地 StatusBadge(重名全局)** | ★ |
| init | 二级 | 868 | 自写 overlay + 自写抽屉 | **裸 `<h2>`** | 逐个内联 | 裸 div | 裸 s.table | **自写 overlay + confirm()** | 自写统计卡 | 内联 | ☆ 最乱 |
| projects | — | 16 | — | — | — | — | — | — | — | — | redirect stub（合规） |

**样板基准**：`dashboard`（Panel + KpiCardV2）与 `payments 列表`（PageHeader + ModalV2 + 整页表单）最接近设计系统，其余页向这两页对齐。

---

## 二、页面元素目录（现状 vs 样板组件）

| 元素 | 现状（套数） | 样板做法（design-system 已有） |
|---|---|---|
| 页头 | 3 套：PageHeader / 无 / `<h2>` | 统一 `PageHeader`（title/subtitle/breadcrumb/actions） |
| 筛选栏 | 2 套：模块级 inline 常量×3 / 逐个内联 style×5 | `FilterBar` + `SearchInput` + `SelectField` |
| 卡片容器 | 3 套：Panel / 裸 s.card / 自写 formBlock | `Panel` |
| 表格（只读列表） | 全裸 `<table className={s.table}>`（0 用全局） | `DataTableV3`（内置空态/加载/排序/格式化） |
| 明细录入表（可编辑行） | thStyle/tdStyle 各写 4 份 | 共享 `tableInputCell` + 补 `tableHeadCell` token（不套 DataTableV3） |
| 弹窗（确认+备注类） | 5 套：ModalV2 / 自写 fixed overlay×4 / portal 浮层 / confirm() | `ConfirmDialogV2`（确认类）/ `ModalV2`（内容类） |
| 新建/编辑形态 | RightDrawer（重表单 6 页）/ 整页（payments✅）/ 自写抽屉 | 内容多→**整页**；内容少→统一 `DrawerV2` |
| 统计卡 | 3 套：KpiCardV2 / 自写统计条×3 | `KpiCardV2`（指标卡）/ `StatStripV2`（横向多指标条） |
| 徽章 | 3 套：本地 StatusBadge / s.badge 字符串 / `+"22"` 拼色 | 全局 `StatusBadge` |
| 分页 | 3 套：图标式 / 文字「上下页」/ init 内联 | 统一图标式 `page/totalPages`（或 DataTableV3 内置） |
| 操作列 | 2 套：文字按钮（orders✅G154）/ 纯图标×5 | 文字按钮（抽共享 `actBtn`/`actBtnTone`） |
| 工具函数 | fmtAmt×3 / fmtDate×4 / inlineInput×3 / actionLabel×3 / **getToken+hdr×8** / readLastScope×2 | 抽 `procurement2/_shared/` + 收口 `api-client.request()` |

---

## 三、问题域汇总

### A. 样式参差（样式先行，本阶段主攻）
TOP 影响面：①页头三套（9 页）②筛选栏两套（全列表页）③弹窗五套 + z-index 各异（1000/200/150/10250）④操作列图标/文字混用 ⑤统计卡三套 ⑥表格全裸 ⑦本地 StatusBadge 重名 ⑧init 拼色 ⑨分页三套。

### B. 旧代码 / 死代码
- **`constants/prc2.constants.ts` 13 个枚举 100% 未被引用**（最大死代码，且多个值已与实际生命周期相悖）；`PRC2_PHASE=0`/`PRC2_TABLE_COUNT=15` 陈旧。
- 重复：`getToken/hdr`×8、`fmtDate`×4、`fmtAmt`×3、`inlineInput/Select`×3、`actionLabel/Badge`×3、`SimpleModal=ModalV2` 别名×3、`genNo`×4、`writeLog`×5、`getUser`×5。
- `@deprecated` approve/reject 三处仍在线且仍被前端调用（标了废弃但仍是主路径）。
- 前端无 console.log/TODO/死 import（干净）。

### C. 性能
- **`ui/RightDrawer` 关闭不卸载 DOM**；仅 orders 做了 `{open &&}` 门控，requests/receipts/shareholder-funds/shipments **重表单离屏常驻 + 进页即拉远程**。
- **`ScopedSelect` 无缓存**：明细表每行一个 WarehouseSelector → N 行 = N 个相同 `/crud/wms_warehouses` 请求；一个抽屉 5 个 Selector = 5 并发。
- 全模块原生 fetch 无缓存层；翻页/反复开详情都重拉。
- 巨型单文件（orders 1426 / requests 1252 / suppliers 968），首屏 JS 重。
- 样板正例：dashboard 的 7 路 `Promise.all` + `safe()` 容错。

### D. ⚠️ 顺带发现的功能性问题（样式先行，但这两类预警）
**安全越权**
- `ShareholderFundsService.findOne` **无归属校验**（唯一漏掉 assertOwnership 的 findById）→ 持 V 权者凭 id 可读任意公司/股东资金详情。
- `/shareholder-funds` **路由重复**注册（PaymentsController 带 SELF 隔离/脱敏 vs ShareholderFundsController 不带），实际生效哪个取决于注册顺序。
- funds `list` 无 SELF 隔离（股东只读角色可能看他人）。

**数据错算（看板假数）**
- 应付相关三处用 `status IN ('OPEN','PARTIAL')`，但实际部分付款态是 **`PARTIALLY_PAID`** → 已部分付款 AP 被整条丢弃，应付余额偏小。
- "待审批采购订单/申请" KPI **恒为 0**：dashboard 查 `PENDING_APPROVAL`/`SUBMITTED`，而 submit 实写 `PENDING`/`PENDING_APPROVAL`，值对不上。
- `init` 历史导入付款写 `EXECUTED`（非 `PAID`）→ 导入的历史付款全部不计入"已付金额/付款趋势"。
- 运单状态三方漂移（service 实写 READY/IN_TRANSIT/CUSTOMS_CLEARING；dashboard label 用 CONFIRMED/SHIPPED 等不存在值）→ 看板运单分布显示英文裸码。

---

## 四、「采购样板」定义（可复制规范）

**页面骨架（一级列表页统一结构）**
```
<PageHeader title subtitle breadcrumb actions={新建}/>     ← 唯一页头
<FilterBar>SearchInput + SelectField...</FilterBar>        ← 唯一筛选栏
[可选] <StatStripV2/> 或 KpiCardV2 网格                     ← 统计区
<Panel>                                                    ← 唯一容器
  <DataTableV3 columns rows emptyState 操作列=文字按钮/>    ← 唯一表格
  内置分页
</Panel>
```
**交互形态规则**：内容多/录入复杂（orders/requests/payments/receipts）→ **独立整页**（`/new`、`/[id]/edit`，payments 已落地）；内容少（suppliers/shipments/shareholder-funds/projects）→ 统一 `DrawerV2`。**禁**自写 fixed overlay、禁 confirm()、禁纯图标操作列、禁页面内自写 KpiCard/StatusBadge/SimpleModal。
**弹窗**：确认+备注 → `ConfirmDialogV2`；内容/选择 → `ModalV2`。
**数据层**：统一 `api-client.request()`（带 401 静默刷新）；进页 `Promise.all` 并行 + `safe()` 容错；Selector 加 module 级缓存。

---

## 五、路线图（样式先行）

**阶段 1 — 共享层下沉（地基）**
建 `procurement2/_shared/`：fmtAmt/fmtDate/inlineInput/actionLabel/actionBadgeCls/readLastScope/actBtn；收口 `getToken/hdr` → `request()`；删 3 处 `SimpleModal=ModalV2` 别名直接用 ModalV2。

**阶段 2 — 页头/筛选栏/分页统一**
receipts/shipments/shareholder-funds 补 `PageHeader`；init 的 `<h2>` 换 PageHeader；筛选栏统一 `SearchInput/SelectField`；分页统一。

**阶段 3 — 弹窗/徽章/统计卡统一**
4 套自写 overlay → `ConfirmDialogV2`/`ModalV2`；shareholder-funds 删本地 StatusBadge 用全局；init 拼色改 token；suppliers/funds/init 统计条 → `StatStripV2`。

**阶段 4 — 操作列文字化 + 表格 DataTableV3**
全列表页操作列图标→文字（复用 orders）；只读列表迁 `DataTableV3`。

**阶段 5 — 性能**
Selector module 缓存（收益最大）；全抽屉 `{open &&}` 门控；重表单 `dynamic()` 懒加载 + 拆巨型文件。

**阶段 6 — 交互升级**
orders/requests 新建/编辑由抽屉迁整页（对齐 payments）。

**另立（功能阶段，本轮不做）**：D 区安全越权 + 数据错算 + 后端 @deprecated 下线 + N+1/索引 + genNo/writeLog 收口 + 死端点清理 + prc2.constants 处置。
