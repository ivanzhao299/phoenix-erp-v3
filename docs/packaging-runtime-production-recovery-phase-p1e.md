# 包装库存链路生产恢复 Phase P1E — 实施报告

> **任务**：Packaging Runtime Production Recovery Phase P1E
> **日期**：2026-06-02
> **依据**：docs/packaging-runtime-convergence-validation-phase-p1d.md（P0 schema drift）
> **范围**：不新增业务功能 / 不重构包装 / 不改销售 / 不改库存算法。
> 只做：schema drift 验证 + 幂等迁移补齐 + 失败显性化 + 链路恢复验证。

---

## 0. 结论速览

| 项 | 结论 |
|----|------|
| 生产 schema drift | ✅ **根因确认**：CI glob 不含 v6/v7，shift_id/grading_codes_json 漏部署（本地复现缺列） |
| 字段补齐 | ✅ 幂等迁移 `20260602_packaging_runtime_schema_recovery.sql`（CI `2026*` 必执行） |
| CI/CD 覆盖 | ✅ deploy.yml 跑 `migrations/2026*.sql`，新迁移在内；不再依赖 v6/v7 文件名 |
| 失败静默 | ✅ 已修复：warehouse/confirm 库存失败 → error log + `inventoryOk=false` + message |
| 包装交接生成库存 | ✅ 数据层端到端实证（含 shift→site→模式门控→追溯） |
| 幂等 | ✅ 实证（幂等键命中即跳过） |
| Sales FIFO / 追溯 | ✅ 数据层实证 |
| **孟赛灰度** | 🟢 **READY_FOR_GRAY（条件：本迁移部署绿灯 + 生产诊断①回贴确认）** |

---

## 1. 生产诊断 SQL 结果

诊断 Runbook 与 5 条 SQL 见 `docs/packaging-runtime-production-diagnosis.md`。
- 生产执行结果**待用户回贴**（按约定不开放 agent 生产 SSH）。
- **本地参照**（开发库，复现 drift 成因）：
  - ① 修复前 `pkg_packing_records` 缺 shift_id/grading_codes_json（返回 0 行）→ 印证 P1D 判定。
  - 跑本期迁移后两列补齐（返回 2 行），二次幂等。

---

## 2. schema drift 判断

✅ **确认存在 drift（根因明确）**：
- `shift_id` 由 `v7_shift_tracking.sql`、`grading_codes_json` 由 `v6_packing_grading_codes.sql` 添加。
- CI `deploy.yml` 迁移仅扫描 `ddl/*` + `v3_schema_complete.sql` + `migrations/2026*.sql`，
  **v6/v7（非 2026 前缀）从未被自动执行** → 凡是仅靠 CI 部署的库都会缺这两列。
- 本地开发库实测缺列，复现成因。
- **未手工改生产库**（遵守禁令），改由正式幂等迁移修复。

---

## 3. 迁移修复内容

`apps/api/migrations/20260602_packaging_runtime_schema_recovery.sql`：
- `pkg_packing_records.shift_id INTEGER`（IF NOT EXISTS）
- `pkg_packing_records.grading_codes_json JSONB NOT NULL DEFAULT '[]'`（IF NOT EXISTS）+ 回填（仅未回填行）
- `pkg_source_batches.shift_id INTEGER`（IF NOT EXISTS）
- 索引 `idx_pkg_packing_records_shift` / `idx_pkg_source_batches_shift`
- `to_regclass` 守卫；不删除/不重命名/不改历史。

**本地实跑验证**：迁移前 0 列 → 迁移后 2 列；二次执行幂等（NOTICE skip）；
`completeTerminalPacking` 主 SELECT（含 shift_id）修复后可正常执行。

---

## 4. CI/CD 迁移覆盖确认

✅ `deploy.yml` 两处迁移块（CI 测试库 + 生产库）均执行：
```
for f in $(ls migrations/2026*.sql 2>/dev/null | sort); do run_migration "$f"; done   # ON_ERROR_STOP=1
```
- 本期 `20260602_packaging_runtime_schema_recovery.sql` 匹配 `2026*` → **生产部署必执行**。
- 不再依赖 v6/v7 文件名自动部署（它们仍保留，但本期把其关键列以 2026 前缀重新落地）。

---

## 5. 库存生成验证（数据层实证）

种子：`pkg_work_shifts(site=SITE-MENGSAI-LAYER)` + `pkg_packing_records(batches_json=[{A:300},{B:120},{BROKEN:15}], shift_id)` + `inv_source_mode(SITE-MENGSAI-LAYER=PACKAGING_INBOUND)`，事务 + ROLLBACK：

| 环节 | 结果 |
|------|------|
| ① 读包装记录 + 解析 site | ✅ site_id=SITE-MENGSAI-LAYER（shift_id 列已可读） |
| ② resolveMode(site) | ✅ → `PACKAGING_INBOUND`（门控开启） |
| ③ 可售生成 / 隔离 | ✅ A(300)/B(120) 生成 `EGG-20260602-*`，source_type=PACKAGING、legacy_source NULL；BROKEN(15) 不可售跳过 |
| inv_ledger | ✅ `change_type=PACKAGING_INBOUND` |
| batch_no LIKE 'EGG-%' | ✅ |

---

## 6. 幂等验证

✅ 幂等键 `packaging_batch_ref=packingCode AND source_type='PACKAGING'` 命中（返回 2）→
`generateSaleableFromOutputs` 走幂等分支，重复 warehouse/confirm 不重复入库、不重复写流水、不重复加 qty_available。

---

## 7. Sales FIFO 验证（数据层）

✅ FIFO 选批条件（company=MENGSE, product=PRD-EGG-A, status=AVAILABLE, qty_available>0,
`legacy_source IS NULL`, expire 未过）→ **选中包装批次** `EGG-20260602-A0001`。
预留/出库逻辑沿用 Phase 1（未改）。

---

## 8. POS 验证（数据层）

✅ `store-pos.fifoDeductItems` 查询含 `legacy_source IS NULL`（Phase 1），与上面 FIFO 一致 → 能扣到包装批次。
⚠️ HTTP 级未实测（本地无运行服务）；扣减算法未改动。

---

## 9. 是否允许孟赛灰度切换

🟢 **READY_FOR_GRAY**（条件式）

- **阻断已清除**：P0 schema drift 由本期 `2026*` 幂等迁移修复（CI 自动执行）；失败不再静默。
- **数据层端到端贯通**：包装交接 → 库存生成 → 幂等 → FIFO → 追溯（含 site/模式门控）全实证。
- **前置检查（切换前确认，建议你回贴诊断结果）**：
  1. 本迁移部署绿灯（CI 已触发）。
  2. 生产诊断 ① 返回 2 行（shift_id/grading_codes_json 存在）。
  3. 生产诊断 ④ 孟赛对应 `pkg_work_shifts.site_id` 有值（确认 site 解析口径与 `SITE-MENGSAI-LAYER` 一致）。
  4. 设 `inv_source_mode(SITE, <孟赛场站码>, PACKAGING_INBOUND)` 后，真实做 1 次 warehouse/confirm 冒烟，确认 inv_batches 新增 PACKAGING 批次、inventoryOk=true。

> 满足 1–4 即可正式进入孟赛灰度；其余场站维持 TEMP。

---

## 10. 剩余问题

- 🟠 **字段缺口（非阻断 PATH B 销售）**：`sku_code` / `spec_code` 仍未写入包装批次
  （P1C/P1D 已记录）。PATH B(product+grade) 可售；PATH A(SKU)/规格维度受限。建议后续 P2 补：
  按 batches_json 的 spec 聚合写 spec_code；按 grade+spec 解析 product_skus 写 sku_code。
- 🟠 **HTTP 端到端未实测**：本报告为数据层实证 + 代码路径核对；首次真实 warehouse/confirm 冒烟需在孟赛灰度执行。
- 🟡 **孤儿 admin 流**：`/api/packaging/*`（packaging.service packComplete）仍在，建议 P2 物理移除避免双入口混淆。
- 🟡 **site 解析口径**：当前从 `pkg_packing_records.shift_id → pkg_work_shifts.site_id`；
  需确认孟赛实际作业的 shift_id 正确回填（迁移后新记录会带 shift_id）。

---

## 11. 明确回答

**1. 生产库是否存在 schema drift？**
✅ **是（根因确认）**：v6/v7 未纳入 CI `2026*` glob，`pkg_packing_records.shift_id` / `grading_codes_json`
凡靠 CI 部署即缺失（本地复现）。生产实际状态以诊断 ① 回贴为准；无论如何本期迁移会补齐。

**2. shift_id / grading_codes_json 是否已补齐？**
✅ **已补齐**：幂等迁移 `20260602_packaging_runtime_schema_recovery.sql`（含 pkg_source_batches.shift_id），
本地实跑验证补列 + 幂等 + 索引；CI `2026*` 必执行 → 部署即在生产补齐。

**3. 包装交接是否真的能生成库存？**
✅ **能（数据层端到端实证）**：补列后 `completeTerminalPacking` 读包装记录 + 解析 site + 模式门控 +
生成 `EGG-YYYYMMDD-*`(PACKAGING) + 写 `PACKAGING_INBOUND` 流水 + FIFO 可选 + 追溯贯通，全部跑通。
（HTTP 级首测在孟赛灰度做。）

**4. 是否还存在静默失败风险？**
✅ **已消除静默成功**：warehouse/confirm 库存失败 → `console.error`（含堆栈）+ 返回
`inventoryOk=false` + message「包装交接已记录，但库存生成失败，请联系管理员处理。」；
模式跳过（TEMP）属正常非失败。schema 层失败源（缺列）已由迁移消除。

**5. 孟赛是否可以进入 PACKAGING_INBOUND 灰度？**
🟢 **READY_FOR_GRAY**：P0 已清除、链路数据层贯通、失败显性化。
正式切换前完成 §9 的 4 项前置检查（部署绿灯 + 诊断①④回贴 + 1 次真实交接冒烟）即可灰度孟赛，其余场站维持 TEMP。

---

## 附录 · 变更文件

- `apps/api/migrations/20260602_packaging_runtime_schema_recovery.sql`（新，幂等补列）
- `apps/api/src/modules/bff/bff.controller.ts`（warehouse/confirm 失败显性化，不再 safe 吞错）
- `docs/packaging-runtime-production-diagnosis.md`（诊断 runbook）
- `docs/packaging-runtime-production-recovery-phase-p1e.md`（本报告）
