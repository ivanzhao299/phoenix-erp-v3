# 门店 POS“库存不足”误报闭环（2026-08-28）

## 结论

生产批次 `IBN-20260828-VW1SSC` 的 SKU、仓库、状态、可用量、有效期和 legacy 标记均满足 POS FIFO；唯一不满足的是公司条件。通用入库确认没有写 `company_code`，数据库默认成 `ALL`，而销售单公司为 `COMP-LAO-XINGCHI`，因此 POS 的 `company_code = $2` 精确条件将 1000 枚真实库存全部排除。

本次不放宽 POS 可售条件、不改变库存台账语义。修复在统一入库入口从目标仓权威带出公司，同时写入正常/破损批次及台账；已有目标批次已按批准范围通过带严格前后置断言的单批修正脚本完成生产修正。

## 生产只读取证

审计运行：GitHub Actions `Store POS Inventory Shortage Readonly Audit`，run `33139418945`，事务 `transaction_read_only=on`。

- 生产 checkout / API / Web revision：`11ea8ba7ad36fde5b59cf65ae06de2d0e8c4c31c`。
- 批次：`IBN-20260828-VW1SSC`，`sku_code=CJ-EGG-8E82312ECAD7`，`warehouse_code=ST_LAO_XINGCHI_HS_001_SALES`，`status=AVAILABLE`，`qty_available=1000.000`，`expire_date=NULL`，`legacy_source=NULL`，`location_code=INBOUND-DOCK`，`store_code=ALL`，`company_code=ALL`。
- 入库台账：`ref_no=INB-20260828-9JPE`，`change_type=PRODUCTION_INBOUND`，`business_type=PRODUCTION`，`qty_change=1000.000`，同样为 `company_code=ALL`。
- 失败销售：`POS-20260828-00003/00004/00005`，均为会晒直营店、`company_code=COMP-LAO-XINGCHI`、未支付 OPEN；同一 SKU 请求量分别为 2、5、5。
- 仓交集：会晒直营店 SALES 绑定为 `ST_LAO_XINGCHI_HS_001_SALES`，ACTIVE 且在有效期；仓绑定不是根因。
- `amei`：ACTIVE，门店 `STORE-HS-001`，主组织范围为该门店；没有额外仓记录不代表无仓权限，仓权限由组织范围展开后与门店绑定求交。
- `sys_error_logs` 与容器日志未记录这次 409 的完整缺量文本；业务异常返回给前端，但当前错误采集没有留下对应记录。销售单 OPEN/UNPAID 与用户实测时间形成旁证。

## 逐条件对账

POS SKU FIFO 位于 `apps/api/src/modules/store-pos/services/store-pos.service.ts` 的 `fifoDeductItems()`：

| 条件 | 生产值 | 结果 |
|---|---|---|
| `sku_code = $1` | 两侧均 `CJ-EGG-8E82312ECAD7` | 通过 |
| `company_code = $2` | 批次 `ALL`；销售 `COMP-LAO-XINGCHI` | **排除** |
| `warehouse_code = ANY($3)` | 会晒销售仓在 SALES 绑定/有效仓交集中 | 通过 |
| `status = 'AVAILABLE'` | `AVAILABLE` | 通过 |
| `qty_available > 0` | 1000，请求最大 5 | 通过 |
| 未过期 | `expire_date=NULL` | 通过 |
| `legacy_source IS NULL` | `NULL` | 通过 |

`IBN-` 不是调拨签收批次：它由 `WmsService.confirmInbound()` 在通用入库未给批次号时生成。本次台账 `PRODUCTION_INBOUND` 也证明来源是生产类通用入库；标准调拨签收批次后缀为 `-T-XXX`。

## 根因修复

- `confirmInbound()` 对每条目标仓查询 `wms_warehouses.company_code`，缺失或 `ALL` 时 fail closed。
- 正常 AVAILABLE 批次、破损 QUARANTINE 批次以及两类 `inv_ledger` 均显式写入权威公司。
- 同批次再次入库时，真实跨公司冲突直接拒绝；仅允许把历史 `NULL/ALL` 公司归属收敛为目标仓公司。
- POS FIFO 仍只消费同公司、有效门店仓、AVAILABLE、正可用量、未过期、非 legacy 批次。

## 回归与同类风险

红测先证明旧代码的入库参数缺少 `COMP-LAO-XINGCHI`；修复后 WMS 测试 24/24 通过，POS 原子性与 V1-2 契约合计 6/6 通过。fixture 保留了本次事故的“目标仓公司必须进入批次和台账”契约。

同类消费路径结论：

- Sales V2 FIFO 同样强制公司条件，因此通用入库产生的 `ALL` 批次也存在同款误报；本次上游修复同时封堵。
- WMS 自动出库/补货的过滤比 POS 宽，部分路径缺公司、过期和 legacy 条件；显式批次出库还缺完整可售状态检查。这是既有独立风险，不应通过放宽 POS 解决，需另阶段统一库存消费策略。
- 标准调拨复制源批次公司字段；若源头是历史 `ALL`，目标也可能延续漂移。只读审计工作流新增 `GENERIC_INBOUND_COMPANY_DRIFT` 清单用于界定存量范围。

生产扩大审计共发现 9 条 `IBN-*` 批次公司与仓公司不一致，其中 6 条为养殖场入库、1 条为本次门店入库、2 条为历史 `ALL` 源批次派生的调拨目标批次。本次不批量修正其余 8 条；需按各自业务状态、SKU 身份与流水逐条建立前置断言后另批处理。

## 生产数据修正三段式（已执行）

脚本：`scripts/ops/fix-pos-batch-company-ibn-20260828-vw1ssc.sql`。

1. 前置断言：目标批次/SKU/仓/状态/数量仍与取证一致；目标仓公司仍为 `COMP-LAO-XINGCHI`；且恰好存在一条对应 `INB-20260828-9JPE` 入库台账。
2. 原子变更：仅把目标 `inv_batches` 与对应入库 `inv_ledger` 的 `company_code` 从 `ALL` 改为 `COMP-LAO-XINGCHI`。
3. 后置断言：批次可用量和状态未变，批次公司与仓公司一致；任何断言失败都会终止并回滚。

## 修正执行记录

- 执行通道：GitHub Actions `Fix POS Batch Company IBN-20260828-VW1SSC`，production environment，run `33141550147`，结论 `success`；执行工件来自 commit `766dd270d9c8ff29406b3222eb9c56c31a13bf90`。远端应用 checkout 仍为 `df91dc9f169e005581e8844a65e10ee47bce3739`，本次由 workflow checkout 后编码传入经审查 SQL，不依赖远端代码部署。
- 前置断言：目标批次唯一且 `sku=CJ-EGG-8E82312ECAD7`、仓 `ST_LAO_XINGCHI_HS_001_SALES`、公司 `ALL`、状态 `AVAILABLE`、可用量 `1000.000`；目标仓公司 `COMP-LAO-XINGCHI`；对应 `INB-20260828-9JPE`、公司 `ALL`、数量变化 `1000.000` 的台账恰好一条。断言块返回 `DO`，全部通过。
- 原子变更：单事务内两条窄谓词 `UPDATE ... RETURNING` 各返回 1 行后 `COMMIT`。批次返回 `IBN-20260828-VW1SSC / CJ-EGG-8E82312ECAD7 / ST_LAO_XINGCHI_HS_001_SALES / COMP-LAO-XINGCHI / AVAILABLE / 1000.000`；台账返回 `IBN-20260828-VW1SSC / INB-20260828-9JPE / COMP-LAO-XINGCHI / PRODUCTION_INBOUND / PRODUCTION / 1000.000`。脚本只对两行的 `company_code` 赋值，没有改数量、状态或其他字段。
- 后置断言：两张临时 `RETURNING` 结果表计数均为 1；批次仍为 `AVAILABLE / 1000.000`，公司与仓公司一致；对应台账仍为 `PRODUCTION_INBOUND / PRODUCTION / 1000.000`。全部通过后才提交。
- 独立只读复核：同一 run 在提交后另开 `transaction_read_only=on` 事务。目标批次的 SKU、公司、仓库、AVAILABLE、正可用量、未过期、非 legacy 七项 FIFO 条件全部为 `true`；`amei` 为有效用户，门店 `STORE-HS-001` 的目标 SALES 绑定与目标仓均 ACTIVE。运行时只读验收 run `33141585252` 进一步确认 `amei` 的 8 个授权仓包含目标仓，门店上下文唯一且 `salesWarehouse=true / warehouseScopeIntersection=true`。
- 待支付销售单：`POS-20260828-00003/00004/00005` 均保持 `status=OPEN`、`payment_status=UNPAID`、`paid_amount=0.00`，未执行支付或成交。
- 漂移清单：`IBN-20260828-VW1SSC` 已不在 `GENERIC_INBOUND_COMPANY_DRIFT`；独立查询返回其余 8 行，断言 `drift_count=8 / target_drift_count=0` 通过，其余批次未修正。
- 回滚留档：`scripts/ops/rollback-pos-batch-company-ibn-20260828-vw1ssc.sql`。该脚本只用于本案补偿，执行前同样要求批次和台账各精确命中一行；本次未执行回滚。

真实成交或支付不在本次授权范围内，未执行。

## 后续 409“批次可用量已变化”闭环

### 根因与生产取证

公司修正后的只读审计 run `33142029536` 及扩展复核 run `33142232826` 确认目标批次键 `(IBN-20260828-VW1SSC, ST_LAO_XINGCHI_HS_001_SALES)` 恰好一行（id 2893）、`qty_available=1000.000`，公司已是 `COMP-LAO-XINGCHI`，`store_code=ALL` 未变；三笔旧单 `POS-20260828-00003/00004/00005` 仍为 OPEN/UNPAID。用户随后新建了 `POS-20260828-00006` 至 `00013` 八张 OPEN/UNPAID 单，说明本次报错不是只重试旧三单。所有新旧明细的 `batch_no` 都是 NULL，allocation、现金流水、门店 payment record 均为 0 行；schema 也没有预留、version 或创建时批次快照字段。批次数量始终为 1000，符合支付事务在 409 后完整回滚。

确切抛出点是 `StorePosService.fifoDeductItems()` 的条件扣减守卫。它不含 `store_code` 条件：候选批次已按 SKU、公司、授权仓、AVAILABLE、正可用量、有效期及非 legacy 选出并 `FOR UPDATE`，再按 `batch_no + warehouse_code + qty_available >= canTake` 更新。因此 `store_code=ALL` 不是这次 409 的触发字段。

真正缺陷是 TypeORM 0.3 PostgreSQL raw UPDATE 的返回契约：`EntityManager.query('UPDATE ... RETURNING')` 返回 `[[returningRows], affectedCount]`。成功更新一行时外层数组长度是 2；旧代码却用 `changed.length !== 1` 判断，因而每次成功扣减都误报“批次可用量已变化”，随后事务回滚。现金、赊销、混合支付完成以及退货状态更新的四个同类守卫也有相同误判。

### 修复与回归

- 五个条件 UPDATE 均改为原子 CTE：`WITH changed AS (UPDATE ... RETURNING ...) SELECT ... FROM changed`。数据库最终命令为 SELECT，TypeORM 返回纯行数组，现有 `length === 1` fail-closed 守卫语义不变。
- 红测先用真实 PostgreSQL raw UPDATE 形态 `[[{ batch_no }], 1]` 复现成功扣减仍抛 409；修复后以 CTE 纯行结果通过。
- 增加旧 OPEN 单专项 fixture：即使明细带修正前批次值，支付时仍只使用当前 FIFO 候选批次，不读取旧快照。
- `store-pos-atomicity` 与 `store-pos-v1-2.contract` 合计 9 项通过；完整验证与部署 revision 记录在下方部署段落。

### store_code 与同类路径结论

门店 POS 当前以 `store_warehouse_bindings` 的 SALES 仓交集隔离库存，不按 `inv_batches.store_code` 过滤；因此本案无需、也不应为通过支付而修正目标批次的 `store_code=ALL`。不过 WMS 调拨签收会复制源批次 `store_code`，门店补货也没有把目标门店传入调拨；这会延续 `ALL`，属于独立的批次归属治理问题。

调拨、WMS 出库、Sales V2 预占/释放/出库存在另一类风险：多处条件 UPDATE 只按 `batch_no` 且不检查影响行数。它们不会触发本次 TypeORM 长度误判（因为根本没有同款守卫），但需要后续统一补齐公司/仓/数量条件与受影响行数契约；本次未放宽或改动库存台账语义。

### CI、部署与上线后只读复核

- PR [#128](https://github.com/ivanzhao299/phoenix-erp-v3/pull/128) 在 `reviewed-frozen-boundary` 显式复核后全部通过：类型/构建、两套 regression、Web Vitest、runtime smoke 与静态安全/冻结门禁均为绿；合并 commit 为 `be14a770d89acf43a43c96fd874eaf9734bb66c1`。
- 手动 `full` 生产部署 run `33142591770` 成功；API/Web 镜像均重新构建，迁移、容器健康检查和 Web smoke 全部通过。
- 部署后只读复核 run `33143220504`：生产 checkout、API image revision、Web image revision 三者均为 `be14a770d89acf43a43c96fd874eaf9734bb66c1`。
- amei 语义只读复核保持不变：`POS-20260828-00003` 至 `00013` 均为 OPEN/UNPAID，目标批次仍唯一、AVAILABLE、`qty_available=1000.000`；未代用户执行真实支付，未产生 allocation/现金流水/payment record，也未做任何额外生产数据修正。

## 门店退货 409 与近期库存技术债闭环（2026-08-28）

### 退货 409 根因

精确抛出点为 `StorePosService.reverseInventory()`。旧查询没有读取规范字段
`wms_zones.zone_type`，而是要求 `zone_code/zone_name` 文本包含 `QUARANTINE` 或“隔离”。
生产只读取证 run `33148506142` 证明会晒数据完整且合规：RETURNS 绑定仓
`ST_LAO_XINGCHI_HS_001_SALES` ACTIVE；区 `ZN_XINGCHI_HS001_RETURNS` 为
`zone_type=QUARANTINE/status=ACTIVE`；位 `ZN_XINGCHI_HS001_RETURNS_NORMAL`
为 ACTIVE。因为编码只有 `RETURNS`、中文名为“退货区”，旧字符串猜测必然返回空。

修复改为 `location.warehouse_code + zone.warehouse_code + zone_code` 精确关联，并严格要求
location、zone 都为 ACTIVE、`zone_type='QUARANTINE'`。同类检索确认 POS 整单退货是唯一显式
查找 QUARANTINE 区位的消费路径；Sales V2 退货使用独立 `RETURNED` 语义，本轮不改台账状态语义。
契约测试同时禁止退回到名称/编码 LIKE 猜测。

用户真实成交单已出现：独立只读 run `33148846524` 记录
`POS-20260828-00014` 为 COMPLETED/PAID，allocation `id=1` 从
`IBN-20260828-VW1SSC` 分配 2，目标批次 `qty_available=998`。该单正是本次 409 的真实 fixture；
修复部署前未再次代用户触发退货，避免产生额外退款和库存副作用。

### 其余 8 条公司漂移修正

执行脚本 `scripts/ops/fix-generic-inbound-company-drift-remaining-8.sql`，补偿脚本
`scripts/ops/rollback-generic-inbound-company-drift-remaining-8.sql`。每个批次使用独立
`BEGIN/COMMIT`，前置锁定批次 ID、编码、SKU/物料、仓、公司、状态、数量及完整关联台账集合；
批次和台账分别 `UPDATE ... RETURNING`，随后逐条后置断言数量/状态不变、公司与仓公司一致。
后续单条失败会停止 psql，但不会回滚前面已提交批次。

| 批次 | 仓公司 | 修正台账 ID | 数量末态 |
|---|---|---:|---:|
| `IBN-20260713-KVN57H` | `COMP-LAO-AGRI` | 36 | 1 |
| `IBN-20260715-PYVE48` | `COMP-LAO-AGRI` | 39 | 99 |
| `IBN-20260716-RV0SUA` | `COMP-LAO-AGRI` | 45 | 10 |
| `IBN-20260724-HY1Y6S` | `COMP-LAO-AGRI` | 77, 80 | 99 |
| `IBN-20260826-8WUHPK` | `COMP-LAO-XINGCHI` | 172, 176, 177 | 7.999 |
| `IBN-20260827-P6XOFM` | `COMP-LAO-AGRI` | 174, 178, 180（175 原已正确） | 6 |
| `IBN-20260827-P6XOFM-T-1LR` | `COMP-LAO-AGRI` | 179 | 2 |
| `IBN-20260827-P6XOFM-T-CR8` | `COMP-LAO-AGRI` | 181, 182 | 1 |

生产执行 run `33148794402` 中 8 个独立事务及最终 `GENERIC_INBOUND_COMPANY_DRIFT=0`
断言全部通过。job 最终标红是复用了旧单批 workflow 的历史验收条件，仍要求目标 POS 批次
`qty_available=1000`；真实成交已经把它变成 998，故旧验收 `fifo_count=0`。这发生在 8 个事务
全部提交且 drift=0 之后。独立只读 run `33148846524` 和 `33148944720` 再次确认漂移清单为 0，
8 个批次均 AVAILABLE、正可用量且公司与仓公司一致，可被各自同公司消费链看见。

### 调拨签收 store_code 与公司归属

生命周期调拨原来把 `source_snapshot.store_code` 原样复制到目标批次，门店补货进入目标门店仓时
会延续 `ALL`。现在签收按目标仓权威解析
`wms_warehouses.owner_store_id -> store_master.store_code`：门店自有仓覆盖为 owner store；
非门店仓保留源 `store_code`，源值为空才维持历史 `ALL` 兜底。同时目标批次和 TRANSFER_IN
台账显式写目标仓 `company_code`。一阶段 `confirmTransfer()` 的目标入库也使用同一解析，封堵
历史两条调拨派生公司漂移的原入口。

只读 run `33148944720` 的 `STORE_OWNED_TRANSFER_BATCH_STORE_DRIFT` 返回 0 行，当前没有
`location_code='TRANSFER-IN'` 且 `store_code` 不等于 owner store 的历史门店签收批次，因此无需、
也未执行历史 `store_code` 数据修正。

### 条件 UPDATE 行数契约

WMS 通用出库、一阶段调拨、生命周期调拨发运，以及 Sales V2 预占/释放/正式出库均改为
`WITH changed AS (UPDATE ... RETURNING batch_no) SELECT batch_no FROM changed`，严格要求一行。
守卫覆盖批次、权威公司、仓、AVAILABLE 状态和数量；Sales V2 预占继续检查未过期和非 legacy。
正式出库移除 `GREATEST(0, ...)` 静默截断，0 行命中抛明确冲突并由事务回滚。Sales V2 预占
不再吞掉库存冲突后继续审批，保持 fail-closed。

### 本轮边界

未建设 Playwright 真实凭据 fixture；未处理 VTE 场站归置、32 幽灵批次、东鹏老挝语名等
待业务决策项。退货仍写 QUARANTINE 批次和 SALE_RETURN 台账，库存台账语义未放宽或改写。

### CI、部署与上线后只读复核

- PR [#129](https://github.com/ivanzhao299/phoenix-erp-v3/pull/129) 在
  `reviewed-frozen-boundary` 与 `reviewed-security-touch` 显式复核后全绿，merge revision
  `cbdd9239b09329f3af16e218139f94f2dccf3b4d`。
- `full` 生产部署 run `33149547891` 成功；API/Web 镜像重建、迁移、健康检查及 Web smoke 全部通过。
- 部署后只读 run `33150346928`：生产 checkout、API image、Web image 三者均为上述 merge revision；
  `GENERIC_INBOUND_COMPANY_DRIFT` 与历史门店调拨 `store_code` 漂移均为 0 行；会晒 QUARANTINE
  zone/location 仍为 ACTIVE；真实 fixture `POS-20260828-00014` 保持 COMPLETED/PAID、allocation
  仍为 2、`returned_qty=0`。未代用户发起退货，等待用户自行复验真实退款/回库动作。
