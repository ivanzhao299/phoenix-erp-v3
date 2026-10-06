# R0 FULL BUSINESS RESET INVENTORY REPORT

## Scope and gate

本报告对应 `REOPENED_FOR_FULL_TRANSACTION_RESET` 的 R0 只读盘点。新的业务规则将当前业务交易及其派生运行数据视为测试数据，但正式主数据、系统配置、用户权限、审计证据和外部系统配置仍属于 KEEP 边界。本阶段没有停止服务、没有备份、没有数据库写入，也没有生成或执行清理 SQL。

```text
LATEST_MAIN=c2be4ba9433bb43d8d9fc560571810bb1001ffad
BRANCH=codex/full-test-business-data-reset
TARGET_ENVIRONMENT=CONFIRMED
SSH_TARGET=phoenix-prod
HOSTNAME=iZt4nj11ry11ofv03yi35vZ
PRODUCTION_DEPLOY_PATH=/data/phoenix-erp
TARGET_DB=phoenix_erp
POSTGRES_VERSION=16.14
SYSTEM_IDENTIFIER=7641898445435437089
```

## Current inventory

```text
TOTAL_TABLES=297
FK_CONSTRAINTS=98
USER_TRIGGERS=21
KEEP_MASTER_TABLES=111
DELETE_TRANSACTION_TABLES=118
DELETE_RUNTIME_TABLES=22
RESET_DERIVED_TABLES=3
ARCHIVE_TABLES=27
EXTERNAL_GATE_TABLES=8
UNKNOWN_TABLES=8
UNKNOWN_BOUNDARY_TABLES=crm_coupons, crm_activities, chn_distributor_grading, brd_medications, fin_ar_ledger, log_drivers, log_vehicles, log_routes
TOTAL_TRANSACTION_ROWS=223192
KEEP_MASTER_ROWS=16516
```

`TOTAL_TRANSACTION_ROWS` 是 118 张 `DELETE_TRANSACTION`、22 张 `DELETE_RUNTIME` 与 3 张 `RESET_DERIVED` 表的实时精确行数合计；`KEEP_MASTER_ROWS` 是 111 张 KEEP_MASTER 表的实时精确行数合计。UNKNOWN 与 EXTERNAL_GATE 表不计入该清理行数。表分类、行数、近似大小、主键和业务键见 [full-reset-table-classification.csv](../../full-reset-table-classification.csv)、[full-reset-pre-counts.csv](../../full-reset-pre-counts.csv) 和 [full-reset-master-baseline.csv](../../full-reset-master-baseline.csv)。

## Dependency and side-effect status

```text
FK_DEPENDENCY_GRAPH=98 edges collected
FK_TOPOLOGY_ORDERED_NODES=158
FK_CYCLES=6
KEEP_CHILD_TO_DELETE_PARENT_CONFLICTS=0
LOGICAL_DEPENDENCY_GRAPH=R0 scan complete; R1 reconciliation required
TRIGGER_INVENTORY=21 user triggers; R1 review incomplete
```

六个 FK 环涉及 `pkg_packing_boxes`、`pkg_packing_events`、`pkg_packing_operations`、`pkg_packing_records`、`sal_store_sale_tenders` 和 `sal_store_sales`。详见 [full-reset-fk-order.md](../../full-reset-fk-order.md)。触发器及其风险见 [full-reset-trigger-review.md](../../full-reset-trigger-review.md)。正式阶段不得通过禁用触发器或 `session_replication_role` 绕过这些约束。

## Opening balance and external gates

```text
FINANCE_OPENING_BALANCE_POLICY=UNCONFIRMED
INVENTORY_OPENING_BALANCE_POLICY=UNCONFIRMED
CHANJET_REMOTE_SIDE_EFFECTS=UNKNOWN / READ_ONLY_GATE_REQUIRED
FILE_PHYSICAL_DELETE=DEFERRED_TO_RETENTION_PHASE
UAT_REPORT_AND_AUDIT_RETENTION=ARCHIVE_OR_RETAIN
```

当前尚未证明财务现金账户、客户信用、应收应付、库存余额是否包含正式期初值。因此不得把派生字段直接归零。Chanjet 本地运行态与远端副作用仍需分段只读核查；PostgreSQL 清理不能回滚远端写入。附件物理文件不在数据库事务中永久删除。

## Gate result

```text
SCHEMA_METADATA_COMPLETE=YES
UNKNOWN_BUSINESS_TABLES=8
RESET_EXECUTION_READY=NO
REASON=8 unknown boundary tables, 6 FK cycles, trigger side effects, opening-balance policy, and Chanjet remote gate require R1 resolution
DATABASE_DELETE_EXECUTED=NO
DATABASE_UPDATE_EXECUTED=NO
DATABASE_SCHEMA_CHANGED=NO
SERVICE_OPERATION_EXECUTED=NO
CHANJET_WRITE_EXECUTED=NO
FILE_DELETE_EXECUTED=NO
NEXT_ACTION=R1_RESET_DESIGN_AND_OPENING_BALANCE_REVIEW
```

R0 可以提交为只读盘点证据；不得进入停写、备份、dry-run 或正式清理，直到 R1 将上述门禁逐项关闭并重新冻结分类与基线。
