# 包装运行体系收口 Phase P1C — 实施报告

> **任务**：Packaging Runtime Convergence Phase P1C
> **日期**：2026-06-02
> **依据**：docs/packaging-runtime-audit-phase-p1b.md（P0 双流断链）
> **目标**：不重做包装/库存/销售，只做**收口**——把库存生成接到**真实车间流**，
> 让真实包装产出自动进入 Sales V2 唯一库存体系，形成 包装→库存→销售 唯一闭环，
> 并具备 `PACKAGING_INBOUND` 的 SITE 级灰度切换条件。

---

## 1. 两套包装流分析（P1B 确认）

| 流 | API | 处理者 | 写库存 | 谁在用 |
|----|-----|--------|--------|--------|
| **A 真实车间流** | `/api/packaging/terminal/*` | `bff.controller.ts`（PackagingTerminalBffController） | ❌ 仅 pkg_*_records（JSONB） | **全部前端** |
| **B Admin/Service 流** | `/api/packaging/*` | `packaging.service.ts` + Phase 1 钩子 | ✅ inv_batches | ❌ 无前端调用（孤儿） |

**根因**：接入点错误——库存联动接在没人调用的 B 流；真实 A 流不生成库存。

---

## 2. 收口方案

**确立 A（BFF 真实车间流）为唯一包装主流程**；把库存生成接到 A 流的成品交接节点。
**不重写** `PackagingInventoryIntegrationService`，而是**提取其幂等核心**复用：

- 新增核心：`generateSaleableFromOutputs(refNo, gradeOutputs, opts)`
  —— 幂等（`packaging_batch_ref=refNo`）+ 模式门控（SITE 级）+ 不可售隔离 + 统一命名，与数据源解耦。
- 原 `completePackagingBatch(taskNo)`（B 流）**保留外部行为**，内部改为读 pkg_tasks 后**委托**核心（幂等键仍为 task_no）。
- 新增 A 流入口：`completeTerminalPacking(packingCode)`
  —— 读 `pkg_packing_records.batches_json`（[{grade, eggs}]）→ 归一化等级 → 解析 SITE（pkg_work_shifts.site_id）→ 委托核心（幂等键 = packingCode）。

**不维护两套库存生成主流程**：B 流（admin packComplete）已无前端调用，标记为废弃（后续 P2 清理），生产中库存只由 A 流产生。

---

## 3. 库存接入点（第三步评估）

| 候选节点 | 语义 | 评估 |
|---------|------|------|
| `packing/submit` | 包装录箱完成 | 偏早：尚未实际交接到仓库，可能调整/合箱 |
| **`warehouse/confirm`** ✅ | **成品交接完成** | **推荐**：实际成品交付仓库后才进库存，符合"成品交接完成才进入库存" |

**采用 `warehouse/confirm` 作为库存生成点**：
```
warehouse/confirm（成品交接）
  → INSERT pkg_handover_records（原有）
  → pkgInv.completeTerminalPacking(packingCode)（P1C 新增）
      → 读 pkg_packing_records(packingCode).batches_json → 等级产出
      → SITE 模式门控（PACKAGING_INBOUND 才生成；TEMP 跳过）
      → generateSaleableFromOutputs(refNo=packingCode, ...)
          → inv_batches(EGG-YYYYMMDD-*, source_type=PACKAGING, packaging_batch_ref=packingCode)
          → inv_ledger(change_type=PACKAGING_INBOUND) → 进 FIFO
  → 返回 { code, data:{ code, inventory } }
```
失败不阻断交接（`safe()` 包裹，记录交接、库存异常单独返回）。

---

## 4. 批次统一（第五步）

- 包装产出统一走 Sales V2 标准批次 **`EGG-YYYYMMDD-NNNNN`** + `grade_code_std` + `spec_code` + `expire_date`（经 `EggInventoryService.createProductionBatch`）。
- `PRD-EGG-*` / `PRD-EGG-*-PACK` 仅为**包装中间态**（B 流写入时已标 `legacy_source=PACKAGING_INTERMEDIATE`，FIFO 排除），**不作为最终销售库存**。
- A 流（真实流）不再产生 PRD-EGG 可售批次，直接生成 `EGG-YYYYMMDD-*` 可售批次。

---

## 5. 库存统一（第六步）

| 命名 | 语义 | 标记 |
|------|------|------|
| `EGG-STOCK-*` | 闭环A Farm Egg 旁路 | `legacy_source='FARM_EGG'`（LEGACY，冻结，FIFO 排除） |
| `PRD-EGG-*` | 闭环B 包装中间态 | `legacy_source='PACKAGING_INTERMEDIATE'`（中间态，FIFO 排除） |
| **`EGG-YYYYMMDD-*`** | **唯一可售库存** | `legacy_source IS NULL`，进 FIFO |

唯一可售库存 = `EGG-YYYYMMDD-*`（含 P1A 临时生产入库 与 P1C 包装入库两种来源，互斥，统一命名）。

---

## 6. 销售联动（第七步）

包装成品交接 → `EGG-YYYYMMDD-*`（PACKAGING_INBOUND）→ 进入既有 Sales V2 FIFO：
- 销售订单：`reserveInventory`/`allocateByFIFO`（`legacy_source IS NULL` 硬隔离）→ 预占 → 配送出库扣减。
- 门店 POS：`fifoDeductItems`（`legacy_source IS NULL`）→ 扣减。
- 退货：`processReturnInventory` → RETURN 批次回库（可售）。

这些扣减/回库链路 Phase 1 已就绪且未改动；P1C 只是让"真实包装产出"首次进入该链路。

---

## 7. 追溯链（第八步）

`inv_batches` 既有 `packaging_batch_ref` / `collection_batch_ref`（Phase 1 迁移 A）：
- A 流：`packaging_batch_ref = packingCode`（pkg_packing_records.code）、`collection_batch_ref = SHIFT-{shift_id}`。
- 追溯：销售单(`allocated_batch_no`) → `inv_batches`(packaging_batch_ref) → `pkg_packing_records`(packingCode) → `pkg_grading_records`/`pkg_source_batches`(production_date) → `house_code` 鸡舍。

---

## 8. 灰度方案（第十步）

**Packaging Readiness Flag = P1A 的 `inv_source_mode`（SITE 级）**，无需新机制：
- 默认 `GROUP/ALL = TEMP_PRODUCTION_INBOUND`（全系统过渡，现场不受影响）。
- 对某场站设 `SITE/{siteCode} = PACKAGING_INBOUND` → 该场站 `warehouse/confirm` 开始生成包装库存；其余场站仍 TEMP（`completeTerminalPacking` 经模式门控 `skippedByMode` 跳过）。
- SITE 解析：`pkg_work_shifts.site_id`（由 packing 记录的 shift_id 关联）。
- 切换经 P1A 的 `/warehouse/source-mode`（风险评估 + 二次确认 + 审计），仅 ADMIN/CEO/FACTORY_MGR。

示例：`SITE-MENGSAI-LAYER` 先切 `PACKAGING_INBOUND` 灰度跑通，验证后再切 `SITE-DONGPENG-LAYER`，最后全量 + 冻结 TEMP。

---

## 9. 验证结果

| 验证项 | 结果 |
|--------|------|
| API TypeScript | ✅ 0 errors（核心提取 + BFF 接入 + 跨模块注入，无循环依赖：sales-v2 不引用 bff） |
| Web TypeScript | ✅ 0 errors（P1C 无前端改动） |
| 前端传参核对 | ✅ warehouse-handover 前端确传 `packingCode: ctx.packingCode` → 接入会收到并生成库存 |
| 幂等键 | ✅ `packaging_batch_ref=packingCode`，重复 warehouse/confirm 不重复入库 |
| scope-audit.sh | 本地 2/30（未起服务 + 无 test 用户 fixtures，非回归基线，与历次一致） |

**五个验证场景（设计预期）**（PACKAGING_INBOUND 模式下）：
1. 包装 → 成品交接 warehouse/confirm → 自动生成 `EGG-YYYYMMDD-*` → 库存查询可见 ✅
2. 销售订单 → FIFO 预留（legacy 排除）→ 出库 → 库存减少 ✅
3. POS → fifoDeductItems → 库存减少 ✅
4. 退货 → processReturnInventory → 回库 ✅
5. 追溯：销售 → inv_batches(packaging_batch_ref) → pkg_packing_records → 集蛋/鸡舍 ✅

> 注：本地库无 packing 实测数据，端到端冒烟需在含车间数据的环境（灰度 SITE）执行；逻辑经 tsc + 设计核对。

---

## 10. 是否达到 PACKAGING_INBOUND 切换条件

**达到"灰度试运行"条件（单 SITE）：✅**
- 真实车间流的成品交接已接通库存生成；
- 幂等 + SITE 级模式门控 + 统一命名 + FIFO + 追溯齐备；
- 灰度机制（P1A inv_source_mode SITE 级）就绪，可单场区切换、风险可控、可回滚。

**全系统切换：暂不建议**——需先灰度 1 个 SITE 跑通真实 包装→库存→销售（含退货/追溯），并补齐 P2 项（见下）。

---

## 11. P0/P1/P2 状态

**P0（P1B 阻断项）→ 已解决** ✅
- 真实车间流接入库存生成（warehouse/confirm → completeTerminalPacking）。
- 包装产出统一 `EGG-YYYYMMDD-*` 进 FIFO。

**P1（收口质量）**
- B 流（admin packComplete）废弃待清理（已无前端调用，标记 deprecated）。
- 等级归一化依赖 `PKG_EGG_GRADE` 字典 config_json.code/terminalCode（已实现 buildGradeKeyMap，字典缺失则恒等）。

**P2（增强）**
- SKU 精确绑定（PATH A）；效率/损耗报表；标签 QR；admin B 流物理移除。

---

## 12 / 13. 明确回答

**1. 收口后是否形成唯一包装链路？**
**是。** 真实车间流（BFF terminal）确立为唯一主流程，成品交接自动生成 Sales V2 唯一可售库存（`EGG-YYYYMMDD-*`）。B 流孤儿化、待清理；库存只由 A 流产生。

**2. 是否达到 PACKAGING_INBOUND 试运行条件？**
**是（SITE 级灰度试运行）。** 接入点正确、幂等、模式门控、统一命名、FIFO、追溯齐备。

**3. 是否可在 孟赛 或 东鹏 单场区灰度切换？**
**可以。** 为目标场站设 `inv_source_mode(SITE, <siteCode>, PACKAGING_INBOUND)`（经 /warehouse/source-mode 风险评估 + 二次确认 + 审计），该场站包装即开始生成库存，其余场站不受影响（仍 TEMP）。前提：该场站的 packing 流程带正确 shift_id→site_id，且 `PKG_EGG_GRADE` 字典等级与 `product_grades` 对齐。

**4. 距离全系统切换还差什么？**
- 在 1 个灰度 SITE 跑通真实端到端（包装→库存→销售→退货→追溯），核对数量一致；
- 确认全部场站 packing 都能解析到正确 site_id；
- 物理移除/冻结 B 流（admin packComplete）避免双入口混淆；
- 全量切 `GROUP/ALL=PACKAGING_INBOUND` 并冻结 `TEMP_PRODUCTION_INBOUND`。

---

## 附录 · 变更文件

- `apps/api/src/modules/sales-v2/services/packaging-inventory-integration.service.ts`
  —— 提取 `generateSaleableFromOutputs` 核心；`completePackagingBatch` 委托；新增 `completeTerminalPacking` + `buildGradeKeyMap`。
- `apps/api/src/modules/bff/bff.controller.ts`
  —— `PackagingTerminalBffController` 注入服务；`warehouse/confirm` 接入库存生成。
- `apps/api/src/modules/bff/bff.module.ts` —— import SalesV2Module。
