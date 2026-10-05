# U2 USER CLEANUP REFERENCE GRAPH REPORT

## U2A 只读结论

本阶段仅使用业务确认结果中 `business_decision=DELETE` 的六个账号建立冻结目标集；`wang_ceo` 的业务决定为 KEEP，未进入任何查询和影响矩阵。所有生产操作均为独立短时只读事务，没有 DELETE、UPDATE、DDL、服务操作或 Chanjet 写入。

```text
TARGET_ENVIRONMENT=CONFIRMED
SSH_TARGET=phoenix-prod
HOSTNAME=iZt4nj11ry11ofv03yi35vZ
TARGET_DB=phoenix_erp
POSTGRES_VERSION=16.14
SYSTEM_IDENTIFIER=7641898445435437089
TARGET_USER_COUNT=6
TARGET_SET_SHA256=6b32e154bcb708b95b9eed1725fa8b15a1951dae8e2794926dd3c602fd6e4ecd
FK_REFERENCE_TABLES=8
CASCADE_REFERENCE_TABLES=2
SET_NULL_REFERENCE_TABLES=2
NO_ACTION_REFERENCE_TABLES=4
RESTRICT_REFERENCE_TABLES=0
TOTAL_CASCADE_ROWS=5
TOTAL_SET_NULL_ROWS=0
TOTAL_NO_ACTION_ROWS=0
LOGICAL_REFERENCE_SEGMENTS=124
LOGICAL_REFERENCE_SEGMENTS_PASS=120
LOGICAL_REFERENCE_SEGMENTS_NOT_PRESENT=4
LOGICAL_REFERENCE_SEGMENTS_BLOCKED=0
AUDIT_REFERENCE_ROWS=0
BUSINESS_FACT_REFERENCE_ROWS=0
LOGICAL_REFERENCE_ROWS=1
HARD_DELETE_SAFE_USERS=1
RETAIN_FROZEN_USERS=5
ARCHIVE_IDENTITY_USERS=0
NEED_MORE_EVIDENCE_USERS=0
U2_PREFLIGHT_STATUS=COMPLETE
PRODUCTION_DATABASE_MUTATION=NO
```

## 目标账号影响矩阵

完整逐账号结果见 [uat-user-cleanup-impact.csv](../../uat-user-cleanup-impact.csv)。五个账号仍有 `sys_user_role.user_id` 的授权连接记录，因此不满足硬删除条件；`pilot_manager` 另有一条 `sal_price_books.created_by` 逻辑引用。`pilot_wms` 没有角色、范围、登录、审计、业务事实或逻辑引用，满足 U2A 的技术硬删除前置条件，但本报告不执行删除。

|用户名|user_id|status|角色|逻辑引用|硬删除前置|建议|
|---|---:|---:|---:|---:|---|---|
|`pilot_sales`|295|0|1|0|NO|RETAIN_FROZEN|
|`pilot_cashier`|296|0|1|0|NO|RETAIN_FROZEN|
|`pilot_driver`|297|0|1|0|NO|RETAIN_FROZEN|
|`pilot_wms`|298|0|0|0|YES|HARD_DELETE|
|`pilot_finance`|299|0|1|0|NO|RETAIN_FROZEN|
|`pilot_manager`|300|0|1|1|NO|RETAIN_FROZEN|

## 引用图摘要

- 8 条实际入站 FK：`pkg_packing_events.actor_id`、`pkg_packing_operations.actor_id`、`store_memberships.user_id`、`sys_permission_set.created_by`、`sys_user_permission_set.granted_by`、`sys_user_permission_set.user_id`、`sys_user_role.granted_by`、`sys_user_role.user_id`。
- 5 条命中全部来自 `sys_user_role.user_id`，是角色授权连接数据；其余 FK 命中为 0。没有包装操作、门店会员、权限集主体或授权人引用。
- `ON DELETE SET NULL` 的两条关系命中为 0；`NO ACTION` 的四条关系命中为 0，因此没有当前 FK 阻断，但不能由此删除历史身份。
- 124 个逻辑分段中，4 个字段在当前 schema 不存在：`bug_reports.reporter_user_id`、`wms_inbound.operator_id`、`wms_outbound.operator_id`、`brd_medications.operator`；它们被明确标为 `NOT_PRESENT`，不是查询失败。
- 审计、错误日志、通知、工作流、采购、销售、库存、财务、包装、质检、门店支付和 Chanjet 用户字段均无目标账号命中。
- 唯一非零逻辑引用是 `sal_price_books.id=1` 的 `created_by=pilot_manager`，属于价格册主数据归因，不是可忽略的测试账号残留。

## 处置判断

```text
pilot_wms       HARD_DELETE technically safe; U2B design only, no write executed
other five      RETAIN_FROZEN; role membership or logical attribution remains
PHYSICAL_DELETE_EXECUTED=NO
U2_EXECUTION_STATUS=NOT_STARTED
U2B_HARD_DELETE_EXECUTION_DESIGN_REQUIRED=YES_FOR_PILOT_WMS_ONLY
```

这不是生产删除授权。`status=0` 已使六个账号不能登录；对五个仍有授权/归因关系的账号，保留冻结身份可保持历史可解释性。即使 `pilot_wms` 技术上满足硬删除前置，也必须在 U2B 单独确认具体删除合同、备份、停写窗口和回滚方案后才能执行。

## 证据与完整性

- 目标集文件：`scripts/uat/evidence/u2-approved-user-set.txt`，SHA-256 `6b32e154bcb708b95b9eed1725fa8b15a1951dae8e2794926dd3c602fd6e4ecd`。
- 分段状态文件：`scripts/uat/evidence/u2-user-reference-segments.tsv`，SHA-256 `630dc0cbed3ceb70919b43d048ed6e2e5d226ef6e4db11274a55fd909d474ed1`；120 PASS、4 NOT_PRESENT。
- 影响矩阵：`uat-user-cleanup-impact.csv`，SHA-256 `301be8c3989c2b7aa4230c03c3597c8cf049a0aa44b4b93674e5767d77ebd736`，使用 UTF-8 BOM 便于 Excel 正确显示中文。
- 原始生产查询结果没有写入仓库；仓库只保存脱敏的目标集、计数、状态、哈希和关系摘要。

## 安全状态

```text
DATABASE_DELETE_EXECUTED=NO
DATABASE_UPDATE_EXECUTED=NO
DATABASE_SCHEMA_CHANGED=NO
SERVICE_OPERATION_EXECUTED=NO
FILE_DELETE_EXECUTED=NO
CHANJET_WRITE_EXECUTED=NO
CLEANUP_SCRIPT_READY=NO
U2A_REFERENCE_GRAPH=COMPLETE
NEXT_ACTION=U2B_FINAL_EXECUTION_DECISION
```
