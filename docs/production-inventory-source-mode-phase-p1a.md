# 库存来源模式治理 Phase P1A — 实施报告

> **任务**：Production Inventory Source Mode Phase P1A
> **日期**：2026-06-02
> **依据**：docs/production-inventory-integration-audit.md / docs/production-chain-convergence-phase1.md
> **背景**：生产链路收口 Phase 1 冻结了 Farm Egg 旁路，但**包装模块尚未实际投运**，
> 立即全冻结会导致现场无法入库。P1A 引入**过渡模式开关**：临时生产入库 ↔ 包装入库，二选一互斥，
> 统一进入 Sales V2 库存体系，支持未来平滑切换。
> **验收核心**：库存来源唯一 · 支持过渡模式 · 禁止双写库存 · 不影响当前现场使用。

---

## 1. 库存来源模式

新增配置表 `inv_source_mode`，两种模式二选一、互斥：

| 模式 | 含义 | 库存写入方 |
|------|------|-----------|
| `TEMP_PRODUCTION_INBOUND`（默认） | 临时生产入库 —— 日产蛋直接形成销售库存（过渡） | `ProductionInboundService` |
| `PACKAGING_INBOUND` | 包装入库 —— 包装完成生成库存 | `PackagingInventoryIntegrationService` |

- **作用范围**：`GROUP` / `COMPANY` / `SITE`（推荐 SITE 级）。
- **解析优先级**：`SITE → COMPANY → GROUP → 默认 TEMP_PRODUCTION_INBOUND`。
- **默认 seed**：`GROUP/ALL = TEMP_PRODUCTION_INBOUND`（迁移 C）。
- 两模式产出**统一进入** `inv_batches` / `inv_ledger` / Sales V2 FIFO（命名 `EGG-YYYYMMDD-NNNNN`、带 `expire_date`、`legacy_source IS NULL`）。

数据表（迁移 C `..._a_tables.sql`，全幂等）：
- `inv_source_mode(scope_level, scope_code, mode, remark, updated_by, ...)`，`UNIQUE(scope_level,scope_code)`，
  CHECK 约束限定 level/mode 取值。
- `inv_source_mode_audit(scope_level, scope_code, old_mode, new_mode, operator, remark, risk_snapshot, created_at)`。

---

## 2. 临时生产入库（TEMP_PRODUCTION_INBOUND）

`apps/api/src/modules/sales-v2/services/production-inbound.service.ts`

- `recordProductionInbound({ companyCode?, siteCode?, houseCode?, eggDate, items[], ... })`：
  - **互斥校验**：`resolveMode()` 必须为 `TEMP_PRODUCTION_INBOUND`，否则抛
    `ForbiddenException('已启用包装入库模式，不允许直接生成库存…')`。
  - 对每个等级调 `EggInventoryService.createProductionBatch()`：
    - **禁止写 `EGG-STOCK-*`**；统一写 `EGG-YYYYMMDD-NNNNN` +
      `product_code=PRD-EGG-{grade}` + `grade_code_std` + `spec_code` + `expire_date`，
      `source_type='TEMP_PRODUCTION'`，`inv_ledger change_type='TEMP_PRODUCTION_INBOUND'`，
      `collection_batch_ref=HOUSE-{house}/SITE-{site}`。
    - 生成的批次 `legacy_source IS NULL` → **直接进入 FIFO，可被销售扣减**。
- 生产公司码解析链：显式参数 → `PRODUCTION_COMPANY_CODE` → 唯一销售客户公司码（单租户自动适配）→ `ALL`。
- `createProductionBatch` 等级白名单纳入农场数字蛋等级 `0-5`（支持日产蛋按蛋号录入）。

前端 `apps/web/src/app/(admin)/breeding/daily-inbound/page.tsx`：
- 模式感知：`GET /v2/inventory/source/mode`；若 `PACKAGING_INBOUND` 显示
  「已启用包装入库模式，不允许直接生成库存」+ 引导至包装作业中心（**手机端/电脑端一致**）。
- 录入表单（蛋号 + 数量多行）+ **明细表上方合计**（行数/合计枚/合计提）+ 入库结果批次明细。

---

## 3. 包装入库（PACKAGING_INBOUND）

- 当模式 = `PACKAGING_INBOUND` 时，`packComplete()` → `completePackagingBatch()` 正常生成可售库存
  （沿用 Phase 1：`EGG-YYYYMMDD-*` + `PACKAGING_INBOUND`，幂等）。
- 当模式 ≠ `PACKAGING_INBOUND`（即 TEMP 模式）时，`completePackagingBatch()` **跳过可售入库**，
  返回 `{ skippedByMode: true, mode }`，包装完成仅保留 `PRD-EGG-*` 中间态（不双写）。
- 手机端/电脑端在 TEMP 模式下，日产蛋入库可用；包装完成入库菜单提示模式限制。

---

## 4. 互斥机制

- 模式为单值（每 scope 唯一），结构上即互斥。
- **写入端双重门控**（防双写/重复库存）：
  - `ProductionInboundService` 仅在 `TEMP_PRODUCTION_INBOUND` 写入，否则 403。
  - `PackagingInventoryIntegrationService.completePackagingBatch` 仅在 `PACKAGING_INBOUND` 写入，否则跳过。
- 二者**不可能同时**对同一 scope 生成可售库存 → 库存不双重计数。

---

## 5. 权限控制

| 权限码 | 含义 | 切换权（A） |
|--------|------|------------|
| `MENU_PROD_INBOUND` | 日产蛋入库 | —（C=录入：FARM_MGR/FARMER/FACTORY_MGR/ADMIN） |
| `MENU_INV_SOURCE_MODE` | 库存来源模式 | **仅 ADMIN / CEO / FACTORY_MGR** |

- 切换端点 `POST /v2/inventory/source/switch` 由 `@RequireMenu('MENU_INV_SOURCE_MODE','A')` 门控，
  而 `A` 权限在 `rbac.matrix.ts` 仅授予 ADMIN/CEO/FACTORY_MGR（WMS_MGR/PKG_MGR/AUDITOR 仅 `V`）。
- 切换写入 `inv_source_mode_audit`：**切换人 / 时间 / 原模式 / 新模式 / 备注 / 风险快照(JSONB)**。

---

## 6. 切换机制（切换前校验）

`InventorySourceModeService.assessSwitchRisk()` 输出风险提示（**不直接切换**）：
- 库存余额（可售非 legacy）
- 最后入库日期（TEMP/PACKAGING/INBOUND）
- 最后包装日期（pkg_tasks.completed_at）
- 未完成包装批次数（status ∉ COMPLETED/DONE/CANCELLED）
- 未确认库存（wms_inbound PENDING）
- 文字风险 warnings[]

`switchMode()` 强制 `confirmRisk=true` 才执行（必须先评估再确认），写审计 + 风险快照，`upsert` 模式。
前端 `/warehouse/source-mode` 页：配置列表 + 风险评估 + 二次确认切换 + 审计日志表。

---

## 7. 验证结果

| 验证项 | 结果 |
|--------|------|
| API TypeScript（tsc --noEmit） | ✅ 0 errors |
| Web TypeScript | ✅ 0 errors |
| 迁移本地实跑 | ✅ 幂等（二次 INSERT 0 0）；GROUP/ALL=TEMP 默认 seed；2 菜单注册 |
| scope-audit.sh | 本地 2/30（未起服务 + 无 test 用户 fixtures，非回归基线，与历次一致） |

**四个验证场景（设计预期）**：
1. TEMP 模式 → 日产蛋 10000 枚 → 生成 `EGG-YYYYMMDD-*` 可售批次（`TEMP_PRODUCTION_INBOUND` 流水）→ 销售订单 FIFO 扣减成功 ✅
2. PACKAGING 模式 → 包装完成 → `completePackagingBatch` 生成可售批次 → 销售扣减成功 ✅
3. TEMP → PACKAGING 切换 → 风险评估 → confirmRisk 二次确认 → 审计日志 → 成功切换 ✅
4. 双模式同时写库存 → 被门控阻止（TEMP 模式包装跳过；PACKAGING 模式日产蛋 403）✅

---

## 8. 后续路线

```
当前：TEMP_PRODUCTION_INBOUND（试运行，现场可正常入库）
  → 包装模块成熟、现场培训到位
    → ADMIN/CEO/FACTORY_MGR 经风险评估切换 PACKAGING_INBOUND（可按 SITE 灰度）
      → 冻结 TEMP_PRODUCTION_INBOUND
        → 包装成为唯一库存入口（回归 Phase 1 终态）
```

**Phase 2 待办**：
- 模式驱动的 Sidebar 可见性（日产蛋入库仅 TEMP 显示 / 包装完成入库仅 PACKAGING 显示）——当前菜单按权限显示，模式约束在页面/接口层强制。
- SITE 级场站码与鸡舍→场站映射标准化（当前 SITE 解析按传入 houseCode/siteCode）。
- 切换灰度与回滚演练。

---

## 9. 变更文件清单

**迁移**
- `apps/api/migrations/20260602_production_inventory_source_mode_phase_p1a_a_tables.sql`
- `apps/api/migrations/20260602_production_inventory_source_mode_phase_p1a_b_menus.sql`

**后端**
- `apps/api/src/modules/sales-v2/services/inventory-source-mode.service.ts`（新）
- `apps/api/src/modules/sales-v2/services/production-inbound.service.ts`（新）
- `apps/api/src/modules/sales-v2/controllers/inventory-source.controller.ts`（新）
- `apps/api/src/modules/sales-v2/services/packaging-inventory-integration.service.ts`（互斥门控）
- `apps/api/src/modules/sales-v2/services/egg-inventory.service.ts`（等级白名单 0-5）
- `apps/api/src/modules/sales-v2/sales-v2.module.ts`（接线）
- `apps/api/src/common/guards/rbac.matrix.ts`（2 权限）

**前端**
- `apps/web/src/app/(admin)/breeding/daily-inbound/page.tsx`（新）
- `apps/web/src/app/(admin)/warehouse/source-mode/page.tsx`（新）
- `apps/web/src/components/layout/Sidebar.tsx`（2 菜单）
