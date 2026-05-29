# Phoenix ERP V3 — ord_* 表封存档案
**Phase E: Order 模块删除 · ord_* 表封存策略**  
**日期**: 2026-05-29  
**Commit**: v3-non-v2-cutover-phase-e-remove-order-20260529

---

## 一、封存结论

`ord_*` 系列数据库表现已进入**只读历史封存**状态。

| 决定 | 内容 |
|------|------|
| 保留表结构 | ✅ 所有 ord_* 表保留，不 DROP |
| 保留历史数据 | ✅ 历史 ord_orders 数据保留，不清除 |
| 新业务写入 | ❌ 禁止新增业务功能直接写入 ord_* 表 |
| 正式销售链路 | Sales V2 `sal_*` 表（已完整替代） |
| 再评估时间 | 生产环境稳定 3-6 个月后评估是否 DROP |

---

## 二、封存的数据库表清单

| 表名 | 原用途 | 封存状态 | Generic CRUD 访问权限 |
|------|--------|---------|---------------------|
| `ord_orders` | B2B 批发订单主表 | 历史封存 | ROLE_ADMIN, ROLE_REGION_MGR, ROLE_STORE_MGR, ROLE_HEADOFFICE |
| `ord_order_items` | 订单明细行 | 历史封存 | 同上 |
| `ord_customers` | 旧客户主档（散客/B2B） | 历史封存 | ROLE_ADMIN, ROLE_REGION_MGR, ROLE_HEADOFFICE |
| `ord_prices` | 旧价格表（按 customer_type/grade 定价） | 历史封存 | ROLE_ADMIN, ROLE_REGION_MGR, ROLE_FIN_CFO, ROLE_HEADOFFICE |
| `ord_approval_log` | 订单审批日志 | 历史封存 | ROLE_ADMIN, ROLE_AUDITOR, ROLE_CEO, ROLE_REGION_MGR |
| `ord_credit_usage` | 信用额度占用流水 | 历史封存 | ROLE_ADMIN, ROLE_FIN_CFO, ROLE_FIN_AR, ROLE_REGION_MGR |

> **所有 ord_* 表均已在 `crud.constants.ts` 中配置严格角色访问控制，未开放匿名访问。**

---

## 三、已删除的后端代码（Phase E）

### 3.1 删除的模块目录

```
apps/api/src/modules/order/           ← 全目录删除
├── order.module.ts                   ← OrderModule（从 app.module.ts 注销）
├── order.service.ts                  ← OrderService（订单业务逻辑）
├── order.controller.ts               ← /api/order/* REST 接口（已 404）
├── sales-engine.service.ts           ← SalesEngineService（已迁入 store-pos）
└── entities/
    └── sales-order.entity.ts         ← TypeORM Entity（表继续存在，Entity 删除）
```

### 3.2 app.module.ts 清理

```typescript
// Phase E 前：
import { OrderModule } from './modules/order/order.module';  // ← 已删除
// ...
imports: [FarmModule, OrderModule, StoreModule, ...]          // ← OrderModule 已移除
```

### 3.3 SalesEngineService 迁移路径（Phase D 完成）

```
order/sales-engine.service.ts  →  store-pos/services/sales-engine.service.ts
```

PosService 现从 `StorePosModule` 获取 `SalesEngineService`，`StoreModule → OrderModule` 依赖已彻底解除。

---

## 四、已删除的前端代码（Phase E）

### 4.1 删除的前端目录

```
apps/web/src/app/(admin)/order/      ← 全目录删除
├── page.tsx                         ← 订单列表主页
├── approval/page.tsx                ← 订单审批页
├── credit/page.tsx                  ← 信用管理页
├── customers/page.tsx               ← 客户管理页（旧版）
├── farm-sales/page.tsx              ← 农场直销入口（混用 /api/v2/）
├── loading/page.tsx                 ← 装货管理页
├── picking/page.tsx                 ← 拣货管理页
└── prices/page.tsx                  ← 价格管理页（旧版）
```

### 4.2 前端引用更新

| 文件 | 改动 |
|------|------|
| `apps/web/src/middleware.ts` | GUARDED_PREFIXES 中移除 `'/order'` |
| `apps/web/src/app/(admin)/layout.tsx` | 删除 7 条 `/order/*` TITLE_KEY_MAP 条目 |
| `apps/web/src/app/(admin)/dashboard/page.tsx` | 快捷入口 `/order` → `/sales2/orders` |
| `apps/web/src/app/login/page.tsx` | `ROLE_SALES_REP` 首页 `/order` → `/sales2/orders` |

---

## 五、/api/order/* 路由状态

`order.controller.ts` 已删除。所有 `/api/order/*` 接口将返回 **404 Not Found**。

正式业务通过以下 V2 接口替代：

| 旧接口 | 新接口 | 模块 |
|--------|--------|------|
| `POST /api/order/submit` | `POST /api/v2/sales/orders` | SalesV2Module |
| `GET /api/order/:no` | `GET /api/v2/sales/orders/:id` | SalesV2Module |
| `POST /api/order/transition` | `POST /api/v2/sales/orders/:id/transition` | SalesV2Module |
| `GET /api/order/customers` | `GET /api/v2/sales/customers` | SalesV2Module |
| `GET /api/order/prices` | `GET /api/v2/sales/price-books` | SalesV2Module |

---

## 六、受控残留引用（非 OrderModule 依赖，保留合理）

以下代码继续使用 `ord_*` 表进行**直接 SQL 查询**（via EntityManager），
**不依赖 OrderModule/OrderService**，Phase E 不修改：

| 文件 | 用途 | 操作类型 | 可否消除 |
|------|------|---------|---------|
| `health.controller.ts:121` | 系统健康检查 — 统计 ord_orders 状态分布 | SELECT COUNT | ⚠️ 可后续删除 |
| `bff/bff.controller.ts` | 仪表盘 KPI — 农场直销额、今日订单数 | SELECT | ⚠️ Phase F 可迁移至 sal_* |
| `farm/farm-sales.service.ts` | 农场直销（FARM_SALE 类型）写入 ord_orders | INSERT/UPDATE | ⚠️ 待 Farm V2 时迁移 |
| `wms/wms.service.ts` | WMS 出库面板 — 读 ord_orders approved/allocated | SELECT + UPDATE status | ⚠️ 待 WMS V2 时迁移 |
| `finance-v2/finance-order-bridge.controller.ts` | 旧订单收款桥接 — 更新 ord_orders.paid_amount | UPDATE | ⚠️ Phase F 评估迁移 |
| `store-pos/services/sales-engine.service.ts:79` | POS 价格验证 — 读 ord_customers 黑名单 | SELECT | ⚠️ Phase G 统一客户主档后迁移 |
| `generic-crud/crud.constants.ts` | Generic CRUD 表白名单（有 RBAC 守卫） | DDL/DML（受控） | ✅ 保留至 DROP 前 |
| `generic-crud/generic-crud.service.ts` | CREATE TABLE IF NOT EXISTS（表引导） | DDL | ✅ 保留至 DROP 前 |

### 关键结论

- 上述引用均为 **EntityManager 直接 SQL**，不经过 OrderModule/OrderService 的业务逻辑
- `OrderModule` 删除后这些引用完全不受影响
- 新增 ord_* 表的业务逻辑写入 = **0**（farm-sales 是旧功能，不是本阶段新增）

---

## 七、Sales V2 替代链路对照

| 旧链路 | Sales V2 替代 | 状态 |
|--------|--------------|------|
| `ord_orders` 订单状态机 | `sal_sales_orders` + Workflow 审批引擎 | ✅ Phase 3 完成 |
| `ord_order_items` 明细 | `sal_order_items` | ✅ Phase 3 完成 |
| `ord_customers` 客户主档 | `sal_customers`（含渠道/信用/多地址） | ✅ Phase 5 完成 |
| `ord_prices` 价格表 | `sal_price_books + sal_price_items`（含价格带/审批） | ✅ Phase 2 完成 |
| `ord_credit_usage` 信用占用 | `sal_credit_events`（含自动冻结/Scheduler） | ✅ Phase 5 完成 |
| `fin_transactions` AR 记录 | `fin_ar_invoices + fin_ar_receipts` | ✅ Finance V2 完成 |
| WMS 联动（APPROVED→allocated） | `sal_delivery_orders` Delivery Runtime | ✅ Phase 4 完成 |
| 订单退货 | `sal_return_orders`（含质检+回库+Credit Note） | ✅ Phase 6 完成 |

---

## 八、可后续清理的 MENU 权限条目

以下 MENU 权限在 `rbac.matrix.ts` 或权限配置中存在，
绑定旧 `/order/*` 页面，可在 **Phase F 或更晚阶段**清理：

- `MENU_ORDER_CENTER` — 旧订单中心入口
- `MENU_ORDER_APPROVAL` — 旧审批页
- `MENU_ORDER_PICKING` — 旧拣货页
- `MENU_ORDER_LOADING` — 旧装货页
- `MENU_ORDER_CREDIT` — 旧信用管理页
- `MENU_ORDER_CUSTOMERS` — 旧客户管理页
- `MENU_ORDER_PRICES` — 旧价格管理页

> 本阶段（Phase E）**不删除**上述 MENU 条目，避免影响角色配置一致性。
> 如系统无任何 User-MENU 权限记录指向这些 KEY，可安全清理。

---

## 九、封存时间线

```
2026-05-29  Phase C — WmsModule forwardRef 假性循环依赖清除
2026-05-29  Phase D — SalesEngineService 迁入 store-pos，StoreModule 解依赖
2026-05-29  Phase E — OrderModule 注销 + order/ 模块全目录删除 + 前端 /order 删除
            ord_* 表正式进入历史封存阶段
            ——————
            [待定]  Farm V2 完成后 farm-sales.service.ts 迁移 sal_farm_sales
            [待定]  WMS V2 完成后 wms.service.ts 迁移 sal_delivery_orders 查询
            [待定]  客户主档整合（Phase F）— sal_customers 统一替代 ord_customers
            [生产稳定 6 个月后] 评估 DROP ord_* 表
```

---

## 十、DROP 前置条件清单（未来参考）

| 条件 | 当前状态 |
|------|---------|
| farm-sales.service.ts 已迁移至 sal_* | ❌ 未完成 |
| wms.service.ts 出库面板已迁移 | ❌ 未完成 |
| bff.controller.ts KPI 已迁移 | ❌ 未完成 |
| finance-order-bridge 已停用 | ❌ 未完成 |
| store-pos SalesEngine 已改用 sal_customers | ❌ 未完成 |
| Generic CRUD ord_* 白名单已清理 | ❌ 未完成 |
| 生产环境稳定运行 3-6 个月 | ❌ 未达到 |

> **满足所有条件后，执行**：  
> ```sql
> DROP TABLE IF EXISTS ord_credit_usage CASCADE;
> DROP TABLE IF EXISTS ord_approval_log CASCADE;
> DROP TABLE IF EXISTS ord_order_items CASCADE;
> DROP TABLE IF EXISTS ord_orders CASCADE;
> DROP TABLE IF EXISTS ord_prices CASCADE;
> DROP TABLE IF EXISTS ord_customers CASCADE;
> ```

---

*本文档基于 2026-05-29 代码快照。Phase E commit: `v3-non-v2-cutover-phase-e-remove-order-20260529`*
