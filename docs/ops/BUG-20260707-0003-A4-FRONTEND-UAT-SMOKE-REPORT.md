# BUG-20260707-0003 A4 Frontend UAT Smoke Report

Date: 2026-07-10
Agent: A4-Frontend-UAT-Smoke
Branch: codex/bug-intake-a4
Route: `/home`
Source bug: BUG-20260707-0003
Source repair task: BUGTASK-20260707-0003
Result: PASS WITH CONDITIONS
Gate: GO TO CI/UAT ONLY

## Diagnosis

The captured failing request on `/home` was `GET /api/v3/iot/devices/all-summary` returning `403 MENU_PERMISSION_DENIED`.

Frontend diagnosis found this endpoint is used only as optional farm/IoT KPI input on the operations workbench. A finance/dashboard user should still be able to open `/home` even when optional device-monitor data is unavailable or unauthorized.

The existing `api-client` already suppresses global `api-error` toast events for requests marked `silent: true`. The frontend-owned risk was keeping the `/home` IoT summary request rule implicit inside the page component, which makes it easy to regress and reintroduce an optional 403 toast.

## Fix

The `/home` farm KPI request plan is now centralized in a small frontend helper:

- Load farm KPI data only when the user has `MENU_FARM_DATA:V`.
- Call `/api/v3/iot/devices/all-summary` only when the user has both `MENU_FARM_DATA:V` and `MENU_DEVICE_MONITOR:V`.
- Keep the IoT request `silent: true`, so a backend denial remains a silent optional-data fallback rather than a right-top error toast.

No RBAC bypass, backend change, schema change, migration, database write, deploy, or push was performed.

## Changed Files

- `apps/web/src/app/(admin)/home/page.tsx`
  - Replaced inline farm/IoT request checks with `getHomeFarmKpiRequestPlan()`.
  - Preserved existing permission visibility, empty fallback, and silent optional request behavior.
- `apps/web/src/lib/home-request-plan.ts`
  - Added a pure request-plan helper for `/home` farm KPI and optional IoT summary loading.
- `apps/web/src/lib/home-request-plan.test.ts`
  - Added focused regression cases for dashboard-only finance users, farm-only users, and farm+device users.
- `docs/ops/BUG-20260707-0003-A4-FRONTEND-UAT-SMOKE-REPORT.md`
  - This report.

## Verification

Passed:

- `git diff --check`
- Manual Node assertion of `getHomeFarmKpiRequestPlan()`:
  - `MENU_DASHBOARD:V + MENU_FIN2_REPORT:V` -> no farm KPI, no IoT summary.
  - `MENU_DASHBOARD:V + MENU_FARM_DATA:V` -> farm KPI only, no IoT summary.
  - `MENU_FARM_DATA:V + MENU_DEVICE_MONITOR:V` -> farm KPI and IoT summary.
- Static route verification:
  - `/home` still calls `/v3/iot/devices/all-summary` in exactly one guarded place.
  - That call remains `{ silent: true }`, preserving suppression of global `api-error` toast.
  - `api-client` dispatches global `api-error` only when `silent` is not true.

Attempted but blocked by local dependency state:

- `pnpm --filter web test -- src/lib/home-request-plan.test.ts src/lib/home-farm-kpi.test.ts`
  - Failed: `vitest: command not found`; `apps/web/node_modules` is missing.
- `pnpm --filter web typecheck`
  - Failed: `tsc: command not found`; `apps/web/node_modules` is missing.
- `pnpm install --frozen-lockfile --offline`
  - Failed: pnpm store is missing `concurrently-8.2.2`, and network access is unavailable in this task.

## Desktop And Mobile Check

- Desktop behavior: checked against the captured 1600x865 `/home` evidence and source route. The change does not alter layout, visible permissions, CTAs, cards, empty states, or loading states; it only changes whether the optional IoT request is planned.
- Mobile behavior: checked source-level behavior for the same `/home` component. The request plan is viewport-independent, and the existing KPI grid remains `repeat(auto-fit, minmax(180px, 1fr))`; no responsive CSS or DOM structure was changed.
- Browser smoke was not run because local web dependencies are absent and offline install is blocked.

## Conditions

PASS WITH CONDITIONS because the frontend-owned guarded request plan and focused regression test are present, but local Vitest, Web typecheck, and browser smoke could not run without dependencies.

Do not claim the production bug is fully resolved until CI/CD runs Web typecheck and focused tests, production smoke confirms `/home` for the reporter or equivalent finance role does not show `[403] MENU_PERMISSION_DENIED`, and business acceptance is recorded.
