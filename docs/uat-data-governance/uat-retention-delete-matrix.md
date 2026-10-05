# UAT Retention / Delete Matrix — U0 Input

| Data class | U0 decision input | Future action |
|---|---|---|
| Users, RBAC, formal master data | Preserve | Keep |
| UAT transactions | Not yet classified | Require two independent UAT signals |
| Workflow definitions, versions, rules | Preserve | Keep |
| Workflow runtime instances/tasks | Not yet classified | Review confirmed UAT instances only |
| UAT feedback, checklist, training, pilot reports | Preserve by default | Archive or separately approve |
| Audit and operation logs | Preserve | Archive/retain |
| Attachment metadata/files | Not yet classified | Owner-level review; quarantine first |
| Chanjet configuration and remote data | Not assessed | External decision required |

No row in this matrix authorizes deletion. The candidate manifest is generated only after the complete read-only inventory and contains no confirmed rows.

Inventory result: one `wms_outbound` row matched an explicit `UAT-*` outbound number, but none of its independent reference/source signals matched. It is classified `AMBIGUOUS` and excluded from the manifest. The final manifest is generated with headers only and hash `77627d4eee350e0cb659d8f12872b8fbc831cb2245f9ccbcf5af7bd67594b3cd`.

## U1 frozen decisions

| Data class | Decision | Basis |
|---|---|---|
| Users / RBAC / scope | KEEP | No account deletion is authorized in U1 |
| Formal master data | KEEP | UAT2 documentation used formal master identifiers; current references are not a delete proof |
| Test-only master data | MANUAL_DECISION | No current row met both test-only and no-formal-reference gates |
| Confirmed UAT transactions | NOT_PRESENT | Reviewed manifest has zero rows |
| Ambiguous shared outbound/inventory facts | MANUAL_DECISION | One outbound has one ledger and one batch dependency |
| Workflow definitions / versions / rules | KEEP | Configuration, not runtime evidence |
| Workflow runtime | NOT_PRESENT_FOR_CONFIRMED_UAT | UAT2-like runtime probe returned zero |
| UAT reports / pilot / feedback / checklist / training | ARCHIVE | Repository evidence is retained; current tables are empty |
| Audit and operation logs | ARCHIVE | Governance evidence is retained |
| File metadata and physical files | KEEP / NO_DELETE | No confirmed UAT owner set |
| Chanjet configuration / mapping / credentials | KEEP | No confirmed UAT root or remote-write closure |
| Finance derived state | KEEP | No confirmed UAT financial facts; no balance reset or recalculation |

`PRODUCTION_UAT_CLEANUP_REQUIRED=NO` and `U2_CLEANUP_DESIGN_ALLOWED=NO`. The ambiguous inventory fact is not a cleanup workload.

U1.5 changes the governance state to `PRODUCTION_UAT_CLEANUP_REQUIRED=BUSINESS_CONFIRMATION_PENDING`. The technical manifest remains empty, while the separate business confirmation list contains eight current objects. No business decision is pre-filled.

## U1.6 business decision addendum

| Review scope | Business decision | Current technical disposition |
|---|---|---|
| Ambiguous WMS outbound `UAT-WO-20260726-081316` | KEEP | Retain outbound, inventory ledger, and batch; no inventory action |
| Six inactive `pilot_*` accounts | DELETE | U2 design only; technical impact review required before any account change |
| `wang_ceo` persona account | KEEP | Retain formal CEO identity candidate |

These are business decisions, not executable database instructions. The U0 delete manifest remains zero rows. The six user-account decisions do not authorize deletion or disabling; they only open a narrowly scoped U2 cleanup-design review after substantive business comments are added.
