# Master Data Frontend Atomic Permission Remediation - 2026-06-27

## Objective

Remove coarse `MENU_MASTER_DATA` frontend fallback from master-data pages that already have atomic permissions, so users do not see pages, buttons, or cross-domain panels solely because they hold the parent directory permission.

## Scope

- `MasterDataRuntimePanel` create/edit controls now use the per-type `MENU_MD_*` code only. `ROLE_ADMIN` and `*` still pass through `usePermission(...).isSuper`.
- Customer and supplier detail pages now require `MENU_MD_CUSTOMER` / `MENU_MD_SUPPLIER` for base visibility.
- Governance and data-quality dashboards now require `MENU_MD_QUALITY`.
- Operations workbench now requires `MENU_MD_CENTER`.
- Pending master-data page now filters visible pending types by each type's atomic menu permission.
- CI guard now blocks reintroducing these `MENU_MASTER_DATA` frontend fallbacks.

## User Impact

- Users without a relevant child permission will no longer see the corresponding child page or actionable entry just because a parent permission exists.
- Users with the correct atomic role still retain access to the pages and actions they should have.
- Admin users and users with `*` remain unaffected.

## Risk

Risk level: medium-low.

The change is frontend gate tightening only. It does not change database schema, backend business logic, migrations, or production data.

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

## Production Notes

This batch is safe for the standard web-only CI/CD path. After merge to `main`, production smoke should cover:

- `/api/health`
- `/home`
- `/master-data`

