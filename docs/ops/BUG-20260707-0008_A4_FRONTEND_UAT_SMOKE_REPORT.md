# BUG-20260707-0008 A4 Frontend UAT Smoke Report

Date: 2026-07-12
Agent: A4-Frontend-UIUX-UAT
Branch: `codex/bug-intake-a4`
Route: `/breeding`
Result: PASS WITH CONDITIONS
Release Gate: HOLD

## Source Bug

- Bug: `BUG-20260707-0008`
- Task: `BUGTASK-20260707-0008`
- Title: 养殖总览的今日产蛋、今日死淘都显示0
- Acceptance: 养殖总览的今日产蛋、今日死淘按今日实际提交的日生产日报总数展示。

## Diagnosis

The `/breeding` overview headline cards are frontend-computed from `brd_daily_logs`.
The affected cards must not depend on stale/unbounded all-log results or brittle date comparison.

Root cause on the frontend side:

- Today metrics were derived from the generic all-log read and then filtered in the page.
- Date comparison needed one shared normalizer for date-only and ISO timestamp shapes.
- 今日死淘 must aggregate both `mortality_qty` and `elimination_qty`.

Backend/RBAC/DataScope paths were not changed by this agent.

## Changed Files

- `apps/web/src/app/(admin)/breeding/page.tsx`
- `apps/web/src/lib/breeding-overview-metrics.ts`
- `apps/web/src/lib/breeding-overview-metrics.test.ts`
- `docs/ops/BUG-20260707-0008_A4_FRONTEND_UAT_SMOKE_REPORT.md`

## Frontend Fix

- Added a pure frontend metric helper for breeding overview daily-log totals.
- Normalized daily-log dates through one helper for `YYYY-MM-DD`, ISO timestamp strings, `Date`, and numeric date inputs.
- Added a date-filtered today read:
  - `/api/crud/brd_daily_logs?log_date=<today>&limit=1000`
- Kept the existing all-log read for week summary and farm recent-rate calculations.
- Preserved fallback behavior: if the today read fails, the page falls back to the existing all-log payload.
- Changed 今日死淘 and 本周死淘累计 math to use `mortality_qty + elimination_qty`.

## Permission / State Coverage

- Permission visibility: preserved. No new visible entry point, bypass, or hardcoded permission was added.
- RBAC/DataScope: preserved. The page still calls the protected Generic CRUD endpoint with the existing bearer token.
- Loading/empty/error state: preserved. Existing farm API failure guard still prevents wiping displayed data; empty farm state remains unchanged.
- Attachment ACL/audit: not applicable; no attachment or write path changed.
- Responsive behavior: no layout, CSS, DOM structure, or card sizing changed. The change is data fetching and pure metric calculation only.

## Validation

PASS:

- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
- `cd apps/web && ./node_modules/.bin/tsc --noEmit --pretty false`
- `cd apps/web && ./node_modules/.bin/vitest run src/lib/breeding-overview-metrics.test.ts`
  - 1 file passed
  - 4 tests passed
- `git diff --check -- apps/web/src/app/\(admin\)/breeding/page.tsx apps/web/src/lib/breeding-overview-metrics.ts apps/web/src/lib/breeding-overview-metrics.test.ts`
- `cd apps/web && ./node_modules/.bin/next build --webpack --debug-build-paths 'src/app/(admin)/breeding/page.tsx'`
  - Compiled successfully
  - TypeScript finished successfully

Observed local command caveats:

- `pnpm --dir apps/web test src/lib/breeding-overview-metrics.test.ts`: FAIL, local pnpm returned `packages field missing or empty`.
- `cd apps/web && pnpm test src/lib/breeding-overview-metrics.test.ts`: FAIL, same pnpm issue.
- Direct Vitest binary was used instead and passed.

Browser smoke:

- Desktop `/breeding`: HOLD. Local Next dev server could not be started because binding a local socket is blocked in this sandbox:
  - `next dev -p 3014`: `listen EPERM 0.0.0.0:3014`
  - `next dev -H 127.0.0.1 -p 3014`: `listen EPERM 127.0.0.1:3014`
- Mobile `/breeding`: HOLD for the same local socket restriction.
- Since no layout/CSS/DOM structure changed, static responsive risk is low, but real desktop/mobile browser smoke remains required before release acceptance.

Full build:

- `cd apps/web && ./node_modules/.bin/next build --webpack`: FAIL due environment/dependency conditions outside this patch:
  - Google Fonts fetch blocked through local proxy `127.0.0.1:7890`.
  - Existing `node_modules` symlink targets point outside the accessible filesystem root for some dependencies.

## Decision

PASS WITH CONDITIONS.

The frontend-owned fix and focused regression coverage are in place, and local typecheck/unit/route compile checks pass. Release remains HOLD until CI/CD, production smoke, and business acceptance confirm that `/breeding` 今日产蛋 and 今日死淘 match today’s submitted daily production reports in the target environment.
