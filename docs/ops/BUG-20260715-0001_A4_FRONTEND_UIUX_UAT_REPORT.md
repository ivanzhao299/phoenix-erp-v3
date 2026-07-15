# BUG-20260715-0001 A4 Frontend UIUX UAT Report

Source bug: `BUG-20260715-0001`
Source task: `BUGTASK-20260715-0001`
Agent: `A4-Frontend-UAT-Smoke`
Route: `/breeding`
Status: `PASS WITH CONDITIONS`
Release gate: `HOLD` until CI/CD, production smoke, and business acceptance.

## Symptom

运营工作台的「当前总存栏」与养殖场总览的「存栏总数」不一致。

The intake classifier marked the redispatch as `RBAC_403`, but the supplied capture had no console errors or failed requests. The frontend-owned symptom was a metric source mismatch.

## Diagnosis

- `/breeding` computes 「存栏总数」 from `brd_flocks.current_qty`, grouped by `farm_code`.
- `/home` computed 「当前总存栏」 from `/v3/farm/daily-hen-report`, which can be a daily/reporting aggregate and can drift from the current flock master record.
- The correct frontend-owned source for current bird stock is `brd_flocks.current_qty`, already used by the breeding overview and chicken-house pages.

## Changed Files

- `apps/web/src/app/(admin)/home/page.tsx`
  - Under the existing `MENU_FARM_DATA:V` KPI gate, `/home` now also fetches `/crud/brd_flocks?limit=1000`.
  - The new request is `silent: true` and preserves the existing no-toast degradation path.
- `apps/web/src/lib/home-farm-kpi.ts`
  - `buildHomeFarmKpi` now accepts optional flock rows.
  - `brd_flocks.current_qty` is the authoritative source for `totalStock` when that payload is present.
  - Scoped empty flock responses stay at `0` instead of falling back to stale daily-hen-report totals.
- `apps/web/src/lib/home-farm-kpi.test.ts`
  - Added regression coverage for divergent hen-report totals vs. flock `current_qty`.
  - Added regression coverage for scoped empty flock responses.
- `apps/web/src/app/(admin)/breeding/page.tsx`
  - Breeding overview flock request now uses `limit=1000`, matching the home KPI request range and avoiding default-pagination drift.

## Permission / State Checks

- Permission visibility preserved: farm KPI loading still requires `farmKpiRequestPlan.shouldLoadFarmKpi`, which is derived from `MENU_FARM_DATA:V`.
- Optional IoT permission behavior preserved: `/v3/iot/devices/all-summary` is still gated by `MENU_DEVICE_MONITOR:V`.
- Error handling preserved: all KPI side requests remain `silent: true` and catch to `null`.
- Empty state corrected: an authorized but empty `brd_flocks` response now displays `0` current stock instead of falling back to stale report data.
- Loading/render behavior unchanged: the KPI card group still renders only after `farmKpi` is set.

## Validation

Passed:

```bash
cd apps/web && ./node_modules/.bin/vitest run src/lib/home-farm-kpi.test.ts src/lib/breeding-overview-metrics.test.ts
# 2 files passed, 10 tests passed

cd apps/web && ./node_modules/.bin/tsc --noEmit
# PASS

git diff --check -- 'apps/web/src/app/(admin)/home/page.tsx' 'apps/web/src/app/(admin)/breeding/page.tsx' apps/web/src/lib/home-farm-kpi.ts apps/web/src/lib/home-farm-kpi.test.ts
# PASS

cd apps/web && ./node_modules/.bin/eslint src/lib/home-farm-kpi.ts src/lib/home-farm-kpi.test.ts
# PASS
```

Attempted but blocked by local environment:

```bash
cd apps/web && ./node_modules/.bin/next build --webpack
# FAIL: sandbox blocked Google Fonts proxy connection to 127.0.0.1:7890.
# FAIL: local node_modules also contains stale pnpm symlinks into codex-orchestrator for html2canvas/lucide-react.

cd apps/web && ./node_modules/.bin/next dev --hostname 127.0.0.1 --port 3000
# FAIL: listen EPERM 127.0.0.1:3000
```

Selective Next build command with `--debug-build-paths='src/app/(admin)/home/page.tsx,src/app/(admin)/breeding/page.tsx'` completed successfully, but the route listing only emitted `/404`; full route smoke still needs a runnable environment.

## Desktop / Mobile UAT

Desktop and mobile browser behavior could not be captured locally because the sandbox refused the local Next server bind (`listen EPERM 127.0.0.1:3000`). No production/staging smoke was run, and no database, migration, deploy, push, or task-board action was performed.

Required follow-up before closure:

1. Run authenticated desktop smoke for `/home` and `/breeding`; verify 「当前总存栏」 equals 「存栏总数」 for the same DataScope.
2. Run authenticated mobile-width smoke for both routes; verify the KPI cards remain visible and values match.
3. Confirm with business owner which DataScope/user is used for acceptance.

## Result

`PASS WITH CONDITIONS`: the frontend-owned source mismatch is repaired and covered by focused tests, but release remains `HOLD` until CI/CD, production or staging smoke, and business acceptance confirm the two displayed numbers match in the target environment.
