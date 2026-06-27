# Sidebar Master Data Atomic Permission Remediation

Date: 2026-06-27

## Scope

This batch removes the frontend `MENU_MASTER_DATA` super-permission fallback from master-data sidebar children. The sidebar now displays master-data child routes only when the user has the matching atomic `MENU_MD_*` permission, while users with `*` still keep full access through the standard permission checker.

## Changes

- Removed `superPerm: "MENU_MASTER_DATA"` from master-data overview.
- Removed `superPerm: "MENU_MASTER_DATA"` from organization/company/business-unit/project/customer/supplier/material/product/grade/spec/SKU/warehouse/store/driver/vehicle/cash-account/bank-account sidebar entries.
- Removed `superPerm: "MENU_MASTER_DATA"` from master-data pending entry.
- Updated sidebar comments to reflect atomized frontend menu visibility.
- Added CI regression guard blocking `MENU_MASTER_DATA` as sidebar `superPerm`.

## Expected Behavior

- Users with only one master-data atomic permission see only that corresponding child entry.
- Users without any master-data child permission do not see the parent master-data directory.
- Users with `*` continue to see all entries.
- Roles that need broad master-data access should be granted the required `MENU_MD_*` permissions explicitly.

## Risk Boundary

- Business code changed: yes, frontend navigation visibility only.
- Backend changed: no.
- DB migration: no.
- DB write: no.
- Deployment required: web-only CI/CD after merge.

## Verification

Required before merge:

- `node scripts/ci/check-menu-permission-atomicity.mjs`
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
- `bash scripts/check-ts-migration-no-data-dml.sh`
- `bash scripts/check-ts-migration-down.sh`
- `node scripts/check-nullable-in-unique.js`
- `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`
- `git diff --check`

## Result

Pending validation in this working batch.
