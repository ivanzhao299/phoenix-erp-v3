# Phoenix ERP V3 — Dictionary Governance
# 数据字典治理规范

**版本**：v1.0  
**生效日期**：2026-05-30  
**阶段**：Governance Final Phase I（Pilot Run 前）  
**范围**：全系统枚举值 / sys_dict / 状态机 / 业务类型 / 通知类型  

---

## 一、治理原则

### 1.1 唯一字典来源规则（Single Source of Truth）

| 领域 | 唯一来源 | 废弃来源 |
|------|----------|----------|
| 产品等级 | `product_grades` 表 | ~~sys_dict.PKG_EGG_GRADE~~ |
| 包装规格 | `packaging_specs` 表 | ~~sys_dict.PKG_PACK_SPEC~~ |
| 组织层级 | `sys_dict.SYS_ORG_LEVEL` | — |
| 鸡舍类型 | `sys_dict.BRD_HOUSE_TYPE` | — |
| 包装产线 | `sys_dict.PKG_PACK_LINE` | — |
| 包装班次 | `sys_dict.PKG_SHIFT` | — |
| 包装异常原因 | `sys_dict.PKG_ANOMALY_REASON` | — |
| 退货类型 | 本文档 §4 定义（代码枚举） | 无 sys_dict 定义 |
| 损耗原因 | 本文档 §5 定义（待 sys_dict 建立） | 旧版自由文本 |
| 审批业务类型 | 本文档 §7 定义（代码枚举） | — |
| 通知类型 | 本文档 §8 定义（代码枚举） | — |
| 库存批次状态 | 本文档 §9 定义（代码枚举） | — |

### 1.2 禁止硬编码规则

**禁止**在以下场合硬编码枚举值：
- Service 业务逻辑中 inline string literal（如 `if (grade === 'AA')`）
- 前端 TypeScript 文件中散落的 label map（如 `DIRTY: '脏污蛋'`）
- DTO @IsIn 白名单中不与本文档对齐

**允许**：
- 状态机转换逻辑中的字符串常量（已文档化，见本文档）
- 测试文件

### 1.3 新增字典流程

1. 在本文档对应节添加新枚举值（附中文说明 + 适用场景）
2. 对于 sys_dict 类型：在 `apps/api/ddl/19_seed_sys_dict.sql` 追加幂等 INSERT
3. 对于代码枚举：更新 DTO 的 @IsIn 白名单
4. 同步更新前端 label map
5. PR 审查需包含：本文档更新 + DDL/代码更新

### 1.4 废弃流程

1. 标注为 `DEPRECATED` 状态
2. 不得新增该值的写入
3. 存量数据保留，不 DELETE
4. 6 个月后评估 D 类删除

---

## 二、产品等级字典（GRADE）

### 2.1 唯一来源：product_grades 表

**权威定义**：

| grade_code | 中文名 | 英文名 | 可售 | 说明 |
|-----------|--------|--------|------|------|
| `AA` | 特级蛋 | Premium / AA Grade | ✅ | 外观完美，尺寸大 |
| `A` | 一级蛋 | Grade A | ✅ | 标准品质 |
| `B` | 二级蛋 | Grade B | ✅ | 轻微瑕疵，可销售 |
| `DIRTY` | 脏蛋 | Dirty Egg | ❌ | 表面污染，通常不直接零售 |
| `CRACKED` | 裂纹蛋 | Cracked Egg | ❌ | 裂纹但未破，降级处理 |
| `BROKEN` | 破蛋 | Broken Egg | ❌ | 蛋壳破损，不可直接零售 |
| `DAMAGED` | 损耗蛋 | Damaged/Written-Off | ❌ | 作报废处理，写 inv_ledger WRITE_OFF |

### 2.2 FIFO 库存等级映射

```
入库等级 → 库存降级映射（egg-inventory.service.ts）：
AA       → invBatch: grade='A'   (销售中使用)
A        → invBatch: grade='B'
B        → invBatch: grade='B'
DIRTY    → invBatch: grade='DAMAGED'
CRACKED  → invBatch: grade='DAMAGED'
DAMAGED  → invBatch: grade='DAMAGED'
```

### 2.3 双维护问题识别

| 引用位置 | 当前来源 | 状态 |
|---------|---------|------|
| `terminal.service.ts` `getGradeConfig()` | `sys_dict.PKG_EGG_GRADE` | ⚠️ B类迁移 |
| `packaging.service.ts` | `sys_dict.PKG_EGG_GRADE` | ⚠️ B类迁移 |
| `egg-inventory.service.ts validGrades` | 硬编码 `['AA','A','B','DIRTY','CRACKED','DAMAGED']` | ⚠️ 应读 product_grades |
| `farm-egg.service.ts` | 硬编码 `[{code:'DIRTY'},{code:'BROKEN'}]` | ⚠️ 应读 product_grades |
| `sales-v2` 价格引擎 | `product_grades` ✅ | ✅ 已统一 |
| `product_skus.grade_code` FK | `product_grades` ✅ | ✅ 已统一 |
| 前端 `packaging-terminal.ts` | 硬编码 label map | ⚠️ 应从 API 读取 |
| 前端 `mobile/egg/page.tsx` | 硬编码 `['DIRTY','BROKEN']` | ⚠️ 应从 API 读取 |

### 2.4 迁移路线（Pilot Run 后执行）

```
Phase 1：terminal.service.ts 改读 product_grades
Phase 2：packaging.service.ts 非可售等级改读 product_grades.is_saleable = false
Phase 3：前端 label map 改从 /api/product-master/grades API 动态加载
Phase 4：sys_dict.PKG_EGG_GRADE 标注 DEPRECATED，停止写入
```

---

## 三、包装规格字典（SPEC）

### 3.1 唯一来源：packaging_specs 表

**权威字段**：`spec_code`（主键语义），`spec_name`，`qty_per_unit`，`base_unit`

**已有数据示例**：

| spec_code | spec_name | qty_per_unit | 说明 |
|-----------|-----------|--------------|------|
| `TRAY30` | 30枚蛋托 | 30 | pcs | 标准蛋托 |
| `BOX360` | 360枚箱 | 360 | pcs | 大箱装 |
| `GIFT12` | 12枚礼盒 | 12 | pcs | 礼品装 |

### 3.2 双维护问题

| 引用位置 | 当前来源 | 状态 |
|---------|---------|------|
| `packaging.service.ts` 规格查询 | `sys_dict.PKG_PACK_SPEC` (dict_value=qty) | ⚠️ B类迁移 |
| `product_skus.spec_code` FK | `packaging_specs` ✅ | ✅ 已统一 |
| `sal_order_items.packaging_spec` | 自由文本，H5 后有 `sku_code` 关联 | ⚠️ 渐进规范 |

### 3.3 迁移路线（Pilot Run 后执行）

```
Phase 1：packaging.service.ts 改读 packaging_specs 表（spec_code + qty_per_unit）
Phase 2：sys_dict.PKG_PACK_SPEC 标注 DEPRECATED
```

---

## 四、退货类型字典（RETURN_TYPE）

### 4.1 正式枚举值

**唯一来源**：代码枚举（return-orders.service.ts validTypes），本文档权威定义

| code | 中文名 | 触发场景 | 状态 |
|------|--------|----------|------|
| `CUSTOMER_RETURN` | 客户主动退货 | 客户发起，质检后回库 | ✅ 正式 |
| `DELIVERY_REJECT` | 配送现场拒收 | 配送签收时拒收，自动创建退货单 | ✅ 正式 |
| `QUALITY_RETURN` | 质量问题退货 | 质检不合格，客户申诉 | ✅ 正式 |
| `DAMAGE_RETURN` | 破损退货 | 运输破损，含保险索赔场景 | ✅ 正式 |

### 4.2 退货单状态机

```
DRAFT
  ├─ [need_approval=true]  → PENDING_APPROVAL
  │                             ↓ approve()
  │                         INSPECTING
  └─ [need_approval=false] → INSPECTING
                                 ↓ completeInspection()
                    RESTOCKING (accepted_qty > 0) | COMPLETED (仅损耗)
                         ↓ completeRestock()
                    COMPLETED

任意状态 → REJECTED（审批拒绝）
任意状态 → CANCELLED（手动取消）
```

### 4.3 退货明细质检结果

| code | 含义 |
|------|------|
| `PENDING` | 待质检 |
| `ACCEPTED` | 全部接受回库 |
| `PARTIAL` | 部分接受，部分报废 |
| `REJECTED` | 全部拒收报废 |
| `DAMAGED` | 破损，直接报废 |

### 4.4 退货明细回库状态

| code | 含义 |
|------|------|
| `PENDING` | 待回库 |
| `RESTOCKED` | 已回库（inv_batches + inv_ledger SALE_RETURN） |
| `WRITTEN_OFF` | 已报废（inv_ledger WRITE_OFF） |

---

## 五、损耗原因字典（LOSS_REASON）

### 5.1 现状

当前 WMS 损耗（`wms.service.ts`）和门店损耗（`store/pos.service.ts`）均使用**自由文本** `reason` 字段，无枚举约束。

### 5.2 建议正式枚举值

**目标来源**：`sys_dict.LOSS_REASON`（需在 Phase I 后新增种子数据）

| code | 中文名 | 适用场景 | 状态 |
|------|--------|----------|------|
| `BROKEN` | 自然破损 | 运输/搬运中破损 | ✅ 待注册 |
| `DIRTY` | 污染损耗 | 污染蛋不可售 | ✅ 待注册 |
| `EXPIRED` | 过期损耗 | 超出保质期 | ✅ 待注册 |
| `QC_REJECT` | 质检不合格 | 质检拒收报废 | ✅ 待注册 |
| `COUNT_DIFF` | 盘点差异 | 实盘与系统差异 | ✅ 待注册 |
| `THEFT` | 盘亏/丢失 | 门店盘点丢失 | ✅ 待注册 |
| `OTHER` | 其他 | 上述以外 | ✅ 待注册 |

### 5.3 对应 inv_ledger change_type

损耗写入 inv_ledger 时应使用以下 change_type：

| 场景 | change_type |
|------|-------------|
| 过期损耗 | `EXPIRE_WRITEOFF` |
| 破损损耗 | `DAMAGE_WRITEOFF` |
| 质检报废 | `QC_REJECT` |
| 手动报废 | `WRITE_OFF` |
| 盘点调整 | `ADJUSTMENT` |

### 5.4 后续行动

```
Pilot Run 期间：LOSS_REASON 字典种子 INSERT 到 sys_dict
Pilot Run 后：WMS/Store 损耗录入改为 sys_dict 下拉选择（非自由文本）
```

---

## 六、配送异常类型（DELIVERY_EXCEPTION_TYPE）

### 6.1 正式枚举值

**唯一来源**：代码枚举（delivery.dto.ts @IsIn），本文档权威定义

| code | 中文名 | 含义 |
|------|--------|------|
| `SHORTAGE` | 短少 | 实际送达数量少于单据 |
| `DAMAGED` | 破损 | 货物破损 |
| `REJECTED` | 客户拒收 | 客户拒绝接收全部 |
| `LATE` | 延误 | 超出预计送达时间 |
| `OTHER` | 其他 | 以上以外 |

---

## 七、审批业务类型字典（APPROVAL_BIZ_TYPE）

### 7.1 Workflow 引擎 bizType

**唯一来源**：代码枚举（各 service 调用 startApproval），本文档权威定义

#### 7.1.1 Sales V2 审批类型

| bizType | 触发场景 | 触发条件 |
|---------|----------|----------|
| `SALES_ORDER` | 销售订单审批 | need_price_approval=true 或 need_credit_approval=true |
| `SALES_RETURN` | 退货单审批 | need_approval=true（退货金额超阈值） |
| `PRICE_BOOK_APPROVAL` | 价格本审批 | 价格本提交时 |

#### 7.1.2 Finance V2 审批类型

| bizType | 触发场景 |
|---------|----------|
| `EXPENSE_REQUEST` | 费用申请单提交 |
| `REIMBURSEMENT` | 报销单审批 |
| `SHAREHOLDER_CONTRIBUTION` | 股东出资确认 |
| `SHAREHOLDER_SETTLEMENT` | 股东结算审批 |
| `FUND_TRANSFER` | 资金划转审批 |

#### 7.1.3 Procurement V2 审批类型

| bizType | 触发场景 |
|---------|----------|
| `PR` | 采购申请审批 |
| `PO` | 采购订单审批 |
| `PAYMENT` | 采购付款审批 |
| `RECEIPT` | 入库确认 |
| `SHIPMENT` | 发货状态追踪 |
| `FUND` | 股东资金审批 |

### 7.2 操作日志 bizType（sys_audit_log / sys_operation_logs）

| bizType | 说明 |
|---------|------|
| `SAL_ORDER` | 销售订单操作 |
| `SAL_DELIVERY` | 配送单操作 |
| `SAL_RETURN` | 退货单操作 |
| `SAL_CREDIT` | 信用控制操作 |
| `SAL_PRICE` | 价格操作 |
| `SAL_INVENTORY` | 鸡蛋库存操作 |
| `AP` | 应付款操作 |
| `FUND` | 资金操作 |
| `PAYMENT` | 付款操作 |
| `PERMISSION` | 权限变更 |
| `CONFIG` | 配置修改 |
| `INIT` | 系统初始化 |
| `SYS_CONFIG` | 生产配置修改 |

### 7.3 Finance AR source_type

| source_type | 含义 |
|-------------|------|
| `SALES_ORDER` | 来自销售订单签收自动生成 |
| `MANUAL` | 手工录入 |

---

## 八、通知类型字典（NOTIFICATION_TYPE）

### 8.1 正式枚举值

**唯一来源**：代码枚举（sys-notification.entity.ts default + notification.service.ts），本文档权威定义

| notificationType | 中文名 | 触发来源 | 接收对象 |
|-----------------|--------|----------|----------|
| `WORKFLOW_TASK` | 审批任务待办 | workflow-notification.service | 审批人 |
| `APPROVAL_RESULT` | 审批结果通知 | workflow-notification.service | 申请人 |
| `TASK_REMINDER` | 任务超时提醒 | workflow-sla.service | 审批人 |
| `TASK_ESCALATED` | 任务升级告警 | workflow-sla.service | 上级审批人 |
| `CREDIT_ALERT` | 信用冻结/预警 | customer-credit-scheduler.service | 销售经理 |
| `INVENTORY_ALERT` | 库存预警 | egg-inventory-scheduler.service | 仓库主管 |
| `SYSTEM_ALERT` | 系统告警 | system-monitor | SYSOPS |

### 8.2 当前问题

- `CREDIT_ALERT` / `INVENTORY_ALERT`：当前写入 sys_notifications 时使用字符串 literal，未统一在 NotificationService 接口中
- 建议：在 NotificationService 中增加 enum 常量定义，所有调用者引用常量而非字符串

---

## 九、库存批次与台账枚举

### 9.1 inv_batches.status

| status | 含义 | 可出库？ |
|--------|------|---------|
| `AVAILABLE` | 可用 | ✅ |
| `RESERVED` | 已预留（待出库） | ⚠️ 部分可用 |
| `RETURNED` | 退货回库 | ✅ |
| `EXPIRED` | 过期（qty_available=0） | ❌ |
| `WRITTEN_OFF` | 已报废 | ❌ |
| `EXHAUSTED` | 耗尽（qty_available=0，非过期） | ❌ |

### 9.2 inv_ledger.change_type

| change_type | 分类 | 含义 | qty_change 方向 |
|-------------|------|------|----------------|
| `INBOUND` | 入库 | 采购入库 | + |
| `RETURN_INBOUND` | 入库 | 退货回库 | + |
| `SALE_RETURN` | 入库 | 销售退货回库（Sales V2） | + |
| `ADJUSTMENT_IN` | 调整 | 盘点增加 | + |
| `RESERVED` | 预留 | 销售订单预留 | - （锁定） |
| `RELEASE` | 释放 | 销售订单取消/拒绝释放预留 | + |
| `FIFO_OUT` | 出库 | FIFO 实际出库 | - |
| `INBOUND_BROKEN` | 异常 | 入库破损登记 | - |
| `EXPIRE_WRITEOFF` | 损耗 | 过期报废 | - |
| `DAMAGE_WRITEOFF` | 损耗 | 破损报废 | - |
| `WRITE_OFF` | 损耗 | 手动报废 | - |
| `QC_REJECT` | 损耗 | 质检报废 | - |
| `ADJUSTMENT` | 调整 | 盘点调整（可±） | ± |

---

## 十、业务单据状态机

### 10.1 销售订单（sal_sales_orders.status）

```
DRAFT → PENDING_APPROVAL → APPROVED → ALLOCATED → PICKED
     → LOADED → SHIPPED → DELIVERED → RECEIVED → RECONCILED
任意 → CANCELLED
PENDING_APPROVAL → REJECTED
```

### 10.2 配送单（sal_delivery_orders.status）

```
DRAFT → LOADING → LOADED → EN_ROUTE → DELIVERED → COMPLETED
任意 → CANCELLED
```

### 10.3 退货单（sal_return_orders.status）

见 §4.2

### 10.4 价格本（sal_price_books.status）

```
DRAFT → PENDING_APPROVAL → APPROVED → ACTIVE → EXPIRED
任意 → CANCELLED
PENDING_APPROVAL → REJECTED
```

### 10.5 AR 发票（fin_ar_invoices.status）

```
OPEN → PARTIALLY_RECEIVED → RECEIVED
OPEN → OVERDUE（自动，逾期）
任意 → DISPUTED
任意 → WRITTEN_OFF
任意 → CANCELLED
```

### 10.6 AP 发票（fin_ap_invoices.status）

```
OPEN → PARTIALLY_PAID → PAID
任意 → DISPUTED
任意 → CANCELLED
```

### 10.7 资金划转（fin_fund_transfers.status）

```
DRAFT → PENDING_APPROVAL → APPROVED → EXECUTED
任意 → CANCELLED
```

### 10.8 报销（fin_reimbursements.status）

```
PENDING → [PENDING_APPROVAL →] APPROVED → PAID
PENDING / APPROVED → CANCELLED
```

### 10.9 采购申请（prc2_purchase_requests.status）

```
DRAFT → PENDING_APPROVAL → APPROVED → FULFILLED
任意 → CANCELLED
PENDING_APPROVAL → REJECTED
```

### 10.10 采购订单（prc2_purchase_orders.status）

```
DRAFT → PENDING_APPROVAL → APPROVED → ORDERED → SHIPPED → RECEIVED
任意 → CANCELLED
PENDING_APPROVAL → REJECTED
```

### 10.11 Workflow 实例（wf_instances.status）

```
PENDING → APPROVED / REJECTED / CANCELLED
```

---

## 十一、字典治理分类汇总

### A 类：正式保留（无需改动）

| 字典 | 类型 | 来源 |
|------|------|------|
| SYS_ORG_LEVEL（10 条） | sys_dict | 组织层级，org 模块依赖 |
| BRD_HOUSE_TYPE（5 条） | sys_dict | 鸡舍类型，breeding 依赖 |
| PKG_PACK_LINE（2 条） | sys_dict | 产线，terminal 依赖 |
| PKG_SHIFT（3 条，含 config_json 时间段） | sys_dict | 班次，terminal 依赖 |
| PKG_ANOMALY_REASON（N 条） | sys_dict | 包装异常，terminal 依赖 |
| RETURN_TYPE（4 值） | 代码枚举 | 退货单必要字段 |
| DELIVERY_EXCEPTION_TYPE（5 值） | 代码枚举 | 配送异常 DTO |
| APPROVAL_BIZ_TYPE（15+ 值） | 代码枚举 | Workflow/Finance/Procurement |
| NOTIFICATION_TYPE（7 值） | 代码枚举 | 通知系统 |
| INV_BATCH_STATUS（6 值） | 代码枚举 | 库存批次 |
| INV_CHANGE_TYPE（13 值） | 代码枚举 | 台账变动类型 |
| 全部状态机（10.1~10.11） | 代码枚举 | 各业务单据 |

### B 类：需迁移（Pilot Run 后执行）

| 字典 | 当前状态 | 目标 |
|------|----------|------|
| sys_dict.PKG_EGG_GRADE | terminal 读取 | → product_grades 统一来源 |
| sys_dict.PKG_PACK_SPEC | terminal 读取 dict_value | → packaging_specs 统一来源 |
| 硬编码 validGrades（egg-inventory） | 硬编码 | → product_grades API 动态读取 |
| 前端 grade label map（packaging-terminal.ts） | 硬编码 | → /api/product-master/grades |
| 前端 mobile/egg grade list | 硬编码 | → /api/product-master/grades |
| 损耗原因（WMS/Store 自由文本 reason） | 自由文本 | → sys_dict.LOSS_REASON 下拉 |

### C 类：冻结（保留不扩展）

| 字典 | 原因 |
|------|------|
| sys_dict.PKG_EGG_GRADE | 计划迁移，Pilot Run 期间暂时保留 |
| sys_dict.PKG_PACK_SPEC | 计划迁移，Pilot Run 期间暂时保留 |

### D 类：可删除（Pilot Run 后评估，至少 6 个月后）

| 字典 | 前置条件 |
|------|---------|
| sys_dict.PKG_EGG_GRADE | terminal 完成迁移后 |
| sys_dict.PKG_PACK_SPEC | terminal 完成迁移后 |

### E 类：未来规划

| 字典 | 说明 |
|------|------|
| sys_dict.LOSS_REASON | 建立正式损耗原因字典（7 条，见 §5.2） |
| sys_dict.CUSTOMER_TIER | 客户等级 A/B/C/D |
| sys_dict.SUPPLIER_TIER | 供应商分级 |
| sys_dict.PRODUCT_CATEGORY | 产品大类分类 |

---

## 十二、冻结字典清单

以下字典在 Pilot Run 期间处于**冻结**状态：不新增值，不删除，现有代码继续读取。

| 字典类型 | 字典条数 | 冻结原因 |
|---------|---------|---------|
| `sys_dict.PKG_EGG_GRADE` | N | 迁移计划中，terminal 暂时依赖 |
| `sys_dict.PKG_PACK_SPEC` | N | 迁移计划中，terminal 暂时依赖 |

---

## 十三、硬编码清单（待规范化）

以下位置存在需要规范化的硬编码枚举值，Pilot Run 后按优先级处理：

| 优先级 | 位置 | 内容 | 规范化方案 |
|--------|------|------|-----------|
| HIGH | `egg-inventory.service.ts` L225 | `validGrades = ['AA','A','B','DIRTY','CRACKED','DAMAGED']` | 改读 product_grades WHERE status='ACTIVE' |
| HIGH | `farm-egg.service.ts` L13-14 | `{code:'DIRTY'},{code:'BROKEN'}` | 改读 product_grades WHERE is_saleable=false |
| MEDIUM | `packaging-terminal.ts` L188-189 | `DIRTY:'脏污蛋',BROKEN:'破损蛋'` | 改从 /api/product-master/grades 动态加载 |
| MEDIUM | `mobile/egg/page.tsx` L31-32 | grade list 硬编码 | 改 API 加载 |
| MEDIUM | `mobile/sales/page.tsx` L37-38 | grade list 硬编码 | 改 API 加载 |
| LOW | WMS/Store 损耗 reason 自由文本 | `reason = body.reason` | 改为 sys_dict.LOSS_REASON 下拉 |
| LOW | `customer-credit-scheduler.service.ts` | notification_type 字符串 literal | 改引用 NotificationTypeConst |

---

## 十四、迁移路线图

### Phase I：Pilot Run 期间（无代码改动，仅治理文档）

- [x] 建立本治理文档
- [x] 识别所有枚举来源冲突
- [x] 确立唯一来源原则

### Phase II：Pilot Run 结束后 30 天

- [ ] **H** `egg-inventory.service.ts` validGrades → product_grades 动态读取（HIGH）
- [ ] **H** LOSS_REASON 字典种子写入 sys_dict（7 条）
- [ ] **H** 销售/配送/退货单号改 PG sequence（编码并发安全）

### Phase III：Pilot Run 结束后 60 天

- [ ] **M** `terminal.service.ts` PKG_EGG_GRADE → product_grades
- [ ] **M** `packaging.service.ts` PKG_PACK_SPEC → packaging_specs
- [ ] **M** 前端 grade label map 改 API 动态加载
- [ ] **M** CREDIT/SLA sys_configs 接线到 Runtime

### Phase IV：Pilot Run 结束后 90 天

- [ ] **L** PKG_EGG_GRADE + PKG_PACK_SPEC 标注 DEPRECATED
- [ ] **L** NotificationTypeConst 常量化，消除通知 type 散落
- [ ] **L** 评估 D 类删除（最早 6 个月后）

---

## 十五、Pilot Run 判断

### 15.1 字典治理完成后是否达到 Pilot Run 条件？

> **✅ 是**。

字典治理审计的核心结论：

1. **无数据不一致风险**：目前 product_grades（Sales V2 使用）和 sys_dict.PKG_EGG_GRADE（terminal 使用）在 Pilot Run 期间由运营团队保持一致，不存在客户可见的数据错误。

2. **无功能中断风险**：所有硬编码值与 product_grades 表中实际数据对齐（AA/A/B/DIRTY/CRACKED/BROKEN/DAMAGED 均存在），不会触发业务错误。

3. **无枚举冲突**：退货类型（4 值）、通知类型（7 值）、审批类型（15+ 值）、库存状态等均已在本文档权威定义，与代码实现一致。

4. **治理债务已摸清**：B/C/D/E 类问题全部记录在案，Pilot Run 期间并行处理，不阻塞上线。

### 15.2 遗留的字典技术债

| 级别 | 数量 | 描述 |
|------|------|------|
| CRITICAL | 0 | 无 |
| HIGH | 3 | validGrades 硬编码、LOSS_REASON 自由文本、单号并发 |
| MEDIUM | 5 | terminal 迁移、前端 label map 动态化、配置接线 |
| LOW | 3 | NotificationTypeConst、D 类删除评估、文档同步 |

---

## 十六、附录：sys_dict 完整类型目录

| dict_type | 条数 | 来源 | 评级 |
|-----------|------|------|------|
| `SYS_ORG_LEVEL` | 10 | 19_seed_sys_dict.sql | A 保留 |
| `BRD_HOUSE_TYPE` | 5 | 19_seed_sys_dict.sql | A 保留 |
| `PKG_PACK_LINE` | 2 | 19_seed_sys_dict.sql | A 保留 |
| `PKG_SHIFT` | 3 | 19_seed_sys_dict.sql | A 保留 |
| `PKG_EGG_GRADE` | N | generic-crud（运行时种子） | C 冻结→B 迁移 |
| `PKG_PACK_SPEC` | N | generic-crud（运行时种子） | C 冻结→B 迁移 |
| `PKG_ANOMALY_REASON` | N | 运行时种子（需确认） | A 保留 |
| `APPROVAL`（via workflow） | N | wf_data_sources | A 保留 |
| `LOSS_REASON` | 0（待建） | 计划 | E 未来规划→Pilot Run 后建立 |

---

*文档版本：v1.0 · 治理基准：Product Master H5 + Pilot Run 1 建立后*  
*下次更新节点：Phase II 迁移完成后（Pilot Run 结束后 30 天）*  
*负责人：系统架构 + 运营主管联合维护*
