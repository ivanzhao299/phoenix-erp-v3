# 生产运行体系重构 R3 — 包装终端耦合改造

> **任务**：Production Runtime Rebuild Phase R3（Packaging Terminal Coupling Refactor）
> **日期**：2026-06-03
> **依据**：docs/packaging-terminal-coupling-audit-r15.md（P0 SITE / P1 SPEC·SKU / P2 标签）
> **目标**：补齐 SITE / SPEC / SKU 三维，让 terminal/packaging → 库存 → Sales V2 → POS 形成完整标准链路，恢复单场区灰度。
> **诚实声明**：本地无运行 HTTP 服务，链路验证为「服务原样 SQL 数据层忠实执行 + 代码路径核对」；HTTP 首跑随孟赛灰度。

---

## 0. 结论速览

| 维度 | 状态 |
|------|------|
| SITE 真实化 | ✅ 真实场站 FARM-MS/FARM-DP；shift-open 必选场站；不再默认 site-01 |
| SPEC 入库 | ✅ batches_json 的 spec → packaging_specs.spec_code → inv_batches.spec_code |
| SKU 入库 | ✅ grade+spec → product_skus.sku_code → inv_batches/inv_ledger.sku_code |
| Sales PATH A | ✅ sku_code 精确 FIFO 可选中包装库存（数据层实证） |
| 标签统一 | ✅ 推荐方案 A：PKG-* 为可扫码，inventory/by-packing 解析到 EGG-* |
| 单场区灰度 | ✅ 恢复：FARM-MS=PACKAGING_INBOUND / FARM-DP=TEMP（真实场站键） |

---

## 1. SITE 维度修复（P0）

- **真实场站主数据**（迁移）：`brd_farms` 增 `FARM-MS`(孟赛蛋鸡场) / `FARM-DP`(东鹏蛋鸡场)。
- **shift-open 采集 siteId**：前端新增「场站」必选下拉（`GET /api/packaging/terminal/sites` 载 brd_farms），`openShift({..., siteId})`；未选不可开班（canSubmit 校验）。
- **BFF shifts/open 不再默认 site-01**：`body.siteId || null`（前端必填，未传则 NULL 回落 COMPANY/GROUP）。
- **completeTerminalPacking site 解析**：`pkg_packing_records.shift_id → pkg_work_shifts.site_id`（现为真实场站码）。
- 实证：smoke 中 shift site_id='FARM-MS' → resolveMode → `PACKAGING_INBOUND`。

## 2. SPEC 维度修复（P1）

- `completeTerminalPacking` **完整解析 batches_json**（保留 `spec`/`specId`），形成 `items[{grade, specName, qty}]`，按 (grade,spec) 聚合。
- 新增 `resolveSpecCode(specName)`：`packaging_specs.spec_name → spec_code`。
- 写入 `inv_batches.spec_code` + `packaging_spec`。
- 实证：`360枚/箱→BOX360`、`30枚/托→TRAY30` 写入库存。

## 3. SKU 维度修复（P1）

- **product_skus 主数据**（迁移）：可售等级(AA/A/B/C) × `packaging_specs` → `sku_code = SKU-{grade}-{qty}`，`product_code='PRD-EGG-{grade}'`（对齐 PATH B）。
- 新增 `resolveSku(grade, specCode)`：`product_skus(grade_code,spec_code) → sku_code`。
- `createSaleableBatch` 传 `skuCode` → `createProductionBatch` 写 `inv_batches.sku_code` + `inv_ledger.sku_code`（resolveSkuInfo 反解 product_code 与 PRD-EGG-{grade} 一致，PATH A/B 双兼容）。
- 实证：`AA+BOX360→SKU-AA-360`、`A+TRAY30→SKU-A-30` 写入批次与流水。

## 4. Sales V2 对接（PATH A）

- 包装批次现带 `sku_code` → Sales V2 `allocateByFIFO` PATH A（`sku_code` 精确匹配）可选中。
- 实证：FIFO 查询 `sku_code='SKU-AA-360'` → 命中包装批次。
- 兼容：sku_code 为空（无匹配 SKU）时仍回退 PATH B（product+grade），不阻断。

## 5. 标签体系统一（P2）

**推荐方案 A（PKG 主码 + 库存解析）**：
- 标签印制发生在**包装环节**，此时库存批次 `EGG-*` **尚未生成**（成品交接才入库）→ 标签无法显示 EGG-*。
- 故保留 `PKG-YYYYMMDD-*`（包装流水/箱码）为标签可扫码主码；`inv_batches.packaging_batch_ref=PKG-*` 为数据链。
- 新增 `GET /api/packaging/terminal/inventory/by-packing/:packingCode` → 扫 PKG-* 直接返回对应库存批次（EGG-*、sku_code、spec_code）。
- 效果：**扫码标签 → 定位库存批次** 成立（经 packaging_batch_ref），无需在标签上硬印 EGG-*。
- 方案 B（标签显示 EGG-*）不可行（印制时 EGG-* 不存在），不采纳。

## 6. 库存批次标准化（逐字段）

| 字段 | 状态 |
|------|------|
| batch_no = EGG-YYYYMMDD-NNNNN | ✅ READY |
| sku_code | ✅ READY（R3 新增） |
| product_code = PRD-EGG-{grade} | ✅ READY |
| grade_code_std | ✅ READY |
| spec_code | ✅ READY（R3 新增） |
| egg_date / expire_date | ✅ READY |
| company_code | ✅ READY |
| site_code | 🟢 经 shift→site 解析用于模式门控（inv_batches 无独立列，由 packaging_batch_ref→shift→site 追溯） |
| warehouse_code | 🟠 未显式写（NULL，非阻断） |
| packaging_batch_ref / collection_batch_ref | ✅ READY |

## 7. 灰度能力恢复

- 迁移 seed：`inv_source_mode(SITE, FARM-MS, PACKAGING_INBOUND)`（孟赛灰度）、`(SITE, FARM-DP, TEMP_PRODUCTION_INBOUND)`（东鹏过渡）。
- shift 携真实 site_id → completeTerminalPacking 精确解析 → SITE 级门控**真正生效**。
- 实现单场区灰度：**孟赛包装入库 / 东鹏临时生产入库**，互不影响。

## 8. 验证结果

| 验证 | 结果 |
|------|------|
| API TypeScript | ✅ 0 errors |
| Web TypeScript | ✅ 0 errors |
| 迁移本地实跑 | ✅ 幂等；场站/SKU/灰度模式 seed 成功 |
| 数据层端到端冒烟 | ✅ spec_code/sku_code/site/grade_code_std 全入库；PATH A 选中；扫码定位库存 |
| scope-audit.sh | 本地 2/30（未起服务，非回归基线） |

**五场景（数据层实证 / 设计预期）**：
1. 孟赛 AA 360枚箱 → 包装 → 库存 → 生成 spec_code=BOX360 / sku_code=SKU-AA-360 ✅
2. 销售订单 → SKU 匹配 → FIFO（PATH A sku_code 选中）✅
3. POS → SKU 匹配 → 扣减（同 FIFO 口径，PATH A 可用）✅（HTTP 未实测）
4. 标签扫码（PKG-*）→ inventory/by-packing → 定位库存批次 ✅
5. 追溯：库存(packaging_batch_ref) → 包装(PKG) → 班次(shift) → 场站(FARM-MS) ✅

## 9. 是否允许孟赛灰度上线

🟢 **达到孟赛 PACKAGING_INBOUND 灰度上线条件（数据层就绪）**，剩 HTTP 级首跑：
- 前置（部署后）：① 本期迁移部署绿灯；② 孟赛开班选 FARM-MS（shift site_id 真实）；③ 真实跑一次 集蛋→分级→包装→成品交接，确认 inv_batches 生成带 sku_code/spec_code、inventoryOk=true；④ 用 sku_code 下一张销售单验证 PATH A 扣减。
- 满足即孟赛正式灰度；东鹏维持 TEMP。

---

## 明确回答

**1. SITE 是否真正可用？** ✅ 是。真实场站 FARM-MS/FARM-DP；shift-open 必选场站写入 pkg_work_shifts.site_id；completeTerminalPacking 精确解析；SITE 级门控生效（实证 FARM-MS→PACKAGING_INBOUND）。
**2. SPEC 是否进入库存？** ✅ 是。batches_json 的 spec → packaging_specs.spec_code → inv_batches.spec_code（实证 BOX360/TRAY30）。
**3. SKU 是否进入库存？** ✅ 是。grade+spec → product_skus.sku_code → inv_batches/inv_ledger.sku_code（实证 SKU-AA-360/SKU-A-30）。
**4. Sales 是否能走 PATH A？** ✅ 是。包装批次带 sku_code，FIFO 按 sku_code 精确选中（实证）；空 sku 回退 PATH B 兼容。
**5. 标签与库存是否统一？** ✅ 是（方案 A）。PKG-* 为可扫码主码，inventory/by-packing 经 packaging_batch_ref 解析到 EGG-* 库存批次；EGG-* 印制时不存在故不上标签。
**6. 是否允许孟赛 PACKAGING_INBOUND 灰度上线？** 🟢 允许（数据层就绪）；完成部署后 4 项前置 HTTP 冒烟即正式灰度。

---

## 附录 · 变更文件

- `apps/api/migrations/20260603_r3_packaging_coupling_master_data.sql`（场站/SKU/灰度模式 seed）
- `apps/api/src/modules/sales-v2/services/packaging-inventory-integration.service.ts`（spec/sku 解析 + items 改造）
- `apps/api/src/modules/bff/bff.controller.ts`（shifts/open 去 site-01 默认 + sites + inventory/by-packing）
- `apps/web/src/lib/packaging-api.ts`（getSites）
- `apps/web/src/app/(terminal)/terminal/packaging/shift-open/page.tsx`（场站选择器）
- `docs/production-runtime-rebuild-phase-r3.md`（本报告）
