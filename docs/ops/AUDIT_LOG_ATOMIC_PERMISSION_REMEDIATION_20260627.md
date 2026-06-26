# Audit Log Atomic Permission Remediation - 2026-06-27

## Scope

This batch tightens audit-log visibility and audit BFF APIs so system monitoring permission no longer implies audit-log access.

## Problem

The sidebar audit-log entry was primarily gated by `MENU_SETTINGS_AUDIT`, but it still allowed `MENU_SYS_MONITOR` as an alternate permission. The backend `AuditBffController` also required `MENU_SYS_MONITOR`.

That meant an operator with monitoring access could enter or call audit-log APIs without being explicitly granted audit-log permission.

## Changes

Updated:

- `apps/api/src/modules/bff/bff.controller.ts`
- `apps/web/src/components/layout/Sidebar.tsx`
- `scripts/ci/check-menu-permission-atomicity.mjs`

## Permission Alignment

New behavior:

- `/settings/audit-log` requires `MENU_SETTINGS_AUDIT`.
- `/api/audit/*` requires `MENU_SETTINGS_AUDIT`.
- audit sampling / anti-fraud mutation endpoints require `MENU_SETTINGS_AUDIT:E`.
- `MENU_SYS_MONITOR` remains for system health, alerts, error logs, online users, and presence diagnostics only.

## CI Guard

`scripts/ci/check-menu-permission-atomicity.mjs` now blocks:

- `AuditBffController` routes guarded by `MENU_SYS_MONITOR`;
- sidebar audit-log entries that use `MENU_SYS_MONITOR` as a fallback.

## Validation

Planned validation:

- `node scripts/ci/check-menu-permission-atomicity.mjs`
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
- migration gates
- W5 closeout gate
- production smoke after deploy

## Result

Expected conclusion after validation: GO WITH CONDITIONS.

Remaining permission debt continues in focused batches:

- generic lookup scope review;
- remaining master-data super permission fallbacks review;
- workflow form submit / runtime page route visibility review;
- role matrix production-account reconciliation.
