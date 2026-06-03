# 生产运行体系重构 R4.1 — 删除旧 POS 旁路

> **任务**：R4.1（Sales Cleanup，删除最后一个销售旁路）
> **日期**：2026-06-03
> **依据**：docs/production-runtime-rebuild-phase-r4-sales-runtime-audit.md（P1-1 latent 旁路）

---

## 1. 旧 POS 旁路清单

| 项 | 内容 |
|----|------|
| 路由 | `@Controller('api/v3/pos')` |
| 文件 | `apps/api/src/modules/store/pos.controller.ts` + `pos.service.ts`（PosService） |
| 模块注册 | `store/store.module.ts`（controllers/providers/exports） |
| 旁路行为 | `PosService.createSale` 直接 `UPDATE inv_batches SET qty=qty-...`，写 `inv_ledger SALE_OUT`，**无 FIFO、无 legacy_source 过滤** |
| 前端调用 | **零**（grep 实证 `api/v3/pos` 无任何前端引用） |
| 分类 | C 类 Legacy Runtime |

---

## 2. 删除内容

- `store.module.ts`：移除 `PosController`、`PosService`（imports + controllers + providers + exports）→ **`api/v3/pos` 不再注册、不可访问**。
- `pos.service.ts`：`createSale` 顶部加 `ForbiddenException`（防御：即使被重新注册/直接调用也禁止旁路直扣）。
- 文件保留（已注销，inert），便于历史追溯。

## 3. 保留内容

- ✅ `store-pos/*`（`api/v2/store-sales`，StorePosService，`fifoDeductItems`）—— **POS 唯一活跃入口**。
- ✅ 三种收款：现金 / 赊销 / 混合（completeCashSale/Credit/Mixed）。
- ✅ Sales V2 Inventory Runtime（EggInventoryService FIFO）。
- ✅ StoreController/StoreService（门店工作台），不受影响。

## 4. Store POS 保护验证

- `store-pos` 模块（`api/v2/store-sales`）独立注册于 AppModule，**未触碰**。
- POS 仍能：销售（createSale）、FIFO 扣库存（fifoDeductItems）、收款（现金→fin_cash_transactions / 赊销→fin_ar_invoices）。
- 前端 `/store-pos` 页面调用 `api/v2/store-sales/*`，与本次删除无关。

## 5. Sales V2 保护验证

- EggInventoryService / allocateByFIFO / confirmOutbound / processReturnInventory **未触碰**。
- Sales V2 订单/配送/退货链路不受影响。

## 6. 是否允许进入 R5

🟢 **允许**。旧 `api/v3/pos` 旁路已注销且 createSale 冻结；活跃销售链唯一（Sales V2 + Store POS，共用 FIFO）。API TypeScript 0 错。

---

## 明确回答（R4.1 部分）

- **api/v3/pos 是否已删除/冻结？** ✅ 已从 StoreModule 注销（不可访问）+ createSale 冻结抛错（双重）。
- **Store POS 是否未受影响？** ✅ 未受影响（api/v2/store-sales 独立，照常 FIFO 销售/收款）。
