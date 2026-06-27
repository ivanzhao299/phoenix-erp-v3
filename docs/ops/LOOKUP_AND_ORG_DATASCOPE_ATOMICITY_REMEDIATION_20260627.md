# Lookup and Org DataScope Atomicity Remediation

Date: 2026-06-27

## Scope

This batch continues the production-readiness RBAC cleanup by removing remaining coarse master-data and legacy organization fallbacks from high-frequency lookup and organization scope paths.

## Changes

1. Procurement material quick-create
   - File: `apps/api/src/modules/product-master/controllers/lookup.controller.ts`
   - Before: `MENU_PRC2_REQUEST:C` with fallback to `MENU_PRC2_ORDER`, `MENU_MD_MATERIAL`, and coarse `MENU_MASTER_DATA`.
   - After: `MENU_PRC2_REQUEST:C` with fallback only to `MENU_PRC2_ORDER` and `MENU_MD_MATERIAL`.
   - Result: users can still create materials from procurement or material-master authority, but a broad master-data parent grant no longer opens this write helper.

2. Business project selector API
   - File: `apps/api/src/modules/master-data/biz-projects.controller.ts`
   - Before: `MENU_PRC2_PROJECT:V` with coarse `MENU_MASTER_DATA` fallback.
   - After: `MENU_PRC2_PROJECT:V` with `MENU_MD_PROJECT` fallback.
   - Result: procurement project users and project master-data users can load projects, without relying on the master-data parent menu.

3. Organization service DataScope context
   - File: `apps/api/src/modules/org/services/org.service.ts`
   - Before: org visibility resolved with legacy `MENU_SYS_ORG`.
   - After: org visibility resolves with atomic `MENU_MD_ORG`.
   - Result: organization tree row filtering aligns with the atomic organization menu context instead of the legacy parent system-org code.

4. CI guard expansion
   - File: `scripts/ci/check-menu-permission-atomicity.mjs`
   - Added static checks to prevent reintroducing:
     - `MENU_MASTER_DATA` fallback in product lookup write helpers;
     - `MENU_MASTER_DATA` fallback in biz project selectors;
     - `MENU_SYS_ORG` DataScope context in `OrgService`.

## Production Impact

- No schema/entity/table/column changes.
- No migration.
- No DB writes.
- No deployment script changes.
- Business flow remains available through atomic procurement/material/project/org permissions.

## Validation

Planned validation:

- `node scripts/ci/check-menu-permission-atomicity.mjs`
- API typecheck
- Web typecheck
- nullable unique gate
- W5 closeout gate
- `git diff --check`

## Result

GO WITH CONDITIONS. This closes another layer of coarse parent-menu leakage. Remaining work continues on role permission matrix cleanup, legacy fallback reduction, and UI hidden-menu consistency.
