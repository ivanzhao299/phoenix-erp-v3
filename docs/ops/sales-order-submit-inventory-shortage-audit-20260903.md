# 销售订单提交即报“库存不足”链路核查（2026-09-03）

## 结论摘要

本轮仅核查，未修改业务代码、数据库或生产数据。

1. 报错出现在“提交”并非提前调用了一个独立库存检查，而是正常免审订单在提交事务内直接进入 `APPROVED`，随即执行真实 FIFO 预留；预留失败会使提交、批准状态和已发生的预占一起回滚。
2. 需审批订单在最后一步审批通过时执行同一预留。两条路径的统一业务时点其实都是“订单进入 `APPROVED`”，只是免审订单的批准发生在提交动作内，所以用户看到报错的按钮不同。
3. Sales V2 FIFO 当前不按订单指定仓、门店仓或当前用户 `WarehouseScope` 查库存，而是按订单 `company_code` 扫该公司全部仓。它还严格过滤 `AVAILABLE`、`qty_available > 0`、未过期、`legacy_source IS NULL`；有 `sku_code` 时只走 SKU 精确匹配。
4. 2026-09-03 生产只读证据显示，目标 SKU `CJ-EGG-8E82312ECAD7` 并非全局缺货：`COMP-LAO-XINGCHI` 的会晒销售仓存在一条完全满足 FIFO 静态条件的批次，可用量为 998 枚。故“所有库存均不足”不成立。
5. 本次受控生产清单没有取得用户失败订单的 `order_id/order_no/company_code`，也不知道用户尝试的第二个 SKU，不能把“订单公司与库存公司不一致”从高概率线索写成既定根因。若失败订单公司正是 `COMP-LAO-XINGCHI`，现有证据下该 SKU 的 1 枚预留应成功，必须继续核对失败发生时的订单快照和并发状态。
6. 暂不建议改 FIFO 条件或把硬预留后移。先补一次精确只读复验，锁定失败订单公司与逐条件计数；若证实公司漂移，修上游订单/仓库公司归属。业务语义上建议继续以 `APPROVED` 为硬预留点，并改善前端提示与仓库可见性。任何实施均等待用户确认。

## A. 代码链路

### A1. 提交、审批判定与免审预留

- API 入口：`apps/api/src/modules/sales-v2/controllers/sales-orders.controller.ts:65-70` 的 `submit()` 调用 `SalesOrdersService.submit()`。
- `apps/api/src/modules/sales-v2/services/sales-orders.service.ts:554-613`：仅 `DRAFT` 可提交；先做客户信用评估，再以 `below_floor_price` 和信用结果计算 `needApproval`，触发码为 `BELOW_FLOOR_PRICE` / `CREDIT_OVER_LIMIT`。
- 同文件 `:618-729`：提交主体位于同一个 `DataSource.transaction` 中。
  - `needApproval=true`：调用 `ApprovalEngineService.startApproval()`；有有效规则和步骤时订单进入 `PENDING_APPROVAL`，此时不预留。
  - `needApproval=false`：订单由 `DRAFT` 直接转 `APPROVED`，写 `AUTO_APPROVED_NOT_REQUIRED`，立即调用 `eggInventory.reserveInventory(...)`，成功后写 `INVENTORY_RESERVED`。
- `apps/api/src/modules/approval-engine/approval-engine.service.ts:313-348`：需要审批但无匹配规则/无步骤时，只有显式开启 `workflow.fail_open_enabled=true` 才自动批准并调用注册的 `onApproved`；否则提交报错，不会静默放行。
- `apps/api/src/modules/sales-v2/services/sales-orders.service.ts:43-51,738-760`：销售订单的 `onApproved` 注册为 `approveCallback()`；回调写 `APPROVED` 事件后调用同一个 `reserveInventory()`。

### A2. 有规则路径的预留时点

- `apps/api/src/modules/approval-engine/approval-engine.controller.ts:66-75`：审批入口为 `POST /api/approval/instances/:id/approve`。
- `apps/api/src/modules/approval-engine/approval-engine.service.ts:614-671`：`approveStep()` 在事务内锁定实例和当前步骤；只有最后一步通过才把实例和业务单据更新为 `APPROVED`，然后调用 `onApproved`。中间步骤不预留。
- `SalesOrdersService.approveCallback()` 最终调用 `EggInventoryService.reserveInventory()`（`sales-orders.service.ts:738-760`）。

设计语义并非“同一检查随意放在两个时点”，而是统一在状态进入 `APPROVED` 时做真实预留：免审订单在提交时即批准；需审批订单在最后一步审批时批准。因此前者在“提交”按钮上暴露库存错误，后者在“批准”按钮上暴露。

### A3. 事务与回滚

`reserveInventory()` 逐明细调用 FIFO。库存不足时 `allocateByFIFO()` 抛 `ConflictException`（`apps/api/src/modules/sales-v2/services/egg-inventory.service.ts:545-553`）。提交或审批通过的状态变更、生命周期事件和预留共用调用方传入的 `EntityManager`，异常使整个事务回滚，不会留下半批准或半预占。真实 PG 原子性测试入口见 `apps/api/src/modules/approval-engine/sales-order-approval.pg.integration.spec.ts:86-109`，但现有 fixture 未覆盖真实 FIFO 明细。

### A4. FIFO 精确条件与仓范围

`EggInventoryService.allocateByFIFO()` 位于 `apps/api/src/modules/sales-v2/services/egg-inventory.service.ts:433-556`。候选 SQL（`:457-490`）等价于：

```sql
SELECT *
FROM inv_batches
WHERE company_code = :order_company
  AND status = 'AVAILABLE'
  AND qty_available > 0
  AND (expire_date IS NULL OR expire_date >= CURRENT_DATE)
  AND legacy_source IS NULL
  AND sku_code = :item_sku                 -- 有 SKU 时 PATH A
-- 或 product_code=:product [AND quality_grade=:grade] -- 无 SKU 时 PATH B
ORDER BY expire_date ASC NULLS LAST, created_at ASC
FOR UPDATE;
```

选中批次后，更新还会复核 `batch_no/company_code/warehouse_code/status/qty_available/expire_date/legacy_source`（`:501-519`），再写 `inv_ledger.change_type='RESERVED'`（`:521-533`）。不足错误中的“缺少 1 个单位”是 `remaining`，即所有候选分配后仍未满足的数量，不代表全库物理数量为零。

仓范围结论：

- 方法参数没有 `warehouseCode`；候选 SELECT 没有 `warehouse_code` 条件。
- 没有读取 CLS `dataScope`，也没有 `allowedWarehouseCodes`。
- UPDATE 的 `warehouse_code=$4` 来自已选批次，仅是并发/归属复核，不是选仓过滤。
- 因此范围是订单公司的所有仓，不是公司外全域、不是用户 WarehouseScope，也不是订单指定仓。

该遗留项在 `docs/ERP_BUSINESS_AGENT_AUDIT.md:121-125,181-187` 已有记录；当前代码确认仍未实施。

## B. 生产只读取证

### B1. 执行边界

- GitHub Actions：`Store POS Inventory Shortage Readonly Audit`
- Run：`33701031637`
- 执行时间：2026-09-03 00:48 UTC
- 只读保护：`transaction_read_only=on`
- 生产 checkout / API / Web revision：均为 `0c178867b746a1e269a3ddb76f2afab2d45e43c6`
- 工作流结论：成功；无生产写入。

该现有受控清单正好覆盖目标 SKU 和此前会晒批次，但不是为本次销售订单动态参数化的专用清单。

### B2. 目标 SKU 批次实值

生产返回两条会晒销售仓记录：

| batch_no | company | warehouse | status | qty | qty_available | expire_date | legacy_source | FIFO 结果 |
|---|---|---|---:|---:|---:|---|---|---|
| `IBN-20260828-VW1SSC` | `COMP-LAO-XINGCHI` | `ST_LAO_XINGCHI_HS_001_SALES` | `AVAILABLE` | 1000 | 998 | NULL | NULL | 若订单公司相同，则满足全部静态 WHERE |
| `RET-POS-20260828-00014-1` | `COMP-LAO-XINGCHI` | `ST_LAO_XINGCHI_HS_001_SALES` | `QUARANTINE` | 2 | 2 | NULL | NULL | 被 `status='AVAILABLE'` 排除 |

由此可确认：目标 SKU 至少在 `COMP-LAO-XINGCHI` 有 998 枚正可用量；会晒仓“真实有货”成立。旧 POS 公司漂移已修正：第一条批次公司当前也是 `COMP-LAO-XINGCHI`，不再是历史的 `ALL`。

### B3. 逐条件判断与证据缺口

对批次 `IBN-20260828-VW1SSC`：

| FIFO 条件 | 实值 | 判断 |
|---|---|---|
| `sku_code = item.sku_code` | `CJ-EGG-8E82312ECAD7` | 匹配目标 SKU |
| `status='AVAILABLE'` | `AVAILABLE` | 通过 |
| `qty_available > 0` | 998 | 通过 |
| 未过期 | `expire_date=NULL` | 通过 |
| `legacy_source IS NULL` | NULL | 通过 |
| `company_code = order.company_code` | 批次为 `COMP-LAO-XINGCHI`；失败订单公司未取到 | **待定，唯一未闭合条件** |

现有清单没有按该 SKU 汇总所有公司/所有仓，也没有取得本次失败订单。因此不能声称上述两行就是全域全部记录，不能确认用户第二个 SKU，也不能将公司不匹配定案。它足以否定“目标 SKU 全局真实库存不足”，不足以定位具体失败订单。

下一次只读复验必须以失败订单 ID 或订单号为锚点，同时返回：订单公司及状态、明细 SKU/数量、该 SKU 按公司/仓/状态的总量、与代码完全相同 WHERE 的候选量，以及逐个去掉 `company/status/expiry/legacy/SKU` 条件后的计数。若同一订单已因事务回滚仍为 `DRAFT`，可直接查询该订单及明细；无需重放提交。

## C. 业务合理性评估

| 方案 | 防超卖 | 审批语义 | 库存占用可见性 | 与 `confirmOutbound` 一致性 | 评价 |
|---|---|---|---|---|---|
| a. 保持 `APPROVED` 即硬预留 | 强；批准即承诺货物 | 两条路径统一按 `APPROVED` | `qty_available` 与 `RESERVED` ledger 可见 | 装车只扣 `qty`，与先扣可用量配套 | 当前最一致；提交按钮需明确“免审即批准并锁库存” |
| b. 统一延后至审批后/装车 | 若指审批后，现状已经如此；若延至装车，批准单之间可超卖 | `APPROVED` 不再代表可履约 | 批准到装车之间无占用 | 装车时才争抢库存，可能到现场失败 | 不建议笼统后移；除非新增独立分配状态和缺货队列 |
| c. 提交只软校验，硬预留延后 | 软校验存在并发窗口，不能防超卖 | 免审批准却未锁货，与有规则路径不一致 | 提示不是占用，用户易误解 | 装车/后续硬预留仍可能失败 | 可作为草稿提示增强，不能替代 `APPROVED` 的原子预留 |

补充：草稿和待审批订单当前不占库存；只有进入 `APPROVED` 才占用，所以“审批单/草稿也占库存”的争议不符合现状。取消 `APPROVED/ALLOCATED` 订单会释放 `qty_available`（`sales-orders.service.ts:800-831`；`egg-inventory.service.ts:601-669`）。配送完成装车时 `confirmOutbound()` 扣物理 `qty` 并写 `FIFO_OUT`，不再扣 `qty_available`（`egg-inventory.service.ts:674-741`；`delivery-orders.service.ts:371-410`）。

## D. 推荐方案与测试计划

### D1. 本轮建议（待用户确认后才实施）

推荐保持“进入 `APPROVED` 的同一事务内硬预留”这一核心语义，不因错误出现在提交按钮就直接取消预留。当前更像是库存归属上下文不可见或不一致，而非库存总量真的不足。

实施前先完成一次精确只读复验：

1. 由用户提供失败订单号/ID；若能复现，也记录第二个 SKU。
2. 核对订单 `company_code` 与目标仓权威 `wms_warehouses.company_code`。
3. 用同款 FIFO WHERE 计算候选量，并输出逐条件排除量。
4. 只有证据闭合后选修复分支：
   - 若订单/库存公司漂移：修生成订单或入库时的公司权威来源及存量目标数据，不放宽 `company_code` 条件。
   - 若批次被错误状态、效期或 `legacy_source` 排除：修产生错误字段的上游写入；真实隔离/过期/legacy 库存不得直接纳入销售。
   - 若同公司同 SKU 候选量确实不足：判定库存检查正确，仅决定是否增加草稿软提示；仍建议批准时硬卡。
   - 若所有条件均通过仍失败：检查失败瞬间并发预占、事务隔离和订单实际明细快照，不先改 SQL。

产品体验可独立改善：提交确认文案显示“该订单无需审批，提交将自动批准并锁定库存”；库存不足响应同时展示订单公司、SKU、需求量和该公司可分配量（不泄露越权仓明细）。若业务要求指定履约仓，应先在订单/配送模型中明确仓库归属，再将其作为 FIFO 参数并校验 WarehouseScope；不能简单用当前操作者 WarehouseScope 隐式缩窄，否则审批人不同会改变同一订单的库存结果。

### D2. 修复后的测试计划

1. `sales-orders.service.spec.ts`：覆盖免审提交调用预留、需审批提交不预留、最后一步批准才预留、无规则 fail-open 回调只预留一次、预留失败整单回滚。
2. `egg-inventory.service.spec.ts`：覆盖 SKU PATH A、旧 product/grade PATH B、公司/状态/效期/legacy 条件、单批/多批 FIFO、并发更新冲突和不足回滚。
3. 新增真实 PG 集成测试：订单明细 + 两个批次，验证提交/批准、`qty_available`、allocated 字段和 `RESERVED` ledger 原子一致；再走 `finishLoading()` 验证 `qty` 与 `FIFO_OUT`。
4. 若引入履约仓：测试指定仓、无权仓、跨公司仓、未指定仓的明确行为，且同一订单由不同审批人操作结果不应随个人 WarehouseScope 漂移。
5. 生产只读回归：目标订单逐条件 FIFO 断言、无负 `qty_available`、预留 ledger 与订单 allocated 总量一致；确认全程 `transaction_read_only=on`。

## 核查边界

- 未修改代码、配置、schema、数据或审批规则。
- 未重放用户提交，未执行生产写操作。
- 未获知第二个 SKU，报告不虚构其库存。
- 在取得失败订单标识并完成精确只读复验前，本报告不授权任何修复。

## E. 修复执行记录（2026-09-03）

用户已补充失败订单锚点 `SO-20260903-00004`，订单公司为 `COMP-LAO-AGRI`，并确认保持 `APPROVED` 硬预留语义。

本轮实施：

1. FIFO 公司隔离、状态、效期、legacy 与 SKU 条件均未放宽；预留时点仍为订单进入 `APPROVED` 的事务内。
2. 库存不足响应新增订单公司、SKU（或旧 product/grade）、需求量和该公司可分配量；不返回批次号或仓库明细。
3. 订单提交增加确认框，明确“免审提交会自动批准并锁定库存；需审批订单在最终批准时锁定库存”。
4. 新增订单锚点只读清单 `scripts/ops/readonly-audits/sales-order-shortage-so-20260903-00004.sql`，覆盖订单快照、明细、公司×仓×状态分布、完整 FIFO WHERE、逐个去掉 company/status/expiry/legacy 的变化，以及 XINGCHI 998 枚候选断言。
5. 草稿软库存提示未实施：现有批次查询属于库存菜单权限，销售订单用户未必可访问；在没有订单域聚合接口的前提下接入会造成越权或逐行 lookup。

本地验证与生产执行结果见后续提交记录。生产定案必须以受控 `production-readonly-audit` 输出为准；在清单运行前，不把 AGRI 候选量为 0 或 XINGCHI 998 为唯一大宗写成已证实事实。

本地执行结果：

- API TypeScript：0 errors。
- Web TypeScript：0 errors；Vitest 全量 102 files / 526 tests PASS。
- 销售订单 + FIFO 定向 Jest：2 suites / 15 tests PASS。
- 真实 PostgreSQL 审批/FIFO/装车集成：3 tests PASS；双批次预留与 `finishLoading()` 的 `RESERVED` / `FIFO_OUT` 数量断言通过。
- API Jest 全量：87 suites / 722 tests PASS，1 suite / 2 tests FAIL；失败为既有 `chanjet-callback.controller.spec.ts` 两个镜像收敛测试固定 5 秒超时，隔离重跑仍复现，与本次销售改动无关。
- 生产只读清单输入校验：PASS；实际生产结果待部署后受控通道回填。

### E1. 部署后生产只读定案

- PR：`#168`；merge revision：`50f720c5bad80fa03ecc78780b9756b0a7239d47`。
- full 部署：GitHub Actions run `33702924205`，成功。
- 生产只读审计：run `33703823528`；checkout / API / Web revision 均为 `50f720c5bad80fa03ecc78780b9756b0a7239d47`；SQL 在 `READ ONLY` 事务内执行并 `ROLLBACK`，`PRODUCTION_BUSINESS_WRITES=0`。
- 订单快照：`SO-20260903-00004`，`company_code=COMP-LAO-AGRI`，`status=DRAFT`；单条明细 `sku_code=CJ-EGG-8E82312ECAD7`、`product_code=EGG`、`grade_code=CJ_G1`、需求量 `1.00`、已分配量 `0.00`。
- 完整 FIFO WHERE：AGRI 候选批次数 `0`、可分配量 `0`。
- 逐条件变化：仅去掉 `company_code` 后变为 `1` 批、`998.000` 可分配；分别去掉 status / expiry / legacy 后仍为 `0`。
- 全域批次分布仅返回 XINGCHI 会晒销售仓两批：`AVAILABLE 998.000` 与 `QUARANTINE 2.000`；其中 `IBN-20260828-VW1SSC` 的 998 枚是唯一满足静态 FIFO 条件的大宗。
- 错误窗口：生命周期 process-log 近 60 分钟错误数 `0`。审计 application context 启动时仍有既有初始化代码尝试 DDL/DML，但均被只读事务拒绝，没有生产业务写入。

最终定案：库存检查行为正确。失败源于订单公司 AGRI 与现存合格库存公司 XINGCHI 不同，不是 AGRI 批次被 legacy、过期或状态条件误排。本轮保持公司隔离和 `APPROVED` 硬预留，不新增跨公司调拨；若 AGRI 确需销售 XINGCHI 库存，应另立跨公司交易/调拨流程。
