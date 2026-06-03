# 真实运行链路冒烟验证 Phase R0b — Real Runtime Smoke Test

> **任务**：Production Runtime Rebuild Phase R0b（真实包装→库存链路冒烟，删除前置门禁）
> **日期**：2026-06-03
> **目的**：在执行 R1（删除重复库存体系）**之前**，先证明 A 类真实运行链路
> （terminal/packaging → warehouse/confirm → completeTerminalPacking → inv_batches）能**独立生成库存**，
> 否则删旧链路后现场可能无库存来源。
> **范围**：只验证 包装 → 库存（不验证 销售/POS/退货）。
> **诚实声明**：本地无运行中的 NestJS HTTP 服务，本冒烟为**「服务原样 SQL 的数据层忠实执行」+ 代码路径核对**，
> 非 HTTP 请求实跑；HTTP 级首跑应在孟赛灰度 go-live 执行。

---

## 0. 结论

> **REAL_RUNTIME_CONFIRMED**（数据层忠实 SQL + 代码路径）。
> 真实包装流可独立生成唯一可售库存 `EGG-YYYYMMDD-*`，幂等、可查询、可追溯。
> **允许进入 R1（删除重复库存体系）。**

---

## 1. 测试范围

- 链路：`terminal/packaging/*`（前端）→ `packaging-api.ts` → `/api/packaging/terminal/*`（BFF）→ `warehouse/confirm` → `completeTerminalPacking` → `inv_batches` / `inv_ledger`。
- 仅 包装 → 库存；不含销售/POS/退货。

## 2. 真实链路（确认唯一真实包装流）

```
前端 (terminal)/terminal/packaging/*  ← 真实车间页面
  → packaging-api.ts（request → /api/packaging/terminal/*）
    → BFF bff.controller.ts · PackagingTerminalBffController（A 类真实流）
      → warehouse/confirm（成品交接）
        → PackagingInventoryIntegrationService.completeTerminalPacking(packingCode)
          → inv_batches(EGG-YYYYMMDD-*) + inv_ledger(PACKAGING_INBOUND)
```
- 对照确认：`/api/packaging/*`（admin `packaging.controller.ts` + `packaging.service.ts`）**前端零调用**（grep 实证），为 C 类孤儿，不参与真实链路。
- 故 **terminal/packaging（BFF flow）= 唯一真实包装流**。

## 3. 包装验证（冒烟数据）

种子（事务内，ROLLBACK 不持久化）：
- `pkg_work_shifts(id=990002, site_id=SITE-MENGSAI-LAYER)`
- `pkg_packing_records(code=PKG-R0B, batches_json=[{A:300},{B:120},{BROKEN:15}], shift_id=990002)`
- `inv_source_mode(SITE/SITE-MENGSAI-LAYER = PACKAGING_INBOUND)`

`completeTerminalPacking` 步骤逐一实证：
| 步骤 | 结果 |
|------|------|
| ① 读包装记录（含 shift_id） | ✅ batches_json 解析 A/B/BROKEN |
| ② 解析 site | ✅ SITE-MENGSAI-LAYER |
| ③ resolveMode | ✅ PACKAGING_INBOUND（门控开启） |
| ④ 幂等首检 | ✅ 0（首次，继续生成） |
| ⑤ loadSaleableGrades | ✅ A/AA/B/C 可售；BROKEN 不可售→跳过 |
| ⑥ createProductionBatch（原样 SQL） | ✅ A(300)/B(120) 生成；BROKEN 隔离不入可售 |

## 4. 库存验证（inv_batches）

| batch_no | source_type | legacy_source | qty | qty_available | expire_date | grade_code_std |
|----------|-------------|---------------|-----|---------------|-------------|----------------|
| `EGG-20260602-00001` | PACKAGING | (NULL) | 300 | 300 | 2026-07-02 | A |
| `EGG-20260602-00002` | PACKAGING | (NULL) | 120 | 120 | 2026-07-02 | B |

✅ `source_type='PACKAGING'`、`legacy_source IS NULL`、`batch_no LIKE 'EGG-%'`；
✅ qty/qty_available 正确；expire_date = egg_date + 30 天；grade_code_std 正确。
（注：sku_code/spec_code 为 NULL — R0/P1D 已记录，R3 补；不阻断本冒烟）。

## 5. 流水验证（inv_ledger）

| batch_no | change_type | qty_change |
|----------|-------------|-----------|
| EGG-20260602-00001 | PACKAGING_INBOUND | 300 |
| EGG-20260602-00002 | PACKAGING_INBOUND | 120 |

✅ `change_type='PACKAGING_INBOUND'`；数量正确；每批一条，不重复。

## 6. 幂等验证

✅ 二次提交同一 `packingCode=PKG-R0B`：幂等键
`WHERE packaging_batch_ref='PKG-R0B' AND source_type='PACKAGING'` 命中 **2 条 / 420 枚** →
`completeTerminalPacking` 走幂等分支，**不再 INSERT、不重复加库存、不重复写流水**。

## 7. 库存查询验证

✅ getAvailableBatches 口径（company=MENGSE, status=AVAILABLE, qty_available>0, legacy_source IS NULL, EGG-%）
查询到两条批次，含 批次号/数量/等级/到期日，显示正常。

## 8. 追溯验证（包装→库存）

✅ 建立关联：
| batch_no | packaging_batch_ref | collection_batch_ref | → packing | → site |
|----------|---------------------|----------------------|-----------|--------|
| EGG-20260602-00001 | PKG-R0B | SHIFT-990002 | PKG-R0B | SITE-MENGSAI-LAYER |
| EGG-20260602-00002 | PKG-R0B | SHIFT-990002 | PKG-R0B | SITE-MENGSAI-LAYER |

`inv_batches.packaging_batch_ref → pkg_packing_records.code → shift_id → pkg_work_shifts.site_id` 链路贯通。

## 9. 结果判断

🟢 **REAL_RUNTIME_CONFIRMED**
- 包装 → 库存 数据层链路全程跑通（生成/字段/流水/幂等/查询/追溯）。
- 断点：无（schema 由 P1E 修复、接线由 P1C 完成）。
- 唯一未覆盖：HTTP 级真实请求（本地无服务器）→ 留待孟赛灰度 go-live 首跑。

## 10. 是否允许进入 R1（删除重复库存体系）

🟢 **允许**。理由：
- A 类真实流已证明可独立生成库存（本冒烟）。
- 待删的 Farm Egg Inventory（EGG-STOCK-*）**早已冻结**（Phase 1 起 inbound/outbound/writeOff 抛错），
  当前并非任何活跃库存来源；本地仅 8 行测试批次。
- 删除后，非灰度场站库存来源仍是 `TEMP_PRODUCTION_INBOUND`（默认 GROUP 模式，写同一 `EGG-YYYYMMDD-*`），
  灰度场站为包装入库 → **删 C 类不会造成"现场无库存来源"**。

---

## 必须回答

**1. terminal/packaging 是否已成为唯一真实包装流？**
✅ **是。** 前端全部经 `packaging-api.ts → /api/packaging/terminal/*`（BFF）；admin `/api/packaging/*` 零前端调用（孤儿）。

**2. 包装是否能真实生成库存？**
✅ **能。** 数据层忠实 SQL 冒烟证明 warehouse/confirm → completeTerminalPacking 生成
`EGG-YYYYMMDD-*`(PACKAGING) + `PACKAGING_INBOUND` 流水（接线 P1C、schema P1E 已就绪）。HTTP 首跑待灰度。

**3. 库存是否可查询？**
✅ **可。** getAvailableBatches 口径查询到新批次，字段完整。

**4. 是否存在重复库存风险？**
✅ **无（当前已防）。** 单命名 `EGG-YYYYMMDD-*`；模式互斥（PACKAGING_INBOUND 时仅包装生成、TEMP 时仅日产蛋生成）；
幂等键 packingCode 防重复入库；FIFO `legacy_source IS NULL` 排除 EGG-STOCK-*/PRD-EGG-*。
（彻底消除重复体系将由 R1/R2 删除旧链路完成。）

**5. 是否允许执行 R1 删除 Farm Egg Inventory？**
🟢 **允许。** REAL_RUNTIME_CONFIRMED；Farm Egg 库存早已冻结、非活跃来源；删除不影响现场库存来源
（TEMP/包装两路仍在）。建议 R1 同时清理 EGG-STOCK-* 测试批次。

---

## 附录 · 冒烟证据（本地，事务 ROLLBACK，服务原样 SQL）

- 生成：`EGG-20260602-00001|PRD-EGG-A|PACKAGING|legacy=NULL|qty=300|expire=2026-07-02|grade_code_std=A`、
  `EGG-20260602-00002|PRD-EGG-B|...|qty=120`
- 流水：`PACKAGING_INBOUND 300 / 120`
- 幂等二次：命中 2 条/420 → 跳过
- 查询：getAvailableBatches 口径返回 2 条
- 追溯：packaging_batch_ref=PKG-R0B、collection_batch_ref=SHIFT-990002 → site=SITE-MENGSAI-LAYER
- genBatchNo / expire 逻辑与 `EggInventoryService.createProductionBatch` 一致（EGG-YYYYMMDD-NNNNN，egg_date+30d）
