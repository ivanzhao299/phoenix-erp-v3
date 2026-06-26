# Workflow Biz Registry Atomic Module Remediation - 2026-06-27

## Scope

This batch continues the RBAC cleanup for non-module coarse permissions. It targets the workflow business registry because `moduleCode` is used by approval instances, approval rules, transfer candidates, and pending task ownership.

## Problem

Several master-data approval biz types were still registered with the coarse parent menu:

- `MENU_MASTER_DATA`

That allowed approval routing and transfer candidate resolution to treat unrelated master-data subdomains as one broad domain. A user with broad master-data access could be considered for approval surfaces that should belong to a narrower leaf permission.

## Changes

Updated `apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts`:

| Biz Type | Previous Module | New Module |
| --- | --- | --- |
| `MD_CUSTOMER_CREATE` | `MENU_MASTER_DATA` | `MENU_MD_CUSTOMER` |
| `MD_SUPPLIER_CREATE` | `MENU_MASTER_DATA` | `MENU_MD_SUPPLIER` |
| `MD_PROJECT_CREATE` | `MENU_MASTER_DATA` | `MENU_MD_PROJECT` |
| `MD_PRODUCT_CREATE` | `MENU_MASTER_DATA` | `MENU_MD_PRODUCT` |
| `MD_STORE_CREATE` | `MENU_MASTER_DATA` | `MENU_MD_STORE` |
| `MD_SKU_CREATE` | `MENU_MASTER_DATA` | `MENU_MD_SKU` |
| `MD_WAREHOUSE_CREATE` | `MENU_MASTER_DATA` | `MENU_MD_WAREHOUSE` |
| `MD_GRADE_CREATE` | `MENU_MASTER_DATA` | `MENU_MD_GRADE` |
| `MD_SPEC_CREATE` | `MENU_MASTER_DATA` | `MENU_MD_PACKAGING` |
| `MD_DRIVER_CREATE` | `MENU_MASTER_DATA` | `MENU_MD_DRIVER` |
| `MD_VEHICLE_CREATE` | `MENU_MASTER_DATA` | `MENU_MD_VEHICLE` |
| `MD_ORGANIZATION_CREATE` | `MENU_MASTER_DATA` | `MENU_MD_ORG` |
| `MD_COMPANY_CREATE` | `MENU_MASTER_DATA` | `MENU_MD_COMPANY` |
| `MD_DICT_CREATE` | `MENU_MASTER_DATA` | `MENU_MD_DICT_CENTER` |
| `MD_FIELD_CHANGE` | `MENU_MASTER_DATA` | `MENU_MD_AUDIT` |

Updated `scripts/ci/check-menu-permission-atomicity.mjs`:

- Added a guard that fails if workflow biz registry maps any biz type back to `MENU_MASTER_DATA`.

## Risk

Risk level: Medium.

Reason: this changes approval module attribution. It does not change database schema, but it can affect which users are eligible for future approval routing and transfer candidate lookup. This is intended behavior for atomic permission cleanup.

## Validation Plan

- `node scripts/ci/check-menu-permission-atomicity.mjs`
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
- `node scripts/check-nullable-in-unique.js`
- `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`
- `git diff --check`

## Production Notes

- No migration.
- No database write.
- No frontend route change.
- No deployment script change.
- This is a backend RBAC semantics alignment and CI guard hardening batch.

