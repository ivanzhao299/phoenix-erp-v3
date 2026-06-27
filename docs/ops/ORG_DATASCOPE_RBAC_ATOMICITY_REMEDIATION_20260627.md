# Org / DataScope RBAC Atomicity Remediation — 2026-06-27

## Scope

This batch removes another coarse permission hotspot around organization, company, business-unit, and data-scope management.

## Problem

Several high-risk entries still shared `MENU_SYS_ORG`:

- Master data organization tree
- Company archive
- Business-unit membership management
- Settings data-scope rules
- User organization binding endpoints

That caused two production-grade issues:

- Users could see broad parent menus or child entries that did not match their actual role boundary.
- Frontend pages could show write buttons first, then rely on backend `403` after the click.

## Changes

### New Atomic Menu Codes

Added migration:

- `apps/api/src/database/migrations/1782049418112-SeedOrgDataScopeAtomicMenus.ts`

New menu codes:

- `MENU_MD_ORG`
- `MENU_MD_COMPANY`
- `MENU_MD_BUSINESS_UNIT`
- `MENU_SETTINGS_DATA_SCOPE`

The migration inherits current `MENU_SYS_ORG` permissions into the new atomic menu codes as a compatibility bridge. Future role cleanup can safely remove over-broad legacy grants after role-owner review.

### Backend

Updated API guards:

- `/api/organizations/**` now uses `MENU_MD_ORG` as primary permission.
- `/api/org/organizations/**` now uses `MENU_MD_COMPANY` or `MENU_MD_ORG` depending on read/write path.
- `/api/org/data-scopes/**` and user scope endpoints now use `MENU_SETTINGS_DATA_SCOPE`.
- `/api/business-units/**` now uses `MENU_MD_BUSINESS_UNIT`.

Compatibility:

- Legacy `MENU_SYS_ORG`, `MENU_ORG_VIEW`, and `MENU_ORG_MANAGE` are retained only as `altMenus` where needed.
- `MENU_SETTINGS_USER` is allowed only for read paths and user-organization binding paths required by user management.

### Frontend

Updated page and menu gates:

- Sidebar organization entry -> `MENU_MD_ORG`
- Sidebar business-unit entry -> `MENU_MD_BUSINESS_UNIT`
- Sidebar company entry -> `MENU_MD_COMPANY`
- Sidebar data-scope entry -> `MENU_SETTINGS_DATA_SCOPE`
- Company page now uses `MENU_MD_COMPANY`
- Business-unit page now uses `MENU_MD_BUSINESS_UNIT`
- Organization page now gates create/edit/delete buttons by `MENU_MD_ORG:C/E/D`
- Data-scope page now gates create/edit/delete/toggle buttons by `MENU_SETTINGS_DATA_SCOPE:C/E/D`
- Organization members panel now gates add/update/remove by `MENU_SETTINGS_DATA_SCOPE`

### CI Regression

Extended:

- `scripts/ci/check-menu-permission-atomicity.mjs`

New regression checks prevent these routes/pages from reverting to coarse `MENU_SYS_ORG`.

## Validation

Passed:

- `node scripts/ci/check-menu-permission-atomicity.mjs`
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
- `node scripts/check-nullable-in-unique.js`
- `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`
- `git diff --check`

## Risk

Risk level: Medium.

Reason: this touches security gates and menu-role rollout. The migration intentionally inherits legacy grants first to avoid sudden production lockout. A later role-owner reviewed cleanup can remove legacy `MENU_SYS_ORG` grants from non-admin roles.

## Result

Conclusion: GO WITH CONDITIONS.

Conditions:

- Apply/deploy migration through CI/CD.
- Re-login is required for users to receive refreshed JWT permissions.
- Follow-up role matrix cleanup should remove unnecessary legacy `MENU_SYS_ORG` grants after business owner confirmation.

## Next Recommended Batch

Continue non-module atomic permission cleanup:

1. Review duplicate permission-set controller routes.
2. Audit remaining frontend center cards for parent permission fallbacks.
3. Prepare role-owner reviewed removal plan for broad legacy non-admin grants.
