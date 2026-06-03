# 生产运行体系重构 R4 — 销售运行体系统一审计

> **任务**：Production Runtime Rebuild Phase R4（Sales Runtime Unification Audit，只审计）
> **日期**：2026-06-03
> **目标**：确认库存 → 销售 → 收款 → 财务是否形成唯一销售链；定位旁路扣库与 AR 断点。
> **方法**：3 路并行只读审计（销售入口与库存扣减 / AR·收款·财务 / 权限与历史旁路）+ 关键点实证。

---

## 0. 结论速览

| 维度 | 结论 |
|------|------|
| 活跃销售链 | **1 套统一**：Sales V2（订单/配送/退货）+ Store POS，共用 inv_batches/inv_ledger FIFO |
| 库存扣减 | ✅ 活跃销售统一 FIFO + `legacy_source IS NULL`（只认 EGG-YYYYMMDD-*） |
| POS | ✅ 同一体系（store-pos `api/v2/store-sales`，FIFO_OUT） |
| 退货 | ✅ 完整回库（RETURN 批次 + 负 AR） |
| 销售 → 财务 | ✅ AR + 现金账户打通；🟠 停在运营财务层（无总账/凭证 GL） |
| 历史旁路 | 🟠 **1 个 latent 旁路**：旧 `api/v3/pos` PosService 注册未删（前端不调用） |
| 权限边界 | ✅ 清晰（销售禁写库存/财务） |
| 综合评分 | **≈8.2 / 10** |

---

## 1. 销售入口（分类）

| 类 | 入口 | 路由 | 状态 |
|----|------|------|------|
| **A 真实** | Sales V2 销售订单 | `POST /api/v2/sales/orders/*` | ✅ 活跃 |
| **A 真实** | Sales V2 配送 | `POST /api/v2/sales/delivery/*` | ✅ 活跃 |
| **A 真实** | Sales V2 退货 | `POST /api/v2/sales/returns/*` | ✅ 活跃 |
| **A 真实** | Store POS | `POST /api/v2/store-sales/*`（store-pos 模块） | ✅ 活跃 |
| **A 真实** | B2B/批发 | BFF（ws_* 表，MENU_B2B_SALE） | ✅ 活跃 |
| **B 辅助** | 手动 FIFO 分配 | `POST /api/v2/sales/inventory/allocate` | 调试/调整 |
| **C 遗留·已冻结** | farm-sales | createSale/cancelSale **抛错（R1）** | 冻结 |
| **C 遗留·已冻结** | farm-egg 写 | inbound/outbound/write-off **410（R1）** | 冻结 |
| **C 遗留·只读** | 旧 ord_orders | 仅查询，禁新增 | 冻结 |
| **C 遗留·旁路** | 旧 POS `api/v3/pos`（store/pos.service） | **注册未删，前端零调用** | 🟠 latent 旁路 |
| **C 遗留·表冻结** | 旧 b2b_* 表 | Generic CRUD 黑名单 | 冻结 |

---

## 2. 库存扣减（链路图）

```
【Sales V2 订单】submit → reserveInventory → allocateByFIFO
  WHERE legacy_source IS NULL AND status='AVAILABLE' AND qty_available>0 AND expire 未过
  → UPDATE inv_batches.qty_available -= ; inv_ledger(RESERVED)
  → 配送 finishLoading → confirmOutbound → UPDATE inv_batches.qty -= ; inv_ledger(FIFO_OUT)

【Store POS】completeCash/Credit/Mixed → fifoDeductItems
  WHERE legacy_source IS NULL ... → UPDATE inv_batches.qty_available -= ; inv_ledger(FIFO_OUT)

【退货】completeInspection → processReturnInventory
  → INSERT inv_batches(RET-*, source_type='RETURN') ; inv_ledger(SALE_RETURN)
  → 破损：inv_ledger(DAMAGE_WRITEOFF)（不回库）

【取消】cancel → releaseInventory → inv_ledger(RELEASED)
```

- ✅ 所有活跃销售经 `EggInventoryService`（allocateByFIFO/confirmOutbound/processReturnInventory）或 store-pos `fifoDeductItems`，均带 `legacy_source IS NULL`。
- 🟠 **旁路（latent）**：旧 `store/pos.service.ts` `createSale` 直接 `UPDATE inv_batches SET qty=qty-... WHERE batch_no=$手动`，写 `SALE_OUT`，**无 FIFO、无 legacy_source 过滤**。注册于 StoreModule（`api/v3/pos`），但前端零调用 → 潜在风险，应清理。
- 非销售直改（正常）：WMS 调拨/盘点/损耗（TRANSFER_OUT/STOCKTAKE/LOSS）、Terminal 生产入库——非销售路径，且销售 FIFO 经 legacy/AVAILABLE/expire 隔离不混入。

---

## 3. 销售订单链路（完整）

```
createDraft(DRAFT) → submit[审批+reserveInventory FIFO](APPROVED/ALLOCATED)
  → transition(PICKED/LOADED) → finishLoading[confirmOutbound 物理扣减]
    → markReceived[FinanceArAdapter→fin_ar_invoices](RECEIVED)
      → 收款核销 → 现金账户
```
✅ 库存预留→出库、AR 生成、收款联动齐全；每行记 `allocated_batch_no` 可追溯。

## 4. POS 链路（完整）

```
createSale(OPEN) → completeCashSale  → fifoDeductItems + fin_cash_transactions(IN)        (PAID)
                 → completeCreditSale → fifoDeductItems + fin_ar_invoices(AR-POS-*)         (UNPAID)
                 → completeMixedSale  → fifoDeductItems + fin_cash_transactions + fin_ar_invoices (PARTIAL)
```
✅ 三种收款均 FIFO 扣减 + 对应财务入账；与 Sales V2 共用 inv_batches/inv_ledger。

## 5. 退货链路（完整）

```
create → submit → approve → completeInspection[processReturnInventory 回库]
  → completeFinal[FinanceCreditNoteAdapter→负数 AR(CR-*)]
```
✅ 接收回库（RETURN/可再售）+ 破损报废（仅流水）+ 负 AR 冲销。
🟠 负 AR 与正向 AR **无自动冲销**，需经收款单手动核销。

## 6. 赠品与样品（未实现）

- grep gift/sample/赠品/样品/领用/promotion：**无非销售性出库实现**。
- 当前所有出库都走正式销售路径。
- 🟠 **上线后业务需求**：若需赠品/样品/内部领用/市场推广/员工福利出库，需新增**受控出库入口 + 财务口径**（费用/营销费用科目），当前缺失（P2/未来）。

## 7. 库存一致性

- ✅ 所有活跃销售只扣 `EGG-YYYYMMDD-NNNNN`（`legacy_source IS NULL`）。
- ✅ 旧批次隔离：`EGG-STOCK-*`（R1 已删）、`PRD-EGG-*`（中间态 legacy）被 FIFO 排除。
- 🟠 唯一例外：旧 `api/v3/pos` 旁路无 legacy 过滤（前端不调，latent）。

## 8. AR 与收款（链路）

| 环节 | 状态 |
|------|------|
| 销售订单 RECEIVED → AR | ✅ FinanceArAdapter → fin_ar_invoices（source_type=SALES_ORDER） |
| 退货 COMPLETED → 负 AR | ✅ FinanceCreditNoteAdapter → fin_ar_invoices（负数，CR-*） |
| AR → 收款 → 现金账户 | ✅ fin_ar_receipts.confirm → 核销 fin_ar_invoices + fin_cash_accounts + fin_cash_transactions |
| POS 现金 → 现金账户 | ✅ completeCashSale → fin_cash_transactions(IN) |
| POS 赊销 → AR | ✅ completeCreditSale → fin_ar_invoices(AR-POS-*) |
| **AR/现金 → 总账/凭证 GL** | ❌ **不存在**：Finance V2 无 fin_gl/fin_voucher/总账表，停在运营财务 Runtime（报表聚合读） |

- ✅ 严禁写旧 `fin_transactions`（Generic CRUD 黑名单 + 适配器注释）；AR 由适配器自动生成。
- 🟠 财务层级 = **运营财务（AR/现金）**，非全套会计（总账/凭证/科目）。这是 Finance V2 设计边界，非缺陷；若需正式会计需另建 GL。

## 9. 权限体系

| 角色 | 库存 | 财务 | 越权口子 |
|------|------|------|---------|
| ROLE_SALES_REP | MENU_SALES2_INVENTORY 仅 V | 无 MENU_FIN2_* | 无 |
| ROLE_SALES_MGR | INVENTORY V,C,E,A,X；INV_BATCH 仅 V | 无 MENU_FIN2_* | 无 |
| ROLE_CASHIER | 无库存写 | MENU_FIN_CLOSE 日结 V,C | 无 |
| ROLE_WMS_MGR/OP | INV_BATCH/LEDGER/MANUAL_INBOUND 写 | — | — |
| ROLE_FIN_AR/ACCT | INV_LEDGER 仅 V,X | MENU_FIN2_AR 等 | — |

✅ **销售人员禁写库存（仅查看）、禁写财务（无 FIN2 权限）**；库存写限 WMS；AR 由适配器自动生成。MenuGuard + DataScopeGuard(company_code) 双层。

## 10. 销售运行评分

| 维度 | 分(0-10) | 依据 |
|------|---------|------|
| 销售订单 | 9 | 状态机 + FIFO 预留 + AR |
| 库存扣减 | 8 | 统一 FIFO + legacy 隔离；旧 api/v3/pos latent 旁路 -1 |
| POS | 9 | 三种收款 + FIFO + 财务 |
| 退货 | 9 | 回库 + 负 AR |
| AR | 8 | 生成 + 核销完整；无自动冲销 |
| 收款 | 8 | AR 收款 + 现金账户 |
| 财务联动 | 6 | AR/现金运营层打通；无总账/凭证 GL |
| 权限 | 9 | 边界清晰，无越权 |

> **综合 ≈ 8.2 / 10**：活跃销售链已统一且健康；扣分集中在 latent 旁路、自动冲销缺失、无 GL（运营层设计边界）。

---

## 11. P0 / P1 / P2 问题

**P0（库存/财务错误）**：无（无活跃问题）。

**P1**：
- **P1-1 旧 `api/v3/pos` PosService latent 旁路**：注册于 StoreModule（活端点），直接 `UPDATE inv_batches`（SALE_OUT，手动 batch_no，无 FIFO、无 legacy 过滤）；前端零调用。**应删除/冻结**（建议并入后续 R-cleanup，类比 R2 删孤儿流）。
- **P1-2 AR 红字与正向 AR 无自动冲销**：退货负 AR 需手动经收款单核销，易遗漏。

**P2**：
- **P2-1 无总账/凭证 GL**：Finance V2 仅运营财务（AR/现金）。若上线需正式会计科目/凭证，需另建 GL（设计边界，非缺陷）。
- **P2-2 赠品/样品/内部领用/营销/福利出库未实现**：上线后业务需求时需新增受控出库 + 财务口径。

---

## 12. 是否达到唯一销售链

🟢 **基本达到**：库存 → 销售 → 收款 → 财务（运营层）已形成**唯一活跃链**——Sales V2 + Store POS 共用 inv_batches/inv_ledger FIFO，AR/现金联动打通。剩余为 1 个 latent 旁路（待清理）+ 财务层级边界（无 GL）+ 未来业务场景（赠品样品）。

---

## 13. 明确回答

**1. 当前有几套销售链？**
**1 套活跃统一链**（Sales V2 订单/配送/退货 + Store POS，共用 inv_batches/inv_ledger FIFO）。另有已冻结遗留（farm-sales 抛错、ord_orders 只读、b2b 旧表黑名单）+ **1 个注册未删的旧 POS 旁路（api/v3/pos，前端不调）**。

**2. 是否已统一库存扣减？**
✅ **活跃销售已统一**（EggInventoryService FIFO / store-pos fifoDeductItems，均 `legacy_source IS NULL`）。唯一例外是 latent 的旧 api/v3/pos 旁路。

**3. POS 是否属于同一销售体系？**
✅ **是**。store-pos（api/v2/store-sales）与 Sales V2 共用 inv_batches/inv_ledger，FIFO_OUT 扣减。

**4. 退货是否完整回库？**
✅ **是**。processReturnInventory：接收回库（RETURN 可再售）+ 破损报废 + 负 AR 冲销。

**5. 销售是否已进入财务？**
✅ **是（运营财务层）**。销售订单→AR、POS→现金/AR、退货→负 AR、收款→现金账户全打通；🟠 但停在 AR/现金运营层，**无总账/凭证 GL**。

**6. 是否存在历史遗留销售旁路？**
🟠 **存在 1 个 latent 旁路**：旧 `api/v3/pos` PosService（StoreModule 注册、直改 inv_batches、无 FIFO/legacy 过滤、前端零调用）。其余遗留（farm-sales/ord_orders/b2b 旧表）已冻结。

**7. 是否允许进入 R5 统一追溯体系？**
🟢 **允许**。活跃销售链已唯一且健康；建议 R5 之前或并行清理 P1-1（旧 api/v3/pos 旁路）。

---

## 附录 · 关键证据文件

- 销售扣减统一：`sales-v2/services/egg-inventory.service.ts`（allocateByFIFO/confirmOutbound/processReturnInventory，legacy_source IS NULL）
- POS：`store-pos/services/store-pos.service.ts`（fifoDeductItems + 三种收款财务入账）
- AR：`sales-v2/adapters/finance-ar.adapter.ts`（fin_ar_invoices，禁写 fin_transactions）
- 负 AR：`sales-v2/adapters/finance-credit-note.adapter.ts`
- 收款：`finance-v2/services/ar-receipts.service.ts`（confirm → fin_cash_accounts/transactions）
- 🟠 旁路：`store/pos.service.ts`（@Controller('api/v3/pos')，直改 inv_batches SALE_OUT，StoreModule 注册，前端零调用）
- 权限：`common/guards/rbac.matrix.ts`（Sales/Store/POS/AR 边界）
- 财务层级：finance-v2 迁移无 fin_gl/fin_voucher（运营财务边界）
