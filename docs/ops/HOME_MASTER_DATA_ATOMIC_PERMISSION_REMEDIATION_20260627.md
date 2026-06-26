# Home Master Data Atomic Permission Remediation

Date: 2026-06-27

## Scope

This batch tightens the home workbench master-data entry visibility. It removes coarse `MENU_MASTER_DATA` frontend fallback from home shortcuts and governance widgets so users only see master-data child entries they actually hold through atomic `MENU_MD_*` permissions.

## Changes

- Removed `MENU_MASTER_DATA` fallback from home customer center shortcut.
- Removed `MENU_MASTER_DATA` fallback from home supplier center shortcut.
- Removed `MENU_MASTER_DATA` fallback from home data-quality shortcut.
- Restricted data-quality cockpit visibility to `MENU_MD_QUALITY`.
- Restricted master-data operations center loading to `MENU_MD_CENTER`.
- Added CI regression guard preventing `MENU_MASTER_DATA` from returning to home shortcut or KPI visibility logic.

## Risk Boundary

- Business code changed: yes, frontend visibility logic only.
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
