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

## 损耗 Tab 独立缺陷闭环（2026-09-08）

### 字段契约与根因

- 前端 `LossAnalysis` 在 `apps/web/src/app/(admin)/sales2/inventory/page.tsx:58-75` 声明并读取 `byType[].total_loss/batch_count`、`byBatch[].total_loss/last_event`、`summary.total_expire_loss/total_damage_loss/total_loss`；页面消费点为同文件 `:973-1024`。
- 修复前后端 `EggInventoryService#getLossAnalysis` 只返回 `byType[].total_qty/record_count`、`summary.expire_total/damage_total/write_off_total/total_records`；`byBatch` 更是直接读取 `inv_batches` 的过期/核销状态，没有返回损耗量或最后事件时间。
- 仓库全量检索确认 `/api/v2/sales/inventory/loss-analysis` 只有该 Tab 消费；`/api/v2/sales/analytics/loss-analysis` 是另一份报表契约，不受本次修改影响。为兼容潜在仓外消费者，修复选择后端双发：保留旧别名，同时增加前端既有字段。

### 生产只读事实与冻结口径

- 修复前通过受控 `Production Readonly Audit` run `34208909531` 导出；checkout/API/Web revision 均为 `15e9fad634c7ed6bf286e09376d89b2d7e62c204`，SQL 在只读事务中执行并最终 `ROLLBACK`，`PRODUCTION_BUSINESS_WRITES=0`。
- 最近 30 天 `inv_ledger` 的候选损耗实际只有 `EXPIRE_WRITEOFF`：26 条、26 批、绝对数量 330，26 条均为负数。公司分布为 `COMP-LAO-AGRI` 2 批/180、`CSCS` 1 批/1、历史占位 `ALL` 23 批/149；没有 `LOSS`、`WRITE_OFF`、`DAMAGE_WRITEOFF`、`QC_REJECT`、`EGG_WRITE_OFF`、`STOCKTAKE_DOWN` 或 `INBOUND_BROKEN` 的近 30 天样本。
- 最大样本为 `EGG-20260725-00001`：`EXPIRE_WRITEOFF` 1 条、120 枚、公司 `COMP-LAO-AGRI`；生产当时没有同批次多流水样本，因此多流水合并由定向单测构造防回潮。
- 口径沿用库存损耗接口原有四类 `EXPIRE_WRITEOFF / DAMAGE_WRITEOFF / WRITE_OFF / QC_REJECT`，统一按 `ABS(qty_change)` 汇总。没有把隔离入库 `INBOUND_BROKEN`、盘亏 `STOCKTAKE_DOWN`、WMS 报损 `LOSS` 或旧链路 `EGG_WRITE_OFF` 擅自并入，未改变 ledger 语义。

### 修复

- `EggInventoryService#getLossAnalysis` 现在从 `inv_ledger` 按 `company_code + batch_no` 聚合，`SUM(ABS(qty_change)) AS total_loss`、`MAX(created_at) AS last_event`，再以 LEFT JOIN 补充产品/SKU；不再拿 `inv_batches.status` 冒充损耗排名。
- `byType.batch_count` 使用 `COUNT(DISTINCT batch_no)`，旧 `record_count` 仍表示流水条数；`summary.total_loss` 覆盖上述四类，过期与破损分项继续单列。
- 公司过滤复用批次、Dashboard、临期 Tab 的 `companyScope()`：显式公司参数化为 `ANY($1)`；越权公司或空权限 fail closed；全局范围不加公司条件。历史 `company_code=ALL` 不会绕过普通用户 DataScope。
- 新增生产复验清单 `scripts/ops/readonly-audits/egg-inventory-loss-analysis-20260908.http.json`：断言新旧字段完整、按批次 API 数量与只读 SQL 聚合样本一致，并检查 60 分钟损耗接口错误窗口。事实 SQL 保存在 `scripts/ops/readonly-audits/egg-inventory-loss-facts-20260908.sql`。

### 测试与发布证据

- 定向 Jest：`egg-inventory.service.spec.ts` 15/15 通过；新增契约双发、多 ledger 同批次合并 SQL、DataScope 与越权 fail-closed 断言。
- API/Web `tsc --noEmit`：均为 0 error。
- API 全量 Jest：96 suites / 801 tests 通过；既有 `chanjet-callback.controller.spec.ts` 两个 5 秒超时失败，与上轮闭环结果一致，且定向损耗测试单独全绿。
- Web 全量 Vitest：103 files / 544 tests 通过；三个既有 React 测试文件共 29 个 `act is not a function` 环境失败，与上轮闭环结果一致，本次未改 Web 运行时代码。
- nullable unique 与 constraint drift 门禁均通过；生产审计 runner/SQL/HTTP manifest 本地校验通过。
- CI、PR、full deploy、最终 revision、部署后生产只读 API/聚合样本/错误窗口证据在本节发布完成后追加。
