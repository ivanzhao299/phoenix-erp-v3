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

仍有 8 个表不能安全按整表主数据或整表交易处理：

```text
crm_coupons
crm_activities
chn_distributor_grading
brd_medications
fin_ar_ledger
log_drivers
log_vehicles
log_routes
```

其中 `brd_medications` 同时呈现药品主档和用药交易字段；`fin_ar_ledger` 同时包含期初/期间/期末金额以及 Chanjet 已审核和待核验来源；三个 `log_*` 表属于旧版与当前 `sal_*`/Sales V2 的迁移边界；CRM 营销/客户分级表需要确认是正式配置还是业务活动事实。UNKNOWN 不能通过“当前为 0 行”自动消除。

## Current live counts (sanitized)

```text
R0_REVISED_TRANSACTION_RUNTIME_DERIVED_ROWS=223192
R0_REVISED_KEEP_MASTER_ROWS=16516
UNKNOWN_TABLE_ROWS=210
FK_CYCLE_ROWS=79
```

其中 UNKNOWN 行数包括 `brd_medications=91`、`fin_ar_ledger=119`，其余当前为 0；FK 环中当前有 `pkg_packing_records=38`、`sal_store_sale_tenders=4`、`sal_store_sales=37`，其他环表当前为 0。行数只用于门禁和设计，不构成删除批准。

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
UNKNOWN_BUSINESS_TABLES=8
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

只有 UNKNOWN=0、FK 环和触发器有可审查处置、财务/库存 opening manifest 获批准、Chanjet gate 关闭或明确延期后，才允许进入 R2 backup/dry-run 设计。
