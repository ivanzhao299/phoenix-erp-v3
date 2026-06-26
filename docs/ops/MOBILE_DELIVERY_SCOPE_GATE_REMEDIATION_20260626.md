# Mobile Delivery Scope Gate Remediation - 2026-06-26

## Scope

Closes a mobile DataScope/RBAC residual in the delivery workflow.

## Changes

- `apps/api/src/modules/sales-v2/controllers/mobile-delivery.controller.ts`
- `apps/web/src/app/(mobile)/mobile/dashboard/page.tsx`

## Fixes

1. Fixed mobile delivery driver role detection.
   - Before: operator precedence could collapse `roles[]` into `[user.role]` and miss multi-role driver users.
   - After: roles are resolved with `Array.isArray(user?.roles) ? user.roles : ...`.
   - Driver users are correctly restricted to their own delivery records by `driverFilter()`.

2. Mobile daily dashboard delivery section now recognizes `MENU_MOBILE_DELIVERY:V` in addition to sales/logistics menu entries.

## Safety

- Business code changed: Yes, limited to RBAC/DataScope view filtering and frontend visibility.
- DB migration executed: No.
- DB write executed: No.
- Deploy: Pending CI/CD after push.

## Validation

- API typecheck.
- Web typecheck.
- W5 closeout gate.
