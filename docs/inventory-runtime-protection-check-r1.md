# R1 删除前保护确认 — Inventory Runtime Protection Check

> **任务**：R1（Delete Duplicate Inventory Runtime）删除前置安全门禁
> **日期**：2026-06-03
> **目的**：删除 C 类前，逐条确认本次删除只触碰 Legacy Runtime，绝不波及 A 类真实运行系统。

---

## 1. 受保护模块清单（A 类 Real Runtime · 本次绝不触碰）

| 模块 | 范围 | 本次是否触碰 |
|------|------|------------|
| `(terminal)/terminal/packaging/*` + `packaging-api.ts` + BFF `PackagingTerminalBffController`（`/api/packaging/terminal/*`） | 真实车间包装流 | ❌ 不触碰 |
| `PackagingInventoryIntegrationService`（completeTerminalPacking / generateSaleableFromOutputs） | 包装→库存唯一入口 | ❌ 不触碰 |
| `store-pos/*` | 门店收银 | ❌ 不触碰 |
| `mobile/*`（壳与作业入口） | 移动端 | ❌ 仅更新 `mobile/egg` 冻结提示文案 |
| Sales V2 `EggInventoryService`(FIFO)+Scheduler、订单/配送/退货 | 销售扣减 | ❌ 不触碰 |
| `InventorySourceModeService` + `ProductionInboundService`（TEMP） | 模式/灰度/过渡入库 | ❌ 不触碰 |
| `inv_batches` / `inv_ledger` | 唯一库存表 | ❌ 结构不变（仅删 EGG-STOCK-* 测试行） |

**对照实证**：`grep` 确认 bff / sales-v2 / store-pos **无任何 farm-egg / EGG-STOCK 代码依赖**（仅注释提及）。

---

## 2. 本次删除模块清单（C 类 Legacy Runtime）

| 删除对象 | 位置 | 动作 |
|---------|------|------|
| Farm Egg 库存能力 | `farm/farm-egg.service.ts` | 删 `onModuleInit`(建 EGG-STOCK-*) + `inbound`/`outbound`/`writeOff` 写库存方法；保留 `getStock`/`getLedger` 只读 |
| Farm Egg 写接口 | `farm/farm-egg.controller.ts` | `POST inbound/outbound/write-off` 改冻结返回（不写库存，不再调用 service）；保留 `GET stock/ledger` |
| farm-sales 直扣库存 | `farm/farm-sales.service.ts` | 删 `FarmEggService` 注入 + 调 `eggSvc.outbound/inbound` 的 `_createSaleLegacy`/`_cancelSaleLegacy`；保留只读查询；下单/撤销冻结 |
| EGG-STOCK-* 测试库存 | `inv_batches`/`inv_ledger` | 迁移 `20260603_remove_egg_stock_legacy_inventory.sql` 幂等删除（强守卫排除 EGG-YYYYMMDD-*/PACKAGING） |

---

## 3. 不允许触碰模块清单（明确边界）

- ❌ admin packaging flow（`/api/packaging/*` + `terminal/packaging.service.ts`）→ **R2 处理，本次不动**。
- ❌ `completeTerminalPacking` / BFF terminal flow → 保护。
- ❌ `TEMP_PRODUCTION_INBOUND` / `PACKAGING_INBOUND` / `inv_source_mode` → 保留。
- ❌ Sales V2 FIFO / Store POS → 保留。
- ❌ `EGG-YYYYMMDD-*` / `source_type='PACKAGING'` 库存 → 迁移强守卫排除。

---

## 4. 风险确认

| 风险 | 评估 | 缓解 |
|------|------|------|
| 删 farm-egg 后现场无库存来源 | 低 | farm-egg 早已冻结（Phase 1），非活跃来源；TEMP（默认）+ 包装两路仍在（R0b 已证明包装可独立生成） |
| 删除波及正式库存 | 极低 | 系统未上线、无正式数据；迁移强守卫仅删 EGG-STOCK-*，排除 EGG-YYYYMMDD-*/PACKAGING |
| onModuleInit 删除后重新生成 | 已消除 | 删 onModuleInit 即停止 EGG-STOCK-* 再生成（否则迁移删了启动又重建） |
| 编译断引用 | 已验证 | API tsc 0 错（eggSvc 唯一使用者 farm-sales 已解耦） |
| 前端写接口 404 | 已缓解 | controller 保留端点返回冻结提示（410 + message），非删除 |

**结论**：本次删除范围严格限定 C 类 Legacy Runtime，A 类真实运行系统零触碰，可安全执行 R1。
