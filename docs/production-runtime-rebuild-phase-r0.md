# 生产运行体系重构总方案 Phase R0 — Production Runtime Blueprint

> **任务**：Production Runtime Rebuild Phase R0（总方案蓝图，非实施）
> **日期**：2026-06-03
> **前提**：系统**尚未正式上线**，无正式经营/库存/销售/财务数据；现有数据全部视为
> 测试 / 验证 / 初始化数据。**允许推翻重建、删除重复链路、调整表结构、重构流程。**
> **依据**：P1A–P1E 连续审计（docs/production-inventory-integration-audit / packaging-runtime-audit-p1b /
> convergence-p1c / validation-p1d / production-recovery-p1e）。
> **目标**：上线前一次性建立**唯一业务链 / 唯一库存链 / 唯一销售链 / 唯一追溯链**。

---

## 0. 一句话结论

> **系统当前最大问题不是缺功能，而是"同一件事有 3 套实现"——3 套库存命名、2 套包装流、
> 多套入库/扣减旁路。R0 的本质是"做减法"：砍掉重复，让每件事只有一条正确路径。**

由于无真实数据，重构无需为兼容历史付出复杂度——这是建立正确架构的**唯一窗口期**。

---

## 1. 当前架构问题

| # | 问题 | 证据 |
|---|------|------|
| 1 | **3 套库存命名并存** | `EGG-STOCK-*`(farm-egg) / `PRD-EGG-*`(packaging admin) / `EGG-YYYYMMDD-*`(Sales V2) |
| 2 | **2 套包装流并存** | 真实车间 BFF `/api/packaging/terminal/*`（前端在用，P1C 接库存）vs 孤儿 admin `/api/packaging/*`（packaging.service，无前端调用却写 PRD-EGG 库存） |
| 3 | **多套入库/扣减旁路** | farm-egg 直入可售库存、farm-sales 直扣库存（均已冻结但代码仍在） |
| 4 | **为兼容旁路引入的复杂度** | `legacy_source` 隔离列、FIFO 处处 `legacy_source IS NULL`、PRD-EGG 中间态标记 |
| 5 | **schema drift** | v6/v7 迁移未纳入 CI glob（P1E 已用 2026 迁移修复） |
| 6 | **追溯链未端到端贯通** | 旁路并存导致 销售→库存→包装→集蛋→鸡舍 在生产环境断点 |

---

## 2. 重复链路（要消灭的对象）

```
库存写入：
  EGG-STOCK-*   ← farm-egg.service.inbound（旁路·已冻结）        ✗ 删
  PRD-EGG-*     ← packaging.service.completeShift/grade/packComplete（孤儿 admin 流） ✗ 删
  EGG-YYYYMMDD-* ← Sales V2 createProductionBatch（唯一正确）     ✓ 留

库存扣减：
  farm-sales → eggSvc.outbound（旁路·已冻结）                    ✗ 删
  Sales V2 FIFO / Store POS fifoDeductItems（唯一正确）          ✓ 留

包装主流程：
  BFF terminal flow（真实车间，前端在用）                        ✓ 留为唯一
  admin packaging.service inventory（孤儿）                      ✗ 删/降级查询
```

---

## 3. 保留内容（KEEP）

| 资产 | 说明 |
|------|------|
| `inv_batches` / `inv_ledger` | **唯一库存批次表 / 唯一流水表** |
| `EggInventoryService`（FIFO + Advisory Lock + Scheduler） | 唯一销售库存运行时 |
| `egg-inventory-scheduler.service` | 临期/过期调度 |
| BFF `PackagingTerminalBffController`（`/api/packaging/terminal/*`） | **唯一包装主流程** |
| `PackagingInventoryIntegrationService.completeTerminalPacking` + `generateSaleableFromOutputs` | 包装→库存唯一入口（幂等核心） |
| `InventorySourceModeService` + `inv_source_mode` | 模式/灰度治理 |
| `ProductionInboundService`（TEMP） | **过渡保留**：写同一命名 `EGG-YYYYMMDD-*`，非旁路，模式互斥；R6 评估退役 |
| Sales V2 订单/配送/退货/POS Runtime | 销售扣减/回库唯一链路 |
| 唯一可售库存命名 | `EGG-YYYYMMDD-NNNNN` + `sku_code` + `grade_code_std` + `spec_code` + `expire_date` |

---

## 4. 删除内容（DELETE，无真实数据，直接删）

| 删除对象 | 文件/位置 | 影响 |
|---------|----------|------|
| **EGG-STOCK-* 库存能力** | `farm/farm-egg.service.ts`(144行) inbound/outbound/writeOff/onModuleInit 建批次 | 旁路库存消失 |
| **farm-egg 库存接口** | `farm/farm-egg.controller.ts` `/api/farm/egg/{inbound,outbound,write-off}` | 旁路入口消失（集蛋"只读记录"另置） |
| **farm-sales 直扣库存** | `farm/farm-sales.service.ts`(165行) + `farm-sales.controller.ts` | 销售旁路消失 |
| **孤儿 admin 包装库存流** | `terminal/packaging.service.ts` 的 completeShift/submitGrade/packComplete/reopenShift/mergeRemainder（写 inv 的方法）+ `packaging.controller.ts` 对应 POST 端点 | PRD-EGG-* 命名体系消失 |
| **completePackagingBatch(taskNo)** | `packaging-inventory-integration.service.ts`（pkg_tasks 版入口） | 仅留 completeTerminalPacking |
| **PRD-EGG-* / EGG-STOCK-* 测试批次** | inv_batches/inv_ledger 测试数据 | 上线前清空重置 |
| **legacy_source 复杂度** | inv_batches.legacy_source + FIFO/扣减处的 `legacy_source IS NULL` | 单命名体系后不再需要（保留列但默认空，或退役） |

---

## 5. 冻结内容（FREEZE，保留只读/过渡）

| 冻结对象 | 处置 |
|---------|------|
| 集蛋记录 | farm-egg 仅保留**只读集蛋记录**（生产事实），不写库存；菜单 `MENU_PROD_COLLECTION` 只读 |
| admin 包装查询 | packaging.service 的 getShifts/getDailyReport 等**查询方法保留**（降级为后台查询接口），删其库存写入方法 |
| `TEMP_PRODUCTION_INBOUND` | **过渡保留**：包装全面投运前的日产蛋入库；R6 评估是否退役或保留为应急手工入库 |

---

## 6. 重构后架构（Production Runtime Blueprint）

### 唯一业务链
```
鸡舍 brd_houses
  → 鸡群 brd_flocks
    → 日产蛋记录 brd_daily_logs（生产事实，不形成库存）
      → 集蛋记录 pkg_source_batches（待包装原蛋）
        → 包装任务/分级 pkg_grading_records（BFF terminal flow）
          → 包装完成/成品交接 pkg_packing_records + warehouse/confirm
            → 【唯一库存入口】completeTerminalPacking
              → inv_batches(EGG-YYYYMMDD-*) + inv_ledger(PACKAGING_INBOUND)
                → 销售 Sales V2 FIFO / 门店 POS（扣减）
                  → 退货回库（SALE_RETURN）
                    → 追溯：销售单→库存批次→包装批次→集蛋→鸡舍
```
**禁止任何旁路**（farm-egg / farm-sales / admin packaging 写库存均删除）。

### 各流（六流统一）
| 流 | 唯一实现 |
|----|---------|
| 业务流 | 鸡舍→…→包装完成→库存→销售→退货 |
| 数据流 | brd_* → pkg_* → inv_batches/inv_ledger → sal_* |
| 库存流 | warehouse/confirm → EGG-YYYYMMDD-* → FIFO |
| 销售流 | Sales V2 FIFO / POS fifoDeductItems（唯一） |
| 追溯流 | packaging_batch_ref / collection_batch_ref / allocated_batch_no 串联 |
| 权限流 | 生产 / 包装 / 库存 / 销售 四界分离（见 §8） |

---

## 7. 数据模型重构（表清单）

| 表 | 处置 | 说明 |
|----|------|------|
| `inv_batches` | **保留** | 唯一库存批次；上线前清空测试数据；评估退役 legacy_source |
| `inv_ledger` | **保留** | 唯一流水 |
| `pkg_source_batches` / `pkg_grading_records` / `pkg_packing_records` / `pkg_handover_records` / `pkg_work_shifts` / `pkg_qc_inspections` / `pkg_exceptions` | **保留** | BFF 真实车间流数据 |
| `pkg_shifts` / `pkg_tasks` | **冻结/评估删除** | admin 孤儿流数据载体；删其库存写入后评估是否保留为任务台账 |
| `brd_houses` / `brd_flocks` / `brd_daily_logs` | **保留** | 生产事实 |
| `inv_source_mode` / `inv_source_mode_audit` | **保留** | 模式治理 |

**命名统一方案**：
- `EGG-STOCK-*`：**删除**（farm-egg 旁路批次）。
- `PRD-EGG-*`：**删除作为可售**；删 admin 流后该命名不再产生（如需"包装中间态"，由 QC 隔离 `status=QUARANTINE` 表达，不再用独立命名）。
- `EGG-YYYYMMDD-NNNNN`：**唯一可售库存命名**，带 sku_code/grade_code_std/spec_code/expire_date。

---

## 8. 权限重构（四界分离）

| 域 | 菜单/权限 | 边界 |
|----|----------|------|
| 生产 | `MENU_PROD_COLLECTION`（集蛋记录·只读生产事实） | **禁止改库存** |
| 包装 | `MENU_PKG_PACKAGING` / `MENU_PKG_COMPLETE_INVENTORY` | 包装完成入库（经 completeTerminalPacking，**不直接 UPDATE inv_batches**） |
| 库存 | `MENU_INV_BATCH` / `MENU_INV_LEDGER` / `MENU_INV_MANUAL_INBOUND` | 仅采购/调拨/盘点/手工调整 |
| 销售 | `MENU_SALES2_*` | 经 FIFO 扣减（**销售人员禁止直接改库存**） |

原则：**包装人员、销售人员都不得直接写 inv_batches**，只能经各自服务的受控入口。

---

## 9. 性能与复杂度收益

| 维度 | 收益（预估） |
|------|------------|
| 删除代码 | farm-egg.service(144) + farm-sales.service(165) + packaging.service 库存方法(~400) + completePackagingBatch + farm-egg/farm-sales controller ≈ **800–1000 行** |
| 库存命名体系 | **3 → 1**（EGG-YYYYMMDD-*） |
| 包装主流程 | **2 → 1**（BFF terminal） |
| 重复入库/扣减入口 | 砍掉 farm-egg/farm-sales/admin 三条旁路 |
| 隔离复杂度 | `legacy_source` 退役 → FIFO/扣减查询简化 |
| 重复端点 | admin packaging 写库存端点 6+ 删除/降级 |
| 维护成本 | 单链路、单命名、单入口 → 排障/演进显著简化 |

---

## 10. 最终架构图（一页）

```
        ┌─────────── 生产域（只读事实，禁改库存）───────────┐
        │ brd_houses → brd_flocks → brd_daily_logs           │
        └───────────────────────┬───────────────────────────┘
                                 │ 集蛋（待包装原蛋）
        ┌─────────── 包装域（唯一主流程 = BFF terminal）──────┐
        │ source-receive → qc → grading → packing            │
        │            → warehouse/confirm（成品交接）          │
        └───────────────────────┬───────────────────────────┘
                                 │ completeTerminalPacking（唯一库存入口·幂等·模式门控）
        ┌─────────── 库存域（唯一 inv_batches/inv_ledger）───┐
        │ EGG-YYYYMMDD-*（PACKAGING_INBOUND）→ FIFO          │
        │ [过渡] TEMP_PRODUCTION_INBOUND 同命名               │
        └───────────────────────┬───────────────────────────┘
                                 │ FIFO 预留/扣减（legacy_source 退役）
        ┌─────────── 销售域（Sales V2 唯一扣减）─────────────┐
        │ 销售订单 / 门店 POS → 出库 → 退货回库              │
        └───────────────────────┬───────────────────────────┘
                                 │ allocated_batch_no
        追溯：销售单 → inv_batches(packaging_batch_ref) → pkg_packing_records
              → pkg_grading/source → 鸡舍/鸡群（正向 + 反向）
```

---

## 11. 实施路线图（R1–R6）

| 阶段 | 名称 | 核心动作 | 验收 |
|------|------|---------|------|
| **R1** | 删除重复库存体系 | 删 farm-egg.service 库存能力 + controller 写端点；清 EGG-STOCK-* 测试数据；从 FarmModule 摘除 | farm-egg 不再产生库存；TS 0 错 |
| **R2** | 删除重复包装体系 | 删 packaging.service 库存写入方法 + packaging.controller 对应 POST；删 completePackagingBatch；PRD-EGG-* 命名消失 | 唯一包装流=BFF terminal；TS 0 错 |
| **R3** | 统一库存入口 | warehouse/confirm = 唯一入口；补 completeTerminalPacking 的 sku_code/spec_code（按 batches_json spec + product_skus 解析） | 包装交接生成完整 SKU 批次 |
| **R4** | 统一销售扣减 | 删 farm-sales；确认 Sales V2 FIFO/POS 唯一扣减；退役 legacy_source（FIFO 去掉 IS NULL 条件） | 销售/POS 仅扣 EGG-YYYYMMDD-* |
| **R5** | 统一追溯链 | 打通 销售→库存→包装→集蛋→鸡舍 正反向追溯 API + 完整性校验 | 端到端追溯可查 |
| **R6** | 正式上线准备 | 数据重置 + 主数据初始化 + 全链冒烟 + 切 `GROUP/ALL=PACKAGING_INBOUND` + 评估退役 TEMP + Go-Live | 闭环验收通过 |

> 灰度策略（P1A inv_source_mode SITE 级）作为 R6 切换工具：先单 SITE → 全量 → 冻结 TEMP。

---

## 12. 明确回答

**1. 哪些东西应该彻底删除？**
- `EGG-STOCK-*` 库存体系 = farm-egg.service 库存能力 + farm-egg.controller 写端点；
- `farm-sales` 直扣库存（service + controller）；
- 孤儿 admin 包装库存流：packaging.service 的 completeShift/submitGrade/packComplete/reopenShift/mergeRemainder（写库存部分）+ packaging.controller 对应 POST 端点；
- `completePackagingBatch(taskNo)`（pkg_tasks 版入口，留 completeTerminalPacking）；
- `PRD-EGG-*` 作为可售库存的命名体系；
- 全部 EGG-STOCK-*/PRD-EGG-* 测试批次数据；
- `legacy_source` 隔离复杂度（单命名后退役）。

**2. 哪些东西应该保留？**
inv_batches / inv_ledger；Sales V2 EggInventoryService(FIFO)+Scheduler；BFF terminal 包装流；
PackagingInventoryIntegrationService(completeTerminalPacking/generateSaleableFromOutputs)；
InventorySourceModeService + inv_source_mode；Sales V2 订单/配送/退货/POS；唯一命名 `EGG-YYYYMMDD-*`。

**3. 哪些东西应该冻结？**
集蛋记录（farm-egg 只读生产事实）；admin 包装**查询**接口（降级只读）；
`TEMP_PRODUCTION_INBOUND`（过渡保留，R6 评估退役/转应急手工入库）。

**4. 重构后业务链路？**
鸡舍→鸡群→日产蛋记录→集蛋记录→包装任务/分级→包装完成/成品交接→
【唯一入口】生成 `EGG-YYYYMMDD-*` 库存→Sales V2 FIFO/POS 扣减→退货回库→端到端追溯。**无旁路。**

**5. 预计减少多少复杂度？**
删 ~800–1000 行库存写入代码；库存命名 3→1；包装主流程 2→1；砍 3 条入库/扣减旁路；
退役 legacy_source；删/降 6+ 重复端点。维护面显著收窄为单链路。

**6. 是否适合作为正式上线版本？**
**R0 是蓝图，不是上线版本。** 按 R1–R6 执行落地后（删重复→统一入口→统一扣减→追溯→上线准备），
即形成可作为正式上线的最终架构。当前阶段产出蓝图与路线图，**为上线建立最终架构基线**。

---

## 附录 · 与已完成阶段的衔接

- P1A inv_source_mode → R6 灰度/切换工具（保留）。
- P1C completeTerminalPacking → R2/R3 的唯一库存入口（保留强化）。
- P1E schema recovery 迁移 → 已修 v6/v7 drift（保留）。
- 本 R0 = 把 P1B 审计揭示的"双流/三命名/多旁路"问题，定为**删除目标**并排出 R1–R6 执行序。
