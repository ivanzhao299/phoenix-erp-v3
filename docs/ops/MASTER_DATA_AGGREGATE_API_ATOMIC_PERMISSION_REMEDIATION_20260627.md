# Master Data Aggregate API Atomic Permission Remediation - 2026-06-27

## Objective

Tighten master-data aggregate APIs so parent `MENU_MASTER_DATA` no longer grants broad access to operations, governance, or data-quality aggregate endpoints.

## Changes

- `GET /api/master-data/operations/centers` now requires `MENU_MD_CENTER:V`.
- `GET /api/master-data/operations/search` now requires `MENU_MD_CENTER:V`.
- `GET /api/master-data/operations/trend` now requires `MENU_MD_CENTER:V`.
- `GET /api/master-data/operations/todo` now requires `MENU_MD_CENTER:V`.
- `GET /api/master-data/governance/*` now requires `MENU_MD_QUALITY:V`.
- `GET /api/data-quality/*` now requires `MENU_MD_QUALITY:V`.
- `allowedOperationTypes` no longer treats `MENU_MASTER_DATA:V` as permission to see all master-data operation types.
- CI now blocks reintroducing `MENU_MASTER_DATA` alt-menu fallbacks in these aggregate API controllers.

## Boundary

This batch intentionally does not change deeper reference/code-generation compatibility points:

- `GET /api/master-data/references/:objectType/:objectCode`
- `POST /api/master-data/code/next`

Those paths are higher risk because they are used by type-specific master-data workflows and should be tightened in a separate batch with targeted regression.

## Risk

Risk level: medium.

Users who only hold the coarse parent `MENU_MASTER_DATA` will no longer access master-data aggregate dashboards. They must be granted `MENU_MD_CENTER` or `MENU_MD_QUALITY` as appropriate.

## Validation

Required validation:

- `node scripts/ci/check-menu-permission-atomicity.mjs`
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
- `bash scripts/check-ts-migration-no-data-dml.sh`
- `bash scripts/check-ts-migration-down.sh`
- `node scripts/check-nullable-in-unique.js`
- `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`
- `git diff --check`

