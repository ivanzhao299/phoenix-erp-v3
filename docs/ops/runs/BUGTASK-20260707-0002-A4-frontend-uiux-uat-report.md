# BUGTASK-20260707-0002 A4 Frontend UIUX UAT Report

## Result

PASS WITH CONDITIONS

This is a frontend repair pass only. Do not mark BUG-20260707-0002 resolved until CI/CD, production smoke on `https://erp.eggslao.com/warehouse`, and business acceptance for user `wangweihua` are complete.

## Source Bug

- Bug: `BUG-20260707-0002`
- Task: `BUGTASK-20260707-0002`
- Route: `/warehouse`
- Symptom: opening inventory overview triggered 403 requests for `wms_zones`, `wms_inbound`, and `wms_outbound`.
- Acceptance: users with view permission should not see 403; users without view permission should not see the left menu entry.

## Diagnosis

The failing endpoints previously required `MENU_WMS_INOUT`, while `/warehouse` overview is visible with `MENU_WMS_VIEW`. The backend baseline now correctly permits read-only WMS Generic CRUD requests with `MENU_WMS_VIEW:V`; the frontend must therefore load all read-only dashboard datasets for VIEW users while keeping mutation actions behind INOUT permissions.

The sidebar already hides menu leaves through `canAccessMenuItem` / `getVisibleMenu`. The page-level data loading needed a stricter, testable request plan and optional dashboard requests needed to avoid global `api-error` toasts when they are non-blocking.

## Changed Files

- `apps/web/src/app/(admin)/warehouse/page.tsx`
  - Uses a centralized warehouse dashboard access plan.
  - Requests `wms_zones`, `wms_inbound`, and `wms_outbound` for `MENU_WMS_VIEW:V` users; write actions remain governed by `MENU_WMS_INOUT`.
  - Keeps `inv_batches` behind `MENU_WMS_VIEW:V`.
  - Adds inline non-blocking load warning for optional dashboard data failures.
  - Moves main dashboard grid to CSS module for mobile responsiveness.
- `apps/web/src/app/(admin)/warehouse/warehouse.module.css`
  - Adds desktop two-column layout and mobile single-column breakpoint at `900px`.
- `apps/web/src/lib/api-client.ts`
  - Adds backward-compatible `silent?: boolean` option to `crudApi.list`.
- `apps/web/src/lib/warehouse-dashboard-access.ts`
  - Adds pure permission/request-plan helper.
- `apps/web/src/lib/warehouse-dashboard-access.test.ts`
  - Covers `MENU_WMS_VIEW` only, `MENU_WMS_INOUT` only, and combined permission cases.

## Verification

- Dry-run diagnosis: inspected `/warehouse` page, `AuthContext.hasPermission`, `Sidebar` menu filtering, and failed request table permissions from the bug contract.
- Focused regression test:
  - `./node_modules/.bin/vitest run src/lib/warehouse-dashboard-access.test.ts --config vitest.config.ts`
  - Result: PASS, 3 tests.
- Static route/component verification:
  - `rg` confirmed protected requests are gated by `canLoadZones`, `canLoadInbounds`, and `canLoadOutbounds`.
  - `rg` confirmed dashboard mobile breakpoint exists in `warehouse.module.css`.
- Diff hygiene:
  - `git diff --check`
  - Result: PASS.

## Validation Limits

- `pnpm` could not run directly in this worktree because dependencies are not installed; `corepack pnpm --filter web test ...` failed with missing `vitest`.
- Offline install could not complete because pnpm store lacked required tarballs (`concurrently`, then `react`).
- Web typecheck could not be completed in this sandbox. A best-effort borrowed dependency run reached unrelated existing dependency/type-resolution failures, including `html2canvas` and Radix UI prop typings.
- Local Next dev server could not bind to `0.0.0.0:3000` or `127.0.0.1:3000` due sandbox `listen EPERM`, so browser screenshots were not possible.
- Desktop/mobile behavior was checked statically against the affected page layout: desktop keeps the existing two-column dashboard, mobile now collapses to one column below `900px`.

## RBAC / State Notes

- RBAC is preserved: no permission is broadened; the frontend now avoids requesting datasets that the current permission set cannot view.
- DataScope, audit behavior, and attachment ACL were not changed.
- Empty/loading states remain in place. Restricted in/out sections continue to show the existing limited-permission messaging instead of a global 403.
