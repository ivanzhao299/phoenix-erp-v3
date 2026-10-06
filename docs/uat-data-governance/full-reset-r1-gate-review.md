# R1 FULL BUSINESS RESET GATE REVIEW

R0 已合并到主线 `0619da17bd3631c04a61313eb6852290dc109c58`。本阶段只复核边界和执行门禁；没有停止服务，没有备份，没有数据库写入，也没有生成可执行清理 SQL。

## Live identity

```text
SSH_TARGET=phoenix-prod
HOSTNAME=iZt4nj11ry11ofv03yi35vZ
TARGET_DB=phoenix_erp
POSTGRES_VERSION=16.14
SYSTEM_IDENTIFIER=7641898445435437089
```

## Boundary corrections

静态代码与实时行数复核后，R0 分类已修正：

- 保留 `sys_data_scopes`、`inv_source_mode`、`biz_site_aliases`、`mon_house_device_mapping`、`qa_standards`、`ord_prices`、`crm_members`、`mon_device_property_dict` 和 `fin_cash_accounts`。这些对象分别承担 DataScope、库存来源配置、主数据别名、设备映射、质量标准、价格配置、会员主档、IoT 属性字典和现金账户主档职责；现金账户的余额只能按批准的期初值重算。
- 删除候选加入质量检验、门店收货/调拨/补货/损耗和 `sal_store_shift_closings` 等业务运行态。
- `bug_reports`、`md_change_requests`、`inv_source_mode_audit` 保留为 ARCHIVE。
- Chanjet 股东凭证链接、关账期间、会计余额置于 EXTERNAL_GATE，不得在远端影响未确认前删除。

生产 schema/code 复核后，R0 的 8 个 UNKNOWN 已被收敛：药品表当前实际 schema 只有主档列；CRM 券/活动和经销商分级属于配置/客户分级主档；旧 `log_*` 表由 Sales V2 标为遗留只读并转入 ARCHIVE；`fin_ar_ledger` 转入 EXTERNAL_GATE，等待财务/Chanjet opening reconciliation。该收敛基于实时 schema 和代码证据，不是因为当前行数为 0。

## Current live counts (sanitized)

```text
R0_REVISED_TRANSACTION_RUNTIME_DERIVED_ROWS=223192
R0_REVISED_KEEP_MASTER_ROWS=16607
UNKNOWN_TABLE_ROWS=0
FK_CYCLE_ROWS=79
```

`fin_ar_ledger=119` 已转入 EXTERNAL_GATE，当前不计入可删除行数；FK 环中当前有 `pkg_packing_records=38`、`sal_store_sale_tenders=4`、`sal_store_sales=37`，其他环表当前为 0。行数只用于门禁和设计，不构成删除批准。

## Financial and inventory opening gate

生产只读聚合显示：

- 现金账户主档 77 行，存在非零期初值和非零当前值；不能假设清理后为零。
- `fin_ar_ledger` 119 行，来源同时包含 `CHANJET_VERIFIED_*` 和 `OCR_PENDING_VERIFY`；必须由财务确认哪些是批准的期初/正式导入事实，哪些是本轮测试运行。
- `wms_stock_balance` 当前为空，但 `inv_batches` 仍有 314 行且数量非零，来源类型混合；库存期初基线尚未确认。

因此：

```text
FINANCE_OPENING_BALANCE_POLICY=UNCONFIRMED
INVENTORY_OPENING_BALANCE_POLICY=UNCONFIRMED
FINANCE_RESET_ALLOWED=NO
INVENTORY_RESET_ALLOWED=NO
```

正式方案必须先形成批准的 opening manifest，分别保留正式期初事实、清理测试交易事实，并以重算结果校验派生余额。

## Chanjet gate

本地只读统计发现：

```text
chanjet_sync_jobs=35433 (SUCCESS=30399, FAIL=4934, RUNNING=100)
chanjet_erp_inbound_sync_runs=5 (SHAREHOLDER_ACCOUNTING_BALANCE/COMPLETED)
chanjet_reconciliation_results=1630 (HOLD=72, WARN unresolved=1030, WARN resolved=528)
chanjet_writeback_outbox=0
chanjet_wms_writeback_outbox=0
```

这些记录证明本地存在同步和对账历史，但不能证明远端无副作用。必须先完成远端影响核对；不得调用 Chanjet 写 API，也不得把本地删除当作远端回滚。

## Trigger and cycle gate

六个 FK 环和 `sal_order_lifecycle_events`、包装历史不可变触发器、已过账门店结算保护触发器会阻止或改变普通 DELETE。R1 必须逐项确认：

1. 采用真实 FK child-before-parent 顺序；
2. 对环使用经过审查的分阶段删除或将相关对象转入 BLOCKED，不能禁用约束；
3. 对 append-only/immutable 表取得专门业务处置批准，不能绕过触发器；
4. 对所有 derived trigger 确认副作用及 postcheck。

## Gate result

```text
UNKNOWN_BUSINESS_TABLES=0
FK_CYCLES=6
TRIGGER_REVIEW_COMPLETE=NO
FINANCE_OPENING_BALANCE_POLICY=UNCONFIRMED
INVENTORY_OPENING_BALANCE_POLICY=UNCONFIRMED
CHANJET_REMOTE_GATE=OPEN
FULL_RESET_EXECUTION_ALLOWED=NO
APPLICATION_WRITES_STOPPED=NO
BACKUP_FOR_DESTRUCTIVE_RESET=NOT_STARTED
DRY_RUN_SCRIPT=NOT_GENERATED
DATABASE_MUTATION=NO
NEXT_ACTION=R1_BOUNDARY_AND_OPENING_MANIFEST_REVIEW
```

虽然 UNKNOWN=0，FK 环和触发器仍需可审查处置，财务/库存 opening manifest 仍需批准，Chanjet gate 仍需关闭或明确延期；全部满足后才允许进入 R2 backup/dry-run 设计。
