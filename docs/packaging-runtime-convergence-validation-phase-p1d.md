# 包装运行体系收口验收 Phase P1D

> **任务**：Packaging Runtime Convergence Validation Phase P1D（只验证，不改代码）
> **日期**：2026-06-02
> **依据**：docs/packaging-runtime-convergence-phase-p1c.md
> **方法**：代码路径逐字段核对 + **数据库层端到端模拟**（本地 Postgres 事务 + ROLLBACK，可复现）。
> **诚实声明**：本地无运行中的 NestJS HTTP 服务，故**未做真实 HTTP 端到端请求**；
> 本验收为「代码路径确定性核对 + 数据层 SQL 实证」，HTTP 级冒烟需在含车间数据的灰度环境补做。

---

## 0. 验收结论速览

| 项 | 结论 |
|----|------|
| 真实包装流接入库存 | ⚠️ **代码已接通，但有 P0 schema 阻断** |
| 库存生成逻辑 | ✅ 数据层实证正确（命名/字段/流水） |
| 幂等 | ✅ 数据层实证（幂等键命中即跳过） |
| FIFO 选批 / legacy 隔离 | ✅ 数据层实证 |
| 销售 / POS / 退货扣减 | ✅ 逻辑沿用 Phase 1（未改）+ FIFO 选批实证；HTTP 未实测 |
| 追溯 | ✅ 字段齐（packaging_batch_ref/collection_batch_ref）；依赖 shift_id |
| 旧路径冻结 | ✅ EGG-STOCK / PRD-EGG 均 legacy 隔离 |
| **是否允许灰度切换** | 🔴 **暂不建议**，先清 P0 + 补字段 + 灰度实测 |

---

## 1. 验证范围

- 真实包装流：`/api/packaging/terminal/*`（BFF）。
- 库存接入：`warehouse/confirm` → `completeTerminalPacking`。
- 库存/销售/POS/退货/追溯链路。
- 旧路径冻结（EGG-STOCK / PRD-EGG / Farm Egg）。
- 孟赛 / 东鹏 单场区灰度条件。

---

## 2. 真实包装流验证（代码路径）

✅ 前端全部走 BFF：`packaging-api.ts` → `/api/packaging/terminal/*`。
✅ `warehouse/confirm`（成品交接）已接入库存生成：
```
confirmHandover(body)
  → INSERT pkg_handover_records
  → if body.packingCode:
       pkgInv.completeTerminalPacking(packingCode)   // P1C 新增
         → 读 pkg_packing_records(packingCode).batches_json
         → 归一化等级 → 解析 site(pkg_work_shifts.site_id)
         → generateSaleableFromOutputs(packingCode, gradeOutputs, {...})
```
✅ 前端 warehouse-handover 实传 `packingCode: ctx.packingCode`（已核对）。

> 说明：`packing/submit` 仅写 pkg_packing_records（设计如此）；库存生成点选在
> `warehouse/confirm`（成品交接完成），符合 P1C 第三步推荐。

---

## 3. 库存生成验证（数据层实证）

模拟 `generateSaleableFromOutputs` 写入（本地事务 + ROLLBACK）：

| P1D 要求字段 | 实际写入 | 结论 |
|-------------|---------|------|
| `batch_no = EGG-YYYYMMDD-NNNNN` | `EGG-20260602-99001` | ✅ |
| `grade_code_std` | `A` | ✅ |
| `expire_date` | `2026-07-02`（egg_date+30d） | ✅ |
| `packaging_batch_ref` | `PKG-TEST-99`（=packingCode） | ✅ |
| `collection_batch_ref` | `SHIFT-1` | ✅ |
| `inv_ledger.change_type = PACKAGING_INBOUND` | `PACKAGING_INBOUND` | ✅ |
| `source_type` | **`PACKAGING`** | ⚠️ 见说明 A |
| `sku_code` | **NULL** | ❌ 见说明 B |
| `spec_code` | **NULL** | ❌ 见说明 C |

- **说明 A（命名澄清）**：P1D 写「source_type = PACKAGING_INBOUND」，实际 `source_type='PACKAGING'`，
  而 `PACKAGING_INBOUND` 是 `inv_ledger.change_type`。二者分工正确（source_type 标来源、change_type 标流水类型），
  非缺陷，仅术语对齐。
- **说明 B（缺口）**：`sku_code` 未写。P1C 为避免 `createProductionBatch` 以 SKU 反向覆盖 product_code，
  刻意不传 skuCode（已在 P1C 文档标注「SKU 精确匹配留待 Phase 2」）。影响：销售走 PATH B(product+grade) 可匹配，
  但 PATH A(SKU 精确) 无法命中包装批次。
- **说明 C（缺口）**：`spec_code` 未写。`completeTerminalPacking` 仅按等级聚合 batches_json，丢弃了每箱 spec。
  影响：库存批次无规格维度，规格级 FIFO/报表受限。

---

## 4. 幂等验证（数据层实证）

✅ 幂等键 `WHERE packaging_batch_ref=$refNo AND source_type='PACKAGING'` 命中返回 1 →
`generateSaleableFromOutputs` 走幂等分支，不重复 INSERT inv_batches、不重复写 inv_ledger、不重复加 qty_available。
幂等键 = `packingCode`，warehouse/confirm 重复提交安全。

---

## 5. 销售订单验证

- FIFO 选批查询（`allocateByFIFO` 条件）实证：对 `company=MENGSE, product=PRD-EGG-A` **选中包装批次** `EGG-20260602-99001`。
- 预留/出库/退货逻辑 Phase 1 已实现且本阶段未改动（`reserveInventory`/`confirmOutbound`/`processReturnInventory`）。
- ⚠️ **HTTP 级未实测**：未真实创建 Sales V2 订单走完审批→预留→配送。结论：选批逻辑实证可达，端到端待灰度实测。

---

## 6. POS 验证

- `store-pos.fifoDeductItems` 查询含 `legacy_source IS NULL`（Phase 1 已加），与上面 FIFO 一致 → 能扣到包装批次。
- ⚠️ HTTP 级未实测（同上）。

---

## 7. 退货验证

- `processReturnInventory` 生成 RETURN 批次 + 写 `inv_ledger SALE_RETURN`（Phase 1，未改）。
- RETURN 批次 `legacy_source` 为空 → 可再售；批次号含 returnNo 可追溯。
- ⚠️ HTTP 级未实测。

---

## 8. 追溯验证

✅ 字段齐备：`inv_batches.packaging_batch_ref = packingCode`、`collection_batch_ref = SHIFT-{shift_id}`。
正向/反向链路：
```
sal_order_items.allocated_batch_no
  → inv_batches.batch_no(EGG-*) [packaging_batch_ref]
    → pkg_packing_records.code(packingCode)
      → pkg_grading_records / pkg_source_batches (production_date)
        → house_code → brd_houses / brd_flocks
```
⚠️ **依赖 `pkg_packing_records.shift_id`**（用于 collection_batch_ref 与 site 解析）——见第 0/11 节 P0。

---

## 9. 旧路径冻结验证（数据层实证）

✅ FIFO（`legacy_source IS NULL`）实证排除：
- `EGG-STOCK-A`（`legacy_source='FARM_EGG'`）→ 不被选中。
- `PACK-*`（`legacy_source='PACKAGING_INTERMEDIATE'`）→ 不被选中。
- 仅 `EGG-20260602-*`（legacy 为空）进 FIFO。
✅ Farm Egg 入口 Phase 1 已冻结（inbound/outbound/writeOff 抛错 + LegacyFreezeBanner），只保留只读集蛋记录。

---

## 10. 单场区灰度切换建议

| 场站 | 切换条件 | 判断 |
|------|---------|------|
| `SITE-MENGSAI-LAYER` | 见下阻断项 | 🔴 **暂不建议**（先清 P0 + 灰度实测；本地公司 MENGSE 数据最全，建议作为**首选实测场站**） |
| `SITE-DONGPENG-LAYER` | 见下阻断项 | 🔴 **暂不建议**（同上，排第二批） |

**阻断原因（必须先解决）**：
1. 🔴 **P0 · schema drift**：`completeTerminalPacking` 与 BFF `packing/submit` 依赖
   `pkg_packing_records.shift_id` / `grading_codes_json`，二者由 `v6_packing_grading_codes.sql` /
   `v7_shift_tracking.sql` 添加，**但 CI `deploy.yml` 迁移 glob 仅含 `ddl/*` + `v3_schema_complete` +
   `migrations/2026*.sql`，不含 v6/v7**。本地库实测缺 `shift_id`。若生产同样缺列：
   - `packing/submit` INSERT 失败（safe 吞）→ 无包装记录；
   - 即便有记录，`completeTerminalPacking` SELECT shift_id 报错（safe 吞）→ **库存静默不生成**。
   → 切换前**必须确认生产 `pkg_packing_records.shift_id` 存在**（诊断 SQL 见附录），否则收口在生产中不生效。
2. 🟠 字段缺口：`sku_code` / `spec_code` 未写（说明 B/C）。不阻断 PATH B 销售，但 SKU/规格维度受限。
3. 🟠 SITE 解析依赖 `pkg_work_shifts.site_id` 有值；需确认目标场站 packing 流程带正确 shift→site。
4. 🟡 HTTP 端到端未实测：需在灰度场站真实跑 包装→交接→库存→销售→退货→追溯。

---

## 11. 是否允许进入 PACKAGING_INBOUND 灰度

🔴 **暂不允许全量；单场区灰度需先完成下列前置（建议 P1E）：**
1. 确认/修复生产 `pkg_packing_records.shift_id` + `grading_codes_json`（把 v6/v7 纳入 CI glob，或补一个 `2026*` 幂等迁移）。
2. （建议）补 `spec_code`（按 batches_json 的 spec 聚合）与 `sku_code`（按 grade+spec 解析 product_skus）。
3. 在孟赛单场区设 `inv_source_mode(SITE, SITE-MENGSAI-LAYER, PACKAGING_INBOUND)`，真实跑通端到端并核对数量。
4. 通过后再切东鹏，最后全量 + 冻结 TEMP。

---

## 12. 明确结论

**1. 包装收口是否真正完成？**
**逻辑层完成，生产可用性未达。** 真实车间流（warehouse/confirm）已接入库存生成，
数据层实证「生成 / 幂等 / FIFO / legacy 隔离」全部正确；但存在 **1 个 P0（shift_id schema drift）**
与 2 个字段缺口（sku_code/spec_code），且未做 HTTP 端到端实测。→ 不能视为「生产已验收通过」。

**2. 是否可以单场区切换 PACKAGING_INBOUND？**
**暂不可。** 须先消除 P0（确认生产 shift_id 列）并完成一次灰度场站真实端到端实测。

**3. 建议先切孟赛还是东鹏？**
**先孟赛（SITE-MENGSAI-LAYER）。** 当前唯一销售公司即 MENGSE，主数据/客户/价格最全，作为首个灰度场站风险最小、可观测性最好；东鹏排第二批。

**4. 是否仍需 TEMP_PRODUCTION_INBOUND 过渡？**
**是，必须保留。** 在 P0 清除 + 灰度实测通过前，TEMP 是现场唯一可靠的库存来源，不可冻结。

**5. 是否达到 生产—包装—库存—销售 闭环标准？**
**数据层闭环已证明；生产闭环待 P0 修复 + 灰度实测。** 即「设计与逻辑闭环达标，生产闭环未最终验收」。

---

## 附录 · 生产诊断 SQL（请在生产库执行后回贴）

```sql
-- ① 确认 shift_id / grading_codes_json 是否存在（P0 关键）
SELECT column_name FROM information_schema.columns
 WHERE table_name='pkg_packing_records' AND column_name IN ('shift_id','grading_codes_json');

-- ② 近 7 天是否有包装记录、是否带 shift_id
SELECT COUNT(*) AS recs, COUNT(shift_id) AS with_shift, MAX(created_at)::date AS latest
  FROM pkg_packing_records WHERE created_at >= NOW() - INTERVAL '7 days';

-- ③ 是否已有任何 PACKAGING 来源的可售库存（收口是否已在生产生效）
SELECT COUNT(*) AS pkg_batches, COALESCE(SUM(qty_available),0) AS avail
  FROM inv_batches WHERE source_type='PACKAGING' AND legacy_source IS NULL;

-- ④ pkg_work_shifts 是否有 site_id（SITE 灰度解析依赖）
SELECT site_id, COUNT(*) FROM pkg_work_shifts WHERE production_date >= CURRENT_DATE - 7 GROUP BY site_id;

-- ⑤ 当前库存来源模式
SELECT scope_level, scope_code, mode FROM inv_source_mode ORDER BY 1,2;
```

---

## 附录 · 数据层模拟证据（本地，事务 ROLLBACK）

- inv_batches 写入：`EGG-20260602-99001 | PRD-EGG-A | PACKAGING | grade_code_std=A | expire=2026-07-02 | packaging_batch_ref=PKG-TEST-99 | collection_batch_ref=SHIFT-1 | sku_code=NULL | spec_code=NULL | qty_available=300`
- inv_ledger 写入：`PACKAGING_INBOUND | 300`
- 幂等查询：`already_exists=1`
- FIFO 选批：仅 `EGG-20260602-99001`
- legacy 隔离：`EGG-STOCK-A` / `PACK-TESTLEGACY` 被排除
- schema 检查：`pkg_packing_records.shift_id` **本地缺失**（P0 证据）
