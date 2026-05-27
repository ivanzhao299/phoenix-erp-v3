# Phoenix ERP V3 — Sales V2 Architecture

> 版本：Phase 0 Clean Baseline · 日期：2026-05-27
>
> 本文档是 Sales V2 重构的正式架构边界文件。所有 Sales V2 开发须以本文档为准。

---

## 一、Runtime 边界

### Sales V2 管辖范围

| 模块 | 表 | Phase | 状态 |
|------|-----|-------|------|
| Customer Runtime | `sal_customers` | Phase 1 | 🔴 开发中 |
| Channel Runtime | `sal_channels` | Phase 1 | 🔴 开发中 |
| Price Runtime | `sal_price_books`, `sal_price_items` | Phase 2 | 🔴 开发中 |
| Sales Order Runtime | `sal_sales_orders`, `sal_order_items` | Phase 3 | 🔴 开发中 |
| Delivery Runtime | `sal_delivery_orders`（Phase 4 新建） | Phase 4 | 🔴 开发中 |
| Sales Return Runtime | `sal_return_orders`（Phase 6 新建） | Phase 6 | 🔴 开发中 |
| Sales Reports | 只读聚合层 | Phase 8 | 🔴 开发中 |

### Sales V2 不管辖（边界外）

| 内容 | 归属 |
|------|------|
| 总账/会计凭证 | Finance V2（fin_* 表） |
| 现金账户本体 | Finance V2（fin_cash_accounts） |
| 应收发票生成与核销 | Finance V2 AR Runtime（fin_ar_invoices） |
| 审批引擎 | Workflow 2.0（wf_* 表） |
| 生产养殖记录 | Breeding（brd_* 表） |
| IoT 设备数据 | IoT 模块 |
| 采购供应 | Procurement V2（prc2_* 表） |

---

## 二、Legacy Freeze 清单

以下旧表 **不删除、不迁移、不扩展**，标记为 `[LEGACY][READ_ONLY]`：

| 旧表 | 问题 | 迁移目标 | 迁移 Phase |
|------|------|---------|-----------|
| `ord_customers` | 无 company_code，幽灵字段，与 b2b_customers 重复 | `sal_customers` | Phase 1 |
| `b2b_customers` | 无 company_code，与 ord_customers 并行存在 | `sal_customers` | Phase 1 |
| `ord_prices` | 与 SalesEngine 脱节，无有效期审批 | `sal_price_books` + `sal_price_items` | Phase 2 |
| `prc_price_items` | 采购表被 SalesEngine 错误引用 | `sal_price_items` | Phase 2 |
| `DEFAULT_PRICES`（移动端硬编码） | 移动端价格绕过价格引擎 | `sal_price_items` | Phase 9 |
| `log_dispatch` | Generic-CRUD Demo，无业务逻辑 | `sal_delivery_orders` | Phase 4 |
| `log_receipts` | 与订单脱节 | `sal_receipts` | Phase 4 |
| `log_routes` | 无关联数据 | `sal_routes` | Phase 4 |

### fin_transactions AR 写入路径（已废弃）

```
order.service.ts:
  RECEIVED  → INSERT fin_transactions (AR-TRADE, DEBIT)   ← [DEPRECATED]
  RECONCILED → INSERT fin_transactions (AR-TRADE, CREDIT)  ← [DEPRECATED]
```

**Phase 3 切换路径：**
```
sal_sales_orders.status = RECEIVED
  → ArInvoicesService.create({
      source_type: 'SALES_ORDER',
      source_no: order_no,
      customer_code: ...,
      company_code: ...,
      amount: total_amount,
    })
  → fin_ar_invoices.id 写回 sal_sales_orders.ar_invoice_id
```

---

## 三、DataScope 对齐

### 原则

| 字段 | Sales V2 方向 |
|------|-------------|
| `company_code` | ✅ 所有 sal_* 表的 DataScope 字段 |
| `store_code` | ❌ 禁止在 sal_* 表作为主隔离字段 |

### 与 Finance V2 对齐

Finance V2 使用 `company_code` 做全局 DataScope，Sales V2 须保持一致：

```typescript
// Finance V2 DataScope 示例
applyToQb(qb, { alias: 't', companyField: 'company_code' })

// Sales V2 Phase 1+ 同款使用
applyToQb(qb, { alias: 'c', companyField: 'company_code' })
```

---

## 四、Finance V2 AR 集成路线

### 当前状态（Phase 0）

- `order.service.ts` 写 `fin_transactions`（已废弃，含 TODO 注释）
- `fin_ar_invoices` 字段 `order_no` 已存在，但未被自动填充

### Phase 3 集成方案

```
销售订单签收（status → RECEIVED）
  ↓
Sales V2 Order Service
  ↓
Finance V2 ArInvoicesService.create()
  ↓
fin_ar_invoices（status=OPEN）
  ↓
财务人员在 /finance2/ar 核销收款
  ↓
fin_ar_receipts（核销分摊）
```

### 欠款账龄（Phase 5）

```
读取 fin_ar_invoices WHERE customer_code = ?
  AND status IN ('OPEN', 'PARTIALLY_RECEIVED', 'OVERDUE')
  AND company_code IN (DataScope)
```

### 赊销审批（Phase 3 + Workflow 2.0）

```
sal_sales_orders.need_credit_approval = true
  → Workflow 2.0 SALES_CREDIT_APPROVAL 流程
  → wf_instance_id 写入 sal_sales_orders
  → 审批通过 → status = APPROVED
```

---

## 五、Workflow 2.0 集成路线

| 审批类型 | 触发条件 | Phase | Workflow 业务类型 |
|---------|---------|-------|----------------|
| 价格审批 | unit_price < floor_price | Phase 2 | `SALES_PRICE_APPROVAL` |
| 赊销审批 | total_amount > credit_limit - credit_used | Phase 3 | `SALES_CREDIT_APPROVAL` |
| 退货审批 | 客户发起退货 | Phase 6 | `SALES_RETURN_APPROVAL` |
| 价格册审批 | sal_price_books 状态变更 | Phase 2 | `SALES_PRICE_BOOK_APPROVAL` |

---

## 六、Customer Runtime 路线（Phase 1）

### 设计目标

- 统一 `ord_customers` + `b2b_customers` → `sal_customers`
- DataScope: `company_code`
- 支持 5 种客户类型：`DIRECT_STORE` / `DISTRIBUTOR` / `AGENT` / `KEY_ACCOUNT` / `RETAIL`
- 信用控制：`credit_limit` / `credit_used` / `payment_terms`
- 风险分级：`NORMAL` / `WATCH` / `BLACKLIST`

### Phase 1 API（规划）

```
GET    /api/v2/sales/customers          列表（DataScope 过滤）
POST   /api/v2/sales/customers          新建
GET    /api/v2/sales/customers/:id      详情
PATCH  /api/v2/sales/customers/:id      更新
POST   /api/v2/sales/customers/:id/freeze   冻结
POST   /api/v2/sales/customers/:id/activate  解冻

GET    /api/v2/sales/channels           渠道列表
POST   /api/v2/sales/channels           新建渠道
```

---

## 七、Price Runtime 路线（Phase 2）

### 设计目标

- 统一 `ord_prices` + `prc_price_items`（Sales 引用部分）→ `sal_price_books` + `sal_price_items`
- 支持：渠道价、客户专属价、品级价（0/1/2/3/4/5/DIRTY/BROKEN）
- 支持：包装规格价（LOOSE / 30_PCS_TRAY / 360_PCS_CASE）
- 支持：数量阶梯价（min_qty / max_qty）
- 底价保护（`floor_price`）：低于此须走 Workflow 价格审批
- 价格册状态机：DRAFT → PENDING_APPROVAL → APPROVED → ACTIVE → EXPIRED

### 价格查找优先级（Phase 3 Sales Order 使用）

```
1. customer_code 专属价格册（ACTIVE）
2. channel_code 渠道价格册（ACTIVE）
3. 公司默认价格册（ACTIVE）
4. 无价格 → 拒绝下单
```

---

## 八、Delivery Runtime 路线（Phase 4）

### 新表（Phase 4 建立）

```sql
sal_delivery_orders:
  order_no, sales_order_id (FK)
  company_code, channel_code
  vehicle_no, driver_id, driver_name
  load_at      TIMESTAMPTZ  -- 装车时间
  depart_at    TIMESTAMPTZ  -- 发车时间
  arrive_at    TIMESTAMPTZ  -- 到达时间
  signed_at    TIMESTAMPTZ  -- 签收时间
  status       VARCHAR      -- PENDING/LOADED/DEPARTED/ARRIVED/SIGNED/EXCEPTION
  sla_minutes  INTEGER      -- 超时阈值（分钟）
  exception_note TEXT
  ...
```

### 取代关系

| 旧表 | 问题 | 新表 |
|------|------|------|
| `log_dispatch` | Generic-CRUD Demo，无 FK，无时间戳 | `sal_delivery_orders` |
| `log_receipts` | 与订单脱节 | `sal_delivery_orders.signed_at` |

---

## 九、Inventory Integration 路线（Phase 7）

### 当前问题

- `inv_batches` 有 `product_code` 但无 `grade_code` 和 `packaging_spec`
- 鸡蛋出库需要按品级+包装规格精确扣减
- `wms_outbound` 出库后写 `inv_ledger`，但未区分品级

### Phase 7 方案

```sql
-- inv_batches 补充字段
ALTER TABLE inv_batches ADD COLUMN IF NOT EXISTS grade_code       VARCHAR(16);
ALTER TABLE inv_batches ADD COLUMN IF NOT EXISTS packaging_spec   VARCHAR(64);
ALTER TABLE inv_batches ADD COLUMN IF NOT EXISTS production_date  DATE;
```

出库时按 `(product_code, grade_code, packaging_spec)` 匹配批次扣减。

---

## 十、Phase 路线总览

| Phase | 内容 | 前置条件 |
|-------|------|---------|
| **Phase 0 ✅** | Clean Baseline + Legacy Freeze | 无 |
| Phase 1 | Customer + Channel Runtime | Phase 0 完成 |
| Phase 2 | Price Runtime | Phase 1 完成（客户主档） |
| Phase 3 | Sales Order Runtime | Phase 1+2 完成 |
| Phase 4 | Delivery Runtime | Phase 3 完成（订单 FK） |
| Phase 5 | AR Integration + Credit Control | Phase 3 + Finance V2 Phase 2 |
| Phase 6 | Sales Return Runtime | Phase 3+4+5 完成 |
| Phase 7 | Egg Inventory Enhancement | Phase 4 完成 |
| Phase 8 | Sales Reports | Phase 3+5 完成 |
| Phase 9 | Mobile Sales + Delivery App | Phase 3+4 完成 |

---

## 附：已完成文件清单（Phase 0）

### 后端

```
apps/api/src/modules/sales-v2/
  sales-v2.module.ts
  controllers/sales-v2.controller.ts      GET /api/v2/sales/health
  services/sales-v2.service.ts            Health 响应逻辑
  entities/
    index.ts
    sal-customer.entity.ts                sal_customers
    sal-channel.entity.ts                 sal_channels
    sal-price-book.entity.ts              sal_price_books
    sal-price-item.entity.ts              sal_price_items
    sal-sales-order.entity.ts             sal_sales_orders
    sal-order-item.entity.ts              sal_order_items
```

### 数据库

```
apps/api/migrations/20260527_sales_v2_phase0_baseline.sql
  · sal_channels
  · sal_customers
  · sal_price_books
  · sal_price_items
  · sal_sales_orders
  · sal_order_items
  · 索引（company_code / status / customer_code）
  · Legacy 表注释标记（READ_ONLY）
```

### 前端

```
apps/web/src/components/LegacyFreezeBanner.tsx       冻结提示组件

apps/web/src/app/(admin)/sales2/
  page.tsx                                           Sales V2 总览
  customers/page.tsx                                 客户主档占位
  pricing/page.tsx                                   价格管理占位
  orders/page.tsx                                    销售订单占位
  delivery/page.tsx                                  配送管理占位
  reports/page.tsx                                   销售报表占位

旧页面（LegacyFreezeBanner 已添加）：
  /order/customers/page.tsx                          → Phase 1
  /b2b/customers/page.tsx                            → Phase 1
  /order/prices/page.tsx                             → Phase 2
  /transport/page.tsx                                → Phase 4
```

### Sidebar

```
apps/web/src/components/layout/Sidebar.tsx
  · 新增 "Sales V2" 导航组（/sales2 及五个子路由）
```

### 文档

```
docs/sales-v2-architecture.md               本文档
docs/sales-v2-architecture-audit.md         架构审计报告（参考）
```
