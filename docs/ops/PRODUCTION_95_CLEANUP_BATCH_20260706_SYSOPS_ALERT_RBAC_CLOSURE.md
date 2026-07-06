# Production 95 Cleanup Batch - SysOps Alert RBAC Closure

## Scope

This batch closes three recurring production-grade issues:

1. System monitor data semantics were not explicit enough when the monitor API returned no data.
2. System alert notifications could not be reliably traced from the bell dropdown to the alert ledger and related business page.
3. RBAC/static gates did not yet freeze the notification-to-alert-center route, so a regression could send system alerts back to workflow approvals.

## Root Cause

- The system monitor page rendered database status from a nullable summary object. When the health endpoint failed, the UI could look like a real database outage instead of an unknown/no-response state.
- `sys_alerts` could be queried by alert id, type, severity and resolved state, but not by `related_path`, while notification links already carried `relatedPath`.
- Notification routing relied on `link_id` and `biz_no` but did not use `biz_id` as an alert id fallback.
- CI had alert-source coverage checks, but lacked checks for alert notification routing and monitor unknown-state semantics.

## Changes

- `SysAlertsService.listAll` now supports exact `relatedPath` filtering.
- `SysAlertsController.listAll` exposes `relatedPath` query filtering.
- `notification-routing.ts` now uses `bizId` / `biz_id` as system alert id fallback and keeps system alerts routed to `/system/alerts`.
- System monitor page now displays `—` with "监控接口未返回；不判定数据库离线" when the monitor summary is unavailable.
- System monitor page now shows a data-source panel so values have visible provenance.
- System alerts page now consumes `relatedPath`, shows a filter banner, and offers "打开相关页面" from a selected alert.
- `check-sys-alert-source-coverage.mjs` now gates:
  - alert `relatedPath` filtering,
  - system alert notification routing,
  - unknown monitor state not being rendered as DB offline.
- `check-menu-permission-atomicity.mjs` now gates notification routing use from the topbar bell and notification center.

## Safety

- DB migration: No.
- DB write: No.
- Deploy config change: No.
- Business data change: No.
- RBAC weakening: No.
- Alert deletion: No. Alert center remains append-only; resolving is still one-way.

## Expected Production Behavior

- Bell system alerts open the alert center with `alertId` and `relatedPath`.
- Device alerts on mobile route to `/mobile/device` where possible.
- Alert center can filter by related path and then open the business page.
- System monitor distinguishes `UNKNOWN` from real database offline.
- W5 now blocks regressions that route system alerts to approval todos.

