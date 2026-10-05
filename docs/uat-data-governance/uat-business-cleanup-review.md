# UAT DATA GOVERNANCE — BUSINESS CLEANUP CONFIRMATION LIST

```text
U0_DELETE_MANIFEST_ROWS=0
U0_DELETE_MANIFEST_SHA256=77627d4eee350e0cb659d8f12872b8fbc831cb2245f9ccbcf5af7bd67594b3cd
TOTAL_BUSINESS_REVIEW_ITEMS=8
P1_ITEMS=1
P2_ITEMS=7
P3_ITEMS=0
TECHNICAL_KEEP=2
TECHNICAL_LIKELY_DELETE=0
TECHNICAL_ARCHIVE=0
TECHNICAL_REVIEW_REQUIRED=6
FORMAL_DEPENDENCY_ITEMS=1
AMBIGUOUS_WMS_OUTBOUND_ITEMS=1
TEST_MASTER_REVIEW_ITEMS=0
TEST_USER_REVIEW_ITEMS=7
FINANCE_MASTER_REVIEW_ITEMS=0
FILE_METADATA_REVIEW_ITEMS=0
WORKFLOW_REVIEW_ITEMS=0
CHANJET_REVIEW_ITEMS=0
BUSINESS_REVIEW_MANIFEST_SHA256=5a6502a5ffa9628f2c47ed6e4520c83ce37a801996e91d578abac014de369c52
FULL_REVIEW_LIST_LOCATION=Git sanitized list; no separate restricted copy required
BUSINESS_CONFIRMATION_COMPLETE=NO
PRODUCTION_UAT_CLEANUP_REQUIRED=BUSINESS_CONFIRMATION_PENDING
U2_CLEANUP_DESIGN_ALLOWED=NO
DATABASE_DELETE_EXECUTED=NO
DATABASE_UPDATE_EXECUTED=NO
DATABASE_SCHEMA_CHANGED=NO
SERVICE_OPERATION_EXECUTED=NO
FILE_DELETE_EXECUTED=NO
CHANJET_WRITE_EXECUTED=NO
NEXT_ACTION=BUSINESS_TESTER_REVIEW
```

## How to use this list

The technical review found eight current objects that need a business decision. The `business_decision` fields are intentionally blank. A business reviewer must enter exactly one of `KEEP`, `DELETE`, `ARCHIVE`, `NOT_UAT`, or `NEED_MORE_EVIDENCE` and add a comment. This list is not a delete manifest.

## 1. P1 — confirm before any cleanup

### WMS outbound `UAT-WO-20260726-081316`

This outbound has an explicit UAT number and UAT remark, but the evidence comes from the same controlled test family. It is linked to one inventory ledger row and one inventory batch under `COMP-LAO-AGRI` / `LPH_MS_EGG_FARM`; no sales order or workflow runtime match was found. The batch identifier is `IBN-20260724-HY1Y6S`, so the inventory facts look formal/shared.

Technical recommendation: `KEEP`. Business must answer whether this was a historical test outbound and, if so, whether the inventory impact should enter a separate inventory reconciliation decision. Do not delete the outbound, ledger, or batch from this list.

## 2. P2 — review test and persona accounts

The six `pilot_*` accounts were created by `seed-uat-users.sh`, are currently inactive (`status=0`), and have no recorded last login. They are likely test-only accounts, but deletion or disablement can affect audit references and historical ownership. The `wang_ceo` persona is also inactive but carries a formal CEO role, so its technical recommendation is `KEEP` pending business confirmation.

No password, password hash, token, or secret is included.

## 3. Current objects not included

Known fixture master identifiers (`UAT-F-*`, `UAT-H-*`, `UAT-FK-*`, `UAT-BAT-*`, `UAT-CUST-*`, `UAT-PB-*`, `UAT-CASH-*`, `UAT-ST-*`) were absent from the current production inventory. The historical UAT2 transaction identifiers were also absent. They are recorded as historical evidence only and are not review/delete rows.

Current `uat_pilot_runs`, `pilot_daily_reports`, `uat_feedbacks`, `uat_checklists`, `uat_training_records`, and `mst_audit_trail` contain zero rows, so no report/audit deletion item is generated.

## 4. Business response contract

For every row in `uat-business-cleanup-review.csv`, fill:

```text
business_decision = KEEP | DELETE | ARCHIVE | NOT_UAT | NEED_MORE_EVIDENCE
business_comment = reason and scope
business_reviewer = named reviewer
reviewed_at = timestamp
```

`DELETE` on the WMS outbound is not sufficient to authorize inventory or finance changes. Any proposed deletion with formal dependencies must be returned for a separate technical impact review.

```text
BUSINESS_CONFIRMATION_COMPLETE=NO
PRODUCTION_UAT_CLEANUP_REQUIRED=BUSINESS_CONFIRMATION_PENDING
U2_CLEANUP_DESIGN_ALLOWED=NO
```
