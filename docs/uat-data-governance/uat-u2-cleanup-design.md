# UAT DATA GOVERNANCE — U2 USER ACCOUNT CLEANUP DESIGN

```text
PHASE=U2_CLEANUP_DESIGN
SCOPE=EXACTLY_SIX_PILOT_ACCOUNTS
BUSINESS_DECISIONS=DELETE_FOR_SIX_ACCOUNTS
U0_DELETE_MANIFEST_ROWS=0
U0_DELETE_MANIFEST_SHA256=77627d4eee350e0cb659d8f12872b8fbc831cb2245f9ccbcf5af7bd67594b3cd
U1_6_DECISION_SNAPSHOT_SHA256=0df9e1c9fc16051dff1c033ddc78194abefe95d705aa17754dca66b58686e62f
U2_EXECUTABLE_CLEANUP_SCRIPT=NO
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

Any missing account, status change, login after review, additional formal reference, schema drift, or candidate-set drift stops the phase. The preflight result must be stored as restricted evidence and hashed; raw user identifiers must not be committed to Git.

## 4. T0 execution contract for a future phase

A future execution phase would require a separately approved T0 window, fresh preflight, backup/restore point, service-write freeze, and an exact username-to-`user_id` manifest generated at T0. The manifest must be compared with the approved six-row decision snapshot before any account change.

The preferred reversible action is the canonical archive API with a reason such as `UAT pilot account cleanup approved by business review`; it must record the acting administrator and archive timestamp. The operation must be transactional per account or in a bounded batch, followed by read-only verification that login is rejected, role visibility is inactive, and historical references remain queryable. Restoration uses the canonical restore endpoint after approval.

No raw SQL `DELETE`, sequence reset, trigger disablement, `session_replication_role` change, physical file operation, Chanjet call, or balance recalculation is part of this design. No `uat-cleanup.sql` is generated.

## 5. Abort and rollback gates

Abort before the first write if any candidate is active, has a new login, owns a formal scope, appears as a required approver/operator, is referenced by an unresolved business fact, or cannot be archived through the canonical API. If a write partially completes, stop the batch, preserve evidence, and use the canonical restore path only after incident-owner approval; do not improvise direct SQL rollback.

```text
U2_DESIGN_STATUS=COMPLETE
U2_EXECUTION_STATUS=NOT_STARTED
PRODUCTION_DATABASE_MUTATION=NO
NEXT_ACTION=REVIEW_AND_APPROVE_T0_ARCHIVE_CONTRACT
```
