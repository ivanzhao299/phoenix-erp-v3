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
