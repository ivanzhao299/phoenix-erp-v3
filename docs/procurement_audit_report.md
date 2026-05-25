# 采购模块全面审计报告

**项目**：Phoenix ERP  
**审计日期**：2026-05-24  
**审计范围**：采购申请、采购订单、供应商管理、付款管理、收货确认、看板汇总  
**状态**：已完成初轮修复（P0/P1/P2/P3），本文记录当前全貌及遗留待办

---

## 一、功能模块概览

### 1.1 前端页面（8 个）

| 文件路径 | 功能 | 访问端 |
|----------|------|--------|
| `(admin)/procurement/page.tsx` | 采购看板（Dashboard） | PC |
| `(admin)/procurement/requests/page.tsx` | 采购申请管理（新建/转 PO/拒绝/删除） | PC |
| `(admin)/procurement/order/page.tsx` | 采购订单管理（新建/提交审批/状态推进） | PC |
| `(admin)/procurement/payments/page.tsx` | 待付款列表 + 确认付款 | PC |
| `(admin)/procurement/arrival/page.tsx` | 收货确认 | PC |
| `(admin)/procurement/reconcile/page.tsx` | 饲料耗料对账 | PC |
| `(admin)/procurement/suppliers/page.tsx` | 供应商列表 + KPI | PC |
| `(mobile)/mobile/procurement/page.tsx` | 移动端采购审批 | 手机 |

### 1.2 后端 API 端点（19 个）

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/procurement/dashboard` | 看板汇总 |
| GET | `/api/procurement/requests` | 采购单列表（草稿/待审） |
| GET | `/api/procurement/orders` | 采购订单列表 |
| POST | `/api/procurement/create` | 新建采购单 |
| POST | `/api/procurement/:poNo/submit` | 提交审批（含合同/审批人） |
| GET | `/api/procurement/approvers` | 获取可用审批人列表 |
| POST | `/api/procurement/:poNo/approve` | 批准采购单 |
| GET | `/api/procurement/pending-payments` | 待付款列表 |
| POST | `/api/procurement/payments/:id/confirm` | 确认付款 |
| POST | `/api/procurement/:poNo/confirm-receipt` | 收货确认 |
| POST | `/api/procurement/receipts/:receipt_no/confirm` | 收货确认（兼容旧路由） |
| GET | `/api/procurement/suppliers` | 供应商列表 |
| GET | `/api/procurement/supplier-kpi` | 供应商 KPI |
| GET | `/api/procurement/three-way-match/:po_no` | 三单比对 |
| GET | `/api/procurement/feed-reconciliation` | 饲料耗料对账 |
| GET | `/api/procurement/purchase-requests` | 采购申请列表 |
| POST | `/api/procurement/purchase-requests` | 新建采购申请 |
| POST | `/api/procurement/purchase-requests/:id/convert` | 申请转 PO |
| POST | `/api/procurement/purchase-requests/:id/reject` | 拒绝申请 |

---

## 二、数据库表结构

### 2.1 表清单（13 张，含价格子系统）

| 表名 | 行数 | 说明 |
|------|------|------|
| `prc_purchase_requests` | 21 | 采购申请 |
| `prc_purchase_orders` | 6 | 采购订单 |
| `prc_suppliers` | 8 | 供应商主档 |
| `prc_purchase_payments` | — | 付款记录 |
| `prc_purchase_items` | — | 采购明细行 |
| `prc_receipts` | — | 收货记录 |
| `prc_returns` | — | 退货记录 |
| `prc_supplier_returns` | — | 供应商退货 |
| `prc_floating_prices` | — | 浮动价格 |
| `prc_price_approvals` | — | 价格审批 |
| `prc_price_books` | — | 价格手册 |
| `prc_price_items` | — | 价格明细 |
| `prc_promotion_roi` | — | 促销 ROI |

> 价格子系统（prc_price_*、prc_floating_prices）有独立 API，本次不在审计范围内。

---

### 2.2 prc_purchase_orders（采购订单）

| 字段 | 类型 | 主键/默认 | 说明 |
|------|------|-----------|------|
| `po_no` | text | **PRIMARY KEY** | 采购单号，格式 PO-YYYYMMDD-XXXXX |
| `id` | bigint | 自增序列 | 前端/Entity 引用 ID（非主键） |
| `contract_no` | varchar | — | 合同号，格式 HT-YYYY-NNNNN |
| `subject` | varchar | — | 采购主题 |
| `supplier_code` | text | — | 供应商代码 |
| `supplier_name` | varchar | — | 供应商名称 |
| `total_amount` | numeric | — | 合同总金额 |
| `currency_code` | varchar | 'LAK' | 货币 |
| `plan_qty` | integer | 0 | 计划数量 |
| `received_qty` | integer | 0 | 已收数量 |
| `expected_date` | **text** | — | ⚠️ 期望到货日（应为 date 类型，当前 text） |
| `pay_deadline` | date | — | 付款截止日 |
| `status` | text | 'DRAFT' | 采购单状态 |
| `approver_id` | integer | — | 审批人 ID |
| `approver_name` | varchar | — | 审批人姓名 |
| `approved_by` | bigint | — | 批准人 ID |
| `approved_at` | timestamp | — | 批准时间（无时区） |
| `contract_url` | text | — | 合同文件 URL |
| `contract_note` | text | — | 合同摘要 |
| `store_code` | varchar | 'ALL' | 所属门店/仓库 |
| `created_by` | text | — | 创建人 |
| `created_at` | timestamptz | CURRENT_TIMESTAMP | 创建时间 |
| `updated_at` | timestamptz | CURRENT_TIMESTAMP | 更新时间 |
| `remark` | text | — | 备注 |
| `order_no` | text | — | 冗余字段（与 po_no 重叠，历史遗留） |

**索引**：
```
prc_purchase_orders_pkey     PRIMARY KEY (po_no)
idx_prc_po_status            btree (status)
idx_prc_po_store_code        btree (store_code)
idx_prc_po_supplier          btree (supplier_code)
```
> `prc_purchase_orders_po_no_key`（重复唯一约束）已于本轮修复中删除。

---

### 2.3 prc_purchase_requests（采购申请）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | integer | PRIMARY KEY（自增） |
| `req_no` | text | 申请单号，格式 PR-YYYYMMDD-XXXXX |
| `subject` | varchar(256) | 申请主题 |
| `item` | text | 物品/规格描述 |
| `qty` | **text** | ⚠️ 数量（应为 numeric，当前 text） |
| `unit` | varchar | 单位 |
| `budget_amount` | numeric | 预算金额 |
| `currency_code` | varchar | 'LAK' |
| `category` | varchar | 'OTHER' | 采购类别 |
| `urgency` | varchar | 'NORMAL' | 紧急程度：NORMAL / URGENT / CRITICAL |
| `dept` | text | 申请部门 |
| `applicant` | text | 申请人姓名（冗余，与 requester_id 重叠） |
| `requester_id` | integer | 申请人 user_id |
| `supplier_code` | varchar | 倾向供应商代码 |
| `supplier_name` | varchar | 倾向供应商名称 |
| `expected_date` | date | 期望到货日 |
| `reason` | text | 申请理由 |
| `status` | text | 申请状态（见状态机） |
| `po_no` | varchar | 转单后关联的采购单号 |
| `approved_by` | **varchar** | ⚠️ 审批人（应为 integer/外键，当前 varchar） |
| `approved_at` | timestamp | 审批时间（无时区） |
| `reject_note` | text | 拒绝原因 |
| `reviewer_name` | varchar | 审核人姓名（冗余） |
| `store_code` | varchar | 所属门店 |
| `attachment_url` | text | 附件 URL |
| `created_at` | **timestamptz** | 创建时间（本轮已修复，原为 varchar） |
| `updated_at` | **timestamptz** | 更新时间（本轮已修复，原为 text） |

---

### 2.4 prc_suppliers（供应商）

| 字段 | 类型 | 说明 |
|------|------|------|
| `supplier_code` | text | PRIMARY KEY |
| `id` | bigint | 自增辅助 ID |
| `supplier_name` | text | 供应商名称 |
| `contact_person` | text | ⚠️ 联系人（与 contact_name 重复） |
| `contact_name` | varchar | ⚠️ 联系人（与 contact_person 重复） |
| `phone` | text | ⚠️ 电话（与 contact_phone 重复） |
| `contact_phone` | varchar | ⚠️ 电话（与 phone 重复） |
| `address` | text | 地址 |
| `supplier_type` | varchar | 供应商类型 |
| `credit_days` | integer | 账期天数 |
| `store_code` | varchar | 所属门店 |
| `status` | text | 状态 |
| `created_at` | **text** | ⚠️ 创建时间（应为 timestamptz） |
| `updated_at` | **text** | ⚠️ 更新时间（应为 timestamptz） |

---

### 2.5 prc_purchase_payments（付款记录）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | integer | PRIMARY KEY |
| `pay_no` | text | 付款单号 |
| `po_no` | text | 关联采购单号 |
| `amount` | numeric | 付款金额 |
| `pay_method` | text | 付款方式 |
| `operator` | text | 操作人 |
| `status` | text | 状态 |
| `created_at` | **varchar** | ⚠️ 应为 timestamptz |
| `updated_at` | **text** | ⚠️ 应为 timestamptz |

---

### 2.6 prc_receipts（收货记录）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | integer | PRIMARY KEY |
| `receipt_no` | text | 收货单号 |
| `po_no` | text | 关联采购单号 |
| `supplier` | text | 供应商名（冗余，非外键） |
| `item` | text | 物品 |
| `expected_qty` | **text** | ⚠️ 期望数量（应为 numeric） |
| `actual_qty` | **text** | ⚠️ 实际数量（应为 numeric，同时有 numeric 版 `actualQty` 字段） |
| `actualQty` | numeric | ⚠️ 驼峰命名，与 actual_qty 重复 |
| `status` | text | 状态 |
| `confirmed_at` | **text** | ⚠️ 应为 timestamptz |
| `created_at` | **varchar** | ⚠️ 应为 timestamptz |
| `updated_at` | **text** | ⚠️ 应为 timestamptz |

---

## 三、状态机定义（修复后）

### 3.1 采购申请（prc_purchase_requests）

```
新建 → DRAFT
提交 → PENDING     （待采购部审核）
审核通过转单 → CONVERTED  （已生成采购单，关联 po_no）
审核拒绝    → REJECTED
```

| 状态 | 显示标签 | 说明 |
|------|----------|------|
| DRAFT | 草稿 | 仅可删除 |
| PENDING | 待审核 | 可转 PO 或拒绝 |
| CONVERTED | 已转采购单 | 终态，显示关联 po_no |
| REJECTED | 已拒绝 | 终态，含拒绝备注 |

> 废弃值：SUBMITTED（历史遗留，已迁移为 PENDING）、APPROVED（申请无此状态）、PO_CREATED（前端旧值，已迁移为 CONVERTED）

---

### 3.2 采购订单（prc_purchase_orders）

```
新建 → DRAFT
提交审批 → PENDING_APPROVAL  （含合同文件 + 审批人）
审批通过 → APPROVED          （生成 AP 应付账款）
财务付款 → PAID
收货确认 → RECEIVED
```

| 状态 | 显示标签 | 说明 |
|------|----------|------|
| DRAFT | 草稿 | 可编辑，可提交审批 |
| PENDING_APPROVAL | 待审批 | 等待审批人操作 |
| APPROVED | 已批准·待付款 | 财务处理付款 |
| PAID | 已付款 | 等待收货 |
| RECEIVED | 已收货 | 终态，库存已入账 |
| CANCELLED | 已取消 | 终态 |

> 废弃值：CONFIRMED（历史遗留，已迁移为 PENDING_APPROVAL）、ARRIVING（物流模块管理，PO 状态机不再使用）

---

## 四、RBAC 权限矩阵

权限码说明：V=查看 C=创建 E=编辑 D=删除 A=审批 X=导出

| 角色 | 权限 | 可执行操作 |
|------|------|-----------|
| ROLE_ADMIN | V C E D A X | 全部操作 |
| ROLE_PRC_BUYER | V C E D X | 新建/编辑/删除申请和订单，不可审批 |
| ROLE_FARM_MGR | V C | 查看 + 新建申请（不可编辑/删除/审批） |
| ROLE_FIN_ACCT | V X | 只读 + 导出 |
| ROLE_FIN_CFO | V A X | 查看 + **审批** + 导出 |
| ROLE_CEO | V A X | 查看 + **审批** + 导出 |

> 审批人下拉（`getApprovers`）涵盖角色：ROLE_ADMIN、ROLE_REGION_MGR、ROLE_CEO、**ROLE_FIN_CFO**（本轮 Fix-3 补入）

---

## 五、本轮修复清单（已完成）

### P0 — 数据一致性

| 编号 | 问题 | 修复 |
|------|------|------|
| Fix-1 | `requests/page.tsx` 直接调用 CRUD API 转 PO，绕过 Service，合同号不生成、状态写 CONFIRMED | 改走 `/purchase-requests/:id/convert`，合同号由 Service 生成 |
| Fix-2 | `confirmReceipt()` 创建第二条 AP 应付账款，与 `approvePO()` 重复 | 删除 `confirmReceipt()` 中的 fin_transactions INSERT，AP 由 approvePO 唯一负责 |

### P1 — 业务逻辑

| 编号 | 问题 | 修复 |
|------|------|------|
| Fix-3 | `getApprovers()` 查询遗漏 ROLE_FIN_CFO，CFO 有审批权却不在列表中 | WHERE 条件加入 `'ROLE_FIN_CFO'` |
| Fix-4 | `onApproved(docId)` 使用 TypeORM `em.update({ id: docId })`，但 DB 主键为 po_no，更新 0 行不报错 | 改用 raw SQL `WHERE id=$1` |
| Fix-5 | 前端 DELETE 无状态检查，CONVERTED/REJECTED 申请可被删除 | 删除前检查 `status !== 'DRAFT'`，拒绝非草稿删除 |

### P2 — 状态枚举

| 编号 | 问题 | 修复 |
|------|------|------|
| Fix-6 | 前后端共存 14 种状态值混用 | 统一状态机（见第三节），历史值 DB 迁移，前端展示别名对齐 |

### P3 — DDL

| 编号 | 问题 | 修复 |
|------|------|------|
| Fix-7 | `prc_purchase_requests.created_at` 为 varchar(255)，`updated_at` 为 text | ALTER COLUMN TYPE timestamptz DEFAULT CURRENT_TIMESTAMP |
| Fix-8 | `prc_purchase_orders_po_no_key` UNIQUE CONSTRAINT 与主键重复 | DROP CONSTRAINT |

---

## 六、遗留问题（待后续处理）

### L1 — 数据库字段类型问题（低风险，不影响功能）

| 表 | 字段 | 当前类型 | 建议类型 | 影响 |
|----|------|----------|----------|------|
| `prc_purchase_orders` | `expected_date` | text | date | 日期查询、排序不准确 |
| `prc_purchase_orders` | `approved_at` | timestamp (no tz) | timestamptz | 跨时区部署时差异 |
| `prc_suppliers` | `created_at` | text | timestamptz | 无法正确排序/过滤 |
| `prc_suppliers` | `updated_at` | text | timestamptz | 同上 |
| `prc_purchase_payments` | `created_at` | varchar | timestamptz | 同上 |
| `prc_purchase_payments` | `updated_at` | text | timestamptz | 同上 |
| `prc_receipts` | `created_at` | varchar | timestamptz | 同上 |
| `prc_receipts` | `updated_at` | text | timestamptz | 同上 |
| `prc_receipts` | `confirmed_at` | text | timestamptz | 同上 |
| `prc_purchase_requests` | `qty` | text | numeric | 无法做数值运算 |
| `prc_purchase_requests` | `approved_by` | varchar | integer | 应为外键 user_id |
| `prc_receipts` | `expected_qty` | text | numeric | 无法做数值运算 |
| `prc_receipts` | `actual_qty` | text | numeric | 与 actualQty 字段重复 |

### L2 — 冗余字段（影响供应商管理页面，建议单独立项）

| 表 | 冗余字段对 | 说明 |
|----|-----------|------|
| `prc_suppliers` | `contact_person` vs `contact_name` | 实际数据仅 contact_person 有值 |
| `prc_suppliers` | `phone` vs `contact_phone` | 实际数据仅 phone 有值 |
| `prc_purchase_orders` | `order_no` vs `po_no` | order_no 为历史遗留，全部为空 |
| `prc_receipts` | `actual_qty` (text) vs `actualQty` (numeric) | 驼峰命名违反规范，数据重叠 |
| `prc_purchase_requests` | `applicant` (text) vs `requester_id` (int) | 姓名冗余，应通过 JOIN 获取 |

### L3 — Entity 与 DB 主键不一致（中风险）

`PurchaseOrderEntity` 中：
```typescript
@PrimaryGeneratedColumn('increment', { type: 'bigint' })
id: number;  // TypeORM 认为主键是 id
```
而 DB 实际主键是 `po_no`（text）。

**当前影响**：
- `em.update(PurchaseOrderEntity, { id: X }, ...)` 静默失败（Fix-4 已绕过）
- `em.save()` 的 INSERT 路径正常（INSERT 时 TypeORM 不依赖主键值）
- 未来新增 TypeORM 查询/更新若用 id 作为主键条件将静默失败

**建议**：重新设计主键，将 `po_no` 作为 TypeORM `@PrimaryColumn()`，或将 `id` 改为真正的 DB 主键（需迁移数据）。

### L4 — 功能完整性缺口

| 功能 | 现状 | 说明 |
|------|------|------|
| 三单比对（three-way-match） | API 已实现，无前端入口 | `prc_receipts` 表需有数据 |
| 收货确认（arrival/page.tsx） | 前端页面存在，功能待核实 | 与 `confirm-receipt` API 是否对接 |
| 供应商 KPI | API 已实现，数据依赖历史交易 | 当前数据量太少，KPI 无意义 |
| 饲料耗料对账 | API + 前端均已实现 | 依赖 `inv_feeds_usage` 表数据 |
| 移动端审批 | 仅展示 PENDING_APPROVAL 列表 + 批准操作 | 无拒绝功能 |
| 采购单取消 | 无取消接口和前端入口 | — |

### L5 — 安全与性能

| 编号 | 描述 | 风险 |
|------|------|------|
| S1 | `@Get('requests')` / `@Get('orders')` 无分页，LIMIT 300 硬编码 | 数据量大时性能下降 |
| S2 | `createPurchaseOrder` 无权限装饰器（`@RequireMenu`），仅靠 JWT 防护 | ROLE_FIN_ACCT 理论上可创建订单 |
| S3 | 合同文件上传 `/api/upload/contract` 无文件类型白名单校验（前端有，后端待确认） | 潜在文件注入 |
| S4 | `convertRequestToPO` 无幂等性保护，同一申请重复调用会创建多张 PO | 需在 DB 层或 Service 层加唯一性检查 |

---

## 七、数据现状快照（审计时）

| 指标 | 数值 |
|------|------|
| 采购申请总数 | 21 条 |
| — PENDING（待审核） | 13 条 |
| — CONVERTED（已转单） | 5 条 |
| — REJECTED（已拒绝） | 3 条 |
| 采购订单总数 | 6 条（全部 DRAFT） |
| 供应商总数 | 8 家 |

---

## 八、代码质量摘要

### 优点
- Service 层职责基本清晰，各业务方法独立
- 使用 NestJS CLS 传递用户上下文，避免在方法参数中透传 user
- 审批流程有合同文件强制校验（前端层）
- RBAC 矩阵静态定义，零 DB 查询

### 主要代码问题
1. **Service 大文件**：`procurement.service.ts` 承载了申请、订单、付款、收货、供应商、看板等全部逻辑，建议拆分为子 Service
2. **大量 `any` 类型**：Controller 和 Service 方法参数普遍使用 `any`，缺少 DTO 类和 class-validator 校验
3. **前端直接调用 CRUD API**：`order/page.tsx` 的编辑保存仍直接调用 `/api/crud/prc_purchase_orders`，绕过 Service 层校验
4. **错误处理不统一**：部分 catch 块静默吞掉异常（`catch {/***/}`），给调试带来困难

---

*报告生成时间：2026-05-24*
