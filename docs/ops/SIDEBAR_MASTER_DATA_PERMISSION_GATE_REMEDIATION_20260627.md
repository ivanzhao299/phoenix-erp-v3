# Sidebar / Master Data Permission Gate Remediation - 2026-06-27

## Scope

This batch continues frontend permission cleanup for menu tree accuracy and noisy 403 prevention.

## Issues Fixed

1. Sidebar sales overview used coarse `MENU_SALES2`.
2. Sidebar master-data overview used coarse `MENU_MASTER_DATA` as the direct leaf permission.
3. Sidebar master-data pending was visible only to `MENU_MASTER_DATA`, hiding the page from users who legitimately own customer/supplier/project/cash-account master-data permissions.
4. Master-data pending page fetched all pending types instead of only types visible to the current user.
5. Master-data operations and governance pages could request their APIs before permission gating, producing avoidable permission noise for users who open a stale/deep link.

## Changes

- `s2-overview` now uses `MENU_SALES2_DASHBOARD` with sales leaf permissions as fallback.
- `mdc-overview` now uses `MENU_MD_CENTER` with `MENU_MASTER_DATA` only as `superPerm`.
- `mdc-pending` now appears for relevant atomic master-data owners and `MENU_MASTER_DATA` super users.
- Pending page filters fetches by visible master-data type permissions.
- Operations/governance pages only load data when the user can view the page.
- CI atomicity guard now blocks regressions for these sidebar leaves.

## Validation

- `node scripts/ci/check-menu-permission-atomicity.mjs`: PASS
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`: PASS

## Result

GO.

The frontend no longer exposes these leaf entries by coarse parent menu codes, and deep-link permission noise is reduced.
