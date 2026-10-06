# R4.1 Runtime Baseline Policy Reconciliation

## Policy decision

R3 reset correctness and steady-state acceptance are separate checks:

- R3 commit-time requirement: all reset targets, including system runtime tables, are zero inside the reset transaction.
- R4 steady-state requirement: business transactions and business runtime remain zero; approved system runtime may regenerate when provenance and health checks pass.

The original 150 reset targets are therefore divided into:

- **ZERO_REQUIRED_BUSINESS_STATE**: 148 tables, including business transactions, workflow runtime, inventory facts, AR/AP/payment facts, POS/store facts, business notifications and Chanjet runtime covered by the frozen reset policy.
- **REGENERABLE_SYSTEM_RUNTIME**: 2 tables, `sys_cron_heartbeat` and the restricted `sys_notifications` system-alert subset.
- **ARCHIVE / KEEP**: unchanged R3 frozen classification.

The R3 reset SQL and its commit-time postconditions are unchanged.

## Regenerable runtime provenance

`CronMonitorService.ok()/fail()/runGuarded()` upserts `sys_cron_heartbeat` for scheduler jobs. The accepted steady-state rows must use known current job names, have `SUCCESS` or `FAILED` status, and carry reasonable timestamps. A failed heartbeat remains an actionable alert and is not silently accepted.

`SysAlertsService.notifySystemMonitorWatchers()` creates `sys_notifications` rows only for non-INFO monitor alerts with the fixed tuple `notification_type='SYSTEM_ALERT'`, `biz_type='SYS_ALERT'`, and `link_type='SYSTEM_ALERT'`. Each accepted notification must resolve its `biz_id` to an existing `sys_alerts.id`. All other notification types remain zero-required business/runtime state.

## Current production evidence

- `sys_cron_heartbeat`: 3 rows; `workflow_sla`, `iot_sync`, and `notification_tick`; all `SUCCESS`; no unknown job.
- `sys_notifications`: 24 rows matching the exact system-alert predicate; all have a corresponding `sys_alerts` row.
- Non-system business notifications: 0.
- Current alerts are `IOT_DEVICE_ALERT`, severity `WARNING`, unresolved and unread. They are not P0/P1 failures, but require business acknowledgement during human acceptance.
- Zero-required business tables: 148/148 remain at zero.
- AR, inventory, finance, workflow business runtime and Chanjet reimport guard: PASS.

## Acceptance result

```text
R3_RESET_STATUS=PASS
R4_FAILURE_CLASS=BASELINE_POLICY_TOO_STRICT
R4_AUTOMATED_PRODUCT_ACCEPTANCE_BASELINE=PASS
UNEXPECTED_RUNTIME_DRIFT_TABLES=0
HUMAN_LOGIN_ACCEPTANCE=PENDING
HUMAN_UAT_STATUS=PENDING
```

No production mutation, restart, deployment, Chanjet write, notification deletion or heartbeat deletion was performed. The system-alert warnings remain visible for the business tester to review.
