# Master Data Runtime DataScope Atomicity Remediation

Date: 2026-06-27

## Scope

This remediation continues the permission clean-up work for Phoenix ERP production readiness. It focuses on master-data runtime DataScope resolution.

## Issue

The master-data runtime controller already gates each `:type` route through `MasterDataTypeGuard`, which maps business types to atomic permissions such as:

- `customer` -> `MENU_MD_CUSTOMER`
- `supplier` -> `MENU_MD_SUPPLIER`
- `project` -> `MENU_MD_PROJECT`
- `cash-account` -> `MENU_MD_CASH_ACCOUNT`

However, the runtime service still resolved company DataScope with the coarse `MENU_MASTER_DATA` context. This did not directly expose a route without menu permission, but it made scope cache keys, audit reasoning, and future per-type DataScope rules depend on the broad parent menu.

## Change

- Added `OBJECT_TYPE_TO_MENU` in `MasterDataRuntimeService`.
- Updated `allowedCompanies()` to resolve DataScope using the atomic master-data menu for the current entity type.
- Added a CI atomicity guard that rejects `dataScope.resolve(..., 'MENU_MASTER_DATA')` inside `master-data-runtime.service.ts`.

## Risk

Risk level: LOW.

This does not modify database schema, migrations, seed data, frontend routes, or role assignments. It only changes the menu context used when resolving company scope for already-authorized master-data runtime requests.

## Expected Behavior

- A user with `MENU_MD_PROJECT` resolves project company scope under `MENU_MD_PROJECT`.
- A user with `MENU_MD_CUSTOMER` resolves customer company scope under `MENU_MD_CUSTOMER`.
- `ROLE_ADMIN` and user-org `GROUP` behavior remains global through `DataScopeService`.
- Requests still fail closed when company scope cannot be resolved.

## Validation

Required validation:

- `node scripts/ci/check-menu-permission-atomicity.mjs`
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
- `node scripts/check-nullable-in-unique.js`
- `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`
- `git diff --check`

## Production Boundary

- Business code changed: yes, backend permission/DataScope logic only.
- Database schema changed: no.
- Migration added or executed: no.
- DB write performed: no.
- Deployment required after merge: yes, API-only deployment is expected.

