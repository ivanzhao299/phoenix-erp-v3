# FULL RESET INVENTORY OPENING POLICY

## Evidence reviewed

仓库主数据、SKU、库区、库位和库存来源模式属于 KEEP。`inv_batches`、`inv_ledger`、分配、预留、调拨和盘点事实属于本轮全部交易清理范围。

代码和历史文档中存在好业财实时库存/批次库存只读镜像与药品 ETL 的“期初”描述，但这些材料没有形成当前数据库对应的、经业务批准的 opening manifest。部分同步计划还明确指出映射覆盖率不足、切换水位点和去重规则尚未完成。因此不能从现有 `inv_batches` 反推出正式期初库存。

## Live state

```text
inv_batches=314 rows
inv_batches non-zero quantity=YES
wms_stock_balance=0 rows
APPROVED_FORMAL_OPENING_INVENTORY_MANIFEST=NOT_FOUND
```

## R1.5 decision input

```text
FORMAL_OPENING_INVENTORY=NONE_APPROVED
POST_RESET_BATCH_COUNT=0
POST_RESET_LEDGER_ROWS=0
POST_RESET_AVAILABLE_QTY=0
POST_RESET_TRANSACTION_DERIVED_QTY=0
```

上述结论只在 R2 开始前再次核对 schema/migration baseline 后适用。若业务在 R2 前提供独立批准 manifest，必须更新分类、预计数、postcheck 和 hash，并重新通过 gate；不得在 SQL 中临时保留部分批次。

## Required postcheck

除主数据完整性外，必须确认 `inv_batches`、`inv_ledger`、allocation/reservation/movement/stocktake 事实均为空，库存来源模式与仓库/库位主数据仍存在且未被修改。
