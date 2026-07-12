# BUG-20260706-0002 A4 Frontend UAT Smoke Report

Source bug: `BUG-20260706-0002`
Source repair task: `BUGTASK-20260706-0002`
Route: `/home`
Agent: `A4-Frontend-UAT-Smoke`
Date: 2026-07-12

## Result

`PASS WITH CONDITIONS`

This is a frontend-owned repair for the `/home` operations workbench KPI composition. It does not claim production resolution. CI/CD, production smoke on `https://erp.eggslao.com/home`, and business acceptance from the reporter or equivalent operations/admin role are still required.

## Diagnosis

The `/home` page already requests three read-only sources for farm KPI cards when the user has `MENU_FARM_DATA:V`:

- `/api/v3/farm/daily-hen-report?date=<today>`
- `/api/crud/brd_daily_logs?log_date=<today>&limit=500`
- optional `/api/v3/iot/devices/all-summary` only when `MENU_DEVICE_MONITOR:V` is present

The feed and water cards were built by preferring the daily hen report totals before the breeding daily log rows. That made `/home` vulnerable to showing stale `0`, `--`, or omitted feed/water values even when the authoritative daily log rows already contained `feed_consumed` and `water_consumed`.

The source bug title is "运营工作台不显示今日饲料消耗、今日用水". The client snapshot showed the `/home` KPI strip present, including `kg` and `L` units, but did not provide local screenshot files in this worktree. No backend/schema/database change is required for this frontend-owned fix.

## Changed Files

- `apps/web/src/lib/home-farm-kpi.ts`
  - Feed and water now prefer summed `brd_daily_logs` values before falling back to hen-report totals and IoT summaries.
  - Replaced helper `any` usage with `unknown` + guarded record access in the touched KPI composition helper.
- `apps/web/src/lib/home-farm-kpi.test.ts`
  - Added regression coverage proving today daily log rows override mismatched hen-report feed/water totals.
  - Kept fallback coverage for hen-report totals when daily logs do not contain feed/water fields.

## Permission / State Preservation

- RBAC is preserved: `/home` still renders and requests farm KPI data only through the existing `getHomeFarmKpiRequestPlan(hasPermission)` gate.
- Optional device summary behavior is preserved: IoT summary is still requested only with `MENU_DEVICE_MONITOR:V`.
- Error handling is preserved: all three KPI requests still use `silent: true` and degrade to `null` rather than raising global toasts.
- Empty/zero semantics are preserved: explicit daily log `0` feed/water values remain known values and do not fall through to IoT fallback.
- No attachment ACL, DataScope, backend API, schema, migration, or database path was changed.

## Desktop / Mobile Check

Code-level responsive check completed for the affected `/home` KPI strip:

- The KPI cards are still rendered by the existing responsive grid: `repeat(auto-fit, minmax(180px, 1fr))`.
- The repair only changes KPI value composition before rendering. It does not change card dimensions, labels, icons, permissions, or page layout.
- Desktop and mobile behavior therefore remains the existing responsive behavior for the affected section.

Condition: a live browser visual pass could not be completed in this sandbox because local Next.js dev server startup was blocked before route rendering.

## Validation

Passed:

```bash
cd apps/web && ./node_modules/.bin/vitest run src/lib/home-farm-kpi.test.ts src/lib/home-request-plan.test.ts
# 2 test files passed, 7 tests passed
```

```bash
cd apps/web && ./node_modules/.bin/eslint src/lib/home-farm-kpi.ts src/lib/home-farm-kpi.test.ts
# passed
```

```bash
cd apps/web && ./node_modules/.bin/tsc --noEmit
# passed
```

Blocked / conditional:

```bash
cd apps/web && ./node_modules/.bin/next dev --hostname 127.0.0.1 --port 3000
# blocked by sandbox: listen EPERM 127.0.0.1:3000
```

```bash
cd apps/web && ./node_modules/.bin/next dev --port 3001
# blocked by sandbox: listen EPERM 0.0.0.0:3001
```

```bash
cd apps/web && ./node_modules/.bin/next build
# blocked by Turbopack workspace symlink issue:
# Symlink [project]/apps/web/node_modules is invalid, it points out of the filesystem root
```

## Final Gate

`PASS WITH CONDITIONS`: frontend KPI composition and focused regression coverage are complete. Do not mark the source bug fully resolved until CI/CD passes, production `/home` smoke confirms the cards show today's feed/water for an authorized user, and business acceptance is recorded.
