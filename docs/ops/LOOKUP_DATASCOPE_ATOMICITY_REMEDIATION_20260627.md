# Lookup DataScope Atomicity Remediation - 2026-06-27

## Scope

This remediation removes the remaining coarse `MENU_MASTER_DATA` DataScope context from the high-frequency `/api/lookup/*` business lookup controller.

## Problem

`LookupController.resolveCompanyScope()` previously resolved company scope with `MENU_MASTER_DATA` for all lookup types. That made business forms such as procurement payment project selection, supplier selection, shareholder fund entry, warehouse selection, and cash-account selection depend on a broad master-data context instead of the leaf menu that matches the business data being referenced.

## Change

- `resolveCompanyScope(scopeMenu)` now accepts an explicit atomic context menu.
- Company lookup uses `MENU_MD_COMPANY`.
- Project lookup uses `MENU_PRC2_PROJECT`.
- Customer lookup uses `MENU_MD_CUSTOMER`.
- Supplier lookup uses `MENU_PRC2_SUPPLIER`.
- Shareholder lookup uses `MENU_SHAREHOLDER_VIEW`.
- User lookup uses `MENU_SETTINGS_USER`.
- Warehouse and batch lookup use `MENU_MD_WAREHOUSE`.
- Store lookup uses `MENU_MD_STORE`.
- Farm / house / flock lookup uses `MENU_BREEDING`.
- Cash-account lookup uses `MENU_FIN2_CASH_VIEW`.
- `check-menu-permission-atomicity.mjs` now fails if lookup DataScope falls back to coarse `MENU_MASTER_DATA`.

## Production Impact

- No schema change.
- No migration.
- No DB write.
- No deploy script change.
- No business data changed.
- Procurement payment project lookup continues to use `/api/lookup/projects`, but its DataScope context is now atomic and aligned with project access.

## Validation

- `node scripts/ci/check-menu-permission-atomicity.mjs`: PASS
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`: PASS
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`: PASS

## Conclusion

GO. Lookup DataScope no longer depends on the coarse master-data parent permission.
