# R4.1 Product Acceptance Runtime Baseline Report

| Check | Result |
|---|---|
| R4.1 base main | `02b390cadb3332160e74c4fe711f450061f2dbf7` |
| R3 reset status | `PASS` |
| Original reset target tables | `150` |
| Zero-required business tables | `148`, all zero |
| Regenerable system-runtime tables | `2` |
| Unexpected runtime drift tables | `0` |
| AR baseline | `PASS` |
| Inventory baseline | `PASS` |
| Finance baseline | `PASS` |
| Workflow business runtime | `PASS` |
| Master/RBAC preservation | `PASS` |
| Archive evidence | `PASS` |
| Attachment storage | `PASS` |
| Chanjet reimport guard | `PASS` |
| DB/API/Web health | `PASS` |
| Automated R4.1 baseline | **PASS** |
| Human login acceptance | `PENDING` |
| Human UAT | `PENDING` |

## Regenerable runtime

`sys_cron_heartbeat` contains three known scheduler jobs (`workflow_sla`, `iot_sync`, `notification_tick`), all reporting `SUCCESS`. No unknown heartbeat job exists.

`sys_notifications` contains 24 rows, all matching `SYSTEM_ALERT/SYS_ALERT/SYSTEM_ALERT`; every row resolves to an existing `sys_alerts` record. Non-system business notifications remain zero. The linked alerts are `IOT_DEVICE_ALERT` warnings, so business testers should review their operational meaning during handoff; they are not treated as a reset defect or as a reason to delete notification rows.

## Chanjet and service state

Both Chanjet synchronization flags remain disabled. Since the R3 reset epoch, there are no new sync jobs, mirror rows, inbound runs, reconciliation runtime rows or pending writeback rows. API health/readiness remain 200 and Web is reachable.

```text
R4_AUTOMATED_PRODUCT_ACCEPTANCE_BASELINE=PASS
HUMAN_LOGIN_ACCEPTANCE=PENDING
HUMAN_UAT_STATUS=PENDING
NEXT_ACTION=BUSINESS_LOGIN_AND_DATASCOPE_ACCEPTANCE
```

No test transactions were created. No production mutation was performed.
