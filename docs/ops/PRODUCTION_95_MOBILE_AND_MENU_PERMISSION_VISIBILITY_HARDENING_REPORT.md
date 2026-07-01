# Production 95 Mobile and Menu Permission Visibility Hardening Report

## Scope

This batch continues the role permission cleanup after the navigation gate was tightened to `MENU_*:V` visibility.

## Findings

Role matrix audit:

- `scripts/ops/audit-role-permission-matrix.mjs --dry-run`
- Result: PASS
- Non-admin coarse parent menu grants found: 0

Static gate audit:

- `scripts/ci/check-menu-permission-atomicity.mjs`
- Result: PASS
- Known coarse menu permission regressions found: 0

Sensitive controller audit:

- `scripts/ci/check-sensitive-menu-guards.mjs`
- Result: PASS
- Sensitive controller menu guard findings: 0

Frontend gate audit:

- Existing frontend menu gates passed.
- Additional guardrails were added to prevent future regressions.

## Changes

Changed files:

- `apps/web/src/hooks/usePermission.ts`
- `apps/web/src/lib/mobile-roles.ts`
- `apps/web/src/__tests__/mobile-roles.test.ts`
- `scripts/ci/check-frontend-menu-gates.mjs`

Behavior changes:

- Mobile JWT menu permissions now require `V` before a page is visible.
- Mobile write-level access now requires `V` plus at least one write action bit (`C`, `E`, or `A`).
- Legacy `MOBILE_<PAGEKEY>` entries also require `V`; write-only legacy entries fail closed.
- Shared `usePermission(menuCode).hasAccess` now means `MENU_*:V`, not any action bit.
- Terminal workbench tiles now require `MENU_*:V` before they are visible.
- CI frontend menu gate now asserts:
  - sidebar visibility defaults to `V`;
  - home navigation cards require `V`;
  - mobile JWT visibility requires `V` before write/read.
  - `usePermission.hasAccess` remains aligned with `V` visibility.
  - terminal workbench tiles remain aligned with `V` visibility.

## Why

Without this rule, a user could receive an action bit such as `E` or `A` and still see a page/card even without view permission. That is the same class of issue as the PC menu/card leakage fixed earlier.

## Boundaries

- No database write.
- No migration.
- No deploy script change.
- No backend business logic change.
- No production configuration change.

## Validation Results

- Role permission matrix audit: PASS, findings 0.
- Menu permission atomicity gate: PASS.
- Sensitive menu guard gate: PASS.
- Frontend menu gate alignment: PASS.
- Mobile role unit test: PASS, 28/28.
- Web typecheck: PASS.
- API typecheck: PASS.
- i18n key gate: PASS.
- W5 closeout gate: PASS.

Note: `pnpm test -- mobile-roles.test.ts` was blocked by the local pnpm build-script approval policy before test execution. The same test was executed through the existing local Vitest binary: `./node_modules/.bin/vitest run src/__tests__/mobile-roles.test.ts`.

## Conclusion

GO WITH CONDITIONS.

The role matrix currently has no non-admin coarse parent grants in the audited local database. The next cleanup batch should focus on route-level and button-level permission alignment in approval, procurement, finance, master data, and system settings.
