# Phoenix ERP V3 — Legacy Dependency Audit

**审计日期：** 2026-05-28  
**审计范围：** 第一轮 Runtime Clean Cutover（commit d5867c8）之后的残余旧模块  
**目的：** 为第二轮删除提供决策依据，形成 A/B/C 分级和执行命令草案  
**原则：** 只写文档，不修改代码；不破坏任何现有 Runtime

---

## 一、Executive Summary

| 指标 | 结果 |
|------|------|
| 后端旧模块数量（仍在 app.module.ts） | 7（farm, order, store, approval, wms, logistics, procurement） |
| 前端旧页面目录数量 | 5（procurement, order, b2b, transport, warehouse） |
| 可立即删除（A 类） | 2 项（logistics 模块 + wms→procurement 冗余 import） |
| 需先替换依赖（B 类） | 6 项 |
| 暂保留（C 类） | 5 项 |
| 仍活跃旧 API 端点 | 9 个（全部集中在 /api/procurement/ V1） |
| 测试结果 | API TS 0 err ✅ · Web TS 0 err ✅ · scope-audit 31/31 ✅ |

---

## 二、后端旧模块依赖矩阵

### 2.1 模块存在性

| 模块路径 | 文件数 | 在 app.module.ts | 模块级别 |
|---------|--------|------------------|----------|
| `modules/procurement/` | 5 | 是（L89） | 旧采购 V1 |
| `modules/order/` | 4 | 是（L83） | 旧订单 |
| `modules/farm/` | 12 | 是（L82） | 农场运营（活跃） |
| `modules/store/` | 6 | 是（L84） | 门店/POS（活跃） |
| `modules/approval/` | 5 | 是（L85） | 旧审批 V1 |
| `modules/logistics/` | 1 | 是（L88） | **空壳，零功能** |
| `modules/wms/` | 9 | 是（L87） | 仓储（活跃） |
| `modules/transport/` | — | 不存在 | — |
| `modules/customer/` | — | 不存在 | — |
| `modules/b2b/` | — | 不存在 | — |

### 2.2 模块依赖关系图

```
app.module.ts
├── FarmModule          (独立：无外部依赖者，移动端 /api/farm/* 活跃使用)
├── OrderModule ←───────────────────────────────────────────────┐
│     ├─ imports WmsModule (forwardRef 循环引用)                  │
│     └─ exports OrderService + SalesEngineService               │
├── StoreModule                                                  │
│     └─ imports OrderModule → injects SalesEngineService        │
│        (PosService 在下单时调用价格校验)                        │
├── ApprovalModule ←────────────────────────────────────────────┤
│     └─ exports ApprovalService → ProcurementService            │
├── WmsModule                                                    │
│     ├─ imports ProcurementModule  ← [冗余！WmsService 不用它]   │
│     ├─ imports OrderModule (forwardRef) ────────────────────────┘
│     └─ exports WmsService + InventoryService
├── LogisticsModule     [完全空壳 @Module({}) 无内容]
└── ProcurementModule
      ├─ imports ApprovalModule (ApprovalService → ProcurementService)
      └─ exports ProcurementService
           └─ WmsModule 导入了 ProcurementModule，但不注入 ProcurementService [冗余]
```

### 2.3 各模块详情

#### procurement 模块

| 项目 | 内容 |
|------|------|
| Controller | `@Controller('api/procurement')` |
| 路由数 | 19 个端点（requests/orders/payments/receipts/suppliers/dashboard/kpi/three-way） |
| exports | `ProcurementService` |
| 被谁导入 | `app.module.ts`, `wms.module.ts`（冗余） |
| 注入外部 | `ApprovalService`（来自 ApprovalModule），用于 `submitForApproval()` |
| 前端使用 | 是，`/procurement/order`, `/procurement/payments`, `/procurement/requests` 活跃调用 |
| 能否立即删除 | **否**：前端 9 个活跃调用，需先在页面加 LegacyFreezeBanner + Sidebar 迁移到 `/procurement2` |

#### order 模块

| 项目 | 内容 |
|------|------|
| Controller | `@Controller('api/orders')` |
| 路由数 | 3 个端点（submit, transition, getOne） |
| exports | `OrderService`, `SalesEngineService` |
| 被谁导入 | `app.module.ts`, `store.module.ts`, `wms.module.ts`（forwardRef 循环） |
| 注入外部 | `WmsService` — APPROVED 时触发出库分配 |
| 前端使用 | 是，`/order/page.tsx`（submit）、`/order/approval/page.tsx`（transition）活跃 |
| 能否立即删除 | **否**：前端活跃；StoreModule/WmsModule 循环依赖需要一起重构 |

#### farm 模块

| 项目 | 内容 |
|------|------|
| Controller | `@Controller('api/v3/farm')` + 4 个子控制器 |
| 路由数 | 22 个端点（egg, feed, sales, medicine, daily-logs） |
| exports | FarmService + 4 个子 Service |
| 被谁导入 | 仅 `app.module.ts`，无其他模块 |
| 注入外部 | 无（独立） |
| 前端使用 | 是，桌面端 `/breeding/egg-ledger`, `/breeding/feed`, `/breeding/med-stock`；移动端 `mobile-api.ts` 大量使用 |
| 能否立即删除 | **否**：独立运营中的农场核心模块，无 V2 替代 |

#### store 模块

| 项目 | 内容 |
|------|------|
| Controller | `@Controller('api/v3/store')` + `@Controller('api/v3/pos')` |
| 路由数 | 16 个端点（POS 销售/退款/收货/门店结算等） |
| exports | `StoreService`, `PosService` |
| 被谁导入 | 仅 `app.module.ts` |
| 注入外部 | `SalesEngineService`（来自 OrderModule），POS 销售时价格校验 |
| 前端使用 | 是，`/pos/sales/page.tsx` 活跃调用 `/api/v3/pos/*` |
| 能否立即删除 | **否**：POS 系统在用；依赖 SalesEngineService → 需先解耦 |

#### approval 模块

| 项目 | 内容 |
|------|------|
| Controller | `@Controller('api/v3/approval')`，**整个类标注 `@deprecated`** |
| 路由数 | 2 个（submit, approve），均返回 `X-Deprecated: true` 响应头 |
| exports | `ApprovalService` |
| 被谁导入 | `app.module.ts`, `procurement.module.ts` |
| 注入外部 | `ProcurementService.submitForApproval()` 直接注入并调用 |
| 前端使用 | **否**：grep 确认无前端调用 `/api/v3/approval/*` |
| 能否立即删除 | **否**：必须先修改 `procurement.service.ts`，移除对 `ApprovalService` 的注入 |
| 与 ApprovalEngine 关系 | 完全不同！ApprovalEngine 在 `modules/approval-engine/`，路由为 `/api/approval/*`；旧 approval 在 `modules/approval/`，路由为 `/api/v3/approval/*` |

#### logistics 模块

| 项目 | 内容 |
|------|------|
| 文件数 | 1（`logistics.module.ts`） |
| 内容 | `@Module({}) export class LogisticsModule {}` —— 4 行，完全空壳 |
| exports | 无 |
| 被谁导入 | 仅 `app.module.ts` |
| 前端使用 | 否 |
| 能否立即删除 | **是**：零功能，零依赖，零风险 |

#### wms 模块

| 项目 | 内容 |
|------|------|
| Controller | inbound/outbound/inventory/stocktake 4个 |
| 路由数 | 16 个端点 |
| exports | `WmsService`, `InventoryService` |
| 被谁导入 | `app.module.ts`, `order.module.ts`（forwardRef） |
| 注入外部 | `OrderService` 注入 `WmsService`（APPROVED→ALLOCATED 出库） |
| 冗余导入 | `wms.module.ts` 导入了 `ProcurementModule`，但 **WmsService/InventoryService 均未注入 ProcurementService** |
| 前端使用 | 是，`/warehouse/transfer`, `/warehouse/daily-close` 活跃 |
| 能否立即删除 | **否**，但可立即删除 wms.module.ts 中的 ProcurementModule 冗余 import |

---

## 三、前端旧页面依赖矩阵

### 3.1 目录存在性与替代状态

| 旧目录 | V2 替代目录 | V2 就绪 |
|-------|------------|---------|
| `(admin)/procurement/` | `(admin)/procurement2/`（10页） | ✅ |
| `(admin)/order/` | `(admin)/sales2/`（8页） | ✅ |
| `(admin)/b2b/` | `(admin)/sales2/customers` | ✅（部分） |
| `(admin)/transport/` | `(admin)/sales2/delivery` | ✅ |
| `(admin)/warehouse/` | 无 V2 替代 | ❌ |
| `(admin)/farm/` | 不存在（farming 在 `/breeding/`） | — |

### 3.2 Sidebar 可见性

| 目录 | Sidebar 状态 | 权限码 |
|-----|-------------|-------|
| `/procurement` | **完全活跃**（7 子菜单） | `MENU_PRC_MGR` |
| `/order` | 活跃（6 子菜单），`/order/customers` 已注释 | `MENU_ORDER_MGR` |
| `/b2b` | 活跃（3 子菜单），`/b2b/customers` 已注释 | `MENU_B2B_SALE` |
| `/transport` | **完全活跃**（7 子菜单） | `MENU_LOGISTICS` |
| `/warehouse` | **完全活跃**（13 子菜单） | `MENU_WMS_*` |

### 3.3 页面逐项分析

#### `/procurement` — 7 页

| 页面 | LegacyFreezeBanner | Sidebar | API 调用 | 可删？ |
|-----|-------------------|---------|---------|-------|
| `/procurement`（总览） | 无 | 活跃 | `crudApi` prc_purchase_orders | 否 |
| `/procurement/requests` | 无 | 活跃 | `/api/procurement/purchase-requests/*` | 否 |
| `/procurement/order` | 无 | 活跃 | `/api/procurement/*`（7 个端点） | 否 |
| `/procurement/arrival` | 无 | 活跃 | `crudApi` wms_inbound | 否 |
| `/procurement/payments` | 无 | 活跃 | `/api/procurement/pending-payments` + confirm | 否 |
| `/procurement/suppliers` | 无 | 活跃 | `crudApi` prc_suppliers | 否 |
| `/procurement/reconcile` | 无 | 活跃 | `crudApi` prc_purchase_orders | 否 |

**结论：** 全部 7 页不可删除，仍是用户主入口；与 `/procurement2/` 并行运行，使用不同权限/表结构。

#### `/order` — 8 页

| 页面 | LegacyFreezeBanner | Sidebar | 可删？ |
|-----|-------------------|---------|-------|
| `/order`（总览） | 无 | 活跃（`ROLE_SALES_REP` 默认跳转） | 否 |
| `/order/customers` | **有** → `/sales2/customers` | **已注释** | B 类（可加 redirect） |
| `/order/prices` | **有** → `/sales2/pricing` | 活跃 | B 类（需先改 Sidebar） |
| `/order/approval` | 无 | 活跃 | 否 |
| `/order/picking` | 无 | 活跃 | 否 |
| `/order/loading` | 无 | 活跃 | 否 |
| `/order/credit` | 无 | 活跃 | 否 |
| `/order/farm-sales` | 无 | **孤儿路由（无 Sidebar 入口）** | 需专项评估 |

#### `/b2b` — 4 页

| 页面 | LegacyFreezeBanner | Sidebar | 可删？ |
|-----|-------------------|---------|-------|
| `/b2b`（总览） | 无 | 活跃 | 否 |
| `/b2b/customers` | **有** → `/sales2/customers` | **已注释** | B 类（可加 redirect） |
| `/b2b/orders` | 无 | 活跃 | 否 |
| `/b2b/distributor-grading` | 无 | 活跃 | 否 |

#### `/transport` — 7 页

| 页面 | LegacyFreezeBanner | Sidebar | 可删？ |
|-----|-------------------|---------|-------|
| `/transport`（总览） | **有** → `/sales2/delivery` | 活跃 | 否（`ROLE_LOG_MGR` 默认跳转此路径） |
| `/transport/wave` | 无 | 活跃 | 否 |
| `/transport/tracking` | 无 | 活跃 | 否 |
| `/transport/receipt` | 无 | 活跃 | 否 |
| `/transport/exceptions` | 无 | 活跃 | 否 |
| `/transport/vehicles` | 无 | 活跃 | 否 |
| `/transport/drivers` | 无 | 活跃 | 否 |

**阻塞原因：** `login/page.tsx:63` 仍然将 `ROLE_LOG_MGR` 默认跳转到 `/transport`，删除会 404。

#### `/warehouse` — 13 页

所有页面 Sidebar 完全活跃，无任何 LegacyFreezeBanner，`ROLE_WMS_MGR` 默认跳转此路径。**全部不可删除，属于核心仓储系统，无 V2 替代方案。**

---

## 四、旧 API 调用清单

### 4.1 真正活跃的旧 API 端点（前端仍调用）

| 端点 | 调用文件 | 功能 | V2 等价端点 | 风险 |
|-----|---------|------|------------|------|
| `GET /api/procurement/pending-payments` | `procurement/payments/page.tsx:95` | 待付款列表 | `GET /api/v2/procurement/payments` | HIGH |
| `POST /api/procurement/payments/:id/confirm` | `procurement/payments/page.tsx:168` | 确认付款 | `POST /api/v2/procurement/payments/:id/pay` | HIGH |
| `GET /api/procurement/purchase-requests` | `procurement/order/page.tsx:324` | 采购申请列表 | `GET /api/v2/procurement/requests` | HIGH |
| `GET /api/procurement/approvers` | `procurement/order/page.tsx:339` | 审批人列表 | 无直接 V2 等价 | HIGH |
| `POST /api/procurement/:poNo/submit` | `procurement/order/page.tsx:367` | 提交采购单 | V2 用 workflow 引擎 | HIGH |
| `POST /api/procurement/purchase-requests/:id/convert` | `procurement/order/page.tsx:390`, `requests/page.tsx:245` | PR 转采购单 | `POST /api/v2/procurement/requests/:id/submit` | HIGH |
| `POST /api/procurement/purchase-requests/:id/reject` | `procurement/order/page.tsx:408` | 拒绝采购申请 | V2 用 ApprovalEngine 拒绝 | HIGH |
| `POST /api/procurement/:poNo/approve` | `procurement/order/page.tsx:429` | 直接审批采购单 | ApprovalEngine 实例审批 | HIGH |
| `POST /api/procurement/create` | `procurement/order/page.tsx:492` | 创建采购订单 | `POST /api/v2/procurement/orders` | HIGH |

### 4.2 已废弃但保留的 API（前端不再调用）

| 端点 | 所在模块 | 状态 | 备注 |
|-----|---------|------|------|
| `POST /api/v3/approval/submit` | `modules/approval/` | `@deprecated`，前端无调用 | 可随 approval 模块一起删 |
| `POST /api/v3/approval/:docType/:docId/approve` | `modules/approval/` | `@deprecated`，前端无调用 | 同上 |

### 4.3 被误识别为旧 API 的活跃端点

| 端点模式 | 实际情况 |
|---------|---------|
| `/api/approval/*` | **是 ApprovalEngine（V2）**，非旧 approval 模块；前端 workflow 页面活跃调用 |
| `/api/farm/*` | **是农场域正常 API**，无 V2 替代；移动端和桌面端活跃使用 |
| `/api/v3/pos/*` | **是 POS 正常 API**，在用 |
| `/api/v3/store/*` | **是门店正常 API**，在用 |
| `/api/inbound/*`, `/api/outbound/*`, `/api/inventory/*` | **是 WMS 正常 API**，在用 |

---

## 五、旧 approval 模块专项结论

### 5.1 现状

- **路由：** `@Controller('api/v3/approval')`，2 个 endpoint，均标注 `@deprecated`，返回 `X-Deprecated: true` 响应头
- **服务层：** `ApprovalService` 有完整的业务逻辑（submit/approve/reject approval rules）
- **前端调用：** **零**。所有前端 workflow 页面和移动端都调用 `/api/approval/*`（ApprovalEngine），不调用 `/api/v3/approval/*`
- **内部注入：** `ProcurementService` 在 `submitForApproval()` 方法注入 `ApprovalService`

### 5.2 与 ApprovalEngine 的关系

| 维度 | 旧 approval 模块 | ApprovalEngine（V2） |
|------|----------------|---------------------|
| 路径 | `modules/approval/` | `modules/approval-engine/` |
| 控制器 | `api/v3/approval` | `api/approval` |
| 数据库表 | `sys_approval_rule`, `sys_approval_log` | `wf_approval_rules`, `wf_approval_instances`, `wf_approval_rule_steps`, `wf_approval_instance_steps` |
| 前端调用 | 无（零调用） | 有（workflow 页面全部使用） |
| 已废弃 | 是（`@deprecated` 标注） | 否（主线） |

### 5.3 删除路径

```
Step 1: 修改 procurement.service.ts
  - 找到 submitForApproval() 方法中对 ApprovalService 的调用
  - 改为调用 ApprovalEngineService（来自 approval-engine 模块）
  - 或直接删除 submitForApproval() 方法（如果旧采购审批已由 ApprovalEngine 接管）

Step 2: 修改 procurement.module.ts
  - 从 imports 数组中移除 ApprovalModule
  - 添加 ApprovalEngineModule（如果 Step 1 改为调用 ApprovalEngineService）

Step 3: 修改 wms.module.ts
  - 从 imports 数组中移除 ProcurementModule（当前冗余 import）

Step 4: 删除 apps/api/src/modules/approval/
Step 5: 从 app.module.ts 移除 ApprovalModule import 和注册
```

### 5.4 影响范围

- 修改后不影响 ProcurementV2Module（已独立，不依赖旧 approval）
- 不影响 ApprovalEngineModule
- 不影响前端任何功能（因为前端已不调用旧 approval API）

---

## 六、旧 procurement 模块专项结论

### 6.1 当前状态

- Sidebar 仍完全活跃（`MENU_PRC_MGR`，7 个子菜单）
- 所有页面无 LegacyFreezeBanner
- 前端 9 个活跃 API 调用，全部调用 `/api/procurement/*`
- 与 `procurement2`（`MENU_PRC2_MASTER`）并行运行
- 旧采购使用 `prc_*` 表，新采购使用 `prc2_*` 表，数据完全隔离

### 6.2 是否仍被业务使用

- 是。旧采购前端（`/procurement/order`, `/procurement/payments`, `/procurement/requests`）目前是**用户的主要操作界面**
- 新采购 `/procurement2/` 已就绪但需要用户迁移和业务确认

### 6.3 迁移所需步骤

```
Step 1: 在所有旧采购前端页面加 LegacyFreezeBanner（指向 /procurement2）
Step 2: 通知业务方，将工作流迁移至 /procurement2
Step 3: 确认 /procurement2 的所有功能等价后，将 Sidebar 旧采购 7 个子菜单
        权限从 MENU_PRC_MGR 移除或切换到 soon=true
Step 4: 删除 apps/web/src/app/(admin)/procurement/ 目录
Step 5: 从 app.module.ts 移除 ProcurementModule（需已完成 approval 解耦）
Step 6: 删除 apps/api/src/modules/procurement/
```

### 6.4 只读接口建议

旧采购历史数据（`prc_*` 表）应通过 Generic CRUD（只读）或专用 archive API 访问，不需要保留 ProcurementController。

---

## 七、旧 order / b2b / transport 专项结论

### 7.1 order 模块

**哪些已被 Sales V2 替代：**
- `/order/customers` → Sales V2 `sal_customers`（已有 LegacyFreezeBanner）
- `/order/prices` → Sales V2 `sal_price_books`（已有 LegacyFreezeBanner）

**哪些仍被旧功能使用：**
- 订单中心（`/api/orders/submit`）、审批（transition）、拣货、装车清单、信用台账

**旧 AR 写 fin_transactions：**
- 是。`order.service.ts` 在 `RECEIVED` 状态时写入 `fin_transactions`（type=AR-TRADE）
- **未调用 ArInvoicesService**，未生成 `fin_ar_invoices` 记录 → 这是遗留债务
- 删除 OrderModule 前需确认 Sales V2 的 AR 路径已完全接管

**`/order/farm-sales` 孤儿路由：**
- 无 Sidebar 入口，无面包屑注册
- 混用 `/api/farm/sales/*` + `/api/v2/sales/pricing/current`
- 是农场直销的遗留专用入口 → 建议加 `soon: false` → `soon: true` 或改为 redirect 到 `/sales2/farm-sales`

### 7.2 b2b 模块

| 子模块 | 状态 | 建议 |
|--------|------|------|
| `/b2b/customers` | LegacyFreezeBanner + Sidebar 已注释 | 立即加 redirect → `/sales2/customers` |
| `/b2b/orders` | Sidebar 活跃，无替代 | 暂保留 |
| `/b2b/distributor-grading` | Sidebar 活跃，无替代 | 暂保留 |
| `/b2b`（总览） | Sidebar 活跃 | 暂保留 |

### 7.3 transport 模块

**哪些可以删除：** 暂无（全部 Sidebar 活跃，`ROLE_LOG_MGR` 默认路由指向 `/transport`）

**删除前提条件：**
1. `login/page.tsx` 中 `ROLE_LOG_MGR` 默认路由改为 `/sales2/delivery`
2. Sidebar 将 transport 子菜单全部迁移至 `/sales2/delivery` 相关子页面
3. Sales V2 delivery 子页面（波次/签收/异常/车辆/司机）功能完整实现

**当前状态：** `/transport`（总览）有 LegacyFreezeBanner，但 6 个子页面（wave/tracking/receipt/exceptions/vehicles/drivers）无替代，Sidebar 完全活跃。

---

## 八、旧 farm / store 模块专项结论

### 8.1 farm 模块

**是否被移动端使用：** 是，`apps/web/src/lib/mobile-api.ts` 包含大量对 `/api/farm/egg/*`、`/api/farm/feed/*`、`/api/farm/medicine/*`、`/api/farm/sales/*` 的调用，对应移动端页面：`/mobile/egg`、`/mobile/feed`、`/mobile/medicine`、`/mobile/sales`

**是否被旧订货系统使用：** 是，`/order/farm-sales/page.tsx` 调用 `/api/farm/sales/*`

**是否与 Sales V2 冲突：** 不冲突。`/api/farm/sales/*` 写的是农场直销台账（`inv_ledger`、`inv_batches`），与 Sales V2 的 `sal_orders` 是不同业务场景

**是否属于未来 Farming Runtime 基础：** 是。`/api/v3/farm/*`（daily-logs、hen-report、trend）是未来 Farming V2 的候选范围

**建议：暂保留，不删除。** FarmModule 是独立域，与任何遗留债务无纠缠，未来单独规划 Farm V2 Runtime 时自然替换。

### 8.2 store 模块

**是否被移动端使用：** POS 相关移动端未发现调用 `/api/v3/store/*` 或 `/api/v3/pos/*`（桌面端 `/pos/sales` 调用 `/api/v3/pos/sales/*` 的 refund/void）

**是否被旧订货系统使用：** `pos.service.ts` 注入 `SalesEngineService`（来自 OrderModule）用于价格校验，此为内部模块依赖

**与 Sales V2 关系：** `SalesEngineService` 目前读取 `sal_price_books`/`sal_price_items`（Sales V2 价格表），属于混用场景。如果 StoreModule 解耦 SalesEngineService，可独立存在

**建议：暂保留，不删除。** 门店 POS 在用，需等待 Store V2 规划完成后再迁移。

---

## 九、A/B/C 删除分级

### A 类 — 可立即删除（4 项）

| 编号 | 操作 | 风险 | 前提条件 |
|------|------|------|---------|
| A1 | 删除 `apps/api/src/modules/logistics/` | 零风险 | 无 |
| A2 | 移除 `wms.module.ts` 对 `ProcurementModule` 的冗余 import | 零风险 | 无（WmsService 不用 ProcurementService） |
| A3 | 将 `/order/customers` 改为 redirect → `/sales2/customers` | 零风险 | Sidebar 已注释，LegacyFreezeBanner 已有 |
| A4 | 将 `/b2b/customers` 改为 redirect → `/sales2/customers` | 零风险 | 同上 |

### B 类 — 先替换依赖后删除（6 项）

| 编号 | 操作 | 前提条件 | 工作量 |
|------|------|---------|--------|
| B1 | 删除 `modules/approval/`（旧审批） | 需先修改 `procurement.service.ts`：移除 `ApprovalService` 注入，改用 `ApprovalEngineService` 或删除旧审批调用；更新 `procurement.module.ts` imports | M（1天） |
| B2 | 删除 `apps/web/src/app/(admin)/procurement/` 全部 7 页 | 需先：①所有页面加 LegacyFreezeBanner；②Sidebar procurement 子菜单改为 hidden/disabled；③确认 /procurement2 业务验收完成 | L（2-3天） |
| B3 | 删除 `apps/api/src/modules/procurement/`（V1 采购后端） | 需 B2 完成后；需先移除 `wms.module.ts` 冗余 import（A2）；需先解耦 approval（B1） | M（1天） |
| B4 | 删除 `/order/prices` 页面 | 需先从 Sidebar 注释 `ord-price` 条目 | S（1小时） |
| B5 | 删除 `/order/farm-sales` 孤儿路由 | 需专项评估：是否有用户在直接访问；建议改为 redirect 到 `/mobile/sales` 或 `/sales2` | S（1小时） |
| B6 | 迁移 `/transport/` → `/sales2/delivery` | 需：①Sales V2 delivery 子页面功能完整；②`login/page.tsx` `ROLE_LOG_MGR` 默认路由改为 `/sales2/delivery`；③Sidebar transport 全部迁移 | XL（一个 Sprint） |

### C 类 — 暂保留（5 项）

| 编号 | 模块 | 原因 | 建议时机 |
|------|------|------|---------|
| C1 | `modules/farm/` | 独立农场域，移动端和桌面端活跃使用，无 V2 替代 | Farm V2 Runtime 完成后 |
| C2 | `modules/store/` | POS 系统在用，依赖 SalesEngineService | Store V2 Runtime 完成后 |
| C3 | `modules/order/` | 订单系统活跃，WmsModule 循环依赖复杂 | 全链路 Sales V2 验收后 |
| C4 | `modules/wms/` | 仓储核心，无 V2 替代，前端 13 个页面依赖 | WMS V2 Runtime 完成后 |
| C5 | `(admin)/warehouse/`（13 页） | WMS_MGR 核心工作台，无任何冻结标记 | 同 C4 |

---

## 十、第二轮删除建议（执行命令草案）

### 第一批：立即执行（风险零）

```bash
# A1: 删除空壳 LogisticsModule
rm apps/api/src/modules/logistics/logistics.module.ts
# 同时修改 app.module.ts：移除 LogisticsModule import 和注册

# A2: 移除 WmsModule 对 ProcurementModule 的冗余 import
# 编辑 apps/api/src/modules/wms/wms.module.ts
# 删除：import { ProcurementModule } from '../procurement/procurement.module';
# 删除：ProcurementModule 从 imports 数组中

# A3: /order/customers redirect
# 编辑 apps/web/src/app/(admin)/order/customers/page.tsx
# 替换为：export { default } from '@/app/(admin)/sales2/customers/page';
# 或加 useEffect redirect

# A4: /b2b/customers redirect
# 同 A3

git add -A && git commit -m "refactor: remove logistics empty module, fix wms redundant import, redirect legacy customer pages"
git tag v3-legacy-cutover-batch1-20260528
```

### 第二批：解耦 approval，删除旧 approval 模块

```bash
# B1-step1: 修改 procurement.service.ts
# 找到 constructor 中的 ApprovalService 注入
# 方案 A: 改为注入 ApprovalEngineService（需要 ProcurementModule 导入 ApprovalEngineModule）
# 方案 B: 删除 submitForApproval() 整个方法（如果旧采购审批已由前端迁移到 /procurement2）
# 推荐方案 B（更简洁）

# B1-step2: 修改 procurement.module.ts
# 删除 ApprovalModule import

# B1-step3: 删除旧 approval 模块
rm -rf apps/api/src/modules/approval/
# 修改 app.module.ts：移除 ApprovalModule import 和注册

git commit -m "refactor: decouple procurement.service from legacy ApprovalService, delete approval module"
```

### 第三批：旧采购前端冻结

```bash
# B2-step1: 在所有旧采购页面加 LegacyFreezeBanner
# 7 个页面统一加：
# <LegacyFreezeBanner redirectPath="/procurement2" redirectLabel="前往采购 V2" />

# B2-step2: Sidebar 更改
# 将 procurement V1 的 7 个子菜单 soon=true 或注释掉

# B2-step3: login/page.tsx
# ROLE_PRC_BUYER 默认路由改为 /procurement2

git commit -m "freeze: add LegacyFreezeBanner to all v1 procurement pages, hide Sidebar entries"
```

### 第四批：旧采购前端+后端删除

```bash
# B3: 在 B2 验收通过后
rm -rf apps/web/src/app/(admin)/procurement/
rm -rf apps/api/src/modules/procurement/
# 修改 app.module.ts：移除 ProcurementModule
# 修改 wms.module.ts：确认 ProcurementModule import 已在 A2 移除

git commit -m "refactor: delete legacy procurement module (frontend + backend)"
git tag v3-legacy-cutover-batch4-20260528
```

---

## 十一、风险清单

| 风险编号 | 风险描述 | 级别 | 缓解措施 |
|---------|---------|------|---------|
| R1 | `OrderModule` ↔ `WmsModule` 循环依赖（`forwardRef`），直接删除任何一个会导致 NestJS 启动失败 | HIGH | 必须同时重构两个模块或彻底解耦 |
| R2 | `StoreModule`（POS）依赖 `SalesEngineService`（来自 OrderModule），删除 OrderModule 会导致 POS 系统崩溃 | HIGH | 先将 SalesEngineService 迁移到独立模块或 SalesV2Module |
| R3 | `order.service.ts` 在订单 RECEIVED 时写 `fin_transactions`（旧 AR），Sales V2 AR 链路（`fin_ar_invoices`）未与旧订单系统打通 | MEDIUM | 删除 OrderModule 前验证 Sales V2 AR 覆盖率 |
| R4 | `ROLE_LOG_MGR` 默认路由是 `/transport`，删除 transport 前必须先更新 login 路由 | MEDIUM | login.tsx 中提前更新 ROLE_LOG_MGR → `/sales2/delivery` |
| R5 | `ROLE_WMS_MGR` 默认路由是 `/warehouse`，warehouse 是完全活跃的核心系统 | LOW → 持续关注 | 不要删 warehouse，等 WMS V2 |
| R6 | `wms.module.ts` 的 ProcurementModule 冗余 import 删除后，若 WmsService 将来真的需要 ProcurementService，会编译失败 | LOW | A2 执行后立即做 TS 检查 |
| R7 | `/order/farm-sales` 孤儿路由可能有用户直接书签访问，无 Sidebar 入口 | LOW | 先加 redirect，不直接删除 |

---

## 十二、测试结果（审计基线）

| 测试项 | 命令 | 结果 |
|-------|------|------|
| API TypeScript | `cd apps/api && npx tsc --noEmit` | ✅ 0 errors |
| Web TypeScript | `cd apps/web && npx tsc --noEmit` | ✅ 0 errors |
| scope-audit.sh | `bash apps/api/test/scope-audit.sh` | ✅ 31/31 PASS |
| 基准 commit | `d5867c8` | 已推送 |

---

## 附录 A：旧模块快速参考卡

```
模块               能否立即删   阻塞依赖
──────────────────────────────────────────────────
logistics          ✅ 可立即删   无（空壳）
approval           ❌            ProcurementService 注入
procurement        ❌            前端 9 个活跃调用 + approval 依赖
order              ❌            WmsService 循环 + SalesEngineService → POS
farm               ❌            移动端 + 桌面端完全活跃，无替代
store              ❌            POS 系统在用，SalesEngineService 依赖
wms                ❌            仓储核心，OrderService 循环依赖
```

## 附录 B：前端快速参考卡

```
页面                 可立即操作         操作类型
────────────────────────────────────────────────────────
/order/customers    ✅                 加 redirect → /sales2/customers
/b2b/customers      ✅                 加 redirect → /sales2/customers
/order/prices       需先改 Sidebar      注释 Sidebar 条目后加 redirect
/order/farm-sales   需评估              孤儿路由，建议加 redirect
/procurement/*      需业务确认          全员迁移到 /procurement2 后冻结
/transport/*        需 Sales V2 完整    Sales V2 delivery 完整后迁移
/warehouse/*        不操作              WMS 核心，无 V2 替代
```
