# 鸡蛋库存漏显日产蛋批次闭环报告（2026-09-08）

## 结论

根因不是 JOIN，也不是分页或排序，而是鸡蛋库存明细把页面默认值 `EGG` 当成精确产品码；日产蛋入库按 ACTIVE SKU 的真实产品码写入 `PRD-EGG-{grade}`。Dashboard 则直接统计 `inv_batches`，所以同一批次进入 KPI、却被明细的 `product_code = 'EGG'` 排除。

修复后，`EGG` 是鸡蛋产品族别名：匹配历史 `EGG` 和规范 `PRD-EGG-*`。批次明细、Dashboard 活跃批次/总可用量、临期列表共用 `AVAILABLE + qty_available > 0 + 未过期 + 鸡蛋产品族 + DataScope 公司范围`。SKU 或产品主数据缺失时仍保留批次，显示名按产品主数据 → SKU 主数据 → 产品码降级。

## 生产只读事实

受控 workflow：`Production Readonly Audit` run `34202508137`。审计器使用连接级 `default_transaction_read_only=on`、`BEGIN TRANSACTION READ ONLY`、最终 `ROLLBACK`，并确认生产 checkout/API/Web revision 都是 `efda39c89e6fd0dc60685fa1c4faaee427bc5eaf`；业务写入数为 0。

- 症状样本 `EGG-20260908-00001`：公司 `COMP-LAO-XINGCHI`，仓库 `LPH_DP_EGG_FARM`，产品 `PRD-EGG-1`，等级 `GRADE_1`，SKU `SKU-1-LOOSE`，可用 100，状态 `AVAILABLE`，到期日 `2026-10-08`。
- 生产最近共有 11 个 `TEMP_PRODUCTION + AVAILABLE + qty_available > 0` 批次；11 个全部因为 `PRODUCT_CODE_FILTER` 被旧明细排除，合计 601 枚。
- LEFT JOIN 前后均为 11 批，`lost_by_left_joins=0`，排除 JOIN 根因。
- 旧线上全表 KPI 为 197 批、814,532.949 枚；旧 `product_code='EGG' + 未过期` 明细集合为 135 批、754,605 枚，差 62 批。这个全库差集还包含非鸡蛋或其他历史编码，因此修复后的权威比较改为鸡蛋产品族内同口径断言。
- 生产存在 SKU 映射缺失的历史日产蛋批次（例如 `EGG-20260825-00001`，产品 `PRD-EGG-GRADE_1`）；它验证了不能用 INNER JOIN 或映射存在性作为展示前提。

审计清单：`scripts/ops/readonly-audits/egg-inventory-batch-visibility-20260908.sql` 与 `.http.json`。

## 代码根因与修复

### 修复前差异

- 页面默认发送 `productCode=EGG`：`apps/web/src/app/(admin)/sales2/inventory/page.tsx` 的 `BatchesTab`。
- Controller 在无 SKU 时也默认 `EGG`：`apps/api/src/modules/sales-v2/controllers/egg-inventory.controller.ts#getBatches`。
- 明细旧逻辑精确过滤 `b.product_code = $N`，并额外排除过期的 AVAILABLE 批次：`EggInventoryService#getAvailableBatches`。
- KPI 旧逻辑不限制产品族、不排除已过期但尚未调度改状态的 AVAILABLE 行，也未应用 CLS DataScope：`EggInventoryService#getDashboardStats`。
- 明细全部是 LEFT JOIN 且无 LIMIT/OFFSET；页面也不做二次过滤，所以不是 JOIN、分页或排序问题。

### 修复内容

- 新增统一 `eggFamilyCondition()`：`EGG OR PRD-EGG-*`。
- 新增统一 `companyScope()`，批次和 KPI 对非全局用户 fail closed，禁止跨公司扩大。
- `getAvailableBatches()` 对页面族别名使用产品族过滤，保留 SKU 精确筛选和其他产品码精确筛选。
- `getDashboardStats()` 的 active/available 与列表严格共享状态、正可用量、有效期、鸡蛋产品族和公司权限口径，并全部参数化公司过滤。
- `getExpiringBatches()` 收口到 AVAILABLE 鸡蛋产品族，不再混入 RETURNED；仍使用同一 DataScope。
- 两个明细查询使用 `COALESCE(product name, SKU name, product_code)`，无映射批次不会静默消失。
- KPI 返回 `expiringWarnDays`，页面不再把动态配置固定写成“≤7天”。

## 其他 Tab 审计

- 临期 Tab：已修复 RETURNED 与产品族口径差异，并与 KPI 共用 DataScope。
- FIFO Tab：分配本身仍按 SKU 或 product/grade 精确匹配，并强制 AVAILABLE、正可用量、未过期、非 legacy；本次不改变库存权威写入与 FIFO 语义。
- 损耗 Tab：发现既有独立缺陷，前端字段名与后端别名不一致（`total_loss/batch_count` 对 `total_qty/record_count`），且“按批次排名”没有按 ledger 聚合；这不是本次漏显根因，也不应和库存可售口径混成一次风险较大的行为变更。另行建项修复。

## 测试与发布证据

- 定向 API Jest：2 suites / 19 tests 全绿（`egg-inventory.service.spec.ts` + `production-inbound.service.spec.ts`）。
- API/Web `tsc --noEmit`：均为 0 error；nullable unique 与 constraint drift 门禁均通过。
- API/Web build：均通过。
- 本机 API 全量 Jest：96 suites / 798 tests 通过；既有 `chanjet-callback.controller.spec.ts` 两个 5 秒超时失败，单独复跑仍同样失败，与本次文件无关。
- 本机 Web 全量 Vitest：103 files / 544 tests 通过；三个既有 React 测试文件共 29 个 `act is not a function` 环境失败，与本次文件无关。远端 CI 使用干净依赖环境，最终状态以下方 CI 为准。
- 定向 Playwright 用例已补充无 SKU 映射日产蛋展示断言；本机 Chromium 因系统缺 `libnspr4.so` 无法启动，未虚报执行通过。
- 冻结/安全边界逐文件复核：只读查询范围被收紧、公司条件改为参数化，未触碰库存写链；PR 登记 `reviewed-frozen-boundary` 与 `reviewed-security-touch`，本地授权 W5 closeout 20/20 PASS。
- PR [#212](https://github.com/ivanzhao299/phoenix-erp-v3/pull/212)：7 项有效检查全部通过；merge revision `63f50985dcc830038c13426e444d9cf1f1e8fff7`。
- full deploy：[run 34204495413](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34204495413) 成功；隔离迁移、双端 typecheck、五组 regression、API/Web 镜像构建与生产部署全部通过。
- 部署后只读复验：[run 34205686485](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34205686485) 确认真实日产蛋批次在 API 中可见、返回 154 批、库存错误窗口 0、业务写入 0。
- 强一致性复验：[run 34205942694](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34205942694) 直接交叉比较两个生产 GET：`activeBatches=154 = list.length=154`，`totalAvailable=757590 = listQty=757590`；checkout/API/Web revision 均为 `63f50985dcc830038c13426e444d9cf1f1e8fff7`，库存错误窗口 0，业务写入 0。

## 不变项

- 未改 `inv_batches` 数据、库存流水、日产蛋入库写入、FIFO 分配或 WMS 权威链路。
- 无 schema 迁移；生产写入只来自既有部署流程。
