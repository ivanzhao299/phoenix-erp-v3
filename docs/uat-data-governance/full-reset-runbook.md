# Full Business Reset Runbook (R0 gate)

当前 Track：`REOPENED_FOR_FULL_TRANSACTION_RESET`。

R0 已完成：

1. 确认生产 DB identity、297 张 public tables、98 条 FK、21 个 user-defined triggers。
2. 对 159 个 DELETE/RESET 表执行独立短时 exact count，共 223,651 行。
3. 对 108 个 KEEP_MASTER 表执行独立 exact count，共 16,384 行。
4. 生成 table classification、pre-count、master baseline、FK topology、logical dependency 和 trigger review。

R1 尚未通过，阻断项：

- 8 张 UNKNOWN 边界表（营销配置、旧药品混合表、遗留司机/车辆/路线、客户分级）必须先完成语义确认。
- 6 个 FK cycles：`pkg_packing_boxes`、`pkg_packing_events`、`pkg_packing_operations`、`pkg_packing_records`、`sal_store_sale_tenders`、`sal_store_sales`。
- 财务 opening balance policy 未确认。
- inventory opening balance policy 未确认。
- 触发器副作用尚未逐个批准。
- Chanjet remote-side-effect gate 尚未完成。
- file metadata / physical file retention policy 尚未形成执行清单。

禁止进入 R2/R3：

```text
APPLICATION_WRITES_STOPPED=NO
BACKUP_FOR_DESTRUCTIVE_RESET=NOT_STARTED
DRY_RUN_SCRIPT=NOT_GENERATED
FORMAL_EXECUTION=NOT_ALLOWED
```
