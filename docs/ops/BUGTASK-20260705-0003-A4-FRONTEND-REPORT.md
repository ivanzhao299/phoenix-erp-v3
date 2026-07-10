# BUGTASK-20260705-0003 A4 Frontend Report

## Result

PASS WITH CONDITIONS.

This is a frontend-only repair for `BUG-20260705-0003` / `BUGTASK-20260705-0003` on `/dashboard`. It must not be treated as fully resolved until CI/CD, production smoke, and business acceptance pass.

## Diagnosis

The original screenshot attachment was still unavailable locally. Prior local run artifacts show the attachment endpoint returned 404 for `01-1783258328672-32c6fb39.png`.

Current code inspection found a dashboard-card defect that matches the reported area: KPI money values from `/api/dashboard/kpi` can arrive as raw LAK integer strings, while the card value row was `nowrap` with hidden overflow and ellipsis. Large values could be clipped or separate the unit poorly. The chart/alert card grid was also fixed at `2fr 1fr`, which can overflow on mobile.

## Changed Files

- `apps/web/src/app/(admin)/dashboard/_components/DashboardKPIs.tsx`
- `apps/web/src/app/(admin)/dashboard/_components/dashboard.module.css`
- `apps/web/src/lib/dashboard-kpi-format.ts`
- `apps/web/src/__tests__/dashboard-kpi-format.test.ts`
- `docs/ops/BUGTASK-20260705-0003-A4-FRONTEND-REPORT.md`

## Fix Summary

- Added a shared dashboard KPI formatter that:
  - normalizes empty values to `—`;
  - strips noisy unit suffixes such as `条 · ...`;
  - formats numeric strings such as `1234567890` as `1,234,567,890`;
  - returns display density for long KPI values.
- Updated KPI cards to use density-specific classes instead of truncating values with ellipsis.
- Preserved loading skeletons, empty alert state, fetch error handling, RBAC guard logic, and quick-link permission visibility.
- Moved dashboard KPI/content grids into the local CSS module and added responsive rules for tablet/mobile.

## Validation

- `node --experimental-strip-types --input-type=module ... normalizeDashboardMetric checks` -> PASS.
- `git diff --check` -> PASS.
- Parent workspace `pnpm --filter web test -- dashboard-kpi-format.test.ts` -> PASS, 4/4 tests.
- Parent workspace Web TypeScript check -> PASS.
- Parent workspace API TypeScript check -> PASS.
- W5 closeout gate with the authorized frontend diff -> PASS.
- The dedicated Agent worktree did not contain dependencies; validation was therefore repeated in the dependency-complete parent workspace before integration.

## Conditions

Before business resolution, authenticated `/dashboard` desktop/mobile smoke, CI/CD, production smoke, and administrator business acceptance remain required.

No backend, migration, database, deploy, push, RBAC, DataScope, audit, or attachment ACL changes were made.
