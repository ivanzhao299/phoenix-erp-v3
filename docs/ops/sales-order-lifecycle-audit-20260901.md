# 销售订单创建后生命周期核查与修复设计

> 日期：2026-09-01  
> 性质：分析设计轮（只查 + 设计，不含代码、迁移或生产变更）  
> 基线：`origin/main` / `abad7b852490c4e4416249a78c728c3ba92d48c9`  
> 结论状态：待主 agent 复核；复核通过后另轮实施

## 1. 结论摘要

用户观察基本成立，但要作一处重要修正：销售订单后续操作并非全部“只 UPDATE status”。

- 订单页的手工状态推进（分配库存、开始拣货、装车、发货、标记送达）本身确实只更新订单状态；只有送达额外写 `delivered_at`。提交/取消 DTO 虽有备注，服务却没有使用。
- 提交会做信用评估；低价或超信用时会启动 `ApprovalEngine` 并保存 `wf_instance_id`，无审批规则时自动批准。
- 配送创建、装车完成、发车、到达和签收各有真实后续动作：分配订单、扣减库存、推进订单、生成签收记录、最终生成 AR；移动端异常签收在资料齐全时还会自动创建退货。
- 但是这些动作散落在订单、配送、签收、库存、Workflow、AR、退货各自的表和页面中。销售订单详情只展示订单本身、信用快照和 AR，完全没有配送、签收、库存出库、退货或审批时间轴，因此用户看到的是“按钮后状态变了”，看不到业务链路。
- 没有销售订单专属状态流转历史表。订单主表只有当前状态、`created_by/created_at/updated_at`、`delivered_at/received_at`，没有每次动作的操作人、原状态、理由和来源端点。
- 全局 `AuditLogInterceptor` 并未落库；实际落库的 `OperationLogInterceptor` 又没有匹配当前销售订单的 `/transition`、`/mark-received` 和配送签收路由。因此它不能充当可靠兜底审计。
- 当前还有一项比“不可观察”更严重的正确性风险：配送签收链先把订单更新为 `RECEIVED`，再以 `try/catch` 生成 AR；AR 失败只记日志，订单仍是 `RECEIVED` 且 `ar_invoice_id` 为空，手工 `mark-received` 又只接受 `DELIVERED`，形成无正常补偿入口的半完成状态。

建议不要仅在前端拼时间轴。正确修复应以 append-only 的销售订单生命周期事件表为审计事实源，在同一业务事务中写状态与事件，再聚合 Workflow、配送/签收、库存流水、AR、退货为订单详情的“全流程时间轴”。

## 2. 核查口径与证据等级

本报告区分三类证据：

1. **当前实现事实**：以本基线 controller/service/SQL/UI 为准。
2. **正式设计意图**：以 `docs/sales-v2-architecture.md` 为边界文件；其中明确标为 Phase 路线的内容是设计，不是实现证明。
3. **历史审计/阶段报告**：`sales-v2-architecture-audit.md` 是旧系统重建前审计；`g4c-sales-runtime-refactor.md` 是主数据/字典/DataScope 改造报告，不能外推为生命周期留痕已经完成。

否定检索覆盖：`apps/api/src/modules/sales-v2` 全部 controllers/services/entities/adapters、Sales 相关冻结 SQL、`apps/api/src/database/migrations`、审批引擎、通用 Workflow、全局 audit/operation interceptors，以及 `apps/web/src/app` 下销售订单、配送、退货、移动配送、WMS 出库页面。未发现销售专属 `status_history/order_history/sal_*_audit/sal_*_log` 表、entity 或 process-log API。

## 3. A — 当前操作事实

### 3.1 订单页直接操作按钮

真实页面为 `apps/web/src/app/(admin)/sales2/orders/page.tsx`。列表和详情复用同一个 `doAction()`：提交、取消、确认签收分别调用专用端点，其余状态推进统一调用 `/transition`（`orders/page.tsx:524-545`）；列表按钮见 `:719-738`，详情按钮见 `:1329-1346`。

| 页面按钮 | 显示状态 | API → service | 实际落库/触发 | 留痕判断 |
|---|---|---|---|---|
| 提交 / 提交审批 | `DRAFT` | `POST /orders/:id/submit` → `SalesOrdersService.submit` | 写信用标志和快照；低价/超信用时 `startApproval(bizType='SALES_ORDER')`，订单写 `PENDING_APPROVAL + wf_instance_id`；无规则或无需审批则直接 `APPROVED`（`sales-orders.service.ts:516-640`） | 有 Workflow 时审批步骤另有记录；订单本身无提交人/提交时间/提交备注事件。`SubmitSalesOrderDto.remark` 未使用 |
| 分配库存 | `APPROVED` | `POST /orders/:id/transition {targetStatus:'ALLOCATED'}` → `transition` | 只更新 `status, updated_at`（`:705-732`） | 无操作者、理由、独立时间；按钮名容易让人误以为发生库存分配，实际此端点没有库存调用 |
| 开始拣货 | `ALLOCATED` | 同上，目标 `PICKED` | 只更新 `status, updated_at` | 同上 |
| 装车 | `PICKED` | 同上，目标 `LOADED` | 只更新 `status, updated_at` | 同上；与配送模块的真实装车完成/扣库存不是同一动作 |
| 发货 | `LOADED` | 同上，目标 `SHIPPED` | 只更新 `status, updated_at` | 同上；此手工端点不扣库存、不建配送、不写出库流水 |
| 标记送达 | `SHIPPED` | 同上，目标 `DELIVERED` | 更新 `status, updated_at, delivered_at` | 有时间，无操作者/理由 |
| 确认签收 | `DELIVERED` | `POST /orders/:id/mark-received` → `markReceived` | 先写 `RECEIVED + received_at`，创建 `fin_ar_invoices`，再回写 `ar_invoice_id`（`:737-795`） | AR 写 `created_by`；订单无 `received_by`、理由或事件；跨多次查询而非显式同一事务 |
| 取消订单 | `DRAFT/PENDING_APPROVAL/APPROVED`（UI） | `POST /orders/:id/cancel` → `cancel` | 写 `CANCELLED + updated_at`；若原状态 `APPROVED/ALLOCATED` 尝试释放 FIFO 预留（`:678-700`） | `CancelSalesOrderDto.remark` 未使用；无取消人/取消时间/原因事件。服务允许范围与 UI 也不完全同源 |

Controller 的完整订单直接端点见 `apps/api/src/modules/sales-v2/controllers/sales-orders.controller.ts:27-83`。页面没有“审批通过/审批拒绝”按钮；审批由 Workflow 处理，订单页虽取得 `canApprove`，但未用于订单动作。

### 3.2 Workflow 回调

- `approveCallback()` 将订单改为 `APPROVED`，随后尝试 FIFO 预留；预留失败只记 warning、不阻断审批（`sales-orders.service.ts:643-664`）。
- `rejectCallback()` 只写 `REJECTED + updated_at`（`:666-674`），没有把审批意见冗余到订单事件。
- 注册表声明 `SALES_ORDER → sal_sales_orders` 及批准/拒绝终态（`workflow-biz-registry.service.ts:198-207`），注释说回调由 `SalesOrdersService` 运行时注册，但全仓未检出回调注册代码。当前审批引擎可按注册表直接更新业务表，但 FIFO 回调是否实际执行需在实施轮用集成测试确认，不能仅凭注释认定。

### 3.3 配送链对订单的真实影响

订单页的状态按钮与配送页的真实履约动作是两套可并行推进的入口：

| 配送动作 | 配送落库 | 对销售订单/下游影响 | 证据 |
|---|---|---|---|
| 创建配送单 | 建 `sal_delivery_orders`、items | `APPROVED → ALLOCATED` | `delivery-orders.service.ts:225-269` |
| 开始装车 | `PLANNED → LOADING`，写 `loading_start_at` | 不改订单 | `:322-334` |
| 完成装车 | `LOADING → LOADED`，写 `loading_end_at` | 对每张订单尝试调用 `eggInventory.confirmOutbound` 扣减库存/写流水；异常只记 warning，配送动作仍成功；不改订单状态 | `:343-374` |
| 发车 | 配送 `DEPARTED + departure_at`，items `DELIVERED` | 关联订单批量变 `SHIPPED` | `:381-407` |
| 到达 | 配送 `ARRIVED + actual_arrival_at` | 关联订单变 `DELIVERED + delivered_at` | `:419-439` |
| 强制完成 | 配送 `ARRIVED/PARTIALLY_SIGNED → COMPLETED + completed_at` | 只检查明细后更新配送单；不创建签收记录、不推进订单、不生成 AR | `:451-472`；管理端按钮 `delivery/page.tsx:134-145` |
| 配送取消 | 配送 `CANCELLED`，items `RETURNED` | 订单 `ALLOCATED → APPROVED` | `:479-507` |
| 正常/异常签收 | 插入 `sal_receipts`，含 `signed_by/signed_at/created_by/数量/照片/remark` | 全部明细结束后配送 `COMPLETED`、订单 `RECEIVED`、创建 AR | `receipts.service.ts:51-93,100-190,197-250` |

配送动作 DTO 普遍带 `remark`，但开始/完成装车、发车、到达、完成的 service 参数命名为 `_dto` 且没有持久化；只有配送取消会将备注写回配送主表。配送本身有阶段时间戳，却没有每阶段操作人。管理端“强制完成”尤其危险：它不会进入 `ReceiptsService.checkAndCompleteDelivery()`，可形成“配送已完成、订单未 RECEIVED、没有签收单和 AR”的旁路。

移动端异常签收还有一条独有链路：`POST /api/v2/mobile/delivery/orders/:id/sign-exception` 创建异常签收；当异常数量大于 0 且客户/公司/产品资料齐全时自动创建 `DELIVERY_REJECT` 退货，失败只记 warning、不阻断签收（`mobile-delivery.controller.ts:148-202`）。管理端异常签收没有这段自动建退货逻辑，两个入口的业务语义不一致。

### 3.4 状态历史、审计、操作人、时间、理由、Workflow 记录

| 能力 | 当前是否存在 | 事实 |
|---|---|---|
| 销售订单状态历史表 | 否 | `sal_sales_orders` 只有当前 `status`、`wf_instance_id`、`ar_invoice_id`、remark、created/updated 信息；冻结基线 `20260527_sales_v2_phase0_baseline.sql:175-230` 无历史表 |
| 每次状态的操作人/时间 | 否（零散例外） | 只有 `created_by`、`delivered_at`、`received_at`；普通 transition 只有覆盖式 `updated_at` |
| 操作原因/备注事件 | 否 | submit/cancel/transition DTO 的 remark 没有使用；退货拒绝/取消和配送取消只是覆盖或拼接主表 remark，不是事件 |
| Workflow 审批记录 | 有，但仅覆盖审批阶段 | `wf_approval_instance_steps` 有 approver、action、comment、acted_at、actor（entity `:15-50`）；订单详情 API/UI 未加载展示 |
| Workflow 触发关联 | 有 | 订单保存 `wf_instance_id`；提交调用 `startApproval`（`sales-orders.service.ts:589-629`） |
| 通用审计日志 | 不能依赖 | `AuditLogInterceptor` 的 repository save 被注释，只打印 console（`audit-log.interceptor.ts:70-95`） |
| 通用操作日志 | 部分存在但销售覆盖有洞 | `OperationLogInterceptor` 实际写 `sys_operation_logs`，但订单规则只匹配 `submit/approve/reject/ship/receive/cancel`，不匹配真实 `transition/mark-received`；签收规则匹配 `/sales/receipts`，不匹配真实 `/sales/delivery/:id/receipts`（`operation-log.interceptor.ts:120-153`） |

`sys_operation_logs` 即使修好路由，也更适合作为安全/技术操作日志：当前拦截器不填 `before_data`，无法稳定回答“从什么状态变到什么状态”，更不能替代领域生命周期事件表。

### 3.5 订单详情目前能看到什么

`SalesOrdersService.findById()` 只返回订单、items 和 `ar_invoice_id` 指向的 AR（`sales-orders.service.ts:204-220`）。前端详情展示：

- 当前状态、低价/超信用/信用预警；
- 客户、渠道、总金额、是否生成 AR；
- 提交时信用快照；
- 若 AR 存在，显示 AR 单号、金额、到期日、状态；
- 订单明细和同列表相同的操作按钮（`orders/page.tsx:1150-1346`）。

详情不显示：

- Workflow 实例、步骤、审批人、意见、时间；
- 配送单号、司机、车辆、路线及配送时间轴；
- 签收单号、签收人、异常、照片、备注；
- 库存预留/扣减流水或业务出库证据；
- 关联退货、质检、回库及 Credit Note；
- 任何订单状态变更人、变更原因和来源端点。

这些数据并非都不存在，而是分散在独立页面。配送详情可看到配送时间轴和订单号文本（其时间轴未展示已有的 `loading_end_at`）；退货详情可看到 `sales_order_no` 和 Credit Note；终端 WMS 出库页按订单号工作，但订单详情没有反向入口或链接。

## 4. B — 设计意图考古

### 4.1 Sales V2 正式架构意图

`docs/sales-v2-architecture.md` 自称正式架构边界文件（`:1-5`），关键原意如下：

- Sales V2 管订单/配送/退货；AR 发票生成与核销归 Finance V2，审批引擎归 Workflow 2.0（`:9-33`）。
- 旧 `RECEIVED → fin_transactions` 被废弃；目标是订单到 `RECEIVED` 后创建 `fin_ar_invoices` 并回写 `ar_invoice_id`（`:37-71`）。
- AR 路线明确为“销售订单签收（status → RECEIVED）→ Sales V2 Order Service → Finance V2 AR → 财务核销”（`:98-119`）。
- 赊销审批应写 `wf_instance_id`；价格、赊销、退货、价格册均规划为 Workflow 业务类型（`:129-147`）。
- 配送设计要求正式订单关联和装车/发车/到达/签收时间戳（`:199-224`）。

必须注意：该文档版本是 Phase 0；Phase 1–9 在路线总览中当时尚未标完成（`:248-261`），因此上述内容是正式目标，不是当前实现证据。

### 4.2 历史架构审计中的生命周期要求

`docs/sales-v2-architecture-audit.md` 是 2026-05-26、基准 commit `4c693bd` 的旧架构审计，不能用其“当前”描述覆盖本次代码事实，但其重建设计可说明原始意图：

- 保留 11 态订单状态机设计（`:203-218`）。
- Phase 3 目标为订单 Runtime、Workflow、AR 修复，订单 `RECEIVED` 时调用 `createFromSalesOrder()`（`:705-728`）。
- 低价与赊销均要求 Workflow 可查审批记录；低价记录要包含具体产品、实际价、底价和差额（`:867-880`）。
- 退货审批后创建负金额 Credit Note 并核销（`:882-888`）。

该文档内部对 AR 时点有矛盾：正文一处建议 `SHIPPED` 同事务创建，紧接着又基于鸡蛋行业建议 `RECEIVED` 创建（`:837-845`）。正式边界文档和当前实现都采用 `RECEIVED`，本方案以签收为唯一业务时点，不再保留双口径。

### 4.3 G4-C 实际覆盖与未覆盖

`docs/g4c-sales-runtime-refactor.md` 的目标是主数据、SKU、附件/字典和 DataScope（`:1-6`）。它将八类销售单据列为“改造”，其中“销售出库”由订单状态流承载，“签收单”内嵌配送 modal（`:10-23`）。实际完成的是：

- 公司/客户/渠道/司机/车辆/SKU Selector；
- 订单/退货商品 SKU 化和自动带出；
- 销售枚举字典化；
- 客户建档下沉主数据中心；
- DataScope 和裸字段治理。

它没有声称建立订单状态历史、process-log、跨单据详情聚合或 WorkflowTimeline。报告还明确订单/退货合同与照片缺独立 schema，留待后续（`:159-163`）。所以 G4-C 的“8 类单据 100% 覆盖”是字段治理口径，不是生命周期可观察性验收。

### 4.4 与其他单据的既有模式对比

| 单据 | 已有模式 | 关键实现 | 销售订单现状 |
|---|---|---|---|
| 采购订单 | `GET /orders/:id/process-log` 聚合 PR、PO、多张收货、付款以及 `prc2_approvals`，统一返回 `time/docType/docNo/action/operator/comment` | `procurement-v2/services/orders.service.ts:270-318`；UI `procurement2/orders/page.tsx:840-855` | 无 process-log endpoint，无跨单据 timeline |
| 补货 | 用各阶段时间戳生成创建→提交→审批→发运→收货→关闭时间轴 | `store/replenish/page.tsx:1384-1401` | 订单只有 created/delivered/received，无法覆盖所有状态，更无操作人 |
| Workflow | 复用 `WorkflowTimeline` 展示步骤、审批人、时间、结果、意见 | `components/design-system/timeline/WorkflowTimeline.tsx:5-46` | `wf_instance_id` 已有，但详情未查询/渲染 |
| WMS 调拨 | 生命周期写 `dispatched_at/by`、`received_at/by`、`completed_at` | `wms.service.ts:1688-1857`；迁移 `1787965200000-UpgradeWmsTransferLifecycle.ts:7-18` | 销售配送有时间戳但缺阶段操作人；销售订单普通状态连专用时间戳也没有 |

结论：销售订单独缺的不是“状态机”，而是统一领域事件、跨单据聚合 API 和详情时间轴。采购 process-log 的聚合返回结构与 WorkflowTimeline 的审批展示模式可直接借鉴，但销售应先补可靠数据源，不能只从当前状态反推历史。

## 5. C — 设计要求与实现差距矩阵

| 维度 | 设计出处 | 当前实现（file:line） | 缺口与影响 |
|---|---|---|---|
| 订单状态机 | 架构审计 `:203-218`；Phase 3 `:705-728` | 白名单推进 `sales-orders.service.ts:20-29,705-732` | 状态机存在，但事件历史缺失；无法追溯谁在何时推进，审计/问责不足 |
| 提交留痕 | Workflow 审批应可查；正式架构 `:129-147` | submit 写快照/当前状态，忽略 DTO remark（`:516-640`） | 无提交人、提交时间、提交说明；无规则自动批准也没有可见审批/系统决策事件 |
| 低价/赊销审批 | 架构审计 `:867-880`；正式架构 `:129-147` | `startApproval('SALES_ORDER')` + `wf_instance_id`（`:589-629`） | 两种触发合并为一个 bizType；详情不展示步骤/意见；回调绑定存在待验证疑点，合规证据链不完整 |
| 审批通过/拒绝 | Workflow 负责审批，订单接收结果 | 只更新当前状态；拒绝不冗余理由（`:645-674`） | 订单领域无法独立解释变化；审批库可查但 UI 不可见；库存预留失败不阻断会产生“已批未预留” |
| 手工分配/拣货/装车/发货 | 状态机 + 库存/配送集成路线 | `/transition` 只 UPDATE status（`:705-732`） | 按钮名称暗示业务动作但未校验或生成对应实物凭证；可绕过配送链，追溯与库存一致性风险 |
| 配送履约 | 正式架构 `:199-224` | 配送有正式关联/时间戳，并推进订单（`delivery-orders.service.ts:225-507`） | 订单详情不展示；配送阶段大多无 operator；订单手工状态与配送状态可能分叉 |
| 出库 | 架构审计库存路线 `:919-928` | 配送完成装车调用 `confirmOutbound`；订单“发货”按钮不扣库存（`delivery-orders.service.ts:343-371` vs `sales-orders.service.ts:705-732`） | 同名/近义动作存在旁路；合规出库证据不在订单详情，库存对账困难 |
| 签收 | 正式架构 AR 路线 `:98-119` | `sal_receipts` 有签收人/时间/照片/备注；全部签收触发订单 RECEIVED（`receipts.service.ts:51-190`） | 订单详情不显示签收记录；订单直接签收可绕过 `sal_receipts`，两条入口证据质量不同 |
| 配送强制完成 | 设计要求签收形成正式记录并触发 AR | `complete()` 只更新配送主表为 COMPLETED（`delivery-orders.service.ts:451-472`） | 可绕过签收、订单 RECEIVED 和 AR；履约状态虚假闭合，财务漏记风险 |
| 签收生成 AR | 正式架构 `:37-71,98-119` | 手工签收创建 AR；配送签收也创建 AR（`sales-orders.service.ts:737-795`; `receipts.service.ts:197-250`） | 配送链 AR 失败被吞且状态已提交；非原子、无 outbox/补偿/显式失败事件，财务对账高风险 |
| 取消 | 状态机允许终止 | 写 `CANCELLED`，部分状态释放预留，忽略取消备注（`sales-orders.service.ts:678-700`） | 无取消原因/操作者；Workflow 是否同步取消不可见；库存释放失败只记日志 |
| 退货 | 架构审计 `:882-888`；正式边界 Sales 管退货 | 独立退货 Runtime，关联 `sales_order_id/no`，完成后 Credit Note；移动异常签收可自动建退货 | 订单详情没有反向查询；管理端/移动端异常签收语义不一致；原订单看不到冲销结果 |
| 全局审计 | 企业审计基本要求 | Audit 不落库；OperationLog 路由漏配（interceptors 见 §3.4） | 技术审计兜底失效；安全调查、合规取证和问题定位不可靠 |
| 跨单据观察 | 采购已有 process-log 模式 | 订单详情仅 items + AR（`sales-orders.service.ts:204-220`） | 业务人员必须在多个页面人工搜索单号；履约、库存、AR、退货无法一屏对账 |

## 6. D — 修复方案（供复核）

### 6.1 设计原则

1. **一个动作，一个不可变事件**：任何订单状态变化必须和业务更新在同一数据库事务内追加事件；禁止只覆盖 `status`。
2. **事件记录事实，不反推历史**：旧订单可以生成一个明确标记为 `MIGRATED_SNAPSHOT` 的基线事件，但不得用 `updated_at` 伪造每一阶段时间。
3. **领域事件与安全日志分层**：生命周期事件面向业务追溯；`sys_operation_logs` 面向安全审计，两者都要写，不能互相替代。
4. **只有履约服务能推进履约状态**：移除或限制订单页对 `ALLOCATED/PICKED/LOADED/SHIPPED/DELIVERED/RECEIVED` 的裸推进；如保留人工纠偏，必须独立 `MANUAL_OVERRIDE` 权限、必填原因并记录前后状态。
5. **状态 + AR 要么一起成功，要么显式待补偿**：推荐同事务完成；若跨边界无法同事务，则用 outbox + 可重试状态，不允许吞异常后静默完成。

### 6.2 状态流转历史表

建议新表 `sal_order_lifecycle_events`（命名可在实施轮最终确认）：

| 字段 | 类型/约束 | 含义 |
|---|---|---|
| `id` | bigint PK | 事件 ID |
| `event_id` | uuid/唯一非空 | 幂等键，重试不得重复写事件 |
| `sales_order_id` | bigint NOT NULL + FK | 订单 ID |
| `order_no` | varchar NOT NULL | 便于审计与归档查询 |
| `event_type` | varchar NOT NULL | `CREATED/SUBMITTED/APPROVAL_STARTED/APPROVED/REJECTED/STATUS_TRANSITION/CANCELLED/INVENTORY_RESERVED/OUTBOUND_CONFIRMED/DELIVERY_*/RECEIPT_*/AR_*/RETURN_* / MANUAL_OVERRIDE` |
| `from_status` | varchar nullable | 动作前状态；非状态事件可空 |
| `to_status` | varchar nullable | 动作后状态 |
| `actor_user_id` | varchar nullable | 系统事件允许空，但必须有 `actor_type` |
| `actor_name` | varchar nullable | 当时显示名快照 |
| `actor_type` | varchar NOT NULL | `USER/WORKFLOW/SYSTEM/MOBILE/INTEGRATION` |
| `reason_code` | varchar nullable | 受控字典；取消/拒绝/人工纠偏必填 |
| `comment` | text nullable | 补充说明；取消/拒绝/人工纠偏必填 |
| `source_endpoint` | varchar nullable | 例如 `/api/v2/sales/orders/:id/transition` |
| `source_module` | varchar NOT NULL | `SALES_ORDER/WORKFLOW/DELIVERY/WMS/FINANCE_AR/RETURN` |
| `source_ref_type/id/no` | varchar nullable | 关联 Workflow、配送、签收、库存流水、AR、退货单 |
| `request_id` | varchar nullable | 串联应用日志/网关日志 |
| `metadata` | jsonb NOT NULL default `{}` | 数量、异常类型、审批触发条件等非核心快照；不得存敏感全文 |
| `occurred_at` | timestamptz NOT NULL default NOW() | 业务发生时间 |
| `created_at` | timestamptz NOT NULL default NOW() | 入库时间 |

索引/约束：`UNIQUE(event_id)`；`(sales_order_id, occurred_at, id)`；`(source_ref_type, source_ref_id)`；`(order_no, occurred_at)`。表为 append-only，应用账号不授予 UPDATE/DELETE；修正使用 `CORRECTION` 事件而非改历史。新 schema 必须走 `apps/api/src/database/migrations/*.ts` TypeORM 迁移并提供 `down()`，不得写冻结 SQL 目录。

建议由一个 `SalesOrderLifecycleService.appendEvent(manager, event)` 统一写入，所有状态更新使用同一 `EntityManager/QueryRunner`。更新语句带乐观条件 `WHERE id=$id AND status=$from`，防止并发双击/配送与手工动作互相覆盖。

### 6.3 Workflow 衔接记录

- 订单提交时写 `SUBMITTED`；若触发审批，再写 `APPROVAL_STARTED`，metadata 记录 `belowFloorPrice/overCredit` 和 Workflow instance ID，但信用金额只存必要审计字段。
- 不再声称创建两个虚构实例。当前实现是单个 `SALES_ORDER` Workflow；若业务需要赊销与低价分别由不同审批链处理，实施前先决定：一个实例包含双触发原因，或两个子流程聚合。默认建议一个实例 + 明确 trigger codes，避免并行审批竞态。
- Workflow approve/reject 必须通过确定注册的业务回调写订单状态和生命周期事件；回调需集成测试证明实际被调用。拒绝事件引用 step/action ID 和意见，不复制敏感审批表单全文。
- 订单详情 process-log 聚合 `wf_approval_instances/steps`，以现有 `WorkflowTimeline` 展示审批人、动作、意见和时间；无规则自动批准也写 `AUTO_APPROVED_NO_RULE` 系统事件。
- Workflow 撤回/取消与订单取消要定义双向规则：`PENDING_APPROVAL` 订单取消时同步取消未完成实例，并写两端关联事件。

### 6.4 详情页时间轴与关联可观察性

新增只读端点：

`GET /api/v2/sales/orders/:id/process-log`

返回建议：

```json
{
  "orderNo": "SO-...",
  "currentStatus": "RECEIVED",
  "documents": [
    { "type": "DELIVERY", "id": "...", "no": "DEL-...", "href": "/sales2/delivery?..." },
    { "type": "RECEIPT", "id": "...", "no": "RC-..." },
    { "type": "AR", "id": "...", "no": "AR-...", "href": "/finance2/ar?..." },
    { "type": "RETURN", "id": "...", "no": "SR-...", "href": "/sales2/returns?..." }
  ],
  "timeline": [
    { "id": "...", "time": "...", "docType": "销售订单", "docNo": "SO-...", "action": "提交审批", "operator": "...", "fromStatus": "DRAFT", "toStatus": "PENDING_APPROVAL", "comment": "...", "source": "WORKFLOW" }
  ],
  "warnings": []
}
```

聚合范围：

- 生命周期事件表（权威状态/动作历史）；
- `wf_instance_id` 对应审批步骤；
- `sal_delivery_order_items.sales_order_id` 对应全部配送单；
- `sal_receipts.sales_order_id` 对应全部签收；
- `inv_ledger.ref_no`/明确 source ref 对应预留与正式出库（实施时优先补结构化 source ID，避免只靠文本单号）；
- `fin_ar_invoices.source_type/source_id` 及 `ar_invoice_id`；
- `sal_return_orders.sales_order_id` 和其 `credit_note_id`。

UI 在订单详情增加：

1. 顶部“链路健康”摘要：审批、库存、配送、签收、AR、退货各自状态；异常如“RECEIVED 但未生成 AR”飘红。
2. “关联单据”卡片：配送/签收/AR/退货可点击跳转；不能只显示单号文本。
3. “全流程日志”时间轴：对齐采购 process-log 的跨单据样式；审批段复用 `WorkflowTimeline` 的结果/意见语义。
4. 事件来源标签：人工、Workflow、配送、移动端、系统补偿，明确谁推动了订单。
5. 原因/备注在动作弹窗中采集：提交可选；取消、拒绝、人工纠偏必填。危险动作二次确认。

### 6.5 签收 → AR、配送/退货关联的正确性

优先方案：订单置 `RECEIVED`、追加 `RECEIPT_COMPLETED`/`AR_CREATED` 事件、创建 AR、回写 `ar_invoice_id` 使用同一数据库事务。当前 Sales 与 AR 都在同一 PostgreSQL，adapter 应接受 transaction manager，避免三段独立提交。

如果架构边界要求异步：

- 签收事务写订单 `AR_PENDING`（建议独立集成状态字段，不污染订单业务状态）和 outbox event；
- worker 幂等创建 AR，以 `(source_type='SALES_ORDER', source_id)` 唯一约束防重；
- 成功写 `AR_CREATED`，失败写 `AR_FAILED` + 可重试错误摘要并告警；
- 订单详情明确显示“签收完成，应收生成失败/待重试”，提供受权补偿动作；不得 catch 后只记应用日志。

异常签收自动退货应下沉到同一领域服务，使管理端和移动端行为一致；创建成功/失败均写事件，并在订单详情展示。退货完成后显示回库/损耗数量与 Credit Note，不把原订单状态倒退。

### 6.6 权限与审计红线

- 普通履约操作沿用 `MENU_SALES2_ORDER:E`/配送相应权限；审批只能由 Workflow 当前任务授权人执行，不能因订单页拥有编辑权限而出现审批按钮。
- `MANUAL_OVERRIDE`、AR 重试、历史修正需独立高危权限，默认仅销售主管/财务主管；必须强制原因、二次确认、request ID 和双日志。
- process-log 读取沿用订单 DataScope，并对聚合出的 Finance/Workflow/Delivery/Return 再做同公司范围校验，禁止通过关联 ID 越权读取。
- 事件不可编辑删除；敏感信用、客户信息不写入 metadata 全量快照；日志导出遵守数据范围。
- 同步修正 `OperationLogInterceptor` 真实路由及动作映射，并补 before/after 状态；同时恢复或正式移除假落库的 `AuditLogInterceptor`，避免“看起来有审计”的假安全感。
- 禁止继续保留“失败只 warning、不阻断”用于库存预留、库存释放、AR、退货自动创建等关键一致性动作；每一项必须事务回滚或进入可观察、可重试的补偿状态。

## 7. 实施拆分（下一轮，不在本轮执行）

### P0 — 审计事实源与状态入口收口

1. TypeORM TS 迁移创建 `sal_order_lifecycle_events`、约束和索引。
2. 新建生命周期 service；create/submit/approval/cancel/transition/mark-received 统一事务写事件。
3. 配送、签收、库存、AR、退货调用处追加关联事件。
4. 修复 Workflow 回调注册并用集成测试证明；修复 OperationLog 路由。
5. 禁止普通 `/transition` 伪装成库存/装车/发货；保留的人工纠偏改为独立权限和必填原因。
6. 移除或重定义配送“强制完成”：不得在缺少终态签收明细时闭合；例外闭合必须生成异常签收/退货或受控 override 事件。

### P1 — 事务一致性与补偿

1. 将签收→RECEIVED→AR 改为同事务；或实现 outbox + `AR_PENDING/FAILED` 补偿。
2. 对 AR source 建数据库幂等唯一约束；修复存量 `RECEIVED + ar_invoice_id IS NULL` 的只读审计脚本和经审批的数据修复方案。
3. 统一管理端/移动端异常签收→退货语义。
4. 将关键库存预留/释放失败改为显式业务结果，不再仅 warning。
5. 增加“配送 COMPLETED 但订单非 RECEIVED/无签收/无 AR”的存量只读核查与补偿设计。

### P2 — Process-log API 与详情 UI

1. 新增 DataScope 安全的 `/:id/process-log` 聚合 API。
2. 订单详情增加链路健康、关联单据和全流程时间轴。
3. 复用采购时间轴结构和 WorkflowTimeline；为配送、签收、AR、退货提供深链。
4. 为历史订单展示 `MIGRATED_SNAPSHOT`，明确“此前无细粒度历史”。

### P3 — 运行监控与治理

1. 指标/告警：`RECEIVED without AR`、配送完成但订单非 RECEIVED、AR source 重复、Workflow pending 但订单非 PENDING、订单 SHIPPED 无库存出库流水。
2. 对事件覆盖率做 CI/集成门禁：所有允许改变 `sal_sales_orders.status` 的 SQL 必须通过统一 service 或明确 allowlist。
3. 报表/导出支持按订单重放完整证据链。

## 8. 测试计划

### 单元测试

- 状态白名单、终态拒绝、乐观条件并发冲突。
- 每个动作生成准确 `from/to/actor/reason/source` 事件；取消/拒绝/override 无原因必须拒绝。
- process-log 排序、重复事件幂等、关联单据去重、DataScope 过滤。
- OperationLog 路由覆盖 `/submit`、`/cancel`、`/transition`、`/mark-received`、配送正常/异常签收、移动签收。

### API/数据库集成测试

- 无审批订单：DRAFT → 自动 APPROVED，同时有 SUBMITTED + AUTO_APPROVED 事件。
- 低价、超信用、双触发：创建 Workflow、展示触发原因；审批通过/拒绝回调真实执行并写事件/意见。
- 配送全链：创建→装车→扣库存→发车→到达→签收→订单 RECEIVED→AR，逐步校验状态、ledger、事件、actor、关联键。
- AR 注入失败：同事务方案应全部回滚；异步方案应进入 `AR_FAILED` 且可幂等重试，不得静默 RECEIVED 无 AR。
- 异常/部分签收、多配送单、多签收单、自动退货、回库/损耗、Credit Note 全链聚合。
- 并发双击签收、配送签收与订单人工签收并发，只生成一张 AR 和一套终态事件。
- 取消审批中订单：Workflow、库存预留、订单状态和事件一致。

### 前端测试

- 各状态按钮与权限矩阵；普通用户看不到审批/override/AR 重试。
- 时间轴空态、历史快照、加载失败、超长备注、时区和事件稳定排序。
- 关联配送/签收/AR/退货深链可达且不泄露越权数据。
- 红色健康告警覆盖 `RECEIVED 无 AR`、`SHIPPED 无出库`、审批状态分叉。

### 回归与验收

- API/Web `tsc --noEmit`、相关 Vitest/Jest、真实 scope-audit。
- 迁移 `up/down/up`、entity↔DB drift、nullable unique、constraint drift 门禁。
- 只读存量一致性查询记录基线；生产迁移和存量修复另行审批，不在实现代码合并时自动执行破坏性数据修复。

## 9. 复核决策点

实施前需由主 agent/业务方确认四项：

1. 订单页是否彻底移除“分配库存/拣货/装车/发货/送达”的裸状态按钮，只允许配送/WMS 推进；本报告建议移除，另设受控人工纠偏。
2. 低价与赊销审批采用一个 `SALES_ORDER` 实例记录双触发原因，还是拆成两个流程；本报告建议单实例、多 trigger code。
3. 签收生成 AR 采用同库强事务还是 outbox；当前部署条件优先同事务。
4. 管理端异常签收是否与移动端一致自动建退货；本报告建议统一领域服务、按同一规则执行。

在上述复核完成前，本轮不创建迁移、不改 service/UI、不执行生产写入。

## 10. 实施执行记录（2026-09-01）

本轮按主 agent 复核结论实施：保留单个 `SALES_ORDER` Workflow 实例并记录多触发原因；签收到 AR 采用同库强事务；订单页移除裸履约推进；人工纠偏使用独立 `MENU_SALES2_ORDER_OVERRIDE:A`。

### 10.1 已完成

- 新增 TypeORM 迁移 `1788253200000-AddSalesOrderLifecycleEvents.ts`：创建 `sal_order_lifecycle_events`、唯一键/索引/FK/actor CHECK、数据库级 UPDATE/DELETE 拒绝触发器、AR Sales source 幂等唯一索引，以及旧订单 `MIGRATED_SNAPSHOT` 基线事件。
- 新增 `SalesOrderLifecycleService`，统一追加事件、带 `WHERE id/status` 的乐观状态更新和 process-log 聚合。
- 建单、提交、无规则自动批准、Workflow 批准/拒绝、取消、人工纠偏、直接签收、配送创建/发车/到达/取消、签收、库存出库和退货创建均写关联事件。
- Workflow `SALES_ORDER` 在 application bootstrap 确定注册真实 approve/reject callback；库存预留失败回滚审批事务，不再 warning 后继续。
- `RECEIVED + lifecycle event + AR insert + ar_invoice_id` 使用同一 `EntityManager`；AR 失败整笔回滚。配送签收复用同一入口，删除原先的第二套非原子实现。
- 普通 `/transition` 正式禁用履约伪动作；新增 `/manual-override`，独立 A 权限、必填原因、前后状态事件。
- 配送完成要求每条明细同时具备终态状态和 `receipt_id`；人工例外闭合需配送 A 权限、必填原因并写 `DELIVERY_COMPLETED_OVERRIDE`。
- OperationLog 路由已对齐 `transition/mark-received/manual-override`、真实配送签收、价格和库存路由，并在动作前读取订单 status/AR，写入 `before_data`；伪落库 `AuditLogInterceptor` 已从全局注册正式移除，领域事件 + `sys_operation_logs` 为支持的双日志层。
- 新增 DataScope 安全的 `GET /api/v2/sales/orders/:id/process-log`，聚合事件、Workflow、配送、签收、库存流水、AR、退货；关联 Finance/Delivery/Return 再校验同公司。
- 订单详情新增链路健康、RECEIVED 无 AR 红色告警、可点击关联单据、来源标签、跨单据时间轴、WorkflowTimeline 审批段和取消原因二次确认；裸分配/拣货/装车/发货/送达按钮已移除。

### 10.2 验证结果

- API `tsc --noEmit`：PASS。
- Web `tsc --noEmit`：PASS。
- API Jest 全量：79 suites / 690 tests PASS。
- Web Vitest 全量：94 files / 498 tests PASS；其中订单详情采用 jsdom + React `createRoot` 真实渲染和真实 DOM 交互断言，不以源码字符串代替渲染验收。
- 生命周期红线定向测试：append-only trigger、事件写入、乐观并发冲突、Workflow 回调注册、AR 失败事务回滚、process-log 越权拒绝、MANUAL_OVERRIDE A 权限、强制完成缺签收拒绝全部 PASS。
- 治理门禁：nullable unique、constraint drift、entity drift、TS migration down、migration no-data-DML 均 PASS。
- 冻结/安全边界逐文件复核后，显式 `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true` 的 W5 closeout 20/20 PASS；PR 登记 `reviewed-frozen-boundary` 与 `reviewed-security-touch` 触发受控复验。
- 真 scope-audit：销售订单页主数据输入仅命中 `CompanySelector/CustomerSelector/ChannelSelector/SkuSelector`；`productCode/gradeCode` 裸 input 均为 readOnly；可写 `e.target.value` 仅搜索词、数量/价格和危险动作原因。
- 本机迁移重放未执行：`scripts/local-migration-check.sh` 在创建隔离测试库前因环境缺少 `createdb` 命令停止，未触碰任何现有数据库。CI 的 PostgreSQL migration job 作为真实 up/down/up 门禁。

### 10.3 部署后只读复验口径

部署 revision 确认后只读核验：旧订单均有且仅有一个 `MIGRATED_SNAPSHOT`；新订单按真实动作产生 `CREATED/SUBMITTED/...` 事件；事件 UPDATE/DELETE 被触发器拒绝；`RECEIVED` 订单存在唯一 Sales source AR 且回写一致；process-log 不跨公司并正确展示 Workflow、配送、签收、库存、AR 和退货。

### 10.4 合并、部署与生产只读证据

- 实现 PR `#155` 已合并，main merge revision 为 `da4920c4185258d6da7b14383bfc24b16610d558`。
- 显式批准的 full production workflow run `33492095257` 成功；部署日志确认 checkout target 为该 revision，API/Web 容器重建完成，Web smoke PASS。
- 部署前数据库备份已生成；TypeORM 在单个事务内执行 `AddSalesOrderLifecycleEvents1788253200000`，写入 migrations 记录并 COMMIT。日志明确显示 `MIGRATED_SNAPSHOT` 基线 INSERT、append-only trigger、索引和权限 SQL 均已进入已提交迁移。
- 2026-09-01 17:34（Asia/Singapore）公网 `GET https://erp.eggslao.com/api/health` 返回 `status=OK`、`env=production`、`db.connected=true`、`jwt_fallback_in_use=false`；`boot_at=2026-09-01T09:31:40.295Z` 位于本次部署窗口。
- 未认证请求 `GET /api/v2/sales/orders/1/process-log` 返回 401，未暴露订单链路数据。
- 当前执行环境没有生产只读业务 JWT/数据库只读凭据，因此未伪造旧订单事件计数、新订单全流程样本或 DataScope 跨公司实测结果；且按生产写入红线未为验收制造订单。10.3 中的数据级验收项保留为待具备受控只读身份后执行，现阶段结论限定为：revision/迁移提交/运行健康/匿名访问门禁已通过。
