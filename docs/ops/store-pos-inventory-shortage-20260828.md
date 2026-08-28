# 门店 POS“库存不足”误报闭环（2026-08-28）

## 结论

生产批次 `IBN-20260828-VW1SSC` 的 SKU、仓库、状态、可用量、有效期和 legacy 标记均满足 POS FIFO；唯一不满足的是公司条件。通用入库确认没有写 `company_code`，数据库默认成 `ALL`，而销售单公司为 `COMP-LAO-XINGCHI`，因此 POS 的 `company_code = $2` 精确条件将 1000 枚真实库存全部排除。

本次不放宽 POS 可售条件、不改变库存台账语义。修复在统一入库入口从目标仓权威带出公司，同时写入正常/破损批次及台账；已有目标批次使用带严格前后置断言的单批修正脚本，须另行批准后才可在生产执行。

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

## 生产数据修正三段式（待批准）

脚本：`scripts/ops/fix-pos-batch-company-ibn-20260828-vw1ssc.sql`。

1. 前置断言：目标批次/SKU/仓/状态/数量仍与取证一致；目标仓公司仍为 `COMP-LAO-XINGCHI`；且恰好存在一条对应 `INB-20260828-9JPE` 入库台账。
2. 原子变更：仅把目标 `inv_batches` 与对应入库 `inv_ledger` 的 `company_code` 从 `ALL` 改为 `COMP-LAO-XINGCHI`。
3. 后置断言：批次可用量和状态未变，批次公司与仓公司一致；任何断言失败都会终止并回滚。

未经用户明确批准不执行该生产写入。部署后先用 `amei` 语义做只读复验；真实成交仍需另授权。
