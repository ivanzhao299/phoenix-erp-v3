# Master Data Pending Atomic Visibility Remediation - 2026-06-27

## Scope

This batch continues the global menu/RBAC cleanup by aligning the master-data pending approval entry and page with all per-type master-data permissions.

## Problem

`/master-data/pending` and the sidebar entry only covered a small subset of master-data types:

- customer
- supplier
- project
- cash account

This was too narrow after the approval registry and master-data runtime were atomized. Users responsible for product, material, store, warehouse, organization, company, dictionary, bank-account, driver, vehicle, grade, packaging, or SKU approvals could miss the pending approval entry even though they own the relevant leaf permission.

## Changes

Updated `apps/web/src/components/layout/Sidebar.tsx`:

- Expanded `mdc-pending.altPerms` to include all relevant master-data leaf permissions.
- Kept `MENU_MASTER_DATA` only as the explicit super permission fallback.

Updated `apps/web/src/app/(admin)/master-data/pending/page.tsx`:

- Expanded pending data types to match master-data runtime supported types.
- Added per-type permission checks for:
  - `MENU_MD_CUSTOMER`
  - `MENU_MD_SUPPLIER`
  - `MENU_MD_PROJECT`
  - `MENU_MD_MATERIAL`
  - `MENU_MD_PRODUCT`
  - `MENU_MD_GRADE`
  - `MENU_MD_PACKAGING`
  - `MENU_MD_SKU`
  - `MENU_MD_WAREHOUSE`
  - `MENU_MD_STORE`
  - `MENU_MD_DRIVER`
  - `MENU_MD_VEHICLE`
  - `MENU_MD_CASH_ACCOUNT`
  - `MENU_MD_BANK_ACCOUNT`
  - `MENU_MD_ORG`
  - `MENU_MD_COMPANY`
  - `MENU_SETTINGS_DATA`

Updated `scripts/ci/check-menu-permission-atomicity.mjs`:

- Added guards to ensure the sidebar pending entry and pending page keep full atomic coverage.

## Expected Behavior

- A user with only a relevant leaf master-data permission can see the pending entry and only the matching pending type section.
- A user without any relevant master-data permission does not see the pending entry.
- `MENU_MASTER_DATA` remains a super-permission fallback for administrators.

## Validation Plan

- `node scripts/ci/check-menu-permission-atomicity.mjs`
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
- `node scripts/check-nullable-in-unique.js`
- `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`
- `git diff --check`

## Production Notes

- No migration.
- No database write.
- No API behavior change.
- Frontend visibility is now aligned with per-type master-data ownership.

