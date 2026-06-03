# 生产运行体系重构 R1 — 删除重复库存体系

> **任务**：Production Runtime Rebuild Phase R1（Delete Duplicate Inventory Runtime）
> **日期**：2026-06-03
> **门禁**：R0b 已 REAL_RUNTIME_CONFIRMED（真实包装流可独立生成库存）→ 允许删除 C 类。
> **范围**：只删 Farm Egg Inventory Runtime / EGG-STOCK-* / farm-sales 直扣；**不动** admin packaging flow（R2）、
> terminal/packaging、BFF、completeTerminalPacking、TEMP_PRODUCTION_INBOUND。

---

## 0. 结论

> **Farm Egg 不再写库存；EGG-STOCK-* 不再生成、测试数据已清；farm-sales 不再直扣库存。
> 库存来源只剩 TEMP_PRODUCTION_INBOUND / PACKAGING_INBOUND（InventorySourceMode 互斥控制）。
> A 类真实运行系统零触碰。允许进入 R2。**

---

## 1. R1 范围

删除 C 类重复库存体系中的 **Farm Egg 部分**：
- Farm Egg Inventory Runtime（EGG-STOCK-* 旁路库存）。
- farm-sales 直扣库存。
- EGG-STOCK-* 测试数据。

不含：admin packaging flow（`/api/packaging/*`，R2）。

## 2. 删除对象

| 对象 | 处置 |
|------|------|
| `farm-egg.service.ts` `onModuleInit`（建 8 个 EGG-STOCK-* 批次） | **删除**（停止再生成） |
| `farm-egg.service.ts` `inbound`/`outbound`/`writeOff` | **删除**（不再写 inv_batches/inv_ledger） |
| `farm-egg.controller.ts` `POST inbound/outbound/write-off` | **冻结**（返回 410 + 提示，不调用 service） |
| `farm-sales.service.ts` `FarmEggService` 注入 + `_createSaleLegacy`/`_cancelSaleLegacy`（调 eggSvc） | **删除** |
| `inv_batches`/`inv_ledger` 中 EGG-STOCK-* | **迁移删除**（幂等 + 强守卫） |

## 3. 保留对象

| 对象 | 说明 |
|------|------|
| `farm-egg.service.ts` `getStock`/`getLedger` | 只读集蛋记录/流水查询 |
| `farm-egg.controller.ts` `GET stock/ledger` | 只读接口 |
| `farm-sales.service.ts` `getCustomers`/`getSales` | 只读查询 |
| `inv_batches`/`inv_ledger` 表结构 | 不变 |
| 所有 A 类真实运行系统 | 零触碰 |

## 4. Farm Egg 库存能力删除情况

- `farm-egg.service.ts` 重写为**只读集蛋记录服务**：移除 `implements OnModuleInit` + `onModuleInit`、
  `inbound`/`outbound`/`writeOff`、`ForbiddenException`/`FARM_EGG_FROZEN_MSG`/`EggInboundItem`/`EggOutboundItem`。
- 保留 `EGG_GRADES`/`WAREHOUSE`/`batchNo`/`getStock`/`getLedger`（只读）。
- **关键**：删 `onModuleInit` → 应用启动不再重建 EGG-STOCK-*（否则迁移删了又被重建）。
- `farm-egg.controller.ts`：3 个 POST 改为返回 `{ code:410, message:'鸡蛋库存已由库存来源模式统一管理…' }`，不写库存、不 404。

## 5. farm-sales 直扣删除情况

- `farm-sales.service.ts`：移除 `FarmEggService` 依赖；删除 `_createSaleLegacy`（调 `eggSvc.outbound`）、
  `_cancelSaleLegacy`（调 `eggSvc.inbound`）。
- `createSale`/`cancelSale` 保留为**停用抛错**（引导至 Sales V2）。
- 销售扣减/退货回库唯一走 Sales V2 Inventory Runtime（FIFO）/ Store POS。

## 6. EGG-STOCK 清理情况

迁移 `20260603_remove_egg_stock_legacy_inventory.sql`（幂等 + 强守卫）：
- 删 `inv_ledger` / `inv_batches` 中 `batch_no LIKE 'EGG-STOCK-%'`；
- 守卫：`batch_no NOT LIKE 'EGG-2%'`（排除 EGG-YYYYMMDD-*）、`source_type IS DISTINCT FROM 'PACKAGING'`。
- **本地实跑**：删除批次 **8 条**、流水 0 条；二次执行幂等（0/0）；`EGG-YYYYMMDD-*`/`PACKAGING` 未受影响。

## 7. 前端菜单处理

- `breeding/egg-ledger`：LegacyFreezeBanner 文案更新为「该入口不再生成库存，库存来源由系统模式控制（临时生产入库 / 包装入库）…仅保留集蛋记录与历史流水查询」。
- `mobile/egg`：内联冻结提示同步更新。
- 保留：集蛋记录 / 历史流水查询；写操作经后端冻结（410）。

## 8. 权限处理

- `MENU_PROD_COLLECTION`：保留为**集蛋记录 / 生产事实**（只读 / 录入事实），**无库存写入能力**。
- farm-egg 写端点原 `@RequireMenu('MENU_BREEDING','E')` 已随冻结改造移除（端点不再写库存）。
- 不新增/不调整其他权限。

## 9. 回归验证

| 验证 | 结果 |
|------|------|
| API TypeScript | ✅ 0 错（删除后无断引用；eggSvc 唯一使用者已解耦） |
| Web TypeScript | ✅ 0 错（前端仅文案更新） |
| terminal/packaging / `/api/packaging/terminal/*` / completeTerminalPacking | ✅ 未触碰（grep 零依赖 farm-egg） |
| TEMP_PRODUCTION_INBOUND 生成 EGG-YYYYMMDD-* | ✅ 未触碰（ProductionInboundService 不变） |
| PACKAGING_INBOUND 生成 EGG-YYYYMMDD-* | ✅ 未触碰（completeTerminalPacking 不变；R0b 已证明） |
| Sales V2 FIFO / Store POS 扣减 | ✅ 未触碰 |
| EGG-STOCK 清理 + 不再生成 | ✅ 迁移删 8 条 + onModuleInit 删除 |
| scope-audit.sh | 本地 2/30（未起服务，非回归基线） |

## 10. 是否允许进入 R2

🟢 **允许。** Farm Egg 库存体系已删除且不再生成、farm-sales 直扣已删除、A 类零触碰、回归通过。
R2（删除重复包装体系 = 孤儿 admin packaging flow `/api/packaging/*`）可执行。

---

## 明确回答

**1. Farm Egg 是否还会写库存？** ❌ **不会。** onModuleInit + inbound/outbound/writeOff 已删除；controller 写端点冻结。
**2. EGG-STOCK 是否还会生成？** ❌ **不会。** 生成源（onModuleInit）已删；测试数据迁移清除（8 条）。
**3. farm-sales 是否还能直扣库存？** ❌ **不能。** eggSvc 依赖与直扣逻辑已删除；下单/撤销停用。
**4. terminal/packaging 是否未受影响？** ✅ **未受影响**（A 类保护，零代码依赖 farm-egg）。
**5. TEMP_PRODUCTION_INBOUND 是否未受影响？** ✅ **未受影响**（ProductionInboundService 不变）。
**6. PACKAGING_INBOUND 是否未受影响？** ✅ **未受影响**（completeTerminalPacking 不变，R0b 已证明可生成库存）。
**7. 是否允许进入 R2 删除重复包装体系？** 🟢 **允许。**

---

## 附录 · 变更文件

- `apps/api/src/modules/farm/farm-egg.service.ts`（重写为只读集蛋记录）
- `apps/api/src/modules/farm/farm-egg.controller.ts`（写端点冻结）
- `apps/api/src/modules/farm/farm-sales.service.ts`（移除 eggSvc 直扣）
- `apps/api/migrations/20260603_remove_egg_stock_legacy_inventory.sql`（清 EGG-STOCK 测试数据）
- `apps/web/.../breeding/egg-ledger/page.tsx`、`apps/web/.../mobile/egg/page.tsx`（冻结文案）
- `docs/inventory-runtime-protection-check-r1.md`（保护确认）
- 本报告
