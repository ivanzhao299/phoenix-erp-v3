# 门店 POS 成交未出现在销售订单页：根因分析与方案设计

> 日期：2026-09-01  
> 性质：只读分析与设计，零业务代码 / 零 schema / 零生产写入  
> 用户现象：`POS-*` 已真实成交并写入 `sal_store_sales`，但 `/sales2/orders` 不显示  
> 本文边界：给主 agent / 用户复核；实施另轮执行

## 0. 结论先行

这不是“成交失败”或列表过滤遗漏，而是两套单据模型的**设计性分离造成的可发现性缺口**：

- POS 成交的权威事实源是 `sal_store_sales`，后续沿 `sal_store_sale_items → store_sale_allocations / inv_ledger → sal_store_sale_tenders → Cash/AR → sal_store_settlements` 闭环。
- `/sales2/orders` 只调用 `/api/v2/sales/orders`，后端只查 `sal_sales_orders`；它没有查询 `sal_store_sales`。
- 全仓未发现两表之间的 view、同步、转写或聚合桥。现有唯一跨两类销售数据的代码是 traceability 的只读并列查询，不会把 POS 单写进订单表。
- V1 定稿沿用并演进 `sal_store_sales/items`，并围绕其建立 tender、allocation、shift、settlement；G4-C 更明确把“销售订单”与“门店/POS 销售”列成不同单据、不同页面。因此“不进订单链”符合已冻结领域边界；真正缺陷是销售管理入口未让用户看见完整销售事实。

推荐采用 **方案 1 + 方案 2 的分阶段组合**：先在销售管理导航和订单页横幅提供明确 POS 入口；再给订单页增加“全部 / 客户订单 / POS 成交”来源 Tab，通过新的只读 facade 做分页联合展示。POS 详情仍跳现有 `/store-pos`，不复制到 `sal_sales_orders`，不改变 settlement、Cash、AR 或库存写链。方案 3 明确否决。

## A. 事实链

### A1. POS 成交落点与 V1-2 / V1-4 链

#### 主单、明细与状态

基础 DDL 在 `apps/api/ddl/27_store_pos_tables.sql:15-100`：

| 表 | 关键字段 / 状态 | 语义 |
|---|---|---|
| `sal_store_sales` | `sale_no` 唯一；`store_code/company_code/customer_*`；`sale_type=CASH/CREDIT/MIXED`；`payment_status=UNPAID/PARTIAL/PAID`；`status` 初始为 `OPEN/COMPLETED/VOID` | 门店即时销售聚合根 |
| `sal_store_sale_items` | 商品、等级、规格、数量、单价、金额、`batch_no` | POS 销售行；`batch_no` 仅兼容首批号，不是完整多批次事实 |

后续迁移补充币种、退货字段，以及 V1-2/V1-4 末态能力：

- `1787878800000-EnforceStorePosAtomicSettlement.ts:7-42`：支付幂等键、销售仓、单店唯一 OPEN 班次、`store_sale_allocations`、退货调整表。allocation 以 `sale_id + sale_item_id + batch_id/batch_no + warehouse_code + allocated_qty/returned_qty` 保存多批次事实。
- `1788220800000-ImplementStorePosV14TenderSettlement.ts:11-126`：价格快照与 `business_date`、`sal_store_sale_tenders`、价格漂移事件、`sal_store_settlements`、settlement-shift 和 reconciliation；POSTED settlement 由数据库 trigger 禁止更新/删除。
- 当前退货流程会把销售终态从 `COMPLETED` 更新为 `RETURNED`（`store-pos.service.ts:616-720`），所以运行时状态集合已经超出基础 DDL 的早期三态；判断末态应以迁移链和写入代码为准，而不是旧 snapshot 单点。

#### 成交原子链

`StorePosService` 的实际写链为：

1. 建单只插入 `sal_store_sales` 与 `sal_store_sale_items`（`store-pos.service.ts:250-329`）。
2. 支付以 advisory lock、幂等键、sale/items/OPEN shift 行锁保护（`:332-378`）。
3. CASH、CREDIT、MIXED 均在同一事务内先 FIFO 扣库存，再写财务腿与 tender，最后用 `status='OPEN'` 条件更新为完成（`:423-583`）。
4. FIFO 仅选授权销售仓中的 `AVAILABLE`、未过期、非 legacy 批次并 `FOR UPDATE`（`:855-917`）；随后写 `store_sale_allocations` 和 `inv_ledger/FIFO_OUT`（`:927-960`）；不足直接抛错回滚（`:964-968`）。
5. Cash 写 `fin_cash_transactions`，`source_type='STORE_SALE'`、source id/no 指向 POS sale（`:983-1048`）；赊销写 `fin_ar_invoices`，同样以 `STORE_SALE` 追溯（`:1050-1094`）。
6. 退货按原 allocation 和 tender 反向；缺 allocation 不猜测回库，原 tender 置 `REVERSED`（`:616-720`）。

#### Settlement 基数

日结不是从销售订单表计算。`StoreSettlementService.build()` 直接聚合 `sal_store_sale_tenders JOIN sal_store_sales`，按 `store_code + business_date + currency` 形成 tender/cash/AR 合计（`store-settlement.service.ts:20-57`），再逐 tender 与 `fin_cash_transactions`、`fin_ar_invoices` 或 `store_payment_records` 勾稽（`:60-103`）。READY/POSTED 只表达勾稽与审核锁定，不再生成第二份 Cash/AR 流水。

因此，`sal_store_sales` 是 POS 成交、库存、财务和日结共同引用的唯一门店销售身份；销售订单表不在这条链上。

### A2. 销售订单页读取链

```text
/sales2/orders
  → GET /api/v2/sales/orders?page=&limit=20&status=&keyword=
  → SalesOrdersController.list()
  → SalesOrdersService.listOrders()
  → SELECT / COUNT FROM sal_sales_orders
```

- 页面 `apps/web/src/app/(admin)/sales2/orders/page.tsx:257-279` 只请求 `/api/v2/sales/orders`，当前 UI 仅发送 `page/status/keyword`；详情请求 `/api/v2/sales/orders/:id`（`:327-335`）。
- Controller 基址、守卫和权限为 `/api/v2/sales/orders`、JWT + MenuGuard + DataScopeGuard、`MENU_SALES2_ORDER:V`（`sales-orders.controller.ts:18-30`）。
- 列表仅从 `sal_sales_orders` 查询和计数，按 `created_at DESC` 分页（`sales-orders.service.ts:159-199`）。
- 后端完整过滤为公司 DataScope、显式 `companyCode/status/customerCode/channelCode/dateFrom/dateTo/keyword`；keyword 只匹配 `order_no/customer_name`（`:168-186`）。
- 详情先按 company DataScope 校验 ownership，再读 `sal_order_items` 和可选 `fin_ar_invoices`（`:67-80,204-220`）。
- Entity 也明确绑定 `@Entity('sal_sales_orders')`（`entities/sal-sales-order.entity.ts:20`）。

这条链不存在“漏传 POS 来源参数”的问题：API 与 service 从定义上就是 Sales Order 单表列表。

### A3. 桥接核查

全仓检索 `sal_store_sales` 与 `sal_sales_orders` / `ord_orders` 的交叉引用、`CREATE VIEW`、`INSERT INTO sal_sales_orders`、同步和 adapter，结论如下：

- **无写桥**：POS service 从不插入 `sal_sales_orders`；销售订单的独立插入点在 `sales-orders.service.ts:353`。
- **无读桥**：销售订单页面、controller、service 均不引用 POS 表或 API。
- **无数据库桥**：未发现连接两表的 view、materialized view、trigger 或 migration。
- **仅有只读并列追溯**：`traceability.service.ts:106-124,210-240` 分别查询客户订单去向和 POS 去向，再合并编号用于财务 source 查询；它不改变任何一边的数据。
- UAT dashboard 也单独统计 `sal_store_sales WHERE status='COMPLETED'`（`pilot-run-dashboard.service.ts:117-123`），未并入订单数。

判定：用户“看不到”的直接根因是**设计性分表 + 销售管理信息架构没有提供统一发现入口**。前者不是数据缺陷，后者是产品/展示缺陷。

## B. 设计意图考古

### B1. V1 定稿原文口径

`docs/ops/store-pos-workstation-v1-research-20260827.md` 没有一句字面表述“POS 单禁止进入销售订单页”，但其冻结模型和全链边界已给出等价、且更强的证据：

- §7.3 明确“`store_sales`：沿用 `sal_store_sales`”，并继续演进 `store_sale_items / store_sale_tenders / store_sale_allocations / store_returns / store_shift_closings / store_daily_settlements`（`:294-304`）。没有 `sal_sales_orders` 映射步骤。
- §7.3 成交事务从 POS Sale 直接走 price、门店仓 FIFO、allocation/ledger、Cash/AR/tender，再把 sale 标为 COMPLETED（`:306-327`）。
- §7.7 财务闭环以 `POS Sale → Sale Tenders → Cash/AR → Shift Close → Daily Settlement` 为主线（`:366-388`），而不是 Sales Order 审批/配送链。
- §11 的 12 项定稿要求每 register 班次、每门店营业日日结、多 tender、按原 allocation/tender 退货，并要求新旧 **POS** 链禁止双写（`:453-466`）。这里的“双写”指新旧 POS 引擎，不是要求把每笔 POS 再复制成 Sales Order。
- §13 最终形态再次冻结“沿用并演进 `sal_store_sales/items`”，补 tender/allocation/settlement（`:474-490`）。

结论：V1 明确把 POS Sale 作为独立聚合根，**未设计 POS→Sales Order 转写**。因此当前分离符合定稿；缺少的是统一查询体验，不是缺少写桥。

### B2. Sales V2 订单与 POS 的单据语义差异

| 维度 | Sales V2 销售订单 | Store POS 成交 |
|---|---|---|
| 业务时点 | 客户先下单，之后审批、拣配、发货、签收 | 柜台即时选货并结算，支付成功即成交 |
| 状态机 | DRAFT/提交/审批及 PICKED/LOADED/SHIPPED/RECEIVED 等履约状态 | OPEN → COMPLETED/VOID；退货追加 RETURNED 与 reversal |
| 审批 | 低价、赊销可触发 Workflow；订单持有审批标记 | V1-4 以权威价快照、tender、门店权限、日结审核约束；不套订单审批流 |
| 库存 | 由订单履约/配送状态推进 | 成交事务内门店仓 FIFO 扣减并立即落 allocation/ledger |
| 财务时点 | 文档口径为签收 `RECEIVED` 后生成 AR 并写回 `ar_invoice_id` | 支付事务即时写 Cash/AR，随后 settlement 只勾稽、不重复入账 |
| 范围 | `company_code` DataScope | StoreMembership + 门店绑定仓 ∩ WarehouseScope，详情按 sale/store 再校验 |
| 关键事实 | 客户订单、审批、履约与签收 | 小票、tender、班次、营业日、门店仓出货与日结 |

证据：

- Sales V2 架构定义 `sal_sales_orders.status=RECEIVED → AR invoice → ar_invoice_id 写回`，并定义赊销审批进入 Workflow（`docs/sales-v2-architecture.md:60-70,105-146`）。
- G4-C 将“销售订单（含销售出库状态流）”和“门店销售 / POS 销售”列为不同任务单据，分别落 `/sales2/orders` 与 `/store-pos`（`docs/g4c-sales-runtime-refactor.md:10-23`）；两边表单字段也分别审计（`:46-58,84-91`）。

把即时成交硬塞进客户订单状态机，会出现没有真实语义的审批、预计交货、拣货、装车、发货、签收字段，或大量伪造默认值。反过来，如果为了 POS 绕过这些状态，`sal_sales_orders` 同一表将承载两套互斥状态机，破坏现有订单统计与动作门禁。

## C. 方案矩阵与推荐

### C1. 方案矩阵

| 方案 | 用户体验 | 领域一致性 | 财务 / settlement | Scope / 权限 | 性能 | 结论 |
|---|---|---|---|---|---|---|
| 1. 订单页增加来源 Tab，只读聚合 POS | 在销售管理中可看完整成交；POS 徽章，点入原详情 | 保留两类聚合根，不污染写链 | 不改变权威基数；联合列表只展示，统计必须按来源分列 | 难点最大：Sales Order 是 company scope，POS 是 membership + warehouse intersection；必须取两者权限交集/并集中的**可见子集** | 两个分页源不能先全量 UNION 后前端分页；需 facade 游标/稳定排序及索引评估 | **推荐主方案** |
| 2. 不改列表，销售管理导航/横幅显式露出 POS 入口 | 最快消除“找不到”，但不能在一张列表总览 | 完全保持现状 | 零影响 | 直接复用 `MENU_STORE_POS` 与现有 scope | 零或极低新增负载 | **推荐先行落地 / 方案 1 兜底** |
| 3. POS 成交写 `sal_sales_orders` 行 | 表面统一，实际产生伪订单 | 污染订单状态机、字段与审批语义 | 极高双计风险 | 两份记录权限模型不一致，可能扩大 POS 可见范围 | 写放大、索引和报表重复 | **否决** |

### C2. 方案 1 设计约束

推荐 UI：

- `/sales2/orders` 顶部增加来源 Tab：`全部`、`客户订单`、`POS 成交`；每行必须显示来源徽章 `销售订单` / `POS`。
- 客户订单保留现有动作；POS 行严格只读，不出现提交、审批、流转、签收按钮。
- POS 行显示 `POS-*`、门店、客户/散客、成交金额、支付状态、成交状态、营业日/成交时间；点击跳转 `/store-pos?saleId=<id>&storeCode=<code>` 或等价的现有详情深链。
- `全部`只表示“当前用户在两套权限下分别可见的联合结果”，不表示拥有 `MENU_SALES2_ORDER` 即自动拥有全部 POS。

推荐 API 形态：新增只读 facade，例如 `GET /api/v2/sales/activity?source=ALL|ORDER|POS&...`，不要修改现有订单写 API，也不要让前端分别拉两页后拼接。

- `ORDER` 分支复用现有 company DataScope 和 `MENU_SALES2_ORDER:V`。
- `POS` 分支必须要求 `MENU_STORE_POS:V`，并复用 StoreScopePolicy 的 membership + 有效 SALES binding ∩ WarehouseScope 语义；不能降级为 company-only。
- 若用户只有订单权限，`ALL` 只返回订单；只有 POS 权限则只返回 POS；两者都有才合并。响应可返回 `availableSources` 供 UI 隐藏无权 Tab。
- 统一只读 DTO：`sourceType/sourceId/documentNo/companyCode/storeCode/customerCode/customerName/status/amount/currency/businessDate/occurredAt/detailHref`。主键必须是 `(sourceType, sourceId)`，禁止仅按编号或金额去重。
- 状态展示采用来源内状态 + 独立 display category，不强行把 `COMPLETED` 映射成 `RECEIVED`。例如 `documentStatus=COMPLETED`、`displayCategory=COMPLETED_SALE`。
- 稳定排序用 `(occurredAt DESC, sourceType, sourceId)`；采用 seek cursor 优于 offset。若首期仍用 offset，必须对两个源各自过取、merge 后截断，并用契约测试证明跨页不重不漏。

### C3. 四类影响评估

#### 财务对账与统计

- settlement 的唯一基数继续是 `CAPTURED sal_store_sale_tenders JOIN sal_store_sales`；联合列表不得被 settlement、Cash/AR posting 或日结 build 反向消费。
- POS 已即时生成 `fin_cash_transactions/fin_ar_invoices`。方案 1 是展示层，只能按 source 分列指标；“全部销售额”若求和可以按两个事实源相加，但订单金额的确认时点必须明确（创建、发货或签收），不得把“订单额”与“POS 已成交额”无标签混为同口径。
- Dashboard/stats 不应随列表联合而自动改口径；另立统计规格并防止同一 POS 的 Cash/AR 证据被再次计为销售。

#### DataScope

- 现有订单列表只按 `allowedCompanyCodes`；POS `resolve()` 要求显式门店、有效 membership 和有效 SALES 仓权限交集（`store-scope-policy.service.ts:85-101`），详情还执行 scoped sale lookup（`:169-181`）。
- 聚合列表不能为每行调用详情（N+1），应一次性取得当前用户可见 store codes，再以参数化 `store_code = ANY(...)` 查询；该集合生成必须复用相同 policy 的底层授权规则。
- POS 深链详情继续走 `assertSaleScoped()`；facade 只负责列表，不成为更弱的详情旁路。

#### 权限菜单

- 当前销售订单用 `MENU_SALES2_ORDER`，POS 用 `MENU_STORE_POS`，日结另用 `MENU_STORE_SETTLEMENT`。三者不得合并授权。
- 方案 1 的 facade 必须做按来源的权限裁剪；前端 Tab 只是可用性提示，不能代替后端门禁。
- 方案 2 的导航项只对 `MENU_STORE_POS:V` 用户显示；无权限用户应显示“无 POS 查看权限”而不是死链。

#### 性能

- 当前两个列表都各自执行 rows + COUNT，单页上限 200；直接在页面并发拉两份 `limit=20` 后 merge 会使总数、翻页和排序错误。
- POS 已有 `(store_code,business_date)` 与 tender sale 索引，但当前列表常用的 `status/payment_status/created_at` 未见专用复合索引。实施前用真实只读 `EXPLAIN (ANALYZE, BUFFERS)` 或 staging 等量数据验证；生产只读分析须另获执行轮授权。
- 首期必须带分页和可选日期范围；不要读取每笔 items/tenders。详情按点击加载。
- 数据量不高时 facade 可做两条受 scope 限制的查询后服务层 merge；达到高量级再评估数据库 `UNION ALL` 只读 view/物化读模型。当前不应预建同步表。

### C4. 方案 3 否决证据

方案 3 不是“多写一行”这么简单，存在五个已证实冲突：

1. **聚合根冲突**：V1 §7.3/§13 冻结沿用 `sal_store_sales/items` 并建立 tender/allocation/settlement，没有 POS→Sales Order 映射。
2. **状态机冲突**：Sales Order 承载审批、PICKED/LOADED/SHIPPED/RECEIVED；POS 付款事务直接 OPEN→COMPLETED，作废/退货按 tender/allocation 反向。
3. **财务重复**：POS 支付已写 Cash/AR；订单签收链也会生成/关联 AR。若镜像订单再被流转、报表或 adapter 消费，可能重复收入、应收或订单数。
4. **库存重复**：POS 已在成交事务内 FIFO 扣减；镜像订单若进入配送/出库动作，可能再次扣库存或制造虚假履约。
5. **权限泄露**：POS 的 store membership + warehouse scope 比订单的 company-only scope 更窄。复制到订单表会让只有公司订单权限的人看见原本无门店授权的 POS 详情。

即使增加 `source='POS'` 并在所有动作中绕过，也等于在订单表内永久维护第二套 nullable 字段、状态机和权限分支，风险高于只读 facade，且没有业务收益。因此否决。

### C5. 推荐实施拆分（另轮）

1. **P0 可发现性**：Sidebar 的销售管理组增加“门店 POS 成交”入口；订单页加说明横幅和有权限跳转。仅 UI/导航，不改数据口径。
2. **P1 只读 facade 契约**：冻结统一 DTO、来源权限裁剪、filter/status 映射、排序/分页语义与统计口径；先写 API contract tests。
3. **P2 后端联合列表**：实现 scoped facade；订单分支复用 company scope，POS 分支复用 membership/store warehouse scope；零写入、零 schema 起步。
4. **P3 前端来源 Tab**：接入 facade、来源徽章、POS 只读行和深链；保留现有订单动作逻辑只对 ORDER 开放。
5. **P4 性能与可观测性**：基于 explain 决定是否补索引；分别记录 source 查询耗时、返回量和拒绝数，不把两个业务计数混成一个无来源指标。

不建议首轮创建 view 或 migration。若 explain 证明需要索引，再以独立 TypeORM TS migration 提交并遵守 down/constraint/entity 门禁。

### C6. 测试计划（另轮）

#### API / 权限

- 仅 `MENU_SALES2_ORDER:V`：ALL 只见授权公司的 ORDER，不见 POS。
- 仅 `MENU_STORE_POS:V`：ALL/POS 只见有效 membership 且仓权限有交集的门店成交。
- 同时持两权限：只返回各自 scope 的并集；跨公司、跨门店、猜 sale id 均不可见/403。
- Admin/global：订单可全局，但 POS 仍要求真实有效 membership/binding，不因 global 绕过门店业务授权。
- 零 membership、过期 membership、无 SALES binding、无 WarehouseScope 交集全部 fail-closed。

#### 分页 / 筛选

- ORDER 与 POS 同秒发生时排序稳定；跨页无重复、无遗漏。
- `source/status/date/company/store/customer/keyword` 分别验证；不支持的跨来源状态不可静默误映射。
- total 若不能以同一快照精确计算，API 契约应返回 `hasMore` 而不是伪精确 total。

#### UI

- POS 徽章和只读动作正确；点击进入正确 sale/store 详情。
- 无 `MENU_STORE_POS` 时不显示 POS Tab/链接，直接构造 URL 仍被 API 拒绝。
- 订单的创建、提交、取消、状态流转、签收回归不受影响。

#### 财务 / 库存回归

- 打开/翻页/查看联合列表前后，`sal_store_sales`、`sal_sales_orders`、tender、Cash、AR、allocation、ledger、settlement 均零新增/零更新。
- settlement build/reconcile/post 的聚合 SQL 与基数不变；POS 成交只出现一份 tender/Cash/AR 证据。
- 订单 Dashboard 与 POS settlement 指标仍分源；任何新增“全部销售额”测试明确确认时点与去重键。

#### 验证

- API/Web `tsc --noEmit`；定向 Jest/Vitest；真 scope-audit；`git diff --check`。
- 若新增 migration，再跑 migration down、no-business-DML、nullable unique、constraint drift、entity drift 全门禁。

## D. 同类分离清单（只查不改）

以下是有代码/文档证据的同款边界；它们说明“主单与执行事实分开”是项目中的既有模式，但并不自动证明当前 POS 可发现性体验合理。

| 主单 / 执行事实 | 分离证据 | 当前桥接方式 | 对本题启示 |
|---|---|---|---|
| 采购订单 / 采购收货 | `/procurement2/orders` 调 `/api/v2/procurement/orders`；`/procurement2/receipts` 调独立 `/api/v2/procurement/receipts`（orders page `:187-188,315-316`；receipts page `:171-188`） | Receipt 持 `poId/poNo`；确认回写 PO `received_qty/status`，完收推进 shipment；PO 流程日志只读聚合 receipts（`receipts.service.ts:146-158,241-312`；`orders.service.ts:279-281`） | 执行单不复制成采购订单；用引用、状态回写和只读流程聚合连接 |
| 采购订单 / 运输单 | PO 页面只跳 `/procurement2/shipments`（orders page `:631-634,739-742`）；shipment 有独立 controller（`shipments.controller.ts:16-55`） | Shipment 持 `poId/poNo`，收货完成推进 shipment 状态 | 导航深链可以先解决发现性，列表无需混写 |
| 销售订单 / 销售退货 | 订单页只调 orders API；退货独立页面/controller/table `sal_return_orders/items`（`returns/page.tsx:19-55,89-145`；`sales-returns.controller.ts:10-100`；`return-orders.service.ts:54-118`） | Return 可引用 `salesOrderId/No`，质检后回库并生成 Credit Note（`return-orders.service.ts:179-199,436-526`） | 逆向事实保持独立，以引用和详情跳转追溯 |
| 销售配送 / 签收 | API 分为 delivery 与 `/:id/receipts`（`delivery-orders.controller.ts:33-45,83-99,143-160`） | UI 采用配送单内置签收 modal；G4-C 明确为“内嵌于其他单据” | 独立数据/API 也可选择页面内嵌，是方案 1 的近似先例 |

边界结论：项目已有“分表但通过引用、流程日志、跳转或内嵌只读展示连接”的多种模式。POS 当前缺的正是这层读侧连接，不需要破坏写侧模型。

## E. 复核结论与非目标

本轮建议主 agent 复核以下裁定：

1. 接受根因定义：设计性分离正确，信息架构缺口需要修。
2. 接受推荐：方案 2 先行，方案 1 为目标；方案 3 否决。
3. 冻结联合列表的权限语义：按来源分别授权，POS 绝不降级为 company-only。
4. 冻结财务语义：联合列表永不成为 settlement 或 posting 的输入；所有统计必须带来源和确认时点。
5. 实施另轮先做 contract / scope tests，再改 API 和 UI；本轮不实施。

本轮没有修改业务代码、数据库、权限、导航或生产数据，也没有执行生产查询。

## F. 实施记录（2026-09-01）

### F1. P0

- commit `527ac7c3`：销售管理导航将既有 POS 入口明确命名为“门店 POS 成交”；销售订单页增加两条业务链分离说明和 `MENU_STORE_POS:V` 门禁链接。
- 定向 Web 契约 2/2 通过，Web TypeScript 0 errors。

### F2. P1–P3

- 新增只读 `GET /api/v2/sales/activity`。DTO 冻结为 `sourceType/sourceId/documentNo/companyCode/storeCode/customerCode/customerName/status/displayCategory/amount/currency/businessDate/occurredAt/detailHref`；行身份固定为 `(sourceType, sourceId)`。
- 排序固定为 `(occurredAt DESC, sourceType ASC, sourceId ASC)`；两个来源分别过取 `page * limit + 1`，服务层 merge 后截断；响应返回 `hasMore`，不返回伪精确 `total`。
- ORDER 分支只读 `sal_sales_orders`，复用请求的 company DataScope。POS 分支显式按 `MENU_STORE_POS` 重新解析 DataScope，再以 StoreScopePolicy 的有效 membership、有效 SALES binding 与 WarehouseScope 交集取得一次性 store code 数组，使用参数化 `ANY($1::text[])` 查询；global/admin 不绕过 membership/binding。
- `source=ORDER|POS` 无对应实际可用来源时 API 403；`ALL` 只合并实际可用来源，`availableSources` 驱动前端隐藏 Tab。来源专属状态只命中其真实来源，直接请求不适用状态返回 400，不做 `COMPLETED → RECEIVED` 映射。
- `/sales2/orders` 已接 facade，提供“全部 / 客户订单 / POS 成交”Tab、来源徽章、POS 只读行与 `/store-pos?saleId=<id>&storeCode=<code>` 深链；所有提交/取消/流转/签收动作均以 `sourceType === 'ORDER'` 门禁。POS 详情仍调用原 `/api/v2/store-sales/:id`，重复执行完整 scope 校验。
- facade 源码契约禁止 DML，并禁止依赖 settlement、Cash/AR adapter 或库存 ledger；未修改任何业务表写链、settlement build SQL、Dashboard 统计口径或 schema。

### F3. 验证（部署前）

- API Jest 全量：76 suites / 672 tests 全通过。
- Web Vitest 全量：92 files / 483 tests 全通过。
- 新增/相关定向：SalesActivity facade 8/8；StoreScopePolicy 与 facade 合计 23/23；Web 联合列表/权限/订单动作 11/11。
- API 与 Web `tsc --noEmit`：0 errors。
- `check-constraint-drift.js`：0 new drift；`check-nullable-in-unique.js`：0 violations。
- P4 本地执行计划未伪造：当前工作区没有运行中的生产等量数据库或生产凭据，且 `docker compose` 因必填 `JWT_SECRET` 未配置而无法解析。按红线不创建猜测性索引；部署后必须以生产只读事务补充 EXPLAIN、revision、amei/权限裁剪与错误窗口证据，再决定是否独立建索引迁移。
