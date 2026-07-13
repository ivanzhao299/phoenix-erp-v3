# BUG-20260713-0002 A4 Frontend UIUX UAT Report

## Source

- Bug: `BUG-20260713-0002`
- Task: `BUGTASK-20260713-0002`
- Assigned agent: `A4-Frontend-UAT-Smoke`
- Intake route: `/bug-reports`
- Affected frontend route: `/sales2/pricing`
- Acceptance target: restore `孟赛标准价格册（试运行版）` to enabled/in-use status and delete `孟赛标准价格册（试运行版）重建`.

## Diagnosis

The bug report asks for two guarded price-book lifecycle operations. The existing pricing page listed price books and supported create/edit/submit/activate/expire/cancel, but it did not expose frontend controls for:

- restoring a `CANCELLED` price book through the guarded restore operation;
- deleting a duplicate `DRAFT` price book through the guarded delete operation.

The fix is frontend-owned because the page was missing the action affordances and permission visibility gates. No database write, migration, deployment, or task-board mutation was performed.

## Changed Files

- `apps/web/src/app/(admin)/sales2/pricing/page.tsx`
- `apps/web/src/__tests__/sales-pricing-lifecycle-actions.test.ts`
- `docs/ops/BUG-20260713-0002_A4_FRONTEND_UIUX_UAT_REPORT.md`

## Frontend Fix

- Added `usePermission("MENU_SALES2_PRICE")` to the price-book tab.
- Gated `新建价格册` behind `MENU_SALES2_PRICE:C`.
- Gated draft edit/cancel/expire mutation controls behind edit permission where applicable.
- Added `恢复` for `CANCELLED` price books behind `MENU_SALES2_PRICE:A`, calling `POST /api/v2/sales/pricing/books/:id/restore`.
- Added `删除` for `DRAFT` price books behind `MENU_SALES2_PRICE:D`, calling `DELETE /api/v2/sales/pricing/books/:id`.
- Added danger confirmation state for deletion while preserving existing loading, empty, and API error display paths.

## Permission / State Notes

- Unauthorized users do not see the newly added restore/delete/create controls.
- Backend 403/400/409 responses still surface through the existing `errorMsg` alert.
- List loading and empty states remain unchanged.
- No attachment ACL, DataScope, or audit bypass was introduced; the frontend only calls existing guarded API paths.

## Responsive / UAT Notes

- The existing toolbar uses wrapping controls and the row action area remains `flexWrap: "wrap"`, so the added buttons follow the current desktop/mobile layout pattern.
- True desktop and mobile browser smoke could not be completed in this sandbox because `next dev` failed with `listen EPERM` on both `127.0.0.1:3000` and `127.0.0.1:3017`.
- Production data state was not changed. The named price books still require an approved runtime/data operation plus production smoke and business acceptance.

## Validation

- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
  - Passed.
- `cd apps/web && ./node_modules/.bin/vitest run src/__tests__/sales-pricing-lifecycle-actions.test.ts`
  - Passed: 1 file, 3 tests.
- `git diff --check -- apps/web/src/app/'(admin)'/sales2/pricing/page.tsx apps/web/src/__tests__/sales-pricing-lifecycle-actions.test.ts`
  - Passed.
- `cd apps/web && ./node_modules/.bin/next build`
  - Blocked by Turbopack symlink sandbox issue: `Symlink [project]/apps/web/node_modules is invalid, it points out of the filesystem root`.
- `cd apps/web && ./node_modules/.bin/next build --webpack`
  - Blocked by restricted/offline environment: `getaddrinfo ENOTFOUND fonts.googleapis.com`, plus broken cross-worktree node_modules symlink resolution.

## Result

PASS WITH CONDITIONS

The frontend recovery controls are implemented and statically verified. Do not mark the source bug resolved until CI/CD passes, a real desktop/mobile production smoke confirms the controls, the approved runtime operation updates the two named price books, and business acceptance confirms the expected pricing state.
