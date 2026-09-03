# 销售订单批准后与库存管理关联链路核查（2026-09-03）

> 性质：核查轮，只读代码、文档、测试与生产审计入口；未改业务代码、schema 或生产数据。  
> 状态：三期方案已获用户批准；第 0 批生产只读摸底已执行，后续实施按独立 PR 推进。

## 结论摘要

订单批准后不是“直接签收才扣库存”，而是两阶段记账：订单进入 `APPROVED` 时做硬预留，FIFO 扣 `inv_batches.qty_available` 并写负数 `RESERVED`；配送完成装车时再扣物理 `inv_batches.qty` 并写负数 `FIFO_OUT`。签收本身不再扣库存。

这条主干已经实现，并有真实 PostgreSQL 集成测试证明“最终审批 → 两批次预留 → 完成装车 → FIFO_OUT”。但不能判定为完全实现，至少存在以下 P0/P1 缺口：

1. 多批次分配只保存逗号分隔批次号和总分配量，未保存每批数量；出库与取消释放均按批次数均分并 `Math.round()`，可多扣、少扣或多释放。
2. `finishLoading` 的出库异常吞错已修：当前无 catch，异常会回滚并阻断装车完成；但并发重复调用的状态 CAS 不检查影响行数，仍可能重复扣物理库存。
3. 一张订单可重复创建配送单，且没有部分配送的分配/已出库量模型；首次装车后、发车前存在重复出库窗口。
4. 签收短收/异常只记录差异，不自动回冲已出库库存；移动端仅在资料齐全时另建退货，管理端没有同等逻辑。
5. Sales V2 没有履约仓字段，批准时按公司全仓 FIFO，未过滤仓类型、门店归属或 `allowedWarehouseCodes`；因此理论上会与 POS 争用同公司门店仓。
6. 取消释放和退货回库路径存在，但取消释放有同一多批次均分缺陷；退货回库未指定真实仓/库位，且强制完成可绕过回库。
7. 预留本身有 advisory lock、`FOR UPDATE` 和条件更新，不会轻易写出负 `qty_available`；审批期间故意不锁库存，POS 可先售出，最终审批可能因库存不足整体失败。

因此回答用户问题：**库存是在批准时锁定可用量、完成装车时减少物理量；原设计的两阶段库存语义已落地，但履约仓、逐批分配、部分配送、异常差异和幂等闭环尚未完成，整体不是“完全实现”。**

## A. 设计方案考古

### A1. 正式边界与状态口径

`docs/sales-v2-architecture.md:1-30` 将订单、配送、退货归 Sales V2，审批归 Workflow 2.0，AR 归 Finance V2。历史架构审计设计的订单状态链为：

```text
DRAFT → APPROVED → ALLOCATED → PICKED → LOADED → SHIPPED
      → DELIVERED → RECEIVED → RECONCILED
```

取消/拒绝为终止分支（`docs/sales-v2-architecture-audit.md:203-218`）。该文档是早期目标，不应单独作为实现证明。

后续运行时报告把库存语义收敛为：

- 草稿、审批中不占库存；订单实际进入 `APPROVED` 时硬预留。
- 免审订单在提交事务内批准并预留；需审批订单在最后一步审批回调中预留。
- 预留只减 `qty_available`；完成装车再减 `qty`。
- `APPROVED/ALLOCATED` 取消时释放预留。
- 可再售退货回库，破损退货只记损耗。

出处：`docs/ops/sales-order-submit-inventory-shortage-audit-20260903.md:18-65,110-135`、`docs/production-runtime-rebuild-phase-r4-sales-runtime-audit.md:43-93`。

### A2. 履约仓设计口径

现有正式模型没有订单履约仓。历史核查已经提出：若业务要求指定履约仓，应在订单/配送模型显式保存仓库，再作为 FIFO 参数并校验 WarehouseScope；不能隐式使用审批人的个人 WarehouseScope，否则同一订单会因审批人不同得到不同库存结果（`docs/ops/sales-order-submit-inventory-shortage-audit-20260903.md:124-135`）。

门店仓的目标边界是“场站成品仓 → 调拨 → 门店仓上架 → POS 从门店 SALES 仓出库”，门店不应直接消费场站仓（`docs/ops/store-org-and-warehouse-model-review-20260827.md:3-18`）。当前 Sales V2 公司全仓 FIFO 与该边界没有技术隔离。

### A3. 设计演进

旧审计曾记录销售单提交不预留、`ALLOCATED` 才扣减，形成超卖窗口；当前实现已演进为 `APPROVED` 硬预留、装车物理出库。订单页通用 `/transition` 旁路也已收口为拒绝调用（`sales-orders.service.ts:851-855`）。因此本报告以当前代码为事实源，不沿用历史报告中“装车异常只 warning”的旧结论。

## B. 全链路实现核查

### B1. 批准 → 预留

| 环节 | 当前实现 | 证据 | 判断 |
|---|---|---|---|
| 免审提交 | `DRAFT → APPROVED` 后同事务调用 `reserveInventory` | `sales-orders.service.ts:731-744` | 已实现 |
| 最终审批 | Approval Engine 最后一步同事务调用 registry `onApproved`；销售回调预留 | `approval-engine.service.ts:657-671`; `sales-orders.service.ts:751-776` | 已实现 |
| 审批中 | `PENDING_APPROVAL` 不预留 | `sales-orders.service.ts:721-730` | 符合设计 |
| FIFO 锁 | advisory transaction lock + 候选 `FOR UPDATE` + guarded update | `egg-inventory.service.ts:450-519` | 有并发保护 |
| 可用量 | `qty_available = qty_available - canTake` | `egg-inventory.service.ts:501-519` | 已实现 |
| 预留流水 | 每个命中批次写一条 `RESERVED`, `qty_change=-canTake` | `egg-inventory.service.ts:521-533` | 已实现 |
| allocation | 明细只存 `allocated_batch_no='A,B'` 和合计 `allocated_qty` | `egg-inventory.service.ts:588-597`; `sal-order-item.entity.ts:78-85` | **不完整** |

多批次预留的 ledger 是逐批准确记录，但订单 allocation 不是逐批关系记录。真实分配量在函数返回后丢失，后续只能猜测。

额外分支缺口：若 `needApproval=true` 但 `startApproval()` 返回空，`sales-orders.service.ts:709-720` 把订单标为无规则自动批准，却未在该分支调用 `reserveInventory`。需与审批引擎 fail-open 实际返回契约一起修正/封死。

### B2. 完成装车 → 确认出库

入口是 `POST /api/v2/sales/delivery/:id/finish-loading`（`delivery-orders.controller.ts:108-112`），管理端和移动端都进入 `DeliveryOrdersService.finishLoading()`。

当前行为：

1. 要求配送状态为 `LOADING`。
2. 同一数据库事务将配送单改为 `LOADED`。
3. 遍历配送单关联订单，调用 `confirmOutbound()`。
4. 对 allocation 中每个批次 `FOR UPDATE`，guarded update 扣 `inv_batches.qty`。
5. 每批写 `FIFO_OUT`, `qty_change=-outQty`, `ref_no=deliveryNo`。

证据：`delivery-orders.service.ts:375-407`、`egg-inventory.service.ts:676-742`。

**吞错现状定论：已修。** `finishLoading()` 与 `confirmOutbound()` 当前路径没有库存异常 catch；批次不存在、状态变化或物理量不足均抛 `ConflictException`，外层事务回滚配送状态、批次扣减和 ledger。旧报告中“只 warning、配送仍成功”不再符合当前代码。

但仍有三个高危缺口：

- 多批次出库用 `totalQty / batchCount` 后对每批 `Math.round()`（`egg-inventory.service.ts:690-698`）。例如 5 枚/2 批会扣 3+3=6；4 枚/3 批会扣 1+1+1=3。
- 出库后不清 allocation，也没有 delivery/order/batch 出库幂等记录或唯一键（`:685-743`）。
- `finishLoading` 在事务外检查 `LOADING`；事务内 `UPDATE ... WHERE status='LOADING'` 未检查影响行数（`delivery-orders.service.ts:375-383`）。两个并发请求都通过前置检查时，后一个即使状态更新 0 行仍可继续出库。

### B3. 一单多次配送 / 部分配送

当前没有受控机制：

- 创建配送单允许订单状态 `APPROVED/ALLOCATED/PICKED/LOADED`，未检查是否已有活跃配送单（`delivery-orders.service.ts:224-230`）。
- `planned_qty` 固定取订单全部明细数量；DTO 没有本次配送数量（`:209-218,269-283`）。
- `loaded_qty` 没有在 `finishLoading` 更新；出库直接使用订单全量 `allocated_qty`。
- 第一次装车后订单仍可能是 `ALLOCATED`，发车时才成为 `SHIPPED`，因此装车后、发车前可再建配送单并再次扣同一 allocation。

结论：一单一次、全量配送的理想路径可跑通；多次/部分配送没有数量账，不能完成“预留量 = 累计出库量 + 剩余预留量”对账。

### B4. 签收与异常签收

正常和异常签收写 `sal_receipts` 及配送明细的 `received_qty`；全部明细达到 `SIGNED/EXCEPTION/RETURNED` 后，配送完成、订单进入 `RECEIVED` 并生成 AR（`receipts.service.ts:53-105,112-220`）。

签收不调整库存。异常 DTO 虽有 `receivedQty/exceptionQty`，但没有校验两者之和等于计划量，也没有把短收/破损差异回冲到库存（`delivery.dto.ts:117-141`）。由于物理库存已在装车时全额扣除，短收差异只停留在签收记录。

移动端异常签收在 `exceptionQty>0` 且客户、公司、产品资料齐全时另建 `DELIVERY_REJECT` 退货；缺字段则不建。该动作与签收不是同一事务，管理端异常签收也没有对应自动退货（`mobile-delivery.controller.ts:148-219`）。

### B5. 取消 → 释放预留

订单取消在事务内锁订单；原状态是 `APPROVED/ALLOCATED` 时先 `releaseInventory()`，再改 `CANCELLED`（`sales-orders.service.ts:813-847`）。释放会：

- 锁原批次；
- guarded update 增加 `qty_available`，并防止超过 `qty`；
- 写正数 `RELEASED`；
- 清空订单明细 allocation。

证据：`egg-inventory.service.ts:603-672`。

路径存在但数量守恒不成立：与出库相同，它按批次数均分总 allocation 后 `Math.round()`（`:623-627`）。因此只在可整除、各批真实分配恰好相同等偶然条件下准确。当前也没有取消释放真实 PG 测试。

### B6. 退货 → 回库

退货链 `create → submit/approve → inspection → restock → complete` 已存在。质检要求 `acceptedQty + damagedQty <= returnedQty`（`return-orders.service.ts:435-501`）；回库调用 `processReturnInventory()`，accepted 数量创建退货批次并写 `SALE_RETURN`，damaged 数量只写 `DAMAGE_WRITEOFF`（`egg-inventory.service.ts:745-830`）。

缺口：

- 回库批次没有明确仓库/库位参数，无法证明回到原履约仓或隔离仓。
- `ReturnOrdersService.complete()` 可从任意非终态直接完成而不调用库存回库（`return-orders.service.ts:547-590`）。
- 质检结果不要求覆盖全部退货明细。
- 没有 Sales V2 退货库存真实 PG 或 service 单测。

### B7. 仓范围、POS 互相踩踏

Sales V2 订单 entity、创建 DTO、配送单均无履约仓字段。`allocateByFIFO()` 只按 `company_code + AVAILABLE + qty_available + expiry + legacy + SKU/product` 查批次，没有 `warehouse_code`、仓类型、`owner_store_id` 或 `allowedWarehouseCodes` 过滤（`egg-inventory.service.ts:457-489`）。一个订单也可能跨仓取批。

POS 则先解析门店 SALES 绑定仓和 WarehouseScope，再以 `warehouse_code = ANY(...)` 做 FIFO（`store-scope-policy.service.ts:46-135`; `store-pos.service.ts:855-960`）。

因此静态代码可确认：

- POS 自身只消费门店绑定仓。
- Sales V2 可能消费同公司任何合格批次，包括门店 SALES 仓；是否已发生需生产实证。
- 两者都扣同一 `qty_available`，行锁和条件更新可防负数，但 Sales V2 可能抢走门店可售库存，导致 POS 报缺货。
- 两者 advisory lock key 不同，跨链路并发只依赖批次行锁/guarded update，业务优先级不可控。

**履约仓指定具有业务必要性，优先级 P0。** 它不仅是权限优化，而是库存承诺、拣货地点、配送路线、取消归还、退货回库、门店可售隔离和订单毛利/履约成本的共同业务主键。

### B8. 超卖保护与审批窗口

批准预留具备三层保护：transaction advisory lock、候选批次 `FOR UPDATE`、`qty_available >= requested` 条件更新。POS 也使用行锁与条件更新，因此正常路径不会把 `qty_available` 扣成负数。

审批中不预留是既定语义。POS 可在订单等待审批时先售出库存；最终批准会按当时余量重新预留，若不足则批准事务失败/回滚。它是“批准可能失败”的承诺窗口，不是数据库无锁超卖。若业务要求审批后必定有货，需要另建软占用/配额/缺货队列，而不能把当前审批中状态误称已锁货。

## 测试证据与证据边界

真实 PostgreSQL 集成测试：`apps/api/src/modules/approval-engine/sales-order-approval.pg.integration.spec.ts:88-161`。

- 真实执行最终审批回调和 `reserveInventory`；
- 两个 FIFO 批次供订单数量 4；
- 断言订单/审批 `APPROVED`、`allocated_qty=4`、两个批次 `qty_available` 合计减少 4、`RESERVED=4`；
- 再执行一次 `finishLoading`，断言批次物理 `qty` 合计减少 4、`FIFO_OUT=4`。

CI 在 `.github/workflows/regression.yml:87-95` 以 `RUN_PG_INTEGRATION=1` 启用该测试。

该 fixture 的数量恰好规避均分取整问题，也只执行一次配送/一次装车。它不能证明取消释放、并发幂等、部分配送、签收差异、退货回库和仓范围。现有 service 单测主要验证 SQL 条件和 mock 事务；未发现上述缺口的真实 PG 测试。

## C. 生产实证

### C1. 第 0 批执行结果（2026-09-03）

第 0 批先执行 schema dump，再按生产实存列执行关联对账。两个 workflow 均使用
`Production Readonly Audit` 受控入口，SQL 位于只读事务，最终 `ROLLBACK`，并输出
`PASS PRODUCTION_BUSINESS_WRITES=0`。

| 项目 | 结果 | 证据 |
|---|---:|---|
| schema dump | 目标 9 表共 182 列；门店关联列 `wms_warehouses.owner_store_id/domain` 与 `store_warehouse_bindings` 均实存 | run `33711219198` |
| allocation vs RESERVED | 35 组，差异 0；其中未结 11 组，差异 0 | run `33711379780` |
| 负物理库存 | 0 | run `33711379780` |
| 负可用库存 | 0 | run `33711379780` |
| 可用量大于物理量 | 0 | run `33711379780` |
| 重复 FIFO_OUT 候选 | 0 | run `33711379780` |
| Sales V2 命中门店 SALES 仓 | **1 条 / 1 单 / 1 枚** | run `33711379780` |

门店仓命中明细（历史治理报批清单，不自动修复）：

| ledger_id | order_no | batch_no | company_code | sku_code | qty | warehouse_code | store_code | created_at |
|---:|---|---|---|---|---:|---|---|---|
| 221 | SO-20260903-00006 | IBN-20260828-VW1SSC | COMP-LAO-XINGCHI | CJ-EGG-8E82312ECAD7 | 1 | ST_LAO_XINGCHI_HS_001_SALES | STORE-HS-001 | 2026-09-03 02:47:25.879859 |

本次只读审计时生产部署 revision 为 `9d805e9af441b49af0b7ceea8504fc7d1ea0a153`，
checkout/API/Web 三者一致。审计只确认上述时点事实；第 3 批部署后需用同一清单复跑并断言门店仓新增命中为 0。

### C2. 历史数据处置边界

当前无需负库存、allocation 差异或重复出库修复。唯一历史问题是上述 1 枚门店仓预留：

- 在逐批 allocation 上线前不猜测、不改写 ledger 或批次数量；
- 第 1 批迁移只按既有 `RESERVED` ledger 重建未结 allocation；
- 是否释放/转仓/维持原承诺需业务确认后另行制定可回滚数据修复脚本；
- 未获生产写入批准前，仅保留清单与持续只读复验。

### C3. 证据边界

本环境不直接持有生产数据库凭据；实证均通过 `.github/workflows/production-readonly-audit.yml:5-97` 的受控入口取得。该入口要求确认词 `APPROVE-PRODUCTION-READONLY-AUDIT`，再通过 production secrets 到生产执行。

runner `scripts/ops/run-production-readonly-audit.sh:4-80` 限制 SQL 目录，设置 `default_transaction_read_only=on`，显式 `BEGIN TRANSACTION READ ONLY`，最终 `ROLLBACK`；HTTP 仅允许 GET/HEAD。

workflow 的 HTTP 空输入会采用默认生命周期清单，因此本次两轮同时执行了 GET-only HTTP 断言；应用启动期尝试的 DDL/DML 全部被只读事务拒绝。SQL 结果与 HTTP 结果均成功，且 runner 最终确认业务写入为 0。

### C4. 已落地只读清单

已新增 `scripts/ops/readonly-audits/sales-order-inventory-link-schema.sql` 与
`scripts/ops/readonly-audits/sales-order-inventory-link-audit.sql`，分别负责 schema 核对和以下数据对账：

```sql
-- 订单 allocation 与 RESERVED 对账
WITH r AS (
  SELECT ref_no, company_code, sku_code, SUM(-qty_change) reserved_qty
  FROM inv_ledger WHERE change_type='RESERVED'
  GROUP BY ref_no, company_code, sku_code
), o AS (
  SELECT so.order_no, so.company_code, oi.sku_code,
         SUM(oi.allocated_qty) allocated_qty
  FROM sal_sales_orders so JOIN sal_order_items oi ON oi.sales_order_id=so.id
  GROUP BY so.order_no, so.company_code, oi.sku_code
)
SELECT o.*, COALESCE(r.reserved_qty,0) reserved_ledger_qty
FROM o LEFT JOIN r ON r.ref_no=o.order_no
 AND r.company_code=o.company_code
 AND r.sku_code IS NOT DISTINCT FROM o.sku_code
WHERE COALESCE(r.reserved_qty,0) <> COALESCE(o.allocated_qty,0);

-- 负库存与可用量大于物理量
SELECT batch_no, company_code, warehouse_code, sku_code, qty, qty_available
FROM inv_batches
WHERE qty < 0 OR qty_available < 0 OR qty_available > qty;

-- 重复出库候选
SELECT ref_no AS delivery_no, batch_no, sku_code,
       COUNT(*) rows, SUM(-qty_change) fifo_out_qty
FROM inv_ledger
WHERE change_type='FIFO_OUT'
GROUP BY ref_no, batch_no, sku_code
HAVING COUNT(*) > 1;
```

门店仓命中查询应以当前生产 schema 中 `wms_warehouses.owner_store_id`、门店 warehouse binding 表为准，先通过只读 schema dump 核对字段，再关联 `RESERVED` ledger 的 `warehouse_code`。不得根据静态迁移猜生产列名后直接宣称结果。

## D. 差距矩阵与修复方案

| 优先级 | 差距 | 影响 | 建议方案 | 粗略工作量 |
|---|---|---|---|---|
| P0 | 无逐批 allocation 数量 | 出库/释放多扣少扣，账实不守恒 | 新建订单明细-批次 allocation 表，逐批记录 reserved/outbound/released qty；迁移历史未结 allocation；所有动作按关系行处理 | 5–8 人日 |
| P0 | 无履约仓 | 跨仓/门店抢货，无法确定拣货、配送、退回地点 | 订单显式 `fulfillment_warehouse_code`；创建/批准校验公司、ACTIVE/OPERATIONAL、业务域和 WarehouseScope；FIFO 强制单履约仓。多仓履约需拆 fulfillment | 5–10 人日 |
| P0 | finishLoading 并发幂等缺口 | 同配送重复扣物理库存/FIFO_OUT | 事务内锁配送主行；CAS 返回 0 立即冲突；建立 delivery+order+allocation 出库唯一事实/幂等键；出库后原子累计 outbound qty | 2–4 人日 |
| P0 | 重复配送/无部分配送模型 | 同订单全量重复出库，无法分批履约 | delivery item 保存本次 planned/loaded/outbound qty；创建时只允许 `remaining_to_deliver`；活跃配送唯一性或显式多 fulfillment | 4–7 人日 |
| P1 | 异常签收无库存差异闭环 | 短收/拒收后账实及责任悬空 | 校验 received+exception=planned；按异常类型生成在途差异/退货待处理，不直接静默回可售；管理端/移动端统一事务语义 | 4–7 人日 |
| P1 | 取消释放非幂等且均分 | 多释放或重复释放 | 复用逐批 allocation；对 remaining_reserved 做 guarded update；RELEASED 以 allocation/action 唯一 | 包含在 allocation 改造，另 1–2 人日 |
| P1 | 退货回库无目标仓/可绕过 | 回库无位置、强制完成漏库存 | 退货保存目标仓和隔离 zone/location；强制完成禁跨越 restock；质检必须覆盖全部明细；回库与终态同事务/可靠编排 | 3–6 人日 |
| P1 | 无规则自动批准分支疑似漏预留 | 已批准但没有 RESERVED | 明确 startApproval 返回契约；所有进入 APPROVED 的路径收敛到唯一 transition hook，增加幂等守卫 | 1–2 人日 |
| P2 | 缺生产对账与自动测试 | 缺陷只能事后发现 | 增加真实 PG：非整除多批、取消、并发装车、重复配送、短收、退货、仓隔离；生产只读日报/告警 | 3–5 人日 |

### 推荐实施顺序

1. 先执行生产只读清单，确认是否已有真实错账或门店仓命中；若有，单独制定可回滚的数据修复计划。
2. 先做逐批 allocation + 装车幂等，这是数量守恒底座。
3. 再引入履约仓，并明确“一单一仓”还是“订单拆 fulfillment 多仓”；建议先落一单一履约仓，复杂多仓通过拆履约单承载。
4. 再做部分配送、异常签收和退货隔离仓闭环。
5. 每阶段以真实 PG 测试和受控生产只读对账收口。

## 执行状态

用户已批准第 0–3 批完整方案。第 0 批已完成只读摸底；第 1–3 批分别以独立 PR 实施、验证和合入。生产历史数据仍受单独报批边界约束，上述门店仓命中记录不会随代码迁移自动改写。

### 第 1 批迁移前置核验

生产只读 run `33712740190` 已按迁移同口径检查历史未结单：重复 RESERVED 事实 0 组、逐批回填数量差异 0 条、既有 FIFO_OUT 无法唯一映射 0 组，且输出 `PASS PRODUCTION_BUSINESS_WRITES=0`。因此逐批 allocation 迁移可按原 ledger 精确回填，无需为当前生产数据制定猜测性分摊规则。

### 第 1–2 批执行记录

- 第 1 批 PR `#172` 已通过全部 CI 并合入：逐批 allocation、精确预留/释放/出库、装车并发互斥、审批入口收敛及真实 PG 非整除/取消/并发用例。
- 第 2 批 PR `#173` 已通过全部 CI 并合入：订单履约仓、FIFO 单仓约束、历史在途单待治理标记、部分配送数量账、活跃配送唯一约束及详情/process-log 展示。
- 第 2 批本地验证：API/Web tsc 通过，定向 Jest 13/13，真实 PG 5/5，CI 的 Web Vitest、regression、build/typecheck、security/freeze gates 全部通过。

### 第 3 批提交前记录

第 3 批 PR `#174` 实现签收数量守恒、异常记录及移动端退货关联、全明细质检、显式回库仓/隔离库区/货位，以及库存、损耗、Credit Note、终态和生命周期事件的单事务提交。回库以订单行锁、`restocked_at` 和明细处理状态防重复。

提交前验证：API/Web tsc 通过，Web 全量 527/527，真实 PG 6/6，i18n/constraint/nullable/entity-drift 门禁通过；API 全量 736 通过，仍有 2 个与本链路无关的既有 Chanjet 5 秒超时。生产部署与最终只读复验结果将在 PR 合入后追加。

### 第 0–3 批交付与部署记录

| 批次 | PR | 结果 |
|---|---:|---|
| 第 0 批：生产只读摸底 | #171 | CI 全绿并合入；生产 schema dump 与 C2 清单完成，业务写入 0 |
| 第 1 批：正确性止血 | #172 | CI 全绿并合入；逐批 allocation、审批收敛、装车并发幂等与真实 PG 用例落地 |
| 第 2 批：履约仓与部分配送 | #173 | CI 全绿并合入；一单一履约仓、仓域校验、部分配送数量账和活跃配送唯一性落地 |
| 第 3 批：差异与退货闭环 | #174 | CI 全绿并合入；签收差异、异常退货、全量质检、隔离回库及同事务终态落地 |

全量生产部署 workflow run `33717199174` 成功。部署后 checkout、API、Web revision 均为
`0dccc78d276b84418b155d88489139219a4d5e7b`，三者一致。

### 部署后生产只读复验

原 C2 清单复跑 run `33717631419`，收口清单 run `33718063497`；两次均在只读事务中执行并确认
`PASS PRODUCTION_BUSINESS_WRITES=0`。

| 断言 | 部署后结果 | 判定 |
|---|---:|---|
| allocation vs RESERVED | 35 组，差异 0；未结 11 组，差异 0 | PASS |
| 负物理库存 | 0 | PASS |
| 负可用库存 | 0 | PASS |
| 可用量大于物理量 | 0 | PASS |
| 重复 FIFO_OUT 候选 | 0 | PASS |
| 部署后新增 Sales V2 门店 SALES 仓命中 | 0 | PASS |
| allocation 超额出库/释放 | 0 | PASS |
| allocation action ↔ ledger 来源关联 | 1 条历史缺口 | 待审批治理 |

门店仓“新增命中为 0”以部署完成时间 `2026-09-03 05:07:00+00` 为切点。部署前 ledger `221`
仍保留在生产，因此不应把全历史查询的 1 条解释为新代码继续抢门店仓。该历史事实未被迁移静默改写。

收口对账还定位到 allocation `id=1`（order item `35`、batch `IBN-20260828-VW1SSC`）：
`reserved_qty=1`、`outbound_qty=1`、`released_qty=0`，无超额消耗；但其历史 FIFO_OUT 没有对应
`sal_order_item_batch_allocation_actions` 关系行，导致 action 来源汇总为 0。迁移按既有 ledger 精确重建了数量，
没有伪造迁移前不存在的审计关系，因此这是部署前历史来源链缺口，不是部署后的重复扣库或数量损坏。

### 生产历史治理报批清单

根据“生产历史账损只出清单、不自动修”的红线，以下两项未执行生产写入：

1. `SO-20260903-00006` 的 1 枚库存曾由门店 SALES 仓
   `ST_LAO_XINGCHI_HS_001_SALES` 履约（RESERVED ledger `221`）。需业务确认是维持既成履约、做账务归属调整，
   还是执行可回滚的跨仓治理；不得直接释放或转仓猜测。
2. allocation `id=1` 的历史 OUTBOUND action 来源关系缺失。获批后应先以只读 dry-run 唯一定位原 FIFO_OUT ledger，
   再用带前置断言、幂等键和回滚 SQL 的专项脚本补审计关系；不得改动已经正确的库存数量。

因此，本轮代码链路、部署后新增数据和库存数量断言均通过；“全历史对账零差异”尚受上述 1 条迁移前审计来源缺口阻挡，
需要单独生产数据修复批准后才能归零。
