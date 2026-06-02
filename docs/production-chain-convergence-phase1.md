# 生产链路收口 Phase 1 — 实施报告

> **任务**：Production Chain Convergence Phase 1
> **日期**：2026-06-02
> **依据**：docs/production-inventory-integration-audit.md
> **目标**：把"集蛋直接入可售库存 / 包装产出命名孤立 / 销售只认一套"的三套并存闭环，收口为
> **生产 → 包装 → 库存 → 销售** 唯一闭环；冻结 Farm Egg 库存旁路，包装完成成为唯一库存入口。
> **原则**：保留历史数据（不删除），所有迁移幂等，已正确的 FIFO 扣减不破坏。

---

## 1. 现状（收口前）

审计确认：库存表已统一为 `inv_batches` + `inv_ledger`（无需新建），但有三套互不感知的闭环写入/扣减：

| 闭环 | 路径 | 批次命名 | 销售可见 |
|------|------|---------|---------|
| A 旁路 | `farm-egg` 集蛋直入 + `farm-sales` 直销出库 | `EGG-STOCK-{0-5/脏/破}`（无保质期） | ❌ |
| B 包装 | `packaging` completeShift/grade/packComplete（已自动入库） | `PRD-EGG-*` / `PRD-EGG-*-PACK` | ❌（FIFO 不认） |
| C 销售 | Sales V2 `createProductionBatch` → FIFO | `EGG-YYYYMMDD-NNNNN`（带保质期） | ✅ |

核心病灶：同一物理蛋可能被 A、B 各记一次（双重计数）；包装产出命名与销售 FIFO 不一致（销售看不到）。

---

## 2. 冻结内容（第一步）

**闭环 A — Farm Egg 库存旁路冻结**（保留生产/集蛋/录入与只读查询，禁止生成可售库存）：

- `apps/api/src/modules/farm/farm-egg.service.ts`：`inbound()` / `outbound()` / `writeOff()` 抛
  `ForbiddenException(FARM_EGG_FROZEN_MSG)`；保留 `getStock()` / `getLedger()` 只读（历史可见）。
- `apps/api/src/modules/farm/farm-sales.service.ts`：`createSale()` 早已冻结（Fix Pack 1）；本次补冻
  `cancelSale()`（旧逻辑移至 `_cancelSaleLegacy`，不再回补 `EGG-STOCK-*`）。
- 前端：
  - `apps/web/src/app/(admin)/breeding/egg-ledger/page.tsx` 顶部加 `LegacyFreezeBanner`（指向「包装作业中心」）。
  - `apps/web/src/app/(mobile)/mobile/egg/page.tsx` 顶部加内联冻结提示。

---

## 3. 统一库存入口（第二、三步）

**包装完成 = 唯一库存入口**。新增服务串联包装产出 → Sales V2 可售批次：

- 新增 `apps/api/src/modules/sales-v2/services/packaging-inventory-integration.service.ts`
  - `completePackagingBatch(taskNo, opts?)`：
    - **幂等**：以 `inv_batches.packaging_batch_ref = taskNo AND source_type='PACKAGING'` 为幂等键，
      重复点击不重复入库。
    - 读 `pkg_tasks`（grade_results / house_code / pack_spec / created_at / shift_id）。
    - 对每个**可售等级**（`product_grades.is_saleable=true`）调
      `EggInventoryService.createProductionBatch()` 生成统一可售批次：
      `batch_no=EGG-YYYYMMDD-NNNNN`、`product_code=PRD-EGG-{grade}`、`grade_code_std`、`spec_code`、
      `expire_date`、`source_type='PACKAGING'`、`packaging_batch_ref=taskNo`、`collection_batch_ref`，
      写 `inv_ledger` `change_type='PACKAGING_INBOUND'`，**自动进入 FIFO**。
    - 不可售等级不进可售库存（由 packComplete 写 QUARANTINE 中间态并标 legacy）。
    - **生产公司码解析**：显式参数 → `PRODUCTION_COMPANY_CODE` 环境变量 → 唯一销售客户公司码（单租户
      Pilot 自动适配）→ `'ALL'` 兜底。
- `EggInventoryService.createProductionBatch()` 扩展可选参数（默认行为不变，向后兼容）：
  `sourceType`（默认 PRODUCTION）/ `ledgerChangeType`（默认 INBOUND）/ `packagingBatchRef` / `collectionBatchRef`；
  INSERT 增加 `packaging_batch_ref` / `collection_batch_ref` 列；等级白名单纳入包装体系 `C/BROKEN`。
- `packaging.service.ts packComplete()`：
  - `PRD-EGG-*` / `PRD-EGG-*-PACK` 批次 INSERT 增加 `legacy_source='PACKAGING_INTERMEDIATE'` +
    `packaging_batch_ref`（降为**包装中间态**，FIFO 排除，不再作为最终销售库存）。
  - 末尾调用 `pkgInv.completePackagingBatch(taskNo)` 生成可售批次，结果并入响应 `data.saleable_inventory`。
- 端点：`POST /api/v2/sales/inventory/packaging-complete`（`@RequireMenu('MENU_PKG_COMPLETE_INVENTORY','C')`）。
- 接线：`SalesV2Module` 注册并导出新服务；`TerminalModule imports [SalesV2Module]`（单向依赖，无循环，
  API TypeScript 0 错验证通过）。

---

## 4. Packaging → Sales（销售只认一套 · 第四步）

- `EggInventoryService.allocateByFIFO()` 批次查询加 `legacy_source IS NULL`。
- `StorePosService.fifoDeductItems()` 两条 FIFO 查询（PATH A SKU / PATH B product+grade）加 `legacy_source IS NULL`。
- 效果：销售订单预占、配送出库、门店 POS 扣减**只认** Sales V2 可售批次（`EGG-YYYYMMDD-*`，
  `legacy_source IS NULL`），不再识别 `EGG-STOCK-*` / `PRD-EGG-*-PACK`。叠加既有 `company_code` 强隔离，双保险。
- 退货回库（`processReturnInventory` 写 RETURN 批次，`legacy_source` 为空）仍正常可售。

---

## 5. 追溯链（第五步）

- `inv_batches` 新增 `packaging_batch_ref` / `collection_batch_ref`（迁移 A，含索引）。
- 可售批次写入时回填两字段，打通：
  ```
  鸡舍(house_code) → 集蛋班次(shift_id / collection_batch_ref)
    → 包装批次(pkg_tasks.task_no / packaging_batch_ref)
      → 库存批次(inv_batches.batch_no=EGG-YYYYMMDD-*)
        → 销售单(sal_order_items.allocated_batch_no)
          → 客户 / 门店
  ```
- 正向（批次→销售）与反向（销售→批次→包装→集蛋→鸡舍）均可经 `inv_ledger`(ref_no/batch_no) +
  `inv_batches`(packaging_batch_ref/collection_batch_ref/source_no) 查询。

---

## 6. 权限（第七步）

新增 6 个权限码（`rbac.matrix.ts ROLE_MENU_MATRIX` 运行时门控 + `sys_menu`/`sys_role_menu_permission` 迁移 B 种子）：

| 权限码 | 含义 | 关键授权 |
|--------|------|---------|
| `MENU_PROD_COLLECTION` | 集蛋记录（不形成可售库存） | FARM_MGR/FARMER/PKG_MGR/FACTORY_MGR |
| `MENU_PKG_PACKAGING` | 包装作业 | PKG_MGR/PKG_OP/FACTORY_MGR/FARM_MGR |
| `MENU_PKG_COMPLETE_INVENTORY` | **包装完成入库（唯一库存入口）** | PKG_MGR/FACTORY_MGR/ADMIN |
| `MENU_INV_BATCH` | 库存批次 | WMS_MGR/WMS_OP/SALES_MGR |
| `MENU_INV_LEDGER` | 库存流水（只读为主） | WMS_MGR/FIN_ACCT/AUDITOR |
| `MENU_INV_MANUAL_INBOUND` | **手工库存入库（仅采购/调拨/调整）** | WMS_MGR/WMS_OP/ADMIN |

**核心**：包装完成入库（`MENU_PKG_COMPLETE_INVENTORY`）与手工库存入库（`MENU_INV_MANUAL_INBOUND`）彻底分离。

---

## 7. 菜单（第六步）

`apps/web/src/components/layout/Sidebar.tsx`：

- **生产管理**：「集蛋入库」→「集蛋记录」（`/breeding/egg-ledger`，`MENU_PROD_COLLECTION`，去库存含义）；
  「批次管理」→「包装批次」（语义归包装）。保留养殖总览/鸡舍/鸡群/日报/免疫/用药/设备/环境/运维。
- **库存管理**：新增「成品批次」（`/sales2/inventory`，`MENU_INV_BATCH`）；「入库管理」→「手工入库」。
  库存管理唯一负责 批次/流水/调拨/盘点/报损/主档。
- **包装作业中心**：包装作业/包装批次/包装日报/异常处理/补打日志 + 质检。

---

## 8. 旧数据兼容（第八步）

- 迁移 A（`20260602_production_chain_convergence_phase1_a_inv_columns.sql`）：
  - `inv_batches` 加 `legacy_source` / `packaging_batch_ref` / `collection_batch_ref`（`ADD COLUMN IF NOT EXISTS`）。
  - 幂等回填标记历史：`EGG-STOCK-*` → `FARM_EGG`；`PRD-EGG-*`/`PACK-*`/`BAT-*`（且 `batch_no NOT LIKE 'EGG-%'`
    且 `source_type<>'PACKAGING'`）→ `PACKAGING_INTERMEDIATE`。
  - **关键守卫**：精确排除收口后新生成的可售批次（`EGG-YYYYMMDD-*` + `source_type='PACKAGING'`），
    防止被误标 legacy 而对销售不可见。
- **不删除任何历史数据**；`EGG-STOCK-*` / `PRD-EGG-*` 历史批次与流水全部保留，仅打标隔离。
- 迁移 B（`..._b_menus.sql`）：`sys_menu` + `sys_role_menu_permission` 幂等 seed（`ON CONFLICT DO NOTHING`）。

---

## 9. 验证结果

| 验证项 | 结果 |
|--------|------|
| API TypeScript（tsc --noEmit） | ✅ 0 errors（含新服务、跨模块注入、无循环依赖） |
| Web TypeScript | 见提交记录（构建校验） |
| scope-audit.sh | 见提交记录（本地 test 用户 fixtures 缺失，历史基线 2/30，非回归） |
| 迁移幂等性 | ✅ `IF NOT EXISTS` / `ON CONFLICT` / `to_regclass` / `IS NULL` 守卫，可重复执行 |

**五大验证场景（设计预期）**：
1. 鸡舍→集蛋→包装→packComplete→`completePackagingBatch` 生成 `EGG-YYYYMMDD-*` 可售批次→库存查询可见 ✅
2. 销售订单审批→`reserveInventory`/FIFO 预占（`legacy_source IS NULL`）→配送出库→库存减少 ✅
3. POS 结账→`fifoDeductItems`（`legacy_source IS NULL`）→库存减少 ✅
4. 退货→`completeRestock`/`processReturnInventory`→RETURN 批次回库（可售）✅
5. 追溯：销售单→`allocated_batch_no`→`inv_batches`(packaging_batch_ref/collection_batch_ref)→包装任务→集蛋班次→鸡舍 ✅

---

## 10. 是否达到「唯一库存链路」

**是（Phase 1 范围内）**：
- ✅ 冻结 Farm Egg 库存旁路（写入禁止，历史只读保留）。
- ✅ 包装完成成为唯一库存入口（`completePackagingBatch` 幂等生成可售批次）。
- ✅ Sales V2 成为唯一销售库存体系（FIFO 只认 `legacy_source IS NULL` 的 `EGG-YYYYMMDD-*`）。
- ✅ 批次追溯字段打通（packaging_batch_ref / collection_batch_ref）。
- ✅ 库存不再双重计数（旧闭环批次标 legacy，FIFO 排除；包装中间态与可售批次以 packaging_batch_ref 关联）。

形成闭环：**生产 → 包装 → 库存 → 销售**。

**Phase 2 待办（本期未做，透明记录）**：
- SKU 精确分配（PATH A）：包装产出可选写 `sku_code`（需 SKU 主数据 product_code 与 `PRD-EGG-{grade}` 对齐校验）。
- 退役 `PRD-EGG-*-PACK` 中间态 + `wms_inbound` 旧收货流，改为可售批次直接上架，消除"中间态 + 可售"双表示。
- `EGG-STOCK-*` / `PRD-EGG-*` 历史存量一次性盘点对账与归档。
- 生产实际在用线确认（需生产库诊断 SQL 结果）以决定是否彻底下线 farm-egg/farm-sales 控制器。
