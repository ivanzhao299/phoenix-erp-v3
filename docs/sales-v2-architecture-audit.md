# Phoenix ERP Sales V2 Architecture Audit

**审计日期：** 2026-05-26  
**审计范围：** Sales / Distribution / Pricing / AR / Delivery  
**审计人：** Phoenix ERP V3 架构审计团队  
**基准版本：** commit `4c693bd`（Finance V2 Phase 6 完成节点）  
**审计方法：** 源代码直读（order/, store/, wms/, b2b/, transport/, generic-crud/, bff/, migrations/）

---

## 执行摘要

当前 Sales 模块处于**半业务状态**：有代码骨架，有局部可运行逻辑，但整体架构碎片化、关键路径断裂、无法作为企业生产系统使用。

**最严重的三个问题：**

1. **两套客户表、三套价格表并存**，互不知晓，会导致同一客户在不同入口创建不同记录。
2. **销售订单→AR 联动断裂**：`order.service.ts` 的 AR 写入点走的是已废弃的 `fin_transactions`，且用 `.catch(() => console.warn)` 容错——意味着即使写入失败也静默，Finance V2 AR Runtime (`fin_ar_invoices`) 与销售系统**完全脱节**。
3. **风险控制字段幽灵化**：`sales-engine.service.ts` 查询 `ord_customers.risk_flag`、`protection_status`、`current_owner_subject_id` 三个字段，但这三个字段**不在任何迁移 DDL 中定义**，在全新数据库上 SalesEngine 的 OwnershipValidator 会因列不存在而静默报错退化为"总是通过"。

**结论：Sales 模块可以推翻重建，不存在不可替代的业务数据。**

---

## 一、当前销售相关代码扫描结果

### 1.1 后端模块清单

| 模块路径 | 核心文件 | 状态 |
|---------|---------|------|
| `modules/order/` | order.service.ts, order.controller.ts, sales-engine.service.ts | **半 Runtime**（有业务逻辑，有关键缺陷）|
| `modules/store/` | pos.service.ts, store.service.ts, pos.controller.ts | **最接近 Runtime**（POS 收银链路基本完整）|
| `modules/wms/` | wms.service.ts, inventory.service.ts, inbound/outbound.controller.ts | **Inventory 轻度 Runtime**（入库+库存流水可用）|
| `modules/bff/` | bff.controller.ts（含 farm/sales/*, distributors, channel-scorecard） | **混杂 BFF**（农场销售 API、B2B 统计接口）|
| `modules/generic-crud/` | 自动建表并暴露 CRUD | **技术债容器**（log_dispatch, b2b_customers, ord_prices 等均在此自动生成）|

**无专属后端模块：** B2B、配送 (Transport)、销售退货、渠道管理、经销商评级。

### 1.2 前端页面清单

| 路径 | 性质 |
|------|------|
| `/order` | 订单列表（调 `ord_orders` generic-crud）|
| `/order/customers` | 客户管理（调 `ord_customers` generic-crud）|
| `/order/prices` | 价格管理（调 **`ord_prices`** generic-crud，非 `prc_price_items`）|
| `/order/approval` | 审批页（UI 存在，后端无 Workflow 2.0 对接）|
| `/order/credit` | 信用管理（UI 存在，字段写 `ord_customers.credit_limit`）|
| `/order/farm-sales` | 农场直销录入 |
| `/order/loading` | 装车清单 |
| `/order/picking` | 分拣页 |
| `/b2b` | B2B 总入口（跳转页）|
| `/b2b/customers` | B2B 客户（调 **`b2b_customers`** generic-crud，与 ord_customers 独立）|
| `/b2b/orders` | B2B 订单 |
| `/b2b/distributor-grading` | 经销商评级（纯前端 UI，无后端存储）|
| `/pos/sales` | POS 收银（调 `PosController` 真实 Runtime）|
| `/transport` | 配送总览（调 **`log_dispatch`** generic-crud）|
| `/transport/wave` | 配送波次 |
| `/transport/tracking` | 实时追踪（展示 log_dispatch 状态）|
| `/transport/receipt` | 门店签收 |
| `/transport/drivers` | 司机管理（调 `log_drivers` generic-crud）|
| `/transport/vehicles` | 车辆管理（调 `log_vehicles` generic-crud）|
| `/warehouse` | 仓库管理（WMS 前端，有真实后端）|
| `/mobile/sales` | 移动端农场销售（有硬编码价格）|
| `/mobile/delivery` | 移动端配送签收（调 log_dispatch generic-crud）|

### 1.3 数据库表清单

| 表名 | 归属模块 | 定义来源 | 状态 |
|------|---------|---------|------|
| `ord_orders` | 订单 | v3_schema_complete.sql | 存在，字段不完整 |
| `ord_order_items` | 订单明细 | v3_schema_complete.sql | 存在 |
| `ord_customers` | 客户主档（B2B+直销） | generic-crud 建表 + schema 补丁 | 存在，字段散乱 |
| `b2b_customers` | B2B 客户（独立！） | generic-crud 建表 | **与 ord_customers 重复** |
| `ord_prices` | 客户合同价（Sales 端） | generic-crud 建表 | 存在，与 prc_price_items 重复 |
| `ord_approval_log` | 订单审批日志 | 代码内 INSERT 隐式创建 | 未正式 DDL |
| `ord_credit_usage` | 信用额度流水 | 代码内 INSERT 隐式创建 | 未正式 DDL |
| `prc_price_items` | 价格书（Procurement 端） | v3_schema_complete.sql | 被 SalesEngine 引用，字段不匹配 Sales 需求 |
| `pos_sales` | POS 销售单 | v3_schema_complete.sql | Runtime 可用 |
| `pos_sale_items` | POS 销售明细 | v3_schema_complete.sql | Runtime 可用 |
| `pos_refunds` | POS 退款 | v3_schema_complete.sql | Runtime 可用 |
| `inv_batches` | 库存批次 | v3_schema_complete.sql | 可用，缺蛋品等级字段 |
| `inv_ledger` | 库存流水 | v3_schema_complete.sql | 可用（POS 写入，B2B 不写入）|
| `wms_warehouses` | 仓库主档 | v3_schema_complete.sql | 存在 |
| `wms_outbound_items` | 出库明细 | v3_schema_complete.sql | 存在 |
| `log_dispatch` | 配送波次 | generic-crud 建表 | 极简，无出发/到达时间戳 |
| `log_vehicles` | 车辆 | generic-crud 建表 | 极简 |
| `log_drivers` | 司机 | generic-crud 建表 | 极简 |
| `log_routes` | 配送路线 | generic-crud 建表 | 极简（stores 字段为 TEXT，非 FK）|
| `log_receipts` | 签收记录 | generic-crud 建表 | 极简 |
| `fin_transactions` | 旧财务流水（已废弃） | v3_schema_complete.sql | Sales AR 目前仍写此表（BUG）|
| `fin_ar_invoices` | Finance V2 AR（正确） | Finance V2 migration | **与销售系统完全脱节** |

---

## 二、20 项重点审计问题

### Q1. 当前是否存在销售模块？

**是，存在，但高度碎片化。**  
不存在一个名为 "sales" 的统一模块。销售能力散落在：`order/`（B2B订单）、`store/`（POS零售）、`bff/`（农场直销API）、`transport/`+`generic-crud`（配送）。没有统一的 Sales Domain 边界。

### Q2. 销售模块属于 Demo、半业务、还是可运行 Runtime？

| 子系统 | 状态 |
|-------|------|
| POS 收银（store/pos） | ✅ **接近 Runtime**（库存联动、价格带、幂等、班次）|
| WMS 库存 | ✅ **轻度 Runtime**（入库+流水基本可用）|
| B2B 订单（order/） | ⚠️ **半业务**（有状态机，但 AR 联动断裂、DDL 不完整）|
| 配送（transport/） | ❌ **Demo**（仅 generic-crud CRUD，无任何业务逻辑）|
| 客户主档 | ❌ **Demo**（两套表，字段不完整，无 company_code）|
| 价格体系 | ❌ **Demo**（三套表混用，无统一定价引擎）|
| AR 联动 | ❌ **断裂**（写已废弃 fin_transactions，非 Finance V2）|
| 退货 | ❌ **缺失**（无退货单、无退货逻辑）|
| 渠道管理 | ❌ **缺失**（无后端）|

### Q3. 当前是否有客户主档？

**有，但有两套并存：**

```
ord_customers（generic-crud）:
  customer_code, customer_name, phone, region, credit_limit,
  credit_used, tier, status, customer_type, blacklist, address, store_code

b2b_customers（generic-crud）:  ← 与 ord_customers 重复！
  customer_code, customer_name, contact, phone, address,
  credit_limit, status
```

`/order/customers` 写 `ord_customers`，`/b2b/customers` 写 `b2b_customers`，**同一经销商可能在两张表都有记录**。

缺失字段：`company_code`（Finance V2 DataScope 必需）、`channel_type`（直营/经销/代理）、`payment_terms`（账期天数，虽 UI 有 account_period 字段，但 DDL 中未定义）、`current_sales_rep_id`。

**SalesEngine 幽灵字段**（查询但未定义）：
- `risk_flag`（用于黑名单检测）
- `protection_status`（归属保护状态）
- `current_owner_subject_id`（归属销售员）

这三个字段不在任何迁移文件的 DDL 中，在空数据库上 SalesEngine 的 OwnershipValidator 会静默失败退化为"全通过"。

### Q4. 当前是否区分直营店、经销商、代理商、大客户？

**极其粗糙。**  
`ord_customers.customer_type` 只有 `RETAIL` / `B2B` 两个值（从 UI 代码推断）。无 `DIRECT_STORE`（直营店）/ `DISTRIBUTOR`（经销商）/ `AGENT`（代理商）/ `KEY_ACCOUNT`（大客户）的正式区分。  
`/b2b/distributor-grading` 页面存在但**后端无存储逻辑**，评级数据未持久化。

### Q5. 当前是否支持客户信用额度、账期、欠款控制？

| 能力 | 现状 |
|-----|------|
| 信用额度字段 | ✅ `ord_customers.credit_limit` 存在 |
| 信用额度预占 | ✅ `OrderService.reserveCredit()` 写 `ord_credit_usage` |
| 信用超限触发 | ✅ 触发 `need_credit_approval=1`，订单进 DRAFT |
| 信用审批走 Workflow 2.0 | ❌ 无，只有 boolean flag，无 wf_instance_id |
| 账期字段 | ⚠️ UI 有 `account_period`，但 DDL 中未找到 |
| 账期逾期冻结下单 | ❌ 无此逻辑 |
| 欠款账龄计算 | ❌ 无此逻辑（需读 fin_ar_invoices，但 AR 已脱节）|
| 信用释放（取消/拒绝） | ✅ `releaseCredit()` 正确实现 |

### Q6. 当前是否有价格体系？

**有，但有三套并存，互相矛盾：**

| 价格表 | 字段 | 被谁用 | 问题 |
|-------|------|-------|------|
| `prc_price_items` | retail_lower, retail_upper, base_price, price_book_id, customer_type | SalesEngine.PriceValidator | 无 customer_code 绑定，仅按 customer_type 分组 |
| `ord_prices` | customer_code, product_code, price, effective_date, floor_price | /order/prices 页面 | 无 SalesEngine 引用，是 generic-crud 的孤立表 |
| `DEFAULT_PRICES`（硬编码）| `'0':1200,'1':1100,...` in mobile-api.ts | 移动端农场直销 | 写死在前端代码中，无法从后台修改 |

**没有统一的 Sales Pricing Engine。** SalesEngine 用 `prc_price_items`，admin 价格管理页写 `ord_prices`，移动端直销用硬编码——三个系统互相不通。

### Q7. 当前是否支持按区域、渠道、客户等级、数量阶梯定价？

❌ **均不支持。**  
- 无渠道定价（直营/经销商价格不同）
- 无区域定价（RegionValidator 是 stub，永远通过）
- 无数量阶梯（qty-based tiered pricing 无任何实现）
- 无客户等级定价（`tier` 字段存在但无定价规则与之关联）

### Q8. 当前是否有销售订单？

**有，但结构问题严重：**

```sql
-- Entity (sales-order.entity.ts) 只有 6 个字段：
order_id, order_no, customer_id, total_amount, currency_code, status, store_code

-- Service (order.service.ts) 写的字段更多（通过 raw SQL）：
customer_code, customer_name, sales_rep, order_type, order_source,
subtotal, discount, need_price_approval, need_credit_approval,
delivery_addr, expected_date, remark

-- 但缺失：
company_code（Finance V2 DataScope 必需）
warehouse_code（出库仓库）
channel_type（订单来源渠道）
delivery_date（实际配送日期）
ar_invoice_id（关联 fin_ar_invoices，当前为 NULL）
```

Entity 与 Service 中的实际字段严重不匹配（Entity 远少于 Service 写入的字段）。

### Q9. 当前是否支持订单状态机？

**有，且设计合理：**

```
DRAFT → APPROVED → ALLOCATED → PICKED → LOADED → SHIPPED
  ↓        ↓          ↓          ↓        ↓         ↓
REJECTED CANCELLED CANCELLED CANCELLED CANCELLED DELIVERED
                                                    ↓
                                                 RECEIVED → RECONCILED
                                       PARTIAL_SHIPPED ↗↘
```

状态机代码在 `VALID_TRANSITIONS` 白名单中正确实现，`transitionOrder()` 做了大小写规范化。

**问题：** SHIPPED/RECEIVED/RECONCILED 的财务联动写 `fin_transactions`（已废弃），不写 `fin_ar_invoices`。

### Q10. 当前是否有销售出库、配送、签收？

| 能力 | 现状 |
|-----|------|
| 销售出库（WMS） | ✅ `wmsService.advanceOutboundOrder()` 在订单 APPROVED 时触发 |
| 配送波次（log_dispatch） | ⚠️ 有表有页面，纯 generic-crud CRUD，无业务逻辑 |
| 装车时间记录 | ❌ `log_dispatch` 无 departure_time 字段 |
| 发车时间记录 | ❌ 无 |
| 签收时间记录 | ⚠️ `log_receipts` 有 created_at，但无 received_at 字段 |
| 配送-订单关联 | ❌ `log_dispatch.stores` 是 TEXT 字段（逗号分隔门店代码），无 FK 关联 ord_orders |
| 超时预警 | ❌ 无 |

### Q11. 当前是否有仓库库存联动？

| 场景 | 现状 |
|-----|------|
| POS 销售扣库存 | ✅ `PosService` 写 `inv_batches` 减 qty + 写 `inv_ledger` SALE_OUT |
| POS 退款回库存 | ✅ `PosService` 写回 qty + 写 `inv_ledger` SALE_REFUND |
| B2B 订单扣库存 | ❌ `OrderService` 无直接扣库存逻辑（靠 WMS 手动出库）|
| WMS 入库 | ✅ `confirmInbound()` 写 `inv_batches` ON CONFLICT UPDATE + `inv_ledger` |
| 库存批次（按批次/等级/日期） | ❌ `inv_batches` 无 grade（蛋品等级）、packaging_spec（包装规格）、production_date 字段 |

### Q12. 当前是否有销售退货？

❌ **完全缺失。**  
`pos_refunds` 表存在（POS 退款），但 B2B 退货单（Return Order）无任何实现，无 AR 冲销（Credit Note）逻辑，无库存回库逻辑。

### Q13. 当前是否有应收账款生成逻辑？

**有，但写的是错误的表：**

```typescript
// order.service.ts transitionOrder()，RECEIVED 状态触发：
await manager.query(
  `INSERT INTO "fin_transactions" ("account_code","type","amount","ref_no","note","created_at")
   VALUES ('AR-TRADE', 'DEBIT', $1, $2, $3, CURRENT_TIMESTAMP)`,
  [order.total_amount, orderNo, `订单已签收...`],
).catch((e: any) => console.warn('[WARN] fin_transactions failed:', e?.message));
```

**三个致命问题：**
1. 写的是 `fin_transactions`（Finance V2 Phase 0 已废弃的旧表），不是 `fin_ar_invoices`
2. 使用 `.catch()` 静默容错，失败不阻断
3. 即使成功写入，Finance V2 AR Runtime 也读不到这条记录

### Q14. 当前是否已接入 Finance V2 AR Runtime？

❌ **完全未接入。**  
`fin_ar_invoices` 是 Finance V2 Phase 2 建立的应收台账。当前 `order/` 模块与 `finance-v2/` 模块没有任何服务依赖或 API 调用关系。两个模块在 `app.module.ts` 中是相互独立的。

### Q15. 当前是否有销售回款/收款联动？

❌ **无。**  
Finance V2 有 AR Receipt（`fin_ar_receipts`），但 Sales 侧没有任何逻辑触发或关联 AR Receipt。收款只能在 Finance V2 后台手工录入，无法与订单自动对账。

### Q16. 当前是否有价格审批、赊销审批、退货审批等 Workflow？

❌ **无 Workflow 2.0 集成。**  

| 审批类型 | 当前实现 | 问题 |
|---------|---------|------|
| 低价销售审批 | `need_price_approval=1` → 订单进 DRAFT | 无 `wf_instance_id`，无 ApprovalEngine 对接，无 SLA |
| 赊销审批 | `need_credit_approval=1` → 订单进 DRAFT | 同上 |
| 退货审批 | ❌ 无退货模块 | — |
| 配送波次审批 | ❌ 无 | — |

Workflow 2.0 平台（Phase A-I）已完备，但销售模块完全未对接。

### Q17. 当前是否有移动端销售/配送/签收？

| 页面 | 路径 | 现状 |
|-----|------|------|
| 移动端农场直销 | `/mobile/sales` | ✅ 可用，但价格硬编码（`DEFAULT_PRICES`）|
| 移动端配送波次 | `/mobile/delivery` | ⚠️ 可查看 log_dispatch，签收写 log_receipts |
| 移动端订单查询 | 无 | ❌ |
| 移动端客户管理 | 无 | ❌ |

农场直销页面的**价格硬编码**是重大问题：蛋品价格每天可能变动，但当前系统无法动态修改，必须改代码部署才能改价。

### Q18. 当前是否有报表：销售日报、客户欠款、渠道销量、区域销量、价格异常？

| 报表类型 | 现状 |
|---------|------|
| 销售日报（POS） | ✅ BFF 有 `store-analysis` 接口，Dashboard 展示 |
| 销售日报（B2B） | ⚠️ BFF 有 `ord_orders` 统计，但无 AR 关联 |
| 客户欠款账龄 | ❌ 无（需 fin_ar_invoices，但已脱节）|
| 渠道销量 | ❌ 无（无渠道分类） |
| 区域销量 | ❌ 无（region 字段有但无聚合） |
| 价格异常（低价销售） | ❌ 无报表，只有下单时的实时检测 |

### Q19. 当前是否支持多公司、多项目、多仓库？

| 维度 | 现状 |
|-----|------|
| 多公司 | ⚠️ `ord_orders` 有 `store_code` 隔离，但无 `company_code`；Finance V2 用 `company_code`，两者不兼容 |
| 多项目 | ❌ 无 project_code 字段 |
| 多仓库 | ✅ `wms_warehouses` 存在，`inv_batches.warehouse_code` 有值，但查询中 warehouse 过滤不彻底 |

### Q20. 当前是否支持 DataScope？

❌ **不支持 Finance V2 DataScope。**  
Sales 模块用 `store_code` 做隔离，Finance V2 用 `company_code` 做 DataScope。两套隔离机制不兼容。`ord_customers` 无 `company_code` 字段，无法与 `fin_ar_invoices` 的 DataScope 对齐。

---

## 三、按经营痛点专项分析

### 3.1 价格混乱

**当前系统能否解决？❌ 不能。当前系统是价格混乱的根源之一。**

| 能力点 | 现状 |
|-------|------|
| 统一价格表 | ❌ 三套价格表（`prc_price_items` + `ord_prices` + 硬编码），互不通，谁都不是"统一"的 |
| 客户专属价 | ⚠️ `ord_prices` 有 `customer_code`，但 SalesEngine 不读此表 |
| 价格生效日期 | ⚠️ `ord_prices` 有 `effective_date`（单个日期，非 from/to 区间）；`prc_price_items` 有 `effective_from/to` |
| 价格审批 | ❌ 无（低价检测存在，但无正式审批工作流）|
| 防止销售员私自改价 | ❌ 无（`ord_prices` 通过 generic-crud 接口可以随意修改）|
| 识别低于底价销售 | ⚠️ SalesEngine 有 `retail_lower` 检测，但价格表是 `prc_price_items` 而非业务真实用的价格表 |

**根因分析：** 价格管理入口（`/order/prices`）写的是 `ord_prices` 表，而 SalesEngine 读的是 `prc_price_items` 表，两者不是同一张表。即使财务在后台设置了价格，SalesEngine 不会使用这个价格来校验。

### 3.2 应收账款收不回来

**当前系统能否解决？❌ 不能。应收账款与销售系统完全脱节。**

| 能力点 | 现状 |
|-------|------|
| 客户账期 | ⚠️ UI 有 `account_period` 字段展示，但 DDL 未定义，且无逾期判断逻辑 |
| 信用额度 | ✅ 有字段、有预占逻辑，但审批走不了正式 Workflow |
| 欠款超期冻结下单 | ❌ 无此逻辑（即使账期过了也能下单）|
| 自动生成 AR | ❌ 写的是废弃的 `fin_transactions`，`fin_ar_invoices` 无记录 |
| 按客户欠款账龄 | ❌ 无（需要 `fin_ar_invoices`，但已脱节）|

**实际风险：** 当前系统中，订单签收（RECEIVED）状态时写入 `fin_transactions`，Finance V2 报表（Phase 6）读 `fin_ar_invoices`。两者完全不同表，Finance V2 的 `getArAging()` 返回的数据不包含任何来自 Sales 的应收款项。

### 3.3 客户信息不准确

**当前系统能否解决？❌ 不能，且会加剧混乱。**

| 能力点 | 现状 |
|-------|------|
| 客户主档 | ⚠️ 有两套（`ord_customers` + `b2b_customers`），字段不统一 |
| 联系人、地址 | ⚠️ 有字段，但只有单个 contact_name/phone，无多联系人支持 |
| 区域分类 | ⚠️ 有 `region` 字段（TEXT），无标准化区域树 |
| 渠道分类 | ❌ 无（只有 RETAIL/B2B 粗分）|
| 客户状态管理 | ⚠️ 有 `status` 字段，有 `blacklist` 字段，但无 FROZEN 状态；SalesEngine 查 `risk_flag` 字段（DDL 未定义）|
| 客户归属销售员 | ⚠️ `protection_status`/`current_owner_subject_id` 字段存在于 SalesEngine 查询，但 DDL 未定义 |

### 3.4 仓库信息不准确

**当前系统能否部分解决？⚠️ 仅对 POS 场景，B2B 场景不行。**

| 能力点 | 现状 |
|-------|------|
| 仓库主档 | ✅ `wms_warehouses` 存在 |
| 库存台账 | ✅ `inv_batches` + `inv_ledger`，POS 销售后正确扣减 |
| 销售出库后扣库存 | ✅ POS：扣 / ❌ B2B：不扣（需手动 WMS 出库）|
| 配送退回后回库存 | ❌ 无（`log_receipts` 无回库逻辑）|
| 蛋品等级管理 | ❌ `inv_batches` 无 grade、packaging_spec、production_date 字段 |

### 3.5 配送时间问题

**当前系统能否解决？❌ 几乎完全不行。**

| 能力点 | 现状 |
|-------|------|
| 配送单 | ⚠️ `log_dispatch` 存在，但字段极简（wave_no, vehicle_no, driver_id, plan_date, stores, status）|
| 配送路线 | ⚠️ `log_routes` 有 route_code, stores（TEXT），无序列化路线点 |
| 装车时间 | ❌ `log_dispatch` 无 loading_start_at / loading_end_at 字段 |
| 发车时间 | ❌ 无 departure_at 字段 |
| 签收时间 | ❌ `log_receipts` 只有 created_at，无 actual_received_at |
| 司机信息 | ✅ `log_drivers` 有 driver_id, name, phone, license_no |
| 车辆信息 | ✅ `log_vehicles` 有 vehicle_no, plate, type, capacity |
| 超时预警 | ❌ 无任何预警逻辑 |
| 配送-订单关联 | ❌ `log_dispatch.stores` 是逗号分隔的 TEXT，无 FK 到 `ord_orders` |

---

## 四、当前架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SALES 当前架构（高度碎片化）                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CUSTOMER ─────────────────────────────────────────────────────────         │
│  ┌──────────────┐  ┌────────────────┐                                        │
│  │ ord_customers│  │ b2b_customers  │  ← 两套，互相不知道                    │
│  │ (order模块)  │  │ (generic-crud) │                                        │
│  └──────┬───────┘  └────────────────┘                                        │
│         │ risk_flag/protection_status                                         │
│         │ 字段未在DDL定义 ← ⚠️幽灵字段                                       │
│                                                                              │
│  PRICING ────────────────────────────────────────────────────────           │
│  ┌────────────────┐  ┌─────────────┐  ┌──────────────────┐                 │
│  │ prc_price_items│  │ ord_prices  │  │ DEFAULT_PRICES   │                 │
│  │ (SalesEngine用)│  │(admin页面写)│  │(前端硬编码)      │                 │
│  └────────┬───────┘  └─────────────┘  └──────────────────┘                 │
│           │ 互不通 ← ⚠️三套价格表                                            │
│                                                                              │
│  SALES ORDER ─────────────────────────────────────────────────────          │
│  ┌────────────────────────────────────────────────────────┐                 │
│  │ ord_orders (11状态机 DRAFT→APPROVED→...→RECONCILED)    │                 │
│  │ + ord_order_items + ord_approval_log + ord_credit_usage│                 │
│  │ 缺：company_code, channel_type, ar_invoice_id          │                 │
│  └─────────────────────┬──────────────────────────────────┘                 │
│                        │                                                     │
│         ┌──────────────┼──────────────┐                                      │
│         ▼              ▼              ▼                                       │
│  ┌──────────────┐ ┌──────────┐ ┌──────────────────────┐                    │
│  │ WMS 出库触发  │ │ fin_txns │ │ fin_ar_invoices       │                    │
│  │ (APPROVED时) │ │ (废弃表) │ │ (Finance V2, 未接入!) │                    │
│  │ ✅正确路径   │ │ ❌已废弃 │ │ ❌完全脱节            │                    │
│  └──────┬───────┘ └──────────┘ └──────────────────────┘                    │
│         │                                                                     │
│  INVENTORY ─────────────────────────────────────────────────────            │
│  ┌──────────────────────────────────────────────────────┐                   │
│  │ inv_batches (库存批次)                               │                   │
│  │ + inv_ledger (库存流水)                              │                   │
│  │ POS: 出库✅ / B2B: 手动WMS出库⚠️                   │                   │
│  │ 缺：grade, packaging_spec, production_date          │                   │
│  └──────────────────────────────────────────────────────┘                   │
│                                                                              │
│  DELIVERY ─────────────────────────────────────────────────────             │
│  ┌──────────────────────────────────────────────────────┐                   │
│  │ log_dispatch (generic-crud，极简)                    │                   │
│  │ 无departure_at/arrival_at；stores字段为TEXT           │                   │
│  │ 与ord_orders无FK关联                                 │                   │
│  └──────────────────────────────────────────────────────┘                   │
│                                                                              │
│  AR ─────────────────────────────────────────────────────── ❌缺失         │
│  AR Integration: RECEIVED状态 → fin_transactions (废弃)                      │
│  Finance V2 fin_ar_invoices: ← 无任何销售系统写入                           │
│                                                                              │
│  WORKFLOW ────────────────────────────────────────────────── ❌缺失        │
│  低价审批: need_price_approval=1 (boolean flag, 无wf_instance)               │
│  赊销审批: need_credit_approval=1 (boolean flag, 无wf_instance)              │
│  Workflow 2.0 Platform: 已就绪但Sales未对接                                  │
│                                                                              │
│  REPORTING ───────────────────────────────────────────────── ⚠️部分       │
│  POS日报: ✅ (BFF store-analysis)                                            │
│  客户欠款账龄: ❌ (需fin_ar_invoices，已脱节)                               │
│  渠道/区域销量: ❌ (无渠道/区域分类体系)                                    │
│  价格异常报表: ❌ (无)                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 五、能力评分（10分制）

| 维度 | 得分 | 说明 |
|-----|------|------|
| **Customer Runtime** | 2/10 | 两套表并存，SalesEngine 查幽灵字段，无 channel_type，无 company_code |
| **Price Runtime** | 2/10 | 三套价格表互不通，管理入口与校验引擎读不同表，移动端硬编码 |
| **Sales Order Runtime** | 5/10 | 状态机设计合理，信用校验有实现，但 AR 联动断裂，Entity 字段不完整 |
| **Delivery Runtime** | 1/10 | 极简 generic-crud CRUD，无时间戳，无订单关联，无业务逻辑 |
| **Inventory Integration** | 5/10 | POS-库存联动完整；B2B-库存需手动，缺蛋品特有字段 |
| **AR Integration** | 0/10 | 写废弃表，Finance V2 AR 完全脱节 |
| **Workflow Integration** | 1/10 | Workflow 2.0 平台完备但Sales未接入，价格/信用审批只有 boolean flag |
| **DataScope / Governance** | 1/10 | store_code 隔离与 Finance V2 company_code 体系不兼容 |
| **Mobile Readiness** | 3/10 | 农场直销可用但价格硬编码；移动端无 B2B 订单、客户管理 |
| **Enterprise Readiness** | 2/10 | 两套客户表、三套价格表、AR 脱节、无统一 DataScope，不适合企业生产使用 |

**综合评分：2.2/10 — 推翻重建**

---

## 六、技术债清单

### CRITICAL（阻断生产使用）

| 编号 | 技术债 | 位置 | 影响 |
|-----|-------|------|------|
| C-01 | **AR 联动断裂**：订单 RECEIVED 写 `fin_transactions`（废弃），不写 `fin_ar_invoices` | order.service.ts:245 | 所有 B2B 应收款在 Finance V2 中不可见，账款管理完全失效 |
| C-02 | **SalesEngine 幽灵字段**：查询 `risk_flag`、`protection_status`、`current_owner_subject_id`，DDL 未定义 | sales-engine.service.ts:78-99 | 空库上 OwnershipValidator 静默退化为"全通过"，黑名单控制失效 |
| C-03 | **两套客户表**：`ord_customers` + `b2b_customers` 并存，相互独立 | generic-crud + order | 同一经销商在两处建档，数据无法对账 |
| C-04 | **三套价格表不通**：`prc_price_items`（校验用）、`ord_prices`（管理入口）、硬编码（移动端） | 分散 | 管理员设置的价格不影响校验，销售校验用的价格管理员看不到 |
| C-05 | **移动端价格硬编码**：`DEFAULT_PRICES = {'0':1200,'1':1100,...}` | mobile-api.ts + sales/page.tsx | 蛋价变动需改代码部署，无法实时调价 |

### HIGH（严重影响业务正确性）

| 编号 | 技术债 | 位置 | 影响 |
|-----|-------|------|------|
| H-01 | **B2B 订单不扣库存**：B2B 出库需手动触发 WMS，无自动库存联动 | order.service.ts | 库存数据不实时，出现超卖风险 |
| H-02 | **DataScope 不兼容**：Sales 用 `store_code`，Finance V2 用 `company_code` | 全局 | 无法跨模块做多公司数据隔离和授权控制 |
| H-03 | **价格审批无 Workflow 2.0**：`need_price_approval=1` 只是 flag，无工作流实例 | order.service.ts | 审批过程无记录、无 SLA、无推送通知 |
| H-04 | **账期逾期无冻结逻辑**：`account_period` 字段有值但无逾期判断 | order/customers | 超账期客户仍可无限下单 |
| H-05 | **配送-订单无关联**：`log_dispatch.stores` 是 TEXT，无 FK | transport 模块 | 无法从订单追踪到配送，无法从配送追踪到订单 |
| H-06 | **退货模块完全缺失** | — | 客户退货无处理，库存无法回退，AR 无法冲销 |
| H-07 | **ord_approval_log / ord_credit_usage 无正式 DDL** | order.service.ts:139,168 | 代码内隐式 INSERT，表不存在时静默失败 |

### MEDIUM（影响数据质量）

| 编号 | 技术债 | 位置 | 影响 |
|-----|-------|------|------|
| M-01 | **Entity 字段与 Service 不一致**：SalesOrderEntity 只有 6 字段，Service 写入 15+ 字段 | order/ | TypeORM 操作不可用，只能 raw SQL |
| M-02 | **inv_batches 无蛋品字段**：缺 grade、packaging_spec、production_date | wms/ | 无法按等级、规格、生产日期管理鸡蛋库存 |
| M-03 | **RegionValidator 是 stub**：永远返回通过 | sales-engine.service.ts:104 | 区域销售权限控制完全无效 |
| M-04 | **distributor-grading 无后端**：经销商评级只有前端 UI | b2b/distributor-grading | 数据无法持久化 |
| M-05 | **log_dispatch 缺时间戳**：无 departure_at、arrival_at | generic-crud | 无法计算配送时效 |
| M-06 | **customer_type 只有 RETAIL/B2B**：无 DIRECT_STORE/DISTRIBUTOR/AGENT 细分 | ord_customers | 渠道分析无法做 |
| M-07 | **ord_prices 与 prc_price_items 字段不同**：前者有 customer_code，后者有 price_book_id | — | 两套价格逻辑无法合并 |

### LOW（代码质量问题）

| 编号 | 技术债 | 位置 |
|-----|-------|------|
| L-01 | `store_code = 'ALL'` 硬编码为全局通配符，与 Finance V2 模式不兼容 | 多处 |
| L-02 | BFF 控制器承载了过多业务逻辑（store-analysis、distributors、channel-scorecard） | bff.controller.ts |
| L-03 | `pos.service.ts` 中 `require('bcrypt')` 规避循环依赖 | pos.service.ts:101 |
| L-04 | 状态枚举散落（大小写混用历史数据 'approved' / 'APPROVED'）| order.service.ts:38 |
| L-05 | `wms.service.ts` 中硬编码 `'INBOUND-DOCK'`、`'WH-B'` 兜底仓库 | wms.service.ts |

---

## 七、哪些保留，哪些推翻

### 7.1 当前可保留资产

| 资产 | 价值 |
|-----|------|
| **POS Runtime**（pos.service.ts + pos.controller.ts） | 有真实业务逻辑：幂等、价格带、库存联动、班次、日结 |
| **WMS 库存 Runtime**（inv_batches + inv_ledger + POS 联动） | 库存守恒逻辑正确，POS 端联动完整 |
| **OrderService 状态机设计**（VALID_TRANSITIONS） | 11 状态机设计合理，可在 Sales V2 复用（但需重实现）|
| **SalesEngine 三大校验框架**（ownership/region/price 结构） | 框架设计合理，但需接真实数据源 |
| **信用预占/释放逻辑**（reserveCredit/releaseCredit） | 逻辑正确，可在 Sales V2 重实现 |
| **`log_vehicles` / `log_drivers`** | 数据结构基本够用，可迁移到 sal_vehicles/sal_drivers |

### 7.2 当前应推翻资产

| 资产 | 原因 |
|-----|------|
| `ord_customers`（整个表） | 字段不完整，无 company_code，与 Finance V2 不兼容，重建 sal_customers |
| `b2b_customers`（整个表） | 与 ord_customers 重复，合并到 sal_customers |
| `ord_prices`（价格表） | 字段不足，无版本控制，重建 sal_price_books + sal_price_items |
| `prc_price_items` 中的 Sales 用价格逻辑 | 该表归 Procurement，Sales 不应复用 |
| 移动端硬编码 `DEFAULT_PRICES` | 全部删除，从 sal_price_items 动态加载 |
| `order.service.ts` 中的 `fin_transactions` 写入逻辑 | 改写为触发 Finance V2 AR Invoice 创建 |
| `log_dispatch` / `log_receipts` / `log_routes`（generic-crud 管理）| 重建为 sal_delivery_orders + sal_delivery_stops + sal_receipts |
| BFF 中销售相关的散点接口（distributors, channel-scorecard, farm/sales/*） | 统一迁移到 Sales V2 对应 Controller |
| `b2b/distributor-grading` 纯前端评级页 | 重建并接后端 |

### 7.3 当前可复用模式

| 模式 | 说明 |
|-----|------|
| Finance V2 的 Raw SQL + InjectDataSource 模式 | Sales V2 沿用，无 Entity ORM |
| Finance V2 的 DataScope 模式（company_code + scopeAll） | Sales V2 全面对齐，不用 store_code |
| Workflow 2.0 的 createFromFormSubmission 路径 | 价格审批、赊销审批接入 |
| `wf_form_definition` + `wf_form_version` 的种子模式 | 可为 Sales 审批表单建种子 |
| POS Service 的幂等 + 库存原子事务模式 | 迁移到 Sales V2 出库场景 |
| inv_ledger Append-only 流水模式 | 继续用于销售出库 |

### 7.4 当前不得继续扩展的旧逻辑

| 禁止继续扩展的内容 | 原因 |
|----------------|------|
| 向 `fin_transactions` 写入 AR 数据 | 已废弃，必须换 `fin_ar_invoices` |
| generic-crud 建表模式用于新业务表 | 只适合临时，不适合业务 Runtime |
| `store_code` 作为主隔离字段 | 改用 `company_code` |
| SalesEngine 中任何对 `prc_price_items` 的依赖（Sales 用途）| 该表是 Procurement 的 |
| `b2b_customers` 继续写入新数据 | 废弃，数据迁移到 sal_customers |
| 向 `ord_customers` 继续添加列 | 废弃，重建 sal_customers |

---

## 八、Sales V2 正确边界

### 8.1 Sales V2 应该管的

```
sal_customers         — 客户主档（含渠道分类/信用/账期）
sal_channels          — 渠道定义（直营/经销/代理）
sal_price_books       — 价格册（版本控制）
sal_price_items       — 价格明细（by 客户/渠道/等级/阶梯）
sal_sales_orders      — 销售订单（含状态机、审批标记）
sal_order_items       — 订单明细（含品级/规格/批次）
sal_delivery_orders   — 配送单（含出发/到达时间戳）
sal_delivery_stops    — 配送停靠点（门店签收记录）
sal_receipts          — 签收确认（含签收时间/照片）
sal_return_orders     — 退货单（含原订单关联、退货原因）
sal_return_items      — 退货明细
sal_credit_usage      — 信用额度流水
```

**Sales V2 管的 AR 边界：**
- 订单签收后**触发**创建 `fin_ar_invoices`（通过调用 Finance V2 AR Service）
- Sales V2 **读** `fin_ar_invoices` 做欠款展示
- Sales V2 **不直接写** `fin_ar_invoices`（通过事务内回调或 Service 调用）

### 8.2 Sales V2 不应该管的

```
fin_ar_invoices 本体管理  — 属于 Finance V2 AR Runtime
fin_ar_receipts 收款管理  — 属于 Finance V2 AR Runtime  
fin_cash_accounts        — 属于 Finance V2 Cash Runtime
总账/凭证/科目体系        — Finance V2 不管，Sales V2 更不管
鸡蛋生产记录/养殖日志     — 属于 Farming/IoT 模块
包装任务/班次管理         — 属于 Packaging 模块
IoT 设备数据             — 属于 IoT 模块
```

---

## 九、Sales V2 推荐重构路线

### Phase 0 — Clean Baseline + Legacy Freeze（1周）

**目标：** 建立 Sales V2 模块骨架，冻结旧 Sales 相关写入路径。

**工作：**
- 创建 `apps/api/src/modules/sales-v2/` 模块骨架
- 建立 Migration：`20260527_sales_v2_phase0_baseline.sql`
  - 创建 `sal_customers`（统一客户主档，含 company_code）
  - 创建 `sal_price_books`、`sal_price_items`
  - 创建 `sal_sales_orders`、`sal_order_items`
- 健康端点：`GET /api/v2/sales/health`
- **冻结旧写入**：
  - `ord_customers` 标注为 READ_ONLY（不再扩展）
  - `b2b_customers` 标注为 READ_ONLY（数据迁移到 sal_customers）
  - `ord_prices` 标注为 READ_ONLY
  - `fin_transactions` AR 写入逻辑注释禁用
- 前端：`/sales2` 占位页
- TS 零错误，`scope-audit.sh` 通过

### Phase 1 — Customer + Channel Runtime（1.5周）

**目标：** 建立统一客户主档和渠道分类体系，消灭两套客户表。

**核心表：**
```sql
sal_customers (
  id, customer_no, customer_name, 
  customer_type  VARCHAR(32)  -- DIRECT_STORE/DISTRIBUTOR/AGENT/KEY_ACCOUNT/RETAIL
  channel_code   VARCHAR(64)  -- FK → sal_channels
  company_code   VARCHAR(32)  -- Finance V2 DataScope 对齐
  credit_limit   NUMERIC(18,2)
  credit_used    NUMERIC(18,2)
  payment_terms  INT          -- 账期天数
  sales_rep_id   BIGINT       -- 归属销售员
  risk_flag      VARCHAR(32)  -- NORMAL/WATCH/BLACKLIST
  status         VARCHAR(32)  -- ACTIVE/FROZEN/BLACKLIST
  region_code    VARCHAR(64)
  -- 联系信息
  contact_name, contact_phone, delivery_addr
)

sal_channels (
  id, channel_code, channel_name, channel_type, company_code
)
```

**API：** `GET/POST/PATCH /api/v2/sales/customers`、`GET /api/v2/sales/channels`  
**DataScope：** 全程 `company_code = ANY($n)`  
**数据迁移：** `ord_customers` + `b2b_customers` → `sal_customers`

### Phase 2 — Price Runtime（1.5周）

**目标：** 建立统一定价引擎，消灭三套价格表，接入移动端动态定价。

**核心表：**
```sql
sal_price_books (
  id, price_book_no, price_book_name,
  channel_type, customer_code,    -- 渠道价 or 客户专属价
  effective_from, effective_to,
  status, company_code,
  approved_by, approved_at       -- 价格审批
)

sal_price_items (
  id, price_book_id, product_code, grade_code,
  packaging_spec,                 -- 鸡蛋包装规格（30枚/托/箱）
  unit_price, floor_price, ceiling_price,
  min_qty, max_qty,               -- 数量阶梯
  currency_code
)
```

**SalesEngine 改造：** 读 `sal_price_items`，不再读 `prc_price_items`  
**移动端：** 删除硬编码 `DEFAULT_PRICES`，从 `/api/v2/sales/prices/current` 动态加载  
**价格审批：** 接入 Workflow 2.0（`PRICE_CHANGE_APPROVAL` 业务类型）

### Phase 3 — Sales Order Runtime（2周）

**目标：** 重建订单模块，接入 Workflow 2.0，修复 AR 联动。

**核心表：**
```sql
sal_sales_orders (
  id, order_no, customer_id,
  company_code, channel_type, warehouse_code,
  price_book_id,
  status, subtotal, discount, total_amount, currency_code,
  need_price_approval, need_credit_approval,
  wf_instance_id,               -- ← Workflow 2.0 接入
  delivery_date, delivery_addr,
  ar_invoice_id,                -- ← Finance V2 fin_ar_invoices FK（订单签收后填入）
  sales_rep_id, created_at, updated_at
)
```

**关键修复：**
- 订单 RECEIVED 时调用 Finance V2 `ArInvoicesService.createFromSalesOrder()` 创建 `fin_ar_invoices`
- 低价审批/赊销审批均通过 `ApprovalEngineService.startApproval()` 创建工作流实例
- B2B 订单 APPROVED 后自动触发 WMS 出库扣库存（复用现有 `advanceOutboundOrder` 模式）
- 全面 DataScope（`company_code`）

### Phase 4 — Delivery Runtime（1.5周）

**目标：** 重建配送模块，建立配送单与订单的正式关联，加入时间戳。

**核心表：**
```sql
sal_delivery_orders (
  id, delivery_no, wave_date, vehicle_id, driver_id,
  status,                        -- PLANNED/LOADING/DEPARTED/ARRIVED/CLOSED
  loading_start_at, loading_end_at,
  departure_at, expected_arrival_at, actual_arrival_at,
  company_code
)

sal_delivery_order_items (
  id, delivery_id, sales_order_id, store_code,
  planned_qty, actual_qty,
  receipt_status                 -- PENDING/SIGNED/EXCEPTION
)

sal_receipts (
  id, receipt_no, delivery_item_id, sales_order_id,
  received_at, received_qty, exception_qty,
  exception_type, note, signed_by, photo_url
)
```

**库存联动：** 签收完成后，`wms.service` 写 `inv_ledger SALE_OUT`  
**超时预警：** 基于 `expected_arrival_at` vs `CURRENT_TIMESTAMP` 触发通知

### Phase 5 — AR Integration + Credit Control（1.5周）

**目标：** 打通 Sales → Finance V2 AR 完整链路，实现账期+信用双控。

**Finance V2 接入：**
- `SalesOrderService` 在事务内调用 `FinArInvoicesService.create()` 创建 AR Invoice
- `sal_sales_orders.ar_invoice_id` 写入 `fin_ar_invoices.id`
- 欠款查询：`GET /api/v2/sales/customers/:id/ar-aging` → 读 `fin_ar_invoices`

**信用控制增强：**
- 账期逾期检测：`fin_ar_invoices` 中 `due_date < CURRENT_DATE` 的未收款金额超阈值 → 冻结下单
- 信用审批接入 Workflow 2.0

### Phase 6 — Sales Return Runtime（1周）

**目标：** 建立退货单，接入 AR 冲销（Credit Note）和库存回退。

**核心表：**
```sql
sal_return_orders (
  id, return_no, original_order_id,
  return_reason, return_type,    -- QUALITY/OVERSTOCK/WRONG_PRODUCT
  status, wf_instance_id,        -- 退货审批走 Workflow
  credit_note_id,                -- FK → fin_ar_invoices (credit note)
  company_code
)

sal_return_items (
  id, return_id, product_code, grade_code,
  return_qty, unit_price, amount,
  restocked_qty, damaged_qty     -- 回库vs损耗分类
)
```

**AR 冲销：** 退货审批通过后调用 Finance V2 创建 Credit Note 型 AR Invoice（负金额）  
**库存回退：** `restocked_qty` 写 `inv_ledger SALE_RETURN`，`damaged_qty` 写 `WRITE_OFF`

### Phase 7 — Egg Grade + Inventory Enhancement（1周）

**目标：** 针对鸡蛋业务，完善库存批次字段。

**inv_batches 增强：**
```sql
ALTER TABLE inv_batches ADD COLUMN grade_code       VARCHAR(16);   -- 0/1/2/3/4/5/DIRTY/BROKEN
ALTER TABLE inv_batches ADD COLUMN packaging_spec   VARCHAR(32);   -- 30_PCS_TRAY/360_PCS_CASE
ALTER TABLE inv_batches ADD COLUMN production_date  DATE;
ALTER TABLE inv_batches ADD COLUMN farm_code        VARCHAR(32);   -- 来源农场
```

**出库关联品级：** `sal_order_items.grade_code` 对应 `inv_batches.grade_code`  
**配送批次可追溯：** `sal_delivery_order_items.batch_no` FK → `inv_batches.batch_no`

### Phase 8 — Sales Dashboard + Reports（1周）

**目标：** 建立销售报表层，接入 Finance V2 Reports Runtime。

**新增报表接口（只读聚合）：**
- `GET /api/v2/sales/reports/daily-summary` — 日销售汇总（POS+B2B）
- `GET /api/v2/sales/reports/customer-ar-aging` — 客户欠款账龄（读 fin_ar_invoices）
- `GET /api/v2/sales/reports/channel-sales` — 渠道销量
- `GET /api/v2/sales/reports/price-exceptions` — 低于底价销售明细
- `GET /api/v2/sales/reports/delivery-performance` — 配送时效报表

### Phase 9 — Mobile Sales + Delivery App（1.5周）

**目标：** 重建移动端销售和配送页面，删除硬编码价格。

**移动端改造：**
- 农场直销：价格从 `/api/v2/sales/prices/current` 动态加载，按品级展示
- 经销商下单：手机端 B2B 快速下单
- 配送签收：实时签收，拍照上传，写 `sal_receipts`
- 客户查询：查询客户欠款、历史订单

---

## 十、与 Finance V2 的关系

### 10.1 Sales Order 什么时候生成 AR？

**当前：** 订单 RECEIVED 状态时，向已废弃的 `fin_transactions` 写一条记录（`.catch()` 容错）。  
**Sales V2 应该：** 订单状态流转到 **SHIPPED**（已发货，所有权转移）时，在**同一事务**内：
1. 调用 `FinArInvoicesService.create()` 创建 `fin_ar_invoices` 记录
2. 将返回的 `ar_invoice_id` 写入 `sal_sales_orders.ar_invoice_id`
3. AR Invoice 的 `due_date = shipped_date + customer.payment_terms`

> 注：鸡蛋行业特点是货到付款或短账期，建议在**货物签收（RECEIVED）**时再创建 AR，而非发货时，以匹配经销商习惯。

### 10.2 收款是否必须走 Finance V2 AR Receipt？

**是。** 任何来自客户的收款都必须走 `fin_ar_receipts`（Finance V2 AR Runtime），不得绕过。  
Sales V2 读取 `fin_ar_invoices.balance_amount_base` 展示欠款，但**不直接写** AR 收款。  
后台财务人员在 Finance V2 AR 模块录入收款，Sales V2 实时读取欠款变化。

### 10.3 客户欠款是否读取 fin_ar_invoices？

**Sales V2 全面改为读 `fin_ar_invoices`。**  
```sql
-- 客户欠款查询：
SELECT customer_name, SUM(balance_amount_base) AS outstanding,
       MIN(due_date) AS earliest_due
FROM fin_ar_invoices
WHERE source_ref LIKE 'SAL-%'  -- Sales 单据
  AND status NOT IN ('COLLECTED','CANCELLED')
  AND customer_code = $1
GROUP BY customer_name;
```

### 10.4 赊销审批是否走 Workflow？

**Sales V2 必须走 Workflow 2.0。**  
- 触发条件：`total_amount > (credit_limit - credit_used)`
- 创建 `wf_instance`，bizType = `SALES_CREDIT_APPROVAL`
- 审批通过 `onApproved` 回调：更新 `sal_sales_orders.status = APPROVED`，同时预占信用额度
- 审批拒绝 `onRejected` 回调：更新 status = REJECTED，不预占

### 10.5 低价销售审批是否走 Workflow？

**Sales V2 必须走 Workflow 2.0。**  
- 触发条件：任意订单行 `unit_price < sal_price_items.floor_price`
- 创建 `wf_instance`，bizType = `SALES_PRICE_APPROVAL`
- 审批记录可查，含：低于底价的具体产品、实际价格、底价、差额百分比

### 10.6 退货退款是否进入 AR 冲销或 Credit Note？

**Sales V2 退货流程：**
1. 退货审批通过（Workflow）
2. 调用 Finance V2 创建 Credit Note：`fin_ar_invoices`，`invoice_type = CREDIT_NOTE`，金额为负数
3. Credit Note 自动与原 AR Invoice 做核销（`fin_ar_receipt_allocations`）
4. 如有现金退款，走 `fin_ar_receipts`（收款为负，即退款）

---

## 十一、与库存/仓库的关系

### 11.1 是否已有库存 Runtime？

**有轻度 Runtime，能用于 POS 场景：**

| 组件 | 状态 |
|-----|------|
| `inv_batches` 库存批次 | ✅ 可用（缺蛋品字段） |
| `inv_ledger` 库存流水 | ✅ Append-only，POS 场景完整 |
| WMS 入库（wms_inbound） | ✅ 可用 |
| B2B 出库联动 | ❌ 需手动 |
| 蛋品等级/规格/生产日期 | ❌ 无字段 |

**结论：** 现有库存 Runtime 是 POS 场景的"够用"状态，对 B2B 鸡蛋销售业务不够用。

### 11.2 Sales V2 是否需要先做轻量库存？

**需要在 Phase 7 做 Inventory Enhancement，而非独立做一个完整 WMS。**  
不需要重建 WMS，只需要：
1. 向 `inv_batches` 补充 `grade_code`、`packaging_spec`、`production_date`、`farm_code` 字段
2. 修复 B2B 订单出库的库存联动（APPROVED 时自动触发出库）
3. 在 `sal_order_items` 中记录 `batch_no` + `grade_code`，与 `inv_batches` 对应

### 11.3 鸡蛋销售是否需要按维度管理？

| 维度 | 必要性 | 说明 |
|-----|-------|------|
| 仓库 | ✅ 必要 | 两个养殖场各有仓库，不同仓库货品不可混用 |
| 批次 | ✅ 必要 | 每日入库是一个批次，用于追溯 |
| 等级（品级） | ✅ 必要（核心）| 0号/1号/2号/脏蛋/破损蛋价格不同 |
| 包装规格 | ✅ 必要 | 散装/30枚托/360枚箱，不同规格不同单价 |
| 生产日期 | ✅ 必要 | FIFO 出库需要，也是客户关心的新鲜度指标 |

**结论：** 鸡蛋作为农产品，必须按以上5个维度管理，当前 `inv_batches` 仅支持其中部分维度。

### 11.4 出库是否必须扣库存？

**是，必须，且必须在同一事务内完成。**  

```
Sales Order SHIPPED
  → 同事务内：
      1. UPDATE inv_batches SET qty_available = qty_available - delivered_qty
      2. INSERT inv_ledger (SALE_OUT, ref_no = order_no)
      3. 若库存不足 → 抛异常，订单不可发货
```

### 11.5 退货是否必须回库或进入损耗？

**是，退货时必须明确分类：**

| 退货类型 | 处理方式 | 库存操作 |
|---------|---------|---------|
| 质量完好，可二次销售 | 回库 | `inv_ledger SALE_RETURN`，`inv_batches.qty_available +` |
| 破损/过期，不可销售 | 损耗 | `inv_ledger WRITE_OFF`，`inv_batches` 减 qty |
| 部分可用部分损耗 | 分单处理 | 两条 ledger 记录 |

---

## 十二、审计结论

### 核心结论

**Sales 模块可以、也应该推翻重建。** 理由：

1. **数据未生产化**：系统尚未承载真实业务数据，不存在历史数据迁移的包袱（仅客户数据需迁移）。
2. **架构债务超过修补价值**：两套客户表、三套价格表、AR 完全脱节，修补成本等于重建。
3. **与 Finance V2 不兼容**：DataScope 机制（store_code vs company_code）从根本上不兼容，必须重建才能对齐。
4. **幽灵字段是安全隐患**：SalesEngine 在生产环境会静默失效（黑名单检测失效），必须修复。

### 推荐重建策略

- **保留**：WMS 库存逻辑（inv_batches + inv_ledger + POS 联动）、状态机设计思路
- **冻结**：旧 Sales 写入路径（ord_customers, b2b_customers, ord_prices, fin_transactions AR 写入）
- **重建**：统一以 `sal_` 前缀建立新表，以 Finance V2 DataScope 模式为基准，以 Workflow 2.0 为审批底座
- **优先级**：Phase 0-3（Customer + Price + Order 是最紧迫的，直接对应三个经营痛点）

### 预估工期

| 阶段 | 工期 | 价值 |
|-----|------|------|
| Phase 0 — 基线 + 冻结 | 1周 | 防止旧系统继续写入脏数据 |
| Phase 1 — Customer + Channel | 1.5周 | 消灭双客户表，统一客户主档 |
| Phase 2 — Price Runtime | 1.5周 | 消灭三套价格表，接入动态定价 |
| Phase 3 — Sales Order | 2周 | 修复 AR 联动，接入 Workflow |
| Phase 4 — Delivery | 1.5周 | 配送可追踪，签收有时间戳 |
| Phase 5 — AR Integration | 1.5周 | 打通应收账款管理全链路 |
| Phase 6 — Return | 1周 | 退货+AR冲销 |
| Phase 7 — Egg Inventory | 1周 | 按品级/规格/生产日期管库存 |
| Phase 8 — Reports | 1周 | 销售日报、客户欠款、价格异常 |
| Phase 9 — Mobile | 1.5周 | 移动端动态定价、配送签收 |
| **合计** | **约13周** | — |

---

*文档版本：1.0 | 审计完成：2026-05-26 | 下次审计：Sales V2 Phase 3 完成后*
