# Master Data Runtime Guard Atomic Permission Remediation - 2026-06-27

## Objective

Remove the remaining master-data runtime/API fallback that allowed coarse parent-menu access to satisfy per-entity master data permissions.

## Scope

- `apps/api/src/common/guards/master-data-type.guard.ts`
- `apps/api/src/modules/master-data/master-data-runtime.controller.ts`
- `apps/api/src/modules/master-data/master-data-center.controller.ts`
- `scripts/ci/check-menu-permission-atomicity.mjs`

## Changes

1. `MasterDataTypeGuard` now requires a mapped atomic menu for every `:type`.
2. Unknown master-data runtime types now fail closed instead of falling back to parent-menu access.
3. `ROLE_ADMIN` remains the explicit administrative bypass path.
4. `master-data/code/next` now rejects unknown code prefixes instead of falling back to parent-menu access.
5. Master-data center helper permission checks no longer accept parent-menu fallback.
6. Atomic permission CI now also scans `apps/api/src/common/guards`.

## Permission Result

Users must hold the relevant atomic menu permission such as:

- `MENU_MD_CUSTOMER`
- `MENU_MD_SUPPLIER`
- `MENU_MD_PROJECT`
- `MENU_MD_MATERIAL`
- `MENU_MD_CASH_ACCOUNT`
- `MENU_MD_BANK_ACCOUNT`
- `MENU_SETTINGS_DATA`

The coarse master-data parent menu no longer grants blanket runtime access.

## Validation

- `node scripts/ci/check-menu-permission-atomicity.mjs`: PASS

Full typecheck and deployment verification are tracked in the commit execution notes for this remediation batch.

## Risk

Risk level: Medium.

This tightens API authorization. Users previously relying only on the parent menu may lose access until their role receives the correct atomic `MENU_MD_*` permission. This is intentional and aligns with the current no-unauthorized-menu-display policy.

