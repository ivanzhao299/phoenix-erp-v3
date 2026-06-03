# 分级包装终端与库存耦合前审计 R1.5

> **任务**：Packaging Terminal Coupling Audit Phase R1.5（耦合前审计，不开发/不重构/不删页面）
> **日期**：2026-06-03
> **保护原则**：`terminal/packaging/*` 属 Real Runtime，禁删禁重写，**只审计耦合条件**。
> **方法**：3 路并行只读审计（前端页面字段 / BFF 写入与批次规则 / 等级-SKU-标签一致性）+ 关键点实证。

---

## 0. 结论速览

| 维度 | 结论 |
|------|------|
| 终端分级包装页面 | ✅ 可保留为正式包装入口（真实流，字段基本够，缺项可接线补齐，非重写） |
| 包装批次→库存批次生成 | ✅ 可生成（R0b 已证明）；幂等键 packingCode 稳定 |
| 等级映射 | ✅ 完全一致（终端码 = product_grades.grade_code） |
| **SITE 级灰度门控** | 🔴 **P0 失效**：shift 永远 site_id='site-01'，与真实场站/灰度键不匹配 |
| spec_code 写入 | 🟠 P1：batches_json 含 spec 但服务解析时丢弃 |
| sku_code 写入 | 🟠 P1：服务刻意不传 + product_skus 主数据缺失 |
| 标签批次 ↔ 库存批次 | 🟠 P2：标签显示 PKG-*，库存是 EGG-*，不一致（有 ref 关联但标签未显示库存号） |
| warehouse/confirm 入库节点 | ✅ 正确（成品交接完成才入库） |

---

## 1. 审计范围

- 前端：`(terminal)/terminal/packaging/{source-receive,grading,packing,label-print,warehouse-handover}` + `packaging-api.ts`
- 后端：BFF `PackagingTerminalBffController`（`/api/packaging/terminal/*`）、`PackagingInventoryIntegrationService`、`EggInventoryService`、`inv_batches`/`inv_ledger`

---

## 2. 分级包装页面数据字段（实测）

| 页面 | API | 提交字段 |
|------|-----|---------|
| source-receive | `receiveBatch` POST source-batches/receive | houseCode, houseName, layDate, totalQty, dirtyQty, crackedQty, receivedQty, **shiftId** |
| grading | `submitGrading` POST grading/submit | productionDate, **outputs{grade:qty}**, totalInput, houseCode, sourceBatchIds, **shiftId** |
| packing | `submitPacking` POST packing/submit | gradingCodes, gradingCode, productionDate, **batches[{grade, spec, specId, boxes, eggs}]**, **shiftId** |
| label-print | `recordPrintLog` POST labels/print-log | boxCode（PH-XXXXXX-XX-NNN）, packingCode, printType, reprintReason? |
| warehouse-handover | `confirmHandover` POST warehouse/confirm | **shiftId, packingCode**, boxes[], palletCode, location, receiver, productionDate |

**字段采集结论**（对照任务 15 字段）：
- ✅ 已采集：packingCode（后端生成回传）、gradingCode、shiftId、grade、spec（packing batches）、boxes、eggs、packageDate(productionDate)、labelCode(boxCode)、batchNo(=packingCode)
- ❌ 未采集：**siteId**（仅 shift-open 默认 'site-01'）、lineId（默认 'line-01'）、expiryDate（标签端计算）、operator（来自班次）、qcStatus、eggs_per_box（隐含在 spec）
- ⚠️ 只在前端：spec/specId（packing 提交，写入 batches_json，但库存生成时丢弃 → 见 §5）

---

## 3. 包装批次生成规则（实测）

| 表 | code 格式 | 幂等 | shift_id |
|----|----------|------|---------|
| pkg_source_batches | `SRC-YYYYMMDD-HOUSE-{4位}` | UNIQUE(batch_code) | body.shiftId\|\|null |
| pkg_grading_records | `GRD-YYYYMMDD-{6位时间戳}` | ON CONFLICT(code) DO NOTHING | body.shiftId\|\|null |
| **pkg_packing_records** | `PKG-YYYYMMDD-{6位时间戳}` | ON CONFLICT(code) DO NOTHING | body.shiftId\|\|null + grading_codes_json |
| pkg_handover_records | `WH-YYYYMMDD-{6位}` | ON CONFLICT(code) DO NOTHING | body.shiftId\|\|null |

- ✅ `pkg_packing_records.code` 唯一、幂等，**适合作为 `packaging_batch_ref`**（已用于 inv_batches 幂等键）。
- ✅ `collection_batch_ref = SHIFT-{shift_id}` 可稳定生成（前端 packing 传 shiftId）。
- 🔴 `pkg_work_shifts.site_id`：**shifts/open 默认 'site-01'**（前端 openShift 不传 siteId）→ 见 §10 P0。

---

## 4. 等级映射（✅ 完全一致）

| product_grades.grade_code | is_saleable |
|---------------------------|-------------|
| AA / A / B / C | true（可售） |
| DIRTY / CRACKED / BROKEN / DAMAGED | false（不可售） |

- 终端硬编码等级码与 `product_grades.grade_code` **完全一致**；BFF `buildGradeKeyMap` 提供 config_json.code/terminalCode → dict_code 归一化（缺字典则恒等）。
- ✅ 可售等级进可售库存；不可售等级被 `loadSaleableGrades` 跳过（R0b 实证 BROKEN 被隔离）。

---

## 5. 规格 / SKU 映射 — 精确断点

**表**：`product_skus(sku_code, product_code, grade_code, spec_code)`（UNIQUE 三元组）；`packaging_specs(spec_code, spec_name, qty_per_unit)`。

**spec_code 缺失断点（精确）**：
1. ✅ 前端 packing 页**采集 spec/specId**（batches[{grade,spec,specId,boxes,eggs}]）。
2. ✅ BFF packing/submit `JSON.stringify(batches)` 写 `pkg_packing_records.batches_json` → **spec 已落库**。
3. 🔴 **断点在服务**：`completeTerminalPacking` 解析 batches_json 时**只取 {grade, eggs}**（忽略 spec），且调 `generateSaleableFromOutputs` **不传 packSpec** → `createSaleableBatch` specCode=undefined → `inv_batches.spec_code = NULL`。
   → **断点 = IntegrationService 没解析 spec（数据在 batches_json，服务丢弃），非页面没采集。**

**sku_code 缺失断点（精确）**：
1. 🔴 **服务刻意不传 skuCode**：`createSaleableBatch` 注释明确「不传 skuCode（避免 createProductionBatch 以 SKU 反向覆盖 product_code），留待 Phase 2」。
2. 🔴 **SKU 主数据缺失**：`product_skus` 未 seed（本地无数据），即便传 skuCode，`resolveSkuInfo` 会抛异常。
   → **双断点：服务跳过 + 主数据缺失。** 需先 seed product_skus（grade+spec→sku），再让服务解析 spec→sku。

**结论**：缺字段原因 = **③ BFF 写了 spec 到 batches_json，但 ④ IntegrationService 没解析 spec、没传 sku；⑤ SKU 主数据缺失**（不是 ① 页面没采集，也不是 ② API 没传）。

---

## 6. 库存批次字段适配（逐字段）

| inv_batches 字段 | 状态 | 说明 |
|------------------|------|------|
| batch_no = EGG-YYYYMMDD-NNNNN | ✅ READY | genBatchNo |
| source_type = PACKAGING | ✅ READY | |
| legacy_source = NULL | ✅ READY | |
| product_code | ✅ READY | PRD-EGG-{grade} |
| grade_code_std | ✅ READY | |
| qty / qty_available | ✅ READY | |
| egg_date | ✅ READY | production_date |
| expire_date | ✅ READY | egg_date+30 |
| company_code | ✅ READY | resolveCompanyCode（单租户 MENGSE 自动） |
| packaging_batch_ref | ✅ READY | = packingCode |
| collection_batch_ref | ✅ READY | = SHIFT-{shift_id} |
| **sku_code** | 🔴 MISSING | 服务跳过 + 主数据缺失（§5） |
| **spec_code** | 🔴 MISSING | 服务丢弃 batches_json 的 spec（§5） |
| **site_code** | 🔴 PARTIAL/WRONG | inv_batches 无独立 site_code 列；site 仅用于模式门控，且 shift site_id='site-01'（§10） |
| warehouse_code | 🟠 PARTIAL | createProductionBatch 未显式传 → NULL（非阻断） |

---

## 7. 库存流水适配（inv_ledger）

| 字段 | 状态 |
|------|------|
| change_type = PACKAGING_INBOUND | ✅ READY |
| batch_no / qty_change / ref_no(=packingCode) / company_code | ✅ READY |
| **sku_code** | 🔴 MISSING（随批次 sku_code NULL） |
| site_code | 🟠 N/A（inv_ledger 无 site_code 列，经 batch 关联） |

追溯链：`inv_ledger.ref_no=packingCode → pkg_packing_records → shift → site`；批次维度 `inv_batches.packaging_batch_ref`。✅ 可追溯。

---

## 8. Sales V2 FIFO 适配

- **PATH A（sku_code 精确）**：包装批次 sku_code=NULL → **无法走 PATH A**。
- **PATH B（product_code + quality_grade）**：包装批次 product_code=`PRD-EGG-{grade}` + quality_grade={grade} → ✅ **可靠匹配**。
- 销售订单 `sal_order_items.sku_code` 存在；`reserveInventory` 传 `skuCode: item.sku_code ?? undefined`：
  - **若销售单填了 sku_code → 走 PATH A → 匹配不到包装库存（sku_code NULL）** ⚠️
  - 若销售单不填 sku_code → 走 PATH B → 正常匹配 ✅
- **结论**：**当前只能走 PATH B**。正式上线前须二选一：
  (a) 销售端统一不带 sku_code（走 PATH B），或 (b) 补 product_skus 主数据 + 包装写 sku_code（走 PATH A）。
  → **不补 sku_code/spec_code 也能上线（PATH B），但必须保证销售端不强制 SKU 精确匹配。**

---

## 9. 标签批次一致性（⚠️ 不一致）

| 项 | 标签端 | 库存端 |
|----|--------|--------|
| 批次号 | `packingCode` = `PKG-YYYYMMDD-{6}` | `inv_batches.batch_no` = `EGG-YYYYMMDD-NNNNN` |
| 箱码 | `PH-{PKG尾6}-{grade}-{seq}` | — |
| 等级 | ✅ | ✅ grade_code_std |
| 规格 | ✅ 显示 | 🔴 spec_code NULL |
| 保质期 | 标签端 productionDate+expiryDays | egg_date+30 |
| 条码 | Code128(boxCode) | — |
| 二维码 | ❌ 未实现 | — |

🔴 **标签"批次号"= 包装流水号 PKG-*，≠ 库存批次号 EGG-***。二者经 `inv_batches.packaging_batch_ref=PKG-*` 关联（数据可追），但**扫标签批次号无法直接查到库存批次**。保质期两端计算口径也可能不一致。

---

## 10. 成品交接节点判断

- ✅ `warehouse/confirm`（成品交接完成）= **正确库存生成节点**，符合「成品交接完成才进入可售库存」。
- `packing/submit` 偏早（仅记录包装，未实际交接），不宜作库存点（P1C 已采用此判断）。

🔴 **P0 · SITE 维度失效**：
- `shift-open` 前端 `openShift({lineId, shiftType, supervisorName})` **不传 siteId** → BFF 默认 `body.siteId||'site-01'`。
- → `pkg_work_shifts.site_id` 恒为 **'site-01'**；系统真实场站码是 `FARM-MS`（孟赛），**代码/数据中根本不存在 `SITE-MENGSAI-LAYER`**（灰度规格中的占位名）。
- → `completeTerminalPacking` 解析 site='site-01'，与任何真实场站灰度键不匹配 → **SITE 级灰度门控当前形同虚设**。
- 影响：P1E/G1 设想的「单场区灰度」**当前不可行**——要么 GROUP/COMPANY 级全局切换，要么先打通 site 维度（shift-open 采集真实 siteId + 场站主数据，或改由 house_code→场站 解析 site）。

---

## 11. 耦合风险清单

**P0（会导致库存错误 / 灰度失效）**
- **P0-1 SITE 维度失效**：shift site_id 恒 'site-01'，与真实场站/灰度键不匹配 → SITE 级灰度门控无效，单场区灰度不可行。

**P1（销售/POS 匹配不完整）**
- **P1-1 sku_code 未写**：销售若走 PATH A(SKU) 匹配不到包装库存；当前只能 PATH B。
- **P1-2 spec_code 未写**：batches_json 含 spec 但服务丢弃 → 无规格维度库存/FIFO/报表。
- **P1-3 product_skus 主数据缺失**：补 sku_code 的前置依赖未就绪。

**P2（体验 / 报表 / 追溯展示）**
- **P2-1 标签批次号 ≠ 库存批次号**：标签显示 PKG-*，库存 EGG-*；扫标签查不到库存批次（有 ref 关联未展示）。
- **P2-2 保质期口径**：标签端 productionDate+expiryDays vs 库存 egg_date+30，可能不一致。
- **P2-3 二维码未实现**；warehouse_code 未显式写（NULL）。

---

## 12. 是否允许进入 R2 / R3

- 🟢 **R2（删除孤儿 admin packaging flow `/api/packaging/*`）**：**允许**。该流孤儿、与本审计发现无依赖，删除不影响真实流。
- 🟠 **R3（统一库存入口 + 耦合改造）**：**允许进入，且 R3 必须解决**：
  - P0-1 site 维度（打通真实场站 → 灰度可用）；
  - P1-2 spec 解析（completeTerminalPacking 提取 batches_json 的 spec → spec_code）；
  - P1-1/P1-3 sku（seed product_skus + 服务按 grade+spec 解析 sku_code）；
  - P2-1 标签显示库存批次号（或保留 PKG-* 但增加 EGG-* 映射展示）。

---

## 13. 明确回答

**1. 分级包装页面是否可以保留作为正式包装入口？**
✅ **可以。** 真实车间流，字段基本充足，缺项均可经**接线补齐**（R3），无需重写或推翻。

**2. 页面数据是否足够生成标准库存批次？**
🟠 **部分足够。** grade/eggs/date/packingCode/shiftId 足以生成批次（R0b 已证明）；但 `spec_code`/`sku_code`/真实 `site` 缺失 → 不是「完整标准批次」。**基础可用，规格/SKU/场站维度待 R3 补。**

**3. sku_code/spec_code 缺失原因是什么？**
- **spec_code**：数据在 `pkg_packing_records.batches_json`（前端采集、BFF 落库），但 `completeTerminalPacking` 解析时**只取 grade/eggs、丢弃 spec、未传 packSpec** → 服务断点。
- **sku_code**：服务**刻意不传**（避免 SKU 反向覆盖 product_code）+ `product_skus` **主数据缺失**（双断点）。

**4. 标签批次与库存批次是否一致？**
❌ **不一致。** 标签批次号 = `PKG-YYYYMMDD-*`（包装流水），库存批次号 = `EGG-YYYYMMDD-*`；经 `packaging_batch_ref` 数据关联，但标签未显示库存批次号 → 扫标签查不到库存批次。需 R3 统一展示。

**5. warehouse/confirm 是否是正确入库节点？**
✅ **是。** 成品交接完成才入库，符合原则；P1C 已采用，R0b 已验证可生成库存。

**6. 是否允许进入下一步耦合改造？**
🟢 **允许。** R2 可直接执行（删孤儿流）；R3 耦合改造为正式落点，须在 R3 解决 P0-1（site）/P1（spec/sku）/P2-1（标签批次）后方可真正灰度上线。

---

## 附录 · 关键证据

- shift-open 前端 `openShift({lineId, shiftType, supervisorName})` 不传 siteId（`shift-open/page.tsx`）；BFF `body.siteId||'site-01'`（bff.controller.ts 1014）。
- 真实场站码 `FARM-MS`（孟赛），无 `SITE-MENGSAI-LAYER`（grep 实证）。
- packing 提交 `batches[{grade,spec,specId,boxes,eggs}]`；completeTerminalPacking 仅解析 `{grade,eggs}`（packaging-inventory-integration.service.ts 258-270）。
- createSaleableBatch 不传 skuCode（同文件注释）；product_skus 主数据缺失。
- 标签批次号 = packingCode（label-print/page.tsx）；库存批次号 = EGG-*（egg-inventory.service.ts genBatchNo）。
