# UAT DATA GOVERNANCE — U2 USER ACCOUNT CLEANUP DESIGN

```text
PHASE=U2_CLEANUP_DESIGN
SCOPE=EXACTLY_SIX_PILOT_ACCOUNTS
BUSINESS_DECISIONS=DELETE_FOR_SIX_ACCOUNTS
U0_DELETE_MANIFEST_ROWS=0
U0_DELETE_MANIFEST_SHA256=77627d4eee350e0cb659d8f12872b8fbc831cb2245f9ccbcf5af7bd67594b3cd
U1_6_DECISION_SNAPSHOT_SHA256=0df9e1c9fc16051dff1c033ddc78194abefe95d705aa17754dca66b58686e62f
U2_EXECUTABLE_CLEANUP_SCRIPT=NO
U2_EXECUTION_GATE=BLOCKED_PENDING_LOGICAL_REFERENCE_PREFLIGHT
DATABASE_DELETE_AUTHORIZED=NO
DATABASE_UPDATE_AUTHORIZED=NO
SERVICE_STOP_AUTHORIZED=NO
```

## 1. Approved scope

The only objects entering this design are these exact usernames:

| review_id | username | business decision | U0 technical state |
|---|---|---|---|
| P2-USER-001 | `pilot_cashier` | DELETE | inactive, technical review required |
| P2-USER-002 | `pilot_driver` | DELETE | inactive, technical review required |
| P2-USER-003 | `pilot_finance` | DELETE | inactive, technical review required |
| P2-USER-004 | `pilot_manager` | DELETE | inactive, technical review required |
| P2-USER-005 | `pilot_sales` | DELETE | inactive, technical review required |
| P2-USER-006 | `pilot_wms` | DELETE | inactive, technical review required |

The WMS outbound `UAT-WO-20260726-081316` and `wang_ceo` remain `KEEP`. They are outside this design. No UAT transaction, inventory batch, inventory ledger, finance fact, attachment, Chanjet record, workflow instance, or master-data row is included.

The business instruction explicitly allows progress despite the comment-field format. The decision snapshot and reviewer/time fields remain the audit input; the technical gate below is still mandatory.

## 2. Technical findings that shape the design

`sys_user` is keyed by `user_id` and has a unique `username`. The current lifecycle supports archival through `status=-1`, `archived_at`, `archived_by`, and `archive_reason`; the API exposes `PUT /api/system/users/:id/archive` and a restore path. The account rows were inventoried as inactive (`status=0`) with zero formal/UAT references in the U0 evidence.

The schema has cascading user-role and user-permission-set relationships, plus non-FK or incompletely represented scope and ownership relationships. A hard `DELETE FROM sys_user` could therefore remove role/permission rows, leave logical references, and erase the user identity needed to interpret historical audit data. The design recommends reversible archive through the existing lifecycle endpoint; hard deletion is outside this U2 scope.

## 3. Mandatory preflight

Run [uat-user-cleanup-preflight.sql](../../scripts/uat/uat-user-cleanup-preflight.sql) in one short read-only session against the confirmed target. It must return:

- all six exact usernames present once;
- all six still `status=0` and not logged in after the U1.6 decision snapshot;
- no unexpected organization, project, warehouse, permission-set, role, workflow, transaction, or audit ownership that changes the risk assessment;
- unchanged target identity, schema/migration baseline, and candidate snapshot hash.

Any missing account, status change, login after review, additional formal reference, schema drift, candidate-set drift, or incomplete logical-reference segment stops the phase. The preflight result must be stored as restricted evidence and hashed; raw user identifiers must not be committed to Git.

## 3A. 分段只读预检结果（2026-10-05）

已完成两个短时只读 segment：

- 目标身份通过：`phoenix_erp`、PostgreSQL `16.14`、system identifier `7641898445435437089`。
- 六个精确用户名全部存在，全部 `status=0`，登录时间为空；角色绑定可见，组织/项目/仓库/权限集计数均为 0。
- `sys_user` 入站 FK 拓扑查询通过，共发现 8 条关系，其中用户角色和用户权限集的主体关系为 `CASCADE`，包装操作、门店会员、授权人等关系为 `NO ACTION` 或 `SET NULL`。

涉及潜在逻辑引用的逐表计数 segment 在 5 秒 statement timeout 内未完成，已自动回滚并标记为 `DEFERRED`。因此本次结果只能证明账户状态和 FK 元数据满足初步条件，不能批准任何账户写操作；必须先完成按表拆分的逻辑引用预检。

## 4. T0 execution contract for a future phase

A future execution phase would require a separately approved T0 window, fresh preflight, backup/restore point, service-write freeze, and an exact username-to-`user_id` manifest generated at T0. The manifest must be compared with the approved six-row decision snapshot before any account change.

The preferred reversible action is the canonical archive API with a reason such as `UAT pilot account cleanup approved by business review`; it must record the acting administrator and archive timestamp. The operation must be transactional per account or in a bounded batch, followed by read-only verification that login is rejected, role visibility is inactive, and historical references remain queryable. Restoration uses the canonical restore endpoint after approval.

No raw SQL `DELETE`, sequence reset, trigger disablement, `session_replication_role` change, physical file operation, Chanjet call, or balance recalculation is part of this design. No `uat-cleanup.sql` is generated.

## 5. Abort and rollback gates

Abort before the first write if any candidate is active, has a new login, owns a formal scope, appears as a required approver/operator, is referenced by an unresolved business fact, or cannot be archived through the canonical API. If a write partially completes, stop the batch, preserve evidence, and use the canonical restore path only after incident-owner approval; do not improvise direct SQL rollback.

```text
U2_DESIGN_STATUS=COMPLETE
U2_PREFLIGHT_STATUS=PARTIAL_BLOCKED
U2_EXECUTION_STATUS=NOT_STARTED
PRODUCTION_DATABASE_MUTATION=NO
NEXT_ACTION=COMPLETE_SEGMENTED_LOGICAL_REFERENCE_PREFLIGHT
```

## 6. U2A reference-graph preflight addendum (2026-10-05)

U2A 建立了只包含六个业务确认 `DELETE` 账号的冻结目标集：`pilot_cashier`、`pilot_driver`、`pilot_finance`、`pilot_manager`、`pilot_sales`、`pilot_wms`。目标集 SHA-256 为 `6b32e154bcb708b95b9eed1725fa8b15a1951dae8e2794926dd3c602fd6e4ecd`；`wang_ceo` 明确 KEEP，未进入 U2A。

采用逐表、逐列、独立短事务查询，完成 124 个逻辑引用 segment：120 个 PASS、4 个 NOT_PRESENT、无超时或错误。生产数据库实际入站 FK 为 8 条（CASCADE 2、SET NULL 2、NO ACTION 4），命中目标账号的只有 5 条 `sys_user_role.user_id` 授权连接记录；包装历史、门店会员、权限集、工作流、采购、销售、库存、财务、审计和 Chanjet 引用均为 0。唯一非零逻辑业务引用是 `sal_price_books.created_by` 1 行，归属于 `pilot_manager`。

逐账号结果：`pilot_wms` 满足 U2A 硬删除技术前置条件；其余五个账号因角色授权连接或价格册创建人归因而建议 `RETAIN_FROZEN`。这只是 U2B 设计输入，不是删除授权。六个账号当前 `status=0`，没有登录、组织、项目、仓库或权限集绑定；没有执行生产 DELETE、UPDATE、DDL、服务操作或 Chanjet 写入。

```text
U2_DESIGN_STATUS=COMPLETE
U2_PREFLIGHT_STATUS=COMPLETE
U2_EXECUTION_STATUS=NOT_STARTED
HARD_DELETE_SAFE_USERS=1
RETAIN_FROZEN_USERS=5
PRODUCTION_DATABASE_MUTATION=NO
NEXT_ACTION=U2B_FINAL_EXECUTION_DECISION
```
