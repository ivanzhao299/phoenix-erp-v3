# BUGTASK-20260718-0001 A4 Frontend UAT Smoke Report

## Result

**PASS WITH CONDITIONS**

The frontend calculation has been corrected locally. This report does not claim the production bug is resolved; CI/CD, production smoke testing, and business acceptance remain required.

## Source bug

- Bug: `BUG-20260718-0001`
- Task: `BUGTASK-20260718-0001`
- Issue: mobile 每日看板死淘数只显示死亡数，未包含淘汰数
- Affected routes: `/mobile/dashboard` (acceptance route) and `/breeding/daily` (task route)
- Acceptance example: death `5` + elimination `3` = dead-cull `8`

## Diagnosis and root cause

Both frontend summaries labeled “死淘” only summed the mortality/death field:

- `/mobile/dashboard` summed `mortality_qty` and omitted `elimination_qty` in the overall KPI and per-house table.
- `/breeding/daily` summed `deaths` and omitted `elimination` in the live “合计死淘” KPI.

The API payload already exposes separate mortality and elimination values. No API, RBAC, DataScope, schema, migration, or database change is required. The intake classifier's `RBAC_403` signal is not supported by the supplied failed-request/console evidence and is unrelated to this arithmetic defect.

## Changed files

- `apps/web/src/app/(mobile)/mobile/dashboard/page.tsx`
  - Overall and per-house dead-cull totals now use the shared `dailyLogMortalityTotal` calculation (`mortality_qty + elimination_qty`).
- `apps/web/src/app/(admin)/breeding/daily/page.tsx`
  - Live “合计死淘” now sums `deaths + elimination` across shifts.
- `apps/web/src/lib/breeding-overview-metrics.test.ts`
  - Added the exact reported regression example: `5 + 3 = 8`.
- `apps/web/src/lib/mobile-api.ts`
  - Declared the existing optional `elimination_qty` response field used by the dashboard.
- `apps/web/src/lib/breeding-overview-metrics.ts`
  - Narrowed the shared dead-cull helper input contract to the two fields it reads.
- `docs/ops/BUGTASK-20260718-0001-a4-frontend-uat-smoke.md`
  - This task report.

## Preservation checks

- Permission visibility: unchanged; existing `useMobilePermission` and `usePermission('MENU_FARM_DAILY')` gates remain intact.
- DataScope: unchanged; existing scoped API loaders remain intact.
- Loading, empty, and error states: unchanged; only successful-data arithmetic changed.
- Attachment ACL and audit behavior: not involved and unchanged.
- Responsive behavior: no markup or CSS changed. Mobile KPI/table and desktop summary retain their existing layouts.

## Verification

Executed from `apps/web` unless stated otherwise:

- `./node_modules/.bin/vitest run src/lib/breeding-overview-metrics.test.ts` — **PASS**, 1 file / 4 tests. Includes the reported `5 + 3 = 8` case.
- `./node_modules/.bin/tsc --noEmit` — **PASS**, zero TypeScript errors.
- Focused ESLint over the two routes and three supporting files — **CONDITION**: the command reports 9 errors and 14 warnings already present outside the changed lines (legacy `any`, effect-state and unused-symbol findings). The changed arithmetic/type lines add no new reported lint finding.
- `git diff --check` — **PASS**, no whitespace errors.
- Static route inspection — **PASS**: overall mobile KPI, per-house mobile table, and desktop live summary all use death + elimination; RBAC and loading/error/empty branches are unchanged.
- Desktop/mobile runtime smoke — **HOLD in local sandbox**: no server was running on ports 3000/3100, and starting Next locally failed with `listen EPERM ... 0.0.0.0:3000`. No authenticated local runtime was available. Because the patch changes no markup or CSS, code-level responsive review found no layout impact; post-deploy visual smoke is still mandatory.

## Conditions before closure

1. CI must pass on the repaired commit.
2. After deployment, smoke `/mobile/dashboard` at a mobile viewport and `/breeding/daily` at a desktop viewport with a scoped test user.
3. Business acceptance must confirm the production example displays `8` for death `5` plus elimination `3`.
4. The source screenshot was not synced locally, so production visual comparison remains outstanding.
