# Phoenix ERP V3 — Order / WMS 循环依赖切割报告
**Phase C: 依赖审计 & 最小化改造**  
**日期**: 2026-05-29  
**Commit**: v3-non-v2-cutover-phase-c-order-wms-20260529

---

## 一、依赖矩阵

### 1.1 模块导入关系（Phase C 改造前）

```
OrderModule
  ├── imports: WmsModule (via forwardRef)     ← 真实依赖，OrderService 注入 WmsService
  ├── imports: AuthModule                     ← 认证
  └── exports: OrderService, SalesEngineService

WmsModule
  ├── imports: OrderModule (via forwardRef)   ← 【假性依赖】WmsService 从不注入 OrderService
  └── exports: WmsService, InventoryService

StoreModule
  ├── imports: OrderModule                    ← 真实依赖，PosService 注入 SalesEngineService
  └── exports: StoreService, PosService
```

### 1.2 模块导入关系（Phase C 改造后）

```
OrderModule
  ├── imports: WmsModule                      ← 单向，无需 forwardRef
  ├── imports: AuthModule
  └── exports: OrderService, SalesEngineService

WmsModule
  └── exports: WmsService, InventoryService   ← 不再依赖 OrderModule

StoreModule
  ├── imports: OrderModule                    ← 维持不变
  └── exports: StoreService, PosService
```

---

## 二、forwardRef 清单

| 文件 | forwardRef 位置 | 是否真实循环 | 处理结果 |
|------|----------------|------------|--------|
| `wms/wms.module.ts` | `forwardRef(() => OrderModule)` | ❌ 假性（WmsService 不注入 OrderService） | **删除** |
| `order/order.module.ts` | `forwardRef(() => WmsModule)` | 由 WmsModule 伪造循环引起 | **改为直接 import** |
| `order/order.service.ts` | `@Inject(forwardRef(() => WmsService))` | 由模块循环引起，OrderService 确实使用 WmsService | **改为普通注入** |

---

## 三、Order → WMS 调用清单

### 调用位置
`apps/api/src/modules/order/order.service.ts` — `transitionOrder()` 方法：

```typescript
// A1: APPROVED 时联动 WMS — 推进出库单到 allocated 阶段
if (toStatus === 'APPROVED') {
  try {
    await this.wmsService.advanceOutboundOrder(orderNo, { next_status: 'allocated' }, user);
  } catch (e: any) {
    console.warn('[transitionOrder][WARN] WMS allocate 触发失败:', e?.message);
    // 不阻塞订单状态推进；WMS 可后续手动补
  }
}
```

### 分析

| 项目 | 内容 |
|------|------|
| 调用方法 | `WmsService.advanceOutboundOrder(orderNo, {next_status:'allocated'}, user)` |
| 调用时机 | 订单从 DRAFT/任意状态 → APPROVED |
| 调用目的 | 推进仓库出库单到 ALLOCATED 阶段（建工单、分配库存） |
| 失败处理 | try/catch 降级，不阻断订单状态流转 |
| **是否为出库** | ✅ 是（出库单状态推进） |
| **是否为库存扣减** | 部分（allocated 阶段预留，shipped 阶段才真正扣减） |
| **是否可替换为 Sales V2** | 理论上可以，但 Sales V2 已有独立的 `sal_delivery_orders` 不依赖此路径。此调用属于 ord_orders（旧订单体系）专属链路，不影响 Sales V2。 |
| **当前决策** | 保留，旧订单 approved → wms allocated 链路仍在用。待 ord_orders 整体下线后消除。 |

### fin_transactions 调用状态

`order.service.ts` 中 `fin_transactions` 写入已于 Phase 2D **完全注释停用**（代码注释标注"已废弃"）：

```typescript
// [Phase 2D] fin_transactions 写入已停用：
//   · 旧版通过 fin_transactions 记录 AR 账目（DEBIT/CREDIT）已废弃
//   · Sales V2 Phase 3/4 已通过 sal_delivery_orders → fin_ar_invoices 生成规范 AR 发票
// if (toStatus === 'RECEIVED') { ... fin_transactions ... }  ← 已注释
```

---

## 四、WMS → Order 调用清单

### 实际调用情况

**WmsService 从未注入 OrderService。**

WmsService 对 `ord_orders` / `ord_order_items` 的所有访问均为 **直接 SQL 查询**（通过 `EntityManager`）：

| WmsService 方法 | 操作的 ord_ 表 | 操作方式 |
|----------------|--------------|--------|
| `getOutboundDashboard()` | `ord_orders` | SELECT COUNT WHERE status='approved'/'allocated' |
| `getPendingOutbound()` | `ord_orders` | SELECT WHERE status IN (...) |
| `getOutboundOrder()` | `ord_orders`, `ord_order_items` | SELECT 订单详情 |
| `advanceOutboundOrder()` | `ord_orders` | UPDATE status + SELECT FOR UPDATE |
| `receiveSignOrder()` | `ord_orders` | UPDATE status='received' |

### 结论

WmsService **不调用 OrderService 的任何方法**。WmsModule 对 OrderModule 的 forwardRef 导入是历史遗留的假性循环依赖，**已在 Phase C 删除**。

---

## 五、Store/POS → Order 调用清单

| 服务 | 对 OrderModule 的依赖 | 详情 |
|------|---------------------|------|
| `StoreService` | ❌ 无 | 仅注入 StoreDailyCloseEntity + EntityManager |
| `PosService` | ✅ SalesEngineService | `import { SalesEngineService } from '../order/sales-engine.service'` |

### PosService 对 SalesEngineService 的使用

```typescript
// pos.service.ts 第109行
const validation = await this.salesEngine.validatePriceOnly(...)
```

**用途**：POS 零售价格带保护 — 拦截低于零售下限的定价（BIZ-02 业务规则）。

**StoreModule 仍需要 OrderModule** 的唯一原因是 PosService 使用 `SalesEngineService`（由 OrderModule 导出）。

---

## 六、可移除依赖清单

| 依赖 | 可移除 | 理由 | 已处理 |
|------|--------|------|--------|
| `WmsModule.imports: OrderModule` (forwardRef) | ✅ | WmsService 不注入 OrderService，是假性依赖 | ✅ **Phase C 已删除** |
| `OrderModule.imports: WmsModule` 的 forwardRef | ✅ | 循环已消除，改直接 import | ✅ **Phase C 已修复** |
| `OrderService` 的 `@Inject(forwardRef(...))` | ✅ | 改为普通 NestJS 注入 | ✅ **Phase C 已修复** |
| `fin_transactions` 在 order.service 的写入 | ✅ | 已在 Phase 2D 注释停用 | ✅ 历史已处理 |

---

## 七、不可立即移除的依赖

| 依赖 | 理由 |
|------|------|
| `OrderModule.imports: WmsModule` | OrderService 仍在 APPROVED 时调用 `wmsService.advanceOutboundOrder()`，旧订单链路需要 |
| `StoreModule.imports: OrderModule` | PosService 需要 `SalesEngineService` 做零售价格保护（BIZ-02） |
| `WmsService` 直接 SQL 查询 `ord_orders` | WMS 出库面板显示旧订单状态，前端仍有 `/warehouse/outbound` 页面在用 |
| `ord_orders` generic-crud 入口 | 前端 `/order` 路由仍开放，管理员仍可查看旧订单记录 |

---

## 八、最小改造结果

### 代码变更（3 个文件）

**1. `apps/api/src/modules/wms/wms.module.ts`**
- 删除 `forwardRef` import from `@nestjs/common`
- 删除 `import { OrderModule }` 
- 删除 `forwardRef(() => OrderModule)` from imports array
- 添加说明注释

**2. `apps/api/src/modules/order/order.module.ts`**
- 删除 `forwardRef` import from `@nestjs/common`
- `forwardRef(() => WmsModule)` → `WmsModule`
- 更新注释

**3. `apps/api/src/modules/order/order.service.ts`**
- 删除 `Inject, forwardRef` from `@nestjs/common` imports
- `@Inject(forwardRef(() => WmsService)) private readonly wmsService: WmsService` → `private readonly wmsService: WmsService`

### 结果验证

| 测试 | 结果 |
|------|------|
| API TypeScript | ✅ 0 errors |
| Web TypeScript | ✅ 0 errors |
| scope-audit.sh | ✅ 31/31 PASS |

---

## 九、Generic CRUD 表访问权限现状

### 已在 `crud.constants.ts` 中配置访问控制的表

| 表名前缀 | 当前状态 | 访问角色限制 |
|---------|---------|------------|
| `ord_customers` | ✅ 限制访问 | ROLE_ADMIN, ROLE_REGION_MGR, ROLE_HEADOFFICE |
| `ord_orders` | ✅ 限制访问 | ROLE_ADMIN, ROLE_REGION_MGR, ROLE_STORE_MGR, ROLE_HEADOFFICE |
| `ord_order_items` | ✅ 限制访问 | 同上 |
| `ord_approval_log` | ✅ 限制访问 | ROLE_ADMIN, ROLE_AUDITOR, ROLE_CEO, ROLE_REGION_MGR |
| `ord_credit_usage` | ✅ 限制访问 | ROLE_ADMIN, ROLE_FIN_CFO, ROLE_FIN_AR, ROLE_REGION_MGR |
| `fin_transactions` | ✅ 限制访问 | ROLE_ADMIN, ROLE_FIN_CFO, ROLE_FIN_ACCT, ROLE_FIN_AR |
| `wms_*` | ✅ 限制访问 | WMS/管理员角色，仓库功能正常使用需要 |

**评估**：Generic CRUD 对所有 `ord_*` 和 `fin_transactions` 表均有角色限制，未开放匿名访问。`wms_*` 表是仓库日常操作的正式入口，不应阻断。

---

## 十、Phase D 删除建议（下一阶段目标）

### 前端 `/order` 路由现状

- **Sidebar 状态**：已注释（sidebar 第97行注释：`新版销售管理请使用 /sales2`）
- **路由目录**：`apps/web/src/app/(admin)/order/` 仍存在（8个子页面）
- **API 调用**：调用 `/api/crud/ord_*` 和 `/api/orders` 端点
- **注意**：`/order/farm-sales` 子页面已混用 `/api/v2/` 端点（部分迁移遗留）

### Phase D 删除前置条件

| 条件 | 当前状态 | 说明 |
|------|---------|------|
| Sidebar 已注释 | ✅ 已完成 | 旧入口不可见 |
| WmsModule 解依赖 | ✅ Phase C 完成 | 假性 forwardRef 已删除 |
| 前端路由可访问性 | ⚠️ 仍可直接 URL 访问 | 无显式权限守卫 |
| StoreModule → OrderModule | ⚠️ 仍依赖 SalesEngineService | PosService BIZ-02 需要 |
| ord_orders 数据迁移 | ❌ 未完成 | 历史订单数据是否需要迁移到 sal_orders？ |

### Phase D 建议步骤

1. **确认 `/order` 前端不再有任何 Sidebar 或快捷链接入口**（Phase B 已移除 dashboard 快捷链接 ✅）
2. **将 `SalesEngineService` 移出 `order` 模块**：复制到 `store-pos` 模块或独立 `pricing` 模块，切断 StoreModule → OrderModule 依赖
3. **将 `WmsService` 出库查询迁移离 `ord_orders`**：改查 `sal_delivery_orders`（Sales V2），或保留 ord_orders 作为只读历史数据
4. **从 `app.module.ts` 注释 `OrderModule`**：此时应无任何模块依赖它
5. **删除 `/order` 前端路由目录**
6. **归档 `order/` 后端目录**（保留历史数据可读性）

### 关键阻塞点

**SalesEngineService 的归属** 是 Phase D 的核心障碍。当前 SalesEngineService 在 `order` 模块内，但被 `store`（PosService）使用。需要：
- 选项A：将 SalesEngineService 提取到独立的 `pricing` 模块
- 选项B：将 SalesEngineService 移入 `store-pos` 模块（仅服务 POS）
- 选项C：在 Sales V2 PriceRuntimeService 中重新实现（长期最优）

**Phase D 启动条件**：仅在用户确认历史 ord_orders 数据迁移策略后执行。

---

*本报告基于 2026-05-29 代码快照。改造结果已通过 TypeScript 0 errors + scope-audit 31/31 PASS 验证。*
