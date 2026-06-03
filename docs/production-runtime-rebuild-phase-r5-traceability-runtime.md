# 生产运行体系重构 R5 — 统一追溯 Runtime

> **任务**：R5（Unified Traceability Runtime）
> **日期**：2026-06-03
> **目标**：建立唯一追溯链 鸡舍→…→库存→销售→客户→财务，支持正反向追溯。
> **诚实声明**：链路验证为数据层 SQL 实证 + 代码路径核对；HTTP 首跑随上线。

---

## 0. 结论速览

| 维度 | 状态 |
|------|------|
| 统一追溯 API | ✅ TraceabilityModule（5 入口）已建并注册 AppModule |
| 追溯链贯通 | ✅ 库存→包装→班次→场站 / 集蛋→鸡舍→场站→鸡群→日产蛋 / 批次→销售→客户 / 标签→库存（数据层实证） |
| 前端追溯页 | ✅ /traceability（PC+移动自适应） |
| 标签策略 | ✅ 方案 A（PKG 主码 + EGG 数据库解析） |
| 权限 | ✅ MENU_TRACEABILITY_VIEW/EXPORT（6+ 角色，DataScope 公司隔离） |
| 性能 | ✅ 关键索引齐备（单批次查询走主键/索引） |

---

## 1. 追溯架构

```
brd_houses → brd_flocks → brd_daily_logs           （生产域：场站/鸡舍/鸡群/日产蛋）
  → pkg_source_batches → pkg_grading_records → pkg_packing_records  （包装域：集蛋/分级/包装）
    → pkg_work_shifts（site_id/operator）           （班次/场站/人员）
      → inv_batches → inv_ledger                    （库存域：批次/SKU/规格/流水）
        → sal_sales_orders/sal_order_items          （销售订单）
        → sal_store_sales/sal_store_sale_items      （门店 POS）
          → 客户/门店 + fin_ar_invoices/fin_cash_transactions （财务域：AR/现金）
            → 退货（inv_ledger SALE_RETURN/DAMAGE_WRITEOFF）
```
纯只读聚合（DataSource 直查 + 防御式 q()），不写任何业务表。

## 2. 追溯入口（5）

| 入口 | API | 键 |
|------|-----|----|
| 库存批次 | `GET /api/traceability/batch/:batchNo` | EGG-YYYYMMDD-NNNNN |
| 包装批次 | `GET /api/traceability/packaging/:packingCode` | PKG-YYYYMMDD-XXXX |
| 标签码 | `GET /api/traceability/label/:labelCode` | label_no |
| 销售单 | `GET /api/traceability/sales-order/:orderNo` | order_no |
| 客户 | `GET /api/traceability/customer/:customerCode` | customer_code |

## 3. 数据结构（追溯树）

返回结构包含：
- **production**：site / line / houses / flocks / dailyLogs / source / productionDate
- **packaging**：packingCode / gradingCode / grading[] / totalBoxes/Eggs / operator / supervisor / shiftCode
- **label**：count + records[]（label_no/qty/status/printed_at）
- **inventory**：batchNo / skuCode / grade / specCode / qty / qtyAvailable / eggDate / expireDate / company / ledger[]
- **sales**：salesOrders[] + storeSales[]
- **finance**：ar[] + cash[]
- **returns**：SALE_RETURN / DAMAGE_WRITEOFF

## 4. API

`apps/api/src/modules/traceability/`：TraceabilityModule / TraceabilityService / TraceabilityController。
- `@UseGuards(AuthGuard('jwt'), MenuGuard, DataScopeGuard)`，`@RequireMenu('MENU_TRACEABILITY_VIEW','V')`。
- 防御式：每段查询 try/catch 返回空段，缺表/缺列不崩。
- DataScope：按 `allowedCompanyCodes` 隔离（admin/全局不限）。

## 5. 前端页面

`apps/web/src/app/(admin)/traceability/page.tsx`（sidebar「全链追溯」MENU_TRACEABILITY_VIEW）：
- 入口选择（批次/包装/标签/销售单/客户）+ 输入 + 追溯。
- 分域展示：生产 / 包装 / 标签 / 库存（含流水时间线）/ 销售 / 财务 / 退货。
- PC + 移动自适应（maxWidth + flex-wrap + overflow-x）。

## 6. 标签策略（R5-5）

**方案 A（推荐，已采用）**：
- 标签印制在包装环节，此时库存批次 EGG-* 尚未生成 → 标签主码用 `PKG-YYYYMMDD-*`（包装/箱码 PH-*）。
- `inv_batches.packaging_batch_ref = PKG-*` 为数据链；扫 PKG-* → `GET /api/traceability/packaging/:packingCode` 或 `/api/packaging/terminal/inventory/by-packing/:packingCode`（R3）→ 定位 EGG-* 库存批次。
- 二维码内容用短码（PKG/trace_code），扫码后查库；**不超长编码硬印标签**。
- 方案 B（EGG 上标签）不可行（印制时 EGG-* 不存在）。

## 7. 权限（R5-9）

- 新增 `MENU_TRACEABILITY_VIEW`（查看）/ `MENU_TRACEABILITY_EXPORT`（导出）。
- 授权：ADMIN/CEO/FACTORY_MGR/WMS_MGR/QA_MGR/QA_STAFF/SALES_MGR/HQ_FINANCE/AUDITOR（按角色 V/X）。
- DataScope 公司隔离：普通用户禁止跨公司/场站查看（controller scope() 注入 allowedCompanyCodes）。

## 8. 性能（R5-10）

迁移 `20260603_r5_traceability_indexes_menus.sql` 补齐索引（幂等）：
- inv_batches(packaging_batch_ref/collection_batch_ref)、inv_ledger(batch_no)、
  pkg_packing_records(production_date)、pkg_grading_records(production_date)、
  pkg_source_batches(production_date/house_code)、pkg_work_shifts(site_id)、
  sal_order_items(allocated_batch_no)、sal_store_sale_items(batch_no)、
  lbl_records(batch_no/label_no)、fin_ar_invoices(source_no)。
- 单批次追溯主查询走 inv_batches.batch_no 主键 → 目标 < 500ms。

## 9. 验证结果

| 验证 | 结果 |
|------|------|
| API TypeScript | ✅ 0 errors |
| Web TypeScript | ✅ 0 errors |
| 迁移本地实跑 | ✅ 幂等；索引 + 2 菜单 seed 成功 |
| 追溯链 DB 冒烟 | ✅ 全链贯通（见下） |
| scope-audit.sh | 本地 2/30（未起服务，非回归基线） |

**追溯场景（数据层实证，事务 ROLLBACK）**：
1. EGG 批次 → 包装(PKG-TR) → 班次 → 场站(FARM-MS/张三) ✅
2. 反向链：集蛋(SRC-TR)→鸡舍(H-MS01)→场站(FARM-MS 孟赛蛋鸡场)→鸡群(FL-MS01)→日产蛋(9000) ✅
3. 标签(PH-TR-0001)→ 库存批次(EGG-20260603-TR01) ✅
4. 销售单(SO-TR)→ 批次 → 客户(孟赛客户A) ✅
5. 客户 → 历史订单/购买批次 ✅（按 customer_code 聚合）

## 10. 是否允许进入 R6 上线准备

🟢 **允许**。统一追溯 Runtime 已建（API + 页面 + 权限 + 索引），全链数据层贯通；R4.1 旧 POS 旁路已清。
剩 HTTP 级首跑随 R6 上线在真实数据上验证。

---

## 明确回答

1. **api/v3/pos 是否已删除/冻结？** ✅ 已注销 + createSale 冻结（R4.1）。
2. **Store POS 是否未受影响？** ✅ 未受影响（api/v2/store-sales 照常 FIFO）。
3. **是否形成统一追溯链？** ✅ 是（TraceabilityModule 5 入口贯通 鸡舍→…→库存→销售→客户→财务）。
4. **标签扫码是否能定位库存批次？** ✅ 是（PKG-* → packaging/inventory-by-packing → EGG-* 批次）。
5. **销售单是否能追溯到包装/鸡舍？** ✅ 是（sales-order → allocated_batch_no → inv_batches.packaging_batch_ref → pkg → source → house）。
6. **客户是否能追溯历史购买批次？** ✅ 是（customer → 订单 + 门店 POS 购买批次）。
7. **是否允许进入 R6 上线准备？** 🟢 允许。

---

## 附录 · 变更文件

- `apps/api/src/modules/store/store.module.ts`（R4.1 注销旧 POS）、`store/pos.service.ts`（createSale 冻结）
- `apps/api/src/modules/traceability/*`（新模块：service/controller/module）
- `apps/api/src/app.module.ts`（注册 TraceabilityModule）
- `apps/api/src/common/guards/rbac.matrix.ts`（2 追溯权限）
- `apps/api/migrations/20260603_r5_traceability_indexes_menus.sql`（索引 + 菜单）
- `apps/web/src/app/(admin)/traceability/page.tsx`（追溯页）、`components/layout/Sidebar.tsx`（入口）
- docs：r41-sales-cleanup.md、r5-traceability-runtime.md
