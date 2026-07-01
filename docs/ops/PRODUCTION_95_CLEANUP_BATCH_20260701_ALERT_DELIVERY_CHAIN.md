# Production 95 Cleanup Batch - System Alert Delivery Chain

Date: 2026-07-01

## Objective

Close an observability production debt item: system alerts existed as an append-only ledger, but the delivery chain was not explicit enough for production operations. A production alert that only sits in `sys_alerts` can still become a silent failure if no duty user is notified.

## Finding

Before this cleanup:

- API 500 / cron failure / IoT stale paths could write `sys_alerts`.
- The Alert Center page could list and resolve alerts.
- However, `SysAlertsService.createAlert()` only wrote the ledger and did not create a station notification for system-monitor duty users.
- The page did not show whether any users were eligible to receive system-alert notifications.

## Remediation

Backend:

- `SysAlertsService.createAlert()` now sends station notifications for `WARNING` and `CRITICAL` alerts.
- Recipients are active users whose roles grant `MENU_SYS_MONITOR:V`.
- The delivery is idempotent by `alertId + recipient`.
- `INFO` alerts do not notify to avoid low-value noise.
- Alert ledger writes remain the source of truth; notification failures are logged and do not break the original alert write.
- Added `GET /api/system/alerts/delivery-health` guarded by `MENU_SYS_MONITOR:V`.

Frontend:

- Alert Center now shows a "值班触达" card.
- The card displays eligible system-monitor recipients and last-24h system-alert notification count.
- The page explanation now states that CRITICAL/WARNING alerts are sent to duty users via station notification and remain append-only in the ledger.

## Files Changed

- `apps/api/src/modules/system-monitor/services/sys-alerts.service.ts`
- `apps/api/src/modules/system-monitor/controllers/sys-alerts.controller.ts`
- `apps/web/src/app/(admin)/system/alerts/page.tsx`
- `docs/ops/PRODUCTION_95_CLEANUP_BATCH_20260701_ALERT_DELIVERY_CHAIN.md`

## Validation

| Check | Result |
| --- | --- |
| `cd apps/api && ./node_modules/.bin/tsc --noEmit` | PASS |
| `cd apps/web && ./node_modules/.bin/tsc --noEmit` | PASS |
| `ALLOW_SECURITY_TOUCH=true ALLOW_FREEZE_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs` | PASS |

## Safety

- Business workflow changed: no.
- Alerting behavior changed: yes, WARNING/CRITICAL system alerts now generate station notifications.
- Migration created: no.
- Migration executed: no.
- DB write path added: yes, only when a system alert is created, writing `sys_notifications` for eligible system-monitor recipients.
- Deploy status: pending CI/CD after push.

## Current Conclusion

GO WITH CONDITIONS.

This closes the "alert ledger without duty delivery" gap for in-app station notifications. External webhook delivery still depends on `ALERT_WEBHOOK_URL` configuration and remains a separate operations hardening item.
