# Mobile Permission Menu Matrix Remediation - 2026-06-27

## Scope

This batch tightens mobile entry visibility and mobile page guards so they no longer rely on role-name matrix matches when a user already has a runtime menu permission snapshot.

## Problem

The mobile home cards and mobile page guard shared `getMobileAccessLevel()`, but the runtime permission parser only understood legacy `MOBILE_<PAGEKEY>` entries. Normal Phoenix ERP JWT permission snapshots use atomic `MENU_*` codes, so users could still pass through the hard-coded role matrix even when they did not hold the corresponding menu permission.

This created the same class of issue reported by users:

- a user sees mobile cards or child entries that should not be visible;
- clicking them may lead to no-permission pages;
- role aliases can over-expose mobile functions when menu grants are narrower.

## Changes

Updated:

- `apps/web/src/lib/mobile-roles.ts`
- `apps/web/src/hooks/useMobilePermission.ts`
- `scripts/ci/check-menu-permission-atomicity.mjs`

## Runtime Rule

Mobile access now follows this order:

1. `*` super permission allows write.
2. Legacy `MOBILE_<PAGEKEY>` permission remains supported for compatibility.
3. Atomic `MENU_*` permissions are checked through `PAGE_MENU_PERMS`.
4. If a JWT permission snapshot exists and a mobile page has `PAGE_MENU_PERMS`, absence of the required menu permission means `none`.
5. The old role matrix is only used when no permission snapshot is available or a page has no menu mapping.

## Page Mapping Added

The mapping covers:

- dashboard
- feed
- mortality
- egglog
- henhouse
- henreport
- analytics
- packaging
- quality
- egg
- sales
- medicine
- delivery
- terminal
- prc_request
- prc_order
- workflow
- notifications
- expenses

High-frequency and high-risk entries are now tied to atomic menu codes, including:

- `MENU_PRC2_REQUEST`
- `MENU_PRC2_ORDER`
- `MENU_WORKFLOW_TODO`
- `MENU_WORKFLOW_NOTIFY`
- `MENU_FIN2_EXPENSE`
- `MENU_FIN2_REIMBURSE`
- `MENU_QA_OP`
- `MENU_QA_MGR`
- `MENU_QA_MASTER`
- `MENU_MOBILE_DELIVERY`

## CI Guard

`scripts/ci/check-menu-permission-atomicity.mjs` now fails if:

- mobile runtime permission comments regress to `MOBILE_*`-only semantics;
- `PAGE_MENU_PERMS` is missing;
- required procurement, workflow, finance, quality, or mobile delivery menu mappings are removed;
- the "permission snapshot is authoritative" guard is removed.

## Validation

Planned validation for this batch:

- `node scripts/ci/check-menu-permission-atomicity.mjs`
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
- `bash scripts/check-ts-migration-no-data-dml.sh`
- `bash scripts/check-ts-migration-down.sh`
- `node scripts/check-nullable-in-unique.js`
- `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`
- `git diff --check`

## Result

Expected conclusion after validation: GO WITH CONDITIONS.

Remaining work continues in the broader permission debt queue:

- role-permission matrix review for production user groups;
- API route audit for AuthGuard-only endpoints;
- frontend card/button-level action-bit review for approval, procurement, finance, master data, and settings.
