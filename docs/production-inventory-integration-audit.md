# 生产—包装—库存—销售链路整合审计报告

> **任务**：Production Inventory Integration Refactor Phase P1 · §1 现状审计
> **日期**：2026-06-02
> **范围**：养殖生产 → 集蛋 → 分级/包装 → 成品批次 → 自动入库 → 库存可销售 → 销售订单/门店POS扣减 → 库存流水/批次追溯
> **方法**：5 路并行只读代码审计 + 关键文件实读核对（farm-egg.service.ts / packaging.service.ts / egg-inventory.service.ts / farm-sales.service.ts），未修改任何代码或表结构
> **结论级别**：🔴 **CRITICAL** — 同一物理蛋品存在三套互不感知的入库/扣减闭环并存于同一张 `inv_batches`，构成真实的双重计数与追溯断裂风险

---

## 一、Executive Summary（一句话现状）

> **库存表是统一的（`inv_batches` + `inv_ledger`），但写入与扣减它的业务路径有三套互不相通的闭环，批次号/产品编码三套命名各自为政，销售扣减只认其中一套——这不是"三个独立模块"的问题，而是"一张表里塞了三套不兼容的库存语义"的问题。**

真正的断链点不在"包装完成没有自动入库"（包装其实**已经**自动入库），而在于：

1. **集蛋存在"旁路直入可售库存"**：`farm-egg` 让集蛋绕过分级/包装，直接变成可销售库存。
2. **三套批次命名体系并存**：`EGG-STOCK-*`（旁路）、`PRD-EGG-*`/`PRD-EGG-*-PACK`（包装）、`EGG-YYYYMMDD-NNNNN`（Sales V2 Phase 7），互不映射。
3. **销售扣减只认一套**：Sales V2 订单 / 门店 POS 走 FIFO，只扣 `EGG-YYYYMMDD-*` 批次；旁路与包装写入的库存"可见但销售扣不到"，或与之重复计数。

---

## 二、统一库存表现状（好消息）

系统**只有两张核心库存表**，唯一性已确立：

| 概念 | 唯一表 | 建表迁移 |
|------|--------|---------|
| 库存批次 | **`inv_batches`** | `v3_schema_complete.sql` + `20260527_sales_v2_phase7_egg_inventory.sql` + `20260530_product_master_h4_inventory_sku.sql` |
| 库存流水 | **`inv_ledger`** | 同上 |

- ❌ 不存在 `egg_inventory_*` / `sal_egg_*` / 包装库存表 / 集蛋库存表等并存库存主表。
- ✅ `inv_batches` 已具备 Phase 7 字段（`egg_date`/`quality_grade`/`source_type`/`source_no`/`expire_date`/`company_code`）与 Phase H4 SKU 字段（`sku_code`/`grade_code_std`/`spec_code`）。
- ✅ `inv_ledger` 已具备完整 `change_type` 枚举与 `sku_code` 传递。

**因此 P1 §3"inv_batches 为唯一成品库存批次表、inv_ledger 为唯一库存流水表"这一前提已经成立——不需要新建库存主表。真正要治理的是写入路径与命名语义。**

---

## 三、三套并存闭环（核心病灶 · 代码实证）

### 闭环 A — Farm Egg 旁路（集蛋直入可售库存）🔴

**服务**：`apps/api/src/modules/farm/farm-egg.service.ts`
**控制器**：`apps/api/src/modules/farm/farm-egg.controller.ts` → `@Controller('api/farm/egg')`
**前端入口**：
- `apps/web/src/app/(admin)/breeding/egg-ledger/page.tsx`（后台·蛋品台账）
- `apps/web/src/app/(mobile)/mobile/egg/page.tsx`（移动端·鸡蛋出入库）

**机制**（实读确认）：
- `onModuleInit()`：为 8 个等级（`0/1/2/3/4/5/DIRTY/BROKEN`）预建 8 个**固定累加批次** `EGG-STOCK-{grade}`，`product_code = EGG-{grade}`，`warehouse_code = 'FARM_EGG'`，无 `expire_date`、无 `egg_date`、无 `source_no`。
- `inbound()`：集蛋入库 → 直接 `UPDATE inv_batches SET qty += n, qty_available += n WHERE batch_no='EGG-STOCK-{grade}'`，写 `inv_ledger` `change_type='EGG_INBOUND_HOUSE'`。
  → **无分级、无包装、无质检、无保质期，集蛋当场变成可销售库存。**
- `outbound()`：直接扣减 `EGG-STOCK-{grade}`，写 `EGG_OUTBOUND_SALE`。
- `writeOff()`：报损，写 `EGG_WRITE_OFF`。

**销售旁路**：`apps/api/src/modules/farm/farm-sales.service.ts`
- 农场直销下单 → 调 `eggSvc.outbound(...)`（line 112）从 `EGG-STOCK-*` 扣库存
- 退货 → 调 `eggSvc.inbound(...)`（line 143）回补
  → **这是一个完全自洽、与 Sales V2 / 包装链路平行、互不感知的闭环。**

### 闭环 B — Packaging 正规链路（已自动入库）✅但命名孤立

**服务**：`apps/api/src/modules/terminal/packaging.service.ts`
**控制器**：`apps/api/src/modules/terminal/packaging.controller.ts`
**前端**：`apps/web/src/app/(terminal)/terminal/packaging/*`

**机制**（三步事务链，均在事务内写 `inv_batches` + `inv_ledger`）：
1. `POST /api/packaging/shifts/:id/complete` → `completeShift()`：集蛋班次结单 → 写鲜蛋批次 `inv_batches`（`product_code=PRD-EGG-RAW`，`change_type=EGG_IN`）+ 建分级任务 `pkg_tasks`。
2. `POST /api/packaging/tasks/:id/grade` → `submitGrade()`：按等级拆分 → 多条 `inv_batches`（`PRD-EGG-{grade}`，可售 `EGG_GRADED` / 隔离 `EGG_GRADED_QUARANTINE`）。
3. `POST /api/packaging/tasks/:id/pack-complete` → `packComplete()`：包装结单 → 写 `inv_batches`（`PRD-EGG-{grade}-PACK`，`PACK_DONE` / `PACK_DONE_QUARANTINE`）+ **自动建 `wms_inbound` 任务**等待仓库验收上架。

> **关键澄清**：P1 任务原始假设"包装完成必须自动写入库存"暗示当前没有——**审计否定了这一假设**：包装链路**已经**在事务内自动写 `inv_batches`/`inv_ledger`。问题不是"没写"，而是：
> - 它写的 `product_code`（`PRD-EGG-*` / `PRD-EGG-*-PACK`）与 Sales V2 FIFO 扣减认的 `EGG-YYYYMMDD-*` / `sku_code` **命名不一致**；
> - 它和闭环 A（farm-egg）可能对**同一批物理蛋**各写一次 → 双重计数。

**辅助表**：`pkg_shifts` / `pkg_tasks` / `pkg_source_batches` / `pkg_grading_records` / `pkg_packing_records` / `pkg_handover_records`。
> **注意**：不存在 `pkg_packaging_batches` 表（P1 §3 命名）。包装批次语义目前由 `pkg_tasks` + `pkg_packing_records`(JSONB) 承载。

### 闭环 C — Sales V2 Phase 7 蛋品库存 Runtime（销售实际扣减的那套）✅

**服务**：`apps/api/src/modules/sales-v2/services/egg-inventory.service.ts`
**控制器**：`apps/api/src/modules/sales-v2/controllers/egg-inventory.controller.ts`
**前端**：`apps/web/src/app/(admin)/sales2/inventory/page.tsx`

**机制**：
- `createProductionBatch()`：生产入库 → 写 `inv_batches`（`batch_no=EGG-YYYYMMDD-NNNNN`，`source_type=PRODUCTION`，带 `expire_date`/`egg_date`/`quality_grade`），`change_type=INBOUND`。
- `allocateByFIFO()` / `reserveInventory()`：销售订单审批 → 按 `expire_date ASC, created_at ASC` FIFO 预占，`Advisory Lock`（`fifo:{company}:sku:{sku}` 或 `fifo:{company}:{product}`）防并发超卖，写 `RESERVED`。
- `confirmOutbound()`：配送装车 → 物理扣 `qty`，写 `FIFO_OUT`。
- `processReturnInventory()`：退货回库 → 新建 `RETURN` 批次（等级降级），写 `SALE_RETURN` + 损坏 `DAMAGE_WRITEOFF`。

**销售/POS 扣减统一走这套**：
- Sales V2 订单：`sales-orders.service.ts approveCallback()` → `reserveInventory()`；配送 LOADED → `confirmOutbound()`。
- 门店 POS：`store-pos.service.ts fifoDeductItems()` → 扣 `inv_batches`，写 `FIFO_OUT`。
- 退货：`return-orders.service.ts completeRestock()` → `processReturnInventory()`。

---

## 四、三套批次/编码命名体系对照（断链根因）

| 维度 | 闭环 A（farm-egg 旁路） | 闭环 B（packaging） | 闭环 C（Sales V2 Phase 7） |
|------|----------------------|--------------------|--------------------------|
| batch_no | `EGG-STOCK-{0..5/DIRTY/BROKEN}`（8个固定累加） | `PRD-EGG-RAW` / `PRD-EGG-{grade}` / `PRD-EGG-{grade}-PACK` | `EGG-YYYYMMDD-NNNNN`（逐批） |
| product_code | `EGG-{grade}` | `PRD-EGG-*` | 生产录入的 product_code |
| warehouse_code | `FARM_EGG` | `WMS-VTE-MAIN` | 生产录入仓库 |
| expire_date | ❌ 无 | 今日+7天 | ✅ 有（FIFO 依据） |
| 等级体系 | 数字 0-5 + DIRTY/BROKEN | AA/A/B/C/DIRTY/CRACKED/BROKEN（`product_grades`） | quality_grade |
| 销售是否扣得到 | ❌ 仅 farm-sales 旁路扣 | ❌ FIFO 不按此命名选 | ✅ 销售/POS FIFO 实扣 |
| change_type | `EGG_INBOUND_HOUSE`/`EGG_OUTBOUND_SALE`/`EGG_WRITE_OFF` | `EGG_IN`/`EGG_GRADED(_QUARANTINE)`/`PACK_DONE(_QUARANTINE)` | `INBOUND`/`RESERVED`/`RELEASED`/`FIFO_OUT`/`SALE_RETURN` |

> 三列等级编码（数字制 / 字母制 / quality_grade）互不映射，是追溯链与库存合并的第一道墙。

---

## 五、双重计数 / 库存风险矩阵

| 风险 | 场景 | 严重度 |
|------|------|--------|
| **R1 同蛋双记** | 同一批物理蛋既经"集蛋入库"（闭环A写 `EGG-STOCK-*`）又经包装链路（闭环B写 `PRD-EGG-*`），库存被记两次 | 🔴 CRITICAL |
| **R2 销售扣不到** | 闭环A/B 写入的库存，Sales V2 订单/POS 的 FIFO 只认 `EGG-YYYYMMDD-*`，导致"系统有货但销售提示无库存" | 🔴 CRITICAL |
| **R3 旁路超卖** | farm-sales 直接扣 `EGG-STOCK-*`，无 Advisory Lock（仅闭环C 有），并发下可超卖 | 🟠 HIGH |
| **R4 追溯断裂** | `inv_batches.source_no` 为字符串、无外键，三套命名互不指向，无法从销售单回溯到包装批次→集蛋→鸡舍 | 🟠 HIGH |
| **R5 重复入口** | 「集蛋入库」「包装入库」「库存入库」多菜单可写库存，无幂等防护 | 🟠 HIGH |

---

## 六、销售—库存联动追溯链（断点定位）

```
鸡舍(brd_houses)
  └─ 日产蛋(brd_daily_logs.eggs_produced)         ← 生产事实，与库存无外键
        │
        ├─【闭环A 旁路】集蛋入库 → inv_batches(EGG-STOCK-*) ──→ farm-sales 直销出库   ✗ 不进 Sales V2
        │
        └─【闭环B 包装】pkg_shifts→pkg_tasks(分级/包装)→ inv_batches(PRD-EGG-*-PACK)→ wms_inbound
                                                                  │
                                                                  ✗ 命名断点：PRD-EGG-* ≠ EGG-YYYYMMDD-*
                                                                  │
【闭环C 销售可售】createProductionBatch → inv_batches(EGG-YYYYMMDD-*) ──FIFO──→ sal_order_items.allocated_batch_no
                                                                  │
                                                                  └─→ 销售订单 / POS / 退货
```

**断点**：闭环 B 的包装产出（`PRD-EGG-*-PACK`）与闭环 C 的可售批次（`EGG-YYYYMMDD-*`）之间**没有衔接代码**——包装完成不会生成 Sales V2 认可的可售批次，集蛋旁路更是完全绕过 Sales V2。

**已有的正向追溯字段**（闭环C内部完整）：`sal_order_items.allocated_batch_no → inv_batches.batch_no`、`inv_ledger.batch_no/ref_no/sku_code`。**缺**：`inv_batches.packaging_batch_id` / `collection_batch_id`（不存在）。

---

## 七、菜单与权限重复入口

**现有菜单**（`apps/api/ddl/02_init_data.sql` / `rbac.matrix.ts`）：
`MENU_PKG_OP`（包装作业）、`MENU_PKG_MGR`（包装管理·含集蛋/批次）、`MENU_PACKAGE_RUN`、`MENU_WMS_VIEW`、`MENU_WMS_INOUT`（出入库作业）、`MENU_WMS_OP`、`MENU_WMS_MASTER`、`MENU_WMS_INBOUND`(API)、`MENU_WMS_OUTBOUND`(API)、`MENU_INVENTORY`、`MENU_SALES2_INVENTORY`。

**P1 §8 目标权限码均不存在**，需新增：`MENU_PROD_COLLECTION`、`MENU_PKG_PACKAGING`、`MENU_PKG_COMPLETE_INVENTORY`、`MENU_INV_BATCH`、`MENU_INV_LEDGER`、`MENU_INV_MANUAL_INBOUND`。

**重复入口风险**：
- 「集蛋入库」：`breeding/egg-ledger` + `mobile/egg`（闭环A，写 `EGG-STOCK-*`） vs 包装 `shifts/complete`（闭环B）—— 两处都从"集蛋"起步写库存，🔴 二次入库。
- 「库存入库」：`MENU_WMS_INOUT` → `/api/inbound/confirm`（写 `inv_batches`），与包装 `wms_inbound` 自动建单并存，无幂等校验。
- 「批次管理」：pkg / wms / sales2 三处"批次"语义不同，字段冗余。

**LegacyFreezeBanner**：`apps/web/src/components/LegacyFreezeBanner.tsx`（仅提示不锁功能），Sales V2 冻结旧页已用，可复用于冻结闭环A旧入口。

---

## 八、与 P1 任务原始设计的差异校准（重要）

| P1 原始假设 | 审计实证 | 校准建议 |
|------------|---------|---------|
| §3 新建 `inv_batches`/`inv_ledger` 作为唯一表 | **已存在且已是唯一表** | 不新建，复用并统一写入语义 |
| §3 新建 `pkg_packaging_batches` | 不存在，语义在 `pkg_tasks`+`pkg_packing_records` | 评估是否新建规范化表，或沿用 |
| §3 新建 `prod_egg_collection_batches` | 不存在，集蛋语义在 `pkg_shifts`（包装侧）+ farm-egg 旁路 | 评估是否抽象统一集蛋批次表 |
| §4 "包装完成必须自动写库存" | **已自动写**（completeShift/grade/packComplete 事务内） | 真正缺的是：包装产出 → Sales V2 可售批次（`EGG-YYYYMMDD-*`/sku）的**衔接**与**命名统一** |
| §2 "集蛋只记原蛋、不形成可售库存" | **被闭环A违反**（farm-egg 直入可售） | 冻结 farm-egg 旁路，集蛋改为只进"待包装池" |
| §6 "销售只扣库存系统成品批次" | 闭环C已满足；闭环A farm-sales 违反 | 冻结 farm-sales 旁路扣减，统一走 Sales V2 FIFO |

> **核心洞察**：P1 的真实工作量不是"建表+建服务从零打通"，而是 **"收口三套闭环为一套、统一批次命名、把包装产出对接到 Sales V2 可售批次、冻结 farm-egg/farm-sales 旁路"**。这决定了迁移与服务改造的实际范围和风险，需在动销售扣减代码前与决策者确认方案。

---

## 九、改造方向建议（待决策，未实施）

**目标链路（单一闭环）**：
```
brd_daily_logs(生产事实) → 集蛋批次(待包装池,不可售)
  → pkg 分级/包装 → packComplete()
    → 在同一事务内调用 Sales V2 createProductionBatch() 生成可售批次(EGG-YYYYMMDD-* / sku_code, 带 expire_date)
      → 销售/POS FIFO 扣减(已就绪)
        → 退货回库(已就绪)
```

**关键改造点（建议，待用户拍板范围与节奏）**：
1. **统一可售批次入口**：包装 `packComplete()` 收尾改为调用（或新建 `PackagingInventoryIntegrationService.completePackagingBatch()`）写入 Sales V2 可售批次命名体系（`EGG-YYYYMMDD-*` + `sku_code`/`grade_code_std`/`expire_date`），并写 `inv_ledger` `change_type=PACKAGING_INBOUND`；**幂等防重复入库**（按 `pkg_task_id`/`source_no` 去重）。
2. **冻结闭环A**：`farm-egg.inbound()` 改为只写"待包装原蛋池"（不可售，`status=QUARANTINE` 或独立池表），`breeding/egg-ledger` + `mobile/egg` 加 `LegacyFreezeBanner`。
3. **冻结闭环A销售旁路**：`farm-sales` 扣减改走 Sales V2 FIFO（`reserveInventory`/`confirmOutbound`），不再直扣 `EGG-STOCK-*`。
4. **批次追溯字段**：`inv_batches` 增 `packaging_batch_ref` / `collection_batch_ref`（带索引），打通正反向追溯。
5. **库存入库管理**：`MENU_WMS_INOUT` / `/api/inbound/confirm` 明确仅用于采购/调拨/手工调整，禁止录包装成品；加幂等校验。
6. **权限分离**：新增 §8 六个权限码，包装完成入库权限（`MENU_PKG_COMPLETE_INVENTORY`）与手工库存入库权限（`MENU_INV_MANUAL_INBOUND`）分离。

**数据安全前提**：
- 现有 `EGG-STOCK-*` / `PRD-EGG-*` 库存存量需要一次性盘点与迁移对账（不可直接删除，标 `legacy_source`）。
- 所有迁移幂等（`IF NOT EXISTS` / `ON CONFLICT` / `to_regclass` 守卫），遵守 `sys_dict` 只增不改、破坏性操作须授权。

---

## 十、附录 · 关键文件与接口索引

**库存核心**
- `apps/api/migrations/v3_schema_complete.sql`（inv_batches/inv_ledger/pkg_* 基线）
- `apps/api/migrations/20260527_sales_v2_phase7_egg_inventory.sql`（Phase7 字段）
- `apps/api/migrations/20260530_product_master_h4_inventory_sku.sql`（SKU 字段）

**闭环A 旁路**
- `apps/api/src/modules/farm/farm-egg.service.ts`（inbound/outbound/writeOff，写 `EGG-STOCK-*`）
- `apps/api/src/modules/farm/farm-egg.controller.ts`（`/api/farm/egg/*`）
- `apps/api/src/modules/farm/farm-sales.service.ts`（直销调 eggSvc.outbound/inbound）
- 前端：`breeding/egg-ledger/page.tsx`、`(mobile)/mobile/egg/page.tsx`

**闭环B 包装**
- `apps/api/src/modules/terminal/packaging.service.ts`（completeShift/submitGrade/packComplete）
- `apps/api/src/modules/terminal/packaging.controller.ts`
- 前端：`(terminal)/terminal/packaging/*`

**闭环C 销售库存**
- `apps/api/src/modules/sales-v2/services/egg-inventory.service.ts`（FIFO/Advisory Lock/createProductionBatch/processReturnInventory）
- `apps/api/src/modules/sales-v2/services/sales-orders.service.ts`（approveCallback→reserve）
- `apps/api/src/modules/sales-v2/services/delivery-orders.service.ts`（LOADED→confirmOutbound）
- `apps/api/src/modules/store-pos/services/store-pos.service.ts`（fifoDeductItems）
- `apps/api/src/modules/sales-v2/services/return-orders.service.ts`（completeRestock）
- 前端：`sales2/inventory/page.tsx`、`warehouse/ledger/page.tsx`

**权限**
- `apps/api/ddl/02_init_data.sql`（sys_menu）
- `apps/api/src/common/guards/rbac.matrix.ts`
- `apps/web/src/components/LegacyFreezeBanner.tsx`

---

*审计完成。本报告基于只读代码审计 + 关键文件实读核对，未修改任何文件。后续 §2–§9 的设计须基于本报告校准的真实现状（三套闭环并存、库存表已统一、包装已自动入库但命名孤立），并在动销售扣减/库存写入代码前与决策者确认改造范围与节奏。*
